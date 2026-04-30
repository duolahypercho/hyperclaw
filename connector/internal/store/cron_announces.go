package store

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// InsertCronAnnounce appends one cron run lifecycle row to connector.db.
func (s *Store) InsertCronAnnounce(cronID, agentID, sessionKey, eventType, category, source, message, metadata, runID string) (int64, error) {
	now := time.Now().UnixMilli()

	var agentPtr, sessionPtr, sourcePtr, metadataPtr, runPtr *string
	if agentID != "" {
		agentPtr = &agentID
	}
	if sessionKey != "" {
		sessionPtr = &sessionKey
	}
	if source != "" {
		sourcePtr = &source
	}
	if metadata != "" {
		metadataPtr = &metadata
	}
	if runID != "" {
		runPtr = &runID
	}

	result, err := s.db.Exec(
		`INSERT INTO cron_announces (cron_id, agent_id, session_key, event_type, category, source, message, metadata, run_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		cronID, agentPtr, sessionPtr, eventType, category, sourcePtr, message, metadataPtr, runPtr, now,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// UpdateRunningCronAnnounce updates the in-flight row for a specific cron run.
// When runID is provided, it scopes the update to that exact run.
// Falls back to the newest running row for the cronID if runID is empty.
func (s *Store) UpdateRunningCronAnnounce(cronID string, runID string, message string, eventType string, metadata string) (int64, error) {
	var result sql.Result
	var err error

	if runID != "" {
		result, err = s.db.Exec(
			`UPDATE cron_announces
			 SET event_type = COALESCE(NULLIF(?, ''), event_type),
			     message = COALESCE(NULLIF(?, ''), message),
			     metadata = CASE WHEN ? = '' THEN metadata ELSE ? END
			 WHERE id = (
			     SELECT id FROM cron_announces
			     WHERE cron_id = ? AND run_id = ? AND event_type = 'running'
			     ORDER BY created_at DESC, id DESC
			     LIMIT 1
			 )`,
			eventType, message, metadata, metadata, cronID, runID,
		)
	} else {
		result, err = s.db.Exec(
			`UPDATE cron_announces
			 SET event_type = COALESCE(NULLIF(?, ''), event_type),
			     message = COALESCE(NULLIF(?, ''), message),
			     metadata = CASE WHEN ? = '' THEN metadata ELSE ? END
			 WHERE id = (
			     SELECT id FROM cron_announces
			     WHERE cron_id = ? AND event_type = 'running'
			     ORDER BY created_at DESC, id DESC
			     LIMIT 1
			 )`,
			eventType, message, metadata, metadata, cronID,
		)
	}
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// CronAnnounceRow represents a single row from the cron_announces table.
type CronAnnounceRow struct {
	ID          int64  `json:"id"`
	CronID      string `json:"cronId"`
	AgentID     string `json:"agentId,omitempty"`
	SessionKey  string `json:"sessionKey,omitempty"`
	EventType   string `json:"eventType"`
	Category    string `json:"category"`
	Source      string `json:"source,omitempty"`
	Message     string `json:"message"`
	Metadata    string `json:"metadata,omitempty"`
	RunID       string `json:"runId,omitempty"`
	FullLog     string `json:"fullLog,omitempty"`
	ActionCount int    `json:"actionCount"`
	CreatedAt   int64  `json:"createdAt"`
}

// GetCronAnnounces returns the most recent announces for the given cron IDs.
// If cronIDs is empty, returns announces for all crons.
// Results are ordered by created_at DESC, limited to `limit` rows per cron.
// When multiple rows share the same run_id (e.g. after a gateway reconnect),
// only the latest row per run_id is returned to avoid duplicate entries.
func (s *Store) GetCronAnnounces(cronIDs []string, limit int) ([]CronAnnounceRow, error) {
	if limit <= 0 {
		limit = 50
	}

	// Use a window function to deduplicate by run_id.  Rows without a run_id
	// (legacy / migrated data) are kept as-is by partitioning on their unique id.
	// Among duplicates, prefer: completed > running, then longest message, then newest.
	const dedupSelect = `SELECT id, cron_id, COALESCE(agent_id,''), COALESCE(session_key,''), event_type, category, COALESCE(source,''), message, COALESCE(metadata,''), COALESCE(run_id,''), COALESCE(full_log,''), COALESCE(action_count,0), created_at
		 FROM (
		     SELECT *, ROW_NUMBER() OVER (
		         PARTITION BY COALESCE(NULLIF(run_id, ''), CAST(id AS TEXT))
		         ORDER BY
		             CASE event_type WHEN 'completed' THEN 0 WHEN 'error' THEN 1 WHEN 'aborted' THEN 2 ELSE 3 END,
		             LENGTH(message) DESC,
		             created_at DESC, id DESC
		     ) AS rn
		     FROM cron_announces`

	var rows *sql.Rows
	var err error

	if len(cronIDs) == 0 {
		rows, err = s.db.Query(
			dedupSelect+`
		 ) WHERE rn = 1
		 ORDER BY created_at DESC, id DESC
		 LIMIT ?`, limit,
		)
	} else {
		// Build placeholders
		placeholders := make([]string, len(cronIDs))
		args := make([]interface{}, len(cronIDs)+1)
		for i, id := range cronIDs {
			placeholders[i] = "?"
			args[i] = id
		}
		args[len(cronIDs)] = limit
		query := fmt.Sprintf(
			dedupSelect+`
		     WHERE cron_id IN (%s)
		 ) WHERE rn = 1
		 ORDER BY created_at DESC, id DESC
		 LIMIT ?`,
			strings.Join(placeholders, ","),
		)
		rows, err = s.db.Query(query, args...)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []CronAnnounceRow
	for rows.Next() {
		var r CronAnnounceRow
		if err := rows.Scan(&r.ID, &r.CronID, &r.AgentID, &r.SessionKey, &r.EventType, &r.Category, &r.Source, &r.Message, &r.Metadata, &r.RunID, &r.FullLog, &r.ActionCount, &r.CreatedAt); err != nil {
			continue
		}
		results = append(results, r)
	}
	// Reverse so oldest first
	for i, j := 0, len(results)-1; i < j; i, j = i+1, j-1 {
		results[i], results[j] = results[j], results[i]
	}
	return results, nil
}

// CronAnnounceRunExists returns true if at least one row with the given run_id exists.
func (s *Store) CronAnnounceRunExists(runID string) (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM cron_announces WHERE run_id = ?`, runID).Scan(&count)
	return count > 0, err
}

