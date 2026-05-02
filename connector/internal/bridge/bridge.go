package bridge

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/config"
	"github.com/hypercho/hyperclaw-connector/internal/gateway"
	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// Per-action timeouts
var actionTimeouts = map[string]time.Duration{
	"trigger-process-commands":       180 * time.Second,
	"openclaw-cron-execute":          120 * time.Second,
	"openclaw-doctor-fix":            time.Duration(openClawDoctorFixTimeoutMs) * time.Millisecond,
	"openclaw-security-audit-deep":   time.Duration(openClawSecurityAuditDeepTimeoutMs) * time.Millisecond,
	"openclaw-status-all":            time.Duration(openClawStatusAllTimeoutMs) * time.Millisecond,
	"gateway-restart":                30 * time.Second,
	"cron-run":                       120 * time.Second,
	"add-agent":                      10 * time.Minute,
	"cron-add":                       30 * time.Second,
	"delete-agent":                   60 * time.Second,
	"cron-edit":                      15 * time.Second,
	"cron-delete":                    15 * time.Second,
	"cron-toggle":                    10 * time.Second,
	"cron-runs-sync":                 15 * time.Second,
	"get-logs":                       10 * time.Second,
	"get-crons":                      10 * time.Second,
	"get-cron-by-id":                 10 * time.Second,
	"list-agents":                    10 * time.Second,
	"get-config":                     10 * time.Second,
	"gateway-request":                90 * time.Second,
	"get-team":                       10 * time.Second,
	"get-todo-data":                  10 * time.Second,
	"save-todo-data":                 10 * time.Second,
	"list-tasks-by-project":          10 * time.Second,
	"task-log-append":                10 * time.Second,
	"get-running-crons":              10 * time.Second,
	"read-orgchart":                  10 * time.Second,
	"write-orgchart":                 10 * time.Second,
	"assign-orgchart-task":           10 * time.Second,
	"update-orgchart-task":           10 * time.Second,
	"update-org-node":                10 * time.Second,
	"update-agent-config":            10 * time.Second,
	"get-org-status":                 15 * time.Second,
	"intel-schema":                   10 * time.Second,
	"intel-query":                    10 * time.Second,
	"intel-execute":                  10 * time.Second,
	"intel-insert":                   10 * time.Second,
	"intel-update":                   10 * time.Second,
	"intel-delete":                   10 * time.Second,
	"credentials:store":              15 * time.Second,
	"credentials:list":               10 * time.Second,
	"credentials:delete":             10 * time.Second,
	"credentials:apply":              30 * time.Second,
	"hermes-health":                  5 * time.Second,
	"hermes-chat":                    120 * time.Second,
	"hermes-abort":                   5 * time.Second,
	"hermes-sessions":                10 * time.Second,
	"hermes-load-history":            10 * time.Second,
	"list-hermes-profiles":           5 * time.Second,
	"hermes-get-soul":                5 * time.Second,
	"hermes-update-soul":             10 * time.Second,
	"hermes-get-profile-config":      5 * time.Second,
	"hermes-update-profile-config":   10 * time.Second,
	"hermes-list-skills":             5 * time.Second,
	"openclaw-list-skills":           5 * time.Second,
	"openclaw-skills-update":         10 * time.Second,
	"skills-sh-search":               15 * time.Second,
	"skills-sh-install":              30 * time.Second,
	"hermes-get-profile-logs":        10 * time.Second,
	"claude-code-list-sessions":      10 * time.Second,
	"claude-code-list-projects":      10 * time.Second,
	"claude-code-load-history":       15 * time.Second,
	"claude-code-status":             5 * time.Second,
	"claude-code-abort":              5 * time.Second,
	"claude-code-unwatch":            5 * time.Second,
	"claude-skills-list":             5 * time.Second,
	"claude-skill-read":              5 * time.Second,
	"claude-skill-write":             10 * time.Second,
	"claude-skill-delete":            5 * time.Second,
	"codex-status":                   5 * time.Second,
	"codex-abort":                    5 * time.Second,
	"codex-list-sessions":            10 * time.Second,
	"codex-load-history":             15 * time.Second,
	"codex-list-skills":              5 * time.Second,
	"get-agent-events":               10 * time.Second,
	"add-agent-event":                10 * time.Second,
	"get-all-agents":                 10 * time.Second,
	"get-all-crons":                  10 * time.Second,
	"get-all-sessions":               10 * time.Second,
	"get-session-messages":           10 * time.Second,
	"get-runtime-status":             5 * time.Second,
	"connector-stability-status":     5 * time.Second,
	"connector-health":               5 * time.Second,
	"get-buildings":                  10 * time.Second,
	"setup-agent":                    30 * time.Second,
	"openclaw-config-get":            10 * time.Second,
	"openclaw-config-set":            10 * time.Second,
	"onboarding-provision-workspace": 20 * time.Minute,
	"onboarding-install-runtime":     20 * time.Minute,
	"onboarding-configure-workspace": 10 * time.Minute,
	"onboarding-provision-agent":     10 * time.Minute,
	"oauth:store-cli-tokens":         15 * time.Second,
	"run-agent-task":                 300 * time.Second,
	"agent-send-message":             300 * time.Second,
	"project-lead-heartbeat":         30 * time.Minute,
	"project-task-dispatch":          5 * time.Minute,
	"get-agent-personality":          10 * time.Second,
	"save-agent-personality":         10 * time.Second,
	"save-agent-file":                10 * time.Second,
	"list-available-runtimes":        5 * time.Second,
	"get-agent-stats":                10 * time.Second,
	"list-agent-identities":          10 * time.Second,
	"get-runtime-sessions":           10 * time.Second,
	"update-agent-identity":          10 * time.Second,
	"get-agent-identity-doc":         10 * time.Second,
	"write-agent-identity-doc":       10 * time.Second,
	"agentic-stack-status":           10 * time.Second,
	"agentic-stack-adapter-list":     10 * time.Second,
	"agentic-stack-adapter-add":      60 * time.Second,
	"agentic-stack-adapter-remove":   30 * time.Second,
	"agentic-stack-doctor":           30 * time.Second,
	// Runtime cleanup (generic + legacy openclaw-specific)
	"check-orphaned-runtimes":    5 * time.Second,
	"runtime-cleanup-check":      5 * time.Second,
	"runtime-cleanup-export":     30 * time.Second,
	"runtime-cleanup-delete":     30 * time.Second,
	"check-orphaned-agents":      5 * time.Second,
	"delete-orphaned-agent":      10 * time.Second,
	"delete-all-orphaned-agents": 30 * time.Second,
	"openclaw-cleanup-check":     5 * time.Second,
	"openclaw-cleanup-export":    30 * time.Second,
	"openclaw-cleanup-delete":    30 * time.Second,
	// Built-in agent tools
	"hyperclaw-tool-call":  3 * time.Minute,
	"hyperclaw-tools-list": 10 * time.Second,
	// Projects
	"project-create":                       10 * time.Second,
	"project-list":                         10 * time.Second,
	"project-get":                          10 * time.Second,
	"project-update":                       10 * time.Second,
	"project-delete":                       10 * time.Second,
	"project-add-member":                   10 * time.Second,
	"project-remove-member":                10 * time.Second,
	"project-get-members":                  10 * time.Second,
	"agent-get-projects":                   10 * time.Second,
	"get-team-mode-status":                 10 * time.Second,
	"sync-team-mode":                       30 * time.Second,
	"workflow-template-list":               10 * time.Second,
	"workflow-template-get":                10 * time.Second,
	"workflow-template-create":             15 * time.Second,
	"workflow-template-update":             15 * time.Second,
	"workflow-template-publish":            15 * time.Second,
	"workflow-template-archive":            15 * time.Second,
	"workflow-template-delete":             10 * time.Second,
	"workflow-template-clone":              15 * time.Second,
	"workflow-template-create-from-prompt": 15 * time.Second,
	"workflow-graph-get":                   10 * time.Second,
	"workflow-graph-save":                  15 * time.Second,
	"workflow-graph-publish-template":      15 * time.Second,
	"workflow-component-list":              10 * time.Second,
	"workflow-chart-spec-list":             10 * time.Second,
	"workflow-chart-list":                  10 * time.Second,
	"workflow-chart-spec-save":             15 * time.Second,
	"workflow-draft-create":                15 * time.Second,
	"workflow-draft-list":                  10 * time.Second,
	"workflow-draft-save":                  15 * time.Second,
	"workflow-draft-promote":               15 * time.Second,
	"workflow-run-list":                    10 * time.Second,
	"workflow-run-get":                     10 * time.Second,
	"workflow-run-start":                   15 * time.Second,
	"workflow-run-resume":                  10 * time.Second,
	"workflow-run-cancel":                  10 * time.Second,
	"workflow-request-approval":            10 * time.Second,
	"workflow-resolve-approval":            10 * time.Second,
	"workflow-submit-report":               10 * time.Second,
	// Agent last-seen
	"get-agent-last-seen": 10 * time.Second,
	"set-agent-last-seen": 5 * time.Second,
	// Primary sessions
	"get-primary-session": 10 * time.Second,
	"set-primary-session": 5 * time.Second,
	// Ensemble rooms
	"room-create":   10 * time.Second,
	"room-list":     10 * time.Second,
	"room-delete":   5 * time.Second,
	"room-msg-list": 10 * time.Second,
	"room-msg-add":  10 * time.Second,
	// Stripe ARR
	"stripe-arr-status":         5 * time.Second,
	"stripe-arr-get":            120 * time.Second,
	"stripe-arr-refresh":        120 * time.Second,
	"stripe-arr-disconnect":     10 * time.Second,
	"stripe-arr-snapshots-list": 10 * time.Second,
	// Knowledge base
	"knowledge-list":              10 * time.Second,
	"knowledge-get-doc":           10 * time.Second,
	"knowledge-get-binary":        30 * time.Second,
	"knowledge-write-doc":         10 * time.Second,
	"knowledge-delete-doc":        10 * time.Second,
	"knowledge-create-collection": 10 * time.Second,
	"knowledge-delete-collection": 10 * time.Second,
}

