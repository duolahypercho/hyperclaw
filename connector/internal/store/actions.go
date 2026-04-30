package store

import (
	"encoding/json"
	"time"
)

// Action represents a tracked bridge action or agent activity.
type Action struct {
	ID         int64  `json:"id"`
	ActionType string `json:"actionType"`
	AgentID    string `json:"agentId,omitempty"`
	Status     string `json:"status"` // pending, running, completed, error
	Request    string `json:"request,omitempty"`
	Response   string `json:"response,omitempty"`
	ErrorMsg   string `json:"errorMsg,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	CreatedAt  int64  `json:"createdAt"`
	UpdatedAt  int64  `json:"updatedAt"`
}

// RecordAction inserts a new action log entry and returns its ID.
func (s *Store) RecordAction(actionType, agentID, status string, request interface{}) (int64, error) {
	now := time.Now().UnixMilli()
	var reqStr string
	if request != nil {
		b, _ := json.Marshal(request)
		reqStr = string(b)
	}

	var agentPtr *string
	if agentID != "" {
		agentPtr = &agentID
	}

	result, err := s.db.Exec(
		`INSERT INTO actions (action_type, agent_id, status, request, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		actionType, agentPtr, status, reqStr, now, now,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// UpdateAction updates the status, response, error, and duration of an action.
func (s *Store) UpdateAction(id int64, status string, response interface{}, errorMsg string, durationMs int64) error {
	now := time.Now().UnixMilli()
	var respStr *string
	if response != nil {
		b, _ := json.Marshal(response)
		s := string(b)
		respStr = &s
	}

	var errPtr *string
	if errorMsg != "" {
		errPtr = &errorMsg
	}

	_, err := s.db.Exec(
		`UPDATE actions SET status = ?, response = ?, error_msg = ?, duration_ms = ?, updated_at = ?
		 WHERE id = ?`,
		status, respStr, errPtr, durationMs, now, id,
	)
	return err
}

// GetRecentActions returns the most recent N actions, newest first.
func (s *Store) GetRecentActions(limit int) ([]Action, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(
		`SELECT id, action_type, COALESCE(agent_id, ''), status,
		        COALESCE(request, ''), COALESCE(response, ''), COALESCE(error_msg, ''),
		        COALESCE(duration_ms, 0), created_at, updated_at
		 FROM actions ORDER BY created_at DESC LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var actions []Action
	for rows.Next() {
		var a Action
		if err := rows.Scan(
			&a.ID, &a.ActionType, &a.AgentID, &a.Status,
			&a.Request, &a.Response, &a.ErrorMsg,
			&a.DurationMs, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			continue
		}
		actions = append(actions, a)
	}
	if actions == nil {
		actions = []Action{}
	}
	return actions, nil
}

// GetActionsByAgent returns recent actions for a specific agent.
func (s *Store) GetActionsByAgent(agentID string, limit int) ([]Action, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(
		`SELECT id, action_type, COALESCE(agent_id, ''), status,
		        COALESCE(request, ''), COALESCE(response, ''), COALESCE(error_msg, ''),
		        COALESCE(duration_ms, 0), created_at, updated_at
		 FROM actions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`,
		agentID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var actions []Action
	for rows.Next() {
		var a Action
		if err := rows.Scan(
			&a.ID, &a.ActionType, &a.AgentID, &a.Status,
			&a.Request, &a.Response, &a.ErrorMsg,
			&a.DurationMs, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			continue
		}
		actions = append(actions, a)
	}
	if actions == nil {
		actions = []Action{}
	}
	return actions, nil
}

// CleanupOldActions removes actions older than the given duration.
func (s *Store) CleanupOldActions(maxAge time.Duration) (int64, error) {
	cutoff := time.Now().Add(-maxAge).UnixMilli()
	result, err := s.db.Exec(`DELETE FROM actions WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
