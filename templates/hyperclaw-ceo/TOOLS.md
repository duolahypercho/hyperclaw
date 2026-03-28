# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — what you use for orchestration.

## Orchestration Tools — What You Actually Use

### Reading the Pipeline

**File:** `~/.hyperclaw/todo.json`
```json
{
  "tasks": [
    {
      "id": "69c718...",
      "title": "Implement auth endpoint",
      "description": "JWT-based auth with refresh tokens",
      "agent": "atlas",
      "status": "in_progress",
      "priority": "high",
      "data": { "kind": "engineering", "external_id": "...", "sessionKey": "..." },
      "createdAt": "2026-03-28T00:00:00Z",
      "updatedAt": "2026-03-28T00:00:00Z"
    }
  ],
  "lists": [],
  "activeTaskId": null
}
```

**Read it:** `read(file_path="~/.hyperclaw/todo.json")`

**Task statuses:** `backlog`, `todo`, `in_progress`, `in_review`, `completed`, `blocked`

**Task priorities:** `critical`, `high`, `medium`, `low`

### Agent-to-Agent Communication

**List agents:**
```
agents_list()
→ returns [{id, name, status, role}]
```

**Spawn sub-agent with a task:**
```
sessions_spawn({
  task: "Write the auth endpoint. JWT + refresh tokens. Return working code + tests.",
  agentId: "atlas",
  mode: "run",
  label: "auth-endpoint"
})
```
This is your primary delegation tool. The agent receives the task, works on it, and returns the result.

**Send message to an existing session:**
```
sessions_send({
  message: "Status update on the auth endpoint?",
  agentId: "atlas"
})
```
Use this for check-ins and follow-ups, not new task assignments.

**List active sessions:**
```
sessions_list({
  kinds: ["main"],
  activeMinutes: 60,
  limit: 20
})
```

**Check sub-agent status:**
```
subagents(action="list")
→ shows all spawned sub-agents and their status
```

**Kill a stuck sub-agent:**
```
subagents(action="kill", target="atlas")
```

### Notifications to HyperClaw Dashboard

**Announce (shows in dashboard feed):**
```
message({
  message: "[Heartbeat] Assigned 2 tasks. Atlas: auth endpoint. Clio: competitor research.",
  channel: "announce"
})
```

**Events file (structured log):**
```
write(file_path="~/.hyperclaw/events.jsonl", file_text='{"type":"assignment","agent":"atlas","task":"auth-endpoint","timestamp":"..."}\n')
```

### Scheduling

**Create a cron job for an agent:**
```
cron(action="add", job={
  cron: "0 9 * * 1",
  task: "Weekly team status report. Check all agents, summarize progress, flag blockers.",
  deliver: "announce"
})
```

**List cron jobs:**
```
cron(action="list")
```

**Run a cron job now:**
```
cron(action="run", jobId="...", runMode="force")
```

### Reading Agent Identity

**Check who an agent is:**
```
read(file_path="~/.openclaw/workspace-atlas/IDENTITY.md")
```

**Check an agent's soul/behavior:**
```
read(file_path="~/.openclaw/workspace-atlas/SOUL.md")
```

### Task Pipeline Operations

**Update a task** (via todo.json — read, modify, write back):
1. `read(file_path="~/.hyperclaw/todo.json")`
2. Parse, update the task's `status`, `agent`, or fields
3. `write(file_path="~/.hyperclaw/todo.json", file_text=<updated JSON>)`

**Add a task log entry** (for audit trail):
```
write(file_path="~/.hyperclaw/events.jsonl", file_text='{"type":"review","taskId":"...","result":"approved","by":"hyperclaw","timestamp":"..."}\n')
```

### System Health

**Check if OpenClaw gateway is healthy:**
```
exec(command="curl -s http://127.0.0.1:18789/health")
```

**Check running processes:**
```
exec(command="ps aux | grep openclaw")
```

## Tools You Should NOT Use

- **web_search / web_fetch** — delegate to research agents
- **Code writing/execution** — delegate to engineering agents
- **Content creation** — delegate to content agents
- **File creation in other agent workspaces** — agents own their workspaces
- **browser** — delegate web tasks to agents with browser access

## Tool Access Config

In `openclaw.json`, your tool access should deny things you shouldn't do:
```json
{
  "tools": {
    "deny": ["web_search", "web_fetch"]
  }
}
```

Everything else (read, write, exec, sessions_spawn, sessions_send, cron, message, agents_list) should be available — you need them all for orchestration.

---

Add environment-specific notes below as you learn your setup.
