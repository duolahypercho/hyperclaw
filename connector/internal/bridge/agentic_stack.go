package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const agenticStackStateFile = ".agent/install.json"

// Marker tokens for auto-managed blocks inside user-owned files
// (e.g. AGENTS.md). These let us append/replace our content without
// touching anything the user wrote outside the block, and let the
// uninstaller strip our content cleanly.
const (
	agenticStackBlockBegin = "<!-- BEGIN HYPERCLAW AGENTIC STACK (managed) -->"
	agenticStackBlockEnd   = "<!-- END HYPERCLAW AGENTIC STACK (managed) -->"
	agenticStackBlockNote  = "<!-- Auto-managed by Hyperclaw. Edit anywhere outside this block; this section is regenerated each install. -->"
)

type agenticStackManifest struct {
	Name               string                  `json:"name"`
	Description        string                  `json:"description"`
	Files              []agenticStackFileEntry `json:"files"`
	SkillsLink         *agenticStackSkillsLink `json:"skills_link,omitempty"`
	PostInstall        []string                `json:"post_install,omitempty"`
	BrainRootPrimitive string                  `json:"brain_root_primitive,omitempty"`
	Templates          map[string]string       `json:"-"`
}

type agenticStackFileEntry struct {
	Src         string `json:"src"`
	Dst         string `json:"dst"`
	MergePolicy string `json:"merge_policy,omitempty"`
	Substitute  bool   `json:"substitute,omitempty"`
	FromStack   bool   `json:"from_stack,omitempty"`
}

type agenticStackSkillsLink struct {
	Target   string `json:"target"`
	Dst      string `json:"dst"`
	Fallback string `json:"fallback,omitempty"`
}

type agenticStackInstallDoc struct {
	Version  string                              `json:"version"`
	Updated  string                              `json:"updated_at"`
	Adapters map[string]agenticStackInstallEntry `json:"adapters"`
}

type agenticStackInstallEntry struct {
	InstalledAt          string                   `json:"installed_at"`
	FilesWritten         []string                 `json:"files_written"`
	FilesOverwritten     []string                 `json:"files_overwritten"`
	FilesAlerted         []string                 `json:"files_alerted"`
	FileResults          []map[string]string      `json:"file_results"`
	Logs                 []agenticStackLogEntry   `json:"logs,omitempty"`
	SkillsLink           *agenticStackSkillsLink  `json:"skills_link,omitempty"`
	SkillsLinkPreExisted bool                     `json:"skills_link_pre_existed,omitempty"`
	BrainRootPrimitive   string                   `json:"brain_root_primitive,omitempty"`
	PostInstallResults   []map[string]interface{} `json:"post_install_results,omitempty"`
}

type agenticStackLogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

var agenticStackBuiltinAdapters = map[string]agenticStackManifest{
	"claude-code": {
		Name:               "claude-code",
		Description:        "Claude Code (Anthropic) - CLAUDE.md instructions + .claude/settings.json hooks + MCP wiring.",
		BrainRootPrimitive: "$CLAUDE_PROJECT_DIR",
		Files: []agenticStackFileEntry{
			{Src: "CLAUDE.md", Dst: "CLAUDE.md", MergePolicy: "merge_or_alert"},
			{Src: "settings.json", Dst: ".claude/settings.json", MergePolicy: "merge_json", Substitute: true},
			{Src: ".mcp.json", Dst: ".mcp.json", MergePolicy: "merge_json", Substitute: true},
		},
		PostInstall: []string{"register_hyperclaw_mcp", "register_global_mcp"},
		Templates: map[string]string{
			"CLAUDE.md": `# Agentic Stack

Load the shared brain first:

1. Read {{BRAIN_ROOT}}/.agent/AGENTS.md.
2. Read {{BRAIN_ROOT}}/.agent/memory/personal/PREFERENCES.md if it exists.
3. Then read local project instructions.

The .agent folder is the portable source of truth for this employee's memory, skills, and protocols.

{{HYPERCLAW_TOOLS_CATALOG}}
`,
			".mcp.json": `{
  "mcpServers": {
    "hyperclaw": {
      "type": "http",
      "url": "{{HYPERCLAW_MCP_URL}}",
      "headers": {
        "Authorization": "Bearer {{HYPERCLAW_MCP_TOKEN}}"
      }
    }
  }
}
`,
			"settings.json": `{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "test -f {{ABS_AGENT_FILE}} && true"
          }
        ]
      }
    ]
  }
}
`,
		},
	},
	"codex": {
		Name:        "codex",
		Description: "OpenAI Codex CLI - AGENTS.md + .agents/skills mirror + per-workspace MCP.",
		Files: []agenticStackFileEntry{
			{Src: "AGENTS.md", Dst: "AGENTS.md", MergePolicy: "merge_or_alert"},
			{Src: "config.toml", Dst: ".codex/config.toml", MergePolicy: "overwrite", Substitute: true},
		},
		SkillsLink:  &agenticStackSkillsLink{Target: ".agent/skills", Dst: ".agents/skills", Fallback: "rsync_with_delete"},
		PostInstall: []string{"register_hyperclaw_mcp", "register_global_mcp"},
		Templates: map[string]string{
			"AGENTS.md": agenticStackAgentsTemplate("Codex"),
			"config.toml": `# Hyperclaw-managed Codex config. To use this workspace's MCP wiring,
# launch Codex with CODEX_HOME pointing here:
#   CODEX_HOME={{ABS_TARGET}}/.codex codex exec ...
#
# The bearer token is read from {{HYPERCLAW_MCP_TOKEN_PATH}} at install
# time and re-injected on every install. Rotate via:
#   hyperclaw-connector token rotate && ./install.sh add codex {{ABS_TARGET}}
[mcp_servers.hyperclaw]
type = "http"
url = "{{HYPERCLAW_MCP_URL}}"
headers = { Authorization = "Bearer {{HYPERCLAW_MCP_TOKEN}}" }
`,
		},
	},
	"cursor": {
		Name:        "cursor",
		Description: "Cursor - .cursor/rules instruction text.",
		Files: []agenticStackFileEntry{
			{Src: ".cursor/rules/agentic-stack.mdc", Dst: ".cursor/rules/agentic-stack.mdc", MergePolicy: "overwrite"},
		},
		Templates: map[string]string{
			".cursor/rules/agentic-stack.mdc": `---
description: Load the Agentic Stack brain before local instructions.
alwaysApply: true
---

Before working, read .agent/AGENTS.md and .agent/memory/personal/PREFERENCES.md when present. Treat .agent/ as the shared employee brain for memory, skills, and protocols.
`,
		},
	},
	"hermes": {
		Name:        "hermes",
		Description: "Hermes Agent - AGENTS.md workspace context with embedded curl-based tool catalog (no native MCP).",
		Files: []agenticStackFileEntry{
			{Src: "AGENTS.md", Dst: "AGENTS.md", MergePolicy: "merge_or_alert", Substitute: true},
		},
		PostInstall: []string{"register_hyperclaw_mcp", "register_global_mcp"},
		Templates: map[string]string{
			"AGENTS.md": agenticStackHermesAgentsTemplate(),
		},
	},
	"openclaw": {
		Name:        "openclaw",
		Description: "OpenClaw - AGENTS.md auto-injection + workspace registration + MCP wiring.",
		Files: []agenticStackFileEntry{
			{Src: "AGENTS.md", Dst: "AGENTS.md", MergePolicy: "merge_or_alert"},
			{Src: "config.md", Dst: ".openclaw-system.md", MergePolicy: "overwrite"},
			{Src: "mcp.json", Dst: ".openclaw/mcp.json", MergePolicy: "merge_json", Substitute: true},
		},
		PostInstall: []string{"openclaw_register_workspace", "register_hyperclaw_mcp", "register_global_mcp"},
		Templates: map[string]string{
			"AGENTS.md": agenticStackAgentsTemplate("OpenClaw"),
			"config.md": `# OpenClaw System Include

Read .agent/AGENTS.md before runtime-specific instructions. If .agent/memory/personal/PREFERENCES.md exists, load it before answering.
`,
			"mcp.json": `{
  "mcpServers": {
    "hyperclaw": {
      "type": "http",
      "url": "{{HYPERCLAW_MCP_URL}}",
      "headers": {
        "Authorization": "Bearer {{HYPERCLAW_MCP_TOKEN}}"
      }
    }
  }
}
`,
		},
	},
}

