package store

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"time"
)

// AgentSkill represents a single skill entry stored locally per agent.
type AgentSkill struct {
	ID          string   `json:"id"`
	AgentID     string   `json:"agentId"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Content     string   `json:"content"`
	Enabled     bool     `json:"enabled"`
	Source      string   `json:"source"` // "custom" | "cloud"
	CloudID     string   `json:"cloudId"`
	Author      string   `json:"author"`
	Version     string   `json:"version"`
	Tags        []string `json:"tags"`
	CreatedAt   int64    `json:"createdAt"`
	UpdatedAt   int64    `json:"updatedAt"`
}

func newSkillID() string {
	return fmt.Sprintf("%x%x", time.Now().UnixNano(), rand.Int63())
}

// ListAgentSkills returns all skills for the given agent, ordered by name.
func (s *Store) ListAgentSkills(agentID string) ([]AgentSkill, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(
		`SELECT id, agent_id, name, COALESCE(description,''), content, enabled,
		        source, COALESCE(cloud_id,''), COALESCE(author,''), COALESCE(version,''),
		        tags, created_at, updated_at
		 FROM agent_skills WHERE agent_id = ? ORDER BY name ASC`,
		agentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var skills []AgentSkill
	for rows.Next() {
		var sk AgentSkill
		var enabledInt int
		var tagsJSON string
		if err := rows.Scan(
			&sk.ID, &sk.AgentID, &sk.Name, &sk.Description, &sk.Content,
			&enabledInt, &sk.Source, &sk.CloudID, &sk.Author, &sk.Version,
			&tagsJSON, &sk.CreatedAt, &sk.UpdatedAt,
		); err != nil {
			return nil, err
		}
		sk.Enabled = enabledInt == 1
		_ = json.Unmarshal([]byte(tagsJSON), &sk.Tags)
		if sk.Tags == nil {
			sk.Tags = []string{}
		}
		skills = append(skills, sk)
	}
	if skills == nil {
		skills = []AgentSkill{}
	}
	return skills, rows.Err()
}

// AddAgentSkill inserts a new skill for an agent.
func (s *Store) AddAgentSkill(agentID, name, description, content, source, cloudID, author, version string, tags []string) (AgentSkill, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if tags == nil {
		tags = []string{}
	}
	tagsJSON, _ := json.Marshal(tags)
	now := time.Now().UnixMilli()
	id := newSkillID()

	_, err := s.db.Exec(
		`INSERT INTO agent_skills
		 (id, agent_id, name, description, content, enabled, source, cloud_id, author, version, tags, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
		id, agentID, name, description, content, source, cloudID, author, version, string(tagsJSON), now, now,
	)
	if err != nil {
		return AgentSkill{}, err
	}

	return AgentSkill{
		ID:          id,
		AgentID:     agentID,
		Name:        name,
		Description: description,
		Content:     content,
		Enabled:     true,
		Source:      source,
		CloudID:     cloudID,
		Author:      author,
		Version:     version,
		Tags:        tags,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

// UpdateAgentSkill updates the editable fields of a skill by ID.
func (s *Store) UpdateAgentSkill(id, name, description, content string, tags []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if tags == nil {
		tags = []string{}
	}
	tagsJSON, _ := json.Marshal(tags)
	now := time.Now().UnixMilli()

	res, err := s.db.Exec(
		`UPDATE agent_skills SET name=?, description=?, content=?, tags=?, updated_at=? WHERE id=?`,
		name, description, content, string(tagsJSON), now, id,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("skill not found: %s", id)
	}
	return nil
}

// ToggleAgentSkill enables or disables a skill.
func (s *Store) ToggleAgentSkill(id string, enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	enabledInt := 0
	if enabled {
		enabledInt = 1
	}
	now := time.Now().UnixMilli()

	res, err := s.db.Exec(
		`UPDATE agent_skills SET enabled=?, updated_at=? WHERE id=?`,
		enabledInt, now, id,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("skill not found: %s", id)
	}
	return nil
}

// DeleteAgentSkill removes a skill by ID.
func (s *Store) DeleteAgentSkill(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, err := s.db.Exec(`DELETE FROM agent_skills WHERE id=?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("skill not found: %s", id)
	}
	return nil
}

// DeleteAgentSkillsByAgent removes all skills for an agent.
func (s *Store) DeleteAgentSkillsByAgent(agentID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`DELETE FROM agent_skills WHERE agent_id=?`, agentID)
	return err
}
