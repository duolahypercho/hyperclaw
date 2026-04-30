package sync

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// configSnapshot holds the last known state of a config file for diffing.
type configSnapshot struct {
	hash     string
	agentIDs map[string]string // id → name
}

// onOpenClawConfigChanged handles a change to ~/.openclaw/openclaw.json.
// Diffs the agent list against the last snapshot, seeds SQLite, and emits
// agent.hired / agent.deleted events so the dashboard stays in sync.
func (e *SyncEngine) onOpenClawConfigChanged(configPath string) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		log.Printf("[sync] cannot read openclaw config: %v", err)
		return
	}

	hash := fmt.Sprintf("%x", sha256.Sum256(data))
	if e.lastOCConfig != nil && e.lastOCConfig.hash == hash {
		return // no actual change
	}

	agents := parseOpenClawAgents(data)

	// Build new snapshot.
	snap := &configSnapshot{
		hash:     hash,
		agentIDs: make(map[string]string, len(agents)),
	}
	for _, a := range agents {
		snap.agentIDs[a.id] = a.name
	}

	// Diff against previous snapshot.
	var added, removed []string
	if e.lastOCConfig != nil {
		for id := range snap.agentIDs {
			if _, existed := e.lastOCConfig.agentIDs[id]; !existed {
				added = append(added, id)
			}
		}
		for id := range e.lastOCConfig.agentIDs {
			if _, exists := snap.agentIDs[id]; !exists {
				removed = append(removed, id)
			}
		}
	}

	e.lastOCConfig = snap

	// Seed all agents into SQLite. SeedAgents handles upserts + stale removal.
	seeds := make([]store.SeedAgent, 0, len(agents))
	for _, a := range agents {
		status := "idle"
		if a.id == "main" {
			status = "active"
		}
		seeds = append(seeds, store.SeedAgent{
			ID:      a.id,
			Name:    a.name,
			Status:  status,
			Runtime: "openclaw",
		})
	}
	if err := e.store.SeedAgents(seeds); err != nil {
		log.Printf("[sync] config watcher SeedAgents: %v", err)
		return
	}

	if len(added) > 0 || len(removed) > 0 {
		log.Printf("[sync] openclaw config changed: +%d -%d agents", len(added), len(removed))
	}

	for _, id := range added {
		log.Printf("[sync] agent discovered via config: %s", id)
		if e.notify != nil {
			e.notify("agent.hired", map[string]interface{}{
				"agentId": id,
				"name":    snap.agentIDs[id],
				"runtime": "openclaw",
				"source":  "config-watcher",
			})
		}
	}
	for _, id := range removed {
		log.Printf("[sync] agent removed via config: %s", id)
		if e.notify != nil {
			e.notify("agent.deleted", map[string]interface{}{
				"agentId": id,
				"runtime": "openclaw",
				"source":  "config-watcher",
			})
		}
	}
}

// openclawAgent is a minimal agent entry parsed from openclaw.json.
type openclawAgent struct {
	id   string
	name string
}

// parseOpenClawAgents extracts the agent list from openclaw.json content.
// Always includes "main" as the implicit default agent.
func parseOpenClawAgents(data []byte) []openclawAgent {
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return []openclawAgent{{id: "main", name: "Main"}}
	}

	agentsSection, _ := config["agents"].(map[string]interface{})
	list, _ := agentsSection["list"].([]interface{})

	agents := make([]openclawAgent, 0, len(list)+1)
	hasMain := false

	for _, item := range list {
		a, _ := item.(map[string]interface{})
		if a == nil {
			continue
		}
		id, _ := a["id"].(string)
		if id == "" {
			continue
		}
		name := ""
		if identity, ok := a["identity"].(map[string]interface{}); ok {
			name, _ = identity["name"].(string)
		}
		if name == "" && len(id) > 0 {
			name = strings.ToUpper(id[:1]) + id[1:]
		}
		agents = append(agents, openclawAgent{id: id, name: name})
		if id == "main" {
			hasMain = true
		}
	}

	if !hasMain {
		// Main is always implicit — even if not listed in config.
		agents = append([]openclawAgent{{id: "main", name: "Main"}}, agents...)
	}

	return agents
}

// isOpenClawConfig returns true if absPath looks like the openclaw config file.
func (e *SyncEngine) isOpenClawConfig(absPath string) bool {
	return filepath.Base(absPath) == "openclaw.json" &&
		strings.HasPrefix(filepath.Clean(absPath), filepath.Join(e.home, ".openclaw"))
}

// coldSyncOpenClawConfig reads the current config and builds the initial snapshot
// without emitting diff events (since there's no previous state to diff against).
func (e *SyncEngine) coldSyncOpenClawConfig() {
	configPath := filepath.Join(e.home, ".openclaw", "openclaw.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return // config doesn't exist yet
	}

	hash := fmt.Sprintf("%x", sha256.Sum256(data))
	agents := parseOpenClawAgents(data)

	snap := &configSnapshot{
		hash:     hash,
		agentIDs: make(map[string]string, len(agents)),
	}
	for _, a := range agents {
		snap.agentIDs[a.id] = a.name
	}
	e.lastOCConfig = snap

	// Seed into SQLite on boot (same as the existing seedAgents in cmd/main.go,
	// but now the sync engine owns it so it stays reactive).
	seeds := make([]store.SeedAgent, 0, len(agents))
	for _, a := range agents {
		status := "idle"
		if a.id == "main" {
			status = "active"
		}
		seeds = append(seeds, store.SeedAgent{
			ID:      a.id,
			Name:    a.name,
			Status:  status,
			Runtime: "openclaw",
		})
	}
	if err := e.store.SeedAgents(seeds); err != nil {
		log.Printf("[sync] cold sync config SeedAgents: %v", err)
	}
}