func agenticStackAgentsTemplate(runtimeName string) string {
	return fmt.Sprintf(`# Agentic Stack

This %s workspace is wired to the shared Hyperclaw employee brain.

Load order:

1. Read .agent/AGENTS.md.
2. Read .agent/memory/personal/PREFERENCES.md if present.
3. Load local runtime files such as AGENTS.md, CLAUDE.md, SOUL.md, or runtime config after the shared brain.

The .agent folder is portable across runtimes. Do not duplicate runtime-specific setup here; keep shared memory, skills, and protocols in .agent/.

%s
`, runtimeName, hyperclawToolsCatalogMarkdown())
}

// agenticStackHermesAgentsTemplate folds the curl-based MCP fallback contract
// directly into the workspace AGENTS.md. Hermes has no native MCP client, so
// the catalog + bearer-token recipe lives inline rather than in a separate
// SKILL.md — Hermes always reads AGENTS.md, so this is the most reliable
// pickup path. The outer envelope is wrapped in the agentic-stack managed
// block (merge_or_alert), so re-running install only replaces this section
// without disturbing user-authored content above or below.
func agenticStackHermesAgentsTemplate() string {
	return `# Agentic Stack

This Hermes workspace is wired to the shared Hyperclaw employee brain and the
local Hyperclaw connector's tool catalog.

Load order:

1. Read .agent/AGENTS.md.
2. Read .agent/memory/personal/PREFERENCES.md if present.
3. Load local runtime files (AGENTS.md, SOUL.md, runtime config) after the shared brain.

## Hyperclaw tool call (curl fallback)

Hermes has no native MCP client. To call any Hyperclaw tool, POST JSON to the
local MCP shorthand endpoint. The connector requires a bearer token — read it
from ` + "`{{HYPERCLAW_MCP_TOKEN_PATH}}`" + ` and pass it on every call:

` + "```bash\n" +
		`TOKEN="$(cat {{HYPERCLAW_MCP_TOKEN_PATH}})"
curl -s -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"<tool>","arguments":{...}}' \
  {{HYPERCLAW_MCP_CALL_URL}}` + "\n```\n\n" + `Destructive tools require ` + "`\"confirmed\":true`" + ` inside arguments.

{{HYPERCLAW_TOOLS_CATALOG}}
`
}

func (b *BridgeHandler) agenticStackAdapterList(params map[string]interface{}) actionResult {
	targetRoot, _, err := b.agenticStackTargetRoot(params)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	state, err := loadAgenticStackState(targetRoot)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	adapters := b.agenticStackAdapterSummaries(targetRoot, state)
	return okResult(map[string]interface{}{
		"success":    true,
		"targetRoot": targetRoot,
		"adapters":   adapters,
		"logs":       agenticStackLogsForState(targetRoot, state),
	})
}

func (b *BridgeHandler) agenticStackStatus(params map[string]interface{}) actionResult {
	targetRoot, _, err := b.agenticStackTargetRoot(params)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	state, err := loadAgenticStackState(targetRoot)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	brainRoot := filepath.Join(targetRoot, ".agent")
	brainPresent := dirExists(brainRoot)
	return okResult(map[string]interface{}{
		"success":      true,
		"targetRoot":   targetRoot,
		"brainRoot":    brainRoot,
		"brainPresent": brainPresent,
		"adapters":     b.agenticStackAdapterSummaries(targetRoot, state),
		"installState": filepath.Join(targetRoot, agenticStackStateFile),
		"logs":         agenticStackLogsForState(targetRoot, state),
	})
}

