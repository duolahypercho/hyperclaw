package bridge

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/hypercho/hyperclaw-connector/internal/store"
)

const projectDepartmentPrefix = "project:"
const localUserProfileKey = "local-user-profile"
const maxLocalUserProfileBytes = 1024 * 1024

type orgProjectTeam struct {
	ID          string
	Name        string
	Emoji       string
	LeadAgentID string
	Members     []store.ProjectMember
}

func makeProjectDepartmentID(projectID string) string {
	return projectDepartmentPrefix + projectID
}

func projectColor(projectID string) string {
	hash := 0
	for _, ch := range projectID {
		hash = (hash*31 + int(ch)) % 360
	}
	return fmt.Sprintf("hsl(%d, 72%%, 56%%)", hash)
}

func (b *BridgeHandler) loadOrgProjectTeams() []orgProjectTeam {
	if b.store == nil {
		return nil
	}
	projects, err := b.store.ListProjects("")
	if err != nil {
		return nil
	}

	teams := make([]orgProjectTeam, 0, len(projects))
	for _, project := range projects {
		if project.TeamModeEnabled == false || strings.EqualFold(project.Status, "archived") {
			continue
		}
		members, err := b.store.GetProjectMembers(project.ID)
		if err != nil {
			continue
		}
		teams = append(teams, orgProjectTeam{
			ID:          project.ID,
			Name:        project.Name,
			Emoji:       project.Emoji,
			LeadAgentID: project.LeadAgentID,
			Members:     members,
		})
	}

	return teams
}

func choosePrimaryOrgProject(teams []orgProjectTeam, agentID string) *orgProjectTeam {
	if len(teams) == 0 {
		return nil
	}
	bestIdx := 0
	bestScore := 10
	for i, team := range teams {
		score := 5
		if strings.EqualFold(team.LeadAgentID, agentID) {
			score = 0
		} else {
			for _, member := range team.Members {
				if strings.EqualFold(member.AgentID, agentID) {
					switch strings.ToLower(member.Role) {
					case "lead":
						score = 0
					case "builder":
						score = 1
					case "reviewer":
						score = 2
					case "researcher":
						score = 3
					case "ops":
						score = 4
					default:
						score = 5
					}
					break
				}
			}
		}
		if score < bestScore || (score == bestScore && team.Name < teams[bestIdx].Name) {
			bestIdx = i
			bestScore = score
		}
	}
	return &teams[bestIdx]
}

