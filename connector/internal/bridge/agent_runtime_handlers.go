package bridge

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// setupAgent creates an agent in the chosen runtime with personality files.
// Params:
//   - agentId (string): agent identifier
//   - runtime (string): "openclaw", "hermes", "claude-code", "codex"
//   - name (string): display name (optional — falls back to agentId)
//   - emoji (string): avatar emoji (optional)
//   - soul, identity, agents, tools, user, heartbeat, memory (string): personality file contents
func (b *BridgeHandler) setupAgent(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	agentId = strings.TrimSpace(agentId)
	if err := ValidateAgentID(agentId); err != nil {
		return errResultStatus(err.Error(), 400)
	}

	runtimeStr, _ := params["runtime"].(string)
	if runtimeStr == "" {
		runtimeStr = "openclaw"
	}
	runtimeStr = strings.TrimSpace(runtimeStr)
	adapter, ok := map[RuntimeType]RuntimeAdapter{
		RuntimeOpenClaw: NewOpenClawAdapter(b.paths),
		RuntimeHermes:   NewHermesAdapter(b.paths),
		RuntimeClaude:   NewClaudeCodeAdapter(b.paths),
		RuntimeCodex:    NewCodexAdapter(b.paths),
	}[RuntimeType(runtimeStr)]
	if !ok {
		return errResultStatus(fmt.Sprintf("unknown runtime: %s", runtimeStr), 400)
	}

	displayName := strParam(params, "name")
	if displayName == "" {
		displayName = agentId
	}
	emoji := strParam(params, "emoji")

	personality := AgentPersonality{
		AgentID:   agentId,
		Soul:      strParam(params, "soul"),
		Identity:  strParam(params, "identity"),
		Agents:    strParam(params, "agents"),
		Tools:     strParam(params, "tools"),
		User:      strParam(params, "user"),
		Heartbeat: strParam(params, "heartbeat"),
		Memory:    strParam(params, "memory"),
	}

	// Reject duplicate agent IDs for non-OpenClaw runtimes before writing anything.
	// (OpenClaw duplicates are caught earlier by agentExistsInConfig in addAgent.)
	if runtimeStr != "openclaw" && b.store != nil {
		if existing, err := b.store.GetAgentIdentity(agentId); err == nil && existing != nil {
			return errResultStatus(fmt.Sprintf("agent '%s' already exists (runtime: %s)", agentId, existing.Runtime), 409)
		}
	}

	// OpenClaw and Hermes have their own agent harness — files go directly into
	// their native directories (~/.openclaw/workspace-{id}/, ~/.hermes/profiles/{id}/).
	// Claude Code and Codex have no harness, so we manage files in ~/.hyperclaw/agents/{id}/.
	usesNativeHarness := runtimeStr == "openclaw" || runtimeStr == "hermes"

	agentDir, err := b.paths.SafeAgentDir(runtimeStr, agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	if !usesNativeHarness {
		if err := SaveAgentPersonality(agentDir, personality); err != nil {
			return errResult(fmt.Sprintf("failed to save personality: %v", err))
		}
	} else {
		// Still create the agent dir for .runtime marker and COMPANY.md
		_ = os.MkdirAll(agentDir, 0700)
	}

	// Persist the runtime to disk so cold sync can recover it on a fresh SQLite.
	// The file watcher ignores .runtime (not in knownFileKeys), so this won't
	// trigger any spurious sync events.
	_ = os.WriteFile(filepath.Join(agentDir, ".runtime"), []byte(runtimeStr), 0600)

	// Set up in the runtime.
	// For setup we bypass availability checks — SetupAgent for claude-code and
	// codex only writes personality files and never needs the binary installed.
	// ResolveAdapter would silently fall back to openclaw when the binary is
	// missing, which misregisters the agent under the wrong runtime.
	if err := adapter.SetupAgent(agentId, personality); err != nil {
		// Roll back the on-disk agent dir we created at line 68 so a failed
		// setup doesn't leave a phantom workspace that confuses cold sync
		// (.runtime would survive, then sync_engine would re-import the
		// half-broken agent on next start).
		if removeErr := b.removeAgentDirForRollback(agentDir); removeErr != nil {
			log.Printf("[setup-agent] warning: failed to roll back %s after setup error: %v", agentDir, removeErr)
		}
		return errResult(fmt.Sprintf("failed to setup agent in %s: %v", adapter.Name(), err))
	}

	// Post-condition check: for OpenClaw non-main agents, the agent MUST be
	// in openclaw.json's agents.list or chat sessions will fail with
	// "Agent X no longer exists in configuration". Surface a real error
	// instead of silently returning success on a half-completed setup.
	// We deliberately do NOT gate on Available() — once the caller asked for
	// runtime=openclaw, ending up missing from openclaw.json is always wrong;
	// the silent-no-op fallback was hiding real config corruption (e.g. stale
	// channel/plugin entries that make `openclaw agents add` exit 1).
	if RuntimeType(runtimeStr) == RuntimeOpenClaw && agentId != "main" {
		if _, err := os.Stat(filepath.Join(b.paths.OpenClaw, "openclaw.json")); err == nil {
			if !agentExistsInConfig(b.paths, agentId) {
				if removeErr := b.removeAgentDirForRollback(agentDir); removeErr != nil {
					log.Printf("[setup-agent] warning: failed to roll back %s after registration miss: %v", agentDir, removeErr)
				}
				return errResult(fmt.Sprintf("agent %q created on disk but missing from openclaw.json agents.list — chat will fail. If this happened repeatedly, openclaw.json is likely invalid; run `openclaw doctor --fix` and retry.", agentId))
			}
		}
	}

	// Write identity directly to SQLite so list-agent-identities returns the new
	// agent immediately — without waiting for the async file watcher to pick it up.
	// Store runtimeStr (user's intent) rather than adapter.Name() so that if the
	// preferred runtime fell back to openclaw (binary not yet installed), the agent
	// is still recorded with the correct runtime label.
	if b.store != nil {
		_ = b.store.UpsertAgentIdentity(store.AgentIdentity{
			ID:      agentId,
			Name:    displayName,
			Emoji:   emoji,
			Runtime: runtimeStr,
		})
	}

	// Note: ~/.claude/projects/<agentId>/ is created lazily on first claude-code-send
	// so that agent creation does NOT add phantom entries to the Claude Code project list.

	// Invalidate cache and notify hub so the dashboard auto-refreshes.
	b.InvalidateTeamCache()
	if b.onAgentsChanged != nil {
		go b.onAgentsChanged()
	}

	log.Printf("[agent] setup %s in %s runtime", agentId, adapter.Name())
	if b.store != nil {
		go func() { _ = SyncTeamModeBootstrap(b.store, b.paths) }()
	}

	return okResult(map[string]interface{}{
		"success": true,
		"agentId": agentId,
		"runtime": string(adapter.Name()),
	})
}

// runAgentTask executes a task as the specified agent through the chosen runtime.
// Params:
//   - agentId (string): agent identifier
//   - task (string): the task/prompt to execute
//   - runtime (string): preferred runtime (optional, auto-detects if omitted)
func (b *BridgeHandler) runAgentTask(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	agentId = strings.TrimSpace(agentId)
	if err := ValidateAgentID(agentId); err != nil {
		return errResultStatus(err.Error(), 400)
	}

	task, _ := params["task"].(string)
	if task == "" {
		return errResultStatus("task is required", 400)
	}

	runtimeStr, _ := params["runtime"].(string)
	if runtimeStr == "" {
		runtimeStr = "openclaw"
	}

	// Load personality from ~/.hyperclaw/agents/{runtime}-{id}/
	agentDir, err := b.paths.SafeAgentDir(runtimeStr, agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	personality := LoadAgentPersonality(agentDir, agentId)

	adapter := ResolveAdapter(RuntimeType(runtimeStr), b.paths)
	if adapter == nil {
		return errResult(fmt.Sprintf("no available runtime (preferred: %s)", runtimeStr))
	}

	log.Printf("[agent] running task for %s via %s: %.80s", agentId, adapter.Name(), task)

	result := adapter.RunTask(agentId, task, personality)

	return okResult(result)
}

// sendAgentMessage routes a message from one agent to another. The target
// agent's runtime is auto-detected from agent_identity, so callers don't
// need to know the runtime ahead of time. The message is prefixed with the
// sender's identifier so the receiving agent has caller context.
//
// This is the agent-to-agent (A2A) entry point. It's a wrapper around
// adapter.RunTask but with three differences from runAgentTask:
//  1. runtime is looked up by id, not passed in
//  2. message is decorated with the sender's id for context
//  3. response shape includes from/to/runtime so the caller can render the
//     conversation without a second round-trip to find out who said what
//
// Params:
//   - toAgentId (required): recipient agent id
//   - message (required): the prompt/message body
//   - fromAgentId (optional): sender id; if omitted, taken from
//     params["requestingAgentId"] which the MCP layer auto-populates
func (b *BridgeHandler) sendAgentMessage(params map[string]interface{}) actionResult {
	toAgentId, _ := params["toAgentId"].(string)
	toAgentId = strings.TrimSpace(toAgentId)
	if err := ValidateAgentID(toAgentId); err != nil {
		return errResultStatus(err.Error(), 400)
	}
	message, _ := params["message"].(string)
	if message == "" {
		return errResultStatus("message is required", 400)
	}

	fromAgentId, _ := params["fromAgentId"].(string)
	if fromAgentId == "" {
		fromAgentId, _ = params["requestingAgentId"].(string)
	}

	// Refuse self-messaging — it always indicates a caller bug, and adapters
	// would happily start a session with the agent talking to itself.
	if fromAgentId != "" && strings.EqualFold(fromAgentId, toAgentId) {
		return errResultStatus("agent cannot message itself", 400)
	}

	// Resolve the target agent's runtime from agent_identity. This is the
	// authoritative source — the same table the dashboard reads.
	if b.store == nil {
		return errResult("store not available")
	}
	identity, err := b.store.GetAgentIdentity(toAgentId)
	if err != nil {
		return errResult(fmt.Sprintf("failed to resolve agent %q: %v", toAgentId, err))
	}
	if identity == nil {
		return errResultStatus(fmt.Sprintf("agent %q not found", toAgentId), 404)
	}

	runtimeStr := identity.Runtime
	if runtimeStr == "" {
		runtimeStr = "openclaw"
	}
	adapter := ResolveAdapter(RuntimeType(runtimeStr), b.paths)
	if adapter == nil {
		return errResult(fmt.Sprintf("agent %q runtime %q is not available on this device", toAgentId, runtimeStr))
	}

	// Decorate the message with the sender's identity so the receiving
	// agent knows who it's talking to. Prefix is plain text — every runtime
	// can read it without parsing structured metadata.
	decorated := message
	if fromAgentId != "" {
		decorated = fmt.Sprintf("[Message from agent %q]\n\n%s", fromAgentId, message)
	}

	agentDir, err := b.paths.SafeAgentDir(runtimeStr, toAgentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	personality := LoadAgentPersonality(agentDir, toAgentId)

	// Session continuity: build a stable per-(from,to) thread key. The KV
	// store persists the runtime-native session id (whatever the adapter
	// returned last time) so subsequent calls can resume. If the caller
	// explicitly passes sessionId, use that as a forced override —
	// useful for fan-out scenarios where the same pair has multiple threads.
	threadKey := a2aThreadKey(fromAgentId, toAgentId)
	caller, _ := params["sessionId"].(string)
	priorSessionRef := caller
	if priorSessionRef == "" && b.store != nil && threadKey != "" {
		stored, _ := b.store.KVGet(threadKey)
		priorSessionRef = stored
	}

	log.Printf("[agent-send] %q -> %q via %s (resume=%q): %.80s",
		fromAgentId, toAgentId, adapter.Name(), priorSessionRef, message)

	var result AgentRunResult
	if sa, ok := adapter.(SessionAwareAdapter); ok {
		result = sa.RunTaskInSession(toAgentId, decorated, personality, priorSessionRef)
	} else {
		// Adapter doesn't support sessions yet (e.g. Codex, Hermes).
		// Conversation will not carry history across calls — agents calling
		// these runtimes will see each message as a fresh exchange.
		result = adapter.RunTask(toAgentId, decorated, personality)
	}

	// Persist the session id the adapter returned (it may have been
	// generated fresh on this call). Empty session id means the runtime
	// has no resume mechanism wired yet — skip KV write so we don't poison
	// the next call.
	if result.Success && result.SessionID != "" && b.store != nil && threadKey != "" {
		if err := b.store.KVSet(threadKey, result.SessionID); err != nil {
			log.Printf("[agent-send] warning: failed to persist session %q for %q: %v", result.SessionID, threadKey, err)
		}
	}

	resp := map[string]interface{}{
		"success":     result.Success,
		"toAgentId":   toAgentId,
		"fromAgentId": fromAgentId,
		"runtime":     string(adapter.Name()),
		"mode":        result.Mode,
		"threadKey":   threadKey,
	}
	if result.SessionID != "" {
		resp["sessionId"] = result.SessionID
	}
	if result.Content != "" {
		resp["response"] = result.Content
	}
	if result.Error != "" {
		resp["error"] = result.Error
	}
	return okResult(resp)
}

// a2aThreadKey builds the KV key for the (from, to) conversation thread.
// Sanitises ids so SQL/path-special chars don't break the key. Returns "" if
// either side is empty — in which case the caller should not persist.
func a2aThreadKey(fromAgentId, toAgentId string) string {
	if toAgentId == "" {
		return ""
	}
	clean := func(s string) string {
		s = strings.ToLower(strings.TrimSpace(s))
		// keep alnum, dash, underscore, dot; replace others with '-'
		var b strings.Builder
		for _, r := range s {
			switch {
			case (r >= 'a' && r <= 'z'), (r >= '0' && r <= '9'), r == '-', r == '_', r == '.':
				b.WriteRune(r)
			default:
				b.WriteRune('-')
			}
		}
		return b.String()
	}
	from := clean(fromAgentId)
	if from == "" {
		from = "anon"
	}
	return "a2a:session:" + from + ":" + clean(toAgentId)
}

// getAgentPersonality reads the personality files for an agent.
// Always reads from the Hyperclaw-internal dir (~/.hyperclaw/agents/{id}/)
// which is the canonical store for all runtimes. The runtime-specific dirs
// (e.g. ~/.claude/projects/{id}/CLAUDE.md) are derived outputs, not sources.
// Params:
//   - agentId (string): agent identifier
func (b *BridgeHandler) getAgentPersonality(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	agentId = strings.TrimSpace(agentId)
	if err := ValidateAgentID(agentId); err != nil {
		return errResultStatus(err.Error(), 400)
	}

	// Always read from the Hyperclaw canonical store, never from the runtime dir.
	agentDir := b.agentDirFor(agentId)
	personality := LoadAgentPersonality(agentDir, agentId)

	return okResult(map[string]interface{}{
		"agentId":   agentId,
		"soul":      personality.Soul,
		"identity":  personality.Identity,
		"agents":    personality.Agents,
		"tools":     personality.Tools,
		"user":      personality.User,
		"heartbeat": personality.Heartbeat,
		"memory":    personality.Memory,
		"empty":     personality.IsEmpty(),
	})
}

// refreshClaudeMd regenerates CLAUDE.md in the canonical agent directory
// (~/.hyperclaw/agents/{agentId}/). Called after any personality save
// for claude-code agents so Claude Code always sees up-to-date context.
func (b *BridgeHandler) refreshClaudeMd(agentId string) {
	agentDir, err := b.paths.SafeAgentDir("claude-code", agentId)
	if err != nil {
		log.Printf("[agent] skipping CLAUDE.md refresh for invalid agentId %q: %v", agentId, err)
		return
	}
	personality := LoadAgentPersonality(agentDir, agentId)
	claudeMd := AssembleClaudeMd(personality)
	if claudeMd == "" {
		return
	}
	_ = os.WriteFile(filepath.Join(agentDir, "CLAUDE.md"), []byte(claudeMd), 0600)
}

// saveAgentFileSingle handles the "save-agent-file" bridge action.
// Writes a single personality file (by fileKey) to the Hyperclaw-internal dir
// and syncs SQLite. For claude-code agents it also regenerates CLAUDE.md.
// Params:
//   - agentId (string): agent identifier
//   - fileKey (string): e.g. "SOUL", "IDENTITY", "TOOLS"
//   - content (string): file content
func (b *BridgeHandler) saveAgentFileSingle(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	fileKey, _ := params["fileKey"].(string)
	content, _ := params["content"].(string)
	agentId = strings.TrimSpace(agentId)
	if err := ValidateAgentID(agentId); err != nil {
		return errResultStatus(err.Error(), 400)
	}
	if strings.TrimSpace(fileKey) == "" {
		return errResultStatus("fileKey is required", 400)
	}
	if len(content) > 512*1024 {
		return errResultStatus(fileKey+" content too large (max 512KB)", 400)
	}

	runtime := b.resolveAgentRuntime(agentId)
	agentDir, err := b.paths.SafeAgentDir(runtime, agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	if err := os.MkdirAll(agentDir, 0700); err != nil {
		return errResult("failed to create agent dir: " + err.Error())
	}

	normalizedFileKey, filePath, err := safeAgentFileTarget(agentDir, fileKey)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	if b.syncEngine != nil {
		if err := b.syncEngine.WriteAgentFile(agentId, normalizedFileKey, content, filePath, runtime); err != nil {
			return errResultStatus("write failed: "+err.Error(), 500)
		}
	} else {
		if err := os.WriteFile(filePath, []byte(content), 0600); err != nil {
			return errResult("write failed: " + err.Error())
		}
	}

	// Regenerate CLAUDE.md so Claude Code immediately sees the updated context.
	if runtime == "claude-code" {
		b.refreshClaudeMd(agentId)
	}

	return okResult(map[string]interface{}{"success": true, "agentId": agentId, "fileKey": normalizedFileKey})
}

// resolveAgentRuntime looks up the agent's runtime from the identity store.
// Returns empty string when the store has no record (e.g. cold start, or agent
// created outside the identity registry). Callers should treat the empty
// string as "use legacy un-namespaced dir" for back-compat reads.
func (b *BridgeHandler) resolveAgentRuntime(agentId string) string {
	if b.store == nil {
		return ""
	}
	id, err := b.store.GetAgentIdentity(agentId)
	if err != nil || id == nil {
		return ""
	}
	return id.Runtime
}

// agentDirFor returns the canonical agent directory, preferring the new
// runtime-namespaced layout (~/.hyperclaw/agents/{runtime}-{id}/). When the
// runtime is unknown AND a legacy ~/.hyperclaw/agents/{id}/ exists on disk,
// returns the legacy path to preserve pre-0.5.6 installs.
func (b *BridgeHandler) agentDirFor(agentId string) string {
	runtime := b.resolveAgentRuntime(agentId)
	if runtime != "" {
		if dir, err := b.paths.SafeAgentDir(runtime, agentId); err == nil {
			return dir
		}
		return ""
	}
	legacy, err := b.paths.SafeLegacyAgentDir(agentId)
	if err != nil {
		return ""
	}
	if _, err := os.Stat(legacy); err == nil {
		return legacy
	}
	// No runtime, no legacy dir — fall back to the legacy format so callers
	// that create the dir (e.g. os.MkdirAll) still have a deterministic path.
	return legacy
}

// runtimeAgentDir returns the on-disk directory where personality files live
// for the given agent, based on the runtime stored in SQLite.
// This is the directory that the runtime process actually reads from.
//
// As of v0.5.6 all runtimes share the ~/.hyperclaw/agents/{runtime}-{id}/
// layout except Hermes (which keeps its native single-agent root). OpenClaw
// legacy workspaces under ~/.openclaw/workspace* are migrated on provision.
func (b *BridgeHandler) runtimeAgentDir(agentId, runtime string) string {
	home := b.paths.Home
	switch runtime {
	case "hermes":
		if err := ValidateAgentID(agentId); err != nil {
			return ""
		}
		// Hermes stores files directly in ~/.hermes/ (single agent)
		return filepath.Join(home, ".hermes")
	default:
		dir, err := b.paths.SafeAgentDir(runtime, agentId)
		if err != nil {
			return ""
		}
		return dir
	}
}

// saveAgentPersonality writes personality files for an agent.
// Params:
//   - agentId (string): agent identifier
//   - soul, identity, agents, tools, user, heartbeat, memory (string): file contents
//
// Writes are sent to the runtime's actual directory (e.g. ~/.openclaw/workspace-{id}/)
// so OpenClaw / Claude Code / Hermes / Codex immediately see the changes.
// The SyncEngine also updates the SQLite agent_files table atomically.
func (b *BridgeHandler) saveAgentPersonality(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	agentId = strings.TrimSpace(agentId)
	if err := ValidateAgentID(agentId); err != nil {
		return errResultStatus(err.Error(), 400)
	}

	personality := AgentPersonality{
		AgentID:   agentId,
		Soul:      strParam(params, "soul"),
		Identity:  strParam(params, "identity"),
		Agents:    strParam(params, "agents"),
		Tools:     strParam(params, "tools"),
		User:      strParam(params, "user"),
		Heartbeat: strParam(params, "heartbeat"),
		Memory:    strParam(params, "memory"),
	}

	// Always write to the Hyperclaw-internal dir — it is the canonical store.
	// Runtime-specific formats (CLAUDE.md, SOUL.md in hermes) are derived outputs.
	runtime := b.resolveAgentRuntime(agentId)
	agentDir, err := b.paths.SafeAgentDir(runtime, agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}

	if b.syncEngine != nil {
		// Route each non-empty file through the SyncEngine so the SQLite
		// agent_files table is kept in sync without waiting for the file watcher.
		type fileEntry struct {
			fileKey  string
			fileName string
			content  string
		}
		entries := []fileEntry{
			{"SOUL", "SOUL.md", personality.Soul},
			{"IDENTITY", "IDENTITY.md", personality.Identity},
			{"AGENTS", "AGENTS.md", personality.Agents},
			{"TOOLS", "TOOLS.md", personality.Tools},
			{"USER", "USER.md", personality.User},
			{"HEARTBEAT", "HEARTBEAT.md", personality.Heartbeat},
			{"MEMORY", "MEMORY.md", personality.Memory},
		}
		if err := os.MkdirAll(agentDir, 0700); err != nil {
			return errResult(fmt.Sprintf("failed to create agent dir: %v", err))
		}
		for _, e := range entries {
			if e.content == "" {
				continue
			}
			if len(e.content) > 512*1024 {
				return errResultStatus(e.fileKey+" file too large (max 512KB)", 400)
			}
			runtimePath := filepath.Join(agentDir, e.fileName)

			// Append-only invariant: if the user already authored
			// content in this file, we never replace it. Read the
			// current contents, swap (or append) ONLY the managed
			// block, and write the merged result. Re-runs of
			// setup-agent against the same file replace just our
			// section; the user's authored prose survives forever.
			merged := e.content
			if existing, readErr := os.ReadFile(runtimePath); readErr == nil {
				merged = MergePersonalityContent(string(existing), e.content)
			} else if !os.IsNotExist(readErr) {
				return errResultStatus(fmt.Sprintf("read %s: %v", e.fileName, readErr), 500)
			} else {
				// Fresh file → still wrap so subsequent writes can
				// find the managed block to replace.
				merged = MergePersonalityContent("", e.content)
			}
			if err := b.syncEngine.WriteAgentFile(agentId, e.fileKey, merged, runtimePath, runtime); err != nil {
				return errResultStatus("write failed: "+err.Error(), 500)
			}
		}
	} else {
		// Fallback: direct writes when SyncEngine is not available.
		if err := SaveAgentPersonality(agentDir, personality); err != nil {
			return errResult(fmt.Sprintf("failed to save personality: %v", err))
		}
	}

	// Regenerate CLAUDE.md so Claude Code immediately sees all updated context.
	if runtime == "claude-code" {
		b.refreshClaudeMd(agentId)
	}

	return okResult(map[string]interface{}{
		"success": true,
		"agentId": agentId,
	})
}

func (b *BridgeHandler) removeAgentDirForRollback(agentDir string) error {
	if err := ensurePathWithinBase(b.paths.AgentsDir(), agentDir); err != nil {
		return err
	}
	return os.RemoveAll(agentDir)
}

// listAvailableRuntimes returns which runtimes are installed and available.
func (b *BridgeHandler) listAvailableRuntimes() actionResult {
	paths := b.paths

	type runtimeInfo struct {
		Name       string `json:"name"`
		Available  bool   `json:"available"`
		Status     string `json:"status,omitempty"`
		AuthStatus string `json:"authStatus,omitempty"`
		SyncStatus string `json:"syncStatus,omitempty"`
		ToolMode   string `json:"toolMode,omitempty"`
		Message    string `json:"message,omitempty"`
	}

	runtimes := []runtimeInfo{
		{Name: string(RuntimeOpenClaw), Available: NewOpenClawAdapter(paths).Available()},
		{Name: string(RuntimeHermes), Available: NewHermesAdapter(paths).Available()},
		{Name: string(RuntimeClaude), Available: NewClaudeCodeAdapter(paths).Available()},
		{Name: string(RuntimeCodex), Available: NewCodexAdapter(paths).Available()},
	}

	// Also list agents that have been set up
	agentsDir := paths.AgentsDir()
	var agents []string
	if entries, err := os.ReadDir(agentsDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				agents = append(agents, e.Name())
			}
		}
	}

	// Check for existing Hermes profiles
	hermesProfilesDir := filepath.Join(paths.Home, ".hermes", "profiles")
	var hermesProfiles []string
	if entries, err := os.ReadDir(hermesProfilesDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				hermesProfiles = append(hermesProfiles, e.Name())
			}
		}
	}

	if b.store != nil {
		if bootstrap, err := b.store.ListTeamRuntimeBootstrap(); err == nil {
			byRuntime := make(map[string]store.TeamRuntimeBootstrap, len(bootstrap))
			for _, item := range bootstrap {
				byRuntime[item.Runtime] = item
			}
			for i := range runtimes {
				if item, ok := byRuntime[runtimes[i].Name]; ok {
					runtimes[i].Status = item.Status
					runtimes[i].AuthStatus = item.AuthStatus
					runtimes[i].SyncStatus = item.SyncStatus
					runtimes[i].ToolMode = item.ToolMode
					runtimes[i].Message = item.Message
					// Only use store's Detected as a positive signal; never let
					// stale store data override a live filesystem availability check.
					if item.Detected {
						runtimes[i].Available = true
					}
				}
			}
		}
	}

	return okResult(map[string]interface{}{
		"runtimes":       runtimes,
		"agents":         agents,
		"hermesProfiles": hermesProfiles,
	})
}

// strParam safely extracts a string parameter from the params map.
func strParam(params map[string]interface{}, key string) string {
	v, _ := params[key].(string)
	return v
}

// marshalJSON is a helper to convert a value to pretty JSON string (for logging).
func marshalJSON(v interface{}) string {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(data)
}