func (b *BridgeHandler) agenticStackAdapterAdd(params map[string]interface{}) actionResult {
	name, _ := params["adapter"].(string)
	if name == "" {
		name, _ = params["name"].(string)
	}
	manifest, ok := agenticStackBuiltinAdapters[name]
	if !ok {
		return okResult(map[string]interface{}{"success": false, "error": fmt.Sprintf("unknown adapter %q", name)})
	}
	targetRoot, stackRoot, err := b.agenticStackTargetRoot(params)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := validateAgenticStackManifest(manifest); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := ensureAgenticBrain(targetRoot, stackRoot); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}

	state, err := loadAgenticStackState(targetRoot)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	prior := state.Adapters[manifest.Name]
	entry := agenticStackInstallEntry{
		InstalledAt:        time.Now().UTC().Format(time.RFC3339),
		BrainRootPrimitive: manifest.BrainRootPrimitive,
	}
	logs := []agenticStackLogEntry{
		newAgenticStackLog("info", fmt.Sprintf("Installing %s adapter into %s", manifest.Name, targetRoot)),
	}
	priorOwned := map[string]bool{}
	for _, p := range prior.FilesWritten {
		priorOwned[p] = true
	}

	for _, file := range manifest.Files {
		content, err := agenticStackTemplateContent(manifest, file, targetRoot, stackRoot)
		if err != nil {
			return okResult(map[string]interface{}{"success": false, "error": err.Error()})
		}
		dst, err := ValidateRelativePath(targetRoot, file.Dst)
		if err != nil {
			return okResult(map[string]interface{}{"success": false, "error": err.Error()})
		}
		result, err := applyAgenticStackFile(dst, content, file.MergePolicy, priorOwned[file.Dst])
		if err != nil {
			log.Printf("[stack] %s: write %s FAILED: %v", manifest.Name, file.Dst, err)
			return okResult(map[string]interface{}{"success": false, "error": err.Error()})
		}
		log.Printf("[stack] %s: %s -> %s (%s)", manifest.Name, file.Dst, result, policyOrDefault(file.MergePolicy))
		switch result {
		case "written_new":
			entry.FilesWritten = append(entry.FilesWritten, file.Dst)
			logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Created %s", file.Dst)))
		case "block_written":
			entry.FilesWritten = append(entry.FilesWritten, file.Dst)
			logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Created %s with managed block", file.Dst)))
		case "block_appended":
			entry.FilesWritten = append(entry.FilesWritten, file.Dst)
			logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Added managed block to existing %s without changing your content", file.Dst)))
		case "block_replaced":
			entry.FilesWritten = append(entry.FilesWritten, file.Dst)
			logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Refreshed managed block in %s", file.Dst)))
		case "written_overwrite":
			if priorOwned[file.Dst] {
				entry.FilesWritten = append(entry.FilesWritten, file.Dst)
				logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Refreshed %s", file.Dst)))
			} else {
				entry.FilesOverwritten = append(entry.FilesOverwritten, file.Dst)
				logs = append(logs, newAgenticStackLog("warning", fmt.Sprintf("Overwrote pre-existing %s; it will be preserved on remove", file.Dst)))
			}
		case "skipped_existing", "left_alone":
			if priorOwned[file.Dst] {
				entry.FilesWritten = append(entry.FilesWritten, file.Dst)
			}
			logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Left %s unchanged", file.Dst)))
		}
		entry.FileResults = append(entry.FileResults, map[string]string{
			"dst":         file.Dst,
			"result":      result,
			"mergePolicy": policyOrDefault(file.MergePolicy),
		})
	}

	if manifest.SkillsLink != nil {
		preExisted := pathExists(filepath.Join(targetRoot, manifest.SkillsLink.Dst))
		if prior.SkillsLink != nil && !prior.SkillsLinkPreExisted {
			preExisted = false
		}
		if err := applyAgenticStackSkillsLink(targetRoot, *manifest.SkillsLink); err != nil {
			return okResult(map[string]interface{}{"success": false, "error": err.Error()})
		}
		entry.SkillsLink = manifest.SkillsLink
		entry.SkillsLinkPreExisted = preExisted
		logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Linked skills from %s to %s", manifest.SkillsLink.Target, manifest.SkillsLink.Dst)))
	}

	for _, action := range manifest.PostInstall {
		result := b.runAgenticStackPostInstall(action, targetRoot, manifest)
		entry.PostInstallResults = append(entry.PostInstallResults, result)
		status, _ := result["status"].(string)
		if status == "ok" {
			logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Post-install %s completed", action)))
		} else {
			message := fmt.Sprintf("Post-install %s returned %s", action, status)
			if hint, _ := result["fallback_hint"].(string); hint != "" {
				message = message + ": " + hint
			}
			logs = append(logs, newAgenticStackLog("warning", message))
		}
	}
	logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Installed %s adapter", manifest.Name)))
	entry.Logs = logs

	state.Version = "hyperclaw-agentic-stack-1"
	state.Updated = time.Now().UTC().Format(time.RFC3339)
	state.Adapters[manifest.Name] = entry
	if err := saveAgenticStackState(targetRoot, state); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}

	return okResult(map[string]interface{}{
		"success":    true,
		"targetRoot": targetRoot,
		"adapter":    b.agenticStackAdapterSummary(targetRoot, manifest, state),
		"entry":      entry,
		"logs":       logs,
	})
}

func (b *BridgeHandler) agenticStackAdapterRemove(params map[string]interface{}) actionResult {
	name, _ := params["adapter"].(string)
	if name == "" {
		name, _ = params["name"].(string)
	}
	manifest, ok := agenticStackBuiltinAdapters[name]
	if !ok {
		return okResult(map[string]interface{}{"success": false, "error": fmt.Sprintf("unknown adapter %q", name)})
	}
	targetRoot, _, err := b.agenticStackTargetRoot(params)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	state, err := loadAgenticStackState(targetRoot)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	entry, installed := state.Adapters[manifest.Name]
	if !installed {
		logs := []agenticStackLogEntry{newAgenticStackLog("info", fmt.Sprintf("%s adapter was not installed", manifest.Name))}
		return okResult(map[string]interface{}{"success": true, "targetRoot": targetRoot, "removed": false, "logs": logs})
	}
	logs := []agenticStackLogEntry{newAgenticStackLog("info", fmt.Sprintf("Removing %s adapter from %s", manifest.Name, targetRoot))}

	policyByDst := map[string]string{}
	for _, fr := range entry.FileResults {
		if dst := fr["dst"]; dst != "" {
			policyByDst[dst] = policyOrDefault(fr["mergePolicy"])
		}
	}

	for _, rel := range entry.FilesWritten {
		resolved, err := ValidateRelativePath(targetRoot, rel)
		if err != nil {
			continue
		}
		policy := policyByDst[rel]
		if policy == "merge_or_alert" {
			data, readErr := os.ReadFile(resolved)
			if readErr != nil {
				if !os.IsNotExist(readErr) {
					logs = append(logs, newAgenticStackLog("warning", fmt.Sprintf("Could not read %s: %v", rel, readErr)))
				}
				continue
			}
			stripped, found := stripAgenticStackBlock(string(data))
			if !found {
				logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Left %s as-is (no managed block to strip)", rel)))
				continue
			}
			if strings.TrimSpace(stripped) == "" {
				_ = os.Remove(resolved)
				logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Removed %s (file was empty after stripping our block)", rel)))
				continue
			}
			if writeErr := os.WriteFile(resolved, []byte(stripped), 0o644); writeErr != nil {
				logs = append(logs, newAgenticStackLog("warning", fmt.Sprintf("Could not strip block from %s: %v", rel, writeErr)))
				continue
			}
			logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Stripped Hyperclaw block from %s; preserved your edits", rel)))
			continue
		}
		_ = os.Remove(resolved)
		logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Removed %s", rel)))
	}
	filesNotRemoved := append([]string{}, entry.FilesOverwritten...)
	if entry.SkillsLink != nil && !entry.SkillsLinkPreExisted {
		if resolved, err := ValidateRelativePath(targetRoot, entry.SkillsLink.Dst); err == nil {
			if info, statErr := os.Lstat(resolved); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
				_ = os.Remove(resolved)
				logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Removed skills link %s", entry.SkillsLink.Dst)))
			} else if statErr == nil && info.IsDir() {
				if removeErr := os.Remove(resolved); removeErr != nil {
					filesNotRemoved = append(filesNotRemoved, entry.SkillsLink.Dst)
					logs = append(logs, newAgenticStackLog("warning", fmt.Sprintf("Left %s in place because it is not empty", entry.SkillsLink.Dst)))
				}
			}
		}
	}
	for _, rel := range filesNotRemoved {
		logs = append(logs, newAgenticStackLog("warning", fmt.Sprintf("Preserved %s because it may contain user-owned content", rel)))
	}
	delete(state.Adapters, manifest.Name)
	state.Updated = time.Now().UTC().Format(time.RFC3339)
	if err := saveAgenticStackState(targetRoot, state); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Removed %s adapter state", manifest.Name)))
	return okResult(map[string]interface{}{"success": true, "targetRoot": targetRoot, "removed": true, "filesNotRemoved": filesNotRemoved, "logs": logs})
}

