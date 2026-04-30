package gateway

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

const maxCronTrackedTextBytes = 512 * 1024

// cronRunState tracks a single in-flight cron run for announce persistence.
type cronRunState struct {
	cronID           string
	agentID          string
	sessionKey       string
	startedAt        time.Time
	chatFinalMsg     string // set by OnChatFinal — the actual final response message
	chatDeltaMsg     string // set by OnChatDelta — full accumulated delta text
	lastToolBoundary int    // length of chatDeltaMsg when the last tool call started
}

// CronAnnounceTracker writes one row per cron run to cron_announces in connector.db.
// On start -> insert with status "running".
// On chat final -> capture the final response message.
// On end -> update to "completed" with final message + duration.
type CronAnnounceTracker struct {
	mu    sync.Mutex
	runs  map[string]*cronRunState // runID -> state
	store *store.Store
}

// cronSessionPattern matches session keys like "agent:{agentId}:cron:{cronId}"
var cronSessionPattern = regexp.MustCompile(`:cron:([^:]+)`)

func NewCronAnnounceTracker(dataStore *store.Store) *CronAnnounceTracker {
	return &CronAnnounceTracker{
		runs:  make(map[string]*cronRunState),
		store: dataStore,
	}
}

// extractCronID returns the cron job ID from a session key, or "" if not a cron session.
func extractCronID(sessionKey string) string {
	m := cronSessionPattern.FindStringSubmatch(sessionKey)
	if len(m) >= 2 {
		return m[1]
	}
	if strings.HasPrefix(sessionKey, "cron:") {
		return strings.TrimPrefix(sessionKey, "cron:")
	}
	return ""
}

// extractAgentID returns the agent ID from a session key like "agent:{id}:..."
func extractAgentIDFromSession(sessionKey string) string {
	if !strings.HasPrefix(sessionKey, "agent:") {
		return ""
	}
	parts := strings.SplitN(sessionKey, ":", 3)
	if len(parts) >= 2 {
		return parts[1]
	}
	return ""
}

// OnStart is called when a cron agent lifecycle event with phase "start" is detected.
func (t *CronAnnounceTracker) OnStart(runID, sessionKey, agentID string) {
	cronID := extractCronID(sessionKey)
	if cronID == "" {
		return
	}
	if agentID == "" {
		agentID = extractAgentIDFromSession(sessionKey)
	}

	t.mu.Lock()
	t.cleanupLocked(time.Now().Add(-time.Hour))
	_, alreadyTracked := t.runs[runID]
	if !alreadyTracked {
		t.runs[runID] = &cronRunState{
			cronID:     cronID,
			agentID:    agentID,
			sessionKey: sessionKey,
			startedAt:  time.Now(),
		}
	}
	t.mu.Unlock()

	if alreadyTracked {
		return
	}

	if t.store == nil {
		return
	}

	// Check if DB already has a row for this run_id (e.g. from before a gateway reconnect).
	// This prevents duplicate "running" rows when the in-memory map was cleared.
	if runID != "" {
		if exists, _ := t.store.CronAnnounceRunExists(runID); exists {
			log.Printf("[DEBUG] CronAnnounce: OnStart skipped (DB row exists) run=%s cron=%s", runID, cronID)
			return
		}
	}

	log.Printf("[DEBUG] CronAnnounce: OnStart run=%s cron=%s session=%s", runID, cronID, sessionKey)
	if _, err := t.store.InsertCronAnnounce(cronID, agentID, sessionKey, "running", "cron", cronID, "", "", runID); err != nil {
		log.Printf("CronAnnounce: failed to insert start: %v", err)
	}
}

// OnChatDelta is called for chat delta events — stores the latest text segment.
// The gateway sends the full accumulated text in each delta. We track the length
// at the last tool call so OnEnd can extract only the final segment (the summary).
func (t *CronAnnounceTracker) OnChatDelta(runID, sessionKey, text string) {
	t.mu.Lock()
	run, ok := t.runs[runID]
	if ok {
		run.chatDeltaMsg = tailString(text, maxCronTrackedTextBytes)
		if run.lastToolBoundary > len(run.chatDeltaMsg) {
			run.lastToolBoundary = 0
		}
	}
	t.mu.Unlock()
}

// OnChatFinal is called when a chat event with state "final" arrives.
// This captures the actual final response message — the text returned to the user.
func (t *CronAnnounceTracker) OnChatFinal(runID, sessionKey, message string) {
	t.mu.Lock()
	run, ok := t.runs[runID]
	if ok {
		run.chatFinalMsg = tailString(message, maxCronTrackedTextBytes)
	}
	t.mu.Unlock()

	if ok {
		log.Printf("[DEBUG] CronAnnounce: OnChatFinal run=%s msgLen=%d", runID, len(message))
	}
}

