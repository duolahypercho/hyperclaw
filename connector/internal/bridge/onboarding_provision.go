package bridge

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"regexp"

	"github.com/google/uuid"
	connectorconfig "github.com/hypercho/hyperclaw-connector/internal/config"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// ansiStripper removes ANSI escape sequences from CLI output before sending to UI.
var ansiStripper = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
var onboardingAgentIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

type onboardingCLISecretPattern struct {
	pattern     *regexp.Regexp
	replacement string
}

var onboardingCLITokenPatterns = []onboardingCLISecretPattern{
	{pattern: regexp.MustCompile(`\b(?:xox[baprs]|xapp)-[A-Za-z0-9-]+\b`), replacement: "[redacted]"},
	{pattern: regexp.MustCompile(`\b\d{8,12}:[A-Za-z0-9_-]{30,}\b`), replacement: "[redacted]"},
	{pattern: regexp.MustCompile(`(?i)\b((?:bot|app|api|access|refresh)[_-]?token\s*[:=]\s*)\S+`), replacement: "${1}[redacted]"},
	{pattern: regexp.MustCompile(`\bsk-[A-Za-z0-9_-]{20,}\b`), replacement: "[redacted]"},
	{pattern: regexp.MustCompile(`\bAIza[0-9A-Za-z_-]{20,}\b`), replacement: "[redacted]"},
}

var openClawBindingTargetPattern = regexp.MustCompile(`(?i)(telegram|discord|slack|whatsapp):[^\s|,]+`)

const openClawChannelDoctorFixTimeoutMs = 300000
const maxOpenClawBindingReassignments = 8

var onboardingAllowedChannelIDs = map[string]bool{
	"telegram": true,
	"discord":  true,
	"slack":    true,
	"whatsapp": true,
}

type onboardingAgentProfile struct {
	Runtime       string `json:"runtime"`
	Name          string `json:"name"`
	Role          string `json:"role"`
	Description   string `json:"description"`
	EmojiEnabled  bool   `json:"emojiEnabled"`
	Emoji         string `json:"emoji"`
	AvatarDataURI string `json:"avatarDataUri"`
	MainModel     string `json:"mainModel"`
}

type onboardingChannelConfig struct {
	Channel  string `json:"channel"`
	Target   string `json:"target"`
	BotToken string `json:"botToken"`
	AppToken string `json:"appToken"` // Slack Socket Mode only (xapp-)
}

type onboardingRuntimeChannelConfig struct {
	Runtime   string                    `json:"runtime"`
	AgentID   string                    `json:"agentId,omitempty"`
	AgentName string                    `json:"agentName,omitempty"`
	Channels  []onboardingChannelConfig `json:"channels"`
}

type onboardingStepResult struct {
	Key    string `json:"key"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type onboardingProviderConfig struct {
	ProviderID    string                 `json:"providerId"`
	APIKey        string                 `json:"apiKey"`
	Model         string                 `json:"model"`
	AuthType      string                 `json:"authType,omitempty"` // "api_key" or "oauth"
	OAuthTokens   *onboardingOAuthTokens `json:"oauthTokens,omitempty"`
	OAuthProvider string                 `json:"oauthProvider,omitempty"` // "openai-codex" or "anthropic-claude"
}

type onboardingOAuthTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn,omitempty"`
	IDToken      string `json:"idToken,omitempty"`
	TokenType    string `json:"tokenType,omitempty"`
}

// hermesProviderEnvKeys maps onboarding provider IDs → Hermes .env variable names.
var hermesProviderEnvKeys = map[string][]string{
	"anthropic":   {"ANTHROPIC_API_KEY"},
	"openai":      {"OPENAI_API_KEY"},
	"openrouter":  {"OPENROUTER_API_KEY"},
	"google":      {"GOOGLE_API_KEY", "GEMINI_API_KEY"},
	"gemini":      {"GOOGLE_API_KEY", "GEMINI_API_KEY"},
	"mistral":     {"MISTRAL_API_KEY"},
	"groq":        {"GROQ_API_KEY"},
	"xai":         {"XAI_API_KEY"},
	"cohere":      {"COHERE_API_KEY"},
	"minimax":     {"MINIMAX_API_KEY"},
	"kimi":        {"KIMI_API_KEY"},
	"moonshot":    {"KIMI_API_KEY"},
	"together":    {"TOGETHER_API_KEY"},
	"huggingface": {"HF_TOKEN"},
	"deepseek":    {"DEEPSEEK_API_KEY"},
	"cerebras":    {"CEREBRAS_API_KEY"},
	"nvidia":      {"NVIDIA_API_KEY"},
	"perplexity":  {"PERPLEXITY_API_KEY"},
}

// hermesChannelEnvKeys maps channel names → Hermes .env variable names for home channel targets.
var hermesChannelEnvKeys = map[string]string{
	"telegram": "TELEGRAM_CHAT_ID",
	"discord":  "DISCORD_CHANNEL_ID",
	"slack":    "SLACK_CHANNEL_ID",
	"whatsapp": "WHATSAPP_TARGET",
}

func onboardingSlug(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	var b strings.Builder
	lastDash := false
	for _, ch := range value {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			b.WriteRune(ch)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteRune('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "agent"
	}
	return out
}

func normalizeOnboardingChannelID(value string) (string, error) {
	channel := strings.TrimSpace(strings.ToLower(value))
	if channel == "" {
		return "", fmt.Errorf("channel is required")
	}
	if !onboardingAllowedChannelIDs[channel] {
		return "", fmt.Errorf("unsupported channel %q", value)
	}
	return channel, nil
}

func sanitizeOnboardingAgentID(value string) (string, error) {
	agentID := strings.TrimSpace(normalizeHermesAgentId(value))
	if agentID == "" {
		return "", fmt.Errorf("agentId is required")
	}
	if isHermesMainAgent(agentID) {
		return agentID, nil
	}
	if !onboardingAgentIDPattern.MatchString(agentID) || strings.Contains(agentID, "..") {
		return "", fmt.Errorf("invalid agentId %q", value)
	}
	return agentID, nil
}

func sanitizeHermesEnvValue(key, value string) (string, error) {
	value = strings.TrimSpace(value)
	if strings.ContainsAny(value, "\r\n\x00") {
		return "", fmt.Errorf("%s contains invalid control characters", key)
	}
	return value, nil
}

func onboardingIdentityMD(name, emoji, description, avatarPath string) string {
	emojiStr := strings.TrimSpace(emoji)
	desc := strings.TrimSpace(description)

	// Derive "Creature" from description by stripping the agent name prefix.
	// e.g. "Doraemon is a blue robot cat" → "Blue robot cat"
	creature := desc
	lowerDesc := strings.ToLower(desc)
	lowerName := strings.ToLower(name)
	for _, prefix := range []string{
		lowerName + " is a ",
		lowerName + " is an ",
		lowerName + " is ",
	} {
		if strings.HasPrefix(lowerDesc, prefix) {
			creature = strings.TrimSpace(desc[len(prefix):])
			break
		}
	}
	// Capitalize first letter
	if len(creature) > 0 {
		creature = strings.ToUpper(creature[:1]) + creature[1:]
	}

	// Build the complete IDENTITY.md following OpenClaw's native format.
	// This replaces the entire file (not injected via markers).
	var b strings.Builder
	b.WriteString("# IDENTITY.md - Who Am I?\n\n")
	b.WriteString(fmt.Sprintf("- **Name:** %s\n", name))
	if creature != "" {
		b.WriteString(fmt.Sprintf("- **Creature:** %s\n", creature))
	}
	b.WriteString(fmt.Sprintf("- **Vibe:** %s\n", onboardingVibe(desc)))
	if emojiStr != "" {
		b.WriteString(fmt.Sprintf("- **Emoji:** %s\n", emojiStr))
	}
	if avatarPath != "" {
		b.WriteString(fmt.Sprintf("- **Avatar:** %s\n", avatarPath))
	}
	b.WriteString("\n---\n\n")
	if desc != "" {
		b.WriteString(desc + "\n")
	}
	return b.String()
}

// onboardingUserMD generates USER.md pre-filled with the user's profile info.
func onboardingUserMD(userName, userEmail, userAboutMe string) string {
	userName = strings.TrimSpace(userName)
	userEmail = strings.TrimSpace(userEmail)
	userAboutMe = strings.TrimSpace(userAboutMe)

	var b strings.Builder
	b.WriteString("# USER.md - Who Am I Talking To?\n\n")
	b.WriteString("_Update this whenever you discover something new about the user._\n\n")
	b.WriteString("- **Name:** " + userName + "\n")
	b.WriteString("- **Email:** " + userEmail + "\n")
	if userAboutMe != "" {
		b.WriteString("- **About:** " + userAboutMe + "\n")
	}
	b.WriteString("- **Role:** \n")
	b.WriteString("- **Preferences:** \n")
	b.WriteString("- **Communication style:** \n")
	b.WriteString("- **Timezone:** \n\n")
	b.WriteString("---\n\n")
	b.WriteString("This file is your memory of the person you're working with. Keep it current.\n")
	b.WriteString("When you learn something durable about the user, update this file.\n")
	return b.String()
}

// onboardingSoulMD generates a small starter SOUL.md for agents created by
// onboarding and MCP tools. Dashboard-created agents may overwrite this with a
// richer template immediately after provisioning.
func onboardingSoulMD(name, role, description string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Agent"
	}
	role = strings.TrimSpace(role)
	description = strings.TrimSpace(description)

	var b strings.Builder
	b.WriteString("# SOUL.md - Who You Are\n\n")
	b.WriteString("You are **" + name + "**.\n")
	if role != "" {
		b.WriteString("\n- **Role:** " + role + "\n")
	}
	if description != "" {
		b.WriteString("\n## Mission\n\n")
		b.WriteString(description + "\n")
	}
	b.WriteString("\n## Operating Style\n\n")
	b.WriteString("- Lead with the useful answer.\n")
	b.WriteString("- Keep context in files, not in memory.\n")
	b.WriteString("- Read `USER.md` before making assumptions about the operator.\n")
	b.WriteString("- Ask before destructive or external actions.\n")
	b.WriteString("- Escalate clearly when blocked.\n")
	return b.String()
}

// onboardingVibe picks a vibe word from the description, or defaults to "helpful".
func onboardingVibe(description string) string {
	lower := strings.ToLower(description)
	vibeKeywords := map[string]string{
		"friendly":     "warm, friendly",
		"warm":         "warm",
		"sharp":        "sharp",
		"serious":      "focused, serious",
		"fun":          "playful",
		"playful":      "playful",
		"calm":         "calm",
		"chaotic":      "chaotic",
		"professional": "professional",
		"strict":       "strict, precise",
		"creative":     "creative",
		"chill":        "chill",
		"energetic":    "energetic",
		"gentle":       "gentle",
		"bold":         "bold",
		"kind":         "kind, warm",
		"cute":         "cute, warm",
		"helpful":      "helpful",
	}
	for keyword, vibe := range vibeKeywords {
		if strings.Contains(lower, keyword) {
			return vibe
		}
	}
	return "helpful"
}

// saveOnboardingAvatar decodes a data URI and saves the image to the workspace's
// avatars/ directory. Returns the workspace-relative path (e.g. "avatars/doraemon.png")
// or empty string if no avatar was provided.
func saveOnboardingAvatar(workspaceDir, agentSlug, dataURI string) string {
	dataURI = strings.TrimSpace(dataURI)
	if dataURI == "" || !strings.HasPrefix(dataURI, "data:") {
		return ""
	}

	// Parse data URI: data:image/png;base64,iVBOR...
	parts := strings.SplitN(dataURI, ",", 2)
	if len(parts) != 2 {
		return ""
	}
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		log.Printf("[onboarding-avatar] base64 decode failed: %v", err)
		return ""
	}

	// Determine extension from MIME type
	ext := ".png"
	mime := strings.TrimSpace(parts[0]) // "data:image/png;base64"
	if strings.Contains(mime, "jpeg") || strings.Contains(mime, "jpg") {
		ext = ".jpg"
	} else if strings.Contains(mime, "webp") {
		ext = ".webp"
	} else if strings.Contains(mime, "gif") {
		ext = ".gif"
	}

	avatarDir := filepath.Join(workspaceDir, "avatars")
	if err := os.MkdirAll(avatarDir, 0700); err != nil {
		log.Printf("[onboarding-avatar] failed to create avatars dir: %v", err)
		return ""
	}

	filename := agentSlug + ext
	if err := os.WriteFile(filepath.Join(avatarDir, filename), data, 0600); err != nil {
		log.Printf("[onboarding-avatar] failed to write avatar: %v", err)
		return ""
	}

	return "avatars/" + filename
}

// onboardingWorkspaceDir returns the workspace directory for an agent based on its runtime.
// Everything except Hermes lives under ~/.hyperclaw/agents/{runtime}-{id}/
// so two agents named "main" under different runtimes don't collide.
func onboardingWorkspaceDir(paths Paths, runtimeName, agentID string) string {
	switch runtimeName {
	case "hermes":
		if isHermesMainAgent(agentID) {
			return filepath.Join(paths.Home, ".hermes")
		}
		return filepath.Join(paths.Home, ".hermes", "profiles", agentID)
	default:
		return paths.AgentDir(runtimeName, agentID)
	}
}

func shouldApplyProvisionChannelConfig(runtimeName, agentID string, exists bool) bool {
	if !exists {
		return true
	}
	return (runtimeName == "openclaw" || runtimeName == "hermes") && agentID == "main"
}

// knowledgeSection returns a markdown section pointing agents to the shared
// company knowledge base. The knowledgeDir is an absolute path like
// ~/.hyperclaw/knowledge/{slug}/ that gets embedded in the output.
func knowledgeSection(knowledgeDir string) string {
	if knowledgeDir == "" {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n## Company Knowledge\n\n")
	b.WriteString("Shared company context lives in `" + knowledgeDir + "`.\n\n")
	b.WriteString("| Path | What it contains |\n")
	b.WriteString("|------|------------------|\n")
	b.WriteString("| `fundamental/company.md` | Company name, description, and background |\n\n")
	b.WriteString("Read from this folder when you need company context. All agents share this knowledge base.\n")
	return b.String()
}

func onboardingClaudeMD(name, emoji, role, description, knowledgeDir string) string {
	lines := []string{"# " + name, ""}
	if strings.TrimSpace(emoji) != "" {
		lines = append(lines, fmt.Sprintf("- **Persona:** %s", strings.TrimSpace(emoji)))
	}
	if strings.TrimSpace(role) != "" {
		lines = append(lines, fmt.Sprintf("- **Role:** %s", strings.TrimSpace(role)))
	}
	if strings.TrimSpace(description) != "" {
		lines = append(lines, "", "## Instructions", "", strings.TrimSpace(description))
	}
	lines = append(lines, "",
		"## Your Personality Files", "",
		"This directory holds the files that define who you are. Read whichever are relevant to the task at hand — they are siblings of this CLAUDE.md file.", "",
		"| File | What it contains |",
		"|------|------------------|",
		"| `SOUL.md` | Your voice, personality, and how you behave |",
		"| `IDENTITY.md` | Your name, emoji, and canonical identity |",
		"| `USER.md` | What you know about the user you're talking to |",
		"| `MEMORY.md` | Your persistent memories |", "",
		"When the user asks about your personality or what you remember, read the relevant file rather than guessing. When you learn something durable about the user, update `USER.md`. When you want to record a memory, update `MEMORY.md`.",
	)
	lines = append(lines, knowledgeSection(knowledgeDir))
	return strings.Join(lines, "\n") + "\n"
}

// onboardingAgentsMD produces the initial AGENTS.md for a codex agent.
//
// Codex auto-loads AGENTS.md from its working directory (which, for Hyperclaw
// codex agents, is ~/.hyperclaw/agents/{agentId}/). This file is therefore the
// agent's primary instruction surface — the codex equivalent of CLAUDE.md.
//
// We seed it with the identity basics AND a directory pointer to the sibling
// personality files so codex knows to read them for deeper context (voice,
// user preferences, team, tools, schedule, memory). That way users can edit
// each concern in its own dedicated file via the Hyperclaw dashboard instead
// of cramming everything into AGENTS.md.
func onboardingAgentsMD(name, emoji, role, description, knowledgeDir string) string {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		trimmedName = "Agent"
	}
	trimmedEmoji := strings.TrimSpace(emoji)
	trimmedRole := strings.TrimSpace(role)
	trimmedDesc := strings.TrimSpace(description)

	var b strings.Builder
	b.WriteString("# " + trimmedName + "\n\n")

	b.WriteString("## Who You Are\n\n")
	b.WriteString("You are **" + trimmedName + "**. Stay in character. Be direct and useful.\n")
	if trimmedEmoji != "" {
		b.WriteString("\n- **Persona:** " + trimmedEmoji + "\n")
	}
	if trimmedRole != "" {
		if trimmedEmoji == "" {
			b.WriteString("\n")
		}
		b.WriteString("- **Role:** " + trimmedRole + "\n")
	}

	if trimmedDesc != "" {
		b.WriteString("\n## System Instructions\n\n")
		b.WriteString(trimmedDesc + "\n")
	}

	b.WriteString("\n## Your Personality Files\n\n")
	b.WriteString("This directory holds the files that define who you are. Read whichever are relevant to the task at hand — they are siblings of this AGENTS.md file.\n\n")
	b.WriteString("| File | What it contains |\n")
	b.WriteString("|------|------------------|\n")
	b.WriteString("| `SOUL.md` | Your voice, personality, and how you behave |\n")
	b.WriteString("| `IDENTITY.md` | Your name, emoji, and canonical identity |\n")
	b.WriteString("| `USER.md` | What you know about the user you're talking to |\n")
	b.WriteString("| `MEMORY.md` | Your persistent memories |\n\n")
	b.WriteString("When the user asks about your personality or what you remember, read the relevant file rather than guessing. When you learn something durable about the user, update `USER.md`. When you want to record a memory, update `MEMORY.md`.\n\n")

	b.WriteString("## Working Style\n\n")
	b.WriteString("- Skip filler openings like \"Great question!\" or \"I'd be happy to help.\" Just help.\n")
	b.WriteString("- Have opinions. Be concise when the task is simple, thorough when it matters.\n")
	b.WriteString("- Private things stay private. When in doubt, ask before acting externally.\n")
	b.WriteString(knowledgeSection(knowledgeDir))

	return b.String()
}

func onboardingRuntimeRole(runtimeName string) string {
	switch runtimeName {
	case "openclaw":
		return "Company operating agent"
	case "hermes":
		return "Long-running execution agent"
	case "claude-code":
		return "Claude Code engineering agent"
	case "codex":
		return "Codex engineering agent"
	default:
		return "Agent"
	}
}

// hermesModelSlug converts a HyperClaw model identifier to Hermes "provider/model" format.
// If the model already contains a slash, it's assumed to be in Hermes format already.
// The dashboard onboarding emits "provider:model" with a colon separator, which we
// normalize to the slash format Hermes expects.
func hermesModelSlug(model string) string {
	if model == "" {
		return ""
	}
	// Normalize "provider:model" (dashboard format) → "provider/model" (Hermes format).
	if !strings.Contains(model, "/") && strings.Contains(model, ":") {
		model = strings.Replace(model, ":", "/", 1)
	}
	if strings.Contains(model, "/") {
		return model
	}
	// Map common HyperClaw bare model names to Hermes provider/model slugs.
	// Hermes uses "provider/model-name" format for its config.yaml.
	knownMappings := map[string]string{
		"claude-opus-4":    "anthropic/claude-opus-4",
		"claude-sonnet-4":  "anthropic/claude-sonnet-4",
		"claude-haiku-3.5": "anthropic/claude-3-5-haiku-latest",
		"gpt-4o":           "openai/gpt-4o",
		"gpt-4o-mini":      "openai/gpt-4o-mini",
		"o3":               "openai/o3",
		"o4-mini":          "openai/o4-mini",
		"gemini-2.5-pro":   "google/gemini-2.5-pro",
		"gemini-2.5-flash": "google/gemini-2.5-flash",
		"MiniMax-M2.7":     "minimax/MiniMax-M2.7",
		"MiniMax-M2.5":     "minimax/MiniMax-M2.5",
	}
	if slug, ok := knownMappings[model]; ok {
		return slug
	}
	// Fallback: return as-is, Hermes may still recognize it
	return model
}

