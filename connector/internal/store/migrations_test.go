package store_test

import (
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestMigrationsApply(t *testing.T) {
	s, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	tables := []string{
		"agent_identity", "agent_files", "agent_tools",
		"token_usage", "model_prices",
	}
	for _, tbl := range tables {
		var name string
		err := s.DB().QueryRow(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?", tbl,
		).Scan(&name)
		if err != nil {
			t.Errorf("table %q not found: %v", tbl, err)
		}
	}
}
