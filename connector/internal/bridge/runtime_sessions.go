package bridge

// runtime_sessions.go — Bridge action "get-runtime-sessions"
// Reads recent conversation history for non-OpenClaw runtimes directly from
// their on-disk session files so the StatusWidget can show recent messages.

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	_ "modernc.org/sqlite"
)

// scanBufPool reuses 256 KB scanner buffers to reduce per-call allocations.
var scanBufPool = sync.Pool{
	New: func() interface{} { return make([]byte, 0, 256*1024) },
}

// scanBufSmPool reuses 64 KB scanner buffers.
var scanBufSmPool = sync.Pool{
	New: func() interface{} { return make([]byte, 0, 64*1024) },
}

type runtimeMessage struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

// getRuntimeSessions reads recent messages for a non-OpenClaw agent.
// Params:
//   - agentId          (string): agent identifier
//   - runtime          (string): "claude-code", "codex", or "hermes" — used for routing
//   - limit            (float64): max messages to return (default 20)
//   - primarySessionKey (string): when set, scope reads to this specific session only
func (b *BridgeHandler) getRuntimeSessions(params map[string]interface{}) actionResult {
	agentID, _ := params["agentId"].(string)
	runtime, _ := params["runtime"].(string)
	primaryKey, _ := params["primarySessionKey"].(string)
	limit := 20
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	debugLogSessions("[get-runtime-sessions] agentID=%q runtime=%q primaryKey=%q limit=%d", agentID, runtime, primaryKey, limit)

	// Fall back to agentId-based routing for backwards compatibility
	if runtime == "" {
		runtime = agentID
	}

	// When a primary session key is provided, scope reads to that specific session.
	if primaryKey != "" {
		return b.runtimeSessionByKey(primaryKey, agentID, runtime, limit)
	}

	// Extract Hermes profile ID from agentID or runtime.
	// Agent IDs may come as:
	//   - "hermes:profileName" (prefixed) — strip the prefix
	//   - "profileName" (bare slug) — use as-is when runtime == "hermes"
	hermesProfileID := ""
	if runtime == "hermes" {
		if strings.HasPrefix(agentID, "hermes:") {
			hermesProfileID = strings.TrimPrefix(agentID, "hermes:")
		} else if agentID != "" {
			// Bare agent ID without prefix — use it directly as the profile name
			hermesProfileID = agentID
		}
	} else if strings.HasPrefix(runtime, "hermes:") {
		hermesProfileID = strings.TrimPrefix(runtime, "hermes:")
		runtime = "hermes"
	}

	// Allow the caller to pass an explicit projectPath so recent-messages match
	// exactly the same scoping as codex-list-sessions (cwd filter via SQLite).
	projectPath, _ := params["projectPath"].(string)

	switch runtime {
	case "claude-code":
		return b.claudeCodeRecentMessages(agentID, limit)
	case "codex":
		return b.codexRecentMessages(agentID, projectPath, limit)
	case "hermes":
		return b.hermesProfileRecentMessages(hermesProfileID, limit)
	default:
		return okResult(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"sessionCount":   0,
				"lastActiveMs":   0,
				"recentMessages": []interface{}{},
			},
		})
	}
}