func (b *BridgeHandler) agenticStackDoctor(params map[string]interface{}) actionResult {
	targetRoot, _, err := b.agenticStackTargetRoot(params)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	state, err := loadAgenticStackState(targetRoot)
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	var warnings []string
	brainRoot := filepath.Join(targetRoot, ".agent")
	if !dirExists(brainRoot) {
		warnings = append(warnings, ".agent brain is missing")
	}
	if !fileExists(filepath.Join(brainRoot, "AGENTS.md")) {
		warnings = append(warnings, ".agent/AGENTS.md is missing")
	}
	if len(state.Adapters) == 0 {
		warnings = append(warnings, "no adapters installed")
	}
	for name, entry := range state.Adapters {
		manifest, ok := agenticStackBuiltinAdapters[name]
		if !ok {
			warnings = append(warnings, fmt.Sprintf("installed adapter %q is no longer known", name))
			continue
		}
		for _, file := range manifest.Files {
			dst, err := ValidateRelativePath(targetRoot, file.Dst)
			if err != nil {
				warnings = append(warnings, fmt.Sprintf("%s: invalid adapter destination %s", name, file.Dst))
				continue
			}
			if !fileExists(dst) {
				warnings = append(warnings, fmt.Sprintf("%s: %s is missing", name, file.Dst))
				continue
			}
			if file.MergePolicy == "merge_or_alert" {
				data, readErr := os.ReadFile(dst)
				if readErr != nil {
					warnings = append(warnings, fmt.Sprintf("%s: %s could not be read: %v", name, file.Dst, readErr))
					continue
				}
				dataStr := string(data)
				if _, _, hasBlock := findAgenticStackBlock(dataStr); !hasBlock {
					if strings.Contains(dataStr, ".agent/") {
						// Legacy install: user merged manually before
						// markers existed. Leave it alone.
						continue
					}
					warnings = append(warnings, fmt.Sprintf("%s: %s no longer contains the Hyperclaw managed block", name, file.Dst))
				}
			}
		}
		// Legacy install state may still record FilesAlerted from a
		// previous version of the connector; surface them so a reinstall
		// migrates them to the new managed block.
		for _, rel := range entry.FilesAlerted {
			warnings = append(warnings, fmt.Sprintf("%s: legacy manual merge marker for %s (will auto-restore)", name, rel))
		}
	}
	logs := agenticStackLogsForState(targetRoot, state)
	logs = append(logs, newAgenticStackLog("info", fmt.Sprintf("Doctor checked %s", targetRoot)))
	for _, warning := range warnings {
		logs = append(logs, newAgenticStackLog("warning", warning))
	}
	if len(warnings) == 0 {
		logs = append(logs, newAgenticStackLog("info", "Doctor found no warnings"))
	}
	return okResult(map[string]interface{}{
		"success":    true,
		"targetRoot": targetRoot,
		"ok":         len(warnings) == 0,
		"warnings":   warnings,
		"adapters":   b.agenticStackAdapterSummaries(targetRoot, state),
		"logs":       logs,
	})
}

func (b *BridgeHandler) agenticStackTargetRoot(params map[string]interface{}) (string, string, error) {
	targetRoot, _ := params["targetRoot"].(string)
	if targetRoot == "" {
		targetRoot, _ = params["projectPath"].(string)
	}
	runtimeName, _ := params["runtime"].(string)
	agentID, _ := params["agentId"].(string)
	if targetRoot == "" {
		var err error
		targetRoot, err = resolveRuntimeAgentDir(b.paths, runtimeName, agentID)
		if err != nil {
			return "", "", err
		}
	}
	targetRoot = expandHome(strings.TrimSpace(targetRoot), b.paths.Home)
	absTarget, err := filepath.Abs(targetRoot)
	if err != nil {
		return "", "", err
	}
	absHome, _ := filepath.Abs(b.paths.Home)
	if absTarget != absHome && !strings.HasPrefix(absTarget, absHome+string(filepath.Separator)) {
		return "", "", fmt.Errorf("targetRoot must be inside the user home directory")
	}
	stackRoot, _ := params["stackRoot"].(string)
	stackRoot = expandHome(strings.TrimSpace(stackRoot), b.paths.Home)
	if stackRoot != "" {
		stackRoot, _ = filepath.Abs(stackRoot)
		if stackRoot != absHome && !strings.HasPrefix(stackRoot, absHome+string(filepath.Separator)) {
			return "", "", fmt.Errorf("stackRoot must be inside the user home directory")
		}
	}
	return absTarget, stackRoot, nil
}

func (b *BridgeHandler) agenticStackAdapterSummaries(targetRoot string, state agenticStackInstallDoc) []map[string]interface{} {
	names := make([]string, 0, len(agenticStackBuiltinAdapters))
	for name := range agenticStackBuiltinAdapters {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]map[string]interface{}, 0, len(names))
	for _, name := range names {
		out = append(out, b.agenticStackAdapterSummary(targetRoot, agenticStackBuiltinAdapters[name], state))
	}
	return out
}

func (b *BridgeHandler) agenticStackAdapterSummary(targetRoot string, manifest agenticStackManifest, state agenticStackInstallDoc) map[string]interface{} {
	entry, installed := state.Adapters[manifest.Name]
	files := make([]map[string]interface{}, 0, len(manifest.Files))
	for _, file := range manifest.Files {
		dst, err := ValidateRelativePath(targetRoot, file.Dst)
		if err != nil {
			dst = filepath.Join(targetRoot, filepath.Clean(file.Dst))
		}
		files = append(files, map[string]interface{}{
			"src":         file.Src,
			"dst":         file.Dst,
			"mergePolicy": policyOrDefault(file.MergePolicy),
			"installed":   fileExists(dst),
			"targetPath":  dst,
		})
	}
	return map[string]interface{}{
		"name":               manifest.Name,
		"description":        manifest.Description,
		"installed":          installed,
		"files":              files,
		"filesAlerted":       entry.FilesAlerted,
		"installedAt":        entry.InstalledAt,
		"brainRootPrimitive": manifest.BrainRootPrimitive,
		"skillsLink":         manifest.SkillsLink,
		"postInstall":        manifest.PostInstall,
	}
}

