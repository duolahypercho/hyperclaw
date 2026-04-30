package bridge

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/protocol"
	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// debugLogSessions writes debug info to a file for session listing troubleshooting
func debugLogSessions(format string, args ...interface{}) {
	home, _ := os.UserHomeDir()
	logPath := filepath.Join(home, ".hyperclaw", "session-debug.log")
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	msg := fmt.Sprintf(format, args...)
	f.WriteString(time.Now().Format("2006-01-02 15:04:05") + " " + msg + "\n")
}

// claudeCodeListSessions reads ~/.claude/history.jsonl and returns
// unique sessions, optionally filtered by project path.
// Params:
//   - projectPath (string): filter sessions to this project directory
//   - limit (float64): max sessions to return (default 50)
func (b *BridgeHandler) claudeCodeListSessions(params map[string]interface{}) actionResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return okResult(map[string]interface{}{"sessions": []interface{}{}})
	}

	projectPath, _ := params["projectPath"].(string)
	agentId, _ := params["agentId"].(string)
	limit := 50
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	// Debug: log incoming params
	debugLogSessions("[claude-code-list-sessions] agentId=%q projectPath=%q limit=%d", agentId, projectPath, limit)

	// projectPath takes priority: scope sessions to a specific project directory.
	if projectPath != "" {
		encodedDir := encodeClaudeProjectDir(projectPath)
		projectDir := filepath.Join(home, ".claude", "projects", encodedDir)
		if _, err := os.Stat(projectDir); err == nil {
			debugLogSessions("[claude-code-list-sessions] using explicit projectPath dir: %s", projectDir)
			return b.listClaudeSessionsFromDir(projectDir, limit)
		}
		debugLogSessions("[claude-code-list-sessions] explicit projectPath dir not found: %s", projectDir)
	}

	// When agentId is given, scope sessions to the agent's assigned project.
	// Priority: explicit projectPath > IDENTITY.md Project field > agent profile folder.
	// If none of those directories exist, fall back to history.jsonl so the user
	// can still see and resume their sessions.
	if agentId != "" {
		// 1. Try explicit projectPath from IDENTITY.md
		if projectPath == "" {
			if p := b.resolveProjectPathFromIdentityFile(agentId); p != "" {
				projectPath = p
				debugLogSessions("[claude-code-list-sessions] resolved projectPath from IDENTITY.md: %s", projectPath)
			}
		}

		// 2. If no explicit project, try the agent's profile folder.
		// Claude Code agents live at ~/.hyperclaw/agents/claude-code-{id}/ in
		// the v0.5.6+ layout. Fall back to the legacy un-namespaced dir for
		// pre-migration installs.
		if projectPath == "" {
			for _, candidatePath := range []string{
				b.paths.AgentDir("claude-code", agentId),
				b.paths.LegacyAgentDir(agentId),
			} {
				encodedDir := encodeClaudeProjectDir(candidatePath)
				candidateDir := filepath.Join(home, ".claude", "projects", encodedDir)
				if _, statErr := os.Stat(candidateDir); statErr == nil {
					projectPath = candidatePath
					debugLogSessions("[claude-code-list-sessions] using agent profile folder: %s", projectPath)
					break
				}
				debugLogSessions("[claude-code-list-sessions] agent profile dir not found in claude projects: %s", candidateDir)
			}
		}

		// Look up sessions for the resolved project path
		if projectPath != "" {
			encodedDir := encodeClaudeProjectDir(projectPath)
			projectDir := filepath.Join(home, ".claude", "projects", encodedDir)
			if _, statErr := os.Stat(projectDir); statErr == nil {
				debugLogSessions("[claude-code-list-sessions] found project dir, listing sessions: %s", projectDir)
				return b.listClaudeSessionsFromDir(projectDir, limit)
			}
			debugLogSessions("[claude-code-list-sessions] project dir not found: %s", projectDir)
		}

		// No scoped directory found — try the SQLite store which tracks
		// sessions by agent_id. This covers agents whose sessions were
		// created before the CWD was recorded, or where the Claude
		// project directory was cleaned up.
		debugLogSessions("[claude-code-list-sessions] no scoped dir found for agent %q, trying SQLite store", agentId)
		if b.store != nil {
			storeSessions, storeErr := b.store.GetSessionsByAgent("claude-code", agentId, projectPath, limit)
			if storeErr == nil && len(storeSessions) > 0 {
				debugLogSessions("[claude-code-list-sessions] found %d sessions in SQLite for agent %q", len(storeSessions), agentId)
				result := make([]map[string]interface{}, 0, len(storeSessions))
				for _, ss := range storeSessions {
					// Extract a display label from the session key.
					// Keys look like "claude:<uuid>" or "agent:<agentId>:<name>".
					label := ss.ID
					if parts := strings.SplitN(ss.ID, ":", 3); len(parts) >= 3 {
						label = parts[2]
					} else if strings.HasPrefix(ss.ID, "claude:") {
						sid := strings.TrimPrefix(ss.ID, "claude:")
						if len(sid) > 8 {
							label = sid[:8]
						}
					}
					e := map[string]interface{}{
						"id": ss.ID, "key": ss.ID,
						"label": label, "updatedAt": ss.UpdatedAt,
						"status": ss.Status,
					}
					result = append(result, e)
				}
				return okResult(map[string]interface{}{"sessions": result, "hasMore": false, "totalCount": len(result)})
			}
		}
		debugLogSessions("[claude-code-list-sessions] no sessions in SQLite for agent %q, falling back to history.jsonl", agentId)
	}

	// Fallback (no agentId, no projectPath): read history.jsonl and return
	debugLogSessions("[claude-code-list-sessions] WARNING: no agentId provided, falling back to history.jsonl")
	// all sessions unfiltered, for backward-compatible non-agent usage.
	historyPath := filepath.Join(home, ".claude", "history.jsonl")
	f, err := os.Open(historyPath)
	if err != nil {
		return okResult(map[string]interface{}{"sessions": []interface{}{}})
	}
	defer f.Close()

	type sessionEntry struct {
		ID        string
		Key       string
		Label     string
		Preview   string
		UpdatedAt int64
		Project   string
	}
	sessionMap := make(map[string]sessionEntry)

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		var entry struct {
			SessionID string `json:"sessionId"`
			Display   string `json:"display"`
			Timestamp int64  `json:"timestamp"`
			Project   string `json:"project"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err != nil || entry.SessionID == "" {
			continue
		}
		label := entry.Display
		if len(label) > 60 {
			label = label[:60] + "…"
		}
		if label == "" {
			label = entry.SessionID[:8]
		}
		preview := entry.Display
		if len(preview) > 200 {
			preview = preview[:200] + "…"
		}
		sessionMap[entry.SessionID] = sessionEntry{
			ID: entry.SessionID, Key: "claude:" + entry.SessionID,
			Label: label, Preview: preview, UpdatedAt: entry.Timestamp, Project: entry.Project,
		}
	}

	var statusMap map[string]string
	if b.store != nil {
		keys := make([]string, 0, len(sessionMap))
		for _, s := range sessionMap {
			keys = append(keys, s.Key)
		}
		statusMap = b.store.GetSessionStatusMap(keys)
	}

	sessions := make([]map[string]interface{}, 0, len(sessionMap))
	for _, s := range sessionMap {
		e := map[string]interface{}{
			"id": s.ID, "key": s.Key, "label": s.Label,
			"preview": s.Preview, "updatedAt": s.UpdatedAt, "project": s.Project,
		}
		if statusMap != nil {
			if st, ok := statusMap[s.Key]; ok && st != "" {
				e["status"] = st
			}
		}
		sessions = append(sessions, e)
	}
	sort.Slice(sessions, func(i, j int) bool {
		ti, _ := sessions[i]["updatedAt"].(int64)
		tj, _ := sessions[j]["updatedAt"].(int64)
		return ti > tj
	})
	hasMore := len(sessions) > limit
	if hasMore {
		sessions = sessions[:limit]
	}
	return okResult(map[string]interface{}{"sessions": sessions, "hasMore": hasMore, "totalCount": len(sessionMap)})
}

// listAllClaudeSessions scans every project directory under ~/.claude/projects/
// and returns a flat, deduplicated, time-sorted list of sessions. Used as a
// fallback when no agent-specific sessions exist yet.
func (b *BridgeHandler) listAllClaudeSessions(home string, limit int) actionResult {
	projectsDir := filepath.Join(home, ".claude", "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return okResult(map[string]interface{}{"sessions": []interface{}{}})
	}

	type sessionMeta struct {
		ID        string
		Label     string
		Preview   string
		UpdatedAt int64
	}
	seen := make(map[string]bool)
	var all []sessionMeta

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		projectDir := filepath.Join(projectsDir, entry.Name())
		subEntries, readErr := os.ReadDir(projectDir)
		if readErr != nil {
			continue
		}
		for _, sub := range subEntries {
			if sub.IsDir() || !strings.HasSuffix(sub.Name(), ".jsonl") {
				continue
			}
			sessionId := strings.TrimSuffix(sub.Name(), ".jsonl")
			if seen[sessionId] {
				continue
			}
			seen[sessionId] = true
			info, _ := sub.Info()
			var updatedAt int64
			if info != nil {
				updatedAt = info.ModTime().UnixMilli()
			}
			label, preview := extractClaudeSessionLabel(filepath.Join(projectDir, sub.Name()))
			if label == "" && len(sessionId) >= 8 {
				label = sessionId[:8]
			}
			all = append(all, sessionMeta{ID: sessionId, Label: label, Preview: preview, UpdatedAt: updatedAt})
		}
	}

	sort.Slice(all, func(i, j int) bool { return all[i].UpdatedAt > all[j].UpdatedAt })
	hasMore := len(all) > limit
	if hasMore {
		all = all[:limit]
	}

	var statusMap map[string]string
	if b.store != nil {
		keys := make([]string, 0, len(all))
		for _, s := range all {
			keys = append(keys, "claude:"+s.ID)
		}
		statusMap = b.store.GetSessionStatusMap(keys)
	}

	result := make([]map[string]interface{}, 0, len(all))
	for _, s := range all {
		e := map[string]interface{}{
			"id": s.ID, "key": "claude:" + s.ID,
			"label": s.Label, "preview": s.Preview, "updatedAt": s.UpdatedAt,
		}
		if statusMap != nil {
			if st, ok := statusMap["claude:"+s.ID]; ok && st != "" {
				e["status"] = st
			}
		}
		result = append(result, e)
	}
	if result == nil {
		result = []map[string]interface{}{}
	}
	return okResult(map[string]interface{}{"sessions": result, "hasMore": hasMore, "totalCount": len(result)})
}

// encodeClaudeProjectDir converts an absolute path to the directory name that
// Claude Code uses under ~/.claude/projects/. Path separators ('/' on Unix, '\' on
// Windows) and '.' are replaced with '-'.
// Examples:
//   - macOS/Linux: /Users/foo/.claude/projects/bar → -Users-foo--claude-projects-bar
//   - Windows: C:\Users\foo\.claude\projects\bar → C--Users-foo--claude-projects-bar
func encodeClaudeProjectDir(absPath string) string {
	return strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == '.' {
			return '-'
		}
		return r
	}, absPath)
}

// resolveClaudeProjectDir returns the Claude project directory for an isolated
// agent/session scope. Priority: explicit projectPath > IDENTITY.md Project >
// Hyperclaw agent dir fallback. Only returns a path if the directory actually
// exists — otherwise returns "" so callers can fall back to a global scan.
func (b *BridgeHandler) resolveClaudeProjectDir(agentId, projectPath string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	// Try candidates in priority order; return the first that exists on disk.
	candidates := []string{}
	if strings.TrimSpace(projectPath) != "" {
		candidates = append(candidates, projectPath)
	}
	if strings.TrimSpace(agentId) != "" {
		if p := b.resolveProjectPathFromIdentityFile(agentId); p != "" {
			candidates = append(candidates, p)
		}
		candidates = append(candidates, b.paths.AgentDir("claude-code", agentId))
		candidates = append(candidates, b.paths.LegacyAgentDir(agentId))
	}

	for _, c := range candidates {
		dir := filepath.Join(home, ".claude", "projects", encodeClaudeProjectDir(c))
		if _, statErr := os.Stat(dir); statErr == nil {
			return dir
		}
	}
	return ""
}

// findClaudeSessionFile locates the JSONL file for a given session ID. When an
// agent or project scope is provided, only that Claude project directory is
// searched so isolated agents do not bleed across unrelated sessions.
func (b *BridgeHandler) findClaudeSessionFile(sessionId, agentId, projectPath string) string {
	if sessionId == "" {
		return ""
	}

	if scopedDir := b.resolveClaudeProjectDir(agentId, projectPath); scopedDir != "" {
		candidate := filepath.Join(scopedDir, sessionId+".jsonl")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		// Scoped lookups should stay scoped. If the file is not in the isolated
		// directory, do not leak by falling back to a global scan.
		return ""
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	projectsDir := filepath.Join(home, ".claude", "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		candidate := filepath.Join(projectsDir, entry.Name(), sessionId+".jsonl")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return ""
}

// listClaudeSessionsFromDir reads *.jsonl session files from a Claude Code
// project directory and returns session metadata. The first user message in
// each file is used as the session label/preview.
func (b *BridgeHandler) listClaudeSessionsFromDir(projectDir string, limit int) actionResult {
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		return okResult(map[string]interface{}{"sessions": []interface{}{}})
	}

	type sessionMeta struct {
		ID        string
		Label     string
		Preview   string
		UpdatedAt int64
	}
	var sessions []sessionMeta

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}
		sessionId := strings.TrimSuffix(entry.Name(), ".jsonl")
		info, _ := entry.Info()
		var updatedAt int64
		if info != nil {
			updatedAt = info.ModTime().UnixMilli()
		}
		label, preview := extractClaudeSessionLabel(filepath.Join(projectDir, entry.Name()))
		if label == "" && len(sessionId) >= 8 {
			label = sessionId[:8]
		}
		sessions = append(sessions, sessionMeta{ID: sessionId, Label: label, Preview: preview, UpdatedAt: updatedAt})
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt > sessions[j].UpdatedAt
	})
	hasMore := len(sessions) > limit
	if hasMore {
		sessions = sessions[:limit]
	}

	var statusMap map[string]string
	if b.store != nil {
		keys := make([]string, 0, len(sessions))
		for _, s := range sessions {
			keys = append(keys, "claude:"+s.ID)
		}
		statusMap = b.store.GetSessionStatusMap(keys)
	}

	result := make([]map[string]interface{}, 0, len(sessions))
	for _, s := range sessions {
		e := map[string]interface{}{
			"id": s.ID, "key": "claude:" + s.ID,
			"label": s.Label, "preview": s.Preview, "updatedAt": s.UpdatedAt,
		}
		if statusMap != nil {
			if st, ok := statusMap["claude:"+s.ID]; ok && st != "" {
				e["status"] = st
			}
		}
		result = append(result, e)
	}
	return okResult(map[string]interface{}{"sessions": result, "hasMore": hasMore, "totalCount": len(result)})
}

// sessionLabelCache memoizes extractClaudeSessionLabel results keyed by file
// path + size + mtime. Without this cache the session list walk scans every
// JSONL file from start to finish on every poll; with a 37 MB live session
// that is hundreds of MB of allocation per dashboard tick.
type sessionLabelEntry struct {
	size    int64
	modUnix int64
	label   string
	preview string
}

var (
	sessionLabelCacheMu sync.Mutex
	sessionLabelCache   = make(map[string]sessionLabelEntry, 256)
)

// sessionLabelScanHeadBytes caps how far into the file we read when hunting
// for the first user message. The first user turn is almost always in the
// opening few KB of the session; scanning further is wasted work.
const sessionLabelScanHeadBytes = 64 * 1024

// sessionLabelScanTailBytes caps how far back from EOF we read when hunting
// for the last assistant message. Claude sessions chunk assistant output into
// content blocks so the most recent assistant turn typically fits in the
// final 512 KB even on long sessions.
const sessionLabelScanTailBytes = 512 * 1024

// extractClaudeSessionLabel reads a Claude Code session JSONL file and returns
// the first user message as label and the last assistant message as preview.
//
// Only the head and tail of the file are scanned; long sessions (tens of MB)
// are not read cover-to-cover. Results are cached by (path, size, mtime) so
// idle sessions are free to re-list.
func extractClaudeSessionLabel(filePath string) (label, preview string) {
	info, err := os.Stat(filePath)
	if err != nil {
		return "", ""
	}
	key := filePath
	size := info.Size()
	modUnix := info.ModTime().UnixNano()

	sessionLabelCacheMu.Lock()
	if cached, ok := sessionLabelCache[key]; ok && cached.size == size && cached.modUnix == modUnix {
		sessionLabelCacheMu.Unlock()
		return cached.label, cached.preview
	}
	sessionLabelCacheMu.Unlock()

	f, err := os.Open(filePath)
	if err != nil {
		return "", ""
	}
	defer f.Close()

	firstUserText := scanSessionHeadForUser(f)
	lastAssistantText := scanSessionTailForAssistant(f, size)

	// Label from first user message
	if firstUserText != "" {
		label = firstUserText
		if len(label) > 60 {
			label = label[:60] + "…"
		}
	}

	// Preview from last assistant message, fall back to first user message
	if lastAssistantText != "" {
		preview = lastAssistantText
	} else if firstUserText != "" {
		preview = firstUserText
	}
	if len(preview) > 200 {
		preview = preview[:200] + "…"
	}

	sessionLabelCacheMu.Lock()
	sessionLabelCache[key] = sessionLabelEntry{size: size, modUnix: modUnix, label: label, preview: preview}
	// Bound the cache. A workstation has O(100) sessions; 1024 is slack.
	if len(sessionLabelCache) > 1024 {
		for k := range sessionLabelCache {
			delete(sessionLabelCache, k)
			if len(sessionLabelCache) <= 768 {
				break
			}
		}
	}
	sessionLabelCacheMu.Unlock()

	return label, preview
}

// extractSessionEntryText parses one JSONL line and returns the first text
// body it finds plus the entry's top-level "type" field.
func extractSessionEntryText(line []byte) (entryType, text string) {
	var entry struct {
		Type    string `json:"type"`
		Message struct {
			Role    string      `json:"role"`
			Content interface{} `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal(line, &entry); err != nil {
		return "", ""
	}
	switch c := entry.Message.Content.(type) {
	case string:
		text = strings.TrimSpace(c)
	case []interface{}:
		for _, block := range c {
			if m, ok := block.(map[string]interface{}); ok && m["type"] == "text" {
				if t, ok := m["text"].(string); ok {
					text = strings.TrimSpace(t)
					break
				}
			}
		}
	}
	return entry.Type, text
}

