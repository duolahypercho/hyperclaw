package bridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testAgenticStackBridge(t *testing.T) (*BridgeHandler, string) {
	t.Helper()
	home := t.TempDir()
	paths := Paths{
		Home:      home,
		OpenClaw:  filepath.Join(home, ".openclaw"),
		HyperClaw: filepath.Join(home, ".hyperclaw"),
		Hermes:    filepath.Join(home, ".hermes"),
	}
	if err := paths.EnsureDirectories(); err != nil {
		t.Fatalf("ensure dirs: %v", err)
	}
	return &BridgeHandler{paths: paths, shutdownCh: make(chan struct{})}, home
}

func TestValidateAgenticStackManifestRejectsUnsafePaths(t *testing.T) {
	base := agenticStackBuiltinAdapters["openclaw"]
	cases := []agenticStackFileEntry{
		{Src: "../AGENTS.md", Dst: "AGENTS.md"},
		{Src: "AGENTS.md", Dst: "/tmp/AGENTS.md"},
		{Src: "AGENTS.md", Dst: `C:\tmp\AGENTS.md`},
	}
	for _, file := range cases {
		manifest := base
		manifest.Files = []agenticStackFileEntry{file}
		if err := validateAgenticStackManifest(manifest); err == nil {
			t.Fatalf("expected unsafe path rejection for %+v", file)
		}
	}
}

func TestAgenticStackAdapterAddCreatesBrainAndFiles(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")

	result := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "claude-code",
	})
	if result.err != nil {
		t.Fatalf("adapter add returned error: %v", result.err)
	}
	data := result.data.(map[string]interface{})
	if data["success"] != true {
		t.Fatalf("adapter add failed: %+v", data)
	}
	for _, rel := range []string{".agent/AGENTS.md", ".agent/memory/personal/PREFERENCES.md", "CLAUDE.md", ".claude/settings.json", agenticStackStateFile} {
		if _, err := os.Stat(filepath.Join(target, rel)); err != nil {
			t.Fatalf("expected %s to exist: %v", rel, err)
		}
	}
	claude, err := os.ReadFile(filepath.Join(target, "CLAUDE.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(claude), ".agent/AGENTS.md") {
		t.Fatalf("CLAUDE.md should point at .agent brain: %s", claude)
	}
}

func TestAgenticStackMergeOrAlertAppendsBlockWithoutOverwriting(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	userContent := "# My Project\n\nExisting user instructions go here.\n"
	if err := os.WriteFile(filepath.Join(target, "AGENTS.md"), []byte(userContent), 0o644); err != nil {
		t.Fatal(err)
	}

	result := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "openclaw",
	})
	if result.err != nil {
		t.Fatalf("adapter add returned error: %v", result.err)
	}
	data := result.data.(map[string]interface{})
	if data["success"] != true {
		t.Fatalf("adapter add failed: %+v", data)
	}
	after, err := os.ReadFile(filepath.Join(target, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	afterStr := string(after)
	if !strings.HasPrefix(afterStr, userContent) {
		t.Fatalf("expected user content to remain at top, got:\n%s", afterStr)
	}
	if !strings.Contains(afterStr, agenticStackBlockBegin) || !strings.Contains(afterStr, agenticStackBlockEnd) {
		t.Fatalf("expected managed block markers in file, got:\n%s", afterStr)
	}
	if !strings.Contains(afterStr, ".agent/AGENTS.md") {
		t.Fatalf("managed block should reference shared brain, got:\n%s", afterStr)
	}

	doctor := bridge.agenticStackDoctor(map[string]interface{}{"targetRoot": target})
	doctorData := doctor.data.(map[string]interface{})
	warnings := doctorData["warnings"].([]string)
	for _, w := range warnings {
		if strings.Contains(w, "AGENTS.md") {
			t.Fatalf("doctor should not warn about a healthy managed block, got: %v", warnings)
		}
	}
}

func TestAgenticStackMergeOrAlertReplacesBlockOnReinstall(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")

	first := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "openclaw",
	})
	if first.err != nil {
		t.Fatalf("first add returned error: %v", first.err)
	}
	original, err := os.ReadFile(filepath.Join(target, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	userExtras := "\n## My personal notes\n\nDon't touch this section.\n"
	merged := string(original) + userExtras
	if err := os.WriteFile(filepath.Join(target, "AGENTS.md"), []byte(merged), 0o644); err != nil {
		t.Fatal(err)
	}

	second := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "openclaw",
	})
	if second.err != nil {
		t.Fatalf("second add returned error: %v", second.err)
	}
	after, err := os.ReadFile(filepath.Join(target, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	afterStr := string(after)
	if !strings.Contains(afterStr, "## My personal notes") {
		t.Fatalf("user notes outside the managed block must survive reinstall, got:\n%s", afterStr)
	}
	beginCount := strings.Count(afterStr, agenticStackBlockBegin)
	if beginCount != 1 {
		t.Fatalf("expected exactly one managed block, got %d in:\n%s", beginCount, afterStr)
	}
}

func TestAgenticStackRestoresDeletedManagedBlock(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")

	first := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "openclaw",
	})
	if first.err != nil {
		t.Fatalf("first add returned error: %v", first.err)
	}
	userOnly := "# Only user content now\n"
	if err := os.WriteFile(filepath.Join(target, "AGENTS.md"), []byte(userOnly), 0o644); err != nil {
		t.Fatal(err)
	}

	second := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "openclaw",
	})
	if second.err != nil {
		t.Fatalf("second add returned error: %v", second.err)
	}
	after, err := os.ReadFile(filepath.Join(target, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	afterStr := string(after)
	if !strings.HasPrefix(afterStr, userOnly) {
		t.Fatalf("user content must remain on top after one-click restore, got:\n%s", afterStr)
	}
	if !strings.Contains(afterStr, agenticStackBlockBegin) {
		t.Fatalf("managed block should be restored after deletion, got:\n%s", afterStr)
	}
}

func TestAgenticStackRemoveStripsBlockButKeepsUserContent(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	userContent := "# Project README\n\nThe original content.\n"
	if err := os.WriteFile(filepath.Join(target, "AGENTS.md"), []byte(userContent), 0o644); err != nil {
		t.Fatal(err)
	}

	add := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "openclaw",
	})
	if add.err != nil {
		t.Fatalf("add returned error: %v", add.err)
	}
	intermediate, err := os.ReadFile(filepath.Join(target, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(intermediate), agenticStackBlockBegin) {
		t.Fatalf("expected managed block after install, got:\n%s", intermediate)
	}

	remove := bridge.agenticStackAdapterRemove(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "openclaw",
	})
	if remove.err != nil {
		t.Fatalf("remove returned error: %v", remove.err)
	}
	after, err := os.ReadFile(filepath.Join(target, "AGENTS.md"))
	if err != nil {
		t.Fatalf("AGENTS.md should still exist after remove (user content preserved): %v", err)
	}
	afterStr := string(after)
	if strings.Contains(afterStr, agenticStackBlockBegin) || strings.Contains(afterStr, agenticStackBlockEnd) {
		t.Fatalf("managed block should be stripped, got:\n%s", afterStr)
	}
	if !strings.Contains(afterStr, "The original content.") {
		t.Fatalf("user content must be preserved, got:\n%s", afterStr)
	}
}