// runtimeSessionByKey reads messages from a single specific session, identified
// by its primary session key. Used when the StatusWidget wants only the primary
// session's messages — not the most-recent-across-all-sessions.
func (b *BridgeHandler) runtimeSessionByKey(primaryKey, agentID, runtime string, limit int) actionResult {
	switch runtime {
	case "claude-code":
		sessionID := strings.TrimPrefix(primaryKey, "claude:")
		// Try reading the specific JSONL file on disk.
		home, err := os.UserHomeDir()
		if err != nil {
			return emptyRuntimeResult()
		}
		projectPath := b.resolveProjectPathFromIdentityFile(agentID)
		if projectPath == "" {
			projectPath = b.paths.AgentDir("claude-code", agentID)
		}
		encoded := encodeClaudeProjectDir(projectPath)
		jsonlPath := filepath.Join(home, ".claude", "projects", encoded, sessionID+".jsonl")
		info, err := os.Stat(jsonlPath)
		if err != nil {
			// Fallback: try legacy un-prefixed agent dir
			legacy := b.paths.LegacyAgentDir(agentID)
			encodedLegacy := encodeClaudeProjectDir(legacy)
			jsonlPath = filepath.Join(home, ".claude", "projects", encodedLegacy, sessionID+".jsonl")
			info, err = os.Stat(jsonlPath)
			if err != nil {
				return emptyRuntimeResult()
			}
		}
		msgs := readClaudeCodeMessages(jsonlPath, limit)
		return okResult(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"sessionCount":   1,
				"lastActiveMs":   info.ModTime().UnixMilli(),
				"recentMessages": msgs,
			},
		})

	case "codex":
		sessionID := strings.TrimPrefix(primaryKey, "codex:")
		// Read from the specific SQLite session.
		if b.store == nil {
			return emptyRuntimeResult()
		}
		sess, err := b.store.GetSessionByID(sessionID)
		if err != nil || sess == nil {
			return emptyRuntimeResult()
		}
		messages, err := b.store.GetSessionMessages(sessionID, limit)
		if err != nil {
			return emptyRuntimeResult()
		}
		var result []runtimeMessage
		for _, m := range messages {
			content := strings.TrimSpace(m.Content)
			if content == "" {
				continue
			}
			if len(content) > 300 {
				content = content[:297] + "..."
			}
			result = append(result, runtimeMessage{Role: m.Role, Content: content, Timestamp: m.CreatedAt})
		}
		return okResult(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"sessionCount":   1,
				"lastActiveMs":   sess.UpdatedAt,
				"recentMessages": result,
			},
		})

	case "hermes":
		sessionID := strings.TrimPrefix(primaryKey, "hermes:")
		profileID := agentID
		if strings.HasPrefix(profileID, "hermes:") {
			profileID = strings.TrimPrefix(profileID, "hermes:")
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return emptyRuntimeResult()
		}
		var dbPath string
		if profileID == "" || profileID == "main" || profileID == "__main__" {
			dbPath = filepath.Join(home, ".hermes", "state.db")
		} else {
			dbPath = filepath.Join(home, ".hermes", "profiles", profileID, "state.db")
		}
		db, err := sql.Open("sqlite", dbPath+"?mode=ro&_pragma=busy_timeout(2000)")
		if err != nil {
			return emptyRuntimeResult()
		}
		defer db.Close()

		var lastActiveMs int64
		_ = db.QueryRow(`SELECT COALESCE(started_at, 0) FROM sessions WHERE id = ?`, sessionID).Scan(&lastActiveMs)
		if lastActiveMs > 0 {
			lastActiveMs = lastActiveMs * 1000
		}

		rows, err := db.Query(`
			SELECT role, content, timestamp FROM messages
			WHERE session_id = ? AND role IN ('user', 'assistant')
			ORDER BY timestamp ASC LIMIT ?`, sessionID, limit)
		if err != nil {
			return emptyRuntimeResult()
		}
		defer rows.Close()

		var messages []runtimeMessage
		for rows.Next() {
			var role, content string
			var ts float64
			if err := rows.Scan(&role, &content, &ts); err != nil {
				continue
			}
			content = strings.TrimSpace(content)
			if content == "" {
				continue
			}
			if len(content) > 300 {
				content = content[:297] + "..."
			}
			messages = append(messages, runtimeMessage{Role: role, Content: content, Timestamp: int64(ts * 1000)})
		}
		return okResult(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"sessionCount":   1,
				"lastActiveMs":   lastActiveMs,
				"recentMessages": messages,
			},
		})
	}

	return emptyRuntimeResult()
}

// ─── Claude Code ─────────────────────────────────────────────────────────────

