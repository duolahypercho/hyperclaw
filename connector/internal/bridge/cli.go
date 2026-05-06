package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var errOpenClawCommandTimedOut = errors.New("command timed out")

type synchronizedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *synchronizedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *synchronizedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// ── CLI argument sanitization ───────────────────────────────────────────────

// shellMetaChars are characters that can cause shell injection when passed as
// arguments. Even though exec.Command does NOT invoke a shell, a compromised
// value could still exploit flag injection or be interpreted by downstream
// tools. We reject these to be defense-in-depth.
const shellMetaChars = ";|&$`(){}<>"

// sanitizeArg validates a CLI argument value for safety.
// name is used only for error messages.
// Returns the trimmed value or an error if validation fails.
func sanitizeArg(name, value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("%s: empty value", name)
	}

	// Reject shell metacharacters
	for _, ch := range shellMetaChars {
		if strings.ContainsRune(value, ch) {
			return "", fmt.Errorf("%s: contains forbidden character %q", name, string(ch))
		}
	}

	// Reject newlines / carriage returns (argument injection across lines)
	if strings.ContainsAny(value, "\n\r") {
		return "", fmt.Errorf("%s: contains newline characters", name)
	}

	// Reject values starting with '-' to prevent flag injection,
	// unless the value is a known safe pattern (e.g. negative numbers, relative times like "-1d")
	if strings.HasPrefix(value, "-") {
		return "", fmt.Errorf("%s: value must not start with '-'", name)
	}

	return value, nil
}

// sanitizeMessageArg is a relaxed variant for natural-language message fields.
// It allows more punctuation but still rejects shell metacharacters that could
// cause injection: ; | & $ ` and newlines.
func sanitizeMessageArg(name, value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("%s: empty value", name)
	}

	// Reject the most dangerous shell metacharacters
	for _, ch := range ";|&$`" {
		if strings.ContainsRune(value, ch) {
			return "", fmt.Errorf("%s: contains forbidden character %q", name, string(ch))
		}
	}

	// Reject newlines / carriage returns
	if strings.ContainsAny(value, "\n\r") {
		return "", fmt.Errorf("%s: contains newline characters", name)
	}

	return value, nil
}

// ── CLI infrastructure ──────────────────────────────────────────────────────

