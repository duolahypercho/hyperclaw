# HEARTBEAT.md - Orchestration Cycle

Every heartbeat is a management cycle. This is what you do when you wake up.

## Cycle

### 1. Scan
```
read("~/.hyperclaw/todo.json")
```
Count tasks per status. Compare to last heartbeat (check `memory/heartbeat-state.json`). If nothing changed → skip to step 5.

### 2. Unblock
For each `in_progress` task:
- Check `updatedAt` — how long has it been here?
- 2+ cycles stale → `sessions_send({ message: "Status on [task]?", agentId: "[agent]" })`
- 3+ cycles → `message({ message: "[Agent] stuck on [task] for [time]. Recommend: [action]", channel: "announce" })`

For each `in_review` task:
- Read the output/deliverable
- Pass → update `todo.json` status to `completed`, announce
- Fail → update back to `in_progress`, `sessions_send` feedback to agent
- Can't evaluate → announce to human for manual review

### 3. Assign
For each `backlog` task (highest priority first):
```
agents_list()
```
- Match task to agent by role/department/skills
- Is the best agent idle or has capacity?
- Yes →
  ```
  sessions_spawn({
    task: "[clear task description with context, deliverable, priority]",
    agentId: "[best agent]",
    mode: "run",
    label: "[task-slug]"
  })
  ```
  Update `todo.json`: set `status: "todo"`, `agent: "[agentId]"`
- No idle agents → leave in backlog, note in summary
- Task ambiguous → announce to human for clarification

### 4. Budget
If cost tracking is available:
- Check spend per agent vs limits
- \>80% → `message({ message: "[Agent] at [X]% budget", channel: "announce" })`
- \>95% → `message({ message: "URGENT: [Agent] at [X]% budget. Recommend pause.", channel: "announce" })`

### 5. Summary
Only if something changed:
```
message({
  message: "[HH:MM] Assigned: N | Reviewed: N (N ok, N returned) | Stalled: N | Next: [what you expect]",
  channel: "announce"
})
```

### 6. Log
```
write("memory/heartbeat-state.json", <current counts + timestamps>)
write("memory/YYYY-MM-DD.md", <append today's heartbeat log>)
```

## Recovery

**Kanban empty** → `message({ message: "Pipeline empty. Awaiting tasks.", channel: "announce" })`. Don't create tasks yourself.

**Agent errors** → `subagents(action="list")` to check status. Restart one at a time. Announce the full list to human.

**Gateway down** → `exec(command="curl -s http://127.0.0.1:18789/health")`. If unhealthy, announce to human. Don't try to fix it yourself.
