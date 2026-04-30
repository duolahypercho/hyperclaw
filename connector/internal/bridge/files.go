package bridge

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// ── get-events (file fallback) ───────────────────────────────────────────────

func (b *BridgeHandler) getEventsFile() actionResult {
	data, err := os.ReadFile(b.paths.EventsPath())
	if err != nil {
		return okResult([]interface{}{})
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 0 || (len(lines) == 1 && lines[0] == "") {
		return okResult([]interface{}{})
	}

	// Take last 50
	start := 0
	if len(lines) > 50 {
		start = len(lines) - 50
	}
	events := make([]interface{}, 0, 50)
	for _, line := range lines[start:] {
		if line == "" {
			continue
		}
		var obj interface{}
		if err := json.Unmarshal([]byte(line), &obj); err == nil {
			events = append(events, obj)
		}
	}
	return okResult(events)
}

// ── get-logs ────────────────────────────────────────────────────────────────

const (
	maxBridgeLogTailBytes = 512 * 1024
	maxLogMessageBytes    = 8 * 1024
	maxLogLines           = 500
)

var logNoisePatterns = []string{
	"Gateway failed to start",
	"gateway already running",
	"Port 18789 is already in use",
	"Gateway service appears loaded",
	"lock timeout",
	"launchctl bootout",
	"openclaw gateway stop",
	"gateway timeout",
	"Chrome extension relay",
	"browser failed",
	// Repetitive plugin config spam (30+ lines per restart)
	"plugin id mismatch",
	"stale config entry ignored",
	"duplicate plugin id detected",
	"- plugins.entries.",
	"plugin not found:",
	// Bare context/hint lines from stderr
	"Tip: openclaw",
	"Or: launchctl bootout",
	"Stop it first",
	"use a different port",
	"Gateway already running locally",
	"If the gateway is supervised",
}

type logEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

func compactLogEntry(entry *logEntry) *logEntry {
	if entry == nil {
		return nil
	}
	if len(entry.Message) > maxLogMessageBytes {
		entry.Message = entry.Message[:maxLogMessageBytes] + "... [truncated]"
	}
	return entry
}

var logTagRegex = regexp.MustCompile(`^(\S+)\s+\[([^\]]+)\]\s+(.+)$`)
var logSimpleRegex = regexp.MustCompile(`^(\S+)\s+(.+)$`)

func parseLogLine(line string) *logEntry {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil
	}

	// Try JSON parse (JSONL format: "0" = subsystem metadata, "1"+ = message parts)
	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(line), &obj); err == nil {
		t, _ := obj["time"].(string)
		level := "INFO"
		if meta, ok := obj["_meta"].(map[string]interface{}); ok {
			if ln, ok := meta["logLevelName"].(string); ok {
				level = ln
			}
		}
		var msg string
		// Field "1" is typically the message; field "0" is often subsystem JSON metadata
		if v, ok := obj["1"].(string); ok {
			msg = v
		} else if v, ok := obj["0"].(string); ok && len(v) > 0 && v[0] != '{' {
			msg = v
		} else if v, ok := obj["message"].(string); ok {
			msg = v
		}
		// Concatenate remaining numeric fields
		startIdx := 2
		if msg == "" {
			startIdx = 1
		}
		for i := startIdx; ; i++ {
			key := fmt.Sprintf("%d", i)
			v, ok := obj[key]
			if !ok {
				break
			}
			if s, ok := v.(string); ok {
				msg += " " + s
			} else {
				b, _ := json.Marshal(v)
				msg += " " + string(b)
			}
		}
		if msg == "" {
			if v, ok := obj["0"].(string); ok {
				msg = v
			}
		}
		return compactLogEntry(&logEntry{Time: t, Level: level, Message: strings.TrimSpace(msg)})
	}

	// Fallback: timestamp [tag] message
	if m := logTagRegex.FindStringSubmatch(line); m != nil {
		return compactLogEntry(&logEntry{Time: m[1], Level: m[2], Message: strings.TrimSpace(m[3])})
	}

	// Fallback: timestamp message (if timestamp looks like a date)
	if m := logSimpleRegex.FindStringSubmatch(line); m != nil {
		if _, err := time.Parse(time.RFC3339, m[1]); err == nil {
			return compactLogEntry(&logEntry{Time: m[1], Level: "INFO", Message: strings.TrimSpace(m[2])})
		}
		// Also try parsing with just date prefix
		if len(m[1]) >= 10 && m[1][4] == '-' && m[1][7] == '-' {
			return compactLogEntry(&logEntry{Time: m[1], Level: "INFO", Message: strings.TrimSpace(m[2])})
		}
	}

	return compactLogEntry(&logEntry{Time: "", Level: "INFO", Message: line})
}

