package gateway

import (
	"log"
	"strings"
	"sync"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// SessionTracker captures chat sessions and messages from gateway events
// into SQLite for the unified runtime store.
type SessionTracker struct {
	store    *store.Store
	mu       sync.Mutex
	sessions map[string]bool // track active sessions to avoid duplicate upserts
}

// NewSessionTracker creates a session tracker that writes to the given store.
func NewSessionTracker(s *store.Store) *SessionTracker {
	return &SessionTracker{
		store:    s,
		sessions: make(map[string]bool),
	}
}

// OnSessionStart creates or updates a session when an agent lifecycle starts.
func (st *SessionTracker) OnSessionStart(sessionKey, agentID, model string) {
	if st.store == nil || sessionKey == "" {
		return
	}

	st.mu.Lock()
	st.sessions[sessionKey] = true
	st.mu.Unlock()

	err := st.store.UpsertSession(store.Session{
		ID:      sessionKey,
		Runtime: "openclaw",
		AgentID: agentID,
		Model:   model,
		Status:  "active",
	})
	if err != nil {
		log.Printf("SessionTracker: failed to upsert session %s: %v", sessionKey, err)
	}
}

// OnSessionEnd marks a session as completed.
func (st *SessionTracker) OnSessionEnd(sessionKey string) {
	if st.store == nil || sessionKey == "" {
		return
	}

	st.mu.Lock()
	delete(st.sessions, sessionKey)
	st.mu.Unlock()

	st.store.UpdateSessionStatus(sessionKey, "completed")
}

// OnMessage captures a message into the session.
func (st *SessionTracker) OnMessage(sessionKey, role, content string) {
	if st.store == nil || sessionKey == "" || content == "" {
		return
	}

	// Ensure the session exists
	st.mu.Lock()
	if !st.sessions[sessionKey] {
		st.sessions[sessionKey] = true
		st.mu.Unlock()
		// Create session on first message if it wasn't started via lifecycle event
		st.store.UpsertSession(store.Session{
			ID:      sessionKey,
			Runtime: "openclaw",
			Status:  "active",
		})
	} else {
		st.mu.Unlock()
	}

	err := st.store.AddMessage(sessionKey, role, content, "{}")
	if err != nil {
		log.Printf("SessionTracker: failed to add message to session %s: %v", sessionKey, err)
	}
}

// extractAgentFromSessionKey extracts agent ID from session key patterns like
// "agent:clio:cron:abc123" or "agent:main:chat:xyz"
func extractAgentFromSessionKey(sessionKey string) string {
	if strings.HasPrefix(sessionKey, "agent:") {
		parts := strings.SplitN(sessionKey, ":", 3)
		if len(parts) >= 2 {
			return parts[1]
		}
	}
	return ""
}
