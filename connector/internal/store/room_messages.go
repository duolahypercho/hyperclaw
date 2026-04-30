package store

import (
	"fmt"
	"math/rand"
	"time"
)

// RoomMessage is one entry in a shared room conversation thread.
type RoomMessage struct {
	ID        string `json:"id"`
	RoomID    string `json:"roomId"`
	Role      string `json:"role"`      // "user" | "assistant"
	AgentID   string `json:"agentId"`   // empty for user messages
	AgentName string `json:"agentName"` // empty for user messages
	Runtime   string `json:"runtime"`   // empty for user messages
	Content   string `json:"content"`
	CreatedAt int64  `json:"createdAt"`
}

func newMsgID() string {
	return fmt.Sprintf("%x%x", time.Now().UnixNano(), rand.Int63())
}

// AddRoomMessage inserts a message into the room thread.
// If msg.ID is empty a new ID is generated.
func (s *Store) AddRoomMessage(msg RoomMessage) (*RoomMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if msg.ID == "" {
		msg.ID = newMsgID()
	}
	if msg.CreatedAt == 0 {
		msg.CreatedAt = time.Now().UnixMilli()
	}

	_, err := s.db.Exec(
		`INSERT INTO room_messages
		 (id, room_id, role, agent_id, agent_name, runtime, content, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		msg.ID, msg.RoomID, msg.Role,
		msg.AgentID, msg.AgentName, msg.Runtime,
		msg.Content, msg.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

// ListRoomMessages returns the last `limit` messages for a room, oldest first.
func (s *Store) ListRoomMessages(roomID string, limit int) ([]RoomMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}

	// Fetch the N most recent, then reverse so oldest comes first.
	rows, err := s.db.Query(`
		SELECT id, room_id, role, agent_id, agent_name, runtime, content, created_at
		FROM room_messages
		WHERE room_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`, roomID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reversed []RoomMessage
	for rows.Next() {
		var m RoomMessage
		if err := rows.Scan(
			&m.ID, &m.RoomID, &m.Role,
			&m.AgentID, &m.AgentName, &m.Runtime,
			&m.Content, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		reversed = append(reversed, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Reverse to chronological order.
	for i, j := 0, len(reversed)-1; i < j; i, j = i+1, j-1 {
		reversed[i], reversed[j] = reversed[j], reversed[i]
	}
	if reversed == nil {
		reversed = []RoomMessage{}
	}
	return reversed, nil
}