type hermesModelConfig struct {
	Default  string
	Provider string
	BaseURL  string
	APIMode  string
}

func hermesProviderID(providerID string) string {
	switch strings.TrimSpace(strings.ToLower(providerID)) {
	case "moonshot", "kimi":
		return "kimi-coding"
	case "openai":
		return "custom"
	default:
		return strings.TrimSpace(strings.ToLower(providerID))
	}
}

func hermesModelBaseURL(providerID string) string {
	switch providerID {
	case "custom":
		return "https://api.openai.com/v1"
	case "openrouter":
		return "https://openrouter.ai/api/v1"
	default:
		return ""
	}
}

func hermesDefaultModel(providerID, model string) string {
	model = strings.TrimSpace(model)
	if model != "" {
		normalized := model
		if !strings.Contains(normalized, "/") && strings.Contains(normalized, ":") {
			normalized = strings.Replace(normalized, ":", "/", 1)
		}
		if providerID != "openrouter" && providerID != "custom" && strings.Contains(normalized, "/") {
			prefix, rest, found := strings.Cut(normalized, "/")
			if found && hermesProviderID(prefix) == providerID {
				return strings.TrimSpace(rest)
			}
		}
		if providerID == "custom" && strings.HasPrefix(strings.ToLower(normalized), "openai/") {
			return strings.TrimSpace(normalized[len("openai/"):])
		}
		return normalized
	}

	switch providerID {
	case "anthropic":
		return "claude-opus-4-6"
	case "kimi-coding":
		return "kimi-k2.5"
	case "minimax":
		return "MiniMax-M2.7"
	case "custom":
		return "gpt-4o"
	case "openrouter":
		return "anthropic/claude-opus-4.6"
	default:
		return ""
	}
}

func hermesModelConfigFromOnboarding(providers []onboardingProviderConfig, primaryBrain *onboardingPrimaryBrain) (hermesModelConfig, bool) {
	providerID := ""
	model := ""
	if primaryBrain != nil {
		providerID = strings.TrimSpace(primaryBrain.ProviderID)
		model = strings.TrimSpace(primaryBrain.Model)
	}
	if providerID == "" {
		for _, p := range providers {
			if strings.TrimSpace(p.APIKey) == "" && p.AuthType != "oauth" {
				continue
			}
			providerID = strings.TrimSpace(p.ProviderID)
			model = strings.TrimSpace(p.Model)
			break
		}
	}

	providerID = hermesProviderID(providerID)
	defaultModel := hermesDefaultModel(providerID, model)
	if providerID == "" || defaultModel == "" {
		return hermesModelConfig{}, false
	}
	cfg := hermesModelConfig{
		Default:  defaultModel,
		Provider: providerID,
		BaseURL:  hermesModelBaseURL(providerID),
	}
	if providerID == "custom" && strings.Contains(cfg.BaseURL, "api.openai.com") {
		cfg.APIMode = "codex_responses"
	}
	return cfg, true
}

func yamlQuote(value string) string {
	escaped := strings.ReplaceAll(value, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	escaped = strings.ReplaceAll(escaped, "\r", `\r`)
	escaped = strings.ReplaceAll(escaped, "\n", `\n`)
	return `"` + escaped + `"`
}

func hermesModelConfigBlock(cfg hermesModelConfig) string {
	lines := []string{
		"model:",
		"  default: " + yamlQuote(cfg.Default),
		"  provider: " + yamlQuote(cfg.Provider),
	}
	if strings.TrimSpace(cfg.BaseURL) != "" {
		lines = append(lines, "  base_url: "+yamlQuote(strings.TrimSpace(cfg.BaseURL)))
	}
	if strings.TrimSpace(cfg.APIMode) != "" {
		lines = append(lines, "  api_mode: "+yamlQuote(strings.TrimSpace(cfg.APIMode)))
	}
	return strings.Join(lines, "\n")
}

func stripYAMLScalar(value string) string {
	value = strings.TrimSpace(value)
	if idx := strings.Index(value, "#"); idx >= 0 {
		value = strings.TrimSpace(value[:idx])
	}
	value = strings.Trim(value, `"'`)
	return strings.TrimSpace(value)
}

func parseHermesModelConfig(content string) hermesModelConfig {
	cfg := hermesModelConfig{}
	inModel := false
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if len(line) > 0 && line[0] != ' ' && line[0] != '\t' {
			if strings.HasPrefix(trimmed, "model:") {
				inModel = true
				if value := strings.TrimSpace(strings.TrimPrefix(trimmed, "model:")); value != "" {
					cfg.Default = stripYAMLScalar(value)
				}
				continue
			}
			if inModel {
				break
			}
		}
		if !inModel {
			continue
		}
		key, value, found := strings.Cut(trimmed, ":")
		if !found {
			continue
		}
		switch strings.TrimSpace(key) {
		case "default", "name", "model":
			if cfg.Default == "" {
				cfg.Default = stripYAMLScalar(value)
			}
		case "provider":
			cfg.Provider = hermesProviderID(stripYAMLScalar(value))
		case "base_url":
			cfg.BaseURL = stripYAMLScalar(value)
		case "api_mode":
			cfg.APIMode = stripYAMLScalar(value)
		}
	}
	return cfg
}

func hermesModelConfigFromSlug(model string, existingContent string) (hermesModelConfig, bool) {
	model = strings.TrimSpace(model)
	if model == "" {
		return hermesModelConfig{}, false
	}

	existing := parseHermesModelConfig(existingContent)
	existingProvider := hermesProviderID(existing.Provider)
	modelProvider := ""
	modelRest := ""
	normalized := model
	if !strings.Contains(normalized, "/") && strings.Contains(normalized, ":") {
		normalized = strings.Replace(normalized, ":", "/", 1)
	}
	if prefix, rest, found := strings.Cut(normalized, "/"); found {
		modelProvider = hermesProviderID(prefix)
		modelRest = strings.TrimSpace(rest)
	}

	provider := existingProvider
	if provider == "" || provider == "auto" {
		provider = modelProvider
	}
	if provider == "" {
		provider = "auto"
	}

	defaultModel := normalized
	if provider != "openrouter" && provider != "auto" && modelProvider == provider && modelRest != "" {
		defaultModel = modelRest
	}
	if provider == "custom" && strings.HasPrefix(strings.ToLower(normalized), "openai/") {
		defaultModel = strings.TrimSpace(normalized[len("openai/"):])
	}

	baseURL := existing.BaseURL
	if provider != "openrouter" && provider != "custom" && provider != "openai-codex" && provider != "copilot" && provider != "copilot-acp" {
		baseURL = ""
	}
	if baseURL == "" {
		baseURL = hermesModelBaseURL(provider)
	}

	apiMode := ""
	if provider == "custom" {
		apiMode = existing.APIMode
		if apiMode == "" && strings.Contains(baseURL, "api.openai.com") {
			apiMode = "codex_responses"
		}
	}

	return hermesModelConfig{
		Default:  defaultModel,
		Provider: provider,
		BaseURL:  baseURL,
		APIMode:  apiMode,
	}, true
}

func writeHermesModelConfigFile(configPath string, cfg hermesModelConfig) error {
	if strings.TrimSpace(cfg.Default) == "" || strings.TrimSpace(cfg.Provider) == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0700); err != nil {
		return fmt.Errorf("failed to create hermes config dir %s: %w", filepath.Dir(configPath), err)
	}
	content := ""
	if data, err := os.ReadFile(configPath); err == nil {
		content = string(data)
	}

	block := hermesModelConfigBlock(cfg)
	if strings.TrimSpace(content) == "" {
		return os.WriteFile(configPath, []byte(block+"\n"), 0600)
	}

	lines := strings.Split(content, "\n")
	out := make([]string, 0, len(lines)+4)
	replaced := false
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "model:") && len(line) > 0 && line[0] != ' ' && line[0] != '\t' {
			if !replaced {
				out = append(out, block)
				replaced = true
			}
			for i+1 < len(lines) {
				next := lines[i+1]
				nextTrimmed := strings.TrimSpace(next)
				if nextTrimmed != "" && len(next) > 0 && next[0] != ' ' && next[0] != '\t' {
					break
				}
				i++
			}
			continue
		}
		out = append(out, line)
	}
	if !replaced {
		out = append([]string{block, ""}, out...)
	}
	result := strings.Join(out, "\n")
	if !strings.HasSuffix(result, "\n") {
		result += "\n"
	}
	return os.WriteFile(configPath, []byte(result), 0600)
}

func (b *BridgeHandler) ensureHermesModelConfig(providers []onboardingProviderConfig, primaryBrain *onboardingPrimaryBrain) error {
	cfg, ok := hermesModelConfigFromOnboarding(providers, primaryBrain)
	if !ok {
		return nil
	}
	configPath := filepath.Join(b.paths.Home, ".hermes", "config.yaml")
	return writeHermesModelConfigFile(configPath, cfg)
}

func onboardingEnv(paths Paths) []string {
	home := paths.Home
	base := os.Getenv("PATH")
	extra := []string{
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, "bin"),
		filepath.Join(home, ".npm-global", "bin"),
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, "Library", "pnpm"),
		filepath.Join(home, ".local", "share", "pnpm"),
		filepath.Join(home, ".hermes", "bin"),         // hermes installs its CLI here
		filepath.Join(home, ".hermes", "venv", "bin"), // hermes virtualenv
		"/usr/local/bin",
		"/opt/homebrew/bin",       // macOS Homebrew (Apple Silicon)
		"/usr/local/homebrew/bin", // macOS Homebrew (Intel)
		"/snap/bin",               // Ubuntu/Debian snap packages
		"/usr/bin",
		"/bin",
	}
	// Windows: add npm's default global install path
	if runtime.GOOS == "windows" {
		extra = append(extra,
			filepath.Join(os.Getenv("APPDATA"), "npm"),
			filepath.Join(home, "AppData", "Roaming", "npm"),
		)
	}
	pathValue := strings.Join(append(extra, base), string(os.PathListSeparator))
	env := os.Environ()
	filtered := make([]string, 0, len(env)+8)
	for _, e := range env {
		switch {
		case strings.HasPrefix(e, "PATH="),
			strings.HasPrefix(e, "VERBOSE="),
			strings.HasPrefix(e, "HOMEBREW_NO_AUTO_UPDATE="),
			strings.HasPrefix(e, "HOMEBREW_NO_ENV_HINTS="):
			continue
		}
		filtered = append(filtered, e)
	}
	filtered = append(filtered, "PATH="+pathValue)
	// Force shell-based installers (openclaw install.sh, hermes install.sh) to
	// stream their underlying `npm install -g` output via `tee` rather than
	// silently redirecting to a log file. Without this, the connector stdout
	// pipe goes quiet once npm starts and the dashboard appears stuck on the
	// last progress line emitted before npm was invoked. See
	// openclaw scripts/install.sh run_npm_global_install (VERBOSE=1 branch).
	filtered = append(filtered, "VERBOSE=1")
	// CI=1 / NONINTERACTIVE=1: signals to install scripts and shell configs
	// (nvm, pyenv, rbenv, iTerm2 integration, etc.) that we are running in a
	// non-interactive environment. Without this, `source ~/.zshrc` calls inside
	// install scripts (e.g. hermes install.sh) hang because ~/.zshrc contains
	// tooling that expects a terminal or blocks waiting for stdin.
	filtered = append(filtered, "CI=1")
	filtered = append(filtered, "NONINTERACTIVE=1")
	// BASH_ENV=: prevents bash from sourcing any ENV startup file for
	// non-interactive subshells spawned by the install scripts.
	filtered = append(filtered, "BASH_ENV=")
	// Prevent Homebrew auto-update and env-hint checks (both can stall for
	// several seconds on network-access or terminal-detection).
	filtered = append(filtered, "HOMEBREW_NO_AUTO_UPDATE=1")
	filtered = append(filtered, "HOMEBREW_NO_ENV_HINTS=1")
	return filtered
}

// newOpenClawCmd returns an *exec.Cmd configured to invoke the openclaw CLI
// (or any onboarding helper binary) with:
//   - a stable, guaranteed-accessible cwd (paths.HyperClaw, which the
//     connector creates during install); and
//   - the enriched onboarding environment.
//
// The explicit cwd is not cosmetic. Node's process.cwd() is evaluated during
// interpreter bootstrap and fails with EPERM on uv_cwd if the inherited cwd
// is unreadable from the child process's security context. That shows up as
// "default setup failed: EPERM: process.cwd failed with error operation not
// permitted" the moment openclaw starts. Pinning cmd.Dir to a directory we
// own (0755, user-owned, always present) removes that class of failure.
//
// Call sites MUST use this helper for every openclaw CLI invocation rather
// than calling exec.Command(bin, ...) directly, otherwise the child inherits
// whatever cwd the daemon happens to have (which may be invalid after restart,
// relocation, or sandboxing).
func newOpenClawCmd(paths Paths, bin string, args ...string) *exec.Cmd {
	// Best-effort: ensure the cwd directory exists. During normal operation
	// paths.HyperClaw already exists because service.Install() created it,
	// but re-creating is cheap and idempotent and guards against a user
	// wiping ~/.hyperclaw between install and the first config set.
	_ = os.MkdirAll(paths.HyperClaw, 0o755)
	cmd := exec.Command(bin, args...)
	cmd.Dir = paths.HyperClaw
	cmd.Env = onboardingEnv(paths)
	return cmd
}

// lookPathWithOnboardingEnv searches for a binary using the enriched onboarding PATH
// (includes ~/.npm-global/bin, /opt/homebrew/bin, etc.) instead of the daemon's PATH.
func lookPathWithOnboardingEnv(paths Paths, name string) (string, error) {
	envList := onboardingEnv(paths)
	for _, e := range envList {
		if strings.HasPrefix(e, "PATH=") {
			for _, dir := range filepath.SplitList(strings.TrimPrefix(e, "PATH=")) {
				candidate := filepath.Join(dir, name)
				if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
					return candidate, nil
				}
			}
		}
	}
	// Fall back to normal LookPath
	return exec.LookPath(name)
}

func onboardingCommandSpec(command string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd.exe", []string{"/d", "/s", "/c", command}
	}
	return "/bin/bash", []string{"-lc", command}
}

func runOnboardingCommand(paths Paths, command string) error {
	return runOnboardingCommandWithProgress(paths, command, nil)
}

// Watchdog thresholds for runOnboardingCommandWithProgress. Exposed as vars so
// tests can tighten them without editing production defaults.
var (
	// onboardingHeartbeatAfter is the silence duration after which the watchdog
	// begins emitting synthetic progress lines so the dashboard knows the
	// install is still alive (and doesn't look "stuck" on the last real line).
	onboardingHeartbeatAfter = 60 * time.Second
	// onboardingKillAfter is the silence duration after which the watchdog
	// concludes the install is wedged and kills the child process.
	onboardingKillAfter = 10 * time.Minute
	// onboardingWatchdogTick is how often the watchdog wakes up to check silence.
	onboardingWatchdogTick = 15 * time.Second
)

// runOnboardingCommandWithProgress runs an install command and optionally
// streams output lines to a progress callback for live UI updates.
//
// When a progress callback is supplied, a background watchdog emits heartbeat
// lines after onboardingHeartbeatAfter of silence and kills the process after
// onboardingKillAfter of silence. This prevents a wedged `npm install -g` (for
// example waiting on a sudo prompt or stalled registry connection) from
// leaving the dashboard frozen on the last pre-npm progress line forever.
func runOnboardingCommandWithProgress(paths Paths, command string, progress func(line string)) error {
	file, args := onboardingCommandSpec(command)
	// Ensure the cwd exists and is user-owned so the child shell (and anything
	// it spawns — most importantly `node` running the openclaw entrypoint)
	// can successfully call getcwd()/uv_cwd at startup. Using paths.HyperClaw
	// (created and owned by the connector) is more reliable than inheriting
	// the daemon's cwd, which may be invalid after launchd reloads.
	_ = os.MkdirAll(paths.HyperClaw, 0o755)
	cmd := exec.Command(file, args...)
	cmd.Env = onboardingEnv(paths)
	cmd.Dir = paths.HyperClaw

	if progress == nil {
		// No progress callback — use simple blocking call
		output, err := cmd.CombinedOutput()
		if err != nil {
			msg := strings.TrimSpace(string(output))
			if msg == "" {
				msg = err.Error()
			}
			return fmt.Errorf("%s", msg)
		}
		return nil
	}

	// Stream output for live progress
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout // merge stderr into stdout

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}

	// Track the timestamp of the most recent output line for the watchdog.
	var lastActivity atomic.Int64
	lastActivity.Store(time.Now().UnixNano())

	// Watchdog: on a ticker, emit a heartbeat after onboardingHeartbeatAfter
	// of silence; kill the process after onboardingKillAfter of silence.
	var killed atomic.Bool
	watchdogDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(onboardingWatchdogTick)
		defer ticker.Stop()
		var lastHeartbeat time.Time
		for {
			select {
			case <-watchdogDone:
				return
			case now := <-ticker.C:
				silent := now.Sub(time.Unix(0, lastActivity.Load()))
				if silent >= onboardingKillAfter {
					killed.Store(true)
					progress(fmt.Sprintf("[watchdog] no output for %s, aborting install", silent.Round(time.Second)))
					if cmd.Process != nil {
						_ = cmd.Process.Kill()
					}
					return
				}
				if silent >= onboardingHeartbeatAfter && now.Sub(lastHeartbeat) >= onboardingHeartbeatAfter {
					progress(fmt.Sprintf("[watchdog] still running, no output for %s", silent.Round(time.Second)))
					lastHeartbeat = now
				}
			}
		}
	}()

	scanner := bufio.NewScanner(stdout)
	// npm install and curl-piped shells can emit long single lines (progress
	// bars, JSON blobs). Allow up to 1 MiB per line before the scanner errors.
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	// Keep a rolling window of the last 20 non-empty lines so that on failure
	// the error includes enough context to diagnose the root cause (e.g. the
	// actual curl/bash/node error, not just the last npm progress bar tick).
	const tailSize = 20
	tail := make([]string, 0, tailSize)

	var lastLine string
	for scanner.Scan() {
		lastActivity.Store(time.Now().UnixNano())
		line := ansiStripper.ReplaceAllString(strings.TrimSpace(scanner.Text()), "")
		line = strings.TrimSpace(line) // re-trim after stripping (leading/trailing control chars may leave spaces)
		if line == "" {
			continue
		}
		lastLine = line
		if len(tail) >= tailSize {
			tail = tail[1:]
		}
		tail = append(tail, line)
		progress(line)
	}

	close(watchdogDone)

	waitErr := cmd.Wait()
	if killed.Load() {
		return fmt.Errorf("install aborted after %s of no output (last line: %q)", onboardingKillAfter, lastLine)
	}
	if waitErr != nil {
		// Build a multi-line error that includes the last N lines of output so
		// the dashboard (and logs) show the actual failure reason rather than
		// a bare exit-code message or a single progress line.
		if len(tail) > 0 {
			return fmt.Errorf("install failed (%w); last output:\n%s", waitErr, strings.Join(tail, "\n"))
		}
		return fmt.Errorf("install failed (%w)", waitErr)
	}
	return nil
}

func onboardingInstallCommand(runtimeName string) string {
	if runtime.GOOS == "windows" {
		switch runtimeName {
		case "openclaw":
			// PowerShell one-liner: download and run the Windows install script
			return `powershell -NoProfile -NonInteractive -Command "Invoke-WebRequest -Uri 'https://openclaw.ai/install.ps1' -OutFile $env:TEMP\openclaw-install.ps1; & $env:TEMP\openclaw-install.ps1 --no-onboard"`
		case "hermes":
			return `powershell -NoProfile -NonInteractive -Command "pip install hermes-agent"`
		case "claude-code":
			return "npm install -g @anthropic-ai/claude-code"
		case "codex":
			return "npm install -g @openai/codex"
		default:
			return ""
		}
	}
	switch runtimeName {
	case "openclaw":
		return "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard"
	case "hermes":
		return "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup"
	case "claude-code":
		return "npm install -g @anthropic-ai/claude-code"
	case "codex":
		return "npm install -g @openai/codex"
	default:
		return ""
	}
}

