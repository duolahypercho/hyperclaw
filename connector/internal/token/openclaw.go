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

// WalkOpenClawSessions returns all session JSONL file paths under
// {openclawRoot}/agents/*/sessions/*.jsonl, paired with the agent ID.
// openclawRoot is typically ~/.openclaw.
func WalkOpenClawSessions(openclawRoot string) [][2]string {
	var out [][2]string
	agentsDir := filepath.Join(openclawRoot, "agents")
	agents, err := os.ReadDir(agentsDir)
	if err != nil {
		return out
	}
	for _, agent := range agents {
		if !agent.IsDir() {
			continue
		}
		agentID := agent.Name()
		sessDir := filepath.Join(agentsDir, agentID, "sessions")
		files, err := os.ReadDir(sessDir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if !f.Type().IsRegular() {
				continue
			}
			name := f.Name()
			// Only JSONL session files (skip deleted files and sessions.json metadata)
			if !strings.HasSuffix(name, ".jsonl") || strings.Contains(name, ".deleted.") {
				continue
			}
			out = append(out, [2]string{filepath.Join(sessDir, name), agentID})
		}
	}
	return out
}

// ParseOpenClawSessionFile parses a single OpenClaw JSONL session file and
// returns token usage rows. The file format is one JSON object per line.
// Lines with type "message" and role "assistant" carry usage data in:
//
//	message.usage.input, message.usage.output, message.usage.cacheRead
//	message.usage.cost.total  (used as costUSD if pre-computed)
func ParseOpenClawSessionFile(path, agentID string) ([]store.TokenUsageRow, error) {
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
	scanner.Buffer(make([]byte, 0, 256*1024), 4*1024*1024)
	lineIdx := 0

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var entry map[string]interface{}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			lineIdx++
			continue
		}

		entryType, _ := entry["type"].(string)
		if entryType != "message" {
			lineIdx++
			continue
		}

		msg, ok := entry["message"].(map[string]interface{})
		if !ok {
			lineIdx++
			continue
		}
		role, _ := msg["role"].(string)
		if role != "assistant" {
			lineIdx++
			continue
		}

		usage, ok := msg["usage"].(map[string]interface{})
		if !ok {
			lineIdx++
			continue
		}

		input := ocInt(ocFirst(usage, "input", "inputTokens", "input_tokens"))
		output := ocInt(ocFirst(usage, "output", "outputTokens", "output_tokens"))
		cacheRead := ocInt(ocFirst(usage, "cacheRead", "cacheReadTokens", "cache_read_tokens"))
		if input == 0 && output == 0 {
			lineIdx++
			continue
		}

		// Timestamp from the entry-level timestamp field (ISO8601 string)
		ts := int64(0)
		if rawTs, ok := entry["timestamp"].(string); ok && rawTs != "" {
			if t, err := parseOpenClawTS(rawTs); err == nil {
				ts = t.UnixMilli()
			}
		}
		if ts == 0 {
			ts = fileMtime
		}

		// Pre-computed cost from the usage block (not all providers supply this)
		var costUSD float64
		if costBlock, ok := usage["cost"].(map[string]interface{}); ok {
			if total, ok := costBlock["total"].(float64); ok {
				costUSD = total
			}
		}

		rows = append(rows, store.TokenUsageRow{
			DedupKey:        fmt.Sprintf("openclaw:%s:%d", pathKey, lineIdx),
			Runtime:         "openclaw",
			AgentID:         agentID,
			InputTokens:     input,
			OutputTokens:    output,
			CacheReadTokens: cacheRead,
			CostUSD:         costUSD,
			RecordedAt:      ts,
		})
		lineIdx++
	}

	return rows, scanner.Err()
}

// ── helpers ──────────────────────────────────────────────────────────────────

// parseOpenClawTS parses an ISO8601 timestamp string to a time.Time.
func parseOpenClawTS(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999Z",
		"2006-01-02T15:04:05Z",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse timestamp: %q", s)
}

func ocInt(v interface{}) int64 {
	if f, ok := v.(float64); ok && f > 0 {
		return int64(f)
	}
	return 0
}

func ocFirst(m map[string]interface{}, keys ...string) interface{} {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return v
		}
	}
	return nil
}
