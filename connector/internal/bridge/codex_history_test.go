package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindCodexSessionFileCachesValidatedPath(t *testing.T) {
	resetCodexSessionFileCacheForTest()
	t.Cleanup(resetCodexSessionFileCacheForTest)

	home := t.TempDir()
	sessionID := "11111111-2222-3333-4444-555555555555"
	sessionDir := filepath.Join(home, ".codex", "sessions", "2026", "05", "01")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	sessionFile := filepath.Join(sessionDir, "rollout-2026-05-01T00-00-00-"+sessionID+".jsonl")
	if err := os.WriteFile(sessionFile, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("write session file: %v", err)
	}

	if got := findCodexSessionFile(home, sessionID); got != sessionFile {
		t.Fatalf("expected first lookup to find file, got %q", got)
	}
	if err := os.WriteFile(sessionFile, []byte("{}\n{\"type\":\"response_item\"}\n"), 0o644); err != nil {
		t.Fatalf("append session file: %v", err)
	}
	if got := findCodexSessionFile(home, sessionID); got != sessionFile {
		t.Fatalf("expected cached lookup to survive file growth, got %q", got)
	}

	stats := codexSessionFileCacheStatsForTest()
	if stats.walks != 1 {
		t.Fatalf("expected only one filesystem walk after cached lookup, got %d", stats.walks)
	}
}
