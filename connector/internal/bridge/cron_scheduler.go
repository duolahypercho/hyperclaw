package bridge

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// CronScheduler polls SQLite every 30 seconds and dispatches due cron jobs for all
// runtimes, including OpenClaw. A dedup guard checks cron_announces before dispatching
// an OpenClaw job to avoid double-execution when the OpenClaw gateway daemon is already
// handling it.
type CronScheduler struct {
	bridge    *BridgeHandler
	quit      chan struct{}
	workerSem chan struct{}
	wg        sync.WaitGroup
}

// NewCronScheduler returns a scheduler tied to the given bridge handler.
func NewCronScheduler(b *BridgeHandler) *CronScheduler {
	return &CronScheduler{bridge: b, quit: make(chan struct{}), workerSem: make(chan struct{}, 10)}
}

// Start launches the background polling loop.
func (s *CronScheduler) Start() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		s.tick() // check immediately on start
		for {
			select {
			case <-ticker.C:
				s.tick()
			case <-s.quit:
				return
			}
		}
	}()
}

// Stop shuts down the polling loop and waits for in-progress jobs.
func (s *CronScheduler) Stop() {
	select {
	case <-s.quit:
	default:
		close(s.quit)
	}
	s.wg.Wait()
}

func (s *CronScheduler) tick() {
	if s.bridge.store == nil {
		return
	}
	jobs, err := s.bridge.store.GetCronJobs("")
	if err != nil {
		log.Printf("CronScheduler: failed to load jobs: %v", err)
		return
	}
	now := time.Now()
	for _, job := range jobs {
		if !job.Enabled {
			continue
		}
		var rawObj map[string]interface{}
		if err := json.Unmarshal([]byte(job.RawJSON), &rawObj); err != nil {
			continue
		}
		if !cronJobIsDue(rawObj, now) {
			continue
		}
		jobCopy := job
		rawCopy := rawObj
		select {
		case s.workerSem <- struct{}{}:
			s.wg.Add(1)
			go func() {
				defer s.wg.Done()
				defer func() { <-s.workerSem }()
				s.runJob(jobCopy, rawCopy, "scheduler")
			}()
		default:
			log.Printf("[cron] worker pool full (%d slots), skipping job %s", cap(s.workerSem), jobCopy.ID)
		}
	}
}

func cronJobIsDue(rawObj map[string]interface{}, now time.Time) bool {
	state, _ := rawObj["state"].(map[string]interface{})
	if state == nil {
		return false
	}
	nextRunAtMs, _ := state["nextRunAtMs"].(float64)
	return nextRunAtMs > 0 && int64(nextRunAtMs) <= now.UnixMilli()
}