func isNoisyLog(msg string) bool {
	for _, p := range logNoisePatterns {
		if strings.Contains(msg, p) {
			return true
		}
	}
	return false
}

// readTailBytes reads the last maxBytes of a file (efficient for large files).
func readTailBytes(path string, maxBytes int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, err
	}

	size := info.Size()
	if size <= maxBytes {
		return io.ReadAll(f)
	}

	// Seek to (size - maxBytes), then read forward
	if _, err := f.Seek(size-maxBytes, io.SeekStart); err != nil {
		return nil, err
	}
	buf, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	// Drop the first partial line
	if idx := strings.IndexByte(string(buf), '\n'); idx >= 0 {
		buf = buf[idx+1:]
	}
	return buf, nil
}

// inferErrLogLevel guesses a severity for stderr log entries based on message content.
// OpenClaw routes console.warn/error/debug to stderr; there's no explicit level field
// in the plain-text format, so we classify by keyword patterns from real gateway logs.
func inferErrLogLevel(msg string) string {
	lower := strings.ToLower(msg)

	// ERROR — clear failures and auth issues
	if strings.Contains(lower, "failed") || strings.Contains(lower, "unauthorized") ||
		strings.Contains(lower, "panic") || strings.Contains(lower, "fatal") ||
		strings.Contains(msg, "⇄ res ✗") || strings.Contains(lower, "errorcode=") ||
		strings.Contains(lower, "error:") || strings.Contains(lower, "error (") {
		return "ERROR"
	}

	// DEBUG — connection lifecycle noise and bare context lines
	if strings.Contains(lower, "closed before connect") || strings.Contains(lower, "handshake timeout") {
		return "DEBUG"
	}

	// WARN — config issues, deprecations, soft warnings
	if strings.Contains(lower, "warn") || strings.Contains(lower, "deprecated") ||
		strings.Contains(lower, "skipping") || strings.Contains(lower, "duplicate") ||
		strings.Contains(lower, "newer openclaw") || strings.Contains(lower, "plugins.allow is empty") ||
		strings.Contains(lower, "restart timeout") || strings.Contains(lower, "lock timeout") {
		return "WARN"
	}

	return "WARN"
}

// inferErrLogLevelWithTime also checks whether the line had a timestamp.
// Lines without timestamps in stderr are bare context (Config:, Bind:, etc.) → DEBUG.
func inferErrLogLevelWithTime(entry *logEntry) {
	if entry.Time == "" {
		entry.Level = "DEBUG"
		return
	}
	entry.Level = inferErrLogLevel(entry.Message)
}

// jsonlRollingLogPath returns the JSONL rolling log path for today (e.g. /tmp/openclaw/openclaw-2026-03-16.log).
// This is the same file that `openclaw logs` reads — it has real _meta.logLevelName fields.
func jsonlRollingLogPath() string {
	today := time.Now().Format("2006-01-02")
	return filepath.Join(os.TempDir(), "openclaw", "openclaw-"+today+".log")
}

// jsonlRollingLogPathPosix checks the POSIX /tmp/openclaw path first (OpenClaw's preferred location on macOS/Linux).
func jsonlRollingLogPathPosix() string {
	today := time.Now().Format("2006-01-02")
	posix := filepath.Join("/tmp", "openclaw", "openclaw-"+today+".log")
	if _, err := os.Stat(posix); err == nil {
		return posix
	}
	tmpdir := jsonlRollingLogPath()
	if _, err := os.Stat(tmpdir); err == nil {
		return tmpdir
	}
	return ""
}

// matchesLevelFilter checks if a log level matches any of the requested filter levels.
func matchesLevelFilter(level string, filterLevels []string) bool {
	upper := strings.ToUpper(level)
	for _, f := range filterLevels {
		fu := strings.ToUpper(f)
		switch fu {
		case "WARN":
			if upper == "WARN" || upper == "WARNING" {
				return true
			}
		case "ERROR":
			if upper == "ERROR" || upper == "FATAL" {
				return true
			}
		case "DEBUG":
			if upper == "DEBUG" || upper == "TRACE" {
				return true
			}
		default:
			if upper == fu {
				return true
			}
		}
	}
	return false
}

