package store

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"time"
)

// Room represents an ensemble chat room stored locally.
type Room struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Emoji     string   `json:"emoji"`
	MemberIDs []string `json:"memberIds"`
	CreatedAt int64    `json:"createdAt"`
}

func newRoomID() string {
	return fmt.Sprintf("%x%x", time.Now().UnixNano(), rand.Int63())
}

// CreateRoom inserts a new ensemble room.
func (s *Store) CreateRoom(id, name, emoji string, memberIDs []string) (*Room, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	if id == "" {
		id = newRoomID()
	}
	if emoji == "" {
		emoji = "💬"
	}
	if memberIDs == nil {
		memberIDs = []string{}
	}

	members, err := json.Marshal(memberIDs)
	if err != nil {
		return nil, err
	}

	createdAt := time.Now().UnixMilli()
	_, err = s.db.Exec(
		`INSERT INTO ensemble_rooms (id, name, emoji, member_ids, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, name, emoji, string(members), createdAt,
	)
	if err != nil {
		return nil, err
	}

	return &Room{ID: id, Name: name, Emoji: emoji, MemberIDs: memberIDs, CreatedAt: createdAt}, nil
}

// ListRooms returns all rooms ordered by creation time ascending.
func (s *Store) ListRooms() ([]Room, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		`SELECT id, name, emoji, member_ids, created_at FROM ensemble_rooms ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []Room
	for rows.Next() {
		var r Room
		var membersJSON string
		if err := rows.Scan(&r.ID, &r.Name, &r.Emoji, &membersJSON, &r.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(membersJSON), &r.MemberIDs); err != nil {
			r.MemberIDs = []string{}
		}
		rooms = append(rooms, r)
	}
	if rooms == nil {
		rooms = []Room{}
	}
	return rooms, rows.Err()
}

// DeleteRoom removes a room by ID.
func (s *Store) DeleteRoom(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM ensemble_rooms WHERE id = ?`, id)
	return err
}
