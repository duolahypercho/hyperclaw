package sync

import (
	"path/filepath"
	"strings"
)

// Runtime tags which runtime owns a watch root.
type Runtime string

const (
	RuntimeOpenClaw   Runtime = "openclaw"
	RuntimeHyperclaw  Runtime = "hyperclaw"
	RuntimeHermes     Runtime = "hermes"
	RuntimeClaudeCode Runtime = "claude-code"
	RuntimeCodex      Runtime = "codex"
)

// WatchRoot maps an absolute directory path to its runtime.
// When DirectAgentID is non-empty, files placed directly inside Dir
// (not in a subdirectory) are attributed to that fixed agent ID.
// This supports runtimes like Hermes where personality files live at
// ~/.hermes/SOUL.md rather than ~/.hermes/{agentName}/SOUL.md.
type WatchRoot struct {
	Dir           string
	Runtime       Runtime
	DirectAgentID string // if set, files directly in Dir map to this agent ID
}

// knownFileKeys is the set of personality file basenames we track.
var knownFileKeys = map[string]string{
	"SOUL.md":      "SOUL",
	"USER.md":      "USER",
	"AGENTS.md":    "AGENTS",
	"TOOLS.md":     "TOOLS",
	"HEARTBEAT.md": "HEARTBEAT",
	"IDENTITY.md":  "IDENTITY",
	"MEMORY.md":    "MEMORY",
}

// openclawSystemDirs are directories inside ~/.openclaw/ that are NOT agent workspaces.
// These should be excluded from agent sync to prevent incorrectly treating them as agents.
var openclawSystemDirs = map[string]bool{
	"extensions":  true, // installed extensions
	"logs":        true, // log files
	"identity":    true, // device identity
	"flows":       true, // cron flows
	"agents":      true, // OpenClaw's agents directory
	"credentials": true, // OAuth credentials
	"media":       true, // media files
	"skills":      true, // installed skills
	"cron":        true, // cron jobs
	"main":        true, // default workspace files (not an agent)
	"qqbot":       true, // qqbot extension data storage
	"cache":       true, // cache directory
}

// FileClassification is the result of classifying a file path.
type FileClassification struct {
	AgentID string
	FileKey string
	Runtime Runtime
}

// WatchRoots builds the slice of watch roots for a given home directory.
//
// OpenClaw and Hermes own their own file structures and are watched natively.
// Claude Code and Codex are coding runtimes — their agent personalities live
// under ~/.hyperclaw/agents/{id}/ (the Hyperclaw registry) and are injected
// as system prompts at runtime, so they don't need separate watch roots.
func WatchRoots(home string) []WatchRoot {
	return []WatchRoot{
		// OpenClaw: ~/.openclaw/workspace-{agent}/FILE.md
		{Dir: filepath.Join(home, ".openclaw"), Runtime: RuntimeOpenClaw},
		// Hyperclaw: ~/.hyperclaw/agents/{agent}/FILE.md
		// Canonical store for all agents, including Claude Code and Codex agents.
		{Dir: filepath.Join(home, ".hyperclaw", "agents"), Runtime: RuntimeHyperclaw},
		// Hermes main agent: ~/.hermes/FILE.md (files live directly in root)
		// Uses "__main__" to avoid collision with OpenClaw "main" in the identity table.
		{Dir: filepath.Join(home, ".hermes"), Runtime: RuntimeHermes, DirectAgentID: "__main__"},
		// Hermes sub-agents: ~/.hermes/profiles/{agent}/FILE.md
		{Dir: filepath.Join(home, ".hermes", "profiles"), Runtime: RuntimeHermes},
	}
}

// ClassifyPath resolves an absolute file path to its agent ID, file key, and
// runtime. Returns (_, false) if the path is not a tracked personality file.
func ClassifyPath(absPath string, roots []WatchRoot) (FileClassification, bool) {
	base := filepath.Base(absPath)
	fileKey, ok := knownFileKeys[base]
	if !ok {
		return FileClassification{}, false
	}

	for _, root := range roots {
		// Normalize for case-insensitive filesystems (Windows).
		normPath := filepath.ToSlash(strings.ToLower(filepath.Clean(absPath)))
		normRoot := filepath.ToSlash(strings.ToLower(filepath.Clean(root.Dir)))
		if !strings.HasPrefix(normPath, normRoot+"/") {
			continue
		}

		// Compute the relative path from the root to the file's directory.
		normDir := filepath.ToSlash(strings.ToLower(filepath.Clean(filepath.Dir(absPath))))
		normRootDir := filepath.ToSlash(strings.ToLower(filepath.Clean(root.Dir)))
		rel, err := filepath.Rel(
			filepath.FromSlash(normRootDir),
			filepath.FromSlash(normDir),
		)
		if err != nil {
			continue
		}

		parts := strings.SplitN(filepath.ToSlash(rel), "/", 2)
		agentDir := parts[0]

		if agentDir == "." || agentDir == "" {
			// File is directly inside the root (no subdirectory).
			// Only valid when the root declares a fixed DirectAgentID.
			if root.DirectAgentID == "" {
				continue
			}
			return FileClassification{
				AgentID: root.DirectAgentID,
				FileKey: fileKey,
				Runtime: root.Runtime,
			}, true
		}

		// File is inside a subdirectory.
		// OpenClaw convention: workspace-{name}/ for named agents, workspace/ for the main agent.
		// Files nested deeper inside workspace/ (e.g. workspace/test-agent/IDENTITY.md) are skipped
		// so they don't overwrite the main agent's personality files.

		// Skip known system directories that are NOT agent workspaces
		if root.Runtime == RuntimeOpenClaw && openclawSystemDirs[agentDir] {
			continue
		}

		agentID := agentDir
		runtime := root.Runtime
		if agentDir == "workspace" {
			if len(parts) > 1 {
				continue // skip files inside workspace subdirs
			}
			agentID = "main"
		} else if root.Runtime == RuntimeHyperclaw {
			// Hyperclaw layout (v0.5.6+): ~/.hyperclaw/agents/{runtime}-{agentID}/
			// Strip a known runtime prefix and attribute to that runtime.
			prefixes := []struct {
				prefix string
				rt     Runtime
			}{
				{"openclaw-", RuntimeOpenClaw},
				{"claude-code-", RuntimeClaudeCode},
				{"codex-", RuntimeCodex},
				{"hermes-", RuntimeHermes},
			}
			matched := false
			for _, p := range prefixes {
				if strings.HasPrefix(agentDir, p.prefix) {
					agentID = strings.TrimPrefix(agentDir, p.prefix)
					runtime = p.rt
					matched = true
					break
				}
			}
			if !matched {
				// Legacy un-prefixed layout (pre-0.5.6): assume openclaw.
				agentID = agentDir
				runtime = RuntimeOpenClaw
			}
		} else {
			agentID = strings.TrimPrefix(agentDir, "workspace-")
		}
		return FileClassification{
			AgentID: agentID,
			FileKey: fileKey,
			Runtime: runtime,
		}, true
	}
	return FileClassification{}, false
}
