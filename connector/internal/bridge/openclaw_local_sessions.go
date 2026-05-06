package bridge

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	openClawLocalDefaultSessionLimit = 200
	openClawLocalMaxSessionLimit     = 1000
	openClawLocalMaxChars            = 500_000
)

var openClawSessionsIndexLocks sync.Map

var errOpenClawSessionNotFound = errors.New("openclaw session not found")

type openClawSessionRecord struct {
	SessionID        string `json:"sessionId"`
	UpdatedAt        int64  `json:"updatedAt"`
	SessionStartedAt int64  `json:"sessionStartedAt"`
	LastInteraction  int64  `json:"lastInteractionAt"`
	Status           string `json:"status"`
	SessionFile      string `json:"sessionFile"`
	ModelProvider    string `json:"modelProvider"`
	Model            string `json:"model"`
	ThinkingLevel    string `json:"thinkingLevel"`
	ArchivedAt       int64  `json:"archivedAt,omitempty"`
	DeletedAt        int64  `json:"deletedAt,omitempty"`
}

type openClawLocalSessionItem struct {
	Key           string `json:"key"`
	Label         string `json:"label,omitempty"`
	CreatedAt     int64  `json:"createdAt,omitempty"`
	UpdatedAt     int64  `json:"updatedAt,omitempty"`
	Status        string `json:"status,omitempty"`
	ModelProvider string `json:"modelProvider,omitempty"`
	Model         string `json:"model,omitempty"`
	ThinkingLevel string `json:"thinkingLevel,omitempty"`
	SessionID     string `json:"sessionId,omitempty"`
	SessionFile   string `json:"sessionFile,omitempty"`
}

func (b *BridgeHandler) openclawLocalSessions(params map[string]interface{}) actionResult {
	agentID := strings.TrimSpace(strParam(params, "agentId"))
	limit := intParam(params, "limit", 50)
	if limit <= 0 || limit > openClawLocalMaxSessionLimit {
		limit = 50
	}
	if agentID != "" {
		if err := ValidateAgentID(agentID); err != nil {
			return errResultStatus(err.Error(), 400)
		}
	}
	cronJobIDs := stringSetParam(params, "cronJobId", "cronJobIds")

	items, err := b.readOpenClawLocalSessions(agentID)
	if err != nil {
		return errResultStatus(err.Error(), 500)
	}
	if len(cronJobIDs) > 0 {
		filtered := make([]openClawLocalSessionItem, 0, len(items))
		for _, item := range items {
			if openClawLocalSessionMatchesCronJobIDs(item.Key, cronJobIDs) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}
	if len(items) > limit {
		items = items[:limit]
	}
	return okResult(map[string]interface{}{
		"sessions": items,
		"source":   "openclaw-local-files",
	})
}

func (b *BridgeHandler) openclawLocalHistory(params map[string]interface{}) actionResult {
	sessionKey := strings.TrimSpace(strParam(params, "sessionKey"))
	if sessionKey == "" {
		return errResultStatus("sessionKey is required", 400)
	}
	agentID, ok := openClawAgentIDFromSessionKey(sessionKey)
	if !ok {
		return errResultStatus("unsupported OpenClaw sessionKey", 400)
	}
	if err := ValidateAgentID(agentID); err != nil {
		return errResultStatus(err.Error(), 400)
	}

	limit := intParam(params, "limit", openClawLocalDefaultSessionLimit)
	if limit <= 0 || limit > openClawLocalMaxSessionLimit {
		limit = openClawLocalDefaultSessionLimit
	}
	maxChars := intParam(params, "maxChars", openClawLocalMaxChars)
	if maxChars <= 0 || maxChars > openClawLocalMaxChars {
		maxChars = openClawLocalMaxChars
	}

	sessionFile, resolvedKey, err := b.resolveOpenClawSessionFile(agentID, sessionKey)
	if err != nil {
		if isOpenClawCronSessionKey(sessionKey) && openClawCronJobIDFromSessionKey(sessionKey) != "" &&
			(errors.Is(err, errOpenClawSessionNotFound) || errors.Is(err, os.ErrNotExist)) {
			return okResult(map[string]interface{}{
				"messages":            []json.RawMessage{},
				"source":              "openclaw-local-files",
				"sessionKey":          sessionKey,
				"requestedSessionKey": sessionKey,
				"truncated":           false,
				"missingSession":      true,
			})
		}
		return errResultStatus(err.Error(), 404)
	}
	messages, truncated, err := readOpenClawJSONLMessages(sessionFile, limit, maxChars)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return okResult(map[string]interface{}{
				"messages":            []json.RawMessage{},
				"source":              "openclaw-local-files",
				"sessionKey":          resolvedKey,
				"requestedSessionKey": sessionKey,
				"truncated":           false,
				"missingTranscript":   true,
			})
		}
		return errResultStatus(err.Error(), 500)
	}
	return okResult(map[string]interface{}{
		"messages":            messages,
		"source":              "openclaw-local-files",
		"sessionKey":          resolvedKey,
		"requestedSessionKey": sessionKey,
		"truncated":           truncated,
	})
}

