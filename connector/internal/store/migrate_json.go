package store

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// MigrateJSONFiles imports data from legacy JSON files into SQLite.
// It only imports data that doesn't already exist in the database (idempotent).
// JSON files are kept in place (the OpenClaw plugin may still use them as fallback).
// A KV flag "migrated:<filename>" tracks which files have been imported.
func (s *Store) MigrateJSONFiles(hyperclawDir string) {
	s.migrateTodoJSON(filepath.Join(hyperclawDir, "todo.json"))
	s.migrateEventsJSONL(filepath.Join(hyperclawDir, "events.jsonl"))
	s.migrateCommandsJSONL(filepath.Join(hyperclawDir, "commands.jsonl"))
	s.migrateKVFile(filepath.Join(hyperclawDir, "usage.json"), "local-usage")
	s.migrateKVFile(filepath.Join(hyperclawDir, "channels.json"), "channels")
	s.migrateKVFile(filepath.Join(hyperclawDir, "orgchart.json"), "orgchart")
	s.migrateKVFile(filepath.Join(hyperclawDir, "office", "layout.json"), "office-layout")
	s.migrateKVFile(filepath.Join(hyperclawDir, "office", "seats.json"), "office-seats")
}

func (s *Store) migrateTodoJSON(path string) {
	if s.isMigrated("todo.json") {
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return // file doesn't exist, nothing to migrate
	}

	// Check if tasks already exist in DB
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&count)
	if count > 0 {
		s.markMigrated("todo.json")
		return // already has data
	}

	var td TodoData
	if err := json.Unmarshal(data, &td); err != nil {
		log.Printf("Migrate: failed to parse %s: %v", path, err)
		return
	}
	if td.Tasks == nil {
		td.Tasks = []map[string]interface{}{}
	}
	if td.Lists == nil {
		td.Lists = []interface{}{}
	}

	if err := s.SaveTodoData(td); err != nil {
		log.Printf("Migrate: failed to import todo data: %v", err)
		return
	}

	s.markMigrated("todo.json")
	log.Printf("Migrate: imported %d tasks from %s", len(td.Tasks), path)
}

func (s *Store) migrateEventsJSONL(path string) {
	if s.isMigrated("events.jsonl") {
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	imported := 0
	for _, line := range lines {
		if line == "" {
			continue
		}
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}
		eventType, _ := obj["type"].(string)
		if err := s.AddEvent(eventType, obj); err == nil {
			imported++
		}
	}

	s.markMigrated("events.jsonl")
	if imported > 0 {
		log.Printf("Migrate: imported %d events from %s", imported, path)
	}
}

func (s *Store) migrateCommandsJSONL(path string) {
	if s.isMigrated("commands.jsonl") {
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	imported := 0
	for _, line := range lines {
		if line == "" {
			continue
		}
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}
		cmdType, _ := obj["type"].(string)
		if _, err := s.AddCommand(cmdType, obj); err == nil {
			imported++
		}
	}

	s.markMigrated("commands.jsonl")
	if imported > 0 {
		log.Printf("Migrate: imported %d commands from %s", imported, path)
	}
}

func (s *Store) migrateKVFile(path, key string) {
	migrationKey := filepath.Base(path)
	if s.isMigrated(migrationKey) {
		return
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	// Check if key already exists in KV store
	existing, _ := s.KVGet(key)
	if existing != "" {
		s.markMigrated(migrationKey)
		return
	}

	// Validate it's valid JSON
	var parsed interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		log.Printf("Migrate: failed to parse %s: %v", path, err)
		return
	}

	// For channels.json, extract the channels array
	if key == "channels" {
		if obj, ok := parsed.(map[string]interface{}); ok {
			if channels, ok := obj["channels"]; ok {
				channelBytes, _ := json.Marshal(channels)
				data = channelBytes
			}
		}
	}

	if err := s.KVSet(key, string(data)); err != nil {
		log.Printf("Migrate: failed to import %s into kv[%s]: %v", path, key, err)
		return
	}

	s.markMigrated(migrationKey)
	log.Printf("Migrate: imported %s into kv[%s]", path, key)
}

// isMigrated checks if a file has already been migrated.
func (s *Store) isMigrated(filename string) bool {
	val, _ := s.KVGet("migrated:" + filename)
	return val != ""
}

// markMigrated records that a file has been migrated.
func (s *Store) markMigrated(filename string) {
	s.KVSet("migrated:"+filename, time.Now().UTC().Format(time.RFC3339))
}

// Cleanup removes old data from the database to prevent unbounded growth.
func (s *Store) Cleanup() {
	eventAge := 7 * 24 * time.Hour   // 7 days
	actionAge := 30 * 24 * time.Hour // 30 days
	commandAge := 7 * 24 * time.Hour // 7 days

	if n, err := s.CleanupOldEvents(eventAge); err == nil && n > 0 {
		log.Printf("Cleanup: removed %d old events (>%s)", n, eventAge)
	}
	if n, err := s.CleanupOldActions(actionAge); err == nil && n > 0 {
		log.Printf("Cleanup: removed %d old actions (>%s)", n, actionAge)
	}
	if n, err := s.cleanupOldCommands(commandAge); err == nil && n > 0 {
		log.Printf("Cleanup: removed %d old processed commands (>%s)", n, commandAge)
	}
}

// cleanupOldCommands removes processed commands older than maxAge.
func (s *Store) cleanupOldCommands(maxAge time.Duration) (int64, error) {
	cutoff := time.Now().Add(-maxAge).UnixMilli()
	result, err := s.db.Exec(`DELETE FROM commands WHERE processed = 1 AND created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// DBSizeBytes returns the size of the database file in bytes.
func (s *Store) DBSizeBytes() int64 {
	info, err := os.Stat(s.path)
	if err != nil {
		return 0
	}
	return info.Size()
}
