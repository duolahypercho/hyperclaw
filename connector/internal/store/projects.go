package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

const initialProjectID = "company-setup"

var templateProjectIDs = []string{"earnings", "support", "refactor", "onboard"}

type initialProjectIssue struct {
	ID          string
	Title       string
	Description string
	Status      string
}

var initialProjectIssues = []initialProjectIssue{
	{
		ID:          "000000000000000000000101",
		Title:       "Confirm company profile",
		Description: "Add the company name, website, positioning, and the short operating context agents should use.",
		Status:      "pending",
	},
	{
		ID:          "000000000000000000000102",
		Title:       "Connect team communication channels",
		Description: "Wire Slack, Discord, Telegram, or WhatsApp so the agent team can receive assignments and report back.",
		Status:      "pending",
	},
	{
		ID:          "000000000000000000000103",
		Title:       "Review the onboarded agent crew",
		Description: "Check each user-created onboarding agent, confirm its role, and decide who owns setup, ops, and review work.",
		Status:      "in_progress",
	},
	{
		ID:          "000000000000000000000104",
		Title:       "Define the first operating workflow",
		Description: "Choose the first recurring workflow for the crew, then convert it into a project board checklist.",
		Status:      "blocked",
	},
}

// Project is a shared workspace grouping agents around a common goal.
type Project struct {
	ID                        string          `json:"id"`
	Name                      string          `json:"name"`
	Description               string          `json:"description"`
	Emoji                     string          `json:"emoji"`
	Status                    string          `json:"status"`
	LeadAgentID               string          `json:"leadAgentId,omitempty"`
	TeamModeEnabled           bool            `json:"teamModeEnabled"`
	DefaultWorkflowTemplateID string          `json:"defaultWorkflowTemplateId,omitempty"`
	CreatedAt                 int64           `json:"createdAt"`
	UpdatedAt                 int64           `json:"updatedAt"`
	Members                   []ProjectMember `json:"members,omitempty"`
}

// ProjectMember links an agent to a project with a role.
type ProjectMember struct {
	ProjectID string `json:"projectId"`
	AgentID   string `json:"agentId"`
	Role      string `json:"role"`
	AddedAt   int64  `json:"addedAt"`
}

