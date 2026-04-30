package bridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestOnboardingConfigureWorkspaceAppliesOpenClawAgentChannels(t *testing.T) {
	home := t.TempDir()
	openclawDir := filepath.Join(home, ".openclaw")
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	hermesDir := filepath.Join(home, ".hermes")
	claudeProjectsDir := filepath.Join(home, ".claude", "projects")
	binDir := filepath.Join(home, "bin")
	commandLog := filepath.Join(home, "openclaw-commands.log")

	for _, dir := range []string{openclawDir, hyperclawDir, hermesDir, claudeProjectsDir, binDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	if err := os.WriteFile(filepath.Join(openclawDir, "openclaw.json"), []byte(`{"agents":{"list":[{"id":"scout","name":"Scout"}]}}`), 0o600); err != nil {
		t.Fatalf("write openclaw config: %v", err)
	}
	fakeOpenClaw := filepath.Join(binDir, "openclaw")
	if err := os.WriteFile(fakeOpenClaw, []byte("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$OPENCLAW_COMMAND_LOG\"\n"), 0o700); err != nil {
		t.Fatalf("write fake openclaw: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("OPENCLAW_COMMAND_LOG", commandLog)

	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{
			Home:           home,
			HyperClaw:      hyperclawDir,
			OpenClaw:       openclawDir,
			Hermes:         hermesDir,
			ClaudeProjects: claudeProjectsDir,
		},
		store: s,
	}

	result := b.onboardingConfigureWorkspace(map[string]interface{}{
		"runtimeChannelConfigs": []map[string]interface{}{
			{
				"runtime":   "openclaw",
				"agentId":   "scout",
				"agentName": "Scout",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "123456789", "botToken": "telegram-token"},
				},
			},
		},
		"agentChannelConfigs": []map[string]interface{}{
			{
				"runtime":   "openclaw",
				"agentId":   "scout",
				"agentName": "Scout",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "123456789", "botToken": "telegram-token"},
				},
			},
		},
	})
	if result.err != nil {
		t.Fatalf("onboardingConfigureWorkspace failed: %v", result.err)
	}

	data, err := os.ReadFile(commandLog)
	if err != nil {
		t.Fatalf("read command log: %v", err)
	}
	got := string(data)
	if !strings.Contains(got, "channels add --channel telegram --account 123456789 --token telegram-token") {
		t.Fatalf("expected OpenClaw channel add command, got:\n%s", got)
	}
	if !strings.Contains(got, "agents bind --agent scout --bind telegram:123456789") {
		t.Fatalf("expected OpenClaw agent bind command, got:\n%s", got)
	}
}

func TestOpenClawAgentBindTimeoutCoversFirstRunPluginStaging(t *testing.T) {
	t.Parallel()

	// First-run `agents bind` may lazily stage bundled plugin runtime deps
	// before it reaches the config write path. A fresh OpenClaw install can
	// stage dozens of plugin packages before the command exits.
	const minimumFirstRunBudget = 8 * time.Minute
	if time.Duration(openClawAgentBindTimeoutMs)*time.Millisecond < minimumFirstRunBudget {
		t.Fatalf("openClawAgentBindTimeoutMs = %s, want at least %s for first-run bundled plugin dependency staging",
			time.Duration(openClawAgentBindTimeoutMs)*time.Millisecond,
			minimumFirstRunBudget,
		)
	}
}

func TestOnboardingActionsRegisterProgress(t *testing.T) {
	t.Parallel()

	cases := []string{
		"onboarding-provision-workspace",
		"onboarding-install-runtime",
		"onboarding-configure-workspace",
		"onboarding-provision-agent",
	}
	for _, action := range cases {
		if !isOnboardingProgressAction(action) {
			t.Fatalf("%s must register progress callbacks while long onboarding work runs", action)
		}
	}
	if isOnboardingProgressAction("list-agents") {
		t.Fatal("non-onboarding actions must not clobber progress callbacks")
	}
}

func TestOpenClawAgentBindOutputIndicatesSuccessAfterTimeout(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		output    string
		wantCount int
	}{
		{
			name: "added",
			output: `[plugins] telegram installed bundled runtime deps in 1557ms: grammy@^1.42.0
Updated ~/.openclaw/openclaw.json
Added bindings:
- telegram accountId=891861452`,
			wantCount: 1,
		},
		{
			name: "updated",
			output: `Updated bindings:
- telegram accountId=891861452`,
			wantCount: 1,
		},
		{
			name: "already present",
			output: `Already present:
- telegram accountId=891861452`,
			wantCount: 1,
		},
		{
			name:      "idempotent no-op",
			output:    `No new bindings added.`,
			wantCount: 2,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !openClawAgentBindOutputIndicatesSuccess(tc.output, tc.wantCount) {
				t.Fatalf("expected bind output to be treated as success:\n%s", tc.output)
			}
		})
	}
}