func (b *BridgeHandler) getLogs(params map[string]interface{}) actionResult {
	lines := 100
	if l, ok := params["lines"].(float64); ok && l > 0 {
		lines = int(l)
	}
	if lines > maxLogLines {
		lines = maxLogLines
	}

	// Parse optional level filter (e.g. ["ERROR", "WARN"])
	var filterLevels []string
	if arr, ok := params["levels"].([]interface{}); ok {
		for _, v := range arr {
			if s, ok := v.(string); ok {
				filterLevels = append(filterLevels, s)
			}
		}
	}
	hasFilter := len(filterLevels) > 0

	// Primary: read JSONL rolling log (same source as `openclaw logs` — has real log levels)
	jsonlPath := jsonlRollingLogPathPosix()
	if jsonlPath != "" {
		// Read more data when filtering to find enough matching entries
		maxBytes := int64(maxBridgeLogTailBytes)
		if hasFilter {
			maxBytes = 2 * maxBridgeLogTailBytes
		}
		data, err := readTailBytes(jsonlPath, maxBytes)
		if err == nil && len(data) > 0 {
			allLines := strings.Split(string(data), "\n")
			var parsed []logEntry
			for _, line := range allLines {
				entry := parseLogLine(line)
				if entry == nil {
					continue
				}
				ul := strings.ToUpper(entry.Level)
				if ul != "WARN" && ul != "WARNING" && ul != "ERROR" && ul != "FATAL" && isNoisyLog(entry.Message) {
					continue
				}
				if hasFilter && !matchesLevelFilter(entry.Level, filterLevels) {
					continue
				}
				parsed = append(parsed, *entry)
			}
			start := 0
			if len(parsed) > lines {
				start = len(parsed) - lines
			}
			return okResult(parsed[start:])
		}
	}

	// Fallback: read plain-text gateway.log + gateway.err.log
	logPath := b.paths.GatewayLogPath()
	errLogPath := b.paths.GatewayErrLogPath()

	stdoutData, stdoutErr := readTailBytes(logPath, maxBridgeLogTailBytes)
	var errData []byte
	if errLogPath != "" {
		errData, _ = readTailBytes(errLogPath, maxBridgeLogTailBytes)
	}

	if stdoutErr != nil && len(errData) == 0 {
		p := b.paths
		return okResult(map[string]interface{}{
			"error": "Log file not found. Checked: " +
				jsonlRollingLogPath() + ", " +
				filepath.Join(p.OpenClaw, "logs", "gateway.log") + ", " +
				filepath.Join(p.OpenClawAlt, "logs", "gateway.log"),
		})
	}

	var parsed []logEntry
	if stdoutErr == nil {
		for _, line := range strings.Split(string(stdoutData), "\n") {
			entry := parseLogLine(line)
			if entry == nil {
				continue
			}
			ul := strings.ToUpper(entry.Level)
			if ul != "WARN" && ul != "WARNING" && ul != "ERROR" && ul != "FATAL" && isNoisyLog(entry.Message) {
				continue
			}
			parsed = append(parsed, *entry)
		}
	}
	if len(errData) > 0 {
		for _, line := range strings.Split(string(errData), "\n") {
			entry := parseLogLine(line)
			if entry == nil {
				continue
			}
			ul := strings.ToUpper(entry.Level)
			if ul != "WARN" && ul != "WARNING" && ul != "ERROR" && ul != "FATAL" && isNoisyLog(entry.Message) {
				continue
			}
			upper := strings.ToUpper(entry.Level)
			if upper != "ERROR" && upper != "WARN" && upper != "WARNING" && upper != "DEBUG" && upper != "INFO" {
				inferErrLogLevelWithTime(entry)
			}
			parsed = append(parsed, *entry)
		}
		sort.SliceStable(parsed, func(i, j int) bool {
			return parsed[i].Time < parsed[j].Time
		})
	}

	if hasFilter {
		var filtered []logEntry
		for _, e := range parsed {
			if matchesLevelFilter(e.Level, filterLevels) {
				filtered = append(filtered, e)
			}
		}
		parsed = filtered
	}

	start := 0
	if len(parsed) > lines {
		start = len(parsed) - lines
	}
	return okResult(parsed[start:])
}

// ── get-config ──────────────────────────────────────────────────────────────