const defaultTimeout = 60 * time.Second

// connectorRestartingError is returned to in-flight / newly-arriving bridge
// requests once the connector has started a graceful shutdown. Dashboards
// retry on this marker instead of waiting for the 20-minute action timeout
// because the detached goroutine was orphaned by SIGTERM.
const connectorRestartingError = "connector restarting, retry shortly"

func getActionTimeout(action string) time.Duration {
	if t, ok := actionTimeouts[action]; ok {
		return t
	}
	return defaultTimeout
}

// SyncEngineIface is the subset of SyncEngine used by bridge actions.
type SyncEngineIface interface {
	WriteAgentFile(agentID, fileKey, content, runtimePath, runtime string) error
}

// RuntimeWorker runs heavy streaming runtime actions outside the connector
// process. BridgeHandler falls back to in-process handlers when this is nil.
type RuntimeWorker interface {
	RunStreaming(ctx context.Context, action string, params map[string]interface{}, requestID string, toHub chan<- []byte) error
	RunAction(ctx context.Context, action string, params map[string]interface{}) (map[string]interface{}, error)
	Status() map[string]interface{}
	Shutdown() error
}

// BridgeHandler handles bridge requests natively in Go.
type BridgeHandler struct {
	paths           Paths
	todo            *TodoStore
	orgChart        *OrgChartStore
	store           *store.Store       // SQLite store (nil if not initialized)
	intel           *store.IntelStore  // Intel DB store (nil if not initialized)
	onAgentsChanged func()             // optional callback when agents are added/deleted
	deviceKey       ed25519.PrivateKey // device Ed25519 key for credential encryption
	syncEngine      SyncEngineIface    // file ↔ SQLite sync engine (nil if not wired)
	cronScheduler   *CronScheduler     // background scheduler for non-OpenClaw cron jobs

	// teamCache caches ResolveTeam() results to avoid spawning repeated openclaw
	// CLI processes when multiple bridge actions (list-agents, get-employee-status)
	// call ResolveTeam in quick succession.
	teamCacheMu     sync.Mutex
	teamCacheResult []TeamAgent
	teamCacheExpiry time.Time

	// provisionProgress sends intermediate progress events to the dashboard
	// during onboarding actions. Access only via getProvisionProgress /
	// setProvisionProgress — a concurrent non-onboarding request used to race
	// the onboarding request here and silently clobber progress updates.
	provisionProgressMu sync.RWMutex
	provisionProgress   func(key, status, detail string)

	// Graceful shutdown coordination.
	//
	// When the process receives SIGINT/SIGTERM, main cancels ctx and calls
	// BeginShutdown on the current bridge handler. Subsequent requests are
	// rejected immediately with connectorRestartingError so the dashboard
	// knows to retry instead of waiting out the 20-minute action timeout.
	// In-flight requests get a short grace period via WaitInFlight before
	// the process exits.
	shutdownOnce sync.Once
	shutdownCh   chan struct{}
	shuttingDown atomic.Bool
	inflight     sync.WaitGroup

	// gwConnected, if non-nil, reflects whether the connector's own WS to the
	// local OpenClaw gateway is currently open. Onboarding uses it to wait for
	// the gateway to actually come up before marking provisioning done.
	gwConnected *atomic.Int32

	// gatewayKick, if non-nil, is a buffered channel the onboarding flow pokes
	// after successfully starting the OpenClaw daemon so the connector's
	// reconnect goroutine wakes from its backoff sleep immediately instead of
	// waiting up to ~45s before retrying.
	gatewayKick chan<- struct{}

	runtimeWorker RuntimeWorker

	// hubBroadcast, when set, is a write channel into the hub's outbound
	// queue. MCP-driven and other out-of-band sources push events here so
	// connected dashboards see live updates without polling. Optional —
	// nil means "no live channel," and callers tolerate that case.
	hubBroadcast chan<- []byte

	gatewayConfig *config.Config
}

