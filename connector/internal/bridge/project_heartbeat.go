package bridge

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

var (
	sessionPartPattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	fencedJSONPattern  = regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)\\s*```")
	keywordPattern     = regexp.MustCompile(`[a-zA-Z0-9]+`)
)

const (
	projectHeartbeatPromptVersion = "project-heartbeat-v1"
	projectTaskPromptVersion      = "project-task-dispatch-v1"
)

type teammateProfile struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Role           string `json:"role,omitempty"`
	Runtime        string `json:"runtime,omitempty"`
	Status         string `json:"status,omitempty"`
	Responsibility string `json:"responsibility,omitempty"`
	SoulSummary    string `json:"soulSummary,omitempty"`
}

type leadAssignment struct {
	TaskID  string `json:"taskId"`
	AgentID string `json:"agentId"`
	Reason  string `json:"reason,omitempty"`
}

type runtimeOutcome struct {
	Status    string   `json:"status"`
	Summary   string   `json:"summary"`
	Blocker   string   `json:"blocker"`
	Artifacts []string `json:"artifacts"`
}

func (b *BridgeHandler) projectLeadHeartbeat(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	projectID, _ := params["projectId"].(string)
	if projectID == "" {
		return errResultStatus("projectId is required", 400)
	}
	maxIssues := int(toFloat(params["maxIssues"], 5))
	if maxIssues <= 0 {
		maxIssues = 5
	}

	project, err := b.store.GetProjectWithMembers(projectID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}
	if project == nil {
		return errResultStatus("project not found", 404)
	}
	tasks, err := b.store.ListTasksByProject(projectID)
	if err != nil {
		return errResultStatus("db error: "+err.Error(), 500)
	}

	profiles, profileByID := b.loadProjectTeammateProfiles(project.Members)
	deletedMateIDs := deletedProjectMateIDs(project.Members, profileByID)
	cleanup := b.cleanupDeletedProjectMates(project, tasks, deletedMateIDs)
	if cleanup.LeadChanged {
		project.LeadAgentID = ""
	}
	if cleanup.ResetAssignments > 0 {
		if freshTasks, err := b.store.ListTasksByProject(projectID); err == nil {
			tasks = freshTasks
		}
	}
	memberIDs := projectMemberIDSet(project.Members)
	candidateSource := "project"
	if len(profiles) == 0 {
		profiles, profileByID = b.loadTeamTeammateProfiles()
		if len(profiles) > 0 {
			candidateSource = "team"
		} else {
			candidateSource = "none"
		}
	}

	openIssues := openUnassignedIssues(tasks)
	if len(openIssues) > maxIssues {
		openIssues = openIssues[:maxIssues]
	}

	leadID := project.LeadAgentID
	leadReason := ""
	if leadID == "" || profileByID[leadID] == nil {
		missingLeadID := leadID
		best := chooseBestFitLead(*project, tasks, profiles)
		if best != nil {
			leadID = best.ID
			leadReason = best.Reason
			enabled := true
			if updated, err := b.store.UpdateProject(project.ID, "", "", "", "", &leadID, &enabled, nil); err == nil && updated != nil {
				project.LeadAgentID = updated.LeadAgentID
			}
			_ = b.store.AddProjectMember(project.ID, leadID, "lead")
			memberIDs[leadID] = true
			_, _ = b.store.AppendTaskLog(project.ID, leadID, "project-heartbeat", "Rotated project lead: "+leadReason, map[string]interface{}{
				"source":    "project-lead-heartbeat",
				"leadAgent": leadID,
			})
		} else if missingLeadID != "" {
			empty := ""
			leadID = ""
			leadReason = "no available project teammate to promote"
			if updated, err := b.store.UpdateProject(project.ID, "", "", "", "", &empty, nil, nil); err == nil && updated != nil {
				project.LeadAgentID = ""
			}
			_, _ = b.store.AppendTaskLog(project.ID, "", "project-heartbeat", "Cleared missing project lead; no available teammate to promote.", map[string]interface{}{
				"source":             "project-lead-heartbeat",
				"missingLeadAgentId": missingLeadID,
			})
		}
	}

	assignments := []leadAssignment{}
	if len(openIssues) > 0 && leadID != "" && profileByID[leadID] != nil {
		assignments = b.askLeadForAssignments(*project, leadID, openIssues, profiles)
	}
	if len(assignments) == 0 && len(openIssues) > 0 {
		assignments = fallbackAssignments(*project, openIssues, profiles)
	}

	applied := []map[string]interface{}{}
	dispatches := []map[string]interface{}{}
	for _, assignment := range assignments {
		task := taskByID(openIssues, assignment.TaskID)
		if task == nil {
			continue
		}
		profile := profileByID[assignment.AgentID]
		if profile == nil {
			fallback := chooseBestFitAssignee(*project, task, profiles)
			if fallback == nil {
				continue
			}
			assignment.AgentID = fallback.ID
			if assignment.Reason == "" {
				assignment.Reason = fallback.Reason
			}
		}
		assigneeName := assignment.AgentID
		if profileByID[assignment.AgentID] != nil {
			assigneeName = profileByID[assignment.AgentID].Name
		}
		if !memberIDs[assignment.AgentID] {
			role := projectMemberRoleForAssignment(assignment.AgentID, leadID)
			_ = b.store.AddProjectMember(project.ID, assignment.AgentID, role)
			memberIDs[assignment.AgentID] = true
		}
		patch := map[string]interface{}{
			"assignedAgentId": assignment.AgentID,
			"assignedAgent":   assigneeName,
			"status":          "in_progress",
		}
		updated, err := b.store.UpdateTask(assignment.TaskID, patch)
		if err != nil {
			log.Printf("[project-heartbeat] update task %s: %v", assignment.TaskID, err)
			continue
		}
		_, _ = b.store.AppendTaskLog(assignment.TaskID, leadID, "project-heartbeat", "Assigned task to "+assigneeName, map[string]interface{}{
			"source":        "project-lead-heartbeat",
			"assigneeAgent": assignment.AgentID,
			"reason":        assignment.Reason,
			"promptVersion": projectHeartbeatPromptVersion,
		})
		applied = append(applied, map[string]interface{}{
			"taskId":  assignment.TaskID,
			"agentId": assignment.AgentID,
			"reason":  assignment.Reason,
			"task":    updated,
		})

		dispatchResult := b.projectTaskDispatch(map[string]interface{}{
			"projectId": project.ID,
			"taskId":    assignment.TaskID,
			"agentId":   assignment.AgentID,
		})
		if dispatchResult.err != nil {
			dispatches = append(dispatches, map[string]interface{}{
				"taskId":  assignment.TaskID,
				"agentId": assignment.AgentID,
				"success": false,
				"error":   dispatchResult.err.Error(),
			})
		} else {
			if data, ok := dispatchResult.data.(map[string]interface{}); ok {
				dispatches = append(dispatches, data)
			} else {
				dispatches = append(dispatches, map[string]interface{}{
					"taskId":  assignment.TaskID,
					"agentId": assignment.AgentID,
					"success": false,
					"error":   "unexpected dispatch result type",
				})
			}
		}
	}

	return okResult(map[string]interface{}{
		"success":         true,
		"projectId":       project.ID,
		"leadAgentId":     project.LeadAgentID,
		"leadReason":      leadReason,
		"deletedMateIds":  deletedMateIDs,
		"cleanup":         cleanup,
		"candidateSource": candidateSource,
		"openIssueCount":  len(openIssues),
		"assignments":     applied,
		"dispatches":      dispatches,
		"heartbeatAt":     time.Now().UnixMilli(),
		"promptVersion":   projectHeartbeatPromptVersion,
	})
}

func (b *BridgeHandler) projectTaskDispatch(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 503)
	}
	taskID, _ := params["taskId"].(string)
	projectID, _ := params["projectId"].(string)
	agentID, _ := params["agentId"].(string)
	if taskID == "" {
		return errResultStatus("taskId is required", 400)
	}
	task, err := b.findTask(taskID, projectID)
	if err != nil {
		return errResultStatus(err.Error(), 404)
	}
	if agentID == "" {
		agentID = taskAssigneeID(task)
	}
	if agentID == "" {
		return errResultStatus("agentId or task assignee is required", 400)
	}
	project := store.Project{ID: projectID, Name: projectID}
	if projectID != "" {
		if p, err := b.store.GetProjectWithMembers(projectID); err == nil && p != nil {
			project = *p
		}
	}
	identity, err := b.store.GetAgentIdentity(agentID)
	if err != nil {
		return errResultStatus("agent lookup failed: "+err.Error(), 500)
	}
	if identity == nil {
		return errResultStatus("agent not found", 404)
	}
	profile := b.profileForIdentity(*identity)
	runtime := profile.Runtime
	if runtime == "" {
		runtime = "openclaw"
	}
	sessionKey := b.resolveTaskSessionKey(taskID, agentID, project.ID)
	prompt := buildTaskDispatchPrompt(project, task, profile, runtime)
	result := b.dispatchRuntimeTask(runtime, agentID, prompt, sessionKey)
	if result["sessionId"] != nil {
		if sid, ok := result["sessionId"].(string); ok && sid != "" {
			_ = b.store.KVSet(nativeTaskSessionKey(sessionKey), sid)
		}
	}
	_ = b.store.LinkTaskSession(taskID, sessionKey)

	content, _ := result["content"].(string)
	outcome := parseRuntimeOutcome(content)
	if ok, _ := result["success"].(bool); !ok {
		outcome.Status = "blocked"
		outcome.Blocker = stringFromResult(result["error"], "Runtime dispatch failed.")
		if outcome.Summary == "" {
			outcome.Summary = "Runtime dispatch failed."
		}
	}
	nextStatus := mapOutcomeStatus(outcome)
	patch := map[string]interface{}{"status": nextStatus}
	if nextStatus == "completed" {
		patch["finishedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	}
	updated, _ := b.store.UpdateTask(taskID, patch)
	_, _ = b.store.AppendTaskLog(taskID, agentID, "dispatch", outcome.Summary, map[string]interface{}{
		"source":        "project-task-dispatch",
		"runtime":       runtime,
		"sessionKey":    sessionKey,
		"promptVersion": projectTaskPromptVersion,
		"status":        outcome.Status,
		"blocker":       outcome.Blocker,
		"artifacts":     outcome.Artifacts,
		"result":        result,
	})

	return okResult(map[string]interface{}{
		"success":       result["success"],
		"taskId":        taskID,
		"agentId":       agentID,
		"runtime":       runtime,
		"sessionKey":    sessionKey,
		"outcome":       outcome,
		"taskStatus":    nextStatus,
		"task":          updated,
		"promptVersion": projectTaskPromptVersion,
		"content":       content,
	})
}

type cleanupSummary struct {
	DeletedMateIDs   []string `json:"deletedMateIds"`
	RemovedMembers   int      `json:"removedMembers"`
	ResetAssignments int      `json:"resetAssignments"`
	LeadChanged      bool     `json:"leadChanged"`
}

func (b *BridgeHandler) cleanupDeletedProjectMates(project *store.Project, tasks []map[string]interface{}, deletedIDs []string) cleanupSummary {
	summary := cleanupSummary{DeletedMateIDs: deletedIDs}
	deleted := map[string]bool{}
	for _, id := range deletedIDs {
		deleted[id] = true
		if removed, err := b.store.RemoveProjectMember(project.ID, id); err == nil && removed {
			summary.RemovedMembers++
		}
		if id == project.LeadAgentID {
			empty := ""
			if updated, err := b.store.UpdateProject(project.ID, "", "", "", "", &empty, nil, nil); err == nil && updated != nil {
				project.LeadAgentID = ""
				summary.LeadChanged = true
			}
		}
	}
	for _, task := range tasks {
		assignee := taskAssigneeID(task)
		status := taskStatus(task)
		if deleted[assignee] && (status == "pending" || status == "in_progress") {
			id := taskMapID(task)
			if id == "" {
				continue
			}
			_, err := b.store.UpdateTask(id, map[string]interface{}{
				"assignedAgentId": "",
				"assignedAgent":   "",
				"status":          "pending",
			})
			if err == nil {
				summary.ResetAssignments++
				_, _ = b.store.AppendTaskLog(id, "", "project-heartbeat", "Reset task because assigned teammate was deleted.", map[string]interface{}{
					"source":         "project-lead-heartbeat",
					"deletedAgentId": assignee,
				})
			}
		}
	}
	return summary
}

func (b *BridgeHandler) dispatchRuntimeTask(runtime, agentID, prompt, sessionKey string) map[string]interface{} {
	nativeSession, _ := b.store.KVGet(nativeTaskSessionKey(sessionKey))
	switch RuntimeType(runtime) {
	case RuntimeClaude:
		result := b.Dispatch("claude-code-send", map[string]interface{}{
			"message":    prompt,
			"agentId":    agentID,
			"sessionKey": sessionKey,
			"sessionId":  nativeSession,
		})
		return normalizeDispatchResult(result)
	case RuntimeCodex:
		result := b.Dispatch("codex-send", map[string]interface{}{
			"message":    prompt,
			"agentId":    agentID,
			"sessionKey": sessionKey,
			"sessionId":  nativeSession,
		})
		return normalizeDispatchResult(result)
	case RuntimeHermes:
		result := b.Dispatch("hermes-chat", map[string]interface{}{
			"messages": []interface{}{
				map[string]interface{}{"role": "user", "content": prompt},
			},
			"agentId":    agentID,
			"sessionKey": sessionKey,
			"sessionId":  nativeSession,
		})
		return normalizeDispatchResult(result)
	default:
		adapter := ResolveAdapter(RuntimeOpenClaw, b.paths)
		if adapter == nil {
			return map[string]interface{}{"success": false, "error": "openclaw runtime is not available"}
		}
		personality := LoadAgentPersonality(b.paths.AgentDir(string(RuntimeOpenClaw), agentID), agentID)
		var run AgentRunResult
		if sa, ok := adapter.(SessionAwareAdapter); ok {
			run = sa.RunTaskInSession(agentID, prompt, personality, sessionKey)
		} else {
			run = adapter.RunTask(agentID, prompt, personality)
		}
		return map[string]interface{}{
			"success":   run.Success,
			"content":   run.Content,
			"sessionId": run.SessionID,
			"runtime":   run.Runtime,
			"mode":      run.Mode,
			"error":     run.Error,
		}
	}
}

func normalizeDispatchResult(result interface{}) map[string]interface{} {
	out := map[string]interface{}{"success": false}
	if m, ok := result.(map[string]interface{}); ok {
		for k, v := range m {
			out[k] = v
		}
		if content, ok := m["content"].(string); ok && content != "" {
			out["content"] = content
		} else if response, ok := m["response"].(string); ok && response != "" {
			out["content"] = response
		} else if messages, ok := m["messages"].([]interface{}); ok {
			out["content"] = lastAssistantContent(messages)
		}
		if _, ok := m["success"]; !ok {
			out["success"] = m["error"] == nil
		}
		return out
	}
	out["error"] = fmt.Sprintf("unexpected runtime result: %T", result)
	return out
}

func lastAssistantContent(messages []interface{}) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg, ok := messages[i].(map[string]interface{})
		if !ok {
			continue
		}
		role, _ := msg["role"].(string)
		if role != "assistant" {
			continue
		}
		if content, ok := msg["content"].(string); ok {
			return content
		}
	}
	return ""
}

func (b *BridgeHandler) resolveTaskSessionKey(taskID, agentID, projectID string) string {
	if sessions, err := b.store.GetTaskSessions(taskID, agentID); err == nil {
		for _, session := range sessions {
			if session.AgentID != nil && *session.AgentID != "" && !strings.EqualFold(*session.AgentID, agentID) {
				continue
			}
			if session.SessionKey != "" {
				return session.SessionKey
			}
		}
	}
	return fmt.Sprintf("agent:%s:project:%s:task:%s", sanitizeSessionPart(agentID), sanitizeSessionPart(projectID), sanitizeSessionPart(taskID))
}

func nativeTaskSessionKey(sessionKey string) string {
	return "project-task-native-session:" + sessionKey
}

func sanitizeSessionPart(value string) string {
	clean := sessionPartPattern.ReplaceAllString(value, "-")
	return strings.Trim(clean, "-")
}

func projectMemberIDSet(members []store.ProjectMember) map[string]bool {
	ids := make(map[string]bool, len(members))
	for _, member := range members {
		ids[member.AgentID] = true
	}
	return ids
}

func projectMemberRoleForAssignment(agentID, leadID string) string {
	if agentID != "" && agentID == leadID {
		return "lead"
	}
	return "contributor"
}

func (b *BridgeHandler) findTask(taskID, projectID string) (map[string]interface{}, error) {
	var tasks []map[string]interface{}
	var err error
	if projectID != "" {
		tasks, err = b.store.ListTasksByProject(projectID)
	} else {
		tasks, err = b.store.GetTasks()
	}
	if err != nil {
		return nil, err
	}
	for _, task := range tasks {
		if taskMapID(task) == taskID || stringTaskField(task, "_id", "id") == taskID {
			return task, nil
		}
	}
	return nil, fmt.Errorf("task not found: %s", taskID)
}

func (b *BridgeHandler) loadProjectTeammateProfiles(members []store.ProjectMember) ([]teammateProfile, map[string]*teammateProfile) {
	profiles := make([]teammateProfile, 0, len(members))
	for _, member := range members {
		identity, _ := b.store.GetAgentIdentity(member.AgentID)
		if identity == nil {
			continue
		}
		profile := b.profileForIdentity(*identity)
		if member.Role != "" && profile.Role == "" {
			profile.Role = member.Role
		}
		profiles = append(profiles, profile)
	}
	return profiles, indexTeammateProfiles(profiles)
}

func (b *BridgeHandler) loadTeamTeammateProfiles() ([]teammateProfile, map[string]*teammateProfile) {
	identities, err := b.store.ListAgentIdentities()
	if err != nil {
		return nil, map[string]*teammateProfile{}
	}
	profiles := make([]teammateProfile, 0, len(identities))
	for _, identity := range identities {
		profile := b.profileForIdentity(identity)
		if strings.EqualFold(profile.Status, "deleting") {
			continue
		}
		profiles = append(profiles, profile)
	}
	return profiles, indexTeammateProfiles(profiles)
}

func indexTeammateProfiles(profiles []teammateProfile) map[string]*teammateProfile {
	byID := make(map[string]*teammateProfile, len(profiles))
	for i := range profiles {
		byID[profiles[i].ID] = &profiles[i]
	}
	return byID
}

func (b *BridgeHandler) profileForIdentity(identity store.AgentIdentity) teammateProfile {
	runtime := identity.Runtime
	if runtime == "" {
		runtime = "openclaw"
	}
	agent, _ := b.store.GetAgent(identity.ID)
	role := identity.Role
	status := ""
	if agent != nil {
		if role == "" {
			role = agent.Role
		}
		status = agent.Status
	}
	personality := LoadAgentPersonality(b.paths.AgentDir(runtime, identity.ID), identity.ID)
	if strings.TrimSpace(personality.Soul) == "" {
		personality = LoadAgentPersonality(b.paths.LegacyAgentDir(identity.ID), identity.ID)
	}
	return teammateProfile{
		ID:             identity.ID,
		Name:           firstNonEmpty(identity.Name, identity.ID),
		Role:           role,
		Runtime:        runtime,
		Status:         status,
		Responsibility: role,
		SoulSummary:    compactText(strings.Join([]string{personality.Soul, personality.Identity, personality.Heartbeat}, "\n"), 900),
	}
}

func deletedProjectMateIDs(members []store.ProjectMember, profiles map[string]*teammateProfile) []string {
	var deleted []string
	seen := map[string]bool{}
	for _, member := range members {
		profile := profiles[member.AgentID]
		if profile == nil || strings.EqualFold(profile.Status, "deleting") {
			if !seen[member.AgentID] {
				deleted = append(deleted, member.AgentID)
				seen[member.AgentID] = true
			}
		}
	}
	return deleted
}

func openUnassignedIssues(tasks []map[string]interface{}) []map[string]interface{} {
	var open []map[string]interface{}
	for _, task := range tasks {
		if taskStatus(task) == "pending" && taskAssigneeID(task) == "" {
			open = append(open, task)
		}
	}
	return open
}

type scoredProfile struct {
	ID     string
	Score  int
	Reason string
}

func chooseBestFitLead(project store.Project, tasks []map[string]interface{}, profiles []teammateProfile) *scoredProfile {
	return chooseBestFit(project, tasks, profiles, true)
}

func chooseBestFitAssignee(project store.Project, task map[string]interface{}, profiles []teammateProfile) *scoredProfile {
	return chooseBestFit(project, []map[string]interface{}{task}, profiles, false)
}

func chooseBestFit(project store.Project, tasks []map[string]interface{}, profiles []teammateProfile, preferLeadRole bool) *scoredProfile {
	best := (*scoredProfile)(nil)
	candidates := append([]teammateProfile(nil), profiles...)
	sortProfilesByID(candidates)
	corpus := project.Name + "\n" + project.Description + "\n"
	for _, task := range tasks {
		corpus += taskTitle(task) + "\n" + taskDescription(task) + "\n"
	}
	for _, profile := range candidates {
		if strings.EqualFold(profile.Status, "deleting") {
			continue
		}
		score := keywordScore(corpus, strings.Join([]string{profile.Name, profile.Role, profile.Responsibility, profile.SoulSummary}, "\n"))
		role := strings.ToLower(profile.Role)
		if preferLeadRole && (strings.Contains(role, "lead") || strings.Contains(role, "manager") || strings.Contains(role, "orchestrat")) {
			score += 3
		}
		if score == 0 {
			score = 1
		}
		reason := fmt.Sprintf("best available match for project issues using role %q", profile.Role)
		if best == nil || score > best.Score {
			best = &scoredProfile{ID: profile.ID, Score: score, Reason: reason}
		}
	}
	return best
}

func fallbackAssignments(project store.Project, issues []map[string]interface{}, profiles []teammateProfile) []leadAssignment {
	assignments := make([]leadAssignment, 0, len(issues))
	for _, issue := range issues {
		best := chooseBestFitAssignee(project, issue, profiles)
		if best == nil {
			continue
		}
		assignments = append(assignments, leadAssignment{
			TaskID:  taskMapID(issue),
			AgentID: best.ID,
			Reason:  best.Reason,
		})
	}
	return assignments
}

func (b *BridgeHandler) askLeadForAssignments(project store.Project, leadID string, issues []map[string]interface{}, profiles []teammateProfile) []leadAssignment {
	prompt := buildLeadAssignmentPrompt(project, issues, profiles)
	sessionKey := fmt.Sprintf("agent:%s:project:%s:lead-heartbeat", sanitizeSessionPart(leadID), sanitizeSessionPart(project.ID))
	profile := teammateProfile{ID: leadID, Runtime: "openclaw"}
	for _, candidate := range profiles {
		if candidate.ID == leadID {
			profile = candidate
			break
		}
	}
	result := b.dispatchRuntimeTask(profile.Runtime, leadID, prompt, sessionKey)
	content, _ := result["content"].(string)
	assignments := parseLeadAssignments(content)
	if sid, ok := result["sessionId"].(string); ok && sid != "" {
		_ = b.store.KVSet(nativeTaskSessionKey(sessionKey), sid)
	}
	return assignments
}

func buildLeadAssignmentPrompt(project store.Project, issues []map[string]interface{}, profiles []teammateProfile) string {
	payload := map[string]interface{}{
		"project": map[string]interface{}{
			"id":          project.ID,
			"name":        project.Name,
			"description": project.Description,
		},
		"issues":    issuesForPrompt(issues),
		"teammates": profiles,
	}
	data, _ := json.MarshalIndent(payload, "", "  ")
	return fmt.Sprintf(`You are the lead agent for this HyperClaw project.