func (b *BridgeHandler) applyProjectTeamsToOrgChart(oc orgChartData) orgChartData {
	teams := b.loadOrgProjectTeams()
	if len(teams) == 0 {
		oc.Departments = []map[string]interface{}{}
		return oc
	}

	teamsByAgent := make(map[string][]orgProjectTeam)
	memberRoleByKey := make(map[string]string)
	for _, team := range teams {
		for _, member := range team.Members {
			key := strings.ToLower(member.AgentID)
			teamsByAgent[key] = append(teamsByAgent[key], team)
			memberRoleByKey[team.ID+":"+key] = member.Role
		}
		if team.LeadAgentID != "" {
			key := strings.ToLower(team.LeadAgentID)
			if _, exists := teamsByAgent[key]; !exists {
				teamsByAgent[key] = []orgProjectTeam{}
			}
			alreadyIncluded := false
			for _, existing := range teamsByAgent[key] {
				if existing.ID == team.ID {
					alreadyIncluded = true
					break
				}
			}
			if !alreadyIncluded {
				teamsByAgent[key] = append(teamsByAgent[key], team)
			}
		}
	}

	nodeByAgentID := make(map[string]map[string]interface{}, len(oc.Nodes))
	for i, node := range oc.Nodes {
		agentID, _ := node["agentId"].(string)
		if strings.EqualFold(agentID, "main") || strings.EqualFold(agentID, "orchestrator") {
			nodeByAgentID[strings.ToLower(agentID)] = oc.Nodes[i]
			continue
		}

		primary := choosePrimaryOrgProject(teamsByAgent[strings.ToLower(agentID)], agentID)
		if primary == nil {
			delete(oc.Nodes[i], "department")
			nodeByAgentID[strings.ToLower(agentID)] = oc.Nodes[i]
			continue
		}

		role := memberRoleByKey[primary.ID+":"+strings.ToLower(agentID)]
		if strings.EqualFold(primary.LeadAgentID, agentID) || strings.EqualFold(role, "lead") {
			oc.Nodes[i]["type"] = "lead"
		} else {
			oc.Nodes[i]["type"] = "specialist"
		}
		oc.Nodes[i]["department"] = makeProjectDepartmentID(primary.ID)
		nodeByAgentID[strings.ToLower(agentID)] = oc.Nodes[i]
	}

	departments := make([]map[string]interface{}, 0, len(teams))
	edges := make([]map[string]interface{}, 0, len(teams)*2)
	seenEdges := make(map[string]struct{})
	orchestratorID := "orchestrator"

	for _, team := range teams {
		deptID := makeProjectDepartmentID(team.ID)
		name := team.Name
		if team.Emoji != "" {
			name = team.Emoji + " " + name
		}
		departments = append(departments, map[string]interface{}{
			"id":    deptID,
			"name":  name,
			"color": projectColor(team.ID),
		})

		leadNode, hasLead := nodeByAgentID[strings.ToLower(team.LeadAgentID)]
		if hasLead {
			leadID, _ := leadNode["id"].(string)
			key := orchestratorID + "->" + leadID
			if _, exists := seenEdges[key]; !exists {
				edges = append(edges, map[string]interface{}{
					"from":  orchestratorID,
					"to":    leadID,
					"label": team.Name,
				})
				seenEdges[key] = struct{}{}
			}
		}

		for _, member := range team.Members {
			node, ok := nodeByAgentID[strings.ToLower(member.AgentID)]
			if !ok {
				continue
			}
			nodeID, _ := node["id"].(string)
			parentID := orchestratorID
			if hasLead {
				if leadID, _ := leadNode["id"].(string); leadID != "" && leadID != nodeID {
					parentID = leadID
				}
			}
			key := parentID + "->" + nodeID
			if _, exists := seenEdges[key]; exists {
				continue
			}
			edges = append(edges, map[string]interface{}{
				"from":  parentID,
				"to":    nodeID,
				"label": member.Role,
			})
			seenEdges[key] = struct{}{}
		}
	}

	for _, node := range oc.Nodes {
		id, _ := node["id"].(string)
		if id == "" || id == orchestratorID {
			continue
		}
		hasParent := false
		for _, edge := range edges {
			if to, _ := edge["to"].(string); to == id {
				hasParent = true
				break
			}
		}
		if !hasParent {
			edges = append(edges, map[string]interface{}{
				"from": orchestratorID,
				"to":   id,
			})
		}
	}

	oc.Departments = departments
	oc.Edges = edges
	return oc
}

// ══════════════════════════════════════════════════════════════════════════════
// Todo — SQLite-backed with JSON file fallback
// ══════════════════════════════════════════════════════════════════════════════

func (b *BridgeHandler) getTodoData() actionResult {
	if b.store == nil {
		return b.todo.GetTodoData()
	}
	td, err := b.store.GetTodoData()
	if err != nil {
		log.Printf("Store: getTodoData error: %v, falling back to JSON", err)
		return b.todo.GetTodoData()
	}
	return okResult(td)
}

func (b *BridgeHandler) saveTodoData(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.todo.SaveTodoData(params)
	}

	td := store.TodoData{
		Tasks: []map[string]interface{}{},
		Lists: []interface{}{},
	}
	if raw, ok := params["todoData"]; ok && raw != nil {
		bs, _ := json.Marshal(raw)
		json.Unmarshal(bs, &td)
	}
	if td.Tasks == nil {
		td.Tasks = []map[string]interface{}{}
	}
	if td.Lists == nil {
		td.Lists = []interface{}{}
	}

	if err := b.store.SaveTodoData(td); err != nil {
		log.Printf("Store: saveTodoData error: %v, falling back to JSON", err)
		return b.todo.SaveTodoData(params)
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) getTasks() actionResult {
	if b.store == nil {
		return b.todo.GetTasks()
	}
	tasks, err := b.store.GetTasks()
	if err != nil {
		log.Printf("Store: getTasks error: %v, falling back to JSON", err)
		return b.todo.GetTasks()
	}
	return okResult(tasks)
}