func (b *BridgeHandler) onboardingRuntimeAvailable(runtimeName string) bool {
	// First try the adapter's built-in check (PATH + hardcoded locations)
	switch runtimeName {
	case "openclaw":
		if NewOpenClawAdapter(b.paths).Available() {
			return true
		}
	case "hermes":
		if NewHermesAdapter(b.paths).Available() {
			return true
		}
	case "claude-code":
		if NewClaudeCodeAdapter(b.paths).Available() {
			return true
		}
	case "codex":
		if NewCodexAdapter(b.paths).Available() {
			return true
		}
	default:
		return false
	}
	// Fallback: try the enriched onboarding PATH (covers daemon's minimal PATH)
	binaryName := runtimeName
	if runtimeName == "claude-code" {
		binaryName = "claude"
	}
	_, err := lookPathWithOnboardingEnv(b.paths, binaryName)
	return err == nil
}

func (b *BridgeHandler) onboardingOpenClawConfigured() bool {
	_, err := os.Stat(b.paths.OpenClawConfigPath())
	return err == nil
}

func (b *BridgeHandler) onboardingRuntimeReady(runtimeName string) bool {
	switch runtimeName {
	case "openclaw":
		// Ready means: binary present, openclaw.json written, AND the local
		// gateway /health endpoint returns 200. Dropping the health check here
		// is what let the dashboard jump to an empty screen while the daemon
		// was still booting.
		return b.onboardingRuntimeAvailable(runtimeName) &&
			b.onboardingOpenClawConfigured() &&
			gatewayIsHealthy()
	default:
		return b.onboardingRuntimeAvailable(runtimeName)
	}
}

// ensureOpenClawDefaults runs a minimal base `openclaw onboard --non-interactive`
// when no config exists, then applies provider config, default model, workspace,
// and memory-search settings via `openclaw config set`.
//
// Provider auth is intentionally skipped during `openclaw onboard` so the
// connector can manage API-key config separately. Channel accounts are also
// added afterward via `openclaw channels add`, so the base onboarding always
// skips the wizard channel step.
type onboardingPrimaryBrain struct {
	ProviderID string `json:"providerId"`
	Model      string `json:"model"`
}

type onboardingMemorySearch struct {
	Enabled  bool   `json:"enabled"`
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey,omitempty"`
}

// migrateLegacyWorkspaces best-effort-moves pre-0.5.6 OpenClaw workspace
// directories into the unified ~/.hyperclaw/agents/<id>/ layout.
//
// Legacy locations:
//   - ~/.hyperclaw/workspaces/            → ~/.hyperclaw/agents/main/
//   - ~/.openclaw/workspace/              → ~/.hyperclaw/agents/main/
//   - ~/.openclaw/workspace-<id>/         → ~/.hyperclaw/agents/<id>/
//
// Moves are only performed when the target directory does not already exist,
// so running this repeatedly is safe and won't clobber current data.
func (b *BridgeHandler) migrateLegacyWorkspaces() {
	if err := os.MkdirAll(b.paths.AgentsDir(), 0o755); err != nil {
		log.Printf("[migrate-workspaces] mkdir agents dir: %v", err)
		return
	}

	moveIfAbsent := func(src, dst, label string) {
		if src == "" || dst == "" {
			return
		}
		if _, err := os.Stat(src); err != nil {
			return
		}
		if _, err := os.Stat(dst); err == nil {
			log.Printf("[migrate-workspaces] %s: target %s already exists, skipping", label, dst)
			return
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			log.Printf("[migrate-workspaces] %s: mkdir parent: %v", label, err)
			return
		}
		if err := os.Rename(src, dst); err != nil {
			log.Printf("[migrate-workspaces] %s: rename %s -> %s: %v", label, src, dst, err)
			return
		}
		log.Printf("[migrate-workspaces] %s: moved %s -> %s", label, src, dst)
	}

	// ~/.openclaw/workspace/ -> ~/.hyperclaw/agents/openclaw-main/
	moveIfAbsent(
		filepath.Join(b.paths.OpenClaw, "workspace"),
		b.paths.AgentDir("openclaw", "main"),
		"openclaw-main",
	)

	// ~/.openclaw/workspace-<id>/ -> ~/.hyperclaw/agents/openclaw-<id>/
	if entries, err := os.ReadDir(b.paths.OpenClaw); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			name := e.Name()
			if !strings.HasPrefix(name, "workspace-") {
				continue
			}
			id := strings.TrimPrefix(name, "workspace-")
			if id == "" {
				continue
			}
			moveIfAbsent(
				filepath.Join(b.paths.OpenClaw, name),
				b.paths.AgentDir("openclaw", id),
				"openclaw-"+id,
			)
		}
	}

	// ~/.hyperclaw/workspaces/ -> ~/.hyperclaw/agents/openclaw-main/.
	// This handles the transitional layout where we set
	// agents.defaults.workspace to ~/.hyperclaw/workspaces.
	legacyHCWorkspaces := filepath.Join(b.paths.HyperClaw, "workspaces")
	moveIfAbsent(legacyHCWorkspaces, b.paths.AgentDir("openclaw", "main"), "hyperclaw-workspaces")

	// Pre-0.5.6 un-namespaced layout: ~/.hyperclaw/agents/<id>/ — if the
	// SQLite store knows a runtime for the id, migrate into the prefixed
	// layout. Otherwise leave in place so legacy readers still find it.
	if b.store != nil {
		if entries, err := os.ReadDir(b.paths.AgentsDir()); err == nil {
			knownPrefixes := []string{"openclaw-", "claude-code-", "codex-", "hermes-"}
			for _, e := range entries {
				if !e.IsDir() {
					continue
				}
				name := e.Name()
				// Skip already-prefixed dirs.
				skip := false
				for _, p := range knownPrefixes {
					if strings.HasPrefix(name, p) {
						skip = true
						break
					}
				}
				if skip {
					continue
				}
				id, err := b.store.GetAgentIdentity(name)
				if err != nil || id == nil || strings.TrimSpace(id.Runtime) == "" {
					continue
				}
				src := filepath.Join(b.paths.AgentsDir(), name)
				dst := b.paths.AgentDir(id.Runtime, name)
				if src == dst {
					continue
				}
				moveIfAbsent(src, dst, "hyperclaw-agents-"+id.Runtime+"-"+name)
			}
		}
	}
}

func (b *BridgeHandler) ensureOpenClawDefaults(providers []onboardingProviderConfig, primaryBrain *onboardingPrimaryBrain, memorySearch *onboardingMemorySearch) error {
	// Best-effort migration of pre-0.5.6 workspace layouts into the unified
	// ~/.hyperclaw/agents/<id>/ root. Runs every onboarding provision; the
	// helper is idempotent (skips when target already exists).
	b.migrateLegacyWorkspaces()

	_, err := lookPathWithOnboardingEnv(b.paths, "openclaw")
	if err != nil {
		return fmt.Errorf("openclaw binary not found after install")
	}

	configPath := b.paths.OpenClawConfigPath()
	// --workspace points to the main agent's directory so OpenClaw uses it
	// as the default workspace (cross-platform: filepath.Join handles separators).
	mainAgentDir := b.paths.AgentDir("openclaw", "main")
	if !openclawConfigIsComplete(configPath) {
		// First-time setup: run `openclaw onboard --non-interactive` with the
		// primary provider's --auth-choice and API key flag so OpenClaw writes
		// the config with correct schema (models.providers, auth.profiles, etc.).
		args := []string{
			"onboard",
			"--non-interactive",
			"--mode", "local",
			"--workspace", mainAgentDir,
			"--secret-input-mode", "plaintext",
			"--gateway-port", "18789",
			"--gateway-bind", "loopback",
			"--install-daemon",
			"--daemon-runtime", "node",
			"--skip-skills",
			"--accept-risk",
			"--skip-search",
			"--skip-channels",
		}

		// Resolve the primary provider to pass to openclaw onboard.
		primaryKey := ""
		primaryProvider := resolvePrimaryOnboardProvider(providers, primaryBrain)
		if primaryProvider != nil {
			if mapping := mapProviderToOnboard(primaryProvider); mapping != nil && mapping.AuthChoice != "" {
				args = append(args, "--auth-choice", mapping.AuthChoice)
				key := strings.TrimSpace(primaryProvider.APIKey)
				primaryKey = key
				if mapping.KeyFlag != "" {
					args = append(args, mapping.KeyFlag, key)
				}
				// Keep auth env vars available for the OpenClaw subprocesses in this function,
				// then restore the connector process environment before returning.
				for _, envVar := range providerOnboardEnvVars(mapping) {
					restore := setOnboardingEnv(envVar, key)
					defer restore()
				}
			} else {
				// Provider has no auth-choice (env-only like groq) — skip for onboard,
				// will be configured in the additional providers loop below.
				args = append(args, "--auth-choice", "skip")
			}
		} else {
			args = append(args, "--auth-choice", "skip")
		}

		b.emitProvisionProgress("install:openclaw", "running", "Running OpenClaw non-interactive onboard…")
		stdout, stderr, err := runOpenClaw(context.Background(), b.paths, args, openClawOnboardTimeoutMs)
		if err != nil {
			msg := scrubOnboardingCLIOutput(strings.TrimSpace(stderr), primaryKey)
			if msg == "" {
				msg = scrubOnboardingCLIOutput(strings.TrimSpace(stdout), primaryKey)
			}
			if msg == "" {
				msg = err.Error()
			}
			return fmt.Errorf("%s", msg)
		}

		// For additional providers beyond the primary, add them via separate
		// openclaw onboard calls with --auth-choice. Each call adds a provider
		// to the existing config without overwriting.
		for _, p := range providers {
			if primaryProvider != nil && p.ProviderID == primaryProvider.ProviderID {
				continue // already configured above
			}
			key := strings.TrimSpace(p.APIKey)
			if key == "" {
				continue
			}
			mapping := mapProviderToOnboard(&p)
			if mapping == nil {
				continue
			}

			// For env-var providers, always persist the key to openclaw.json's
			// env section (e.g. env.MINIMAX_API_KEY, env.ZAI_API_KEY) so the
			// gateway daemon can discover it at runtime.
			envPatches := map[string]string{}
			for _, envVar := range providerOnboardEnvVars(mapping) {
				restore := setOnboardingEnv(envVar, key)
				defer restore()
				envPatches["env."+envVar] = key
			}
			if len(envPatches) > 0 {
				if err := patchOpenClawJSON(configPath, envPatches, nil); err != nil {
					log.Printf("[onboarding] %s: failed to persist env key(s) to openclaw.json: %v", p.ProviderID, err)
				} else {
					log.Printf("[onboarding] %s: persisted %d env key(s) to openclaw.json", p.ProviderID, len(envPatches))
				}
			}

			// Providers without an auth-choice (e.g. groq) are env-var-only.
			// The key was already written above; skip the onboard call.
			if mapping.AuthChoice == "" {
				continue
			}

			addArgs := []string{
				"onboard",
				"--non-interactive",
				"--mode", "local",
				"--workspace", mainAgentDir,
				"--auth-choice", mapping.AuthChoice,
				"--secret-input-mode", "plaintext",
				"--gateway-port", "18789",
				"--gateway-bind", "loopback",
				"--skip-skills",
				"--accept-risk",
				"--skip-search",
				"--skip-channels",
				"--skip-daemon",
			}
			if mapping.KeyFlag != "" {
				addArgs = append(addArgs, mapping.KeyFlag, key)
			}
			b.emitProvisionProgress("install:openclaw", "running", "Configuring "+p.ProviderID+"…")
			if _, stderr, err := runOpenClaw(context.Background(), b.paths, addArgs, 60000); err != nil {
				log.Printf("[onboarding] add provider %s: %s %v", p.ProviderID, scrubOnboardingCLIOutput(stderr, key), err)
			}
		}
	}
	persistOpenClawProviderEnvKeys(configPath, providers)

	// Set agents.defaults.workspace — only if it differs from the current value
	// so we don't trigger an unnecessary openclaw.json write that would cause
	// the gateway watcher to restart and force a re-pairing cycle.
	wsDir := mainAgentDir
	needsWsPatch := true
	if raw, readErr := os.ReadFile(configPath); readErr == nil {
		var cur map[string]interface{}
		if json.Unmarshal(raw, &cur) == nil {
			if agents, _ := cur["agents"].(map[string]interface{}); agents != nil {
				if defaults, _ := agents["defaults"].(map[string]interface{}); defaults != nil {
					if ws, _ := defaults["workspace"].(string); ws == wsDir {
						needsWsPatch = false
					}
				}
			}
		}
	}
	if needsWsPatch {
		if err := patchOpenClawJSON(configPath, map[string]string{
			"agents.defaults.workspace": wsDir,
		}, nil); err != nil {
			log.Printf("[onboarding] set workspace config: %v", err)
		}
	}

	// Enable memory search in openclaw.json if the user selected a provider.
	// The config path is agents.defaults.memorySearch.provider (see
	// openclaw/docs/concepts/memory-builtin.md). Without this, the --skip-search
	// flag in openclaw onboard leaves memory search unconfigured.
	if memorySearch != nil && memorySearch.Enabled && strings.TrimSpace(memorySearch.Provider) != "" {
		memProvider := strings.TrimSpace(memorySearch.Provider)
		if err := patchOpenClawJSON(configPath, map[string]string{
			"agents.defaults.memorySearch.provider": memProvider,
		}, nil); err != nil {
			log.Printf("[onboarding] set memorySearch.provider config: %v", err)
		} else {
			log.Printf("[onboarding] memory search enabled with provider=%s", memProvider)
		}
	}

	// Populate per-agent auth-profiles.json so the agent runtime can resolve
	// API keys. `openclaw config set` writes to openclaw.json, but the agent
	// runtime reads secrets from <agentDir>/auth-profiles.json — so without
	// this step the first chat fails with "No API key found for provider X".
	authProviders := append([]onboardingProviderConfig(nil), providers...)
	if memorySearch != nil && memorySearch.Enabled {
		provider := strings.TrimSpace(memorySearch.Provider)
		memKey := strings.TrimSpace(memorySearch.APIKey)
		if provider != "" && memKey != "" {
			// Only add if not already covered by a brain provider.
			found := false
			for _, p := range authProviders {
				if p.ProviderID == provider {
					found = true
					break
				}
			}
			if !found {
				authProviders = append(authProviders, onboardingProviderConfig{ProviderID: provider, APIKey: memKey})
			}
		}
	}
	if err := writeOpenClawAuthProfiles(b.paths, authProviders); err != nil {
		log.Printf("[onboarding] write auth-profiles.json: %v", err)
	}

	return nil
}

// writeOpenClawAuthProfiles merges API keys from the onboarding providers into
// every agent's auth-profiles.json under ~/.openclaw/agents/*/agent/. The
// OpenClaw agent runtime looks up secrets from this file, not from openclaw.json.
//
// Profile format mirrors openclaw/src/agents/auth-profiles/types.ts:
//
//	{
//	  "version": 1,
//	  "profiles": {
//	    "<providerID>:manual": {
//	      "type": "api_key",
//	      "provider": "<providerID>",
//	      "key": "<apiKey>"
//	    }
//	  }
//	}
func writeOpenClawAuthProfiles(paths Paths, providers []onboardingProviderConfig) error {
	// Collect providers with a non-empty API key.
	keyed := make([]onboardingProviderConfig, 0, len(providers))
	for _, p := range providers {
		if strings.TrimSpace(p.APIKey) == "" || strings.TrimSpace(p.ProviderID) == "" {
			continue
		}
		keyed = append(keyed, p)
	}
	if len(keyed) == 0 {
		return nil
	}

	agentsRoot := filepath.Join(paths.OpenClaw, "agents")
	entries, err := os.ReadDir(agentsRoot)
	if err != nil {
		if os.IsNotExist(err) {
			// No agents yet; fall back to writing the canonical "main" agent path
			// so the store exists when the agent is first spawned.
			return writeAgentAuthProfiles(filepath.Join(agentsRoot, "main", "agent"), keyed)
		}
		return fmt.Errorf("read agents dir: %w", err)
	}

	wrote := false
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		agentDir := filepath.Join(agentsRoot, e.Name(), "agent")
		if _, err := os.Stat(agentDir); err != nil {
			continue
		}
		if err := writeAgentAuthProfiles(agentDir, keyed); err != nil {
			log.Printf("[onboarding] auth-profiles for %s: %v", e.Name(), err)
			continue
		}
		wrote = true
	}
	if !wrote {
		// Ensure at least the main agent path has profiles even if no agent
		// directories existed.
		return writeAgentAuthProfiles(filepath.Join(agentsRoot, "main", "agent"), keyed)
	}
	return nil
}

// writeAgentAuthProfiles merges keyed providers into <agentDir>/auth-profiles.json,
// preserving any existing profiles, order, lastGood, and usageStats fields.
func writeAgentAuthProfiles(agentDir string, providers []onboardingProviderConfig) error {
	if err := os.MkdirAll(agentDir, 0700); err != nil {
		return fmt.Errorf("mkdir %s: %w", agentDir, err)
	}
	path := filepath.Join(agentDir, "auth-profiles.json")

	// Load existing store (if any) so we don't clobber user-added profiles.
	store := map[string]interface{}{
		"version":  1,
		"profiles": map[string]interface{}{},
	}
	if raw, err := os.ReadFile(path); err == nil && len(raw) > 0 {
		var existing map[string]interface{}
		if jerr := json.Unmarshal(raw, &existing); jerr == nil {
			// Ensure required fields exist with correct types.
			if _, ok := existing["version"]; !ok {
				existing["version"] = 1
			}
			if _, ok := existing["profiles"].(map[string]interface{}); !ok {
				existing["profiles"] = map[string]interface{}{}
			}
			store = existing
		}
	}

	profiles, _ := store["profiles"].(map[string]interface{})
	if profiles == nil {
		profiles = map[string]interface{}{}
		store["profiles"] = profiles
	}

	for _, p := range providers {
		providerID := strings.TrimSpace(p.ProviderID)
		key := strings.TrimSpace(p.APIKey)
		if providerID == "" || key == "" {
			continue
		}
		profileID := providerID + ":manual"
		profiles[profileID] = map[string]interface{}{
			"type":     "api_key",
			"provider": providerID,
			"key":      key,
		}
	}

	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal auth-profiles: %w", err)
	}
	// Write with restricted permissions — this file holds API keys.
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	log.Printf("[onboarding] wrote auth-profiles.json (%d provider(s)) → %s", len(providers), path)
	return nil
}

// ensureOpenClawChannels configures channel bot tokens in OpenClaw via `openclaw config set`.
// This runs after ensureOpenClawDefaults so the config file already exists.
func openClawChannelAddArgs(ch onboardingChannelConfig) []string {
	channel := strings.TrimSpace(ch.Channel)
	args := []string{"channels", "add", "--channel", channel}
	if account := strings.TrimSpace(ch.Target); account != "" {
		args = append(args, "--account", account)
	}
	token := strings.TrimSpace(ch.BotToken)
	switch channel {
	case "slack":
		if token != "" {
			args = append(args, "--bot-token", token)
		}
		if appToken := strings.TrimSpace(ch.AppToken); appToken != "" {
			args = append(args, "--app-token", appToken)
		}
	default:
		if token != "" {
			args = append(args, "--token", token)
		}
	}
	return args
}

