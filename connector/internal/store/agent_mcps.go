package store

import (
	"encoding/json"
	"fmt"
	"time"
)

// AgentMCP represents a single MCP server configuration stored locally per agent.
type AgentMCP struct {
	ID            string            `json:"id"`
	AgentID       string            `json:"agentId"`
	Name          string            `json:"name"`
	TransportType string            `json:"transportType"` // "stdio" | "sse" | "streamable_http"
	Command       string            `json:"command"`
	Args          []string          `json:"args"`
	URL           string            `json:"url"`
	Headers       map[string]string `json:"headers"`
	Env           map[string]string `json:"env"`
	Enabled       bool              `json:"enabled"`
	CreatedAt     int64             `json:"createdAt"`
	UpdatedAt     int64             `json:"updatedAt"`
}

// ListAgentMCPs returns all MCP server configs for the given agent.
func (s *Store) ListAgentMCPs(agentID string) ([]AgentMCP, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		`SELECT id, agent_id, name, transport_type,
		        COALESCE(command,''), args, COALESCE(url,''),
		        headers, env, enabled, created_at, updated_at
		 FROM agent_mcps WHERE agent_id = ? ORDER BY name ASC`,
		agentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mcps []AgentMCP
	for rows.Next() {
		var m AgentMCP
		var enabledInt int
		var argsJSON, headersJSON, envJSON string
		if err := rows.Scan(
			&m.ID, &m.AgentID, &m.Name, &m.TransportType,
			&m.Command, &argsJSON, &m.URL,
			&headersJSON, &envJSON, &enabledInt, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, err
		}
		m.Enabled = enabledInt == 1
		_ = json.Unmarshal([]byte(argsJSON), &m.Args)
		_ = json.Unmarshal([]byte(headersJSON), &m.Headers)
		_ = json.Unmarshal([]byte(envJSON), &m.Env)
		if m.Args == nil {
			m.Args = []string{}
		}
		if m.Headers == nil {
			m.Headers = map[string]string{}
		}
		if m.Env == nil {
			m.Env = map[string]string{}
		}
		mcps = append(mcps, m)
	}
	if mcps == nil {
		mcps = []AgentMCP{}
	}
	return mcps, rows.Err()
}

// AddAgentMCP inserts a new MCP server config for an agent.
func (s *Store) AddAgentMCP(agentID, name, transportType, command string, args []string, url string, headers, env map[string]string) (AgentMCP, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if args == nil {
		args = []string{}
	}
	if headers == nil {
		headers = map[string]string{}
	}
	if env == nil {
		env = map[string]string{}
	}

	argsJSON, _ := json.Marshal(args)
	headersJSON, _ := json.Marshal(headers)
	envJSON, _ := json.Marshal(env)
	now := time.Now().UnixMilli()
	id := newSkillID() // reuse UUID helper from agent_skills.go

	_, err := s.db.Exec(
		`INSERT INTO agent_mcps
		 (id, agent_id, name, transport_type, command, args, url, headers, env, enabled, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
		id, agentID, name, transportType, command, string(argsJSON), url,
		string(headersJSON), string(envJSON), now, now,
	)
	if err != nil {
		return AgentMCP{}, err
	}

	return AgentMCP{
		ID:            id,
		AgentID:       agentID,
		Name:          name,
		TransportType: transportType,
		Command:       command,
		Args:          args,
		URL:           url,
		Headers:       headers,
		Env:           env,
		Enabled:       true,
		CreatedAt:     now,
		UpdatedAt:     now,
	}, nil
}

// UpdateAgentMCP updates the editable fields of an MCP server config.
func (s *Store) UpdateAgentMCP(id, name, transportType, command string, args []string, url string, headers, env map[string]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if args == nil {
		args = []string{}
	}
	if headers == nil {
		headers = map[string]string{}
	}
	if env == nil {
		env = map[string]string{}
	}

	argsJSON, _ := json.Marshal(args)
	headersJSON, _ := json.Marshal(headers)
	envJSON, _ := json.Marshal(env)
	now := time.Now().UnixMilli()

	res, err := s.db.Exec(
		`UPDATE agent_mcps
		 SET name=?, transport_type=?, command=?, args=?, url=?, headers=?, env=?, updated_at=?
		 WHERE id=?`,
		name, transportType, command, string(argsJSON), url,
		string(headersJSON), string(envJSON), now, id,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("mcp not found: %s", id)
	}
	return nil
}

// ToggleAgentMCP enables or disables an MCP server.
func (s *Store) ToggleAgentMCP(id string, enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	enabledInt := 0
	if enabled {
		enabledInt = 1
	}
	now := time.Now().UnixMilli()

	res, err := s.db.Exec(
		`UPDATE agent_mcps SET enabled=?, updated_at=? WHERE id=?`,
		enabledInt, now, id,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("mcp not found: %s", id)
	}
	return nil
}

// DeleteAgentMCP removes an MCP server config by ID.
func (s *Store) DeleteAgentMCP(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, err := s.db.Exec(`DELETE FROM agent_mcps WHERE id=?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("mcp not found: %s", id)
	}
	return nil
}

// DeleteAgentMCPsByAgent removes all MCP configs for an agent.
func (s *Store) DeleteAgentMCPsByAgent(agentID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`DELETE FROM agent_mcps WHERE agent_id=?`, agentID)
	return err
}

// DeleteAgentMCPsByName removes every MCP config with the given display name.
// This is used for removing legacy Hyperclaw-owned MCP rows while preserving
// user-added agent-scoped MCPs.
func (s *Store) DeleteAgentMCPsByName(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`DELETE FROM agent_mcps WHERE name=?`, name)
	return err
}