// claudeCodeRecentMessages reads recent assistant text messages from Claude Code
// sessions. When agentID is provided, scopes to the agent's project directory only.
// Otherwise, falls back to reading all sessions (backward compatibility).
func (b *BridgeHandler) claudeCodeRecentMessages(agentID string, limit int) actionResult {
	debugLogSessions("[claudeCodeRecentMessages] agentID=%q limit=%d", agentID, limit)

	home, err := os.UserHomeDir()
	if err != nil {
		return emptyRuntimeResult()
	}

	projectsDir := filepath.Join(home, ".claude", "projects")

	// Collect all .jsonl files with their mod times
	type sessionFile struct {
		path  string
		mtime int64
	}
	var files []sessionFile

	// When agentID is provided, scope to the agent's project directory only.
	// This ensures session isolation — each agent only sees its own sessions.
	if agentID != "" {
		// Resolve project path: IDENTITY.md > agent profile folder
		projectPath := b.resolveProjectPathFromIdentityFile(agentID)
		if projectPath == "" {
			projectPath = b.paths.AgentDir("claude-code", agentID)
		}
		debugLogSessions("[claudeCodeRecentMessages] resolved projectPath=%q", projectPath)

		// Encode the project path to match Claude Code's directory naming
		encodedDir := encodeClaudeProjectDir(projectPath)
		agentProjectDir := filepath.Join(projectsDir, encodedDir)
		debugLogSessions("[claudeCodeRecentMessages] agentProjectDir=%q", agentProjectDir)

		// Read only from the agent's project directory
		entries, err := os.ReadDir(agentProjectDir)
		if err != nil {
			// Fallback: try legacy un-prefixed agent dir
			legacyDir := filepath.Join(projectsDir, encodeClaudeProjectDir(b.paths.LegacyAgentDir(agentID)))
			entries, err = os.ReadDir(legacyDir)
			if err != nil {
				debugLogSessions("[claudeCodeRecentMessages] no project dir, returning empty")
				return emptyRuntimeResult()
			}
			agentProjectDir = legacyDir
		}

		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
				continue
			}
			info, err := entry.Info()
			if err != nil {
				continue
			}
			files = append(files, sessionFile{
				path:  filepath.Join(agentProjectDir, entry.Name()),
				mtime: info.ModTime().UnixMilli(),
			})
		}
	} else {
		// Fallback: no agentID — read all sessions (backward compatibility)
		entries, err := os.ReadDir(projectsDir)
		if err != nil {
			return emptyRuntimeResult()
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			subDir := filepath.Join(projectsDir, entry.Name())
			subs, err := os.ReadDir(subDir)
			if err != nil {
				continue
			}
			for _, sub := range subs {
				if sub.IsDir() || !strings.HasSuffix(sub.Name(), ".jsonl") {
					continue
				}
				info, err := sub.Info()
				if err != nil {
					continue
				}
				files = append(files, sessionFile{
					path:  filepath.Join(subDir, sub.Name()),
					mtime: info.ModTime().UnixMilli(),
				})
			}
		}
	}

	if len(files) == 0 {
		return emptyRuntimeResult()
	}

	// Sort by mtime descending — read newest sessions first
	sort.Slice(files, func(i, j int) bool {
		return files[i].mtime > files[j].mtime
	})

	sessionCount := len(files)
	lastActiveMs := files[0].mtime

	var messages []runtimeMessage
	// Read files until we have enough messages
	for _, sf := range files {
		if len(messages) >= limit {
			break
		}
		msgs := readClaudeCodeMessages(sf.path, limit-len(messages))
		messages = append(messages, msgs...)
	}

	if len(messages) > limit {
		messages = messages[len(messages)-limit:]
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"sessionCount":   sessionCount,
			"lastActiveMs":   lastActiveMs,
			"recentMessages": messages,
		},
	})
}

