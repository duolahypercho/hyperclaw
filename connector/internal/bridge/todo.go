package bridge

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sync"
	"time"
)

// TodoStore provides thread-safe access to todo.json.
type TodoStore struct {
	path string
	mu   sync.Mutex
}

// NewTodoStore creates a TodoStore for the given file path.
func NewTodoStore(path string) *TodoStore {
	return &TodoStore{path: path}
}

type todoData struct {
	Tasks        []map[string]interface{} `json:"tasks"`
	Lists        []interface{}            `json:"lists"`
	ActiveTaskID interface{}              `json:"activeTaskId"`
}

func emptyTodoData() todoData {
	return todoData{
		Tasks:        []map[string]interface{}{},
		Lists:        []interface{}{},
		ActiveTaskID: nil,
	}
}

func (s *TodoStore) read() todoData {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return emptyTodoData()
	}
	var td todoData
	if err := json.Unmarshal(data, &td); err != nil {
		return emptyTodoData()
	}
	if td.Tasks == nil {
		td.Tasks = []map[string]interface{}{}
	}
	if td.Lists == nil {
		td.Lists = []interface{}{}
	}
	return td
}

func (s *TodoStore) write(td todoData) error {
	data, err := json.MarshalIndent(td, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}

// generateTaskID creates a 24-char hex string (8 timestamp + 16 random).
func generateTaskID() string {
	ts := fmt.Sprintf("%08x", time.Now().Unix())
	b := make([]byte, 8)
	rand.Read(b)
	return ts + hex.EncodeToString(b)
}

var validTaskIDRegex = regexp.MustCompile(`^[0-9a-f]{24}$`)

// GetTodoData returns the full todo data.
func (s *TodoStore) GetTodoData() actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	return okResult(s.read())
}

// SaveTodoData replaces the full todo data.
func (s *TodoStore) SaveTodoData(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	td := emptyTodoData()
	if raw, ok := params["todoData"]; ok && raw != nil {
		b, _ := json.Marshal(raw)
		json.Unmarshal(b, &td)
	}
	if td.Tasks == nil {
		td.Tasks = []map[string]interface{}{}
	}
	if td.Lists == nil {
		td.Lists = []interface{}{}
	}

	if err := s.write(td); err != nil {
		return okResult(map[string]interface{}{"success": false, "error": err.Error()})
	}
	return okResult(map[string]interface{}{"success": true})
}

// GetTasks returns just the tasks array.
func (s *TodoStore) GetTasks() actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	return okResult(s.read().Tasks)
}

// AddTask adds a task with generated id and timestamps.
func (s *TodoStore) AddTask(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	taskRaw, _ := params["task"].(map[string]interface{})
	if taskRaw == nil {
		taskRaw = map[string]interface{}{}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)

	// Use existing id if valid 24-char hex, otherwise generate
	existingID, _ := taskRaw["id"].(string)
	if !validTaskIDRegex.MatchString(existingID) {
		existingID = generateTaskID()
	}

	newTask := make(map[string]interface{})
	for k, v := range taskRaw {
		newTask[k] = v
	}
	newTask["id"] = existingID
	newTask["createdAt"] = now
	newTask["updatedAt"] = now

	td := s.read()
	td.Tasks = append(td.Tasks, newTask)
	s.write(td)

	return okResult(newTask)
}

// UpdateTask patches a task by id.
func (s *TodoStore) UpdateTask(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, _ := params["id"].(string)
	patch, _ := params["patch"].(map[string]interface{})

	td := s.read()
	idx := -1
	for i, t := range td.Tasks {
		if tid, _ := t["id"].(string); tid == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return okResult(nil)
	}

	td.Tasks[idx]["updatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	for k, v := range patch {
		td.Tasks[idx][k] = v
	}
	s.write(td)

	return okResult(td.Tasks[idx])
}

// DeleteTask removes a task by id.
func (s *TodoStore) DeleteTask(params map[string]interface{}) actionResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, _ := params["id"].(string)
	td := s.read()
	filtered := make([]map[string]interface{}, 0, len(td.Tasks))
	for _, t := range td.Tasks {
		if tid, _ := t["id"].(string); tid != id {
			filtered = append(filtered, t)
		}
	}
	if len(filtered) == len(td.Tasks) {
		return okResult(map[string]interface{}{"success": false})
	}
	td.Tasks = filtered
	s.write(td)
	return okResult(map[string]interface{}{"success": true})
}
