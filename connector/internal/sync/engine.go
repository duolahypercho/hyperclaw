package sync

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	gosync "sync"
	"sync/atomic"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/hypercho/hyperclaw-connector/internal/store"
	"github.com/hypercho/hyperclaw-connector/internal/token"
)

const (
	defaultTokenColdSyncLookback = 24 * time.Hour
	maxTokenColdSyncFileBytes    = 64 << 20
	maxAgentFileBytes            = 1 << 20
)

// HubNotifier sends an event payload to connected dashboards.
type HubNotifier func(eventType string, data map[string]interface{})

// SyncEngine owns all file ↔ SQLite synchronisation.
type SyncEngine struct {
	store   *store.Store
	notify  HubNotifier
	roots   []WatchRoot
	guard   *WriteGuard
	watcher *fsnotify.Watcher
	home    string // user home directory, used for cold-syncing token usage

	workCh chan func()
	stopCh chan struct{}

	coldSyncing atomic.Bool
	pendingMu   gosync.Mutex
	pending     []fsnotify.Event

	debounce   map[string]*time.Timer
	debounceMu gosync.Mutex

	// Runtime uninstall detection
	openclawWasPresent atomic.Bool
	openclawNotified   atomic.Bool
	hermesWasPresent   atomic.Bool
	hermesNotified     atomic.Bool

	// Config watcher: last known openclaw.json snapshot for diffing.
	lastOCConfig *configSnapshot

	// Company propagator: hash of last propagated COMPANY.md content.
	lastCompanyHash string
}

// New creates and boots a SyncEngine. Call Stop() to shut it down.
func New(s *store.Store, notify HubNotifier, home string) (*SyncEngine, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("fsnotify: %w", err)
	}
	e := &SyncEngine{
		store:    s,
		notify:   notify,
		roots:    WatchRoots(home),
		guard:    newWriteGuard(),
		watcher:  w,
		home:     home,
		workCh:   make(chan func(), 256),
		stopCh:   make(chan struct{}),
		debounce: make(map[string]*time.Timer),
	}
	go e.workLoop()
	e.boot()
	return e, nil
}

// Stop shuts down the engine.
func (e *SyncEngine) Stop() {
	close(e.stopCh)
	e.watcher.Close()
	// Cancel all pending debounce timers to prevent post-stop work.
	e.debounceMu.Lock()
	for key, t := range e.debounce {
		t.Stop()
		delete(e.debounce, key)
	}
	e.debounceMu.Unlock()
}

// boot registers watch roots, cold-syncs, then replays queued events.
func (e *SyncEngine) boot() {
	e.coldSyncing.Store(true)

	for _, root := range e.roots {
		e.addWatchDir(root.Dir)
	}

	// Watch the company directory for cross-runtime COMPANY.md propagation.
	companyDir := filepath.Join(e.home, ".hyperclaw", "company")
	e.addWatchDir(companyDir)

	e.coldSync()

	// Bootstrap config watcher: build initial snapshot + seed agents into SQLite.
	e.coldSyncOpenClawConfig()

	// Explicitly watch OpenClaw agents/*/sessions/ directories so hot-sync
	// catches new JSONL session files. These are 3 levels deep from ~/.openclaw
	// and missed by the 1-level-deep addWatchDir.
	e.addOpenClawSessionWatchers()

	e.coldSyncing.Store(false)

	// Replay events that arrived during cold sync.
	e.pendingMu.Lock()
	queued := e.pending
	e.pending = nil
	e.pendingMu.Unlock()
	for _, ev := range queued {
		e.enqueueFileEvent(ev.Name)
	}

	// Initialize runtime presence state and start detection loop
	e.openclawWasPresent.Store(e.isRuntimePresent(".openclaw"))
	e.hermesWasPresent.Store(e.isRuntimePresent(".hermes"))

	// Check for orphaned agents on boot (runtime missing but agents exist in DB)
	e.checkOrphanedAgentsOnBoot()

	go e.runtimeDetectionLoop()

	go e.watchLoop()
}

