package gateway

import (
	"encoding/json"
	"sync"
	"time"
)

const maxNotificationSummaryBytes = 8 * 1024

// NotificationTracker tracks active agent runs and generates notifications
// when long-running tasks complete (duration exceeds threshold).
type NotificationTracker struct {
	mu        sync.Mutex
	runs      map[string]runInfo // runId -> info
	threshold time.Duration      // minimum duration to trigger notification (default 30s)
}

type runInfo struct {
	sessionKey string
	agentID    string
	startedAt  time.Time
	lastMsg    string
}

func NewNotificationTracker(threshold time.Duration) *NotificationTracker {
	return &NotificationTracker{
		runs:      make(map[string]runInfo),
		threshold: threshold,
	}
}

// OnMessage updates the latest message content for a tracked run.
func (t *NotificationTracker) OnMessage(runID, message string) {
	if message == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if info, ok := t.runs[runID]; ok {
		info.lastMsg = tailString(message, maxNotificationSummaryBytes)
		t.runs[runID] = info
	}
}

// OnLifecycleEvent processes agent lifecycle events and returns a notification
// payload if a long-running task just completed. Returns nil otherwise.
func (t *NotificationTracker) OnLifecycleEvent(runID, sessionKey, agentID, phase string) json.RawMessage {
	t.mu.Lock()
	defer t.mu.Unlock()

	switch phase {
	case "start":
		t.runs[runID] = runInfo{
			sessionKey: sessionKey,
			agentID:    agentID,
			startedAt:  time.Now(),
		}
		return nil

	case "end":
		info, ok := t.runs[runID]
		if !ok {
			return nil
		}
		delete(t.runs, runID)

		duration := time.Since(info.startedAt)
		if duration < t.threshold {
			return nil // too short, skip notification
		}

		summary := "Agent task completed"
		if info.lastMsg != "" {
			summary = info.lastMsg
		}

		notification := map[string]interface{}{
			"kind":       "agent_completed",
			"sessionKey": info.sessionKey,
			"agentId":    info.agentID,
			"runId":      runID,
			"duration":   duration.Milliseconds(),
			"timestamp":  time.Now().UnixMilli(),
			"summary":    summary,
		}
		data, _ := json.Marshal(notification)
		return data
	}

	// Clean up stale runs (>1 hour old)
	cutoff := time.Now().Add(-time.Hour)
	for id, info := range t.runs {
		if info.startedAt.Before(cutoff) {
			delete(t.runs, id)
		}
	}

	return nil
}
