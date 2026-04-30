package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"
)

type WorkflowTemplate struct {
	ID              string                 `json:"id"`
	ProjectID       string                 `json:"projectId"`
	Name            string                 `json:"name"`
	Description     string                 `json:"description"`
	TriggerExamples []string               `json:"triggerExamples"`
	Category        string                 `json:"category"`
	Tags            []string               `json:"tags"`
	Version         int                    `json:"version"`
	Visibility      string                 `json:"visibility"`
	Source          string                 `json:"source"`
	Prompt          string                 `json:"prompt,omitempty"`
	Preview         map[string]interface{} `json:"preview,omitempty"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
	Status          string                 `json:"status"`
	CreatedBy       string                 `json:"createdBy,omitempty"`
	CreatedAt       int64                  `json:"createdAt"`
	UpdatedAt       int64                  `json:"updatedAt"`
	Steps           []WorkflowTemplateStep `json:"steps,omitempty"`
}

type WorkflowTemplateStep struct {
	ID               string                 `json:"id"`
	TemplateID       string                 `json:"templateId"`
	Name             string                 `json:"name"`
	StepType         string                 `json:"stepType"`
	DependsOn        []string               `json:"dependsOn"`
	PreferredAgentID string                 `json:"preferredAgentId,omitempty"`
	PreferredRole    string                 `json:"preferredRole,omitempty"`
	InputSchema      map[string]interface{} `json:"inputSchema,omitempty"`
	OutputSchema     map[string]interface{} `json:"outputSchema,omitempty"`
	Position         int                    `json:"position"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
}

type WorkflowRun struct {
	ID                string            `json:"id"`
	TemplateID        string            `json:"templateId"`
	ProjectID         string            `json:"projectId"`
	Status            string            `json:"status"`
	StartedBy         string            `json:"startedBy"`
	CurrentGateStepID string            `json:"currentGateStepId,omitempty"`
	InputPayload      map[string]any    `json:"inputPayload,omitempty"`
	CreatedAt         int64             `json:"createdAt"`
	UpdatedAt         int64             `json:"updatedAt"`
	Steps             []WorkflowStepRun `json:"steps,omitempty"`
}

type WorkflowStepRun struct {
	ID              string                 `json:"id"`
	WorkflowRunID   string                 `json:"workflowRunId"`
	StepTemplateID  string                 `json:"stepTemplateId"`
	Name            string                 `json:"name"`
	StepType        string                 `json:"stepType"`
	Status          string                 `json:"status"`
	AssignedAgentID string                 `json:"assignedAgentId,omitempty"`
	TaskID          string                 `json:"taskId,omitempty"`
	ResultJSON      map[string]interface{} `json:"resultJson,omitempty"`
	Error           string                 `json:"error,omitempty"`
	DependsOn       []string               `json:"dependsOn"`
	Position        int                    `json:"position"`
	StartedAt       *int64                 `json:"startedAt,omitempty"`
	FinishedAt      *int64                 `json:"finishedAt,omitempty"`
	UpdatedAt       int64                  `json:"updatedAt"`
}

type WorkflowReport struct {
	ID            string                 `json:"id"`
	WorkflowRunID string                 `json:"workflowRunId"`
	StepRunID     string                 `json:"stepRunId,omitempty"`
	AgentID       string                 `json:"agentId,omitempty"`
	ReportKind    string                 `json:"reportKind"`
	Body          string                 `json:"body"`
	Payload       map[string]interface{} `json:"payload,omitempty"`
	CreatedAt     int64                  `json:"createdAt"`
}

type WorkflowGraph struct {
	ID         string                 `json:"id"`
	ProjectID  string                 `json:"projectId,omitempty"`
	TemplateID string                 `json:"templateId,omitempty"`
	Graph      map[string]interface{} `json:"graph"`
	Version    int                    `json:"version"`
	CreatedAt  int64                  `json:"createdAt"`
	UpdatedAt  int64                  `json:"updatedAt"`
}

