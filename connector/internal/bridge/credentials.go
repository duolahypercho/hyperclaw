package bridge

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/hypercho/hyperclaw-connector/internal/credentials"
)

const (
	onboardingProviderConfigsKey           = "onboarding-provider-configs"
	onboardingProviderCredentialsSyncedKey = "onboarding-provider-configs-credentials-synced"
)

func canonicalCredentialProvider(provider string) string {
	provider = strings.TrimSpace(strings.ToLower(provider))
	switch provider {
	case "gemini":
		return "google"
	case "kimi":
		return "moonshot"
	default:
		return provider
	}
}

// credentialsStore handles the "credentials:store" action.
// Decrypts a sealed-box payload from the dashboard and saves it to credentials.enc.
func (b *BridgeHandler) credentialsStore(params map[string]interface{}) actionResult {
	if b.deviceKey == nil {
		return errResult("device key not available")
	}

	provider, _ := params["provider"].(string)
	provider = canonicalCredentialProvider(provider)
	if provider == "" {
		return errResult("missing required field: provider")
	}
	credType, _ := params["type"].(string)
	if credType == "" {
		credType = "api_key"
	}
	encPayload, _ := params["encryptedPayload"].(string)
	if encPayload == "" {
		return errResult("missing required field: encryptedPayload")
	}

	// Base64-decode the sealed box ciphertext
	ciphertext, err := base64.StdEncoding.DecodeString(encPayload)
	if err != nil {
		return errResult("invalid base64 in encryptedPayload: " + err.Error())
	}

	// Convert Ed25519 key to X25519
	x25519Priv := credentials.Ed25519ToX25519Private(b.deviceKey)
	x25519Pub := credentials.GetX25519Pubkey(b.deviceKey)

	var privKey, pubKey [32]byte
	copy(privKey[:], x25519Priv)
	copy(pubKey[:], x25519Pub)

	// Decrypt sealed box to get the plaintext API key
	plaintext, err := credentials.DecryptSealedBox(&privKey, &pubKey, ciphertext)
	if err != nil {
		return errResult("failed to decrypt sealed box: " + err.Error())
	}

	// Load existing credentials
	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		return errResult("failed to load credentials: " + err.Error())
	}

	// Add/update the provider entry
	store.Set(provider, credentials.Credential{
		Type:  credType,
		Key:   string(plaintext),
		Added: credentials.Now(),
	})

	// Save back
	if err := credentials.SaveCredentials(b.paths.HyperClaw, b.deviceKey, store); err != nil {
		return errResult("failed to save credentials: " + err.Error())
	}

	log.Printf("[credentials] stored credential for provider %q", provider)

	return okResult(map[string]interface{}{
		"success":  true,
		"provider": provider,
	})
}

// credentialsList handles the "credentials:list" action.
// Returns a masked list of stored credentials (never exposes full keys).
func (b *BridgeHandler) credentialsList() actionResult {
	if b.deviceKey == nil {
		return errResult("device key not available")
	}

	if err := b.syncSavedOnboardingProviderCredentials(); err != nil {
		log.Printf("[credentials] onboarding credential sync skipped: %v", err)
	}

	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		// If file doesn't exist or can't be read, return empty list
		log.Printf("[credentials] load error (returning empty list): %v", err)
		return okResult(map[string]interface{}{
			"credentials": []credentials.MaskedCred{},
		})
	}

	return okResult(map[string]interface{}{
		"credentials": store.List(),
	})
}

// credentialsDelete handles the "credentials:delete" action.
func (b *BridgeHandler) credentialsDelete(params map[string]interface{}) actionResult {
	if b.deviceKey == nil {
		return errResult("device key not available")
	}

	provider, _ := params["provider"].(string)
	provider = canonicalCredentialProvider(provider)
	if provider == "" {
		return errResult("missing required field: provider")
	}

	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		return errResult("failed to load credentials: " + err.Error())
	}

	store.Delete(provider)

	if err := credentials.SaveCredentials(b.paths.HyperClaw, b.deviceKey, store); err != nil {
		return errResult("failed to save credentials: " + err.Error())
	}

	log.Printf("[credentials] deleted credential for provider %q", provider)

	return okResult(map[string]interface{}{
		"success":  true,
		"provider": provider,
	})
}

