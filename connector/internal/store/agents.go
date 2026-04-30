package store

import (
	"database/sql"
	"encoding/json"
	"time"
)

// Agent represents a registered agent from any runtime.
type Agent struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Role       string `json:"role,omitempty"`
	Status     string `json:"status"`
	Department string `json:"department,omitempty"`
	Config     string `json:"config,omitempty"`
	Runtime    string `json:"runtime,omitempty"`
	CreatedAt  int64  `json:"createdAt"`
	UpdatedAt  int64  `json:"updatedAt"`
}

// SeedAgent is the minimal input for seeding an agent.
type SeedAgent struct {
	ID      string
	Name    string
	Role    string
	Status  string
	Runtime string
}

// SeedAgents upserts a list of agents into the database.
// New agents are inserted; existing agents have mutable metadata updated.
// Runtime is immutable after creation because runtime sessions can already be logged in.
// This is idempotent and safe to call on every startup.
func (s *Store) SeedAgents(agents []SeedAgent) error {
	if len(agents) == 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now().UnixMilli()

	stmt, err := tx.Prepare(`
		INSERT INTO agents (id, name, role, status, runtime, config, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name       = excluded.name,
			role       = excluded.role,
			status     = excluded.status,
			runtime    = CASE WHEN agents.runtime != '' THEN agents.runtime ELSE excluded.runtime END,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	identityStmt, err := tx.Prepare(`
		INSERT INTO agent_identity (id, name, avatar_data, emoji, runtime, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name        = CASE WHEN excluded.name != '' THEN excluded.name ELSE agent_identity.name END,
			avatar_data = CASE WHEN excluded.avatar_data != '' THEN excluded.avatar_data ELSE agent_identity.avatar_data END,
			emoji       = CASE WHEN excluded.emoji != '' THEN excluded.emoji ELSE agent_identity.emoji END,
			runtime     = CASE WHEN agent_identity.runtime != '' THEN agent_identity.runtime ELSE excluded.runtime END,
			updated_at  = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer identityStmt.Close()

	idSet := make(map[string]bool, len(agents))
	for _, a := range agents {
		idSet[a.ID] = true
		status := a.Status
		if status == "" {
			status = "idle"
		}
		runtime := a.Runtime
		if runtime == "" {
			runtime = "openclaw"
		}
		_, err := stmt.Exec(a.ID, a.Name, a.Role, status, runtime, now, now)
		if err != nil {
			return err
		}

		// Also seed agent_identity so that list-agent-identities returns all
		// runtimes from a single SQLite query. UpsertAgentIdentity preserves
		// existing avatar/emoji values when the new value is empty.
		_, err = identityStmt.Exec(a.ID, a.Name, "", "", runtime, now)
		if err != nil {
			return err
		}
	}

	// Remove agents from SQLite that no longer exist in the config.
	rows, err := tx.Query("SELECT id FROM agents")
	if err != nil {
		return err
	}
	var staleIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		if !idSet[id] {
			staleIDs = append(staleIDs, id)
		}
	}
	rows.Close()

	if len(staleIDs) > 0 {
		delStmt, err := tx.Prepare("DELETE FROM agents WHERE id = ?")
		if err != nil {
			return err
		}
		defer delStmt.Close()
		for _, id := range staleIDs {
			if _, err := delStmt.Exec(id); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM project_members WHERE agent_id = ?", id); err != nil {
				return err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	return s.EnsureInitialProject()
}

// UpsertAgent inserts or updates a single agent without touching any other rows.
// Use this for onboarding or any single-agent provisioning flow where
// SeedAgents' stale-deletion behavior would incorrectly remove other agents.
func (s *Store) UpsertAgent(a SeedAgent) error {
	status := a.Status
	if status == "" {
		status = "idle"
	}
	runtime := a.Runtime
	if runtime == "" {
		runtime = "openclaw"
	}
	now := time.Now().UnixMilli()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		INSERT INTO agents (id, name, role, status, runtime, config, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, '{}', ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name       = excluded.name,
			role       = excluded.role,
			status     = excluded.status,
			runtime    = CASE WHEN agents.runtime != '' THEN agents.runtime ELSE excluded.runtime END,
			updated_at = excluded.updated_at
	`, a.ID, a.Name, a.Role, status, runtime, now, now); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		INSERT INTO agent_identity (id, name, avatar_data, emoji, runtime, updated_at)
		VALUES (?, ?, '', '', ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name       = CASE WHEN excluded.name != '' THEN excluded.name ELSE agent_identity.name END,
			runtime    = CASE WHEN agent_identity.runtime != '' THEN agent_identity.runtime ELSE excluded.runtime END,
			updated_at = excluded.updated_at
	`, a.ID, a.Name, runtime, now); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	return s.EnsureInitialProject()
}

// GetAgents returns all registered agents, optionally filtered by runtime.
func (s *Store) GetAgents(runtime ...string) ([]Agent, error) {
	var rows *sql.Rows
	var err error

	if len(runtime) > 0 && runtime[0] != "" {
		rows, err = s.db.Query(`
			SELECT id, name, role, status, department, config, runtime, created_at, updated_at
			FROM agents WHERE runtime = ? ORDER BY name ASC
		`, runtime[0])
	} else {
		rows, err = s.db.Query(`
			SELECT id, name, role, status, department, config, runtime, created_at, updated_at
			FROM agents ORDER BY name ASC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var a Agent
		if err := rows.Scan(&a.ID, &a.Name, &a.Role, &a.Status, &a.Department, &a.Config, &a.Runtime, &a.CreatedAt, &a.UpdatedAt); err != nil {
			continue
		}
		agents = append(agents, a)
	}
	if agents == nil {
		agents = []Agent{}
	}
	return agents, nil
}

// GetAgent returns a single agent by ID.
func (s *Store) GetAgent(id string) (*Agent, error) {
	var a Agent
	err := s.db.QueryRow(`
		SELECT id, name, role, status, department, config, runtime, created_at, updated_at
		FROM agents WHERE id = ?
	`, id).Scan(&a.ID, &a.Name, &a.Role, &a.Status, &a.Department, &a.Config, &a.Runtime, &a.CreatedAt, &a.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// UpdateAgent patches an agent's fields. Only non-empty values in the patch are applied.
func (s *Store) UpdateAgent(id string, patch map[string]interface{}) (*Agent, error) {
	// Read current
	a, err := s.GetAgent(id)
	if err != nil {
		return nil, err
	}
	if a == nil {
		return nil, nil
	}

	if v, ok := patch["name"].(string); ok && v != "" {
		a.Name = v
	}
	if v, ok := patch["role"].(string); ok {
		a.Role = v
	}
	if v, ok := patch["status"].(string); ok && v != "" {
		a.Status = v
	}
	if v, ok := patch["department"].(string); ok {
		a.Department = v
	}
	if v, ok := patch["config"]; ok {
		b, _ := json.Marshal(v)
		a.Config = string(b)
	}

	now := time.Now().UnixMilli()
	_, err = s.db.Exec(`
		UPDATE agents SET name = ?, role = ?, status = ?, department = ?, config = ?, updated_at = ?
		WHERE id = ?
	`, a.Name, a.Role, a.Status, a.Department, a.Config, now, id)
	if err != nil {
		return nil, err
	}
	a.UpdatedAt = now
	return a, nil
}

// DeleteAgent removes an agent by ID.
func (s *Store) DeleteAgent(id string) (bool, error) {
	result, err := s.db.Exec(`DELETE FROM agents WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	rows, _ := result.RowsAffected()
	return rows > 0, nil
}

// AgentCount returns the number of registered agents.
func (s *Store) AgentCount() (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM agents`).Scan(&count)
	return count, err
}

// CountAgentsByRuntime returns the count of agents for a specific runtime.
// Counts unique agents from both agents and agent_identity tables.
func (s *Store) CountAgentsByRuntime(runtime string) (int, error) {
	var count int
	// Count unique agent IDs from both tables using UNION to deduplicate
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT id FROM agents WHERE runtime = ?
			UNION
			SELECT id FROM agent_identity WHERE runtime = ?
		)
	`, runtime, runtime).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, err
}

// DeleteAgentsByRuntime removes all agents and related data for a runtime.
// Returns the count of deleted agents (from both agents and agent_identity tables).
func (s *Store) DeleteAgentsByRuntime(runtime string) (int, error) {
	// Get agent IDs from both tables for cascading deletes
	agentIDSet := make(map[string]struct{})

	// From agents table
	rows, err := s.db.Query(`SELECT id FROM agents WHERE runtime = ?`, runtime)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		agentIDSet[id] = struct{}{}
	}
	rows.Close()

	// From agent_identity table (may have agents not in agents table)
	rows, err = s.db.Query(`SELECT id FROM agent_identity WHERE runtime = ?`, runtime)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		agentIDSet[id] = struct{}{}
	}
	rows.Close()

	if len(agentIDSet) == 0 {
		return 0, nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// Delete from all related tables
	for id := range agentIDSet {
		tx.Exec(`DELETE FROM agent_files WHERE agent_id = ?`, id)
		tx.Exec(`DELETE FROM agent_skills WHERE agent_id = ?`, id)
		tx.Exec(`DELETE FROM agent_mcps WHERE agent_id = ?`, id)
		tx.Exec(`DELETE FROM agent_events WHERE agent_id = ?`, id)
		tx.Exec(`DELETE FROM agent_last_seen WHERE agent_id = ?`, id)
		tx.Exec(`DELETE FROM agent_tools WHERE agent_id = ?`, id)
		tx.Exec(`DELETE FROM agent_identity WHERE id = ?`, id)
	}

	// Delete from agents table
	tx.Exec(`DELETE FROM agents WHERE runtime = ?`, runtime)

	// Track total deleted (from agent_identity since that's our primary source)
	deletedCount := len(agentIDSet)

	// Delete runtime-specific data
	tx.Exec(`DELETE FROM cron_jobs WHERE runtime = ?`, runtime)
	tx.Exec(`DELETE FROM sessions WHERE runtime = ?`, runtime)
	tx.Exec(`DELETE FROM token_usage WHERE runtime = ?`, runtime)

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return deletedCount, nil
}

// DeleteAgentTools removes the tools configuration for an agent.
func (s *Store) DeleteAgentTools(agentID string) error {
	_, err := s.db.Exec(`DELETE FROM agent_tools WHERE agent_id = ?`, agentID)
	return err
}

// ExportAgentsByRuntime returns all agent data for a runtime as exportable structs.
// Includes agents from both agents table and agent_identity table.
func (s *Store) ExportAgentsByRuntime(runtime string) ([]map[string]interface{}, error) {
	exportedIDs := make(map[string]bool)
	var exports []map[string]interface{}

	// First export from agents table
	agents, err := s.GetAgents(runtime)
	if err != nil {
		return nil, err
	}

	for _, agent := range agents {
		exportedIDs[agent.ID] = true
		export := map[string]interface{}{
			"id":      agent.ID,
			"name":    agent.Name,
			"role":    agent.Role,
			"status":  agent.Status,
			"runtime": agent.Runtime,
			"config":  agent.Config,
		}

		// Get identity data
		if identity, err := s.GetAgentIdentity(agent.ID); err == nil && identity != nil {
			export["identity"] = map[string]interface{}{
				"name":       identity.Name,
				"emoji":      identity.Emoji,
				"avatarData": identity.AvatarData,
			}
		}

		// Get personality files
		files, err := s.GetAgentFiles(agent.ID)
		if err == nil && len(files) > 0 {
			fileMap := make(map[string]string)
			for _, f := range files {
				fileMap[f.FileKey] = f.Content
			}
			export["files"] = fileMap
		}

		exports = append(exports, export)
	}

	// Also export from agent_identity table (agents not in agents table)
	rows, err := s.db.Query(`SELECT id, name, avatar_data, emoji, runtime FROM agent_identity WHERE runtime = ?`, runtime)
	if err != nil {
		return exports, nil // Return what we have, don't fail
	}
	defer rows.Close()

	for rows.Next() {
		var id, name, avatar, emoji, rt string
		if err := rows.Scan(&id, &name, &avatar, &emoji, &rt); err != nil {
			continue
		}
		if exportedIDs[id] {
			continue // Already exported from agents table
		}
		export := map[string]interface{}{
			"id":      id,
			"name":    name,
			"runtime": rt,
			"identity": map[string]interface{}{
				"name":       name,
				"emoji":      emoji,
				"avatarData": avatar,
			},
		}
		exports = append(exports, export)
	}

	return exports, nil
}
