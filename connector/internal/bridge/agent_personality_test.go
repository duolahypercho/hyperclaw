package bridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestSaveAgentPersonalityDoesNotNestLoadedManagedFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "AGENTS.md")
	initial := "User-authored intro.\n\n" + wrapAgenticStackBlock("Managed payload.")
	if err := os.WriteFile(path, []byte(initial), 0o600); err != nil {
		t.Fatalf("write initial file: %v", err)
	}

	p := LoadAgentPersonality(dir, "ada")
	p.Agents = upsertManagedBlock(p.Agents, "Team mode payload.")
	if err := SaveAgentPersonality(dir, p); err != nil {
		t.Fatalf("first save: %v", err)
	}
	p = LoadAgentPersonality(dir, "ada")
	p.Agents = upsertManagedBlock(p.Agents, "Team mode payload.")
	if err := SaveAgentPersonality(dir, p); err != nil {
		t.Fatalf("second save: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved file: %v", err)
	}
	saved := string(data)
	if got := strings.Count(saved, agenticStackBlockBegin); got != 1 {
		t.Fatalf("expected one managed begin marker, got %d\n%s", got, saved)
	}
	if got := strings.Count(saved, agenticStackBlockEnd); got != 1 {
		t.Fatalf("expected one managed end marker, got %d\n%s", got, saved)
	}
	if got := strings.Count(saved, teamManagedStart); got != 1 {
		t.Fatalf("expected one team mode block, got %d\n%s", got, saved)
	}
}

func TestNormalizeAgenticStackFileContentCollapsesNestedMarkers(t *testing.T) {
	corrupted := strings.Join([]string{
		"User-authored intro.",
		"",
		agenticStackBlockBegin,
		agenticStackBlockNote,
		"",
		"Managed payload.",
		agenticStackBlockBegin,
		agenticStackBlockNote,
		"",
		"Managed payload.",
		agenticStackBlockEnd,
		agenticStackBlockEnd,
		agenticStackBlockEnd,
		"",
	}, "\n")

	normalized := normalizeAgenticStackFileContent(corrupted)
	if got := strings.Count(normalized, agenticStackBlockBegin); got != 1 {
		t.Fatalf("expected one managed begin marker, got %d\n%s", got, normalized)
	}
	if got := strings.Count(normalized, agenticStackBlockEnd); got != 1 {
		t.Fatalf("expected one managed end marker, got %d\n%s", got, normalized)
	}
	if strings.Count(normalized, "Managed payload.") != 1 {
		t.Fatalf("expected one managed payload\n%s", normalized)
	}
	if !strings.Contains(normalized, "User-authored intro.") {
		t.Fatalf("expected user content to survive\n%s", normalized)
	}
}

func TestNormalizeAgenticStackFileContentKeepsBodyAfterEmptyNestedHeader(t *testing.T) {
	corrupted := strings.Join([]string{
		agenticStackBlockBegin,
		agenticStackBlockNote,
		"",
		agenticStackBlockBegin,
		agenticStackBlockNote,
		"",
		teamManagedStart,
		"# HyperClaw Team Snapshot",
		"",
		"Managed role: worker-executor",
		teamManagedEnd,
		agenticStackBlockEnd,
		agenticStackBlockEnd,
		"",
	}, "\n")

	normalized := normalizeAgenticStackFileContent(corrupted)
	if got := strings.Count(normalized, agenticStackBlockBegin); got != 1 {
		t.Fatalf("expected one managed begin marker, got %d\n%s", got, normalized)
	}
	if got := strings.Count(normalized, teamManagedStart); got != 1 {
		t.Fatalf("expected one team mode block, got %d\n%s", got, normalized)
	}
	if !strings.Contains(normalized, "Managed role: worker-executor") {
		t.Fatalf("expected nested body to survive\n%s", normalized)
	}
}

func TestMergePersonalityContentDoesNotAppendDuplicateStarterTemplate(t *testing.T) {
	starter := strings.Join([]string{
		"```markdown",
		"# Keep this file empty (or with only comments) to skip heartbeat API calls.",
		"",
		"# Add tasks below when you want the agent to check something periodically.",
		"```",
		"",
		"## Related",
		"",
		"- [Heartbeat config](/gateway/config-agents)",
		"",
	}, "\n")

	merged := MergePersonalityContent(starter, starter)
	if got := strings.Count(merged, agenticStackBlockBegin); got != 0 {
		t.Fatalf("expected no managed block for duplicate starter template, got %d\n%s", got, merged)
	}
	if strings.Count(merged, "Keep this file empty") != 1 {
		t.Fatalf("expected one copy of starter content\n%s", merged)
	}
}

