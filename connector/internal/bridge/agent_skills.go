package bridge

// ── Agent Skills bridge actions ───────────────────────────────────────────────
//
// Bridge action → store method mapping:
//   agent-skill-list   → store.ListAgentSkills(agentId)
//   agent-skill-add    → store.AddAgentSkill(...)
//   agent-skill-update → store.UpdateAgentSkill(...)
//   agent-skill-toggle → store.ToggleAgentSkill(id, enabled)
//   agent-skill-delete → store.DeleteAgentSkill(id)

func (b *BridgeHandler) agentSkillList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId required", 400)
	}
	skills, err := b.store.ListAgentSkills(agentID)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(skills)
}

func (b *BridgeHandler) agentSkillAdd(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	agentID, _ := params["agentId"].(string)
	name, _ := params["name"].(string)
	if agentID == "" || name == "" {
		return errResultStatus("agentId and name required", 400)
	}
	description, _ := params["description"].(string)
	content, _ := params["content"].(string)
	source, _ := params["source"].(string)
	if source == "" {
		source = "custom"
	}
	cloudID, _ := params["cloudId"].(string)
	author, _ := params["author"].(string)
	version, _ := params["version"].(string)

	// tags comes as []interface{} from JSON
	var tags []string
	if raw, ok := params["tags"].([]interface{}); ok {
		for _, t := range raw {
			if s, ok := t.(string); ok {
				tags = append(tags, s)
			}
		}
	}

	skill, err := b.store.AddAgentSkill(agentID, name, description, content, source, cloudID, author, version, tags)
	if err != nil {
		return errResult(err.Error())
	}
	return okResult(skill)
}

func (b *BridgeHandler) agentSkillUpdate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	id, _ := params["id"].(string)
	name, _ := params["name"].(string)
	if id == "" || name == "" {
		return errResultStatus("id and name required", 400)
	}
	description, _ := params["description"].(string)
	content, _ := params["content"].(string)

	var tags []string
	if raw, ok := params["tags"].([]interface{}); ok {
		for _, t := range raw {
			if s, ok := t.(string); ok {
				tags = append(tags, s)
			}
		}
	}

	if err := b.store.UpdateAgentSkill(id, name, description, content, tags); err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) agentSkillToggle(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id required", 400)
	}
	enabled, _ := params["enabled"].(bool)
	if err := b.store.ToggleAgentSkill(id, enabled); err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) agentSkillDelete(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id required", 400)
	}
	if err := b.store.DeleteAgentSkill(id); err != nil {
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{"success": true})
}
