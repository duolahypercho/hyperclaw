package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestEnsureHermesEnvWritesGeminiAliases(t *testing.T) {
	home := t.TempDir()
	b := &BridgeHandler{paths: Paths{Home: home}}

	err := b.ensureHermesEnv(
		[]onboardingProviderConfig{{ProviderID: "google", APIKey: "AIza-test"}},
		nil,
		nil,
	)
	if err != nil {
		t.Fatalf("ensureHermesEnv: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(home, ".hermes", ".env"))
	if err != nil {
		t.Fatalf("read .env: %v", err)
	}
	content := string(data)
	for _, want := range []string{"GOOGLE_API_KEY=AIza-test", "GEMINI_API_KEY=AIza-test"} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected %q in Hermes env, got:\n%s", want, content)
		}
	}
}

func TestPersistOpenClawProviderEnvKeysStoresGeminiAliases(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "openclaw.json")
	if err := os.WriteFile(configPath, []byte(`{}`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	persistOpenClawProviderEnvKeys(configPath, []onboardingProviderConfig{
		{ProviderID: "google", APIKey: "AIza-test"},
	})

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	var config map[string]map[string]string
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if got := config["env"]["GEMINI_API_KEY"]; got != "AIza-test" {
		t.Fatalf("expected GEMINI_API_KEY to be persisted, got %q in %#v", got, config)
	}
	if got := config["env"]["GOOGLE_API_KEY"]; got != "AIza-test" {
		t.Fatalf("expected GOOGLE_API_KEY to be persisted, got %q in %#v", got, config)
	}
}

func TestSetOnboardingEnvRestoresPreviousValue(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "existing")

	restore := setOnboardingEnv("GEMINI_API_KEY", "temporary")
	if got := os.Getenv("GEMINI_API_KEY"); got != "temporary" {
		t.Fatalf("expected temporary env value, got %q", got)
	}

	restore()
	if got := os.Getenv("GEMINI_API_KEY"); got != "existing" {
		t.Fatalf("expected original env value to be restored, got %q", got)
	}
}

func TestSetOnboardingEnvUnsetsWhenNotPreviouslySet(t *testing.T) {
	const envKey = "HYPERCLAW_TEST_ONBOARDING_ENV_ABSENT"
	_ = os.Unsetenv(envKey)
	t.Cleanup(func() { _ = os.Unsetenv(envKey) })

	restore := setOnboardingEnv(envKey, "temporary")
	if got := os.Getenv(envKey); got != "temporary" {
		t.Fatalf("expected temporary env value, got %q", got)
	}

	restore()
	if _, ok := os.LookupEnv(envKey); ok {
		t.Fatalf("expected %s to be unset after restore", envKey)
	}
}

func TestLoadSavedAgentChannelConfigsKeepsAgentSpecificFirst(t *testing.T) {
	st, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	agentSpecific := []onboardingRuntimeChannelConfig{{
		Runtime:  "openclaw",
		AgentID:  "main",
		Channels: []onboardingChannelConfig{{Channel: "telegram", Target: "agent-specific"}},
	}}
	runtimeChannels := []onboardingRuntimeChannelConfig{{
		Runtime:  "openclaw",
		AgentID:  "main",
		Channels: []onboardingChannelConfig{{Channel: "telegram", Target: "stale-runtime-copy"}},
	}}
	mustSetJSONKV(t, st, "onboarding-agent-channel-configs", agentSpecific)
	mustSetJSONKV(t, st, "onboarding-runtime-channels", runtimeChannels)

	b := &BridgeHandler{store: st}
	configs := b.loadSavedAgentChannelConfigs()
	if len(configs) != 1 {
		t.Fatalf("expected duplicate configs to be deduped, got %#v", configs)
	}
	if got := configs[0].Channels[0].Target; got != "agent-specific" {
		t.Fatalf("expected agent-specific config to win, got %q", got)
	}
}

