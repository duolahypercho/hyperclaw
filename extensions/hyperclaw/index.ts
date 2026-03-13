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
 *   hyperclaw_read_commands— Read pending commands from HyperClaw → OpenClaw
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
        "Retrieve all tasks from the HyperClaw dashboard. Optionally filter by status.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "cancelled"],
            description: "Filter by status",
          },
        },
      },
      async execute(_id: string, params: any) {
        let tasks = bridge.getTasks();
        if (params.status) {
          tasks = tasks.filter((t: Record<string, unknown>) => t.status === params.status);
        }
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
            enum: ["pending", "in_progress", "completed", "cancelled"],
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

    // ── hyperclaw_add_channel ────────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_add_channel",
      description: "Add a channel to HyperClaw channel registry for cron job announcements. Storage: ~/.hyperclaw/channels.json. Discord: enable Developer Mode, right-click channel, Copy ID. Telegram: @username or forward message to @getidsbot for chat ID.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Channel ID (e.g. C1234567890 for Discord, @username for Telegram)" },
          name: { type: "string", description: "Friendly name (e.g. #alerts, Team DM)" },
          type: { type: "string", enum: ["discord", "telegram"], description: "Channel platform" },
          kind: { type: "string", enum: ["channel", "dm", "group"], description: "Channel type" },
        },
        required: ["id", "name", "type", "kind"],
      },
      async execute(_id: string, params: any) {
        const channel = bridge.addChannel({
          id: params.id,
          name: params.name,
          type: params.type,
          kind: params.kind,
        });
        return { content: [{ type: "text", text: JSON.stringify(channel) }] };
      },
    });

    // ── hyperclaw_get_channels ───────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_get_channels",
      description: "List all registered channels in HyperClaw. Returns: id, name, type (discord/telegram), kind (channel/dm/group). Use this to see available channels for cron announcements. Storage: ~/.hyperclaw/channels.json.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const channels = bridge.getChannels();
        return { content: [{ type: "text", text: JSON.stringify(channels) }] };
      },
    });

    // ── hyperclaw_get_channel ─────────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_get_channel",
      description: "Get a single channel by ID from HyperClaw registry. Use this to verify a channel exists before using it for cron announcements.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Channel ID to retrieve" },
        },
        required: ["id"],
      },
      async execute(_id: string, params: any) {
        const channel = bridge.getChannel(params.id);
        if (!channel) {
          return { content: [{ type: "text", text: `Channel ${params.id} not found` }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(channel) }] };
      },
    });

    // ── hyperclaw_update_channel ──────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_update_channel",
      description: "Update a channel in HyperClaw registry. Use this to rename channels or change their friendly name.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Channel ID to update" },
          name: { type: "string", description: "New friendly name" },
          type: { type: "string", enum: ["discord", "telegram"] },
          kind: { type: "string", enum: ["channel", "dm", "group"] },
        },
        required: ["id"],
      },
      async execute(_id: string, params: any) {
        const { id, ...patch } = params;
        const channel = bridge.updateChannel(id, patch);
        if (!channel) {
          return { content: [{ type: "text", text: `Channel ${id} not found` }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(channel) }] };
      },
    });

    // ── hyperclaw_delete_channel ──────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_delete_channel",
      description: "Delete a channel from HyperClaw registry. Use this to remove old or unused channels.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Channel ID to delete" },
        },
        required: ["id"],
      },
      async execute(_id: string, params: any) {
        const ok = bridge.deleteChannel(params.id);
        return {
          content: [{ type: "text", text: ok ? `Deleted channel ${params.id}` : `Channel ${params.id} not found` }],
          isError: !ok,
        };
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
            enum: ["pending", "in_progress", "completed", "cancelled"],
            description: "Filter by status",
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

    // ── Sessions + Transcript Storage ─────────────────────────────────────

    api.registerTool({
      name: "hyperclaw_session_upsert",
      description:
        "Create or update a session record. Sessions group transcript messages by session_key. " +
        "Use to register a new agent session before appending messages.",
      parameters: {
        type: "object",
        properties: {
          sessionKey: { type: "string", description: "Unique session identifier" },
          agentId: { type: "string", description: "Agent that owns this session" },
          label: { type: "string", description: "Human-readable label for the session" },
        },
        required: ["sessionKey"],
      },
      async execute(_id: string, params: any) {
        const session = bridge.sessionUpsert({
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          label: params.label,
        });
        return { content: [{ type: "text", text: JSON.stringify(session) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_session_append_messages",
      description:
        "Append one or more messages to a session transcript. Messages are stored in order " +
        "and can be filtered by runId. Supports batch inserts.",
      parameters: {
        type: "object",
        properties: {
          sessionKey: { type: "string", description: "Session to append to" },
          messages: {
            type: "array",
            description: "Array of messages to append",
            items: {
              type: "object",
              properties: {
                runId: { type: "string", description: "Run/turn identifier within the session" },
                stream: { type: "string", description: "Stream name (e.g. 'stdout', 'tool')" },
                role: { type: "string", description: "Message role (e.g. 'user', 'assistant', 'system')" },
                content: { description: "Message content (any JSON-serializable value)" },
              },
              required: ["content"],
            },
          },
        },
        required: ["sessionKey", "messages"],
      },
      async execute(_id: string, params: any) {
        const result = bridge.sessionAppendMessages(
          params.sessionKey,
          params.messages
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });

    api.registerTool({
      name: "hyperclaw_session_get_messages",
      description:
        "Retrieve transcript messages for a session. Optionally filter by runId and paginate with limit/offset.",
      parameters: {
        type: "object",
        properties: {
          sessionKey: { type: "string", description: "Session to read from" },
          runId: { type: "string", description: "Filter by run ID" },
          limit: { type: "number", description: "Max messages to return" },
          offset: { type: "number", description: "Skip this many messages" },
        },
        required: ["sessionKey"],
      },
      async execute(_id: string, params: any) {
        const messages = bridge.sessionGetMessages(params.sessionKey, {
          runId: params.runId,
          limit: params.limit,
          offset: params.offset,
        });
        return { content: [{ type: "text", text: JSON.stringify(messages) }] };
      },
    });
  },
};

export default plugin;
