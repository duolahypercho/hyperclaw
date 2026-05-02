package bridge

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

const maxRunsPerJob = 200

var uuidRegex = regexp.MustCompile(`^[a-f0-9-]{36}$`)

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

// getCronsFromJSON reads crons from jobs.json and enriches with last run data.
func getCronsFromJSON(p Paths) []parsedCronJob {
	jobs, err := readCronJobsFile(p)
	if err != nil {
		return []parsedCronJob{}
	}

	result := make([]parsedCronJob, 0, len(jobs))
	for _, job := range jobs {
		id, _ := job["id"].(string)
		name, _ := job["name"].(string)
		agentID, _ := job["agentId"].(string)
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

		result = append(result, parsedCronJob{
			ID:          id,
			Name:        name,
			Schedule:    scheduleStr,
			AgentID:     agentID,
			Status:      status,
			NextRun:     nextRun,
			LastRunAtMs: lastRunAtMs,
			LastStatus:  lastStatus,
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

	if b.store != nil {
		if job, err := b.store.GetCronJobByID(jobID); err == nil && job != nil {
			return okResult(job)
		}
	}

	jobs, err := readCronJobsFile(b.paths)
	if err != nil {
		return errResultStatus("Job not found", 404)
	}

	for _, job := range jobs {
		if id, _ := job["id"].(string); id == jobID {
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
		"status":  r.Status,
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
				runsByJobID[id] = records
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
	if b.store != nil {
		runs, total, err := b.store.GetCronRuns(jobID, limit, offset)
		if err != nil {
			log.Printf("[get-cron-runs-for-job] SQLite query error for %s: %v", jobID, err)
		} else if total > 0 {
			records := make([]map[string]interface{}, 0, len(runs))
			for _, r := range runs {
				records = append(records, cronRunToRecord(r))
			}
			hasMore := (offset + len(records)) < total
			return okResult(map[string]interface{}{"runs": records, "hasMore": hasMore})
		}
		// total == 0 means no SQLite rows — fall through to JSONL
	}

	// JSONL fallback
	filePath := filepath.Join(b.paths.CronRunsDir(), jobID+".jsonl")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return okResult(map[string]interface{}{"runs": []interface{}{}, "hasMore": false})
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	all := make([]map[string]interface{}, 0, 64)
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
			all = append(all, obj)
		}
	}

	// Reverse for newest first
	for i, j := 0, len(all)-1; i < j; i, j = i+1, j-1 {
		all[i], all[j] = all[j], all[i]
	}

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

	filePath := filepath.Join(b.paths.CronRunsDir(), jobID+".jsonl")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return errResultStatus("Run not found", 404)
	}

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
