package hub

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/hypercho/hyperclaw-connector/internal/bridge"
	"github.com/hypercho/hyperclaw-connector/internal/config"
	"github.com/hypercho/hyperclaw-connector/internal/credentials"
	"github.com/hypercho/hyperclaw-connector/internal/plugin"
	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	"github.com/hypercho/hyperclaw-connector/internal/store"
	"github.com/hypercho/hyperclaw-connector/internal/updater"
)

// WebSocket write timeout — generous enough for large payloads over congested links.
const wsWriteTimeout = 30 * time.Second

const maxHubMessageBytes = 32 << 20

type Hub struct {
	cfg           *config.Config
	conn          *websocket.Conn
	connMu        sync.Mutex
	closed        atomic.Bool
	done          chan struct{} // closed when readLoop exits; signals all goroutines to stop
	deviceKey     ed25519.PrivateKey
	deviceID      string
	registered    bool
	bridgeHandler *bridge.BridgeHandler
	gatewayRouter *bridge.GatewayRouter
	dataStore     *store.Store
	x25519Pubkey  [32]byte
	// Shared flag: set by the gateway goroutine in main.go, read by the router.
	gwConnected *atomic.Int32
	// Buffered kick channel: nudges the gateway reconnect goroutine when a
	// request arrives while the WS is still dialing. Wired to the router at
	// Connect() time so cold-start chats don't see "gateway not connected".
	gatewayKick chan<- struct{}
}

func New(cfg *config.Config) *Hub {
	return &Hub{
		cfg:           cfg,
		done:          make(chan struct{}),
		bridgeHandler: bridge.NewBridgeHandler(),
	}
}

// SetStore attaches the SQLite store to the hub and its bridge handler.
func (h *Hub) SetStore(s *store.Store) {
	h.dataStore = s
	h.bridgeHandler.SetStore(s)
}

func (h *Hub) SetRuntimeWorker(worker bridge.RuntimeWorker) {
	h.bridgeHandler.SetRuntimeWorker(worker)
}

// SetIntelStore attaches the Intel DB store to the hub's bridge handler.
func (h *Hub) SetIntelStore(s *store.IntelStore) {
	h.bridgeHandler.SetIntelStore(s)
}

// SetGatewayFlag stores the shared atomic flag that tracks local OpenClaw WS state.
// Must be called before Connect().
func (h *Hub) SetGatewayFlag(flag *atomic.Int32) {
	h.gwConnected = flag
	if h.bridgeHandler != nil {
		h.bridgeHandler.SetGatewayFlag(flag)
	}
}

// SetGatewayKick stores the buffered channel used by onboarding to wake the
// reconnect goroutine from its backoff sleep. Must be called before Connect().
func (h *Hub) SetGatewayKick(ch chan<- struct{}) {
	h.gatewayKick = ch
	if h.bridgeHandler != nil {
		h.bridgeHandler.SetGatewayKick(ch)
	}
}

// SetSyncEngine attaches the SyncEngine to the hub's bridge handler.
func (h *Hub) SetSyncEngine(e bridge.SyncEngineIface) {
	h.bridgeHandler.SetSyncEngine(e)
}