func (s *CronScheduler) runJob(job store.CronJob, rawObj map[string]interface{}, triggerSource string) {
	payload, _ := rawObj["payload"].(map[string]interface{})
	if payload == nil {
		payload = make(map[string]interface{})
	}

	runID := newCronRunID()
	runAtMs := time.Now().UnixMilli()

	if s.bridge.store != nil {
		s.bridge.store.InsertCronAnnounce(job.ID, job.AgentID, "", "running", job.Runtime, "scheduler", "Running…", "", runID)
	}

	if job.Runtime == "openclaw" && s.isOpenClawJobAlreadyRunning(job.ID) {
		log.Printf("[cron-scheduler] skipping %s — already running via OpenClaw gateway", job.ID)
		return
	}

	var action string
	params := map[string]interface{}{}

	switch job.Runtime {
	case "openclaw":
		// OpenClaw: use openclaw-cron-execute action which runs via CLI
		action = "openclaw-cron-execute"
		params["message"] = payload["message"]
		params["systemEvent"] = payload["systemEvent"]
		if v, ok := payload["agentId"].(string); ok && v != "" {
			params["agentId"] = v
		}
		if v, ok := payload["session"].(string); ok && v != "" {
			params["session"] = v
		}
		if v, ok := payload["model"].(string); ok && v != "" {
			params["model"] = v
		}
		if v, ok := payload["channel"].(string); ok && v != "" {
			params["channel"] = v
		}
	case "claude-code":
		action = "claude-code-send"
		params["message"] = payload["message"]
		if v, ok := payload["agentId"].(string); ok && v != "" {
			params["agentId"] = v
		}
		if v, ok := payload["model"].(string); ok && v != "" {
			params["model"] = v
		}
	case "codex":
		action = "codex-send"
		params["message"] = payload["message"]
		if v, ok := payload["agentId"].(string); ok && v != "" {
			params["agentId"] = v
		}
		if v, ok := payload["model"].(string); ok && v != "" {
			params["model"] = v
		}
	case "hermes":
		action = "hermes-chat"
		params["query"] = payload["message"]
		if v, ok := payload["agentId"].(string); ok && v != "" {
			params["agentId"] = v
		}
	default:
		log.Printf("CronScheduler: unknown runtime %q for job %s", job.Runtime, job.ID)
		return
	}

	if s.bridge.store != nil {
		if err := s.bridge.store.InsertCronRun(job.ID, job.Runtime, runID, triggerSource, runAtMs); err != nil {
			log.Printf("CronScheduler: InsertCronRun %s/%s: %v", job.ID, runID, err)
		}
	}

	result := s.bridge.Dispatch(action, params)
	durationMs := time.Now().UnixMilli() - runAtMs

	eventType := "completed"
	runStatus := "ok"
	jobStatus := "completed"
	summary := extractCronSummary(result)
	errorMsg := ""
	if m, ok := result.(map[string]interface{}); ok {
		if e, _ := m["error"].(string); e != "" {
			eventType = "error"
			runStatus = "error"
			jobStatus = "error"
			summary = e
			errorMsg = e
		}
	}
	fullLog := stringifyCronResult(result)

	if s.bridge.store != nil {
		metadata, _ := json.Marshal(map[string]interface{}{"runAtMs": runAtMs, "durationMs": durationMs})
		s.bridge.store.UpdateRunningCronAnnounce(job.ID, runID, summary, eventType, string(metadata))
		if err := s.bridge.store.FinalizeCronRun(runID, runStatus, summary, fullLog, errorMsg, time.Now().UnixMilli(), durationMs); err != nil {
			log.Printf("CronScheduler: FinalizeCronRun %s/%s: %v", job.ID, runID, err)
		}
	}

	// For one-shot jobs: disable after run
	schedMap, _ := rawObj["schedule"].(map[string]interface{})
	kind, _ := schedMap["kind"].(string)
	if kind == "at" {
		if s.bridge.store != nil {
			// Mark job as disabled in the DB — job served its purpose
			state, _ := rawObj["state"].(map[string]interface{})
			if state == nil {
				state = make(map[string]interface{})
				rawObj["state"] = state
			}
			state["lastRunAtMs"] = runAtMs
			state["lastStatus"] = jobStatus
			state["nextRunAtMs"] = nil
			updated, _ := json.Marshal(rawObj)
			_ = s.bridge.store.UpdateCronJobRawJSON(job.ID, string(updated))
		}
		return
	}

	s.advanceNextRun(job, rawObj, jobStatus)
}

// RunJobManual triggers a non-OpenClaw cron job immediately, bypassing the due-time
// check. It is the external entry point for the cron-run bridge action.
func (s *CronScheduler) RunJobManual(job store.CronJob, rawObj map[string]interface{}) {
	select {
	case s.workerSem <- struct{}{}:
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer func() { <-s.workerSem }()
			s.runJob(job, rawObj, "manual")
		}()
	default:
		log.Printf("[cron-run-manual] worker pool full, skipping manual trigger for job %s", job.ID)
	}
}

// isOpenClawJobAlreadyRunning checks cron_announces for a recent "running" entry
// to avoid double-execution with the OpenClaw gateway daemon.
func (s *CronScheduler) isOpenClawJobAlreadyRunning(jobID string) bool {
	if s.bridge.store == nil {
		return false
	}
	announces, err := s.bridge.store.GetCronAnnounces([]string{jobID}, 1)
	if err != nil || len(announces) == 0 {
		return false
	}
	// GetCronAnnounces returns results oldest-first; check the last (newest) entry.
	for _, a := range announces {
		if a.EventType == "running" {
			age := time.Now().UnixMilli() - a.CreatedAt
			if age < 5*60*1000 { // within 5 minutes
				return true
			}
		}
	}
	return false
}

func (s *CronScheduler) advanceNextRun(job store.CronJob, rawObj map[string]interface{}, lastStatus string) {
	if s.bridge.store == nil {
		return
	}
	schedMap, _ := rawObj["schedule"].(map[string]interface{})
	if schedMap == nil {
		return
	}
	kind, _ := schedMap["kind"].(string)
	now := time.Now()
	var nextMs int64

	switch kind {
	case "cron":
		expr, _ := schedMap["expr"].(string)
		if expr == "" {
			return
		}
		next, err := nextCronRunAfter(expr, now)
		if err != nil {
			log.Printf("CronScheduler: nextCronRunAfter %s: %v", expr, err)
			return
		}
		nextMs = next.UnixMilli()
	case "every":
		everyMs, _ := schedMap["everyMs"].(float64)
		if everyMs <= 0 {
			return
		}
		nextMs = now.Add(time.Duration(everyMs) * time.Millisecond).UnixMilli()
	default:
		return
	}

	state, _ := rawObj["state"].(map[string]interface{})
	if state == nil {
		state = make(map[string]interface{})
		rawObj["state"] = state
	}
	state["nextRunAtMs"] = nextMs
	state["lastRunAtMs"] = now.UnixMilli()
	state["lastStatus"] = lastStatus

	updated, err := json.Marshal(rawObj)
	if err != nil {
		return
	}
	if err := s.bridge.store.UpdateCronJobRawJSON(job.ID, string(updated)); err != nil {
		log.Printf("CronScheduler: UpdateCronJobRawJSON %s: %v", job.ID, err)
	}
}

