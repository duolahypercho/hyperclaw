package gateway

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/hypercho/hyperclaw-connector/internal/config"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

const (
	maxGatewayMessageBytes      = 32 << 20 // chat.history can be large; anything bigger is unsafe to buffer.
	highVolumeForwardQueueLimit = 64
)

// GatewayMessage matches the OpenClaw gateway wire format.
type GatewayMessage struct {
	Type    string      `json:"type"`
	Event   string      `json:"event,omitempty"`
	ID      string      `json:"id,omitempty"`
	Method  string      `json:"method,omitempty"`
	Params  interface{} `json:"params,omitempty"`
	Ok      *bool       `json:"ok,omitempty"`
	Payload interface{} `json:"payload,omitempty"`
	Error   interface{} `json:"error,omitempty"`
}

// DeviceIdentity holds the OpenClaw device keypair
type DeviceIdentity struct {
	DeviceID      string `json:"deviceId"`
	PublicKeyPem  string `json:"publicKeyPem"`
	PrivateKeyPem string `json:"privateKeyPem"`
}

// DeviceAuth holds auth tokens
type DeviceAuth struct {
	DeviceID string                     `json:"deviceId"`
	Tokens   map[string]DeviceAuthToken `json:"tokens"`
}

type DeviceAuthToken struct {
	Token string `json:"token"`
	Role  string `json:"role"`
}

type Gateway struct {
	cfg                 *config.Config
	conn                *websocket.Conn
	closed              atomic.Bool
	done                chan struct{} // closed when readLoop exits; signals writeLoop to stop
	identity            *DeviceIdentity
	auth                *DeviceAuth
	notificationTracker *NotificationTracker
	cronAnnounceTracker *CronAnnounceTracker
	sessionTracker      *SessionTracker
}

// SetStore attaches the main SQLite store so the gateway can persist cron announces
// and track sessions.
func (g *Gateway) SetStore(s *store.Store) {
	g.cronAnnounceTracker = NewCronAnnounceTracker(s)
	g.sessionTracker = NewSessionTracker(s)
}

func New(cfg *config.Config) *Gateway {
	g := &Gateway{
		cfg:                 cfg,
		done:                make(chan struct{}),
		notificationTracker: NewNotificationTracker(30 * time.Second),
	}
	g.loadIdentity()
	return g
}

func (g *Gateway) loadIdentity() {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}

	// Load device identity
	idPath := filepath.Join(home, ".openclaw", "identity", "device.json")
	if data, err := os.ReadFile(idPath); err == nil {
		var id DeviceIdentity
		if json.Unmarshal(data, &id) == nil && id.DeviceID != "" {
			g.identity = &id
			log.Printf("Loaded device identity: %s", id.DeviceID[:16]+"...")
		}
	} else if os.IsNotExist(err) {
		log.Printf("Gateway identity not yet provisioned (%s missing) — the OpenClaw daemon writes this on first run", idPath)
	}

	// Load device auth tokens
	authPath := filepath.Join(home, ".openclaw", "identity", "device-auth.json")
	if data, err := os.ReadFile(authPath); err == nil {
		var auth DeviceAuth
		if json.Unmarshal(data, &auth) == nil {
			g.auth = &auth
		}
	}
}

func (g *Gateway) getAuthToken() string {
	// Priority: config token > device-auth operator token
	if g.cfg.GatewayToken != "" {
		return g.cfg.GatewayToken
	}
	if g.auth != nil {
		if op, ok := g.auth.Tokens["operator"]; ok {
			return op.Token
		}
	}
	return ""
}

