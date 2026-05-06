package bridge

// projects.go — Bridge actions for the projects feature.
// Projects are shared workspaces that group agents (from any runtime)
// around a common goal. Many-to-many: agents ↔ projects.

func (b *BridgeHandler) syncTeamModeAfterProjectMutation() {
	if b.store == nil {
		return
	}
	go func() {
		if err := SyncTeamModeBootstrap(b.store, b.paths); err != nil {
			// Best-effort sync; keep user mutation successful even if behavior sync lags.
		}
	}()
}

func (b *BridgeHandler) projectCreate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	name, _ := params["name"].(string)
	if name == "" {
		return errResultStatus("name is required", 400)
	}
	description, _ := params["description"].(string)
	emoji, _ := params["emoji"].(string)
	kind, _ := params["kind"].(string)

	p, err := b.store.CreateProject(name, description, emoji, kind)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if leadAgentID, _ := params["leadAgentId"].(string); leadAgentID != "" {
		enabled := true
		p, err = b.store.UpdateProject(p.ID, "", "", "", "", &leadAgentID, &enabled, nil)
		if err != nil {
			return errResultStatus("db error: "+err.Error(), 500)
		}
	}
	b.syncTeamModeAfterProjectMutation()
	return okResult(map[string]interface{}{"success": true, "data": p})
}

func (b *BridgeHandler) projectList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	status, _ := params["status"].(string)
	kind, _ := params["kind"].(string)
	projects, err := b.store.ListProjects(status, kind)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": projects})
}

func (b *BridgeHandler) projectGet(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	p, err := b.store.GetProjectWithMembers(id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if p == nil {
		return errResultStatus("project not found", 404)
	}
	b.syncTeamModeAfterProjectMutation()
	return okResult(map[string]interface{}{"success": true, "data": p})
}

func (b *BridgeHandler) projectUpdate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	name, _ := params["name"].(string)
	description, _ := params["description"].(string)
	emoji, _ := params["emoji"].(string)
	status, _ := params["status"].(string)
	var leadAgentID *string
	if raw, ok := params["leadAgentId"]; ok {
		if s, ok := raw.(string); ok {
			leadAgentID = &s
		}
	}
	var teamModeEnabled *bool
	if raw, ok := params["teamModeEnabled"]; ok {
		if v, ok := raw.(bool); ok {
			teamModeEnabled = &v
		}
	}
	var defaultWorkflowTemplateID *string
	if raw, ok := params["defaultWorkflowTemplateId"]; ok {
		if s, ok := raw.(string); ok {
			defaultWorkflowTemplateID = &s
		}
	}

	p, err := b.store.UpdateProject(id, name, description, emoji, status, leadAgentID, teamModeEnabled, defaultWorkflowTemplateID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if p == nil {
		return errResultStatus("project not found", 404)
	}
	return okResult(map[string]interface{}{"success": true, "data": p})
}

func (b *BridgeHandler) projectDelete(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	deleted, err := b.store.DeleteProject(id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if deleted {
		b.syncTeamModeAfterProjectMutation()
	}
	return okResult(map[string]interface{}{"success": true, "deleted": deleted})
}

func (b *BridgeHandler) projectAddMember(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	agentID, _ := params["agentId"].(string)
	if projectID == "" || agentID == "" {
		return errResultStatus("projectId and agentId are required", 400)
	}
	role, _ := params["role"].(string)

	if err := b.store.AddProjectMember(projectID, agentID, role); err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	b.syncTeamModeAfterProjectMutation()
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) projectRemoveMember(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	agentID, _ := params["agentId"].(string)
	if projectID == "" || agentID == "" {
		return errResultStatus("projectId and agentId are required", 400)
	}
	removed, err := b.store.RemoveProjectMember(projectID, agentID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if removed {
		b.syncTeamModeAfterProjectMutation()
	}
	return okResult(map[string]interface{}{"success": true, "removed": removed})
}

func (b *BridgeHandler) projectGetMembers(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	if projectID == "" {
		return errResultStatus("projectId is required", 400)
	}
	members, err := b.store.GetProjectMembers(projectID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": members})
}

func (b *BridgeHandler) agentGetProjects(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId is required", 400)
	}
	projects, err := b.store.GetAgentProjects(agentID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": projects})
}