// scanSessionHeadForUser reads at most sessionLabelScanHeadBytes from the
// start of the file looking for the first user message with non-empty text.
func scanSessionHeadForUser(f *os.File) string {
	if _, err := f.Seek(0, 0); err != nil {
		return ""
	}
	lr := &limitedReader{r: f, n: sessionLabelScanHeadBytes}
	scanner := bufio.NewScanner(lr)
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)
	for scanner.Scan() {
		entryType, text := extractSessionEntryText(scanner.Bytes())
		if text == "" {
			continue
		}
		if entryType == "user" {
			return text
		}
	}
	return ""
}

// scanSessionTailForAssistant reads the trailing sessionLabelScanTailBytes of
// the file and returns the last assistant message found in that window. If
// the tail window starts mid-line, the partial leading line is discarded.
func scanSessionTailForAssistant(f *os.File, size int64) string {
	start := int64(0)
	if size > sessionLabelScanTailBytes {
		start = size - sessionLabelScanTailBytes
	}
	if _, err := f.Seek(start, 0); err != nil {
		return ""
	}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	firstLine := true
	var last string
	for scanner.Scan() {
		if firstLine && start > 0 {
			firstLine = false
			continue // partial line, not a complete JSON object
		}
		firstLine = false
		entryType, text := extractSessionEntryText(scanner.Bytes())
		if text == "" {
			continue
		}
		if entryType == "assistant" {
			last = text
		}
	}
	return last
}