func TestStripManagedTeamBlockPreservesUserHeartbeat(t *testing.T) {
	existing := strings.Join([]string{
		"# Personal heartbeat",
		"",
		"- Check my own reminders.",
		"",
		teamManagedStart,
		"# HyperClaw Team Heartbeat",
		"",
		"Every heartbeat:",
		"1. List your active projects and running workflow runs.",
		teamManagedEnd,
		"",
		"- Keep this user task.",
		"",
	}, "\n")

	stripped, ok := stripManagedTeamBlock(existing)
	if !ok {
		t.Fatal("expected managed team block to be stripped")
	}
	if strings.Contains(stripped, "HyperClaw Team Heartbeat") {
		t.Fatalf("expected team heartbeat removed\n%s", stripped)
	}
	if !strings.Contains(stripped, "- Check my own reminders.") || !strings.Contains(stripped, "- Keep this user task.") {
		t.Fatalf("expected user-authored heartbeat text to survive\n%s", stripped)
	}
}

func TestStripManagedTeamBlockRemovesDuplicateBlocks(t *testing.T) {
	existing := strings.Join([]string{
		"User intro.",
		"",
		teamManagedStart,
		"First managed block.",
		teamManagedEnd,
		"",
		"User middle.",
		"",
		teamManagedStart,
		"Second managed block.",
		teamManagedEnd,
		"",
		"User outro.",
		"",
	}, "\n")

	stripped, ok := stripManagedTeamBlock(existing)
	if !ok {
		t.Fatal("expected duplicate managed team blocks to be stripped")
	}
	if strings.Contains(stripped, teamManagedStart) || strings.Contains(stripped, "managed block") {
		t.Fatalf("expected all managed team blocks removed\n%s", stripped)
	}
	if !strings.Contains(stripped, "User intro.") || !strings.Contains(stripped, "User middle.") || !strings.Contains(stripped, "User outro.") {
		t.Fatalf("expected all user content to survive\n%s", stripped)
	}
}

func TestUpsertManagedBlockCollapsesDuplicateBlocks(t *testing.T) {
	existing := strings.Join([]string{
		"User intro.",
		"",
		teamManagedStart,
		"Old managed block.",
		teamManagedEnd,
		"",
		"User middle.",
		"",
		teamManagedStart,
		"Duplicate managed block.",
		teamManagedEnd,
		"",
		"User outro.",
		"",
	}, "\n")

	upserted := upsertManagedBlock(existing, "Fresh managed block.")
	if got := strings.Count(upserted, teamManagedStart); got != 1 {
		t.Fatalf("expected one managed team block, got %d\n%s", got, upserted)
	}
	if got := strings.Count(upserted, teamManagedEnd); got != 1 {
		t.Fatalf("expected one managed team end marker, got %d\n%s", got, upserted)
	}
	if strings.Contains(upserted, "Old managed block.") || strings.Contains(upserted, "Duplicate managed block.") {
		t.Fatalf("expected stale managed team blocks removed\n%s", upserted)
	}
	if !strings.Contains(upserted, "Fresh managed block.") {
		t.Fatalf("expected fresh managed block\n%s", upserted)
	}
	if !strings.Contains(upserted, "User intro.") || !strings.Contains(upserted, "User middle.") || !strings.Contains(upserted, "User outro.") {
		t.Fatalf("expected user content to survive\n%s", upserted)
	}
}

func TestStripTeamBlocksFromPersonalityFilesAllowsEmptyManagedFile(t *testing.T) {
	dir := t.TempDir()
	heartbeatPath := filepath.Join(dir, "HEARTBEAT.md")
	agentsPath := filepath.Join(dir, "AGENTS.md")
	if err := os.WriteFile(heartbeatPath, []byte("User note.\n\n"+teamManagedStart+"\nManaged heartbeat.\n"+teamManagedEnd+"\n"), 0o600); err != nil {
		t.Fatalf("write heartbeat: %v", err)
	}
	if err := os.WriteFile(agentsPath, []byte(teamManagedStart+"\nManaged agents.\n"+teamManagedEnd+"\n"), 0o600); err != nil {
		t.Fatalf("write agents: %v", err)
	}

	p := AgentPersonality{AgentID: "ada"}
	changed, err := stripTeamBlocksFromPersonalityFiles(dir, &p)
	if err != nil {
		t.Fatalf("strip team blocks: %v", err)
	}
	if !changed {
		t.Fatal("expected files to change")
	}
	heartbeat, err := os.ReadFile(heartbeatPath)
	if err != nil {
		t.Fatalf("read heartbeat: %v", err)
	}
	if got := string(heartbeat); strings.TrimSpace(got) != "User note." {
		t.Fatalf("expected user heartbeat only, got %q", got)
	}
	agents, err := os.ReadFile(agentsPath)
	if err != nil {
		t.Fatalf("read agents: %v", err)
	}
	if got := string(agents); got != "" {
		t.Fatalf("expected managed-only file to become empty, got %q", got)
	}
}