func (b *BridgeHandler) openclawLocalArchiveSession(params map[string]interface{}) actionResult {
	sessionKey := strings.TrimSpace(strParam(params, "sessionKey"))
	if sessionKey == "" {
		return errResultStatus("sessionKey is required", 400)
	}
	agentID, ok := openClawAgentIDFromSessionKey(sessionKey)
	if !ok {
		return errResultStatus("unsupported OpenClaw sessionKey", 400)
	}
	if err := ValidateAgentID(agentID); err != nil {
		return errResultStatus(err.Error(), 400)
	}

	mode := strings.ToLower(strings.TrimSpace(strParam(params, "mode")))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(strParam(params, "action")))
	}
	if mode == "" {
		mode = "archive"
	}

	agentSessionsDir := filepath.Join(b.paths.OpenClaw, "agents", agentID, "sessions")
	indexPath := filepath.Join(agentSessionsDir, "sessions.json")
	indexLock := openClawSessionsIndexLock(indexPath)
	indexLock.Lock()
	defer indexLock.Unlock()

	records, err := readOpenClawSessionsIndexRaw(indexPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return errResultStatus("session index not found", 404)
		}
		return errResultStatus(err.Error(), 500)
	}
	record, ok := records[sessionKey]
	if !ok {
		return errResultStatus("session not found", 404)
	}

	now := time.Now().UnixMilli()
	switch mode {
	case "archive", "archived":
		record["status"] = "archived"
		record["archivedAt"] = now
	case "delete", "deleted":
		record["status"] = "deleted"
		record["deletedAt"] = now
	default:
		return errResultStatus("unsupported OpenClaw local session action", 400)
	}

	if err := writeOpenClawSessionsIndexRaw(indexPath, records); err != nil {
		return errResultStatus(err.Error(), 500)
	}
	return okResult(map[string]interface{}{
		"sessionKey": sessionKey,
		"agentId":    agentID,
		"action":     mode,
		"source":     "openclaw-local-files",
	})
}

