package bridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestRawImageBase64ToDataURIWrapsJPEG(t *testing.T) {
	raw := "/9j/4AAQSkZJRg=="
	got := rawImageBase64ToDataURI(raw)
	if got != "data:image/jpeg;base64,/9j/4AAQSkZJRg==" {
		t.Fatalf("unexpected data uri: %q", got)
	}
}

func TestRawImageBase64ToDataURIRejectsFilenames(t *testing.T) {
	if got := rawImageBase64ToDataURI("avatar.png"); got != "" {
		t.Fatalf("filename should not become data uri: %q", got)
	}
}

func TestNormalizeAvatarForResponseWrapsStoredRawBase64(t *testing.T) {
	b := &BridgeHandler{}
	got := b.normalizeAvatarForResponse("/9j/4AAQSkZJRg==", "- **Avatar:** avatar.png", "tom")
	if got != "data:image/jpeg;base64,/9j/4AAQSkZJRg==" {
		t.Fatalf("unexpected normalized avatar: %q", got)
	}
}

func TestImageMimeFromBytesDetectsSVGWithXMLDeclaration(t *testing.T) {
	data := []byte(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`)
	if got := imageMimeFromBytes(data); got != "image/svg+xml" {
		t.Fatalf("unexpected mime: %q", got)
	}
}

func TestNormalizeAvatarForResponseFindsConventionalHermesAvatarFile(t *testing.T) {
	b := testBridgeHandler(t)
	st, err := store.New(filepath.Join(b.paths.Home, "store"))
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	defer st.Close()
	b.store = st

	if err := st.UpsertAgentIdentity(store.AgentIdentity{
		ID:      "scout",
		Name:    "Scout",
		Runtime: "hermes",
	}); err != nil {
		t.Fatalf("upsert identity: %v", err)
	}

	agentDir := b.paths.AgentDir("hermes", "scout")
	if err := os.MkdirAll(agentDir, 0o755); err != nil {
		t.Fatalf("create agent dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(agentDir, "avatar.png"), []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	}, 0o644); err != nil {
		t.Fatalf("write avatar: %v", err)
	}

	got := b.normalizeAvatarForResponse("", "", "scout")
	if !strings.HasPrefix(got, "data:image/png;base64,") {
		t.Fatalf("expected conventional avatar data uri, got %q", got)
	}
}

func TestNormalizeAvatarForResponseDoesNotTrustAvatarExtension(t *testing.T) {
	b := testBridgeHandler(t)
	agentDir := b.paths.AgentDir("hermes", "scout")
	if err := os.MkdirAll(agentDir, 0o755); err != nil {
		t.Fatalf("create agent dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(agentDir, "avatar.png"), []byte("not actually an image"), 0o644); err != nil {
		t.Fatalf("write fake avatar: %v", err)
	}

	got := b.normalizeAvatarForResponse("", "", "scout", "hermes")
	if got != "" {
		t.Fatalf("fake image should not be returned as data URI: %q", got)
	}
}

func TestNormalizeAvatarForResponseRejectsSymlinkEscapingAgentDir(t *testing.T) {
	b := testBridgeHandler(t)
	agentDir := b.paths.AgentDir("hermes", "scout")
	if err := os.MkdirAll(agentDir, 0o755); err != nil {
		t.Fatalf("create agent dir: %v", err)
	}
	outsideAvatar := filepath.Join(b.paths.Home, "outside.png")
	if err := os.WriteFile(outsideAvatar, []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	}, 0o644); err != nil {
		t.Fatalf("write outside avatar: %v", err)
	}
	if err := os.Symlink(outsideAvatar, filepath.Join(agentDir, "avatar.png")); err != nil {
		t.Fatalf("create avatar symlink: %v", err)
	}

	got := b.normalizeAvatarForResponse("", "", "scout", "hermes")
	if got != "" {
		t.Fatalf("symlink escape should not be returned as data URI: %q", got)
	}
}

func TestListAgentIdentitiesReturnsAllSyncedRuntimes(t *testing.T) {
	b := testBridgeHandler(t)
	st, err := store.New(b.paths.HyperClaw)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	defer st.Close()
	b.store = st

	if err := st.UpsertAgent(store.SeedAgent{
		ID:      "main",
		Name:    "Main",
		Role:    "OpenClaw lead",
		Runtime: "openclaw",
	}); err != nil {
		t.Fatalf("upsert openclaw agent: %v", err)
	}
	for _, agent := range []store.AgentIdentity{
		{ID: "ziwen-xu", Name: "Ziwen Xu", Runtime: "codex"},
		{ID: "elon-musk", Name: "Elon Musk", Runtime: "hermes"},
		{ID: "luffy", Name: "Luffy", Runtime: "claude-code"},
		{ID: "profiles", Name: "Scout", Runtime: "hermes"},
	} {
		if err := st.UpsertAgentIdentity(agent); err != nil {
			t.Fatalf("upsert identity %s: %v", agent.ID, err)
		}
	}

	res := b.listAgentIdentities()
	if res.err != nil {
		t.Fatalf("listAgentIdentities error: %v", res.err)
	}
	payload, ok := res.data.(map[string]interface{})
	if !ok {
		t.Fatalf("payload type = %T, want map[string]interface{}", res.data)
	}
	rows, ok := payload["data"].([]map[string]interface{})
	if !ok {
		t.Fatalf("data type = %T, want []map[string]interface{}", payload["data"])
	}

	got := map[string]string{}
	for _, row := range rows {
		id, _ := row["id"].(string)
		runtime, _ := row["runtime"].(string)
		got[id] = runtime
	}
	for id, runtime := range map[string]string{
		"main":      "openclaw",
		"ziwen-xu":  "codex",
		"elon-musk": "hermes",
		"luffy":     "claude-code",
	} {
		if got[id] != runtime {
			t.Fatalf("agent %s runtime = %q, want %q; rows=%#v", id, got[id], runtime, rows)
		}
	}
	if _, ok := got["profiles"]; ok {
		t.Fatalf("system directory profiles should be filtered; rows=%#v", rows)
	}
}
