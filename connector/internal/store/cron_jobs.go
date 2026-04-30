package store

import (
	"database/sql"
	"sync"
	"time"
)

// CronJob represents a cron job definition from any runtime.
type CronJob struct {
	ID              string `json:"id"`
	Runtime         string `json:"runtime"`
	AgentID         string `json:"agentId,omitempty"`
	Name            string `json:"name"`
	Enabled         bool   `json:"enabled"`
	RawJSON         string `json:"rawJson"`
	AnnounceChannel string `json:"announceChannel,omitempty"`
	CreatedAt       int64  `json:"createdAt"`
	UpdatedAt       int64  `json:"updatedAt"`
}

// SeedCronJob is the minimal input for seeding a cron job.
type SeedCronJob struct {
	ID      string
	Runtime string
	AgentID string
	Name    string
	Enabled bool
	RawJSON string
}

var cronSeedMu sync.Mutex

// SeedCronJobs upserts cron jobs for a specific runtime into the database.
// Unlike SeedAgents, this handles the empty-set case: if jobs is empty,
// all existing jobs for the given runtime are deleted.
func (s *Store) SeedCronJobs(runtime string, jobs []SeedCronJob) (added, updated, removed int, err error) {
	cronSeedMu.Lock()
	defer cronSeedMu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return 0, 0, 0, err
	}
	defer tx.Rollback()

	now := time.Now().UnixMilli()

	// Check which IDs already exist for this runtime
	existingIDs := make(map[string]bool)
	rows, err := tx.Query("SELECT id FROM cron_jobs WHERE runtime = ?", runtime)
	if err != nil {
		return 0, 0, 0, err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, 0, 0, err
		}
		existingIDs[id] = true
	}
	rows.Close()

	// Upsert each job
	stmt, err := tx.Prepare(`
		INSERT INTO cron_jobs (id, runtime, agent_id, name, enabled, raw_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			runtime    = excluded.runtime,
			agent_id   = excluded.agent_id,
			name       = excluded.name,
			enabled    = excluded.enabled,
			raw_json   = excluded.raw_json,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return 0, 0, 0, err
	}
	defer stmt.Close()

	seedIDs := make(map[string]bool, len(jobs))
	for _, j := range jobs {
		seedIDs[j.ID] = true
		enabled := 0
		if j.Enabled {
			enabled = 1
		}
		_, err := stmt.Exec(j.ID, j.Runtime, j.AgentID, j.Name, enabled, j.RawJSON, now, now)
		if err != nil {
			return 0, 0, 0, err
		}
		if existingIDs[j.ID] {
			updated++
		} else {
			added++
		}
	}

	// Remove jobs that no longer exist in the seed list for this runtime
	delStmt, err := tx.Prepare("DELETE FROM cron_jobs WHERE id = ? AND runtime = ?")
	if err != nil {
		return 0, 0, 0, err
	}
	defer delStmt.Close()

	for id := range existingIDs {
		if !seedIDs[id] {
			delStmt.Exec(id, runtime)
			removed++
		}
	}

	err = tx.Commit()
	return added, updated, removed, err
}

// GetCronJobs returns all cron jobs, optionally filtered by runtime.
func (s *Store) GetCronJobs(runtime string) ([]CronJob, error) {
	return s.GetCronJobsFiltered(runtime, "")
}

// GetCronJobsFiltered returns cron jobs filtered by runtime and/or agentId.
// Pass empty string for either filter to skip that filter.
func (s *Store) GetCronJobsFiltered(runtime, agentID string) ([]CronJob, error) {
	var rows *sql.Rows
	var err error

	query := `SELECT id, runtime, agent_id, name, enabled, raw_json, announce_channel, created_at, updated_at FROM cron_jobs`
	var conditions []string
	var args []interface{}

	if runtime != "" {
		conditions = append(conditions, "runtime = ?")
		args = append(args, runtime)
	}
	if agentID != "" {
		conditions = append(conditions, "agent_id = ?")
		args = append(args, agentID)
	}

	if len(conditions) > 0 {
		query += " WHERE " + conditions[0]
		for i := 1; i < len(conditions); i++ {
			query += " AND " + conditions[i]
		}
	}
	query += " ORDER BY name ASC"

	rows, err = s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []CronJob
	for rows.Next() {
		var j CronJob
		var enabled int
		var announceChannel sql.NullString
		if err := rows.Scan(&j.ID, &j.Runtime, &j.AgentID, &j.Name, &enabled, &j.RawJSON, &announceChannel, &j.CreatedAt, &j.UpdatedAt); err != nil {
			continue
		}
		j.Enabled = enabled == 1
		if announceChannel.Valid {
			j.AnnounceChannel = announceChannel.String
		}
		jobs = append(jobs, j)
	}
	if jobs == nil {
		jobs = []CronJob{}
	}
	return jobs, nil
}

// GetCronJobByID returns a single cron job by ID.
func (s *Store) GetCronJobByID(id string) (*CronJob, error) {
	var j CronJob
	var enabled int
	var announceChannel sql.NullString
	err := s.db.QueryRow(`
		SELECT id, runtime, agent_id, name, enabled, raw_json, announce_channel, created_at, updated_at
		FROM cron_jobs WHERE id = ?
	`, id).Scan(&j.ID, &j.Runtime, &j.AgentID, &j.Name, &enabled, &j.RawJSON, &announceChannel, &j.CreatedAt, &j.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	j.Enabled = enabled == 1
	if announceChannel.Valid {
		j.AnnounceChannel = announceChannel.String
	}
	return &j, nil
}

// DeleteCronJobsByAgent removes all cron jobs associated with a given agent ID.
func (s *Store) DeleteCronJobsByAgent(agentID string) (int, error) {
	result, err := s.db.Exec(`DELETE FROM cron_jobs WHERE agent_id = ?`, agentID)
	if err != nil {
		return 0, err
	}
	rows, _ := result.RowsAffected()
	return int(rows), nil
}

// CronJobCount returns the number of cron jobs, optionally filtered by runtime.
func (s *Store) CronJobCount(runtime string) (int, error) {
	var count int
	var err error
	if runtime != "" {
		err = s.db.QueryRow("SELECT COUNT(*) FROM cron_jobs WHERE runtime = ?", runtime).Scan(&count)
	} else {
		err = s.db.QueryRow("SELECT COUNT(*) FROM cron_jobs").Scan(&count)
	}
	return count, err
}

// UpsertDirectCronJob inserts or replaces a cron job for a non-OpenClaw runtime.
func (s *Store) UpsertDirectCronJob(id, runtime, agentID, name string, enabled bool, rawJSON string) error {
	now := time.Now().UnixMilli()
	enabledInt := 0
	if enabled {
		enabledInt = 1
	}
	var agentPtr *string
	if agentID != "" {
		agentPtr = &agentID
	}
	_, err := s.db.Exec(`
		INSERT INTO cron_jobs (id, runtime, agent_id, name, enabled, raw_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			runtime    = excluded.runtime,
			agent_id   = excluded.agent_id,
			name       = excluded.name,
			enabled    = excluded.enabled,
			raw_json   = excluded.raw_json,
			updated_at = excluded.updated_at
	`, id, runtime, agentPtr, name, enabledInt, rawJSON, now, now)
	return err
}

// DeleteCronJobByID removes a cron job by its ID. Returns true if a row was deleted.
func (s *Store) DeleteCronJobByID(id string) (bool, error) {
	result, err := s.db.Exec(`DELETE FROM cron_jobs WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := result.RowsAffected()
	return n > 0, nil
}

// UpdateCronJobRawJSON updates the raw_json column for a specific cron job.
func (s *Store) UpdateCronJobRawJSON(id, rawJSON string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`UPDATE cron_jobs SET raw_json = ?, updated_at = ? WHERE id = ?`, rawJSON, now, id)
	return err
}

// UpdateCronJobAnnounceChannel sets the announce_channel for a cron job.
func (s *Store) UpdateCronJobAnnounceChannel(id, channel string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(
		`UPDATE cron_jobs SET announce_channel = ?, updated_at = ? WHERE id = ?`,
		channel, now, id,
	)
	return err
}

// UpdateCronJobEnabled toggles the enabled state and updates raw_json accordingly.
func (s *Store) UpdateCronJobEnabled(id string, enabled bool) error {
	now := time.Now().UnixMilli()
	enabledInt := 0
	if enabled {
		enabledInt = 1
	}
	_, err := s.db.Exec(
		`UPDATE cron_jobs SET enabled = ?, updated_at = ?, raw_json = json_set(raw_json, '$.enabled', json(?))
		 WHERE id = ?`,
		enabledInt, now, enabled, id,
	)
	return err
}