Assign every open issue to the best project teammate. Use teammate responsibilities, role, runtime, and soul/personality summary. Do not assign to deleted, missing, or unavailable teammates.

Return ONLY JSON with this shape:
{
  "assignments": [
    { "taskId": "task id", "agentId": "teammate id", "reason": "short reason" }
  ]
}

Project assignment context:
%s`, string(data))
}

func buildTaskDispatchPrompt(project store.Project, task map[string]interface{}, assignee teammateProfile, runtime string) string {
	taskType := classifyTask(task, assignee)
	contract := `{ "status": "completed" | "blocked" | "in_progress", "summary": string, "blocker": string | null, "artifacts": string[] }`
	return fmt.Sprintf(`You are %s (%s). Start executing this assigned HyperClaw project issue now.

Project:
- id: %s
- name: %s
- description: %s

Issue:
- id: %s
- title: %s
- status: %s
- detail:
%s

Your responsibility/profile:
%s

Execution mode: %s
Runtime: %s

Instructions:
- Work in the way that best fits your runtime and responsibility.
- If this is implementation/code work, make the concrete code or file changes required and summarize artifacts.
- If this is research/planning work, produce concise findings and recommended next action.
- If you need a human decision, credential, approval, or missing input, stop and mark blocked with the exact blocker.
- Do not wait for another instruction before starting.