// limitedReader is a minimal io.Reader wrapper that stops after n bytes. We
// don't use io.LimitReader because os.File already satisfies io.Reader and we
// want to keep the scanner's backing file for the tail scan.
type limitedReader struct {
	r interface {
		Read(p []byte) (int, error)
	}
	n int64
}

func (lr *limitedReader) Read(p []byte) (int, error) {
	if lr.n <= 0 {
		return 0, errReadLimit
	}
	if int64(len(p)) > lr.n {
		p = p[:lr.n]
	}
	n, err := lr.r.Read(p)
	lr.n -= int64(n)
	return n, err
}

var errReadLimit = fmt.Errorf("read limit reached")

// claudeCodeListProjects reads ~/.claude/projects/ and returns a list
// of projects with session counts and last activity times.
func (b *BridgeHandler) claudeCodeListProjects() actionResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return okResult(map[string]interface{}{"projects": []interface{}{}})
	}

	projectsDir := filepath.Join(home, ".claude", "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return okResult(map[string]interface{}{"projects": []interface{}{}})
	}

	type projectInfo struct {
		DirName      string `json:"dirName"`
		ProjectPath  string `json:"projectPath"`
		SessionCount int    `json:"sessionCount"`
		LastActivity int64  `json:"lastActivity"`
	}

	var projects []map[string]interface{}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		dirName := entry.Name()
		projectDir := filepath.Join(projectsDir, dirName)

		subEntries, err := os.ReadDir(projectDir)
		if err != nil {
			continue
		}

		sessionCount := 0
		var latestMtime int64

		for _, sub := range subEntries {
			if sub.IsDir() || !strings.HasSuffix(sub.Name(), ".jsonl") {
				continue
			}
			sessionCount++
			info, err := sub.Info()
			if err != nil {
				continue
			}
			mtime := info.ModTime().UnixMilli()
			if mtime > latestMtime {
				latestMtime = mtime
			}
		}

		// Decode dir name to project path
		projectPath := decodeDirName(dirName)

		projects = append(projects, map[string]interface{}{
			"dirName":      dirName,
			"projectPath":  projectPath,
			"sessionCount": sessionCount,
			"lastActivity": latestMtime,
		})
	}

	// Sort by last activity descending
	sort.Slice(projects, func(i, j int) bool {
		ti, _ := projects[i]["lastActivity"].(int64)
		tj, _ := projects[j]["lastActivity"].(int64)
		return ti > tj
	})

	if projects == nil {
		projects = []map[string]interface{}{}
	}

	return okResult(map[string]interface{}{"projects": projects})
}

// claudeCodeLoadHistory reads a Claude Code session JSONL file and returns
// parsed chat messages for display in the dashboard.
// Params:
//   - sessionId (string, required): the UUID session ID
func (b *BridgeHandler) claudeCodeLoadHistory(params map[string]interface{}) actionResult {
	sessionId, _ := params["sessionId"].(string)
	if sessionId == "" {
		return errResult("sessionId is required")
	}
	agentId, _ := params["agentId"].(string)
	projectPath, _ := params["projectPath"].(string)

	sessionFile := b.findClaudeSessionFile(sessionId, agentId, projectPath)

	if sessionFile == "" {
		return okResult(map[string]interface{}{
			"messages":  []interface{}{},
			"sessionId": sessionId,
			"error":     "session file not found",
		})
	}

	f, err := os.Open(sessionFile)
	if err != nil {
		return errResult("failed to open session file: " + err.Error())
	}
	defer f.Close()

	type chatMessage struct {
		ID          string      `json:"id"`
		Role        string      `json:"role"`
		Content     string      `json:"content"`
		Timestamp   int64       `json:"timestamp"`
		Thinking    string      `json:"thinking,omitempty"`
		ToolCalls   interface{} `json:"toolCalls,omitempty"`
		ToolResults interface{} `json:"toolResults,omitempty"`
	}

	var messages []chatMessage

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 256*1024), 2*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		var entry map[string]interface{}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}

		entryType, _ := entry["type"].(string)
		if entryType != "user" && entryType != "assistant" {
			continue
		}

		uuid, _ := entry["uuid"].(string)
		timestamp, _ := entry["timestamp"].(string)

		var ts int64
		if timestamp != "" {
			// Parse ISO 8601 timestamp
			if t, err := parseISO8601(timestamp); err == nil {
				ts = t.UnixMilli()
			}
		}

		msg, ok := entry["message"].(map[string]interface{})
		if !ok {
			continue
		}

		role, _ := msg["role"].(string)
		if role != "user" && role != "assistant" {
			continue
		}

		// Skip sidechain messages (branched conversations)
		if isSidechain, ok := entry["isSidechain"].(bool); ok && isSidechain {
			continue
		}

		var contentStr string
		var thinking string
		var toolCalls []map[string]interface{}
		var toolResults []map[string]interface{}

		switch content := msg["content"].(type) {
		case string:
			contentStr = content
		case []interface{}:
			for _, block := range content {
				blockMap, ok := block.(map[string]interface{})
				if !ok {
					continue
				}
				blockType, _ := blockMap["type"].(string)
				switch blockType {
				case "text":
					text, _ := blockMap["text"].(string)
					if contentStr != "" {
						contentStr += "\n\n"
					}
					contentStr += text
				case "thinking":
					t, _ := blockMap["thinking"].(string)
					thinking = t
				case "tool_use":
					toolCalls = append(toolCalls, map[string]interface{}{
						"id":    blockMap["id"],
						"name":  blockMap["name"],
						"input": blockMap["input"],
					})
				case "tool_result":
					toolResults = append(toolResults, map[string]interface{}{
						"toolUseId": blockMap["tool_use_id"],
						"content":   blockMap["content"],
						"isError":   blockMap["is_error"],
					})
				}
			}
		}

		cm := chatMessage{
			ID:        uuid,
			Role:      role,
			Content:   contentStr,
			Timestamp: ts,
			Thinking:  thinking,
		}
		if len(toolCalls) > 0 {
			cm.ToolCalls = toolCalls
		}
		if len(toolResults) > 0 {
			cm.ToolResults = toolResults
		}

		messages = append(messages, cm)
	}

	if messages == nil {
		messages = []chatMessage{}
	}

	return okResult(map[string]interface{}{
		"messages":  messages,
		"sessionId": sessionId,
	})
}

// decodeDirName converts a Claude Code project directory name back to a path.
// e.g. "-Users-username-code-my-project" -> "/Users/username/code/my-project"
// Note: this is a best-effort decode since the encoding is lossy.
func decodeDirName(dirName string) string {
	if strings.HasPrefix(dirName, "-") {
		return "/" + strings.Replace(dirName[1:], "-", "/", -1)
	}
	return dirName
}

// parseISO8601 parses an ISO 8601 timestamp string.
func parseISO8601(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.000Z",
		"2006-01-02T15:04:05Z",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, &time.ParseError{Value: s}
}

