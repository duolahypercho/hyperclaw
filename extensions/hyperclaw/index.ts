import http from "node:http";
import https from "node:https";
import { HyperClawBridge } from "./bridge";

const DEFAULT_CONNECTOR_BRIDGE_URL = "http://127.0.0.1:18790/bridge";

function resolveConnectorBridgeUrl(api: any): string {
  const configured = api.pluginConfig?.bridgeUrl;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  return process.env.HYPERCLAW_BRIDGE_URL || DEFAULT_CONNECTOR_BRIDGE_URL;
}

function postBridgeJson(bridgeUrl: string, payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(bridgeUrl);
    const body = JSON.stringify(payload);
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 120_000,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Hyperclaw bridge returned invalid JSON: ${String(err)}`));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Hyperclaw bridge request timed out"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * HyperClaw OpenClaw Plugin
 *
 * Registers agent tools that bridge OpenClaw agents to the HyperClaw desktop cockpit.
 * All data flows through a shared SQLite store at ~/.hyperclaw/ so the Electron app
 * can watch for changes in real time.
 *
 * Tools registered:
 *   hyperclaw_add_task        — Create (or upsert by externalId) a task
 *   hyperclaw_query_tasks     — Query tasks with rich filters; auto-releases expired leases
 *   hyperclaw_update_task     — Update a task's fields
 *   hyperclaw_delete_task     — Delete a task
 *   hyperclaw_claim_task      — Atomically lease a task for multi-agent coordination
 *   hyperclaw_notify          — Push notification/event to HyperClaw UI
 *   hyperclaw_intel_schema    — Introspect intelligence DB schema
 *   hyperclaw_intel_query     — Read-only SELECT against intelligence DB
 *   hyperclaw_intel_execute   — Guarded write (DDL/complex) against intelligence DB
 *   hyperclaw_intel_write     — Parameterized INSERT/UPDATE/DELETE against intelligence DB
 *   hyperclaw_batch           — Batch session, transcript, task log, and link operations
 *   hyperclaw_save_transcript — Append messages to a session transcript (convenience)
 *   hyperclaw_add_agent       — Register a new agent
 *   hyperclaw_list_agents     — List registered agents
 *   hyperclaw_create_project  — Create a project
 *   hyperclaw_create_goal     — Create a goal (with KPIs)
 *   hyperclaw_create_issue    — Create an issue/bug report
 *   hyperclaw_read_commands   — Pull pending commands from the HyperClaw UI
 */

const plugin = {
  id: "hyperclaw",
  name: "HyperClaw Bridge",
  description: "Two-way relay between OpenClaw agents and the HyperClaw desktop cockpit",

  register(api: any) {
    const dataDir = api.pluginConfig?.dataDir as string | undefined;
    const connectorBridgeUrl = resolveConnectorBridgeUrl(api);
    const bridge = new HyperClawBridge(dataDir);

    // ── Built-in Hyperclaw action gateway ────────────────────────────────
    api.registerTool({
      name: "hyperclaw_list_actions",
      description:
        "List the built-in Hyperclaw actions available through the local connector. Use this before calling Hyperclaw actions when you need the current schema.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const result = await postBridgeJson(connectorBridgeUrl, {
          action: "hyperclaw-tools-list",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result?.success === false,
        };
      },
    });

    api.registerTool({
      name: "hyperclaw_call",
      description:
        "Call a built-in Hyperclaw action by stable name, for example hyperclaw.agents.create, hyperclaw.projects.list, hyperclaw.knowledge.write, or hyperclaw.workflows.start_run. Destructive actions require confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          toolName: { type: "string", description: "Stable Hyperclaw action name, e.g. hyperclaw.projects.list" },
          arguments: { type: "object", description: "Arguments for the selected Hyperclaw action" },
          confirmed: { type: "boolean", description: "Required for destructive actions after explicit user confirmation" },
          requestingAgentId: { type: "string", description: "Optional override for the agent making the request" },
        },
        required: ["toolName"],
      },
      async execute(callerId: string, params: any) {
        const result = await postBridgeJson(connectorBridgeUrl, {
          action: "hyperclaw-tool-call",
          toolName: params.toolName,
          arguments: params.arguments ?? {},
          confirmed: params.confirmed === true,
          requestingAgentId: params.requestingAgentId || callerId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result?.success === false,
        };
      },
    });

    // ── hyperclaw_add_task ───────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_add_task",
      description:
        "Create a new task in the HyperClaw dashboard. If externalId is provided and a task with " +
        "that ID already exists, the task is updated instead (idempotent upsert). Returns the task with its ID.",
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
          agent: { type: "string", description: "Agent name assigned to this task" },
          kind: { type: "string", description: "Task category (e.g. 'research', 'code', 'review')" },
          projectId: { type: "string", description: "Project this task belongs to" },
          goalId: { type: "string", description: "Goal this task contributes to" },
          dueAt: { type: "string", description: "Due date in ISO 8601 format" },
          externalId: {
            type: "string",
            description: "External ID for idempotent sync — if a task with this ID exists it is updated, otherwise created",
          },
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
          kind: params.kind,
          projectId: params.projectId,
          goalId: params.goalId,
          dueAt: params.dueAt,
          externalId: params.externalId,
          metadata: params.metadata,
        });
        return { content: [{ type: "text", text: JSON.stringify(task) }] };
      },
    });

    // ── hyperclaw_query_tasks ────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_query_tasks",
      description:
        "Query tasks with filters. Expired task leases are auto-released before returning. " +
        "By default returns only tasks owned by the calling agent. Pass all=true to see everyone's tasks.",
      parameters: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Filter by agent ID or name (defaults to calling agent)" },
          all: { type: "boolean", description: "If true, return all tasks regardless of agent" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "blocked", "completed", "cancelled"],
            description: "Filter by status",
          },
          kind: { type: "string", description: "Filter by task kind (e.g. 'research', 'code')" },
          projectId: { type: "string", description: "Filter by project ID" },
          goalId: { type: "string", description: "Filter by goal ID" },
          limit: { type: "number", description: "Max results to return" },
          sort: {
            type: "string",
            enum: ["newest", "oldest"],
            description: "Sort order by creation date (default: newest)",
          },
        },
      },
      async execute(callerId: string, params: any) {
        const filters: any = {
          status: params.status,
          kind: params.kind,
          projectId: params.projectId,
          goalId: params.goalId,
          limit: params.limit,
          sort: params.sort,
        };
        if (!params.all) {
          filters.agent = params.agentId || callerId;
        }
        const tasks = bridge.queryTasks(filters);
        return { content: [{ type: "text", text: JSON.stringify(tasks) }] };
      },
    });

    // ── hyperclaw_update_task ────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_update_task",
      description: "Update an existing task in HyperClaw by ID. Returns the updated task.",
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
          kind: { type: "string" },
          projectId: { type: "string" },
          goalId: { type: "string" },
          dueAt: { type: "string" },
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

    // ── hyperclaw_claim_task ─────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_claim_task",
      description:
        "Atomically claim (lease) a task. Succeeds only if no active lease exists or the current " +
        "lease has expired. Use to coordinate multiple agents working on a shared task queue.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task ID to claim" },
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
          claimant: params.claimant,
          leaseSeconds: params.leaseSeconds ?? 300,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: !result.success,
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
          severity: {
            type: "string",
            enum: ["info", "success", "warning", "error"],
            description: "Visual severity level (default: info)",
          },
          action: {
            type: "object",
            description: "Optional actionable button shown in the toast",
            properties: {
              label: { type: "string", description: "Button label" },
              tool: { type: "string", description: "Tool to invoke when clicked" },
              params: { type: "object", description: "Params to pass to the tool" },
            },
            required: ["label"],
          },
          data: { type: "object", description: "Extra payload" },
        },
        required: ["type"],
      },
      async execute(_id: string, params: any) {
        bridge.emitEvent(params.type, {
          title: params.title,
          message: params.message,
          severity: params.severity ?? "info",
          ...(params.action ? { action: params.action } : {}),
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
        "For simple inserts/updates/deletes, prefer hyperclaw_intel_write instead.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL statement to execute" },
          agent_id: { type: "string", description: "Agent ID executing this (for history tracking)" },
        },
        required: ["sql"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.intelExecute(params.sql, params.agent_id);
        if (result.error) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
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

    // ── hyperclaw_intel_write (replaces insert + update + delete) ─────────
    api.registerTool({
      name: "hyperclaw_intel_write",
      description:
        "Parameterized INSERT, UPDATE, or DELETE against an intelligence table (SQL-injection safe). " +
        "Auto-injects created_by/created_at/updated_at where applicable. " +
        "For the research table, INSERT performs FTS5 fuzzy dedup. " +
        "DELETE requires a where clause. For DDL (CREATE TABLE, ALTER TABLE), use hyperclaw_intel_execute.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["insert", "update", "delete"],
            description: "Operation to perform",
          },
          table: { type: "string", description: "Table name" },
          data: {
            type: "object",
            description: "Column-value pairs to insert or set (required for insert and update)",
          },
          where: {
            type: "object",
            description: "Column-value pairs for WHERE clause (required for update and delete, AND-joined)",
          },
          agent_id: { type: "string", description: "Agent ID performing the operation (auto-sets created_by)" },
        },
        required: ["action", "table"],
      },
      async execute(_id: string, params: any) {
        let result: Record<string, unknown>;
        switch (params.action) {
          case "insert":
            if (!params.data) return { content: [{ type: "text", text: "Error: data required for insert" }], isError: true };
            result = bridge.intelInsert(params.table, params.data, params.agent_id);
            break;
          case "update":
            if (!params.data || !params.where) return { content: [{ type: "text", text: "Error: data and where required for update" }], isError: true };
            result = bridge.intelUpdate(params.table, params.data, params.where);
            break;
          case "delete":
            if (!params.where) return { content: [{ type: "text", text: "Error: where required for delete" }], isError: true };
            result = bridge.intelDelete(params.table, params.where);
            break;
          default:
            return { content: [{ type: "text", text: `Error: unknown action ${params.action}` }], isError: true };
        }
        if (result.error) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
        }
        if (result.inserted || result.changes || result.deleted) {
          bridge.emitEvent("intel_change", {
            table: params.table,
            action: params.action,
            agent_id: params.agent_id,
          });
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    // ── hyperclaw_batch ───────────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_batch",
      description:
        "Execute multiple operations in a single call. Supports sessions, transcript messages, " +
        "task logs, and task-session links. Each operation specifies an 'op' type and its parameters. " +
        "All operations run sequentially; results are returned in order.\n" +
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
                results.push(bridge.sessionUpsert({ sessionKey: op.sessionKey, agentId: op.agentId, label: op.label }));
                break;
              case "session_append":
                results.push(bridge.sessionAppendMessages(op.sessionKey, op.messages));
                break;
              case "session_get":
                results.push(bridge.sessionGetMessages(op.sessionKey, { runId: op.runId, limit: op.limit, offset: op.offset }));
                break;
              case "task_log_append":
                results.push(bridge.appendTaskLog({ taskId: op.taskId, agentId: op.agent, type: op.type, content: op.content, metadata: op.metadata }));
                break;
              case "task_log_get":
                results.push(bridge.getTaskLogs(op.taskId, { type: op.type, limit: op.limit, offset: op.offset }));
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

    // ── hyperclaw_save_transcript ─────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_save_transcript",
      description:
        "Append messages to a session transcript. Creates the session if it doesn't exist. " +
        "Use this to save conversation history to HyperClaw for review in the dashboard.",
      parameters: {
        type: "object",
        properties: {
          sessionKey: { type: "string", description: "Unique session identifier" },
          agentId: { type: "string", description: "Agent ID owning this session" },
          label: { type: "string", description: "Human-readable session label" },
          messages: {
            type: "array",
            description: "Messages to append",
            items: {
              type: "object",
              properties: {
                role: { type: "string", description: "Message role (user/assistant/system)" },
                content: { description: "Message content (string or structured)" },
                runId: { type: "string" },
              },
              required: ["content"],
            },
          },
        },
        required: ["sessionKey", "messages"],
      },
      async execute(_id: string, params: any) {
        bridge.sessionUpsert({ sessionKey: params.sessionKey, agentId: params.agentId, label: params.label });
        const result = bridge.sessionAppendMessages(params.sessionKey, params.messages);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    // ── hyperclaw_add_agent ───────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_add_agent",
      description:
        "Register a new agent in HyperClaw. The agent will appear in the StatusWidget. " +
        "Returns the created agent record with its ID.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Agent display name" },
          type: {
            type: "string",
            description: "Agent type (e.g. 'openclaw', 'hermes', 'claude-code', 'codex')",
          },
          emoji: { type: "string", description: "Emoji avatar for the agent (e.g. '🤖')" },
          avatarData: { type: "string", description: "Alias for avatarDataUri" },
          avatarDataUri: { type: "string", description: "Avatar image as a data URI" },
          config: { type: "object", description: "Agent configuration (model, tools, etc.)" },
        },
        required: ["name"],
      },
      async execute(callerId: string, params: any) {
        const avatarData = typeof params.avatarDataUri === "string" && params.avatarDataUri.trim()
          ? params.avatarDataUri
          : typeof params.avatarData === "string" && params.avatarData.trim()
            ? params.avatarData
            : undefined;
        const agent = bridge.addAgent({
          name: params.name,
          type: params.type,
          emoji: params.emoji,
          avatarData,
          config: params.config,
          createdBy: callerId,
        });
        return { content: [{ type: "text", text: JSON.stringify(agent) }] };
      },
    });

    // ── hyperclaw_list_agents ─────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_list_agents",
      description: "List all registered agents in HyperClaw with their status and config.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const agents = bridge.listAgents();
        return { content: [{ type: "text", text: JSON.stringify(agents) }] };
      },
    });

    // ── hyperclaw_create_project ──────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_create_project",
      description:
        "Create a new project in HyperClaw. Projects group tasks and goals together. " +
        "Returns the created project with its ID.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Project name" },
          description: { type: "string", description: "Project description" },
          kind: {
            type: "string",
            enum: ["project", "workflow"],
            description: "Use project for issue workspaces and workflow for reusable automations.",
          },
          emoji: { type: "string", description: "Project icon" },
          leadAgentId: { type: "string", description: "Lead agent responsible for triage and assignment" },
        },
        required: ["name"],
      },
      async execute(callerId: string, params: any) {
        const project = bridge.createProject({
          name: params.name,
          description: params.description,
          kind: params.kind,
          emoji: params.emoji,
          leadAgentId: params.leadAgentId,
          createdBy: callerId,
        });
        return { content: [{ type: "text", text: JSON.stringify(project) }] };
      },
    });

    // ── hyperclaw_create_goal ─────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_create_goal",
      description:
        "Create a new goal in HyperClaw with optional KPIs and project association. " +
        "Returns the created goal with its ID.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Goal title" },
          description: { type: "string", description: "Goal description" },
          kpis: {
            type: "array",
            items: { type: "string" },
            description: "Key performance indicators for this goal",
          },
          projectId: { type: "string", description: "Project this goal belongs to" },
        },
        required: ["title"],
      },
      async execute(callerId: string, params: any) {
        const goal = bridge.createGoal({
          title: params.title,
          description: params.description,
          kpis: params.kpis,
          projectId: params.projectId,
          createdBy: callerId,
        });
        return { content: [{ type: "text", text: JSON.stringify(goal) }] };
      },
    });

    // ── hyperclaw_create_issue ────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_create_issue",
      description:
        "Create a new issue or bug report in HyperClaw. Issues appear in the dashboard for review. " +
        "Returns the created issue with its ID.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Issue title" },
          description: { type: "string", description: "Detailed description of the issue" },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Issue severity (default: medium)",
          },
          agentId: { type: "string", description: "Agent this issue is related to" },
          projectId: { type: "string", description: "Project this issue belongs to" },
          assignedBy: { type: "string", description: "Lead or human assigning the issue" },
          sourceFile: { type: "string", description: "Relevant file path or filename for the issue" },
          linearId: { type: "string", description: "Linked Linear issue id, if mirrored" },
        },
        required: ["title"],
      },
      async execute(callerId: string, params: any) {
        const issue = bridge.createIssue({
          title: params.title,
          description: params.description,
          severity: params.severity,
          agentId: params.agentId,
          projectId: params.projectId,
          assignedBy: params.assignedBy,
          sourceFile: params.sourceFile,
          linearId: params.linearId,
          createdBy: callerId,
        });
        return { content: [{ type: "text", text: JSON.stringify(issue) }] };
      },
    });

    // ── hyperclaw_list_projects ───────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_list_projects",
      description: "List all projects in HyperClaw.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["project", "workflow"],
            description: "Filter project issue workspaces separately from workflow automations.",
          },
        },
      },
      async execute(_id: string, params: any) {
        return { content: [{ type: "text", text: JSON.stringify(bridge.listProjects({ kind: params.kind })) }] };
      },
    });

    // ── Workflow tools (connector-backed, shared with Codex/Hermes MCP) ───
    api.registerTool({
      name: "hyperclaw_list_workflow_templates",
      description: "List workflow templates, optionally scoped to one workflow project.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Workflow project ID" },
        },
      },
      async execute(_id: string, params: any) {
        const result = await postBridgeJson(connectorBridgeUrl, {
          action: "hyperclaw-tool-call",
          toolName: "hyperclaw.workflows.list_templates",
          arguments: params?.projectId ? { projectId: params.projectId } : {},
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result?.success === false,
        };
      },
    });

    api.registerTool({
      name: "hyperclaw_start_workflow_run",
      description: "Start a workflow run from a template through the Hyperclaw connector.",
      parameters: {
        type: "object",
        properties: {
          templateId: { type: "string", description: "Workflow template ID to run" },
          startedBy: { type: "string", description: "Optional actor label" },
          inputPayload: { type: "object", description: "Optional input payload for the workflow run" },
        },
        required: ["templateId"],
      },
      async execute(callerId: string, params: any) {
        const result = await postBridgeJson(connectorBridgeUrl, {
          action: "hyperclaw-tool-call",
          toolName: "hyperclaw.workflows.start_run",
          arguments: {
            templateId: params.templateId,
            startedBy: params.startedBy || callerId,
            inputPayload: params.inputPayload ?? {},
          },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result?.success === false,
        };
      },
    });

    api.registerTool({
      name: "hyperclaw_list_workflow_runs",
      description: "List workflow runs, optionally scoped to one workflow project.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Workflow project ID" },
          limit: { type: "number", description: "Maximum runs to return" },
        },
      },
      async execute(_id: string, params: any) {
        const result = await postBridgeJson(connectorBridgeUrl, {
          action: "hyperclaw-tool-call",
          toolName: "hyperclaw.workflows.list_runs",
          arguments: {
            ...(params?.projectId ? { projectId: params.projectId } : {}),
            ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
          },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: result?.success === false,
        };
      },
    });

    // ── hyperclaw_list_goals ──────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_list_goals",
      description: "List goals, optionally filtered by project.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Filter by project ID" },
        },
      },
      async execute(_id: string, params: any) {
        return { content: [{ type: "text", text: JSON.stringify(bridge.listGoals(params.projectId)) }] };
      },
    });

    // ── hyperclaw_list_issues ─────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_list_issues",
      description: "List issues, optionally filtered by status, project, or agent.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"], description: "Filter by status" },
          projectId: { type: "string", description: "Filter by project ID" },
          agentId: { type: "string", description: "Filter by agent ID" },
        },
      },
      async execute(_id: string, params: any) {
        return { content: [{ type: "text", text: JSON.stringify(bridge.listIssues({ status: params.status, projectId: params.projectId, agentId: params.agentId })) }] };
      },
    });

    // ── hyperclaw_read_commands ───────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_read_commands",
      description:
        "Read and consume pending commands queued by the HyperClaw UI. " +
        "Commands are cleared after reading (each command is delivered once). " +
        "Poll this tool periodically to receive instructions from the dashboard.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const commands = bridge.readCommands();
        return { content: [{ type: "text", text: JSON.stringify(commands) }] };
      },
    });
  },
};

export default plugin;