var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*m|\x1b\]8;[^;]*;[^\x1b]*\x1b\\`)

func stripAnsi(text string) string {
	return ansiRegex.ReplaceAllString(text, "")
}

func findOpenClawBinary() string {
	if p, err := exec.LookPath("openclaw"); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".openclaw/bin/openclaw"),
		filepath.Join(home, ".npm-global/bin/openclaw"),
		filepath.Join(home, "Library/pnpm/openclaw"),
		filepath.Join(home, ".local/share/pnpm/openclaw"),
		filepath.Join(home, ".local/bin/openclaw"),
		"/opt/homebrew/bin/openclaw",
		"/usr/local/bin/openclaw",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "openclaw"
}

func openclawEnv(p Paths) []string {
	home := p.Home
	base := os.Getenv("PATH")
	candidates := []string{
		filepath.Join(home, ".openclaw/bin"),
		filepath.Join(home, ".npm-global/bin"),
		filepath.Join(home, "Library/pnpm"),
		filepath.Join(home, ".local/share/pnpm"),
		filepath.Join(home, ".local/bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		filepath.Join(home, ".nvm/versions/node/current/bin"),
		filepath.Join(home, ".nvm/current/bin"),
	}
	var extra []string
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			extra = append(extra, c)
		}
	}
	newPath := strings.Join(append(extra, base), string(os.PathListSeparator))

	env := os.Environ()
	filtered := make([]string, 0, len(env)+3)
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") || strings.HasPrefix(e, "FORCE_COLOR=") || strings.HasPrefix(e, "OPENCLAW_CONFIG_PATH=") {
			continue
		}
		filtered = append(filtered, e)
	}
	filtered = append(filtered, "PATH="+newPath, "FORCE_COLOR=0")
	configPath := p.ConfigPath()
	if _, err := os.Stat(configPath); err == nil {
		filtered = append(filtered, "OPENCLAW_CONFIG_PATH="+configPath)
	}
	return filtered
}

func appendEnvOverrides(env []string, overrides map[string]string) []string {
	if len(overrides) == 0 {
		return env
	}
	filtered := make([]string, 0, len(env)+len(overrides))
	for _, entry := range env {
		key, _, ok := strings.Cut(entry, "=")
		if !ok {
			filtered = append(filtered, entry)
			continue
		}
		if _, replace := overrides[key]; replace {
			continue
		}
		filtered = append(filtered, entry)
	}
	for key, value := range overrides {
		filtered = append(filtered, key+"="+value)
	}
	return filtered
}

func runOpenClaw(ctx context.Context, p Paths, args []string, timeoutMs int) (string, string, error) {
	if timeoutMs <= 0 {
		timeoutMs = 20000
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	bin := findOpenClawBinary()
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = openclawEnv(p)
	if _, err := os.Stat(p.OpenClaw); err == nil {
		cmd.Dir = p.OpenClaw
	} else {
		cmd.Dir = p.Home
	}

	// Use SysProcAttr to create process group for clean kill
	setProcGroup(cmd)

	var stdout, stderr synchronizedBuffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return "", "", err
	}

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-ctx.Done():
		// Try graceful kill first
		killProcessGroup(cmd)
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			forceKillProcessGroup(cmd)
			// Wait with a timeout to avoid blocking forever if Wait never returns
			select {
			case <-done:
			case <-time.After(5 * time.Second):
			}
		}
		return stdout.String(), stderr.String(), fmt.Errorf("%w after %s", errOpenClawCommandTimedOut, time.Duration(timeoutMs)*time.Millisecond)
	case err := <-done:
		return strings.TrimSpace(stdout.String()), strings.TrimSpace(stderr.String()), err
	}
}

// ── list-agents / get-team ──────────────────────────────────────────────────

// TeamAgent holds info about a single OpenClaw agent.
type TeamAgent struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Role   string `json:"role,omitempty"`
}

func (b *BridgeHandler) getTeamFromCLI() []TeamAgent {
	ctx := context.Background()

	// Try --json first
	stdout, _, err := runOpenClaw(ctx, b.paths, []string{"agents", "list", "--json"}, 10000)
	if err == nil && stdout != "" {
		var parsed []map[string]interface{}
		if err := json.Unmarshal([]byte(stdout), &parsed); err == nil && len(parsed) > 0 {
			agents := make([]TeamAgent, 0, len(parsed))
			for _, a := range parsed {
				id, _ := a["id"].(string)
				if id == "" {
					id = "unknown"
				}
				name := ""
				if identity, ok := a["identity"].(map[string]interface{}); ok {
					name, _ = identity["name"].(string)
				}
				if name == "" {
					name = strings.ToUpper(id[:1]) + id[1:]
				}
				isDefault, _ := a["default"].(bool)
				status := "idle"
				if isDefault || id == "main" {
					status = "active"
				}
				agents = append(agents, TeamAgent{ID: id, Name: name, Status: status})
			}
			return agents
		}
	}

	// Fallback: parse plain text output
	stdout, _, err = runOpenClaw(ctx, b.paths, []string{"agents", "list"}, 10000)
	if err != nil {
		return b.getTeamFallback()
	}

	raw := stripAnsi(stdout)
	lines := strings.Split(raw, "\n")
	var agents []TeamAgent

	bulletRegex := regexp.MustCompile(`^\s*[-*•]\s+([a-zA-Z0-9_.-]+)(?:\s+\(([^)]+)\))?\s*$`)

	type pending struct {
		id        string
		name      string
		isDefault bool
	}
	var current *pending

	flush := func() {
		if current == nil {
			return
		}
		name := current.name
		if name == "" {
			name = strings.ToUpper(current.id[:1]) + current.id[1:]
		}
		status := "idle"
		if current.isDefault {
			status = "active"
		}
		agents = append(agents, TeamAgent{
			ID:     current.id,
			Name:   name,
			Status: status,
			Role:   current.name,
		})
	}

	for _, line := range lines {
		if m := bulletRegex.FindStringSubmatch(line); m != nil {
			flush()
			label := m[2]
			current = &pending{
				id:        m[1],
				isDefault: strings.EqualFold(label, "default") || m[1] == "main",
			}
			if label != "" && !strings.EqualFold(label, "default") {
				current.name = label
			}
			continue
		}
	}
	flush()

	if len(agents) > 0 {
		return agents
	}
	return b.getTeamFallback()
}

func (b *BridgeHandler) getTeamFromConfig() []TeamAgent {
	data, err := os.ReadFile(b.paths.ConfigPath())
	if err != nil {
		return nil
	}
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return nil
	}
	agentsSection, _ := config["agents"].(map[string]interface{})
	list, _ := agentsSection["list"].([]interface{})
	if len(list) == 0 {
		return nil
	}

	agents := make([]TeamAgent, 0, len(list))
	for i, item := range list {
		a, _ := item.(map[string]interface{})
		if a == nil {
			continue
		}
		id, _ := a["id"].(string)
		if id == "" {
			id = fmt.Sprintf("agent-%d", i)
		}
		name := ""
		if identity, ok := a["identity"].(map[string]interface{}); ok {
			name, _ = identity["name"].(string)
		}
		if name == "" {
			name = strings.ToUpper(id[:1]) + id[1:]
		}
		status := "idle"
		if id == "main" {
			status = "active"
		}
		agents = append(agents, TeamAgent{ID: id, Name: name, Status: status, Role: name})
	}
	return agents
}

func (b *BridgeHandler) getTeamFromWorkspaces() []TeamAgent {
	// DEPRECATED: Directory scanning is unreliable because agents can have
	// arbitrary agentDir paths in openclaw.json. The config file is the
	// source of truth - if it's missing or empty, return nothing rather
	// than guessing based on directory names.
	return nil
}

func (b *BridgeHandler) getTeamFallback() []TeamAgent {
	if agents := b.getTeamFromConfig(); len(agents) > 0 {
		return agents
	}
	if agents := b.getTeamFromWorkspaces(); len(agents) > 0 {
		return agents
	}
	return []TeamAgent{}
}

const teamCacheTTL = 60 * time.Second

// ResolveTeam returns the current team, caching the result for teamCacheTTL to
// prevent repeated openclaw CLI spawns when multiple bridge actions (list-agents,
// get-employee-status) call this in quick succession.
func (b *BridgeHandler) ResolveTeam() []TeamAgent {
	b.teamCacheMu.Lock()
	if len(b.teamCacheResult) > 0 && time.Now().Before(b.teamCacheExpiry) {
		cached := b.teamCacheResult
		b.teamCacheMu.Unlock()
		return cached
	}
	b.teamCacheMu.Unlock()

	// Prefer config file / workspace dirs first — instant, avoids gateway deadlocks.
	var result []TeamAgent
	if agents := b.getTeamFallback(); len(agents) > 0 {
		result = agents
	} else {
		result = b.getTeamFromCLI()
	}

	b.teamCacheMu.Lock()
	b.teamCacheResult = result
	b.teamCacheExpiry = time.Now().Add(teamCacheTTL)
	b.teamCacheMu.Unlock()
	return result
}

// InvalidateTeamCache clears the cached team so the next ResolveTeam call fetches fresh data.
// Called after add-agent / delete-agent mutations.
func (b *BridgeHandler) InvalidateTeamCache() {
	b.teamCacheMu.Lock()
	b.teamCacheResult = nil
	b.teamCacheExpiry = time.Time{}
	b.teamCacheMu.Unlock()
}

// resolveTeamFast reads agents from SQLite (seeded at startup) to avoid
// spawning the openclaw CLI on every dashboard refresh. Only falls back to
// ResolveTeam() — which may spawn CLI — if the store is empty (first run
// before seedAgents has completed).
func (b *BridgeHandler) resolveTeamFast() []TeamAgent {
	if b.store != nil {
		storeAgents, err := b.store.GetAgents()
		if err == nil && len(storeAgents) > 0 {
			team := make([]TeamAgent, len(storeAgents))
			for i, a := range storeAgents {
				team[i] = TeamAgent{ID: a.ID, Name: a.Name, Status: a.Status, Role: a.Role}
			}
			return team
		}
	}
	// Store empty or unavailable — fall through to config/workspace/CLI resolution.
	result := b.ResolveTeam()
	return result
}

func (b *BridgeHandler) listAgents() actionResult {
	agents := b.resolveTeamFast()
	return okResult(map[string]interface{}{"success": true, "data": agents})
}

func (b *BridgeHandler) getTeam() actionResult {
	return okResult(b.resolveTeamFast())
}

// ── openclaw-config-get / openclaw-config-set ─────────────────────────────

// Allowlist of config key prefixes that the dashboard may read/write.
// Prevents arbitrary config mutation from the UI.
var allowedConfigPrefixes = []string{
	"agents.defaults.memorySearch.",
	"agents.list.",
}

func isAllowedConfigKey(key string) bool {
	for _, prefix := range allowedConfigPrefixes {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

func (b *BridgeHandler) openclawConfigGet(params map[string]interface{}) actionResult {
	key, _ := params["key"].(string)
	key = strings.TrimSpace(key)
	if key == "" {
		return errResultStatus("key is required", 400)
	}
	if !isAllowedConfigKey(key) {
		return errResultStatus("config key not allowed", 403)
	}
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
		"config", "get", key,
	}, 10000)
	if err != nil {
		msg := strings.TrimSpace(stderr)
		if msg == "" {
			msg = err.Error()
		}
		return okResult(map[string]interface{}{"success": true, "key": key, "value": nil, "error": msg})
	}
	value := strings.TrimSpace(stdout)
	return okResult(map[string]interface{}{"success": true, "key": key, "value": value})
}

func (b *BridgeHandler) openclawConfigSet(params map[string]interface{}) actionResult {
	key, _ := params["key"].(string)
	key = strings.TrimSpace(key)
	if key == "" {
		return errResultStatus("key is required", 400)
	}
	if !isAllowedConfigKey(key) {
		return errResultStatus("config key not allowed", 403)
	}
	value, _ := params["value"].(string)
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
		"config", "set", key, value,
	}, 10000)
	if err != nil {
		msg := strings.TrimSpace(stderr)
		if msg == "" {
			msg = strings.TrimSpace(stdout)
		}
		if msg == "" {
			msg = err.Error()
		}
		return errResult(msg)
	}
	return okResult(map[string]interface{}{"success": true, "key": key, "value": value})
}

// ── add-agent ───────────────────────────────────────────────────────────────

var agentNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)

// First-run OpenClaw agent creation may stage bundled plugin runtime deps before
// it reaches the config write path. Slow networks can exceed eight minutes.
const openClawAgentAddTimeoutMs = 900000

// openClawAgentDeleteTimeoutMs covers the same first-run plugin-staging cost
// that openClawAgentAddTimeoutMs covers. `openclaw agents delete` lazily
// stages bundled plugin runtime deps before reaching the config write path,
// which can exceed eight minutes on a fresh install or after an OpenClaw upgrade.
// Matching the add budget keeps both sides of the agent lifecycle consistent.
const openClawAgentDeleteTimeoutMs = openClawAgentAddTimeoutMs

const openClawDoctorFixTimeoutMs = 600000
const openClawSecurityAuditDeepTimeoutMs = 600000
const openClawStatusAllTimeoutMs = 120000

func (b *BridgeHandler) addAgent(params map[string]interface{}) actionResult {
	name, _ := params["agentName"].(string)
	name = strings.TrimSpace(name)
	if name == "" {
		return errResultStatus("Agent name is required", 400)
	}
	if !agentNameRegex.MatchString(name) {
		return errResultStatus("Agent name may only contain letters, numbers, underscores, hyphens, and dots", 400)
	}
	if len(name) > 120 {
		return errResultStatus("Agent name too long", 400)
	}

	normalizedID := strings.ToLower(regexp.MustCompile(`[^a-z0-9_.-]`).ReplaceAllString(strings.ToLower(name), ""))
	if normalizedID == "" {
		return errResultStatus("Agent name must contain at least one letter or number", 400)
	}

	// Reject duplicates before calling the CLI to avoid partial state.
	if agentExistsInConfig(b.paths, normalizedID) {
		return errResultStatus(fmt.Sprintf("agent '%s' already exists", normalizedID), 409)
	}

	workspacePath := b.paths.AgentDir("openclaw", normalizedID)
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
		"agents", "add", name, "--workspace", workspacePath, "--non-interactive",
	}, openClawAgentAddTimeoutMs)
	if err != nil {
		// `openclaw agents add` can exit non-zero after writing openclaw.json
		// (or after our timeout fires late in plugin staging). The config is the
		// source of truth for whether the agent exists.
		if agentExistsInConfig(b.paths, normalizedID) {
			log.Printf("[addAgent] openclaw agents add %q returned %v but config now contains the agent; treating as success (stderr=%q)", name, err, strings.TrimSpace(stderr))
			b.InvalidateTeamCache()
			if b.onAgentsChanged != nil {
				go b.onAgentsChanged()
			}
			return okResult(map[string]interface{}{"success": true})
		}
		msg := openClawCommandFailureMessage(stdout, stderr, err)
		log.Printf("[addAgent] openclaw agents add %q failed: err=%v stdout=%q stderr=%q", name, err, stdout, stderr)
		return okResult(map[string]interface{}{"success": false, "error": msg})
	}

	// Invalidate cache and notify hub so dashboard auto-refreshes.
	b.InvalidateTeamCache()
	if b.onAgentsChanged != nil {
		go b.onAgentsChanged()
	}

	return okResult(map[string]interface{}{"success": true})
}

func openClawCommandFailureMessage(stdout, stderr string, err error) string {
	stderr = strings.TrimSpace(stderr)
	stdout = strings.TrimSpace(stdout)
	if errors.Is(err, errOpenClawCommandTimedOut) {
		msg := strings.TrimSpace(err.Error())
		if stderr != "" {
			return msg + ": " + stderr
		}
		if stdout != "" {
			return msg + ": " + stdout
		}
		return msg
	}
	if stderr != "" {
		return stderr
	}
	if stdout != "" {
		return stdout
	}
	if err != nil {
		return err.Error()
	}
	return "openclaw command failed"
}

// agentExistsInConfig reads openclaw.json directly to check if an agent exists.
// This avoids spawning the CLI (which connects to the gateway and can deadlock
// when called from within a bridge request handler).
func agentExistsInConfig(p Paths, agentID string) bool {
	data, err := os.ReadFile(filepath.Join(p.OpenClaw, "openclaw.json"))
	if err != nil {
		return false
	}
	var cfg struct {
		Agents struct {
			List []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"list"`
		} `json:"agents"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return false
	}
	for _, a := range cfg.Agents.List {
		if strings.EqualFold(a.ID, agentID) || strings.EqualFold(a.Name, agentID) {
			return true
		}
	}
	return false
}

// ── delete-agent ────────────────────────────────────────────────────────────

func (b *BridgeHandler) deleteAgent(params map[string]interface{}) actionResult {
	idOrName, _ := params["agentId"].(string)
	idOrName = strings.TrimSpace(idOrName)
	if idOrName == "" {
		return errResultStatus("Agent id is required", 400)
	}

	normalizedID := strings.ToLower(regexp.MustCompile(`[^a-z0-9_.-]`).ReplaceAllString(strings.ToLower(idOrName), ""))
	if normalizedID == "" {
		return errResultStatus("Invalid agent id", 400)
	}
	// Only protect "main" if OpenClaw or Hermes is actually set up
	if normalizedID == "main" {
		openclawSetUp := isOpenClawSetUp(b.paths)
		hermesSetUp := NewHermesAdapter(b.paths).Available()
		if openclawSetUp || hermesSetUp {
			return errResultStatus("Cannot delete the main agent while OpenClaw or Hermes is installed", 400)
		}
	}

	// Check openclaw.json directly (no CLI spawn) to avoid gateway deadlock.
	inConfig := agentExistsInConfig(b.paths, normalizedID)

	if inConfig {
		stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
			"agents", "delete", normalizedID, "--force",
		}, openClawAgentDeleteTimeoutMs)
		if err != nil {
			// openclaw CLI may exit 1 even when the deletion succeeded.
			// Verify via config file (not CLI, to avoid gateway deadlock).
			if agentExistsInConfig(b.paths, normalizedID) {
				return okResult(map[string]interface{}{"success": false, "error": openClawCommandFailureMessage(stdout, stderr, err)})
			}
			// Agent is gone from config — treat as success despite non-zero exit
		}
	}

	// Clean up orphan directories so deleted agents don't linger
	// in file listings or workspace-scan fallbacks.
	// Check all naming conventions: workspace-<id>, agents/<id>, and bare <id>.
	for _, dir := range []string{
		filepath.Join(b.paths.OpenClaw, "workspace-"+normalizedID),
		filepath.Join(b.paths.OpenClaw, "agents", normalizedID),
		filepath.Join(b.paths.OpenClaw, normalizedID),
	} {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			if err := os.RemoveAll(dir); err != nil {
				log.Printf("delete-agent: failed to remove %s: %v", dir, err)
			} else {
				log.Printf("delete-agent: removed openclaw dir %s", dir)
			}
		}
	}

	// Sync SQLite immediately so the dashboard doesn't have to wait for the
	// file-watcher or the 10-minute periodic refresh.
	if b.store != nil {
		log.Printf("delete-agent: deleting %s from SQLite tables", normalizedID)
		b.store.DeleteAgent(normalizedID)
		// Cascade: remove all related data from SQLite.
		b.store.DeleteCronJobsByAgent(normalizedID)
		b.store.DeleteAgentIdentity(normalizedID)
		b.store.DeleteAgentFiles(normalizedID)
		b.store.DeleteAgentSkillsByAgent(normalizedID)
		b.store.DeleteAgentMCPsByAgent(normalizedID)
		b.store.DeleteAgentTools(normalizedID)
		b.store.DeleteAgentEventsByAgent(normalizedID)
		b.store.DeleteAgentLastSeen(normalizedID)
		b.store.DeleteSessionsByAgent(normalizedID)
		b.store.DeleteTokenUsageByAgent(normalizedID)
		b.store.ClearPrimarySession(normalizedID)
	}

	// Move HyperClaw-owned agent dirs to .trash/ instead of hard-deleting
	// so accidental deletes can be recovered.
	//
	// Workspaces live under one of two layouts:
	//   - bare:           ~/.hyperclaw/agents/<id>          (legacy)
	//   - runtime-prefix: ~/.hyperclaw/agents/<runtime>-<id> (current; matches paths.AgentDir)
	// We trash any candidate that exists. Looping over runtimes covers cases
	// where the SQLite row is gone but the workspace remains, and where the
	// caller didn't pass a runtime hint.
	trashDir := filepath.Join(b.paths.HyperClaw, ".trash")
	if err := os.MkdirAll(trashDir, 0700); err != nil {
		log.Printf("delete-agent: failed to create trash dir: %v", err)
	}
	candidates := []string{
		filepath.Join(b.paths.HyperClaw, "agents", normalizedID),
	}
	for _, runtime := range []string{"openclaw", "hermes", "claude-code", "codex"} {
		candidates = append(candidates, filepath.Join(b.paths.HyperClaw, "agents", runtime+"-"+normalizedID))
	}
	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err != nil {
			if !os.IsNotExist(err) {
				log.Printf("delete-agent: stat error for %s: %v", candidate, err)
			}
			continue
		}
		if !info.IsDir() {
			continue
		}
		base := filepath.Base(candidate)
		dest := filepath.Join(trashDir, base+"-"+time.Now().Format("20060102T150405"))
		if err := os.Rename(candidate, dest); err != nil {
			log.Printf("delete-agent: failed to move %s to trash: %v", candidate, err)
		} else {
			log.Printf("delete-agent: moved %s to %s", candidate, dest)
		}
	}

	// Remove from org chart — both JSON file and SQLite KV store.
	if b.orgChart != nil {
		b.orgChart.RemoveAgent(normalizedID)
	}
	if b.store != nil {
		b.removeAgentFromOrgChartKV(normalizedID)
	}

	// Clean up Hermes profile directory if this was a Hermes agent.
	// os.RemoveAll is a no-op when the path doesn't exist, so this is safe
	// for non-Hermes agents too.
	hermesProfileDir := filepath.Join(b.paths.Home, ".hermes", "profiles", normalizedID)
	if info, err := os.Stat(hermesProfileDir); err == nil && info.IsDir() {
		os.RemoveAll(hermesProfileDir)
	}

	// Move ~/.claude/projects/<agentId>/ to .trash/ — soft-delete so session
	// history can be recovered if the deletion was accidental.
	// Only trash the Hyperclaw-managed project dir (named after the agentId),
	// never a custom projectPath that points to an existing codebase.
	claudeProjectDir := filepath.Join(b.paths.ClaudeProjects, normalizedID)
	if info, err := os.Stat(claudeProjectDir); err == nil && info.IsDir() {
		dest := filepath.Join(trashDir, "claude-project-"+normalizedID+"-"+time.Now().Format("20060102T150405"))
		_ = os.Rename(claudeProjectDir, dest)
	}

	// Clean up memory SQLite file if it exists.
	memFile := filepath.Join(b.paths.OpenClaw, "memory", normalizedID+".sqlite")
	os.Remove(memFile)

	// Invalidate cache and notify hub so dashboard auto-refreshes.
	b.InvalidateTeamCache()
	if b.onAgentsChanged != nil {
		go b.onAgentsChanged()
	}

	return okResult(map[string]interface{}{"success": true})
}

// ── get-crons (CLI) ─────────────────────────────────────────────────────────

func (b *BridgeHandler) getCrons(params map[string]interface{}) actionResult {
	agentID := strings.TrimSpace(strParam(params, "agentId"))
	if agentID != "" {
		if err := ValidateAgentID(agentID); err != nil {
			return errResultStatus(err.Error(), 400)
		}
	}
	jobID := strings.TrimSpace(strParam(params, "jobId"))
	if jobID != "" && !uuidRegex.MatchString(jobID) {
		return errResultStatus("Job not found", 404)
	}

	crons := getCronsFromJSONFiltered(b.paths, agentID, jobID)
	return okResult(crons)
}

// ── cron-add ────────────────────────────────────────────────────────────────

func (b *BridgeHandler) cronAdd(params map[string]interface{}) actionResult {
	p, _ := params["cronAddParams"].(map[string]interface{})
	if p == nil {
		return errResultStatus("cronAddParams is required", 400)
	}

	runtime, _ := p["runtime"].(string)
	if runtime == "" {
		runtime = "openclaw"
	}

	// All runtimes are stored directly in SQLite and run by the connector scheduler.
	// This unifies cron management across OpenClaw, Claude Code, Codex, and Hermes.
	return b.cronAddDirect(p, runtime)
}

// cronAddLegacyOpenClaw is the old path that calls the OpenClaw CLI directly.
// Kept for reference but no longer used. All crons now go through cronAddDirect.
func (b *BridgeHandler) cronAddLegacyOpenClaw(p map[string]interface{}) actionResult {
	// ── OpenClaw CLI path (legacy) ────────────────────────────────────────────

	name, _ := p["name"].(string)
	name = strings.TrimSpace(name)
	if name == "" {
		return errResultStatus("name is required", 400)
	}
	if sanitized, err := sanitizeArg("name", name); err != nil {
		return errResultStatus(err.Error(), 400)
	} else {
		name = sanitized
	}

	at, _ := p["at"].(string)
	cron, _ := p["cron"].(string)
	at = strings.TrimSpace(at)
	cron = strings.TrimSpace(cron)
	if at == "" && cron == "" {
		return errResultStatus("Either at (ISO or relative e.g. 20m) or cron expression is required", 400)
	}

	if at != "" {
		if sanitized, err := sanitizeArg("at", at); err != nil {
			return errResultStatus(err.Error(), 400)
		} else {
			at = sanitized
		}
	}
	if cron != "" {
		if sanitized, err := sanitizeArg("cron", cron); err != nil {
			return errResultStatus(err.Error(), 400)
		} else {
			cron = sanitized
		}
	}

	session, _ := p["session"].(string)
	if session == "" {
		session = "main"
	} else {
		if sanitized, err := sanitizeArg("session", session); err != nil {
			return errResultStatus(err.Error(), 400)
		} else {
			session = sanitized
		}
	}

	args := []string{"cron", "add", "--name", name, "--session", session}
	if at != "" {
		args = append(args, "--at", at)
	}
	if cron != "" {
		args = append(args, "--cron", cron)
	}

	addSanitizedStringFlag := func(key, flag string) error {
		if v, ok := p[key].(string); ok && strings.TrimSpace(v) != "" {
			var sanitized string
			var err error
			if key == "message" {
				sanitized, err = sanitizeMessageArg(key, v)
			} else {
				sanitized, err = sanitizeArg(key, v)
			}
			if err != nil {
				return err
			}
			args = append(args, flag, sanitized)
		}
		return nil
	}
	addBoolFlag := func(key, flag string) {
		if v, ok := p[key].(bool); ok && v {
			args = append(args, flag)
		}
	}

	for _, pair := range [][2]string{
		{"tz", "--tz"},
		{"message", "--message"},
		{"systemEvent", "--system-event"},
	} {
		if err := addSanitizedStringFlag(pair[0], pair[1]); err != nil {
			return errResultStatus(err.Error(), 400)
		}
	}
	addBoolFlag("deleteAfterRun", "--delete-after-run")
	if announce, ok := p["announce"].(bool); ok && announce {
		args = append(args, "--announce")
		for _, pair := range [][2]string{
			{"channel", "--channel"},
			{"to", "--to"},
		} {
			if err := addSanitizedStringFlag(pair[0], pair[1]); err != nil {
				return errResultStatus(err.Error(), 400)
			}
		}
	}
	for _, pair := range [][2]string{
		{"stagger", "--stagger"},
		{"model", "--model"},
		{"thinking", "--thinking"},
		{"agent", "--agent"},
	} {
		if err := addSanitizedStringFlag(pair[0], pair[1]); err != nil {
			return errResultStatus(err.Error(), 400)
		}
	}

	_, _, err := runOpenClaw(context.Background(), b.paths, args, 30000)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// cronAddDirect stores a cron job directly in SQLite for any runtime.
// Supports: openclaw, claude-code, codex, hermes
func (b *BridgeHandler) cronAddDirect(p map[string]interface{}, runtime string) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}

	name, _ := p["name"].(string)
	name = strings.TrimSpace(name)
	if name == "" {
		return errResultStatus("name is required", 400)
	}

	message, _ := p["message"].(string)
	message = strings.TrimSpace(message)
	systemEvent, _ := p["systemEvent"].(string)
	systemEvent = strings.TrimSpace(systemEvent)

	// For OpenClaw, either message or systemEvent is required
	// For other runtimes, message is required
	if runtime == "openclaw" {
		if message == "" && systemEvent == "" {
			return errResultStatus("message or systemEvent is required for OpenClaw", 400)
		}
	} else {
		if message == "" {
			return errResultStatus("message is required", 400)
		}
	}

	agentID, _ := p["agent"].(string)
	model, _ := p["model"].(string)
	session, _ := p["session"].(string)
	channel, _ := p["channel"].(string)
	cronExpr, _ := p["cron"].(string)
	atVal, _ := p["at"].(string)
	cronExpr = strings.TrimSpace(cronExpr)
	atVal = strings.TrimSpace(atVal)
	if cronExpr == "" && atVal == "" {
		return errResultStatus("either cron or at schedule is required", 400)
	}

	// Build schedule and compute nextRunAtMs
	now := time.Now()
	var scheduleMap map[string]interface{}
	var nextRunAtMs int64

	if cronExpr != "" {
		next, err := nextCronRunAfter(cronExpr, now)
		if err != nil {
			return errResultStatus("invalid cron expression: "+err.Error(), 400)
		}
		nextRunAtMs = next.UnixMilli()
		scheduleMap = map[string]interface{}{"kind": "cron", "expr": cronExpr}
	} else {
		// Parse relative (e.g. "20m") or ISO datetime
		t, err := parseAtParam(atVal, now)
		if err != nil {
			return errResultStatus("invalid at value: "+err.Error(), 400)
		}
		nextRunAtMs = t.UnixMilli()
		scheduleMap = map[string]interface{}{"kind": "at", "atMs": nextRunAtMs}
	}

	jobID := newCronRunID() // reuse UUID generator
	payload := map[string]interface{}{}
	if message != "" {
		payload["message"] = message
	}
	if systemEvent != "" {
		payload["systemEvent"] = systemEvent
	}
	if agentID != "" {
		payload["agentId"] = agentID
	}
	if model != "" {
		payload["model"] = model
	}
	if session != "" {
		payload["session"] = session
	}
	if channel != "" {
		payload["channel"] = channel
	}

	rawObj := map[string]interface{}{
		"id":       jobID,
		"name":     name,
		"runtime":  runtime,
		"enabled":  true,
		"schedule": scheduleMap,
		"payload":  payload,
		"state": map[string]interface{}{
			"nextRunAtMs": nextRunAtMs,
			"lastRunAtMs": nil,
			"lastStatus":  "idle",
		},
	}
	if agentID != "" {
		rawObj["agentId"] = agentID
	}
	rawJSON, err := json.Marshal(rawObj)
	if err != nil {
		return errResult("failed to serialize job: " + err.Error())
	}

	if err := b.store.UpsertDirectCronJob(jobID, runtime, agentID, name, true, string(rawJSON)); err != nil {
		return errResult("failed to store cron job: " + err.Error())
	}

	// Write-back: keep jobs.json in sync so `openclaw cron list` still works.
	if runtime == "" || runtime == "openclaw" {
		go b.writeBackOpenClawJobs()
	}

	return okResult(map[string]interface{}{"success": true, "id": jobID})
}

// parseAtParam parses a relative time ("20m", "1h") or ISO 8601 datetime string.
func parseAtParam(val string, now time.Time) (time.Time, error) {
	val = strings.TrimSpace(val)
	// Try relative formats: 20m, 1h, 2d
	if len(val) > 1 {
		unit := val[len(val)-1]
		num, err := strconv.Atoi(val[:len(val)-1])
		if err == nil && num > 0 {
			switch unit {
			case 'm':
				return now.Add(time.Duration(num) * time.Minute), nil
			case 'h':
				return now.Add(time.Duration(num) * time.Hour), nil
			case 'd':
				return now.Add(time.Duration(num) * 24 * time.Hour), nil
			}
		}
	}
	// Try ISO 8601
	t, err := time.Parse(time.RFC3339, val)
	if err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("unrecognized at format: %q (use e.g. 20m, 1h, or RFC3339)", val)
}

// ── cron-run ────────────────────────────────────────────────────────────────

func (b *BridgeHandler) cronRun(params map[string]interface{}) actionResult {
	jobID, _ := params["cronRunJobId"].(string)
	jobID = strings.TrimSpace(jobID)
	if jobID == "" || !uuidRegex.MatchString(jobID) {
		return errResultStatus("Valid job id is required", 400)
	}

	// For non-OpenClaw jobs stored in SQLite, trigger via the scheduler directly.
	if b.store != nil {
		if job, err := b.store.GetCronJobByID(jobID); err == nil && job != nil && job.Runtime != "openclaw" {
			var rawObj map[string]interface{}
			if err := json.Unmarshal([]byte(job.RawJSON), &rawObj); err != nil {
				log.Printf("[cron-run] failed to parse raw_json for %s: %v", jobID, err)
				return errResult("failed to parse cron job data: " + err.Error())
			}
			if b.cronScheduler != nil {
				b.cronScheduler.RunJobManual(*job, rawObj)
			}
			return okResult(map[string]interface{}{"success": true})
		}
	}

	// OpenClaw jobs (or jobs not found in SQLite): fall back to the OpenClaw CLI.
	args := []string{"cron", "run", jobID}
	if due, ok := params["cronRunDue"].(bool); ok && due {
		args = append(args, "--due")
	}

	_, _, err := runOpenClaw(context.Background(), b.paths, args, 120000)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── cron-runs-sync ──────────────────────────────────────────────────────────

func (b *BridgeHandler) cronRunsSync(_ map[string]interface{}) actionResult {
	// Deprecated: run history is now read directly from the unified SQLite
	// cron_runs table via getCronRuns / getCronRunsForJob. This action is a
	// no-op and returns success immediately so existing callers don't break.
	log.Printf("[cron-runs-sync] deprecated: run history now served from SQLite cron_runs table")
	return okResult(map[string]interface{}{"success": true})
}

// ── cron-edit ───────────────────────────────────────────────────────────────

func (b *BridgeHandler) cronEdit(params map[string]interface{}) actionResult {
	jobID, _ := params["cronEditJobId"].(string)
	jobID = strings.TrimSpace(jobID)
	if jobID == "" || !uuidRegex.MatchString(jobID) {
		return errResultStatus("Valid job id is required", 400)
	}

	p, _ := params["cronEditParams"].(map[string]interface{})
	args := []string{"cron", "edit", jobID}

	addSanitizedStringFlag := func(key, flag string) error {
		if v, ok := p[key].(string); ok && strings.TrimSpace(v) != "" {
			var sanitized string
			var err error
			if key == "message" {
				sanitized, err = sanitizeMessageArg(key, v)
			} else {
				sanitized, err = sanitizeArg(key, v)
			}
			if err != nil {
				return err
			}
			args = append(args, flag, sanitized)
		}
		return nil
	}

	if p != nil {
		if b.store != nil {
			if job, err := b.store.GetCronJobByID(jobID); err == nil && job != nil && job.Runtime != "openclaw" {
				var rawObj map[string]interface{}
				if err := json.Unmarshal([]byte(job.RawJSON), &rawObj); err != nil {
					return errResult("failed to parse cron job: " + err.Error())
				}

				if v, ok := p["name"].(string); ok && strings.TrimSpace(v) != "" {
					sanitized, err := sanitizeArg("name", v)
					if err != nil {
						return errResultStatus(err.Error(), 400)
					}
					rawObj["name"] = sanitized
				}

				payload, _ := rawObj["payload"].(map[string]interface{})
				if payload == nil {
					payload = make(map[string]interface{})
					rawObj["payload"] = payload
				}

				if v, ok := p["message"].(string); ok && strings.TrimSpace(v) != "" {
					sanitized, err := sanitizeMessageArg("message", v)
					if err != nil {
						return errResultStatus(err.Error(), 400)
					}
					payload["message"] = sanitized
				}
				if v, ok := p["model"].(string); ok && strings.TrimSpace(v) != "" {
					sanitized, err := sanitizeArg("model", v)
					if err != nil {
						return errResultStatus(err.Error(), 400)
					}
					payload["model"] = sanitized
				}
				if v, ok := p["thinking"].(string); ok && strings.TrimSpace(v) != "" {
					sanitized, err := sanitizeArg("thinking", v)
					if err != nil {
						return errResultStatus(err.Error(), 400)
					}
					payload["thinking"] = sanitized
				}

				agentID := job.AgentID
				if clearAgent, ok := p["clearAgent"].(bool); ok && clearAgent {
					agentID = ""
					delete(payload, "agentId")
				} else if v, ok := p["agent"].(string); ok && strings.TrimSpace(v) != "" {
					sanitized, err := sanitizeArg("agent", v)
					if err != nil {
						return errResultStatus(err.Error(), 400)
					}
					agentID = sanitized
					payload["agentId"] = sanitized
				}

				if exact, ok := p["exact"].(bool); ok && exact {
					payload["exact"] = true
				}

				name, _ := rawObj["name"].(string)
				if strings.TrimSpace(name) == "" {
					name = job.Name
				}
				enabled, _ := rawObj["enabled"].(bool)
				updatedRaw, err := json.Marshal(rawObj)
				if err != nil {
					return errResult("failed to serialize cron job: " + err.Error())
				}
				if err := b.store.UpsertDirectCronJob(jobID, job.Runtime, agentID, name, enabled, string(updatedRaw)); err != nil {
					return errResult("failed to update cron job: " + err.Error())
				}
				return okResult(map[string]interface{}{"success": true})
			}
		}

		for _, pair := range [][2]string{
			{"name", "--name"},
			{"message", "--message"},
			{"model", "--model"},
			{"thinking", "--thinking"},
		} {
			if err := addSanitizedStringFlag(pair[0], pair[1]); err != nil {
				return errResultStatus(err.Error(), 400)
			}
		}
		if clearAgent, ok := p["clearAgent"].(bool); ok && clearAgent {
			args = append(args, "--clear-agent")
		} else {
			if err := addSanitizedStringFlag("agent", "--agent"); err != nil {
				return errResultStatus(err.Error(), 400)
			}
		}
		if exact, ok := p["exact"].(bool); ok && exact {
			args = append(args, "--exact")
		}
	}

	if len(args) == 3 {
		return errResultStatus("At least one field to update is required", 400)
	}

	_, _, err := runOpenClaw(context.Background(), b.paths, args, 15000)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── cron-delete ─────────────────────────────────────────────────────────────

func (b *BridgeHandler) cronDelete(params map[string]interface{}) actionResult {
	jobID, _ := params["cronDeleteJobId"].(string)
	jobID = strings.TrimSpace(jobID)
	if jobID == "" || !uuidRegex.MatchString(jobID) {
		return errResultStatus("Valid job id is required", 400)
	}

	// If the job exists in SQLite as a non-OpenClaw job, delete it there.
	if b.store != nil {
		if job, err := b.store.GetCronJobByID(jobID); err == nil && job != nil && job.Runtime != "openclaw" {
			deleted, err := b.store.DeleteCronJobByID(jobID)
			if err != nil {
				return errResult("failed to delete cron job: " + err.Error())
			}
			if deleted {
				// Clean up associated run history so orphan rows don't accumulate.
				if cleanErr := b.store.DeleteCronRunsByCronID(jobID); cleanErr != nil {
					log.Printf("[cron-delete] failed to delete cron_runs for %s: %v", jobID, cleanErr)
				}
				return okResult(map[string]interface{}{"success": true})
			}
		}
	}

	// Fall back to OpenClaw CLI
	_, _, err := runOpenClaw(context.Background(), b.paths, []string{
		"cron", "rm", jobID,
	}, 15000)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	// Clean up run history for OpenClaw jobs too.
	if b.store != nil {
		if cleanErr := b.store.DeleteCronRunsByCronID(jobID); cleanErr != nil {
			log.Printf("[cron-delete] failed to delete cron_runs for %s: %v", jobID, cleanErr)
		}
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── cron-toggle ─────────────────────────────────────────────────────────────

func (b *BridgeHandler) cronToggle(params map[string]interface{}) actionResult {
	jobID, _ := params["cronToggleJobId"].(string)
	jobID = strings.TrimSpace(jobID)
	if jobID == "" {
		return okResult(map[string]interface{}{"success": false, "error": "jobId is required"})
	}

	enabled, _ := params["cronToggleEnabled"].(bool)

	if b.store == nil {
		return okResult(map[string]interface{}{"success": false, "error": "store not available"})
	}

	// Update SQLite first — this is the source of truth for the scheduler.
	if err := b.store.UpdateCronJobEnabled(jobID, enabled); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}

	// For OpenClaw jobs, also sync via CLI on a best-effort basis.
	if job, err := b.store.GetCronJobByID(jobID); err == nil && job != nil && job.Runtime == "openclaw" {
		cmd := "enable"
		if !enabled {
			cmd = "disable"
		}
		go func() {
			_, _, _ = runOpenClaw(context.Background(), b.paths, []string{"cron", cmd, jobID}, 15000)
		}()
	}

	return okResult(map[string]interface{}{"success": true, "enabled": enabled})
}

// ── get-running-crons ───────────────────────────────────────────────────────

var cronSessionRegex = regexp.MustCompile(`agent:([^:]+):cron:(\S+)`)

func (b *BridgeHandler) getRunningCrons() actionResult {
	stdout, _, err := runOpenClaw(context.Background(), b.paths, []string{"sessions"}, 10000)
	if err != nil {
		return okResult([]interface{}{})
	}

	lines := strings.Split(stdout, "\n")
	var running []map[string]string
	for _, line := range lines {
		if !strings.Contains(line, ":cron:") {
			continue
		}
		if m := cronSessionRegex.FindStringSubmatch(line); m != nil {
			running = append(running, map[string]string{
				"agentId": m[1],
				"jobId":   m[2],
			})
		}
	}
	if running == nil {
		return okResult([]interface{}{})
	}
	return okResult(running)
}

// ── trigger-process-commands ────────────────────────────────────────────────

const processCommandsMessage = "Process the HyperClaw command queue: call hyperclaw_read_commands. " +
	"For each command of type 'generate_daily_summary', use the date in the payload, " +
	"call hyperclaw_generate_daily_summary for that date, summarize the memories with your LLM into a short TL;DR, " +
	"then call hyperclaw_write_daily_summary with that date and the summary content. Process all such commands."

func (b *BridgeHandler) triggerProcessCommands() actionResult {
	_, _, err := runOpenClaw(context.Background(), b.paths, []string{
		"agent", "--message", processCommandsMessage,
	}, 180000)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// openclawCronExecute runs an OpenClaw cron job via the CLI.
// This is called by CronScheduler for runtime="openclaw" jobs.
// Supports: message, systemEvent, agentId, session, model, channel
func (b *BridgeHandler) openclawCronExecute(params map[string]interface{}) actionResult {
	message, _ := params["message"].(string)
	systemEvent, _ := params["systemEvent"].(string)
	agentID, _ := params["agentId"].(string)
	session, _ := params["session"].(string)
	model, _ := params["model"].(string)
	channel, _ := params["channel"].(string)

	// Build CLI args for `openclaw agent` command
	args := []string{"agent"}

	// Determine message type: system event (main session) or regular message (isolated)
	if systemEvent != "" {
		args = append(args, "--system-event", systemEvent)
	} else if message != "" {
		args = append(args, "--message", message)
	} else {
		return errResult("openclaw-cron-execute: no message or systemEvent provided")
	}

	// Agent selection
	if agentID != "" && agentID != "main" {
		args = append(args, "--agent", agentID)
	}

	// Session type
	if session == "isolated" {
		args = append(args, "--session", "isolated")
	}

	// Model override
	if model != "" {
		args = append(args, "--model", model)
	}

	// Channel for announcements
	if channel != "" {
		args = append(args, "--channel", channel)
	}

	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, args, 120000)
	if err != nil {
		return okResult(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"stdout":  stdout,
			"stderr":  stderr,
		})
	}

	// Extract response from stdout (OpenClaw outputs the response)
	return okResult(map[string]interface{}{
		"success":  true,
		"response": strings.TrimSpace(stdout),
	})
}

func (b *BridgeHandler) openClawDoctorFix() actionResult {
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
		"doctor", "--fix", "--non-interactive",
	}, openClawDoctorFixTimeoutMs)
	if err != nil {
		return okResult(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"stdout":  stdout,
			"stderr":  stderr,
		})
	}
	return okResult(map[string]interface{}{
		"success": true,
		"stdout":  stdout,
		"stderr":  stderr,
	})
}

func (b *BridgeHandler) openClawSecurityAuditDeep() actionResult {
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
		"security", "audit", "--deep",
	}, openClawSecurityAuditDeepTimeoutMs)
	if err != nil {
		return okResult(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"stdout":  stdout,
			"stderr":  stderr,
		})
	}
	return okResult(map[string]interface{}{
		"success": true,
		"stdout":  stdout,
		"stderr":  stderr,
	})
}

func (b *BridgeHandler) openClawStatusAll() actionResult {
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
		"status", "--all",
	}, openClawStatusAllTimeoutMs)
	if err != nil {
		return okResult(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"stdout":  stdout,
			"stderr":  stderr,
		})
	}
	return okResult(map[string]interface{}{
		"success": true,
		"stdout":  stdout,
		"stderr":  stderr,
	})
}

func (b *BridgeHandler) gatewayRestart() actionResult {
	stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{
		"daemon", "restart",
	}, 30000)
	if err != nil {
		return okResult(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"stdout":  stdout,
			"stderr":  stderr,
		})
	}
	return okResult(map[string]interface{}{
		"success": true,
		"stdout":  stdout,
		"stderr":  stderr,
	})
}
