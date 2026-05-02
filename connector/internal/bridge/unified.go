package bridge

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

// unified.go — Bridge actions for the unified runtime store.
// These read from SQLite tables populated by file watchers and event hooks.

// getAllAgents returns agents across all runtimes from SQLite.
// Optional param: runtime (filter by runtime)
func (b *BridgeHandler) getAllAgents(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}

	runtime, _ := params["runtime"].(string)
	agents, err := b.store.GetAgents(runtime)
	if err != nil {
		return errResult("failed to read agents: " + err.Error())
	}
	return okResult(agents)
}

// getAllCrons returns cron jobs across all runtimes from SQLite.
// Optional params: runtime (filter by runtime), agentId (filter by agent)
func (b *BridgeHandler) getAllCrons(params map[string]interface{}) actionResult {
	if b.store == nil {
		// Fallback to file-based read
		return b.getCrons()
	}

	runtime, _ := params["runtime"].(string)
	runtime, validRuntime := normalizeCronRuntimeFilter(runtime)
	if !validRuntime {
		return okResult([]store.CronJob{})
	}
	agentID, _ := params["agentId"].(string)
	agentID = strings.TrimSpace(agentID)
	jobs, err := b.store.GetCronJobsFiltered(runtime, agentID)
	if err != nil {
		return errResult("failed to read cron jobs: " + err.Error())
	}

	// If SQLite is empty and no filters are present, fall back to file-based read.
	// Runtime-filtered calls must return an empty list instead of leaking OpenClaw jobs.
	if len(jobs) == 0 && runtime == "" && agentID == "" {
		return b.getCrons()
	}

	jobs = b.enrichOpenClawCronJobsFromRuns(jobs)
	return okResult(jobs)
}

func (b *BridgeHandler) enrichOpenClawCronJobsFromRuns(jobs []store.CronJob) []store.CronJob {
	if len(jobs) == 0 {
		return jobs
	}

	enriched := make([]store.CronJob, len(jobs))
	copy(enriched, jobs)
	for i := range enriched {
		if enriched[i].Runtime != "openclaw" {
			continue
		}
		enriched[i].RawJSON = enrichOpenClawCronJobRawJSON(b.paths, enriched[i].ID, enriched[i].RawJSON)
	}
	return enriched
}

func enrichOpenClawCronJobRawJSON(paths Paths, jobID, rawJSON string) string {
	if strings.TrimSpace(rawJSON) == "" {
		return rawJSON
	}

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &raw); err != nil {
		return rawJSON
	}

	state, _ := raw["state"].(map[string]interface{})
	if state == nil {
		state = make(map[string]interface{})
		raw["state"] = state
	}

	changed := false
	if !hasPositiveMillis(state["lastRunAtMs"]) || !hasFutureMillis(state["nextRunAtMs"]) {
		runs := readRunsForJob(paths, jobID)
		if len(runs) > 0 {
			latest := runs[len(runs)-1]
			if !hasPositiveMillis(state["lastRunAtMs"]) {
				if runAtMs, ok := numericMillis(latest["runAtMs"]); ok {
					state["lastRunAtMs"] = runAtMs
					changed = true
				}
			}
			if !hasFutureMillis(state["nextRunAtMs"]) {
				if nextRunAtMs, ok := numericMillis(latest["nextRunAtMs"]); ok && nextRunAtMs > time.Now().UnixMilli() {
					state["nextRunAtMs"] = nextRunAtMs
					changed = true
				}
			}
			currentStatus, _ := state["lastStatus"].(string)
			if status, ok := latest["status"].(string); ok && status != "" && strings.TrimSpace(currentStatus) == "" {
				state["lastStatus"] = strings.ToLower(status)
				changed = true
			}
		}
	}

	if !hasFutureMillis(state["nextRunAtMs"]) {
		if nextRunAtMs, ok := computeNextOpenClawRunAtMs(raw); ok {
			state["nextRunAtMs"] = nextRunAtMs
			changed = true
		}
	}

	if !changed {
		return rawJSON
	}
	updated, err := json.Marshal(raw)
	if err != nil {
		return rawJSON
	}
	return string(updated)
}

