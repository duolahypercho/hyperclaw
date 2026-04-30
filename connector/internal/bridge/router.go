package bridge

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/protocol"
)

// gatewayWireMsg is the OpenClaw gateway wire format with top-level fields.
// This is different from protocol.Message which nests everything under "payload".
type gatewayWireMsg struct {
	Type    string      `json:"type"`
	Event   string      `json:"event,omitempty"`
	ID      string      `json:"id,omitempty"`
	Method  string      `json:"method,omitempty"`
	Params  interface{} `json:"params,omitempty"`
	Ok      *bool       `json:"ok,omitempty"`
	Payload interface{} `json:"payload,omitempty"`
	Error   interface{} `json:"error,omitempty"`
}

// pendingEntry tracks a gateway request awaiting a response.
type pendingEntry struct {
	hubRequestID string
	createdAt    time.Time
}

// GatewayRouter translates between hub protocol and OpenClaw gateway protocol for
// chat, sessions, and models requests.
// Hub format: {type:"req", payload:{requestId, requestType, params}}
// Gateway format: {type:"req", id:"...", method:"...", params:{...}}
type GatewayRouter struct {
	toGateway chan<- []byte
	toHub     chan<- []byte
	idCounter uint64

	// Shared flag: whether the local OpenClaw gateway WS is connected.
	// RouteToGateway fast-fails with a clear error when this is 0.
	// Set by the gateway goroutine in main, nil means "assume connected" (backward compat).
	gwConnected *atomic.Int32

	// Optional: buffered channel read by the gateway reconnect goroutine.
	// Nudging it skips the backoff sleep so a chat request right after
	// onboarding doesn't wait out the retry timer.
	gatewayKick chan<- struct{}

	// Pending gateway responses keyed by gateway request ID
	pending   map[string]pendingEntry // gateway ID → entry
	pendingMu sync.Mutex

	// Debounce kicks: don't send more than one kick per 5s to avoid
	// collapsing reconnect backoff under request pressure.
	lastKick   time.Time
	lastKickMu sync.Mutex

	stopCh chan struct{}
}

// SetGatewayKick wires the reconnect-kick channel used to wake the gateway
// retry goroutine when a request arrives while the WS is still dialing.
func (r *GatewayRouter) SetGatewayKick(ch chan<- struct{}) {
	r.gatewayKick = ch
}

// NewGatewayRouter creates a router that bridges hub and gateway protocols.
// gwConnected is an optional shared flag tracking local OpenClaw WS state (nil = assume connected).
func NewGatewayRouter(toGateway chan<- []byte, toHub chan<- []byte, gwConnected *atomic.Int32) *GatewayRouter {
	r := &GatewayRouter{
		toGateway:   toGateway,
		toHub:       toHub,
		gwConnected: gwConnected,
		pending:     make(map[string]pendingEntry),
		stopCh:      make(chan struct{}),
	}
	go r.pendingCleanupLoop()
	return r
}

// Stop terminates the background cleanup goroutine.
func (r *GatewayRouter) Stop() {
	select {
	case <-r.stopCh:
		// already closed
	default:
		close(r.stopCh)
	}
}

// IsGatewayRequest returns true if the request type should be routed to the gateway
func IsGatewayRequest(requestType string) bool {
	return strings.HasPrefix(requestType, "chat.") ||
		strings.HasPrefix(requestType, "sessions.") ||
		strings.HasPrefix(requestType, "models.") ||
		strings.HasPrefix(requestType, "agents.") ||
		strings.HasPrefix(requestType, "agent.") ||
		strings.HasPrefix(requestType, "usage.") ||
		strings.HasPrefix(requestType, "skills.")
}