// NewBridgeHandler creates a new native bridge handler.
func NewBridgeHandler() *BridgeHandler {
	p := ResolvePaths()
	return &BridgeHandler{
		paths:      p,
		todo:       NewTodoStore(p.TodoDataPath()),
		orgChart:   NewOrgChartStore(p.OrgChartPath()),
		shutdownCh: make(chan struct{}),
	}
}

func (b *BridgeHandler) SetRuntimeWorker(worker RuntimeWorker) {
	b.runtimeWorker = worker
}

func (b *BridgeHandler) SetGatewayConfig(cfg *config.Config) {
	b.gatewayConfig = cfg
}

// BeginShutdown marks the bridge as shutting down. Subsequent Dispatch/Handle
// calls return connectorRestartingError immediately. Safe to call multiple
// times.
func (b *BridgeHandler) BeginShutdown() {
	b.shuttingDown.Store(true)
	cancelAllSessionWatchers()
	b.shutdownOnce.Do(func() { close(b.shutdownCh) })
}

// IsShuttingDown reports whether BeginShutdown has been called.
func (b *BridgeHandler) IsShuttingDown() bool {
	return b.shuttingDown.Load()
}

// WaitInFlight blocks until all in-flight bridge requests complete or the
// timeout elapses. Returns true if drained cleanly, false on timeout.
func (b *BridgeHandler) WaitInFlight(timeout time.Duration) bool {
	done := make(chan struct{})
	go func() {
		b.inflight.Wait()
		close(done)
	}()
	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

// setProvisionProgress stores the per-request progress callback. Pass nil to
// clear. Guarded by a mutex because concurrent bridge requests race here.
func (b *BridgeHandler) setProvisionProgress(fn func(key, status, detail string)) {
	b.provisionProgressMu.Lock()
	b.provisionProgress = fn
	b.provisionProgressMu.Unlock()
}

// getProvisionProgress returns the currently-registered progress callback (or
// nil). Read lock ensures safe concurrent access.
func (b *BridgeHandler) getProvisionProgress() func(key, status, detail string) {
	b.provisionProgressMu.RLock()
	fn := b.provisionProgress
	b.provisionProgressMu.RUnlock()
	return fn
}

// emitProvisionProgress calls the registered progress callback if any.
func (b *BridgeHandler) emitProvisionProgress(key, status, detail string) {
	if fn := b.getProvisionProgress(); fn != nil {
		fn(key, status, detail)
	}
}

// SetStore attaches the SQLite store to the bridge handler.
func (b *BridgeHandler) SetStore(s *store.Store) {
	b.store = s
	// Start the cron scheduler for non-OpenClaw runtimes
	if b.cronScheduler != nil {
		b.cronScheduler.Stop()
	}
	b.cronScheduler = NewCronScheduler(b)
	b.cronScheduler.Start()
}

// Store returns the attached SQLite store (may be nil).
func (b *BridgeHandler) Store() *store.Store {
	return b.store
}

// SetOnAgentsChanged registers a callback invoked when agents are added or deleted.
func (b *BridgeHandler) SetOnAgentsChanged(fn func()) {
	b.onAgentsChanged = fn
}

// SetIntelStore attaches the Intel DB store to the bridge handler.
func (b *BridgeHandler) SetIntelStore(s *store.IntelStore) {
	b.intel = s
}

// IntelStore returns the attached Intel DB store (may be nil).
func (b *BridgeHandler) IntelStore() *store.IntelStore {
	return b.intel
}

// SetDeviceKey attaches the device Ed25519 private key for credential encryption.
func (b *BridgeHandler) SetDeviceKey(key ed25519.PrivateKey) {
	b.deviceKey = key
}

// SetSyncEngine attaches the SyncEngine to the bridge handler.
func (b *BridgeHandler) SetSyncEngine(e SyncEngineIface) {
	b.syncEngine = e
}

// SetGatewayFlag attaches the shared atomic tracking whether the connector's
// own WS to the local OpenClaw gateway is currently connected. Used by
// onboarding to wait for the gateway to come up before declaring success.
func (b *BridgeHandler) SetGatewayFlag(flag *atomic.Int32) {
	b.gwConnected = flag
}

// SetGatewayKick attaches the buffered channel used to wake the connector's
// reconnect goroutine from its backoff sleep (e.g. right after onboarding
// starts the OpenClaw daemon). Send is always non-blocking.
// SetHubBroadcast wires a non-blocking publish channel into the hub's
// outbound queue. Callers that want to push an event to dashboards from
// outside a request context (MCP server, file watchers, cron) use the
// BroadcastEvent helper rather than touching this directly.
func (b *BridgeHandler) SetHubBroadcast(ch chan<- []byte) {
	b.hubBroadcast = ch
}

// BroadcastEvent pushes a gateway-format event message onto the hub
// outbound channel. Best-effort: drops the message if no broadcast
// channel has been wired or the queue is full. Returns true when the
// message was queued successfully — useful in tests.
func (b *BridgeHandler) BroadcastEvent(eventName string, data map[string]interface{}) bool {
	if b.hubBroadcast == nil {
		return false
	}
	if data == nil {
		data = map[string]interface{}{}
	}
	if _, ok := data["ts"]; !ok {
		data["ts"] = time.Now().UnixMilli()
	}
	msg := map[string]interface{}{
		"type":  "evt",
		"event": eventName,
		"data":  data,
	}
	payload, err := json.Marshal(msg)
	if err != nil {
		return false
	}
	select {
	case b.hubBroadcast <- payload:
		log.Printf("[broadcast] event=%s bytes=%d", eventName, len(payload))
		return true
	default:
		log.Printf("[broadcast] DROP event=%s (queue full or unwired)", eventName)
		return false
	}
}

// RecordActionStart inserts a "running" row in the actions table and
// returns its id. Used by callers that dispatch outside the WS path
// (MCP, install.sh) so dashboard activity surfaces those calls
// alongside dashboard-driven ones. Returns 0 when no store is wired.
func (b *BridgeHandler) RecordActionStart(action, agentID string) int64 {
	if b.store == nil {
		return 0
	}
	id, _ := b.store.RecordAction(action, agentID, "running", nil)
	return id
}

// RecordActionComplete updates an action row with final status, duration,
// and either a JSON-marshalled response payload or an error message.
// No-op when id == 0 or no store is wired.
func (b *BridgeHandler) RecordActionComplete(id int64, status string, response interface{}, errMsg string, durationMs int64) {
	if b.store == nil || id <= 0 {
		return
	}
	var responseStr string
	if response != nil {
		raw, err := json.Marshal(response)
		if err == nil {
			responseStr = string(raw)
		}
	}
	b.store.UpdateAction(id, status, responseStr, errMsg, durationMs)
}

func (b *BridgeHandler) SetGatewayKick(ch chan<- struct{}) {
	b.gatewayKick = ch
}

// kickGatewayReconnect pokes the reconnect goroutine if wired. Non-blocking.
func (b *BridgeHandler) kickGatewayReconnect() {
	if b.gatewayKick == nil {
		return
	}
	select {
	case b.gatewayKick <- struct{}{}:
	default:
	}
}

// actionResult holds the result of a bridge action dispatch.
type actionResult struct {
	data   interface{}
	err    error
	status int // HTTP-like status for compatibility (0 = ok, 400 = bad request, 404 = not found, 500 = error)
}

func okResult(data interface{}) actionResult {
	return actionResult{data: data}
}

func errResult(msg string) actionResult {
	return actionResult{err: fmt.Errorf("%s", msg)}
}

func errResultStatus(msg string, status int) actionResult {
	return actionResult{err: fmt.Errorf("%s", msg), status: status}
}

// Dispatch runs a bridge action and returns the result as a plain value.
// Used by the local HTTP bridge to bypass the Hub relay.
// For streaming actions, creates a temporary channel to collect the final response.
func (b *BridgeHandler) Dispatch(action string, params map[string]interface{}) interface{} {
	if b.IsShuttingDown() {
		return map[string]interface{}{"success": false, "error": connectorRestartingError}
	}
	b.inflight.Add(1)
	defer b.inflight.Done()
	// claude-code-watch is a long-lived watcher — from the local bridge,
	// start it with a discard channel (events only useful via hub relay)
	if action == "claude-code-watch" {
		discard := make(chan []byte, 64)
		go func() {
			for range discard {
			}
		}() // drain
		r := b.claudeCodeWatch(params, discard)
		if r.err != nil {
			return map[string]interface{}{"success": false, "error": r.err.Error()}
		}
		return r.data
	}

	if isStreamingAction(action) {
		// Create a temporary channel to capture streaming responses.
		// Events are discarded (no dashboard to stream to); only the final "res" matters.
		toHub := make(chan []byte, 256)
		done := make(chan interface{}, 1)

		go func() {
			switch action {
			case "claude-code-send":
				b.claudeCodeSend(params, "local", toHub)
			case "codex-send":
				b.codexSend(params, "local", toHub)
			case "hermes-chat":
				b.hermesChatStream(params, "local", toHub)
			}
			close(toHub)
		}()

		// Drain the channel, keeping only the final response (type: "res")
		go func() {
			var lastRes interface{}
			for data := range toHub {
				var msg map[string]interface{}
				if err := json.Unmarshal(data, &msg); err != nil {
					continue
				}
				if msg["type"] == "res" {
					// Extract the data field from the protocol response
					if payload, ok := msg["payload"].(map[string]interface{}); ok {
						if d, ok := payload["data"]; ok {
							lastRes = d
						}
					}
				}
			}
			done <- lastRes
		}()

		// 10-minute hard deadline so orphaned goroutines don't run forever.
		var result interface{}
		select {
		case result = <-done:
		case <-time.After(10 * time.Minute):
			result = map[string]interface{}{"success": false, "error": "streaming action timed out"}
		}
		if result == nil {
			return map[string]interface{}{"success": false, "error": "no response from streaming action"}
		}
		return result
	}

	r := b.dispatch(action, params)
	if r.err != nil {
		return map[string]interface{}{"success": false, "error": r.err.Error()}
	}
	return r.data
}

// isStreamingAction returns true for actions that send multiple messages
// through toHub (streaming events + final response) rather than a single response.
func isStreamingAction(action string) bool {
	switch action {
	case "claude-code-send", "codex-send", "claude-code-watch", "hermes-chat", "room-send":
		return true
	}
	return false
}

func runtimeWorkerSupports(action string) bool {
	switch action {
	case "claude-code-send", "codex-send", "hermes-chat":
		return true
	default:
		return false
	}
}

func runtimeWorkerSupportsControl(action string) bool {
	switch action {
	case "claude-code-status", "claude-code-abort", "codex-status", "codex-abort", "hermes-health", "hermes-abort":
		return true
	default:
		return false
	}
}

func (b *BridgeHandler) RunStreamingAction(action string, params map[string]interface{}, requestID string, toHub chan<- []byte) {
	switch action {
	case "claude-code-send":
		b.claudeCodeSend(params, requestID, toHub)
	case "codex-send":
		b.codexSend(params, requestID, toHub)
	case "hermes-chat":
		b.hermesChatStream(params, requestID, toHub)
	case "room-send":
		b.roomSend(params, requestID, toHub)
	case "claude-code-watch":
		r := b.claudeCodeWatch(params, toHub)
		if r.err != nil {
			sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{"error": r.err.Error()}, toHub)
			return
		}
		var respData map[string]interface{}
		switch v := r.data.(type) {
		case map[string]interface{}:
			respData = v
		default:
			raw, _ := json.Marshal(r.data)
			json.Unmarshal(raw, &respData)
		}
		sendStreamResponse(requestID, protocol.StatusOk, respData, toHub)
	}
}

