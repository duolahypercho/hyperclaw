package bridge

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

const maxRunsPerJob = 200

var (
	uuidRegex = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

	cronSessionKeyAgentRegex  = regexp.MustCompile(`(?i)^agent:([^:]+)`)
	cronAgentInferenceRegexes = []*regexp.Regexp{
		regexp.MustCompile(`\bfor\s+(?:the\s+)?([a-z0-9_-]+)\s+agent\b`),
		regexp.MustCompile(`\b([a-z0-9_-]+)\s+browser profile\b`),
		regexp.MustCompile(`\bbrowser profile\s+([a-z0-9_-]+)\b`),
		regexp.MustCompile(`--browser-profile\s+([a-z0-9_-]+)\b`),
	}
)

// ── Cron data types ─────────────────────────────────────────────────────────

type cronJobFile struct {
	ID       string                 `json:"id"`
	AgentID  string                 `json:"agentId,omitempty"`
	Name     string                 `json:"name"`
	Enabled  *bool                  `json:"enabled,omitempty"`
	Schedule map[string]interface{} `json:"schedule,omitempty"`
	State    map[string]interface{} `json:"state,omitempty"`
}

type parsedCronJob struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Schedule    string `json:"schedule"`
	AgentID     string `json:"agentId,omitempty"`
	Status      string `json:"status,omitempty"`
	NextRun     *int64 `json:"nextRun,omitempty"`
	LastRunAtMs *int64 `json:"lastRunAtMs,omitempty"`
	LastStatus  string `json:"lastStatus,omitempty"`
	RawJSON     string `json:"rawJson,omitempty"`
}

type cronRunLine struct {
	Ts          *float64 `json:"ts,omitempty"`
	JobID       string   `json:"jobId,omitempty"`
	Action      string   `json:"action,omitempty"`
	Status      string   `json:"status,omitempty"`
	RunAtMs     *float64 `json:"runAtMs,omitempty"`
	DurationMs  *float64 `json:"durationMs,omitempty"`
	NextRunAtMs *float64 `json:"nextRunAtMs,omitempty"`
	Summary     string   `json:"summary,omitempty"`
	Error       string   `json:"error,omitempty"`
	SessionID   string   `json:"sessionId,omitempty"`
}

// ── Helpers ─────────────────────────────────────────────────────────────────

func formatEverySchedule(everyMs float64) string {
	ms := int64(everyMs)
	const day = 24 * 60 * 60 * 1000
	const hour = 60 * 60 * 1000
	const minute = 60 * 1000
	if ms%day == 0 {
		return fmt.Sprintf("%dd", ms/day)
	}
	if ms%hour == 0 {
		return fmt.Sprintf("%dh", ms/hour)
	}
	if ms%minute == 0 {
		return fmt.Sprintf("%dm", ms/minute)
	}
	return fmt.Sprintf("%dm", ms/minute)
}

