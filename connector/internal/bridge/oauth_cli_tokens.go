package bridge

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

// ── Claude CLI credential store ─────────────────────────────────────────
// ~/.claude/.credentials.json
// The Claude CLI reads OAuth tokens from this file.

type claudeCliCredentials struct {
	// The Claude CLI stores credentials as a flat object.
	// OAuth tokens use the fields below.
	OAuthToken   string `json:"oauthToken,omitempty"`
	RefreshToken string `json:"refreshToken,omitempty"`
	ExpiresAt    int64  `json:"expiresAt,omitempty"`
}

func writeClaudeCliOAuthTokens(home string, tokens *onboardingOAuthTokens) error {
	if tokens == nil || tokens.AccessToken == "" {
		return fmt.Errorf("no access token provided")
	}

	claudeDir := filepath.Join(home, ".claude")
	if err := os.MkdirAll(claudeDir, 0700); err != nil {
		return fmt.Errorf("failed to create ~/.claude: %w", err)
	}

	credPath := filepath.Join(claudeDir, ".credentials.json")

	// Read existing credentials to preserve other fields
	existing := make(map[string]interface{})
	if data, err := os.ReadFile(credPath); err == nil {
		json.Unmarshal(data, &existing)
	}

	// Write the OAuth token fields
	existing["oauthToken"] = tokens.AccessToken
	if tokens.RefreshToken != "" {
		existing["refreshToken"] = tokens.RefreshToken
	}
	if tokens.ExpiresIn > 0 {
		existing["expiresAt"] = time.Now().Unix() + int64(tokens.ExpiresIn)
	}

	data, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal credentials: %w", err)
	}

	if err := os.WriteFile(credPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write ~/.claude/.credentials.json: %w", err)
	}

	log.Printf("[oauth] wrote Anthropic OAuth tokens to %s", credPath)
	return nil
}

// ── Codex CLI credential store ──────────────────────────────────────────
// ~/.codex/auth.json
// The Codex CLI reads OAuth tokens from this file.

type codexCliAuth struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at,omitempty"`
	IDToken      string `json:"id_token,omitempty"`
}

func writeCodexCliOAuthTokens(home string, tokens *onboardingOAuthTokens) error {
	if tokens == nil || tokens.AccessToken == "" {
		return fmt.Errorf("no access token provided")
	}

	codexDir := filepath.Join(home, ".codex")
	if err := os.MkdirAll(codexDir, 0700); err != nil {
		return fmt.Errorf("failed to create ~/.codex: %w", err)
	}

	authPath := filepath.Join(codexDir, "auth.json")

	auth := codexCliAuth{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		IDToken:      tokens.IDToken,
	}
	if tokens.ExpiresIn > 0 {
		auth.ExpiresAt = time.Now().Unix() + int64(tokens.ExpiresIn)
	}

	data, err := json.MarshalIndent(auth, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal auth: %w", err)
	}

	if err := os.WriteFile(authPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write ~/.codex/auth.json: %w", err)
	}

	log.Printf("[oauth] wrote Codex OAuth tokens to %s", authPath)
	return nil
}

// ── Bridge action ───────────────────────────────────────────────────────

// oauthStoreCliTokens handles the "oauth:store-cli-tokens" bridge action.
// Writes OAuth tokens to the appropriate CLI credential store so the runtime
// CLI can pick them up natively.
func (b *BridgeHandler) oauthStoreCliTokens(params map[string]interface{}) actionResult {
	providerRaw, _ := params["oauthProvider"].(string)

	tokensRaw, _ := params["oauthTokens"].(map[string]interface{})
	if len(tokensRaw) == 0 {
		return errResult("missing oauthTokens")
	}

	// Decode tokens
	tokensJSON, _ := json.Marshal(tokensRaw)
	var tokens onboardingOAuthTokens
	if err := json.Unmarshal(tokensJSON, &tokens); err != nil {
		return errResult("invalid oauthTokens: " + err.Error())
	}

	home := b.paths.Home

	switch providerRaw {
	case "anthropic-claude":
		if err := writeClaudeCliOAuthTokens(home, &tokens); err != nil {
			return errResult("failed to store Anthropic OAuth tokens: " + err.Error())
		}
		return okResult(map[string]interface{}{
			"success":  true,
			"provider": "anthropic-claude",
			"store":    "~/.claude/.credentials.json",
		})

	case "openai-codex":
		if err := writeCodexCliOAuthTokens(home, &tokens); err != nil {
			return errResult("failed to store Codex OAuth tokens: " + err.Error())
		}
		return okResult(map[string]interface{}{
			"success":  true,
			"provider": "openai-codex",
			"store":    "~/.codex/auth.json",
		})

	default:
		return errResult("unsupported OAuth provider: " + providerRaw)
	}
}