func credentialProviderConfigs(allCreds map[string]credentials.Credential, onlyProvider string) []onboardingProviderConfig {
	onlyProvider = canonicalCredentialProvider(onlyProvider)
	canonicalCreds := make(map[string]credentials.Credential, len(allCreds))
	providers := make([]string, 0, len(allCreds))
	for provider, cred := range allCreds {
		provider = canonicalCredentialProvider(provider)
		key := strings.TrimSpace(cred.Key)
		if provider == "" || key == "" {
			continue
		}
		if onlyProvider != "" && provider != onlyProvider {
			continue
		}
		if _, hermesOK := hermesProviderEnvKeys[provider]; !hermesOK && mapProviderToOnboard(&onboardingProviderConfig{ProviderID: provider}) == nil {
			continue
		}
		if _, exists := canonicalCreds[provider]; exists {
			continue
		}
		canonicalCreds[provider] = cred
		providers = append(providers, provider)
	}
	sort.Strings(providers)

	configs := make([]onboardingProviderConfig, 0, len(providers))
	for _, provider := range providers {
		configs = append(configs, onboardingProviderConfig{
			ProviderID: provider,
			APIKey:     strings.TrimSpace(canonicalCreds[provider].Key),
			AuthType:   "api_key",
		})
	}
	return configs
}

func redactedOnboardingProviderConfigs(providers []onboardingProviderConfig) []onboardingProviderConfig {
	if len(providers) == 0 {
		return []onboardingProviderConfig{}
	}
	out := make([]onboardingProviderConfig, len(providers))
	copy(out, providers)
	for i := range out {
		out[i].APIKey = ""
		out[i].OAuthTokens = nil
	}
	return out
}

func (b *BridgeHandler) saveOnboardingProviderCredentials(providers []onboardingProviderConfig) (int, error) {
	if len(providers) == 0 || b.deviceKey == nil {
		return 0, nil
	}

	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		return 0, err
	}

	existing := store.GetAll()
	count := 0
	for _, p := range providers {
		provider := canonicalCredentialProvider(p.ProviderID)
		key := strings.TrimSpace(p.APIKey)
		if provider == "" || key == "" {
			continue
		}
		credType := strings.TrimSpace(p.AuthType)
		if credType == "" {
			credType = "api_key"
		}
		added := credentials.Now()
		if current, ok := existing[provider]; ok {
			if current.Key == key && current.Type == credType {
				continue
			}
			if current.Added != "" {
				added = current.Added
			}
		}
		store.Set(provider, credentials.Credential{
			Type:  credType,
			Key:   key,
			Added: added,
		})
		count++
	}
	if count == 0 {
		return 0, nil
	}

	if err := credentials.SaveCredentials(b.paths.HyperClaw, b.deviceKey, store); err != nil {
		return 0, err
	}
	return count, nil
}

func (b *BridgeHandler) syncSavedOnboardingProviderCredentials() error {
	if b.store == nil || b.deviceKey == nil {
		return nil
	}
	if synced, err := b.store.KVGet(onboardingProviderCredentialsSyncedKey); err != nil {
		return err
	} else if strings.TrimSpace(synced) == "true" {
		return nil
	}

	raw, err := b.store.KVGet(onboardingProviderConfigsKey)
	if err != nil {
		return err
	}
	if strings.TrimSpace(raw) == "" {
		if err := b.store.KVSet(onboardingProviderCredentialsSyncedKey, "true"); err != nil {
			return err
		}
		return nil
	}

	var providers []onboardingProviderConfig
	if err := json.Unmarshal([]byte(raw), &providers); err != nil {
		return fmt.Errorf("decode saved provider configs: %w", err)
	}
	count, err := b.saveOnboardingProviderCredentials(providers)
	if err != nil {
		return err
	}
	if count > 0 {
		log.Printf("[credentials] synced %d onboarding provider credential(s) into encrypted store", count)
	}
	redacted, err := json.Marshal(redactedOnboardingProviderConfigs(providers))
	if err != nil {
		return err
	}
	if err := b.store.KVSet(onboardingProviderConfigsKey, string(redacted)); err != nil {
		return err
	}
	if err := b.store.KVSet(onboardingProviderCredentialsSyncedKey, "true"); err != nil {
		return err
	}
	return nil
}

func (b *BridgeHandler) openClawConfigPath() string {
	openClawDir := b.openClawDir()
	return filepath.Join(openClawDir, "openclaw.json")
}

func (b *BridgeHandler) openClawDir() string {
	openClawDir := b.paths.OpenClaw
	if strings.TrimSpace(openClawDir) == "" {
		openClawDir = filepath.Join(b.paths.Home, ".openclaw")
	}
	return openClawDir
}

func credentialModelNames(params map[string]interface{}) []string {
	raw := params["models"]
	items, ok := raw.([]interface{})
	if !ok {
		if stringsList, ok := raw.([]string); ok {
			items = make([]interface{}, 0, len(stringsList))
			for _, value := range stringsList {
				items = append(items, value)
			}
		}
	}
	seen := map[string]bool{}
	models := make([]string, 0, len(items))
	for _, item := range items {
		model := ""
		switch v := item.(type) {
		case string:
			model = v
		case map[string]interface{}:
			for _, key := range []string{"name", "id", "model"} {
				if value, _ := v[key].(string); value != "" {
					model = value
					break
				}
			}
		}
		model = strings.TrimSpace(model)
		if model == "" || seen[model] {
			continue
		}
		seen[model] = true
		models = append(models, model)
	}
	return models
}

