package bridge

import (
	"fmt"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

func (b *BridgeHandler) workflowTemplateList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	templates, err := b.store.ListWorkflowTemplates(projectID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": templates})
}

func (b *BridgeHandler) workflowTemplateGet(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	template, err := b.store.GetWorkflowTemplate(id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if template == nil {
		return errResultStatus("template not found", 404)
	}
	return okResult(map[string]interface{}{"success": true, "data": template})
}

func (b *BridgeHandler) workflowTemplateCreate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	name, _ := params["name"].(string)
	if projectID == "" || name == "" {
		return errResultStatus("projectId and name are required", 400)
	}
	description, _ := params["description"].(string)
	triggerExamples := extractStringSlice(params, "triggerExamples")
	steps := extractWorkflowSteps(params["steps"])
	template, err := b.store.CreateWorkflowTemplateRecord(store.WorkflowTemplateCreateInput{
		ProjectID:       projectID,
		Name:            name,
		Description:     description,
		TriggerExamples: triggerExamples,
		Category:        strMapDefault(params, "category", "custom"),
		Tags:            extractStringSlice(params, "tags"),
		Visibility:      strMapDefault(params, "visibility", "private"),
		Source:          strMapDefault(params, "source", "manual"),
		Prompt:          strMap(params, "prompt"),
		Preview:         mapParam(params, "preview"),
		Metadata:        mapParam(params, "metadata"),
		CreatedBy:       strMap(params, "createdBy"),
		Steps:           steps,
	})
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": template})
}

func (b *BridgeHandler) workflowTemplatePublish(params map[string]interface{}) actionResult {
	patch := cloneParams(params)
	patch["status"] = "published"
	return b.workflowTemplateUpdate(patch)
}

func (b *BridgeHandler) workflowTemplateArchive(params map[string]interface{}) actionResult {
	patch := cloneParams(params)
	patch["status"] = "archived"
	return b.workflowTemplateUpdate(patch)
}

func (b *BridgeHandler) workflowTemplateUpdate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	template, err := b.store.UpdateWorkflowTemplate(id, params)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if template == nil {
		return errResultStatus("template not found", 404)
	}
	return okResult(map[string]interface{}{"success": true, "data": template})
}

func (b *BridgeHandler) workflowTemplateDelete(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	deleted, err := b.store.DeleteWorkflowTemplate(id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": deleted, "id": id})
}

func (b *BridgeHandler) workflowTemplateClone(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	projectID, _ := params["projectId"].(string)
	name, _ := params["name"].(string)
	template, err := b.store.CloneWorkflowTemplate(id, projectID, name)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if template == nil {
		return errResultStatus("template not found", 404)
	}
	return okResult(map[string]interface{}{"success": true, "data": template})
}

func (b *BridgeHandler) workflowTemplateCreateFromPrompt(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	prompt, _ := params["prompt"].(string)
	if projectID == "" || strings.TrimSpace(prompt) == "" {
		return errResultStatus("projectId and prompt are required", 400)
	}
	name, _ := params["name"].(string)
	if strings.TrimSpace(name) == "" {
		name = inferWorkflowName(prompt)
	}
	steps := inferWorkflowSteps(prompt)
	template, err := b.store.CreateWorkflowTemplateRecord(store.WorkflowTemplateCreateInput{
		ProjectID:       projectID,
		Name:            name,
		Description:     prompt,
		TriggerExamples: []string{prompt},
		Category:        "agent-generated",
		Tags:            []string{"prompt"},
		Visibility:      "private",
		Source:          "prompt",
		Prompt:          prompt,
		CreatedBy:       strMap(params, "createdBy"),
		Steps:           steps,
	})
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": template})
}

func (b *BridgeHandler) workflowGraphGet(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	templateID, _ := params["templateId"].(string)
	if projectID == "" && templateID == "" {
		return errResultStatus("projectId or templateId is required", 400)
	}
	graph, err := b.store.GetWorkflowGraph(projectID, templateID)
	if err != nil {
		return okResult(map[string]interface{}{"success": true, "data": nil})
	}
	return okResult(map[string]interface{}{"success": true, "data": graph})
}

func (b *BridgeHandler) workflowGraphSave(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	templateID, _ := params["templateId"].(string)
	if projectID == "" && templateID == "" {
		return errResultStatus("projectId or templateId is required", 400)
	}
	graph := mapParam(params, "graph")
	if graph == nil {
		return errResultStatus("graph is required", 400)
	}
	record, err := b.store.SaveWorkflowGraph(projectID, templateID, graph)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": record})
}

func (b *BridgeHandler) workflowGraphPublishTemplate(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	if projectID == "" {
		return errResultStatus("projectId is required", 400)
	}
	name, _ := params["name"].(string)
	if strings.TrimSpace(name) == "" {
		name = "Published workflow"
	}
	graph := mapParam(params, "graph")
	if len(graph) == 0 {
		record, err := b.store.GetWorkflowGraph(projectID, "")
		if err == nil && record != nil {
			graph = record.Graph
		}
	}
	if len(graph) == 0 {
		return errResultStatus("graph is required", 400)
	}
	steps := stepsFromGraph(graph)
	template, err := b.store.CreateWorkflowTemplateRecord(store.WorkflowTemplateCreateInput{
		ProjectID:   projectID,
		Name:        name,
		Description: strMap(params, "description"),
		Category:    "canvas",
		Tags:        []string{"canvas"},
		Visibility:  "private",
		Source:      "wirebuilder",
		Metadata:    map[string]interface{}{"graph": graph},
		Steps:       steps,
	})
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	_, _ = b.store.SaveWorkflowGraph(projectID, template.ID, graph)
	return okResult(map[string]interface{}{"success": true, "data": template})
}

func (b *BridgeHandler) workflowComponentList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	components, err := b.store.ListWorkflowComponents(strMap(params, "kind"), strMap(params, "category"))
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": components})
}