func (g *Gateway) Connect(toHub chan<- []byte, fromHub <-chan []byte, events chan<- string) error {
	url := g.cfg.GatewayURL
	if url == "" {
		url = fmt.Sprintf("ws://%s:%d/gateway", g.cfg.GatewayHost, g.cfg.GatewayPort)
	}

	log.Printf("Connecting to gateway: %s", url)

	dialer := &websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	var err error
	g.conn, _, err = dialer.Dial(url, nil)
	if err != nil {
		return fmt.Errorf("failed to dial gateway: %w", err)
	}
	g.conn.SetReadLimit(maxGatewayMessageBytes)

	// Pre-flight: warn when we have neither a device identity nor an auth
	// token. The gateway will reject with NOT_PAIRED / DEVICE_IDENTITY_REQUIRED
	// in that case — make the failure self-explanatory in logs instead of
	// opaque. (See OpenClaw handshake-auth-helpers.shouldSkipLocalBackendSelfPairing.)
	if g.identity == nil && g.getAuthToken() == "" {
		log.Println("Gateway handshake will fail: no device identity (~/.openclaw/identity/device.json) AND no gateway token configured. Start the OpenClaw daemon first to provision device identity, or set GatewayToken in the connector config.")
	}

	// Perform OpenClaw handshake
	prelude, err := g.handshake()
	if err != nil {
		g.conn.Close()
		return fmt.Errorf("handshake failed: %w", err)
	}

	log.Println("Connected to gateway")

	// Subscribe to session events so we receive session.tool events for cron runs.
	// Without this, tool events never reach the connector (they're only sent to
	// registered tool-event recipients or session subscribers), and assistantBuf
	// in cron announce tracking never resets on tool calls.
	subscribeReq := GatewayMessage{
		Type:   "req",
		ID:     fmt.Sprintf("sessions-subscribe-%d", time.Now().UnixMilli()),
		Method: "sessions.subscribe",
		Params: map[string]interface{}{},
	}
	if err := g.conn.WriteJSON(subscribeReq); err != nil {
		log.Printf("Gateway: failed to subscribe to session events: %v", err)
	} else {
		log.Println("Gateway: subscribed to session events")
	}

	// Forward any messages received during handshake
	for _, raw := range prelude {
		select {
		case toHub <- raw:
		default:
			log.Println("Gateway: dropped prelude message during handshake")
		}
	}

	// Start read loop
	go g.readLoop(toHub, events)

	// Start write loop
	go g.writeLoop(fromHub)

	return nil
}

func (g *Gateway) handshake() (prelude [][]byte, err error) {
	deadline := time.Now().Add(10 * time.Second)

	// Wait for connect.challenge from gateway
	for {
		g.conn.SetReadDeadline(deadline)
		_, raw, readErr := g.conn.ReadMessage()
		if readErr != nil {
			return nil, readErr
		}

		var msg GatewayMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			return nil, fmt.Errorf("invalid message from gateway: %w", err)
		}

		if msg.Type == "event" && msg.Event == "connect.challenge" {
			// Extract nonce from payload
			nonce := ""
			if payload, ok := msg.Payload.(map[string]interface{}); ok {
				if n, ok := payload["nonce"].(string); ok {
					nonce = n
				}
			}

			// Build connect request
			connectReq := g.buildConnectRequest(nonce)
			if err := g.conn.WriteJSON(connectReq); err != nil {
				return nil, fmt.Errorf("failed to send connect request: %w", err)
			}

			// Wait for hello-ok response
			for {
				g.conn.SetReadDeadline(deadline)
				_, raw2, readErr2 := g.conn.ReadMessage()
				if readErr2 != nil {
					return nil, readErr2
				}

				var resp GatewayMessage
				if err := json.Unmarshal(raw2, &resp); err != nil {
					return nil, fmt.Errorf("invalid response from gateway: %w", err)
				}

				if resp.Type == "res" && resp.Ok != nil && *resp.Ok {
					log.Println("Gateway handshake complete")
					g.conn.SetReadDeadline(time.Time{})
					return prelude, nil
				}

				if resp.Type == "res" && (resp.Ok == nil || !*resp.Ok) {
					return nil, fmt.Errorf("gateway rejected connect: %v", resp.Error)
				}

				// Buffer other messages
				log.Printf("Gateway handshake: received %q during connect, buffering", resp.Type)
				prelude = append(prelude, raw2)
			}
		}

		// Buffer non-challenge messages
		log.Printf("Gateway handshake: received %q before connect.challenge, buffering", msg.Type)
		prelude = append(prelude, raw)
	}
}

