# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — what you use for orchestration.

## Orchestration Tools — What You Actually Use

### Reading the Pipeline

**File:** `~/.hyperclaw/todo.json`
```json
{
  "tasks": [
    {
      "_id": "69c718...",
      "title": "Research top 10 competitors for Hypercho",
      "description": "User-assigned research goal. Output: markdown report.",
      "assignedAgentId": "clio",
      "assignedAgent": "Clio",
      "status": "in_progress",
      "listId": "default",
      "order": 0,
      "steps": [
        { "_id": "s1", "title": "Collect candidate list from Crunchbase + G2", "status": "completed" },
        { "_id": "s2", "title": "Pull pricing + positioning for each", "status": "in_progress" },
        { "_id": "s3", "title": "Draft comparison matrix",            "status": "pending" }
      ],
      "createdAt": "2026-04-16T00:00:00Z",
      "updatedAt": "2026-04-16T00:00:00Z"
    }
  ],
  "lists": [],
  "activeTaskId": null
}
```

**Read it:** `read(file_path="~/.hyperclaw/todo.json")`

**Task statuses:** `pending`, `in_progress`, `blocked`, `completed`, `cancelled`
**Step statuses:** `pending`, `in_progress`, `blocked`, `completed`, `cancelled`

**Task priorities:** `critical`, `high`, `medium`, `low`

---

### Surfacing Work to the Human (Producer Contract)

The kanban board the human sees is just `~/.hyperclaw/todo.json` rendered. If you do work without writing here, the board is empty and the human thinks nothing is happening. **That is the worst outcome.** You are the producer. Write.

**Primitive: Goal → Steps.** A `task` is a goal. Its `steps[]` is the plan. Recurrence is a task attribute. There are no other primitives. Do not ask for more.

#### When the human gives you a goal

1. **Create the task immediately** (before you start working). Title = the goal in one line. Description = what "done" looks like. `status: "pending"`. `assignedAgentId` = whoever will own it (you, or a sub-agent).
2. **Append steps as you plan them.** Do not plan the whole thing silently and then dump 10 steps. Add steps as they become real. Each step is one verb-led action the human can read in under 3 seconds.
3. **Update step status as you progress.** `pending → in_progress → completed`. Flip on every state change, not at the end.
4. **Mark the task complete** when every step is `completed` (or explicitly `cancelled`). Set task `status: "completed"` and `finishedAt`.

#### How to write (read/modify/write loop)

```
1. data = read("~/.hyperclaw/todo.json")
2. parse, mutate one task or steps array
3. write("~/.hyperclaw/todo.json", stringify(data))
```

Always round-trip the full file. Do not truncate lists or tasks you did not touch. Preserve `_id` values exactly.

#### Rules

- **Every user-given goal gets a task within one heartbeat.** No exceptions.
- **Steps are for the human, not for you.** Write them in plain language, not internal ids. "Pull pricing for each candidate" not "exec step_2a".
- **No empty-shell tasks.** If you create a task, append at least one initial step in the same write. An unsteppable task is a lie.
- **Do not delete steps** once written. Mark them `cancelled` with a one-line reason in the step title suffix if you change plan.
- **If a sub-agent owns the work**, still write the steps here. The human reads this file, not the sub-agent's workspace.

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