func (b *BridgeHandler) readOpenClawLocalSessions(agentID string) ([]openClawLocalSessionItem, error) {
	agentsDir := filepath.Join(b.paths.OpenClaw, "agents")
	agentDirs := []string{}
	if agentID != "" {
		agentDirs = append(agentDirs, filepath.Join(agentsDir, agentID))
	} else {
		entries, err := os.ReadDir(agentsDir)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, nil
			}
			return nil, fmt.Errorf("read OpenClaw agents directory: %w", err)
		}
		for _, entry := range entries {
			if entry.IsDir() {
				agentDirs = append(agentDirs, filepath.Join(agentsDir, entry.Name()))
			}
		}
	}

	items := []openClawLocalSessionItem{}
	for _, dir := range agentDirs {
		records, err := readOpenClawSessionsIndex(filepath.Join(dir, "sessions", "sessions.json"))
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, err
		}
		for key, record := range records {
			if agentID != "" && !strings.HasPrefix(key, "agent:"+agentID+":") {
				continue
			}
			if isOpenClawLocalSessionHidden(record) {
				continue
			}
			if !openClawLocalSessionFileExists(filepath.Join(dir, "sessions"), record) {
				continue
			}
			items = append(items, openClawLocalSessionItem{
				Key:           key,
				Label:         key,
				CreatedAt:     firstPositive(record.SessionStartedAt, record.LastInteraction, record.UpdatedAt),
				UpdatedAt:     firstPositive(record.UpdatedAt, record.LastInteraction, record.SessionStartedAt),
				Status:        record.Status,
				ModelProvider: record.ModelProvider,
				Model:         record.Model,
				ThinkingLevel: record.ThinkingLevel,
				SessionID:     record.SessionID,
				SessionFile:   record.SessionFile,
			})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
	return items, nil
}

func (b *BridgeHandler) resolveOpenClawSessionFile(agentID string, requestedKey string) (string, string, error) {
	agentSessionsDir := filepath.Join(b.paths.OpenClaw, "agents", agentID, "sessions")
	records, err := readOpenClawSessionsIndex(filepath.Join(agentSessionsDir, "sessions.json"))
	if err != nil {
		return "", "", fmt.Errorf("read OpenClaw sessions index: %w", err)
	}

	if record, ok := records[requestedKey]; ok {
		if !isOpenClawLocalSessionHidden(record) {
			sessionFile, err := safeOpenClawSessionFile(agentSessionsDir, record.SessionFile, record.SessionID)
			return sessionFile, requestedKey, err
		}
		if !isOpenClawBaseCronSessionKey(requestedKey) {
			return "", "", fmt.Errorf("%w for %s", errOpenClawSessionNotFound, requestedKey)
		}
	}
	if isOpenClawCronSessionKey(requestedKey) {
		cronJobID := openClawCronJobIDFromSessionKey(requestedKey)
		if cronJobID == "" {
			return "", "", fmt.Errorf("%w for %s", errOpenClawSessionNotFound, requestedKey)
		}
		if isOpenClawBaseCronSessionKey(requestedKey) {
			if sessionFile, resolvedKey, err := resolveLatestOpenClawCronSessionFile(agentSessionsDir, agentID, cronJobID, records); err == nil {
				return sessionFile, resolvedKey, nil
			} else if !errors.Is(err, errOpenClawSessionNotFound) {
				return "", "", err
			}
		}
		return "", "", fmt.Errorf("%w for %s", errOpenClawSessionNotFound, requestedKey)
	}

	type candidate struct {
		key    string
		record openClawSessionRecord
	}
	candidates := []candidate{}
	prefix := "agent:" + agentID + ":"
	for key, record := range records {
		if strings.HasPrefix(key, prefix) {
			if isOpenClawLocalSessionHidden(record) {
				continue
			}
			candidates = append(candidates, candidate{key: key, record: record})
		}
	}
	if len(candidates) == 0 {
		return "", "", fmt.Errorf("session not found for %s", requestedKey)
	}
	sort.Slice(candidates, func(i, j int) bool {
		return firstPositive(candidates[i].record.UpdatedAt, candidates[i].record.LastInteraction, candidates[i].record.SessionStartedAt) >
			firstPositive(candidates[j].record.UpdatedAt, candidates[j].record.LastInteraction, candidates[j].record.SessionStartedAt)
	})
	for _, candidate := range candidates {
		if openClawLocalSessionFileExists(agentSessionsDir, candidate.record) {
			sessionFile, err := safeOpenClawSessionFile(agentSessionsDir, candidate.record.SessionFile, candidate.record.SessionID)
			return sessionFile, candidate.key, err
		}
	}
	return "", "", errOpenClawSessionNotFound
}

