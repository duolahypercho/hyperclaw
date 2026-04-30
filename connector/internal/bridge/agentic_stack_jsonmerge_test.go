package bridge

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestMergeJSONFileContent_AddsHyperclawEntryPreservingOthers(t *testing.T) {
	existing := []byte(`{
  "mcpServers": {
    "userTool": {
      "type": "http",
      "url": "https://other.example/mcp"
    }
  }
}`)
	incoming := []byte(`{
  "mcpServers": {
    "hyperclaw": {
      "type": "http",
      "url": "http://127.0.0.1:18790/mcp",
      "headers": {"Authorization": "Bearer abc"}
    }
  }
}`)
	out, status, err := mergeJSONFileContent(existing, incoming)
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if status != "merged" {
		t.Fatalf("status = %q, want merged", status)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("output not JSON: %v", err)
	}
	servers, _ := parsed["mcpServers"].(map[string]interface{})
	if _, ok := servers["userTool"]; !ok {
		t.Fatalf("userTool was dropped during merge: %s", out)
	}
	if _, ok := servers["hyperclaw"]; !ok {
		t.Fatalf("hyperclaw not added: %s", out)
	}
}

func TestMergeJSONFileContent_IdempotentOnRerun(t *testing.T) {
	existing := []byte(`{
  "mcpServers": {
    "hyperclaw": {
      "type": "http",
      "url": "http://127.0.0.1:18790/mcp",
      "headers": {"Authorization": "Bearer abc"}
    }
  }
}
`)
	out, status, err := mergeJSONFileContent(existing, existing)
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if status != "unchanged" && status != "merged" {
		t.Fatalf("unexpected status %q", status)
	}
	// Run again; the result should remain stable.
	out2, _, err := mergeJSONFileContent(out, existing)
	if err != nil {
		t.Fatalf("merge2: %v", err)
	}
	if string(out2) != string(out) {
		t.Fatalf("not idempotent on re-run:\nfirst:  %s\nsecond: %s", out, out2)
	}
}

func TestMergeJSONFileContent_HookArrayDedup(t *testing.T) {
	existing := []byte(`{
  "hooks": {
    "Stop": [
      {"matcher": "user", "hooks": [{"type": "command", "command": "echo user"}]}
    ]
  }
}`)
	incoming := []byte(`{
  "hooks": {
    "Stop": [
      {"matcher": "*", "hooks": [{"type": "command", "command": "test -f .agent/AGENTS.md"}]}
    ]
  }
}`)
	out, _, err := mergeJSONFileContent(existing, incoming)
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if !strings.Contains(string(out), "echo user") {
		t.Fatalf("user hook lost: %s", out)
	}
	if !strings.Contains(string(out), ".agent/AGENTS.md") {
		t.Fatalf("hyperclaw hook missing: %s", out)
	}
	// Run again; must not duplicate.
	out2, _, err := mergeJSONFileContent(out, incoming)
	if err != nil {
		t.Fatalf("merge2: %v", err)
	}
	count := strings.Count(string(out2), ".agent/AGENTS.md")
	if count != 1 {
		t.Fatalf("hyperclaw hook duplicated on re-run (count=%d): %s", count, out2)
	}
}

func TestMergeJSONFileContent_RejectsInvalidJSON(t *testing.T) {
	existing := []byte(`not json`)
	incoming := []byte(`{"mcpServers": {}}`)
	if _, _, err := mergeJSONFileContent(existing, incoming); err == nil {
		t.Fatal("expected error for unparseable existing")
	}
}
