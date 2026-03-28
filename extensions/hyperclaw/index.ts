import { HyperClawBridge } from "./bridge";


/**
 * HyperClaw OpenClaw Plugin
 *
 * Registers agent tools that bridge OpenClaw agents to the HyperClaw desktop cockpit.
 * All data flows through a shared file store at ~/.hyperclaw/ so the Electron app can
 * watch for changes in real time.
 *
 * Tools registered:
 *   hyperclaw_add_task     — Create a task visible in the HyperClaw dashboard
 *   hyperclaw_get_tasks    — Read current tasks from HyperClaw
 *   hyperclaw_update_task  — Update a task's status, priority, or description
 *   hyperclaw_delete_task  — Remove a task
 *   hyperclaw_notify       — Push a notification/event to HyperClaw UI
 *   hyperclaw_batch        — Batch ops for sessions, transcripts, task logs, and task-session links
 */

const plugin = {
  id: "hyperclaw",
  name: "HyperClaw Bridge",
  description: "Two-way relay between OpenClaw agents and the HyperClaw desktop cockpit",

  register(api: any) {
    const dataDir = api.pluginConfig?.dataDir as string | undefined;
    const bridge = new HyperClawBridge(dataDir);

    // ── hyperclaw_add_task ───────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_add_task",
      description:
        "Create a new task in the HyperClaw dashboard. Returns the created task with its ID.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Detailed description" },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Task priority (default: medium)",
          },
          agent: { type: "string", description: "Agent name that created this task" },
          metadata: { type: "object", description: "Arbitrary metadata" },
        },
        required: ["title"],
      },
      async execute(_id: string, params: any) {
        const task = bridge.addTask({
          title: params.title,
          description: params.description,
          priority: params.priority || "medium",
          status: "pending",
          agent: params.agent,
          metadata: params.metadata,
        });
        return { content: [{ type: "text", text: JSON.stringify(task) }] };
      },
    });

    // ── hyperclaw_get_tasks ──────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_get_tasks",
      description:
        "Retrieve tasks from the HyperClaw dashboard. By default returns only tasks owned by " +
        "the calling agent (matched by agent field). Pass all=true to see all tasks.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Agent name — defaults to the calling agent's identity. Used to filter tasks." },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "blocked", "completed", "cancelled"],
            description: "Filter by status",
          },
          all: { type: "boolean", description: "If true, return all tasks regardless of agent" },
        },
      },
      async execute(callerId: string, params: any) {
        const agentId = params.agent || callerId;
        const tasks = bridge.queryTasks({
          ...(params.all ? {} : { agent: agentId }),
          status: params.status,
        });
        return { content: [{ type: "text", text: JSON.stringify(tasks) }] };
      },
    });

    // ── hyperclaw_update_task ────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_update_task",
      description:
        "Update an existing task in HyperClaw by ID. Returns the updated task.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task ID to update" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "blocked", "completed", "cancelled"],
            description: "Task status: pending (backlog), in_progress, blocked (review), completed (done), cancelled",
          },
          metadata: { type: "object" },
        },
        required: ["id"],
      },
      async execute(_id: string, params: any) {
        const { id, ...patch } = params;
        const task = bridge.updateTask(id, patch);
        if (!task) {
          return { content: [{ type: "text", text: `Error: task ${id} not found` }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(task) }] };
      },
    });

    // ── hyperclaw_delete_task ────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_delete_task",
      description: "Delete a task from HyperClaw by ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task ID to delete" },
        },
        required: ["id"],
      },
      async execute(_id: string, params: any) {
        const ok = bridge.deleteTask(params.id);
        return {
          content: [{ type: "text", text: ok ? `Deleted task ${params.id}` : `Task ${params.id} not found` }],
          isError: !ok,
        };
      },
    });

    // ── hyperclaw_notify ─────────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_notify",
      description:
        "Send a notification or custom event to the HyperClaw desktop UI. " +
        "The UI will display it as a toast and store it in the event log.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "Event type (e.g. 'alert', 'info', 'agent_complete')" },
          title: { type: "string", description: "Notification title" },
          message: { type: "string", description: "Notification body" },
          data: { type: "object", description: "Extra payload" },
        },
        required: ["type"],
      },
      async execute(_id: string, params: any) {
        bridge.emitEvent(params.type, {
          title: params.title,
          message: params.message,
          ...params.data,
        });
        return { content: [{ type: "text", text: `Event emitted: ${params.type}` }] };
      },
    });

    // ── Intelligence Layer Tools ──────────────────────────────────────────

    api.registerTool({
      name: "hyperclaw_intel_schema",
      description:
        "Introspect the intelligence database schema. Returns all tables, columns with types, row counts, " +
        "freshness stats, and indexes. Use this before writing queries to understand the schema.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const result = bridge.intelSchema();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_intel_query",
      description:
        "Execute a read-only SELECT query against the intelligence database. " +
        "Auto-limits to 1000 rows. Returns rows as JSON array with count. " +
        "Only SELECT queries allowed — writes are blocked at the engine level.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SELECT query to execute" },
        },
        required: ["sql"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.intelQuery(params.sql);
        if (result.error) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_intel_execute",
      description:
        "Execute a guarded write SQL statement (DDL or complex writes) against the intelligence database. " +
        "Use for CREATE TABLE, ALTER TABLE, CREATE INDEX, INSERT...SELECT, UPDATE with subqueries, etc. " +
        "Blocked: DROP *, CREATE TRIGGER, ATTACH/DETACH, PRAGMA writable_schema, VACUUM INTO, load_extension. " +
        "DDL triggers auto-backup. DELETE without WHERE is blocked. " +
        "For simple inserts/updates/deletes, prefer the parameterized tools instead.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL statement to execute" },
          agent_id: { type: "string", description: "Agent ID executing this (for schema history tracking)" },
        },
        required: ["sql"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.intelExecute(params.sql, params.agent_id);
        if (result.error) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
        // Fire notify event for writes
        if (result.changes || result.ddl) {
          bridge.emitEvent("intel_change", {
            action: "execute",
            agent_id: params.agent_id,
            ddl: !!result.ddl,
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_intel_insert",
      description:
        "Insert a row into an intelligence table using parameterized values (SQL-injection safe). " +
        "Auto-injects created_by, created_at, updated_at. " +
        "For the research table, performs FTS5 fuzzy dedup check before inserting.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name to insert into" },
          data: { type: "object", description: "Column-value pairs to insert" },
          agent_id: { type: "string", description: "Agent ID performing the insert (auto-sets created_by)" },
        },
        required: ["table", "data"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.intelInsert(params.table, params.data, params.agent_id);
        if (result.error) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
        if (result.inserted) {
          bridge.emitEvent("intel_change", {
            type: "intel_change",
            table: params.table,
            action: "insert",
            row_id: result.id,
            agent_id: params.agent_id,
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_intel_update",
      description:
        "Update rows in an intelligence table using parameterized values (SQL-injection safe). " +
        "Auto-injects updated_at. Validates table and column names against actual schema.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name to update" },
          data: { type: "object", description: "Column-value pairs to set" },
          where: { type: "object", description: "Column-value pairs for WHERE clause (AND-joined)" },
          agent_id: { type: "string", description: "Agent ID performing the update" },
        },
        required: ["table", "data", "where"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.intelUpdate(params.table, params.data, params.where);
        if (result.error) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
        if (result.changes) {
          bridge.emitEvent("intel_change", {
            type: "intel_change",
            table: params.table,
            action: "update",
            changes: result.changes,
            agent_id: params.agent_id,
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_intel_delete",
      description:
        "Delete rows from an intelligence table using parameterized WHERE clause (SQL-injection safe). " +
        "Requires a where clause — cannot delete without conditions.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name to delete from" },
          where: { type: "object", description: "Column-value pairs for WHERE clause (required, AND-joined)" },
          agent_id: { type: "string", description: "Agent ID performing the delete" },
        },
        required: ["table", "where"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.intelDelete(params.table, params.where);
        if (result.error) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
        if (result.deleted) {
          bridge.emitEvent("intel_change", {
            type: "intel_change",
            table: params.table,
            action: "delete",
            changes: result.changes,
            agent_id: params.agent_id,
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    // ── Task OS: query / upsert / claim ───────────────────────────────────

    api.registerTool({
      name: "hyperclaw_query_tasks",
      description:
        "Query tasks with rich filters: agent/agentId, status, kind, limit, sort (newest/oldest). " +
        "Returns matching tasks sorted by creation date (newest first by default).",
      parameters: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Filter by agent ID" },
          agent: { type: "string", description: "Filter by agent name (alias for agentId)" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "blocked", "completed", "cancelled"],
            description: "Filter by status: pending (backlog), in_progress, blocked (review), completed (done), cancelled",
          },
          kind: { type: "string", description: "Filter by task kind (e.g. 'research', 'code')" },
          limit: { type: "number", description: "Max results to return" },
          sort: {
            type: "string",
            enum: ["newest", "oldest"],
            description: "Sort order by creation date (default: newest)",
          },
        },
      },
      async execute(_id: string, params: any) {
        const tasks = bridge.queryTasks(params);
        return { content: [{ type: "text", text: JSON.stringify(tasks) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_upsert_task",
      description:
        "Create or update a task by external ID. If a task with matching data.external_id exists, " +
        "it is updated; otherwise a new task is created. Use for idempotent task sync from external systems.",
      parameters: {
        type: "object",
        properties: {
          externalId: {
            type: "string",
            description: "External identifier used to match existing tasks (stored in data.external_id)",
          },
          data: {
            type: "object",
            description:
              "Task fields to set (title, description, status, priority, agent, kind, etc.). " +
              "Nested 'data' object can include sessionKey, runId, kind, and other metadata.",
          },
        },
        required: ["externalId", "data"],
      },
      async execute(_id: string, params: any) {
        const task = bridge.upsertTask({
          externalId: params.externalId,
          data: params.data,
        });
        return { content: [{ type: "text", text: JSON.stringify(task) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_claim_task",
      description:
        "Atomically claim (lease) a task. Succeeds only if no active lease exists or the current " +
        "lease has expired. Use to coordinate multiple agents working on a shared task queue.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task ID to claim" },
          externalId: { type: "string", description: "Or match by external ID" },
          claimant: { type: "string", description: "Identifier of the claimant (agent name or ID)" },
          leaseSeconds: {
            type: "number",
            description: "How long the lease lasts in seconds (default: 300)",
          },
        },
        required: ["claimant"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.claimTask({
          id: params.id,
          externalId: params.externalId,
          claimant: params.claimant,
          leaseSeconds: params.leaseSeconds ?? 300,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: !result.success,
        };
      },
    });

    // ── Batch Operations (sessions, transcripts, task logs, links) ────────

    api.registerTool({
      name: "hyperclaw_batch",
      description:
        "Execute multiple operations in a single call. Supports sessions, transcript messages, " +
        "task logs, and task-session links. Each operation in the array specifies an 'op' type " +
        "and its parameters. All operations run sequentially; results are returned in order. " +
        "Supported ops:\n" +
        "  session_upsert     — Create/update a session (sessionKey, agentId?, label?)\n" +
        "  session_append     — Append messages to a session (sessionKey, messages[])\n" +
        "  session_get        — Get session messages (sessionKey, runId?, limit?, offset?)\n" +
        "  task_log_append    — Append a log entry (taskId, content, type?, agent?, metadata?)\n" +
        "  task_log_get       — Get task logs (taskId, type?, limit?, offset?)\n" +
        "  link_task_session  — Link a session to a task (taskId, sessionKey)\n" +
        "  unlink_task_session— Unlink a session from a task (taskId, sessionKey)\n" +
        "  get_task_sessions  — Get sessions for a task (taskId)\n" +
        "  get_session_tasks  — Get tasks for a session (sessionKey)",
      parameters: {
        type: "object",
        properties: {
          ops: {
            type: "array",
            description: "Array of operations to execute",
            items: {
              type: "object",
              properties: {
                op: {
                  type: "string",
                  enum: [
                    "session_upsert", "session_append", "session_get",
                    "task_log_append", "task_log_get",
                    "link_task_session", "unlink_task_session",
                    "get_task_sessions", "get_session_tasks",
                  ],
                  description: "Operation type",
                },
                sessionKey: { type: "string" },
                agentId: { type: "string" },
                label: { type: "string" },
                messages: { type: "array" },
                runId: { type: "string" },
                limit: { type: "number" },
                offset: { type: "number" },
                taskId: { type: "string" },
                content: { type: "string" },
                type: { type: "string" },
                agent: { type: "string" },
                metadata: { type: "object" },
              },
              required: ["op"],
            },
          },
        },
        required: ["ops"],
      },
      async execute(_id: string, params: any) {
        const results: any[] = [];
        for (const op of params.ops) {
          try {
            switch (op.op) {
              case "session_upsert":
                results.push(bridge.sessionUpsert({
                  sessionKey: op.sessionKey,
                  agentId: op.agentId,
                  label: op.label,
                }));
                break;
              case "session_append":
                results.push(bridge.sessionAppendMessages(op.sessionKey, op.messages));
                break;
              case "session_get":
                results.push(bridge.sessionGetMessages(op.sessionKey, {
                  runId: op.runId, limit: op.limit, offset: op.offset,
                }));
                break;
              case "task_log_append":
                results.push(bridge.appendTaskLog({
                  taskId: op.taskId,
                  agentId: op.agent,
                  type: op.type,
                  content: op.content,
                  metadata: op.metadata,
                }));
                break;
              case "task_log_get":
                results.push(bridge.getTaskLogs(op.taskId, {
                  type: op.type, limit: op.limit, offset: op.offset,
                }));
                break;
              case "link_task_session":
                results.push(bridge.linkTaskSession(op.taskId, op.sessionKey));
                break;
              case "unlink_task_session":
                results.push(bridge.unlinkTaskSession(op.taskId, op.sessionKey));
                break;
              case "get_task_sessions":
                results.push(bridge.getTaskSessions(op.taskId));
                break;
              case "get_session_tasks":
                results.push(bridge.getSessionTasks(op.sessionKey));
                break;
              default:
                results.push({ error: `Unknown op: ${op.op}` });
            }
          } catch (err: any) {
            results.push({ error: err.message });
          }
        }
        return { content: [{ type: "text", text: JSON.stringify(results) }] };
      },
    });
  },
};

export default plugin;