func extractCronSummary(result interface{}) string {
	if result == nil {
		return "completed"
	}
	m, ok := result.(map[string]interface{})
	if !ok {
		return "completed"
	}
	if msgs, ok := m["messages"].([]interface{}); ok {
		for i := len(msgs) - 1; i >= 0; i-- {
			if msg, ok := msgs[i].(map[string]interface{}); ok {
				if role, _ := msg["role"].(string); role == "assistant" {
					if content, _ := msg["content"].(string); content != "" {
						if len(content) > 200 {
							return content[:200] + "…"
						}
						return content
					}
				}
			}
		}
	}
	if resp, ok := m["response"].(string); ok && resp != "" {
		if len(resp) > 200 {
			return resp[:200] + "…"
		}
		return resp
	}
	return "completed"
}

func stringifyCronResult(result interface{}) string {
	if result == nil {
		return ""
	}
	data, err := json.MarshalIndent(result, "", "  ")
	if err == nil {
		return string(data)
	}
	return fmt.Sprint(result)
}

func newCronRunID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// ── Cron expression parser (5-field: MIN HOUR DOM MON DOW) ──────────────────

// nextCronRunAfter returns the next time strictly after `after` matching the expression.
func nextCronRunAfter(expr string, after time.Time) (time.Time, error) {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return time.Time{}, fmt.Errorf("cron: expected 5 fields, got %d in %q", len(fields), expr)
	}
	mins, err := parseCronField(fields[0], 0, 59)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron minute: %w", err)
	}
	hours, err := parseCronField(fields[1], 0, 23)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron hour: %w", err)
	}
	doms, err := parseCronField(fields[2], 1, 31)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron dom: %w", err)
	}
	months, err := parseCronField(fields[3], 1, 12)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron month: %w", err)
	}
	dows, err := parseCronField(fields[4], 0, 6)
	if err != nil {
		return time.Time{}, fmt.Errorf("cron dow: %w", err)
	}

	t := after.Truncate(time.Minute).Add(time.Minute)
	limit := after.Add(4 * 365 * 24 * time.Hour)

	for t.Before(limit) {
		if !months[int(t.Month())] {
			t = time.Date(t.Year(), t.Month()+1, 1, 0, 0, 0, 0, t.Location())
			continue
		}
		if !doms[t.Day()] || !dows[int(t.Weekday())] {
			t = time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, t.Location())
			continue
		}
		if !hours[t.Hour()] {
			t = time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
			continue
		}
		if !mins[t.Minute()] {
			t = t.Add(time.Minute)
			continue
		}
		return t, nil
	}
	return time.Time{}, fmt.Errorf("cron: no occurrence found within 4 years for %q", expr)
}

func parseCronField(field string, min, max int) (map[int]bool, error) {
	result := make(map[int]bool)
	for _, part := range strings.Split(field, ",") {
		if err := applyCronPart(strings.TrimSpace(part), min, max, result); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func applyCronPart(part string, min, max int, out map[int]bool) error {
	if strings.HasPrefix(part, "*/") {
		step, err := strconv.Atoi(part[2:])
		if err != nil || step <= 0 {
			return fmt.Errorf("invalid step %q", part)
		}
		for i := min; i <= max; i += step {
			out[i] = true
		}
		return nil
	}
	if part == "*" {
		for i := min; i <= max; i++ {
			out[i] = true
		}
		return nil
	}
	// range: n-m or n-m/step
	if idx := strings.Index(part, "-"); idx > 0 {
		rangePart := part
		step := 1
		if si := strings.Index(part, "/"); si > idx {
			var err error
			step, err = strconv.Atoi(part[si+1:])
			if err != nil || step <= 0 {
				return fmt.Errorf("invalid range step %q", part)
			}
			rangePart = part[:si]
			idx = strings.Index(rangePart, "-")
		}
		lo, err1 := strconv.Atoi(rangePart[:idx])
		hi, err2 := strconv.Atoi(rangePart[idx+1:])
		if err1 != nil || err2 != nil {
			return fmt.Errorf("invalid range %q", part)
		}
		for i := lo; i <= hi; i += step {
			out[i] = true
		}
		return nil
	}
	v, err := strconv.Atoi(part)
	if err != nil {
		return fmt.Errorf("invalid value %q", part)
	}
	if v < min || v > max {
		return fmt.Errorf("value %d out of [%d,%d]", v, min, max)
	}
	out[v] = true
	return nil
}