// OnMessage is called for assistant/tool stream events (kept for DB running-row updates).
func (t *CronAnnounceTracker) OnMessage(runID string, sessionKey string, stream string, message string) {
	cronID := extractCronID(sessionKey)
	if cronID == "" || t.store == nil {
		return
	}

	t.mu.Lock()
	t.cleanupLocked(time.Now().Add(-time.Hour))
	run, ok := t.runs[runID]
	if !ok {
		// Lazily track runs that started before the connector (mid-run join).
		// This ensures OnEnd can finalize them and persist to the DB.
		agentID := extractAgentIDFromSession(sessionKey)
		run = &cronRunState{
			cronID:     cronID,
			agentID:    agentID,
			sessionKey: sessionKey,
			startedAt:  time.Now(),
		}
		t.runs[runID] = run
		// Insert a "running" row if one doesn't already exist for this run.
		if exists, _ := t.store.CronAnnounceRunExists(runID); !exists {
			log.Printf("[DEBUG] CronAnnounce: OnMessage late-join run=%s cron=%s", runID, cronID)
			t.store.InsertCronAnnounce(cronID, agentID, sessionKey, "running", "cron", cronID, "", "", runID)
		}
	}
	// Track tool boundaries so OnEnd can extract only the final text segment
	if stream == "tool" {
		run.lastToolBoundary = len(run.chatDeltaMsg)
	}
	t.mu.Unlock()

	if message == "" {
		return
	}

	// Update DB running row with latest chunk for live preview
	_, _ = t.store.UpdateRunningCronAnnounce(cronID, runID, message, "", "")
}

// OnEnd is called when a cron agent lifecycle event with phase "end" is detected.
func (t *CronAnnounceTracker) OnEnd(runID, sessionKey, agentID string) {
	cronID := extractCronID(sessionKey)
	if cronID == "" {
		return
	}
	if agentID == "" {
		agentID = extractAgentIDFromSession(sessionKey)
	}

	t.mu.Lock()
	run, ok := t.runs[runID]
	if ok {
		delete(t.runs, runID)
	}
	t.mu.Unlock()

	if !ok {
		return
	}

	if t.store == nil {
		return
	}

	durationMs := time.Since(run.startedAt).Milliseconds()

	// Use the chat final message — this is the actual response returned to the user.
	// Fall back to the last text segment (after the last tool call) from accumulated
	// deltas — this is typically the final summary, not the full run narration.
	// Last resort: "Completed".
	finalMsg := strings.TrimSpace(run.chatFinalMsg)
	if finalMsg == "" && run.chatDeltaMsg != "" {
		// Extract only the text after the last tool call boundary
		if run.lastToolBoundary > 0 && run.lastToolBoundary < len(run.chatDeltaMsg) {
			finalMsg = strings.TrimSpace(run.chatDeltaMsg[run.lastToolBoundary:])
		}
		if finalMsg == "" {
			finalMsg = strings.TrimSpace(run.chatDeltaMsg)
		}
	}
	if finalMsg == "" {
		finalMsg = "Completed"
	}

	metadata := fmt.Sprintf(`{"runId":%q,"duration":%d}`, runID, durationMs)

	changes, _ := t.store.UpdateRunningCronAnnounce(cronID, runID, finalMsg, "completed", metadata)
	if changes == 0 {
		if _, err := t.store.InsertCronAnnounce(cronID, agentID, sessionKey, "completed", "cron", cronID, finalMsg, metadata, runID); err != nil {
			log.Printf("CronAnnounce: failed to insert completed: %v", err)
		}
	}

	log.Printf("CronAnnounce: cron %s completed (run %s, %dms, msgLen=%d)", cronID, runID, durationMs, len(finalMsg))
}

// Cleanup removes stale runs older than 1 hour.
func (t *CronAnnounceTracker) Cleanup() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.cleanupLocked(time.Now().Add(-time.Hour))
}

func (t *CronAnnounceTracker) cleanupLocked(cutoff time.Time) {
	for id, run := range t.runs {
		if run.startedAt.Before(cutoff) {
			delete(t.runs, id)
		}
	}
}

func tailString(s string, maxBytes int) string {
	if maxBytes <= 0 || len(s) <= maxBytes {
		return s
	}
	return s[len(s)-maxBytes:]
}