// DeleteCronAnnounces removes all announce rows for the given cron IDs.
// If cronIDs is empty, all rows are deleted.
// Returns the number of rows deleted.
func (s *Store) DeleteCronAnnounces(cronIDs []string) (int64, error) {
	var result sql.Result
	var err error

	if len(cronIDs) == 0 {
		result, err = s.db.Exec(`DELETE FROM cron_announces`)
	} else {
		placeholders := make([]string, len(cronIDs))
		args := make([]interface{}, len(cronIDs))
		for i, id := range cronIDs {
			placeholders[i] = "?"
			args[i] = id
		}
		query := fmt.Sprintf(
			`DELETE FROM cron_announces WHERE cron_id IN (%s)`,
			strings.Join(placeholders, ","),
		)
		result, err = s.db.Exec(query, args...)
	}
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// MigrateIntelCronAnnounces copies cron announce history from intel.db into connector.db once.
func (s *Store) MigrateIntelCronAnnounces(hyperclawDir string) {
	const migrationKey = "intel.db:cron_announces"
	if s.isMigrated(migrationKey) {
		return
	}

	intelPath := filepath.Join(hyperclawDir, "intel.db")
	if _, err := os.Stat(intelPath); err != nil {
		return
	}

	dsn := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(wal)&_pragma=busy_timeout(5000)&_pragma=synchronous(normal)&_pragma=foreign_keys(on)",
		intelPath,
	)
	intelDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		log.Printf("Migrate: failed to open intel.db for cron_announces: %v", err)
		return
	}
	defer intelDB.Close()

	var tableCount int
	if err := intelDB.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='cron_announces'`).Scan(&tableCount); err != nil || tableCount == 0 {
		return
	}

	rows, err := intelDB.Query(`SELECT cron_id, COALESCE(agent_id, ''), COALESCE(session_key, ''), event_type, category, COALESCE(source, ''), message, COALESCE(metadata, ''), created_at FROM cron_announces ORDER BY created_at ASC, id ASC`)
	if err != nil {
		log.Printf("Migrate: failed reading intel cron_announces: %v", err)
		return
	}
	defer rows.Close()

	imported := 0
	for rows.Next() {
		var cronID, agentID, sessionKey, eventType, category, source, message, metadata string
		var createdAt int64
		if err := rows.Scan(&cronID, &agentID, &sessionKey, &eventType, &category, &source, &message, &metadata, &createdAt); err != nil {
			continue
		}

		var exists int
		err = s.db.QueryRow(
			`SELECT COUNT(*) FROM cron_announces
			 WHERE cron_id = ? AND event_type = ? AND message = ? AND created_at = ? AND COALESCE(session_key, '') = ?`,
			cronID, eventType, message, createdAt, sessionKey,
		).Scan(&exists)
		if err != nil || exists > 0 {
			continue
		}

		var agentPtr, sessionPtr, sourcePtr, metadataPtr *string
		if agentID != "" {
			agentPtr = &agentID
		}
		if sessionKey != "" {
			sessionPtr = &sessionKey
		}
		if source != "" {
			sourcePtr = &source
		}
		if metadata != "" {
			metadataPtr = &metadata
		}

		if _, err := s.db.Exec(
			`INSERT INTO cron_announces (cron_id, agent_id, session_key, event_type, category, source, message, metadata, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			cronID, agentPtr, sessionPtr, eventType, category, sourcePtr, message, metadataPtr, createdAt,
		); err != nil {
			log.Printf("Migrate: failed importing cron_announces row for %s: %v", cronID, err)
			continue
		}
		imported++
	}

	if err := rows.Err(); err != nil {
		log.Printf("Migrate: failed while iterating intel cron_announces: %v", err)
		return
	}

	s.markMigrated(migrationKey)
	if imported > 0 {
		log.Printf("Migrate: imported %d cron_announces rows from %s", imported, intelPath)
	}
}