func (b *BridgeHandler) listTasksByProject(params map[string]interface{}) actionResult {
	projectID, _ := params["projectId"].(string)
	if projectID == "" {
		projectID, _ = params["project_id"].(string)
	}
	if projectID == "" {
		return errResultStatus("projectId is required", 400)
	}
	if b.store == nil {
		return errResult("store not available")
	}
	tasks, err := b.store.ListTasksByProject(projectID)
	if err != nil {
		log.Printf("Store: listTasksByProject error: %v", err)
		return errResult(err.Error())
	}
	return okResult(tasks)
}

func (b *BridgeHandler) addTask(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.todo.AddTask(params)
	}

	taskRaw, _ := params["task"].(map[string]interface{})
	if taskRaw == nil {
		taskRaw = map[string]interface{}{}
	}

	result, err := b.store.AddTask(taskRaw)
	if err != nil {
		log.Printf("Store: addTask error: %v, falling back to JSON", err)
		return b.todo.AddTask(params)
	}
	return okResult(result)
}

func (b *BridgeHandler) updateTask(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.todo.UpdateTask(params)
	}

	id, _ := params["id"].(string)
	patch, _ := params["patch"].(map[string]interface{})

	result, err := b.store.UpdateTask(id, patch)
	if err != nil {
		log.Printf("Store: updateTask error: %v, falling back to JSON", err)
		return b.todo.UpdateTask(params)
	}
	return okResult(result)
}

func (b *BridgeHandler) deleteTask(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.todo.DeleteTask(params)
	}

	id, _ := params["id"].(string)
	deleted, err := b.store.DeleteTask(id)
	if err != nil {
		log.Printf("Store: deleteTask error: %v, falling back to JSON", err)
		return b.todo.DeleteTask(params)
	}
	return okResult(map[string]interface{}{"success": deleted})
}

// ══════════════════════════════════════════════════════════════════════════════
// Task Logs & Sessions — SQLite only (no JSON fallback)
// ══════════════════════════════════════════════════════════════════════════════

func (b *BridgeHandler) getTaskLogs(params map[string]interface{}) actionResult {
	if b.store == nil {
		return okResult([]interface{}{})
	}
	taskID, _ := params["taskId"].(string)
	agentID, _ := params["agentId"].(string)
	logType, _ := params["type"].(string)
	limit := int(toFloat(params["limit"], 100))
	offset := int(toFloat(params["offset"], 0))

	logs, err := b.store.GetTaskLogs(taskID, agentID, logType, limit, offset)
	if err != nil {
		log.Printf("Store: getTaskLogs error: %v", err)
		return okResult([]interface{}{})
	}
	return okResult(logs)
}

func (b *BridgeHandler) appendTaskLog(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	taskID, _ := params["taskId"].(string)
	agentID, _ := params["agentId"].(string)
	logType, _ := params["type"].(string)
	content, _ := params["content"].(string)
	metadata, _ := params["metadata"].(map[string]interface{})
	if taskID == "" {
		return errResultStatus("taskId is required", 400)
	}
	if content == "" {
		return errResultStatus("content is required", 400)
	}
	logEntry, err := b.store.AppendTaskLog(taskID, agentID, logType, content, metadata)
	if err != nil {
		log.Printf("Store: appendTaskLog error: %v", err)
		return errResult(err.Error())
	}
	return okResult(logEntry)
}

func (b *BridgeHandler) getTaskSessions(params map[string]interface{}) actionResult {
	if b.store == nil {
		return okResult([]interface{}{})
	}
	taskID, _ := params["taskId"].(string)
	agentID, _ := params["agentId"].(string)

	sessions, err := b.store.GetTaskSessions(taskID, agentID)
	if err != nil {
		log.Printf("Store: getTaskSessions error: %v", err)
		return okResult([]interface{}{})
	}
	return okResult(sessions)
}

