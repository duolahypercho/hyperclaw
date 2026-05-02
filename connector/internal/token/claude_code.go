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

// ParseClaudeCodeSessionFile reads a Claude Code JSONL session file and returns
// token usage rows. Handles two formats:
//
//  1. Session history format (stored in ~/.claude/projects/**/*.jsonl):
//     {"type":"assistant","message":{"usage":{"input_tokens":N,"output_tokens":N},"model":"..."}, "timestamp":"..."}
//
//  2. Stream-json format (live output piped from `claude --output-format stream-json`):
//     {"type":"result","usage":{"input_tokens":N,"output_tokens":N},"model":"..."}
func ParseClaudeCodeSessionFile(path string) ([]store.TokenUsageRow, error) {
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
	sessionID := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))

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

		// Format 1: session history — usage is inside the "message" object
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

		// Format 2: stream-json — top-level usage (live streaming)
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

		// Timestamp from entry-level "timestamp" field (ISO8601)
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
			DedupKey:        fmt.Sprintf("claude-code:%s:%d", pathKey, lineIdx),
			Runtime:         "claude-code",
			SessionID:       sessionID,
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

// ── helpers ───────────────────────────────────────────────────────────────────

func ccInt(v interface{}) int64 {
	if f, ok := v.(float64); ok && f > 0 {
		return int64(f)
	}
	return 0
}

func ccFirst(m map[string]interface{}, keys ...string) interface{} {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return v
		}
	}
	return nil
}