func detectPlatform() string {
	switch runtime.GOOS {
	case "darwin":
		return "darwin"
	case "linux":
		return "linux"
	case "windows":
		return "windows"
	default:
		return runtime.GOOS
	}
}

func (g *Gateway) buildConnectRequest(nonce string) GatewayMessage {
	now := time.Now()
	signedAtMs := now.UnixMilli()
	authToken := g.getAuthToken()

	clientId := "gateway-client"
	clientMode := "backend"
	platform := detectPlatform()
	role := "operator"
	scopes := []string{"operator.read", "operator.write", "operator.admin"}
	scopesStr := "operator.read,operator.write,operator.admin"

	clientParams := map[string]interface{}{
		"id":       clientId,
		"platform": platform,
		"mode":     clientMode,
		"version":  g.cfg.Version,
	}

	params := map[string]interface{}{
		"minProtocol": 3,
		"maxProtocol": 3,
		"client":      clientParams,
		"role":        role,
		"scopes":      scopes,
		"caps":        []string{"tool-events"},
		"locale":      "en-US",
		"userAgent":   "hyperclaw-connector/" + g.cfg.Version,
	}

	if authToken != "" {
		params["auth"] = map[string]interface{}{
			"token": authToken,
		}
	}

	if g.identity != nil {
		// Build v3 signature payload: v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily
		payload := fmt.Sprintf("v3|%s|%s|%s|%s|%s|%d|%s|%s|%s|",
			g.identity.DeviceID,
			clientId,
			clientMode,
			role,
			scopesStr,
			signedAtMs,
			authToken,
			nonce,
			platform,
		)
		signature := g.signPayload(payload)

		params["device"] = map[string]interface{}{
			"id":        g.identity.DeviceID,
			"publicKey": g.identity.PublicKeyPem,
			"signature": signature,
			"signedAt":  signedAtMs,
			"nonce":     nonce,
		}
	}

	return GatewayMessage{
		Type:   "req",
		ID:     fmt.Sprintf("connect-%d", signedAtMs),
		Method: "connect",
		Params: params,
	}
}

func (g *Gateway) signPayload(payload string) string {
	if g.identity == nil || g.identity.PrivateKeyPem == "" {
		return ""
	}

	block, _ := pem.Decode([]byte(g.identity.PrivateKeyPem))
	if block == nil {
		log.Println("Gateway: failed to decode PEM private key")
		return ""
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		log.Printf("Gateway: failed to parse private key: %v", err)
		return ""
	}

	edKey, ok := key.(ed25519.PrivateKey)
	if !ok {
		log.Println("Gateway: private key is not Ed25519")
		return ""
	}

	// Sign the payload bytes
	sig := ed25519.Sign(edKey, []byte(payload))

	// Return as base64url (no padding) — matching OpenClaw's format
	return base64urlEncode(sig)
}

func base64urlEncode(data []byte) string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	result := make([]byte, 0, (len(data)*4+2)/3)
	for i := 0; i < len(data); i += 3 {
		val := uint(data[i]) << 16
		if i+1 < len(data) {
			val |= uint(data[i+1]) << 8
		}
		if i+2 < len(data) {
			val |= uint(data[i+2])
		}
		result = append(result, alphabet[(val>>18)&0x3F])
		result = append(result, alphabet[(val>>12)&0x3F])
		if i+1 < len(data) {
			result = append(result, alphabet[(val>>6)&0x3F])
		}
		if i+2 < len(data) {
			result = append(result, alphabet[val&0x3F])
		}
	}
	return string(result)
}