func (b *BridgeHandler) getConfig() actionResult {
	data, err := os.ReadFile(b.paths.ConfigPath())
	if err != nil {
		return okResult(map[string]interface{}{})
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return okResult(map[string]interface{}{})
	}

	// Redact API keys
	if providers, ok := config["providers"].(map[string]interface{}); ok {
		for _, val := range providers {
			if provider, ok := val.(map[string]interface{}); ok {
				if _, hasKey := provider["apiKey"]; hasKey {
					provider["apiKey"] = "***"
				}
			}
		}
	}

	return okResult(config)
}

// ── list-models ─────────────────────────────────────────────────────────────
// Accepts optional "runtime" param: "openclaw" (default), "claude-code", "codex", "hermes".
// Reads models from local config files and session history — no API keys needed.

func (b *BridgeHandler) listModels(params map[string]interface{}) actionResult {
	runtime, _ := params["runtime"].(string)
	if runtime == "" {
		runtime = "openclaw"
	}
	agentId, _ := params["agentId"].(string)

	switch runtime {
	case "openclaw":
		return b.listModelsOpenClaw()
	case "claude-code":
		return b.listModelsClaudeCode()
	case "codex":
		return b.listModelsCodex()
	case "hermes":
		return b.listModelsHermes(agentId)
	default:
		return okResult(map[string]interface{}{"models": []interface{}{}})
	}
}

// listModelsOpenClaw reads models from openclaw.json agents.defaults.models
func (b *BridgeHandler) listModelsOpenClaw() actionResult {
	data, err := os.ReadFile(b.paths.ConfigPath())
	if err != nil {
		return okResult(map[string]interface{}{"models": []interface{}{}})
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return okResult(map[string]interface{}{"models": []interface{}{}})
	}

	agents, _ := config["agents"].(map[string]interface{})
	defaults, _ := agents["defaults"].(map[string]interface{})
	models, _ := defaults["models"].(map[string]interface{})

	result := make([]map[string]string, 0)
	for id := range models {
		result = append(result, map[string]string{"id": id, "label": id})
	}

	return okResult(map[string]interface{}{"models": result})
}

// listModelsClaudeCode discovers available Claude models from local session history
// and known aliases. Claude Code uses OAuth — no API key needed.
// Scans recent session JSONL files for model names actually used, plus the
// built-in aliases (sonnet, opus, haiku) that always work.
func (b *BridgeHandler) listModelsClaudeCode() actionResult {
	seen := make(map[string]bool)
	var models []map[string]string

	// 1. Scan recent Claude Code sessions for model names used
	claudeDir := filepath.Join(b.paths.Home, ".claude", "projects")
	if entries, err := os.ReadDir(claudeDir); err == nil {
		for _, projEntry := range entries {
			if !projEntry.IsDir() {
				continue
			}
			projPath := filepath.Join(claudeDir, projEntry.Name())
			files, err := os.ReadDir(projPath)
			if err != nil {
				continue
			}
			// Check the 10 most recent JSONL files
			count := 0
			for i := len(files) - 1; i >= 0 && count < 10; i-- {
				f := files[i]
				if !strings.HasSuffix(f.Name(), ".jsonl") {
					continue
				}
				count++
				data, err := os.ReadFile(filepath.Join(projPath, f.Name()))
				if err != nil {
					continue
				}
				// Only scan first 50 lines for model field
				lines := strings.Split(string(data), "\n")
				if len(lines) > 50 {
					lines = lines[:50]
				}
				for _, line := range lines {
					line = strings.TrimSpace(line)
					if line == "" {
						continue
					}
					var entry map[string]interface{}
					if json.Unmarshal([]byte(line), &entry) != nil {
						continue
					}
					if model, ok := entry["model"].(string); ok && model != "" && strings.HasPrefix(model, "claude-") {
						family := stripDateSuffix(model)
						if !seen[family] {
							seen[family] = true
							models = append(models, map[string]string{"id": family, "label": family})
						}
					}
				}
			}
			// Only scan a few project dirs
			if len(models) > 0 {
				break
			}
		}
	}

	// 2. Always include the built-in aliases and full model IDs
	builtins := []struct{ id, label string }{
		{"claude-sonnet-4-6", "Claude Sonnet 4.6"},
		{"claude-opus-4-6", "Claude Opus 4.6"},
		{"claude-haiku-4-5", "Claude Haiku 4.5"},
		{"sonnet", "Sonnet (latest)"},
		{"opus", "Opus (latest)"},
		{"haiku", "Haiku (latest)"},
	}
	for _, b := range builtins {
		if !seen[b.id] {
			seen[b.id] = true
			models = append(models, map[string]string{"id": b.id, "label": b.label})
		}
	}

	return okResult(map[string]interface{}{"models": models})
}

