package bridge

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// getAgentIdentity handles the "get-agent-identity" bridge action.
// Reads from the agent_identity SQLite table. When avatar_data is empty
// and the agent has a local avatar file referenced in IDENTITY.md (synced
// to agent_files), reads the file from disk and returns it as a data URI.
func (b *BridgeHandler) getAgentIdentity(params map[string]interface{}) actionResult {
	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId required", 400)
	}
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, err := b.store.GetAgentIdentity(agentID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if id == nil {
		// Return empty identity — dashboard treats missing as defaults.
		id = &store.AgentIdentity{ID: agentID}
	}

	// If runtime is not recorded in SQLite, try reading the .runtime file that
	// setup-agent writes to ~/.hyperclaw/agents/{id}/.runtime. Agents created via
	// add-agent (OpenClaw) never write this file, so absence means "openclaw".
	if id.Runtime == "" {
		runtimeFile := filepath.Join(b.paths.AgentsDir(), agentID, ".runtime")
		if data, ferr := os.ReadFile(runtimeFile); ferr == nil {
			id.Runtime = strings.TrimSpace(string(data))
		}
		if id.Runtime == "" {
			id.Runtime = "openclaw"
		}
	}

	// Read IDENTITY.md once — used for both avatar resolution and projectPath extraction.
	var identityContent string
	if f, ferr := b.store.GetAgentFile(agentID, "IDENTITY"); ferr == nil && f != nil {
		identityContent = f.Content
	}

	// If avatar_data is empty, try resolving from the IDENTITY.md content.
	if id.AvatarData == "" && identityContent != "" {
		id.AvatarData = b.resolveAvatarFromContent(identityContent, agentID)
	}

	// Build response as a map so we can include extra fields not in the DB struct.
	data := map[string]interface{}{
		"id":         id.ID,
		"name":       id.Name,
		"avatarData": id.AvatarData,
		"emoji":      id.Emoji,
		"runtime":    id.Runtime,
		"updatedAt":  id.UpdatedAt,
	}
	if projectPath := extractIdentityFieldValue(identityContent, "project"); projectPath != "" {
		data["projectPath"] = projectPath
	}

	return okResult(map[string]interface{}{"success": true, "data": data})
}

// resolveProjectPathFromIdentityFile reads the project path from the agent's
// synced IDENTITY.md (agent_files table). Returns "" if not set.
func (b *BridgeHandler) resolveProjectPathFromIdentityFile(agentID string) string {
	if b.store == nil {
		return ""
	}
	f, err := b.store.GetAgentFile(agentID, "IDENTITY")
	if err != nil || f == nil || f.Content == "" {
		return ""
	}
	return extractIdentityFieldValue(f.Content, "project")
}

// resolveAvatarFromContent resolves an avatar from already-loaded IDENTITY.md content.
// Reads the avatar filename and returns it as a base64 data URI. Returns "" if anything fails.
func (b *BridgeHandler) resolveAvatarFromContent(content, agentID string) string {
	avatarVal := extractIdentityFieldValue(content, "avatar")
	if avatarVal == "" {
		return ""
	}
	// Skip URLs and data URIs — only handle local filenames
	lower := strings.ToLower(avatarVal)
	if strings.HasPrefix(lower, "http") || strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "/") {
		return ""
	}
	// Must have an image extension
	ext := strings.ToLower(filepath.Ext(avatarVal))
	var mime string
	switch ext {
	case ".png":
		mime = "image/png"
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	case ".gif":
		mime = "image/gif"
	case ".webp":
		mime = "image/webp"
	case ".svg":
		mime = "image/svg+xml"
	default:
		return ""
	}
	// Build candidate paths — check Hyperclaw agent dir first, then OpenClaw workspaces.
	folder := "workspace-" + agentID
	if agentID == "main" {
		folder = "workspace"
	}
	// Hyperclaw-internal agent dir (claude-code, codex, hyperclaw agents).
	// Try the new runtime-namespaced layout first, then fall back to legacy.
	candidates := []string{
		filepath.Join(b.agentDirFor(agentID), avatarVal),
		filepath.Join(b.paths.LegacyAgentDir(agentID), avatarVal),
	}
	// OpenClaw workspace dirs
	for _, base := range []string{b.paths.OpenClaw, b.paths.OpenClawAlt} {
		if base != "" {
			candidates = append(candidates, filepath.Join(base, folder, avatarVal))
		}
	}
	for _, path := range candidates {
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			continue
		}
		encoded := base64.StdEncoding.EncodeToString(data)
		return "data:" + mime + ";base64," + encoded
	}
	return ""
}

