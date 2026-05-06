package bridge

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hypercho/hyperclaw-connector/internal/credentials"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func TestApplyOpenClawProviderModelsMergesCatalogModels(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "openclaw.json")
	initial := `{
  "models": {
    "providers": {
      "anthropic": {
        "models": [{ "id": "claude-sonnet-4-6" }]
      }
    }
  },
  "agents": {
    "defaults": {
      "models": {
        "legacy/model": { "provider": "legacy", "model": "model" }
      }
    }
  }
}`
	if err := os.WriteFile(configPath, []byte(initial), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	if err := applyOpenClawProviderModels(configPath, "openai", []string{"gpt-5.4", "gpt-5.4-mini"}); err != nil {
		t.Fatalf("applyOpenClawProviderModels: %v", err)
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatalf("parse config: %v", err)
	}

	providers := config["models"].(map[string]interface{})["providers"].(map[string]interface{})
	if _, ok := providers["anthropic"]; !ok {
		t.Fatalf("expected existing provider to be preserved: %#v", providers)
	}
	openaiModels := providers["openai"].(map[string]interface{})["models"].([]interface{})
	if len(openaiModels) != 2 {
		t.Fatalf("expected two OpenAI models, got %#v", openaiModels)
	}
	if got := openaiModels[0].(map[string]interface{})["id"]; got != "gpt-5.4" {
		t.Fatalf("expected first OpenAI model id gpt-5.4, got %#v", got)
	}

	defaults := config["agents"].(map[string]interface{})["defaults"].(map[string]interface{})["models"].(map[string]interface{})
	if _, ok := defaults["legacy/model"]; !ok {
		t.Fatalf("expected existing default model to be preserved: %#v", defaults)
	}
	for _, id := range []string{"openai/gpt-5.4", "openai/gpt-5.4-mini"} {
		entry, ok := defaults[id].(map[string]interface{})
		if !ok {
			t.Fatalf("expected default model %s in %#v", id, defaults)
		}
		if got := entry["authProfile"]; got != "openai:manual" {
			t.Fatalf("expected auth profile for %s, got %#v", id, got)
		}
	}
}

func TestApplyOpenClawProviderModelsPreservesExistingProviderModels(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "openclaw.json")
	initial := `{
  "models": {
    "providers": {
      "openai": {
        "models": [
          { "id": "custom-openai-model" },
          { "id": "gpt-5.4" }
        ]
      }
    }
  }
}`
	if err := os.WriteFile(configPath, []byte(initial), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	if err := applyOpenClawProviderModels(configPath, "openai", []string{"gpt-5.4", "gpt-5.4-mini"}); err != nil {
		t.Fatalf("applyOpenClawProviderModels: %v", err)
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatalf("parse config: %v", err)
	}

	providers := config["models"].(map[string]interface{})["providers"].(map[string]interface{})
	openaiModels := providers["openai"].(map[string]interface{})["models"].([]interface{})
	if len(openaiModels) != 3 {
		t.Fatalf("expected custom plus two catalog models, got %#v", openaiModels)
	}

	seen := map[string]bool{}
	for _, raw := range openaiModels {
		id, _ := raw.(map[string]interface{})["id"].(string)
		seen[id] = true
	}
	for _, want := range []string{"custom-openai-model", "gpt-5.4", "gpt-5.4-mini"} {
		if !seen[want] {
			t.Fatalf("expected model %s to be preserved/added, got %#v", want, openaiModels)
		}
	}
}

func TestCredentialModelNamesAcceptsCatalogShape(t *testing.T) {
	got := credentialModelNames(map[string]interface{}{
		"models": []interface{}{
			map[string]interface{}{"name": "gpt-5.4"},
			map[string]interface{}{"id": "gpt-5.4-mini"},
			"o3",
			map[string]interface{}{"name": "gpt-5.4"},
		},
	})

	want := []string{"gpt-5.4", "gpt-5.4-mini", "o3"}
	if len(got) != len(want) {
		t.Fatalf("expected %d models, got %#v", len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("expected model %d to be %q, got %#v", i, want[i], got)
		}
	}
}

func TestSaveOnboardingProviderCredentialsCanonicalizesAndPersists(t *testing.T) {
	_, deviceKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate device key: %v", err)
	}
	hyperclawDir := t.TempDir()
	b := &BridgeHandler{
		paths:     Paths{HyperClaw: hyperclawDir},
		deviceKey: deviceKey,
	}

	count, err := b.saveOnboardingProviderCredentials([]onboardingProviderConfig{
		{ProviderID: "minimax", APIKey: "mini-key", AuthType: "api_key"},
		{ProviderID: "gemini", APIKey: "gemini-key", AuthType: "api_key"},
	})
	if err != nil {
		t.Fatalf("save onboarding credentials: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 saved credentials, got %d", count)
	}

	credStore, err := credentials.LoadCredentials(hyperclawDir, deviceKey)
	if err != nil {
		t.Fatalf("load credentials: %v", err)
	}
	all := credStore.GetAll()
	if got := all["minimax"].Key; got != "mini-key" {
		t.Fatalf("expected minimax key, got %q", got)
	}
	if got := all["google"].Key; got != "gemini-key" {
		t.Fatalf("expected gemini alias to persist as google key, got %q", got)
	}
	if _, ok := all["gemini"]; ok {
		t.Fatalf("did not expect separate gemini key in credential store: %#v", all)
	}
}

func TestCredentialsListMigratesSavedOnboardingProviderCredentials(t *testing.T) {
	_, deviceKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate device key: %v", err)
	}
	hyperclawDir := t.TempDir()
	st, err := store.New(hyperclawDir)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	defer st.Close()

	if err := st.KVSet("onboarding-provider-configs", `[{"providerId":"minimax","apiKey":"mini-key","authType":"api_key"},{"providerId":"google","apiKey":"google-key","authType":"api_key"}]`); err != nil {
		t.Fatalf("seed provider configs: %v", err)
	}

	b := &BridgeHandler{
		store:     st,
		paths:     Paths{HyperClaw: hyperclawDir},
		deviceKey: deviceKey,
	}

	result := b.credentialsList()
	if result.err != nil {
		t.Fatalf("credentialsList: %v", result.err)
	}
	data, ok := result.data.(map[string]interface{})
	if !ok {
		t.Fatalf("unexpected list payload: %#v", result.data)
	}
	list, ok := data["credentials"].([]credentials.MaskedCred)
	if !ok {
		t.Fatalf("unexpected credentials payload: %#v", data["credentials"])
	}

	seen := map[string]bool{}
	for _, cred := range list {
		seen[cred.Provider] = true
	}
	for _, provider := range []string{"minimax", "google"} {
		if !seen[provider] {
			t.Fatalf("expected migrated provider %q in credential list: %#v", provider, list)
		}
	}

	rawState, err := st.KVGet(onboardingProviderConfigsKey)
	if err != nil {
		t.Fatalf("read redacted provider configs: %v", err)
	}
	if strings.Contains(rawState, "mini-key") || strings.Contains(rawState, "google-key") {
		t.Fatalf("expected saved onboarding provider configs to be redacted, got %s", rawState)
	}
	synced, err := st.KVGet(onboardingProviderCredentialsSyncedKey)
	if err != nil {
		t.Fatalf("read sync marker: %v", err)
	}
	if synced != "true" {
		t.Fatalf("expected sync marker to be true, got %q", synced)
	}
}
