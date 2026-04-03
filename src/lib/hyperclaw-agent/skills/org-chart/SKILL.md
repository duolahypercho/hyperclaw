---
name: org-chart
description: Read and manage the agent org chart — view hierarchy, assign tasks, update org nodes.
---

# Org Chart

Manage the organizational structure and task assignments for agents on the device.

## When to use

- Viewing the agent hierarchy (who reports to whom)
- Assigning work to specific agents/nodes
- Updating org structure or node properties
- Tracking task status across the org

## Workflows

### View Org Chart
1. Call `orgChart.read()`
2. Present as a tree: agent name, role, reports-to, current tasks

### Update Org Structure
1. Modify the org chart data
2. Call `orgChart.write(updatedData)`

### Assign a Task
1. Call `orgChart.assignTask({ nodeId, task, priority, deadline, ... })`
2. Confirm the assignment

### Update a Task
1. Call `orgChart.updateTask({ taskId, status, progress, ... })`
2. Confirm the update

## Important

- The org chart is the single source of truth for agent hierarchy
- Tasks assigned through the org chart are tracked separately from the todo system
- Changes to the org chart affect how agents delegate and report