func TestPublicSavedAgentChannelConfigUsesSavedExactAgentConfig(t *testing.T) {
	agents := []store.AgentIdentity{
		{ID: "main", Name: "Main", Runtime: "openclaw"},
		{ID: "helper", Name: "Helper", Runtime: "openclaw"},
	}
	configs := []onboardingRuntimeChannelConfig{{
		Runtime:   "openclaw",
		AgentID:   "main",
		AgentName: "Main",
		Channels: []onboardingChannelConfig{{
			Channel:  "telegram",
			Target:   "12345",
			BotToken: "123:abc",
		}},
	}}

	public, ok := publicSavedAgentChannelConfig(agents[0], agents, configs)
	if !ok {
		t.Fatalf("expected saved channel config")
	}
	channels, ok := public["channels"].([]onboardingChannelConfig)
	if !ok || len(channels) != 1 || channels[0].Channel != "telegram" {
		t.Fatalf("unexpected public channels: %#v", public["channels"])
	}
}

func TestPublicSavedAgentChannelConfigAvoidsRuntimeOnlyWhenAmbiguous(t *testing.T) {
	agents := []store.AgentIdentity{
		{ID: "main", Name: "Main", Runtime: "openclaw"},
		{ID: "helper", Name: "Helper", Runtime: "openclaw"},
	}
	configs := []onboardingRuntimeChannelConfig{{
		Runtime: "openclaw",
		Channels: []onboardingChannelConfig{{
			Channel: "telegram",
			Target:  "12345",
		}},
	}}

	if public, ok := publicSavedAgentChannelConfig(agents[0], agents, configs); ok {
		t.Fatalf("expected ambiguous runtime-only config to be hidden, got %#v", public)
	}
}

func TestPublicSavedAgentChannelConfigUsesAgentNameFallback(t *testing.T) {
	agents := []store.AgentIdentity{{ID: "main", Name: "Main", Runtime: "openclaw"}}
	configs := []onboardingRuntimeChannelConfig{{
		Runtime:   "openclaw",
		AgentName: "main",
		Channels:  []onboardingChannelConfig{{Channel: "telegram", Target: "12345"}},
	}}

	public, ok := publicSavedAgentChannelConfig(agents[0], agents, configs)
	if !ok {
		t.Fatalf("expected saved channel config from name fallback")
	}
	channels := public["channels"].([]onboardingChannelConfig)
	if channels[0].Target != "12345" {
		t.Fatalf("unexpected public channels: %#v", channels)
	}
}

func TestSameAgentConfigIDAllowsHermesMainAlias(t *testing.T) {
	if !sameAgentConfigID("hermes", "main", "__main__") {
		t.Fatalf("expected Hermes main to match __main__")
	}
	if !sameAgentConfigID("hermes", "__main__", "main") {
		t.Fatalf("expected Hermes __main__ to match main")
	}
	if sameAgentConfigID("openclaw", "main", "__main__") {
		t.Fatalf("did not expect OpenClaw main aliasing")
	}
}

func TestSanitizeDebugOpenClawBindOutputRedactsTargetsAndTokens(t *testing.T) {
	raw := "telegram:891861452 failed for botToken 8623259433:AAE1tiGk4tT-NykEjKHt3c-eldw8d3jGWZk"
	got := sanitizeDebugOpenClawBindOutput(raw)
	if strings.Contains(got, "891861452") || strings.Contains(got, "AAE1tiGk4tT") {
		t.Fatalf("expected target and token to be redacted, got %q", got)
	}
	if !strings.Contains(got, "telegram:[target]") {
		t.Fatalf("expected channel target placeholder, got %q", got)
	}
}

func TestCanonicalOpenClawBindingSpecUsesOpenClawMatchFields(t *testing.T) {
	got := canonicalOpenClawBindingSpec(" telegram ", " 891861452 ")
	if got != "telegram:891861452" {
		t.Fatalf("unexpected canonical binding spec %q", got)
	}
	if got := canonicalOpenClawBindingSpec("telegram", ""); got != "" {
		t.Fatalf("expected empty binding without account id, got %q", got)
	}
}