func validateAgenticStackManifest(manifest agenticStackManifest) error {
	if manifest.Name == "" || strings.Trim(manifest.Name, "-_") == "" {
		return fmt.Errorf("adapter name is required")
	}
	if manifest.Description == "" {
		return fmt.Errorf("adapter %s description is required", manifest.Name)
	}
	if len(manifest.Files) == 0 {
		return fmt.Errorf("adapter %s must include files", manifest.Name)
	}
	for i, file := range manifest.Files {
		if file.Src == "" || file.Dst == "" {
			return fmt.Errorf("%s files[%d]: src and dst are required", manifest.Name, i)
		}
		if err := checkAgenticPathSafe(file.Src, "src"); err != nil {
			return fmt.Errorf("%s files[%d]: %w", manifest.Name, i, err)
		}
		if err := checkAgenticPathSafe(file.Dst, "dst"); err != nil {
			return fmt.Errorf("%s files[%d]: %w", manifest.Name, i, err)
		}
		switch policyOrDefault(file.MergePolicy) {
		case "overwrite", "skip_if_exists", "merge_or_alert", "merge_json":
		default:
			return fmt.Errorf("%s files[%d]: invalid merge policy %q", manifest.Name, i, file.MergePolicy)
		}
	}
	if manifest.SkillsLink != nil {
		if err := checkAgenticPathSafe(manifest.SkillsLink.Target, "skills_link.target"); err != nil {
			return err
		}
		if err := checkAgenticPathSafe(manifest.SkillsLink.Dst, "skills_link.dst"); err != nil {
			return err
		}
	}
	for _, action := range manifest.PostInstall {
		switch action {
		case "openclaw_register_workspace", "register_hyperclaw_mcp", "register_global_mcp":
			// allowlisted
		default:
			return fmt.Errorf("unknown post_install action %q", action)
		}
	}
	if manifest.BrainRootPrimitive != "" && !strings.HasPrefix(manifest.BrainRootPrimitive, "$") {
		return fmt.Errorf("brain_root_primitive must start with $")
	}
	return nil
}

func checkAgenticPathSafe(pathValue, field string) error {
	parts := strings.FieldsFunc(pathValue, func(r rune) bool { return r == '/' || r == '\\' })
	for _, part := range parts {
		if part == ".." {
			return fmt.Errorf("%s path traversal not allowed", field)
		}
	}
	if strings.HasPrefix(pathValue, "/") || strings.HasPrefix(pathValue, "\\") {
		return fmt.Errorf("%s absolute paths not allowed", field)
	}
	if len(pathValue) >= 2 && pathValue[1] == ':' && ((pathValue[0] >= 'A' && pathValue[0] <= 'Z') || (pathValue[0] >= 'a' && pathValue[0] <= 'z')) {
		return fmt.Errorf("%s drive-letter paths not allowed", field)
	}
	return nil
}

func ensureAgenticBrain(targetRoot, stackRoot string) error {
	targetAgent := filepath.Join(targetRoot, ".agent")
	if !dirExists(targetAgent) && stackRoot != "" && dirExists(filepath.Join(stackRoot, ".agent")) {
		return copyDir(filepath.Join(stackRoot, ".agent"), targetAgent)
	}
	if err := os.MkdirAll(filepath.Join(targetAgent, "memory", "personal"), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(targetAgent, "skills"), 0o755); err != nil {
		return err
	}
	agentsPath := filepath.Join(targetAgent, "AGENTS.md")
	if !fileExists(agentsPath) {
		if err := os.WriteFile(agentsPath, []byte(`# Hyperclaw Agentic Stack

This is the shared portable brain for the employee.

Load this before runtime-specific files such as AGENTS.md, CLAUDE.md, or SOUL.md.

- memory/personal/PREFERENCES.md stores user and employee preferences.
- skills/ stores reusable skills.
- protocols/ can store shared operating procedures.
`), 0o644); err != nil {
			return err
		}
	}
	prefsPath := filepath.Join(targetAgent, "memory", "personal", "PREFERENCES.md")
	if !fileExists(prefsPath) {
		if err := os.WriteFile(prefsPath, []byte("# Preferences\n\n"), 0o644); err != nil {
			return err
		}
	}
	return nil
}

func agenticStackTemplateContent(manifest agenticStackManifest, file agenticStackFileEntry, targetRoot, stackRoot string) ([]byte, error) {
	if file.FromStack && stackRoot != "" {
		src, err := ValidateRelativePath(stackRoot, file.Src)
		if err != nil {
			return nil, err
		}
		data, err := os.ReadFile(src)
		if err != nil {
			return nil, err
		}
		return substituteAgenticStackTemplate(data, manifest, targetRoot, file.Substitute), nil
	}
	if content, ok := manifest.Templates[file.Src]; ok {
		return substituteAgenticStackTemplate([]byte(content), manifest, targetRoot, file.Substitute), nil
	}
	if stackRoot != "" {
		src, err := ValidateRelativePath(filepath.Join(stackRoot, "adapters", manifest.Name), file.Src)
		if err == nil {
			if data, readErr := os.ReadFile(src); readErr == nil {
				return substituteAgenticStackTemplate(data, manifest, targetRoot, file.Substitute), nil
			}
		}
	}
	return nil, fmt.Errorf("template %s for adapter %s not found", file.Src, manifest.Name)
}

func substituteAgenticStackTemplate(data []byte, manifest agenticStackManifest, targetRoot string, enabled bool) []byte {
	if !enabled && manifest.BrainRootPrimitive == "" {
		return data
	}
	brainRoot := manifest.BrainRootPrimitive
	if brainRoot == "" {
		brainRoot = "."
	}
	text := string(data)
	text = strings.ReplaceAll(text, "{{BRAIN_ROOT}}", brainRoot)
	text = strings.ReplaceAll(text, "{{ABS_TARGET}}", targetRoot)
	text = strings.ReplaceAll(text, "{{ABS_AGENT_FILE}}", shellQuote(filepath.Join(targetRoot, ".agent", "AGENTS.md")))
	text = strings.ReplaceAll(text, "{{HYPERCLAW_TOOLS_CATALOG}}", hyperclawToolsCatalogMarkdown())
	text = strings.ReplaceAll(text, "{{HYPERCLAW_MCP_URL}}", hyperclawMCPURL())
	text = strings.ReplaceAll(text, "{{HYPERCLAW_MCP_CALL_URL}}", hyperclawMCPURL()+"/call")
	text = strings.ReplaceAll(text, "{{HYPERCLAW_MCP_TOKEN}}", hyperclawMCPToken())
	text = strings.ReplaceAll(text, "{{HYPERCLAW_MCP_TOKEN_PATH}}", hyperclawMCPTokenPath())
	return []byte(text)
}

// hyperclawMCPToken reads the bearer token written by localauth at
// connector startup. Returns "" when the token file is missing — that
// case still produces a valid (but unauthenticated) config so the
// dashboard's rollout-mode acceptance keeps working until the strict
// flag flips on.
func hyperclawMCPToken() string {
	path := hyperclawMCPTokenPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// hyperclawMCPTokenPath resolves the token file location. Mirrors
// internal/localauth.New so an admin can swap the path via env without
// recompiling — useful for tests and shared dev rigs.
func hyperclawMCPTokenPath() string {
	if v := strings.TrimSpace(os.Getenv("HYPERCLAW_TOKEN_PATH")); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(".", ".hyperclaw", "connector.token")
	}
	return filepath.Join(home, ".hyperclaw", "connector.token")
}

