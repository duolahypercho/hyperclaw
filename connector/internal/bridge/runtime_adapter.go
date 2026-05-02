package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// RuntimeType identifies which AI runtime to use.
type RuntimeType string

const (
	RuntimeOpenClaw RuntimeType = "openclaw"
	RuntimeHermes   RuntimeType = "hermes"
	RuntimeClaude   RuntimeType = "claude-code"
	RuntimeCodex    RuntimeType = "codex"
)

// AgentRunResult holds the result of running a task through a runtime.
type AgentRunResult struct {
	Success   bool   `json:"success"`
	Content   string `json:"content,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	Error     string `json:"error,omitempty"`
	Runtime   string `json:"runtime"`
	Mode      string `json:"mode,omitempty"` // "api", "cli", "gateway"
}

// RuntimeAdapter defines the interface for running agent tasks through different runtimes.
type RuntimeAdapter interface {
	// SetupAgent ensures the agent exists in the runtime with the given personality.
	SetupAgent(agentId string, personality AgentPersonality) error
	// RunTask executes a task as the specified agent and returns the result.
	RunTask(agentId string, task string, personality AgentPersonality) AgentRunResult
	// Available returns true if the runtime is installed and reachable.
	Available() bool
	// Name returns the runtime identifier.
	Name() RuntimeType
}

// SessionAwareAdapter is an OPTIONAL extension. Adapters that implement
// it can resume an existing conversation thread instead of always starting
// fresh — required for agent-to-agent (A2A) messaging to carry history
// across calls. Adapters that don't implement it transparently fall back
// to RunTask (fresh session every call).
//
// priorSessionRef semantics:
//   - empty string → start a new session; return the new session id in AgentRunResult.SessionID
//   - non-empty    → attempt to resume; if the runtime can't (deleted /
//     never existed), start a new session and return the new id. Callers
//     persist whatever id comes back and pass it on the next call.
//
// "Best effort, return what was actually used" means callers don't need to
// distinguish "first call" from "resumed" — just round-trip the returned id.
type SessionAwareAdapter interface {
	RunTaskInSession(agentId string, task string, personality AgentPersonality, priorSessionRef string) AgentRunResult
}

// ─── OpenClaw Adapter ──────────────────────────────────────────────────────────

type OpenClawAdapter struct {
	paths Paths
}

func NewOpenClawAdapter(paths Paths) *OpenClawAdapter {
	return &OpenClawAdapter{paths: paths}
}

func (a *OpenClawAdapter) Name() RuntimeType { return RuntimeOpenClaw }

func (a *OpenClawAdapter) Available() bool {
	// Check PATH first
	if _, err := exec.LookPath("openclaw"); err == nil {
		return true
	}
	// Check common installation locations
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "Library/pnpm/openclaw"),
		filepath.Join(home, ".local/share/pnpm/openclaw"),
		filepath.Join(home, ".local/bin/openclaw"),
		filepath.Join(home, ".npm-global/bin/openclaw"),
		"/opt/homebrew/bin/openclaw",
		"/usr/local/bin/openclaw",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}

func (a *OpenClawAdapter) SetupAgent(agentId string, personality AgentPersonality) error {
	// Caller asked explicitly for the OpenClaw runtime; if it isn't usable we
	// must surface that, not silently return success — otherwise the agent
	// gets recorded in SQLite but never reaches openclaw.json, and the next
	// chat fails with "Agent X no longer exists in configuration".
	if !a.Available() {
		return fmt.Errorf("openclaw runtime requested but the `openclaw` binary is not installed; install it (e.g. `npm i -g openclaw`) and retry")
	}
	configPath := filepath.Join(a.paths.OpenClaw, "openclaw.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return fmt.Errorf("openclaw runtime requested but %s is missing; run `openclaw onboard` to initialize", configPath)
	}

	// OpenClaw workspace lives under ~/.hyperclaw/agents/openclaw-{id}/ (set via
	// --workspace during onboarding). Fall back to the legacy ~/.openclaw/workspace/
	// path if the new directory doesn't exist yet.
	workspaceDir, err := a.paths.SafeAgentDir("openclaw", agentId)
	if err != nil {
		return err
	}
	if _, err := os.Stat(workspaceDir); os.IsNotExist(err) {
		// Legacy fallback
		if agentId == "main" {
			workspaceDir = filepath.Join(a.paths.OpenClaw, "workspace")
		} else {
			workspaceDir = filepath.Join(a.paths.OpenClaw, "workspace-"+agentId)
		}
	}

	// For the main agent, inject personality into existing workspace files
	// instead of overwriting them. OpenClaw ships SOUL.md, IDENTITY.md, USER.md,
	// BOOTSTRAP.md, etc. that we want to preserve.
	if agentId == "main" {
		return InjectPersonalityIntoExisting(workspaceDir, personality)
	}
	// Non-main agents: seed baseline files from the main workspace first.
	SeedBaselineFiles(a.paths, workspaceDir)
	if err := SaveAgentPersonality(workspaceDir, personality); err != nil {
		return err
	}

	// Register the agent in openclaw.json so OpenClaw's session resolver can
	// find it. Without this step the workspace exists on disk but talking to
	// the agent fails with "Agent X no longer exists in configuration".
	// Idempotent: skip if already registered (re-runs of setup-agent are safe).
	return registerOpenClawAgent(a.paths, agentId, workspaceDir)
}

// registerOpenClawAgent ensures agentId is present in openclaw.json's
// agents.list. Uses `openclaw agents add` so OpenClaw owns its own schema —
// patching the JSON directly would drift if OpenClaw adds required fields
// in a future release. Idempotent.
func registerOpenClawAgent(paths Paths, agentId, workspaceDir string) error {
	if agentExistsInConfig(paths, agentId) {
		return nil
	}
	stdout, stderr, err := runOpenClaw(context.Background(), paths, []string{
		"agents", "add", agentId, "--workspace", workspaceDir, "--non-interactive",
	}, openClawAgentAddTimeoutMs)
	if err != nil {
		// `openclaw agents add` sometimes exits non-zero even when the write
		// succeeded. Verify by re-reading the config — the file is the source
		// of truth, not the exit code.
		if agentExistsInConfig(paths, agentId) {
			log.Printf("[openclaw-adapter] agents add %q exit nonzero but config now contains the agent; treating as success (stderr=%q)", agentId, strings.TrimSpace(stderr))
			return nil
		}
		msg := strings.TrimSpace(stderr)
		if msg == "" {
			msg = strings.TrimSpace(stdout)
		}
		if msg == "" {
			msg = err.Error()
		}
		// OpenClaw refuses every config-mutating command when openclaw.json
		// fails schema validation (e.g. a stale channel/plugin entry from an
		// earlier release). The CLI's own error already names the offending
		// keys, so we just append the recovery action so the dashboard /
		// MCP caller sees a complete instruction in one place.
		if strings.Contains(msg, "Config invalid") || strings.Contains(strings.ToLower(msg), "openclaw doctor") {
			return fmt.Errorf("openclaw agents add %q failed because openclaw.json is invalid: %s\n\nRecovery: run `openclaw doctor --fix` (or edit ~/.openclaw/openclaw.json to remove the offending entry), then retry creating the agent", agentId, msg)
		}
		return fmt.Errorf("openclaw agents add %q failed: %s", agentId, msg)
	}
	if !agentExistsInConfig(paths, agentId) {
		return fmt.Errorf("openclaw agents add %q reported success but agent is not in openclaw.json", agentId)
	}
	return nil
}

func (a *OpenClawAdapter) RunTask(agentId string, task string, personality AgentPersonality) AgentRunResult {
	return a.runTaskInternal(agentId, task, personality, "")
}

// RunTaskInSession is the SessionAwareAdapter implementation. OpenClaw's
// gateway treats sessionKey as a stable conversation identifier — same key
// across calls = continued conversation with full history. We pass the
// caller's priorSessionRef as the gateway sessionKey verbatim, so callers
// can use any deterministic key (e.g. "a2a:luffy:nami") and OpenClaw
// will keep the conversation threaded.
func (a *OpenClawAdapter) RunTaskInSession(agentId string, task string, personality AgentPersonality, priorSessionRef string) AgentRunResult {
	return a.runTaskInternal(agentId, task, personality, priorSessionRef)
}

func (a *OpenClawAdapter) runTaskInternal(agentId string, task string, personality AgentPersonality, priorSessionRef string) AgentRunResult {
	// OpenClaw: use gateway sessions_spawn if gateway is available,
	// otherwise fall back to CLI.
	gwURL := "http://127.0.0.1:18789"
	if url := os.Getenv("OPENCLAW_GATEWAY_URL"); url != "" {
		gwURL = url
	}

	// Empty priorSessionRef → fresh per-invocation session (legacy RunTask
	// behaviour). Non-empty → use it directly so the gateway threads
	// subsequent calls into the same conversation.
	sessionKey := priorSessionRef
	if sessionKey == "" {
		sessionKey = fmt.Sprintf("agent:%s:hyperclaw-%d", agentId, time.Now().UnixMilli())
	}

	// Try gateway first
	body := map[string]interface{}{
		"method": "agent",
		"params": map[string]interface{}{
			"message":    task,
			"sessionKey": sessionKey,
			"agentId":    agentId,
		},
	}
	payload, _ := json.Marshal(body)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", gwURL+"/rpc", bytes.NewReader(payload))
	if err == nil {
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{}
		resp, err := client.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == 200 {
				var result map[string]interface{}
				if json.NewDecoder(resp.Body).Decode(&result) == nil {
					content := ""
					if r, ok := result["result"].(map[string]interface{}); ok {
						content, _ = r["content"].(string)
					}
					return AgentRunResult{
						Success:   true,
						Content:   content,
						SessionID: sessionKey,
						Runtime:   string(RuntimeOpenClaw),
						Mode:      "gateway",
					}
				}
			}
		}
	}

	// Fallback: CLI
	bin := findOpenClawBinary()
	if bin == "openclaw" {
		// findOpenClawBinary returns "openclaw" if not found — double-check
		if _, err := exec.LookPath(bin); err != nil {
			return AgentRunResult{
				Success: false,
				Error:   "openclaw binary not found",
				Runtime: string(RuntimeOpenClaw),
			}
		}
	}

	cmd := exec.CommandContext(ctx, bin, "chat", "--agent", agentId, "--message", task)
	out, err := cmd.Output()
	if err != nil {
		stderr := ""
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
		}
		return AgentRunResult{
			Success: false,
			Error:   fmt.Sprintf("openclaw error: %v — %s", err, stderr),
			Runtime: string(RuntimeOpenClaw),
			Mode:    "cli",
		}
	}

	return AgentRunResult{
		Success: true,
		Content: strings.TrimSpace(string(out)),
		Runtime: string(RuntimeOpenClaw),
		Mode:    "cli",
	}
}

// ─── Hermes Adapter ────────────────────────────────────────────────────────────

type HermesAdapter struct {
	paths Paths
}

func NewHermesAdapter(paths Paths) *HermesAdapter {
	return &HermesAdapter{paths: paths}
}

func (a *HermesAdapter) Name() RuntimeType { return RuntimeHermes }

func (a *HermesAdapter) Available() bool {
	return findHermesBinary() != ""
}

func (a *HermesAdapter) SetupAgent(agentId string, personality AgentPersonality) error {
	// Don't create profile files if Hermes isn't installed.
	if !a.Available() {
		return nil
	}

	profileDir := a.profileDir(agentId)

	// For the default agent, inject personality into existing files instead of
	// overwriting them. Hermes ships with a SOUL.md template at ~/.hermes/ that
	// we want to preserve.
	if isHermesMainAgent(agentId) {
		if err := InjectPersonalityIntoExisting(profileDir, personality); err != nil {
			return fmt.Errorf("failed to inject personality into hermes home: %w", err)
		}
	} else {
		// Non-main: seed baseline files then write personality.
		SeedBaselineFiles(a.paths, profileDir)
		if err := SaveAgentPersonality(profileDir, personality); err != nil {
			return fmt.Errorf("failed to save personality to hermes profile: %w", err)
		}
	}

	// Copy .env from the default Hermes home so profile has its own API keys.
	defaultEnv := filepath.Join(a.paths.Home, ".hermes", ".env")
	profileEnv := filepath.Join(profileDir, ".env")
	if _, err := os.Stat(defaultEnv); err == nil {
		if _, err := os.Stat(profileEnv); os.IsNotExist(err) {
			if data, err := os.ReadFile(defaultEnv); err == nil {
				_ = os.WriteFile(profileEnv, data, 0600)
			}
		}
	}

	// Copy base config.yaml if it doesn't exist, then overlay model if provided.
	defaultConfig := filepath.Join(a.paths.Home, ".hermes", "config.yaml")
	profileConfig := filepath.Join(profileDir, "config.yaml")
	if _, err := os.Stat(profileConfig); os.IsNotExist(err) {
		if data, err := os.ReadFile(defaultConfig); err == nil {
			_ = os.WriteFile(profileConfig, data, 0600)
		}
	}

	return nil
}

// SetupAgentWithModel configures a Hermes profile with a specific model.
// model is in "provider/model-name" format (e.g. "anthropic/claude-sonnet-4").
// Persists the model choice even when the Hermes binary isn't installed yet —
// the config will be picked up on first launch after install.
func (a *HermesAdapter) SetupAgentWithModel(agentId string, personality AgentPersonality, model string) error {
	if err := a.SetupAgent(agentId, personality); err != nil {
		return err
	}
	if model == "" {
		return nil
	}

	profileDir := a.profileDir(agentId)
	// Ensure the profile dir exists — SetupAgent skips mkdir when Hermes isn't installed,
	// but we still want to persist the onboarding model choice.
	if err := os.MkdirAll(profileDir, 0700); err != nil {
		return fmt.Errorf("failed to create hermes profile dir: %w", err)
	}
	profileConfig := filepath.Join(profileDir, "config.yaml")

	// Read existing config or start fresh
	content := ""
	if data, err := os.ReadFile(profileConfig); err == nil {
		content = string(data)
	}

	cfg, ok := hermesModelConfigFromSlug(model, content)
	if !ok {
		return nil
	}
	return writeHermesModelConfigFile(profileConfig, cfg)
}

func (a *HermesAdapter) RunTask(agentId string, task string, personality AgentPersonality) AgentRunResult {
	// Strategy 1: Use Hermes HTTP API with system message (if API is available)
	if hermesAPIAvailable() {
		return a.runViaAPI(agentId, task, personality)
	}

	// Strategy 2: Use CLI with HERMES_HOME pointing to profile directory
	return a.runViaCLI(agentId, task)
}

func (a *HermesAdapter) runViaAPI(agentId string, task string, personality AgentPersonality) AgentRunResult {
	systemPrompt := personality.BuildSystemPrompt("hermes")

	messages := []map[string]interface{}{}
	if systemPrompt != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": systemPrompt,
		})
	}
	messages = append(messages, map[string]interface{}{
		"role":    "user",
		"content": task,
	})

	body := map[string]interface{}{
		"model":    "hermes-agent",
		"messages": messages,
		"stream":   false,
	}

	payload, _ := json.Marshal(body)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", hermesAPIURL()+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return AgentRunResult{
			Success: false,
			Error:   fmt.Sprintf("failed to create request: %v", err),
			Runtime: string(RuntimeHermes),
		}
	}
	req.Header.Set("Content-Type", "application/json")
	addHermesAPIAuth(req)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		log.Printf("[hermes-adapter] API request failed, falling back to CLI: %v", err)
		return a.runViaCLI(agentId, task)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return AgentRunResult{
			Success: false,
			Error:   fmt.Sprintf("hermes API returned %d: %s", resp.StatusCode, string(bodyBytes)),
			Runtime: string(RuntimeHermes),
			Mode:    "api",
		}
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return AgentRunResult{
			Success: false,
			Error:   fmt.Sprintf("failed to parse response: %v", err),
			Runtime: string(RuntimeHermes),
			Mode:    "api",
		}
	}

	content := extractChatCompletionContent(result)
	return AgentRunResult{
		Success: true,
		Content: content,
		Runtime: string(RuntimeHermes),
		Mode:    "api",
	}
}

func (a *HermesAdapter) runViaCLI(agentId string, task string) AgentRunResult {
	bin := findHermesBinary()
	if bin == "" {
		return AgentRunResult{
			Success: false,
			Error:   "hermes binary not found",
			Runtime: string(RuntimeHermes),
		}
	}

	profileDir := a.profileDir(agentId)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	args := []string{"chat", "-q", task, "-Q"}

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = append(os.Environ(),
		"PYTHONUNBUFFERED=1",
		"HERMES_HOME="+profileDir,
	)
	cmd.Dir = a.paths.Home

	out, err := cmd.Output()
	if err != nil {
		stderr := ""
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
		}
		return AgentRunResult{
			Success: false,
			Error:   fmt.Sprintf("hermes error: %v — %s", err, stderr),
			Runtime: string(RuntimeHermes),
			Mode:    "cli",
		}
	}

	return AgentRunResult{
		Success: true,
		Content: strings.TrimSpace(string(out)),
		Runtime: string(RuntimeHermes),
		Mode:    "cli",
	}
}

func (a *HermesAdapter) profileDir(agentId string) string {
	// "__main__" is the default Hermes agent whose SOUL.md lives at ~/.hermes/
	// (the root home), not in a sub-profile directory.
	if isHermesMainAgent(agentId) {
		return filepath.Join(a.paths.Home, ".hermes")
	}
	return filepath.Join(a.paths.Home, ".hermes", "profiles", agentId)
}

// ─── Claude Code Adapter ───────────────────────────────────────────────────────

type ClaudeCodeAdapter struct {
	paths Paths
}

func NewClaudeCodeAdapter(paths Paths) *ClaudeCodeAdapter {
	return &ClaudeCodeAdapter{paths: paths}
}

func (a *ClaudeCodeAdapter) Name() RuntimeType { return RuntimeClaude }

func (a *ClaudeCodeAdapter) Available() bool {
	return findClaudeBinary() != ""
}

func (a *ClaudeCodeAdapter) SetupAgent(agentId string, personality AgentPersonality) error {
	// Claude Code doesn't have persistent agent profiles.
	// We save the personality to ~/.hyperclaw/agents/claude-code-{id}/ for later use,
	// and seed baseline workspace files (USER.md, BOOTSTRAP.md, etc.) from
	// the OpenClaw main workspace so every agent starts with the same kit.
	agentDir, err := a.paths.SafeAgentDir(string(RuntimeClaude), agentId)
	if err != nil {
		return err
	}
	SeedBaselineFiles(a.paths, agentDir)
	return SaveAgentPersonality(agentDir, personality)
}

func (a *ClaudeCodeAdapter) RunTask(agentId string, task string, personality AgentPersonality) AgentRunResult {
	return a.runTaskInternal(agentId, task, personality, "")
}

// RunTaskInSession is the SessionAwareAdapter implementation. Claude Code
// stores conversations on disk indexed by UUID and resumes them via
// `--resume <session-id>`. The caller passes whatever id was returned from
// the previous call (or empty for the first call); we pass it as --resume
// when present and capture the actual session_id Claude returns so the
// caller can thread it forward.
//
// Claude generates a new id on the first call, so the FIRST call cannot
// pre-pick the id. The caller's priorSessionRef is empty on call 1, then
// the id we return; from call 2 onward the conversation continues.
func (a *ClaudeCodeAdapter) RunTaskInSession(agentId string, task string, personality AgentPersonality, priorSessionRef string) AgentRunResult {
	return a.runTaskInternal(agentId, task, personality, priorSessionRef)
}

func (a *ClaudeCodeAdapter) runTaskInternal(agentId string, task string, personality AgentPersonality, priorSessionRef string) AgentRunResult {
	bin := findClaudeBinary()
	if bin == "" {
		return AgentRunResult{
			Success: false,
			Error:   "claude CLI not found",
			Runtime: string(RuntimeClaude),
		}
	}

	// Build the system prompt and write to a temp file for --append-system-prompt-file
	systemPrompt := personality.BuildSystemPrompt("claude-code")

	args := []string{"-p", task, "--output-format", "json"}
	if priorSessionRef != "" {
		args = append(args, "--resume", priorSessionRef)
	}

	if systemPrompt != "" {
		tmpFile, err := os.CreateTemp("", "hyperclaw-agent-*.md")
		if err == nil {
			tmpFile.WriteString(systemPrompt)
			tmpFile.Close()
			defer os.Remove(tmpFile.Name())
			args = append(args, "--append-system-prompt-file", tmpFile.Name())
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = claudeEnv()
	cmd.Dir = a.paths.Home

	out, err := cmd.Output()
	if err != nil {
		stderr := ""
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
		}
		return AgentRunResult{
			Success: false,
			Error:   fmt.Sprintf("claude error: %v — %s", err, stderr),
			Runtime: string(RuntimeClaude),
			Mode:    "cli",
		}
	}

	// Parse JSON output. Claude Code's --output-format=json has shipped
	// in two shapes:
	//   - object form:  {"result": "...", "session_id": "..."}
	//   - array form:   [ {"type":"system","subtype":"init","session_id":"..."},
	//                     ...,
	//                     {"type":"result","result":"final assistant text"} ]
	// We handle both. Session id comes from the init event in array form;
	// the final assistant text comes from the last "result"-typed event.
	content := strings.TrimSpace(string(out))
	if final, sessionId, ok := parseClaudeJSONOutput(content); ok {
		return AgentRunResult{
			Success:   true,
			Content:   final,
			SessionID: sessionId,
			Runtime:   string(RuntimeClaude),
			Mode:      "cli",
		}
	}

	return AgentRunResult{
		Success: true,
		Content: content,
		Runtime: string(RuntimeClaude),
		Mode:    "cli",
	}
}

// parseClaudeJSONOutput extracts (final-text, session-id) from the raw
// stdout of `claude -p ... --output-format json`. Returns ok=false when
// the output isn't recognisable JSON in either shape; callers should then
// fall back to surfacing the raw stdout to the user.
func parseClaudeJSONOutput(raw string) (final, sessionId string, ok bool) {
	// Object form first.
	var asObject map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &asObject); err == nil {
		if r, ok2 := asObject["result"].(string); ok2 {
			final = r
		}
		if sid, ok2 := asObject["session_id"].(string); ok2 {
			sessionId = sid
		}
		return final, sessionId, true
	}

	// Array form.
	var asArray []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &asArray); err == nil {
		for _, ev := range asArray {
			t, _ := ev["type"].(string)
			if sessionId == "" {
				if sid, _ := ev["session_id"].(string); sid != "" {
					sessionId = sid
				}
			}
			switch t {
			case "result":
				if r, _ := ev["result"].(string); r != "" {
					final = r
				}
			case "assistant":
				// Some stream events embed a `message.content` array of
				// {type:"text", text:"..."} blocks. Concatenate text blocks
				// as a fallback when no top-level "result" event is present.
				if msg, _ := ev["message"].(map[string]interface{}); msg != nil {
					if blocks, _ := msg["content"].([]interface{}); blocks != nil {
						for _, b := range blocks {
							if bm, _ := b.(map[string]interface{}); bm != nil {
								if bt, _ := bm["type"].(string); bt == "text" {
									if tx, _ := bm["text"].(string); tx != "" {
										if final != "" {
											final += "\n"
										}
										final += tx
									}
								}
							}
						}
					}
				}
			}
		}
		return final, sessionId, true
	}

	return "", "", false
}

// ─── Codex Adapter ─────────────────────────────────────────────────────────────

type CodexAdapter struct {
	paths Paths
}

func NewCodexAdapter(paths Paths) *CodexAdapter {
	return &CodexAdapter{paths: paths}
}

func (a *CodexAdapter) Name() RuntimeType { return RuntimeCodex }

func (a *CodexAdapter) Available() bool {
	return findCodexBinary() != ""
}

func (a *CodexAdapter) SetupAgent(agentId string, personality AgentPersonality) error {
	agentDir, err := a.paths.SafeAgentDir(string(RuntimeCodex), agentId)
	if err != nil {
		return err
	}
	SeedBaselineFiles(a.paths, agentDir)
	return SaveAgentPersonality(agentDir, personality)
}

func (a *CodexAdapter) RunTask(agentId string, task string, personality AgentPersonality) AgentRunResult {
	_ = personality // personality is now delivered via AGENTS.md in cwd, not via flag.
	bin := findCodexBinary()
	if bin == "" {
		return AgentRunResult{
			Success: false,
			Error:   "codex binary not found",
			Runtime: string(RuntimeCodex),
		}
	}

	// codex 0.117+: --instructions is not a valid flag. Personality is provided
	// by setting cwd to the canonical agent folder where AGENTS.md and the
	// other personality files live. Use `exec` for non-interactive task runs.
	args := []string{"exec", task, "--skip-git-repo-check", "--full-auto"}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = a.paths.Home
	if agentId != "" {
		agentDir, err := a.paths.SafeAgentDir(string(RuntimeCodex), agentId)
		if err != nil {
			return AgentRunResult{
				Success: false,
				Error:   err.Error(),
				Runtime: string(RuntimeCodex),
			}
		}
		if err := os.MkdirAll(agentDir, 0700); err == nil {
			cmd.Dir = agentDir
		}
	}

	out, cmdErr := cmd.Output()
	if cmdErr != nil {
		stderr := ""
		if exitErr, ok := cmdErr.(*exec.ExitError); ok {
			stderr = string(exitErr.Stderr)
		}
		return AgentRunResult{
			Success: false,
			Error:   fmt.Sprintf("codex error: %v — %s", cmdErr, stderr),
			Runtime: string(RuntimeCodex),
			Mode:    "cli",
		}
	}

	return AgentRunResult{
		Success: true,
		Content: strings.TrimSpace(string(out)),
		Runtime: string(RuntimeCodex),
		Mode:    "cli",
	}
}

// ─── Adapter Registry ──────────────────────────────────────────────────────────

// ResolveAdapter returns the adapter for the requested runtime.
// Returns nil if the requested runtime is not available — no silent fallback,
// so callers get a clear error rather than running the wrong runtime.
func ResolveAdapter(preferred RuntimeType, paths Paths) RuntimeAdapter {
	adapters := map[RuntimeType]RuntimeAdapter{
		RuntimeOpenClaw: NewOpenClawAdapter(paths),
		RuntimeHermes:   NewHermesAdapter(paths),
		RuntimeClaude:   NewClaudeCodeAdapter(paths),
		RuntimeCodex:    NewCodexAdapter(paths),
	}

	if a, ok := adapters[preferred]; ok && a.Available() {
		return a
	}

	return nil
}