// listModelsCodex reads the configured model from ~/.codex/config.toml
// and includes known Codex-compatible models.
func (b *BridgeHandler) listModelsCodex() actionResult {
	seen := make(map[string]bool)
	var models []map[string]string

	// 1. Read configured model from config.toml (only top-level `model = "..."`)
	configPath := filepath.Join(b.paths.Home, ".codex", "config.toml")
	if data, err := os.ReadFile(configPath); err == nil {
		inSection := false
		for _, line := range strings.Split(string(data), "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "[") {
				inSection = true
				continue
			}
			if inSection {
				continue
			}
			// Match exactly `model = "value"` (not model_reasoning_effort etc.)
			if strings.HasPrefix(trimmed, "model ") || strings.HasPrefix(trimmed, "model=") {
				parts := strings.SplitN(trimmed, "=", 2)
				if len(parts) == 2 && strings.TrimSpace(parts[0]) == "model" {
					model := strings.TrimSpace(parts[1])
					model = strings.Trim(model, "\"'")
					if model != "" && !seen[model] {
						seen[model] = true
						models = append(models, map[string]string{"id": model, "label": model + " (configured)"})
					}
				}
			}
		}
	}

	// 2. Scan recent Codex sessions for model names used
	sessionsDir := filepath.Join(b.paths.Home, ".codex", "sessions")
	if yearDirs, err := os.ReadDir(sessionsDir); err == nil {
		// Walk backwards through date dirs to find recent sessions
		count := 0
		for i := len(yearDirs) - 1; i >= 0 && count < 5; i-- {
			yearPath := filepath.Join(sessionsDir, yearDirs[i].Name())
			monthDirs, err := os.ReadDir(yearPath)
			if err != nil {
				continue
			}
			for j := len(monthDirs) - 1; j >= 0 && count < 5; j-- {
				monthPath := filepath.Join(yearPath, monthDirs[j].Name())
				dayDirs, err := os.ReadDir(monthPath)
				if err != nil {
					continue
				}
				for k := len(dayDirs) - 1; k >= 0 && count < 5; k-- {
					dayPath := filepath.Join(monthPath, dayDirs[k].Name())
					sessionFiles, err := os.ReadDir(dayPath)
					if err != nil {
						continue
					}
					for _, sf := range sessionFiles {
						if !strings.HasSuffix(sf.Name(), ".jsonl") {
							continue
						}
						count++
						data, err := os.ReadFile(filepath.Join(dayPath, sf.Name()))
						if err != nil {
							continue
						}
						lines := strings.Split(string(data), "\n")
						if len(lines) > 30 {
							lines = lines[:30]
						}
						for _, line := range lines {
							line = strings.TrimSpace(line)
							if line == "" {
								continue
							}
							var entry map[string]interface{}
							if json.Unmarshal([]byte(line), &entry) != nil {
								continue
							}
							if model, ok := entry["model"].(string); ok && model != "" {
								if !seen[model] {
									seen[model] = true
									models = append(models, map[string]string{"id": model, "label": model})
								}
							}
						}
					}
				}
			}
		}
	}

	return okResult(map[string]interface{}{"models": models})
}