func jsonObject(parent map[string]interface{}, key string) map[string]interface{} {
	obj, _ := parent[key].(map[string]interface{})
	if obj == nil {
		obj = map[string]interface{}{}
		parent[key] = obj
	}
	return obj
}

func applyOpenClawProviderModels(configPath, provider string, modelNames []string) error {
	provider = strings.TrimSpace(provider)
	if provider == "" || len(modelNames) == 0 {
		return nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("[credentials] openclaw.json not found; skipped model registration for %s", provider)
			return nil
		}
		return err
	}
	var root map[string]interface{}
	if err := json.Unmarshal(data, &root); err != nil {
		return err
	}

	modelsRoot := jsonObject(root, "models")
	providersRoot := jsonObject(modelsRoot, "providers")
	providerConfig := jsonObject(providersRoot, provider)

	providerModels := make([]interface{}, 0, len(modelNames))
	modelsSeen := map[string]bool{}
	if existingModels, _ := providerConfig["models"].([]interface{}); len(existingModels) > 0 {
		for _, raw := range existingModels {
			id := ""
			if entry, ok := raw.(map[string]interface{}); ok {
				id, _ = entry["id"].(string)
			}
			id = strings.TrimSpace(id)
			if id == "" || modelsSeen[id] {
				continue
			}
			modelsSeen[id] = true
			providerModels = append(providerModels, raw)
		}
	}
	defaultModelPatches := map[string]interface{}{}
	for _, model := range modelNames {
		model = strings.TrimSpace(model)
		if model == "" || modelsSeen[model] {
			continue
		}
		modelsSeen[model] = true
		providerModels = append(providerModels, map[string]interface{}{"id": model})
		fullID := provider + "/" + model
		defaultModelPatches[fullID] = map[string]interface{}{
			"provider":    provider,
			"model":       model,
			"authProfile": provider + ":manual",
		}
	}
	if len(providerModels) == 0 {
		return nil
	}
	providerConfig["models"] = providerModels

	agentsRoot := jsonObject(root, "agents")
	defaultsRoot := jsonObject(agentsRoot, "defaults")
	defaultModelsRoot := jsonObject(defaultsRoot, "models")
	for id, config := range defaultModelPatches {
		defaultModelsRoot[id] = config
	}

	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	if string(out) == string(data) {
		return nil
	}
	return os.WriteFile(configPath, out, 0600)
}

// credentialsApply handles the "credentials:apply" action.
// Loads stored model-provider credentials and applies them directly to OpenClaw
// and Hermes runtime config so newly saved bridge keys are immediately usable.
func (b *BridgeHandler) credentialsApply(params map[string]interface{}) actionResult {
	if b.deviceKey == nil {
		return errResult("device key not available")
	}

	provider, _ := params["provider"].(string)
	provider = canonicalCredentialProvider(provider)

	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		return errResult("failed to load credentials: " + err.Error())
	}

	allCreds := store.GetAll()
	if provider != "" {
		if _, ok := allCreds[provider]; !ok {
			return errResult("no credential found for provider: " + provider)
		}
	}

	providers := credentialProviderConfigs(allCreds, provider)
	if len(providers) == 0 {
		return okResult(map[string]interface{}{
			"success": true,
			"applied": []string{},
		})
	}

	appliedSet := map[string]bool{}

	runtimePaths := b.paths
	runtimePaths.OpenClaw = b.openClawDir()
	if err := writeOpenClawAuthProfiles(runtimePaths, providers); err != nil {
		return errResult("failed to apply credentials to OpenClaw: " + err.Error())
	}
	persistOpenClawProviderEnvKeys(b.openClawConfigPath(), providers)
	modelNames := credentialModelNames(params)
	if provider != "" && len(modelNames) > 0 {
		if err := applyOpenClawProviderModels(b.openClawConfigPath(), provider, modelNames); err != nil {
			return errResult("failed to register OpenClaw models: " + err.Error())
		}
	}
	appliedSet["openclaw"] = true

	hermesProviders := make([]onboardingProviderConfig, 0, len(providers))
	for _, p := range providers {
		if _, ok := hermesProviderEnvKeys[p.ProviderID]; ok {
			hermesProviders = append(hermesProviders, p)
		}
	}
	if len(hermesProviders) > 0 {
		if err := b.ensureHermesEnv(hermesProviders, nil, nil); err != nil {
			return errResult("failed to apply credentials to Hermes: " + err.Error())
		}
		appliedSet["hermes"] = true
	}

	applied := make([]string, 0, len(appliedSet))
	for runtime := range appliedSet {
		applied = append(applied, runtime)
	}
	sort.Strings(applied)
	log.Printf("[credentials] applied %d model provider credential(s) to %s", len(providers), strings.Join(applied, ", "))

	return okResult(map[string]interface{}{
		"success": true,
		"applied": applied,
	})
}