func (b *BridgeHandler) gatewayRequest(params map[string]interface{}) actionResult {
	requestType, _ := params["requestType"].(string)
	if requestType == "" {
		return errResultStatus("requestType is required", 400)
	}
	if !IsGatewayRequest(requestType) {
		return errResultStatus("unsupported gateway request type", 400)
	}

	requestParams, _ := params["params"].(map[string]interface{})
	timeout := 30 * time.Second
	if ms, ok := params["timeoutMs"].(float64); ok && ms > 0 {
		timeout = time.Duration(ms) * time.Millisecond
	}
	if timeout > 90*time.Second {
		timeout = 90 * time.Second
	}

	cfg := &config.Config{}
	if b.gatewayConfig != nil {
		copy := *b.gatewayConfig
		cfg = &copy
	}
	if cfg.GatewayHost == "" {
		cfg.GatewayHost = "127.0.0.1"
	}
	if cfg.GatewayPort == 0 && cfg.GatewayURL == "" {
		cfg.GatewayPort = 18789
	}
	if cfg.Version == "" {
		cfg.Version = "local-bridge"
	}
	payload, err := gateway.RequestOnce(cfg, requestType, requestParams, timeout)
	if err != nil {
		return errResultStatus(err.Error(), 502)
	}
	return okResult(payload)
}