func (b *BridgeHandler) linkTaskSession(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResult("store not available")
	}
	taskID, _ := params["taskId"].(string)
	sessionKey, _ := params["sessionKey"].(string)
	if taskID == "" || sessionKey == "" {
		return errResult("taskId and sessionKey are required")
	}
	if err := b.store.LinkTaskSession(taskID, sessionKey); err != nil {
		log.Printf("Store: linkTaskSession error: %v", err)
		return errResult(err.Error())
	}
	return okResult(map[string]interface{}{"success": true})
}

// toFloat extracts a float64 from an interface, or returns the default.
func toFloat(v interface{}, def float64) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return def
}

// ══════════════════════════════════════════════════════════════════════════════
// Events — SQLite-backed with JSONL file fallback
// ══════════════════════════════════════════════════════════════════════════════

func (b *BridgeHandler) getEvents() actionResult {
	if b.store == nil {
		return b.getEventsFile()
	}
	events, err := b.store.GetRecentEvents(50)
	if err != nil {
		log.Printf("Store: getEvents error: %v, falling back to JSONL", err)
		return b.getEventsFile()
	}
	return okResult(events)
}

func (b *BridgeHandler) sendCommand(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.sendCommandFile(params)
	}

	command, _ := params["command"].(map[string]interface{})
	if command == nil {
		return errResultStatus("missing command", 400)
	}

	cmdType, _ := command["type"].(string)
	payload := command["payload"]
	if payload == nil {
		payload = map[string]interface{}{}
	}

	entry := map[string]interface{}{
		"type":    cmdType,
		"source":  "hyperclaw",
		"payload": payload,
	}

	if _, err := b.store.AddCommand(cmdType, entry); err != nil {
		log.Printf("Store: sendCommand error: %v, falling back to JSONL", err)
		return b.sendCommandFile(params)
	}
	return okResult(map[string]interface{}{"success": true})
}

// ══════════════════════════════════════════════════════════════════════════════
// KV-backed data — usage, channels, office layout/seats
// ══════════════════════════════════════════════════════════════════════════════

func (b *BridgeHandler) loadLocalUsage() actionResult {
	if b.store == nil {
		return b.loadLocalUsageFile()
	}

	val, err := b.store.KVGet("local-usage")
	if err != nil || val == "" {
		return okResult(map[string]interface{}{"success": true, "data": nil})
	}
	var parsed interface{}
	if err := json.Unmarshal([]byte(val), &parsed); err != nil {
		return okResult(map[string]interface{}{"success": true, "data": nil})
	}
	return okResult(map[string]interface{}{"success": true, "data": parsed})
}

func (b *BridgeHandler) saveLocalUsage(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.saveLocalUsageFile(params)
	}

	data, _ := json.Marshal(params["usageData"])
	if err := b.store.KVSet("local-usage", string(data)); err != nil {
		log.Printf("Store: saveLocalUsage error: %v, falling back to JSON", err)
		return b.saveLocalUsageFile(params)
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) getLocalUserProfile() actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 500)
	}

	val, err := b.store.KVGet(localUserProfileKey)
	if err != nil {
		return errResultStatus(fmt.Sprintf("failed to load local user profile: %v", err), 500)
	}
	if val == "" {
		return okResult(map[string]interface{}{"success": true, "profile": nil})
	}

	var profile map[string]interface{}
	if err := json.Unmarshal([]byte(val), &profile); err != nil {
		return errResultStatus(fmt.Sprintf("failed to parse local user profile: %v", err), 500)
	}
	return okResult(map[string]interface{}{"success": true, "profile": profile})
}

func (b *BridgeHandler) saveLocalUserProfile(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 500)
	}

	profile, ok := params["profile"].(map[string]interface{})
	if !ok {
		return errResultStatus("profile is required", 400)
	}

	data, err := json.Marshal(profile)
	if err != nil {
		return errResultStatus(fmt.Sprintf("failed to encode local user profile: %v", err), 500)
	}
	if len(data) > maxLocalUserProfileBytes {
		return errResultStatus("profile payload is too large", 413)
	}
	if err := b.store.KVSet(localUserProfileKey, string(data)); err != nil {
		return errResultStatus(fmt.Sprintf("failed to save local user profile: %v", err), 500)
	}
	return okResult(map[string]interface{}{"success": true, "profile": profile})
}