// hyperclawMCPURL returns the local MCP endpoint exposed by this connector.
// Override via HYPERCLAW_MCP_URL env when running on a non-default port —
// e.g. for tests or staged rollouts. Default matches startLocalBridge in
// cmd/main.go.
func hyperclawMCPURL() string {
	if v := strings.TrimSpace(os.Getenv("HYPERCLAW_MCP_URL")); v != "" {
		return v
	}
	return "http://127.0.0.1:18790/mcp"
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

// wrapAgenticStackBlock wraps content in begin/end markers plus a short
// note explaining that the block is auto-managed. Default style is HTML
// comments — correct for markdown (CLAUDE.md, AGENTS.md) but WRONG for
// TOML/YAML/shell-style configs. For those, call wrapAgenticStackBlockHash
// instead, which uses '#' comments.
func wrapAgenticStackBlock(body string) string {
	body = strings.TrimRight(body, "\n")
	return agenticStackBlockBegin + "\n" + agenticStackBlockNote + "\n\n" + body + "\n" + agenticStackBlockEnd + "\n"
}

// wrapAgenticStackBlockHash wraps content using '#' line comments, suitable
// for TOML, YAML, shell, ini, and other formats where '<!-- -->' is a parse
// error. The marker text is the same so findAgenticStackBlock can still
// locate the block on re-runs.
func wrapAgenticStackBlockHash(body string) string {
	body = strings.TrimRight(body, "\n")
	return "# " + agenticStackBlockBegin + "\n" + "# " + agenticStackBlockNote + "\n\n" + body + "\n" + "# " + agenticStackBlockEnd + "\n"
}

// findAgenticStackBlock returns the [start, end) byte range of our
// managed block within content. ok is false if no complete block is
// present. The range starts at the beginning of the line containing the
// begin marker so that any leading comment prefix (e.g. "# " for TOML/YAML)
// is included; otherwise replace would leave orphan "# " characters when
// swapping a hash-style block for a fresh one.
func findAgenticStackBlock(content string) (int, int, bool) {
	startIdx := strings.Index(content, agenticStackBlockBegin)
	if startIdx < 0 {
		return 0, 0, false
	}
	tail := content[startIdx:]
	endRel := strings.Index(tail, agenticStackBlockEnd)
	if endRel < 0 {
		return 0, 0, false
	}
	// Walk back to the start of the line containing the begin marker so a
	// "# " prefix gets included.
	lineStart := startIdx
	for lineStart > 0 && content[lineStart-1] != '\n' {
		lineStart--
	}
	return lineStart, startIdx + endRel + len(agenticStackBlockEnd), true
}

// replaceAgenticStackBlock swaps the managed block in existing for
// newBlock. ok=false means there was no block to replace.
func replaceAgenticStackBlock(existing, newBlock string) (string, bool) {
	startIdx, endIdx, ok := findAgenticStackBlock(existing)
	if !ok {
		return existing, false
	}
	rebuilt := existing[:startIdx] + strings.TrimRight(newBlock, "\n") + existing[endIdx:]
	if !strings.HasSuffix(rebuilt, "\n") {
		rebuilt += "\n"
	}
	return rebuilt, true
}

// appendAgenticStackBlock appends a managed block to existing user
// content with a single blank line separator, leaving the original
// untouched.
func appendAgenticStackBlock(existing, newBlock string) string {
	if existing == "" {
		return newBlock
	}
	trimmed := strings.TrimRight(existing, "\n")
	return trimmed + "\n\n" + newBlock
}

// stripAgenticStackBlock removes the managed block from existing and
// trims surrounding blank lines so the file looks natural after
// removal. ok=false means no block was found and the input is returned
// unchanged.
func stripAgenticStackBlock(existing string) (string, bool) {
	startIdx, endIdx, ok := findAgenticStackBlock(existing)
	if !ok {
		return existing, false
	}
	before := strings.TrimRight(existing[:startIdx], "\n")
	after := strings.TrimLeft(existing[endIdx:], "\n")
	switch {
	case before == "" && after == "":
		return "", true
	case before == "":
		return after, true
	case after == "":
		return before + "\n", true
	default:
		return before + "\n\n" + after, true
	}
}

func applyAgenticStackFile(dst string, content []byte, mergePolicy string, installerOwned bool) (string, error) {
	mergePolicy = policyOrDefault(mergePolicy)
	preExisted := fileExists(dst)
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return "", err
	}
	if mergePolicy == "merge_or_alert" {
		block := wrapAgenticStackBlock(string(content))
		if !preExisted {
			return "block_written", os.WriteFile(dst, []byte(block), 0o644)
		}
		existing, readErr := os.ReadFile(dst)
		if readErr != nil {
			return "", readErr
		}
		existingStr := string(existing)
		if updated, replaced := replaceAgenticStackBlock(existingStr, block); replaced {
			if updated == existingStr {
				return "left_alone", nil
			}
			return "block_replaced", os.WriteFile(dst, []byte(updated), 0o644)
		}
		appended := appendAgenticStackBlock(existingStr, block)
		return "block_appended", os.WriteFile(dst, []byte(appended), 0o644)
	}
	if mergePolicy == "merge_json" {
		if !preExisted {
			return "json_written", os.WriteFile(dst, content, 0o644)
		}
		existing, readErr := os.ReadFile(dst)
		if readErr != nil {
			return "", readErr
		}
		merged, status, err := mergeJSONFileContent(existing, content)
		if err != nil {
			// Fall back to alert: write our content to a sidecar file so the
			// user can manually reconcile. Don't clobber an unparseable file.
			sidecar := dst + ".hyperclaw.json"
			if writeErr := os.WriteFile(sidecar, content, 0o644); writeErr != nil {
				return "", fmt.Errorf("merge_json failed and sidecar write failed: %v / %v", err, writeErr)
			}
			return "json_sidecar", nil
		}
		if status == "unchanged" {
			return "json_unchanged", nil
		}
		return "json_merged", os.WriteFile(dst, merged, 0o644)
	}
	if !preExisted {
		return "written_new", os.WriteFile(dst, content, 0o644)
	}
	switch mergePolicy {
	case "overwrite":
		return "written_overwrite", os.WriteFile(dst, content, 0o644)
	case "skip_if_exists":
		return "skipped_existing", nil
	default:
		return "", fmt.Errorf("unknown merge policy %q", mergePolicy)
	}
}

// mergeJSONFileContent deep-merges `incoming` into `existing` and returns
// pretty-printed JSON. Object keys are merged recursively (incoming wins on
// scalar collisions; recursively merged on object-object collisions). Arrays
// are concatenated with deep-equal de-duplication so re-runs are idempotent.
// If either side fails to parse as JSON, returns an error so the caller can
// fall back to an alert (sidecar file).
func mergeJSONFileContent(existing, incoming []byte) ([]byte, string, error) {
	var existingVal interface{}
	if err := json.Unmarshal(existing, &existingVal); err != nil {
		return nil, "", fmt.Errorf("existing not valid JSON: %w", err)
	}
	var incomingVal interface{}
	if err := json.Unmarshal(incoming, &incomingVal); err != nil {
		return nil, "", fmt.Errorf("incoming not valid JSON: %w", err)
	}
	merged := mergeJSONValues(existingVal, incomingVal)
	out, err := json.MarshalIndent(merged, "", "  ")
	if err != nil {
		return nil, "", err
	}
	out = append(out, '\n')
	if string(out) == string(existing) {
		return out, "unchanged", nil
	}
	return out, "merged", nil
}

