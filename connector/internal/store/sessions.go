package store

import (
	"database/sql"
	"strings"
	"time"
)

// Session represents a chat session from any runtime.
type Session struct {
	ID        string `json:"id"`
	Runtime   string `json:"runtime"`
	AgentID   string `json:"agentId,omitempty"`
	Model     string `json:"model,omitempty"`
	Status    string `json:"status"`
	StartedAt int64  `json:"startedAt"`
	UpdatedAt int64  `json:"updatedAt"`
	CWD       string `json:"cwd,omitempty"`
}

// Message represents a chat message within a session.
type Message struct {
	ID        int64  `json:"id"`
	SessionID string `json:"sessionId"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Metadata  string `json:"metadata,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

// UpsertSession creates or updates a session.
// CWD is only written on INSERT (or when UPDATE target has empty cwd) to avoid
// clobbering a previously-recorded project path.
func (s *Store) UpsertSession(sess Session) error {
	now := time.Now().UnixMilli()
	if sess.StartedAt == 0 {
		sess.StartedAt = now
	}
	if sess.Status == "" {
		sess.Status = "active"
	}

	_, err := s.db.Exec(`
		INSERT INTO sessions (id, runtime, agent_id, model, status, started_at, updated_at, cwd)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			model      = excluded.model,
			status     = excluded.status,
			updated_at = excluded.updated_at,
			cwd        = CASE WHEN sessions.cwd = '' THEN excluded.cwd ELSE sessions.cwd END
	`, sess.ID, sess.Runtime, sess.AgentID, sess.Model, sess.Status, sess.StartedAt, now, sess.CWD)
	return err
}

// AddMessage inserts a message into a session.
func (s *Store) AddMessage(sessionID, role, content, metadata string) error {
	now := time.Now().UnixMilli()
	if metadata == "" {
		metadata = "{}"
	}

	_, err := s.db.Exec(`
		INSERT INTO messages (session_id, role, content, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, sessionID, role, content, metadata, now)
	if err != nil {
		return err
	}

	// Update session's updated_at
	_, err = s.db.Exec(`UPDATE sessions SET updated_at = ? WHERE id = ?`, now, sessionID)
	return err
}

// GetSessions returns sessions, optionally filtered by runtime.
func (s *Store) GetSessions(runtime string, limit int) ([]Session, error) {
	if limit <= 0 {
		limit = 50
	}

	var rows *sql.Rows
	var err error

	if runtime != "" {
		rows, err = s.db.Query(`
			SELECT id, runtime, agent_id, model, status, started_at, updated_at, cwd
			FROM sessions WHERE runtime = ?
			ORDER BY updated_at DESC LIMIT ?
		`, runtime, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT id, runtime, agent_id, model, status, started_at, updated_at, cwd
			FROM sessions ORDER BY updated_at DESC LIMIT ?
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var sess Session
		if err := rows.Scan(&sess.ID, &sess.Runtime, &sess.AgentID, &sess.Model, &sess.Status, &sess.StartedAt, &sess.UpdatedAt, &sess.CWD); err != nil {
			continue
		}
		sessions = append(sessions, sess)
	}
	if sessions == nil {
		sessions = []Session{}
	}
	return sessions, nil
}

// GetSessionMessages returns messages for a session, ordered by creation time.
func (s *Store) GetSessionMessages(sessionID string, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 200
	}

	rows, err := s.db.Query(`
		SELECT id, session_id, role, content, metadata, created_at
		FROM messages WHERE session_id = ?
		ORDER BY created_at ASC LIMIT ?
	`, sessionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.Metadata, &m.CreatedAt); err != nil {
			continue
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []Message{}
	}
	return messages, nil
}

// GetSessionByID returns a single session.
func (s *Store) GetSessionByID(id string) (*Session, error) {
	var sess Session
	err := s.db.QueryRow(`
		SELECT id, runtime, agent_id, model, status, started_at, updated_at, cwd
		FROM sessions WHERE id = ?
	`, id).Scan(&sess.ID, &sess.Runtime, &sess.AgentID, &sess.Model, &sess.Status, &sess.StartedAt, &sess.UpdatedAt, &sess.CWD)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &sess, nil
}

// UpdateSessionStatus updates the status of a session.
func (s *Store) UpdateSessionStatus(id, status string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`, status, now, id)
	return err
}

// GetSessionsByAgent returns sessions filtered by runtime and agent_id. When
// projectPath is non-empty, only sessions with a matching cwd OR an empty cwd
// (pre-migration / not yet backfilled) are returned — callers should backfill
// and re-filter empty-cwd rows as needed.
func (s *Store) GetSessionsByAgent(runtime, agentID, projectPath string, limit int) ([]Session, error) {
	if limit <= 0 {
		limit = 50
	}
	var (
		rows *sql.Rows
		err  error
	)
	if projectPath != "" {
		rows, err = s.db.Query(`
			SELECT id, runtime, agent_id, model, status, started_at, updated_at, cwd
			FROM sessions
			WHERE runtime = ? AND agent_id = ? AND (cwd = ? OR cwd = '' OR cwd IS NULL)
			ORDER BY updated_at DESC LIMIT ?
		`, runtime, agentID, projectPath, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT id, runtime, agent_id, model, status, started_at, updated_at, cwd
			FROM sessions WHERE runtime = ? AND agent_id = ?
			ORDER BY updated_at DESC LIMIT ?
		`, runtime, agentID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var sess Session
		if err := rows.Scan(&sess.ID, &sess.Runtime, &sess.AgentID, &sess.Model, &sess.Status, &sess.StartedAt, &sess.UpdatedAt, &sess.CWD); err != nil {
			continue
		}
		sessions = append(sessions, sess)
	}
	if sessions == nil {
		sessions = []Session{}
	}
	return sessions, nil
}

// GetSessionStatusMap returns a map of session id → status for the given ids.
// Missing ids are simply absent from the map.
func (s *Store) GetSessionStatusMap(ids []string) map[string]string {
	if len(ids) == 0 {
		return map[string]string{}
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	query := `SELECT id, status FROM sessions WHERE id IN (` + strings.Join(placeholders, ",") + `)`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return map[string]string{}
	}
	defer rows.Close()
	result := make(map[string]string, len(ids))
	for rows.Next() {
		var id, status string
		if err := rows.Scan(&id, &status); err == nil {
			result[id] = status
		}
	}
	return result
}

// GetPrimarySession returns the designated primary session key for an agent,
// or an empty string if none has been set.
func (s *Store) GetPrimarySession(agentID, runtime string) (string, error) {
	var key string
	err := s.db.QueryRow(
		`SELECT session_key FROM agent_primary_sessions WHERE agent_id = ? AND runtime = ?`,
		agentID, runtime,
	).Scan(&key)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return key, nil
}

// SetPrimarySession designates a session key as the primary session for an agent+runtime pair.
func (s *Store) SetPrimarySession(agentID, runtime, sessionKey string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`
		INSERT INTO agent_primary_sessions (agent_id, runtime, session_key, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(agent_id, runtime) DO UPDATE SET
			session_key = excluded.session_key,
			updated_at  = excluded.updated_at
	`, agentID, runtime, sessionKey, now)
	return err
}

// ClearPrimarySession removes the primary session pointer for an agent.
func (s *Store) ClearPrimarySession(agentID string) error {
	_, err := s.db.Exec(`DELETE FROM agent_primary_sessions WHERE agent_id = ?`, agentID)
	return err
}

// ClearPrimarySessionForRuntime removes the primary session pointer for one agent/runtime pair.
func (s *Store) ClearPrimarySessionForRuntime(agentID, runtime string) error {
	_, err := s.db.Exec(`DELETE FROM agent_primary_sessions WHERE agent_id = ? AND runtime = ?`, agentID, runtime)
	return err
}

// DeleteSessionsByAgent removes all sessions and their messages for an agent.
func (s *Store) DeleteSessionsByAgent(agentID string) error {
	// First get all session IDs for this agent
	rows, err := s.db.Query(`SELECT id FROM sessions WHERE agent_id = ?`, agentID)
	if err != nil {
		return err
	}
	var sessionIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			sessionIDs = append(sessionIDs, id)
		}
	}
	rows.Close()

	// Delete messages for each session
	for _, sid := range sessionIDs {
		_, _ = s.db.Exec(`DELETE FROM messages WHERE session_id = ?`, sid)
	}

	// Delete the sessions themselves
	_, err = s.db.Exec(`DELETE FROM sessions WHERE agent_id = ?`, agentID)
	return err
}
