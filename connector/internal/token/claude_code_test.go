package token_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/token"
)

func TestParseClaudeCodeSessionFile(t *testing.T) {
	content := `{"type":"user","message":{"role":"user","content":"hi"}}
{"type":"assistant","message":{"role":"assistant","content":"hello"},"model":"claude-sonnet-4-6","usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":0}}
{"type":"result","subtype":"success","model":"claude-sonnet-4-6","usage":{"input_tokens":15,"output_tokens":8}}
`
	tmp := filepath.Join(t.TempDir(), "session.jsonl")
	_ = os.WriteFile(tmp, []byte(content), 0600)

	rows, err := token.ParseClaudeCodeSessionFile(tmp)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if rows[0].InputTokens != 10 {
		t.Errorf("row[0] InputTokens: got %d, want 10", rows[0].InputTokens)
	}
	if rows[0].DedupKey == rows[1].DedupKey {
		t.Error("dedup keys must be unique per turn")
	}
	// Lines with no usage must be skipped.
	for _, r := range rows {
		if r.InputTokens == 0 && r.OutputTokens == 0 {
			t.Error("rows with zero tokens should be skipped")
		}
	}
}