// extractIdentityFieldValue parses a single field value from IDENTITY.md content.
// Supports "- **Field:** value", "**Field:** value", "Field: value" formats.
func extractIdentityFieldValue(content, field string) string {
	lfield := strings.ToLower(field)
	prefixes := []string{
		"- **" + lfield + ":**",
		"**" + lfield + ":**",
		"- " + lfield + ":",
		lfield + ":",
	}
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		ltrimmed := strings.ToLower(trimmed)
		for _, p := range prefixes {
			if strings.HasPrefix(ltrimmed, p) {
				val := strings.TrimSpace(trimmed[len(p):])
				if idx := strings.Index(val, "_("); idx >= 0 {
					val = strings.TrimSpace(val[:idx])
				}
				return val
			}
		}
	}
	return ""
}

// getAgentFile handles the "get-agent-file" bridge action.
// Reads from the agent_files SQLite table.
func (b *BridgeHandler) getAgentFile(params map[string]interface{}) actionResult {
	agentID, _ := params["agentId"].(string)
	fileKey, _ := params["fileKey"].(string)
	if agentID == "" || fileKey == "" {
		return errResultStatus("agentId and fileKey required", 400)
	}
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	f, err := b.store.GetAgentFile(agentID, fileKey)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if f == nil {
		return okResult(map[string]interface{}{"success": true, "data": nil})
	}
	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"content":   f.Content,
			"updatedAt": f.UpdatedAt,
		},
	})
}

// getAgentStats handles the "get-agent-stats" bridge action.
// Returns cost, tokens, session count, last active, and per-runtime breakdown.
func (b *BridgeHandler) getAgentStats(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	agentID, _ := params["agentId"].(string)
	var from, to int64
	if v, ok := params["from"].(float64); ok {
		from = int64(v)
	}
	if v, ok := params["to"].(float64); ok {
		to = int64(v)
	}
	if from == 0 && to == 0 {
		now := time.Now()
		from = now.AddDate(0, 0, -30).UnixMilli()
		to = now.UnixMilli()
	}
	stats, err := b.store.GetAgentStats(agentID, from, to)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": stats})
}

// listAgentIdentities handles the "list-agent-identities" bridge action.
// Returns all agent identities from SQLite — covers every runtime whose
// IDENTITY.md has been synced (openclaw, claude-code, codex, hermes).
func (b *BridgeHandler) listAgentIdentities() actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	allAgents, err := b.store.ListAgentIdentities()
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	// Filter out system directory names that were incorrectly synced as agents
	systemDirs := map[string]bool{
		"extensions": true, "logs": true, "identity": true,
		"flows": true, "agents": true, "workspace": true,
		"credentials": true, "media": true, "skills": true,
		"cron": true, "qqbot": true, "cache": true,
		"profiles": true, "sessions": true, "config": true,
	}
	var agents []store.AgentIdentity
	for _, a := range allAgents {
		if !systemDirs[a.ID] {
			agents = append(agents, a)
		}
	}
	// Fill in missing runtimes: check the .runtime file written by setup-agent;
	// if absent (OpenClaw agents use add-agent, never setup-agent), default to "openclaw".
	for i := range agents {
		if agents[i].Runtime == "" {
			runtimeFile := filepath.Join(b.paths.AgentsDir(), agents[i].ID, ".runtime")
			if data, ferr := os.ReadFile(runtimeFile); ferr == nil {
				agents[i].Runtime = strings.TrimSpace(string(data))
			}
			if agents[i].Runtime == "" {
				agents[i].Runtime = "openclaw"
			}
		}
	}
	storedAgents := make(map[string]store.Agent)
	if rows, err := b.store.GetAgents(); err == nil {
		for _, agent := range rows {
			storedAgents[agent.ID] = agent
		}
	}
	savedChannelConfigs := b.loadSavedAgentChannelConfigs()
	data := make([]map[string]interface{}, 0, len(agents))
	for _, agent := range agents {
		row := map[string]interface{}{
			"id":         agent.ID,
			"name":       agent.Name,
			"avatarData": agent.AvatarData,
			"emoji":      agent.Emoji,
			"runtime":    agent.Runtime,
			"role":       agent.Role,
			"updatedAt":  agent.UpdatedAt,
		}
		if stored, ok := storedAgents[agent.ID]; ok {
			if config, ok := publicAgentChannelConfig(stored.Config); ok {
				row["config"] = config
			}
		}
		if _, hasConfig := row["config"]; !hasConfig {
			if config, ok := publicSavedAgentChannelConfig(agent, agents, savedChannelConfigs); ok {
				row["config"] = config
			}
		}
		data = append(data, row)
	}
	return okResult(map[string]interface{}{"success": true, "data": data})
}