// listModelsHermes reads models from config.yaml for a hermes agent.
// For named profiles (agentId != "" and != "hermes"), it checks
// ~/.hermes/profiles/{agentId}/config.yaml first, then falls back to
// ~/.hermes/config.yaml. Supports .yml extension, config.json, and .env as
// further fallbacks.
func (b *BridgeHandler) listModelsHermes(agentId string) actionResult {
	hermesDir := filepath.Join(b.paths.Home, ".hermes")
	seen := make(map[string]bool)
	var models []map[string]string

	addModel := func(id, label string) {
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		if label == "" {
			label = id
		}
		models = append(models, map[string]string{"id": id, "label": label})
	}

	// 1. Read from config.yaml (primary — Hermes v2 format).
	//    For named profiles, try ~/.hermes/profiles/{agentId}/config.yaml first.
	//    Uses simple line scanning to avoid a YAML library dependency.
	yamlDirs := []string{hermesDir}
	if agentId != "" && agentId != "hermes" {
		profileDir := filepath.Join(hermesDir, "profiles", agentId)
		if _, err := os.Stat(profileDir); err == nil {
			// Prepend profile dir so it takes priority over root config
			yamlDirs = []string{profileDir, hermesDir}
		}
	}

	// parseYAMLModel extracts model.default and model.provider from a config.yaml.
	// Strips surrounding quotes since YAML scalar values may be quoted.
	stripYAMLQuotes := func(s string) string {
		s = strings.TrimSpace(s)
		// Strip trailing inline comment
		if i := strings.Index(s, " #"); i >= 0 {
			s = strings.TrimSpace(s[:i])
		}
		if len(s) >= 2 {
			if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
				s = s[1 : len(s)-1]
			}
		}
		return s
	}
	parseYAMLModel := func(data []byte) (string, string) {
		var modelDefault, modelProvider string
		inModelBlock := false
		for _, line := range strings.Split(string(data), "\n") {
			trimmed := strings.TrimSpace(line)
			if len(line) > 0 && line[0] != ' ' && line[0] != '\t' {
				if strings.HasPrefix(trimmed, "model:") {
					inModelBlock = true
					val := strings.TrimSpace(strings.TrimPrefix(trimmed, "model:"))
					if val != "" && !strings.HasPrefix(val, "#") {
						modelDefault = stripYAMLQuotes(val)
					}
					continue
				}
				inModelBlock = false
			}
			if !inModelBlock {
				continue
			}
			if strings.HasPrefix(trimmed, "default:") {
				modelDefault = stripYAMLQuotes(strings.TrimPrefix(trimmed, "default:"))
			} else if strings.HasPrefix(trimmed, "provider:") {
				modelProvider = stripYAMLQuotes(strings.TrimPrefix(trimmed, "provider:"))
			}
		}
		return modelDefault, modelProvider
	}

	yamlFound := false
	for _, dir := range yamlDirs {
		if yamlFound {
			break
		}
		for _, yamlName := range []string{"config.yaml", "config.yml"} {
			yamlPath := filepath.Join(dir, yamlName)
			data, err := os.ReadFile(yamlPath)
			if err != nil {
				continue
			}
			modelDefault, modelProvider := parseYAMLModel(data)
			if modelDefault != "" {
				label := modelDefault
				if modelProvider != "" {
					label = modelProvider + "/" + modelDefault
				}
				addModel(modelDefault, label+" (configured)")
			}
			yamlFound = true
			break
		}
	}

	// 2. Fallback: read from config.json
	configPath := filepath.Join(hermesDir, "config.json")
	if data, err := os.ReadFile(configPath); err == nil {
		var config map[string]interface{}
		if json.Unmarshal(data, &config) == nil {
			if modelList, ok := config["models"].([]interface{}); ok {
				for _, m := range modelList {
					switch v := m.(type) {
					case string:
						addModel(v, v)
					case map[string]interface{}:
						id, _ := v["id"].(string)
						if id == "" {
							id, _ = v["model"].(string)
						}
						label, _ := v["label"].(string)
						if label == "" {
							label, _ = v["name"].(string)
						}
						addModel(id, label)
					}
				}
			} else if model, ok := config["model"].(string); ok && model != "" {
				addModel(model, model)
			}
		}
	}

	// 3. Read from .env
	envPath := filepath.Join(hermesDir, ".env")
	if data, err := os.ReadFile(envPath); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			for _, prefix := range []string{"HERMES_MODEL=", "DEFAULT_MODEL=", "LLM_MODEL="} {
				if strings.HasPrefix(line, prefix) {
					model := strings.TrimSpace(strings.TrimPrefix(line, prefix))
					model = strings.Trim(model, "\"'")
					addModel(model, model)
				}
			}
		}
	}

	return okResult(map[string]interface{}{"models": models})
}

// stripDateSuffix removes a trailing -YYYYMMDD from a model ID.
// e.g. "claude-sonnet-4-6-20250514" → "claude-sonnet-4-6"
func stripDateSuffix(id string) string {
	if len(id) < 9 {
		return id
	}
	suffix := id[len(id)-9:]
	if suffix[0] == '-' {
		allDigits := true
		for _, c := range suffix[1:] {
			if c < '0' || c > '9' {
				allDigits = false
				break
			}
		}
		if allDigits {
			return id[:len(id)-9]
		}
	}
	return id
}

