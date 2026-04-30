package store_test

import (
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestUpsertAndGetAgentFile(t *testing.T) {
	s := testStore(t)
	if err := s.UpsertAgentFile("ceo", "SOUL", "You are a CEO.", "abc123"); err != nil {
		t.Fatalf("UpsertAgentFile: %v", err)
	}
	f, err := s.GetAgentFile("ceo", "SOUL")
	if err != nil {
		t.Fatalf("GetAgentFile: %v", err)
	}
	if f == nil {
		t.Fatal("expected file, got nil")
	}
	if f.Content != "You are a CEO." {
		t.Errorf("Content: got %q, want %q", f.Content, "You are a CEO.")
	}
	if f.ContentHash != "abc123" {
		t.Errorf("ContentHash: got %q, want %q", f.ContentHash, "abc123")
	}
}

func TestGetAgentFileHash(t *testing.T) {
	s := testStore(t)
	_ = s.UpsertAgentFile("ceo", "SOUL", "content", "hash1")
	hash, err := s.GetAgentFileHash("ceo", "SOUL")
	if err != nil {
		t.Fatalf("GetAgentFileHash: %v", err)
	}
	if hash != "hash1" {
		t.Errorf("hash: got %q, want %q", hash, "hash1")
	}
	// Missing entry returns empty string, no error
	missing, err := s.GetAgentFileHash("ceo", "NONEXISTENT")
	if err != nil {
		t.Fatalf("unexpected error for missing: %v", err)
	}
	if missing != "" {
		t.Errorf("expected empty hash for missing, got %q", missing)
	}
}

func TestDeleteAgentFiles(t *testing.T) {
	s := testStore(t)
	_ = s.UpsertAgentFile("ceo", "SOUL", "x", "h1")
	_ = s.UpsertAgentFile("ceo", "USER", "y", "h2")
	if err := s.DeleteAgentFiles("ceo"); err != nil {
		t.Fatalf("DeleteAgentFiles: %v", err)
	}
	f, _ := s.GetAgentFile("ceo", "SOUL")
	if f != nil {
		t.Error("expected nil after delete")
	}
}

// Ensure AgentFile type is accessible (compile-time check)
var _ store.AgentFile