func readCronJobsFile(p Paths) ([]map[string]interface{}, error) {
	data, err := os.ReadFile(p.CronJobsPath())
	if err != nil {
		return nil, err
	}
	var file struct {
		Jobs []map[string]interface{} `json:"jobs"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}
	return file.Jobs, nil
}

func normalizeCronAgentID(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func cronJobStringField(job map[string]interface{}, key string) string {
	value, _ := job[key].(string)
	return strings.TrimSpace(value)
}

func cronJobNestedStringField(job map[string]interface{}, parentKey, key string) string {
	parent, _ := job[parentKey].(map[string]interface{})
	if parent == nil {
		return ""
	}
	value, _ := parent[key].(string)
	return strings.TrimSpace(value)
}

func inferCronJobAgentID(job map[string]interface{}) string {
	if agentID := normalizeCronAgentID(cronJobStringField(job, "agentId")); agentID != "" {
		return agentID
	}
	if agentID := normalizeCronAgentID(cronJobNestedStringField(job, "payload", "agentId")); agentID != "" {
		return agentID
	}
	sessionKey := cronJobStringField(job, "sessionKey")
	if sessionKey == "" {
		sessionKey = cronJobNestedStringField(job, "payload", "sessionKey")
	}
	if match := cronSessionKeyAgentRegex.FindStringSubmatch(sessionKey); len(match) == 2 {
		return normalizeCronAgentID(match[1])
	}

	text := strings.ToLower(strings.Join([]string{
		cronJobStringField(job, "name"),
		cronJobStringField(job, "description"),
		sessionKey,
		cronJobNestedStringField(job, "payload", "message"),
		cronJobNestedStringField(job, "payload", "systemEvent"),
		cronJobNestedStringField(job, "payload", "text"),
	}, "\n"))
	for _, pattern := range cronAgentInferenceRegexes {
		if match := pattern.FindStringSubmatch(text); len(match) == 2 {
			return normalizeCronAgentID(match[1])
		}
	}
	return ""
}

func cronJobMatchesAgent(job map[string]interface{}, agentID string) bool {
	target := normalizeCronAgentID(agentID)
	if target == "" {
		return true
	}
	inferred := inferCronJobAgentID(job)
	if inferred != "" {
		return inferred == target
	}
	return target == "main"
}

func storeCronJobMatchesAgent(job store.CronJob, agentID string) bool {
	target := normalizeCronAgentID(agentID)
	if target == "" {
		return true
	}
	if normalizeCronAgentID(job.AgentID) == target {
		return true
	}
	if strings.TrimSpace(job.RawJSON) == "" {
		return target == "main" && strings.TrimSpace(job.AgentID) == ""
	}
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(job.RawJSON), &raw); err != nil {
		return false
	}
	return cronJobMatchesAgent(raw, target)
}

// getCronsFromJSON reads crons from jobs.json and enriches with last run data.
func getCronsFromJSON(p Paths) []parsedCronJob {
	return getCronsFromJSONFiltered(p, "", "")
}

// getCronsFromJSONFiltered reads crons from jobs.json and optionally filters by
// job ID and agent ID. An empty filter returns all OpenClaw jobs.
func getCronsFromJSONFiltered(p Paths, agentID, jobID string) []parsedCronJob {
	jobs, err := readCronJobsFile(p)
	if err != nil {
		return []parsedCronJob{}
	}

	jobID = strings.TrimSpace(jobID)
	result := make([]parsedCronJob, 0, len(jobs))
	for _, job := range jobs {
		id, _ := job["id"].(string)
		if jobID != "" && id != jobID {
			continue
		}
		if !cronJobMatchesAgent(job, agentID) {
			continue
		}
		name, _ := job["name"].(string)
		jobAgentID, _ := job["agentId"].(string)
		if name == "" {
			name = id
		}

		// Parse schedule
		var scheduleStr string
		if sched, ok := job["schedule"].(map[string]interface{}); ok {
			kind, _ := sched["kind"].(string)
			if kind == "cron" {
				if expr, ok := sched["expr"].(string); ok {
					scheduleStr = expr
				}
			} else if kind == "every" {
				if everyMs, ok := sched["everyMs"].(float64); ok {
					scheduleStr = formatEverySchedule(everyMs)
				}
			}
		}

		// Status
		enabled := true
		if e, ok := job["enabled"].(bool); ok {
			enabled = e
		}
		status := "active"
		if !enabled {
			status = "disabled"
		}

		// State
		var nextRun *int64
		var lastRunAtMs *int64
		var lastStatus string
		if state, ok := job["state"].(map[string]interface{}); ok {
			if nr, ok := state["nextRunAtMs"].(float64); ok {
				v := int64(nr)
				nextRun = &v
			}
			if lr, ok := state["lastRunAtMs"].(float64); ok {
				v := int64(lr)
				lastRunAtMs = &v
			}
			lastStatus, _ = state["lastStatus"].(string)
		}

		// Fall back to the latest run file because OpenClaw jobs.json may keep state empty.
		if id != "" && (lastRunAtMs == nil || nextRun == nil || !hasFutureMillis(*nextRun) || strings.TrimSpace(lastStatus) == "") {
			runs := readRunsForJob(p, id)
			if len(runs) > 0 {
				latest := runs[len(runs)-1]
				if lastRunAtMs == nil {
					if ram, ok := numericMillis(latest["runAtMs"]); ok {
						lastRunAtMs = &ram
					}
				}
				if nextRun == nil || !hasFutureMillis(*nextRun) {
					if nrm, ok := numericMillis(latest["nextRunAtMs"]); ok && nrm > nowMillis() {
						nextRun = &nrm
					}
				}
				if strings.TrimSpace(lastStatus) == "" {
					if s, ok := latest["status"].(string); ok && s != "" {
						lastStatus = strings.ToLower(s)
					}
				}
			}
		}

		if nextRun == nil || !hasFutureMillis(*nextRun) {
			if nextRunAtMs, ok := computeNextOpenClawRunAtMs(job); ok {
				nextRun = &nextRunAtMs
			}
		}

		rawJSON, _ := json.Marshal(job)
		result = append(result, parsedCronJob{
			ID:          id,
			Name:        name,
			Schedule:    scheduleStr,
			AgentID:     jobAgentID,
			Status:      status,
			NextRun:     nextRun,
			LastRunAtMs: lastRunAtMs,
			LastStatus:  lastStatus,
			RawJSON:     string(rawJSON),
		})
	}

	return result
}

// ── get-cron-by-id ──────────────────────────────────────────────────────────

func (b *BridgeHandler) getCronByID(params map[string]interface{}) actionResult {
	jobID, _ := params["jobId"].(string)
	jobID = strings.TrimSpace(jobID)
	if jobID == "" || !uuidRegex.MatchString(jobID) {
		return errResultStatus("Job not found", 404)
	}
	agentID, _ := params["agentId"].(string)
	agentID = strings.TrimSpace(agentID)
	if agentID != "" {
		if err := ValidateAgentID(agentID); err != nil {
			return errResultStatus(err.Error(), 400)
		}
	}

	if b.store != nil {
		if job, err := b.store.GetCronJobByID(jobID); err == nil && job != nil {
			if !storeCronJobMatchesAgent(*job, agentID) {
				return errResultStatus("Job not found", 404)
			}
			return okResult(job)
		}
	}

	jobs, err := readCronJobsFile(b.paths)
	if err != nil {
		return errResultStatus("Job not found", 404)
	}

	for _, job := range jobs {
		if id, _ := job["id"].(string); id == jobID {
			if !cronJobMatchesAgent(job, agentID) {
				return errResultStatus("Job not found", 404)
			}
			return okResult(job)
		}
	}
	return errResultStatus("Job not found", 404)
}

// ── get-cron-runs ───────────────────────────────────────────────────────────

func readRunsForJob(p Paths, jobID string) []map[string]interface{} {
	if strings.Contains(jobID, "..") || strings.ContainsAny(jobID, `/\`) || len(jobID) > 64 {
		return nil
	}
	filePath := filepath.Join(p.CronRunsDir(), jobID+".jsonl")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	runs := make([]map[string]interface{}, 0, maxRunsPerJob)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}
		if _, ok := obj["runAtMs"]; ok {
			runs = append(runs, obj)
		}
	}
	// Tail to maxRunsPerJob
	if len(runs) > maxRunsPerJob {
		runs = runs[len(runs)-maxRunsPerJob:]
	}
	return runs
}

// cronRunToRecord converts a store.CronRun to the map format the dashboard expects.
func cronRunToRecord(r store.CronRun) map[string]interface{} {
	rec := map[string]interface{}{
		"runAtMs": r.StartedAtMs,
		"status":  normalizeCronRunStatus(r.Status),
	}
	if r.DurationMs != nil {
		rec["durationMs"] = *r.DurationMs
	}
	if r.Summary != nil {
		rec["summary"] = *r.Summary
	}
	if r.ErrorMsg != nil {
		rec["error"] = *r.ErrorMsg
	}
	if r.RunID != "" {
		rec["sessionId"] = r.RunID
	}
	return rec
}

func cronRunToDetail(r store.CronRun) map[string]interface{} {
	rec := cronRunToRecord(r)
	if r.ID != "" {
		rec["id"] = r.ID
	}
	if r.CronID != "" {
		rec["jobId"] = r.CronID
	}
	if r.Runtime != "" {
		rec["runtime"] = r.Runtime
	}
	if r.FinishedAtMs != nil {
		rec["finishedAtMs"] = *r.FinishedAtMs
	}
	if r.TriggerSource != "" {
		rec["triggerSource"] = r.TriggerSource
	}
	if r.FullLog != nil {
		rec["log"] = *r.FullLog
		rec["output"] = *r.FullLog
	}
	return rec
}

func normalizeCronRunStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "ok", "success", "completed", "done":
		return "ok"
	case "error", "failed", "aborted":
		return "error"
	case "running", "in_progress":
		return "running"
	default:
		if status == "" {
			return "error"
		}
		return status
	}
}

func cronRunRecordMillis(record map[string]interface{}) (string, bool) {
	if millis, ok := numericMillis(record["runAtMs"]); ok {
		return fmt.Sprintf("%d", millis), true
	}
	return "", false
}

func cronRunRecordSessionID(record map[string]interface{}) string {
	if sessionID, ok := record["sessionId"].(string); ok {
		return strings.TrimSpace(sessionID)
	}
	return ""
}

func cronRunRecordComparableSignature(record map[string]interface{}) (string, bool) {
	runAt, ok := cronRunRecordMillis(record)
	if !ok {
		return "", false
	}
	status, _ := record["status"].(string)
	message, _ := record["summary"].(string)
	if strings.TrimSpace(message) == "" {
		message, _ = record["error"].(string)
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return "", false
	}
	return runAt + ":" + strings.ToLower(strings.TrimSpace(status)) + ":" + message, true
}

func sortCronRunRecords(records []map[string]interface{}) {
	sort.SliceStable(records, func(i, j int) bool {
		left, _ := records[i]["runAtMs"].(int64)
		if left == 0 {
			leftFloat, _ := records[i]["runAtMs"].(float64)
			left = int64(leftFloat)
		}
		right, _ := records[j]["runAtMs"].(int64)
		if right == 0 {
			rightFloat, _ := records[j]["runAtMs"].(float64)
			right = int64(rightFloat)
		}
		return left > right
	})
}

func appendCronRunRecords(base []map[string]interface{}, extra []map[string]interface{}) []map[string]interface{} {
	seen := make(map[string]bool, len(base)+len(extra))
	baseComparable := make(map[string]bool, len(base))
	out := make([]map[string]interface{}, 0, len(base)+len(extra))
	add := func(record map[string]interface{}) {
		runAt, hasRunAt := cronRunRecordMillis(record)
		if !hasRunAt {
			runAt = fmt.Sprint(record["runAtMs"])
		}
		sessionID := cronRunRecordSessionID(record)
		key := runAt + ":" + sessionID
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, record)
	}
	for _, record := range base {
		if signature, ok := cronRunRecordComparableSignature(record); ok {
			baseComparable[signature] = true
		}
		add(record)
	}
	for _, record := range extra {
		if signature, ok := cronRunRecordComparableSignature(record); ok && baseComparable[signature] {
			continue
		}
		add(record)
	}
	sortCronRunRecords(out)
	return out
}

func (b *BridgeHandler) getCronRuns(params map[string]interface{}) actionResult {
	var jobIDs []string
	if ids, ok := params["jobIds"].([]interface{}); ok {
		for _, id := range ids {
			if s, ok := id.(string); ok {
				jobIDs = append(jobIDs, s)
			}
		}
	}
	// If no jobIds provided, use all crons
	if len(jobIDs) == 0 {
		crons := getCronsFromJSON(b.paths)
		for _, c := range crons {
			jobIDs = append(jobIDs, c.ID)
		}
	}

	runsByJobID := make(map[string]interface{})

	// Try SQLite first
	if b.store != nil {
		sqliteRuns, err := b.store.GetCronRunsForJobs(jobIDs, 100)
		if err != nil {
			log.Printf("[get-cron-runs] SQLite query error: %v", err)
		} else {
			// Track which job IDs have SQLite data vs which need JSONL fallback
			coveredBySQL := make(map[string]bool)
			for _, id := range jobIDs {
				runs, ok := sqliteRuns[id]
				if !ok || len(runs) == 0 {
					continue
				}
				coveredBySQL[id] = true
				records := make([]map[string]interface{}, 0, len(runs))
				for _, r := range runs {
					records = append(records, cronRunToRecord(r))
				}
				jsonlRuns := readRunsForJob(b.paths, id)
				merged := appendCronRunRecords(records, jsonlRuns)
				if len(merged) > 100 {
					merged = merged[:100]
				}
				runsByJobID[id] = merged
			}

			// Fall back to JSONL for job IDs not covered by SQLite
			for _, id := range jobIDs {
				if coveredBySQL[id] {
					continue
				}
				runs := readRunsForJob(b.paths, id)
				if len(runs) > 0 {
					runsByJobID[id] = runs
				}
			}
			return okResult(map[string]interface{}{"runsByJobId": runsByJobID})
		}
	}

	// No store — fall back to JSONL entirely
	for _, id := range jobIDs {
		runs := readRunsForJob(b.paths, id)
		if len(runs) > 0 {
			runsByJobID[id] = runs
		}
	}
	return okResult(map[string]interface{}{"runsByJobId": runsByJobID})
}

// ── get-cron-runs-for-job ───────────────────────────────────────────────────

func (b *BridgeHandler) getCronRunsForJob(params map[string]interface{}) actionResult {
	jobID, _ := params["jobId"].(string)
	if jobID == "" || strings.Contains(jobID, "..") || strings.ContainsAny(jobID, `/\`) || len(jobID) > 64 {
		return okResult(map[string]interface{}{"runs": []interface{}{}, "hasMore": false})
	}

	limit := 10
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
		if limit > 100 {
			limit = 100
		}
	}
	offset := 0
	if o, ok := params["offset"].(float64); ok && o >= 0 {
		offset = int(o)
	}

	// Try SQLite first
	sqliteRecords := make([]map[string]interface{}, 0)
	if b.store != nil {
		sqliteLimit := offset + limit
		if sqliteLimit < maxRunsPerJob {
			sqliteLimit = maxRunsPerJob
		}
		runs, _, err := b.store.GetCronRuns(jobID, sqliteLimit, 0)
		if err != nil {
			log.Printf("[get-cron-runs-for-job] SQLite query error for %s: %v", jobID, err)
		} else if len(runs) > 0 {
			for _, r := range runs {
				sqliteRecords = append(sqliteRecords, cronRunToRecord(r))
			}
		}
		// total == 0 means no SQLite rows — fall through to JSONL
	}

	// JSONL fallback
	filePath := filepath.Join(b.paths.CronRunsDir(), jobID+".jsonl")
	jsonlRecords := make([]map[string]interface{}, 0)
	data, err := os.ReadFile(filePath)
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(data)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var obj map[string]interface{}
			if err := json.Unmarshal([]byte(line), &obj); err != nil {
				continue
			}
			if _, ok := obj["runAtMs"]; ok {
				jsonlRecords = append(jsonlRecords, obj)
			}
		}
	}

	all := appendCronRunRecords(sqliteRecords, jsonlRecords)
	jsonlTotal := len(all)
	end := offset + limit
	if end > jsonlTotal {
		end = jsonlTotal
	}
	start := offset
	if start > jsonlTotal {
		start = jsonlTotal
	}

	page := all[start:end]
	hasMore := end < jsonlTotal

	return okResult(map[string]interface{}{"runs": page, "hasMore": hasMore})
}

// ── get-cron-run-detail ─────────────────────────────────────────────────────

func (b *BridgeHandler) getCronRunDetail(params map[string]interface{}) actionResult {
	jobID, _ := params["jobId"].(string)
	if jobID == "" || strings.Contains(jobID, "..") || strings.ContainsAny(jobID, `/\`) || len(jobID) > 64 {
		return errResultStatus("Run not found", 404)
	}
	runAtMs, ok := params["runAtMs"].(float64)
	if !ok {
		return errResultStatus("Run not found", 404)
	}
	runAtMsInt := int64(runAtMs)
	sessionID, _ := params["sessionId"].(string)

	if b.store != nil {
		var run *store.CronRun
		var err error
		if strings.TrimSpace(sessionID) != "" {
			run, err = b.store.GetCronRunByStartedAtAndRunID(jobID, runAtMsInt, strings.TrimSpace(sessionID))
		} else {
			run, err = b.store.GetCronRunByStartedAt(jobID, runAtMsInt)
		}
		if err == nil && run != nil {
			return okResult(cronRunToDetail(*run))
		}
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			log.Printf("[get-cron-run-detail] SQLite query error for %s/%d: %v", jobID, runAtMsInt, err)
		}
	}

	filePath := filepath.Join(b.paths.CronRunsDir(), jobID+".jsonl")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return errResultStatus("Run not found", 404)
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if strings.TrimSpace(sessionID) != "" {
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var obj map[string]interface{}
			if err := json.Unmarshal([]byte(line), &obj); err != nil {
				continue
			}
			if ram, ok := obj["runAtMs"].(float64); !ok || ram != runAtMs {
				continue
			}
			if sid, ok := obj["sessionId"].(string); ok && sid == strings.TrimSpace(sessionID) {
				return okResult(obj)
			}
		}
		return errResultStatus("Run not found", 404)
	}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}
		if ram, ok := obj["runAtMs"].(float64); ok && ram == runAtMs {
			return okResult(obj)
		}
	}

	return errResultStatus("Run not found", 404)
}

// ── get-cron-announces ─────────────────────────────────────────────────────

func (b *BridgeHandler) getCronAnnounces(params map[string]interface{}) actionResult {
	if b.store == nil {
		return okResult(map[string]interface{}{"announces": []interface{}{}})
	}

	var cronIDs []string
	if ids, ok := params["cronIds"].([]interface{}); ok {
		for _, id := range ids {
			if s, ok := id.(string); ok && s != "" {
				cronIDs = append(cronIDs, s)
			}
		}
	}

	limit := 100
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	rows, err := b.store.GetCronAnnounces(cronIDs, limit)
	if err != nil {
		return errResult("Failed to query cron announces: " + err.Error())
	}
	if rows == nil {
		rows = make([]store.CronAnnounceRow, 0)
	}

	return okResult(map[string]interface{}{"announces": rows})
}

// ── delete-cron-announces ──────────────────────────────────────────────────

func (b *BridgeHandler) deleteCronAnnounces(params map[string]interface{}) actionResult {
	if b.store == nil {
		return okResult(map[string]interface{}{"deleted": 0})
	}

	var cronIDs []string
	if ids, ok := params["cronIds"].([]interface{}); ok {
		for _, id := range ids {
			if s, ok := id.(string); ok && s != "" {
				cronIDs = append(cronIDs, s)
			}
		}
	}

	deleted, err := b.store.DeleteCronAnnounces(cronIDs)
	if err != nil {
		return errResult("Failed to delete cron announces: " + err.Error())
	}

	return okResult(map[string]interface{}{"deleted": deleted})
}