// readClaudeCodeMessages reads up to `max` recent user+assistant text messages
// from a single Claude Code JSONL session file.
func readClaudeCodeMessages(path string, max int) []runtimeMessage {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var msgs []runtimeMessage
	scanner := bufio.NewScanner(f)
	buf := scanBufPool.Get().([]byte)
	defer scanBufPool.Put(buf[:0]) //nolint:staticcheck
	scanner.Buffer(buf, 2*1024*1024)

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
		if isSidechain, ok := entry["isSidechain"].(bool); ok && isSidechain {
			continue
		}

		msg, ok := entry["message"].(map[string]interface{})
		if !ok {
			continue
		}
		role, _ := msg["role"].(string)
		if role != "user" && role != "assistant" {
			continue
		}

		var ts int64
		if timestamp, _ := entry["timestamp"].(string); timestamp != "" {
			if t, err := parseISO8601(timestamp); err == nil {
				ts = t.UnixMilli()
			}
		}

		content := extractTextContent(msg["content"])
		if content == "" {
			continue
		}
		if len(content) > 300 {
			content = content[:297] + "..."
		}

		msgs = append(msgs, runtimeMessage{Role: role, Content: content, Timestamp: ts})
	}

	// Return last `max` messages (most recent)
	if len(msgs) > max {
		msgs = msgs[len(msgs)-max:]
	}
	return msgs
}

// extractTextContent pulls plain text from a Claude message content field
// (string or []interface{} of blocks).
func extractTextContent(raw interface{}) string {
	switch v := raw.(type) {
	case string:
		return strings.TrimSpace(v)
	case []interface{}:
		var parts []string
		for _, block := range v {
			bm, ok := block.(map[string]interface{})
			if !ok {
				continue
			}
			if bm["type"] == "text" {
				if t, ok := bm["text"].(string); ok && strings.TrimSpace(t) != "" {
					parts = append(parts, strings.TrimSpace(t))
				}
			}
		}
		return strings.Join(parts, " ")
	}
	return ""
}

// ─── Codex ────────────────────────────────────────────────────────────────────

// codexRecentMessages reads recent user+assistant messages for Codex. When an
// agentID is provided and the SQLite session store is available, the function
// scopes results to sessions belonging to that agent (optionally filtered by
// projectPath cwd). Otherwise it falls back to a global scan of
// ~/.codex/sessions/ — preserving the pre-scoping behavior for callers that
// don't (yet) pass an agentID.
func (b *BridgeHandler) codexRecentMessages(agentID, projectPath string, limit int) actionResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return emptyRuntimeResult()
	}

	type sessionFile struct {
		path  string
		mtime int64
	}
	var files []sessionFile

	// Agent-scoped path: use SQLite to list only this agent's Codex sessions,
	// then resolve each to its on-disk JSONL rollout file.
	if agentID != "" && b.store != nil {
		// When the caller didn't provide a projectPath, resolve from IDENTITY.md
		// so pre-existing sessions written before project tagging still match via
		// the cwd='' fallback branch inside GetSessionsByAgent.
		if projectPath == "" {
			projectPath = b.resolveProjectPathFromIdentityFile(agentID)
		}
		sessions, err := b.store.GetSessionsByAgent("codex", agentID, projectPath, limit)
		if err == nil {
			for _, s := range sessions {
				sf := findCodexSessionFile(home, s.ID)
				if sf == "" {
					continue
				}
				mtime := s.UpdatedAt
				if info, statErr := os.Stat(sf); statErr == nil {
					mtime = info.ModTime().UnixMilli()
				}
				files = append(files, sessionFile{path: sf, mtime: mtime})
			}
		}
		// If SQLite had no matching sessions, return empty rather than leaking
		// the global codex inbox into this agent's badge.
		if len(files) == 0 {
			return emptyRuntimeResult()
		}
	} else {
		// Backward-compatible global scan (no agentID given).
		sessionsDir := filepath.Join(home, ".codex", "sessions")
		_ = filepath.WalkDir(sessionsDir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			if !strings.HasSuffix(d.Name(), ".jsonl") {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			files = append(files, sessionFile{path: path, mtime: info.ModTime().UnixMilli()})
			return nil
		})
		if len(files) == 0 {
			// Fall back to history.jsonl (user prompts only)
			return b.codexHistoryFallback(home, limit)
		}
	}

	// Sort by mtime descending — read newest sessions first
	sort.Slice(files, func(i, j int) bool {
		return files[i].mtime > files[j].mtime
	})

	sessionCount := len(files)
	lastActiveMs := files[0].mtime

	var messages []runtimeMessage
	for _, sf := range files {
		if len(messages) >= limit {
			break
		}
		msgs := readCodexSessionMessages(sf.path, sf.mtime, limit-len(messages))
		messages = append(messages, msgs...)
	}

	if len(messages) > limit {
		messages = messages[len(messages)-limit:]
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"sessionCount":   sessionCount,
			"lastActiveMs":   lastActiveMs,
			"recentMessages": messages,
		},
	})
}