// RouteToGateway translates a hub-format request to OpenClaw gateway format and sends it.
// Hub sends: {type:"req", payload:{requestId, requestType, params}}
// Gateway expects: {type:"req", id:"...", method:"...", params:{...}}
func (r *GatewayRouter) RouteToGateway(msg protocol.Message) {
	hubRequestID := msg.GetRequestID()
	requestType := msg.GetRequestType()
	params, _ := msg.Payload["params"].(map[string]interface{})

	// Grace window: if the connector just came up or onboarding just finished,
	// the reconnect goroutine may be mid-dial. Wait briefly for gwConnected to
	// flip before failing. This prevents a user who clicks "chat" seconds after
	// onboarding from seeing "gateway not connected" as a hard error.
	if r.gwConnected != nil && r.gwConnected.Load() == 0 {
		// Cold-start budget: node daemon boot + WS handshake can take 10-15s
		// on a fresh machine. A short window here produced spurious
		// "gateway not connected" errors right after onboarding.
		const graceWindow = 20 * time.Second
		// Nudge the reconnect goroutine so it doesn't wait out its backoff.
		// Debounce: at most one kick per 5s to prevent collapsing backoff under load.
		if r.gatewayKick != nil {
			r.lastKickMu.Lock()
			canKick := time.Since(r.lastKick) >= 5*time.Second
			if canKick {
				r.lastKick = time.Now()
			}
			r.lastKickMu.Unlock()
			if canKick {
				select {
				case r.gatewayKick <- struct{}{}:
				default:
				}
			}
		}
		deadline := time.Now().Add(graceWindow)
		for time.Now().Before(deadline) {
			if r.gwConnected.Load() == 1 {
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
		if r.gwConnected.Load() == 0 {
			log.Printf("GatewayRouter: gateway not connected after %s, rejecting %s (%s)", graceWindow, hubRequestID, requestType)
			r.sendErrorToHub(hubRequestID, "gateway not connected")
			return
		}
	}

	// Generate a gateway-local request ID
	n := atomic.AddUint64(&r.idCounter, 1)
	gatewayID := fmt.Sprintf("gw_%d_%d", time.Now().UnixMilli(), n)

	// Store mapping: gateway ID → hub request ID with timestamp
	r.pendingMu.Lock()
	if len(r.pending) >= 500 {
		r.pendingMu.Unlock()
		log.Printf("GatewayRouter: pending map full (500), dropping request %s", hubRequestID)
		r.sendErrorToHub(hubRequestID, "gateway request queue full")
		return
	}
	r.pending[gatewayID] = pendingEntry{hubRequestID: hubRequestID, createdAt: time.Now()}
	r.pendingMu.Unlock()

	// Build OpenClaw gateway format with top-level fields
	gwMsg := gatewayWireMsg{
		Type:   "req",
		ID:     gatewayID,
		Method: requestType,
		Params: params,
	}

	data, _ := json.Marshal(gwMsg)
	if r.trySendToGateway(data, hubRequestID) {
		log.Printf("GatewayRouter: routed %s → gateway as %s (method: %s)", hubRequestID, gatewayID, requestType)
	} else {
		r.pendingMu.Lock()
		delete(r.pending, gatewayID)
		r.pendingMu.Unlock()
		r.sendErrorToHub(hubRequestID, "gateway channel full")
	}

	// Cleanup is handled by the background pendingCleanupLoop
}

// HandleGatewayMessage checks if a raw gateway message matches a pending hub request
// and translates it back to hub format. Accepts raw bytes because protocol.Message
// cannot represent gateway's top-level id/ok/payload fields.
// Returns true if the message was handled (consumed).
func (r *GatewayRouter) HandleGatewayMessage(raw []byte) bool {
	var msg gatewayWireMsg
	if err := json.Unmarshal(raw, &msg); err != nil {
		return false
	}

	// Only handle responses to our routed requests
	if msg.Type != "res" {
		return false
	}

	if msg.ID == "" {
		return false
	}

	r.pendingMu.Lock()
	entry, ok := r.pending[msg.ID]
	if ok {
		delete(r.pending, msg.ID)
	}
	r.pendingMu.Unlock()

	if !ok {
		return false
	}

	hubRequestID := entry.hubRequestID
	log.Printf("GatewayRouter: translating gateway response %s → hub %s", msg.ID, hubRequestID)

	// Translate to hub response format
	status := protocol.StatusOk
	var responseData map[string]interface{}

	if msg.Ok != nil && !*msg.Ok {
		status = protocol.StatusError
		responseData = map[string]interface{}{"error": msg.Error}
	} else if msg.Error != nil {
		status = protocol.StatusError
		responseData = map[string]interface{}{"error": msg.Error}
	} else {
		switch v := msg.Payload.(type) {
		case map[string]interface{}:
			responseData = v
		default:
			responseData = map[string]interface{}{"result": msg.Payload}
		}
	}

	if responseData == nil {
		responseData = map[string]interface{}{}
	}

	hubResp := protocol.NewResponse(hubRequestID, status, responseData)
	respData, _ := json.Marshal(hubResp)
	r.trySendToHub(respData, hubRequestID)

	return true
}

// pendingCleanupLoop periodically removes stale pending entries instead of
// spawning a goroutine per request.
func (r *GatewayRouter) pendingCleanupLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.stopCh:
			return
		case <-ticker.C:
			r.pendingMu.Lock()
			now := time.Now()
			for gwID, entry := range r.pending {
				if now.Sub(entry.createdAt) > 60*time.Second {
					delete(r.pending, gwID)
					r.pendingMu.Unlock()
					log.Printf("GatewayRouter: pending entry %s (hub %s) expired after 60s", gwID, entry.hubRequestID)
					r.sendErrorToHub(entry.hubRequestID, "gateway request timed out")
					r.pendingMu.Lock()
				}
			}
			r.pendingMu.Unlock()
		}
	}
}

func (r *GatewayRouter) sendErrorToHub(hubRequestID, errMsg string) {
	resp := protocol.NewResponse(hubRequestID, protocol.StatusError, map[string]interface{}{
		"error": errMsg,
	})
	data, _ := json.Marshal(resp)
	r.trySendToHub(data, hubRequestID)
}

func (r *GatewayRouter) trySendToHub(data []byte, hubRequestID string) {
	trySendRequiredToHub("GatewayRouter", hubRequestID, r.toHub, data)
}

func (r *GatewayRouter) trySendToGateway(data []byte, hubRequestID string) bool {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("GatewayRouter: toGateway channel closed while routing %s: %v", hubRequestID, recovered)
		}
	}()
	select {
	case r.toGateway <- data:
		return true
	default:
		log.Printf("GatewayRouter: toGateway channel full, dropping request %s", hubRequestID)
		return false
	}
}