func (b *BridgeHandler) loadSavedAgentChannelConfigs() []onboardingRuntimeChannelConfig {
	if b.store == nil {
		return nil
	}
	var merged []onboardingRuntimeChannelConfig
	seen := map[string]bool{}
	for _, key := range []string{"onboarding-agent-channel-configs", "onboarding-runtime-channels"} {
		raw, err := b.store.KVGet(key)
		if err != nil || strings.TrimSpace(raw) == "" {
			continue
		}
		var configs []onboardingRuntimeChannelConfig
		if err := json.Unmarshal([]byte(raw), &configs); err != nil {
			continue
		}
		for _, cfg := range configs {
			configKey := savedAgentChannelConfigKey(cfg)
			if seen[configKey] {
				continue
			}
			seen[configKey] = true
			merged = append(merged, cfg)
		}
	}
	return merged
}

func savedAgentChannelConfigKey(cfg onboardingRuntimeChannelConfig) string {
	agentKey := strings.TrimSpace(cfg.AgentID)
	if agentKey == "" {
		agentKey = strings.ToLower(strings.TrimSpace(cfg.AgentName))
	}
	return strings.TrimSpace(cfg.Runtime) + ":" + agentKey
}

func publicSavedAgentChannelConfig(
	agent store.AgentIdentity,
	agents []store.AgentIdentity,
	configs []onboardingRuntimeChannelConfig,
) (map[string]interface{}, bool) {
	runtimeName := strings.TrimSpace(agent.Runtime)
	if runtimeName != "openclaw" && runtimeName != "hermes" {
		return nil, false
	}

	var exactByID *onboardingRuntimeChannelConfig
	var exactByName *onboardingRuntimeChannelConfig
	var runtimeOnly *onboardingRuntimeChannelConfig
	for i := range configs {
		cfg := &configs[i]
		if strings.TrimSpace(cfg.Runtime) != runtimeName {
			continue
		}
		cfgAgentID := strings.TrimSpace(cfg.AgentID)
		switch {
		case cfgAgentID != "" && sameAgentConfigID(runtimeName, cfgAgentID, agent.ID):
			exactByID = cfg
		case strings.TrimSpace(cfg.AgentName) != "" && strings.EqualFold(strings.TrimSpace(cfg.AgentName), strings.TrimSpace(agent.Name)):
			exactByName = cfg
		case cfgAgentID == "":
			runtimeOnly = cfg
		}
	}

	selected := exactByID
	if selected == nil {
		selected = exactByName
	}
	if selected == nil && runtimeOnly != nil && countAgentsForRuntime(agents, runtimeName) <= 1 {
		selected = runtimeOnly
	}
	if selected == nil || len(selected.Channels) == 0 {
		return nil, false
	}

	channelConfig := *selected
	channelConfig.Runtime = runtimeName
	channelConfig.AgentID = agent.ID
	channelConfig.AgentName = agent.Name
	return map[string]interface{}{
		"channels":      channelConfig.Channels,
		"channelConfig": channelConfig,
	}, true
}

