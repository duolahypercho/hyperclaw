package store_test

import (
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func testStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestUpsertAndGetAgentIdentity(t *testing.T) {
	s := testStore(t)
	id := store.AgentIdentity{
		ID: "ceo", Name: "CEO Agent", Emoji: "🤖", Runtime: "openclaw",
	}
	if err := s.UpsertAgentIdentity(id); err != nil {
		t.Fatalf("UpsertAgentIdentity: %v", err)
	}
	got, err := s.GetAgentIdentity("ceo")
	if err != nil {
		t.Fatalf("GetAgentIdentity: %v", err)
	}
	if got == nil {
		t.Fatal("expected identity, got nil")
	}
	if got.Name != "CEO Agent" {
		t.Errorf("Name: got %q, want %q", got.Name, "CEO Agent")
	}
	if got.Emoji != "🤖" {
		t.Errorf("Emoji: got %q, want %q", got.Emoji, "🤖")
	}
}

func TestGetAgentIdentityMissing(t *testing.T) {
	s := testStore(t)
	got, err := s.GetAgentIdentity("nonexistent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for missing identity, got %+v", got)
	}
}

func TestAgentIdentityRuntimeIsImmutable(t *testing.T) {
	s := testStore(t)
	if err := s.UpsertAgentIdentity(store.AgentIdentity{
		ID: "ceo", Name: "CEO Agent", Emoji: "🤖", Runtime: "openclaw",
	}); err != nil {
		t.Fatalf("initial UpsertAgentIdentity: %v", err)
	}
	if err := s.UpsertAgentIdentity(store.AgentIdentity{
		ID: "ceo", Name: "CEO Agent", Emoji: "🤖", Runtime: "claude-code",
	}); err != nil {
		t.Fatalf("second UpsertAgentIdentity: %v", err)
	}
	got, err := s.GetAgentIdentity("ceo")
	if err != nil {
		t.Fatalf("GetAgentIdentity: %v", err)
	}
	if got == nil {
		t.Fatal("expected identity, got nil")
	}
	if got.Runtime != "openclaw" {
		t.Fatalf("runtime changed after creation: got %q", got.Runtime)
	}
}

func TestAgentRuntimeIsImmutable(t *testing.T) {
	s := testStore(t)
	if err := s.UpsertAgent(store.SeedAgent{
		ID: "ceo", Name: "CEO Agent", Runtime: "openclaw",
	}); err != nil {
		t.Fatalf("initial UpsertAgent: %v", err)
	}
	if err := s.UpsertAgent(store.SeedAgent{
		ID: "ceo", Name: "CEO Agent", Runtime: "claude-code",
	}); err != nil {
		t.Fatalf("second UpsertAgent: %v", err)
	}
	got, err := s.GetAgent("ceo")
	if err != nil {
		t.Fatalf("GetAgent: %v", err)
	}
	if got == nil {
		t.Fatal("expected agent, got nil")
	}
	if got.Runtime != "openclaw" {
		t.Fatalf("runtime changed after creation: got %q", got.Runtime)
	}
}

func TestExportAgentsByRuntimeIncludesIdentityOnlyRows(t *testing.T) {
	s := testStore(t)
	if err := s.UpsertAgentIdentity(store.AgentIdentity{
		ID: "identity-only", Name: "Identity Only", Emoji: "🧠", AvatarData: "data:image/png;base64,abc", Runtime: "openclaw",
	}); err != nil {
		t.Fatalf("UpsertAgentIdentity: %v", err)
	}
	exports, err := s.ExportAgentsByRuntime("openclaw")
	if err != nil {
		t.Fatalf("ExportAgentsByRuntime: %v", err)
	}
	var found map[string]interface{}
	for _, item := range exports {
		if item["id"] == "identity-only" {
			found = item
			break
		}
	}
	if found == nil {
		t.Fatalf("expected identity-only row in export: %+v", exports)
	}
	identity, ok := found["identity"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected identity payload, got: %+v", found["identity"])
	}
	if identity["avatarData"] != "data:image/png;base64,abc" {
		t.Fatalf("avatarData not exported: %+v", identity)
	}
}