type WorkflowComponent struct {
	ID          string                 `json:"id"`
	Kind        string                 `json:"kind"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Icon        string                 `json:"icon"`
	Category    string                 `json:"category"`
	Spec        map[string]interface{} `json:"spec"`
	Tags        []string               `json:"tags"`
	Source      string                 `json:"source"`
	CreatedAt   int64                  `json:"createdAt"`
	UpdatedAt   int64                  `json:"updatedAt"`
}

type WorkflowChartSpec struct {
	ID         string                 `json:"id"`
	ProjectID  string                 `json:"projectId,omitempty"`
	TemplateID string                 `json:"templateId,omitempty"`
	StepID     string                 `json:"stepId,omitempty"`
	Name       string                 `json:"name"`
	ChartType  string                 `json:"chartType"`
	DataSource map[string]interface{} `json:"dataSource"`
	Config     map[string]interface{} `json:"config"`
	CreatedAt  int64                  `json:"createdAt"`
	UpdatedAt  int64                  `json:"updatedAt"`
}

type WorkflowDraft struct {
	ID         string                 `json:"id"`
	ProjectID  string                 `json:"projectId,omitempty"`
	TemplateID string                 `json:"templateId,omitempty"`
	Name       string                 `json:"name"`
	Source     string                 `json:"source"`
	Draft      map[string]interface{} `json:"draft"`
	Warnings   []string               `json:"warnings"`
	Status     string                 `json:"status"`
	CreatedAt  int64                  `json:"createdAt"`
	UpdatedAt  int64                  `json:"updatedAt"`
}

func newWorkflowID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func mustJSON(v interface{}) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func decodeJSONMap(raw string) map[string]interface{} {
	if raw == "" {
		return map[string]interface{}{}
	}
	var out map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil || out == nil {
		return map[string]interface{}{}
	}
	return out
}

func decodeJSONStringSlice(raw string) []string {
	if raw == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil || out == nil {
		return []string{}
	}
	return out
}

func decodeJSONAnyMap(raw string) map[string]interface{} {
	out := decodeJSONMap(raw)
	if out == nil {
		return map[string]interface{}{}
	}
	return out
}

func stringSliceFromAny(raw interface{}) []string {
	if raw == nil {
		return nil
	}
	if items, ok := raw.([]string); ok {
		return items
	}
	items, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func (s *Store) CreateWorkflowTemplate(projectID, name, description string, triggerExamples []string, steps []WorkflowTemplateStep) (*WorkflowTemplate, error) {
	now := time.Now().UnixMilli()
	template := &WorkflowTemplate{
		ID:              newWorkflowID(),
		ProjectID:       projectID,
		Name:            name,
		Description:     description,
		TriggerExamples: triggerExamples,
		Category:        "custom",
		Tags:            []string{},
		Version:         1,
		Visibility:      "private",
		Source:          "manual",
		Preview:         map[string]interface{}{},
		Metadata:        map[string]interface{}{},
		Status:          "active",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		INSERT INTO workflow_templates
		(id, project_id, name, description, trigger_examples, category, tags, version, visibility, source, prompt, preview, metadata, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, template.ID, template.ProjectID, template.Name, template.Description, mustJSON(triggerExamples), template.Category, mustJSON(template.Tags), template.Version, template.Visibility, template.Source, template.Prompt, mustJSON(template.Preview), mustJSON(template.Metadata), template.Status, template.CreatedAt, template.UpdatedAt); err != nil {
		return nil, err
	}

	template.Steps = make([]WorkflowTemplateStep, 0, len(steps))
	for i, step := range steps {
		step.TemplateID = template.ID
		if step.ID == "" {
			step.ID = newWorkflowID()
		}
		step.Position = i
		if _, err := tx.Exec(`
			INSERT INTO workflow_template_steps
			(id, template_id, name, step_type, depends_on, preferred_agent_id, preferred_role, input_schema, output_schema, position, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, step.ID, step.TemplateID, step.Name, step.StepType, mustJSON(step.DependsOn), step.PreferredAgentID, step.PreferredRole, mustJSON(step.InputSchema), mustJSON(step.OutputSchema), step.Position, mustJSON(step.Metadata)); err != nil {
			return nil, err
		}
		template.Steps = append(template.Steps, step)
	}

	if _, err := tx.Exec(`UPDATE projects SET updated_at = ? WHERE id = ?`, now, projectID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return template, nil
}

type WorkflowTemplateCreateInput struct {
	ProjectID       string
	Name            string
	Description     string
	TriggerExamples []string
	Category        string
	Tags            []string
	Visibility      string
	Source          string
	Prompt          string
	Preview         map[string]interface{}
	Metadata        map[string]interface{}
	CreatedBy       string
	Steps           []WorkflowTemplateStep
}

