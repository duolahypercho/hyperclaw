package store

import "testing"

func TestProjectIssueTaskPersistsAndLogs(t *testing.T) {
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	defer s.Close()

	task, err := s.AddTask(map[string]interface{}{
		"_id":             "aaaaaaaaaaaaaaaaaaaaaaaa",
		"title":           "Wire project issue board",
		"description":     "Persist project-scoped issue data",
		"status":          "blocked",
		"projectId":       "project-alpha",
		"assignedAgentId": "agent-elon",
	})
	if err != nil {
		t.Fatalf("AddTask: %v", err)
	}
	if task["id"] != "aaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("AddTask id = %v, want original _id", task["id"])
	}

	issues, err := s.ListTasksByProject("project-alpha")
	if err != nil {
		t.Fatalf("ListTasksByProject: %v", err)
	}
	if len(issues) != 1 {
		t.Fatalf("ListTasksByProject len = %d, want 1", len(issues))
	}
	if issues[0]["projectId"] != "project-alpha" {
		t.Fatalf("projectId = %v, want project-alpha", issues[0]["projectId"])
	}
	if issues[0]["status"] != "blocked" {
		t.Fatalf("status = %v, want blocked", issues[0]["status"])
	}

	logEntry, err := s.AppendTaskLog("aaaaaaaaaaaaaaaaaaaaaaaa", "agent-elon", "comment", "Confirmed database write.", map[string]interface{}{
		"source": "project-issue-test",
	})
	if err != nil {
		t.Fatalf("AppendTaskLog: %v", err)
	}
	if logEntry.TaskID != "aaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("log task id = %s, want canonical issue id", logEntry.TaskID)
	}

	logs, err := s.GetTaskLogs("aaaaaaaaaaaaaaaaaaaaaaaa", "", "comment", 10, 0)
	if err != nil {
		t.Fatalf("GetTaskLogs: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("GetTaskLogs len = %d, want 1", len(logs))
	}
	if logs[0].Content != "Confirmed database write." {
		t.Fatalf("log content = %q", logs[0].Content)
	}
}

func TestInitialProjectSeedsIssuesAndAttachesOnboardingAgents(t *testing.T) {
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New store: %v", err)
	}
	defer s.Close()

	project, err := s.GetProjectWithMembers(initialProjectID)
	if err != nil {
		t.Fatalf("GetProjectWithMembers: %v", err)
	}
	if project == nil {
		t.Fatal("initial company setup project was not seeded")
	}
	if project.Name != "Company setup" {
		t.Fatalf("project name = %q, want Company setup", project.Name)
	}

	issues, err := s.ListTasksByProject(initialProjectID)
	if err != nil {
		t.Fatalf("ListTasksByProject: %v", err)
	}
	if len(issues) != len(initialProjectIssues) {
		t.Fatalf("initial issues = %d, want %d", len(issues), len(initialProjectIssues))
	}

	if err := s.UpsertAgent(SeedAgent{ID: "agent-ops", Name: "Ops Agent", Runtime: "openclaw"}); err != nil {
		t.Fatalf("UpsertAgent: %v", err)
	}
	if err := s.UpsertAgent(SeedAgent{ID: "agent-review", Name: "Review Agent", Runtime: "codex"}); err != nil {
		t.Fatalf("UpsertAgent: %v", err)
	}

	project, err = s.GetProjectWithMembers(initialProjectID)
	if err != nil {
		t.Fatalf("GetProjectWithMembers after agents: %v", err)
	}
	members := map[string]bool{}
	for _, member := range project.Members {
		members[member.AgentID] = true
	}
	for _, agentID := range []string{"agent-ops", "agent-review"} {
		if !members[agentID] {
			t.Fatalf("initial project missing member %s; members=%v", agentID, members)
		}
	}
	if project.LeadAgentID == "" {
		t.Fatal("initial project lead agent was not assigned from onboarded agents")
	}

	if _, err := s.db.Exec(`
		INSERT INTO projects (
			id, name, description, emoji, status, lead_agent_id,
			team_mode_enabled, default_workflow_template_id, created_at, updated_at
		)
		VALUES ('earnings', 'Template', '', '📁', 'active', '', 1, '', 1, 1)
	`); err != nil {
		t.Fatalf("insert template project: %v", err)
	}
	if err := s.EnsureInitialProject(); err != nil {
		t.Fatalf("EnsureInitialProject idempotency: %v", err)
	}

	var templateCount int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM projects WHERE id = 'earnings'`).Scan(&templateCount); err != nil {
		t.Fatalf("count template projects: %v", err)
	}
	if templateCount != 0 {
		t.Fatalf("template project count = %d, want 0", templateCount)
	}

	var issueCount int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM tasks WHERE project_id = ?`, initialProjectID).Scan(&issueCount); err != nil {
		t.Fatalf("count initial issues: %v", err)
	}
	if issueCount != len(initialProjectIssues) {
		t.Fatalf("initial issue count after reseed = %d, want %d", issueCount, len(initialProjectIssues))
	}

	var memberCount int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM project_members WHERE project_id = ?`, initialProjectID).Scan(&memberCount); err != nil {
		t.Fatalf("count members: %v", err)
	}
	if memberCount != 2 {
		t.Fatalf("member count after reseed = %d, want 2", memberCount)
	}
}