func TestOnboardingProvisionAgentSeedsPersonalityFiles(t *testing.T) {
	home := t.TempDir()
	b := &BridgeHandler{
		paths: Paths{
			Home:      home,
			OpenClaw:  filepath.Join(home, ".openclaw"),
			HyperClaw: filepath.Join(home, ".hyperclaw"),
		},
	}

	result := b.onboardingProvisionAgent(map[string]interface{}{
		"agentId":      "researcher",
		"runtime":      "codex",
		"name":         "Researcher",
		"role":         "Market Research",
		"description":  "Tracks competitors and summarizes signals.",
		"userName":     "Ziwen",
		"userEmail":    "ziwen@example.com",
		"emojiEnabled": true,
		"emoji":        "🔎",
	})
	if result.err != nil {
		t.Fatalf("onboardingProvisionAgent: %v", result.err)
	}

	agentDir := filepath.Join(home, ".hyperclaw", "agents", "codex-researcher")
	for _, fileName := range []string{"SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md"} {
		if _, err := os.Stat(filepath.Join(agentDir, fileName)); err != nil {
			t.Fatalf("expected %s to be created: %v", fileName, err)
		}
	}

	soul, err := os.ReadFile(filepath.Join(agentDir, "SOUL.md"))
	if err != nil {
		t.Fatalf("read SOUL.md: %v", err)
	}
	if content := string(soul); !strings.Contains(content, "Market Research") || !strings.Contains(content, "Tracks competitors") {
		t.Fatalf("expected SOUL.md to include role and description, got:\n%s", content)
	}

	user, err := os.ReadFile(filepath.Join(agentDir, "USER.md"))
	if err != nil {
		t.Fatalf("read USER.md: %v", err)
	}
	if content := string(user); !strings.Contains(content, "Ziwen") || !strings.Contains(content, "ziwen@example.com") {
		t.Fatalf("expected USER.md to include user profile, got:\n%s", content)
	}
}

func TestOnboardingProvisionWorkspaceSeedsPersonalityFiles(t *testing.T) {
	home := t.TempDir()
	st, err := store.New(filepath.Join(home, "data"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	b := &BridgeHandler{
		store: st,
		paths: Paths{
			Home:      home,
			OpenClaw:  filepath.Join(home, ".openclaw"),
			HyperClaw: filepath.Join(home, ".hyperclaw"),
		},
	}

	result := b.onboardingProvisionWorkspace(map[string]interface{}{
		"agentProfiles": []map[string]interface{}{{
			"runtime":     "codex",
			"name":        "Bulk Researcher",
			"role":        "Signal Scout",
			"description": "Finds weak signals for the team.",
		}},
	})
	if result.err != nil {
		t.Fatalf("onboardingProvisionWorkspace: %v", result.err)
	}
	data, _ := result.data.(map[string]interface{})
	if success, _ := data["success"].(bool); !success {
		t.Fatalf("expected successful bulk provision, got %#v", data)
	}

	agentDir := filepath.Join(home, ".hyperclaw", "agents", "codex-bulk-researcher")
	for _, fileName := range []string{"SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md"} {
		if _, err := os.Stat(filepath.Join(agentDir, fileName)); err != nil {
			t.Fatalf("expected %s to be created: %v", fileName, err)
		}
	}

	soul, err := os.ReadFile(filepath.Join(agentDir, "SOUL.md"))
	if err != nil {
		t.Fatalf("read SOUL.md: %v", err)
	}
	if content := string(soul); !strings.Contains(content, "Signal Scout") || !strings.Contains(content, "Finds weak signals") {
		t.Fatalf("expected SOUL.md to include bulk role and description, got:\n%s", content)
	}
}

func mustSetJSONKV(t *testing.T, st *store.Store, key string, value interface{}) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %s: %v", key, err)
	}
	if err := st.KVSet(key, string(data)); err != nil {
		t.Fatalf("set %s: %v", key, err)
	}
}