// resolvePrimaryOnboardProvider picks the best provider to pass to `openclaw onboard`.
// Prefers the explicit primaryBrain selection; falls back to the first provider with a key.
func resolvePrimaryOnboardProvider(providers []onboardingProviderConfig, primaryBrain *onboardingPrimaryBrain) *onboardingProviderConfig {
	if primaryBrain != nil && strings.TrimSpace(primaryBrain.ProviderID) != "" {
		for i := range providers {
			if providers[i].ProviderID == primaryBrain.ProviderID && strings.TrimSpace(providers[i].APIKey) != "" {
				return &providers[i]
			}
		}
	}
	for i := range providers {
		if strings.TrimSpace(providers[i].APIKey) != "" {
			return &providers[i]
		}
	}
	return nil
}

// providerOnboardMapping holds the auth-choice value and how to pass the API key.
type providerOnboardMapping struct {
	AuthChoice string   // --auth-choice value (empty = skip openclaw onboard for this provider)
	KeyFlag    string   // CLI flag like "--anthropic-api-key" (empty if env-only)
	EnvVar     string   // env var like "MINIMAX_API_KEY" (empty if flag-based)
	EnvVars    []string // additional env aliases written alongside EnvVar
}

// mapProviderToOnboard maps a provider config to openclaw onboard auth-choice
// and key delivery mechanism (CLI flag or env var).
// Source of truth: ~/code/openclaw/docs/providers/<provider>.md
func mapProviderToOnboard(p *onboardingProviderConfig) *providerOnboardMapping {
	switch p.ProviderID {
	case "anthropic":
		// docs: openclaw onboard --anthropic-api-key "$ANTHROPIC_API_KEY"
		return &providerOnboardMapping{AuthChoice: "apiKey", KeyFlag: "--anthropic-api-key"}
	case "openai":
		// docs: --auth-choice openai-api-key --openai-api-key "$OPENAI_API_KEY"
		return &providerOnboardMapping{AuthChoice: "openai-api-key", KeyFlag: "--openai-api-key"}
	case "google", "gemini":
		// docs: --auth-choice gemini-api-key --gemini-api-key "$GEMINI_API_KEY"
		return &providerOnboardMapping{AuthChoice: "gemini-api-key", KeyFlag: "--gemini-api-key", EnvVar: "GEMINI_API_KEY", EnvVars: []string{"GOOGLE_API_KEY"}}
	case "minimax":
		// docs: --auth-choice minimax-global-api, key via env MINIMAX_API_KEY (no CLI flag)
		return &providerOnboardMapping{AuthChoice: "minimax-global-api", EnvVar: "MINIMAX_API_KEY"}
	case "deepseek":
		// docs: --auth-choice deepseek-api-key --deepseek-api-key "$DEEPSEEK_API_KEY"
		return &providerOnboardMapping{AuthChoice: "deepseek-api-key", KeyFlag: "--deepseek-api-key"}
	case "mistral":
		// docs: --auth-choice mistral-api-key --mistral-api-key "$MISTRAL_API_KEY"
		return &providerOnboardMapping{AuthChoice: "mistral-api-key", KeyFlag: "--mistral-api-key"}
	case "groq":
		// docs: NO openclaw onboard command. Key via env GROQ_API_KEY only.
		// Set env var; openclaw discovers it at runtime.
		return &providerOnboardMapping{EnvVar: "GROQ_API_KEY"}
	case "zai":
		// docs: --auth-choice zai-api-key, key via env ZAI_API_KEY (no CLI flag)
		return &providerOnboardMapping{AuthChoice: "zai-api-key", EnvVar: "ZAI_API_KEY"}
	case "openrouter":
		// docs: --auth-choice openrouter-api-key, key via env OPENROUTER_API_KEY (no CLI flag)
		return &providerOnboardMapping{AuthChoice: "openrouter-api-key", EnvVar: "OPENROUTER_API_KEY"}
	case "moonshot":
		// docs: --auth-choice moonshot-api-key, key via env MOONSHOT_API_KEY (no CLI flag)
		return &providerOnboardMapping{AuthChoice: "moonshot-api-key", EnvVar: "MOONSHOT_API_KEY"}
	case "ollama":
		// docs: --auth-choice ollama --accept-risk (no real key needed)
		return &providerOnboardMapping{AuthChoice: "ollama"}
	default:
		return nil
	}
}

func providerOnboardEnvVars(mapping *providerOnboardMapping) []string {
	if mapping == nil {
		return nil
	}
	out := make([]string, 0, 1+len(mapping.EnvVars))
	if mapping.EnvVar != "" {
		out = append(out, mapping.EnvVar)
	}
	out = append(out, mapping.EnvVars...)
	return out
}

func setOnboardingEnv(key, value string) func() {
	previous, hadPrevious := os.LookupEnv(key)
	_ = os.Setenv(key, value)
	return func() {
		if hadPrevious {
			_ = os.Setenv(key, previous)
			return
		}
		_ = os.Unsetenv(key)
	}
}

func persistOpenClawProviderEnvKeys(configPath string, providers []onboardingProviderConfig) {
	for _, p := range providers {
		key := strings.TrimSpace(p.APIKey)
		if key == "" {
			continue
		}
		mapping := mapProviderToOnboard(&p)
		envVars := providerOnboardEnvVars(mapping)
		if len(envVars) == 0 {
			continue
		}
		patches := make(map[string]string, len(envVars))
		for _, envVar := range envVars {
			patches["env."+envVar] = key
		}
		if err := patchOpenClawJSON(configPath, patches, nil); err != nil {
			log.Printf("[onboarding] %s: failed to persist provider env keys to openclaw.json: %v", p.ProviderID, err)
			continue
		}
		log.Printf("[onboarding] %s: persisted %d env key(s) to openclaw.json", p.ProviderID, len(patches))
	}
}

func (b *BridgeHandler) ensureOpenClawChannels(channelConfigs []onboardingChannelConfig) error {
	const maxRetries = 5
	doctorRanOnce := false
	for _, ch := range channelConfigs {
		channel, err := normalizeOnboardingChannelID(ch.Channel)
		if err != nil {
			return err
		}
		ch.Channel = channel
		if ch.Target, err = sanitizeHermesEnvValue("target", ch.Target); err != nil {
			return err
		}
		if ch.BotToken, err = sanitizeHermesEnvValue("botToken", ch.BotToken); err != nil {
			return err
		}
		if ch.AppToken, err = sanitizeHermesEnvValue("appToken", ch.AppToken); err != nil {
			return err
		}
		args := openClawChannelAddArgs(ch)
		var lastErr error
		for attempt := 0; attempt < maxRetries; attempt++ {
			if attempt > 0 {
				time.Sleep(time.Duration(attempt*200) * time.Millisecond)
			}
			_, stderr, err := runOpenClaw(context.Background(), b.paths, args, 60000)
			if err == nil {
				lastErr = nil
				break
			}
			msg := scrubOnboardingCLIOutput(strings.TrimSpace(stderr), ch.BotToken, ch.AppToken)
			if msg == "" {
				msg = err.Error()
			}
			lastErr = fmt.Errorf("failed to add/update OpenClaw %s channel: %s", channel, msg)
			// Retry on mutex conflict.
			if strings.Contains(msg, "ConfigMutationConflictError") {
				continue
			}
			// If openclaw reports config schema errors, run `openclaw doctor --fix`
			// once to auto-repair, then retry the channel add.
			if strings.Contains(msg, "Config invalid") && !doctorRanOnce {
				doctorRanOnce = true
				log.Printf("[onboarding] channels add: Config invalid — running openclaw doctor --fix --non-interactive and retrying")
				_, _, _ = runOpenClaw(context.Background(), b.paths, []string{"doctor", "--fix", "--non-interactive"}, openClawChannelDoctorFixTimeoutMs)
				continue
			}
			// Missing npm dependency (e.g. grammy for Telegram plugin) —
			// fall back to `openclaw config set` which writes the token
			// directly without loading the channel plugin.
			if strings.Contains(msg, "Cannot find module") {
				log.Printf("[onboarding] channels add: missing module for %s — falling back to config set", channel)
				if fallbackErr := b.ensureOpenClawChannelViaConfigSet(ch); fallbackErr != nil {
					lastErr = fallbackErr
				} else {
					lastErr = nil
				}
				break
			}
			break
		}
		if lastErr != nil {
			return lastErr
		}
	}
	return nil
}

func scrubOnboardingCLIOutput(output string, secrets ...string) string {
	scrubbed := output
	for _, secret := range secrets {
		secret = strings.TrimSpace(secret)
		if secret == "" {
			continue
		}
		scrubbed = strings.ReplaceAll(scrubbed, secret, "[redacted]")
	}
	for _, secretPattern := range onboardingCLITokenPatterns {
		scrubbed = secretPattern.pattern.ReplaceAllString(scrubbed, secretPattern.replacement)
	}
	return scrubbed
}

// ensureOpenClawChannelViaConfigSet writes channel credentials directly to
// openclaw.json via `openclaw config set` when `openclaw channels add` fails
// (e.g. missing plugin npm dependency). This avoids loading the channel plugin
// while still persisting the bot token so the gateway picks it up on next start.
func (b *BridgeHandler) ensureOpenClawChannelViaConfigSet(ch onboardingChannelConfig) error {
	channel, err := normalizeOnboardingChannelID(ch.Channel)
	if err != nil {
		return err
	}
	token := strings.TrimSpace(ch.BotToken)

	if token != "" {
		tokenKey := "channels." + channel + ".botToken"
		if channel == "slack" {
			tokenKey = "channels." + channel + ".botToken"
		}
		// config set needs a JSON string value
		jsonTokenBytes, err := json.Marshal(token)
		if err != nil {
			return fmt.Errorf("marshal %s token: %w", channel, err)
		}
		jsonToken := string(jsonTokenBytes)
		if _, stderr, err := runOpenClaw(context.Background(), b.paths,
			[]string{"config", "set", tokenKey, jsonToken, "--strict-json"}, 15000); err != nil {
			return fmt.Errorf("config set %s failed: %s %v", tokenKey, scrubOnboardingCLIOutput(stderr, token, jsonToken), err)
		}
		log.Printf("[onboarding] %s: wrote botToken via config set", channel)
	}

	if appToken := strings.TrimSpace(ch.AppToken); appToken != "" && channel == "slack" {
		jsonAppBytes, err := json.Marshal(appToken)
		if err != nil {
			return fmt.Errorf("marshal slack app token: %w", err)
		}
		jsonApp := string(jsonAppBytes)
		if _, stderr, err := runOpenClaw(context.Background(), b.paths,
			[]string{"config", "set", "channels.slack.appToken", jsonApp, "--strict-json"}, 15000); err != nil {
			log.Printf("[onboarding] slack appToken config set failed: %s %v", scrubOnboardingCLIOutput(stderr, appToken, jsonApp), err)
		}
	}

	// Enable the channel plugin entry
	if _, stderr, err := runOpenClaw(context.Background(), b.paths,
		[]string{"config", "set", "plugins.entries." + channel + ".enabled", "true", "--strict-json"}, 15000); err != nil {
		log.Printf("[onboarding] %s plugin enable failed: %s %v", channel, stderr, err)
	}

	return nil
}

func openClawBindingSpec(ch onboardingChannelConfig) string {
	channel, err := normalizeOnboardingChannelID(ch.Channel)
	if err != nil {
		return ""
	}
	account := strings.TrimSpace(ch.Target)
	if channel == "" {
		return ""
	}
	if account == "" {
		return channel
	}
	return channel + ":" + account
}

const (
	openClawOnboardTimeoutMs   = 180000
	openClawAgentBindTimeoutMs = 480000
)

type openClawAgentBinding struct {
	AgentID string `json:"agentId"`
	Match   struct {
		Channel   string `json:"channel"`
		AccountID string `json:"accountId"`
	} `json:"match"`
}

func sanitizeDebugOpenClawBindOutput(value string) string {
	value = scrubOnboardingCLIOutput(value)
	return openClawBindingTargetPattern.ReplaceAllString(value, "$1:[target]")
}

func canonicalOpenClawBindingSpec(channel, accountID string) string {
	channel = strings.TrimSpace(channel)
	accountID = strings.TrimSpace(accountID)
	if channel == "" || accountID == "" {
		return ""
	}
	return channel + ":" + accountID
}

func (b *BridgeHandler) reassignOpenClawBindingClaims(agentID string, bindings []string) error {
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{"agents", "bindings", "--json"}, 15000)
	if err != nil {
		msg := strings.TrimSpace(stderr)
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("list OpenClaw agent bindings: %s", sanitizeDebugOpenClawBindOutput(msg))
	}
	var existing []openClawAgentBinding
	if err := json.Unmarshal([]byte(stdout), &existing); err != nil {
		return fmt.Errorf("parse OpenClaw agent bindings: %w", err)
	}

	reassignmentCount := 0
	for _, binding := range bindings {
		channel := binding
		target := ""
		if idx := strings.Index(binding, ":"); idx >= 0 {
			channel = binding[:idx]
			target = strings.TrimSpace(binding[idx+1:])
		}
		if target == "" {
			continue
		}
		for _, current := range existing {
			if current.AgentID == "" || current.AgentID == agentID {
				continue
			}
			if current.Match.Channel != channel || current.Match.AccountID != target {
				continue
			}
			if reassignmentCount >= maxOpenClawBindingReassignments {
				return fmt.Errorf("too many OpenClaw binding reassignments for %s", agentID)
			}
			canonicalBinding := canonicalOpenClawBindingSpec(current.Match.Channel, current.Match.AccountID)
			if canonicalBinding == "" {
				continue
			}
			unbindArgs := []string{"agents", "unbind", "--agent", current.AgentID, "--bind", canonicalBinding, "--json"}
			_, unbindStderr, unbindErr := runOpenClaw(context.Background(), b.paths, unbindArgs, 30000)
			if unbindErr != nil {
				msg := strings.TrimSpace(unbindStderr)
				if msg == "" {
					msg = unbindErr.Error()
				}
				return fmt.Errorf("unbind OpenClaw agent %s: %s", current.AgentID, sanitizeDebugOpenClawBindOutput(msg))
			}
			reassignmentCount++
		}
	}
	return nil
}

func (b *BridgeHandler) ensureOpenClawAgentBindings(agentID string, channelConfigs []onboardingChannelConfig, progressKey ...string) error {
	agentID, err := sanitizeOnboardingAgentID(agentID)
	if err != nil {
		return err
	}
	bindings := make([]string, 0, len(channelConfigs))
	bindingChannels := make([]string, 0, len(channelConfigs))
	seenChannels := make(map[string]bool, len(channelConfigs))
	for _, ch := range channelConfigs {
		channel, err := normalizeOnboardingChannelID(ch.Channel)
		if err != nil {
			return err
		}
		ch.Channel = channel
		if ch.Target, err = sanitizeHermesEnvValue("target", ch.Target); err != nil {
			return err
		}
		if ch.BotToken, err = sanitizeHermesEnvValue("botToken", ch.BotToken); err != nil {
			return err
		}
		if ch.AppToken, err = sanitizeHermesEnvValue("appToken", ch.AppToken); err != nil {
			return err
		}
		// Bind only channels the user actively configured. A target-only save is
		// valid when credentials already exist in openclaw.json.
		if strings.TrimSpace(ch.BotToken) == "" && strings.TrimSpace(ch.AppToken) == "" && strings.TrimSpace(ch.Target) == "" {
			continue
		}
		binding := openClawBindingSpec(ch)
		if binding == "" {
			continue
		}
		bindings = append(bindings, binding)
		if !seenChannels[channel] {
			seenChannels[channel] = true
			bindingChannels = append(bindingChannels, channel)
		}
	}
	if len(bindings) == 0 {
		return nil
	}
	// Defensive: `openclaw channels add` does not always populate
	// plugins.entries.<channel>.enabled, and `openclaw agents bind` resolves
	// channel names via the active plugin registry (which only contains
	// enabled plugin entries). Without this, bind fails with
	// `Unknown channel "telegram"` on first-time onboarding. Enable each
	// plugin entry explicitly before binding.
	if err := b.ensureOpenClawPluginEntriesEnabled(bindingChannels); err != nil {
		log.Printf("[onboarding] ensureOpenClawPluginEntriesEnabled: %v", err)
	}
	if err := b.reassignOpenClawBindingClaims(agentID, bindings); err != nil {
		return err
	}
	args := []string{"agents", "bind", "--agent", agentID}
	for _, binding := range bindings {
		args = append(args, "--bind", binding)
	}
	var progressStop chan struct{}
	if len(progressKey) > 0 && strings.TrimSpace(progressKey[0]) != "" {
		key := strings.TrimSpace(progressKey[0])
		progressStop = make(chan struct{})
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			start := time.Now()
			for {
				select {
				case <-ticker.C:
					elapsed := int(time.Since(start).Seconds())
					b.emitProvisionProgress(key, "running", fmt.Sprintf("Binding OpenClaw channels… (%ds elapsed)", elapsed))
				case <-progressStop:
					return
				}
			}
		}()
		defer close(progressStop)
	}
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, args, openClawAgentBindTimeoutMs)
	if err != nil {
		if errors.Is(err, errOpenClawCommandTimedOut) && openClawAgentBindOutputIndicatesSuccess(stdout, len(bindings)) {
			if stderrMsg := strings.TrimSpace(stderr); stderrMsg != "" {
				log.Printf("[onboarding] OpenClaw agent bind timed out after success output; treating %s as bound; stderr=%s", agentID, stderrMsg)
			} else {
				log.Printf("[onboarding] OpenClaw agent bind timed out after success output; treating %s as bound", agentID)
			}
			if err := b.restartOpenClawGatewayAfterChannelBinding(agentID, len(bindings)); err != nil {
				return err
			}
			return nil
		}
		// The openclaw CLI sometimes prints the actionable error to stdout while
		// stderr only contains the "Config overwrite:" informational warn line.
		// Surface both so the connector log is diagnosable.
		stderrMsg := strings.TrimSpace(stderr)
		stdoutMsg := strings.TrimSpace(stdout)
		errMsg := strings.TrimSpace(err.Error())
		var parts []string
		if errMsg != "" {
			parts = append(parts, "error: "+errMsg)
		}
		if stderrMsg != "" {
			parts = append(parts, "stderr: "+stderrMsg)
		}
		if stdoutMsg != "" {
			parts = append(parts, "stdout: "+stdoutMsg)
		}
		return fmt.Errorf("failed to bind OpenClaw agent %s: %s", agentID, strings.Join(parts, " | "))
	}
	return b.restartOpenClawGatewayAfterChannelBinding(agentID, len(bindings))
}

func (b *BridgeHandler) restartOpenClawGatewayAfterChannelBinding(agentID string, bindingCount int) error {
	if bindingCount <= 0 {
		return nil
	}
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{"daemon", "restart"}, 60000)
	if err != nil {
		msg := strings.TrimSpace(stderr)
		if msg == "" {
			msg = strings.TrimSpace(stdout)
		}
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("restart OpenClaw gateway after channel bind: %s", sanitizeDebugOpenClawBindOutput(msg))
	}
	if !waitForGatewayHealthy(45*time.Second, nil) {
		return fmt.Errorf("OpenClaw gateway did not become healthy after channel bind restart")
	}
	return nil
}

func openClawAgentBindOutputIndicatesSuccess(stdout string, wantCount int) bool {
	if wantCount <= 0 {
		return false
	}
	if strings.Contains(stdout, "No new bindings added.") {
		return true
	}
	hasSuccessSection := strings.Contains(stdout, "Added bindings:") ||
		strings.Contains(stdout, "Updated bindings:") ||
		strings.Contains(stdout, "Already present:")
	if !hasSuccessSection {
		return false
	}
	gotCount := 0
	for _, line := range strings.Split(stdout, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "- ") {
			gotCount++
		}
	}
	return gotCount >= wantCount
}

// ensureOpenClawPluginEntriesEnabled writes plugins.entries.<channel>.enabled=true
// to openclaw.json via the CLI so the active plugin registry includes the
// channel when `openclaw agents bind` resolves channel ids. `openclaw channels
// add` currently writes the channel config block but not the plugin entry,
// which causes `Unknown channel "<channel>"` errors on first-time onboarding.
func (b *BridgeHandler) ensureOpenClawPluginEntriesEnabled(channels []string) error {
	var lastErr error
	for _, channel := range channels {
		channel, err := normalizeOnboardingChannelID(channel)
		if err != nil {
			return err
		}
		key := "plugins.entries." + channel + ".enabled"
		args := []string{"config", "set", key, "true"}
		_, stderr, err := runOpenClaw(context.Background(), b.paths, args, 15000)
		if err != nil {
			msg := strings.TrimSpace(stderr)
			if msg == "" {
				msg = err.Error()
			}
			lastErr = fmt.Errorf("config set %s: %s", key, msg)
			log.Printf("[onboarding] %v", lastErr)
		}
	}
	return lastErr
}

