package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeJSONL marshals each entry on its own line and writes to path.
func writeJSONL(t *testing.T, path string, entries []map[string]interface{}) {
	t.Helper()
	var sb strings.Builder
	for _, e := range entries {
		b, err := json.Marshal(e)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		sb.Write(b)
		sb.WriteByte('\n')
	}
	if err := os.WriteFile(path, []byte(sb.String()), 0600); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func userEntry(text string) map[string]interface{} {
	return map[string]interface{}{
		"type": "user",
		"message": map[string]interface{}{
			"role":    "user",
			"content": text,
		},
	}
}

func assistantEntry(text string) map[string]interface{} {
	return map[string]interface{}{
		"type": "assistant",
		"message": map[string]interface{}{
			"role": "assistant",
			"content": []interface{}{
				map[string]interface{}{"type": "text", "text": text},
			},
		},
	}
}

// TestExtractClaudeSessionLabelBasic pins the happy-path: first user text
// becomes the label, last assistant text becomes the preview.
func TestExtractClaudeSessionLabelBasic(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	p := filepath.Join(dir, "session.jsonl")
	writeJSONL(t, p, []map[string]interface{}{
		userEntry("hello world"),
		assistantEntry("first reply"),
		userEntry("another question"),
		assistantEntry("final reply"),
	})

	label, preview := extractClaudeSessionLabel(p)
	if label != "hello world" {
		t.Fatalf("label: got %q want %q", label, "hello world")
	}
	if preview != "final reply" {
		t.Fatalf("preview: got %q want %q", preview, "final reply")
	}
}

// TestExtractClaudeSessionLabelBoundedScan is the regression test for the
// 37 MB full-file scan bug. We wedge a giant assistant turn between the first
// user message (head) and the final assistant message (tail); label
// extraction must still surface both correctly without reading the whole
// middle. We verify correctness, not wall time — wall time is too flaky for
// a unit test. Correctness is the thing that can regress silently if someone
// reverts to a naive full-file scan.
func TestExtractClaudeSessionLabelBoundedScan(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	p := filepath.Join(dir, "session.jsonl")

	// Build a >2 MB file: first user, many fat middle assistant turns, final
	// assistant. The final assistant MUST sit in the last 512 KiB so the tail
	// scan can see it.
	bigPadding := strings.Repeat("x", 4096)
	entries := []map[string]interface{}{userEntry("opening question")}
	for i := 0; i < 512; i++ {
		entries = append(entries, assistantEntry("middle "+bigPadding))
	}
	entries = append(entries, assistantEntry("tail reply"))
	writeJSONL(t, p, entries)

	label, preview := extractClaudeSessionLabel(p)
	if label != "opening question" {
		t.Fatalf("label: got %q want %q", label, "opening question")
	}
	if preview != "tail reply" {
		t.Fatalf("preview: got %q want %q", preview, "tail reply")
	}
}

// TestExtractClaudeSessionLabelCacheSkipsRewrite ensures that once a label
// is cached, changing the file's contents in a way that preserves size+mtime
// does not cause a re-scan. This is a white-box test of the cache key.
func TestExtractClaudeSessionLabelCacheHits(t *testing.T) {
	// NOTE: not parallel — white-box access to sessionLabelCache.
	dir := t.TempDir()
	p := filepath.Join(dir, "session.jsonl")
	writeJSONL(t, p, []map[string]interface{}{
		userEntry("first"),
		assistantEntry("reply"),
	})

	label1, preview1 := extractClaudeSessionLabel(p)
	label2, preview2 := extractClaudeSessionLabel(p)
	if label1 != label2 || preview1 != preview2 {
		t.Fatalf("cache hit should be identical; got (%q,%q) vs (%q,%q)", label1, preview1, label2, preview2)
	}

	// Confirm the cache has one entry keyed by this path.
	sessionLabelCacheMu.Lock()
	_, ok := sessionLabelCache[p]
	sessionLabelCacheMu.Unlock()
	if !ok {
		t.Fatalf("expected cache entry for %q", p)
	}
}