// readCodexSessionMessages reads user+assistant messages from a Codex session
// JSONL file. Each line is {type, payload} where response_item payloads contain
// {role, content[{type, text/output_text}]}.
func readCodexSessionMessages(path string, fileModMs int64, max int) []runtimeMessage {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var msgs []runtimeMessage
	scanner := bufio.NewScanner(f)
	buf := scanBufPool.Get().([]byte)
	defer scanBufPool.Put(buf[:0]) //nolint:staticcheck
	scanner.Buffer(buf, 2*1024*1024)

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
		if entryType != "response_item" {
			continue
		}

		payload, ok := entry["payload"].(map[string]interface{})
		if !ok {
			continue
		}
		role, _ := payload["role"].(string)
		if role != "user" && role != "assistant" {
			continue
		}

		content := extractCodexContent(payload["content"])
		if content == "" {
			continue
		}
		if len(content) > 300 {
			content = content[:297] + "..."
		}

		var ts int64
		if timestamp, _ := entry["timestamp"].(string); timestamp != "" {
			if t, err := parseISO8601(timestamp); err == nil {
				ts = t.UnixMilli()
			}
		}
		if ts == 0 {
			ts = fileModMs
		}

		msgs = append(msgs, runtimeMessage{Role: role, Content: content, Timestamp: ts})
	}

	if len(msgs) > max {
		msgs = msgs[len(msgs)-max:]
	}
	return msgs
}

// extractCodexContent pulls plain text from a Codex response_item content array.
// Content blocks use "output_text" (assistant) or "input_text" (user/developer).
func extractCodexContent(raw interface{}) string {
	blocks, ok := raw.([]interface{})
	if !ok {
		return ""
	}
	var parts []string
	for _, block := range blocks {
		bm, ok := block.(map[string]interface{})
		if !ok {
			continue
		}
		bt, _ := bm["type"].(string)
		if bt == "output_text" || bt == "input_text" || bt == "text" {
			if t, ok := bm["text"].(string); ok && strings.TrimSpace(t) != "" {
				parts = append(parts, strings.TrimSpace(t))
			}
		}
	}
	return strings.Join(parts, " ")
}

// codexHistoryFallback reads ~/.codex/history.jsonl for user prompts when no
// session files are available.
func (b *BridgeHandler) codexHistoryFallback(home string, limit int) actionResult {
	historyPath := filepath.Join(home, ".codex", "history.jsonl")
	f, err := os.Open(historyPath)
	if err != nil {
		return emptyRuntimeResult()
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return emptyRuntimeResult()
	}
	lastActiveMs := info.ModTime().UnixMilli()

	type historyEntry struct {
		SessionID string `json:"session_id"`
		Ts        int64  `json:"ts"`
		Text      string `json:"text"`
	}

	var allEntries []historyEntry
	sessionIDs := map[string]struct{}{}

	scanner := bufio.NewScanner(f)
	smBuf := scanBufSmPool.Get().([]byte)
	defer scanBufSmPool.Put(smBuf[:0]) //nolint:staticcheck
	scanner.Buffer(smBuf, 512*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		var e historyEntry
		if err := json.Unmarshal([]byte(line), &e); err != nil || e.Text == "" {
			continue
		}
		allEntries = append(allEntries, e)
		if e.SessionID != "" {
			sessionIDs[e.SessionID] = struct{}{}
		}
	}

	if len(allEntries) > limit {
		allEntries = allEntries[len(allEntries)-limit:]
	}

	var messages []runtimeMessage
	for _, e := range allEntries {
		content := strings.TrimSpace(e.Text)
		if len(content) > 300 {
			content = content[:297] + "..."
		}
		ts := e.Ts
		if ts == 0 {
			ts = lastActiveMs
		}
		messages = append(messages, runtimeMessage{Role: "user", Content: content, Timestamp: ts})
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"sessionCount":   len(sessionIDs),
			"lastActiveMs":   lastActiveMs,
			"recentMessages": messages,
		},
	})
}

