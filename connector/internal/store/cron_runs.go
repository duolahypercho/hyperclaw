package store

import (
	"database/sql"
	"fmt"
	"time"
)

// CronRun represents a single execution of a cron job.
type CronRun struct {
	ID            string  `json:"id"`
	CronID        string  `json:"cronId"`
	Runtime       string  `json:"runtime"`
	RunID         string  `json:"runId"`
	Status        string  `json:"status"`
	StartedAtMs   int64   `json:"startedAtMs"`
	FinishedAtMs  *int64  `json:"finishedAtMs,omitempty"`
	DurationMs    *int64  `json:"durationMs,omitempty"`
	Summary       *string `json:"summary,omitempty"`
	FullLog       *string `json:"fullLog,omitempty"`
	ErrorMsg      *string `json:"errorMsg,omitempty"`
	TriggerSource string  `json:"triggerSource"`
}

// InsertCronRun creates a new cron run record with status "running".
func (s *Store) InsertCronRun(cronID, runtime, runID, triggerSource string) error {
	now := time.Now().UnixMilli()
	id := fmt.Sprintf("%s-%d", runID, now)
	_, err := s.db.Exec(
		`INSERT INTO cron_runs (id, cron_id, runtime, run_id, status, started_at_ms, trigger_source)
		 VALUES (?, ?, ?, ?, 'running', ?, ?)`,
		id, cronID, runtime, runID, now, triggerSource,
	)
	return err
}

// FinalizeCronRun updates a running cron run with its final status.
func (s *Store) FinalizeCronRun(runID, status, summary, fullLog, errorMsg string, finishedAtMs, durationMs int64) error {
	var summaryPtr, fullLogPtr, errorMsgPtr *string
	if summary != "" {
		summaryPtr = &summary
	}
	if fullLog != "" {
		fullLogPtr = &fullLog
	}
	if errorMsg != "" {
		errorMsgPtr = &errorMsg
	}
	res, err := s.db.Exec(
		`UPDATE cron_runs SET status = ?, finished_at_ms = ?, duration_ms = ?, summary = ?, full_log = ?, error_msg = ?
		 WHERE run_id = ? AND status = 'running'`,
		status, finishedAtMs, durationMs, summaryPtr, fullLogPtr, errorMsgPtr, runID,
	)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("no running cron_run found for run_id %s", runID)
	}
	return nil
}

// GetCronRuns returns paginated run history for a single cron job (newest first).
func (s *Store) GetCronRuns(cronID string, limit, offset int) ([]CronRun, int, error) {
	var total int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM cron_runs WHERE cron_id = ?`, cronID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	rows, err := s.db.Query(
		`SELECT id, cron_id, runtime, run_id, status, started_at_ms, finished_at_ms, duration_ms, summary, full_log, error_msg, trigger_source
		 FROM cron_runs WHERE cron_id = ? ORDER BY started_at_ms DESC LIMIT ? OFFSET ?`,
		cronID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	return scanCronRuns(rows), total, nil
}

// GetCronRunsForJobs returns run history for multiple cron jobs, keyed by cron_id.
func (s *Store) GetCronRunsForJobs(cronIDs []string, limit int) (map[string][]CronRun, error) {
	if len(cronIDs) == 0 {
		return map[string][]CronRun{}, nil
	}
	result := make(map[string][]CronRun, len(cronIDs))
	for _, id := range cronIDs {
		runs, _, err := s.GetCronRuns(id, limit, 0)
		if err != nil {
			return nil, err
		}
		result[id] = runs
	}
	return result, nil
}

// DeleteCronRunsByCronID removes all run history for a cron job.
func (s *Store) DeleteCronRunsByCronID(cronID string) error {
	_, err := s.db.Exec(`DELETE FROM cron_runs WHERE cron_id = ?`, cronID)
	return err
}

// PurgeCronRunsOlderThan deletes run history older than the given timestamp.
func (s *Store) PurgeCronRunsOlderThan(beforeMs int64) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM cron_runs WHERE started_at_ms < ?`, beforeMs)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func scanCronRuns(rows *sql.Rows) []CronRun {
	var runs []CronRun
	for rows.Next() {
		var r CronRun
		if err := rows.Scan(
			&r.ID, &r.CronID, &r.Runtime, &r.RunID, &r.Status, &r.StartedAtMs,
			&r.FinishedAtMs, &r.DurationMs, &r.Summary, &r.FullLog, &r.ErrorMsg, &r.TriggerSource,
		); err != nil {
			continue
		}
		runs = append(runs, r)
	}
	return runs
}