// Handle processes a bridge request by dispatching to native Go handlers.
func (b *BridgeHandler) Handle(req protocol.Message, toHub chan<- []byte) {
	params, _ := req.Payload["params"].(map[string]interface{})
	requestID := req.GetRequestID()

	if params == nil {
		b.sendError(requestID, "missing params in bridge request", toHub)
		return
	}

	if b.IsShuttingDown() {
		b.sendError(requestID, connectorRestartingError, toHub)
		return
	}
	b.inflight.Add(1)
	defer b.inflight.Done()

	action, _ := params["action"].(string)

	// Streaming actions manage their own responses via toHub directly.
	// They send event messages as partial updates and a final res message.
	if isStreamingAction(action) {
		var actionID int64
		if b.store != nil {
			actionID, _ = b.store.RecordAction(action, "", "running", nil)
		}
		start := time.Now()

		if b.runtimeWorker != nil && runtimeWorkerSupports(action) {
			ctx, cancel := context.WithCancel(context.Background())
			done := make(chan struct{})
			defer close(done)
			go func() {
				select {
				case <-b.shutdownCh:
					cancel()
				case <-done:
				}
			}()
			err := b.runtimeWorker.RunStreaming(ctx, action, params, requestID, toHub)
			cancel()
			if err != nil {
				sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{"error": err.Error()}, toHub)
			}
		} else {
			b.RunStreamingAction(action, params, requestID, toHub)
		}

		if b.store != nil && actionID > 0 {
			b.store.UpdateAction(actionID, "completed", nil, "", time.Since(start).Milliseconds())
		}
		return
	}

	timeout := getActionTimeout(action)

	type result struct {
		data interface{}
		err  error
		code int
	}

	// Onboarding actions send progress events through toHub while running.
	// Only onboarding actions register a progress callback — non-onboarding
	// requests used to overwrite the shared field here and silence progress
	// updates mid-install. The callback is cleared at the end of the request.
	isOnboarding := isOnboardingProgressAction(action)
	if isOnboarding {
		progressFn := func(key, status, detail string) {
			evt := protocol.NewEvent("onboarding-progress", map[string]interface{}{
				"key":    key,
				"status": status,
				"detail": detail,
			})
			data, err := json.Marshal(evt)
			if err != nil {
				return
			}
			b.trySendToHub(toHub, data, "")
		}
		b.setProvisionProgress(progressFn)
		defer b.setProvisionProgress(nil)
	}

	// Record action start in SQLite (fire-and-forget if store is nil)
	var actionID int64
	if b.store != nil {
		actionID, _ = b.store.RecordAction(action, "", "running", nil)
	}
	start := time.Now()

	ch := make(chan result, 1)
	go func() {
		if b.runtimeWorker != nil && runtimeWorkerSupportsControl(action) {
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()
			data, err := b.runtimeWorker.RunAction(ctx, action, params)
			ch <- result{data: data, err: err}
			return
		}
		r := b.dispatch(action, params)
		ch <- result{data: r.data, err: r.err, code: r.status}
	}()

	select {
	case r := <-ch:
		durationMs := time.Since(start).Milliseconds()

		if r.err != nil {
			if b.store != nil && actionID > 0 {
				b.store.UpdateAction(actionID, "error", nil, r.err.Error(), durationMs)
			}
			b.sendError(requestID, r.err.Error(), toHub)
			return
		}

		if b.store != nil && actionID > 0 {
			b.store.UpdateAction(actionID, "completed", nil, "", durationMs)
		}

		// Avoid marshal+unmarshal round-trip: try direct type assertion first.
		var respData map[string]interface{}
		switch v := r.data.(type) {
		case map[string]interface{}:
			respData = v
		case nil:
			respData = map[string]interface{}{}
		default:
			// Fallback: marshal to JSON then unmarshal (handles structs, etc.)
			raw, _ := json.Marshal(r.data)
			if err := json.Unmarshal(raw, &respData); err != nil || respData == nil {
				respData = map[string]interface{}{"result": r.data}
			}
		}
		if respData == nil {
			respData = map[string]interface{}{}
		}
		response := protocol.NewResponse(requestID, protocol.StatusOk, respData)
		responseBytes, _ := json.Marshal(response)
		b.trySendToHub(toHub, responseBytes, requestID)

		// For long-running onboarding actions, also broadcast a completion event
		// so the dashboard receives it even if the WS reconnected during the wait
		// (events go to ALL dashboard clients, not just the original sender).
		if isOnboarding {
			evt := protocol.NewEvent("onboarding-action-completed", map[string]interface{}{
				"action":    action,
				"requestId": requestID,
				"success":   true,
				"data":      respData,
			})
			evtBytes, _ := json.Marshal(evt)
			b.trySendToHub(toHub, evtBytes, "")
		}

	case <-time.After(timeout):
		if b.store != nil && actionID > 0 {
			b.store.UpdateAction(actionID, "error", nil, "timeout", time.Since(start).Milliseconds())
		}
		b.sendError(requestID, fmt.Sprintf("bridge action %q timed out after %s", action, timeout), toHub)

	case <-b.shutdownCh:
		if b.store != nil && actionID > 0 {
			b.store.UpdateAction(actionID, "error", nil, connectorRestartingError, time.Since(start).Milliseconds())
		}
		b.sendError(requestID, connectorRestartingError, toHub)
	}
}

func isOnboardingProgressAction(action string) bool {
	switch action {
	case "onboarding-provision-workspace",
		"onboarding-install-runtime",
		"onboarding-configure-workspace",
		"onboarding-provision-agent":
		return true
	default:
		return false
	}
}