func (g *Gateway) readLoop(toHub chan<- []byte, events chan<- string) {
	defer func() {
		g.closed.Store(true)
		close(g.done) // signal writeLoop to exit
		g.conn.Close()
		events <- "gateway:disconnected"
	}()

	for {
		_, raw, err := g.conn.ReadMessage()
		if err != nil {
			if !g.closed.Load() {
				log.Printf("Gateway read error: %v", err)
			}
			return
		}

		var msg GatewayMessage
		if json.Unmarshal(raw, &msg) == nil {
			select {
			case events <- fmt.Sprintf("gateway:msg:%s", msg.Type):
			default:
			}

			// Handle agent events — gateway sends event:"agent" with stream/runId/data in payload.
			// Also match "agent.*" patterns (e.g. "agent.{runId}.lifecycle.1")
			if msg.Type == "event" && (msg.Event == "agent" || strings.HasPrefix(msg.Event, "agent.")) {
				g.handleAgentEvent(msg, toHub)
			}

			// Handle chat events — capture the final response message for cron announces.
			// Also match "chat.*" patterns (e.g. "chat.delta", "chat.final")
			if msg.Type == "event" && (msg.Event == "chat" || strings.HasPrefix(msg.Event, "chat.")) {
				g.handleChatEvent(msg)
			}

			// Handle session.tool events — tool events for session subscribers.
			if msg.Type == "event" && msg.Event == "session.tool" {
				g.handleSessionToolEvent(msg)
			}
		}

		if shouldForwardGatewayMessage(msg, raw, len(toHub)) {
			select {
			case toHub <- raw:
			default:
				log.Println("Gateway: channel full, dropping message")
			}
		}
	}
}

func shouldForwardGatewayMessage(msg GatewayMessage, raw []byte, queued int) bool {
	if len(raw) > maxGatewayMessageBytes {
		log.Printf("Gateway: dropping oversized message (%d bytes)", len(raw))
		return false
	}
	if msg.Type != "event" {
		return true
	}

	// session.tool is subscribed by the connector solely for cron tracking.
	// Forwarding it to the hub only duplicates high-volume internal traffic.
	if msg.Event == "session.tool" {
		return false
	}

	if isHighVolumeGatewayEvent(msg) && queued >= highVolumeForwardQueueLimit {
		log.Printf("Gateway: dropping high-volume event %q while hub queue is backed up (%d queued)", msg.Event, queued)
		return false
	}
	return true
}

func isHighVolumeGatewayEvent(msg GatewayMessage) bool {
	if msg.Type != "event" {
		return false
	}
	if msg.Event == "chat" || strings.HasPrefix(msg.Event, "chat.") || msg.Event == "agent" || strings.HasPrefix(msg.Event, "agent.") {
		return true
	}
	return false
}

// handleAgentEvent processes agent events from the gateway.
// The gateway sends event:"agent" with stream/runId/sessionKey/data in the payload.
func (g *Gateway) handleAgentEvent(msg GatewayMessage, toHub chan<- []byte) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		if raw, ok := msg.Payload.(json.RawMessage); ok {
			var m map[string]interface{}
			if json.Unmarshal(raw, &m) == nil {
				payload = m
			}
		}
		if payload == nil {
			return
		}
	}

	stream, _ := payload["stream"].(string)
	runID, _ := payload["runId"].(string)
	sessionKey, _ := payload["sessionKey"].(string)

	if stream == "" || runID == "" {
		return
	}

	// Handle lifecycle events (start/end)
	if stream == "lifecycle" {
		g.handleLifecycleEvent(payload, runID, sessionKey, toHub)
		return
	}

	// Handle tool events — extract tool name, notify tracker
	if stream == "tool" {
		toolName := ""
		if data, ok := payload["data"].(map[string]interface{}); ok {
			if name, ok := data["name"].(string); ok {
				toolName = name
			} else if name, ok := data["toolName"].(string); ok {
				toolName = name
			}
		}
		if g.cronAnnounceTracker != nil {
			g.cronAnnounceTracker.OnMessage(runID, sessionKey, "tool", toolName)
		}
		return
	}

	// Handle assistant text — extract content from data
	if stream == "assistant" {
		text := ""
		if data, ok := payload["data"].(map[string]interface{}); ok {
			if delta, ok := data["delta"].(string); ok && delta != "" {
				text = delta
			} else if t, ok := data["text"].(string); ok && t != "" {
				text = t
			}
		}
		if text == "" {
			return
		}
		if g.cronAnnounceTracker != nil {
			g.cronAnnounceTracker.OnMessage(runID, sessionKey, "assistant", text)
		}
		g.notificationTracker.OnMessage(runID, text)
	}
}