// findClaudeSessionProjectDir looks up a session ID and returns its project directory.
// Strategy:
// 1. Check history.jsonl for the "project" field (fastest, no dir scan)
// 2. Find the session JSONL file and read the "cwd" from the first user message
func findClaudeSessionProjectDir(sessionId string) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	// Strategy 1: Check history.jsonl for the project path
	historyPath := filepath.Join(home, ".claude", "history.jsonl")
	if f, err := os.Open(historyPath); err == nil {
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.Contains(line, sessionId) {
				continue
			}
			var entry struct {
				SessionID string `json:"sessionId"`
				Project   string `json:"project"`
			}
			if err := json.Unmarshal([]byte(line), &entry); err == nil {
				if entry.SessionID == sessionId && entry.Project != "" {
					f.Close()
					if info, err := os.Stat(entry.Project); err == nil && info.IsDir() {
						return entry.Project
					}
				}
			}
		}
		f.Close()
	}

	// Strategy 2: Find the session JSONL file and read "cwd" from a user message
	projectsDir := filepath.Join(home, ".claude", "projects")
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		candidate := filepath.Join(projectsDir, entry.Name(), sessionId+".jsonl")
		f, err := os.Open(candidate)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			var msg struct {
				CWD string `json:"cwd"`
			}
			if err := json.Unmarshal(scanner.Bytes(), &msg); err == nil && msg.CWD != "" {
				f.Close()
				if info, err := os.Stat(msg.CWD); err == nil && info.IsDir() {
					return msg.CWD
				}
			}
		}
		f.Close()
	}

	return ""
}

// ── Claude Code CLI: send / status / abort ─────────────────────────────────

// activeClaudeProcs tracks in-flight Claude Code processes keyed by sessionKey.
var (
	activeClaudeProcs   = make(map[string]*claudeProc)
	activeClaudeProcsMu sync.Mutex
)

type claudeProc struct {
	cancel context.CancelFunc
	cmd    *exec.Cmd
}

// findClaudeBinary locates the claude CLI binary.
func findClaudeBinary() string {
	if p, err := exec.LookPath("claude"); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".local", "bin", "claude"),
		filepath.Join(home, ".npm-global", "bin", "claude"),
		filepath.Join(home, ".cargo", "bin", "claude"),
		"/usr/local/bin/claude",
		"/opt/homebrew/bin/claude",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// claudeEnv builds an environment for spawning claude with extra PATH entries.
func claudeEnv() []string {
	home, _ := os.UserHomeDir()
	base := os.Getenv("PATH")
	extra := []string{
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, ".npm-global", "bin"),
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, "bin"),
		"/usr/local/bin",
		"/opt/homebrew/bin",
	}
	newPath := strings.Join(append(extra, base), string(os.PathListSeparator))

	env := os.Environ()
	filtered := make([]string, 0, len(env)+1)
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			continue
		}
		filtered = append(filtered, e)
	}
	return append(filtered, "PATH="+newPath)
}

