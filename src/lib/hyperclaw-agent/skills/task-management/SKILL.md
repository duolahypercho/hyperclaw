---
name: task-management
description: Manage tasks and todos on a device — create, update, complete, delete tasks and view todo lists.
---

# Task Management

Full CRUD for tasks and todos on the active device.

## When to use

- User wants to see, create, or manage tasks
- Tracking work across the platform
- Bulk task operations (mark complete, reassign, etc.)

## Workflows

### View Tasks
1. Call `todos.getTasks()` for the structured task list
2. Present: title, status, assignee, priority, due date
3. Group by status (todo, in-progress, done) if there are many

### Create a Task
1. Gather: title (required), description, priority, assignee, due date
2. Call `todos.addTask({ title, description, priority, assignee, dueDate })`
3. Confirm creation with the task ID

### Update a Task
1. Identify the task by title or ID
2. Call `todos.updateTask(id, { ...changes })`
3. Confirm what changed

### Complete a Task
1. Call `todos.updateTask(id, { status: 'done' })`

### Delete a Task
1. Call `todos.deleteTask(id)`

### Legacy Todo Data
- `todos.getAll()` fetches the raw todo JSON (older format)
- `todos.save(data)` writes it back
- Prefer the structured task APIs when possible

## Important

- Tasks are stored locally on the device (SQLite + JSON fallback)
- Task IDs are device-specific — they don't sync across devices
- The legacy todo format may have different field names than the structured task API