func (s *Store) CreateWorkflowTemplateRecord(input WorkflowTemplateCreateInput) (*WorkflowTemplate, error) {
	now := time.Now().UnixMilli()
	template := &WorkflowTemplate{
		ID:              newWorkflowID(),
		ProjectID:       input.ProjectID,
		Name:            input.Name,
		Description:     input.Description,
		TriggerExamples: input.TriggerExamples,
		Category:        input.Category,
		Tags:            input.Tags,
		Version:         1,
		Visibility:      input.Visibility,
		Source:          input.Source,
		Prompt:          input.Prompt,
		Preview:         input.Preview,
		Metadata:        input.Metadata,
		CreatedBy:       input.CreatedBy,
		Status:          "active",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if template.Category == "" {
		template.Category = "custom"
	}
	if template.Tags == nil {
		template.Tags = []string{}
	}
	if template.Visibility == "" {
		template.Visibility = "private"
	}
	if template.Source == "" {
		template.Source = "manual"
	}
	if template.Preview == nil {
		template.Preview = map[string]interface{}{}
	}
	if template.Metadata == nil {
		template.Metadata = map[string]interface{}{}
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`
		INSERT INTO workflow_templates
		(id, project_id, name, description, trigger_examples, category, tags, version, visibility, source, prompt, preview, metadata, status, created_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, template.ID, template.ProjectID, template.Name, template.Description, mustJSON(template.TriggerExamples), template.Category, mustJSON(template.Tags), template.Version, template.Visibility, template.Source, template.Prompt, mustJSON(template.Preview), mustJSON(template.Metadata), template.Status, template.CreatedBy, template.CreatedAt, template.UpdatedAt); err != nil {
		return nil, err
	}
	template.Steps = make([]WorkflowTemplateStep, 0, len(input.Steps))
	for i, step := range input.Steps {
		step.TemplateID = template.ID
		if step.ID == "" {
			step.ID = newWorkflowID()
		}
		step.Position = i
		if _, err := tx.Exec(`
			INSERT INTO workflow_template_steps
			(id, template_id, name, step_type, depends_on, preferred_agent_id, preferred_role, input_schema, output_schema, position, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, step.ID, step.TemplateID, step.Name, step.StepType, mustJSON(step.DependsOn), step.PreferredAgentID, step.PreferredRole, mustJSON(step.InputSchema), mustJSON(step.OutputSchema), step.Position, mustJSON(step.Metadata)); err != nil {
			return nil, err
		}
		template.Steps = append(template.Steps, step)
	}
	if template.ProjectID != "" {
		if _, err := tx.Exec(`UPDATE projects SET default_workflow_template_id = COALESCE(NULLIF(default_workflow_template_id, ''), ?), updated_at = ? WHERE id = ?`, template.ID, now, template.ProjectID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return template, nil
}

func (s *Store) ListWorkflowTemplates(projectID string) ([]WorkflowTemplate, error) {
	rows, err := s.db.Query(`
		SELECT id, project_id, name, description, trigger_examples,
		       category, tags, version, visibility, source, prompt, preview, metadata,
		       status, COALESCE(created_by, ''), created_at, updated_at
		FROM workflow_templates
		WHERE (? = '' OR project_id = ?)
		ORDER BY updated_at DESC
	`, projectID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []WorkflowTemplate
	for rows.Next() {
		var tpl WorkflowTemplate
		var triggersJSON, tagsJSON, previewJSON, metadataJSON string
		if err := rows.Scan(&tpl.ID, &tpl.ProjectID, &tpl.Name, &tpl.Description, &triggersJSON, &tpl.Category, &tagsJSON, &tpl.Version, &tpl.Visibility, &tpl.Source, &tpl.Prompt, &previewJSON, &metadataJSON, &tpl.Status, &tpl.CreatedBy, &tpl.CreatedAt, &tpl.UpdatedAt); err != nil {
			continue
		}
		tpl.TriggerExamples = decodeJSONStringSlice(triggersJSON)
		tpl.Tags = decodeJSONStringSlice(tagsJSON)
		tpl.Preview = decodeJSONAnyMap(previewJSON)
		tpl.Metadata = decodeJSONAnyMap(metadataJSON)
		templates = append(templates, tpl)
	}
	if templates == nil {
		templates = []WorkflowTemplate{}
	}
	return templates, nil
}

func (s *Store) GetWorkflowTemplate(id string) (*WorkflowTemplate, error) {
	var tpl WorkflowTemplate
	var triggersJSON, tagsJSON, previewJSON, metadataJSON string
	err := s.db.QueryRow(`
		SELECT id, project_id, name, description, trigger_examples,
		       category, tags, version, visibility, source, prompt, preview, metadata,
		       status, COALESCE(created_by, ''), created_at, updated_at
		FROM workflow_templates WHERE id = ?
	`, id).Scan(&tpl.ID, &tpl.ProjectID, &tpl.Name, &tpl.Description, &triggersJSON, &tpl.Category, &tagsJSON, &tpl.Version, &tpl.Visibility, &tpl.Source, &tpl.Prompt, &previewJSON, &metadataJSON, &tpl.Status, &tpl.CreatedBy, &tpl.CreatedAt, &tpl.UpdatedAt)
	if err != nil {
		return nil, err
	}
	tpl.TriggerExamples = decodeJSONStringSlice(triggersJSON)
	tpl.Tags = decodeJSONStringSlice(tagsJSON)
	tpl.Preview = decodeJSONAnyMap(previewJSON)
	tpl.Metadata = decodeJSONAnyMap(metadataJSON)
	steps, err := s.ListWorkflowTemplateSteps(id)
	if err != nil {
		return nil, err
	}
	tpl.Steps = steps
	return &tpl, nil
}

func (s *Store) UpdateWorkflowTemplate(id string, patch map[string]interface{}) (*WorkflowTemplate, error) {
	tpl, err := s.GetWorkflowTemplate(id)
	if err != nil || tpl == nil {
		return tpl, err
	}
	now := time.Now().UnixMilli()
	if v, ok := patch["name"].(string); ok && v != "" {
		tpl.Name = v
	}
	if v, ok := patch["description"].(string); ok {
		tpl.Description = v
	}
	if v, ok := patch["category"].(string); ok && v != "" {
		tpl.Category = v
	}
	if v := stringSliceFromAny(patch["tags"]); v != nil {
		tpl.Tags = v
	}
	if v, ok := patch["visibility"].(string); ok && v != "" {
		tpl.Visibility = v
	}
	if v, ok := patch["status"].(string); ok && v != "" {
		tpl.Status = v
	}
	if v, ok := patch["createdBy"].(string); ok {
		tpl.CreatedBy = v
	}
	if v, ok := patch["preview"].(map[string]interface{}); ok {
		tpl.Preview = v
	}
	if v, ok := patch["metadata"].(map[string]interface{}); ok {
		tpl.Metadata = v
	}
	tpl.Version += 1
	tpl.UpdatedAt = now
	_, err = s.db.Exec(`
		UPDATE workflow_templates
		SET name=?, description=?, category=?, tags=?, version=?, visibility=?, status=?, created_by=?, preview=?, metadata=?, updated_at=?
		WHERE id=?
	`, tpl.Name, tpl.Description, tpl.Category, mustJSON(tpl.Tags), tpl.Version, tpl.Visibility, tpl.Status, tpl.CreatedBy, mustJSON(tpl.Preview), mustJSON(tpl.Metadata), tpl.UpdatedAt, tpl.ID)
	if err != nil {
		return nil, err
	}
	return tpl, nil
}

func (s *Store) DeleteWorkflowTemplate(id string) (bool, error) {
	result, err := s.db.Exec(`DELETE FROM workflow_templates WHERE id = ?`, id)
	if err != nil {
		return false, err
	}
	n, _ := result.RowsAffected()
	return n > 0, nil
}

func (s *Store) CloneWorkflowTemplate(id, projectID, name string) (*WorkflowTemplate, error) {
	tpl, err := s.GetWorkflowTemplate(id)
	if err != nil || tpl == nil {
		return tpl, err
	}
	if projectID == "" {
		projectID = tpl.ProjectID
	}
	if name == "" {
		name = tpl.Name + " copy"
	}
	return s.CreateWorkflowTemplateRecord(WorkflowTemplateCreateInput{
		ProjectID:       projectID,
		Name:            name,
		Description:     tpl.Description,
		TriggerExamples: tpl.TriggerExamples,
		Category:        tpl.Category,
		Tags:            tpl.Tags,
		Visibility:      tpl.Visibility,
		Source:          "clone",
		CreatedBy:       tpl.CreatedBy,
		Preview:         tpl.Preview,
		Metadata:        tpl.Metadata,
		Steps:           tpl.Steps,
	})
}

func (s *Store) ListWorkflowTemplateSteps(templateID string) ([]WorkflowTemplateStep, error) {
	rows, err := s.db.Query(`
		SELECT id, template_id, name, step_type, depends_on, COALESCE(preferred_agent_id, ''),
		       COALESCE(preferred_role, ''), input_schema, output_schema, position, metadata
		FROM workflow_template_steps
		WHERE template_id = ?
		ORDER BY position ASC
	`, templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []WorkflowTemplateStep
	for rows.Next() {
		var step WorkflowTemplateStep
		var dependsJSON, inputJSON, outputJSON, metadataJSON string
		if err := rows.Scan(&step.ID, &step.TemplateID, &step.Name, &step.StepType, &dependsJSON, &step.PreferredAgentID, &step.PreferredRole, &inputJSON, &outputJSON, &step.Position, &metadataJSON); err != nil {
			continue
		}
		step.DependsOn = decodeJSONStringSlice(dependsJSON)
		step.InputSchema = decodeJSONMap(inputJSON)
		step.OutputSchema = decodeJSONMap(outputJSON)
		step.Metadata = decodeJSONMap(metadataJSON)
		steps = append(steps, step)
	}
	if steps == nil {
		steps = []WorkflowTemplateStep{}
	}
	return steps, nil
}

func (s *Store) StartWorkflowRun(templateID, startedBy string, inputPayload map[string]interface{}) (*WorkflowRun, error) {
	template, err := s.GetWorkflowTemplate(templateID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	run := &WorkflowRun{
		ID:           newWorkflowID(),
		TemplateID:   template.ID,
		ProjectID:    template.ProjectID,
		Status:       "running",
		StartedBy:    startedBy,
		InputPayload: inputPayload,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		INSERT INTO workflow_runs (id, template_id, project_id, status, started_by, current_gate_step_id, input_payload, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, run.ID, run.TemplateID, run.ProjectID, run.Status, run.StartedBy, run.CurrentGateStepID, mustJSON(run.InputPayload), run.CreatedAt, run.UpdatedAt); err != nil {
		return nil, err
	}

	run.Steps = make([]WorkflowStepRun, 0, len(template.Steps))
	for _, tplStep := range template.Steps {
		stepRun := WorkflowStepRun{
			ID:              newWorkflowID(),
			WorkflowRunID:   run.ID,
			StepTemplateID:  tplStep.ID,
			Name:            tplStep.Name,
			StepType:        tplStep.StepType,
			Status:          "pending",
			AssignedAgentID: tplStep.PreferredAgentID,
			DependsOn:       tplStep.DependsOn,
			Position:        tplStep.Position,
			UpdatedAt:       now,
		}
		if _, err := tx.Exec(`
			INSERT INTO workflow_step_runs
			(id, workflow_run_id, step_template_id, name, step_type, status, assigned_agent_id, task_id, result_json, error, depends_on, position, started_at, finished_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, stepRun.ID, stepRun.WorkflowRunID, stepRun.StepTemplateID, stepRun.Name, stepRun.StepType, stepRun.Status, stepRun.AssignedAgentID, stepRun.TaskID, mustJSON(stepRun.ResultJSON), stepRun.Error, mustJSON(stepRun.DependsOn), stepRun.Position, stepRun.StartedAt, stepRun.FinishedAt, stepRun.UpdatedAt); err != nil {
			return nil, err
		}
		run.Steps = append(run.Steps, stepRun)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return run, nil
}

func (s *Store) GetWorkflowRun(id string) (*WorkflowRun, error) {
	var run WorkflowRun
	var payloadJSON string
	err := s.db.QueryRow(`
		SELECT id, template_id, project_id, status, started_by, COALESCE(current_gate_step_id, ''), input_payload, created_at, updated_at
		FROM workflow_runs WHERE id = ?
	`, id).Scan(&run.ID, &run.TemplateID, &run.ProjectID, &run.Status, &run.StartedBy, &run.CurrentGateStepID, &payloadJSON, &run.CreatedAt, &run.UpdatedAt)
	if err != nil {
		return nil, err
	}
	run.InputPayload = decodeJSONMap(payloadJSON)
	steps, err := s.ListWorkflowStepRuns(id)
	if err != nil {
		return nil, err
	}
	run.Steps = steps
	return &run, nil
}

func (s *Store) ListWorkflowRuns(projectID string, limit int) ([]WorkflowRun, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := s.db.Query(`
		SELECT id, template_id, project_id, status, started_by, COALESCE(current_gate_step_id, ''), input_payload, created_at, updated_at
		FROM workflow_runs
		WHERE (? = '' OR project_id = ?)
		ORDER BY updated_at DESC
		LIMIT ?
	`, projectID, projectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []WorkflowRun
	for rows.Next() {
		var run WorkflowRun
		var payloadJSON string
		if err := rows.Scan(&run.ID, &run.TemplateID, &run.ProjectID, &run.Status, &run.StartedBy, &run.CurrentGateStepID, &payloadJSON, &run.CreatedAt, &run.UpdatedAt); err != nil {
			continue
		}
		run.InputPayload = decodeJSONMap(payloadJSON)
		runs = append(runs, run)
	}
	if runs == nil {
		runs = []WorkflowRun{}
	}
	return runs, nil
}

func (s *Store) ListWorkflowStepRuns(runID string) ([]WorkflowStepRun, error) {
	rows, err := s.db.Query(`
		SELECT id, workflow_run_id, step_template_id, name, step_type, status,
		       COALESCE(assigned_agent_id, ''), COALESCE(task_id, ''), result_json,
		       COALESCE(error, ''), depends_on, position, started_at, finished_at, updated_at
		FROM workflow_step_runs
		WHERE workflow_run_id = ?
		ORDER BY position ASC
	`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []WorkflowStepRun
	for rows.Next() {
		var step WorkflowStepRun
		var resultJSON, dependsJSON string
		if err := rows.Scan(&step.ID, &step.WorkflowRunID, &step.StepTemplateID, &step.Name, &step.StepType, &step.Status, &step.AssignedAgentID, &step.TaskID, &resultJSON, &step.Error, &dependsJSON, &step.Position, &step.StartedAt, &step.FinishedAt, &step.UpdatedAt); err != nil {
			continue
		}
		step.ResultJSON = decodeJSONMap(resultJSON)
		step.DependsOn = decodeJSONStringSlice(dependsJSON)
		steps = append(steps, step)
	}
	if steps == nil {
		steps = []WorkflowStepRun{}
	}
	return steps, nil
}

func (s *Store) UpdateWorkflowStepRun(id string, patch map[string]interface{}) error {
	step, run, err := s.getWorkflowStepRunWithRun(id)
	if err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	if v, ok := patch["status"].(string); ok && v != "" {
		step.Status = v
	}
	if v, ok := patch["assignedAgentId"].(string); ok {
		step.AssignedAgentID = v
	}
	if v, ok := patch["taskId"].(string); ok {
		step.TaskID = v
	}
	if v, ok := patch["error"].(string); ok {
		step.Error = v
	}
	if v, ok := patch["resultJson"].(map[string]interface{}); ok {
		step.ResultJSON = v
	}
	if v, ok := patch["startedAt"].(int64); ok {
		step.StartedAt = &v
	}
	if v, ok := patch["finishedAt"].(int64); ok {
		step.FinishedAt = &v
	}
	if _, err := s.db.Exec(`
		UPDATE workflow_step_runs
		SET status=?, assigned_agent_id=?, task_id=?, result_json=?, error=?, started_at=?, finished_at=?, updated_at=?
		WHERE id=?
	`, step.Status, step.AssignedAgentID, step.TaskID, mustJSON(step.ResultJSON), step.Error, step.StartedAt, step.FinishedAt, now, id); err != nil {
		return err
	}
	run.UpdatedAt = now
	run.Status = deriveWorkflowRunStatus(run.Steps, id, step.Status)
	if step.StepType == "human_approval" && step.Status == "waiting_approval" {
		run.CurrentGateStepID = step.ID
	} else if step.Status == "completed" && run.CurrentGateStepID == step.ID {
		run.CurrentGateStepID = ""
	}
	_, err = s.db.Exec(`UPDATE workflow_runs SET status=?, current_gate_step_id=?, updated_at=? WHERE id=?`, run.Status, run.CurrentGateStepID, run.UpdatedAt, run.ID)
	return err
}

func deriveWorkflowRunStatus(existing []WorkflowStepRun, targetID, targetStatus string) string {
	allCompleted := true
	hasFailed := false
	hasApproval := false
	for _, step := range existing {
		status := step.Status
		if step.ID == targetID {
			status = targetStatus
		}
		switch status {
		case "failed", "blocked":
			hasFailed = true
		case "waiting_approval":
			hasApproval = true
			allCompleted = false
		case "completed":
		default:
			allCompleted = false
		}
	}
	switch {
	case hasFailed:
		return "failed"
	case hasApproval:
		return "waiting_approval"
	case allCompleted:
		return "completed"
	default:
		return "running"
	}
}

func (s *Store) getWorkflowStepRunWithRun(id string) (*WorkflowStepRun, *WorkflowRun, error) {
	runs := WorkflowStepRun{}
	var resultJSON, dependsJSON string
	err := s.db.QueryRow(`
		SELECT id, workflow_run_id, step_template_id, name, step_type, status,
		       COALESCE(assigned_agent_id, ''), COALESCE(task_id, ''), result_json,
		       COALESCE(error, ''), depends_on, position, started_at, finished_at, updated_at
		FROM workflow_step_runs WHERE id = ?
	`, id).Scan(&runs.ID, &runs.WorkflowRunID, &runs.StepTemplateID, &runs.Name, &runs.StepType, &runs.Status, &runs.AssignedAgentID, &runs.TaskID, &resultJSON, &runs.Error, &dependsJSON, &runs.Position, &runs.StartedAt, &runs.FinishedAt, &runs.UpdatedAt)
	if err != nil {
		return nil, nil, err
	}
	runs.ResultJSON = decodeJSONMap(resultJSON)
	runs.DependsOn = decodeJSONStringSlice(dependsJSON)
	run, err := s.GetWorkflowRun(runs.WorkflowRunID)
	if err != nil {
		return nil, nil, err
	}
	return &runs, run, nil
}

func (s *Store) AddWorkflowReport(workflowRunID, stepRunID, agentID, reportKind, body string, payload map[string]interface{}) (*WorkflowReport, error) {
	now := time.Now().UnixMilli()
	if reportKind == "" {
		reportKind = "status"
	}
	report := &WorkflowReport{
		ID:            newWorkflowID(),
		WorkflowRunID: workflowRunID,
		StepRunID:     stepRunID,
		AgentID:       agentID,
		ReportKind:    reportKind,
		Body:          body,
		Payload:       payload,
		CreatedAt:     now,
	}
	_, err := s.db.Exec(`
		INSERT INTO workflow_reports (id, workflow_run_id, step_run_id, agent_id, report_kind, body, payload, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, report.ID, report.WorkflowRunID, report.StepRunID, report.AgentID, report.ReportKind, report.Body, mustJSON(report.Payload), report.CreatedAt)
	if err != nil {
		return nil, err
	}
	return report, nil
}

func (s *Store) ListWorkflowReports(workflowRunID string, limit int) ([]WorkflowReport, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(`
		SELECT id, workflow_run_id, COALESCE(step_run_id, ''), COALESCE(agent_id, ''),
		       report_kind, body, payload, created_at
		FROM workflow_reports
		WHERE workflow_run_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`, workflowRunID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var reports []WorkflowReport
	for rows.Next() {
		var report WorkflowReport
		var payloadJSON string
		if err := rows.Scan(&report.ID, &report.WorkflowRunID, &report.StepRunID, &report.AgentID, &report.ReportKind, &report.Body, &payloadJSON, &report.CreatedAt); err != nil {
			continue
		}
		report.Payload = decodeJSONMap(payloadJSON)
		reports = append(reports, report)
	}
	if reports == nil {
		reports = []WorkflowReport{}
	}
	return reports, nil
}

func (s *Store) SaveWorkflowGraph(projectID, templateID string, graph map[string]interface{}) (*WorkflowGraph, error) {
	now := time.Now().UnixMilli()
	if graph == nil {
		graph = map[string]interface{}{"nodes": []interface{}{}, "edges": []interface{}{}}
	}
	var existing WorkflowGraph
	err := s.db.QueryRow(`
		SELECT id, project_id, template_id, graph_json, version, created_at, updated_at
		FROM workflow_graphs
		WHERE (? = '' OR project_id = ?) AND (? = '' OR template_id = ?)
		ORDER BY updated_at DESC
		LIMIT 1
	`, projectID, projectID, templateID, templateID).Scan(&existing.ID, &existing.ProjectID, &existing.TemplateID, new(string), &existing.Version, &existing.CreatedAt, &existing.UpdatedAt)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == nil && existing.ID != "" {
		existing.Version += 1
		existing.Graph = graph
		existing.UpdatedAt = now
		_, err = s.db.Exec(`
			UPDATE workflow_graphs
			SET graph_json = ?, version = ?, updated_at = ?
			WHERE id = ?
		`, mustJSON(graph), existing.Version, existing.UpdatedAt, existing.ID)
		if err != nil {
			return nil, err
		}
		return &existing, nil
	}
	record := &WorkflowGraph{
		ID:         newWorkflowID(),
		ProjectID:  projectID,
		TemplateID: templateID,
		Graph:      graph,
		Version:    1,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	_, err = s.db.Exec(`
		INSERT INTO workflow_graphs (id, project_id, template_id, graph_json, version, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, record.ID, record.ProjectID, record.TemplateID, mustJSON(record.Graph), record.Version, record.CreatedAt, record.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return record, nil
}

func (s *Store) GetWorkflowGraph(projectID, templateID string) (*WorkflowGraph, error) {
	var record WorkflowGraph
	var graphJSON string
	err := s.db.QueryRow(`
		SELECT id, project_id, template_id, graph_json, version, created_at, updated_at
		FROM workflow_graphs
		WHERE (? = '' OR project_id = ?) AND (? = '' OR template_id = ?)
		ORDER BY updated_at DESC
		LIMIT 1
	`, projectID, projectID, templateID, templateID).Scan(&record.ID, &record.ProjectID, &record.TemplateID, &graphJSON, &record.Version, &record.CreatedAt, &record.UpdatedAt)
	if err != nil {
		return nil, err
	}
	record.Graph = decodeJSONAnyMap(graphJSON)
	return &record, nil
}

func (s *Store) ListWorkflowComponents(kind, category string) ([]WorkflowComponent, error) {
	rows, err := s.db.Query(`
		SELECT id, kind, name, description, icon, category, spec_json, tags, source, created_at, updated_at
		FROM workflow_components
		WHERE (? = '' OR kind = ?) AND (? = '' OR category = ?)
		ORDER BY category ASC, name ASC
	`, kind, kind, category, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var components []WorkflowComponent
	for rows.Next() {
		var component WorkflowComponent
		var specJSON, tagsJSON string
		if err := rows.Scan(&component.ID, &component.Kind, &component.Name, &component.Description, &component.Icon, &component.Category, &specJSON, &tagsJSON, &component.Source, &component.CreatedAt, &component.UpdatedAt); err != nil {
			continue
		}
		component.Spec = decodeJSONAnyMap(specJSON)
		component.Tags = decodeJSONStringSlice(tagsJSON)
		components = append(components, component)
	}
	if components == nil {
		components = []WorkflowComponent{}
	}
	return components, nil
}

func (s *Store) SaveWorkflowChartSpec(spec WorkflowChartSpec) (*WorkflowChartSpec, error) {
	now := time.Now().UnixMilli()
	if spec.ID == "" {
		spec.ID = newWorkflowID()
		spec.CreatedAt = now
	}
	if spec.ChartType == "" {
		spec.ChartType = "bar"
	}
	if spec.DataSource == nil {
		spec.DataSource = map[string]interface{}{}
	}
	if spec.Config == nil {
		spec.Config = map[string]interface{}{}
	}
	spec.UpdatedAt = now
	_, err := s.db.Exec(`
		INSERT INTO workflow_chart_specs
			(id, project_id, template_id, step_id, name, chart_type, data_source, config_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			project_id = excluded.project_id,
			template_id = excluded.template_id,
			step_id = excluded.step_id,
			name = excluded.name,
			chart_type = excluded.chart_type,
			data_source = excluded.data_source,
			config_json = excluded.config_json,
			updated_at = excluded.updated_at
	`, spec.ID, spec.ProjectID, spec.TemplateID, spec.StepID, spec.Name, spec.ChartType, mustJSON(spec.DataSource), mustJSON(spec.Config), spec.CreatedAt, spec.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &spec, nil
}

func (s *Store) ListWorkflowChartSpecs(projectID, templateID, stepID string) ([]WorkflowChartSpec, error) {
	rows, err := s.db.Query(`
		SELECT id, project_id, template_id, step_id, name, chart_type, data_source, config_json, created_at, updated_at
		FROM workflow_chart_specs
		WHERE (? = '' OR project_id = ?)
		  AND (? = '' OR template_id = ?)
		  AND (? = '' OR step_id = ?)
		ORDER BY updated_at DESC
	`, projectID, projectID, templateID, templateID, stepID, stepID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var specs []WorkflowChartSpec
	for rows.Next() {
		var spec WorkflowChartSpec
		var dataJSON, configJSON string
		if err := rows.Scan(&spec.ID, &spec.ProjectID, &spec.TemplateID, &spec.StepID, &spec.Name, &spec.ChartType, &dataJSON, &configJSON, &spec.CreatedAt, &spec.UpdatedAt); err != nil {
			continue
		}
		spec.DataSource = decodeJSONAnyMap(dataJSON)
		spec.Config = decodeJSONAnyMap(configJSON)
		specs = append(specs, spec)
	}
	if specs == nil {
		specs = []WorkflowChartSpec{}
	}
	return specs, nil
}

func (s *Store) SaveWorkflowDraft(draft WorkflowDraft) (*WorkflowDraft, error) {
	now := time.Now().UnixMilli()
	if draft.ID == "" {
		draft.ID = newWorkflowID()
		draft.CreatedAt = now
	}
	if draft.Source == "" {
		draft.Source = "agent_json"
	}
	if draft.Draft == nil {
		draft.Draft = map[string]interface{}{}
	}
	if draft.Warnings == nil {
		draft.Warnings = []string{}
	}
	if draft.Status == "" {
		draft.Status = "draft"
	}
	draft.UpdatedAt = now
	_, err := s.db.Exec(`
		INSERT INTO workflow_drafts
			(id, project_id, template_id, name, source, draft_json, warnings, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			project_id = excluded.project_id,
			template_id = excluded.template_id,
			name = excluded.name,
			source = excluded.source,
			draft_json = excluded.draft_json,
			warnings = excluded.warnings,
			status = excluded.status,
			updated_at = excluded.updated_at
	`, draft.ID, draft.ProjectID, draft.TemplateID, draft.Name, draft.Source, mustJSON(draft.Draft), mustJSON(draft.Warnings), draft.Status, draft.CreatedAt, draft.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &draft, nil
}

func (s *Store) ListWorkflowDrafts(projectID, status string) ([]WorkflowDraft, error) {
	rows, err := s.db.Query(`
		SELECT id, project_id, template_id, name, source, draft_json, warnings, status, created_at, updated_at
		FROM workflow_drafts
		WHERE (? = '' OR project_id = ?) AND (? = '' OR status = ?)
		ORDER BY updated_at DESC
	`, projectID, projectID, status, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var drafts []WorkflowDraft
	for rows.Next() {
		var draft WorkflowDraft
		var draftJSON, warningsJSON string
		if err := rows.Scan(&draft.ID, &draft.ProjectID, &draft.TemplateID, &draft.Name, &draft.Source, &draftJSON, &warningsJSON, &draft.Status, &draft.CreatedAt, &draft.UpdatedAt); err != nil {
			continue
		}
		draft.Draft = decodeJSONAnyMap(draftJSON)
		draft.Warnings = decodeJSONStringSlice(warningsJSON)
		drafts = append(drafts, draft)
	}
	if drafts == nil {
		drafts = []WorkflowDraft{}
	}
	return drafts, nil
}

func (s *Store) GetWorkflowDraft(id string) (*WorkflowDraft, error) {
	var draft WorkflowDraft
	var draftJSON, warningsJSON string
	err := s.db.QueryRow(`
		SELECT id, project_id, template_id, name, source, draft_json, warnings, status, created_at, updated_at
		FROM workflow_drafts
		WHERE id = ?
	`, id).Scan(&draft.ID, &draft.ProjectID, &draft.TemplateID, &draft.Name, &draft.Source, &draftJSON, &warningsJSON, &draft.Status, &draft.CreatedAt, &draft.UpdatedAt)
	if err != nil {
		return nil, err
	}
	draft.Draft = decodeJSONAnyMap(draftJSON)
	draft.Warnings = decodeJSONStringSlice(warningsJSON)
	return &draft, nil
}