// claudeCodeStatus checks if the claude CLI is available.
func (b *BridgeHandler) claudeCodeStatus() actionResult {
	bin := findClaudeBinary()
	if bin == "" {
		return okResult(map[string]interface{}{"available": false, "error": "claude CLI not found"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, "--version")
	cmd.Env = claudeEnv()
	out, err := cmd.Output()
	if err != nil {
		return okResult(map[string]interface{}{"available": false, "error": err.Error()})
	}

	return okResult(map[string]interface{}{
		"available": true,
		"version":   strings.TrimSpace(string(out)),
	})
}

// claudeCodeSend spawns `claude -p <message> --output-format stream-json`
// and streams JSONL events back to the hub as protocol events.
// The final response is sent as a normal "res" message.
//
// This is a STREAMING action — it sends multiple event messages through toHub
// before sending the final response. The bridge.Handle method should NOT be used;
// instead call HandleStreaming which passes toHub to the handler.
func (b *BridgeHandler) claudeCodeSend(params map[string]interface{}, requestID string, toHub chan<- []byte) {
	message, _ := params["message"].(string)
	if message == "" {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "No message provided",
		}, toHub)
		return
	}

	agentId, _ := params["agentId"].(string)
	sessionId, _ := params["sessionId"].(string)
	sessionKey, _ := params["sessionKey"].(string)
	model, _ := params["model"].(string)
	projectPath, _ := params["projectPath"].(string)
	allowedTools, _ := params["allowedTools"].([]interface{})

	bin := findClaudeBinary()
	if bin == "" {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "claude CLI not found",
		}, toHub)
		return
	}

	args := []string{"-p", message, "--output-format", "stream-json", "--verbose", "--include-partial-messages"}
	home, _ := os.UserHomeDir()

	if sessionId != "" {
		args = append(args, "--resume", sessionId)
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	if len(allowedTools) > 0 {
		var tools []string
		for _, t := range allowedTools {
			if s, ok := t.(string); ok {
				tools = append(tools, s)
			}
		}
		if len(tools) > 0 {
			args = append(args, "--allowedTools", strings.Join(tools, ","))
		}
	}
	var promptFile string
	if agentId != "" {
		agentDir := filepath.Join(home, ".hyperclaw", "agents", agentId)
		personality := LoadAgentPersonality(agentDir, agentId)
		if systemPrompt := personality.BuildSystemPrompt("claude-code"); systemPrompt != "" {
			if tmpFile, err := os.CreateTemp("", "hyperclaw-claude-agent-*.md"); err == nil {
				_, _ = tmpFile.WriteString(systemPrompt)
				_ = tmpFile.Close()
				promptFile = tmpFile.Name()
				args = append(args, "--append-system-prompt-file", promptFile)
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = claudeEnv()
	if promptFile != "" {
		defer os.Remove(promptFile)
	}

	// Determine the working directory for the Claude Code process:
	//  1. Resume: use the session's original project dir (fixed by the session file)
	//  2. projectPath set: use the specified project directory
	//  3. agentId set: resolve from IDENTITY.md; fall back to virtual agent dir
	//  4. Fallback: home directory
	cmd.Dir = home
	if sessionId != "" {
		if projDir := findClaudeSessionProjectDir(sessionId); projDir != "" {
			cmd.Dir = projDir
		}
	} else if projectPath != "" {
		cmd.Dir = projectPath
	} else if agentId != "" {
		// If the agent has a project path in IDENTITY.md, use that so Claude runs
		// in the real codebase even when the frontend didn't pass projectPath.
		if p := b.resolveProjectPathFromIdentityFile(agentId); p != "" {
			cmd.Dir = p
		} else {
			// Use the canonical Hyperclaw agent directory as the project dir.
			// This is the single source of truth for all agent personality files.
			agentDir := filepath.Join(home, ".hyperclaw", "agents", agentId)
			if err := os.MkdirAll(agentDir, 0700); err == nil {
				cmd.Dir = agentDir
				// Regenerate CLAUDE.md so Claude Code sees the full personality.
				personality := LoadAgentPersonality(agentDir, agentId)
				if assembled := AssembleClaudeMd(personality); assembled != "" {
					_ = os.WriteFile(filepath.Join(agentDir, "CLAUDE.md"), []byte(assembled), 0600)
				}
			}
		}
	}

	// Set up process group for clean kill
	setProcGroup(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("failed to create stdout pipe: %v", err),
		}, toHub)
		return
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("failed to create stderr pipe: %v", err),
		}, toHub)
		return
	}

	if err := cmd.Start(); err != nil {
		cancel()
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("failed to spawn claude: %v", err),
		}, toHub)
		return
	}

	// Track the process for abort
	if sessionKey != "" {
		activeClaudeProcsMu.Lock()
		activeClaudeProcs[sessionKey] = &claudeProc{cancel: cancel, cmd: cmd}
		activeClaudeProcsMu.Unlock()

		// Mark session as active in the store so the inbox can show it as in-progress.
		if b.store != nil {
			b.store.UpsertSession(store.Session{
				ID:      sessionKey,
				Runtime: "claude-code",
				AgentID: agentId,
				Status:  "active",
				CWD:     cmd.Dir,
			})
		}
	}

	// Collect stderr in background
	var stderrBuf strings.Builder
	var stderrMu sync.Mutex
	var stderrWg sync.WaitGroup
	stderrWg.Add(1)
	go func() {
		defer stderrWg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)
		for scanner.Scan() {
			stderrMu.Lock()
			stderrBuf.WriteString(scanner.Text())
			stderrBuf.WriteByte('\n')
			stderrMu.Unlock()
		}
	}()

	// Stream JSONL events from stdout
	type collectedMsg struct {
		ID          string            `json:"id"`
		Role        string            `json:"role"`
		Content     string            `json:"content"`
		Timestamp   int64             `json:"timestamp"`
		Thinking    string            `json:"thinking,omitempty"`
		ToolCalls   interface{}       `json:"toolCalls,omitempty"`
		ToolResults interface{}       `json:"toolResults,omitempty"`
		Attachments []MediaAttachment `json:"attachments,omitempty"`
	}

	var collectedMessages []collectedMsg
	var resolvedSessionId string
	var lastToolCallId string
	// Maps tool_use id → file_path for Write/Edit tool calls so we can attach
	// the written file to the message once the tool_result confirms success.
	pendingWriteFiles := map[string]string{}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 256*1024), 2*1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var event map[string]interface{}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}

		// Extract session ID
		if sid, ok := event["session_id"].(string); ok && sid != "" {
			resolvedSessionId = sid
		}

		// Send raw JSONL event as a streaming event to dashboard
		sendStreamEvent(requestID, sessionKey, event, toHub)

		// Also collect messages for the final response
		eventType, _ := event["type"].(string)

		switch eventType {
		case "assistant":
			// Parse content blocks
			msg, ok := event["message"].(map[string]interface{})
			if !ok {
				continue
			}
			contentBlocks, _ := msg["content"].([]interface{})

			var textContent string
			var thinking string
			var toolCalls []map[string]interface{}

			for _, block := range contentBlocks {
				blockMap, ok := block.(map[string]interface{})
				if !ok {
					continue
				}
				blockType, _ := blockMap["type"].(string)
				switch blockType {
				case "text":
					text, _ := blockMap["text"].(string)
					textContent += text
				case "thinking":
					t, _ := blockMap["thinking"].(string)
					thinking = t
				case "tool_use":
					id, _ := blockMap["id"].(string)
					lastToolCallId = id
					name, _ := blockMap["name"].(string)
					toolCalls = append(toolCalls, map[string]interface{}{
						"id":        id,
						"name":      name,
						"arguments": toJSONString(blockMap["input"]),
					})
					// Track Write/Edit tool calls so we can attach the produced file.
					if name == "Write" || name == "Edit" || name == "MultiEdit" {
						if input, ok := blockMap["input"].(map[string]interface{}); ok {
							if fp, ok := input["file_path"].(string); ok && fp != "" {
								pendingWriteFiles[id] = fp
							}
						}
					}
				}
			}

			if len(toolCalls) > 0 {
				cm := collectedMsg{
					ID:        fmt.Sprintf("cc-tool-%d", time.Now().UnixMilli()),
					Role:      "assistant",
					Content:   textContent,
					Timestamp: time.Now().UnixMilli(),
					ToolCalls: toolCalls,
				}
				if thinking != "" {
					cm.Thinking = thinking
				}
				collectedMessages = append(collectedMessages, cm)
			} else if strings.TrimSpace(textContent) != "" {
				cm := collectedMsg{
					ID:        fmt.Sprintf("cc-text-%d-%d", time.Now().UnixMilli(), len(collectedMessages)),
					Role:      "assistant",
					Content:   textContent,
					Timestamp: time.Now().UnixMilli(),
				}
				if thinking != "" {
					cm.Thinking = thinking
				}
				collectedMessages = append(collectedMessages, cm)
			}

		case "tool_result":
			toolCallId, _ := event["tool_use_id"].(string)
			if toolCallId == "" {
				toolCallId = lastToolCallId
			}
			isWriteErr, _ := event["is_error"].(bool)
			// If this is a successful Write/Edit result, attach the file to the
			// preceding assistant message that issued the tool call.
			if !isWriteErr {
				if filePath, ok := pendingWriteFiles[toolCallId]; ok {
					delete(pendingWriteFiles, toolCallId)
					if att, err := readFileAsAttachment(filePath); err == nil {
						for i := len(collectedMessages) - 1; i >= 0; i-- {
							if collectedMessages[i].Role == "assistant" {
								collectedMessages[i].Attachments = append(collectedMessages[i].Attachments, *att)
								break
							}
						}
					}
				}
			}
			collectedMessages = append(collectedMessages, collectedMsg{
				ID:        fmt.Sprintf("result-%s", toolCallId),
				Role:      "toolResult",
				Content:   fmt.Sprintf("%v", event["tool_result"]),
				Timestamp: time.Now().UnixMilli(),
				ToolResults: []map[string]interface{}{{
					"toolCallId": toolCallId,
					"toolName":   event["tool_name"],
					"content":    event["tool_result"],
					"isError":    event["is_error"],
				}},
			})

		case "result":
			// Check for error results (e.g. "No conversation found with session ID")
			if isErr, _ := event["is_error"].(bool); isErr {
				if errors, ok := event["errors"].([]interface{}); ok && len(errors) > 0 {
					var errMsgs []string
					for _, e := range errors {
						if s, ok := e.(string); ok {
							errMsgs = append(errMsgs, s)
						}
					}
					stderrMu.Lock()
					stderrBuf.WriteString(strings.Join(errMsgs, "; "))
					stderrMu.Unlock()
				}
				continue
			}

			if result, ok := event["result"].(string); ok && result != "" {
				// Update last text message or add new one
				updated := false
				for i := len(collectedMessages) - 1; i >= 0; i-- {
					if collectedMessages[i].Role == "assistant" && collectedMessages[i].ToolCalls == nil {
						collectedMessages[i].Content = result
						updated = true
						break
					}
				}
				if !updated {
					collectedMessages = append(collectedMessages, collectedMsg{
						ID:        fmt.Sprintf("cc-final-%d", time.Now().UnixMilli()),
						Role:      "assistant",
						Content:   result,
						Timestamp: time.Now().UnixMilli(),
					})
				}
			}
		}
	}

	// Wait for process to finish
	exitErr := cmd.Wait()
	cancel()
	stderrWg.Wait()

	// Clean up tracking
	if sessionKey != "" {
		activeClaudeProcsMu.Lock()
		delete(activeClaudeProcs, sessionKey)
		activeClaudeProcsMu.Unlock()
	}

	// Build final response
	exitCode := 0
	if exitErr != nil {
		if exitError, ok := exitErr.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		}
	}

	if exitCode != 0 && len(collectedMessages) == 0 {
		stderrMu.Lock()
		errMsg := strings.TrimSpace(stderrBuf.String())
		stderrMu.Unlock()
		if errMsg == "" {
			errMsg = fmt.Sprintf("Claude Code exited with code %d", exitCode)
		}
		if b.store != nil && sessionKey != "" {
			b.store.UpdateSessionStatus(sessionKey, "error")
		}
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"success":   false,
			"error":     errMsg,
			"sessionId": resolvedSessionId,
		}, toHub)
		return
	}

	if b.store != nil && sessionKey != "" {
		b.store.UpdateSessionStatus(sessionKey, "completed")
	}
	sendStreamResponse(requestID, protocol.StatusOk, map[string]interface{}{
		"success":   true,
		"sessionId": resolvedSessionId,
		"messages":  collectedMessages,
	}, toHub)
}

// claudeCodeAbort kills an in-flight Claude Code process.
func (b *BridgeHandler) claudeCodeAbort(params map[string]interface{}) actionResult {
	sessionKey, _ := params["sessionKey"].(string)
	if sessionKey == "" {
		return errResultStatus("sessionKey is required", 400)
	}

	activeClaudeProcsMu.Lock()
	proc, ok := activeClaudeProcs[sessionKey]
	if ok {
		delete(activeClaudeProcs, sessionKey)
	}
	activeClaudeProcsMu.Unlock()

	if !ok {
		return okResult(map[string]interface{}{"success": true, "message": "no active process"})
	}

	proc.cancel()
	if proc.cmd != nil && proc.cmd.Process != nil {
		killProcessGroup(proc.cmd)
	}

	return okResult(map[string]interface{}{"success": true})
}

// ── Codex CLI: send / status / abort ───────────────────────────────────────

var (
	activeCodexProcs   = make(map[string]*claudeProc)
	activeCodexProcsMu sync.Mutex
)

