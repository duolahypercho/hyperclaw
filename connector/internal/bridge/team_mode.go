package bridge

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

const (
	legacyTeamMCPName = "hyperclaw-team"
)

// ensureHyperclawAgentToolScripts is a placeholder for future per-agent
// tool-script materialization. The MCP server now exposes these tools live
// over /mcp, so agents that speak MCP no longer need on-disk scripts.
// Hermes-style fallback skill files are written by the agentic_stack adapter
// install path, not here. Keeping the call site so future per-runtime
// shimming can plug back in without re-threading SyncTeamModeBootstrap.
func ensureHyperclawAgentToolScripts(_ Paths) error { return nil }

func SyncTeamModeBootstrap(s *store.Store, paths Paths) error {
	if s == nil {
		return nil
	}
	if err := ensureHyperclawAgentToolScripts(paths); err != nil {
		return err
	}
	if err := removeLegacyTeamMCP(s, paths); err != nil {
		return err
	}
	statuses := []store.TeamRuntimeBootstrap{
		syncOpenClawTeamMode(paths),
		syncHermesTeamMode(paths),
		syncClaudeTeamMode(paths),
		syncCodexTeamMode(paths),
	}
	for _, status := range statuses {
		if err := s.UpsertTeamRuntimeBootstrap(status); err != nil {
			return err
		}
	}
	return SyncTeamModeBehavior(s, paths)
}

func syncOpenClawTeamMode(paths Paths) store.TeamRuntimeBootstrap {
	status := store.TeamRuntimeBootstrap{
		Runtime:    string(RuntimeOpenClaw),
		ToolMode:   "agentic-stack",
		AuthStatus: "ready",
		SyncStatus: "pending",
		Status:     "missing",
	}
	// Check 1: Binary must exist (use findOpenClawBinary which checks
	// known install paths like ~/.npm-global/bin/, not just daemon PATH)
	ocBin := findOpenClawBinary()
	if _, err := exec.LookPath(ocBin); err != nil {
		// LookPath failed even with the resolved path — truly not installed
		if _, statErr := os.Stat(ocBin); statErr != nil {
			status.Message = "OpenClaw CLI not found"
			return status
		}
	}
	// Check 2: OpenClaw must be set up (has identity or valid config with agents)
	// Running `openclaw uninstall` removes workspaces but leaves binary;
	// we should not inject MCP config into a fresh/uninstalled OpenClaw.
	if !isOpenClawSetUp(paths) {
		status.Message = "OpenClaw not set up (run: openclaw onboard)"
		return status
	}
	status.Detected = true
	status.Status = "available"
	status.ConfigPath = paths.ConfigPath()
	status.SyncStatus = "configured"
	status.Message = "Agentic stack owns runtime setup"
	return status
}

// isOpenClawSetUp returns true if OpenClaw is actively set up (not uninstalled).
// `openclaw uninstall` removes workspaces/agents but leaves binary and config metadata.
// We check for actual workspaces to distinguish "set up" from "uninstalled".
func isOpenClawSetUp(paths Paths) bool {
	// Check 1: Unified agents root has any agent directory (~/.hyperclaw/agents/<id>/)
	if entries, err := os.ReadDir(paths.AgentsDir()); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				return true
			}
		}
	}
	// Check 2: Legacy default workspace still exists (~/.openclaw/workspace/)
	workspacePath := filepath.Join(paths.OpenClaw, "workspace")
	if _, err := os.Stat(workspacePath); err == nil {
		return true
	}
	// Check 3: Legacy named workspaces (~/.openclaw/workspace-{id}/)
	entries, err := os.ReadDir(paths.OpenClaw)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() && strings.HasPrefix(e.Name(), "workspace-") {
				return true
			}
		}
	}
	// Check 4: Config has agents defined
	configPath := paths.ConfigPath()
	data, err := os.ReadFile(configPath)
	if err != nil {
		return false
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return false
	}
	if agents, ok := cfg["agents"].(map[string]interface{}); ok {
		if list, ok := agents["list"].([]interface{}); ok && len(list) > 0 {
			return true
		}
	}
	// No workspaces or agents = uninstalled or never fully set up
	return false
}

func syncHermesTeamMode(paths Paths) store.TeamRuntimeBootstrap {
	status := store.TeamRuntimeBootstrap{
		Runtime:    string(RuntimeHermes),
		ToolMode:   "agentic-stack",
		AuthStatus: "unknown",
		SyncStatus: "pending",
		Status:     "missing",
		ConfigPath: filepath.Join(paths.Hermes, "config.yaml"),
	}
	if findHermesBinary() == "" {
		status.Message = "Hermes CLI not found"
		return status
	}
	status.Detected = true
	status.Status = "available"
	if _, err := os.Stat(filepath.Join(paths.Hermes, ".env")); err == nil {
		status.AuthStatus = "ready"
	}
	status.SyncStatus = "configured"
	status.Message = "Agentic stack owns runtime setup"
	return status
}

func syncClaudeTeamMode(paths Paths) store.TeamRuntimeBootstrap {
	status := store.TeamRuntimeBootstrap{
		Runtime:    string(RuntimeClaude),
		ToolMode:   "agentic-stack",
		AuthStatus: "unknown",
		SyncStatus: "pending",
		Status:     "missing",
		ConfigPath: filepath.Join(paths.Home, ".claude", "settings.json"),
	}
	if findClaudeBinary() == "" {
		status.Message = "Claude Code CLI not found"
		return status
	}
	status.Detected = true
	status.Status = "available"
	status.SyncStatus = "configured"
	status.Message = "Agentic stack owns runtime setup"
	return status
}

