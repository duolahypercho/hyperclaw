package bridge

// ── Agent MCPs bridge actions ─────────────────────────────────────────────────
//
// Bridge action → store method mapping:
//   agent-mcp-list   → store.ListAgentMCPs(agentId)
//   agent-mcp-add    → store.AddAgentMCP(...)
//   agent-mcp-update → store.UpdateAgentMCP(...)
//   agent-mcp-toggle → store.ToggleAgentMCP(id, enabled)
//   agent-mcp-delete → store.DeleteAgentMCP(id)

func (b *BridgeHandler) agentMcpList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId required", 400)
	}
	mcps, err := b.store.ListAgentMCPs(agentID)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(mcps)
}

func (b *BridgeHandler) agentMcpAdd(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	agentID, _ := params["agentId"].(string)
	name, _ := params["name"].(string)
	if agentID == "" || name == "" {
		return errResultStatus("agentId and name required", 400)
	}
	transportType, _ := params["transportType"].(string)
	if transportType == "" {
		transportType = "stdio"
	}
	command, _ := params["command"].(string)
	url, _ := params["url"].(string)

	args := extractStringSlice(params, "args")
	headers := extractStringMap(params, "headers")
	env := extractStringMap(params, "env")

	mcp, err := b.store.AddAgentMCP(agentID, name, transportType, command, args, url, headers, env)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(mcp)
}

func (b *BridgeHandler) agentMcpUpdate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	id, _ := params["id"].(string)
	name, _ := params["name"].(string)
	if id == "" || name == "" {
		return errResultStatus("id and name required", 400)
	}
	transportType, _ := params["transportType"].(string)
	if transportType == "" {
		transportType = "stdio"
	}
	command, _ := params["command"].(string)
	url, _ := params["url"].(string)

	args := extractStringSlice(params, "args")
	headers := extractStringMap(params, "headers")
	env := extractStringMap(params, "env")

	if err := b.store.UpdateAgentMCP(id, name, transportType, command, args, url, headers, env); err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) agentMcpToggle(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id required", 400)
	}
	enabled, _ := params["enabled"].(bool)
	if err := b.store.ToggleAgentMCP(id, enabled); err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) agentMcpDelete(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id required", 400)
	}
	if err := b.store.DeleteAgentMCP(id); err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{"success": true})
}

// ── param helpers ─────────────────────────────────────────────────────────────

// extractStringSlice converts []interface{} param to []string.
func extractStringSlice(params map[string]interface{}, key string) []string {
	raw, ok := params[key].([]interface{})
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// extractStringMap converts map[string]interface{} param to map[string]string.
func extractStringMap(params map[string]interface{}, key string) map[string]string {
	raw, ok := params[key].(map[string]interface{})
	if !ok {
		return map[string]string{}
	}
	out := make(map[string]string, len(raw))
	for k, v := range raw {
		if s, ok := v.(string); ok {
			out[k] = s
		}
	}
	return out
}