func (b *BridgeHandler) listChannels() actionResult {
	if b.store == nil {
		return b.listChannelsFile()
	}

	val, err := b.store.KVGet("channels")
	if err != nil || val == "" {
		return okResult(map[string]interface{}{"success": true, "data": []interface{}{}})
	}
	var channels []interface{}
	if err := json.Unmarshal([]byte(val), &channels); err != nil {
		return okResult(map[string]interface{}{"success": true, "data": []interface{}{}})
	}
	return okResult(map[string]interface{}{"success": true, "data": channels})
}

func (b *BridgeHandler) readOfficeLayout() actionResult {
	if b.store == nil {
		return b.readOfficeLayoutFile()
	}

	val, err := b.store.KVGet("office-layout")
	if err != nil || val == "" {
		return okResult(map[string]interface{}{"success": true, "layout": nil})
	}
	var layout interface{}
	json.Unmarshal([]byte(val), &layout)
	return okResult(map[string]interface{}{"success": true, "layout": layout})
}

func (b *BridgeHandler) writeOfficeLayout(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.writeOfficeLayoutFile(params)
	}

	layout, ok := params["officeLayout"]
	if !ok || layout == nil {
		return okResult(map[string]interface{}{"success": false, "error": "Missing layout"})
	}
	data, _ := json.MarshalIndent(layout, "", "  ")
	if err := b.store.KVSet("office-layout", string(data)); err != nil {
		log.Printf("Store: writeOfficeLayout error: %v, falling back to JSON", err)
		return b.writeOfficeLayoutFile(params)
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) readOfficeSeats() actionResult {
	if b.store == nil {
		return b.readOfficeSeatsFile()
	}

	val, err := b.store.KVGet("office-seats")
	if err != nil || val == "" {
		return okResult(map[string]interface{}{"success": true, "seats": nil})
	}
	var seats interface{}
	json.Unmarshal([]byte(val), &seats)
	return okResult(map[string]interface{}{"success": true, "seats": seats})
}

func (b *BridgeHandler) writeOfficeSeats(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.writeOfficeSeatsFile(params)
	}

	seats, ok := params["officeSeats"]
	if !ok || seats == nil {
		return okResult(map[string]interface{}{"success": false, "error": "Missing seats"})
	}
	data, _ := json.MarshalIndent(seats, "", "  ")
	if err := b.store.KVSet("office-seats", string(data)); err != nil {
		log.Printf("Store: writeOfficeSeats error: %v, falling back to JSON", err)
		return b.writeOfficeSeatsFile(params)
	}
	return okResult(map[string]interface{}{"success": true})
}

// ══════════════════════════════════════════════════════════════════════════════
// Generic App State — KV-backed
// ══════════════════════════════════════════════════════════════════════════════

func (b *BridgeHandler) saveAppState(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 500)
	}
	entries, _ := params["entries"].(map[string]interface{})
	if entries == nil {
		return errResultStatus("entries object required", 400)
	}
	for k, v := range entries {
		val := ""
		switch tv := v.(type) {
		case string:
			val = tv
		default:
			bs, _ := json.Marshal(v)
			val = string(bs)
		}
		if err := b.store.KVSet(k, val); err != nil {
			log.Printf("Store: saveAppState KVSet(%s) error: %v", k, err)
		}
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) getAppState(params map[string]interface{}) actionResult {
	if b.store == nil {
		return okResult(map[string]interface{}{"success": true, "data": map[string]interface{}{}})
	}
	keysRaw, _ := params["keys"].([]interface{})
	if keysRaw == nil {
		return errResultStatus("keys array required", 400)
	}
	data := map[string]interface{}{}
	for _, kr := range keysRaw {
		k, _ := kr.(string)
		if k == "" {
			continue
		}
		val, err := b.store.KVGet(k)
		if err != nil {
			log.Printf("Store: getAppState KVGet(%s) error: %v", k, err)
			continue
		}
		if val != "" {
			data[k] = val
		}
	}
	return okResult(map[string]interface{}{"success": true, "data": data})
}

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard Layouts — stored as JSON array in kv under "dashboard-saved-layouts"
// ══════════════════════════════════════════════════════════════════════════════

const dashboardLayoutsKey = "dashboard-saved-layouts"