func (h *Hub) Connect(toGateway chan<- []byte, fromGateway <-chan []byte, events chan<- string) error {
	// Load or generate device key
	h.loadOrGenerateKey()

	// Wire device key to bridge handler for credential encryption
	h.bridgeHandler.SetDeviceKey(h.deviceKey)

	// Wire the updater drain hook so Apply() waits for in-flight bridge
	// requests before restarting. Each Connect() call updates the hook to
	// reference the current Hub instance (the hub is re-created per connection).
	updater.SetDrainHook(func(timeout time.Duration) bool {
		return h.ShutdownGracefully(timeout)
	})

	// Build WebSocket URL: append /ws/connect path and query params
	dialURL := h.buildHubURL()
	log.Printf("Connecting to Hub: %s", dialURL)

	dialer := &websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}
	header := make(http.Header)
	if h.cfg.HubOrigin != "" {
		header.Set("Origin", h.cfg.HubOrigin)
	}
	if h.cfg.HubProtocol != "" {
		dialer.Subprotocols = []string{h.cfg.HubProtocol}
	}

	var err error
	var resp *http.Response
	h.conn, resp, err = dialer.Dial(dialURL, header)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("failed to dial hub: %w (HTTP %d)", err, resp.StatusCode)
		}
		return fmt.Errorf("failed to dial hub: %w", err)
	}
	h.conn.SetReadLimit(maxHubMessageBytes)

	// Keepalive: the hub sends WebSocket-level pings; gorilla/websocket
	// auto-replies with pong frames. We only need a PingHandler to reset
	// the read deadline on each incoming ping so the connection stays alive.
	h.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	h.conn.SetPingHandler(func(appData string) error {
		h.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		// Write pong back. Must go through connMu since writes aren't thread-safe.
		h.connMu.Lock()
		err := h.conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(10*time.Second))
		h.connMu.Unlock()
		return err
	})

	h.registered = true
	events <- "hub:registered"
	log.Println("Connected to Hub")

	// Start read loop (owns the done channel — closing it signals other goroutines)
	go h.readLoop(toGateway, events)

	// Start write loop
	go h.writeLoop(fromGateway)

	return nil
}

// buildHubURL constructs the WebSocket URL with /ws/connect path and query params.
func (h *Hub) buildHubURL() string {
	base := h.cfg.HubURL

	// Parse the URL to add path and query params
	u, err := url.Parse(base)
	if err != nil {
		return base
	}

	// Append /ws/connect if the path is empty or just "/"
	if u.Path == "" || u.Path == "/" {
		u.Path = "/ws/connect"
	} else if !strings.HasSuffix(u.Path, "/ws/connect") {
		u.Path = strings.TrimRight(u.Path, "/") + "/ws/connect"
	}

	// Add deviceId, token, and system metadata as query params
	q := u.Query()
	if h.deviceID != "" {
		q.Set("deviceId", h.deviceID)
		// Also send existingDeviceId so the hub can reuse the prior device record
		// on re-pair instead of minting a fresh Mongo ObjectId. Harmless during
		// normal reconnects (hub tryReuseDevice is a no-op if IDs already match).
		q.Set("existingDeviceId", h.deviceID)
	}
	if h.cfg.DeviceToken != "" {
		q.Set("token", h.cfg.DeviceToken)
	}

	// Send system metadata so hub can populate device record
	q.Set("platform", runtime.GOOS)
	q.Set("arch", runtime.GOARCH)
	if hostname, err := os.Hostname(); err == nil {
		q.Set("hostname", hostname)
	}
	q.Set("connectorVersion", h.cfg.Version)
	q.Set("pubkey", base64.StdEncoding.EncodeToString(h.x25519Pubkey[:]))

	// Send the SHA256 of the currently running binary so the hub can skip the
	// "update available" push when it would hand us back the exact same binary.
	// Without this, a fresh install.sh → connect → updater → restart loop trips
	// the dashboard's device-unreachable circuit breaker during the restart gap.
	if sum := currentBinaryChecksum(); sum != "" {
		q.Set("connectorChecksum", sum)
	}

	u.RawQuery = q.Encode()

	return u.String()
}

// currentBinaryChecksum returns the hex-encoded SHA256 of the running binary,
// cached on first call. Returns "" if the binary can't be read.
var (
	cachedBinaryChecksum     string
	cachedBinaryChecksumOnce sync.Once
)

func currentBinaryChecksum() string {
	cachedBinaryChecksumOnce.Do(func() {
		exe, err := os.Executable()
		if err != nil {
			return
		}
		// Resolve symlinks so the hash reflects the actual binary on disk.
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			exe = resolved
		}
		f, err := os.Open(exe)
		if err != nil {
			return
		}
		defer f.Close()
		h := sha256.New()
		if _, err := io.Copy(h, f); err != nil {
			return
		}
		cachedBinaryChecksum = hex.EncodeToString(h.Sum(nil))
	})
	return cachedBinaryChecksum
}

