package store_test

import (
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestInsertAndQueryTokenUsage(t *testing.T) {
	s := testStore(t)
	if err := s.SeedModelPrices(); err != nil {
		t.Fatalf("SeedModelPrices: %v", err)
	}

	row := store.TokenUsageRow{
		DedupKey:     "claude-code:session1:0",
		AgentID:      "ceo",
		Runtime:      "claude-code",
		Model:        "claude-sonnet-4-6",
		InputTokens:  1000,
		OutputTokens: 200,
		RecordedAt:   1000000,
	}
	row.CostUSD = s.ComputeCostUSD(row.Model, row.InputTokens, row.OutputTokens, 0, row.RecordedAt)

	if err := s.InsertTokenUsage(row); err != nil {
		t.Fatalf("InsertTokenUsage: %v", err)
	}
	// Duplicate insert must be silently ignored (dedup_key unique + INSERT OR IGNORE)
	if err := s.InsertTokenUsage(row); err != nil {
		t.Fatalf("duplicate insert should not error: %v", err)
	}

	summaries, err := s.GetTokenUsage("ceo", "", 0, 0, "agent")
	if err != nil {
		t.Fatalf("GetTokenUsage: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected 1 summary, got %d", len(summaries))
	}
	if summaries[0].InputTokens != 1000 {
		t.Errorf("InputTokens: got %d, want 1000", summaries[0].InputTokens)
	}
	if summaries[0].TotalCostUSD <= 0 {
		t.Errorf("expected positive cost, got %f", summaries[0].TotalCostUSD)
	}
}

func TestPruneTokenUsage(t *testing.T) {
	s := testStore(t)
	_ = s.SeedModelPrices()

	old := store.TokenUsageRow{
		DedupKey:   "old:1",
		Runtime:    "claude-code",
		RecordedAt: 1000, // very old
	}
	recent := store.TokenUsageRow{
		DedupKey:   "recent:1",
		Runtime:    "claude-code",
		RecordedAt: 9999999999999, // far future
	}
	_ = s.InsertTokenUsage(old)
	_ = s.InsertTokenUsage(recent)

	pruned, err := s.PruneTokenUsage(5000) // delete rows older than 5000ms
	if err != nil {
		t.Fatalf("PruneTokenUsage: %v", err)
	}
	if pruned != 1 {
		t.Errorf("expected 1 pruned, got %d", pruned)
	}
	// Recent row must still be there
	summaries, _ := s.GetTokenUsage("", "claude-code", 0, 0, "runtime")
	if len(summaries) != 1 {
		t.Errorf("expected 1 remaining row, got %d", len(summaries))
	}
}
