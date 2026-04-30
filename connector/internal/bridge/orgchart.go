package bridge

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"
)

// OrgChartStore provides thread-safe access to orgchart.json.
type OrgChartStore struct {
	path string
	mu   sync.Mutex
}

func NewOrgChartStore(path string) *OrgChartStore {
	return &OrgChartStore{path: path}
}

type orgChartData struct {
	Nodes       []map[string]interface{} `json:"nodes"`
	Edges       []map[string]interface{} `json:"edges"`
	Tasks       []map[string]interface{} `json:"tasks"`
	Departments []map[string]interface{} `json:"departments"`
}

func emptyOrgChartData() orgChartData {
	return orgChartData{
		Nodes:       []map[string]interface{}{},
		Edges:       []map[string]interface{}{},
		Tasks:       []map[string]interface{}{},
		Departments: []map[string]interface{}{},
	}
}

func (s *OrgChartStore) read() orgChartData {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return emptyOrgChartData()
	}
	var oc orgChartData
	if err := json.Unmarshal(data, &oc); err != nil {
		return emptyOrgChartData()
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
	return oc
}

func (s *OrgChartStore) write(oc orgChartData) error {
	data, err := json.MarshalIndent(oc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// RemoveAgent removes a node (and its edges) from the org chart by agentId.
func (s *OrgChartStore) RemoveAgent(agentID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	oc := s.read()
	filtered := make([]map[string]interface{}, 0, len(oc.Nodes))
	for _, n := range oc.Nodes {
		if id, _ := n["agentId"].(string); !strings.EqualFold(id, agentID) {
			filtered = append(filtered, n)
		}
	}
	if len(filtered) == len(oc.Nodes) {
		return // nothing to remove
	}
	oc.Nodes = filtered
	// Also remove edges referencing this agent
	edges := make([]map[string]interface{}, 0, len(oc.Edges))
	for _, e := range oc.Edges {
		src, _ := e["source"].(string)
		tgt, _ := e["target"].(string)
		if !strings.EqualFold(src, agentID) && !strings.EqualFold(tgt, agentID) {
			edges = append(edges, e)
		}
	}
	oc.Edges = edges
	s.write(oc)
}

// ReadOrgChart returns the full org chart. If the file doesn't exist,
// it seeds from the live agent team.
func (s *OrgChartStore) ReadOrgChart(b *BridgeHandler) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	oc := s.read()

	// Seed on first access if file doesn't exist
	if len(oc.Nodes) == 0 {
		oc = s.seedFromTeam(b)
		s.write(oc)
	}

	return okResult(oc)
}

// WriteOrgChart replaces the full org chart data.
func (s *OrgChartStore) WriteOrgChart(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	oc := emptyOrgChartData()
	if raw, ok := params["orgChartData"]; ok && raw != nil {
		b, _ := json.Marshal(raw)
		json.Unmarshal(b, &oc)
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

	if err := s.write(oc); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// AssignOrgChartTask adds a task assigned to a specific node.
func (s *OrgChartStore) AssignOrgChartTask(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

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

	// Copy extra fields from params
	if desc, ok := params["description"].(string); ok {
		task["description"] = desc
	}
	if delegatedBy, ok := params["delegatedBy"].(string); ok {
		task["delegatedBy"] = delegatedBy
	}

	oc := s.read()
	oc.Tasks = append(oc.Tasks, task)
	s.write(oc)

	return okResult(task)
}

// UpdateOrgChartTask patches a task by ID.
func (s *OrgChartStore) UpdateOrgChartTask(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, _ := params["id"].(string)
	patch, _ := params["patch"].(map[string]interface{})
	if id == "" {
		return errResultStatus("id is required", 400)
	}

	oc := s.read()
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
	s.write(oc)

	return okResult(oc.Tasks[idx])
}

// UpdateOrgNode patches any fields on a node by ID.
// Patchable fields include: department, type, role, name, and any other node field.
func (s *OrgChartStore) UpdateOrgNode(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	nodeID, _ := params["nodeId"].(string)
	patch, _ := params["patch"].(map[string]interface{})
	if nodeID == "" {
		return errResultStatus("nodeId is required", 400)
	}
	if len(patch) == 0 {
		return errResultStatus("patch is required and must not be empty", 400)
	}

	oc := s.read()
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
	if err := s.write(oc); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}

	return okResult(oc.Nodes[idx])
}

// defaultDepartments returns the canonical department definitions.
func defaultDepartments() []map[string]interface{} {
	return []map[string]interface{}{
		{"id": "engineering", "name": "Engineering", "color": "#3b82f6"},
		{"id": "marketing", "name": "Content & Marketing", "color": "#f59e0b"},
		{"id": "operations", "name": "Operations", "color": "#10b981"},
		{"id": "research", "name": "Research", "color": "#8b5cf6"},
	}
}

// departmentAssignments maps agent IDs to their default department and whether
// they are the lead of that department (first entry per department).
type deptEntry struct {
	dept string
	lead bool
}

var defaultDeptMap = map[string]deptEntry{
	// Engineering (lead: atlas)
	"atlas":  {dept: "engineering", lead: true},
	"codex":  {dept: "engineering", lead: false},
	"jinx":   {dept: "engineering", lead: false},
	"prism":  {dept: "engineering", lead: false},
	// Content & Marketing (lead: quill)
	"quill":  {dept: "marketing", lead: true},
	"scribe": {dept: "marketing", lead: false},
	"echo":   {dept: "marketing", lead: false},
	"clio":   {dept: "marketing", lead: false},
	// Operations (lead: hermes)
	"hermes": {dept: "operations", lead: true},
	"argus":  {dept: "operations", lead: false},
	"aegis":  {dept: "operations", lead: false},
	// Research (lead: ada)
	"ada":   {dept: "research", lead: true},
	"vera":  {dept: "research", lead: false},
	"ethan": {dept: "research", lead: false},
}

// seedFromTeam builds an initial org chart from the live agent list with
// department structure: orchestrator → department leads → specialists.
func (s *OrgChartStore) seedFromTeam(b *BridgeHandler) orgChartData {
	agents := b.ResolveTeam()
	oc := emptyOrgChartData()

	// Add canonical departments
	oc.Departments = defaultDepartments()

	// Always add orchestrator as root
	oc.Nodes = append(oc.Nodes, map[string]interface{}{
		"id":      "orchestrator",
		"name":    "Orchestrator",
		"role":    "CEO",
		"agentId": "main",
		"type":    "orchestrator",
		"status":  "idle",
	})

	// Build a set of agents that actually exist in the live team
	liveAgents := make(map[string]TeamAgent)
	for _, a := range agents {
		liveAgents[strings.ToLower(a.ID)] = a
	}

	// Track which leads have been created so we emit the edge only once
	leadCreated := make(map[string]bool)

	// First pass: create lead nodes for departments that have at least one live agent
	for _, a := range agents {
		id := strings.ToLower(a.ID)
		if id == "main" || id == "orchestrator" {
			continue
		}
		entry, known := defaultDeptMap[id]
		if !known || !entry.lead {
			continue
		}
		if leadCreated[entry.dept] {
			continue
		}
		leadCreated[entry.dept] = true

		oc.Nodes = append(oc.Nodes, map[string]interface{}{
			"id":         id,
			"name":       a.Name,
			"role":       a.Role,
			"agentId":    a.ID,
			"type":       "lead",
			"department": entry.dept,
			"status":     "idle",
		})
		oc.Edges = append(oc.Edges, map[string]interface{}{
			"from": "orchestrator",
			"to":   id,
		})
	}

	// Second pass: create specialist nodes and edges from their department lead
	for _, a := range agents {
		id := strings.ToLower(a.ID)
		if id == "main" || id == "orchestrator" {
			continue
		}
		entry, known := defaultDeptMap[id]
		if known && entry.lead {
			// Already handled above
			continue
		}

		var deptID string
		var parentID string
		if known {
			deptID = entry.dept
			// Find the lead node for this department
			parentID = findDeptLead(deptID, liveAgents)
			if parentID == "" {
				// Lead not in live team — fall back to orchestrator
				parentID = "orchestrator"
			}
		} else {
			// Unknown agent — attach directly to orchestrator, no department
			parentID = "orchestrator"
		}

		node := map[string]interface{}{
			"id":      id,
			"name":    a.Name,
			"role":    a.Role,
			"agentId": a.ID,
			"type":    "specialist",
			"status":  "idle",
		}
		if deptID != "" {
			node["department"] = deptID
		}
		oc.Nodes = append(oc.Nodes, node)
		oc.Edges = append(oc.Edges, map[string]interface{}{
			"from": parentID,
			"to":   id,
		})
	}

	return oc
}

// findDeptLead returns the agent ID of the lead for the given department,
// but only if that agent exists in the live team map.
func findDeptLead(deptID string, liveAgents map[string]TeamAgent) string {
	for agentID, entry := range defaultDeptMap {
		if entry.dept == deptID && entry.lead {
			if _, alive := liveAgents[agentID]; alive {
				return agentID
			}
		}
	}
	return ""
}

// Note: getOrgStatus has been moved to store_bridge.go (SQLite-backed with fallback).
