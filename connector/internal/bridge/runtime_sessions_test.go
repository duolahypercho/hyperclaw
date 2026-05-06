package bridge

import (
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestGetPrimarySessionSeedsOpenClawHyperclawSession(t *testing.T) {
	st, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	defer st.Close()

	b := &BridgeHandler{store: st}
	result := b.getPrimarySession(map[string]interface{}{
		"agentId": "ada",
		"runtime": "openclaw",
	})
	if result.err != nil {
		t.Fatalf("getPrimarySession: %v", result.err)
	}

	data := result.data.(map[string]interface{})["data"].(map[string]interface{})
	if got := data["sessionKey"]; got != "agent:ada:hyperclaw" {
		t.Fatalf("expected hyperclaw primary session, got %#v", got)
	}
	if got := data["seeded"]; got != true {
		t.Fatalf("expected seeded primary, got %#v", got)
	}
}

func TestGetPrimarySessionMigratesLegacyOpenClawMainSession(t *testing.T) {
	st, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	defer st.Close()

	if err := st.SetPrimarySession("ada", "openclaw", "agent:ada:main"); err != nil {
		t.Fatalf("seed legacy primary: %v", err)
	}

	b := &BridgeHandler{store: st}
	result := b.getPrimarySession(map[string]interface{}{
		"agentId": "ada",
		"runtime": "openclaw",
	})
	if result.err != nil {
		t.Fatalf("getPrimarySession: %v", result.err)
	}

	data := result.data.(map[string]interface{})["data"].(map[string]interface{})
	if got := data["sessionKey"]; got != "agent:ada:hyperclaw" {
		t.Fatalf("expected migrated hyperclaw primary session, got %#v", got)
	}
	if got := data["seeded"]; got != false {
		t.Fatalf("expected stored primary response after migration, got %#v", got)
	}

	stored, err := st.GetPrimarySession("ada", "openclaw")
	if err != nil {
		t.Fatalf("read migrated primary: %v", err)
	}
	if stored != "agent:ada:hyperclaw" {
		t.Fatalf("expected migration to persist hyperclaw primary, got %q", stored)
	}
}

func TestGetPrimarySessionClearsOnlyStaleRuntimePrimary(t *testing.T) {
	st, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	defer st.Close()

	if err := st.SetPrimarySession("ada", "codex", "codex:missing"); err != nil {
		t.Fatalf("seed stale codex primary: %v", err)
	}
	if err := st.SetPrimarySession("ada", "openclaw", "agent:ada:hyperclaw"); err != nil {
		t.Fatalf("seed openclaw primary: %v", err)
	}

	b := &BridgeHandler{store: st}
	result := b.getPrimarySession(map[string]interface{}{
		"agentId": "ada",
		"runtime": "codex",
	})
	if result.err != nil {
		t.Fatalf("getPrimarySession: %v", result.err)
	}

	codexPrimary, err := st.GetPrimarySession("ada", "codex")
	if err != nil {
		t.Fatalf("read codex primary: %v", err)
	}
	if codexPrimary != "" {
		t.Fatalf("expected stale codex primary to be cleared, got %q", codexPrimary)
	}

	openclawPrimary, err := st.GetPrimarySession("ada", "openclaw")
	if err != nil {
		t.Fatalf("read openclaw primary: %v", err)
	}
	if openclawPrimary != "agent:ada:hyperclaw" {
		t.Fatalf("expected openclaw primary to survive stale codex clear, got %q", openclawPrimary)
	}
}
