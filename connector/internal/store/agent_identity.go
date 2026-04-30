package store

import (
	"database/sql"
	"time"
)

// AgentIdentity holds the display identity for an agent.
type AgentIdentity struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	AvatarData string `json:"avatarData"` // base64 data URI or empty
	Emoji      string `json:"emoji"`
	Runtime    string `json:"runtime"`
	Role       string `json:"role,omitempty"` // joined from agents.role (description)
	UpdatedAt  int64  `json:"updatedAt"`
}

// UpsertAgentIdentity inserts or updates an agent identity row.
// Runtime is immutable once set because the agent may already have an active runtime session.
func (s *Store) UpsertAgentIdentity(id AgentIdentity) error {
	now := time.Now().UnixMilli()
	// Preserve existing values if the new value is empty — prevents file sync
	// from wiping out avatars/emojis set via the UI when IDENTITY.md lacks them.
	_, err := s.db.Exec(`
		INSERT INTO agent_identity (id, name, avatar_data, emoji, runtime, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name        = CASE WHEN excluded.name != '' THEN excluded.name ELSE agent_identity.name END,
			avatar_data = CASE WHEN excluded.avatar_data != '' THEN excluded.avatar_data ELSE agent_identity.avatar_data END,
			emoji       = CASE WHEN excluded.emoji != '' THEN excluded.emoji ELSE agent_identity.emoji END,
			runtime     = CASE WHEN agent_identity.runtime != '' THEN agent_identity.runtime ELSE excluded.runtime END,
			updated_at  = excluded.updated_at
	`, id.ID, id.Name, id.AvatarData, id.Emoji, id.Runtime, now)
	if err != nil {
		return err
	}
	return s.EnsureInitialProject()
}

// GetAgentIdentity returns the identity for an agent, or nil if not found.
// Joins the agents table to include the role/description field.
func (s *Store) GetAgentIdentity(agentID string) (*AgentIdentity, error) {
	var id AgentIdentity
	var role sql.NullString
	err := s.db.QueryRow(`
		SELECT i.id, i.name, i.avatar_data, i.emoji, i.runtime, i.updated_at,
		       COALESCE(a.role, '') AS role
		FROM agent_identity i
		LEFT JOIN agents a ON a.id = i.id
		WHERE i.id = ?
	`, agentID).Scan(&id.ID, &id.Name, &id.AvatarData, &id.Emoji, &id.Runtime, &id.UpdatedAt, &role)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	id.Role = role.String
	return &id, nil
}

// DeleteAgentIdentity removes an agent's identity row.
func (s *Store) DeleteAgentIdentity(agentID string) error {
	_, err := s.db.Exec(`DELETE FROM agent_identity WHERE id = ?`, agentID)
	return err
}

// ListAgentIdentities returns all known agent identities ordered by name.
// This covers every runtime whose IDENTITY.md has been synced to SQLite
// (openclaw, claude-code, codex, hermes, hyperclaw).
func (s *Store) ListAgentIdentities() ([]AgentIdentity, error) {
	rows, err := s.db.Query(`
		SELECT i.id, i.name, i.avatar_data, i.emoji, i.runtime, i.updated_at,
		       COALESCE(a.role, '') AS role
		FROM agent_identity i
		LEFT JOIN agents a ON a.id = i.id
		ORDER BY i.name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []AgentIdentity
	for rows.Next() {
		var id AgentIdentity
		var role sql.NullString
		if err := rows.Scan(&id.ID, &id.Name, &id.AvatarData, &id.Emoji, &id.Runtime, &id.UpdatedAt, &role); err != nil {
			continue
		}
		id.Role = role.String
		result = append(result, id)
	}
	if result == nil {
		result = []AgentIdentity{}
	}
	return result, nil
}
