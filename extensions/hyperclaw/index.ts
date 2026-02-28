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
  },
};

export default plugin;