func TestOpenClawAgentBindOutputIndicatesSuccessRejectsIncompleteOutput(t *testing.T) {
	t.Parallel()

	cases := []string{
		"",
		"[plugins] telegram installed bundled runtime deps in 1557ms: grammy@^1.42.0",
		`Error: Unknown agent "scout"`,
	}

	for _, output := range cases {
		if openClawAgentBindOutputIndicatesSuccess(output, 1) {
			t.Fatalf("expected bind output to remain an error:\n%s", output)
		}
	}
}

func TestOpenClawAgentBindOutputIndicatesSuccessRejectsPartialMultiBind(t *testing.T) {
	t.Parallel()

	output := `Updated ~/.openclaw/openclaw.json
Added bindings:
- telegram accountId=891861452`

	if openClawAgentBindOutputIndicatesSuccess(output, 2) {
		t.Fatalf("expected partial multi-bind output to remain an error:\n%s", output)
	}
}

func TestOnboardingConfigureWorkspaceAppliesHermesAgentChannels(t *testing.T) {
	home := t.TempDir()
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	openclawDir := filepath.Join(home, ".openclaw")
	hermesDir := filepath.Join(home, ".hermes")
	claudeProjectsDir := filepath.Join(home, ".claude", "projects")
	sageProfileDir := filepath.Join(hermesDir, "profiles", "sage")
	otherProfileDir := filepath.Join(hermesDir, "profiles", "other")

	for _, dir := range []string{hyperclawDir, openclawDir, hermesDir, claudeProjectsDir, sageProfileDir, otherProfileDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{
			Home:           home,
			HyperClaw:      hyperclawDir,
			OpenClaw:       openclawDir,
			Hermes:         hermesDir,
			ClaudeProjects: claudeProjectsDir,
		},
		store: s,
	}

	result := b.onboardingConfigureWorkspace(map[string]interface{}{
		"runtimeChannelConfigs": []map[string]interface{}{
			{
				"runtime":   "hermes",
				"agentId":   "sage",
				"agentName": "Sage",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "-100123456", "botToken": "hermes-telegram-token"},
				},
			},
		},
		"agentChannelConfigs": []map[string]interface{}{
			{
				"runtime":   "hermes",
				"agentId":   "sage",
				"agentName": "Sage",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "-100123456", "botToken": "hermes-telegram-token"},
				},
			},
		},
	})
	if result.err != nil {
		t.Fatalf("onboardingConfigureWorkspace failed: %v", result.err)
	}

	data, err := os.ReadFile(filepath.Join(sageProfileDir, ".env"))
	if err != nil {
		t.Fatalf("read sage profile env: %v", err)
	}
	got := string(data)
	if !strings.Contains(got, "TELEGRAM_CHAT_ID=-100123456") {
		t.Fatalf("sage profile env missing Telegram chat ID:\n%s", got)
	}
	if !strings.Contains(got, "TELEGRAM_BOT_TOKEN=hermes-telegram-token") {
		t.Fatalf("sage profile env missing Telegram bot token:\n%s", got)
	}
	if _, err := os.Stat(filepath.Join(otherProfileDir, ".env")); !os.IsNotExist(err) {
		t.Fatalf("unexpectedly wrote channel env to unrelated Hermes profile: %v", err)
	}
}

