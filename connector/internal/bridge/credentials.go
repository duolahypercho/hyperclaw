package bridge

import (
	"encoding/base64"
	"log"

	"github.com/hypercho/hyperclaw-connector/internal/credentials"
)

// credentialsStore handles the "credentials:store" action.
// Decrypts a sealed-box payload from the dashboard and saves it to credentials.enc.
func (b *BridgeHandler) credentialsStore(params map[string]interface{}) actionResult {
	if b.deviceKey == nil {
		return errResult("device key not available")
	}

	provider, _ := params["provider"].(string)
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

// credentialsApply handles the "credentials:apply" action.
// Loads credentials and signals relevant runtimes to reload.
func (b *BridgeHandler) credentialsApply(params map[string]interface{}) actionResult {
	if b.deviceKey == nil {
		return errResult("device key not available")
	}

	provider, _ := params["provider"].(string)

	store, err := credentials.LoadCredentials(b.paths.HyperClaw, b.deviceKey)
	if err != nil {
		return errResult("failed to load credentials: " + err.Error())
	}

	allCreds := store.GetAll()
	applied := []string{}

	if provider != "" {
		// Apply specific provider
		if _, ok := allCreds[provider]; !ok {
			return errResult("no credential found for provider: " + provider)
		}
		// For now, log what would happen. Actual runtime restart integration
		// can be wired later using the gatewayRestart pattern.
		log.Printf("[credentials] would apply credential for provider %q to runtimes", provider)
		applied = append(applied, "openclaw")
	} else {
		// Apply all
		for name := range allCreds {
			log.Printf("[credentials] would apply credential for provider %q to runtimes", name)
		}
		if len(allCreds) > 0 {
			applied = append(applied, "openclaw")
		}
	}

	return okResult(map[string]interface{}{
		"success": true,
		"applied": applied,
	})
}

