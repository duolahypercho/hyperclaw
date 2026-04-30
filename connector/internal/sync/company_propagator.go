package sync

import (
	"log"
	"os"
	"path/filepath"
	"strings"
)

// onCompanyFileChanged handles a change to a COMPANY.md file.
// If the source is the canonical copy (~/.hyperclaw/company/*/COMPANY.md),
// it fans out to all runtime workspaces. If the source is a runtime workspace,
// it propagates back to the canonical copy and then fans out to siblings.
func (e *SyncEngine) onCompanyFileChanged(absPath string) {
	data, err := os.ReadFile(absPath)
	if err != nil {
		log.Printf("[sync] cannot read company file %s: %v", absPath, err)
		return
	}
	content := normContent(data)
	hash := hashContent(content)

	// Suppress echo from our own writes.
	if e.guard.IsOurWrite(absPath, hash) {
		return
	}

	// Deduplicate: if the content hasn't changed since last propagation, skip.
	if e.lastCompanyHash == hash {
		return
	}
	e.lastCompanyHash = hash

	canonical := e.resolveCanonicalCompanyPath()
	cleanAbs := filepath.Clean(absPath)

	// If the change came from a runtime workspace (not canonical), write
	// the canonical copy first so it stays in sync.
	if canonical != "" && cleanAbs != filepath.Clean(canonical) {
		dir := filepath.Dir(canonical)
		if err := os.MkdirAll(dir, 0755); err == nil {
			e.guard.Set(canonical, hash)
			if err := os.WriteFile(canonical, []byte(content), 0600); err != nil {
				log.Printf("[sync] company propagate to canonical: %v", err)
				e.guard.Remove(canonical)
			}
		}
	}

	// Fan out to all runtime workspaces.
	targets := e.resolveCompanyTargets()
	written := 0
	for _, target := range targets {
		if filepath.Clean(target) == cleanAbs {
			continue // don't write back to source
		}
		dir := filepath.Dir(target)
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			continue // workspace doesn't exist, skip
		}
		e.guard.Set(target, hash)
		if err := os.WriteFile(target, []byte(content), 0600); err != nil {
			log.Printf("[sync] company propagate to %s: %v", target, err)
			e.guard.Remove(target)
		} else {
			written++
		}
	}

	if written > 0 {
		log.Printf("[sync] COMPANY.md propagated to %d targets from %s", written, absPath)
	}

	if e.notify != nil {
		e.notify("company.updated", map[string]interface{}{
			"source":  absPath,
			"targets": written,
		})
	}
}

// resolveCanonicalCompanyPath returns the first COMPANY.md found under
// ~/.hyperclaw/company/*/. Returns "" if none exists.
func (e *SyncEngine) resolveCanonicalCompanyPath() string {
	companyDir := filepath.Join(e.home, ".hyperclaw", "company")
	entries, err := os.ReadDir(companyDir)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		if entry.IsDir() {
			p := filepath.Join(companyDir, entry.Name(), "COMPANY.md")
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	return ""
}

// resolveCompanyTargets returns all paths where COMPANY.md should exist.
func (e *SyncEngine) resolveCompanyTargets() []string {
	var targets []string

	openclawDir := filepath.Join(e.home, ".openclaw")
	hermesDir := filepath.Join(e.home, ".hermes")
	agentsDir := filepath.Join(e.home, ".hyperclaw", "agents")

	// OpenClaw workspaces (workspace/ and workspace-{id}/).
	if entries, err := os.ReadDir(openclawDir); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			if name == "workspace" || strings.HasPrefix(name, "workspace-") {
				targets = append(targets, filepath.Join(openclawDir, name, "COMPANY.md"))
			}
		}
	}

	// Hermes main.
	if _, err := os.Stat(hermesDir); err == nil {
		targets = append(targets, filepath.Join(hermesDir, "COMPANY.md"))
	}
	// Hermes profiles.
	profilesDir := filepath.Join(hermesDir, "profiles")
	if entries, err := os.ReadDir(profilesDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				targets = append(targets, filepath.Join(profilesDir, entry.Name(), "COMPANY.md"))
			}
		}
	}

	// HyperClaw agents (Claude Code, Codex, etc.).
	if entries, err := os.ReadDir(agentsDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				targets = append(targets, filepath.Join(agentsDir, entry.Name(), "COMPANY.md"))
			}
		}
	}

	return targets
}

// isCompanyFile returns true if absPath is a COMPANY.md file under a
// watched location (canonical or runtime workspace).
func (e *SyncEngine) isCompanyFile(absPath string) bool {
	if filepath.Base(absPath) != "COMPANY.md" {
		return false
	}
	clean := filepath.Clean(absPath)
	// Canonical: ~/.hyperclaw/company/*/COMPANY.md
	if strings.HasPrefix(clean, filepath.Join(e.home, ".hyperclaw", "company")) {
		return true
	}
	// Runtime workspaces: any watch root.
	for _, root := range e.roots {
		if strings.HasPrefix(clean, filepath.Clean(root.Dir)) {
			return true
		}
	}
	return false
}