func (h *Hub) readLoop(toGateway chan<- []byte, events chan<- string) {
	// toHub channel for bridge/gateway responses back to hub
	toHub := make(chan []byte, 256)
	go h.bridgeWriteLoop(toHub)

	// Wire agent-change callback so bridge actions (add/delete) can push
	// an event to the hub, which gets forwarded to dashboard clients.
	h.bridgeHandler.SetOnAgentsChanged(func() {
		msg, _ := json.Marshal(map[string]interface{}{
			"type":  "evt",
			"event": "agents.changed",
			"data": map[string]interface{}{
				"ts": time.Now().UnixMilli(),
			},
		})
		// Guard against send on closed channel: readLoop closes toHub on disconnect,
		// but this callback can fire from bridge actions concurrently.
		select {
		case <-h.done:
			return
		default:
		}
		select {
		case toHub <- msg:
		case <-h.done:
		default:
			log.Println("Hub: toHub channel full, dropping agents.changed event")
		}
	})

	// Gateway router for translating hub ↔ gateway protocols
	gatewayRouter := bridge.NewGatewayRouter(toGateway, toHub, h.gwConnected)
	if h.gatewayKick != nil {
		gatewayRouter.SetGatewayKick(h.gatewayKick)
	}
	h.gatewayRouter = gatewayRouter

	defer func() {
		h.closed.Store(true)
		close(h.done) // signal writeLoop and bridgeWriteLoop to exit

		// Send a graceful close frame before closing the connection
		h.connMu.Lock()
		h.conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseGoingAway, "disconnecting"),
			time.Now().Add(5*time.Second),
		)
		h.connMu.Unlock()
		h.conn.Close()

		if h.gatewayRouter != nil {
			h.gatewayRouter.Stop()
		}
		close(toHub)
		events <- "hub:disconnected"
	}()

	for {
		var msg protocol.Message
		err := h.conn.ReadJSON(&msg)
		if err != nil {
			if !h.closed.Load() {
				log.Printf("Hub read error: %v", err)
			}
			return
		}

		// Handle control messages
		switch msg.Type {
		case "ping":
			pong := protocol.Message{Type: "pong"}
			h.connMu.Lock()
			h.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			err := h.conn.WriteJSON(pong)
			h.connMu.Unlock()
			if err != nil {
				log.Printf("Hub pong write error: %v", err)
				return
			}
			continue

		case "update":
			// Hub is requesting a self-update
			log.Printf("Hub requested update to v%s", msg.Payload["version"])
			go func() {
				payload := make(map[string]interface{})
				raw, _ := json.Marshal(msg.Payload)
				json.Unmarshal(raw, &payload)

				reportStatus := func(status, errMsg string) {
					evt := protocol.NewEvent("connector.update", map[string]interface{}{
						"status":  status,
						"version": payload["version"],
						"error":   errMsg,
					})
					data, _ := json.Marshal(evt)
					h.connMu.Lock()
					if !h.closed.Load() {
						h.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
						if err := h.conn.WriteMessage(websocket.TextMessage, data); err != nil {
							log.Printf("Hub update status write error: %v", err)
						}
					}
					h.connMu.Unlock()
				}

				if err := updater.Apply(payload, reportStatus); err != nil {
					log.Printf("Update failed: %v", err)
				}
			}()
			continue

		case "update-plugin":
			// Hub is requesting a plugin update
			log.Printf("Hub requested plugin update to v%s", msg.Payload["version"])
			go func() {
				payload := make(map[string]interface{})
				raw, _ := json.Marshal(msg.Payload)
				json.Unmarshal(raw, &payload)

				reportStatus := func(status, errMsg string) {
					evt := protocol.NewEvent("plugin.update", map[string]interface{}{
						"status":  status,
						"version": payload["version"],
						"error":   errMsg,
					})
					data, _ := json.Marshal(evt)
					h.connMu.Lock()
					if !h.closed.Load() {
						h.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
						if err := h.conn.WriteMessage(websocket.TextMessage, data); err != nil {
							log.Printf("Hub plugin update status write error: %v", err)
						}
					}
					h.connMu.Unlock()
				}

				if err := plugin.Update(h.cfg.DataDir, payload, reportStatus); err != nil {
					log.Printf("Plugin update failed: %v", err)
				}
			}()
			continue

		case "evt":
			// Forward events to gateway
			data, _ := json.Marshal(msg)
			select {
			case toGateway <- data:
			default:
				log.Println("Hub: channel full, dropping event")
			}
			// Non-blocking send to prevent goroutine leak if event
			// consumer stopped listening after disconnect
			select {
			case events <- fmt.Sprintf("hub:evt:%s", msg.Payload):
			default:
			}
			continue

		case "req":
			// Route based on requestType
			requestType := msg.GetRequestType()
			switch {
			case requestType == "bridge":
				// Handle via native Go bridge handler
				go h.bridgeHandler.Handle(msg, toHub)
				continue
			case bridge.IsGatewayRequest(requestType):
				// Route to local gateway with protocol translation
				msgCopy := msg
				go gatewayRouter.RouteToGateway(msgCopy)
				continue
			}
		}

		// Forward to gateway
		data, _ := json.Marshal(msg)
		select {
		case toGateway <- data:
		default:
			log.Println("Hub: channel full, dropping message")
		}
	}
}