func resolveLatestOpenClawCronSessionFile(agentSessionsDir, agentID, cronJobID string, records map[string]openClawSessionRecord) (string, string, error) {
	type candidate struct {
		key    string
		record openClawSessionRecord
	}
	candidates := []candidate{}
	cronJobIDs := map[string]struct{}{cronJobID: {}}
	prefix := "agent:" + agentID + ":cron:"
	for key, record := range records {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		if isOpenClawLocalSessionHidden(record) {
			continue
		}
		if !openClawLocalSessionMatchesCronJobIDs(key, cronJobIDs) {
			continue
		}
		candidates = append(candidates, candidate{key: key, record: record})
	}
	if len(candidates) == 0 {
		return "", "", errOpenClawSessionNotFound
	}
	sort.Slice(candidates, func(i, j int) bool {
		return firstPositive(candidates[i].record.UpdatedAt, candidates[i].record.LastInteraction, candidates[i].record.SessionStartedAt) >
			firstPositive(candidates[j].record.UpdatedAt, candidates[j].record.LastInteraction, candidates[j].record.SessionStartedAt)
	})
	for _, candidate := range candidates {
		if openClawLocalSessionFileExists(agentSessionsDir, candidate.record) {
			sessionFile, err := safeOpenClawSessionFile(agentSessionsDir, candidate.record.SessionFile, candidate.record.SessionID)
			return sessionFile, candidate.key, err
		}
	}
	return "", "", errOpenClawSessionNotFound
}

func readOpenClawSessionsIndex(path string) (map[string]openClawSessionRecord, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var records map[string]openClawSessionRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, fmt.Errorf("parse OpenClaw sessions index: %w", err)
	}
	return records, nil
}

func readOpenClawSessionsIndexRaw(path string) (map[string]map[string]interface{}, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var records map[string]map[string]interface{}
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, fmt.Errorf("parse OpenClaw sessions index: %w", err)
	}
	return records, nil
}

func writeOpenClawSessionsIndexRaw(path string, records map[string]map[string]interface{}) error {
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return fmt.Errorf("encode OpenClaw sessions index: %w", err)
	}
	data = append(data, '\n')

	tmpFile, err := os.CreateTemp(filepath.Dir(path), ".sessions.json.*.tmp")
	if err != nil {
		return fmt.Errorf("create OpenClaw sessions index temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("write OpenClaw sessions index temp file: %w", err)
	}
	if err := tmpFile.Chmod(0o644); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("chmod OpenClaw sessions index temp file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("close OpenClaw sessions index temp file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("replace OpenClaw sessions index: %w", err)
	}
	cleanup = false
	return nil
}

func isOpenClawLocalSessionHidden(record openClawSessionRecord) bool {
	status := strings.ToLower(strings.TrimSpace(record.Status))
	return status == "archived" || status == "deleted" || record.ArchivedAt > 0 || record.DeletedAt > 0
}

func openClawLocalSessionFileExists(agentSessionsDir string, record openClawSessionRecord) bool {
	sessionFile, err := safeOpenClawSessionFile(agentSessionsDir, record.SessionFile, record.SessionID)
	if err != nil {
		return false
	}
	info, err := os.Stat(sessionFile)
	return err == nil && !info.IsDir()
}

func openClawSessionsIndexLock(path string) *sync.Mutex {
	lock, _ := openClawSessionsIndexLocks.LoadOrStore(path, &sync.Mutex{})
	return lock.(*sync.Mutex)
}