func sameAgentConfigID(runtimeName, configID, agentID string) bool {
	if strings.EqualFold(configID, agentID) {
		return true
	}
	return runtimeName == "hermes" &&
		((configID == "main" && agentID == "__main__") || (configID == "__main__" && agentID == "main"))
}

func countAgentsForRuntime(agents []store.AgentIdentity, runtimeName string) int {
	count := 0
	for _, agent := range agents {
		if strings.TrimSpace(agent.Runtime) == runtimeName {
			count++
		}
	}
	return count
}

func publicAgentChannelConfig(raw string) (map[string]interface{}, bool) {
	if strings.TrimSpace(raw) == "" {
		return nil, false
	}
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return nil, false
	}

	public := make(map[string]interface{})
	if channels, ok := config["channels"]; ok {
		public["channels"] = channels
	}
	if channelConfig, ok := config["channelConfig"]; ok {
		public["channelConfig"] = channelConfig
	}
	if len(public) == 0 {
		return nil, false
	}
	return public, true
}

// getTokenUsage handles the "get-token-usage" bridge action.
// Returns aggregated cost and token counts.
func (b *BridgeHandler) getTokenUsage(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	agentID, _ := params["agentId"].(string)
	runtime, _ := params["runtime"].(string)
	groupBy, _ := params["groupBy"].(string)
	if groupBy == "" {
		groupBy = "agent"
	}
	var from, to int64
	if v, ok := params["from"].(float64); ok {
		from = int64(v)
	}
	if v, ok := params["to"].(float64); ok {
		to = int64(v)
	}
	if from == 0 && to == 0 {
		// Default: last 30 days
		now := time.Now()
		from = now.AddDate(0, 0, -30).UnixMilli()
		to = now.UnixMilli()
	}
	summaries, err := b.store.GetTokenUsage(agentID, runtime, from, to, groupBy)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": summaries})
}

// updateAgentIdentity handles the "update-agent-identity" bridge action.
// Persists name/emoji/avatar changes for any runtime agent directly to SQLite.
// Accepts partial updates — only fields present in params are changed.
func (b *BridgeHandler) updateAgentIdentity(params map[string]interface{}) actionResult {
	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId required", 400)
	}
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	// Load existing row so we can do a partial update
	existing, err := b.store.GetAgentIdentity(agentID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	identity := store.AgentIdentity{ID: agentID}
	if existing != nil {
		identity = *existing
	}

	if name, ok := params["name"].(string); ok {
		identity.Name = name
	}
	if emoji, ok := params["emoji"].(string); ok {
		identity.Emoji = emoji
	}
	if avatar, ok := params["avatarData"].(string); ok {
		identity.AvatarData = avatar
	}
	if runtime, ok := params["runtime"].(string); ok {
		if existing != nil && strings.TrimSpace(existing.Runtime) != "" && existing.Runtime != runtime {
			return errResultStatus("agent runtime cannot be changed after creation", 409)
		}
		identity.Runtime = runtime
	}

	if err := b.store.UpsertAgentIdentity(identity); err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true})
}

// openclawCleanupCheck handles the "openclaw-cleanup-check" bridge action.
// Returns the count of OpenClaw agents that would be affected by cleanup.
func (b *BridgeHandler) openclawCleanupCheck() actionResult {
	return b.runtimeCleanupCheck("openclaw")
}

// openclawCleanupExport handles the "openclaw-cleanup-export" bridge action.
// Returns all OpenClaw agent configurations as JSON for backup.
func (b *BridgeHandler) openclawCleanupExport() actionResult {
	return b.runtimeCleanupExport("openclaw")
}

// openclawCleanupDelete handles the "openclaw-cleanup-delete" bridge action.
// Permanently deletes all OpenClaw agents and related data from SQLite.
func (b *BridgeHandler) openclawCleanupDelete() actionResult {
	return b.runtimeCleanupDelete("openclaw")
}

