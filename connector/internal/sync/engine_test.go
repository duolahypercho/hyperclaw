package sync_test

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
	synce "github.com/hypercho/hyperclaw-connector/internal/sync"
)

func testSyncStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestSyncEnginePicksUpFileChange(t *testing.T) {
	s := testSyncStore(t)

	home := filepath.Join(t.TempDir(), "home")
	agentDir := filepath.Join(home, ".openclaw", "workspace-ceo")
	_ = os.MkdirAll(agentDir, 0755)
	soulPath := filepath.Join(agentDir, "SOUL.md")
	_ = os.WriteFile(soulPath, []byte("initial content"), 0600)

	var notified atomic.Bool
	engine, err := synce.New(s, func(evt string, data map[string]interface{}) {
		if evt == "agent.file.changed" {
			notified.Store(true)
		}
	}, home)
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Stop()

	// Cold sync should have picked up the file.
	f, err := s.GetAgentFile("ceo", "SOUL")
	if err != nil || f == nil {
		t.Fatal("cold sync did not populate agent_files")
	}
	if f.Content != "initial content" {
		t.Errorf("content: got %q, want %q", f.Content, "initial content")
	}

	// Simulate an external edit.
	_ = os.WriteFile(soulPath, []byte("updated content"), 0600)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		f2, _ := s.GetAgentFile("ceo", "SOUL")
		if f2 != nil && f2.Content == "updated content" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	f2, _ := s.GetAgentFile("ceo", "SOUL")
	if f2 == nil || f2.Content != "updated content" {
		t.Error("file change not synced to SQLite within 2s")
	}
	if !notified.Load() {
		t.Error("hub notify not called")
	}
}

func TestWriteAgentFile(t *testing.T) {
	s := testSyncStore(t)

	home := filepath.Join(t.TempDir(), "home")
	agentDir := filepath.Join(home, ".openclaw", "workspace-ceo")
	_ = os.MkdirAll(agentDir, 0755)
	soulPath := filepath.Join(agentDir, "SOUL.md")

	// WriteAgentFile calls notify synchronously (not via work goroutine),
	// so notifiedEvent is safe to read after the call returns without extra sync.
	var notifiedEvent string
	engine, err := synce.New(s, func(evt string, data map[string]interface{}) {
		notifiedEvent = evt
	}, home)
	if err != nil {
		t.Fatal(err)
	}
	defer engine.Stop()

	content := "You are a CEO agent."
	if err := engine.WriteAgentFile("ceo", "SOUL", content, soulPath, "openclaw"); err != nil {
		t.Fatalf("WriteAgentFile: %v", err)
	}

	// File should be on disk.
	data, err := os.ReadFile(soulPath)
	if err != nil {
		t.Fatalf("file not written: %v", err)
	}
	// normContent may or may not add a trailing newline; both are acceptable.
	if got := string(data); got != content && got != content+"\n" {
		t.Errorf("file content: got %q, want %q (or with trailing newline)", got, content)
	}

	// SQLite should have the content.
	f, err := s.GetAgentFile("ceo", "SOUL")
	if err != nil || f == nil {
		t.Fatal("WriteAgentFile did not upsert SQLite")
	}
	if f.Content != content {
		t.Errorf("SQLite content: got %q, want %q", f.Content, content)
	}

	// Hub should have been notified synchronously.
	if notifiedEvent != "agent.file.changed" {
		t.Errorf("hub event: got %q, want %q", notifiedEvent, "agent.file.changed")
	}
}
