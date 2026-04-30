package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// generateTaskID creates a 24-char hex string (8 timestamp + 16 random).
func generateTaskID() string {
	ts := fmt.Sprintf("%08x", time.Now().Unix())
	b := make([]byte, 8)
	rand.Read(b)
	return ts + hex.EncodeToString(b)
}

// ── Todo data (full read/write for backwards compat) ─────────────────────────

// TodoData matches the legacy todo.json structure.
type TodoData struct {
	Tasks        []map[string]interface{} `json:"tasks"`
	Lists        []interface{}            `json:"lists"`
	ActiveTaskID interface{}              `json:"activeTaskId"`
}

func stringField(task map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := task[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}

func taskProjectID(task map[string]interface{}) string {
	return stringField(task, "projectId", "project_id")
}

func taskStatus(task map[string]interface{}) string {
	status := stringField(task, "status")
	if status == "" {
		return "pending"
	}
	return status
}

func taskAssigneeID(task map[string]interface{}) string {
	return stringField(task, "assignedAgentId", "agentId", "assignee_id")
}

func taskDueAt(task map[string]interface{}) *int64 {
	if value, ok := task["dueDate"]; ok && value != nil {
		parsed := parseTimestamp(value, 0)
		if parsed > 0 {
			return &parsed
		}
	}
	return nil
}

func hydrateTask(id string, listID, projectID *string, dataStr string, createdAt, updatedAt int64) map[string]interface{} {
	var task map[string]interface{}
	if err := json.Unmarshal([]byte(dataStr), &task); err != nil {
		task = map[string]interface{}{}
	}
	if origID, ok := task["_id"].(string); ok && origID != "" {
		task["id"] = origID
	} else {
		task["id"] = id
	}
	delete(task, "_id")
	if listID != nil {
		task["listId"] = *listID
	}
	if projectID != nil && *projectID != "" {
		task["projectId"] = *projectID
	}
	task["createdAt"] = time.Unix(0, createdAt*int64(time.Millisecond)).UTC().Format(time.RFC3339Nano)
	task["updatedAt"] = time.Unix(0, updatedAt*int64(time.Millisecond)).UTC().Format(time.RFC3339Nano)
	return task
}

// GetTodoData returns all tasks and lists, matching the legacy format.
func (s *Store) GetTodoData() (TodoData, error) {
	td := TodoData{
		Tasks:        []map[string]interface{}{},
		Lists:        []interface{}{},
		ActiveTaskID: nil,
	}

	// Load tasks
	rows, err := s.db.Query(`SELECT id, list_id, project_id, data, created_at, updated_at FROM tasks ORDER BY created_at ASC`)
	if err != nil {
		return td, err
	}
	defer rows.Close()

	for rows.Next() {
		var id, dataStr string
		var listID, projectID *string
		var createdAt, updatedAt int64
		if err := rows.Scan(&id, &listID, &projectID, &dataStr, &createdAt, &updatedAt); err != nil {
			continue
		}
		td.Tasks = append(td.Tasks, hydrateTask(id, listID, projectID, dataStr, createdAt, updatedAt))
	}

	// Load lists
	listRows, err := s.db.Query(`SELECT id, data FROM task_lists ORDER BY created_at ASC`)
	if err != nil {
		return td, nil // tasks loaded, lists error is non-fatal
	}
	defer listRows.Close()

	for listRows.Next() {
		var id, dataStr string
		if err := listRows.Scan(&id, &dataStr); err != nil {
			continue
		}
		var list map[string]interface{}
		if err := json.Unmarshal([]byte(dataStr), &list); err != nil {
			list = map[string]interface{}{}
		}
		list["id"] = id
		td.Lists = append(td.Lists, list)
	}

	// Load activeTaskId from kv
	activeID, err := s.KVGet("todo.activeTaskId")
	if err == nil && activeID != "" {
		td.ActiveTaskID = activeID
	}

	return td, nil
}

// SaveTodoData replaces all tasks and lists (full write, legacy compat).
func (s *Store) SaveTodoData(td TodoData) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Clear existing
	tx.Exec(`DELETE FROM tasks`)
	tx.Exec(`DELETE FROM task_lists`)

	now := time.Now().UnixMilli()

	// Insert tasks
	stmt, err := tx.Prepare(`INSERT INTO tasks (id, list_id, project_id, status, assignee_id, due_at, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, task := range td.Tasks {
		id, _ := task["id"].(string)
		if id == "" {
			id, _ = task["_id"].(string)
		}
		if id == "" {
			id = generateTaskID()
		}

		listID, _ := task["listId"].(string)
		var listIDPtr *string
		if listID != "" {
			listIDPtr = &listID
		}
		projectID := taskProjectID(task)
		var projectIDPtr *string
		if projectID != "" {
			projectIDPtr = &projectID
		}
		assigneeID := taskAssigneeID(task)
		var assigneeIDPtr *string
		if assigneeID != "" {
			assigneeIDPtr = &assigneeID
		}
		dueAt := taskDueAt(task)

		// Parse timestamps from task data or use now
		createdAt := parseTimestamp(task["createdAt"], now)
		updatedAt := parseTimestamp(task["updatedAt"], now)

		// Store the full task data blob (minus id/timestamps we track in columns)
		taskCopy := make(map[string]interface{})
		for k, v := range task {
			if k != "id" && k != "_id" && k != "createdAt" && k != "updatedAt" && k != "listId" && k != "projectId" && k != "project_id" {
				taskCopy[k] = v
			}
		}
		dataBytes, _ := json.Marshal(taskCopy)

		if _, err := stmt.Exec(id, listIDPtr, projectIDPtr, taskStatus(task), assigneeIDPtr, dueAt, string(dataBytes), createdAt, updatedAt); err != nil {
			return err
		}
	}

	// Insert lists
	listStmt, err := tx.Prepare(`INSERT INTO task_lists (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer listStmt.Close()

	for _, listRaw := range td.Lists {
		list, ok := listRaw.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := list["id"].(string)
		if id == "" {
			id = generateTaskID()
		}
		dataBytes, _ := json.Marshal(list)
		if _, err := listStmt.Exec(id, string(dataBytes), now, now); err != nil {
			return err
		}
	}

	// Save activeTaskId
	if td.ActiveTaskID != nil {
		if activeStr, ok := td.ActiveTaskID.(string); ok {
			s.kvSetTx(tx, "todo.activeTaskId", activeStr)
		}
	} else {
		tx.Exec(`DELETE FROM kv WHERE key = 'todo.activeTaskId'`)
	}

	return tx.Commit()
}

// GetTasks returns just the tasks array.
func (s *Store) GetTasks() ([]map[string]interface{}, error) {
	td, err := s.GetTodoData()
	if err != nil {
		return nil, err
	}
	return td.Tasks, nil
}

// AddTask inserts a new task and returns it.
func (s *Store) AddTask(task map[string]interface{}) (map[string]interface{}, error) {
	id, _ := task["id"].(string)
	if id == "" {
		id, _ = task["_id"].(string)
	}
	if id == "" || len(id) != 24 {
		id = generateTaskID()
	}

	now := time.Now()
	nowMs := now.UnixMilli()

	listID, _ := task["listId"].(string)
	var listIDPtr *string
	if listID != "" {
		listIDPtr = &listID
	}
	projectID := taskProjectID(task)
	var projectIDPtr *string
	if projectID != "" {
		projectIDPtr = &projectID
	}
	assigneeID := taskAssigneeID(task)
	var assigneeIDPtr *string
	if assigneeID != "" {
		assigneeIDPtr = &assigneeID
	}
	dueAt := taskDueAt(task)

	// Separate tracked fields from data blob
	taskData := make(map[string]interface{})
	for k, v := range task {
		if k != "id" && k != "_id" && k != "createdAt" && k != "updatedAt" && k != "listId" && k != "projectId" && k != "project_id" {
			taskData[k] = v
		}
	}
	dataBytes, _ := json.Marshal(taskData)

	_, err := s.db.Exec(
		`INSERT INTO tasks (id, list_id, project_id, status, assignee_id, due_at, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, listIDPtr, projectIDPtr, taskStatus(task), assigneeIDPtr, dueAt, string(dataBytes), nowMs, nowMs,
	)
	if err != nil {
		return nil, err
	}

	result := make(map[string]interface{})
	for k, v := range task {
		result[k] = v
	}
	result["id"] = id
	if projectIDPtr != nil {
		result["projectId"] = *projectIDPtr
	}
	result["createdAt"] = now.UTC().Format(time.RFC3339Nano)
	result["updatedAt"] = now.UTC().Format(time.RFC3339Nano)
	return result, nil
}

// findRowID resolves a task's SQLite row ID from either the row ID itself
// or the _id stored in the JSON data blob.
func (s *Store) findRowID(id string) (string, error) {
	var rowID string
	err := s.db.QueryRow(`SELECT id FROM tasks WHERE id = ?`, id).Scan(&rowID)
	if err == nil {
		return rowID, nil
	}
	err = s.db.QueryRow(`SELECT id FROM tasks WHERE json_extract(data, '$._id') = ?`, id).Scan(&rowID)
	if err == nil {
		return rowID, nil
	}
	return "", fmt.Errorf("task not found: %s", id)
}

// UpdateTask patches a task by id.
func (s *Store) UpdateTask(id string, patch map[string]interface{}) (map[string]interface{}, error) {
	rowID, err := s.findRowID(id)
	if err != nil {
		return nil, err
	}
	// Read current
	var dataStr string
	var listID, projectID, assigneeID *string
	var dueAt *int64
	var createdAt int64
	err = s.db.QueryRow(`SELECT list_id, project_id, assignee_id, due_at, data, created_at FROM tasks WHERE id = ?`, rowID).Scan(&listID, &projectID, &assigneeID, &dueAt, &dataStr, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("read task %s: %w", rowID, err)
	}

	var current map[string]interface{}
	json.Unmarshal([]byte(dataStr), &current)
	if current == nil {
		current = map[string]interface{}{}
	}

	// Apply patch
	newListID := listID
	newProjectID := projectID
	newAssigneeID := assigneeID
	newDueAt := dueAt
	newStatus := taskStatus(current)
	for k, v := range patch {
		if k == "id" || k == "createdAt" {
			continue
		}
		if k == "listId" {
			if s, ok := v.(string); ok && s != "" {
				newListID = &s
			} else {
				newListID = nil
			}
			continue
		}
		if k == "projectId" || k == "project_id" {
			if s, ok := v.(string); ok && s != "" {
				newProjectID = &s
			} else {
				newProjectID = nil
			}
			continue
		}
		if k == "status" {
			if s, ok := v.(string); ok && s != "" {
				newStatus = s
			}
		}
		if k == "assignedAgentId" || k == "agentId" || k == "assignee_id" {
			if s, ok := v.(string); ok && s != "" {
				newAssigneeID = &s
			} else {
				newAssigneeID = nil
			}
		}
		if k == "dueDate" {
			newDueAt = nil
			if parsed := parseTimestamp(v, 0); parsed > 0 {
				newDueAt = &parsed
			}
		}
		if k == "updatedAt" {
			continue
		}
		current[k] = v
	}

	now := time.Now()
	dataBytes, _ := json.Marshal(current)

	_, err = s.db.Exec(
		`UPDATE tasks SET list_id = ?, project_id = ?, status = ?, assignee_id = ?, due_at = ?, data = ?, updated_at = ? WHERE id = ?`,
		newListID, newProjectID, newStatus, newAssigneeID, newDueAt, string(dataBytes), now.UnixMilli(), rowID,
	)
	if err != nil {
		return nil, err
	}

	result := make(map[string]interface{})
	for k, v := range current {
		result[k] = v
	}
	// Prefer original _id, remove _id field
	if origID, ok := current["_id"].(string); ok && origID != "" {
		result["id"] = origID
	} else {
		result["id"] = rowID
	}
	delete(result, "_id")
	if newListID != nil {
		result["listId"] = *newListID
	}
	if newProjectID != nil {
		result["projectId"] = *newProjectID
	}
	result["createdAt"] = time.Unix(0, createdAt*int64(time.Millisecond)).UTC().Format(time.RFC3339Nano)
	result["updatedAt"] = now.UTC().Format(time.RFC3339Nano)
	return result, nil
}

// ListTasksByProject returns project-scoped tasks without forcing the dashboard
// to fetch every Todo item and filter in React.
func (s *Store) ListTasksByProject(projectID string) ([]map[string]interface{}, error) {
	rows, err := s.db.Query(
		`SELECT id, list_id, project_id, data, created_at, updated_at
		 FROM tasks
		 WHERE project_id = ? OR json_extract(data, '$.projectId') = ? OR json_extract(data, '$.project_id') = ?
		 ORDER BY updated_at DESC`,
		projectID, projectID, projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []map[string]interface{}
	for rows.Next() {
		var id, dataStr string
		var listID, projectIDPtr *string
		var createdAt, updatedAt int64
		if err := rows.Scan(&id, &listID, &projectIDPtr, &dataStr, &createdAt, &updatedAt); err != nil {
			continue
		}
		tasks = append(tasks, hydrateTask(id, listID, projectIDPtr, dataStr, createdAt, updatedAt))
	}
	if tasks == nil {
		tasks = []map[string]interface{}{}
	}
	return tasks, nil
}

// DeleteTask removes a task by id. Returns true if deleted.
func (s *Store) DeleteTask(id string) (bool, error) {
	rowID, err := s.findRowID(id)
	if err != nil {
		return false, nil // not found
	}
	result, err := s.db.Exec(`DELETE FROM tasks WHERE id = ?`, rowID)
	if err != nil {
		return false, err
	}
	rows, _ := result.RowsAffected()
	if rows > 0 {
		// Clean up logs/sessions by both IDs
		s.db.Exec(`DELETE FROM task_logs WHERE task_id = ? OR task_id = ?`, rowID, id)
		s.db.Exec(`DELETE FROM task_sessions WHERE task_id = ? OR task_id = ?`, rowID, id)
	}
	return rows > 0, nil
}

// ── Task Logs ────────────────────────────────────────────────────────────────

// TaskLog represents a row in the task_logs table.
type TaskLog struct {
	ID        int64                  `json:"id"`
	TaskID    string                 `json:"task_id"`
	AgentID   *string                `json:"agent_id"`
	Type      string                 `json:"type"`
	Content   string                 `json:"content"`
	Metadata  map[string]interface{} `json:"metadata"`
	CreatedAt int64                  `json:"created_at"`
}

// AppendTaskLog stores a durable issue/task activity entry.
func (s *Store) AppendTaskLog(taskID, agentID, logType, content string, metadata map[string]interface{}) (TaskLog, error) {
	if logType == "" {
		logType = "comment"
	}
	canonicalTaskID, err := s.findRowID(taskID)
	if err != nil {
		return TaskLog{}, fmt.Errorf("append task log: %w", err)
	}
	if metadata == nil {
		metadata = map[string]interface{}{}
	}
	metaBytes, _ := json.Marshal(metadata)
	now := time.Now().UnixMilli()
	var agentPtr *string
	if agentID != "" {
		agentPtr = &agentID
	}
	result, err := s.db.Exec(
		`INSERT INTO task_logs (task_id, agent_id, type, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		canonicalTaskID, agentPtr, logType, content, string(metaBytes), now,
	)
	if err != nil {
		return TaskLog{}, err
	}
	id, _ := result.LastInsertId()
	return TaskLog{
		ID:        id,
		TaskID:    canonicalTaskID,
		AgentID:   agentPtr,
		Type:      logType,
		Content:   content,
		Metadata:  metadata,
		CreatedAt: now,
	}, nil
}

// resolveTaskIDs returns all known IDs for a task — the connector ID and the
// original _id stored in the data blob. Logs/sessions may reference either.
func (s *Store) resolveTaskIDs(taskID string) []string {
	ids := []string{taskID}
	var dataStr string
	err := s.db.QueryRow(`SELECT data FROM tasks WHERE id = ?`, taskID).Scan(&dataStr)
	if err != nil {
		return ids
	}
	var data map[string]interface{}
	if json.Unmarshal([]byte(dataStr), &data) == nil {
		if origID, ok := data["_id"].(string); ok && origID != "" && origID != taskID {
			ids = append(ids, origID)
		}
	}
	return ids
}

// GetTaskLogs returns logs for a task, with optional agent fallback.
func (s *Store) GetTaskLogs(taskID, agentID, logType string, limit, offset int) ([]TaskLog, error) {
	if limit <= 0 {
		limit = 100
	}

	// Resolve both connector ID and original _id
	taskIDs := s.resolveTaskIDs(taskID)
	placeholders := "?"
	args := []interface{}{taskIDs[0]}
	for _, id := range taskIDs[1:] {
		placeholders += ", ?"
		args = append(args, id)
	}

	sql := "SELECT id, task_id, agent_id, type, content, metadata, created_at FROM task_logs WHERE task_id IN (" + placeholders + ")"
	if logType != "" {
		sql += " AND type = ?"
		args = append(args, logType)
	}
	sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := s.db.Query(sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []TaskLog
	for rows.Next() {
		var l TaskLog
		var agentStr *string
		var metaStr string
		if err := rows.Scan(&l.ID, &l.TaskID, &agentStr, &l.Type, &l.Content, &metaStr, &l.CreatedAt); err != nil {
			continue
		}
		l.AgentID = agentStr
		json.Unmarshal([]byte(metaStr), &l.Metadata)
		if l.Metadata == nil {
			l.Metadata = map[string]interface{}{}
		}
		logs = append(logs, l)
	}

	// Fallback: if no logs found and agentID provided, search by agent
	if len(logs) == 0 && agentID != "" {
		fbSQL := "SELECT id, task_id, agent_id, type, content, metadata, created_at FROM task_logs WHERE LOWER(agent_id) = LOWER(?)"
		fbArgs := []interface{}{agentID}
		if logType != "" {
			fbSQL += " AND type = ?"
			fbArgs = append(fbArgs, logType)
		}
		fbSQL += " ORDER BY created_at DESC LIMIT ?"
		fbArgs = append(fbArgs, limit)

		fbRows, err := s.db.Query(fbSQL, fbArgs...)
		if err != nil {
			return logs, nil
		}
		defer fbRows.Close()

		for fbRows.Next() {
			var l TaskLog
			var agentStr *string
			var metaStr string
			if err := fbRows.Scan(&l.ID, &l.TaskID, &agentStr, &l.Type, &l.Content, &metaStr, &l.CreatedAt); err != nil {
				continue
			}
			l.AgentID = agentStr
			json.Unmarshal([]byte(metaStr), &l.Metadata)
			if l.Metadata == nil {
				l.Metadata = map[string]interface{}{}
			}
			logs = append(logs, l)
		}
	}

	if logs == nil {
		logs = []TaskLog{}
	}
	return logs, nil
}

// ── Task Sessions ────────────────────────────────────────────────────────────

// TaskSession represents a row from task_sessions joined with sessions.
type TaskSession struct {
	SessionKey  string  `json:"session_key"`
	LinkedAt    int64   `json:"linked_at"`
	AgentID     *string `json:"agent_id"`
	Label       *string `json:"label"`
	CreatedAtMs *int64  `json:"created_at_ms"`
	UpdatedAtMs *int64  `json:"updated_at_ms"`
}

// GetTaskSessions returns sessions linked to a task, with optional agent fallback.
func (s *Store) GetTaskSessions(taskID, agentID string) ([]TaskSession, error) {
	// Resolve both connector ID and original _id
	taskIDs := s.resolveTaskIDs(taskID)
	placeholders := "?"
	args := []interface{}{taskIDs[0]}
	for _, id := range taskIDs[1:] {
		placeholders += ", ?"
		args = append(args, id)
	}

	rows, err := s.db.Query(
		`SELECT ts.session_key, ts.linked_at, s.agent_id, NULL, s.started_at, s.updated_at
		 FROM task_sessions ts LEFT JOIN sessions s ON s.id = ts.session_key
		 WHERE ts.task_id IN (`+placeholders+`) ORDER BY ts.linked_at DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []TaskSession
	for rows.Next() {
		var ts TaskSession
		if err := rows.Scan(&ts.SessionKey, &ts.LinkedAt, &ts.AgentID, &ts.Label, &ts.CreatedAtMs, &ts.UpdatedAtMs); err != nil {
			continue
		}
		sessions = append(sessions, ts)
	}

	// Fallback: if no sessions found and agentID provided, find sessions by agent
	if len(sessions) == 0 && agentID != "" {
		fbRows, err := s.db.Query(
			`SELECT s.id, s.started_at as linked_at, s.agent_id, NULL, s.started_at, s.updated_at
			 FROM sessions s WHERE LOWER(s.agent_id) = LOWER(?) ORDER BY s.updated_at DESC LIMIT 20`, agentID)
		if err != nil {
			return sessions, nil
		}
		defer fbRows.Close()

		for fbRows.Next() {
			var ts TaskSession
			if err := fbRows.Scan(&ts.SessionKey, &ts.LinkedAt, &ts.AgentID, &ts.Label, &ts.CreatedAtMs, &ts.UpdatedAtMs); err != nil {
				continue
			}
			sessions = append(sessions, ts)
		}
	}

	if sessions == nil {
		sessions = []TaskSession{}
	}
	return sessions, nil
}

// ── Task-Session Linking ─────────────────────────────────────────────────────

// LinkTaskSession creates a link between a task and a session key.
func (s *Store) LinkTaskSession(taskID, sessionKey string) error {
	canonicalID, err := s.findRowID(taskID)
	if err != nil {
		return fmt.Errorf("link task session: %w", err)
	}
	_, err = s.db.Exec(
		`INSERT OR IGNORE INTO task_sessions (task_id, session_key, linked_at) VALUES (?, ?, ?)`,
		canonicalID, sessionKey, time.Now().UnixMilli(),
	)
	return err
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func parseTimestamp(v interface{}, fallbackMs int64) int64 {
	switch ts := v.(type) {
	case string:
		if t, err := time.Parse(time.RFC3339Nano, ts); err == nil {
			return t.UnixMilli()
		}
		if t, err := time.Parse(time.RFC3339, ts); err == nil {
			return t.UnixMilli()
		}
	case float64:
		if ts > 1e12 {
			return int64(ts) // already ms
		}
		return int64(ts * 1000) // seconds → ms
	}
	return fallbackMs
}