End your response with one JSON object on its own line using exactly this contract:
%s`, assignee.Name, assignee.ID, project.ID, project.Name, project.Description, taskMapID(task), taskTitle(task), taskStatus(task), taskDescription(task), compactText(assignee.SoulSummary, 1200), taskType, runtime, contract)
}

func parseLeadAssignments(raw string) []leadAssignment {
	var wrapper struct {
		Assignments []leadAssignment `json:"assignments"`
	}
	if parseJSONFromText(raw, &wrapper) && len(wrapper.Assignments) > 0 {
		return wrapper.Assignments
	}
	var direct []leadAssignment
	if parseJSONFromText(raw, &direct) {
		return direct
	}
	return nil
}

func parseRuntimeOutcome(raw string) runtimeOutcome {
	out := runtimeOutcome{Status: "in_progress", Summary: strings.TrimSpace(raw)}
	var parsed runtimeOutcome
	if parseJSONFromText(raw, &parsed) {
		if parsed.Status != "" {
			out = parsed
		}
	}
	if out.Summary == "" {
		out.Summary = "Agent started the task."
	}
	return out
}

func parseJSONFromText(raw string, target interface{}) bool {
	candidates := []string{strings.TrimSpace(raw)}
	for _, match := range fencedJSONPattern.FindAllStringSubmatch(raw, -1) {
		candidates = append(candidates, strings.TrimSpace(match[1]))
	}
	if start := strings.Index(raw, "{"); start >= 0 {
		if end := strings.LastIndex(raw, "}"); end > start {
			candidates = append(candidates, raw[start:end+1])
		}
	}
	if start := strings.Index(raw, "["); start >= 0 {
		if end := strings.LastIndex(raw, "]"); end > start {
			candidates = append(candidates, raw[start:end+1])
		}
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if err := json.Unmarshal([]byte(candidate), target); err == nil {
			return true
		}
	}
	return false
}

func mapOutcomeStatus(outcome runtimeOutcome) string {
	switch strings.ToLower(strings.TrimSpace(outcome.Status)) {
	case "completed", "done", "success", "succeeded":
		return "completed"
	case "blocked", "stopped", "needs_human", "needs-human":
		return "blocked"
	default:
		return "in_progress"
	}
}

func taskByID(tasks []map[string]interface{}, id string) map[string]interface{} {
	for _, task := range tasks {
		if taskMapID(task) == id || stringTaskField(task, "_id", "id") == id {
			return task
		}
	}
	return nil
}

func stringTaskField(task map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := task[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}

func taskStatus(task map[string]interface{}) string {
	status := stringTaskField(task, "status")
	if status == "" {
		return "pending"
	}
	return status
}

func taskAssigneeID(task map[string]interface{}) string {
	return stringTaskField(task, "assignedAgentId", "agentId", "assignee_id")
}

func taskMapID(task map[string]interface{}) string {
	return stringTaskField(task, "id", "_id")
}

func taskTitle(task map[string]interface{}) string {
	return stringTaskField(task, "title")
}

func taskDescription(task map[string]interface{}) string {
	return stringTaskField(task, "description")
}

func issuesForPrompt(issues []map[string]interface{}) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(issues))
	for _, issue := range issues {
		out = append(out, map[string]interface{}{
			"id":          taskMapID(issue),
			"title":       taskTitle(issue),
			"description": taskDescription(issue),
			"status":      taskStatus(issue),
		})
	}
	return out
}

func classifyTask(task map[string]interface{}, assignee teammateProfile) string {
	text := strings.ToLower(taskTitle(task) + " " + taskDescription(task) + " " + assignee.Role)
	switch {
	case strings.Contains(text, "implement") || strings.Contains(text, "code") || strings.Contains(text, "fix") || strings.Contains(text, "build"):
		return "implementation/code"
	case strings.Contains(text, "research") || strings.Contains(text, "analyze") || strings.Contains(text, "plan"):
		return "research/planning"
	case strings.Contains(text, "approval") || strings.Contains(text, "human") || strings.Contains(text, "credential"):
		return "ops/human-in-loop"
	default:
		return "general execution"
	}
}

func keywordScore(a, b string) int {
	awords := keywordSet(a)
	bwords := keywordSet(b)
	score := 0
	for word := range awords {
		if bwords[word] {
			score++
		}
	}
	return score
}

func keywordSet(text string) map[string]bool {
	words := keywordPattern.FindAllString(strings.ToLower(text), -1)
	stop := map[string]bool{"the": true, "and": true, "for": true, "with": true, "this": true, "that": true, "from": true, "project": true, "task": true, "issue": true}
	set := map[string]bool{}
	for _, word := range words {
		if len(word) < 3 || stop[word] {
			continue
		}
		set[word] = true
	}
	return set
}

func compactText(text string, max int) string {
	fields := strings.Fields(text)
	compact := strings.Join(fields, " ")
	if len(compact) <= max {
		return compact
	}
	runes := []rune(compact)
	if len(runes) <= max {
		return compact
	}
	return string(runes[:max]) + "..."
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func stringFromResult(value interface{}, fallback string) string {
	if value == nil {
		return fallback
	}
	text := strings.TrimSpace(fmt.Sprintf("%v", value))
	if text == "" || text == "<nil>" {
		return fallback
	}
	return text
}

func sortProfilesByID(profiles []teammateProfile) {
	sort.Slice(profiles, func(i, j int) bool { return profiles[i].ID < profiles[j].ID })
}