func TestOnboardingInstallRuntimeWritesHermesModelConfig(t *testing.T) {
	home := t.TempDir()
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	openclawDir := filepath.Join(home, ".openclaw")
	hermesDir := filepath.Join(home, ".hermes")
	binDir := filepath.Join(home, "bin")
	claudeProjectsDir := filepath.Join(home, ".claude", "projects")

	for _, dir := range []string{hyperclawDir, openclawDir, hermesDir, binDir, claudeProjectsDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	fakeHermes := filepath.Join(binDir, "hermes")
	if err := os.WriteFile(fakeHermes, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatalf("write fake hermes: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	staleConfig := `model:
  default: "anthropic/claude-opus-4.6"
  provider: "auto"
  base_url: "https://openrouter.ai/api/v1"

agent:
  max_turns: 90
`
	if err := os.WriteFile(filepath.Join(hermesDir, "config.yaml"), []byte(staleConfig), 0o600); err != nil {
		t.Fatalf("write stale hermes config: %v", err)
	}

	b := &BridgeHandler{
		paths: Paths{
			Home:           home,
			HyperClaw:      hyperclawDir,
			OpenClaw:       openclawDir,
			Hermes:         hermesDir,
			ClaudeProjects: claudeProjectsDir,
		},
	}

	result := b.onboardingInstallRuntime(map[string]interface{}{
		"runtime": "hermes",
		"providerConfigs": []map[string]interface{}{
			{"providerId": "minimax", "apiKey": "minimax-key", "model": "MiniMax-M2.7"},
		},
		"primaryBrain": map[string]interface{}{
			"providerId": "minimax",
			"model":      "MiniMax-M2.7",
		},
	})
	if result.err != nil {
		t.Fatalf("onboardingInstallRuntime failed: %v", result.err)
	}

	configData, err := os.ReadFile(filepath.Join(hermesDir, "config.yaml"))
	if err != nil {
		t.Fatalf("read hermes config: %v", err)
	}
	gotConfig := string(configData)
	if !strings.Contains(gotConfig, `provider: "minimax"`) {
		t.Fatalf("hermes config missing minimax provider:\n%s", gotConfig)
	}
	if !strings.Contains(gotConfig, `default: "MiniMax-M2.7"`) {
		t.Fatalf("hermes config missing MiniMax default model:\n%s", gotConfig)
	}
	if strings.Contains(gotConfig, "openrouter.ai") || strings.Contains(gotConfig, `provider: "auto"`) {
		t.Fatalf("hermes config kept stale OpenRouter provider route:\n%s", gotConfig)
	}

	envData, err := os.ReadFile(filepath.Join(hermesDir, ".env"))
	if err != nil {
		t.Fatalf("read hermes env: %v", err)
	}
	if !strings.Contains(string(envData), "MINIMAX_API_KEY=minimax-key") {
		t.Fatalf("hermes env missing MiniMax API key:\n%s", string(envData))
	}
}

func TestOnboardingProvisionAgentReplacesStaleHermesModelRoute(t *testing.T) {
	home := t.TempDir()
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	openclawDir := filepath.Join(home, ".openclaw")
	hermesDir := filepath.Join(home, ".hermes")
	binDir := filepath.Join(home, "bin")
	claudeProjectsDir := filepath.Join(home, ".claude", "projects")

	for _, dir := range []string{hyperclawDir, openclawDir, hermesDir, binDir, claudeProjectsDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	fakeHermes := filepath.Join(binDir, "hermes")
	if err := os.WriteFile(fakeHermes, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
		t.Fatalf("write fake hermes: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	staleConfig := `model:
  default: "anthropic/claude-opus-4.6"
  provider: "auto"
  base_url: "https://openrouter.ai/api/v1"

agent:
  max_turns: 90
`
	if err := os.WriteFile(filepath.Join(hermesDir, "config.yaml"), []byte(staleConfig), 0o600); err != nil {
		t.Fatalf("write stale hermes config: %v", err)
	}

	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{
			Home:           home,
			HyperClaw:      hyperclawDir,
			OpenClaw:       openclawDir,
			Hermes:         hermesDir,
			ClaudeProjects: claudeProjectsDir,
		},
		store: s,
	}

	result := b.onboardingProvisionAgent(map[string]interface{}{
		"runtime":      "hermes",
		"agentId":      "main",
		"name":         "Sage",
		"description":  "Long-running execution agent.",
		"emojiEnabled": false,
		"mainModel":    "minimax/MiniMax-M2.7",
	})
	if result.err != nil {
		t.Fatalf("onboardingProvisionAgent failed: %v", result.err)
	}

	configData, err := os.ReadFile(filepath.Join(hermesDir, "config.yaml"))
	if err != nil {
		t.Fatalf("read hermes config: %v", err)
	}
	gotConfig := string(configData)
	if !strings.Contains(gotConfig, `provider: "minimax"`) {
		t.Fatalf("hermes config missing minimax provider:\n%s", gotConfig)
	}
	if !strings.Contains(gotConfig, `default: "MiniMax-M2.7"`) {
		t.Fatalf("hermes config missing provider-local MiniMax model:\n%s", gotConfig)
	}
	if strings.Contains(gotConfig, "openrouter.ai") || strings.Contains(gotConfig, `provider: "auto"`) {
		t.Fatalf("hermes config kept stale OpenRouter provider route:\n%s", gotConfig)
	}
	if !strings.Contains(gotConfig, "agent:") {
		t.Fatalf("hermes config lost non-model sections:\n%s", gotConfig)
	}
}

func TestOnboardingConfigureWorkspaceRejectsHermesAgentPathTraversal(t *testing.T) {
	home := t.TempDir()
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	openclawDir := filepath.Join(home, ".openclaw")
	hermesDir := filepath.Join(home, ".hermes")
	claudeProjectsDir := filepath.Join(home, ".claude", "projects")

	for _, dir := range []string{hyperclawDir, openclawDir, hermesDir, claudeProjectsDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{
			Home:           home,
			HyperClaw:      hyperclawDir,
			OpenClaw:       openclawDir,
			Hermes:         hermesDir,
			ClaudeProjects: claudeProjectsDir,
		},
		store: s,
	}

	result := b.onboardingConfigureWorkspace(map[string]interface{}{
		"agentChannelConfigs": []map[string]interface{}{
			{
				"runtime": "hermes",
				"agentId": "../../escape",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "-100123456", "botToken": "secret-token"},
				},
			},
		},
	})
	if result.err == nil {
		t.Fatalf("expected path traversal agentId to be rejected")
	}
	if _, err := os.Stat(filepath.Join(home, "escape", ".env")); !os.IsNotExist(err) {
		t.Fatalf("unexpected env write outside Hermes profiles: %v", err)
	}
}

func TestOnboardingConfigureWorkspaceRejectsHermesDotAgentID(t *testing.T) {
	home := t.TempDir()
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	hermesDir := filepath.Join(home, ".hermes")
	if err := os.MkdirAll(hyperclawDir, 0o700); err != nil {
		t.Fatalf("mkdir hyperclaw: %v", err)
	}
	if err := os.MkdirAll(hermesDir, 0o700); err != nil {
		t.Fatalf("mkdir hermes: %v", err)
	}
	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{Home: home, HyperClaw: hyperclawDir, Hermes: hermesDir},
		store: s,
	}

	result := b.onboardingConfigureWorkspace(map[string]interface{}{
		"agentChannelConfigs": []map[string]interface{}{
			{
				"runtime": "hermes",
				"agentId": ".",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "-100123456", "botToken": "secret-token"},
				},
			},
		},
	})
	if result.err == nil {
		t.Fatalf("expected dot agentId to be rejected")
	}
	if _, err := os.Stat(filepath.Join(hermesDir, "profiles", ".env")); !os.IsNotExist(err) {
		t.Fatalf("unexpected env write to Hermes profiles root: %v", err)
	}
}

func TestOnboardingConfigureWorkspaceRejectsOpenClawNullByteToken(t *testing.T) {
	home := t.TempDir()
	openclawDir := filepath.Join(home, ".openclaw")
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	hermesDir := filepath.Join(home, ".hermes")
	binDir := filepath.Join(home, "bin")
	commandLog := filepath.Join(home, "openclaw-commands.log")

	for _, dir := range []string{openclawDir, hyperclawDir, hermesDir, binDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	fakeOpenClaw := filepath.Join(binDir, "openclaw")
	if err := os.WriteFile(fakeOpenClaw, []byte("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$OPENCLAW_COMMAND_LOG\"\n"), 0o700); err != nil {
		t.Fatalf("write fake openclaw: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("OPENCLAW_COMMAND_LOG", commandLog)

	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{Home: home, HyperClaw: hyperclawDir, OpenClaw: openclawDir, Hermes: hermesDir},
		store: s,
	}

	result := b.onboardingConfigureWorkspace(map[string]interface{}{
		"agentChannelConfigs": []map[string]interface{}{
			{
				"runtime": "openclaw",
				"agentId": "scout",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "123456789", "botToken": "abc\x00def"},
				},
			},
		},
	})
	if result.err == nil {
		t.Fatalf("expected null-byte token to be rejected")
	}
	if !strings.Contains(result.err.Error(), "invalid control characters") {
		t.Fatalf("expected sanitized error, got: %v", result.err)
	}
	if _, err := os.Stat(commandLog); !os.IsNotExist(err) {
		t.Fatalf("openclaw command should not run for invalid token: %v", err)
	}
}

func TestOnboardingConfigureWorkspacePersistsAgentChannelConfigs(t *testing.T) {
	home := t.TempDir()
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	openclawDir := filepath.Join(home, ".openclaw")
	hermesDir := filepath.Join(home, ".hermes")
	claudeProjectsDir := filepath.Join(home, ".claude", "projects")

	for _, dir := range []string{hyperclawDir, openclawDir, hermesDir, claudeProjectsDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{
			Home:           home,
			HyperClaw:      hyperclawDir,
			OpenClaw:       openclawDir,
			Hermes:         hermesDir,
			ClaudeProjects: claudeProjectsDir,
		},
		store: s,
	}

	result := b.onboardingConfigureWorkspace(map[string]interface{}{
		"agentChannelConfigs": []map[string]interface{}{
			{
				"runtime":   "hermes",
				"agentId":   "sage",
				"agentName": "Sage",
				"channels": []map[string]interface{}{
					{"channel": "telegram", "target": "-100123456", "botToken": "secret-token"},
				},
			},
		},
	})
	if result.err != nil {
		t.Fatalf("onboardingConfigureWorkspace failed: %v", result.err)
	}

	raw, err := s.KVGet("onboarding-agent-channel-configs")
	if err != nil {
		t.Fatalf("KVGet agent channel configs: %v", err)
	}
	if !strings.Contains(raw, `"agentId":"sage"`) {
		t.Fatalf("agent channel configs were not persisted: %s", raw)
	}
}

func TestWriteHermesEnvFileRejectsNewlineValues(t *testing.T) {
	envPath := filepath.Join(t.TempDir(), ".env")
	err := writeHermesEnvFile(envPath, map[string]string{
		"TELEGRAM_BOT_TOKEN": "abc\nINJECTED=true",
	})
	if err == nil {
		t.Fatalf("expected newline-bearing env value to be rejected")
	}
	if _, statErr := os.Stat(envPath); !os.IsNotExist(statErr) {
		t.Fatalf("unexpected env file write after invalid value: %v", statErr)
	}
}

func TestSyncConnectorGatewayConfigFromOpenClawWritesRealPort(t *testing.T) {
	t.Parallel()

	home := t.TempDir()
	openclawDir := filepath.Join(home, ".openclaw")
	hyperclawDir := filepath.Join(home, ".hyperclaw")

	if err := os.MkdirAll(openclawDir, 0o700); err != nil {
		t.Fatalf("mkdir openclaw: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(hyperclawDir, "config"), 0o700); err != nil {
		t.Fatalf("mkdir hyperclaw config: %v", err)
	}

	configPath := filepath.Join(openclawDir, "openclaw.json")
	configJSON := `{
  "gateway": {
    "port": 18789,
    "auth": {
      "token": "abc123"
    }
  }
}`
	if err := os.WriteFile(configPath, []byte(configJSON), 0o600); err != nil {
		t.Fatalf("write openclaw config: %v", err)
	}

	b := &BridgeHandler{
		paths: Paths{
			Home:      home,
			OpenClaw:  openclawDir,
			HyperClaw: hyperclawDir,
		},
	}

	if err := b.syncConnectorGatewayConfigFromOpenClaw(); err != nil {
		t.Fatalf("syncConnectorGatewayConfigFromOpenClaw failed: %v", err)
	}

	gatewayConfigPath := filepath.Join(hyperclawDir, "config", "gateway.json")
	data, err := os.ReadFile(gatewayConfigPath)
	if err != nil {
		t.Fatalf("read gateway.json: %v", err)
	}

	got := string(data)
	if want := `"url": "ws://127.0.0.1:18789/gateway"`; !strings.Contains(got, want) {
		t.Fatalf("gateway.json missing %s in %s", want, got)
	}
	if want := `"token": "abc123"`; !strings.Contains(got, want) {
		t.Fatalf("gateway.json missing %s in %s", want, got)
	}
}

func TestOnboardingProvisionAgentStoresDescriptionInSQLite(t *testing.T) {
	t.Parallel()

	home := t.TempDir()
	hyperclawDir := filepath.Join(home, ".hyperclaw")
	openclawDir := filepath.Join(home, ".openclaw")
	hermesDir := filepath.Join(home, ".hermes")
	claudeProjectsDir := filepath.Join(home, ".claude", "projects")

	for _, dir := range []string{hyperclawDir, openclawDir, hermesDir, claudeProjectsDir} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	s, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	defer s.Close()

	b := &BridgeHandler{
		paths: Paths{
			Home:           home,
			HyperClaw:      hyperclawDir,
			OpenClaw:       openclawDir,
			Hermes:         hermesDir,
			ClaudeProjects: claudeProjectsDir,
		},
		store: s,
	}

	description := "Handles onboarding and keeps the team aligned."
	result := b.onboardingProvisionAgent(map[string]interface{}{
		"runtime":     "codex",
		"name":        "Atlas",
		"description": description,
		"mainModel":   "gpt-5.4",
	})
	if result.err != nil {
		t.Fatalf("onboardingProvisionAgent failed: %v", result.err)
	}

	agent, err := s.GetAgent("atlas")
	if err != nil {
		t.Fatalf("GetAgent: %v", err)
	}
	if agent == nil {
		t.Fatalf("expected seeded agent row")
	}
	if agent.Role != description {
		t.Fatalf("agent role = %q, want %q", agent.Role, description)
	}

	var config map[string]interface{}
	if err := json.Unmarshal([]byte(agent.Config), &config); err != nil {
		t.Fatalf("unmarshal config: %v", err)
	}
	if got, _ := config["description"].(string); got != description {
		t.Fatalf("config.description = %q, want %q", got, description)
	}
	if got, _ := config["runtime"].(string); got != "codex" {
		t.Fatalf("config.runtime = %q, want %q", got, "codex")
	}
	if got, _ := config["mainModel"].(string); got != "gpt-5.4" {
		t.Fatalf("config.mainModel = %q, want %q", got, "gpt-5.4")
	}
}

func TestOpenClawDoctorFixTimeoutCoversPluginRepair(t *testing.T) {
	t.Parallel()

	const minimumRepairBudget = 8 * time.Minute
	if time.Duration(openClawDoctorFixTimeoutMs)*time.Millisecond < minimumRepairBudget {
		t.Fatalf("openClawDoctorFixTimeoutMs = %s, want at least %s for bundled plugin repair",
			time.Duration(openClawDoctorFixTimeoutMs)*time.Millisecond,
			minimumRepairBudget,
		)
	}
	if actionTimeouts["openclaw-doctor-fix"] < minimumRepairBudget {
		t.Fatalf("actionTimeouts[openclaw-doctor-fix] = %s, want at least %s",
			actionTimeouts["openclaw-doctor-fix"],
			minimumRepairBudget,
		)
	}
}

func TestOpenClawChannelDoctorFixTimeoutFitsProvisionBudget(t *testing.T) {
	t.Parallel()

	const minimumRepairBudget = 3 * time.Minute
	channelRepairBudget := time.Duration(openClawChannelDoctorFixTimeoutMs) * time.Millisecond
	if channelRepairBudget < minimumRepairBudget {
		t.Fatalf("openClawChannelDoctorFixTimeoutMs = %s, want at least %s",
			channelRepairBudget,
			minimumRepairBudget,
		)
	}

	provisionBudget := actionTimeouts["onboarding-provision-agent"]
	if channelRepairBudget >= provisionBudget {
		t.Fatalf("channel doctor repair budget %s must be less than provisioning budget %s",
			channelRepairBudget,
			provisionBudget,
		)
	}
}

func TestScrubOnboardingCLIOutputRedactsSecrets(t *testing.T) {
	t.Parallel()

	token := "1234567890:abcdefghijklmnopqrstuvwxyzABCDEF"
	appToken := "xapp-1-ABCDEF"
	raw := "failed botToken=" + token + " app_token: " + appToken

	scrubbed := scrubOnboardingCLIOutput(raw, token, appToken)
	if strings.Contains(scrubbed, token) {
		t.Fatalf("scrubbed output still contains bot token: %q", scrubbed)
	}
	if strings.Contains(scrubbed, appToken) {
		t.Fatalf("scrubbed output still contains app token: %q", scrubbed)
	}

	regexOnly := scrubOnboardingCLIOutput(
		"botToken=1234567890:abcdefghijklmnopqrstuvwxyzABCDEF app_token: xapp-1-ABCDEF api_token: sk-abcdefghijklmnopqrstuvwxyz123456 AIzaABCDEFGHIJKLMNOPQRSTUVWXY",
	)
	for _, leaked := range []string{
		"1234567890:abcdefghijklmnopqrstuvwxyzABCDEF",
		"xapp-1-ABCDEF",
		"sk-abcdefghijklmnopqrstuvwxyz123456",
		"AIzaABCDEFGHIJKLMNOPQRSTUVWXY",
	} {
		if strings.Contains(regexOnly, leaked) {
			t.Fatalf("regex-only scrubbed output still contains %q: %q", leaked, regexOnly)
		}
	}
	if !strings.Contains(regexOnly, "botToken=[redacted]") {
		t.Fatalf("scrubbed output should preserve token field names: %q", regexOnly)
	}
}