func newProjectID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// EnsureInitialProject makes the first-run workspace useful without relying on
// static demo projects. It is safe to call repeatedly as agents are provisioned.
func (s *Store) EnsureInitialProject() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, id := range templateProjectIDs {
		if _, err := tx.Exec(`DELETE FROM projects WHERE id = ?`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE tasks SET project_id = NULL WHERE project_id = ?`, id); err != nil {
			return err
		}
	}

	_, err = tx.Exec(`
		INSERT INTO projects (
			id, name, description, emoji, status, lead_agent_id,
			team_mode_enabled, default_workflow_template_id, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, 'active', '', 1, '', ?, ?)
		ON CONFLICT(id) DO NOTHING
	`, initialProjectID, "Company setup", "Your first operating workspace: profile, channels, agents, and launch workflow.", "🏢", now, now)
	if err != nil {
		return err
	}

	if err := s.ensureInitialProjectIssues(tx, now); err != nil {
		return err
	}
	if err := s.attachKnownAgentsToInitialProject(tx, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ensureInitialProjectIssues(tx *sql.Tx, now int64) error {
	for _, issue := range initialProjectIssues {
		dataBytes, err := json.Marshal(map[string]interface{}{
			"title":       issue.Title,
			"description": issue.Description,
			"status":      issue.Status,
			"priority":    "medium",
			"source":      "initial-project-seed",
		})
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`
			INSERT OR IGNORE INTO tasks (
				id, list_id, project_id, status, assignee_id, due_at,
				data, created_at, updated_at
			)
			VALUES (?, NULL, ?, ?, NULL, NULL, ?, ?, ?)
		`, issue.ID, initialProjectID, issue.Status, string(dataBytes), now, now); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) attachKnownAgentsToInitialProject(tx *sql.Tx, now int64) error {
	rows, err := tx.Query(`
		SELECT id FROM agents
		ORDER BY id ASC
	`)
	if err != nil {
		return err
	}

	var agentIDs []string
	for rows.Next() {
		var agentID string
		if err := rows.Scan(&agentID); err != nil {
			rows.Close()
			return err
		}
		agentID = strings.TrimSpace(agentID)
		if agentID != "" {
			agentIDs = append(agentIDs, agentID)
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	var firstAgentID string
	for _, agentID := range agentIDs {
		if firstAgentID == "" {
			firstAgentID = agentID
		}
		if _, err := tx.Exec(`
			INSERT INTO project_members (project_id, agent_id, role, added_at)
			VALUES (?, ?, 'builder', ?)
			ON CONFLICT(project_id, agent_id) DO NOTHING
		`, initialProjectID, agentID, now); err != nil {
			return err
		}
	}
	if firstAgentID != "" {
		_, err = tx.Exec(`
			UPDATE projects
			SET lead_agent_id = ?, updated_at = ?
			WHERE id = ? AND COALESCE(lead_agent_id, '') = ''
		`, firstAgentID, now, initialProjectID)
	}
	return err
}

// CreateProject inserts a new project and returns it with generated ID.
func (s *Store) CreateProject(name, description, emoji string) (*Project, error) {
	now := time.Now().UnixMilli()
	if emoji == "" {
		emoji = "📁"
	}
	p := &Project{
		ID:              newProjectID(),
		Name:            name,
		Description:     description,
		Emoji:           emoji,
		Status:          "active",
		TeamModeEnabled: true,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	_, err := s.db.Exec(`
		INSERT INTO projects (
			id, name, description, emoji, status, lead_agent_id,
			team_mode_enabled, default_workflow_template_id, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, p.ID, p.Name, p.Description, p.Emoji, p.Status, p.LeadAgentID, boolToInt(p.TeamModeEnabled), p.DefaultWorkflowTemplateID, p.CreatedAt, p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// GetProject returns a single project by ID (without members).
func (s *Store) GetProject(id string) (*Project, error) {
	var p Project
	var teamModeEnabled int
	err := s.db.QueryRow(`
		SELECT id, name, description, emoji, status,
		       COALESCE(lead_agent_id, ''), COALESCE(team_mode_enabled, 0),
		       COALESCE(default_workflow_template_id, ''),
		       created_at, updated_at
		FROM projects WHERE id = ?
	`, id).Scan(
		&p.ID, &p.Name, &p.Description, &p.Emoji, &p.Status,
		&p.LeadAgentID, &teamModeEnabled, &p.DefaultWorkflowTemplateID,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.TeamModeEnabled = teamModeEnabled == 1
	return &p, nil
}

// GetProjectWithMembers returns a project with its full member list.
func (s *Store) GetProjectWithMembers(id string) (*Project, error) {
	p, err := s.GetProject(id)
	if err != nil || p == nil {
		return p, err
	}
	members, err := s.GetProjectMembers(id)
	if err != nil {
		return nil, err
	}
	p.Members = members
	return p, nil
}

// ListProjects returns all projects, optionally filtered by status.
// Pass status="" to return all.
func (s *Store) ListProjects(status string) ([]Project, error) {
	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = s.db.Query(`
			SELECT id, name, description, emoji, status,
			       COALESCE(lead_agent_id, ''), COALESCE(team_mode_enabled, 0),
			       COALESCE(default_workflow_template_id, ''),
			       created_at, updated_at
			FROM projects WHERE status = ? ORDER BY updated_at DESC
		`, status)
	} else {
		rows, err = s.db.Query(`
			SELECT id, name, description, emoji, status,
			       COALESCE(lead_agent_id, ''), COALESCE(team_mode_enabled, 0),
			       COALESCE(default_workflow_template_id, ''),
			       created_at, updated_at
			FROM projects ORDER BY updated_at DESC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		var teamModeEnabled int
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.Emoji, &p.Status,
			&p.LeadAgentID, &teamModeEnabled, &p.DefaultWorkflowTemplateID,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			continue
		}
		p.TeamModeEnabled = teamModeEnabled == 1
		projects = append(projects, p)
	}
	if projects == nil {
		projects = []Project{}
	}

	// Batch-load members for all projects in a single query.
	if len(projects) > 0 {
		placeholders := strings.Repeat("?,", len(projects))
		placeholders = placeholders[:len(placeholders)-1]
		args := make([]interface{}, len(projects))
		for i, p := range projects {
			args[i] = p.ID
		}
		mRows, mErr := s.db.Query(
			`SELECT project_id, agent_id, role, added_at FROM project_members WHERE project_id IN (`+placeholders+`) ORDER BY added_at ASC`,
			args...,
		)
		if mErr == nil {
			defer mRows.Close()
			membersByProject := make(map[string][]ProjectMember)
			for mRows.Next() {
				var m ProjectMember
				if scanErr := mRows.Scan(&m.ProjectID, &m.AgentID, &m.Role, &m.AddedAt); scanErr == nil {
					membersByProject[m.ProjectID] = append(membersByProject[m.ProjectID], m)
				}
			}
			for i, p := range projects {
				if members, ok := membersByProject[p.ID]; ok {
					projects[i].Members = members
				} else {
					projects[i].Members = []ProjectMember{}
				}
			}
		}
	}

	return projects, nil
}

// UpdateProject patches a project's fields. Only non-empty string values are applied.
func (s *Store) UpdateProject(id, name, description, emoji, status string, leadAgentID *string, teamModeEnabled *bool, defaultWorkflowTemplateID *string) (*Project, error) {
	p, err := s.GetProject(id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, nil
	}
	if name != "" {
		p.Name = name
	}
	if description != "" {
		p.Description = description
	}
	if emoji != "" {
		p.Emoji = emoji
	}
	if status != "" {
		p.Status = status
	}
	if leadAgentID != nil {
		p.LeadAgentID = *leadAgentID
	}
	if teamModeEnabled != nil {
		p.TeamModeEnabled = *teamModeEnabled
	}
	if defaultWorkflowTemplateID != nil {
		p.DefaultWorkflowTemplateID = *defaultWorkflowTemplateID
	}
	p.UpdatedAt = time.Now().UnixMilli()
	_, err = s.db.Exec(`
		UPDATE projects
		SET name = ?, description = ?, emoji = ?, status = ?, lead_agent_id = ?,
		    team_mode_enabled = ?, default_workflow_template_id = ?, updated_at = ?
		WHERE id = ?
	`, p.Name, p.Description, p.Emoji, p.Status, p.LeadAgentID, boolToInt(p.TeamModeEnabled), p.DefaultWorkflowTemplateID, p.UpdatedAt, p.ID)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// DeleteProject removes a project and its members (CASCADE handles members).
func (s *Store) DeleteProject(id string) (bool, error) {
	result, err := s.db.Exec(`DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := result.RowsAffected()
	return n > 0, nil
}

// AddProjectMember adds an agent to a project. Upserts on conflict.
func (s *Store) AddProjectMember(projectID, agentID, role string) error {
	if role == "" {
		role = "contributor"
	}
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`
		INSERT INTO project_members (project_id, agent_id, role, added_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(project_id, agent_id) DO UPDATE SET role = excluded.role
	`, projectID, agentID, role, now)
	if err != nil {
		return err
	}
	// Bump project updated_at so list views re-sort
	s.db.Exec(`UPDATE projects SET updated_at = ? WHERE id = ?`, now, projectID)
	return nil
}

// RemoveProjectMember removes an agent from a project.
func (s *Store) RemoveProjectMember(projectID, agentID string) (bool, error) {
	result, err := s.db.Exec(`
		DELETE FROM project_members WHERE project_id = ? AND agent_id = ?
	`, projectID, agentID)
	if err != nil {
		return false, err
	}
	n, _ := result.RowsAffected()
	return n > 0, nil
}

// GetProjectMembers returns all members of a project.
func (s *Store) GetProjectMembers(projectID string) ([]ProjectMember, error) {
	rows, err := s.db.Query(`
		SELECT project_id, agent_id, role, added_at
		FROM project_members WHERE project_id = ? ORDER BY added_at ASC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []ProjectMember
	for rows.Next() {
		var m ProjectMember
		if err := rows.Scan(&m.ProjectID, &m.AgentID, &m.Role, &m.AddedAt); err != nil {
			continue
		}
		members = append(members, m)
	}
	if members == nil {
		members = []ProjectMember{}
	}
	return members, nil
}

// GetAgentProjects returns all projects an agent belongs to.
func (s *Store) GetAgentProjects(agentID string) ([]Project, error) {
	rows, err := s.db.Query(`
		SELECT p.id, p.name, p.description, p.emoji, p.status,
		       COALESCE(p.lead_agent_id, ''), COALESCE(p.team_mode_enabled, 0),
		       COALESCE(p.default_workflow_template_id, ''),
		       p.created_at, p.updated_at
		FROM projects p
		JOIN project_members pm ON pm.project_id = p.id
		WHERE pm.agent_id = ?
		ORDER BY p.updated_at DESC
	`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		var teamModeEnabled int
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Description, &p.Emoji, &p.Status,
			&p.LeadAgentID, &teamModeEnabled, &p.DefaultWorkflowTemplateID,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			continue
		}
		p.TeamModeEnabled = teamModeEnabled == 1
		projects = append(projects, p)
	}
	if projects == nil {
		projects = []Project{}
	}
	return projects, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