// checkOrphanedAgentsOnBoot checks if any runtime is missing but has agents in the database.
// This handles the case where the runtime was uninstalled before the connector started.
func (e *SyncEngine) checkOrphanedAgentsOnBoot() {
	if e.store == nil || e.notify == nil {
		return
	}

	runtimes := []struct {
		dirName  string
		runtime  string
		notified *atomic.Bool
	}{
		{".openclaw", "openclaw", &e.openclawNotified},
		{".hermes", "hermes", &e.hermesNotified},
	}

	for _, r := range runtimes {
		if e.isRuntimePresent(r.dirName) {
			continue // Runtime exists, no orphans
		}

		count, err := e.store.CountAgentsByRuntime(r.runtime)
		if err != nil || count == 0 {
			continue // No agents or error
		}

		// Runtime is missing but has agents — notify dashboard
		log.Printf("[sync] Found %d orphaned %s agents (runtime not installed)", count, r.runtime)
		r.notified.Store(true)
		e.notify("runtime.uninstalled", map[string]interface{}{
			"runtime":    r.runtime,
			"agentCount": count,
			"onBoot":     true,
		})
	}
}

// isRuntimePresent checks if a runtime CLI is available (not just config directory).
// This handles cases where user uninstalls the CLI but config directory remains.
func (e *SyncEngine) isRuntimePresent(dirName string) bool {
	// Map config dir to CLI command
	cliNames := map[string][]string{
		".openclaw": {"openclaw"},
		".hermes":   {"hermes", "hermes-agent"},
	}

	cliCandidates, ok := cliNames[dirName]
	if !ok {
		// Fallback to directory check for unknown runtimes
		dir := filepath.Join(e.home, dirName)
		info, err := os.Stat(dir)
		return err == nil && info.IsDir()
	}

	// Check if any CLI name is available in PATH
	for _, cli := range cliCandidates {
		if _, err := exec.LookPath(cli); err == nil {
			return true
		}
	}

	// Launchd daemons have a minimal PATH. Check common install locations
	// so we don't falsely flag runtimes as uninstalled.
	extraPaths := []string{
		filepath.Join(e.home, ".npm-global/bin"),
		filepath.Join(e.home, ".local/bin"),
		filepath.Join(e.home, "Library/pnpm"),
		filepath.Join(e.home, ".local/share/pnpm"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		filepath.Join(e.home, "Library/Python/3.11/bin"),
		filepath.Join(e.home, "Library/Python/3.12/bin"),
		filepath.Join(e.home, "Library/Python/3.13/bin"),
	}
	for _, dir := range extraPaths {
		for _, cli := range cliCandidates {
			if _, err := os.Stat(filepath.Join(dir, cli)); err == nil {
				return true
			}
		}
	}
	return false
}

// runtimeDetectionLoop periodically checks if runtimes have been uninstalled.
// When detected, it emits "runtime.uninstalled" events.
func (e *SyncEngine) runtimeDetectionLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Check OpenClaw
			e.checkRuntimeUninstall(
				".openclaw",
				"openclaw",
				&e.openclawWasPresent,
				&e.openclawNotified,
			)

			// Check Hermes
			e.checkRuntimeUninstall(
				".hermes",
				"hermes",
				&e.hermesWasPresent,
				&e.hermesNotified,
			)

		case <-e.stopCh:
			return
		}
	}
}

// checkRuntimeUninstall checks if a specific runtime was uninstalled and emits an event.
func (e *SyncEngine) checkRuntimeUninstall(
	dirName string,
	runtime string,
	wasPresent *atomic.Bool,
	notified *atomic.Bool,
) {
	was := wasPresent.Load()
	is := e.isRuntimePresent(dirName)

	if was && !is && !notified.Load() {
		// Runtime was present but now gone — emit uninstall event
		log.Printf("[sync] %s uninstall detected", runtime)
		notified.Store(true)

		// Get count of affected agents
		var agentCount int
		if e.store != nil {
			agentCount, _ = e.store.CountAgentsByRuntime(runtime)
		}

		if e.notify != nil && agentCount > 0 {
			e.notify("runtime.uninstalled", map[string]interface{}{
				"runtime":    runtime,
				"agentCount": agentCount,
			})
		}
	} else if !was && is {
		// Runtime was reinstalled — reset notification state
		notified.Store(false)
	}

	wasPresent.Store(is)
}