func syncCodexTeamMode(paths Paths) store.TeamRuntimeBootstrap {
	status := store.TeamRuntimeBootstrap{
		Runtime:    string(RuntimeCodex),
		ToolMode:   "agentic-stack",
		AuthStatus: "needs_auth",
		SyncStatus: "pending",
		Status:     "missing",
		ConfigPath: filepath.Join(paths.Home, ".codex", "config.toml"),
	}
	if findCodexBinary() == "" {
		status.Message = "Codex CLI not found"
		return status
	}
	status.Detected = true
	status.Status = "available"
	if _, err := os.Stat(filepath.Join(paths.Home, ".codex", "auth.json")); err == nil {
		status.AuthStatus = "ready"
	}
	status.SyncStatus = "configured"
	status.Message = "Agentic stack owns runtime setup"
	return status
}

func removeLegacyTeamMCP(s *store.Store, paths Paths) error {
	if err := s.DeleteAgentMCPsByName(legacyTeamMCPName); err != nil {
		return err
	}
	// Runtime config cleanup is best-effort: malformed user config should not
	// block normal team/project status refresh.
	_ = removeLegacyClaudeMCP(filepath.Join(paths.Home, ".claude", "settings.json"))
	_ = removeLegacyOpenClawMCP(paths.ConfigPath())
	_ = removeLegacyHermesMCP(filepath.Join(paths.Hermes, "config.yaml"))
	_ = removeLegacyCodexMCP(filepath.Join(paths.Home, ".codex", "config.toml"))
	return nil
}

func removeLegacyClaudeMCP(configPath string) error {
	return removeLegacyJSONMCP(configPath, "mcpServers")
}

func removeLegacyOpenClawMCP(configPath string) error {
	raw, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return err
	}
	changed := false
	if changed = removeNamedMapEntry(cfg, "mcpServers", legacyTeamMCPName) || changed; changed {
		if mcpServers, _ := cfg["mcpServers"].(map[string]interface{}); len(mcpServers) == 0 {
			delete(cfg, "mcpServers")
		}
	}
	if mcpObj, _ := cfg["mcp"].(map[string]interface{}); mcpObj != nil {
		if removeNamedMapEntry(mcpObj, "servers", legacyTeamMCPName) {
			changed = true
			if servers, _ := mcpObj["servers"].(map[string]interface{}); len(servers) == 0 {
				delete(mcpObj, "servers")
			}
		}
		if len(mcpObj) == 0 {
			delete(cfg, "mcp")
		}
	}
	if !changed {
		return nil
	}
	encoded, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, append(encoded, '\n'), 0644)
}

func removeLegacyJSONMCP(configPath, key string) error {
	raw, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return err
	}
	if !removeNamedMapEntry(cfg, key, legacyTeamMCPName) {
		return nil
	}
	if nested, _ := cfg[key].(map[string]interface{}); len(nested) == 0 {
		delete(cfg, key)
	}
	encoded, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, append(encoded, '\n'), 0644)
}

func removeNamedMapEntry(parent map[string]interface{}, key, name string) bool {
	nested, _ := parent[key].(map[string]interface{})
	if nested == nil {
		return false
	}
	if _, ok := nested[name]; !ok {
		return false
	}
	delete(nested, name)
	return true
}

func removeLegacyHermesMCP(configPath string) error {
	raw, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	lines := strings.Split(string(raw), "\n")
	out := make([]string, 0, len(lines))
	changed := false
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if strings.TrimSpace(line) != legacyTeamMCPName+":" {
			out = append(out, line)
			continue
		}
		changed = true
		for i+1 < len(lines) && (strings.HasPrefix(lines[i+1], "    ") || strings.TrimSpace(lines[i+1]) == "") {
			i++
		}
	}
	if !changed {
		return nil
	}
	updated := strings.TrimRight(strings.Join(out, "\n"), "\n") + "\n"
	return os.WriteFile(configPath, []byte(updated), 0644)
}

func removeLegacyCodexMCP(configPath string) error {
	raw, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	lines := strings.Split(string(raw), "\n")
	out := make([]string, 0, len(lines))
	section := `[mcp_servers."` + legacyTeamMCPName + `"]`
	changed := false
	skipping := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == section {
			changed = true
			skipping = true
			continue
		}
		if skipping && strings.HasPrefix(trimmed, "[") {
			skipping = false
		}
		if skipping {
			continue
		}
		out = append(out, line)
	}
	if !changed {
		return nil
	}
	updated := strings.TrimRight(strings.Join(out, "\n"), "\n") + "\n"
	return os.WriteFile(configPath, []byte(updated), 0644)
}

func (b *BridgeHandler) getTeamModeStatus() actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	statuses, err := b.store.ListTeamRuntimeBootstrap()
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": statuses, "checkedAt": time.Now().UnixMilli()})
}

func (b *BridgeHandler) syncTeamMode() actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	if err := SyncTeamModeBootstrap(b.store, b.paths); err != nil {
		return errResultStatus("sync failed: "+err.Error(), 500)
	}
	statuses, err := b.store.ListTeamRuntimeBootstrap()
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": statuses})
}