// ─── Hermes ───────────────────────────────────────────────────────────────────

// hermesRecentMessages reads ~/.hermes/sessions/*.jsonl for recent messages.
// Each JSONL file has one JSON object per line: {role, content}.
// Roles include "session_meta", "user", "assistant", "tool" — we show user+assistant only.
func (b *BridgeHandler) hermesRecentMessages(limit int) actionResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return emptyRuntimeResult()
	}

	sessionsDir := filepath.Join(home, ".hermes", "sessions")
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return emptyRuntimeResult()
	}

	type sessionFile struct {
		path  string
		mtime int64
	}
	var files []sessionFile
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".jsonl") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, sessionFile{
			path:  filepath.Join(sessionsDir, name),
			mtime: info.ModTime().UnixMilli(),
		})
	}

	if len(files) == 0 {
		return emptyRuntimeResult()
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].mtime > files[j].mtime
	})

	sessionCount := len(files)
	lastActiveMs := files[0].mtime

	var messages []runtimeMessage
	for _, sf := range files {
		if len(messages) >= limit {
			break
		}
		msgs := readHermesMessages(sf.path, sf.mtime, limit-len(messages))
		messages = append(messages, msgs...)
	}

	if len(messages) > limit {
		messages = messages[len(messages)-limit:]
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"sessionCount":   sessionCount,
			"lastActiveMs":   lastActiveMs,
			"recentMessages": messages,
		},
	})
}

// readHermesMessages reads the last `max` user+assistant messages from a
// Hermes session JSONL file (one JSON object per line: {role, content}).
func readHermesMessages(path string, fileModMs int64, max int) []runtimeMessage {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	type lineEntry struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	var all []lineEntry
	scanner := bufio.NewScanner(f)
	smBuf := scanBufSmPool.Get().([]byte)
	defer scanBufSmPool.Put(smBuf[:0]) //nolint:staticcheck
	scanner.Buffer(smBuf, 512*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		var e lineEntry
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			continue
		}
		if e.Role != "user" && e.Role != "assistant" {
			continue
		}
		content := strings.TrimSpace(e.Content)
		if content == "" {
			continue
		}
		all = append(all, e)
	}

	if len(all) > max {
		all = all[len(all)-max:]
	}

	var result []runtimeMessage
	for _, m := range all {
		content := strings.TrimSpace(m.Content)
		if len(content) > 300 {
			content = content[:297] + "..."
		}
		result = append(result, runtimeMessage{Role: m.Role, Content: content, Timestamp: fileModMs})
	}
	return result
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func emptyRuntimeResult() actionResult {
	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"sessionCount":   0,
			"lastActiveMs":   0,
			"recentMessages": []interface{}{},
		},
	})
}

// hermesProfileRecentMessages reads recent messages for a named Hermes profile
// from ~/.hermes/profiles/{profileId}/state.db, or the default ~/.hermes/state.db
// when profileId is empty. This mirrors what hermesSessions() reads so StatusWidget
// shows the same data as the sessions inbox.
func (b *BridgeHandler) hermesProfileRecentMessages(profileId string, limit int) actionResult {
	home, err := os.UserHomeDir()
	if err != nil {
		return emptyRuntimeResult()
	}

	var dbPath string
	if profileId != "" {
		dbPath = filepath.Join(home, ".hermes", "profiles", profileId, "state.db")
	} else {
		dbPath = filepath.Join(home, ".hermes", "state.db")
	}

	if _, err := os.Stat(dbPath); err != nil {
		// Profile state.db not yet created — fall back to JSONL sessions dir for
		// the default profile, or return empty for a named profile.
		if profileId == "" {
			return b.hermesRecentMessages(limit)
		}
		return emptyRuntimeResult()
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return emptyRuntimeResult()
	}
	defer db.Close()

	// Count sessions and find last active time
	var sessionCount int
	var lastActiveMs int64
	_ = db.QueryRow(`SELECT COUNT(*), COALESCE(MAX(started_at), 0) FROM sessions`).Scan(&sessionCount, &lastActiveMs)
	if lastActiveMs > 0 {
		lastActiveMs = int64(lastActiveMs * 1000) // convert seconds to ms
	}

	// Fetch recent user+assistant messages across sessions
	rows, err := db.Query(`
		SELECT m.role, m.content, m.timestamp
		FROM messages m
		JOIN sessions s ON s.id = m.session_id
		WHERE m.role IN ('user', 'assistant')
		ORDER BY s.started_at DESC, m.timestamp ASC
		LIMIT ?`, limit)
	if err != nil {
		return emptyRuntimeResult()
	}
	defer rows.Close()

	var messages []runtimeMessage
	for rows.Next() {
		var role, content string
		var ts float64
		if err := rows.Scan(&role, &content, &ts); err != nil {
			continue
		}
		content = strings.TrimSpace(content)
		if content == "" {
			continue
		}
		if len(content) > 300 {
			content = content[:297] + "..."
		}
		messages = append(messages, runtimeMessage{
			Role:      role,
			Content:   content,
			Timestamp: int64(ts * 1000),
		})
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"sessionCount":   sessionCount,
			"lastActiveMs":   lastActiveMs,
			"recentMessages": messages,
		},
	})
}