func (b *BridgeHandler) readLayoutsFromKV() []map[string]interface{} {
	if b.store == nil {
		return []map[string]interface{}{}
	}
	val, err := b.store.KVGet(dashboardLayoutsKey)
	if err != nil || val == "" {
		return []map[string]interface{}{}
	}
	var layouts []map[string]interface{}
	if err := json.Unmarshal([]byte(val), &layouts); err != nil {
		return []map[string]interface{}{}
	}
	return layouts
}

func (b *BridgeHandler) writeLayoutsToKV(layouts []map[string]interface{}) {
	if b.store == nil {
		return
	}
	data, _ := json.Marshal(layouts)
	b.store.KVSet(dashboardLayoutsKey, string(data))
}

func (b *BridgeHandler) getDashboardLayouts() actionResult {
	return okResult(map[string]interface{}{"success": true, "data": b.readLayoutsFromKV()})
}

func (b *BridgeHandler) saveDashboardLayout(params map[string]interface{}) actionResult {
	id, _ := params["id"].(string)
	name, _ := params["name"].(string)
	if id == "" || name == "" {
		return errResultStatus("id and name required", 400)
	}
	entry := map[string]interface{}{
		"id":             id,
		"name":           name,
		"createdAt":      params["createdAt"],
		"layout":         params["layout"],
		"visibleWidgets": params["visibleWidgets"],
		"widgetConfigs":  params["widgetConfigs"],
	}
	if entry["createdAt"] == nil {
		entry["createdAt"] = float64(time.Now().UnixMilli())
	}
	layouts := b.readLayoutsFromKV()
	found := false
	for i, l := range layouts {
		if lid, _ := l["id"].(string); lid == id {
			layouts[i] = entry
			found = true
			break
		}
	}
	if !found {
		layouts = append(layouts, entry)
	}
	b.writeLayoutsToKV(layouts)
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) updateDashboardLayout(params map[string]interface{}) actionResult {
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id required", 400)
	}
	layouts := b.readLayoutsFromKV()
	for i, l := range layouts {
		if lid, _ := l["id"].(string); lid == id {
			if name, ok := params["name"]; ok {
				layouts[i]["name"] = name
			}
			if layout, ok := params["layout"]; ok {
				layouts[i]["layout"] = layout
			}
			if vw, ok := params["visibleWidgets"]; ok {
				layouts[i]["visibleWidgets"] = vw
			}
			if wc, ok := params["widgetConfigs"]; ok {
				layouts[i]["widgetConfigs"] = wc
			}
			b.writeLayoutsToKV(layouts)
			return okResult(map[string]interface{}{"success": true})
		}
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) deleteDashboardLayout(params map[string]interface{}) actionResult {
	id, _ := params["id"].(string)
	if id == "" {
		return errResultStatus("id required", 400)
	}
	layouts := b.readLayoutsFromKV()
	filtered := make([]map[string]interface{}, 0, len(layouts))
	for _, l := range layouts {
		if lid, _ := l["id"].(string); lid != id {
			filtered = append(filtered, l)
		}
	}
	b.writeLayoutsToKV(filtered)
	return okResult(map[string]interface{}{"success": true})
}

// ══════════════════════════════════════════════════════════════════════════════
// OrgChart — SQLite-backed with JSON file fallback
// ══════════════════════════════════════════════════════════════════════════════

func (b *BridgeHandler) readOrgChart() actionResult {
	if b.store == nil {
		return b.orgChart.ReadOrgChart(b)
	}

	val, err := b.store.KVGet("orgchart")
	if err != nil {
		log.Printf("Store: readOrgChart error: %v, falling back to JSON", err)
		return b.orgChart.ReadOrgChart(b)
	}

	if val == "" {
		// Seed from team
		b.orgChart.mu.Lock()
		oc := b.orgChart.seedFromTeam(b)
		b.orgChart.mu.Unlock()
		data, _ := json.Marshal(oc)
		b.store.KVSet("orgchart", string(data))
		return okResult(oc)
	}

	var oc orgChartData
	if err := json.Unmarshal([]byte(val), &oc); err != nil {
		return okResult(emptyOrgChartData())
	}
	return okResult(oc)
}