// ensureOpenClawGateway installs the gateway daemon, starts it, and ensures the
// connector's device identity is paired with full operator scopes.
// Skips entirely if the gateway is already running and healthy.
// Best-effort — errors are logged but do not fail the onboarding step.
// ensureOpenClawGateway installs and starts the OpenClaw gateway daemon and
// blocks until it is actually healthy. Returns an error if the gateway fails
// to become reachable within the timeout so onboarding doesn't report success
// for a half-started install.
func (b *BridgeHandler) ensureOpenClawGateway() error {
	bin, err := lookPathWithOnboardingEnv(b.paths, "openclaw")
	if err != nil {
		return fmt.Errorf("cannot find openclaw binary for gateway install: %w", err)
	}

	// Always repair gateway.mode FIRST, before any health check. If the config
	// is missing this field the daemon will never become healthy, so every
	// subsequent code path would be useless. Idempotent — no-op if already set.
	EnsureOpenClawGatewayModeLocal(b.paths.OpenClaw)

	// If the gateway is already running and healthy, skip install/start to avoid
	// dropping the connector's WS connection (which causes "failed to communicate
	// with device"). But always run auto-approve in case scopes need upgrading.
	if gatewayIsHealthy() {
		log.Printf("[onboarding] OpenClaw gateway already running — skipping install/start")
		if err := b.syncConnectorGatewayConfigFromOpenClaw(); err != nil {
			log.Printf("[onboarding] connector gateway sync skipped: %v", err)
		}
		b.autoApproveConnectorDevice(bin, b.getProvisionProgress())
		return nil
	}

	// The config was just patched (patchOpenClawJSON). If the gateway was running
	// and watching openclaw.json, it may have restarted and simply needs a moment
	// to come back up. Give it up to 20s to recover before going through the
	// heavier stop→install→start cycle.
	b.emitProvisionProgress("install:openclaw", "running", "Starting OpenClaw gateway…")
	if waitForGatewayHealthy(20*time.Second, func(elapsed time.Duration) {
		b.emitProvisionProgress("install:openclaw", "running",
			fmt.Sprintf("Starting OpenClaw gateway… (%ds)", int(elapsed.Seconds())))
	}) {
		log.Printf("[onboarding] OpenClaw gateway recovered after config change — skipping install/start")
		if err := b.syncConnectorGatewayConfigFromOpenClaw(); err != nil {
			log.Printf("[onboarding] connector gateway sync skipped: %v", err)
		}
		b.autoApproveConnectorDevice(bin, b.getProvisionProgress())
		return nil
	}

	// Disable any channels whose env-var secrets are missing. Without this
	// the gateway crash-loops with "required secrets are unavailable".
	sanitizeOpenClawChannels(b.paths.OpenClaw)

	// Stop any existing instance first so launchd's crash-restart counter
	// resets. Without this, a previously crash-looping daemon causes launchd
	// to apply an exponential backoff (up to ~38s) before it tries again,
	// which pushes the total health-wait well past 60s. Best-effort — ignore
	// errors (the daemon may not be installed yet on a first run).
	b.emitProvisionProgress("install:openclaw", "running", "Preparing OpenClaw gateway…")
	if _, _, err := runOpenClaw(context.Background(), b.paths, []string{"daemon", "stop"}, 10000); err != nil {
		log.Printf("[onboarding] openclaw daemon stop (pre-start): %v", err)
	}

	// Install the daemon (launchd/systemd/schtasks). Use runOpenClaw so a
	// hang in the platform service manager can't freeze onboarding forever.
	b.emitProvisionProgress("install:openclaw", "running", "Installing OpenClaw gateway daemon…")
	if _, stderr, err := runOpenClaw(context.Background(), b.paths, []string{"daemon", "install"}, 60000); err != nil {
		log.Printf("[onboarding] openclaw daemon install: %s %v", stderr, err)
	}

	// Start the daemon
	b.emitProvisionProgress("install:openclaw", "running", "Starting OpenClaw gateway daemon…")
	if _, stderr, err := runOpenClaw(context.Background(), b.paths, []string{"daemon", "start"}, 30000); err != nil {
		log.Printf("[onboarding] openclaw daemon start: %s %v", stderr, err)
	}

	if err := b.syncConnectorGatewayConfigFromOpenClaw(); err != nil {
		log.Printf("[onboarding] connector gateway sync failed: %v", err)
	}

	// Wait for the OpenClaw gateway HTTP /health endpoint to respond before we
	// return success. 120s covers: launchd backoff after crash-loops (~38s) +
	// clean startup (~7s) + connector WS dial + headroom. 60s was too tight
	// for first-boot installs where the daemon crash-loops a few times before
	// config settles.
	const gatewayReadyTimeout = 120 * time.Second
	b.emitProvisionProgress("install:openclaw", "running", "Waiting for OpenClaw gateway to become healthy…")
	if !waitForGatewayHealthy(gatewayReadyTimeout, func(elapsed time.Duration) {
		secs := int(elapsed.Seconds())
		var msg string
		if secs < 60 {
			msg = fmt.Sprintf("Waiting for OpenClaw gateway to become healthy… (%ds)", secs)
		} else {
			msg = fmt.Sprintf("Waiting for OpenClaw gateway to become healthy… (%dm %ds)", secs/60, secs%60)
		}
		b.emitProvisionProgress("install:openclaw", "running", msg)
	}) {
		return fmt.Errorf("OpenClaw gateway did not become healthy within %s — check ~/.openclaw logs and try again", gatewayReadyTimeout)
	}

	// Kick the connector's own reconnect goroutine so it dials the freshly
	// started gateway immediately instead of waiting out its backoff.
	// We do NOT block here — the WS reconnect may take several cycles while
	// the gateway issues a device scope-upgrade challenge and autoApprove
	// resolves it. autoApproveConnectorDevice handles all of that in the
	// background, including its own waitForConnectorGatewayConnected.
	b.kickGatewayReconnect()
	b.emitProvisionProgress("install:openclaw", "running", "OpenClaw gateway healthy — connecting…")

	// Auto-approve the connector's device with full operator scopes.
	b.autoApproveConnectorDevice(bin, b.getProvisionProgress())
	return nil
}

// waitForGatewayHealthy polls the OpenClaw /health endpoint until it returns
// 200 or the timeout elapses.
func waitForGatewayHealthy(timeout time.Duration, onTick ...func(time.Duration)) bool {
	deadline := time.Now().Add(timeout)
	start := time.Now()
	tick := func(time.Duration) {}
	if len(onTick) > 0 && onTick[0] != nil {
		tick = onTick[0]
	}
	for {
		if gatewayIsHealthy() {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(1 * time.Second)
		tick(time.Since(start))
	}
}

// waitForConnectorGatewayConnected polls the shared gwConnected atomic until
// the connector's own WS to the local OpenClaw gateway is open.
func waitForConnectorGatewayConnected(flag *atomic.Int32, timeout time.Duration) bool {
	if flag == nil {
		return false
	}
	deadline := time.Now().Add(timeout)
	for {
		if flag.Load() == 1 {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// EnsureOpenClawGatewayModeLocal writes gateway.mode=local into openclaw.json if
// it's missing. Without this, the OpenClaw daemon refuses to start and logs
// "existing config is missing gateway.mode" every ~5s. Idempotent — no-op if
// the mode is already set. Silently skips when the config file does not exist
// (first-boot onboarding will create it). Direct JSON edit is used instead of
// `openclaw config set` so a broken CLI cannot silently fail the fix.
func EnsureOpenClawGatewayModeLocal(openclawDir string) {
	configPath := filepath.Join(openclawDir, "openclaw.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return // no config yet — first-boot will create it
	}

	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Printf("[openclaw-config] cannot parse openclaw.json for gateway.mode check: %v", err)
		return
	}

	gateway, _ := cfg["gateway"].(map[string]interface{})
	if gateway == nil {
		gateway = map[string]interface{}{}
	}
	if mode, _ := gateway["mode"].(string); mode != "" {
		return // already set — no-op
	}
	gateway["mode"] = "local"
	cfg["gateway"] = gateway

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		log.Printf("[openclaw-config] marshal failed while setting gateway.mode: %v", err)
		return
	}
	if err := os.WriteFile(configPath, out, 0600); err != nil {
		log.Printf("[openclaw-config] failed to write gateway.mode=local to %s: %v", configPath, err)
		return
	}
	log.Printf("[openclaw-config] repaired: wrote gateway.mode=local to %s", configPath)
}

// BootstrapOpenClawIfNeeded runs `openclaw onboard --non-interactive` at
// connector startup when the gateway was never fully provisioned (no
// gateway.auth.token in openclaw.json). This covers the case where a user
// installs the connector but the onboarding runtime-install step was skipped,
// failed, or ~/.openclaw was wiped. Starts the daemon and auto-approves the
// connector device so everything "just works" after onboarding.
// Runs once — idempotent when gateway.auth.token already exists.
func BootstrapOpenClawIfNeeded(paths Paths) {
	configPath := filepath.Join(paths.OpenClaw, "openclaw.json")

	// Check if gateway.auth.token exists
	if data, err := os.ReadFile(configPath); err == nil {
		var cfg map[string]interface{}
		if json.Unmarshal(data, &cfg) == nil {
			if gw, _ := cfg["gateway"].(map[string]interface{}); gw != nil {
				if auth, _ := gw["auth"].(map[string]interface{}); auth != nil {
					if tok, _ := auth["token"].(string); tok != "" {
						return // gateway already configured — nothing to do
					}
				}
			}
		}
	}

	// Find the openclaw binary
	bin, err := lookPathWithOnboardingEnv(paths, "openclaw")
	if err != nil {
		log.Printf("[bootstrap] openclaw binary not found — skipping gateway bootstrap")
		return
	}

	log.Printf("[bootstrap] gateway.auth.token missing — running openclaw onboard to set up gateway")
	mainAgentDir := paths.AgentDir("openclaw", "main")
	args := []string{
		"onboard",
		"--non-interactive",
		"--mode", "local",
		"--workspace", mainAgentDir,
		"--auth-choice", "skip",
		"--secret-input-mode", "plaintext",
		"--gateway-port", "18789",
		"--gateway-bind", "loopback",
		"--install-daemon",
		"--daemon-runtime", "node",
		"--skip-skills",
		"--accept-risk",
		"--skip-search",
		"--skip-channels",
	}

	cmd := newOpenClawCmd(paths, bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[bootstrap] openclaw onboard failed: %s %v", strings.TrimSpace(string(out)), err)
		return
	}
	log.Printf("[bootstrap] openclaw onboard completed — gateway configured")

	// Wait for the gateway to become healthy
	if !waitForGatewayHealthy(30 * time.Second) {
		log.Printf("[bootstrap] gateway did not become healthy within 30s")
		return
	}
	log.Printf("[bootstrap] gateway is healthy")

	// Auto-approve the connector's device in the background.
	// Once approved, restart gateway to reload the device table.
	go func() {
		for i := 0; i < 15; i++ {
			time.Sleep(2 * time.Second)
			listCmd := newOpenClawCmd(paths, bin, "devices", "list", "--json")
			listOut, _ := listCmd.CombinedOutput()
			reqID := extractPendingRequestID(listOut)
			if reqID == "" {
				// No pending request: either already approved or not yet submitted.
				// Check if gateway WS handshake works — if so, we're done.
				if i > 3 {
					// After a few attempts, if no request appeared, it's likely
					// already approved from a previous run. Don't restart.
					log.Printf("[bootstrap] auto-approve: no pending request after %d attempts — likely already paired", i+1)
					return
				}
				continue
			}
			approveCmd := newOpenClawCmd(paths, bin, "devices", "approve", reqID)
			if approveOut, err := approveCmd.CombinedOutput(); err != nil {
				log.Printf("[bootstrap] auto-approve failed: %s %v", strings.TrimSpace(string(approveOut)), err)
				continue
			}
			log.Printf("[bootstrap] device auto-approved")

			// Restart gateway to reload device table
			time.Sleep(1 * time.Second)
			restartCmd := newOpenClawCmd(paths, bin, "daemon", "restart")
			restartCmd.CombinedOutput()
			return
		}
		log.Printf("[bootstrap] auto-approve: gave up after 30s — run: openclaw devices approve --latest")
	}()
}

// sanitizeOpenClawChannels reads openclaw.json and disables any enabled channel
// whose secret references an env var that is missing. Without this, the gateway
// crash-loops with "required secrets are unavailable" if a channel was configured
// (e.g. Telegram) but the bot token env var was never set.
func sanitizeOpenClawChannels(openclawDir string) {
	configPath := filepath.Join(openclawDir, "openclaw.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return // no config yet
	}

	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return
	}

	channels, ok := cfg["channels"].(map[string]interface{})
	if !ok || len(channels) == 0 {
		return
	}

	modified := false
	// Collect channels to remove (can't delete from map during iteration)
	var toRemove []string
	for name, raw := range channels {
		ch, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}

		// Check all secret-ref fields (objects with "source":"env" and "id")
		for field, val := range ch {
			ref, ok := val.(map[string]interface{})
			if !ok {
				continue
			}
			if ref["source"] != "env" {
				continue
			}
			envVar, _ := ref["id"].(string)
			if envVar == "" {
				continue
			}
			if os.Getenv(envVar) == "" {
				log.Printf("[onboarding] removing channel %q: env var %q for field %q is missing", name, envVar, field)
				toRemove = append(toRemove, name)
				break
			}
		}
	}
	for _, name := range toRemove {
		delete(channels, name)
		modified = true
	}
	// Remove the channels key entirely if empty
	if len(channels) == 0 {
		delete(cfg, "channels")
	}

	if !modified {
		return
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(configPath, out, 0600); err != nil {
		log.Printf("[onboarding] failed to write sanitized openclaw.json: %v", err)
	}
}

// openclawConfigIsComplete returns true when openclaw.json exists AND was written
// by openclaw itself (not just the connector's gateway-mode repair stub).
//
// The connector's EnsureOpenClawGatewayModeLocal creates a minimal stub with only
// gateway.mode=local. That stub passes a simple os.Stat check but fails openclaw
// schema validation, causing `openclaw channels add` to return "Config invalid".
//
// We distinguish the two cases by checking for gateway.port, which the connector
// never writes but `openclaw onboard --gateway-port 18789` always sets. If the
// gateway section only has the "mode" key, we treat the config as incomplete and
// re-run onboard so openclaw writes the full validated schema.
func openclawConfigIsComplete(configPath string) bool {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return false
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return false
	}
	gw, _ := cfg["gateway"].(map[string]interface{})
	if gw == nil {
		return false
	}
	// Connector stubs only have "mode". A real openclaw config also has "port"
	// (and typically "bind", "auth", etc.) written during onboard.
	_, hasPort := gw["port"]
	return hasPort
}

// patchOpenClawJSON applies string patches and optional raw (any JSON type) patches
// directly to openclaw.json in a single read→modify→write cycle.
// Skips the write entirely when all patches already match the current values,
// preventing an unnecessary file-watcher restart in the OpenClaw gateway.
func patchOpenClawJSON(configPath string, patches map[string]string, rawPatches ...map[string]interface{}) error {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read openclaw.json: %w", err)
	}
	var root map[string]interface{}
	if err := json.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("parse openclaw.json: %w", err)
	}
	// Check whether any string patch changes the current value.
	changed := false
	for dotPath, value := range patches {
		if getDotPath(root, dotPath) != value {
			changed = true
			break
		}
	}
	// Raw patches: compare by JSON serialization to detect actual changes.
	var merged map[string]interface{}
	if len(rawPatches) > 0 {
		merged = rawPatches[0]
		for dotPath, newVal := range merged {
			existingRaw := getDotPathRaw(root, dotPath)
			existingJSON, _ := json.Marshal(existingRaw)
			newJSON, _ := json.Marshal(newVal)
			if string(existingJSON) != string(newJSON) {
				changed = true
				break
			}
		}
	}
	if !changed {
		return nil // nothing to do — skip write to avoid triggering gateway file-watcher
	}
	for dotPath, value := range patches {
		setDotPath(root, dotPath, value)
	}
	for dotPath, value := range merged {
		setDotPathRaw(root, dotPath, value)
	}
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal openclaw.json: %w", err)
	}
	return os.WriteFile(configPath, out, 0600)
}

// setDotPathRaw sets a nested value of any JSON type in a map using a dotted key path.
func setDotPathRaw(m map[string]interface{}, dotPath string, value interface{}) {
	idx := strings.Index(dotPath, ".")
	if idx == -1 {
		m[dotPath] = value
		return
	}
	head, tail := dotPath[:idx], dotPath[idx+1:]
	sub, _ := m[head].(map[string]interface{})
	if sub == nil {
		sub = make(map[string]interface{})
	}
	setDotPathRaw(sub, tail, value)
	m[head] = sub
}

// getDotPathRaw reads a nested value (any type) from a map using a dotted key path.
func getDotPathRaw(m map[string]interface{}, dotPath string) interface{} {
	idx := strings.Index(dotPath, ".")
	if idx == -1 {
		return m[dotPath]
	}
	head, tail := dotPath[:idx], dotPath[idx+1:]
	sub, _ := m[head].(map[string]interface{})
	if sub == nil {
		return nil
	}
	return getDotPathRaw(sub, tail)
}

// getDotPath reads a nested string value from a map using a dotted key path.
// Returns "" if the path doesn't exist or the value is not a string.
func getDotPath(m map[string]interface{}, dotPath string) string {
	idx := strings.Index(dotPath, ".")
	if idx == -1 {
		v, _ := m[dotPath].(string)
		return v
	}
	head, tail := dotPath[:idx], dotPath[idx+1:]
	sub, _ := m[head].(map[string]interface{})
	if sub == nil {
		return ""
	}
	return getDotPath(sub, tail)
}

// setDotPath sets a nested value in a map using a dotted key path.
func setDotPath(m map[string]interface{}, dotPath string, value string) {
	idx := strings.Index(dotPath, ".")
	if idx == -1 {
		m[dotPath] = value
		return
	}
	head, tail := dotPath[:idx], dotPath[idx+1:]
	sub, _ := m[head].(map[string]interface{})
	if sub == nil {
		sub = make(map[string]interface{})
	}
	setDotPath(sub, tail, value)
	m[head] = sub
}

// gatewayIsHealthy returns true if the OpenClaw gateway is reachable at its
// default local address. Used to avoid restarting a working gateway.
func gatewayIsHealthy() bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:18789/health")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

type onboardingOpenClawGatewaySnapshot struct {
	Gateway struct {
		Port int `json:"port"`
		Auth struct {
			Token string `json:"token"`
		} `json:"auth"`
	} `json:"gateway"`
}

func readOnboardingOpenClawGatewayConfig(configPath string) (int, string, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return 0, "", err
	}
	var cfg onboardingOpenClawGatewaySnapshot
	if err := json.Unmarshal(data, &cfg); err != nil {
		return 0, "", err
	}
	return cfg.Gateway.Port, strings.TrimSpace(cfg.Gateway.Auth.Token), nil
}