func mergeJSONValues(a, b interface{}) interface{} {
	aObj, aOk := a.(map[string]interface{})
	bObj, bOk := b.(map[string]interface{})
	if aOk && bOk {
		out := make(map[string]interface{}, len(aObj)+len(bObj))
		for k, v := range aObj {
			out[k] = v
		}
		for k, v := range bObj {
			if existing, ok := out[k]; ok {
				out[k] = mergeJSONValues(existing, v)
			} else {
				out[k] = v
			}
		}
		return out
	}
	aArr, aArrOk := a.([]interface{})
	bArr, bArrOk := b.([]interface{})
	if aArrOk && bArrOk {
		out := make([]interface{}, 0, len(aArr)+len(bArr))
		out = append(out, aArr...)
		for _, item := range bArr {
			if !jsonContains(out, item) {
				out = append(out, item)
			}
		}
		return out
	}
	// Scalar collision or type mismatch — incoming wins.
	return b
}

func jsonContains(arr []interface{}, target interface{}) bool {
	tBytes, err := json.Marshal(target)
	if err != nil {
		return false
	}
	for _, item := range arr {
		iBytes, err := json.Marshal(item)
		if err != nil {
			continue
		}
		if string(iBytes) == string(tBytes) {
			return true
		}
	}
	return false
}

func applyAgenticStackSkillsLink(targetRoot string, link agenticStackSkillsLink) error {
	target, err := ValidateRelativePath(targetRoot, link.Target)
	if err != nil {
		return err
	}
	if !dirExists(target) {
		return fmt.Errorf("skills_link target %s does not exist", link.Target)
	}
	dst, err := ValidateRelativePath(targetRoot, link.Dst)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	if pathExists(dst) {
		if info, err := os.Lstat(dst); err == nil && info.Mode()&os.ModeSymlink != 0 {
			_ = os.Remove(dst)
		} else if dirExists(dst) {
			return fmt.Errorf("skills_link destination %s already exists as a directory; move it before installing this adapter", link.Dst)
		} else {
			return fmt.Errorf("skills_link destination %s exists as a regular file", link.Dst)
		}
	}
	if runtime.GOOS != "windows" {
		if err := os.Symlink(target, dst); err == nil {
			return nil
		}
	}
	return copyDir(target, dst)
}

// registerHyperclawMCPForWorkspace persists a "hyperclaw" MCP entry in the
// agent_mcps SQLite store for the agent that owns this workspace, so the
// dashboard's per-agent MCP panel reflects what was just wired on disk.
// Idempotent: if the entry already exists for this agent, no duplicate is
// created. Errors are returned as warnings (status: warning) — the on-disk
// MCP config is the authoritative wiring; the SQLite row is just UI sugar.
func (b *BridgeHandler) registerHyperclawMCPForWorkspace(targetRoot string) map[string]interface{} {
	result := map[string]interface{}{
		"action":     "register_hyperclaw_mcp",
		"targetRoot": targetRoot,
	}
	if b.store == nil {
		result["status"] = "warning"
		result["error"] = "store not available"
		return result
	}
	agentID := filepath.Base(targetRoot)
	existing, err := b.store.ListAgentMCPs(agentID)
	if err != nil {
		result["status"] = "warning"
		result["error"] = err.Error()
		return result
	}
	for _, m := range existing {
		if m.Name == "hyperclaw" {
			result["status"] = "ok"
			result["already"] = true
			result["id"] = m.ID
			return result
		}
	}
	mcp, err := b.store.AddAgentMCP(
		agentID,
		"hyperclaw",
		"http",
		"",   // command (stdio only)
		nil,  // args
		hyperclawMCPURL(),
		map[string]string{},
		map[string]string{},
	)
	if err != nil {
		result["status"] = "warning"
		result["error"] = err.Error()
		return result
	}
	result["status"] = "ok"
	result["id"] = mcp.ID
	return result
}

func (b *BridgeHandler) runAgenticStackPostInstall(action, targetRoot string, manifest agenticStackManifest) map[string]interface{} {
	switch action {
	case "register_hyperclaw_mcp":
		return b.registerHyperclawMCPForWorkspace(targetRoot)
	case "register_global_mcp":
		return b.registerGlobalHyperclawMCP(manifest.Name)
	case "openclaw_register_workspace":
		bin := findOpenClawBinary()
		if bin == "openclaw" {
			if _, err := exec.LookPath("openclaw"); err != nil {
				return map[string]interface{}{
					"action":        action,
					"status":        "binary_missing",
					"fallback_hint": "OpenClaw adapter files were installed; run OpenClaw registration after the binary is installed.",
				}
			}
		}
		stdout, stderr, err := runOpenClaw(context.Background(), b.paths, []string{"agents", "add", filepath.Base(targetRoot), "--workspace", targetRoot, "--non-interactive"}, 5_000)
		result := map[string]interface{}{"action": action, "stdout": stdout, "stderr": stderr}
		if err != nil {
			result["status"] = "warning"
			result["error"] = err.Error()
		} else {
			result["status"] = "ok"
		}
		return result
	default:
		return map[string]interface{}{"action": action, "status": "unknown"}
	}
}