// handleSessionToolEvent processes session.tool events from the gateway.
// The gateway broadcasts tool events to session subscribers with the same
// payload structure as agent tool events (runId, sessionKey, data.name).
// This is how the connector receives tool call info for cron runs where it
// isn't registered as a direct tool-event recipient.
func (g *Gateway) handleSessionToolEvent(msg GatewayMessage) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		if raw, ok := msg.Payload.(json.RawMessage); ok {
			var m map[string]interface{}
			if json.Unmarshal(raw, &m) == nil {
				payload = m
			}
		}
		if payload == nil {
			return
		}
	}

	runID, _ := payload["runId"].(string)
	sessionKey, _ := payload["sessionKey"].(string)

	// Debug: log what we extracted
	toolName := ""
	if data, ok := payload["data"].(map[string]interface{}); ok {
		if name, ok := data["name"].(string); ok {
			toolName = name
		} else if name, ok := data["toolName"].(string); ok {
			toolName = name
		}
	}
	log.Printf("[DEBUG] session.tool payload: runID=%q sessionKey=%q tool=%q", runID, sessionKey, toolName)

	if runID == "" || sessionKey == "" {
		return
	}

	if g.cronAnnounceTracker != nil {
		g.cronAnnounceTracker.OnMessage(runID, sessionKey, "tool", toolName)
	}
}

// handleLifecycleEvent processes agent lifecycle start/end events.
func (g *Gateway) handleLifecycleEvent(payload map[string]interface{}, runID, sessionKey string, toHub chan<- []byte) {
	phase := ""
	if data, ok := payload["data"].(map[string]interface{}); ok {
		phase, _ = data["phase"].(string)
	}
	if phase == "" {
		return
	}

	agentID, _ := payload["agentId"].(string)

	// Track cron announces
	if g.cronAnnounceTracker != nil {
		switch phase {
		case "start":
			g.cronAnnounceTracker.OnStart(runID, sessionKey, agentID)
		case "end":
			g.cronAnnounceTracker.OnEnd(runID, sessionKey, agentID)
		}
	}

	// Track sessions in unified store
	if g.sessionTracker != nil {
		switch phase {
		case "start":
			g.sessionTracker.OnSessionStart(sessionKey, agentID, "")
		case "end":
			g.sessionTracker.OnSessionEnd(sessionKey)
		}
	}

	// Generate notifications for long-running tasks
	notificationPayload := g.notificationTracker.OnLifecycleEvent(runID, sessionKey, agentID, phase)
	if notificationPayload == nil {
		return
	}

	notifMsg := map[string]interface{}{
		"type":    "event",
		"event":   "notification",
		"payload": json.RawMessage(notificationPayload),
	}
	data, err := json.Marshal(notifMsg)
	if err != nil {
		log.Printf("Gateway: failed to marshal notification: %v", err)
		return
	}

	log.Printf("Gateway: sending agent_completed notification for run %s", runID)
	select {
	case toHub <- data:
	default:
		log.Println("Gateway: channel full, dropping notification")
	}
}

// handleChatEvent processes chat events from the gateway.
// When a chat run finishes (state:"final"), it captures the final response
// message for the cron announce tracker — this is the actual response that
// gets returned, much more reliable than manually tracking assistant deltas.
func (g *Gateway) handleChatEvent(msg GatewayMessage) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		return
	}

	state, _ := payload["state"].(string)
	runID, _ := payload["runId"].(string)
	sessionKey, _ := payload["sessionKey"].(string)

	if runID == "" || sessionKey == "" {
		return
	}

	if g.cronAnnounceTracker == nil {
		return
	}

	text := extractChatMessageText(payload)

	switch state {
	case "delta":
		// Accumulate delta text so we always have the latest content
		// even if the "final" event arrives without a message body.
		if text != "" {
			g.cronAnnounceTracker.OnChatDelta(runID, sessionKey, text)
		}
	case "final":
		// Use the final message if present; otherwise OnEnd will fall back
		// to the accumulated delta text.
		if text != "" {
			g.cronAnnounceTracker.OnChatFinal(runID, sessionKey, text)
		}
		// Capture final assistant message in unified session store
		if g.sessionTracker != nil && text != "" {
			g.sessionTracker.OnMessage(sessionKey, "assistant", text)
		}
	}
}

func mapKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// extractChatMessageText extracts plain text from a chat event's message field.
// Format: { message: { content: [{ type: "text", text: "..." }] } }
func extractChatMessageText(payload map[string]interface{}) string {
	msg, ok := payload["message"].(map[string]interface{})
	if !ok {
		return ""
	}
	content, ok := msg["content"].([]interface{})
	if !ok {
		return ""
	}
	var text string
	for _, block := range content {
		if b, ok := block.(map[string]interface{}); ok {
			if b["type"] == "text" {
				if t, ok := b["text"].(string); ok {
					text += t
				}
			}
		}
	}
	return text
}

func (g *Gateway) writeLoop(fromHub <-chan []byte) {
	for {
		select {
		case data, ok := <-fromHub:
			if !ok {
				return
			}
			g.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := g.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("Gateway write error: %v", err)
				return
			}
		case <-g.done:
			return
		}
	}
}

func (g *Gateway) Close() error {
	g.closed.Store(true)
	if g.conn != nil {
		return g.conn.Close()
	}
	return nil
}

// SignConnectChallenge handles the "sign-connect-challenge" bridge action
// This is called by the dashboard (via hub) to get device identity for gateway auth
func (g *Gateway) SignConnectChallenge(params map[string]interface{}) map[string]interface{} {
	if g.identity == nil {
		return map[string]interface{}{"error": "no device identity available"}
	}

	nonce, _ := params["nonce"].(string)
	clientId, _ := params["clientId"].(string)
	if clientId == "" {
		clientId = "gateway-client"
	}
	clientMode, _ := params["clientMode"].(string)
	if clientMode == "" {
		clientMode = "backend"
	}
	role, _ := params["role"].(string)
	if role == "" {
		role = "operator"
	}
	authToken := g.getAuthToken()
	signedAtMs := time.Now().UnixMilli()

	// Build scopes string
	scopesStr := "operator.read,operator.write,operator.admin"
	scopes := []string{"operator.read", "operator.write", "operator.admin"}
	if rawScopes, ok := params["scopes"].([]interface{}); ok {
		strs := make([]string, 0, len(rawScopes))
		for _, s := range rawScopes {
			if str, ok := s.(string); ok {
				strs = append(strs, str)
			}
		}
		if len(strs) > 0 {
			scopes = strs
			scopesStr = ""
			for i, s := range strs {
				if i > 0 {
					scopesStr += ","
				}
				scopesStr += s
			}
		}
	}

	platform := detectPlatform()
	tokenForSigning, _ := params["token"].(string)
	if tokenForSigning == "" {
		tokenForSigning = authToken
	}

	// Build v3 payload
	payload := fmt.Sprintf("v3|%s|%s|%s|%s|%s|%d|%s|%s|%s|",
		g.identity.DeviceID,
		clientId,
		clientMode,
		role,
		scopesStr,
		signedAtMs,
		tokenForSigning,
		nonce,
		platform,
	)
	signature := g.signPayload(payload)

	return map[string]interface{}{
		"device": map[string]interface{}{
			"id":        g.identity.DeviceID,
			"publicKey": g.identity.PublicKeyPem,
			"signature": signature,
			"signedAt":  signedAtMs,
			"nonce":     nonce,
		},
		"client": map[string]interface{}{
			"id":       clientId,
			"platform": platform,
			"mode":     clientMode,
			"version":  g.cfg.Version,
		},
		"role":        role,
		"scopes":      scopes,
		"deviceToken": authToken,
	}
}