// findCodexBinary locates the codex CLI binary.
func findCodexBinary() string {
	if p, err := exec.LookPath("codex"); err == nil {
		return p
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".local", "bin", "codex"),
		filepath.Join(home, ".npm-global", "bin", "codex"),
		"/usr/local/bin/codex",
		"/opt/homebrew/bin/codex",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// codexStatus checks if the codex CLI is available.
func (b *BridgeHandler) codexStatus() actionResult {
	bin := findCodexBinary()
	if bin == "" {
		return okResult(map[string]interface{}{"available": false, "error": "codex CLI not found"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin, "--version")
	cmd.Env = claudeEnv()
	out, err := cmd.Output()
	if err != nil {
		return okResult(map[string]interface{}{"available": false, "error": err.Error()})
	}

	return okResult(map[string]interface{}{
		"available": true,
		"version":   strings.TrimSpace(string(out)),
	})
}

// codexSend spawns `codex exec <message> --json` and streams events back.
func (b *BridgeHandler) codexSend(params map[string]interface{}, requestID string, toHub chan<- []byte) {
	message, _ := params["message"].(string)
	if message == "" {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "No message provided",
		}, toHub)
		return
	}

	agentId, _ := params["agentId"].(string)
	sessionId, _ := params["sessionId"].(string)
	sessionKey, _ := params["sessionKey"].(string)
	model, _ := params["model"].(string)
	projectPath, _ := params["projectPath"].(string)

	bin := findCodexBinary()
	if bin == "" {
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": "codex CLI not found",
		}, toHub)
		return
	}

	// codex 0.117+: top-level `resume` is interactive-only (no --json/--color).
	// For non-interactive streaming resume, use `exec resume <id> <prompt> --json`.
	// Note: `exec resume` does not support --color or -s/--sandbox.
	//
	// Personality/system prompt is NOT passed via a CLI flag. Instead we set the
	// working directory to the canonical Hyperclaw agent folder
	// (~/.hyperclaw/agents/{agentId}/) which contains AGENTS.md, SOUL.md,
	// IDENTITY.md, USER.md, TOOLS.md, HEARTBEAT.md, MEMORY.md. Codex auto-loads
	// AGENTS.md from cwd and can read the sibling files on demand — matching the
	// Claude Code pattern where cwd = agentDir and CLAUDE.md drives context.
	var args []string
	resuming := sessionId != ""
	if resuming {
		args = []string{"exec", "resume", sessionId, message, "--json", "--skip-git-repo-check"}
	} else {
		args = []string{"exec", message, "--json", "--color", "never", "-s", "read-only", "--skip-git-repo-check"}
	}
	if model != "" {
		args = append(args, "-m", model)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = claudeEnv()
	home, _ := os.UserHomeDir()
	cmd.Dir = home
	// Working-directory resolution mirrors claude-code:
	//  1. Resume: codex itself restores the session's original project dir.
	//  2. agentId set: use the canonical Hyperclaw agent dir so codex reads the
	//     agent's AGENTS.md + personality files directly from the project root.
	//  3. Fallback: home.
	if agentId != "" && !resuming {
		agentDir := filepath.Join(home, ".hyperclaw", "agents", agentId)
		if err := os.MkdirAll(agentDir, 0700); err == nil {
			cmd.Dir = agentDir
		}
	}
	setProcGroup(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("failed to create stdout pipe: %v", err),
		}, toHub)
		return
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("failed to create stderr pipe: %v", err),
		}, toHub)
		return
	}

	if err := cmd.Start(); err != nil {
		cancel()
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"error": fmt.Sprintf("failed to spawn codex: %v", err),
		}, toHub)
		return
	}

	if sessionKey != "" {
		activeCodexProcsMu.Lock()
		activeCodexProcs[sessionKey] = &claudeProc{cancel: cancel, cmd: cmd}
		activeCodexProcsMu.Unlock()
	}

	var stderrBuf strings.Builder
	var stderrMu sync.Mutex
	var stderrWg sync.WaitGroup
	stderrWg.Add(1)
	go func() {
		defer stderrWg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)
		for scanner.Scan() {
			stderrMu.Lock()
			stderrBuf.WriteString(scanner.Text())
			stderrBuf.WriteByte('\n')
			stderrMu.Unlock()
		}
	}()

	type collectedMsg struct {
		ID          string            `json:"id"`
		Role        string            `json:"role"`
		Content     string            `json:"content"`
		Timestamp   int64             `json:"timestamp"`
		ToolCalls   interface{}       `json:"toolCalls,omitempty"`
		ToolResults interface{}       `json:"toolResults,omitempty"`
		Attachments []MediaAttachment `json:"attachments,omitempty"`
	}

	var collectedMessages []collectedMsg
	var resolvedSessionId string

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 256*1024), 2*1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var event map[string]interface{}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}

		// Extract session ID from codex events
		if sid, ok := event["thread_id"].(string); ok && sid != "" {
			resolvedSessionId = sid
		}

		// Stream event to dashboard
		sendStreamEvent(requestID, sessionKey, event, toHub)

		// Collect final messages
		eventType, _ := event["type"].(string)
		if eventType == "item.completed" {
			item, _ := event["item"].(map[string]interface{})
			if item != nil {
				text, _ := item["text"].(string)
				if text != "" {
					collectedMessages = append(collectedMessages, collectedMsg{
						ID:        fmt.Sprintf("codex-%d", time.Now().UnixMilli()),
						Role:      "assistant",
						Content:   text,
						Timestamp: time.Now().UnixMilli(),
					})
				}
			}
		}
	}

	exitErr := cmd.Wait()
	cancel()
	stderrWg.Wait()

	if sessionKey != "" {
		activeCodexProcsMu.Lock()
		delete(activeCodexProcs, sessionKey)
		activeCodexProcsMu.Unlock()
	}

	exitCode := 0
	if exitErr != nil {
		if exitError, ok := exitErr.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		}
	}

	// Persist session to SQLite so it can be listed/filtered by agent.
	if b.store != nil && resolvedSessionId != "" {
		finalStatus := "completed"
		if exitCode != 0 && len(collectedMessages) == 0 {
			finalStatus = "aborted"
		}
		// Persist projectPath (when provided by the dashboard) as CWD so the
		// session picker can scope by current project. Falls back to cmd.Dir —
		// that way even an older caller that doesn't pass projectPath still
		// records something useful.
		sessCWD := projectPath
		if sessCWD == "" {
			sessCWD = cmd.Dir
		}
		_ = b.store.UpsertSession(store.Session{
			ID:      resolvedSessionId,
			Runtime: "codex",
			AgentID: agentId,
			Model:   model,
			Status:  finalStatus,
			CWD:     sessCWD,
		})
	}

	if exitCode != 0 && len(collectedMessages) == 0 {
		stderrMu.Lock()
		errMsg := strings.TrimSpace(stderrBuf.String())
		stderrMu.Unlock()
		if errMsg == "" {
			errMsg = fmt.Sprintf("Codex exited with code %d", exitCode)
		}
		sendStreamResponse(requestID, protocol.StatusError, map[string]interface{}{
			"success":   false,
			"error":     errMsg,
			"sessionId": resolvedSessionId,
		}, toHub)
		return
	}

	sendStreamResponse(requestID, protocol.StatusOk, map[string]interface{}{
		"success":   true,
		"sessionId": resolvedSessionId,
		"messages":  collectedMessages,
	}, toHub)
}

// codexAbort kills an in-flight Codex process.
func (b *BridgeHandler) codexAbort(params map[string]interface{}) actionResult {
	sessionKey, _ := params["sessionKey"].(string)
	if sessionKey == "" {
		return errResultStatus("sessionKey is required", 400)
	}

	activeCodexProcsMu.Lock()
	proc, ok := activeCodexProcs[sessionKey]
	if ok {
		delete(activeCodexProcs, sessionKey)
	}
	activeCodexProcsMu.Unlock()

	if !ok {
		return okResult(map[string]interface{}{"success": true, "message": "no active process"})
	}

	proc.cancel()
	if proc.cmd != nil && proc.cmd.Process != nil {
		killProcessGroup(proc.cmd)
	}

	return okResult(map[string]interface{}{"success": true})
}

// codexListSessions returns Codex sessions for a specific agent from SQLite.
// Params:
//   - agentId (string): required — only sessions belonging to this agent are returned
//   - projectPath (string): optional — when set, only sessions whose cwd matches
//     (or whose cwd is empty / pre-migration) are returned
//   - limit (float64): max sessions to return (default 100, hard-capped at 500)
func (b *BridgeHandler) codexListSessions(params map[string]interface{}) actionResult {
	empty := map[string]interface{}{"sessions": []interface{}{}}

	agentId, _ := params["agentId"].(string)
	projectPath, _ := params["projectPath"].(string)
	if agentId == "" || b.store == nil {
		return okResult(empty)
	}

	// Default raised from 30 → 100 so the session picker has enough history
	// for realistic daily use. SQLite lookup is local and cheap at this scale.
	limit := 100
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}
	// Safety cap — prevent runaway payloads if a caller passes a huge limit
	if limit > 500 {
		limit = 500
	}

	sessions, err := b.store.GetSessionsByAgent("codex", agentId, projectPath, limit)
	if err != nil || len(sessions) == 0 {
		return okResult(empty)
	}

	// Pre-migration sessions have empty cwd and naturally fall through the
	// `cwd = ? OR cwd = ''` filter in GetSessionsByAgent — they remain visible
	// in every project as a conservative fallback. New sessions launched after
	// this change will be tagged with projectPath on completion, giving the
	// picker exact scoping going forward.

	type sessionResult struct {
		Key       string `json:"key"`
		ID        string `json:"id"`
		Label     string `json:"label"`
		UpdatedAt int64  `json:"updatedAt"`
		Status    string `json:"status"`
	}
	results := make([]sessionResult, 0, len(sessions))
	for _, s := range sessions {
		label := s.ID
		if len(s.ID) > 8 {
			label = s.ID[:8]
		}
		results = append(results, sessionResult{
			Key:       "codex:" + s.ID,
			ID:        s.ID,
			Label:     label,
			UpdatedAt: s.UpdatedAt,
			Status:    s.Status,
		})
	}

	return okResult(map[string]interface{}{"sessions": results})
}