// addOpenClawSessionWatchers registers ~/.openclaw/agents/*/sessions/ directories
// with the file watcher so that new JSONL session files are hot-synced.
func (e *SyncEngine) addOpenClawSessionWatchers() {
	for _, root := range e.roots {
		if root.Runtime != RuntimeOpenClaw {
			continue
		}
		agentsDir := filepath.Join(root.Dir, "agents")
		agents, err := os.ReadDir(agentsDir)
		if err != nil {
			return
		}
		for _, agent := range agents {
			if !agent.IsDir() {
				continue
			}
			sessDir := filepath.Join(agentsDir, agent.Name(), "sessions")
			if _, err := os.Stat(sessDir); err == nil {
				_ = e.watcher.Add(sessDir)
			}
		}
	}
}

// addWatchDir adds a directory and its immediate subdirectories to the watcher.
// Personality files live at depth 0 (root) or depth 1 (one subdirectory).
// Deeper recursion exhausts macOS kqueue file descriptor limits on repos with
// many nested files (e.g. ~/.openclaw/agents/main/agent/*.tmp).
func (e *SyncEngine) addWatchDir(dir string) {
	e.addWatchDirDepth(dir, 0)
}

func (e *SyncEngine) addWatchDirDepth(dir string, depth int) {
	if _, err := os.Stat(dir); err != nil {
		return // dir doesn't exist yet
	}
	_ = e.watcher.Add(dir)
	if depth >= 1 {
		return // don't recurse beyond one level
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			e.addWatchDirDepth(filepath.Join(dir, entry.Name()), depth+1)
		}
	}
}

// coldSync walks all watch root subdirs and upserts files that differ from SQLite.
// Also cold-syncs token usage from all runtimes on first boot.
func (e *SyncEngine) coldSync() {
	for _, root := range e.roots {
		_ = filepath.WalkDir(root.Dir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			fc, ok := ClassifyPath(path, e.roots)
			if !ok {
				return nil
			}
			if info, statErr := d.Info(); statErr == nil && info.Size() > maxAgentFileBytes {
				log.Printf("[sync] skipping oversized agent file during cold sync: %s (%d bytes)", path, info.Size())
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return nil
			}
			content := normContent(data)
			hash := hashContent(content)
			stored, _ := e.store.GetAgentFileHash(fc.AgentID, fc.FileKey)
			if stored == hash {
				return nil // unchanged
			}
			_ = e.store.UpsertAgentFile(fc.AgentID, fc.FileKey, content, hash)
			if fc.FileKey == "IDENTITY" {
				e.syncIdentityFromContent(fc.AgentID, content, fc.Runtime)
			}
			return nil
		})
	}

	// Cold-sync historical token usage from all runtimes.
	// Runs in background — does not block the watcher from starting.
	go e.coldSyncTokenUsage()
}