func (b *BridgeHandler) writeOrgChart(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.orgChart.WriteOrgChart(params)
	}

	oc := emptyOrgChartData()
	if raw, ok := params["orgChartData"]; ok && raw != nil {
		bs, _ := json.Marshal(raw)
		json.Unmarshal(bs, &oc)
	}
	if oc.Nodes == nil {
		oc.Nodes = []map[string]interface{}{}
	}
	if oc.Edges == nil {
		oc.Edges = []map[string]interface{}{}
	}
	if oc.Tasks == nil {
		oc.Tasks = []map[string]interface{}{}
	}
	if oc.Departments == nil {
		oc.Departments = []map[string]interface{}{}
	}

	data, _ := json.Marshal(oc)
	if err := b.store.KVSet("orgchart", string(data)); err != nil {
		log.Printf("Store: writeOrgChart error: %v, falling back to JSON", err)
		return b.orgChart.WriteOrgChart(params)
	}
	return okResult(map[string]interface{}{"success": true})
}

func (b *BridgeHandler) assignOrgChartTask(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.orgChart.AssignOrgChartTask(params)
	}

	// Load current orgchart from store
	val, err := b.store.KVGet("orgchart")
	if err != nil || val == "" {
		return b.orgChart.AssignOrgChartTask(params)
	}

	var oc orgChartData
	json.Unmarshal([]byte(val), &oc)

	nodeID, _ := params["nodeId"].(string)
	title, _ := params["title"].(string)
	if nodeID == "" || title == "" {
		return errResultStatus("nodeId and title are required", 400)
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	task := map[string]interface{}{
		"id":         generateTaskID(),
		"title":      title,
		"assignedTo": nodeID,
		"status":     "pending",
		"createdAt":  now,
		"updatedAt":  now,
	}
	if desc, ok := params["description"].(string); ok {
		task["description"] = desc
	}
	if delegatedBy, ok := params["delegatedBy"].(string); ok {
		task["delegatedBy"] = delegatedBy
	}

	oc.Tasks = append(oc.Tasks, task)
	data, _ := json.Marshal(oc)
	b.store.KVSet("orgchart", string(data))

	return okResult(task)
}

func (b *BridgeHandler) updateOrgChartTask(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.orgChart.UpdateOrgChartTask(params)
	}

	val, err := b.store.KVGet("orgchart")
	if err != nil || val == "" {
		return b.orgChart.UpdateOrgChartTask(params)
	}

	var oc orgChartData
	json.Unmarshal([]byte(val), &oc)

	id, _ := params["id"].(string)
	patch, _ := params["patch"].(map[string]interface{})
	if id == "" {
		return errResultStatus("id is required", 400)
	}

	idx := -1
	for i, t := range oc.Tasks {
		if tid, _ := t["id"].(string); tid == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return errResultStatus("task not found", 404)
	}

	oc.Tasks[idx]["updatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	for k, v := range patch {
		oc.Tasks[idx][k] = v
	}

	data, _ := json.Marshal(oc)
	b.store.KVSet("orgchart", string(data))

	return okResult(oc.Tasks[idx])
}

func (b *BridgeHandler) updateOrgNode(params map[string]interface{}) actionResult {
	if b.store == nil {
		return b.orgChart.UpdateOrgNode(params)
	}

	val, err := b.store.KVGet("orgchart")
	if err != nil || val == "" {
		return b.orgChart.UpdateOrgNode(params)
	}

	var oc orgChartData
	json.Unmarshal([]byte(val), &oc)

	nodeID, _ := params["nodeId"].(string)
	patch, _ := params["patch"].(map[string]interface{})
	if nodeID == "" {
		return errResultStatus("nodeId is required", 400)
	}
	if len(patch) == 0 {
		return errResultStatus("patch is required and must not be empty", 400)
	}

	idx := -1
	for i, n := range oc.Nodes {
		if nid, _ := n["id"].(string); nid == nodeID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return errResultStatus("node not found", 404)
	}

	for k, v := range patch {
		oc.Nodes[idx][k] = v
	}

	data, _ := json.Marshal(oc)
	if err := b.store.KVSet("orgchart", string(data)); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(oc.Nodes[idx])
}