// registerGlobalHyperclawMCP injects the local Hyperclaw MCP entry into the
// runtime's user-global config so any session of that runtime — opened
// outside of a workspace, or before the workspace adapter is installed —
// already knows about Hyperclaw. The bearer token is read from the same
// connector.token file the per-workspace adapters use, keeping rotation
// behavior consistent.
//
// Smart-merge for JSON files (claude-code, openclaw): preserves user-authored
// MCP servers, hooks, and other top-level keys. For Codex's TOML config we
// use a managed-block append: TOML doesn't have a clean structural merge,
// and the agentic-stack block markers work in TOML comments just as they do
// in Markdown.
//
// Returns a result map matching the post-install convention. Errors are
// surfaced as status "warning" — this hook is best-effort. The workspace
// adapter still installs successfully even if the global write fails.
func (b *BridgeHandler) registerGlobalHyperclawMCP(runtime string) map[string]interface{} {
	log.Printf("[stack/global] register_global_mcp runtime=%s", runtime)
	result := map[string]interface{}{
		"action":  "register_global_mcp",
		"runtime": runtime,
	}
	home := b.paths.Home
	if home == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			result["status"] = "warning"
			result["error"] = "could not resolve home directory: " + err.Error()
			return result
		}
	}
	mcpURL := hyperclawMCPURL()
	token := hyperclawMCPToken()

	switch runtime {
	case "claude-code":
		dst := filepath.Join(home, ".claude.json")
		incoming := map[string]interface{}{
			"mcpServers": map[string]interface{}{
				"hyperclaw": map[string]interface{}{
					"type": "http",
					"url":  mcpURL,
					"headers": map[string]interface{}{
						"Authorization": "Bearer " + token,
					},
				},
			},
		}
		incomingBytes, _ := json.MarshalIndent(incoming, "", "  ")
		incomingBytes = append(incomingBytes, '\n')
		status, err := writeOrMergeJSONGlobal(dst, incomingBytes)
		if err != nil {
			result["status"] = "warning"
			result["error"] = err.Error()
			result["path"] = dst
			return result
		}
		result["status"] = "ok"
		result["path"] = dst
		result["merge"] = status
		return result

	case "codex":
		dst := filepath.Join(home, ".codex", "config.toml")
		body := fmt.Sprintf(`[mcp_servers.hyperclaw]
type = "http"
url = "%s"
headers = { Authorization = "Bearer %s" }
`, mcpURL, token)
		status, err := writeOrMergeManagedBlockGlobal(dst, body)
		if err != nil {
			result["status"] = "warning"
			result["error"] = err.Error()
			result["path"] = dst
			return result
		}
		result["status"] = "ok"
		result["path"] = dst
		result["merge"] = status
		return result

	case "openclaw":
		dst := filepath.Join(home, ".openclaw", "mcp.json")
		incoming := map[string]interface{}{
			"mcpServers": map[string]interface{}{
				"hyperclaw": map[string]interface{}{
					"type": "http",
					"url":  mcpURL,
					"headers": map[string]interface{}{
						"Authorization": "Bearer " + token,
					},
				},
			},
		}
		incomingBytes, _ := json.MarshalIndent(incoming, "", "  ")
		incomingBytes = append(incomingBytes, '\n')
		status, err := writeOrMergeJSONGlobal(dst, incomingBytes)
		if err != nil {
			result["status"] = "warning"
			result["error"] = err.Error()
			result["path"] = dst
			return result
		}
		result["status"] = "ok"
		result["path"] = dst
		result["merge"] = status
		return result

	default:
		// Hermes has no native MCP; the curl recipe lives in workspace AGENTS.md.
		result["status"] = "skipped"
		result["reason"] = "runtime has no user-global MCP file"
		return result
	}
}

func writeOrMergeJSONGlobal(dst string, content []byte) (string, error) {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return "", err
	}
	existing, readErr := os.ReadFile(dst)
	if readErr != nil {
		if !os.IsNotExist(readErr) {
			return "", readErr
		}
		return "written_new", os.WriteFile(dst, content, 0o644)
	}
	merged, status, err := mergeJSONFileContent(existing, content)
	if err != nil {
		// Sidecar fallback — never clobber an unparseable user config.
		sidecar := dst + ".hyperclaw.json"
		if writeErr := os.WriteFile(sidecar, content, 0o644); writeErr != nil {
			return "", fmt.Errorf("merge failed and sidecar write failed: %v / %v", err, writeErr)
		}
		return "json_sidecar", nil
	}
	if status == "unchanged" {
		return "unchanged", nil
	}
	return "merged", os.WriteFile(dst, merged, 0o644)
}

// writeOrMergeManagedBlockGlobal writes a managed block at dst. It picks the
// comment syntax automatically from the file extension so we don't write
// HTML-style `<!-- -->` markers into TOML/YAML where they're parse errors.
func writeOrMergeManagedBlockGlobal(dst, body string) (string, error) {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return "", err
	}
	wrap := wrapAgenticStackBlock
	switch strings.ToLower(filepath.Ext(dst)) {
	case ".toml", ".yaml", ".yml", ".ini", ".sh", ".conf", ".cfg", ".env":
		wrap = wrapAgenticStackBlockHash
	}
	block := wrap(body)
	existing, readErr := os.ReadFile(dst)
	if readErr != nil {
		if !os.IsNotExist(readErr) {
			return "", readErr
		}
		return "written_new", os.WriteFile(dst, []byte(block), 0o644)
	}
	existingStr := string(existing)
	if updated, replaced := replaceAgenticStackBlock(existingStr, block); replaced {
		if updated == existingStr {
			return "unchanged", nil
		}
		return "block_replaced", os.WriteFile(dst, []byte(updated), 0o644)
	}
	appended := appendAgenticStackBlock(existingStr, block)
	return "block_appended", os.WriteFile(dst, []byte(appended), 0o644)
}

func loadAgenticStackState(targetRoot string) (agenticStackInstallDoc, error) {
	doc := agenticStackInstallDoc{Adapters: map[string]agenticStackInstallEntry{}}
	data, err := os.ReadFile(filepath.Join(targetRoot, agenticStackStateFile))
	if err != nil {
		if os.IsNotExist(err) {
			return doc, nil
		}
		return doc, err
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return doc, fmt.Errorf("agentic-stack install state is corrupted: %w", err)
	}
	if doc.Adapters == nil {
		doc.Adapters = map[string]agenticStackInstallEntry{}
	}
	return doc, nil
}

func saveAgenticStackState(targetRoot string, doc agenticStackInstallDoc) error {
	if doc.Adapters == nil {
		doc.Adapters = map[string]agenticStackInstallEntry{}
	}
	path := filepath.Join(targetRoot, agenticStackStateFile)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

func newAgenticStackLog(level, message string) agenticStackLogEntry {
	return agenticStackLogEntry{
		Time:    time.Now().UTC().Format(time.RFC3339),
		Level:   level,
		Message: message,
	}
}

func agenticStackLogsForState(targetRoot string, state agenticStackInstallDoc) []agenticStackLogEntry {
	logs := []agenticStackLogEntry{
		newAgenticStackLog("info", fmt.Sprintf("Loaded agentic-stack state for %s", targetRoot)),
	}
	names := make([]string, 0, len(state.Adapters))
	for name := range state.Adapters {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		entry := state.Adapters[name]
		if len(entry.Logs) == 0 {
			if entry.InstalledAt != "" {
				logs = append(logs, agenticStackLogEntry{
					Time:    entry.InstalledAt,
					Level:   "info",
					Message: fmt.Sprintf("%s adapter installed", name),
				})
			}
			continue
		}
		logs = append(logs, entry.Logs...)
	}
	if len(names) == 0 {
		logs = append(logs, newAgenticStackLog("info", "No adapters installed yet"))
	}
	return logs
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer out.Close()
		_, err = io.Copy(out, in)
		return err
	})
}

func expandHome(pathValue, home string) string {
	if pathValue == "~" {
		return home
	}
	if strings.HasPrefix(pathValue, "~/") {
		return filepath.Join(home, pathValue[2:])
	}
	return pathValue
}

func policyOrDefault(policy string) string {
	if policy == "" {
		return "overwrite"
	}
	return policy
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func pathExists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}