func (b *BridgeHandler) dispatch(action string, params map[string]interface{}) actionResult {
	log.Printf("[bridge] dispatch action=%q", action)
	switch action {
	// === Todo (6) — SQLite-backed with JSON fallback ===
	case "get-todo-data":
		return b.getTodoData()
	case "save-todo-data":
		return b.saveTodoData(params)
	case "get-tasks":
		return b.getTasks()
	case "list-tasks-by-project":
		return b.listTasksByProject(params)
	case "add-task":
		return b.addTask(params)
	case "update-task":
		return b.updateTask(params)
	case "delete-task":
		return b.deleteTask(params)
	case "get-task-logs":
		return b.getTaskLogs(params)
	case "task-log-append":
		return b.appendTaskLog(params)
	case "get-task-sessions":
		return b.getTaskSessions(params)
	case "link-task-session":
		return b.linkTaskSession(params)

	// === Data reads/writes (12) — SQLite-backed with JSON fallback ===
	case "get-events":
		return b.getEvents()
	case "get-logs":
		return b.getLogs(params)
	case "get-config":
		return b.getConfig()
	case "gateway-request":
		return b.gatewayRequest(params)
	case "list-models":
		return b.listModels(params)
	case "load-local-usage":
		return b.loadLocalUsage()
	case "save-local-usage":
		return b.saveLocalUsage(params)
	case "get-local-user-profile":
		return b.getLocalUserProfile()
	case "save-local-user-profile":
		return b.saveLocalUserProfile(params)
	case "list-channels":
		return b.listChannels()
	case "send-command":
		return b.sendCommand(params)
	case "read-office-layout":
		return b.readOfficeLayout()
	case "write-office-layout":
		return b.writeOfficeLayout(params)
	case "read-office-seats":
		return b.readOfficeSeats()
	case "write-office-seats":
		return b.writeOfficeSeats(params)

	// === Cron file reads (5) ===
	case "get-cron-by-id":
		return b.getCronByID(params)
	case "get-cron-runs":
		return b.getCronRuns(params)
	case "get-cron-runs-for-job":
		return b.getCronRunsForJob(params)
	case "get-cron-run-detail":
		return b.getCronRunDetail(params)

	// === Doc operations (9) ===
	case "list-openclaw-memory":
		return b.listOpenClawMemory()
	case "list-openclaw-agent-files":
		return b.listOpenClawAgentFiles()
	case "list-openclaw-docs":
		return b.listOpenClawDocs()
	case "get-openclaw-doc":
		return b.getOpenClawDoc(params)
	case "get-agent-identity-doc":
		return b.getAgentIdentityDoc(params)
	case "write-agent-identity-doc":
		return b.writeAgentIdentityDoc(params)
	case "agentic-stack-status":
		return b.agenticStackStatus(params)
	case "agentic-stack-adapter-list":
		return b.agenticStackAdapterList(params)
	case "agentic-stack-adapter-add":
		return b.agenticStackAdapterAdd(params)
	case "agentic-stack-adapter-remove":
		return b.agenticStackAdapterRemove(params)
	case "agentic-stack-doctor":
		return b.agenticStackDoctor(params)
	case "write-openclaw-doc":
		return b.writeOpenClawDoc(params)
	case "read-openclaw-binary":
		return b.readOpenClawBinary(params)
	case "write-openclaw-binary":
		return b.writeOpenClawBinary(params)
	case "delete-openclaw-doc":
		return b.deleteOpenClawDoc(params)
	case "create-openclaw-folder":
		return b.createOpenClawFolder(params)
	case "search-openclaw-memory-content":
		return b.searchOpenClawMemoryContent(params)
	case "get-openclaw-usage":
		return b.getOpenClawUsage()
	case "openclaw-list-skills":
		return b.openclawListSkills(params)
	case "openclaw-skills-update":
		return b.openclawSkillsUpdate(params)
	case "skills-sh-search":
		return b.skillsShSearch(params)
	case "skills-sh-install":
		return b.skillsShInstall(params)

	// === CLI spawns (11) ===
	case "list-agents":
		return b.listAgents()
	case "get-team":
		return b.getTeam()
	case "add-agent":
		return b.addAgent(params)
	case "delete-agent":
		return b.deleteAgent(params)
	case "get-crons":
		return b.getCrons()
	case "cron-add":
		return b.cronAdd(params)
	case "cron-run":
		return b.cronRun(params)
	case "cron-runs-sync":
		return b.cronRunsSync(params)
	case "cron-edit":
		return b.cronEdit(params)
	case "cron-delete":
		return b.cronDelete(params)
	case "cron-toggle":
		return b.cronToggle(params)
	case "get-running-crons":
		return b.getRunningCrons()
	case "trigger-process-commands":
		return b.triggerProcessCommands()
	case "openclaw-cron-execute":
		return b.openclawCronExecute(params)
	case "openclaw-doctor-fix":
		return b.openClawDoctorFix()
	case "openclaw-security-audit-deep":
		return b.openClawSecurityAuditDeep()
	case "openclaw-status-all":
		return b.openClawStatusAll()
	case "gateway-restart":
		return b.gatewayRestart()

	// === Org Chart (6) — SQLite-backed with JSON fallback ===
	case "read-orgchart":
		return b.readOrgChart()
	case "write-orgchart":
		return b.writeOrgChart(params)
	case "assign-orgchart-task":
		return b.assignOrgChartTask(params)
	case "update-orgchart-task":
		return b.updateOrgChartTask(params)
	case "update-org-node":
		return b.updateOrgNode(params)
	case "get-org-status":
		return b.getOrgStatus()
	case "update-agent-config":
		return b.updateAgentConfig(params)

	// === Intelligence Layer (7) ===
	case "intel-schema":
		return b.intelSchema()
	case "intel-query":
		return b.intelQuery(params)
	case "intel-execute":
		return b.intelExecute(params)
	case "intel-insert":
		return b.intelInsert(params)
	case "intel-update":
		return b.intelUpdate(params)
	case "intel-delete":
		return b.intelDelete(params)

	// === Cron Announces (2) ===
	case "get-cron-announces":
		return b.getCronAnnounces(params)
	case "delete-cron-announces":
		return b.deleteCronAnnounces(params)

	// === Agent Events (2) ===
	case "get-agent-events":
		return b.getAgentEvents(params)
	case "add-agent-event":
		return b.addAgentEvent(params)

	// === Generic KV (app state) (2) ===
	case "save-app-state":
		return b.saveAppState(params)
	case "get-app-state":
		return b.getAppState(params)

	// === Dashboard Layouts (4) ===
	case "save-layout":
		return b.saveDashboardLayout(params)
	case "get-layouts":
		return b.getDashboardLayouts()
	case "update-layout":
		return b.updateDashboardLayout(params)
	case "delete-layout":
		return b.deleteDashboardLayout(params)

	// === Composite (1) ===
	case "get-employee-status":
		return b.getEmployeeStatus()

	// === Credentials (4) ===
	case "credentials:store":
		return b.credentialsStore(params)
	case "credentials:list":
		return b.credentialsList()
	case "credentials:delete":
		return b.credentialsDelete(params)
	case "credentials:apply":
		return b.credentialsApply(params)

	// === Claude Code (5) — send/abort are streaming, handled above ===
	case "claude-code-list-sessions":
		return b.claudeCodeListSessions(params)
	case "claude-code-list-projects":
		return b.claudeCodeListProjects()
	case "claude-code-load-history":
		return b.claudeCodeLoadHistory(params)
	case "claude-code-status":
		return b.claudeCodeStatus()
	case "claude-code-abort":
		return b.claudeCodeAbort(params)
	case "claude-code-unwatch":
		return b.claudeCodeUnwatch(params)

	// === Codex (5) — send is streaming, handled above ===
	case "codex-status":
		return b.codexStatus()
	case "codex-abort":
		return b.codexAbort(params)
	case "codex-list-sessions":
		return b.codexListSessions(params)
	case "codex-load-history":
		return b.codexLoadHistory(params)
	case "codex-list-skills":
		return b.codexListSkills(params)

	// === Hermes Agent ===
	case "hermes-health":
		return b.hermesHealth()
	case "hermes-chat":
		return b.hermesChat(params)
	case "hermes-abort":
		return b.hermesAbort(params)
	case "hermes-sessions":
		return b.hermesSessions(params)
	case "hermes-load-history":
		return b.hermesLoadHistory(params)
	case "list-hermes-profiles":
		return b.listHermesProfiles()
	// Per-profile profile data
	case "hermes-get-soul":
		return b.hermesGetSoul(params)
	case "hermes-update-soul":
		return b.hermesUpdateSoul(params)
	case "hermes-get-profile-config":
		return b.hermesGetProfileConfig(params)
	case "hermes-update-profile-config":
		return b.hermesUpdateProfileConfig(params)
	case "hermes-list-skills":
		return b.hermesListSkills(params)
	case "hermes-get-profile-logs":
		return b.hermesGetProfileLogs(params)

	// === Claude Code project-scoped skills ===
	case "claude-skills-list":
		return b.claudeSkillsList(params)
	case "claude-skill-read":
		return b.claudeSkillRead(params)
	case "claude-skill-write":
		return b.claudeSkillWrite(params)
	case "claude-skill-delete":
		return b.claudeSkillDelete(params)

	// === Device identity (2) ===
	case "sign-connect-challenge":
		return b.signConnectChallenge(params)
	case "get-device-identity":
		return b.getDeviceIdentity()

	// === Unified Runtime Store (6) — SQLite-backed ===
	case "get-all-agents":
		return b.getAllAgents(params)
	case "get-all-crons":
		return b.getAllCrons(params)
	case "get-all-sessions":
		return b.getAllSessions(params)
	case "get-session-messages":
		return b.getSessionMessages(params)
	case "get-runtime-status":
		return b.getRuntimeStatuses()
	case "connector-stability-status":
		return b.connectorStabilityStatus()
	case "connector-health":
		return b.connectorHealth()
	case "get-buildings":
		return b.getBuildings(params)

	// === Agent Runtime Adapter (personality + task execution) ===
	case "hyperclaw-tools-list":
		return b.hyperclawToolList(params)
	case "hyperclaw-tool-call":
		return b.hyperclawToolCall(params)
	case "setup-agent":
		return b.setupAgent(params)
	case "onboarding-provision-workspace":
		return b.onboardingProvisionWorkspace(params)
	case "onboarding-install-runtime":
		return b.onboardingInstallRuntime(params)
	case "onboarding-configure-workspace":
		return b.onboardingConfigureWorkspace(params)
	case "onboarding-provision-agent":
		return b.onboardingProvisionAgent(params)
	case "oauth:store-cli-tokens":
		return b.oauthStoreCliTokens(params)
	case "run-agent-task":
		return b.runAgentTask(params)
	case "agent-send-message":
		return b.sendAgentMessage(params)
	case "get-agent-personality":
		return b.getAgentPersonality(params)
	case "save-agent-personality":
		return b.saveAgentPersonality(params)
	case "save-agent-file":
		return b.saveAgentFileSingle(params)
	case "list-available-runtimes":
		return b.listAvailableRuntimes()

	case "openclaw-config-get":
		return b.openclawConfigGet(params)
	case "openclaw-config-set":
		return b.openclawConfigSet(params)

	case "inbox-list":
		return b.inboxList(params)
	case "inbox-resolve":
		return b.inboxResolve(params)

	// === Agent Cloud Sync reads (5) — SQLite-backed ===
	case "get-agent-identity":
		return b.getAgentIdentity(params)
	case "get-agent-file":
		return b.getAgentFile(params)
	case "get-token-usage":
		return b.getTokenUsage(params)
	case "get-agent-stats":
		return b.getAgentStats(params)
	case "list-agent-identities":
		return b.listAgentIdentities()
	case "get-runtime-sessions":
		return b.getRuntimeSessions(params)
	case "get-primary-session":
		return b.getPrimarySession(params)
	case "set-primary-session":
		return b.setPrimarySession(params)
	case "update-agent-identity":
		return b.updateAgentIdentity(params)

	// === Runtime Cleanup ===
	case "check-orphaned-runtimes":
		return b.checkOrphanedRuntimes()
	case "runtime-cleanup-check":
		return b.runtimeCleanupCheckAction(params)
	case "runtime-cleanup-export":
		return b.runtimeCleanupExportAction(params)
	case "runtime-cleanup-delete":
		return b.runtimeCleanupDeleteAction(params)
	// Legacy OpenClaw-specific actions (for backwards compatibility)
	case "openclaw-cleanup-check":
		return b.openclawCleanupCheck()
	case "openclaw-cleanup-export":
		return b.openclawCleanupExport()
	case "openclaw-cleanup-delete":
		return b.openclawCleanupDelete()

	// === Orphaned Agents (individual workspace detection) ===
	case "check-orphaned-agents":
		return b.checkOrphanedAgents()
	case "delete-orphaned-agent":
		return b.deleteOrphanedAgent(params)
	case "delete-all-orphaned-agents":
		return b.deleteAllOrphanedAgents(params)

	// === Projects ===
	case "project-create":
		return b.projectCreate(params)
	case "project-list":
		return b.projectList(params)
	case "project-get":
		return b.projectGet(params)
	case "project-update":
		return b.projectUpdate(params)
	case "project-delete":
		return b.projectDelete(params)
	case "project-add-member":
		return b.projectAddMember(params)
	case "project-remove-member":
		return b.projectRemoveMember(params)
	case "project-get-members":
		return b.projectGetMembers(params)
	case "project-lead-heartbeat":
		return b.projectLeadHeartbeat(params)
	case "project-task-dispatch":
		return b.projectTaskDispatch(params)
	case "agent-get-projects":
		return b.agentGetProjects(params)
	case "get-team-mode-status":
		return b.getTeamModeStatus()
	case "sync-team-mode":
		return b.syncTeamMode()
	case "workflow-template-list":
		return b.workflowTemplateList(params)
	case "workflow-template-get":
		return b.workflowTemplateGet(params)
	case "workflow-template-create":
		return b.workflowTemplateCreate(params)
	case "workflow-template-update":
		return b.workflowTemplateUpdate(params)
	case "workflow-template-publish":
		return b.workflowTemplatePublish(params)
	case "workflow-template-archive":
		return b.workflowTemplateArchive(params)
	case "workflow-template-delete":
		return b.workflowTemplateDelete(params)
	case "workflow-template-clone":
		return b.workflowTemplateClone(params)
	case "workflow-template-create-from-prompt":
		return b.workflowTemplateCreateFromPrompt(params)
	case "workflow-graph-get":
		return b.workflowGraphGet(params)
	case "workflow-graph-save":
		return b.workflowGraphSave(params)
	case "workflow-graph-publish-template":
		return b.workflowGraphPublishTemplate(params)
	case "workflow-component-list":
		return b.workflowComponentList(params)
	case "workflow-chart-spec-list", "workflow-chart-list":
		return b.workflowChartSpecList(params)
	case "workflow-chart-spec-save":
		return b.workflowChartSpecSave(params)
	case "workflow-draft-list":
		return b.workflowDraftList(params)
	case "workflow-draft-save", "workflow-draft-create":
		return b.workflowDraftSave(params)
	case "workflow-draft-promote":
		return b.workflowDraftPromote(params)
	case "workflow-run-list":
		return b.workflowRunList(params)
	case "workflow-run-get":
		return b.workflowRunGet(params)
	case "workflow-run-start":
		return b.workflowRunStart(params)
	case "workflow-run-resume":
		return b.workflowRunResume(params)
	case "workflow-run-cancel":
		return b.workflowRunCancel(params)
	case "workflow-request-approval":
		return b.workflowRequestApproval(params)
	case "workflow-resolve-approval":
		return b.workflowResolveApproval(params)
	case "workflow-submit-report":
		return b.workflowSubmitReport(params)

	// === Agent last-seen ===
	case "get-agent-last-seen":
		return b.getAgentLastSeen(params)
	case "set-agent-last-seen":
		return b.setAgentLastSeen(params)

	// Agent skills (SQLite-backed, per-agent)
	case "agent-skill-list":
		return b.agentSkillList(params)
	case "agent-skill-add":
		return b.agentSkillAdd(params)
	case "agent-skill-update":
		return b.agentSkillUpdate(params)
	case "agent-skill-toggle":
		return b.agentSkillToggle(params)
	case "agent-skill-delete":
		return b.agentSkillDelete(params)

	// Agent MCP servers (SQLite-backed, per-agent)
	case "agent-mcp-list":
		return b.agentMcpList(params)
	case "agent-mcp-add":
		return b.agentMcpAdd(params)
	case "agent-mcp-update":
		return b.agentMcpUpdate(params)
	case "agent-mcp-toggle":
		return b.agentMcpToggle(params)
	case "agent-mcp-delete":
		return b.agentMcpDelete(params)

	case "room-create":
		return b.roomCreate(params)
	case "room-list":
		return b.roomList(params)
	case "room-delete":
		return b.roomDelete(params)
	case "room-msg-list":
		return b.roomMsgList(params)
	case "room-msg-add":
		return b.roomMsgAdd(params)

	// === Stripe ARR ===
	case "stripe-arr-status":
		return b.stripeArrStatus(params)
	case "stripe-arr-get":
		return b.stripeArrGet(params)
	case "stripe-arr-refresh":
		return b.stripeArrRefresh(params)
	case "stripe-arr-disconnect":
		return b.stripeArrDisconnect(params)
	case "stripe-arr-snapshots-list":
		return b.stripeArrSnapshotsList(params)

	// === Knowledge base ===
	case "knowledge-list":
		return b.knowledgeList(params)
	case "knowledge-get-doc":
		return b.knowledgeGetDoc(params)
	case "knowledge-get-binary":
		return b.knowledgeGetBinary(params)
	case "knowledge-write-doc":
		return b.knowledgeWriteDoc(params)
	case "knowledge-delete-doc":
		return b.knowledgeDeleteDoc(params)
	case "knowledge-create-collection":
		return b.knowledgeCreateCollection(params)
	case "knowledge-delete-collection":
		return b.knowledgeDeleteCollection(params)

	default:
		return errResultStatus(fmt.Sprintf("unknown action: %s", action), 400)
	}
}

func (b *BridgeHandler) sendError(requestID, message string, toHub chan<- []byte) {
	log.Printf("Bridge error: %s", message)
	response := protocol.NewResponse(requestID, protocol.StatusError, map[string]interface{}{
		"error": message,
	})
	data, _ := json.Marshal(response)
	b.trySendToHub(toHub, data, requestID)
}

func (b *BridgeHandler) trySendToHub(toHub chan<- []byte, data []byte, requestID string) {
	defer func() {
		if r := recover(); r != nil {
			if requestID != "" {
				log.Printf("Bridge: toHub channel closed while sending response for %s: %v", requestID, r)
			} else {
				log.Printf("Bridge: toHub channel closed while sending async event: %v", r)
			}
		}
	}()
	if requestID != "" {
		// Action responses MUST NOT be dropped — the dashboard is waiting.
		// Use a blocking send with a generous timeout instead of the non-blocking
		// default case, which silently drops the response when the channel is full.
		select {
		case toHub <- data:
		case <-time.After(30 * time.Second):
			log.Printf("Bridge: toHub channel full for 30s, DROPPING response for %s", requestID)
		}
	} else {
		// Async events (progress, etc.) can be dropped if the channel is full.
		select {
		case toHub <- data:
		default:
		}
	}
}