func (b *BridgeHandler) syncConnectorGatewayConfigFromOpenClaw() error {
	const defaultGatewayPort = 18789
	var lastErr error
	for attempt := 0; attempt < 15; attempt++ {
		port, token, err := readOnboardingOpenClawGatewayConfig(b.paths.OpenClawConfigPath())
		if err != nil {
			lastErr = err
		} else {
			// Newer OpenClaw versions may omit gateway.port from openclaw.json
			// when running on the default; fall back so the connector still
			// gets a correct ws URL instead of waiting forever.
			if port <= 0 {
				port = defaultGatewayPort
			}
			// If we still have no token yet, keep retrying for a bit so the
			// saved config actually lets the connector authenticate.
			if token == "" && attempt < 14 {
				time.Sleep(1 * time.Second)
				continue
			}
			cfg := &connectorconfig.Config{
				DataDir:      b.paths.HyperClaw,
				GatewayHost:  "127.0.0.1",
				GatewayPort:  port,
				GatewayURL:   fmt.Sprintf("ws://127.0.0.1:%d/gateway", port),
				GatewayToken: token,
			}
			if err := cfg.SaveGatewayConfig(); err != nil {
				return err
			}
			log.Printf("[onboarding] synced connector gateway config to %s", cfg.GatewayURL)
			return nil
		}
		time.Sleep(1 * time.Second)
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("openclaw gateway config not ready in %s", b.paths.OpenClawConfigPath())
}

// autoApproveConnectorDevice waits for the connector's scope-upgrade pairing
// request to appear, approves it via the local fallback, then restarts the
// gateway so it loads the new scopes. The `openclaw onboard --non-interactive`
// creates the device with only operator.read scope; the connector needs full
// operator access.
// Runs in a background goroutine so it doesn't block the onboarding response.
// provisionProgress is optional; when non-nil it receives a warning event if
// auto-approval times out so the dashboard can surface a user-visible message.
func (b *BridgeHandler) autoApproveConnectorDevice(bin string, provisionProgress func(key, status, detail string)) {
	go func() {
		// Wait for the gateway to start and the connector to attempt a connection
		// (which creates the pending scope-upgrade request).
		for i := 0; i < 15; i++ {
			time.Sleep(2 * time.Second)

			// If the connector is already connected to the gateway, the device
			// was approved (either by us, or externally). Stop — do NOT restart
			// a working gateway, which would drop the live connection.
			if b.gwConnected != nil && b.gwConnected.Load() == 1 {
				log.Printf("[onboarding] auto-approve: gateway already connected — nothing to do")
				return
			}

			// List pending requests in JSON to find the request ID
			listCmd := newOpenClawCmd(b.paths, bin, "devices", "list", "--json")
			listOut, _ := listCmd.CombinedOutput()

			reqID := extractPendingRequestID(listOut)
			if reqID == "" {
				log.Printf("[onboarding] auto-approve attempt %d: no pending request yet", i+1)
				continue
			}

			// Approve the specific request (uses local fallback since gateway rejects us)
			approveCmd := newOpenClawCmd(b.paths, bin, "devices", "approve", reqID)
			approveOut, err := approveCmd.CombinedOutput()
			outStr := strings.TrimSpace(string(approveOut))
			if err != nil {
				log.Printf("[onboarding] auto-approve failed: %s %v", outStr, err)
				continue
			}
			log.Printf("[onboarding] device auto-approved: %s", outStr)

			// Re-check: if the connector connected while we were approving, the
			// gateway already loaded the new scopes. Skip the restart.
			if b.gwConnected != nil && b.gwConnected.Load() == 1 {
				log.Printf("[onboarding] auto-approve: gateway connected during approve — skipping restart")
				return
			}

			// Restart the gateway so it reloads the device table with new scopes.
			// Without this, the in-memory state still has old operator.read scopes.
			time.Sleep(1 * time.Second)
			restartCmd := newOpenClawCmd(b.paths, bin, "daemon", "restart")
			if rOut, rErr := restartCmd.CombinedOutput(); rErr != nil {
				// Restart failed — try stop + start
				log.Printf("[onboarding] daemon restart: %s %v — trying stop+start", strings.TrimSpace(string(rOut)), rErr)
				stopCmd := newOpenClawCmd(b.paths, bin, "daemon", "stop")
				stopCmd.CombinedOutput()
				time.Sleep(2 * time.Second)
				startCmd := newOpenClawCmd(b.paths, bin, "daemon", "start")
				startCmd.CombinedOutput()
			}

			// Wait for the gateway to be healthy again after the scope-reload
			// restart, then reconnect the connector's local WS immediately.
			// Without this the connector sits on its backoff timer (up to 30s)
			// and the dashboard probe fails → "Device unreachable" banner.
			waitForGatewayHealthy(60 * time.Second)
			b.kickGatewayReconnect()
			waitForConnectorGatewayConnected(b.gwConnected, 45*time.Second)
			return
		}
		log.Printf("[onboarding] auto-approve: gave up after 30s — manual approval may be needed via: openclaw devices approve --latest")
		if provisionProgress != nil {
			provisionProgress("gateway-pairing", "warning", "Auto-pairing timed out. Run: openclaw devices approve --latest")
		}
	}()
}

// extractPendingRequestID parses the JSON output of `openclaw devices list --json`
// and returns the first pending request ID, or "" if none.
func extractPendingRequestID(jsonData []byte) string {
	start := bytes.IndexByte(jsonData, '{')
	if start < 0 {
		return ""
	}
	var result struct {
		Pending []struct {
			RequestID string `json:"requestId"`
		} `json:"pending"`
	}
	if err := json.Unmarshal(jsonData[start:], &result); err != nil {
		return ""
	}
	if len(result.Pending) > 0 {
		return result.Pending[0].RequestID
	}
	return ""
}

// hermesChannelTokenEnvKeys maps channel names to their bot token env var in Hermes.
var hermesChannelTokenEnvKeys = map[string]string{
	"telegram": "TELEGRAM_BOT_TOKEN",
	"discord":  "DISCORD_BOT_TOKEN",
	"slack":    "SLACK_BOT_TOKEN",
}

func writeHermesEnvFile(envPath string, updates map[string]string) error {
	safeUpdates := make(map[string]string, len(updates))
	for key, value := range updates {
		safeValue, err := sanitizeHermesEnvValue(key, value)
		if err != nil {
			return err
		}
		safeUpdates[key] = safeValue
	}

	// Read the existing file, preserving every line.
	var lines []string
	if data, err := os.ReadFile(envPath); err == nil {
		lines = strings.Split(string(data), "\n")
	}

	// Track which keys we've already placed so we don't double-write.
	applied := map[string]bool{}

	// Walk lines and update in-place where possible.
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Match active line: KEY=value
		// Match commented-out line: # KEY=value  (template placeholder)
		var key string
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			if idx := strings.Index(trimmed, "="); idx > 0 {
				key = strings.TrimSpace(trimmed[:idx])
			}
		} else if strings.HasPrefix(trimmed, "# ") {
			rest := strings.TrimSpace(trimmed[2:])
			if idx := strings.Index(rest, "="); idx > 0 {
				key = strings.TrimSpace(rest[:idx])
			}
		}

		if key == "" {
			continue
		}
		val, want := safeUpdates[key]
		if !want || applied[key] {
			continue
		}

		// Replace this line (whether active or commented) with the new value.
		lines[i] = key + "=" + val
		applied[key] = true
	}

	// Append any keys that weren't found anywhere in the file.
	remaining := make([]string, 0)
	for k := range safeUpdates {
		if !applied[k] {
			remaining = append(remaining, k)
		}
	}
	if len(remaining) > 0 {
		sort.Strings(remaining)
		// Ensure a blank separator before our additions.
		if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) != "" {
			lines = append(lines, "")
		}
		for _, k := range remaining {
			lines = append(lines, k+"="+safeUpdates[k])
		}
	}

	return os.WriteFile(envPath, []byte(strings.Join(lines, "\n")), 0600)
}

