package bridge

// getAgentLastSeen handles the "get-agent-last-seen" bridge action.
// Returns last-seen records for a batch of agent IDs.
//
// Params:  { agentIds: string[] }
// Returns: { success: true, data: { [agentId]: { ts, msgText } } }
func (b *BridgeHandler) getAgentLastSeen(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	raw, _ := params["agentIds"].([]interface{})
	agentIDs := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok && s != "" {
			agentIDs = append(agentIDs, s)
		}
	}
	if len(agentIDs) == 0 {
		return okResult(map[string]interface{}{"success": true, "data": map[string]interface{}{}})
	}

	records, err := b.store.GetAgentLastSeenBatch(agentIDs)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}

	data := make(map[string]interface{}, len(records))
	for agentID, r := range records {
		data[agentID] = map[string]interface{}{
			"ts":      r.Ts,
			"msgText": r.MsgText,
		}
	}
	return okResult(map[string]interface{}{"success": true, "data": data})
}

// setAgentLastSeen handles the "set-agent-last-seen" bridge action.
// Upserts a last-seen record for one agent.
//
// Params:  { agentId: string, ts: number, msgText?: string }
// Returns: { success: true }
func (b *BridgeHandler) setAgentLastSeen(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}

	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId required", 400)
	}

	var ts int64
	switch v := params["ts"].(type) {
	case float64:
		ts = int64(v)
	case int64:
		ts = v
	}

	msgText, _ := params["msgText"].(string)

	if err := b.store.SetAgentLastSeen(agentID, ts, msgText); err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true})
}