// coldSyncTokenUsage ingests historical token data from Claude Code, Codex,
// and OpenClaw sessions that already exist on disk before the daemon started.
// Called once at boot on a background goroutine.
func (e *SyncEngine) coldSyncTokenUsage() {
	var totalRows int
	cutoff := time.Now().Add(-defaultTokenColdSyncLookback)

	// ── Claude Code: walk ~/.claude/projects/**/*.jsonl ─────────────────────
	// Claude Code and Codex are coding runtimes whose agent personalities live
	// in ~/.hyperclaw/agents/, but token usage is still read from their native
	// session directories on disk.
	claudeRoot := filepath.Join(e.home, ".claude", "projects")
	openclawRoot := ""
	for _, r := range e.roots {
		if r.Runtime == RuntimeOpenClaw {
			openclawRoot = r.Dir
		}
	}

	// Build set of known claude-code agent IDs so we can attribute sessions by path.
	claudeAgentIDs := map[string]bool{}
	if identities, err := e.store.ListAgentIdentities(); err == nil {
		for _, id := range identities {
			if id.Runtime == "claude-code" {
				claudeAgentIDs[id.ID] = true
			}
		}
	}

	if claudeRoot != "" {
		_ = filepath.WalkDir(claudeRoot, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".jsonl") {
				return nil
			}
			if !shouldColdSyncTokenFile(path, cutoff) {
				return nil
			}
			// Attribute session to a named agent when the first path component
			// under ~/.claude/projects/ matches a known claude-code agent ID.
			// e.g. ~/.claude/projects/lucas/abc123.jsonl → agentID = "lucas"
			agentIDFromPath := ""
			if rel, relErr := filepath.Rel(claudeRoot, path); relErr == nil {
				parts := strings.SplitN(filepath.ToSlash(rel), "/", 2)
				if len(parts) > 0 && claudeAgentIDs[parts[0]] {
					agentIDFromPath = parts[0]
				}
			}
			rows, err := token.ParseClaudeCodeSessionFile(path)
			if err != nil {
				return nil
			}
			for i := range rows {
				if agentIDFromPath != "" {
					rows[i].AgentID = agentIDFromPath
				}
				rows[i].CostUSD = e.store.ComputeCostUSD(
					rows[i].Model, rows[i].InputTokens, rows[i].OutputTokens,
					rows[i].CacheReadTokens, rows[i].RecordedAt,
				)
				if err := e.store.InsertTokenUsage(rows[i]); err == nil {
					totalRows++
				}
			}
			// Backfill any existing unattributed rows for this session file.
			if agentIDFromPath != "" && len(rows) > 0 {
				pathKey := rows[0].DedupKey // format: "claude-code:{pathKey}:N" — extract pathKey
				if parts := strings.SplitN(rows[0].DedupKey, ":", 3); len(parts) == 3 {
					pathKey = parts[1]
					_, _ = e.store.BackfillAgentID(agentIDFromPath, "claude-code", pathKey)
				}
			}
			return nil
		})
	}

	// ── Codex: walk ~/.codex/sessions/**/*.jsonl ─────────────────────────────
	for _, path := range token.WalkCodexSessions(e.home) {
		if !shouldColdSyncTokenFile(path, cutoff) {
			continue
		}
		rows, err := token.ParseCodexSessionFile(path)
		if err != nil {
			continue
		}
		for i := range rows {
			rows[i].CostUSD = e.store.ComputeCostUSD(
				rows[i].Model, rows[i].InputTokens, rows[i].OutputTokens,
				rows[i].CacheReadTokens, rows[i].RecordedAt,
			)
			if err := e.store.InsertTokenUsage(rows[i]); err == nil {
				totalRows++
			}
		}
	}

	// ── OpenClaw: walk ~/.openclaw/agents/*/sessions/*.jsonl ──────────────────
	if openclawRoot != "" {
		for _, pair := range token.WalkOpenClawSessions(openclawRoot) {
			path, agentID := pair[0], pair[1]
			if !shouldColdSyncTokenFile(path, cutoff) {
				continue
			}
			rows, err := token.ParseOpenClawSessionFile(path, agentID)
			if err != nil {
				continue
			}
			for i := range rows {
				// OpenClaw session files carry a pre-computed cost (from the provider).
				// Only fall back to ComputeCostUSD if the parser didn't set a cost.
				if rows[i].CostUSD == 0 {
					rows[i].CostUSD = e.store.ComputeCostUSD(
						rows[i].Model, rows[i].InputTokens, rows[i].OutputTokens,
						rows[i].CacheReadTokens, rows[i].RecordedAt,
					)
				}
				if err := e.store.InsertTokenUsage(rows[i]); err == nil {
					totalRows++
				}
			}
		}
	}

	if totalRows > 0 {
		log.Printf("[sync] cold-synced %d token usage rows", totalRows)
		if e.notify != nil {
			e.notify("token.usage.updated", map[string]interface{}{
				"source": "cold-sync",
				"rows":   totalRows,
			})
		}
	}

	runtime.GC()
}

func shouldColdSyncTokenFile(path string, cutoff time.Time) bool {
	if os.Getenv("HYPERCLAW_FULL_TOKEN_COLD_SYNC") == "1" {
		return true
	}
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	if info.Size() > maxTokenColdSyncFileBytes {
		log.Printf("[sync] skipping large token session during cold sync: %s (%d bytes)", path, info.Size())
		return false
	}
	return info.ModTime().After(cutoff)
}

// workLoop serialises all sync work on a single goroutine.
func (e *SyncEngine) workLoop() {
	for {
		select {
		case fn := <-e.workCh:
			fn()
		case <-e.stopCh:
			return
		}
	}
}

// enqueue schedules fn on the work goroutine.
func (e *SyncEngine) enqueue(fn func()) {
	select {
	case e.workCh <- fn:
	default:
		log.Println("[sync] work channel full, dropping event")
	}
}