// bridgeWriteLoop sends bridge responses back to the hub WebSocket.
// Exits when toHub is closed (readLoop defer) or when done is signalled.
func (h *Hub) bridgeWriteLoop(toHub <-chan []byte) {
	for {
		select {
		case data, ok := <-toHub:
			if !ok {
				log.Printf("[bridge-write] toHub channel closed — exiting bridgeWriteLoop")
				return
			}
			var msg protocol.Message
			if err := json.Unmarshal(data, &msg); err != nil {
				log.Printf("Invalid bridge response: %v", err)
				continue
			}
			// Log action responses (type "res") for debugging delivery
			if msg.Type == "res" {
				reqID := msg.GetRequestID()
				log.Printf("[bridge-write] writing response to hub WS: requestId=%s (%d bytes)", reqID, len(data))
			}
			h.connMu.Lock()
			h.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			err := h.conn.WriteJSON(msg)
			h.connMu.Unlock()
			if err != nil {
				log.Printf("Hub write error (bridge response): %v", err)
				h.conn.Close()
				return
			}
		case <-h.done:
			return
		}
	}
}

func (h *Hub) writeLoop(fromGateway <-chan []byte) {
	for {
		select {
		case data, ok := <-fromGateway:
			if !ok {
				return
			}

			// Check if this is a response to a routed gateway request.
			// Pass raw bytes so the router can parse gateway's top-level fields
			// (id, ok, payload) which protocol.Message cannot represent.
			if h.gatewayRouter != nil {
				if h.gatewayRouter.HandleGatewayMessage(data) {
					continue // Response was translated and sent via toHub channel
				}
			}

			// Forward raw bytes to hub (preserves all gateway fields like id, event, etc.)
			h.connMu.Lock()
			h.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			err := h.conn.WriteMessage(websocket.TextMessage, data)
			h.connMu.Unlock()
			if err != nil {
				log.Printf("Hub write error: %v", err)
				// Close the connection so readLoop exits and triggers full reconnect
				// instead of leaving a half-dead connection for up to 90s.
				h.conn.Close()
				return
			}
			// Debug: log response types to trace delivery
			if len(data) > 10 {
				var peek struct {
					Type string `json:"type"`
					ID   string `json:"id"`
				}
				if json.Unmarshal(data, &peek) == nil && peek.Type == "res" {
					log.Printf("[hub-write] sent response type=%s id=%s (%d bytes)", peek.Type, peek.ID, len(data))
				}
			}

		case <-h.done:
			return
		}
	}
}

