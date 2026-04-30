package store

import (
	"encoding/json"
	"time"
)

// AddEvent inserts an event record.
func (s *Store) AddEvent(eventType string, data interface{}) error {
	now := time.Now().UnixMilli()
	var dataStr string
	if data != nil {
		b, _ := json.Marshal(data)
		dataStr = string(b)
	} else {
		dataStr = "{}"
	}

	_, err := s.db.Exec(
		`INSERT INTO events (type, data, created_at) VALUES (?, ?, ?)`,
		eventType, dataStr, now,
	)
	return err
}

// GetRecentEvents returns the most recent N events, newest first.
func (s *Store) GetRecentEvents(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(
		`SELECT id, COALESCE(type, ''), data, created_at
		 FROM events ORDER BY created_at DESC LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []map[string]interface{}
	for rows.Next() {
		var id int64
		var eventType, dataStr string
		var createdAt int64
		if err := rows.Scan(&id, &eventType, &dataStr, &createdAt); err != nil {
			continue
		}

		event := map[string]interface{}{
			"id":        id,
			"type":      eventType,
			"timestamp": time.Unix(0, createdAt*int64(time.Millisecond)).UTC().Format(time.RFC3339Nano),
		}

		// Parse data back into object
		var data interface{}
		if err := json.Unmarshal([]byte(dataStr), &data); err == nil {
			// Merge data fields into event
			if obj, ok := data.(map[string]interface{}); ok {
				for k, v := range obj {
					if k != "id" && k != "type" && k != "timestamp" {
						event[k] = v
					}
				}
			} else {
				event["data"] = data
			}
		}

		events = append(events, event)
	}
	if events == nil {
		events = []map[string]interface{}{}
	}
	return events, nil
}

// AddCommand inserts a command record.
func (s *Store) AddCommand(cmdType string, data interface{}) (int64, error) {
	now := time.Now().UnixMilli()
	var dataStr string
	if data != nil {
		b, _ := json.Marshal(data)
		dataStr = string(b)
	} else {
		dataStr = "{}"
	}

	result, err := s.db.Exec(
		`INSERT INTO commands (type, data, created_at) VALUES (?, ?, ?)`,
		cmdType, dataStr, now,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// GetPendingCommands returns unprocessed commands.
func (s *Store) GetPendingCommands(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.Query(
		`SELECT id, COALESCE(type, ''), data, created_at
		 FROM commands WHERE processed = 0 ORDER BY created_at ASC LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var commands []map[string]interface{}
	for rows.Next() {
		var id int64
		var cmdType, dataStr string
		var createdAt int64
		if err := rows.Scan(&id, &cmdType, &dataStr, &createdAt); err != nil {
			continue
		}

		cmd := map[string]interface{}{
			"id":        id,
			"type":      cmdType,
			"timestamp": time.Unix(0, createdAt*int64(time.Millisecond)).UTC().Format(time.RFC3339Nano),
		}

		var data interface{}
		if json.Unmarshal([]byte(dataStr), &data) == nil {
			cmd["payload"] = data
		}

		commands = append(commands, cmd)
	}
	if commands == nil {
		commands = []map[string]interface{}{}
	}
	return commands, nil
}

// MarkCommandProcessed marks a command as processed.
func (s *Store) MarkCommandProcessed(id int64) error {
	_, err := s.db.Exec(`UPDATE commands SET processed = 1 WHERE id = ?`, id)
	return err
}

// CleanupOldEvents removes events older than the given duration.
func (s *Store) CleanupOldEvents(maxAge time.Duration) (int64, error) {
	cutoff := time.Now().Add(-maxAge).UnixMilli()
	result, err := s.db.Exec(`DELETE FROM events WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
