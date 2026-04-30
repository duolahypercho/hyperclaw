package store

import (
	"encoding/json"
	"time"
)

// AddAgentEvent inserts an agent lifecycle event and returns the new row ID.
func (s *Store) AddAgentEvent(agentID, runID, sessionKey, eventType, status string, data interface{}) (int64, error) {
	now := time.Now().UnixMilli()
	var dataStr string
	if data != nil {
		b, _ := json.Marshal(data)
		dataStr = string(b)
	} else {
		dataStr = "{}"
	}

	result, err := s.db.Exec(
		`INSERT INTO agent_events (agent_id, run_id, session_key, event_type, status, data, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		agentID, runID, sessionKey, eventType, status, dataStr, now,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// GetAgentEvents returns the most recent events for a specific agent, newest first.
func (s *Store) GetAgentEvents(agentID string, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(
		`SELECT id, agent_id, COALESCE(run_id, ''), COALESCE(session_key, ''), event_type, COALESCE(status, ''), data, created_at
		 FROM agent_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`,
		agentID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanAgentEvents(rows)
}

// GetAllAgentEvents returns the most recent agent events across all agents, newest first.
func (s *Store) GetAllAgentEvents(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(
		`SELECT id, agent_id, COALESCE(run_id, ''), COALESCE(session_key, ''), event_type, COALESCE(status, ''), data, created_at
		 FROM agent_events ORDER BY created_at DESC LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanAgentEvents(rows)
}

// CleanupOldAgentEvents removes agent events older than the given duration.
func (s *Store) CleanupOldAgentEvents(maxAge time.Duration) (int64, error) {
	cutoff := time.Now().Add(-maxAge).UnixMilli()
	result, err := s.db.Exec(`DELETE FROM agent_events WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// DeleteAgentEventsByAgent removes all events for a specific agent.
func (s *Store) DeleteAgentEventsByAgent(agentID string) error {
	_, err := s.db.Exec(`DELETE FROM agent_events WHERE agent_id = ?`, agentID)
	return err
}

// scanAgentEvents scans rows from an agent_events query into a slice of maps.
func scanAgentEvents(rows interface{ Next() bool; Scan(...interface{}) error }) ([]map[string]interface{}, error) {
	var events []map[string]interface{}
	for rows.Next() {
		var id, createdAt int64
		var agentID, runID, sessionKey, eventType, status, dataStr string
		if err := rows.Scan(&id, &agentID, &runID, &sessionKey, &eventType, &status, &dataStr, &createdAt); err != nil {
			continue
		}

		event := map[string]interface{}{
			"id":         id,
			"agentId":    agentID,
			"runId":      runID,
			"sessionKey": sessionKey,
			"eventType":  eventType,
			"status":     status,
			"createdAt":  createdAt,
		}

		// Parse data back into object
		var data interface{}
		if err := json.Unmarshal([]byte(dataStr), &data); err == nil {
			event["data"] = data
		} else {
			event["data"] = map[string]interface{}{}
		}

		events = append(events, event)
	}
	if events == nil {
		events = []map[string]interface{}{}
	}
	return events, nil
}
