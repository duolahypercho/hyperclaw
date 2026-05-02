package bridge

import (
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestOpenUnassignedIssues(t *testing.T) {
	tasks := []map[string]interface{}{
		{"id": "one", "status": "pending"},
		{"id": "two", "status": "pending", "assignedAgentId": "agent-a"},
		{"id": "three", "status": "completed"},
	}

	open := openUnassignedIssues(tasks)
	if len(open) != 1 || taskMapID(open[0]) != "one" {
		t.Fatalf("expected only unassigned pending issue, got %#v", open)
	}
}

func TestDeletedProjectMateIDs(t *testing.T) {
	members := []store.ProjectMember{
		{AgentID: "active"},
		{AgentID: "missing"},
		{AgentID: "deleting"},
	}
	profiles := map[string]*teammateProfile{
		"active":   {ID: "active"},
		"deleting": {ID: "deleting", Status: "deleting"},
	}

	deleted := deletedProjectMateIDs(members, profiles)
	if len(deleted) != 2 {
		t.Fatalf("expected missing and deleting members, got %#v", deleted)
	}
	wantDeleted := map[string]bool{"missing": true, "deleting": true}
	for _, id := range deleted {
		if !wantDeleted[id] {
			t.Fatalf("unexpected deleted member %q in %#v", id, deleted)
		}
	}
}

func TestChooseBestFitLeadUsesIssueAndSoulOverlap(t *testing.T) {
	project := store.Project{Name: "Billing ingestion", Description: "Stripe invoice import"}
	tasks := []map[string]interface{}{
		{"id": "task-a", "title": "Import Stripe invoices", "description": "Build ingestion pipeline"},
	}
	profiles := []teammateProfile{
		{ID: "ops", Role: "ops", SoulSummary: "customer support approvals"},
		{ID: "data", Role: "data lead", SoulSummary: "Stripe invoice ingestion pipelines"},
	}

	best := chooseBestFitLead(project, tasks, profiles)
	if best == nil || best.ID != "data" {
		t.Fatalf("expected data lead, got %#v", best)
	}
}

func TestChooseBestFitLeadReturnsNilWithoutAvailableProfiles(t *testing.T) {
	project := store.Project{Name: "Missing lead project", Description: "No teammates remain"}

	best := chooseBestFitLead(project, nil, nil)
	if best != nil {
		t.Fatalf("expected no lead candidate, got %#v", best)
	}
}

func TestEmptyProjectCanUseTeamRosterForAssignments(t *testing.T) {
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	defer s.Close()

	if err := s.UpsertAgentIdentity(store.AgentIdentity{
		ID:      "agent-a",
		Name:    "Ava Builder",
		Runtime: "openclaw",
		Role:    "implementation engineer",
	}); err != nil {
		t.Fatalf("upsert identity: %v", err)
	}

	bridge := &BridgeHandler{store: s, paths: ResolvePaths()}
	profiles, byID := bridge.loadTeamTeammateProfiles()
	if len(profiles) != 1 || byID["agent-a"] == nil {
		t.Fatalf("expected global team roster profile, got profiles=%#v byID=%#v", profiles, byID)
	}

	project := store.Project{Name: "Implementation board", Description: "Build project automation"}
	issues := []map[string]interface{}{
		{"id": "issue-a", "status": "pending", "title": "Build live action panel", "description": "Implementation work"},
	}
	assignments := fallbackAssignments(project, issues, profiles)
	if len(assignments) != 1 || assignments[0].AgentID != "agent-a" {
		t.Fatalf("expected assignment from team roster, got %#v", assignments)
	}
}

func TestProjectMemberRoleForAssignmentKeepsLeadRole(t *testing.T) {
	if role := projectMemberRoleForAssignment("lead-agent", "lead-agent"); role != "lead" {
		t.Fatalf("expected lead assignment to keep lead role, got %q", role)
	}
	if role := projectMemberRoleForAssignment("worker-agent", "lead-agent"); role != "contributor" {
		t.Fatalf("expected non-lead assignment to become contributor, got %q", role)
	}
}

func TestNormalizeDispatchResultInfersSuccessWhenRuntimeOmitsFlag(t *testing.T) {
	result := normalizeDispatchResult(map[string]interface{}{
		"content": `{"status":"in_progress","summary":"Started","blocker":null,"artifacts":[]}`,
	})

	if success, _ := result["success"].(bool); !success {
		t.Fatalf("expected success to be inferred when runtime result has no error, got %#v", result)
	}
}

func TestStringFromResultUsesFallbackForNilError(t *testing.T) {
	if got := stringFromResult(nil, "fallback"); got != "fallback" {
		t.Fatalf("expected fallback for nil error, got %q", got)
	}
}

func TestCompactTextKeepsUTF8Valid(t *testing.T) {
	got := compactText("hello 世界 agent", 8)
	if got != "hello 世界..." {
		t.Fatalf("expected rune-safe truncation, got %q", got)
	}
}

func TestParseLeadAssignmentsFromFencedJSON(t *testing.T) {
	raw := "Sure\n```json\n{\"assignments\":[{\"taskId\":\"t1\",\"agentId\":\"a1\",\"reason\":\"fit\"}]}\n```"

	assignments := parseLeadAssignments(raw)
	if len(assignments) != 1 || assignments[0].TaskID != "t1" || assignments[0].AgentID != "a1" {
		t.Fatalf("expected parsed assignment, got %#v", assignments)
	}
}

func TestRuntimeOutcomeStatusMapping(t *testing.T) {
	blocked := parseRuntimeOutcome(`{"status":"blocked","summary":"Need approval","blocker":"Approve deploy","artifacts":[]}`)
	if mapOutcomeStatus(blocked) != "blocked" {
		t.Fatalf("expected blocked, got %#v", blocked)
	}
	done := parseRuntimeOutcome(`{"status":"completed","summary":"Done","blocker":null,"artifacts":["file"]}`)
	if mapOutcomeStatus(done) != "completed" {
		t.Fatalf("expected completed, got %#v", done)
	}
	working := parseRuntimeOutcome("Still working")
	if mapOutcomeStatus(working) != "in_progress" {
		t.Fatalf("expected in_progress, got %#v", working)
	}
}