func (b *BridgeHandler) workflowChartSpecList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	specs, err := b.store.ListWorkflowChartSpecs(strMap(params, "projectId"), strMap(params, "templateId"), strMap(params, "stepId"))
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": specs})
}

func (b *BridgeHandler) workflowChartSpecSave(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	name := strMap(params, "name")
	if name == "" {
		return errResultStatus("name is required", 400)
	}
	spec, err := b.store.SaveWorkflowChartSpec(store.WorkflowChartSpec{
		ID:         strMap(params, "id"),
		ProjectID:  strMap(params, "projectId"),
		TemplateID: strMap(params, "templateId"),
		StepID:     strMap(params, "stepId"),
		Name:       name,
		ChartType:  strMapDefault(params, "chartType", "bar"),
		DataSource: mapParam(params, "dataSource"),
		Config:     mapParam(params, "config"),
	})
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": spec})
}

func (b *BridgeHandler) workflowDraftSave(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	draft := mapParam(params, "draft")
	if draft == nil {
		return errResultStatus("draft is required", 400)
	}
	warnings := validateWorkflowDraft(draft)
	name := strMap(params, "name")
	if name == "" {
		name = strMapDefault(draft, "name", "Untitled workflow draft")
	}
	record, err := b.store.SaveWorkflowDraft(store.WorkflowDraft{
		ID:         strMap(params, "id"),
		ProjectID:  strMap(params, "projectId"),
		TemplateID: strMap(params, "templateId"),
		Name:       name,
		Source:     strMapDefault(params, "source", "agent_json"),
		Draft:      draft,
		Warnings:   warnings,
		Status:     strMapDefault(params, "status", "draft"),
	})
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": len(warnings) == 0, "data": record, "warnings": warnings})
}

func (b *BridgeHandler) workflowDraftList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	drafts, err := b.store.ListWorkflowDrafts(strMap(params, "projectId"), strMap(params, "status"))
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": drafts})
}