func TestTeamRoleForIdentityIgnoresMemberOnlyAgents(t *testing.T) {
	ctx := teamBehaviorContext{
		Identity: store.AgentIdentity{ID: "ada", Runtime: "openclaw"},
		Projects: []store.Project{
			{ID: "company-setup", Name: "Company setup", TeamModeEnabled: true},
		},
		LeadProjectIDs: map[string]bool{},
	}

	if role, ok := teamRoleForIdentity(ctx.Identity, ctx); ok {
		t.Fatalf("expected member-only agent to skip team heartbeat, got role %q", role)
	}
}

func TestTeamRoleForIdentityKeepsProjectLeads(t *testing.T) {
	ctx := teamBehaviorContext{
		Identity:       store.AgentIdentity{ID: "main", Runtime: "openclaw"},
		LeadProjectIDs: map[string]bool{"company-setup": true},
	}

	role, ok := teamRoleForIdentity(ctx.Identity, ctx)
	if !ok {
		t.Fatal("expected project lead to keep team heartbeat")
	}
	if role != roleOrchestrator {
		t.Fatalf("expected main to remain orchestrator, got %q", role)
	}

	leadCtx := teamBehaviorContext{
		Identity:       store.AgentIdentity{ID: "ada", Runtime: "openclaw"},
		LeadProjectIDs: map[string]bool{"company-setup": true},
	}
	role, ok = teamRoleForIdentity(leadCtx.Identity, leadCtx)
	if !ok {
		t.Fatal("expected non-main project lead to keep team heartbeat")
	}
	if role != roleLeadManager {
		t.Fatalf("expected lead manager role, got %q", role)
	}
}

func TestMergePersonalityContentKeepsHeartbeatStarterWithUserTasks(t *testing.T) {
	starter := strings.Join([]string{
		"```markdown",
		"# Keep this file empty (or with only comments) to skip heartbeat API calls.",
		"",
		"# Add tasks below when you want the agent to check something periodically.",
		"```",
		"",
		"## Related",
		"",
		"- [Heartbeat config](/gateway/config-agents)",
		"",
	}, "\n")
	withTask := starter + "\n- Check pending project blockers.\n"

	merged := MergePersonalityContent(starter, withTask)
	if got := strings.Count(merged, agenticStackBlockBegin); got != 1 {
		t.Fatalf("expected managed block for edited heartbeat starter, got %d\n%s", got, merged)
	}
	if !strings.Contains(merged, "Check pending project blockers") {
		t.Fatalf("expected user-added heartbeat task to survive\n%s", merged)
	}
}

func TestMergePersonalityContentDropsPlaceholderIdentityWhenFilledIdentityExists(t *testing.T) {
	existing := strings.Join([]string{
		"# IDENTITY.md - Who Am I?",
		"",
		"- **Name:** Ada",
		"- **Creature:** AI agent for social media engagement",
		"",
	}, "\n")
	placeholder := strings.Join([]string{
		"# IDENTITY.md - Who Am I?",
		"",
		"_Fill this in during your first conversation. Make it yours._",
		"",
		"- **Name:**",
		"  _(pick something you like)_",
		"",
	}, "\n")

	merged := MergePersonalityContent(existing, placeholder)
	if got := strings.Count(merged, agenticStackBlockBegin); got != 0 {
		t.Fatalf("expected no managed block for redundant identity placeholder, got %d\n%s", got, merged)
	}
	if !strings.Contains(merged, "- **Name:** Ada") {
		t.Fatalf("expected filled identity to survive\n%s", merged)
	}
}

func TestMergePersonalityContentPreservesExistingUserProseWhenIncomingIsBlockOnly(t *testing.T) {
	existing := "User-authored intro.\n\n" + wrapAgenticStackBlock("Old managed payload.")
	incoming := wrapAgenticStackBlock("New managed payload.")

	merged := MergePersonalityContent(existing, incoming)
	if !strings.Contains(merged, "User-authored intro.") {
		t.Fatalf("expected existing user prose to survive\n%s", merged)
	}
	if !strings.Contains(merged, "New managed payload.") {
		t.Fatalf("expected incoming managed payload\n%s", merged)
	}
	if strings.Contains(merged, "Old managed payload.") {
		t.Fatalf("expected old managed payload replaced\n%s", merged)
	}
}