// updateAgentConfig patches the config JSON for an agent in SQLite.
func (b *BridgeHandler) updateAgentConfig(params map[string]interface{}) actionResult {
	if b.store == nil {
		return errResultStatus("store not available", 500)
	}

	agentID, _ := params["agentId"].(string)
	if agentID == "" {
		return errResultStatus("agentId is required", 400)
	}

	config, ok := params["config"]
	if !ok {
		return errResultStatus("config is required", 400)
	}

	// Patch semantics: merge incoming keys into existing config JSON instead of
	// replacing the whole blob. This prevents unrelated fields (for example
	// onboarding description/mainModel) from being wiped by partial writers such
	// as org-chart subagent updates.
	if patchMap, isMap := config.(map[string]interface{}); isMap {
		merged := map[string]interface{}{}

		current, err := b.store.GetAgent(agentID)
		if err != nil {
			return errResultStatus(err.Error(), 500)
		}
		if current == nil {
			return errResultStatus("agent not found", 404)
		}
		if strings.TrimSpace(current.Config) != "" {
			_ = json.Unmarshal([]byte(current.Config), &merged)
		}

		for k, v := range patchMap {
			// Explicit null means delete this key.
			if v == nil {
				delete(merged, k)
				continue
			}
			merged[k] = v
		}
		config = merged
	}

	updated, err := b.store.UpdateAgent(agentID, map[string]interface{}{
		"config": config,
	})
	if err != nil {
		return errResultStatus(err.Error(), 500)
	}
	if updated == nil {
		return errResultStatus("agent not found", 404)
	}

	return okResult(map[string]interface{}{"success": true, "agentId": agentID})
}

// removeAgentFromOrgChartKV removes an agent node (and its edges) from the
// org chart stored in the SQLite KV store.
func (b *BridgeHandler) removeAgentFromOrgChartKV(agentID string) {
	val, err := b.store.KVGet("orgchart")
	if err != nil || val == "" {
		return
	}
	var oc orgChartData
	if err := json.Unmarshal([]byte(val), &oc); err != nil {
		return
	}
	origLen := len(oc.Nodes)
	filtered := make([]map[string]interface{}, 0, len(oc.Nodes))
	for _, n := range oc.Nodes {
		if id, _ := n["agentId"].(string); !strings.EqualFold(id, agentID) {
			filtered = append(filtered, n)
		}
	}
	if len(filtered) == origLen {
		return
	}
	oc.Nodes = filtered
	edges := make([]map[string]interface{}, 0, len(oc.Edges))
	for _, e := range oc.Edges {
		src, _ := e["source"].(string)
		tgt, _ := e["target"].(string)
		if !strings.EqualFold(src, agentID) && !strings.EqualFold(tgt, agentID) {
			edges = append(edges, e)
		}
	}
	oc.Edges = edges
	data, _ := json.Marshal(oc)
	b.store.KVSet("orgchart", string(data))
}

// getOrgStatus merges live agent/cron data into the org chart.
func (b *BridgeHandler) getOrgStatus() actionResult {
	var oc orgChartData

	if b.store != nil {
		val, err := b.store.KVGet("orgchart")
		if err == nil && val != "" {
			json.Unmarshal([]byte(val), &oc)
		}
	}

	// Fallback / seed if empty
	if len(oc.Nodes) == 0 {
		b.orgChart.mu.Lock()
		oc = b.orgChart.read()
		if len(oc.Nodes) == 0 {
			oc = b.orgChart.seedFromTeam(b)
			b.orgChart.write(oc)
		}
		b.orgChart.mu.Unlock()

		// Persist to store for next time
		if b.store != nil {
			data, _ := json.Marshal(oc)
			b.store.KVSet("orgchart", string(data))
		}
	}

	// Get live team status
	team := b.ResolveTeam()
	teamMap := make(map[string]TeamAgent)
	for _, a := range team {
		teamMap[strings.ToLower(a.ID)] = a
	}

	// Enrich nodes with live status
	for i, node := range oc.Nodes {
		agentID, _ := node["agentId"].(string)
		if agent, ok := teamMap[strings.ToLower(agentID)]; ok {
			oc.Nodes[i]["liveStatus"] = agent.Status
		}
	}

	oc = b.applyProjectTeamsToOrgChart(oc)

	return okResult(oc)
}