func (b *BridgeHandler) workflowDraftPromote(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id := strMap(params, "id")
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	draft, err := b.store.GetWorkflowDraft(id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if draft == nil {
		return errResultStatus("draft not found", 404)
	}
	template, err := b.store.CreateWorkflowTemplateRecord(store.WorkflowTemplateCreateInput{
		ProjectID:   strMapDefault(params, "projectId", draft.ProjectID),
		Name:        strMapDefault(draft.Draft, "name", draft.Name),
		Description: strMap(draft.Draft, "description"),
		Category:    strMapDefault(draft.Draft, "category", "agent-generated"),
		Tags:        extractStringSlice(draft.Draft, "tags"),
		Visibility:  strMapDefault(draft.Draft, "visibility", "private"),
		Source:      draft.Source,
		Prompt:      strMap(draft.Draft, "prompt"),
		Preview:     mapParam(draft.Draft, "preview"),
		Metadata:    mapParam(draft.Draft, "metadata"),
		CreatedBy:   strMapDefault(draft.Draft, "createdBy", strMap(params, "createdBy")),
		Steps:       stepsFromWorkflowDraft(draft.Draft),
	})
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	draft.TemplateID = template.ID
	draft.Status = "promoted"
	if _, err := b.store.SaveWorkflowDraft(*draft); err != nil {
		return errResultStatus("draft update failed: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": template, "draft": draft})
}

func (b *BridgeHandler) workflowRunStart(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	templateID, _ := params["templateId"].(string)
	if templateID == "" {
		return errResultStatus("templateId is required", 400)
	}
	startedBy, _ := params["startedBy"].(string)
	inputPayload, _ := params["inputPayload"].(map[string]interface{})
	run, err := b.store.StartWorkflowRun(templateID, startedBy, inputPayload)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": run})
}

func (b *BridgeHandler) workflowRunGet(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	run, err := b.store.GetWorkflowRun(id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if run == nil {
		return errResultStatus("workflow run not found", 404)
	}
	reports, _ := b.store.ListWorkflowReports(id, 50)
	return okResult(map[string]interface{}{"success": true, "data": run, "reports": reports})
}

func (b *BridgeHandler) workflowRunList(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	limit := 20
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
	}
	runs, err := b.store.ListWorkflowRuns(projectID, limit)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": runs})
}

func (b *BridgeHandler) workflowRunResume(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	stepRunID, _ := params["stepRunId"].(string)
	if stepRunID == "" {
		return errResultStatus("stepRunId is required", 400)
	}
	now := time.Now().UnixMilli()
	if err := b.store.UpdateWorkflowStepRun(stepRunID, map[string]interface{}{
		"status":     "completed",
		"finishedAt": now,
	}); err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "stepRunId": stepRunID})
}

func (b *BridgeHandler) workflowRunCancel(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id is required", 400)
	}
	run, err := b.store.GetWorkflowRun(id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if run == nil {
		return errResultStatus("workflow run not found", 404)
	}
	tx, err := b.store.DB().Begin()
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	defer tx.Rollback()
	now := time.Now().UnixMilli()
	for _, step := range run.Steps {
		if step.Status == "completed" || step.Status == "failed" {
			continue
		}
		if _, err := tx.Exec(`
			UPDATE workflow_step_runs
			SET status = ?, updated_at = ?
			WHERE id = ?
		`, "cancelled", now, step.ID); err != nil {
			return errResultStatus("db error: "+err.Error(), 500)
		}
	}
	_, err = tx.Exec(`UPDATE workflow_runs SET status = ?, current_gate_step_id = '', updated_at = ? WHERE id = ?`, "cancelled", now, id)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if err := tx.Commit(); err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "id": id})
}