// codexLoadHistory parses a Codex session file and returns user+assistant messages.
// Params:
//   - sessionId (string): the Codex thread UUID
func (b *BridgeHandler) codexLoadHistory(params map[string]interface{}) actionResult {
	sessionId, _ := params["sessionId"].(string)
	if sessionId == "" {
		return errResultStatus("sessionId is required", 400)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return errResult("failed to get home dir: " + err.Error())
	}

	sf := findCodexSessionFile(home, sessionId)
	if sf == "" {
		return okResult(map[string]interface{}{"messages": []interface{}{}, "sessionId": sessionId})
	}

	f, err := os.Open(sf)
	if err != nil {
		return okResult(map[string]interface{}{"messages": []interface{}{}, "sessionId": sessionId})
	}
	defer f.Close()

	type message struct {
		ID        string `json:"id"`
		Role      string `json:"role"`
		Content   string `json:"content"`
		Timestamp int64  `json:"timestamp"`
	}

	var messages []message
	msgIdx := 0

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event map[string]interface{}
		if json.Unmarshal([]byte(line), &event) != nil {
			continue
		}

		eventType, _ := event["type"].(string)
		if eventType != "response_item" {
			continue
		}

		payload, _ := event["payload"].(map[string]interface{})
		if payload == nil {
			continue
		}
		role, _ := payload["role"].(string)
		if role != "user" && role != "assistant" {
			continue
		}

		// Parse timestamp
		ts := int64(0)
		if tsStr, ok := event["timestamp"].(string); ok {
			if t, tErr := time.Parse(time.RFC3339Nano, tsStr); tErr == nil {
				ts = t.UnixMilli()
			}
		}
		if ts == 0 {
			ts = time.Now().UnixMilli()
		}

		// Extract text from content array
		text := ""
		if contentArr, ok := payload["content"].([]interface{}); ok {
			for _, c := range contentArr {
				cm, ok := c.(map[string]interface{})
				if !ok {
					continue
				}
				if t, ok := cm["text"].(string); ok && t != "" {
					text = t
					break
				}
			}
		}
		if text == "" {
			continue
		}

		msgIdx++
		messages = append(messages, message{
			ID:        fmt.Sprintf("codex-msg-%d", msgIdx),
			Role:      role,
			Content:   text,
			Timestamp: ts,
		})
	}

	return okResult(map[string]interface{}{
		"messages":  messages,
		"sessionId": sessionId,
	})
}

// findCodexSessionFile returns the path to the JSONL file for the given Codex session UUID.
// Sessions are stored under ~/.codex/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl
func findCodexSessionFile(home, sessionId string) string {
	sessionsDir := filepath.Join(home, ".codex", "sessions")
	found := ""
	_ = filepath.WalkDir(sessionsDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if strings.Contains(filepath.Base(path), sessionId) && strings.HasSuffix(path, ".jsonl") {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// ── Streaming helpers ──────────────────────────────────────────────────────

// sendStreamEvent sends a streaming event (partial data) to the hub for forwarding
// to dashboard clients. Uses protocol "event" type with the requestId for correlation.
func sendStreamEvent(requestID, sessionKey string, event map[string]interface{}, toHub chan<- []byte) {
	msg := protocol.NewEvent("claude-code-stream", map[string]interface{}{
		"requestId":  requestID,
		"sessionKey": sessionKey,
		"event":      event,
	})
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[claude-code] failed to marshal stream event: %v", err)
		return
	}
	trySendOptionalToHub("claude-code", toHub, data)
}

// sendStreamResponse sends the final response for a streaming action.
func sendStreamResponse(requestID, status string, respData map[string]interface{}, toHub chan<- []byte) {
	resp := protocol.NewResponse(requestID, status, respData)
	data, err := json.Marshal(resp)
	if err != nil {
		log.Printf("[claude-code] failed to marshal response: %v", err)
		return
	}
	trySendRequiredToHub("claude-code", requestID, toHub, data)
}

// toJSONString converts a value to a JSON string, or returns "" on failure.
func toJSONString(v interface{}) string {
	if v == nil {
		return "{}"
	}
	data, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(data)
}

// ── Session File Watcher (two-way relay) ───────────────────────────────────
// Watches a Claude Code session JSONL file for new lines and pushes parsed
// messages to the dashboard as "claude-code-session-update" events.
// This enables the dashboard to show messages added by an interactive
// terminal session in real-time.

var (
	sessionWatchers   = make(map[string]context.CancelFunc)
	sessionWatchersMu sync.Mutex
)

func cancelAllSessionWatchers() {
	sessionWatchersMu.Lock()
	defer sessionWatchersMu.Unlock()
	for sessionId, cancel := range sessionWatchers {
		cancel()
		delete(sessionWatchers, sessionId)
	}
}

// claudeCodeWatch starts tailing a session JSONL file.
// Params: sessionId (required), sessionKey (for event correlation)
func (b *BridgeHandler) claudeCodeWatch(params map[string]interface{}, toHub chan<- []byte) actionResult {
	sessionId, _ := params["sessionId"].(string)
	if sessionId == "" {
		return errResultStatus("sessionId is required", 400)
	}
	sessionKey, _ := params["sessionKey"].(string)
	agentId, _ := params["agentId"].(string)
	projectPath, _ := params["projectPath"].(string)

	// Find the session file
	sessionFile := b.findClaudeSessionFile(sessionId, agentId, projectPath)
	if sessionFile == "" {
		return errResult("session file not found for " + sessionId)
	}

	// Stop existing watcher for this session
	sessionWatchersMu.Lock()
	if cancel, ok := sessionWatchers[sessionId]; ok {
		cancel()
		delete(sessionWatchers, sessionId)
	}
	ctx, cancel := context.WithCancel(context.Background())
	sessionWatchers[sessionId] = cancel
	sessionWatchersMu.Unlock()

	// Start tailing in background
	go tailSessionFile(ctx, sessionFile, sessionId, sessionKey, toHub)

	return okResult(map[string]interface{}{
		"success":  true,
		"watching": sessionId,
		"file":     sessionFile,
	})
}

// claudeCodeUnwatch stops watching a session file.
func (b *BridgeHandler) claudeCodeUnwatch(params map[string]interface{}) actionResult {
	sessionId, _ := params["sessionId"].(string)
	if sessionId == "" {
		return errResultStatus("sessionId is required", 400)
	}

	sessionWatchersMu.Lock()
	cancel, ok := sessionWatchers[sessionId]
	if ok {
		cancel()
		delete(sessionWatchers, sessionId)
	}
	sessionWatchersMu.Unlock()

	return okResult(map[string]interface{}{"success": true, "stopped": ok})
}

// tailSessionFile watches a JSONL file for new lines and sends parsed
// messages as events. It seeks to the end on start and only sends NEW lines.
func tailSessionFile(ctx context.Context, filePath, sessionId, sessionKey string, toHub chan<- []byte) {
	log.Printf("[claude-watch] Starting watcher for session %s", sessionId[:8])

	// Open file and seek to end
	f, err := os.Open(filePath)
	if err != nil {
		log.Printf("[claude-watch] Failed to open %s: %v", filePath, err)
		return
	}
	defer f.Close()

	// Seek to end — we only want NEW content
	offset, _ := f.Seek(0, 2) // SEEK_END

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	buf := make([]byte, 0, 64*1024)

	for {
		select {
		case <-ctx.Done():
			log.Printf("[claude-watch] Stopped watcher for session %s", sessionId[:8])
			return
		case <-ticker.C:
			// Check if file has grown
			info, err := os.Stat(filePath)
			if err != nil {
				continue
			}
			newSize := info.Size()
			if newSize <= offset {
				continue
			}

			// Read new content
			readSize := newSize - offset
			if readSize > 256*1024 {
				readSize = 256 * 1024 // cap at 256KB per tick
			}

			chunk := make([]byte, readSize)
			n, err := f.ReadAt(chunk, offset)
			if err != nil && n == 0 {
				continue
			}
			offset += int64(n)
			buf = append(buf, chunk[:n]...)

			// Process complete lines
			for {
				idx := -1
				for i, b := range buf {
					if b == '\n' {
						idx = i
						break
					}
				}
				if idx == -1 {
					break
				}
				line := string(buf[:idx])
				// Use copy+reslice instead of simple reslice: buf[idx+1:] keeps the
				// full backing array alive at its high-water mark for the watcher's
				// lifetime. copy compacts so old memory can be GC'd.
				n := copy(buf, buf[idx+1:])
				buf = buf[:n]

				line = strings.TrimSpace(line)
				if line == "" {
					continue
				}

				// Parse and send as event
				var entry map[string]interface{}
				if err := json.Unmarshal([]byte(line), &entry); err != nil {
					continue
				}

				// Only send user/assistant messages (skip system, file-history-snapshot, etc.)
				entryType, _ := entry["type"].(string)
				if entryType != "user" && entryType != "assistant" {
					continue
				}

				// Parse into a chat message
				msg := parseSessionEntry(entry)
				if msg == nil {
					continue
				}

				// Send as event
				evt := protocol.NewEvent("claude-code-session-update", map[string]interface{}{
					"sessionId":  sessionId,
					"sessionKey": sessionKey,
					"message":    msg,
				})
				data, _ := json.Marshal(evt)
				trySendOptionalToHub("claude-watch", toHub, data)
			}
		}
	}
}

// parseSessionEntry converts a raw JSONL entry to a chat message map.
// Returns nil if the entry is not a displayable message.
func parseSessionEntry(entry map[string]interface{}) map[string]interface{} {
	entryType, _ := entry["type"].(string)
	uuid, _ := entry["uuid"].(string)
	timestamp, _ := entry["timestamp"].(string)

	var ts int64
	if timestamp != "" {
		if t, err := parseISO8601(timestamp); err == nil {
			ts = t.UnixMilli()
		}
	}

	msg, ok := entry["message"].(map[string]interface{})
	if !ok {
		return nil
	}

	role, _ := msg["role"].(string)
	if role != "user" && role != "assistant" {
		return nil
	}

	// Skip sidechain
	if isSidechain, ok := entry["isSidechain"].(bool); ok && isSidechain {
		return nil
	}

	var contentStr string
	var thinking string
	var toolCalls []map[string]interface{}

	switch content := msg["content"].(type) {
	case string:
		contentStr = content
	case []interface{}:
		for _, block := range content {
			blockMap, ok := block.(map[string]interface{})
			if !ok {
				continue
			}
			blockType, _ := blockMap["type"].(string)
			switch blockType {
			case "text":
				text, _ := blockMap["text"].(string)
				if contentStr != "" {
					contentStr += "\n\n"
				}
				contentStr += text
			case "thinking":
				t, _ := blockMap["thinking"].(string)
				thinking = t
			case "tool_use":
				toolCalls = append(toolCalls, map[string]interface{}{
					"id":    blockMap["id"],
					"name":  blockMap["name"],
					"input": blockMap["input"],
				})
			}
		}
	}

	// Skip empty/meta messages
	if contentStr == "" && len(toolCalls) == 0 && entryType != "user" {
		return nil
	}

	result := map[string]interface{}{
		"id":        uuid,
		"role":      role,
		"content":   contentStr,
		"timestamp": ts,
	}
	if thinking != "" {
		result["thinking"] = thinking
	}
	if len(toolCalls) > 0 {
		result["toolCalls"] = toolCalls
	}
	return result
}

// ── Claude Code project-scoped skills ────────────────────────────────────────
//
// Skills live at: ~/.claude/projects/<agentId>/skills/*.md
//
// Bridge actions:
//   claude-skills-list  — list .md files in that directory
//   claude-skill-read   — return content of a specific skill file
//   claude-skill-write  — create or overwrite a skill file
//   claude-skill-delete — delete a skill file

// claudeSkillsDir returns the skills directory for the given agentId.
// ~/.claude/projects/<agentId>/skills/
func claudeSkillsDir(agentId string) (string, error) {
	if agentId == "" {
		return "", fmt.Errorf("agentId is required")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home dir: %w", err)
	}
	return filepath.Join(home, ".claude", "projects", agentId, "skills"), nil
}

// claudeSkillsList lists all skills for a Claude Code agent.
// It merges:
//  1. Global skills from ~/.claude/skills/{skill-name}/SKILL.md
//  2. Project-scoped skills from ~/.claude/projects/<agentId>/skills/*.md (legacy flat files)
//  3. Project-scoped skills from ~/.claude/projects/<agentId>/skills/{skill-name}/SKILL.md
//
// Params: agentId (string)
// Returns: { skills: [{name, description, path, source}] }
func (b *BridgeHandler) claudeSkillsList(params map[string]interface{}) actionResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return errResult("cannot determine home dir")
	}

	var skills []map[string]interface{}
	seen := make(map[string]bool)

	// 1. List global skills from ~/.claude/skills/
	globalSkillsDir := filepath.Join(home, ".claude", "skills")
	if entries, err := os.ReadDir(globalSkillsDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			skillKey := e.Name()
			skillMdPath := filepath.Join(globalSkillsDir, skillKey, "SKILL.md")
			name, description := parseSkillMd(skillMdPath)
			if name == "" {
				name = skillKey
			}
			skills = append(skills, map[string]interface{}{
				"name":        name,
				"skillKey":    skillKey,
				"description": description,
				"path":        skillMdPath,
				"source":      "global",
			})
			seen[skillKey] = true
		}
	}

	// 2. List project-scoped skills (if agentId provided)
	agentId, _ := params["agentId"].(string)
	if agentId != "" {
		projectSkillsDir := filepath.Join(home, ".claude", "projects", agentId, "skills")
		if entries, err := os.ReadDir(projectSkillsDir); err == nil {
			for _, e := range entries {
				if e.IsDir() {
					// Directory-style skill: {skill-name}/SKILL.md
					skillKey := e.Name()
					if seen[skillKey] {
						continue // global version takes precedence display-wise but we could merge
					}
					skillMdPath := filepath.Join(projectSkillsDir, skillKey, "SKILL.md")
					name, description := parseSkillMd(skillMdPath)
					if name == "" {
						name = skillKey
					}
					skills = append(skills, map[string]interface{}{
						"name":        name,
						"skillKey":    skillKey,
						"description": description,
						"path":        skillMdPath,
						"source":      "project",
					})
					seen[skillKey] = true
				} else if strings.HasSuffix(e.Name(), ".md") {
					// Legacy flat file: skill-name.md
					skillKey := strings.TrimSuffix(e.Name(), ".md")
					if seen[skillKey] {
						continue
					}
					fullPath := filepath.Join(projectSkillsDir, e.Name())
					name, description := parseSkillMd(fullPath)
					if name == "" {
						name = skillKey
					}
					skills = append(skills, map[string]interface{}{
						"name":        name,
						"skillKey":    skillKey,
						"description": description,
						"path":        fullPath,
						"source":      "project",
					})
					seen[skillKey] = true
				}
			}
		}
	}

	if skills == nil {
		skills = []map[string]interface{}{}
	}
	return okResult(map[string]interface{}{"skills": skills})
}