// ─── Primary Sessions ───────────────────────────────────────────────────────

// getPrimarySession returns the designated primary session key for an agent.
// If none has been set, it lazy-seeds one by picking the best candidate from
// the agent's existing sessions.
func (b *BridgeHandler) getPrimarySession(params map[string]interface{}) actionResult {
	agentID, _ := params["agentId"].(string)
	runtime, _ := params["runtime"].(string)
	if agentID == "" || runtime == "" {
		return errResultStatus("agentId and runtime required", 400)
	}
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	// Check stored primary first.
	key, err := b.store.GetPrimarySession(agentID, runtime)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}

	if key != "" {
		// Verify the session still exists — if not, clear and re-seed.
		if b.primarySessionExists(key, agentID, runtime) {
			return okResult(map[string]interface{}{
				"success": true,
				"data": map[string]interface{}{
					"sessionKey": key,
					"seeded":     false,
				},
			})
		}
		// Stale — clear it and fall through to lazy-seed.
		_ = b.store.ClearPrimarySession(agentID)
	}

	// Lazy-seed: pick the best candidate session.
	seeded := b.lazySeedPrimarySession(agentID, runtime)
	if seeded == "" {
		return okResult(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"sessionKey": "",
				"seeded":     false,
			},
		})
	}

	return okResult(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"sessionKey": seeded,
			"seeded":     true,
		},
	})
}

// setPrimarySession designates a specific session key as the primary for an agent.
func (b *BridgeHandler) setPrimarySession(params map[string]interface{}) actionResult {
	agentID, _ := params["agentId"].(string)
	runtime, _ := params["runtime"].(string)
	sessionKey, _ := params["sessionKey"].(string)
	if agentID == "" || runtime == "" || sessionKey == "" {
		return errResultStatus("agentId, runtime, and sessionKey required", 400)
	}
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	if err := b.store.SetPrimarySession(agentID, runtime, sessionKey); err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}

	return okResult(map[string]interface{}{
		"success": true,
	})
}

