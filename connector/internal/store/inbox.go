package store

import "time"

type InboxItem struct {
	ID             int64                  `json:"id"`
	AgentID        string                 `json:"agentId"`
	Kind           string                 `json:"kind"`
	Title          string                 `json:"title"`
	Body           string                 `json:"body,omitempty"`
	Context        map[string]interface{} `json:"context,omitempty"`
	TaskID         string                 `json:"taskId,omitempty"`
	Status         string                 `json:"status"`
	ResolutionNote string                 `json:"resolutionNote,omitempty"`
	CreatedAt      int64                  `json:"createdAt"`
	UpdatedAt      int64                  `json:"updatedAt"`
	ResolvedAt     *int64                 `json:"resolvedAt,omitempty"`
}

func (s *Store) CreateInboxItem(agentID, kind, title, body string, context map[string]interface{}, taskID string) (*InboxItem, error) {
	now := time.Now().UnixMilli()
	if kind == "" {
		kind = "approval"
	}
	result, err := s.db.Exec(`
		INSERT INTO inbox_items
		(agent_id, kind, title, body, context_json, task_id, status, resolution_note, created_at, updated_at, resolved_at)
		VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?, ?, NULL)
	`, agentID, kind, title, body, mustJSON(context), taskID, now, now)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return &InboxItem{
		ID:        id,
		AgentID:   agentID,
		Kind:      kind,
		Title:     title,
		Body:      body,
		Context:   context,
		TaskID:    taskID,
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}