func computeNextOpenClawRunAtMs(raw map[string]interface{}) (int64, bool) {
	schedule, _ := raw["schedule"].(map[string]interface{})
	if schedule == nil {
		return 0, false
	}

	switch kind, _ := schedule["kind"].(string); kind {
	case "cron":
		expr, _ := schedule["expr"].(string)
		if strings.TrimSpace(expr) == "" {
			return 0, false
		}
		next, err := nextCronRunAfter(expr, time.Now())
		if err != nil {
			return 0, false
		}
		return next.UnixMilli(), true
	case "at":
		if atMs, ok := numericMillis(schedule["atMs"]); ok && atMs > time.Now().UnixMilli() {
			return atMs, true
		}
	}
	return 0, false
}

func hasPositiveMillis(value interface{}) bool {
	millis, ok := numericMillis(value)
	return ok && millis > 0
}

func hasFutureMillis(value interface{}) bool {
	millis, ok := numericMillis(value)
	return ok && millis > time.Now().UnixMilli()
}

func numericMillis(value interface{}) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case int:
		return int64(v), true
	case float64:
		return int64(v), true
	}
	return 0, false
}

func normalizeCronRuntimeFilter(runtime string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(runtime)) {
	case "", "all":
		return "", true
	case "openclaw", "open claw":
		return "openclaw", true
	case "hermes", "hermes-agent":
		return "hermes", true
	case "claude-code", "claude_code", "claude code", "claude", "claw-code":
		return "claude-code", true
	case "codex", "openai-codex":
		return "codex", true
	default:
		return "", false
	}
}

// getAllSessions returns chat sessions across all runtimes from SQLite.
// Optional params: runtime (filter), limit (default 50)
func (b *BridgeHandler) getAllSessions(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}

	runtime, _ := params["runtime"].(string)
	limit := 50
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	sessions, err := b.store.GetSessions(runtime, limit)
	if err != nil {
		return errResult("failed to read sessions: " + err.Error())
	}
	return okResult(sessions)
}

// getSessionMessages returns messages for a specific session.
// Required param: sessionId
// Optional param: limit (default 200)
func (b *BridgeHandler) getSessionMessages(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}

	sessionID, _ := params["sessionId"].(string)
	if sessionID == "" {
		return errResultStatus("sessionId is required", 400)
	}

	limit := 200
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	messages, err := b.store.GetSessionMessages(sessionID, limit)
	if err != nil {
		return errResult("failed to read messages: " + err.Error())
	}
	return okResult(messages)
}

// getRuntimeStatuses returns health status of all runtimes from SQLite.
func (b *BridgeHandler) getRuntimeStatuses() actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}

	statuses, err := b.store.GetRuntimeStatuses()
	if err != nil {
		return errResult("failed to read runtime statuses: " + err.Error())
	}
	return okResult(statuses)
}

func (b *BridgeHandler) connectorStabilityStatus() actionResult {
	workerStatus := map[string]interface{}{"available": false}
	if b.runtimeWorker != nil {
		workerStatus = b.runtimeWorker.Status()
	}
	return okResult(map[string]interface{}{
		"ok":               true,
		"connectorOnline":  true,
		"gatewayConnected": b.isGatewayConnected(),
		"gatewayState":     b.gatewayState(),
		"hubSend":          SnapshotHubSendStats(),
		"runtimeWorker":    workerStatus,
		"ts":               nowMillis(),
	})
}

func (b *BridgeHandler) connectorHealth() actionResult {
	return okResult(map[string]interface{}{
		"ok":               true,
		"connectorOnline":  true,
		"gatewayConnected": b.isGatewayConnected(),
		"gatewayState":     b.gatewayState(),
		"bridge":           "native",
		"ts":               nowMillis(),
	})
}

func (b *BridgeHandler) isGatewayConnected() bool {
	return b.gwConnected != nil && b.gwConnected.Load() == 1
}

func (b *BridgeHandler) gatewayState() string {
	if b.gwConnected == nil {
		return "unknown"
	}
	if b.isGatewayConnected() {
		return "connected"
	}
	return "disconnected"
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}

// getBuildings returns building sections across all runtimes from SQLite.
// Optional param: runtime (filter by runtime)
func (b *BridgeHandler) getBuildings(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not initialized")
	}

	runtime, _ := params["runtime"].(string)
	buildings, err := b.store.GetBuildings(runtime)
	if err != nil {
		return errResult("failed to read buildings: " + err.Error())
	}
	return okResult(buildings)
}
