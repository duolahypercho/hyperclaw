package bridge

import (
	"log"
)

// ══════════════════════════════════════════════════════════════════════════════
// Agent Events — SQLite-backed
// ══════════════════════════════════════════════════════════════════════════════

func (b *BridgeHandler) getAgentEvents(params map[string]interface{}) actionResult {
	if b.store == nil {
		return okResult(map[string]interface{}{"events": []interface{}{}})
	}

	limit := 50
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}

	agentID, _ := params["agentId"].(string)

	var events []map[string]interface{}
	var err error

	if agentID != "" {
		events, err = b.store.GetAgentEvents(agentID, limit)
	} else {
		events, err = b.store.GetAllAgentEvents(limit)
	}
	if err != nil {
		log.Printf("Store: getAgentEvents error: %v", err)
		return errResult("Failed to query agent events: " + err.Error())
	}

	return okResult(map[string]interface{}{"events": events})
}

func (b *BridgeHandler) addAgentEvent(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}

	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResult("agentId is required")
	}
	eventType, _ := params["eventType"].(string)
	if eventType == "" {
		return errResult("eventType is required")
	}

	runID, _ := params["runId"].(string)
	sessionKey, _ := params["sessionKey"].(string)
	status, _ := params["status"].(string)
	data := params["data"]

	id, err := b.store.AddAgentEvent(agentID, runID, sessionKey, eventType, status, data)
	if err != nil {
		log.Printf("Store: addAgentEvent error: %v", err)
		return errResult("Failed to add agent event: " + err.Error())
	}

	return okResult(map[string]interface{}{"success": true, "id": id})
}