// claudeSkillRead reads the content of a single skill file.
// Searches in order:
//  1. Global: ~/.claude/skills/{name}/SKILL.md
//  2. Project directory-style: ~/.claude/projects/{agentId}/skills/{name}/SKILL.md
//  3. Project flat file: ~/.claude/projects/{agentId}/skills/{name}.md
//
// Params: agentId (string), name (string) — skill slug
// Returns: { content: string, source: string }
func (b *BridgeHandler) claudeSkillRead(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	name, _ := params["name"].(string)
	if name == "" {
		return errResultStatus("name is required", 400)
	}
	// Reject names with path separators or ".."
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		return errResultStatus("invalid skill name", 400)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return errResult("cannot determine home dir")
	}

	// Try global skill first
	globalPath := filepath.Join(home, ".claude", "skills", name, "SKILL.md")
	if data, err := os.ReadFile(globalPath); err == nil {
		return okResult(map[string]interface{}{"content": string(data), "source": "global", "path": globalPath})
	}

	// Try project-scoped directory-style
	if agentId != "" {
		projectDirPath := filepath.Join(home, ".claude", "projects", agentId, "skills", name, "SKILL.md")
		if data, err := os.ReadFile(projectDirPath); err == nil {
			return okResult(map[string]interface{}{"content": string(data), "source": "project", "path": projectDirPath})
		}

		// Try project-scoped flat file (legacy)
		projectFlatPath := filepath.Join(home, ".claude", "projects", agentId, "skills", name+".md")
		if data, err := os.ReadFile(projectFlatPath); err == nil {
			return okResult(map[string]interface{}{"content": string(data), "source": "project", "path": projectFlatPath})
		}
	}

	return errResultStatus("skill not found", 404)
}

// claudeSkillWrite creates or overwrites a skill file.
// Params: agentId (string), name (string), content (string)
func (b *BridgeHandler) claudeSkillWrite(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	name, _ := params["name"].(string)
	content, _ := params["content"].(string)
	if name == "" {
		return errResultStatus("name is required", 400)
	}
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		return errResultStatus("invalid skill name", 400)
	}
	dir, err := claudeSkillsDir(agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return errResult(fmt.Sprintf("failed to create skills dir: %v", err))
	}
	fullPath := filepath.Join(dir, name+".md")
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return errResult(fmt.Sprintf("failed to write skill: %v", err))
	}
	return okResult(map[string]interface{}{"success": true, "path": fullPath})
}

// claudeSkillDelete removes a skill file.
// Params: agentId (string), name (string)
func (b *BridgeHandler) claudeSkillDelete(params map[string]interface{}) actionResult {
	agentId, _ := params["agentId"].(string)
	name, _ := params["name"].(string)
	if name == "" {
		return errResultStatus("name is required", 400)
	}
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		return errResultStatus("invalid skill name", 400)
	}
	dir, err := claudeSkillsDir(agentId)
	if err != nil {
		return errResultStatus(err.Error(), 400)
	}
	fullPath := filepath.Join(dir, name+".md")
	if err := os.Remove(fullPath); err != nil {
		if os.IsNotExist(err) {
			return errResultStatus("skill not found", 404)
		}
		return errResult(fmt.Sprintf("failed to delete skill: %v", err))
	}
	return okResult(map[string]interface{}{"success": true})
}