// lazySeedPrimarySession picks the best candidate session for an agent and
// stores it as primary. Returns the chosen key, or "" if none available.
func (b *BridgeHandler) lazySeedPrimarySession(agentID, runtime string) string {
	var key string

	switch runtime {
	case "openclaw":
		// For OpenClaw, prefer the well-known ":main" session convention.
		key = "agent:" + agentID + ":main"

	case "claude-code":
		// Pick the most recent session from SQLite.
		sessions, err := b.store.GetSessionsByAgent("claude-code", agentID, "", 1)
		if err == nil && len(sessions) > 0 {
			key = sessions[0].ID
			if !strings.HasPrefix(key, "claude:") {
				key = "claude:" + key
			}
		}

	case "codex":
		sessions, err := b.store.GetSessionsByAgent("codex", agentID, "", 1)
		if err == nil && len(sessions) > 0 {
			key = sessions[0].ID
			if !strings.HasPrefix(key, "codex:") {
				key = "codex:" + key
			}
		}

	case "hermes":
		profileID := agentID
		if strings.HasPrefix(profileID, "hermes:") {
			profileID = strings.TrimPrefix(profileID, "hermes:")
		}
		// Query hermes state.db for the most recent session.
		home, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		var dbPath string
		if profileID == "" || profileID == "main" || profileID == "__main__" {
			dbPath = filepath.Join(home, ".hermes", "state.db")
		} else {
			dbPath = filepath.Join(home, ".hermes", "profiles", profileID, "state.db")
		}
		if _, err := os.Stat(dbPath); err != nil {
			return ""
		}
		db, err := sql.Open("sqlite", dbPath+"?mode=ro&_pragma=busy_timeout(2000)")
		if err != nil {
			return ""
		}
		defer db.Close()

		var sessionID string
		err = db.QueryRow(`SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1`).Scan(&sessionID)
		if err != nil || sessionID == "" {
			return ""
		}
		key = "hermes:" + sessionID
	}

	if key == "" {
		return ""
	}

	// Persist the seeded primary.
	if err := b.store.SetPrimarySession(agentID, runtime, key); err != nil {
		return ""
	}
	return key
}

// primarySessionExists checks whether the backing session still exists on disk/db.
func (b *BridgeHandler) primarySessionExists(key, agentID, runtime string) bool {
	switch runtime {
	case "openclaw":
		// OpenClaw sessions are managed by the gateway — always considered valid.
		return true

	case "claude-code":
		sessionID := key
		if strings.HasPrefix(sessionID, "claude:") {
			sessionID = strings.TrimPrefix(sessionID, "claude:")
		}
		// Check SQLite first.
		sess, err := b.store.GetSessionByID(sessionID)
		if err == nil && sess != nil {
			return true
		}
		// Check on-disk JSONL file.
		home, _ := os.UserHomeDir()
		if home == "" {
			return false
		}
		projectPath := b.resolveProjectPathFromIdentityFile(agentID)
		if projectPath == "" {
			projectPath = b.paths.AgentDir("claude-code", agentID)
		}
		encoded := encodeClaudeProjectDir(projectPath)
		jsonlPath := filepath.Join(home, ".claude", "projects", encoded, sessionID+".jsonl")
		if _, err := os.Stat(jsonlPath); err == nil {
			return true
		}
		// Fallback: legacy un-prefixed dir
		legacyEncoded := encodeClaudeProjectDir(b.paths.LegacyAgentDir(agentID))
		legacyPath := filepath.Join(home, ".claude", "projects", legacyEncoded, sessionID+".jsonl")
		_, legacyErr := os.Stat(legacyPath)
		return legacyErr == nil

	case "codex":
		sessionID := key
		if strings.HasPrefix(sessionID, "codex:") {
			sessionID = strings.TrimPrefix(sessionID, "codex:")
		}
		sess, err := b.store.GetSessionByID(sessionID)
		return err == nil && sess != nil

	case "hermes":
		sessionID := key
		if strings.HasPrefix(sessionID, "hermes:") {
			sessionID = strings.TrimPrefix(sessionID, "hermes:")
		}
		profileID := agentID
		if strings.HasPrefix(profileID, "hermes:") {
			profileID = strings.TrimPrefix(profileID, "hermes:")
		}
		home, _ := os.UserHomeDir()
		if home == "" {
			return false
		}
		var dbPath string
		if profileID == "" || profileID == "main" || profileID == "__main__" {
			dbPath = filepath.Join(home, ".hermes", "state.db")
		} else {
			dbPath = filepath.Join(home, ".hermes", "profiles", profileID, "state.db")
		}
		db, err := sql.Open("sqlite", dbPath+"?mode=ro&_pragma=busy_timeout(2000)")
		if err != nil {
			return false
		}
		defer db.Close()
		var exists int
		err = db.QueryRow(`SELECT 1 FROM sessions WHERE id = ? LIMIT 1`, sessionID).Scan(&exists)
		return err == nil
	}

	return false
}
