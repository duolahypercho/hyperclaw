# Software Design Document: Mission Control (Autensa)

**Version:** 1.0
**Date:** 2026-03-12
**Status:** Reference Specification
**Source:** `~/Code/mission-control`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Data Model](#5-data-model)
6. [Database Schema](#6-database-schema)
7. [API Specification](#7-api-specification)
8. [Core Business Logic](#8-core-business-logic)
9. [State Management](#9-state-management)
10. [Real-Time System](#10-real-time-system)
11. [OpenClaw Integration](#11-openclaw-integration)
12. [Workflow Engine](#12-workflow-engine)
13. [Planning System](#13-planning-system)
14. [Knowledge & Learner Module](#14-knowledge--learner-module)
15. [Security](#15-security)
16. [Configuration](#16-configuration)
17. [UI Components & Pages](#17-ui-components--pages)
18. [Validation Schemas](#18-validation-schemas)
19. [Error Handling](#19-error-handling)
20. [Environment Variables](#20-environment-variables)

---

## 1. Executive Summary

Mission Control (rebranded Autensa) is an **AI Agent Orchestration Dashboard** that enables users to create tasks, leverage AI for intelligent planning, and dispatch work to specialized AI agents for execution. It provides real-time visibility into agent work and task progress through a Kanban-style interface with automated multi-stage workflow handoffs.

**Target Users:** Engineering teams and development organizations seeking to automate task execution through distributed AI agents via the OpenClaw Gateway.

**Core Value Proposition:** Human-in-the-loop task execution where AI agents handle work, workflows automate handoffs, and humans maintain oversight at approval gates.

---

## 2. System Overview

### Core Loop

```
User creates task
    -> AI Planning (interactive Q&A with master agent)
        -> Spec generation + agent spawning
            -> Dispatch to assigned agent via OpenClaw
                -> Agent executes work
                    -> Webhook callback on completion
                        -> Workflow engine hands off to next stage
                            -> Builder -> Tester -> Reviewer -> Done
                                (with fail-loopback and knowledge capture)
```

### Feature Map

| Domain | Features |
|--------|----------|
| Task Management | 8-column Kanban, drag-and-drop, priority levels, due dates, task images |
| AI Planning | Interactive Q&A, spec generation, auto-agent-spawning, timeout handling |
| Agent Orchestration | 4 core agents (Builder/Tester/Reviewer/Learner), custom agents, gateway discovery |
| Workflow Automation | Role-based stage transitions, auto-dispatch, fail-loopback, queue draining |
| Knowledge Base | Pattern capture, confidence scoring, context injection into future dispatches |
| Real-Time | SSE streaming, live event feed, agent status tracking |
| Multi-Workspace | Isolated agents/tasks/workflows per workspace |
| File Management | Task image upload, deliverable tracking, secure file serving |
| Security | Bearer token auth, HMAC webhook signing, Zod validation, path traversal protection |

---

## 3. Architecture

### High-Level Architecture

```
+-------------------+       +-------------------+       +-------------------+
|                   |  SSE  |                   | WS/RPC|                   |
|   Browser (React) | <---> | Next.js 14 Server | <---> | OpenClaw Gateway  |
|   Zustand Store   |       | API Routes        |       | (Agent Sessions)  |
|                   |       | SQLite DB         |       |                   |
+-------------------+       +-------------------+       +-------------------+
                                    |                           |
                                    v                           v
                            +---------------+           +---------------+
                            |  File System  |           |  AI Agents    |
                            |  (Images,     |           |  (Builder,    |
                            |   Deliverables)|          |   Tester,     |
                            +---------------+           |   Reviewer,   |
                                                        |   Learner)    |
                                                        +---------------+
                                                                |
                                                                v
                                                        +---------------+
                                                        |  Webhook      |
                                                        |  Callback     |
                                                        |  (Completion) |
                                                        +---------------+
```

### Request Flow Patterns

**Synchronous:** Browser -> API Route -> SQLite -> Response
**Real-Time:** API Route -> broadcast() -> SSE -> Browser -> Zustand
**Agent Dispatch:** API Route -> OpenClaw WS -> Agent Session -> Webhook -> API Route
**Planning:** API Route -> OpenClaw chat.send -> Poll loop -> Questions -> Answers -> Spec

### Directory Structure

```
mission-control/
  src/
    app/
      api/
        agents/          # CRUD + discovery + OpenClaw sessions
        events/          # List + SSE stream
        files/           # Upload, download, preview, reveal
        tasks/           # CRUD + dispatch + planning + fail + activities + deliverables
        webhooks/        # Agent completion callback
        workspaces/      # CRUD + workflows + knowledge
        openclaw/        # Status, models, sessions, orchestra
        demo/            # Demo data generation
      workspace/[slug]/  # Main dashboard page
      settings/          # Configuration page
    components/
      AgentModal.tsx
      AgentsSidebar.tsx
      MissionQueue.tsx       # Kanban board
      TaskModal.tsx          # Task create/edit with tabs
      PlanningTab.tsx        # Interactive Q&A
      LiveFeed.tsx           # Real-time events
      ActivityLog.tsx        # Per-task activity
      DeliverablesList.tsx   # File/URL/artifact list
      SessionsList.tsx       # OpenClaw session history
      TeamTab.tsx            # Workflow roles
      TaskImages.tsx         # Image upload/preview
    lib/
      db/
        index.ts             # SQLite singleton + helpers
        schema.ts            # CREATE TABLE migrations
      openclaw/
        client.ts            # WebSocket RPC client
      auto-dispatch.ts       # Auto-dispatch trigger logic
      config.ts              # Client/server config
      events.ts              # SSE broadcaster
      learner.ts             # Knowledge capture + injection
      planning-utils.ts      # JSON extraction, message parsing
      store.ts               # Zustand store
      types.ts               # All TypeScript interfaces
      validation.ts          # Zod schemas
      workflow-engine.ts     # Stage transitions, fail-loopback, queue drain
    middleware.ts            # Auth + demo mode guard
  mission-control.db         # SQLite database file
```

---

## 4. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 14 (App Router) | SSR, API routes, routing |
| Language | TypeScript 5 | Type safety |
| UI | React 18 + TailwindCSS | Components + styling |
| Icons | Lucide React | Iconography |
| DnD | Hello Pangea DnD | Kanban drag-and-drop |
| State | Zustand | Client-side store |
| Database | SQLite3 (better-sqlite3) | Local persistence |
| Validation | Zod | Runtime schema validation |
| Dates | date-fns | Relative timestamps |
| Real-Time | Server-Sent Events (SSE) | Push updates to browser |
| Agent Comms | WebSocket JSON-RPC | OpenClaw Gateway |
| Crypto | Node.js crypto | HMAC signatures, device identity |
| Process | PM2 | Production process management |
| Container | Docker + Docker Compose | Deployment |
| Dev | Turbopack | Fast dev builds |

---

## 5. Data Model

### Entity Relationship Diagram

```
Workspace (1) ----< (N) Agent
Workspace (1) ----< (N) Task
Workspace (1) ----< (N) WorkflowTemplate
Workspace (1) ----< (N) KnowledgeEntry

Agent (1) ----< (N) Task (assigned_agent_id)
Agent (1) ----< (N) Task (created_by_agent_id)
Agent (1) ----< (N) OpenClawSession
Agent (1) ----< (N) TaskRole
Agent (1) ----< (N) TaskActivity
Agent (1) ----< (N) KnowledgeEntry

Task (1) ----< (N) PlanningQuestion
Task (1) ----  (1) PlanningSpec
Task (1) ----< (N) TaskActivity
Task (1) ----< (N) TaskDeliverable
Task (1) ----< (N) TaskRole
Task (1) ----< (N) OpenClawSession
Task (1) ----< (N) KnowledgeEntry
Task (1) ----< (N) Event

WorkflowTemplate (1) ----< (N) Task
```

### Type Definitions

#### Enums

```typescript
type AgentStatus = 'standby' | 'working' | 'offline';

type TaskStatus =
  | 'pending_dispatch'
  | 'planning'
  | 'inbox'
  | 'assigned'
  | 'in_progress'
  | 'testing'
  | 'review'
  | 'verification'
  | 'done';

type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

type MessageType = 'text' | 'system' | 'task_update' | 'file';

type ConversationType = 'direct' | 'group' | 'task';

type EventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_completed'
  | 'message_sent'
  | 'agent_status_changed'
  | 'agent_joined'
  | 'system';

type AgentSource = 'local' | 'gateway';

type ActivityType = 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed';

type DeliverableType = 'file' | 'url' | 'artifact';

type PlanningQuestionType = 'multiple_choice' | 'text' | 'yes_no';

type PlanningCategory =
  | 'goal'
  | 'audience'
  | 'scope'
  | 'design'
  | 'content'
  | 'technical'
  | 'timeline'
  | 'constraints';

type SSEEventType =
  | 'task_updated'
  | 'task_created'
  | 'task_deleted'
  | 'activity_logged'
  | 'deliverable_added'
  | 'agent_spawned'
  | 'agent_completed';
```

#### Core Interfaces

```typescript
interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string;
  avatar_emoji: string;
  status: AgentStatus;
  is_master: boolean;
  workspace_id: string;
  soul_md?: string;       // Agent personality/behavior prompt
  user_md?: string;        // User-facing instructions
  agents_md?: string;      // Multi-agent coordination prompt
  model?: string;          // LLM model override
  source: AgentSource;
  gateway_agent_id?: string;
  session_key_prefix?: string;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_agent_id: string | null;
  created_by_agent_id: string | null;
  workspace_id: string;
  business_id: string;
  due_date?: string;
  workflow_template_id?: string;
  status_reason?: string;
  planning_complete?: number;         // 0 or 1
  planning_dispatch_error?: string;
  planning_session_key?: string;
  planning_messages?: string;         // JSON array of messages
  planning_spec?: string;             // JSON of generated spec
  planning_agents?: string;           // JSON of spawned agents
  images?: string;                    // JSON array of TaskImage
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_agent?: Agent;
  created_by_agent?: Agent;
}

interface TaskImage {
  filename: string;
  original_name: string;
  uploaded_at: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;          // URL-safe unique identifier
  description?: string;
  icon: string;          // Emoji
  created_at: string;
  updated_at: string;
}

interface WorkspaceStats {
  id: string;
  name: string;
  slug: string;
  icon: string;
  taskCounts: Record<TaskStatus, number> & { total: number };
  agentCount: number;
}

interface WorkflowTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  stages: WorkflowStage[];
  fail_targets: Record<string, string>;  // e.g., { "testing": "in_progress" }
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface WorkflowStage {
  id: string;
  label: string;
  role: string | null;   // null = queue stage (no agent, acts as waiting area)
  status: TaskStatus;
}

interface TaskRole {
  id: string;
  task_id: string;
  role: string;           // e.g., "builder", "tester", "reviewer", "learner"
  agent_id: string;
  created_at: string;
  agent?: Agent;          // Joined
}

interface TaskActivity {
  id: string;
  task_id: string;
  agent_id?: string;
  activity_type: ActivityType;
  message: string;
  metadata?: string;      // JSON
  created_at: string;
  agent?: Agent;          // Joined
}

interface TaskDeliverable {
  id: string;
  task_id: string;
  deliverable_type: DeliverableType;
  title: string;
  path?: string;
  description?: string;
  created_at: string;
}

interface PlanningQuestion {
  id: string;
  task_id: string;
  category: PlanningCategory;
  question: string;
  question_type: PlanningQuestionType;
  options?: PlanningQuestionOption[];
  answer?: string;
  answered_at?: string;
  sort_order: number;
  created_at: string;
}

interface PlanningQuestionOption {
  id: string;
  label: string;
}

interface PlanningSpec {
  id: string;
  task_id: string;
  spec_markdown: string;
  locked_at: string;
  locked_by?: string;
  created_at: string;
}

interface PlanningState {
  questions: PlanningQuestion[];
  spec?: PlanningSpec;
  progress: {
    total: number;
    answered: number;
    percentage: number;
  };
  isLocked: boolean;
}

interface Event {
  id: string;
  type: EventType;
  agent_id?: string;
  task_id?: string;
  message: string;
  metadata?: string;      // JSON
  created_at: string;
  agent?: Agent;          // Joined
  task?: Task;            // Joined
}

interface OpenClawSession {
  id: string;
  agent_id: string;
  openclaw_session_id: string;
  channel?: string;
  status: string;
  session_type: 'persistent' | 'subagent';
  task_id?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeEntry {
  id: string;
  workspace_id: string;
  task_id?: string;
  category: string;       // failure, fix, pattern, checklist
  title: string;
  content: string;
  tags?: string[];         // JSON array
  confidence: number;      // 0.0 - 1.0
  created_by_agent_id?: string;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_agent_id?: string;
  content: string;
  message_type: MessageType;
  metadata?: string;
  created_at: string;
  sender?: Agent;         // Joined
}

interface Conversation {
  id: string;
  title?: string;
  type: ConversationType;
  task_id?: string;
  created_at: string;
  updated_at: string;
}
```

#### API Request/Response Types

```typescript
interface CreateAgentRequest {
  name: string;
  role: string;
  description?: string;
  avatar_emoji?: string;
  is_master?: boolean;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  model?: string;
}

type UpdateAgentRequest = Partial<CreateAgentRequest> & { status?: AgentStatus };

interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigned_agent_id?: string;
  created_by_agent_id?: string;
  business_id?: string;
  workspace_id?: string;
  status?: TaskStatus;
  due_date?: string;
}

type UpdateTaskRequest = Partial<CreateTaskRequest> & {
  status?: TaskStatus;
  workflow_template_id?: string;
  updated_by_agent_id?: string;
};

interface DiscoveredAgent {
  id: string;
  name: string;
  label?: string;
  model?: string;
  channel?: string;
  status?: string;
  already_imported: boolean;
  existing_agent_id?: string;
}

interface OpenClawMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

interface OpenClawSessionInfo {
  id: string;
  channel: string;
  peer?: string;
  model?: string;
  status: string;
}

interface SSEEvent {
  type: SSEEventType;
  payload: Task | TaskActivity | TaskDeliverable | {
    taskId: string;
    sessionId: string;
    agentName?: string;
    summary?: string;
    deleted?: boolean;
  } | {
    id: string;
  };
}
```

---

## 6. Database Schema

15 tables using SQLite with WAL journal mode and foreign keys enabled.

### workspaces

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT '📁',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### agents

```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  avatar_emoji TEXT DEFAULT '🤖',
  status TEXT DEFAULT 'standby'
    CHECK (status IN ('standby', 'working', 'offline')),
  is_master INTEGER DEFAULT 0,
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  soul_md TEXT,
  user_md TEXT,
  agents_md TEXT,
  model TEXT,
  source TEXT DEFAULT 'local',
  gateway_agent_id TEXT,
  session_key_prefix TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### tasks

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'inbox'
    CHECK (status IN (
      'pending_dispatch', 'planning', 'inbox', 'assigned',
      'in_progress', 'testing', 'review', 'verification', 'done'
    )),
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_agent_id TEXT REFERENCES agents(id),
  created_by_agent_id TEXT REFERENCES agents(id),
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  business_id TEXT DEFAULT 'default',
  due_date TEXT,
  workflow_template_id TEXT REFERENCES workflow_templates(id),
  planning_session_key TEXT,
  planning_messages TEXT,
  planning_complete INTEGER DEFAULT 0,
  planning_spec TEXT,
  planning_agents TEXT,
  planning_dispatch_error TEXT,
  status_reason TEXT,
  images TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### planning_questions

```sql
CREATE TABLE IF NOT EXISTS planning_questions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice'
    CHECK (question_type IN ('multiple_choice', 'text', 'yes_no')),
  options TEXT,
  answer TEXT,
  answered_at TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### planning_specs

```sql
CREATE TABLE IF NOT EXISTS planning_specs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  spec_markdown TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  locked_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### task_activities

```sql
CREATE TABLE IF NOT EXISTS task_activities (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  activity_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### task_deliverables

```sql
CREATE TABLE IF NOT EXISTS task_deliverables (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  deliverable_type TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### task_roles

```sql
CREATE TABLE IF NOT EXISTS task_roles (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(task_id, role)
);
```

### workflow_templates

```sql
CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  stages TEXT NOT NULL,       -- JSON: WorkflowStage[]
  fail_targets TEXT,          -- JSON: Record<string, string>
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### openclaw_sessions

```sql
CREATE TABLE IF NOT EXISTS openclaw_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  openclaw_session_id TEXT NOT NULL,
  channel TEXT,
  status TEXT DEFAULT 'active',
  session_type TEXT DEFAULT 'persistent',
  task_id TEXT REFERENCES tasks(id),
  ended_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### events

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id),
  task_id TEXT REFERENCES tasks(id),
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### knowledge_entries

```sql
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  task_id TEXT REFERENCES tasks(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  confidence REAL DEFAULT 0.5,
  created_by_agent_id TEXT REFERENCES agents(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

### conversations (legacy)

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  type TEXT DEFAULT 'direct'
    CHECK (type IN ('direct', 'group', 'task')),
  task_id TEXT REFERENCES tasks(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, agent_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  sender_agent_id TEXT REFERENCES agents(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text'
    CHECK (message_type IN ('text', 'system', 'task_update', 'file')),
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### businesses (legacy)

```sql
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_task ON task_activities(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliverables_task ON task_deliverables(task_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_task ON openclaw_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace ON workflow_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_task_roles_task ON task_roles(task_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_workspace ON knowledge_entries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_task ON knowledge_entries(task_id);
```

### Database Helpers

```typescript
// Singleton pattern
function getDb(): Database.Database;
// Pragmas: journal_mode=WAL, foreign_keys=ON
// Auto-runs migrations on first access

function closeDb(): void;
function queryAll<T>(sql: string, params?: unknown[]): T[];
function queryOne<T>(sql: string, params?: unknown[]): T | undefined;
function run(sql: string, params?: unknown[]): Database.RunResult;
function transaction<T>(fn: () => T): T;
```

---

## 7. API Specification

### 7.1 Tasks — 15+ endpoints

#### `GET /api/tasks`

List tasks with optional filters.

| Query Param | Type | Description |
|-------------|------|-------------|
| `status` | string | Comma-separated statuses (e.g., `inbox,testing,in_progress`) |
| `workspace_id` | string | Filter by workspace |
| `business_id` | string | Filter by business |
| `assigned_agent_id` | string | Filter by assigned agent |

**Response:** `200 OK` — `Task[]` with joined agent info

#### `POST /api/tasks`

Create a new task.

**Request Body:**
```json
{
  "title": "string (required, 1-500 chars)",
  "description": "string (optional, max 10000)",
  "priority": "low | normal | high | urgent",
  "assigned_agent_id": "uuid (optional)",
  "created_by_agent_id": "uuid (optional)",
  "business_id": "string (optional)",
  "workspace_id": "string (optional)",
  "status": "TaskStatus (optional)",
  "due_date": "string (optional)"
}
```

**Side Effects:**
1. Auto-assigns default workflow template
2. Logs `task_created` event
3. Auto-populates `task_roles` via fuzzy matching workspace agents to workflow roles
4. Broadcasts `task_created` SSE event

**Response:** `201 Created` — Task

#### `GET /api/tasks/[id]`

**Response:** `200 OK` — Task with joined agent fields

#### `PATCH /api/tasks/[id]`

Update a task. This is the primary status-change endpoint that drives the workflow engine.

**Request Body:** `Partial<UpdateTaskRequest>`

**Side Effects (on status change):**
1. Logs `task_status_changed` or `task_completed` event
2. Triggers `handleStageTransition()` for workflow handoff
3. Calls `drainQueue()` when task reaches `done`
4. Resets agent status to `standby` if no more active tasks
5. Notifies learner on forward stage moves
6. Broadcasts `task_updated` SSE event

**Side Effects (on assignment change):**
1. Auto-promotes `inbox` -> `assigned` when agent first assigned
2. Logs `task_assigned` event
3. Triggers dispatch if conditions met

**Response:** `200 OK` — Updated Task

#### `DELETE /api/tasks/[id]`

**Side Effects:**
1. Resets agent status if this was their only active task
2. Cascade deletes: `openclaw_sessions`, `events`, `task_activities`, `task_deliverables`
3. Broadcasts `task_deleted` SSE event

**Response:** `200 OK` — `{ success: true }`

#### `POST /api/tasks/[id]/dispatch`

Dispatch task to its assigned agent via OpenClaw.

**Steps:**
1. Validate `assigned_agent_id` exists
2. Connect to OpenClaw Gateway
3. Get or create `openclaw_sessions` record
4. Build dispatch message containing:
   - Priority emoji + task title/description/due date
   - Planning spec (if present)
   - Agent instructions (if present)
   - Knowledge injection from learner module
   - Current workflow stage info
   - Role-specific completion instructions (builder/tester/verifier)
   - Reference images
   - Output directory path
5. Send via `client.call('chat.send', { sessionKey, message, idempotencyKey })`
6. Move `assigned` -> `in_progress`
7. Set agent status to `working`
8. Log dispatch event + activity
9. Broadcast `task_updated`

**Response:**
```json
{
  "success": true,
  "task_id": "string",
  "agent_id": "string",
  "session_id": "string",
  "message": "string"
}
```

**Error 409** (other orchestrators):
```json
{
  "success": false,
  "warning": "Other orchestrators available",
  "otherOrchestrators": [{ "id", "name", "role" }]
}
```

#### `POST /api/tasks/[id]/fail`

Report a stage failure with loopback.

**Request Body:** `{ "reason": "string" }`

**Allowed from:** `testing`, `review`, `verification` only

**Side Effects:**
1. Calls `notifyLearner()` (non-blocking)
2. Calls `handleStageFailure()`:
   - Looks up `workflow.fail_targets[currentStatus]`
   - Updates task status to fail target (e.g., `testing` -> `in_progress`)
   - Logs failure activity
   - Calls `handleStageTransition()` for the fail target (reassigns agent + dispatches)
3. Calls `drainQueue()`

**Response:** `{ success, message, newAgent }`

#### `GET /api/tasks/[id]/planning`

Get current planning state.

**Response:**
```json
{
  "taskId": "string",
  "sessionKey": "string",
  "messages": [{ "role": "user|assistant", "content": "string" }],
  "currentQuestion": {},
  "isComplete": false,
  "spec": {},
  "agents": {},
  "isStarted": true
}
```

#### `POST /api/tasks/[id]/planning`

Start a planning session.

**Steps:**
1. Validate no other orchestrators conflict
2. Create `sessionKey = {prefix}planning:{taskId}`
3. Send initial planning prompt via OpenClaw `chat.send`
4. Store session key + initial messages in DB
5. Return immediately (client polls GET for updates)

#### `POST /api/tasks/[id]/planning/answer`

Submit an answer to the current planning question.

#### `POST /api/tasks/[id]/planning/approve`

Approve the generated spec and trigger dispatch.

#### `POST /api/tasks/[id]/planning/retry-dispatch`

Retry a failed dispatch after planning.

#### `GET /api/tasks/[id]/planning/poll`

Poll for planning progress (questions, spec completion).

#### `DELETE /api/tasks/[id]/planning`

Cancel planning. Clears all planning fields, resets status to `inbox`.

#### `POST /api/tasks/[id]/activities`

Log a task activity.

**Request Body:**
```json
{
  "activity_type": "spawned | updated | completed | file_created | status_changed",
  "message": "string (1-5000 chars)",
  "agent_id": "uuid (optional)",
  "metadata": "string (optional JSON)"
}
```

**Response:** `201 Created` — TaskActivity (broadcasts `activity_logged`)

#### `GET /api/tasks/[id]/activities`

**Response:** `200 OK` — `TaskActivity[]` (ordered by created_at DESC, joined with agents)

#### `POST /api/tasks/[id]/deliverables`

Register a task deliverable.

**Request Body:**
```json
{
  "deliverable_type": "file | url | artifact",
  "title": "string",
  "path": "string (optional)",
  "description": "string (optional)"
}
```

**Response:** `201 Created` — TaskDeliverable (broadcasts `deliverable_added`)

#### `GET /api/tasks/[id]/deliverables`

**Response:** `200 OK` — `TaskDeliverable[]`

#### `GET /api/tasks/[id]/roles`

**Response:** `200 OK` — `TaskRole[]` with joined agent info

#### `PUT /api/tasks/[id]/roles`

Bulk update role assignments.

#### `POST /api/tasks/[id]/subagent`

Register a sub-agent session for a task.

#### `POST /api/tasks/[id]/images`

Upload reference images to a task.

#### `GET /api/tasks/[id]/images`

List task images.

---

### 7.2 Agents — 7+ endpoints

#### `GET /api/agents`

| Query Param | Type | Description |
|-------------|------|-------------|
| `workspace_id` | string | Filter by workspace |

**Response:** `200 OK` — `Agent[]`

#### `POST /api/agents`

**Request Body:** `CreateAgentRequest`
**Response:** `201 Created` — Agent

#### `GET /api/agents/[id]`

**Response:** `200 OK` — Agent

#### `PATCH /api/agents/[id]`

**Request Body:** `UpdateAgentRequest`
**Response:** `200 OK` — Updated Agent

#### `DELETE /api/agents/[id]`

**Response:** `200 OK` — `{ success: true }`

#### `GET /api/agents/discover`

Discover agents available on the OpenClaw Gateway that haven't been imported yet.

**Response:** `200 OK` — `DiscoveredAgent[]`

#### `POST /api/agents/import`

Import a discovered gateway agent into the local database.

#### `GET /api/agents/[id]/openclaw`

Get the agent's active OpenClaw session.

#### `DELETE /api/agents/[id]/openclaw`

Disconnect agent from OpenClaw.

---

### 7.3 OpenClaw Gateway — 8 endpoints

#### `GET /api/openclaw/status`

**Response:**
```json
{
  "connected": true,
  "sessionCount": 5,
  "url": "ws://127.0.0.1:18789"
}
```

#### `GET /api/openclaw/models`

List available LLM models. Discovery modes: `auto` (default), `remote`, `local`.

**Response:** `200 OK` — Model list

#### `GET /api/openclaw/sessions`

**Response:** `200 OK` — `OpenClawSessionInfo[]`

#### `GET /api/openclaw/sessions/[id]`

**Response:** `200 OK` — `OpenClawSessionInfo`

#### `PATCH /api/openclaw/sessions/[id]`

Update session status.

#### `GET /api/openclaw/sessions/[id]/history`

**Response:** `200 OK` — Message history array

#### `POST /api/openclaw/orchestra/`

Proxy RPC call to OpenClaw.

---

### 7.4 Workspaces — 4+ endpoints

#### `GET /api/workspaces`

**Response:** `200 OK` — `WorkspaceStats[]` (includes task counts and agent count)

#### `POST /api/workspaces`

**Response:** `201 Created` — Workspace

#### `GET /api/workspaces/[id]`

**Response:** `200 OK` — Workspace

#### `GET /api/workspaces/[id]/workflows`

**Response:** `200 OK` — `WorkflowTemplate[]`

#### `POST /api/workspaces/[id]/workflows`

Create a workflow template for the workspace.

#### `GET /api/workspaces/[id]/knowledge`

**Response:** `200 OK` — `KnowledgeEntry[]`

#### `POST /api/workspaces/[id]/knowledge`

Add a knowledge entry (used by learner agent via webhook).

---

### 7.5 Webhooks — 1 endpoint

#### `POST /api/webhooks/agent-completion`

Agent completion callback. Verified via HMAC-SHA256 signature in `x-webhook-signature` header.

**Request Body (Format 1 — direct):**
```json
{
  "task_id": "string",
  "summary": "string (optional)"
}
```

**Request Body (Format 2 — session-based):**
```json
{
  "session_id": "string",
  "message": "TASK_COMPLETE: <summary>"
}
```

**Side Effects:**
1. Move task to `testing` (if not already in testing/review/done)
2. Log `task_completed` event
3. Set agent status to `standby`

**Response:** `{ success, task_id, new_status: "testing", message }`

#### `GET /api/webhooks/agent-completion`

Health check — returns recent completions count and endpoint URL.

---

### 7.6 Files — 4 endpoints

#### `POST /api/files/upload` — Upload file (task images)
#### `GET /api/files/download` — Download deliverable file
#### `GET /api/files/preview` — Preview file content
#### `GET /api/files/reveal` — Reveal file in Finder/Explorer
#### `GET /api/task-images/[...path]` — Static task image serving

---

### 7.7 Events — 2 endpoints

#### `GET /api/events`

Recent events list.

#### `GET /api/events/stream`

SSE endpoint. Keep-alive every 30s.

**Event format:**
```
data: {"type":"task_updated","payload":{...}}\n\n
```

---

### 7.8 Demo — 1 endpoint

#### `POST /api/demo` — Generate demo data

---

## 8. Core Business Logic

### 8.1 Task Creation Flow

```
POST /api/tasks
  |-> Validate input (CreateTaskSchema)
  |-> Generate UUID
  |-> Auto-assign workspace default workflow template
  |-> INSERT task with status='inbox'
  |-> Log 'task_created' event
  |-> populateTaskRolesFromAgents(id, workspace_id)
  |     |-> Fuzzy match workflow stage roles to workspace agents
  |     |-> INSERT task_roles for matched pairs
  |-> Broadcast 'task_created' via SSE
  |-> Return 201
```

### 8.2 Task Assignment & Auto-Dispatch Flow

```
PATCH /api/tasks/[id] with { assigned_agent_id }
  |-> Auto-promote inbox -> assigned (if needed)
  |-> Log 'task_assigned' event
  |-> If status is actionable:
  |     |-> Try workflow engine via handleStageTransition()
  |     |-> If no workflow/role match: call POST /api/tasks/[id]/dispatch
  |-> Update assigned_agent_id
  |-> Broadcast 'task_updated'
```

### 8.3 Dispatch Flow

```
POST /api/tasks/[id]/dispatch
  |-> Get task + agent + workflow info
  |-> Connect to OpenClaw (if not connected)
  |-> Get or create openclaw_sessions record
  |-> Build task message:
  |     |-> Priority emoji + title/description/due_date
  |     |-> Planning spec section (if present)
  |     |-> Agent instructions section (if present)
  |     |-> Knowledge injection (from learner)
  |     |-> Current workflow stage info
  |     |-> Role-specific completion instructions:
  |     |     |-> Builder: log activity, register deliverable, update status
  |     |     |-> Tester: test, pass/fail
  |     |     |-> Verifier: verify, pass/fail
  |     |-> Reference images
  |     |-> Output directory path
  |-> Send via client.call('chat.send', ...)
  |-> Move 'assigned' -> 'in_progress'
  |-> Set agent status = 'working'
  |-> Log dispatch event + activity
  |-> Broadcast 'task_updated'
```

### 8.4 Stage Transition Flow

```
PATCH /api/tasks/[id] with { status: newStatus }
  |-> handleStageTransition(id, newStatus)
  |     |-> Get workflow template for task
  |     |-> Find stage matching newStatus
  |     |-> If stage.role === null && status !== 'done':
  |     |     |-> Queue stage -> call drainQueue()
  |     |-> Find agent for role (task_roles first, then assigned_agent_id)
  |     |-> Assign agent to task
  |     |-> Log "Stage handoff: {stage} -> {agent}" activity
  |     |-> POST /api/tasks/{id}/dispatch to new agent
  |     |-> Return { success, handedOff, newAgentId, newAgentName }
```

### 8.5 Stage Failure Flow

```
POST /api/tasks/[id]/fail with { reason }
  |-> Validate current status in [testing, review, verification]
  |-> notifyLearner(taskId, event)          # non-blocking
  |-> handleStageFailure(id, currentStatus, reason)
  |     |-> Get fail_target from workflow.fail_targets[currentStatus]
  |     |-> Update task.status = fail_target
  |     |-> Log "Stage failed: {from} -> {to} (reason)" activity
  |     |-> handleStageTransition(id, fail_target)
  |     |     |-> Reassign builder agent
  |     |     |-> Dispatch with failure context
  |-> drainQueue(id, workspace_id)
```

### 8.6 Queue Drain Flow

```
drainQueue(triggeringTaskId, workspaceId, workflow?)
  |-> Find queue stages (role === null && status !== 'done')
  |-> For each queue stage:
  |     |-> Check if next stage is currently occupied
  |     |-> If next stage is free:
  |     |     |-> Find oldest task in queue
  |     |     |-> Move to next stage
  |     |     |-> handleStageTransition() for new stage
  |-> Repeat until all queues processed or next stages occupied
```

### 8.7 Auto-Dispatch Trigger

```typescript
function shouldTriggerAutoDispatch(
  previousStatus: string,
  newStatus: string,
  assignedAgentId: string | null
): boolean {
  const wasNotInProgress = previousStatus !== 'in_progress';
  const isNowInProgress = newStatus === 'in_progress';
  const hasAssignedAgent = !!assignedAgentId;
  return wasNotInProgress && isNowInProgress && hasAssignedAgent;
}

async function triggerAutoDispatch(options: {
  taskId: string;
  taskTitle: string;
  agentId: string | null;
  agentName: string;
  workspaceId?: string;
}): Promise<{ success: boolean; error?: string }> {
  // POST to /api/tasks/${taskId}/dispatch
}
```

---

## 9. State Management

### Zustand Store

```typescript
interface MissionControlState {
  // Data
  agents: Agent[];
  tasks: Task[];
  conversations: Conversation[];
  events: Event[];
  currentConversation: Conversation | null;
  messages: Message[];

  // OpenClaw state
  agentOpenClawSessions: Record<string, OpenClawSession | null>;
  openclawMessages: Message[];

  // UI State
  selectedAgent: Agent | null;
  selectedTask: Task | null;
  isOnline: boolean;
  isLoading: boolean;
  selectedBusiness: string;

  // Data setters
  setAgents: (agents: Agent[]) => void;
  setTasks: (tasks: Task[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  setEvents: (events: Event[]) => void;
  addEvent: (event: Event) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;

  // UI setters
  setSelectedAgent: (agent: Agent | null) => void;
  setSelectedTask: (task: Task | null) => void;
  setIsOnline: (online: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedBusiness: (business: string) => void;

  // Task mutations
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTask: (task: Task) => void;
  addTask: (task: Task) => void;
  removeTask: (taskId: string) => void;

  // Agent mutations
  updateAgent: (agent: Agent) => void;
  addAgent: (agent: Agent) => void;

  // OpenClaw
  setAgentOpenClawSession: (agentId: string, session: OpenClawSession | null) => void;
  setOpenclawMessages: (messages: Message[]) => void;
  addOpenclawMessage: (message: Message) => void;
}
```

**Initial state:** All arrays empty, all selections null, `isOnline: false`, `isLoading: true`, `selectedBusiness: 'all'`.

---

## 10. Real-Time System

### SSE Broadcaster

```typescript
// lib/events.ts — Server-side singleton

const clients: Set<ReadableStreamDefaultController> = new Set();

function registerClient(controller: ReadableStreamDefaultController): void;
function unregisterClient(controller: ReadableStreamDefaultController): void;
function broadcast(event: SSEEvent): void;
function getActiveConnectionCount(): number;
```

### SSE Endpoint

```
GET /api/events/stream

Response headers:
  Content-Type: text/event-stream
  Cache-Control: no-cache, no-transform
  Connection: keep-alive
  X-Accel-Buffering: no

Stream format:
  : connected\n\n                          # Initial comment
  : keep-alive\n\n                         # Every 30 seconds
  data: {"type":"task_updated","payload":{...}}\n\n
```

### Broadcast Points

Events are broadcast from:
- Task create / update / delete
- Activity logged
- Deliverable added
- Workflow stage transitions
- Agent dispatch
- Planning state changes
- Agent status changes

---

## 11. OpenClaw Integration

### WebSocket Client

```typescript
class OpenClawClient extends EventEmitter {
  // Connection
  url: string;                    // OPENCLAW_GATEWAY_URL env
  token: string;                  // OPENCLAW_GATEWAY_TOKEN env
  connected: boolean;
  authenticated: boolean;
  autoReconnect: boolean;         // Exponential backoff (10s)
  deviceIdentity: {
    deviceId: string;
    publicKeyPem: string;
    privateKeyPem: string;
  } | null;

  // RPC
  messageId: number;              // Auto-incrementing
  pendingRequests: Map<string | number, { resolve, reject }>;

  // Methods
  async connect(): Promise<void>;           // WS + device auth challenge-response
  async call<T>(method: string, params?: object): Promise<T>;  // 30s timeout
  async listSessions(): Promise<OpenClawSessionInfo[]>;
  async getSessionHistory(sessionId: string): Promise<unknown[]>;
  async sendMessage(sessionId: string, content: string): Promise<void>;
  async createSession(channel: string, peer?: string): Promise<OpenClawSessionInfo>;
  async listAgents(): Promise<unknown[]>;
  async listNodes(): Promise<unknown[]>;
  async describeNode(nodeId: string): Promise<unknown>;
  async listModels(): Promise<GatewayModelChoice[]>;
  async getConfig(): Promise<GatewayConfigSnapshot>;
  disconnect(): void;
  isConnected(): boolean;
  setAutoReconnect(enabled: boolean): void;
}
```

### Deduplication

- Global event cache per client instance (max 1000 entries, LRU, 1h TTL)
- `generateEventId(data)` uses SHA-256 hash of: type, seq, runId, stream, event, payload hash
- RPC responses (type=`res`) are NEVER deduplicated (they have unique request IDs)

### Session Types

| Type | Lifecycle | Usage |
|------|-----------|-------|
| `persistent` | Long-lived, reused across dispatches | Master agent planning, primary agent sessions |
| `subagent` | Task-scoped, ended when task completes | Child agents spawned for parallel work |

---

## 12. Workflow Engine

### Functions

```typescript
function getTaskWorkflow(taskId: string): WorkflowTemplate | null;
// 1. Check task.workflow_template_id
// 2. Fall back to workspace default (is_default=1)
// 3. Fall back to global default

function getTaskRoles(taskId: string): TaskRole[];
// JOIN task_roles with agents

function getAgentForRole(taskId: string, role: string): { id: string; name: string } | null;
// Find agent assigned to specific role on task

async function handleStageTransition(
  taskId: string,
  newStatus: TaskStatus,
  options?: { skipDispatch?: boolean }
): Promise<StageTransitionResult>;

interface StageTransitionResult {
  success: boolean;
  handedOff: boolean;
  newAgentId?: string;
  newAgentName?: string;
  error?: string;
}

async function handleStageFailure(
  taskId: string,
  currentStatus: TaskStatus,
  failReason: string
): Promise<StageTransitionResult>;

function populateTaskRolesFromAgents(taskId: string, workspaceId: string): void;
// Fuzzy matches workflow stage roles to workspace agents
// Inserts task_roles for matched pairs

async function drainQueue(
  triggeringTaskId: string,
  workspaceId: string,
  workflow?: WorkflowTemplate
): Promise<void>;
// Moves oldest task from queue stages to next stage when free
```

### Default Workflow

```typescript
const DEFAULT_WORKFLOW: WorkflowTemplate = {
  stages: [
    { id: 'inbox',        label: 'Inbox',        role: null,       status: 'inbox' },
    { id: 'assigned',     label: 'Assigned',      role: null,       status: 'assigned' },
    { id: 'in_progress',  label: 'In Progress',   role: 'builder',  status: 'in_progress' },
    { id: 'testing',      label: 'Testing',       role: 'tester',   status: 'testing' },
    { id: 'review',       label: 'Review',        role: null,       status: 'review' },     // Queue
    { id: 'verification', label: 'Verification',  role: 'reviewer', status: 'verification' },
    { id: 'done',         label: 'Done',          role: null,       status: 'done' },
  ],
  fail_targets: {
    testing: 'in_progress',       // Test fail -> back to builder
    review: 'in_progress',        // Review fail -> back to builder
    verification: 'in_progress',  // Verification fail -> back to builder
  },
};
```

### Core Agent Roles

| Role | Agent | Responsibility |
|------|-------|---------------|
| `builder` | Builder Agent | Primary work execution |
| `tester` | Tester Agent | Automated testing of deliverables |
| `reviewer` | Reviewer Agent | Quality verification |
| `learner` | Learner Agent | Knowledge capture from all transitions |

---

## 13. Planning System

### Planning Flow

```
1. POST /api/tasks/[id]/planning          # Start planning
   |-> Create sessionKey = {prefix}planning:{taskId}
   |-> Send initial planning prompt to master agent
   |-> Store sessionKey + messages
   |-> Return immediately

2. Client polls GET /api/tasks/[id]/planning    # Every 2s
   |-> Returns { messages, currentQuestion, isComplete, spec, agents }

3. POST /api/tasks/[id]/planning/answer    # User answers question
   |-> Send answer to OpenClaw session
   |-> AI generates next question or spec

4. POST /api/tasks/[id]/planning/approve   # Approve spec
   |-> Lock spec
   |-> Create specialized agents based on planning_agents
   |-> Auto-dispatch to assigned agent

5. DELETE /api/tasks/[id]/planning         # Cancel
   |-> Clear all planning fields
   |-> Reset status to inbox
```

### Planning Utilities

```typescript
function extractJSON(text: string): object | null;
// Max input: 1MB (ReDoS prevention)
// Try: direct JSON.parse -> markdown code blocks -> extract first { to last }

async function getMessagesFromOpenClaw(
  sessionKey: string
): Promise<Array<{ role: string; content: string }>>;
// Calls chat.history with limit: 50
// Filters to assistant messages
```

### Planning Question Categories

| Category | Purpose |
|----------|---------|
| `goal` | What the task aims to achieve |
| `audience` | Who the output is for |
| `scope` | Boundaries and constraints |
| `design` | Visual/UX decisions |
| `content` | Content requirements |
| `technical` | Technical approach |
| `timeline` | Deadlines and milestones |
| `constraints` | Hard limitations |

---

## 14. Knowledge & Learner Module

### Learner Notification

```typescript
async function notifyLearner(
  taskId: string,
  event: {
    previousStatus: string;
    newStatus: string;
    passed: boolean;
    failReason?: string;
    context?: string;
  }
): Promise<void>;
```

**Steps:**
1. Find learner role assignment (`task_roles` where `role='learner'`)
2. Get or create OpenClaw session for learner agent
3. Send message via `chat.send` containing:
   - Task title + transition info + pass/fail status
   - API endpoint for posting knowledge: `POST /api/workspaces/{workspace_id}/knowledge`
   - Focus areas: what went wrong, pattern, prevention, checklist

### Knowledge Injection

```typescript
function getRelevantKnowledge(
  workspaceId: string,
  taskTitle: string
): KnowledgeEntry[];
// Queries knowledge_entries by workspace, confidence-sorted

function formatKnowledgeForDispatch(knowledge: KnowledgeEntry[]): string;
// Formats as markdown section injected into dispatch message
```

### Knowledge Categories

| Category | Description |
|----------|-------------|
| `failure` | What went wrong and why |
| `fix` | How a failure was resolved |
| `pattern` | Recurring patterns observed |
| `checklist` | Steps to prevent future issues |

---

## 15. Security

### Authentication

```
Middleware (src/middleware.ts)
  |-> Skip /api/webhooks/* (uses HMAC instead)
  |-> If MC_API_TOKEN not set: auth disabled (dev mode)
  |-> If MC_API_TOKEN set:
  |     |-> Allow same-origin requests (Origin/Referer match)
  |     |-> Allow SSE with ?token= query param
  |     |-> Require Bearer token in Authorization header
  |-> Return 401 Unauthorized on mismatch
```

### Demo Mode

```
If DEMO_MODE=true:
  |-> Block all write operations (non-GET/HEAD/OPTIONS)
  |-> Return 403 Forbidden
```

### Webhook HMAC Verification

```typescript
// x-webhook-signature header
const expectedSig = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(body))
  .digest('hex');

if (signature !== expectedSig) return 401;
```

### Input Validation

All inputs validated with Zod schemas before processing. See [Section 18](#18-validation-schemas).

### File Security

Path traversal protection — rejects any path containing `../`.

---

## 16. Configuration

### Client-Side Config (localStorage)

```typescript
interface MissionControlConfig {
  workspaceBasePath: string;           // Default: ~/Documents/Shared
  projectsPath: string;                // Default: ~/Documents/Shared/projects
  missionControlUrl: string;           // Auto-detected from window.location.origin
  defaultProjectName: string;          // Default: 'mission-control'
  kanbanCompactEmptyColumns: boolean;  // Default: false
}

function getConfig(): MissionControlConfig;
function updateConfig(updates: Partial<MissionControlConfig>): void;
function resetConfig(): void;
function getMissionControlUrl(): string;
function getWorkspaceBasePath(): string;
function getProjectsPath(): string;
function getProjectPath(projectName: string, subpath?: string): string;
```

---

## 17. UI Components & Pages

### Pages

| Route | Description |
|-------|-------------|
| `/` | Redirects to first workspace |
| `/workspace/[slug]` | Main dashboard: Kanban + agents sidebar + live feed |
| `/workspace/[slug]/activity` | Agent Activity Dashboard (timeline view) |
| `/settings` | Configuration page (workspace paths, URLs, preferences) |

### Components

| Component | Description |
|-----------|-------------|
| `MissionQueue.tsx` | 8-column Kanban board with HTML5 drag-and-drop, dynamic column widths, mobile tab view, status move modal |
| `TaskCard` (inside MissionQueue) | Card with drag handle, title, status badges, priority dots, agent info, relative timestamps, mobile move-status button |
| `AgentsSidebar.tsx` | Team panel with agent status, session counts, connect/disconnect buttons |
| `TaskModal.tsx` | Create/edit modal with tabs: Overview, Planning, Team, Activity, Deliverables, Images, Sessions |
| `AgentModal.tsx` | Create/edit modal with tabs: Info, Soul MD, User MD, Agents MD |
| `PlanningTab.tsx` | Interactive Q&A — shows questions, collects answers, polls for progress, approve/cancel |
| `LiveFeed.tsx` | Real-time event stream with event type icons and relative timestamps |
| `ActivityLog.tsx` | Per-task activity timeline (spawned, updated, completed, file_created, status_changed) |
| `DeliverablesList.tsx` | Files, URLs, artifacts with download/preview/reveal actions |
| `SessionsList.tsx` | OpenClaw session history per task |
| `TeamTab.tsx` | Workflow selector + role-to-agent assignments |
| `TaskImages.tsx` | Upload/preview reference images |
| `AgentActivityDashboard.tsx` | Full timeline view of all agent work across tasks |
| `SSEDebugPanel.tsx` | Debug panel for real-time event streaming |

### Kanban Logic (MissionQueue.tsx)

```typescript
// Dynamic column widths
function getDesktopColumnWidth(taskCount: number): string {
  if (!compactEmptyColumns) return '280px';
  if (taskCount === 0) return 'fit-content';
  return `${Math.min(380, 250 + taskCount * 14)}px`;
}

// HTML5 drag-and-drop
const [draggedTask, setDraggedTask] = useState<Task | null>(null);

function handleDragStart(e: React.DragEvent, task: Task) {
  if (mobileMode) return;
  setDraggedTask(task);
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e: React.DragEvent) {
  if (mobileMode) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

async function handleDrop(e: React.DragEvent, targetStatus: TaskStatus) {
  if (mobileMode) return;
  e.preventDefault();
  if (!draggedTask || draggedTask.status === targetStatus) {
    setDraggedTask(null);
    return;
  }
  await updateTaskStatusWithPersist(draggedTask, targetStatus);
  setDraggedTask(null);
}

// Mobile: tab selector + status move bottom sheet
const [mobileStatus, setMobileStatus] = useState<TaskStatus>('planning');
const [statusMoveTask, setStatusMoveTask] = useState<Task | null>(null);
```

---

## 18. Validation Schemas

Using Zod for runtime validation on all API inputs.

```typescript
const TaskStatusEnum = z.enum([
  'pending_dispatch', 'planning', 'inbox', 'assigned',
  'in_progress', 'testing', 'review', 'verification', 'done'
]);

const TaskPriorityEnum = z.enum(['low', 'normal', 'high', 'urgent']);

const ActivityTypeEnum = z.enum([
  'spawned', 'updated', 'completed', 'file_created', 'status_changed'
]);

const DeliverableTypeEnum = z.enum(['file', 'url', 'artifact']);

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assigned_agent_id: z.string().uuid().optional().nullable(),
  created_by_agent_id: z.string().uuid().optional().nullable(),
  business_id: z.string().optional(),
  workspace_id: z.string().optional(),
  due_date: z.string().optional().nullable(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assigned_agent_id: z.string().uuid().optional().nullable(),
  workflow_template_id: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  updated_by_agent_id: z.string().uuid().optional(),
});

const CreateActivitySchema = z.object({
  activity_type: ActivityTypeEnum,
  message: z.string().min(1).max(5000),
  agent_id: z.string().uuid().optional(),
  metadata: z.string().optional(),
});

const CreateDeliverableSchema = z.object({
  deliverable_type: DeliverableTypeEnum,
  title: z.string().min(1),
  path: z.string().optional(),
  description: z.string().optional(),
});
```

---

## 19. Error Handling

| Code | When | Response Body |
|------|------|---------------|
| `400` | Validation error | `{ error: "Validation error", details: ZodError[] }` |
| `401` | Invalid/missing auth token | `{ error: "Unauthorized" }` |
| `403` | Agent permissions / demo mode | `{ error: "Forbidden", message: "..." }` |
| `404` | Resource not found | `{ error: "Task not found" }` (etc.) |
| `409` | Conflict (other orchestrators) | `{ success: false, warning: "...", otherOrchestrators: [] }` |
| `500` | Internal error | `{ error: "Internal server error", message: "..." }` |
| `503` | OpenClaw Gateway unreachable | `{ error: "Service unavailable" }` |

---

## 20. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_PATH` | No | `./mission-control.db` | SQLite database file path |
| `OPENCLAW_GATEWAY_URL` | No | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | No | `""` | Gateway authentication token |
| `MC_API_TOKEN` | No | _(disabled)_ | API bearer token (dev mode if unset) |
| `WEBHOOK_SECRET` | No | _(disabled)_ | HMAC-SHA256 secret for webhook verification |
| `DEMO_MODE` | No | `false` | Block write operations when `true` |
| `MISSION_CONTROL_URL` | No | _(auto-detected)_ | Server-side URL for internal API calls |
| `WORKSPACE_BASE_PATH` | No | `~/Documents/Shared` | Base directory for workspaces |
| `PROJECTS_PATH` | No | `{base}/projects` | Directory for project files |
| `PORT` | No | `4000` | Server port |

---

_End of Software Design Document_
