package store

import (
	"database/sql"
	"time"
)

// KVGet retrieves a value by key. Returns empty string if not found.
func (s *Store) KVGet(key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM kv WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// KVSet stores a key-value pair, replacing any existing value.
func (s *Store) KVSet(key, value string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(
		`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, now,
	)
	return err
}

// KVDelete removes a key.
func (s *Store) KVDelete(key string) error {
	_, err := s.db.Exec(`DELETE FROM kv WHERE key = ?`, key)
	return err
}

// kvSetTx stores a key-value pair within an existing transaction.
func (s *Store) kvSetTx(tx *sql.Tx, key, value string) error {
	now := time.Now().UnixMilli()
	_, err := tx.Exec(
		`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, now,
	)
	return err
}
