package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

func testBridgeHandler(t *testing.T) *BridgeHandler {
	t.Helper()

	home := t.TempDir()
	return &BridgeHandler{
		paths: Paths{
			Home:      home,
			HyperClaw: filepath.Join(home, ".hyperclaw"),
			OpenClaw:  filepath.Join(home, ".openclaw"),
			Hermes:    filepath.Join(home, ".hermes"),
		},
		shutdownCh: make(chan struct{}),
	}
}

func TestSaveAgentFileRejectsUnsafeAgentIDBeforeFilesystem(t *testing.T) {
	b := testBridgeHandler(t)
	outside := filepath.Join(b.paths.Home, "outside")

	res := b.saveAgentFileSingle(map[string]interface{}{
		"agentId": "../../../../outside",
		"fileKey": "SOUL",
		"content": "do not write",
	})

	if res.err == nil || res.status != 400 {
		t.Fatalf("saveAgentFileSingle result = err %v status %d, want status 400", res.err, res.status)
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatalf("unsafe agent id touched outside path %s: %v", outside, err)
	}
}

func TestSaveAgentFileRejectsUnsafeFileKeyBeforeFilesystem(t *testing.T) {
	b := testBridgeHandler(t)
	outside := filepath.Join(b.paths.HyperClaw, "escape.md")

	res := b.saveAgentFileSingle(map[string]interface{}{
		"agentId": "agent1",
		"fileKey": "../../escape",
		"content": "do not write",
	})

	if res.err == nil || res.status != 400 {
		t.Fatalf("saveAgentFileSingle result = err %v status %d, want status 400", res.err, res.status)
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatalf("unsafe fileKey touched outside path %s: %v", outside, err)
	}
}

func TestSetupAgentRejectsUnsafeAgentIDBeforeRollbackCanRemoveOutside(t *testing.T) {
	b := testBridgeHandler(t)
	victim := filepath.Join(b.paths.Home, "victim")
	if err := os.MkdirAll(victim, 0700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(victim, "sentinel.txt")
	if err := os.WriteFile(sentinel, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}

	res := b.setupAgent(map[string]interface{}{
		"agentId": "../../../../victim",
		"runtime": "openclaw",
		"name":    "bad",
	})

	if res.err == nil || res.status != 400 {
		t.Fatalf("setupAgent result = err %v status %d, want status 400", res.err, res.status)
	}
	if _, err := os.Stat(sentinel); err != nil {
		t.Fatalf("rollback removed or damaged outside sentinel %s: %v", sentinel, err)
	}
}

func TestResolveRuntimeAgentDirRejectsUnsafeAgentID(t *testing.T) {
	b := testBridgeHandler(t)

	if _, err := resolveRuntimeAgentDir(b.paths, "openclaw", "../../outside"); err == nil {
		t.Fatal("resolveRuntimeAgentDir accepted unsafe openclaw agent ID")
	}
	if _, err := resolveRuntimeAgentDir(b.paths, "hermes", "hermes:../../outside"); err == nil {
		t.Fatal("resolveRuntimeAgentDir accepted unsafe hermes profile ID")
	}
}
