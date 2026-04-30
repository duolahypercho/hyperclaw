package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeOpenClawScript is a tiny shell script standing in for the real
// `openclaw` binary. It logs the invocation and, on `agents add ID`,
// appends a matching entry to openclaw.json's agents.list. That mirrors
// the side effect the production CLI would have.
const fakeOpenClawScript = `#!/bin/sh
printf '%s\n' "$*" >> "$OPENCLAW_COMMAND_LOG"
if [ "$1" = "agents" ] && [ "$2" = "add" ]; then
  AGENT_ID="$3"
  WORKSPACE=""
  shift 3
  while [ $# -gt 0 ]; do
    case "$1" in
      --workspace) WORKSPACE="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  python3 -c "
import json, os, sys
cfg_path = os.environ['OPENCLAW_CONFIG_PATH']
with open(cfg_path) as f:
    cfg = json.load(f)
agents = cfg.setdefault('agents', {})
items = agents.setdefault('list', [])
for it in items:
    if it.get('id') == '$AGENT_ID':
        sys.exit(0)
items.append({'id': '$AGENT_ID', 'name': '$AGENT_ID', 'workspace': '$WORKSPACE'})
with open(cfg_path, 'w') as f:
    json.dump(cfg, f, indent=2)
"
fi
exit 0
`

