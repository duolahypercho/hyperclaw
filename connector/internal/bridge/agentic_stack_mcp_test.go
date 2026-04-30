package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestAgenticStack_AllAdaptersWriteMCPWiring exercises the full install path
// for claude-code, codex, openclaw, and hermes adapters and verifies each one
// produces the expected MCP wiring on disk plus a properly-rendered tools
// catalog. This is the end-to-end check for Phase 2 + Phase 3: any agent
// runtime that reads its own config/skill files will discover the Hyperclaw
// tools without further configuration.
func TestAgenticStack_AllAdaptersWriteMCPWiring(t *testing.T) {
	cases := []struct {
		adapter      string
		expectFiles  []string
		mustContain  map[string][]string
		expectMissing []string
	}{
		{
			adapter:     "claude-code",
			expectFiles: []string{"CLAUDE.md", ".claude/settings.json", ".mcp.json"},
			mustContain: map[string][]string{
				"CLAUDE.md": {"Hyperclaw tools", "hyperclaw.agents.create"},
				".mcp.json": {"\"hyperclaw\"", "\"http\"", "127.0.0.1"},
			},
		},
		{
			adapter:     "codex",
			expectFiles: []string{"AGENTS.md", ".codex/config.toml"},
			mustContain: map[string][]string{
				"AGENTS.md":         {"Hyperclaw tools", "hyperclaw.agents.create"},
				".codex/config.toml": {"[mcp_servers.hyperclaw]", "http", "127.0.0.1"},
			},
		},
		{
			adapter:     "openclaw",
			expectFiles: []string{"AGENTS.md", ".openclaw-system.md", ".openclaw/mcp.json"},
			mustContain: map[string][]string{
				"AGENTS.md":          {"Hyperclaw tools"},
				".openclaw/mcp.json": {"\"hyperclaw\"", "127.0.0.1"},
			},
		},
		{
			adapter:     "hermes",
			expectFiles: []string{"AGENTS.md"},
			mustContain: map[string][]string{
				"AGENTS.md": {"Hyperclaw tools", "127.0.0.1", "/mcp/call", "hyperclaw.agents.create"},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.adapter, func(t *testing.T) {
			home := t.TempDir()
			workspace := filepath.Join(home, "ws")
			if err := os.MkdirAll(workspace, 0o755); err != nil {
				t.Fatalf("mkdir workspace: %v", err)
			}
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

			// openclaw_register_workspace shells out to the openclaw binary,
			// which the test environment may not have installed. Skip the
			// post-install side effects by ensuring the openclaw test still
			// validates files-only (the binary missing branch returns warning,
			// which doesn't block the install).
			result := b.agenticStackAdapterAdd(map[string]interface{}{
				"adapter":    tc.adapter,
				"targetRoot": workspace,
			})
			body, ok := result.data.(map[string]interface{})
			if !ok {
				t.Fatalf("expected map result, got %T: %+v", result.data, result.data)
			}
			if success, _ := body["success"].(bool); !success {
				t.Fatalf("install failed: %+v", body)
			}

			for _, rel := range tc.expectFiles {
				abs := filepath.Join(workspace, rel)
				info, err := os.Stat(abs)
				if err != nil {
					t.Fatalf("expected file %s: %v", rel, err)
				}
				if info.IsDir() {
					t.Fatalf("expected %s to be a file, got dir", rel)
				}
				raw, err := os.ReadFile(abs)
				if err != nil {
					t.Fatalf("read %s: %v", rel, err)
				}
				for _, must := range tc.mustContain[rel] {
					if !strings.Contains(string(raw), must) {
						t.Fatalf("%s missing %q\n--- contents ---\n%s", rel, must, raw)
					}
				}
			}

			// Sanity: the .mcp.json for claude-code must be valid JSON the
			// runtime can parse without surprise.
			if tc.adapter == "claude-code" {
				mcpRaw, _ := os.ReadFile(filepath.Join(workspace, ".mcp.json"))
				var parsed map[string]interface{}
				if err := json.Unmarshal(mcpRaw, &parsed); err != nil {
					t.Fatalf(".mcp.json is not valid JSON: %v", err)
				}
				servers, _ := parsed["mcpServers"].(map[string]interface{})
				if _, ok := servers["hyperclaw"]; !ok {
					t.Fatalf(".mcp.json missing hyperclaw entry: %+v", parsed)
				}
			}
		})
	}
}