// enqueueFileEvent debounces a path change and enqueues onFileChanged.
func (e *SyncEngine) enqueueFileEvent(path string) {
	// Normalize path key for cross-platform case-insensitive filesystems.
	key := strings.ToLower(filepath.Clean(path))
	e.debounceMu.Lock()
	if t, ok := e.debounce[key]; ok {
		t.Reset(300 * time.Millisecond)
	} else {
		e.debounce[key] = time.AfterFunc(300*time.Millisecond, func() {
			e.debounceMu.Lock()
			delete(e.debounce, key)
			e.debounceMu.Unlock()
			e.enqueue(func() { e.onFileChanged(path) })
		})
	}
	e.debounceMu.Unlock()
}

// watchLoop processes fsnotify events.
func (e *SyncEngine) watchLoop() {
	for {
		select {
		case ev, ok := <-e.watcher.Events:
			if !ok {
				return
			}
			if ev.Has(fsnotify.Write) || ev.Has(fsnotify.Create) || ev.Has(fsnotify.Rename) {
				if e.coldSyncing.Load() {
					e.pendingMu.Lock()
					e.pending = append(e.pending, ev)
					e.pendingMu.Unlock()
				} else {
					e.enqueueFileEvent(ev.Name)
				}
			}
		case err, ok := <-e.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[sync] watcher error: %v", err)
		case <-e.stopCh:
			return
		}
	}
}

// onFileChanged handles a debounced file change event (called on work goroutine).
func (e *SyncEngine) onFileChanged(absPath string) {
	// Claude Code / Codex session files are .jsonl — they don't classify as agent
	// personality files (no .md extension) but do carry token usage data.
	// Handle them here before the ClassifyPath gate so ingestion is not skipped.
	if strings.HasSuffix(absPath, ".jsonl") {
		e.ingestJSONLSession(absPath)
		return
	}

	// OpenClaw config: detect agent list changes (adds/removes via Telegram, CLI, etc.).
	if e.isOpenClawConfig(absPath) {
		e.onOpenClawConfigChanged(absPath)
		return
	}

	// COMPANY.md: propagate across all runtime workspaces.
	if e.isCompanyFile(absPath) {
		e.onCompanyFileChanged(absPath)
		// Don't return — fall through so ClassifyPath can also handle it
		// if it's a tracked personality file (it won't, since COMPANY.md
		// isn't in knownFileKeys, but this is future-safe).
	}

	fc, ok := ClassifyPath(absPath, e.roots)
	if !ok {
		return
	}
	// Retry once for editors that briefly lock files (Windows).
	data, err := os.ReadFile(absPath)
	if err != nil {
		time.Sleep(50 * time.Millisecond)
		data, err = os.ReadFile(absPath)
		if err != nil {
			log.Printf("[sync] cannot read %s: %v", absPath, err)
			return
		}
	}
	if len(data) > maxAgentFileBytes {
		log.Printf("[sync] ignoring oversized agent file change: %s (%d bytes)", absPath, len(data))
		return
	}
	content := normContent(data)
	hash := hashContent(content)

	if e.guard.IsOurWrite(absPath, hash) {
		return // suppress echo from our own write
	}

	stored, _ := e.store.GetAgentFileHash(fc.AgentID, fc.FileKey)
	if stored == hash {
		return // no actual change
	}
	if err := e.store.UpsertAgentFile(fc.AgentID, fc.FileKey, content, hash); err != nil {
		log.Printf("[sync] UpsertAgentFile %s/%s: %v", fc.AgentID, fc.FileKey, err)
		return
	}
	if fc.FileKey == "IDENTITY" {
		e.syncIdentityFromContent(fc.AgentID, content, fc.Runtime)
	}
	if e.notify != nil {
		e.notify("agent.file.changed", map[string]interface{}{
			"agentId": fc.AgentID,
			"fileKey": fc.FileKey,
			"runtime": string(fc.Runtime),
		})
	}

}