// ── load-local-usage (file fallback) ─────────────────────────────────────────

func (b *BridgeHandler) loadLocalUsageFile() actionResult {
	data, err := os.ReadFile(b.paths.UsagePath())
	if err != nil {
		return okResult(map[string]interface{}{"success": true, "data": nil})
	}
	var parsed interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error(), "data": nil})
	}
	return okResult(map[string]interface{}{"success": true, "data": parsed})
}

// ── save-local-usage (file fallback) ─────────────────────────────────────────

func (b *BridgeHandler) saveLocalUsageFile(params map[string]interface{}) actionResult {
	EnsureDir(b.paths.HyperClaw)
	usageData := params["usageData"]
	data, err := json.MarshalIndent(usageData, "", "  ")
	if err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	if err := os.WriteFile(b.paths.UsagePath(), data, 0644); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── list-channels (file fallback) ────────────────────────────────────────────

func (b *BridgeHandler) listChannelsFile() actionResult {
	data, err := os.ReadFile(b.paths.ChannelsPath())
	if err != nil {
		return okResult(map[string]interface{}{"success": true, "data": []interface{}{}})
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return okResult(map[string]interface{}{"success": true, "data": []interface{}{}})
	}
	channels, ok := raw["channels"].([]interface{})
	if !ok {
		channels = []interface{}{}
	}
	return okResult(map[string]interface{}{"success": true, "data": channels})
}

// ── send-command (file fallback) ─────────────────────────────────────────────

func (b *BridgeHandler) sendCommandFile(params map[string]interface{}) actionResult {
	command, _ := params["command"].(map[string]interface{})
	if command == nil {
		return errResultStatus("missing command", 400)
	}

	entry := map[string]interface{}{
		"type":      command["type"],
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"source":    "hyperclaw",
		"payload":   command["payload"],
	}
	if entry["payload"] == nil {
		entry["payload"] = map[string]interface{}{}
	}

	line, _ := json.Marshal(entry)
	f, err := os.OpenFile(b.paths.CommandsPath(), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return errResult(err.Error())
	}
	defer f.Close()
	f.Write(append(line, '\n'))

	return okResult(map[string]interface{}{"success": true})
}

// ── read-office-layout (file fallback) ───────────────────────────────────────

func (b *BridgeHandler) readOfficeLayoutFile() actionResult {
	EnsureDir(filepath.Dir(b.paths.OfficeLayoutPath()))
	data, err := os.ReadFile(b.paths.OfficeLayoutPath())
	if err != nil {
		return okResult(map[string]interface{}{"success": true, "layout": nil})
	}
	var layout interface{}
	if err := json.Unmarshal(data, &layout); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true, "layout": layout})
}

// ── write-office-layout (file fallback) ──────────────────────────────────────

func (b *BridgeHandler) writeOfficeLayoutFile(params map[string]interface{}) actionResult {
	layout, ok := params["officeLayout"]
	if !ok || layout == nil {
		return okResult(map[string]interface{}{"success": false, "error": "Missing layout"})
	}
	EnsureDir(filepath.Dir(b.paths.OfficeLayoutPath()))
	data, _ := json.MarshalIndent(layout, "", "  ")
	if err := os.WriteFile(b.paths.OfficeLayoutPath(), data, 0644); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── read-office-seats (file fallback) ────────────────────────────────────────

func (b *BridgeHandler) readOfficeSeatsFile() actionResult {
	EnsureDir(filepath.Dir(b.paths.OfficeSeatsPath()))
	data, err := os.ReadFile(b.paths.OfficeSeatsPath())
	if err != nil {
		return okResult(map[string]interface{}{"success": true, "seats": nil})
	}
	var seats interface{}
	if err := json.Unmarshal(data, &seats); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true, "seats": seats})
}

// ── write-office-seats (file fallback) ───────────────────────────────────────

func (b *BridgeHandler) writeOfficeSeatsFile(params map[string]interface{}) actionResult {
	seats, ok := params["officeSeats"]
	if !ok || seats == nil {
		return okResult(map[string]interface{}{"success": false, "error": "Missing seats"})
	}
	EnsureDir(filepath.Dir(b.paths.OfficeSeatsPath()))
	data, _ := json.MarshalIndent(seats, "", "  ")
	if err := os.WriteFile(b.paths.OfficeSeatsPath(), data, 0644); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}