func (b *BridgeHandler) workflowRequestApproval(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	workflowRunID, _ := params["workflowRunId"].(string)
	stepRunID, _ := params["stepRunId"].(string)
	agentID, _ := params["agentId"].(string)
	title, _ := params["title"].(string)
	body, _ := params["body"].(string)
	taskID, _ := params["taskId"].(string)
	if workflowRunID == "" || stepRunID == "" || title == "" {
		return errResultStatus("workflowRunId, stepRunId, and title are required", 400)
	}
	context, _ := params["context"].(map[string]interface{})
	if context == nil {
		context = map[string]interface{}{}
	}
	context["workflowRunId"] = workflowRunID
	context["stepRunId"] = stepRunID
	item, err := b.store.CreateInboxItem(agentID, "approval", title, body, context, taskID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	now := time.Now().UnixMilli()
	if err := b.store.UpdateWorkflowStepRun(stepRunID, map[string]interface{}{
		"status":    "waiting_approval",
		"startedAt": now,
	}); err != nil {
		return errResultStatus("workflow step update failed: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": item})
}

func (b *BridgeHandler) workflowResolveApproval(params map[string]interface{}) actionResult {
	resolve := b.inboxResolve(params)
	if resolve.err != nil {
		return resolve
	}
	context, _ := resolve.data.(map[string]interface{})
	var ctx map[string]interface{}
	if context != nil {
		ctx, _ = context["context"].(map[string]interface{})
	}
	stepRunID, _ := ctx["stepRunId"].(string)
	resolution, _ := params["resolution"].(string)
	if stepRunID != "" {
		patch := map[string]interface{}{"status": "blocked"}
		if resolution == "approved" {
			patch["status"] = "completed"
			patch["finishedAt"] = time.Now().UnixMilli()
		}
		if err := b.store.UpdateWorkflowStepRun(stepRunID, patch); err != nil {
			return errResultStatus("workflow step update failed: "+err.Error(), 500)
		}
	}
	return resolve
}

func (b *BridgeHandler) workflowSubmitReport(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	workflowRunID, _ := params["workflowRunId"].(string)
	if workflowRunID == "" {
		return errResultStatus("workflowRunId is required", 400)
	}
	stepRunID, _ := params["stepRunId"].(string)
	agentID, _ := params["agentId"].(string)
	reportKind, _ := params["reportKind"].(string)
	body, _ := params["body"].(string)
	payload, _ := params["payload"].(map[string]interface{})
	report, err := b.store.AddWorkflowReport(workflowRunID, stepRunID, agentID, reportKind, body, payload)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	return okResult(map[string]interface{}{"success": true, "data": report})
}

func extractWorkflowSteps(raw interface{}) []store.WorkflowTemplateStep {
	items, _ := raw.([]interface{})
	steps := make([]store.WorkflowTemplateStep, 0, len(items))
	for i, item := range items {
		m, _ := item.(map[string]interface{})
		if m == nil {
			continue
		}
		step := store.WorkflowTemplateStep{
			ID:               strMap(m, "id"),
			Name:             strMap(m, "name"),
			StepType:         strMapDefault(m, "stepType", "agent_task"),
			PreferredAgentID: strMap(m, "preferredAgentId"),
			PreferredRole:    strMap(m, "preferredRole"),
			Position:         i,
		}
		if step.Name == "" {
			step.Name = fmt.Sprintf("Step %d", i+1)
		}
		if deps, ok := m["dependsOn"].([]interface{}); ok {
			for _, dep := range deps {
				if s, ok := dep.(string); ok && s != "" {
					step.DependsOn = append(step.DependsOn, s)
				}
			}
		}
		if schema, ok := m["inputSchema"].(map[string]interface{}); ok {
			step.InputSchema = schema
		}
		if schema, ok := m["outputSchema"].(map[string]interface{}); ok {
			step.OutputSchema = schema
		}
		if metadata, ok := m["metadata"].(map[string]interface{}); ok {
			step.Metadata = metadata
		}
		steps = append(steps, step)
	}
	return steps
}

func inferWorkflowName(prompt string) string {
	lines := strings.Fields(strings.TrimSpace(prompt))
	if len(lines) == 0 {
		return "Workflow"
	}
	if len(lines) > 4 {
		lines = lines[:4]
	}
	return strings.Join(lines, " ")
}

func inferWorkflowSteps(prompt string) []store.WorkflowTemplateStep {
	candidates := splitWorkflowPrompt(prompt)
	steps := make([]store.WorkflowTemplateStep, 0, len(candidates))
	var previous string
	for i, candidate := range candidates {
		name := strings.TrimSpace(candidate)
		if name == "" {
			continue
		}
		stepType := "agent_task"
		lower := strings.ToLower(name)
		if strings.Contains(lower, "approval") || strings.Contains(lower, "review") {
			stepType = "human_approval"
		} else if strings.Contains(lower, "notify") || strings.Contains(lower, "announce") {
			stepType = "notification"
		}
		step := store.WorkflowTemplateStep{
			ID:       fmt.Sprintf("step-%d", i+1),
			Name:     name,
			StepType: stepType,
			Position: i,
		}
		if previous != "" {
			step.DependsOn = []string{previous}
		}
		previous = step.ID
		steps = append(steps, step)
	}
	if len(steps) == 0 {
		steps = append(steps, store.WorkflowTemplateStep{
			ID:       "step-1",
			Name:     "Execute requested workflow",
			StepType: "agent_task",
			Position: 0,
		})
	}
	return steps
}

func splitWorkflowPrompt(prompt string) []string {
	if strings.Contains(prompt, "->") {
		parts := strings.Split(prompt, "->")
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				out = append(out, part)
			}
		}
		return out
	}
	lines := strings.Split(prompt, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(strings.TrimLeft(line, "-*0123456789. "))
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func mapParam(m map[string]interface{}, key string) map[string]interface{} {
	v, _ := m[key].(map[string]interface{})
	if v == nil {
		return map[string]interface{}{}
	}
	return v
}

func cloneParams(params map[string]interface{}) map[string]interface{} {
	clone := make(map[string]interface{}, len(params)+1)
	for key, value := range params {
		clone[key] = value
	}
	return clone
}

func validateWorkflowDraft(draft map[string]interface{}) []string {
	var warnings []string
	if strings.TrimSpace(strMap(draft, "name")) == "" {
		warnings = append(warnings, "name is recommended")
	}
	steps, _ := draft["steps"].([]interface{})
	nodes, _ := draft["nodes"].([]interface{})
	if len(steps) == 0 && len(nodes) == 0 {
		warnings = append(warnings, "draft should include steps or graph nodes")
	}
	return warnings
}

func stepsFromWorkflowDraft(draft map[string]interface{}) []store.WorkflowTemplateStep {
	if steps := extractWorkflowSteps(draft["steps"]); len(steps) > 0 {
		return steps
	}
	graph := mapParam(draft, "graph")
	if len(graph) == 0 {
		graph = draft
	}
	return stepsFromGraph(graph)
}

func stepsFromGraph(graph map[string]interface{}) []store.WorkflowTemplateStep {
	nodesRaw, _ := graph["nodes"].([]interface{})
	edgesRaw, _ := graph["edges"].([]interface{})
	deps := map[string][]string{}
	for _, raw := range edgesRaw {
		edge, _ := raw.(map[string]interface{})
		from := strMap(edge, "from")
		to := strMap(edge, "to")
		if from != "" && to != "" {
			deps[to] = append(deps[to], from)
		}
	}
	steps := make([]store.WorkflowTemplateStep, 0, len(nodesRaw))
	for i, raw := range nodesRaw {
		node, _ := raw.(map[string]interface{})
		if node == nil {
			continue
		}
		id := strMap(node, "id")
		if id == "" {
			id = fmt.Sprintf("step-%d", i+1)
		}
		kind := strMapDefault(node, "kind", "agent_task")
		label := strMapDefault(node, "label", fmt.Sprintf("Step %d", i+1))
		stepType := wireKindToStepType(kind)
		metadata := map[string]interface{}{"wireKind": kind, "node": node}
		if config := mapParam(node, "config"); len(config) > 0 {
			metadata["config"] = config
		}
		steps = append(steps, store.WorkflowTemplateStep{
			ID:        id,
			Name:      label,
			StepType:  stepType,
			DependsOn: deps[id],
			Position:  i,
			Metadata:  metadata,
		})
	}
	if len(steps) == 0 {
		steps = append(steps, store.WorkflowTemplateStep{
			ID:       "step-1",
			Name:     "Execute workflow",
			StepType: "agent_task",
			Position: 0,
		})
	}
	return steps
}

func wireKindToStepType(kind string) string {
	switch kind {
	case "trigger":
		return "manual_trigger"
	case "output":
		return "notification"
	case "chart":
		return "chart"
	case "component":
		return "component"
	case "sql", "sql_query":
		return "sql_query"
	default:
		return "agent_task"
	}
}

func strMap(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

func strMapDefault(m map[string]interface{}, key, fallback string) string {
	if v := strMap(m, key); v != "" {
		return v
	}
	return fallback
}