// ingestJSONLSession parses a Claude Code, Codex, or OpenClaw JSONL session
// file and persists token usage rows. Called on the work goroutine.
func (e *SyncEngine) ingestJSONLSession(path string) {
	var rows []store.TokenUsageRow
	var err error
	runtime := "claude-code"
	precomputedCost := false

	// Route to the correct parser based on path prefix.
	normalised := filepath.ToSlash(strings.ToLower(path))
	openclawAgentsDir := filepath.ToSlash(strings.ToLower(filepath.Join(e.home, ".openclaw", "agents")))
	codexSessDir := filepath.ToSlash(strings.ToLower(filepath.Join(e.home, ".codex", "sessions")))

	if strings.HasPrefix(normalised, openclawAgentsDir) {
		// OpenClaw: derive agentId from path ~/.openclaw/agents/{agentId}/sessions/file.jsonl
		runtime = "openclaw"
		rel := strings.TrimPrefix(normalised, openclawAgentsDir+"/")
		agentID := strings.SplitN(rel, "/", 2)[0]
		rows, err = token.ParseOpenClawSessionFile(path, agentID)
		precomputedCost = true // cost already set by the parser from session data
	} else if strings.HasPrefix(normalised, codexSessDir) {
		runtime = "codex"
		rows, err = token.ParseCodexSessionFile(path)
	} else {
		rows, err = token.ParseClaudeCodeSessionFile(path)
		// Attribute to a named agent when path is inside ~/.claude/projects/{agentId}/
		claudeRoot := filepath.Join(e.home, ".claude", "projects")
		if rel, relErr := filepath.Rel(claudeRoot, path); relErr == nil && !strings.HasPrefix(rel, "..") {
			parts := strings.SplitN(filepath.ToSlash(rel), "/", 2)
			if len(parts) > 0 && parts[0] != "" && parts[0] != "." {
				agentID := parts[0]
				if id, dbErr := e.store.GetAgentIdentity(agentID); dbErr == nil && id != nil && id.Runtime == "claude-code" {
					for i := range rows {
						rows[i].AgentID = agentID
					}
				}
			}
		}
	}
	if err != nil {
		log.Printf("[sync] JSONL parse error %s: %v", path, err)
		return
	}

	var inserted int
	for i := range rows {
		// For runtimes that pre-compute cost (openclaw), only fall back to
		// ComputeCostUSD when the parser didn't produce a cost value.
		if !precomputedCost || rows[i].CostUSD == 0 {
			rows[i].CostUSD = e.store.ComputeCostUSD(
				rows[i].Model, rows[i].InputTokens, rows[i].OutputTokens,
				rows[i].CacheReadTokens, rows[i].RecordedAt,
			)
		}
		if err := e.store.InsertTokenUsage(rows[i]); err == nil {
			inserted++
		}
	}
	if inserted > 0 && e.notify != nil {
		e.notify("token.usage.updated", map[string]interface{}{
			"source": runtime,
			"path":   path,
			"rows":   inserted,
		})
	}
}

// WriteAgentFile writes content to the runtime file and upserts SQLite.
// Sets the write guard before writing to prevent echo loop.
func (e *SyncEngine) WriteAgentFile(agentID, fileKey, content, runtimePath, runtime string) error {
	if len(content) > maxAgentFileBytes {
		return fmt.Errorf("agent file too large: %d bytes exceeds %d byte limit", len(content), maxAgentFileBytes)
	}
	content = normContent([]byte(content))
	hash := hashContent(content)
	e.guard.Set(runtimePath, hash)
	if err := os.WriteFile(runtimePath, []byte(content), 0600); err != nil {
		e.guard.Remove(runtimePath)
		return err
	}
	if err := e.store.UpsertAgentFile(agentID, fileKey, content, hash); err != nil {
		log.Printf("[sync] WriteAgentFile DB upsert failed for %s/%s: %v (file written; will re-sync on next event)", agentID, fileKey, err)
	}
	if e.notify != nil {
		e.notify("agent.file.changed", map[string]interface{}{
			"agentId": agentID,
			"fileKey": fileKey,
			"runtime": runtime,
		})
	}
	return nil
}