func TestAgenticStackOpenClawAndClaudeShareBrain(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")

	for _, adapter := range []string{"claude-code", "openclaw"} {
		result := bridge.agenticStackAdapterAdd(map[string]interface{}{
			"targetRoot": target,
			"adapter":    adapter,
		})
		if result.err != nil {
			t.Fatalf("%s add returned error: %v", adapter, result.err)
		}
		data := result.data.(map[string]interface{})
		if data["success"] != true {
			t.Fatalf("%s add failed: %+v", adapter, data)
		}
	}

	for _, rel := range []string{".agent/AGENTS.md", "CLAUDE.md", "AGENTS.md", ".openclaw-system.md"} {
		if _, err := os.Stat(filepath.Join(target, rel)); err != nil {
			t.Fatalf("expected %s to exist in shared project: %v", rel, err)
		}
	}
	claude, err := os.ReadFile(filepath.Join(target, "CLAUDE.md"))
	if err != nil {
		t.Fatal(err)
	}
	openclaw, err := os.ReadFile(filepath.Join(target, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(claude), ".agent/AGENTS.md") || !strings.Contains(string(openclaw), ".agent/AGENTS.md") {
		t.Fatalf("runtime files should both point at the shared .agent brain")
	}
}

func TestAgenticStackReinstallRepairsOverwritePolicyFile(t *testing.T) {
	// claude-code uses overwrite policy for CLAUDE.md, so a reinstall
	// after the agent (or user) breaks it should restore our content.
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")

	first := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "claude-code",
	})
	if first.err != nil {
		t.Fatalf("first add returned error: %v", first.err)
	}

	brokenContent := "agent accidentally removed the shared brain reference\n"
	if err := os.WriteFile(filepath.Join(target, "CLAUDE.md"), []byte(brokenContent), 0o644); err != nil {
		t.Fatal(err)
	}

	second := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "claude-code",
	})
	if second.err != nil {
		t.Fatalf("second add returned error: %v", second.err)
	}
	data := second.data.(map[string]interface{})
	if data["success"] != true {
		t.Fatalf("second add failed: %+v", data)
	}
	repaired, err := os.ReadFile(filepath.Join(target, "CLAUDE.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(repaired) == brokenContent || !strings.Contains(string(repaired), ".agent/AGENTS.md") {
		t.Fatalf("expected owned CLAUDE.md to be repaired, got: %s", repaired)
	}
}

func TestEnsureAgenticBrainRepairsMissingBrainFile(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")
	if err := os.MkdirAll(filepath.Join(target, ".agent"), 0o755); err != nil {
		t.Fatal(err)
	}

	result := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "claude-code",
	})
	if result.err != nil {
		t.Fatalf("adapter add returned error: %v", result.err)
	}
	if _, err := os.Stat(filepath.Join(target, ".agent", "AGENTS.md")); err != nil {
		t.Fatalf("expected missing .agent/AGENTS.md to be repaired: %v", err)
	}
}

func TestAgenticStackCorruptStateStopsRepair(t *testing.T) {
	bridge, home := testAgenticStackBridge(t)
	target := filepath.Join(home, "project")

	first := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "claude-code",
	})
	if first.err != nil {
		t.Fatalf("first add returned error: %v", first.err)
	}

	userEdit := "custom claude instructions\n"
	if err := os.WriteFile(filepath.Join(target, "CLAUDE.md"), []byte(userEdit), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, agenticStackStateFile), []byte("{not-json"), 0o644); err != nil {
		t.Fatal(err)
	}

	second := bridge.agenticStackAdapterAdd(map[string]interface{}{
		"targetRoot": target,
		"adapter":    "claude-code",
	})
	data := second.data.(map[string]interface{})
	if data["success"] != false {
		t.Fatalf("expected corrupt state to stop install, got: %+v", data)
	}
	after, err := os.ReadFile(filepath.Join(target, "CLAUDE.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != userEdit {
		t.Fatalf("custom file should not be overwritten when state is corrupt, got: %s", after)
	}
}