func safeOpenClawSessionFile(agentSessionsDir, sessionFile, sessionID string) (string, error) {
	if strings.TrimSpace(sessionFile) == "" && strings.TrimSpace(sessionID) != "" {
		sessionFile = filepath.Join(agentSessionsDir, sessionID+".jsonl")
	}
	if strings.TrimSpace(sessionFile) == "" {
		return "", fmt.Errorf("session file is missing")
	}
	if !filepath.IsAbs(sessionFile) {
		sessionFile = filepath.Join(agentSessionsDir, sessionFile)
	}

	cleanBase, err := filepath.Abs(agentSessionsDir)
	if err != nil {
		return "", err
	}
	cleanFile, err := filepath.Abs(sessionFile)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(cleanBase, cleanFile)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", fmt.Errorf("session file escapes OpenClaw sessions directory")
	}
	return cleanFile, nil
}

func readOpenClawJSONLMessages(path string, limit int, maxChars int) ([]json.RawMessage, bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, false, fmt.Errorf("open OpenClaw session file: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	ring := make([]json.RawMessage, limit)
	head := 0
	count := 0
	truncated := false
	totalChars := 0

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if !json.Valid([]byte(line)) {
			continue
		}
		raw := json.RawMessage(append([]byte(nil), line...))
		if count < limit {
			ring[(head+count)%limit] = raw
			count++
		} else {
			totalChars -= len(ring[head])
			ring[head] = raw
			head = (head + 1) % limit
			truncated = true
		}
		totalChars += len(line)
		for totalChars > maxChars && count > 1 {
			totalChars -= len(ring[head])
			ring[head] = nil
			head = (head + 1) % limit
			count--
			truncated = true
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, truncated, fmt.Errorf("scan OpenClaw session file: %w", err)
	}
	messages := make([]json.RawMessage, count)
	for i := 0; i < count; i++ {
		messages[i] = ring[(head+i)%limit]
	}
	return messages, truncated, nil
}

func openClawAgentIDFromSessionKey(sessionKey string) (string, bool) {
	parts := strings.Split(sessionKey, ":")
	if len(parts) < 2 || parts[0] != "agent" {
		return "", false
	}
	agentID := strings.TrimSpace(parts[1])
	return agentID, agentID != ""
}

func isOpenClawCronSessionKey(sessionKey string) bool {
	parts := strings.Split(sessionKey, ":")
	return len(parts) >= 3 && parts[0] == "agent" && parts[2] == "cron"
}

func openClawCronJobIDFromSessionKey(sessionKey string) string {
	parts := strings.Split(sessionKey, ":")
	if len(parts) < 4 || parts[0] != "agent" || parts[2] != "cron" {
		return ""
	}
	return strings.TrimSpace(parts[3])
}

func isOpenClawBaseCronSessionKey(sessionKey string) bool {
	parts := strings.Split(sessionKey, ":")
	return len(parts) == 4 && parts[0] == "agent" && parts[2] == "cron" && strings.TrimSpace(parts[3]) != ""
}

func openClawLocalSessionMatchesCronJobIDs(sessionKey string, cronJobIDs map[string]struct{}) bool {
	if len(cronJobIDs) == 0 {
		return true
	}
	parts := strings.Split(sessionKey, ":")
	if len(parts) < 4 || parts[0] != "agent" || parts[2] != "cron" {
		return false
	}
	_, ok := cronJobIDs[strings.TrimSpace(parts[3])]
	return ok
}

func stringSetParam(params map[string]interface{}, singularKey string, pluralKey string) map[string]struct{} {
	out := map[string]struct{}{}
	add := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			out[trimmed] = struct{}{}
		}
	}

	switch v := params[singularKey].(type) {
	case string:
		add(v)
	case []string:
		for _, item := range v {
			add(item)
		}
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				add(s)
			}
		}
	}
	switch v := params[pluralKey].(type) {
	case string:
		add(v)
	case []string:
		for _, item := range v {
			add(item)
		}
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				add(s)
			}
		}
	}
	return out
}

func intParam(params map[string]interface{}, key string, fallback int) int {
	switch v := params[key].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return parsed
		}
	}
	return fallback
}

func firstPositive(values ...int64) int64 {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}