func (h *Hub) Close() error {
	if h.closed.Swap(true) {
		return nil // already closed
	}
	if h.conn != nil {
		// Send graceful close frame before closing
		h.connMu.Lock()
		h.conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "shutdown"),
			time.Now().Add(5*time.Second),
		)
		h.connMu.Unlock()
		return h.conn.Close()
	}
	return nil
}

// BridgeHandler returns the underlying bridge handler. May be nil before Connect.
func (h *Hub) BridgeHandler() *bridge.BridgeHandler {
	return h.bridgeHandler
}

// ShutdownGracefully marks the bridge handler as shutting down so in-flight
// requests return an explicit "connector restarting" error (instead of hanging
// until the action timeout) and waits up to `timeout` for in-flight work to
// drain. Returns true if drained cleanly before the deadline.
func (h *Hub) ShutdownGracefully(timeout time.Duration) bool {
	if h.bridgeHandler == nil {
		return true
	}
	h.bridgeHandler.BeginShutdown()
	return h.bridgeHandler.WaitInFlight(timeout)
}

func (h *Hub) loadOrGenerateKey() {
	// Use credentials/ subdirectory for device identity files
	credentialsDir := filepath.Join(h.cfg.DataDir, "credentials")
	keyPath := filepath.Join(credentialsDir, "device.key")
	idPath := filepath.Join(credentialsDir, "device.id")

	// Legacy paths for backwards compatibility
	legacyKeyPath := filepath.Join(h.cfg.DataDir, "device.key")
	legacyIDPath := filepath.Join(h.cfg.DataDir, "device.id")

	// Determine device ID
	if h.cfg.DeviceID != "" {
		h.deviceID = h.cfg.DeviceID
	} else if data, err := os.ReadFile(idPath); err == nil {
		h.deviceID = strings.TrimSpace(string(data))
	} else if data, err := os.ReadFile(legacyIDPath); err == nil {
		// Fallback to legacy location
		h.deviceID = strings.TrimSpace(string(data))
	}

	// Load or generate Ed25519 key (always, regardless of how device ID was sourced)
	// Try new location first, then legacy
	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		keyData, err = os.ReadFile(legacyKeyPath)
	}

	if err == nil {
		keyBytes, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(string(keyData)))
		h.deviceKey = ed25519.PrivateKey(keyBytes)
	} else {
		// Key file missing — if credentials.enc exists, the old key is lost.
		if credentials.CredentialsFileExists(h.cfg.DataDir) {
			log.Printf("WARNING: device key lost but credentials.enc exists — deleting stale credentials")
			if rmErr := credentials.RemoveCredentials(h.cfg.DataDir); rmErr != nil {
				log.Printf("WARNING: failed to remove stale credentials: %v", rmErr)
			}
		}

		// Generate new keypair
		pub, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			log.Fatalf("Failed to generate key: %v", err)
		}
		h.deviceKey = priv

		// If no device ID yet, derive from public key
		if h.deviceID == "" {
			h.deviceID = fmt.Sprintf("dev_%x", pub)
			os.MkdirAll(credentialsDir, 0700)
			os.WriteFile(idPath, []byte(h.deviceID), 0600)
		}

		// Save key in new location
		os.MkdirAll(credentialsDir, 0700)
		os.WriteFile(keyPath, []byte(base64.StdEncoding.EncodeToString(priv)), 0600)
	}

	log.Printf("Device ID: %s", h.deviceID)

	// Derive X25519 public key for E2E credential encryption
	x25519Pub := credentials.GetX25519Pubkey(h.deviceKey)
	copy(h.x25519Pubkey[:], x25519Pub)
	log.Printf("X25519 pubkey: %s", base64.StdEncoding.EncodeToString(h.x25519Pubkey[:]))
}
