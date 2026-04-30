package store

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// AgentLastSeen tracks the last time the user viewed an agent's messages.
type AgentLastSeen struct {
	AgentID string `json:"agentId"`
	Ts      int64  `json:"ts"`      // unix ms when the user last clicked the agent row
	MsgText string `json:"msgText"` // text of the last message they saw
}

// SetAgentLastSeen upserts the last-seen record for one agent.
func (s *Store) SetAgentLastSeen(agentID string, ts int64, msgText string) error {
	if ts == 0 {
		ts = time.Now().UnixMilli()
	}
	_, err := s.db.Exec(`
		INSERT INTO agent_last_seen (agent_id, ts, msg_text)
		VALUES (?, ?, ?)
		ON CONFLICT(agent_id) DO UPDATE SET
			ts       = excluded.ts,
			msg_text = excluded.msg_text
	`, agentID, ts, msgText)
	return err
}

// GetAgentLastSeenBatch returns last-seen records for multiple agents at once.
// Agents with no record are omitted from the result map.
func (s *Store) GetAgentLastSeenBatch(agentIDs []string) (map[string]*AgentLastSeen, error) {
	if len(agentIDs) == 0 {
		return map[string]*AgentLastSeen{}, nil
	}

	placeholders := make([]string, len(agentIDs))
	args := make([]interface{}, len(agentIDs))
	for i, id := range agentIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(
		`SELECT agent_id, ts, msg_text FROM agent_last_seen WHERE agent_id IN (%s)`,
		strings.Join(placeholders, ","),
	)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]*AgentLastSeen, len(agentIDs))
	for rows.Next() {
		var r AgentLastSeen
		var msgText sql.NullString
		if err := rows.Scan(&r.AgentID, &r.Ts, &msgText); err != nil {
			return nil, err
		}
		r.MsgText = msgText.String
		out[r.AgentID] = &r
	}
	return out, rows.Err()
}

// DeleteAgentLastSeen removes the last-seen record for an agent.
func (s *Store) DeleteAgentLastSeen(agentID string) error {
	_, err := s.db.Exec(`DELETE FROM agent_last_seen WHERE agent_id = ?`, agentID)
	return err
}