func setupFakeOpenClaw(t *testing.T) (paths Paths, commandLog string) {
	t.Helper()
	home := t.TempDir()
	openclawDir := filepath.Join(home, ".openclaw")
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	binDir := filepath.Join(home, "bin")
	commandLog = filepath.Join(home, "openclaw-commands.log")

	for _, dir := range []string{openclawDir, hyperclawDir, binDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	configPath := filepath.Join(openclawDir, "openclaw.json")
	cfg := []byte(`{"agents":{"list":[{"id":"main","name":"main"}]}}`)
	if err := os.WriteFile(configPath, cfg, 0o600); err != nil {
		t.Fatalf("write openclaw config: %v", err)
	}

	fakeBin := filepath.Join(binDir, "openclaw")
	if err := os.WriteFile(fakeBin, []byte(fakeOpenClawScript), 0o700); err != nil {
		t.Fatalf("write fake openclaw: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("OPENCLAW_COMMAND_LOG", commandLog)

	paths = Paths{
		Home:      home,
		OpenClaw:  openclawDir,
		HyperClaw: hyperclawDir,
	}
	return paths, commandLog
}

func readOpenClawAgents(t *testing.T, paths Paths) []string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(paths.OpenClaw, "openclaw.json"))
	if err != nil {
		t.Fatalf("read openclaw.json: %v", err)
	}
	var cfg struct {
		Agents struct {
			List []struct {
				ID string `json:"id"`
			} `json:"list"`
		} `json:"agents"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatalf("parse openclaw.json: %v", err)
	}
	out := make([]string, 0, len(cfg.Agents.List))
	for _, a := range cfg.Agents.List {
		out = append(out, a.ID)
	}
	return out
}

func TestParseClaudeJSONOutput(t *testing.T) {
	// Object form (legacy single-object output).
	objIn := `{"result": "Hello", "session_id": "abc-123"}`
	final, sid, ok := parseClaudeJSONOutput(objIn)
	if !ok || final != "Hello" || sid != "abc-123" {
		t.Errorf("object form: got (%q,%q,%v), want (\"Hello\",\"abc-123\",true)", final, sid, ok)
	}

	// Array form with init + result events.
	arrIn := `[
{"type":"system","subtype":"init","session_id":"sess-9","cwd":"/x"},
{"type":"assistant","message":{"content":[{"type":"text","text":"thinking..."}]}},
{"type":"result","result":"final answer","session_id":"sess-9"}
]`
	final, sid, ok = parseClaudeJSONOutput(arrIn)
	if !ok || final != "final answer" || sid != "sess-9" {
		t.Errorf("array form with result event: got (%q,%q,%v), want (\"final answer\",\"sess-9\",true)", final, sid, ok)
	}

	// Array form with no top-level result — should fall back to assistant text concat.
	arrFallback := `[
{"type":"system","subtype":"init","session_id":"sess-x"},
{"type":"assistant","message":{"content":[{"type":"text","text":"first"},{"type":"text","text":"second"}]}}
]`
	final, sid, ok = parseClaudeJSONOutput(arrFallback)
	if !ok || final != "first\nsecond" || sid != "sess-x" {
		t.Errorf("array fallback: got (%q,%q,%v), want (\"first\\nsecond\",\"sess-x\",true)", final, sid, ok)
	}

	// Garbage in → ok=false so caller can return raw stdout.
	if _, _, ok := parseClaudeJSONOutput("not json at all"); ok {
		t.Errorf("garbage input should return ok=false")
	}
}

func TestA2AThreadKey(t *testing.T) {
	cases := []struct {
		from, to string
		want     string
	}{
		{"luffy", "nami", "a2a:session:luffy:nami"},
		{"Luffy", "Nami", "a2a:session:luffy:nami"},                                            // case-folded
		{"agent with space", "target", "a2a:session:agent-with-space:target"},                  // sanitised
		{"", "target", "a2a:session:anon:target"},                                              // anon sender
		{"sender", "", ""},                                                                     // empty target → empty key
		{"slack/special!", "ok", "a2a:session:slack-special-:ok"},                              // illegal chars → '-'
	}
	for _, c := range cases {
		if got := a2aThreadKey(c.from, c.to); got != c.want {
			t.Errorf("a2aThreadKey(%q,%q) = %q, want %q", c.from, c.to, got, c.want)
		}
	}
}

func TestOpenClawAdapterSetupAgentRegistersInConfig(t *testing.T) {
	paths, commandLog := setupFakeOpenClaw(t)

	workspaceDir := paths.AgentDir("openclaw", "ada")
	if err := os.MkdirAll(workspaceDir, 0o700); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}

	adapter := NewOpenClawAdapter(paths)
	if err := adapter.SetupAgent("ada", AgentPersonality{AgentID: "ada"}); err != nil {
		t.Fatalf("SetupAgent failed: %v", err)
	}

	agents := readOpenClawAgents(t, paths)
	found := false
	for _, id := range agents {
		if id == "ada" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected agents.list to include 'ada' after SetupAgent; got %v", agents)
	}

	logBytes, err := os.ReadFile(commandLog)
	if err != nil {
		t.Fatalf("read command log: %v", err)
	}
	if !strings.Contains(string(logBytes), "agents add ada --workspace "+workspaceDir+" --non-interactive") {
		t.Fatalf("expected `agents add ada --workspace ... --non-interactive` invocation, got:\n%s", string(logBytes))
	}
}

func TestOpenClawAdapterSetupAgentIsIdempotent(t *testing.T) {
	paths, commandLog := setupFakeOpenClaw(t)

	// Pre-register ada so the adapter should skip the CLI call.
	configPath := filepath.Join(paths.OpenClaw, "openclaw.json")
	if err := os.WriteFile(configPath, []byte(`{"agents":{"list":[{"id":"main","name":"main"},{"id":"ada","name":"ada"}]}}`), 0o600); err != nil {
		t.Fatalf("seed config: %v", err)
	}

	workspaceDir := paths.AgentDir("openclaw", "ada")
	if err := os.MkdirAll(workspaceDir, 0o700); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}

	adapter := NewOpenClawAdapter(paths)
	if err := adapter.SetupAgent("ada", AgentPersonality{AgentID: "ada"}); err != nil {
		t.Fatalf("SetupAgent failed: %v", err)
	}

	logBytes, _ := os.ReadFile(commandLog)
	if strings.Contains(string(logBytes), "agents add ada") {
		t.Fatalf("expected idempotent skip — `agents add ada` should not run when already in config; log:\n%s", string(logBytes))
	}

	// agents.list should still contain exactly main + ada (no duplicate).
	agents := readOpenClawAgents(t, paths)
	count := 0
	for _, id := range agents {
		if id == "ada" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly one 'ada' entry in agents.list, got %d (list: %v)", count, agents)
	}
}
