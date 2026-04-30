package token

import (
	"bufio"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// ParseCodexSessionFile reads a Codex JSONL session file and returns token
// usage rows. Handles the same session-history and stream-json formats as
// ParseClaudeCodeSessionFile since Codex uses the same underlying protocol.
func ParseCodexSessionFile(path string) ([]store.TokenUsageRow, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	info, _ := f.Stat()
	var fileMtime int64
	if info != nil {
		fileMtime = info.ModTime().UnixMilli()
	}

	absPath, _ := filepath.Abs(path)
	h := sha256.Sum256([]byte(absPath))
	pathKey := fmt.Sprintf("%x", h[:6])

	var rows []store.TokenUsageRow
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	lineIdx := 0

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			lineIdx++
			continue
		}

		entryType, _ := raw["type"].(string)
		if entryType != "assistant" && entryType != "result" {
			lineIdx++
			continue
		}

		var inputTokens, outputTokens, cacheReadTokens int64
		var model string

		// Session history format: usage inside "message"
		if msg, ok := raw["message"].(map[string]interface{}); ok {
			if u, ok := msg["usage"].(map[string]interface{}); ok {
				inputTokens = ccInt(u["input_tokens"])
				outputTokens = ccInt(u["output_tokens"])
				cacheReadTokens = ccInt(ccFirst(u, "cache_read_input_tokens", "cache_read_tokens", "cacheReadTokens"))
			}
			if m, ok := msg["model"].(string); ok && m != "" {
				model = m
			}
		}

		// Stream-json format: top-level usage
		if inputTokens == 0 && outputTokens == 0 {
			if u, ok := raw["usage"].(map[string]interface{}); ok {
				inputTokens = ccInt(u["input_tokens"])
				outputTokens = ccInt(u["output_tokens"])
				cacheReadTokens = ccInt(ccFirst(u, "cache_read_input_tokens", "cache_read_tokens", "cacheReadTokens"))
			}
			if m, ok := raw["model"].(string); ok && m != "" {
				model = m
			}
		}

		if inputTokens == 0 && outputTokens == 0 {
			lineIdx++
			continue
		}

		ts := int64(0)
		if rawTs, ok := raw["timestamp"].(string); ok && rawTs != "" {
			if t, err := parseOpenClawTS(rawTs); err == nil {
				ts = t.UnixMilli()
			}
		}
		if ts == 0 {
			ts = fileMtime
		}
		if ts == 0 {
			ts = time.Now().UnixMilli()
		}

		rows = append(rows, store.TokenUsageRow{
			DedupKey:        fmt.Sprintf("codex:%s:%d", pathKey, lineIdx),
			Runtime:         "codex",
			Model:           model,
			InputTokens:     inputTokens,
			OutputTokens:    outputTokens,
			CacheReadTokens: cacheReadTokens,
			RecordedAt:      ts,
		})
		lineIdx++
	}
	return rows, scanner.Err()
}

// WalkCodexSessions returns all JSONL file paths under ~/.codex/sessions.
func WalkCodexSessions(home string) []string {
	sessDir := filepath.Join(home, ".codex", "sessions")
	var out []string
	_ = filepath.WalkDir(sessDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, ".jsonl") {
			out = append(out, path)
		}
		return nil
	})
	return out
}
