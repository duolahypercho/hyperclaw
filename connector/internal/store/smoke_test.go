package store_test

import (
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestAgentSkillsAndMCPs(t *testing.T) {
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	const agentID = "smoke-test-agent"

	// ── Skills ──────────────────────────────────────────────────
	skill, err := s.AddAgentSkill(agentID, "Smoke Skill", "test desc", "echo hello", "custom", "", "", "1.0.0", []string{"test"})
	if err != nil {
		t.Fatalf("AddAgentSkill: %v", err)
	}
	t.Logf("✅ AddAgentSkill id=%s", skill.ID)

	skills, err := s.ListAgentSkills(agentID)
	if err != nil {
		t.Fatalf("ListAgentSkills: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill, got %d", len(skills))
	}
	if skills[0].Name != "Smoke Skill" {
		t.Fatalf("name mismatch: %s", skills[0].Name)
	}
	if !skills[0].Enabled {
		t.Fatal("expected skill to be enabled by default")
	}
	t.Logf("✅ ListAgentSkills count=%d name=%q enabled=%v", len(skills), skills[0].Name, skills[0].Enabled)

	if err := s.UpdateAgentSkill(skill.ID, "Updated Skill", "new desc", "new content", []string{"updated"}); err != nil {
		t.Fatalf("UpdateAgentSkill: %v", err)
	}
	skills2, _ := s.ListAgentSkills(agentID)
	if skills2[0].Name != "Updated Skill" {
		t.Fatalf("name not updated: %s", skills2[0].Name)
	}
	if skills2[0].Content != "new content" {
		t.Fatalf("content not updated: %s", skills2[0].Content)
	}
	t.Logf("✅ UpdateAgentSkill name=%q content=%q", skills2[0].Name, skills2[0].Content)

	if err := s.ToggleAgentSkill(skill.ID, false); err != nil {
		t.Fatalf("ToggleAgentSkill: %v", err)
	}
	skills3, _ := s.ListAgentSkills(agentID)
	if skills3[0].Enabled {
		t.Fatal("expected skill to be disabled after toggle")
	}
	t.Logf("✅ ToggleAgentSkill -> enabled=%v", skills3[0].Enabled)

	if err := s.DeleteAgentSkill(skill.ID); err != nil {
		t.Fatalf("DeleteAgentSkill: %v", err)
	}
	skills4, _ := s.ListAgentSkills(agentID)
	if len(skills4) != 0 {
		t.Fatalf("expected 0 skills after delete, got %d", len(skills4))
	}
	t.Log("✅ DeleteAgentSkill -> count=0")

	// ── MCPs ────────────────────────────────────────────────────
	mcp, err := s.AddAgentMCP(agentID, "filesystem", "stdio", "npx",
		[]string{"-y", "@modelcontextprotocol/server-filesystem", "/tmp"},
		"", map[string]string{"X-Auth": "token123"}, map[string]string{"DEBUG": "1"})
	if err != nil {
		t.Fatalf("AddAgentMCP: %v", err)
	}
	t.Logf("✅ AddAgentMCP id=%s", mcp.ID)

	mcps, err := s.ListAgentMCPs(agentID)
	if err != nil {
		t.Fatalf("ListAgentMCPs: %v", err)
	}
	if len(mcps) != 1 {
		t.Fatalf("expected 1 mcp, got %d", len(mcps))
	}
	m := mcps[0]
	if m.Name != "filesystem" {
		t.Fatalf("name mismatch: %s", m.Name)
	}
	if m.TransportType != "stdio" {
		t.Fatalf("transport mismatch: %s", m.TransportType)
	}
	if len(m.Args) != 3 {
		t.Fatalf("args not round-tripped: %v", m.Args)
	}
	if m.Env["DEBUG"] != "1" {
		t.Fatalf("env not round-tripped: %v", m.Env)
	}
	if !m.Enabled {
		t.Fatal("expected mcp to be enabled by default")
	}
	t.Logf("✅ ListAgentMCPs name=%q transport=%q args=%v env=%v enabled=%v",
		m.Name, m.TransportType, m.Args, m.Env, m.Enabled)

	if err := s.UpdateAgentMCP(mcp.ID, "filesystem-v2", "stdio", "uvx",
		[]string{"mcp-server-filesystem", "/tmp"}, "", map[string]string{}, map[string]string{}); err != nil {
		t.Fatalf("UpdateAgentMCP: %v", err)
	}
	mcps2, _ := s.ListAgentMCPs(agentID)
	if mcps2[0].Name != "filesystem-v2" {
		t.Fatalf("name not updated: %s", mcps2[0].Name)
	}
	if mcps2[0].Command != "uvx" {
		t.Fatalf("command not updated: %s", mcps2[0].Command)
	}
	t.Logf("✅ UpdateAgentMCP name=%q command=%q", mcps2[0].Name, mcps2[0].Command)

	if err := s.ToggleAgentMCP(mcp.ID, false); err != nil {
		t.Fatalf("ToggleAgentMCP: %v", err)
	}
	mcps3, _ := s.ListAgentMCPs(agentID)
	if mcps3[0].Enabled {
		t.Fatal("expected mcp to be disabled after toggle")
	}
	t.Logf("✅ ToggleAgentMCP -> enabled=%v", mcps3[0].Enabled)

	if err := s.DeleteAgentMCP(mcp.ID); err != nil {
		t.Fatalf("DeleteAgentMCP: %v", err)
	}
	mcps4, _ := s.ListAgentMCPs(agentID)
	if len(mcps4) != 0 {
		t.Fatalf("expected 0 mcps after delete, got %d", len(mcps4))
	}
	t.Log("✅ DeleteAgentMCP -> count=0")
}

func TestMigrationCreatesNewTables(t *testing.T) {
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	for _, tbl := range []string{"agent_skills", "agent_mcps"} {
		var name string
		if err := s.DB().QueryRow(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?", tbl,
		).Scan(&name); err != nil {
			t.Fatalf("table %q missing after migration: %v", tbl, err)
		}
		t.Logf("✅ table %q exists", name)
	}
}
