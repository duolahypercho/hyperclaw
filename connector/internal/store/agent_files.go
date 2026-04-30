package store

import (
	"database/sql"
	"time"
)

// AgentFile holds the content of one personality/config file for an agent.
type AgentFile struct {
	AgentID     string `json:"agentId"`
	FileKey     string `json:"fileKey"`
	Content     string `json:"content"`
	ContentHash string `json:"contentHash"`
	UpdatedAt   int64  `json:"updatedAt"`
}

// UpsertAgentFile inserts or replaces a file content row.
func (s *Store) UpsertAgentFile(agentID, fileKey, content, hash string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`
		INSERT INTO agent_files (agent_id, file_key, content, content_hash, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(agent_id, file_key) DO UPDATE SET
			content      = excluded.content,
			content_hash = excluded.content_hash,
			updated_at   = excluded.updated_at
	`, agentID, fileKey, content, hash, now)
	return err
}

// GetAgentFile returns the file row for an agent + key, or nil if missing.
func (s *Store) GetAgentFile(agentID, fileKey string) (*AgentFile, error) {
	var f AgentFile
	err := s.db.QueryRow(`
		SELECT agent_id, file_key, content, content_hash, updated_at
		FROM agent_files WHERE agent_id = ? AND file_key = ?
	`, agentID, fileKey).Scan(&f.AgentID, &f.FileKey, &f.Content, &f.ContentHash, &f.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// GetAgentFileHash returns the stored hash for an agent+key, or "" if not found.
func (s *Store) GetAgentFileHash(agentID, fileKey string) (string, error) {
	var hash string
	err := s.db.QueryRow(`
		SELECT content_hash FROM agent_files WHERE agent_id = ? AND file_key = ?
	`, agentID, fileKey).Scan(&hash)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return hash, err
}

// DeleteAgentFiles removes all file rows for an agent.
func (s *Store) DeleteAgentFiles(agentID string) error {
	_, err := s.db.Exec(`DELETE FROM agent_files WHERE agent_id = ?`, agentID)
	return err
}

// GetAgentFiles returns all file rows for an agent.
func (s *Store) GetAgentFiles(agentID string) ([]AgentFile, error) {
	rows, err := s.db.Query(`
		SELECT agent_id, file_key, content, content_hash, updated_at
		FROM agent_files WHERE agent_id = ?
	`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []AgentFile
	for rows.Next() {
		var f AgentFile
		if err := rows.Scan(&f.AgentID, &f.FileKey, &f.Content, &f.ContentHash, &f.UpdatedAt); err != nil {
			continue
		}
		files = append(files, f)
	}
	return files, nil
}