// runtimeCleanupCheck handles the "runtime-cleanup-check" bridge action.
// Returns the count of agents for a runtime that would be affected by cleanup.
func (b *BridgeHandler) runtimeCleanupCheck(runtime string) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	count, err := b.store.CountAgentsByRuntime(runtime)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"count":   count,
			"runtime": runtime,
		},
	})
}

// runtimeCleanupExport handles the "runtime-cleanup-export" bridge action.
// Returns all agent configurations for a runtime as JSON for backup.
func (b *BridgeHandler) runtimeCleanupExport(runtime string) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	exports, err := b.store.ExportAgentsByRuntime(runtime)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"agents":  exports,
			"runtime": runtime,
			"count":   len(exports),
		},
	})
}

// runtimeCleanupDelete handles the "runtime-cleanup-delete" bridge action.
// Permanently deletes all agents and related data for a runtime from SQLite.
func (b *BridgeHandler) runtimeCleanupDelete(runtime string) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	deleted, err := b.store.DeleteAgentsByRuntime(runtime)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	// Trigger agents changed callback if registered
	if b.onAgentsChanged != nil {
		b.onAgentsChanged()
	}
	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"deleted": deleted,
			"runtime": runtime,
		},
	})
}

// runtimeCleanupCheckAction handles the generic "runtime-cleanup-check" bridge action.
func (b *BridgeHandler) runtimeCleanupCheckAction(params map[string]interface{}) actionResult {
	runtime, _ := params["runtime"].(string)
	if runtime == "" {
		return errResultStatus("runtime required", 400)
	}
	return b.runtimeCleanupCheck(runtime)
}

// runtimeCleanupExportAction handles the generic "runtime-cleanup-export" bridge action.
func (b *BridgeHandler) runtimeCleanupExportAction(params map[string]interface{}) actionResult {
	runtime, _ := params["runtime"].(string)
	if runtime == "" {
		return errResultStatus("runtime required", 400)
	}
	return b.runtimeCleanupExport(runtime)
}

// runtimeCleanupDeleteAction handles the generic "runtime-cleanup-delete" bridge action.
func (b *BridgeHandler) runtimeCleanupDeleteAction(params map[string]interface{}) actionResult {
	runtime, _ := params["runtime"].(string)
	if runtime == "" {
		return errResultStatus("runtime required", 400)
	}
	return b.runtimeCleanupDelete(runtime)
}

// checkOrphanedRuntimes handles the "check-orphaned-runtimes" bridge action.
// Returns a list of runtimes that have agents in the database but are not installed.
// Detection uses the same binary-finding logic as list-available-runtimes for consistency.
func (b *BridgeHandler) checkOrphanedRuntimes() actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	// Use the same detection functions as list-available-runtimes for consistency
	runtimes := []struct {
		runtime   string // runtime identifier in database
		isPresent bool   // whether the runtime binary is found
	}{
		{"openclaw", findOpenClawBinary() != ""},
		{"hermes", findHermesBinary() != ""},
	}

	var orphaned []map[string]interface{}

	for _, r := range runtimes {
		if r.isPresent {
			continue // Runtime CLI exists
		}

		count, err := b.store.CountAgentsByRuntime(r.runtime)
		if err != nil || count == 0 {
			continue // No agents
		}

		orphaned = append(orphaned, map[string]interface{}{
			"runtime":    r.runtime,
			"agentCount": count,
		})
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"orphaned": orphaned,
		},
	})
}