// ensureHermesEnv writes provider API keys, bot tokens, and channel home targets
// to ~/.hermes/.env and mirrors the same updates into existing named profile
// env files under ~/.hermes/profiles/<agentId>/.env so profile-scoped Hermes
// agents launched with HERMES_HOME keep their credentials in sync.
func (b *BridgeHandler) ensureHermesEnv(providers []onboardingProviderConfig, channelTargets map[string]string, channelConfigs []onboardingChannelConfig) error {
	hermesDir := filepath.Join(b.paths.Home, ".hermes")
	if err := os.MkdirAll(hermesDir, 0700); err != nil {
		return fmt.Errorf("failed to create hermes dir: %w", err)
	}

	// Build the set of keys we want to upsert.
	updates := map[string]string{}

	apiServerKey := hermesAPIKey()
	if apiServerKey == "" {
		apiServerKey = "hc_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	}
	updates["API_SERVER_ENABLED"] = "true"
	updates["API_SERVER_KEY"] = apiServerKey
	updates["API_SERVER_HOST"] = "127.0.0.1"
	updates["API_SERVER_PORT"] = "8642"

	for _, p := range providers {
		envKeys, ok := hermesProviderEnvKeys[p.ProviderID]
		key := strings.TrimSpace(p.APIKey)
		if !ok || key == "" {
			continue
		}
		for _, envKey := range envKeys {
			updates[envKey] = key
		}
	}

	for channel, target := range channelTargets {
		envKey, ok := hermesChannelEnvKeys[channel]
		if !ok || strings.TrimSpace(target) == "" {
			continue
		}
		updates[envKey] = strings.TrimSpace(target)
	}

	for _, ch := range channelConfigs {
		token := strings.TrimSpace(ch.BotToken)
		if token == "" {
			continue
		}
		envKey, ok := hermesChannelTokenEnvKeys[ch.Channel]
		if !ok {
			continue
		}
		updates[envKey] = token
	}

	envPath := filepath.Join(hermesDir, ".env")
	if err := os.MkdirAll(filepath.Dir(envPath), 0700); err != nil {
		return fmt.Errorf("failed to create hermes env dir %s: %w", filepath.Dir(envPath), err)
	}
	if err := writeHermesEnvFile(envPath, updates); err != nil {
		return err
	}

	profileUpdates := make(map[string]string, len(updates))
	for k, v := range updates {
		if strings.HasPrefix(k, "API_SERVER_") {
			continue
		}
		profileUpdates[k] = v
	}
	if len(profileUpdates) > 0 {
		profilesDir := filepath.Join(hermesDir, "profiles")
		if entries, err := os.ReadDir(profilesDir); err == nil {
			for _, entry := range entries {
				if !entry.IsDir() {
					continue
				}
				profileEnvPath := filepath.Join(profilesDir, entry.Name(), ".env")
				if err := os.MkdirAll(filepath.Dir(profileEnvPath), 0700); err != nil {
					return fmt.Errorf("failed to create hermes env dir %s: %w", filepath.Dir(profileEnvPath), err)
				}
				if err := writeHermesEnvFile(profileEnvPath, profileUpdates); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

func activeOnboardingChannels(channelConfigs []onboardingChannelConfig) ([]onboardingChannelConfig, error) {
	active := make([]onboardingChannelConfig, 0, len(channelConfigs))
	for _, ch := range channelConfigs {
		channel, err := normalizeOnboardingChannelID(ch.Channel)
		if err != nil {
			return nil, err
		}
		ch.Channel = channel
		if strings.TrimSpace(ch.Target) == "" && strings.TrimSpace(ch.BotToken) == "" && strings.TrimSpace(ch.AppToken) == "" {
			continue
		}
		active = append(active, ch)
	}
	return active, nil
}

func hermesChannelEnvUpdates(channelTargets map[string]string, channelConfigs []onboardingChannelConfig) map[string]string {
	updates := map[string]string{}
	for rawChannel, target := range channelTargets {
		channel, err := normalizeOnboardingChannelID(rawChannel)
		if err != nil {
			continue
		}
		envKey, ok := hermesChannelEnvKeys[channel]
		if !ok || strings.TrimSpace(target) == "" {
			continue
		}
		updates[envKey] = strings.TrimSpace(target)
	}
	for _, ch := range channelConfigs {
		token := strings.TrimSpace(ch.BotToken)
		if token == "" {
			continue
		}
		channel, err := normalizeOnboardingChannelID(ch.Channel)
		if err != nil {
			continue
		}
		envKey, ok := hermesChannelTokenEnvKeys[channel]
		if !ok {
			continue
		}
		updates[envKey] = token
	}
	return updates
}

func (b *BridgeHandler) ensureHermesAgentEnv(agentID string, channelTargets map[string]string, channelConfigs []onboardingChannelConfig) error {
	safeAgentID, err := sanitizeOnboardingAgentID(agentID)
	if err != nil {
		return err
	}
	if safeAgentID == "" {
		return nil
	}
	updates := hermesChannelEnvUpdates(channelTargets, channelConfigs)
	if len(updates) == 0 {
		return nil
	}

	hermesDir := filepath.Join(b.paths.Home, ".hermes")
	envDir := hermesDir
	if !isHermesMainAgent(safeAgentID) {
		envDir = filepath.Join(hermesDir, "profiles", safeAgentID)
	}
	envPath := filepath.Join(envDir, ".env")
	if err := os.MkdirAll(filepath.Dir(envPath), 0700); err != nil {
		return fmt.Errorf("failed to create hermes env dir %s: %w", filepath.Dir(envPath), err)
	}
	return writeHermesEnvFile(envPath, updates)
}

func (b *BridgeHandler) applyAgentChannelConfigs(configs []onboardingRuntimeChannelConfig) error {
	for _, cfg := range configs {
		runtimeName := strings.TrimSpace(cfg.Runtime)
		rawAgentID := strings.TrimSpace(cfg.AgentID)
		if runtimeName == "" || rawAgentID == "" {
			continue
		}
		agentID, err := sanitizeOnboardingAgentID(rawAgentID)
		if err != nil {
			return err
		}
		channels, err := activeOnboardingChannels(cfg.Channels)
		if err != nil {
			return err
		}
		if len(channels) == 0 {
			continue
		}

		switch runtimeName {
		case "openclaw":
			var creds []onboardingChannelConfig
			for _, ch := range channels {
				if strings.TrimSpace(ch.BotToken) != "" || strings.TrimSpace(ch.AppToken) != "" {
					creds = append(creds, ch)
				}
			}
			if len(creds) > 0 {
				if err := b.ensureOpenClawChannels(creds); err != nil {
					return err
				}
			}
			b.emitProvisionProgress("workspace-state", "running", fmt.Sprintf("Binding OpenClaw channels for %s… this can take a few minutes on first run", agentID))
			if err := b.ensureOpenClawAgentBindings(agentID, channels, "workspace-state"); err != nil {
				return err
			}
		case "hermes":
			targets := map[string]string{}
			var creds []onboardingChannelConfig
			for _, ch := range channels {
				if target := strings.TrimSpace(ch.Target); target != "" {
					targets[ch.Channel] = target
				}
				if strings.TrimSpace(ch.BotToken) != "" {
					creds = append(creds, ch)
				}
			}
			if err := b.ensureHermesAgentEnv(agentID, targets, creds); err != nil {
				return err
			}
		}
	}
	return nil
}

func (b *BridgeHandler) saveOnboardingState(companyName, companyDescription, companyAvatarDataUri string, providerConfigs interface{}, runtimeChoices []string, channelConfigs []onboardingRuntimeChannelConfig) error {
	if b.store == nil {
		return fmt.Errorf("data store not initialized")
	}
	write := func(key string, value interface{}) error {
		data, err := json.Marshal(value)
		if err != nil {
			return err
		}
		return b.store.KVSet(key, string(data))
	}
	companyProfile := map[string]string{
		"name":        companyName,
		"description": companyDescription,
	}
	if companyAvatarDataUri != "" {
		companyProfile["avatarDataUri"] = companyAvatarDataUri
	}
	if err := write("onboarding-company-profile", companyProfile); err != nil {
		return err
	}
	providers := decodeProviderConfigs(providerConfigs)
	if count, err := b.saveOnboardingProviderCredentials(providers); err != nil {
		return fmt.Errorf("save onboarding provider credentials: %w", err)
	} else if count > 0 {
		log.Printf("[onboarding] saved %d provider credential(s) to encrypted credentials store", count)
	}
	if err := write(onboardingProviderConfigsKey, redactedOnboardingProviderConfigs(providers)); err != nil {
		return err
	}
	if err := b.store.KVSet(onboardingProviderCredentialsSyncedKey, "true"); err != nil {
		return err
	}
	if err := write("onboarding-runtime-channels", channelConfigs); err != nil {
		return err
	}
	if err := write("onboarding-selected-runtimes", runtimeChoices); err != nil {
		return err
	}
	return nil
}

func (b *BridgeHandler) saveAgentChannelConfigs(channelConfigs []onboardingRuntimeChannelConfig) error {
	if b.store == nil {
		return fmt.Errorf("data store not initialized")
	}
	data, err := json.Marshal(channelConfigs)
	if err != nil {
		return err
	}
	return b.store.KVSet("onboarding-agent-channel-configs", string(data))
}

func decodeOnboardingProfiles(raw interface{}) ([]onboardingAgentProfile, error) {
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || string(data) == "null" {
		return []onboardingAgentProfile{}, nil
	}
	var profiles []onboardingAgentProfile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, err
	}
	return profiles, nil
}

func decodeOnboardingChannelConfigs(raw interface{}) ([]onboardingRuntimeChannelConfig, error) {
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || string(data) == "null" {
		return []onboardingRuntimeChannelConfig{}, nil
	}
	var configs []onboardingRuntimeChannelConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		return nil, err
	}
	return configs, nil
}

func decodeProviderConfigs(raw interface{}) []onboardingProviderConfig {
	if raw == nil {
		return nil
	}
	data, err := json.Marshal(raw)
	if err != nil || len(data) == 0 || string(data) == "null" {
		return nil
	}
	var configs []onboardingProviderConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		return nil
	}
	return configs
}

func decodeStringSlice(raw interface{}) []string {
	items, _ := raw.([]interface{})
	if items == nil {
		if direct, ok := raw.([]string); ok {
			return direct
		}
		return []string{}
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if value, ok := item.(string); ok && strings.TrimSpace(value) != "" {
			out = append(out, value)
		}
	}
	return out
}

// --- Granular onboarding actions (called one-at-a-time from the dashboard) ---

// onboardingInstallRuntime installs a single runtime if not already present, then
// configures it (openclaw onboard, channel tokens, hermes env).
func (b *BridgeHandler) onboardingInstallRuntime(params map[string]interface{}) actionResult {
	runtimeName, _ := params["runtime"].(string)
	if runtimeName == "" {
		return errResultStatus("missing runtime name", 400)
	}
	providers := decodeProviderConfigs(params["providerConfigs"])

	// Decode explicit primary brain and memory search (optional in granular path).
	var primaryBrain *onboardingPrimaryBrain
	if pb, ok := params["primaryBrain"].(map[string]interface{}); ok {
		pid, _ := pb["providerId"].(string)
		model, _ := pb["model"].(string)
		if pid != "" && model != "" {
			primaryBrain = &onboardingPrimaryBrain{ProviderID: pid, Model: model}
		}
	}
	var memorySearch *onboardingMemorySearch
	if ms, ok := params["memorySearch"].(map[string]interface{}); ok {
		enabled, _ := ms["enabled"].(bool)
		provider, _ := ms["provider"].(string)
		apiKey, _ := ms["apiKey"].(string)
		if enabled && provider != "" {
			memorySearch = &onboardingMemorySearch{Enabled: true, Provider: provider, APIKey: apiKey}
		}
	}

	// Decode channel configs for this runtime
	channelConfigs, _ := decodeOnboardingChannelConfigs(params["runtimeChannelConfigs"])
	var openclawChannelCreds []onboardingChannelConfig
	hermesChannelTargets := map[string]string{}
	var hermesChannelCreds []onboardingChannelConfig
	for _, rcc := range channelConfigs {
		for _, ch := range rcc.Channels {
			if rcc.Runtime == "openclaw" {
				if strings.TrimSpace(ch.BotToken) != "" {
					openclawChannelCreds = append(openclawChannelCreds, ch)
				}
			}
			if rcc.Runtime == "hermes" {
				if strings.TrimSpace(ch.Target) != "" {
					hermesChannelTargets[ch.Channel] = strings.TrimSpace(ch.Target)
				}
				if strings.TrimSpace(ch.BotToken) != "" {
					hermesChannelCreds = append(hermesChannelCreds, ch)
				}
			}
		}
	}

	wasInstalled := b.onboardingRuntimeAvailable(runtimeName)
	if !wasInstalled {
		command := onboardingInstallCommand(runtimeName)
		if command == "" {
			return errResult("Unsupported runtime: " + runtimeName)
		}
		// Stream install output as progress events so the UI shows live updates
		progress := func(line string) {
			b.emitProvisionProgress("install:"+runtimeName, "running", line)
		}
		if err := runOnboardingCommandWithProgress(b.paths, command, progress); err != nil {
			return errResult(err.Error())
		}
	}

	// Post-install configuration
	if runtimeName == "openclaw" {
		b.emitProvisionProgress("install:"+runtimeName, "running", "Configuring OpenClaw defaults…")
		if err := b.ensureOpenClawDefaults(providers, primaryBrain, memorySearch); err != nil {
			return errResult("OpenClaw installed, but default setup failed: " + err.Error())
		}
		// Seed the default "main" agent into SQLite now that openclaw.json exists.
		// The startup seed failed because ~/.openclaw didn't exist yet, and the
		// config watcher couldn't start either. Without this, list-agents falls
		// through to spawning the CLI (which hangs) instead of reading SQLite.
		if b.store != nil {
			b.store.SeedAgents([]store.SeedAgent{{
				ID:     "main",
				Name:   "Main",
				Status: "active",
			}})
			log.Printf("[onboarding] seeded main agent into SQLite")
		}
		if err := b.ensureOpenClawChannels(openclawChannelCreds); err != nil {
			// Channel setup is non-fatal — a missing npm dependency (e.g. grammy
			// for Telegram) should not block the rest of onboarding. Users can
			// re-configure channels later via `openclaw channels add`.
			log.Printf("[onboarding] channel setup failed (non-fatal): %v", err)
		}
		// Install and start the gateway daemon so OpenClaw is actually reachable.
		// Block on gateway health; a half-started gateway must fail the step
		// instead of reporting success, otherwise the dashboard jumps ahead.
		b.emitProvisionProgress("install:"+runtimeName, "running", "Starting OpenClaw gateway…")
		if err := b.ensureOpenClawGateway(); err != nil {
			return errResult("OpenClaw installed, but the gateway did not come up: " + err.Error())
		}
		// Wait for the connector's own WS connection to the gateway to be live.
		// Without this, onboarding returns success but subsequent actions (list-agents,
		// models.list) immediately time out because the WS isn't established yet.
		b.emitProvisionProgress("install:"+runtimeName, "running", "Connecting to OpenClaw gateway…")
		if !waitForConnectorGatewayConnected(b.gwConnected, 60*time.Second) {
			log.Printf("[onboarding] warning: gateway WS not connected after 60s — proceeding anyway")
		}
		b.emitProvisionProgress("install:"+runtimeName, "running", "Saving actual OpenClaw gateway port…")
	}
	if runtimeName == "hermes" {
		if err := b.ensureHermesEnv(providers, hermesChannelTargets, hermesChannelCreds); err != nil {
			return errResult("Hermes installed, but environment setup failed: " + err.Error())
		}
		if err := b.ensureHermesModelConfig(providers, primaryBrain); err != nil {
			return errResult("Hermes installed, but model setup failed: " + err.Error())
		}
	}

	// Store OAuth tokens in CLI credential stores so the runtimes pick them up natively.
	// - Claude Code: Anthropic OAuth tokens → ~/.claude/.credentials.json
	// - Codex:       OpenAI OAuth tokens   → ~/.codex/auth.json
	// - Hermes/OpenClaw also benefit from Codex OAuth tokens since they can use OpenAI.
	for _, p := range providers {
		if p.AuthType != "oauth" || p.OAuthTokens == nil {
			continue
		}
		switch p.OAuthProvider {
		case "anthropic-claude":
			// Only store Anthropic OAuth for Claude Code — it's the only runtime that accepts it
			if runtimeName == "claude-code" {
				if err := writeClaudeCliOAuthTokens(b.paths.Home, p.OAuthTokens); err != nil {
					log.Printf("[onboarding] warning: failed to store Anthropic OAuth tokens: %v", err)
				}
			}
		case "openai-codex":
			// Store Codex OAuth for Codex runtime; Hermes and OpenClaw also use the API key directly
			if runtimeName == "codex" {
				if err := writeCodexCliOAuthTokens(b.paths.Home, p.OAuthTokens); err != nil {
					log.Printf("[onboarding] warning: failed to store Codex OAuth tokens: %v", err)
				}
			}
		}
	}

	ready := b.onboardingRuntimeReady(runtimeName)
	log.Printf("[onboarding] %s runtime ready check: %v", runtimeName, ready)
	if !ready {
		if runtimeName == "openclaw" && b.onboardingRuntimeAvailable(runtimeName) {
			log.Printf("[onboarding] ERROR: openclaw available but config not ready")
			return errResult("OpenClaw is installed, but the initial setup did not produce openclaw.json yet.")
		}
		log.Printf("[onboarding] ERROR: runtime not verified")
		return errResult("Install completed, but could not verify the runtime.")
	}

	detail := "Installed and configured."
	if wasInstalled {
		detail = "Already installed. Verified and updated setup."
	}
	log.Printf("[onboarding] %s install-runtime DONE — returning success", runtimeName)

	// Emit a "completed" progress event BEFORE returning the response. If the
	// dashboard's WS reconnected during the long install, it may never receive
	// the response (routed to dead old connection). But the progress event is
	// broadcast to ALL dashboard clients, so the new connection receives it.
	// The app's onProgress handler sees status="completed" and advances the step.
	b.emitProvisionProgress("install:"+runtimeName, "completed", detail)

	return okResult(map[string]interface{}{
		"success":      true,
		"wasInstalled": wasInstalled,
		"detail":       detail,
	})
}

// onboardingConfigureWorkspace saves company/provider/channel state to the connector's
// local database and creates the company folder structure on disk.
// Runs after runtimes are installed.
func (b *BridgeHandler) onboardingConfigureWorkspace(params map[string]interface{}) actionResult {
	companyName, _ := params["companyName"].(string)
	companyDescription, _ := params["companyDescription"].(string)
	companyAvatarDataUri, _ := params["companyAvatarDataUri"].(string)
	runtimeChoices := decodeStringSlice(params["runtimeChoices"])
	providerConfigs := params["providerConfigs"]
	channelConfigs, _ := decodeOnboardingChannelConfigs(params["runtimeChannelConfigs"])
	agentChannelConfigs, err := decodeOnboardingChannelConfigs(params["agentChannelConfigs"])
	if err != nil {
		return errResultStatus("invalid agent channel configs", 400)
	}
	agentChannelConfigsToApply := agentChannelConfigs
	if rawApplyConfigs, ok := params["applyAgentChannelConfigs"]; ok {
		agentChannelConfigsToApply, err = decodeOnboardingChannelConfigs(rawApplyConfigs)
		if err != nil {
			return errResultStatus("invalid channel configs to apply", 400)
		}
	}

	if err := b.saveOnboardingState(companyName, companyDescription, companyAvatarDataUri, providerConfigs, runtimeChoices, channelConfigs); err != nil {
		return errResult("Failed to save workspace state: " + err.Error())
	}

	if len(agentChannelConfigs) > 0 {
		if err := b.saveAgentChannelConfigs(agentChannelConfigs); err != nil {
			return errResult("Failed to save agent channel state: " + err.Error())
		}
	}
	if len(agentChannelConfigsToApply) > 0 {
		if err := b.applyAgentChannelConfigs(agentChannelConfigsToApply); err != nil {
			return errResult("Saved workspace state, but channel runtime update failed: " + err.Error())
		}
	}

	// Create knowledge folder: ~/.hyperclaw/knowledge/{slug}/fundamental/company.md
	if strings.TrimSpace(companyName) != "" {
		slug := onboardingSlug(companyName)
		knDir := b.paths.KnowledgeDir(slug)
		fundamentalDir := filepath.Join(knDir, "fundamental")
		if err := os.MkdirAll(fundamentalDir, 0755); err != nil {
			log.Printf("[onboarding] failed to create knowledge dir: %v", err)
		} else {
			companyMD := onboardingCompanyMD(strings.TrimSpace(companyName), strings.TrimSpace(companyDescription))
			os.WriteFile(filepath.Join(fundamentalDir, "company.md"), []byte(companyMD), 0644)
			if companyAvatarDataUri != "" {
				saveOnboardingAvatar(fundamentalDir, "company", companyAvatarDataUri)
			}
		}
	}

	return okResult(map[string]interface{}{
		"success": true,
		"detail":  "Saved company, brain, and channel defaults.",
	})
}

// onboardingCompanyMD generates the company knowledge document for the
// fundamental collection at ~/.hyperclaw/knowledge/{slug}/fundamental/company.md.
func onboardingCompanyMD(name, description string) string {
	lines := []string{"# " + name, ""}
	if description != "" {
		lines = append(lines, "## About", "", description, "")
	}
	lines = append(lines, "## Notes", "",
		"Add company-specific context here: values, product details, tone guidelines, key customers, or anything your agents should know.",
		"All agents linked to this collection will read this file.",
	)
	return strings.Join(lines, "\n") + "\n"
}

// onboardingProvisionAgent provisions a single agent (create + configure personality).
func (b *BridgeHandler) onboardingProvisionAgent(params map[string]interface{}) actionResult {
	profile := onboardingAgentProfile{}
	raw, _ := json.Marshal(params)
	json.Unmarshal(raw, &profile)

	name := strings.TrimSpace(profile.Name)
	description := strings.TrimSpace(profile.Description)
	if name == "" || description == "" {
		return errResultStatus("agent name and description are required", 400)
	}

	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		agentID = onboardingSlug(name)
	}
	emoji := ""
	if profile.EmojiEnabled {
		emoji = strings.TrimSpace(profile.Emoji)
	}
	role := strings.TrimSpace(profile.Role)
	if role == "" {
		role = onboardingRuntimeRole(profile.Runtime)
	}
	stepKey := fmt.Sprintf("agent:%s:%s", profile.Runtime, onboardingSlug(name))
	if strings.HasSuffix(stepKey, ":") {
		stepKey = fmt.Sprintf("agent:%s:%s", profile.Runtime, agentID)
	}

	// Decode channel configs for this agent's runtime
	channelConfigs, _ := decodeOnboardingChannelConfigs(params["runtimeChannelConfigs"])
	channelConfigByRuntime := make(map[string][]onboardingChannelConfig, len(channelConfigs))
	for _, config := range channelConfigs {
		channelConfigByRuntime[config.Runtime] = config.Channels
	}

	log.Printf("[onboarding-provision] agent=%q runtime=%q agentID=%q", name, profile.Runtime, agentID)

	// OpenClaw and Hermes always ship with a default "main" agent on install.
	// Never try to create it — only inject personality into the existing one.
	runtimeHasImplicitMain := profile.Runtime == "openclaw" || profile.Runtime == "hermes"

	exists := false
	if runtimeHasImplicitMain && agentID == "main" {
		// The main agent always exists by default in these runtimes.
		exists = true
		log.Printf("[onboarding-provision] main agent is implicit for %s, skipping creation", profile.Runtime)
	} else if profile.Runtime == "openclaw" {
		exists = agentExistsInConfig(b.paths, agentID)
		log.Printf("[onboarding-provision] agentExistsInConfig(%q)=%v", agentID, exists)
	} else if b.store != nil {
		if id, err := b.store.GetAgentIdentity(agentID); err == nil && id != nil && strings.TrimSpace(id.Name) != "" {
			exists = true
		}
	}
	log.Printf("[onboarding-provision] exists=%v, entering switch for runtime=%q", exists, profile.Runtime)
	applyChannelConfig := shouldApplyProvisionChannelConfig(profile.Runtime, agentID, exists)

	// Resolve company knowledge directory for the agent's config files.
	companyName, _ := params["companyName"].(string)
	var knowledgeDir string
	if slug := onboardingSlug(companyName); slug != "" {
		knowledgeDir = b.paths.KnowledgeDir(slug)
	}

	// Save avatar image to the workspace before generating IDENTITY.md.
	wsDir := onboardingWorkspaceDir(b.paths, profile.Runtime, agentID)
	avatarPath := saveOnboardingAvatar(wsDir, onboardingSlug(name), profile.AvatarDataURI)
	identityMD := onboardingIdentityMD(name, emoji, description, avatarPath)
	// Extract user profile info for USER.md
	userName, _ := params["userName"].(string)
	userEmail, _ := params["userEmail"].(string)
	userAboutMe, _ := params["userAboutMe"].(string)
	userMD := onboardingUserMD(userName, userEmail, userAboutMe)
	soulMD := onboardingSoulMD(name, role, description)

	switch profile.Runtime {
	case "openclaw":
		if !exists {
			// Only create non-main agents. Main is always implicit.
			log.Printf("[onboarding-provision] calling addAgent for %q", agentID)
			b.emitProvisionProgress(stepKey, "running", "Creating OpenClaw agent…")
			result := b.addAgent(map[string]interface{}{"agentName": agentID})
			data, _ := result.data.(map[string]interface{})
			success, _ := data["success"].(bool)
			if result.err != nil || !success {
				msg := "Could not create OpenClaw agent."
				if result.err != nil {
					msg = result.err.Error()
				} else if errText, ok := data["error"].(string); ok && errText != "" {
					msg = errText
				}
				log.Printf("[onboarding-provision] addAgent failed: %s", msg)
				return errResult(msg)
			}
		}
		log.Printf("[onboarding-provision] calling setupAgent for %q", agentID)
		b.emitProvisionProgress(stepKey, "running", "Writing OpenClaw agent identity…")
		setupResult := b.setupAgent(map[string]interface{}{
			"agentId":  agentID,
			"runtime":  "openclaw",
			"name":     name,
			"emoji":    emoji,
			"soul":     soulMD,
			"identity": identityMD,
			"user":     userMD,
			"channels": channelConfigByRuntime["openclaw"],
		})
		data, _ := setupResult.data.(map[string]interface{})
		success, _ := data["success"].(bool)
		log.Printf("[onboarding-provision] setupAgent result: err=%v success=%v data=%v", setupResult.err, success, data)
		if setupResult.err != nil || !success {
			msg := "Agent created but personality setup failed."
			if setupResult.err != nil {
				msg = setupResult.err.Error()
			} else if errText, ok := data["error"].(string); ok && errText != "" {
				msg = errText
			}
			log.Printf("[onboarding-provision] setupAgent FAILED: %s", msg)
			return errResult(msg)
		}
		if applyChannelConfig && len(channelConfigByRuntime["openclaw"]) > 0 {
			b.emitProvisionProgress(stepKey, "running", "Binding OpenClaw channels… this can take a few minutes on first run")
		}
		if applyChannelConfig {
			if err := b.ensureOpenClawAgentBindings(agentID, channelConfigByRuntime["openclaw"], stepKey); err != nil {
				return errResult("OpenClaw agent binding failed: " + err.Error())
			}
		}
		log.Printf("[onboarding-provision] openclaw setup done, proceeding to SQLite")

	case "hermes":
		adapter := NewHermesAdapter(b.paths)
		personality := AgentPersonality{
			AgentID:  agentID,
			Soul:     soulMD,
			Identity: identityMD,
			User:     userMD,
		}

		if agentID == "main" {
			// Default Hermes agent already exists at ~/.hermes/. Don't create a
			// profile or call setupAgent (which would hit the duplicate-ID check
			// against OpenClaw's "main" row). Just write personality files directly.
			b.emitProvisionProgress(stepKey, "running", "Writing Hermes agent identity…")
			if err := adapter.SetupAgent(agentID, personality); err != nil {
				return errResult("Hermes personality setup failed: " + err.Error())
			}
		} else {
			// Non-default agent: go through normal setupAgent pipeline.
			b.emitProvisionProgress(stepKey, "running", "Creating Hermes agent profile…")
			setupResult := b.setupAgent(map[string]interface{}{
				"agentId":  agentID,
				"runtime":  "hermes",
				"name":     name,
				"emoji":    emoji,
				"soul":     soulMD,
				"identity": personality.Identity,
				"user":     userMD,
				"channels": channelConfigByRuntime["hermes"],
			})
			data, _ := setupResult.data.(map[string]interface{})
			success, _ := data["success"].(bool)
			if setupResult.err != nil || !success {
				msg := "Hermes agent setup failed."
				if setupResult.err != nil {
					msg = setupResult.err.Error()
				} else if errText, ok := data["error"].(string); ok && errText != "" {
					msg = errText
				}
				return errResult(msg)
			}
		}

		// Write model config to ~/.hermes/config.yaml (main) or the profile's config.yaml.
		if profile.MainModel != "" {
			hermesModel := hermesModelSlug(profile.MainModel)
			if err := adapter.SetupAgentWithModel(agentID, personality, hermesModel); err != nil {
				log.Printf("[onboarding] hermes model config warning: %v", err)
			}
		}

		// Write channel credentials (bot tokens, chat IDs) to ~/.hermes/.env so
		// Hermes can connect to Telegram/Discord/Slack at startup. This also runs
		// during onboarding-install-runtime, but re-applying here ensures the env
		// is up to date even if only the agent is re-provisioned.
		hermesChannels := channelConfigByRuntime["hermes"]
		if applyChannelConfig && len(hermesChannels) > 0 {
			targets := map[string]string{}
			var creds []onboardingChannelConfig
			for _, hch := range hermesChannels {
				if t := strings.TrimSpace(hch.Target); t != "" {
					targets[hch.Channel] = t
				}
				if strings.TrimSpace(hch.BotToken) != "" {
					creds = append(creds, hch)
				}
			}
			// Pass nil providers — API keys are already in .env from install-runtime.
			if err := b.ensureHermesEnv(nil, targets, creds); err != nil {
				log.Printf("[onboarding] hermes channel env warning: %v", err)
			}
		}

	case "claude-code":
		// Write IDENTITY.md + USER.md + the Claude Code native CLAUDE.md via
		// `agents`. SOUL.md is left as the pristine template so the agent can
		// shape its own persona via BOOTSTRAP.md on first run. Claude Code's
		// workspace is ~/.hyperclaw/agents/claude-code-<id>/.
		b.emitProvisionProgress(stepKey, "running", "Creating Claude Code agent workspace…")
		setupResult := b.setupAgent(map[string]interface{}{
			"agentId":  agentID,
			"runtime":  "claude-code",
			"name":     name,
			"emoji":    emoji,
			"soul":     soulMD,
			"identity": identityMD,
			"user":     userMD,
			"agents":   onboardingClaudeMD(name, emoji, role, description, knowledgeDir),
		})
		if setupResult.err != nil {
			return errResult("Claude Code agent setup failed: " + setupResult.err.Error())
		}

	case "codex":
		// Same pattern as claude-code: IDENTITY.md + USER.md plus the Codex-native
		// AGENTS.md. SOUL.md stays as the pristine template.
		b.emitProvisionProgress(stepKey, "running", "Creating Codex agent workspace…")
		setupResult := b.setupAgent(map[string]interface{}{
			"agentId":  agentID,
			"runtime":  "codex",
			"name":     name,
			"emoji":    emoji,
			"soul":     soulMD,
			"identity": identityMD,
			"user":     userMD,
			"agents":   onboardingAgentsMD(name, emoji, role, description, knowledgeDir),
		})
		if setupResult.err != nil {
			return errResult("Codex agent setup failed: " + setupResult.err.Error())
		}

	default:
		return errResult("Unsupported runtime for agent provisioning: " + profile.Runtime)
	}

	log.Printf("[onboarding-provision] runtime switch complete, writing SQLite for sqliteID=%q", agentID)

	// Ensure the agent row exists in both `agents` and `agent_identity` tables.
	// setupAgent writes to agent_identity but not to agents; updateAgentConfig
	// reads from agents and silently fails when the row is missing.
	//
	// For Hermes "main", map to "__main__" in SQLite to avoid colliding with
	// OpenClaw's "main" row (the id column is the primary key).
	sqliteID := agentID
	if profile.Runtime == "hermes" && agentID == "main" {
		sqliteID = "__main__"
	}

	if b.store != nil {
		b.emitProvisionProgress(stepKey, "running", "Registering agent with the connector…")
		_ = b.store.UpsertAgent(store.SeedAgent{
			ID:      sqliteID,
			Name:    name,
			Role:    description,
			Status:  "idle",
			Runtime: profile.Runtime,
		})
	}

	// Update identity (avatar, emoji, runtime) in SQLite
	b.updateAgentIdentity(map[string]interface{}{
		"agentId":    sqliteID,
		"name":       name,
		"emoji":      emoji,
		"runtime":    profile.Runtime,
		"avatarData": profile.AvatarDataURI,
	})

	// Update agent config (main model + knowledge collections)
	agentChannels := channelConfigByRuntime[profile.Runtime]
	agentConfig := map[string]interface{}{
		"description": description,
		"role":        role,
		"runtime":     profile.Runtime,
	}
	if len(agentChannels) > 0 {
		if applyChannelConfig {
			agentConfig["channels"] = agentChannels
			agentConfig["channelConfig"] = onboardingRuntimeChannelConfig{
				Runtime:   profile.Runtime,
				AgentID:   agentID,
				AgentName: name,
				Channels:  agentChannels,
			}
		} else {
			log.Printf("[onboarding-provision] preserving existing channel config for existing agent %q", agentID)
		}
	}
	if profile.MainModel != "" {
		agentConfig["mainModel"] = profile.MainModel
	}
	// Link agent to the "fundamental" knowledge collection by default.
	if knowledgeDir != "" {
		agentConfig["knowledgeCollections"] = []string{"fundamental"}
	}
	b.updateAgentConfig(map[string]interface{}{
		"agentId": sqliteID,
		"config":  agentConfig,
	})

	// Write company context to the shared knowledge folder instead of per-agent.
	// Reads companyName from params (passed by dashboard) or falls back to
	// the saved onboarding state in KV store.
	companyDescription, _ := params["companyDescription"].(string)
	if strings.TrimSpace(companyName) == "" && b.store != nil {
		if val, err := b.store.KVGet("onboarding-company-profile"); err == nil && val != "" {
			var cp map[string]string
			if json.Unmarshal([]byte(val), &cp) == nil {
				companyName = cp["name"]
				companyDescription = cp["description"]
			}
		}
	}
	if knowledgeDir != "" && strings.TrimSpace(companyName) != "" {
		fundamentalDir := filepath.Join(knowledgeDir, "fundamental")
		_ = os.MkdirAll(fundamentalDir, 0755)
		companyMD := onboardingCompanyMD(strings.TrimSpace(companyName), strings.TrimSpace(companyDescription))
		os.WriteFile(filepath.Join(fundamentalDir, "company.md"), []byte(companyMD), 0644)
	}

	// Re-sync team mode so runtime statuses reflect the newly-provisioned agent.
	// Run async to avoid blocking the provision response.
	if b.store != nil {
		go func() { _ = SyncTeamModeBootstrap(b.store, b.paths) }()
	}

	detail := "Created and configured."
	if exists {
		detail = "Already existed. Updated personality."
	}
	b.emitProvisionProgress(stepKey, "completed", detail)
	return okResult(map[string]interface{}{
		"success": true,
		"agentId": agentID,
		"detail":  detail,
	})
}

// --- Legacy monolithic onboarding action (kept for backwards compatibility) ---

func (b *BridgeHandler) onboardingProvisionWorkspace(params map[string]interface{}) actionResult {
	runtimeChoices := decodeStringSlice(params["runtimeChoices"])
	profiles, err := decodeOnboardingProfiles(params["agentProfiles"])
	if err != nil {
		return errResultStatus("invalid agent profiles", 400)
	}
	channelConfigs, err := decodeOnboardingChannelConfigs(params["runtimeChannelConfigs"])
	if err != nil {
		return errResultStatus("invalid runtime channel configs", 400)
	}
	companyName, _ := params["companyName"].(string)
	companyDescription, _ := params["companyDescription"].(string)
	companyAvatarDataUri, _ := params["companyAvatarDataUri"].(string)
	providerConfigs := params["providerConfigs"]
	providers := decodeProviderConfigs(providerConfigs)

	// Decode explicit primary brain selection.
	var primaryBrain *onboardingPrimaryBrain
	if pb, ok := params["primaryBrain"].(map[string]interface{}); ok {
		pid, _ := pb["providerId"].(string)
		model, _ := pb["model"].(string)
		if pid != "" && model != "" {
			primaryBrain = &onboardingPrimaryBrain{ProviderID: pid, Model: model}
		}
	}

	// Decode memory search config.
	var memorySearch *onboardingMemorySearch
	if ms, ok := params["memorySearch"].(map[string]interface{}); ok {
		enabled, _ := ms["enabled"].(bool)
		provider, _ := ms["provider"].(string)
		apiKey, _ := ms["apiKey"].(string)
		if enabled && provider != "" {
			memorySearch = &onboardingMemorySearch{Enabled: true, Provider: provider, APIKey: apiKey}
		}
	}

	// Build per-runtime channel target maps and credential lists.
	hermesChannelTargets := map[string]string{}
	var openclawChannelCreds []onboardingChannelConfig
	var hermesChannelCreds []onboardingChannelConfig
	for _, rcc := range channelConfigs {
		for _, ch := range rcc.Channels {
			if rcc.Runtime == "hermes" {
				if strings.TrimSpace(ch.Target) != "" {
					hermesChannelTargets[ch.Channel] = strings.TrimSpace(ch.Target)
				}
				if strings.TrimSpace(ch.BotToken) != "" {
					hermesChannelCreds = append(hermesChannelCreds, ch)
				}
			}
			if rcc.Runtime == "openclaw" && strings.TrimSpace(ch.BotToken) != "" {
				openclawChannelCreds = append(openclawChannelCreds, ch)
			}
		}
	}

	steps := make([]onboardingStepResult, 0, len(runtimeChoices)+len(profiles)+2)
	progress := func(key, status, detail string) {
		b.emitProvisionProgress(key, status, detail)
	}
	fail := func(key, detail string) actionResult {
		steps = append(steps, onboardingStepResult{Key: key, Status: "failed", Detail: detail})
		progress(key, "failed", detail)
		return okResult(map[string]interface{}{
			"success": false,
			"error":   detail,
			"steps":   steps,
		})
	}

	for _, runtimeName := range runtimeChoices {
		key := "install:" + runtimeName
		wasInstalled := b.onboardingRuntimeAvailable(runtimeName)
		if !wasInstalled {
			progress(key, "running", "Downloading and installing "+runtimeName+"\u2026 this may take a few minutes")
			command := onboardingInstallCommand(runtimeName)
			if command == "" {
				return fail(key, "Unsupported runtime: "+runtimeName)
			}
			if err := runOnboardingCommand(b.paths, command); err != nil {
				return fail(key, err.Error())
			}
			progress(key, "running", "Install finished, configuring "+runtimeName+"\u2026")
		} else {
			progress(key, "running", runtimeName+" already installed, verifying setup\u2026")
		}
		if runtimeName == "openclaw" {
			progress(key, "running", "Running OpenClaw initial setup\u2026")
			if err := b.ensureOpenClawDefaults(providers, primaryBrain, memorySearch); err != nil {
				return fail(key, "OpenClaw installed, but the default setup did not finish: "+err.Error())
			}
			progress(key, "running", "Configuring OpenClaw channels\u2026")
			if err := b.ensureOpenClawChannels(openclawChannelCreds); err != nil {
				// Non-fatal — channels can be configured later.
				log.Printf("[onboarding] channel setup failed (non-fatal): %v", err)
			}
			// Install and start the gateway daemon so OpenClaw is actually reachable.
			// Mirrors what the granular path does in onboardingProvisionOpenClaw.
			// Block on gateway health so we never report success for a half-started install.
			if err := b.ensureOpenClawGateway(); err != nil {
				return fail(key, "OpenClaw installed, but the gateway did not come up: "+err.Error())
			}
		}
		if runtimeName == "hermes" {
			progress(key, "running", "Configuring Hermes environment\u2026")
			if err := b.ensureHermesEnv(providers, hermesChannelTargets, hermesChannelCreds); err != nil {
				return fail(key, "Hermes installed, but environment setup did not finish: "+err.Error())
			}
			if err := b.ensureHermesModelConfig(providers, primaryBrain); err != nil {
				return fail(key, "Hermes installed, but model setup did not finish: "+err.Error())
			}
		}
		progress(key, "running", "Verifying "+runtimeName+" is ready\u2026")
		if !b.onboardingRuntimeReady(runtimeName) {
			if runtimeName == "openclaw" && b.onboardingRuntimeAvailable(runtimeName) {
				return fail(key, "OpenClaw is installed, but the initial setup did not produce openclaw.json yet.")
			}
			return fail(key, "Install completed, but Hyperclaw could not verify the runtime yet.")
		}
		detail := "Installed through the connector."
		if wasInstalled {
			detail = "Already installed. Hyperclaw verified and updated its setup."
		}
		progress(key, "completed", detail)
		steps = append(steps, onboardingStepResult{Key: key, Status: "completed", Detail: detail})
	}

	missing := []string{}
	for _, runtimeName := range runtimeChoices {
		if !b.onboardingRuntimeReady(runtimeName) {
			missing = append(missing, runtimeName)
		}
	}
	if len(missing) > 0 {
		return fail("runtime-verify", "Missing runtimes: "+strings.Join(missing, ", "))
	}
	progress("runtime-verify", "completed", "Connector verified the selected runtimes.")
	steps = append(steps, onboardingStepResult{Key: "runtime-verify", Status: "completed", Detail: "Connector verified the selected runtimes."})

	progress("workspace-state", "running", "Saving workspace setup\u2026")
	if err := b.saveOnboardingState(companyName, companyDescription, companyAvatarDataUri, providerConfigs, runtimeChoices, channelConfigs); err != nil {
		return fail("workspace-state", "Failed to save workspace state: "+err.Error())
	}
	progress("workspace-state", "completed", "Saved company, brain, and channel defaults.")
	steps = append(steps, onboardingStepResult{Key: "workspace-state", Status: "completed", Detail: "Saved company, brain, and channel defaults."})

	channelConfigByRuntime := make(map[string][]onboardingChannelConfig, len(channelConfigs))
	for _, config := range channelConfigs {
		channelConfigByRuntime[config.Runtime] = config.Channels
	}

	var knowledgeDir string
	if slug := onboardingSlug(companyName); slug != "" {
		knowledgeDir = b.paths.KnowledgeDir(slug)
	}

	usedAgentIDs := map[string]bool{}
	runtimeMainClaimed := map[string]bool{}
	for _, profile := range profiles {
		name := strings.TrimSpace(profile.Name)
		description := strings.TrimSpace(profile.Description)
		if name == "" || description == "" {
			continue
		}

		// OpenClaw and Hermes both create a default "main" agent on install.
		// The first onboarding agent for each runtime edits that default
		// instead of creating a second one.
		var agentID string
		runtimeHasDefault := profile.Runtime == "openclaw" || profile.Runtime == "hermes"
		if runtimeHasDefault && !runtimeMainClaimed[profile.Runtime] {
			agentID = "main"
			runtimeMainClaimed[profile.Runtime] = true
		} else {
			baseID := onboardingSlug(name)
			agentID = baseID
			if usedAgentIDs[agentID] {
				agentID = baseID + "-" + onboardingSlug(profile.Runtime)
			}
			suffix := 2
			for usedAgentIDs[agentID] {
				agentID = fmt.Sprintf("%s-%d", baseID, suffix)
				suffix++
			}
		}
		usedAgentIDs[agentID] = true

		stepKey := fmt.Sprintf("agent:%s:%s", profile.Runtime, onboardingSlug(profile.Name))
		emoji := ""
		if profile.EmojiEnabled {
			emoji = strings.TrimSpace(profile.Emoji)
		}
		role := strings.TrimSpace(profile.Role)
		if role == "" {
			role = onboardingRuntimeRole(profile.Runtime)
		}

		runtimeHasImplicitMain := profile.Runtime == "openclaw" || profile.Runtime == "hermes"
		exists := false
		if runtimeHasImplicitMain && agentID == "main" {
			exists = true
		} else if profile.Runtime == "openclaw" {
			exists = agentExistsInConfig(b.paths, agentID)
		} else if b.store != nil {
			if id, err := b.store.GetAgentIdentity(agentID); err == nil && id != nil && strings.TrimSpace(id.Name) != "" {
				exists = true
			}
		}
		applyChannelConfig := shouldApplyProvisionChannelConfig(profile.Runtime, agentID, exists)

		bulkWsDir := onboardingWorkspaceDir(b.paths, profile.Runtime, agentID)
		bulkAvatarPath := saveOnboardingAvatar(bulkWsDir, onboardingSlug(name), profile.AvatarDataURI)
		bulkIdentityMD := onboardingIdentityMD(name, emoji, description, bulkAvatarPath)
		// Legacy bulk onboarding does not collect the operator profile fields
		// that granular onboarding passes, but the file should still exist so
		// the runtime starts with the same personality surface.
		bulkUserMD := onboardingUserMD("", "", "")
		bulkSoulMD := onboardingSoulMD(name, role, description)

		switch profile.Runtime {
		case "openclaw":
			if !exists {
				result := b.addAgent(map[string]interface{}{"agentName": agentID})
				data, _ := result.data.(map[string]interface{})
				success, _ := data["success"].(bool)
				if result.err != nil || !success {
					msg := "Could not create OpenClaw agent."
					if result.err != nil {
						msg = result.err.Error()
					} else if errText, ok := data["error"].(string); ok && errText != "" {
						msg = errText
					}
					return fail(stepKey, msg)
				}
			}
			setupResult := b.setupAgent(map[string]interface{}{
				"agentId":  agentID,
				"runtime":  "openclaw",
				"name":     name,
				"emoji":    emoji,
				"soul":     bulkSoulMD,
				"identity": bulkIdentityMD,
				"user":     bulkUserMD,
			})
			if setupResult.err != nil {
				return fail(stepKey, setupResult.err.Error())
			}
			if applyChannelConfig && len(channelConfigByRuntime["openclaw"]) > 0 {
				progress(stepKey, "running", "Binding OpenClaw channels… this can take a few minutes on first run")
			}
			if applyChannelConfig {
				if err := b.ensureOpenClawAgentBindings(agentID, channelConfigByRuntime["openclaw"], stepKey); err != nil {
					return fail(stepKey, "OpenClaw agent binding failed: "+err.Error())
				}
			}
		case "hermes":
			hermesAdapter := NewHermesAdapter(b.paths)
			hermesPers := AgentPersonality{
				AgentID:  agentID,
				Soul:     bulkSoulMD,
				Identity: bulkIdentityMD,
				User:     bulkUserMD,
			}
			if agentID == "main" {
				// Default agent: write directly to ~/.hermes/, skip setupAgent.
				if err := hermesAdapter.SetupAgent(agentID, hermesPers); err != nil {
					return fail(stepKey, "Hermes personality setup failed: "+err.Error())
				}
			} else {
				setupResult := b.setupAgent(map[string]interface{}{
					"agentId":  agentID,
					"runtime":  "hermes",
					"name":     name,
					"emoji":    emoji,
					"soul":     bulkSoulMD,
					"identity": hermesPers.Identity,
					"user":     bulkUserMD,
					"channels": hermesChannelCreds,
				})
				if setupResult.err != nil {
					return fail(stepKey, setupResult.err.Error())
				}
			}
			// Write model config if provided.
			if profile.MainModel != "" {
				hermesModel := hermesModelSlug(profile.MainModel)
				if err := hermesAdapter.SetupAgentWithModel(agentID, hermesPers, hermesModel); err != nil {
					log.Printf("[onboarding] hermes model config warning: %v", err)
				}
			}
		case "claude-code":
			setupResult := b.setupAgent(map[string]interface{}{
				"agentId":  agentID,
				"runtime":  "claude-code",
				"name":     name,
				"emoji":    emoji,
				"soul":     bulkSoulMD,
				"identity": bulkIdentityMD,
				"user":     bulkUserMD,
				"agents":   onboardingClaudeMD(name, emoji, role, description, knowledgeDir),
			})
			if setupResult.err != nil {
				return fail(stepKey, setupResult.err.Error())
			}
		case "codex":
			setupResult := b.setupAgent(map[string]interface{}{
				"agentId":  agentID,
				"runtime":  "codex",
				"name":     name,
				"emoji":    emoji,
				"soul":     bulkSoulMD,
				"identity": bulkIdentityMD,
				"user":     bulkUserMD,
				"agents":   onboardingAgentsMD(name, emoji, role, description, knowledgeDir),
			})
			if setupResult.err != nil {
				return fail(stepKey, setupResult.err.Error())
			}
		default:
			return fail(stepKey, "Unsupported runtime for agent provisioning: "+profile.Runtime)
		}

		// Map Hermes "main" to "__main__" in SQLite to avoid PK collision with OpenClaw's "main".
		bulkSQLiteID := agentID
		if profile.Runtime == "hermes" && agentID == "main" {
			bulkSQLiteID = "__main__"
		}

		// Ensure the agent row exists in the agents table so updateAgentConfig works.
		if b.store != nil {
			_ = b.store.UpsertAgent(store.SeedAgent{
				ID:      bulkSQLiteID,
				Name:    name,
				Role:    description,
				Status:  "idle",
				Runtime: profile.Runtime,
			})
		}

		idResult := b.updateAgentIdentity(map[string]interface{}{
			"agentId":    bulkSQLiteID,
			"name":       name,
			"emoji":      emoji,
			"runtime":    profile.Runtime,
			"avatarData": profile.AvatarDataURI,
		})
		if idResult.err != nil {
			return fail(stepKey, idResult.err.Error())
		}

		bulkAgentConfig := map[string]interface{}{
			"description":        description,
			"role":               role,
			"companyName":        strings.TrimSpace(companyName),
			"companyDescription": strings.TrimSpace(companyDescription),
			"runtime":            profile.Runtime,
			"mainModel":          profile.MainModel,
			"providers":          providerConfigs,
		}
		if agentChannels := channelConfigByRuntime[profile.Runtime]; len(agentChannels) > 0 {
			if applyChannelConfig {
				bulkAgentConfig["channels"] = agentChannels
				bulkAgentConfig["channelConfig"] = onboardingRuntimeChannelConfig{
					Runtime:   profile.Runtime,
					AgentID:   agentID,
					AgentName: name,
					Channels:  agentChannels,
				}
			} else {
				log.Printf("[onboarding-provision] preserving existing channel config for existing agent %q", agentID)
			}
		}
		if knowledgeDir != "" {
			bulkAgentConfig["knowledgeCollections"] = []string{"fundamental"}
		}
		cfgResult := b.updateAgentConfig(map[string]interface{}{
			"agentId": bulkSQLiteID,
			"config":  bulkAgentConfig,
		})
		if cfgResult.err != nil {
			return fail(stepKey, cfgResult.err.Error())
		}

		detail := "Provisioned " + profile.Runtime + " agent."
		if exists {
			detail = "Updated " + profile.Runtime + " agent."
		}
		steps = append(steps, onboardingStepResult{Key: stepKey, Status: "completed", Detail: detail})
	}

	// Write company context to the shared knowledge folder.
	if strings.TrimSpace(companyName) != "" && knowledgeDir != "" {
		fundamentalDir := filepath.Join(knowledgeDir, "fundamental")
		os.MkdirAll(fundamentalDir, 0755)
		companyMD := onboardingCompanyMD(strings.TrimSpace(companyName), strings.TrimSpace(companyDescription))
		os.WriteFile(filepath.Join(fundamentalDir, "company.md"), []byte(companyMD), 0644)
		if companyAvatarDataUri != "" {
			saveOnboardingAvatar(fundamentalDir, "company", companyAvatarDataUri)
		}
	}

	// Re-sync team mode after bulk provisioning so runtime statuses are fresh.
	if b.store != nil {
		go func() { _ = SyncTeamModeBootstrap(b.store, b.paths) }()
	}

	return okResult(map[string]interface{}{
		"success": true,
		"steps":   steps,
	})
}
