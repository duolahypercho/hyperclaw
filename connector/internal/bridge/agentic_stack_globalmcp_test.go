package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestRegisterGlobalHyperclawMCP_PerRuntime verifies the user-global MCP
// hook writes the right file with the right shape for each runtime, and
// preserves any existing user content.
func TestRegisterGlobalHyperclawMCP_PerRuntime(t *testing.T) {
	cases := []struct {
		runtime  string
		path     string
		preWrite string
		mustHave []string
	}{
		{
			runtime:  "claude-code",
			path:     ".claude.json",
			preWrite: `{"mcpServers": {"existing": {"type": "http", "url": "https://x"}}}`,
			mustHave: []string{`"existing"`, `"hyperclaw"`, "127.0.0.1"},
		},
		{
			runtime:  "codex",
			path:     ".codex/config.toml",
			preWrite: "# user-authored\n[other_server]\nkey = \"value\"\n",
			mustHave: []string{"# user-authored", "[mcp_servers.hyperclaw]", "BEGIN HYPERCLAW AGENTIC STACK"},
		},
		{
			runtime:  "openclaw",
			path:     ".openclaw/mcp.json",
			preWrite: `{"mcpServers": {"local": {"url": "ws://localhost"}}}`,
			mustHave: []string{`"local"`, `"hyperclaw"`, "127.0.0.1"},
		},
		{
			runtime:  "hermes",
			path:     "",
			preWrite: "",
			mustHave: nil, // hermes returns "skipped"
		},
	}
	for _, tc := range cases {
		t.Run(tc.runtime, func(t *testing.T) {
			home := t.TempDir()
			b := NewBridgeHandler()
			b.paths = Paths{
				Home:      home,
				OpenClaw:  filepath.Join(home, ".openclaw"),
				HyperClaw: filepath.Join(home, ".hyperclaw"),
				Hermes:    filepath.Join(home, ".hermes"),
			}
			if err := b.paths.EnsureDirectories(); err != nil {
				t.Fatalf("ensure dirs: %v", err)
			}
			if tc.preWrite != "" {
				dst := filepath.Join(home, tc.path)
				if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
					t.Fatalf("mkdir: %v", err)
				}
				if err := os.WriteFile(dst, []byte(tc.preWrite), 0o644); err != nil {
					t.Fatalf("pre-write: %v", err)
				}
			}

			result := b.registerGlobalHyperclawMCP(tc.runtime)
			status, _ := result["status"].(string)
			if tc.runtime == "hermes" {
				if status != "skipped" {
					t.Fatalf("hermes should be skipped, got %q (%+v)", status, result)
				}
				return
			}
			if status != "ok" {
				t.Fatalf("%s: status = %q (%+v)", tc.runtime, status, result)
			}

			data, err := os.ReadFile(filepath.Join(home, tc.path))
			if err != nil {
				t.Fatalf("read %s: %v", tc.path, err)
			}
			for _, s := range tc.mustHave {
				if !strings.Contains(string(data), s) {
					t.Fatalf("%s missing %q\n%s", tc.path, s, data)
				}
			}

			// JSON shapes must round-trip.
			if strings.HasSuffix(tc.path, ".json") {
				var parsed map[string]interface{}
				if err := json.Unmarshal(data, &parsed); err != nil {
					t.Fatalf("%s is not valid JSON: %v\n%s", tc.path, err, data)
				}
			}

			// Idempotency: rerunning must not duplicate the entry.
			result2 := b.registerGlobalHyperclawMCP(tc.runtime)
			if s2, _ := result2["status"].(string); s2 != "ok" {
				t.Fatalf("%s second run status = %q", tc.runtime, s2)
			}
			data2, _ := os.ReadFile(filepath.Join(home, tc.path))
			// hyperclaw entry should appear exactly once.
			if c := strings.Count(string(data2), "127.0.0.1"); c != 1 {
				t.Fatalf("%s: hyperclaw entry duplicated on rerun (count=%d):\n%s", tc.path, c, data2)
			}
		})
	}
}