// checkOrphanedAgents handles the "check-orphaned-agents" bridge action.
// Returns a list of agents whose workspace directories no longer exist.
// This detects individually deleted agents, not just uninstalled runtimes.
func (b *BridgeHandler) checkOrphanedAgents() actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	// Get all agents from agent_identity table
	agents, err := b.store.ListAgentIdentities()
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}

	homeDir, _ := os.UserHomeDir()
	var orphaned []map[string]interface{}

	// Known system directories that should be excluded from orphan detection
	systemDirs := map[string]bool{
		"extensions": true, "logs": true, "identity": true,
		"flows": true, "agents": true, "workspace": true,
		"credentials": true, "media": true, "skills": true,
		"cron": true, "qqbot": true, "cache": true,
		"profiles": true, "sessions": true, "config": true,
	}

	for _, agent := range agents {
		// Skip system directory names that were incorrectly synced as agents
		if systemDirs[agent.ID] {
			continue
		}

		var workspaceDir string

		switch agent.Runtime {
		case "openclaw":
			// OpenClaw agents use workspace folders:
			//   "main" → ~/.openclaw/workspace/
			//   others → ~/.openclaw/workspace-{id}/
			if agent.ID == "main" {
				workspaceDir = filepath.Join(homeDir, ".openclaw", "workspace")
			} else {
				workspaceDir = filepath.Join(homeDir, ".openclaw", "workspace-"+agent.ID)
			}
		case "hermes":
			// Hermes "__main__" agent lives at ~/.hermes/ (the root home).
			// Other agents use profile folders at ~/.hermes/profiles/{id}/.
			if isHermesMainAgent(agent.ID) {
				workspaceDir = filepath.Join(homeDir, ".hermes")
			} else {
				workspaceDir = filepath.Join(homeDir, ".hermes", "profiles", agent.ID)
			}
		case "claude-code", "codex":
			// Claude Code and Codex don't have persistent workspaces per agent
			continue
		default:
			continue
		}

		// Check if workspace directory exists
		if _, err := os.Stat(workspaceDir); os.IsNotExist(err) {
			orphaned = append(orphaned, map[string]interface{}{
				"id":      agent.ID,
				"name":    agent.Name,
				"runtime": agent.Runtime,
				"avatar":  agent.AvatarData,
				"emoji":   agent.Emoji,
			})
		}
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"orphanedAgents": orphaned,
			"count":          len(orphaned),
		},
	})
}

// deleteOrphanedAgent handles the "delete-orphaned-agent" bridge action.
// Deletes a single orphaned agent from all database tables.
func (b *BridgeHandler) deleteOrphanedAgent(params map[string]interface{}) actionResult {
	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId required", 400)
	}
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	// Delete from all agent-related tables
	b.store.DeleteAgentFiles(agentID)
	b.store.DeleteAgentIdentity(agentID)
	b.store.ClearPrimarySession(agentID)
	b.store.DeleteAgent(agentID)

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"deleted": agentID,
		},
	})
}

// deleteAllOrphanedAgents handles the "delete-all-orphaned-agents" bridge action.
// Deletes all orphaned agents for a specific runtime.
func (b *BridgeHandler) deleteAllOrphanedAgents(params map[string]interface{}) actionResult {
	runtime, _ := params["runtime"].(string)
	if runtime == "" {
		return errResultStatus("runtime required", 400)
	}
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	// Get orphaned agents first
	agents, err := b.store.ListAgentIdentities()
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}

	homeDir, _ := os.UserHomeDir()
	systemDirs := map[string]bool{
		"extensions": true, "logs": true, "identity": true,
		"flows": true, "agents": true, "workspace": true,
		"credentials": true, "media": true, "skills": true,
		"cron": true, "qqbot": true, "cache": true,
	}

	var deleted []string
	for _, agent := range agents {
		if agent.Runtime != runtime || systemDirs[agent.ID] {
			continue
		}

		var workspaceDir string
		switch runtime {
		case "openclaw":
			workspaceDir = filepath.Join(homeDir, ".openclaw", agent.ID)
		case "hermes":
			workspaceDir = filepath.Join(homeDir, ".hermes", "agents", agent.ID)
		default:
			continue
		}

		// Only delete if workspace doesn't exist (orphaned)
		if _, err := os.Stat(workspaceDir); os.IsNotExist(err) {
			b.store.DeleteAgentFiles(agent.ID)
			b.store.DeleteAgentIdentity(agent.ID)
			b.store.ClearPrimarySession(agent.ID)
			b.store.DeleteAgent(agent.ID)
			deleted = append(deleted, agent.ID)
		}
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"deleted": deleted,
			"count":   len(deleted),
		},
	})
}