// syncIdentityFromContent parses an IDENTITY.md content string and upserts agent_identity.
func (e *SyncEngine) syncIdentityFromContent(agentID, content string, runtime Runtime) {
	// When the file lives under ~/.hyperclaw/agents/ (RuntimeHyperclaw), that
	// directory is the canonical personality store shared by ALL runtimes.
	// The agent's true runtime was recorded intentionally by setupAgent; don't
	// overwrite a specific runtime (claude-code, codex, openclaw, hermes) with
	// the generic "hyperclaw" label just because the file watcher fired.
	effectiveRuntime := runtime
	if runtime == RuntimeHyperclaw {
		// 1. Check the on-disk .runtime file written by setupAgent — this is the
		//    ground truth and survives a fresh/wiped SQLite database.
		runtimeFile := e.hyperclawAgentRuntimeFile(agentID)
		if data, err := os.ReadFile(runtimeFile); err == nil {
			if r := Runtime(strings.TrimSpace(string(data))); r != "" && r != RuntimeHyperclaw {
				effectiveRuntime = r
			}
		}
		// 2. Fall back to the existing SQLite row (handles agents created before
		//    the .runtime file was introduced).
		if effectiveRuntime == RuntimeHyperclaw {
			if existing, err := e.store.GetAgentIdentity(agentID); err == nil && existing != nil &&
				existing.Runtime != "" && existing.Runtime != string(RuntimeHyperclaw) {
				effectiveRuntime = Runtime(existing.Runtime)
			}
		}
		// 3. Parse the Runtime field from IDENTITY.md content as a last resort.
		//    This handles agents created before .runtime files were written and
		//    whose SQLite row was previously stomped to "hyperclaw".
		if effectiveRuntime == RuntimeHyperclaw {
			for _, line := range strings.Split(content, "\n") {
				if val, ok := extractIdentityField(line, "runtime"); ok {
					if r := Runtime(strings.TrimSpace(val)); r != "" && r != RuntimeHyperclaw {
						effectiveRuntime = r
						// Also persist the .runtime file so future runs skip steps 1-3.
						runtimeFile := e.hyperclawAgentRuntimeFile(agentID)
						_ = os.WriteFile(runtimeFile, []byte(string(r)), 0600)
					}
					break
				}
			}
		}
	}

	id := store.AgentIdentity{
		ID:      agentID,
		Runtime: string(effectiveRuntime),
	}
	for _, line := range strings.Split(content, "\n") {
		if val, ok := extractIdentityField(line, "name"); ok && id.Name == "" {
			id.Name = val
		} else if val, ok := extractIdentityField(line, "emoji"); ok && id.Emoji == "" {
			id.Emoji = val
		} else if val, ok := extractIdentityField(line, "avatar"); ok && id.AvatarData == "" {
			// Only store absolute URLs or data URIs — filenames can't be resolved outside the gateway
			lower := strings.ToLower(val)
			if strings.HasPrefix(lower, "http") || strings.HasPrefix(lower, "data:") {
				id.AvatarData = val
			}
		}
	}
	_ = e.store.UpsertAgentIdentity(id)
}

// extractIdentityField extracts a named field from common IDENTITY.md line formats:
//
//	"- **Name:** Foo"   (markdown bold list item)
//	"**Name:** Foo"     (markdown bold inline)
//	"name: Foo"         (plain key-value)
//	"- name: Foo"       (plain list item)
//
// Comparison is case-insensitive. Trailing parenthetical hints like "_(note...)" are stripped.
func extractIdentityField(line, field string) (string, bool) {
	// Use the trimmed line for both matching and value extraction so that
	// len(prefix) always aligns correctly even when line has leading whitespace.
	trimmed := strings.TrimSpace(line)
	ltrimmed := strings.ToLower(trimmed)
	lfield := strings.ToLower(field)
	prefixes := []string{
		"- **" + lfield + ":**",
		"**" + lfield + ":**",
		"- " + lfield + ":",
		lfield + ":",
	}
	for _, p := range prefixes {
		if strings.HasPrefix(ltrimmed, p) {
			val := strings.TrimSpace(trimmed[len(p):])
			if idx := strings.Index(val, "_("); idx >= 0 {
				val = strings.TrimSpace(val[:idx])
			}
			return val, true
		}
	}
	return "", false
}

// hyperclawAgentRuntimeFile returns the path to the .runtime file for an agent
// under the ~/.hyperclaw/agents/{id}/ directory.
func (e *SyncEngine) hyperclawAgentRuntimeFile(agentID string) string {
	for _, root := range e.roots {
		if root.Runtime == RuntimeHyperclaw {
			return filepath.Join(root.Dir, agentID, ".runtime")
		}
	}
	return filepath.Join(e.home, ".hyperclaw", "agents", agentID, ".runtime")
}

// hashContent returns the sha256 hex of content.
func hashContent(content string) string {
	h := sha256.Sum256([]byte(content))
	return hex.EncodeToString(h[:])
}

// normContent normalises raw file bytes to UTF-8 with LF line endings.
func normContent(data []byte) string {
	s := string(data)
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	return s
}
