package bridge

import "time"

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
	agentID, _ := params["agentId"].(string)
	jobs, err := b.store.GetCronJobsFiltered(runtime, agentID)
	if err != nil {
		return errResult("failed to read cron jobs: " + err.Error())
	}

	// If SQLite is empty and no agentId filter, fall back to file-based read
	if len(jobs) == 0 && agentID == "" {
		return b.getCrons()
	}

	return okResult(jobs)
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
