import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HyperClawBridge } from "./bridge";

const OPENCLAW_MEMORY_DIR = path.join(os.homedir(), ".openclaw", "workspace", "memory");

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

    // ── hyperclaw_read_commands ───────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_read_commands",
      description:
        "Read and drain pending commands from HyperClaw → OpenClaw. " +
        "Returns a list of command objects queued by the desktop app. " +
        "When type is 'create_daily_memory', create a daily memory file using hyperclaw_write_memory. " +
        "When type is 'summarize_memory_journal', call hyperclaw_get_journal_summary_instructions and write clean daily journals. " +
        "When type is 'create_journal_folder_by_hours', call hyperclaw_get_journal_by_hours_instructions and create a folder of daily files with summaries organized by hour. " +
        "When type is 'generate_daily_summary', call hyperclaw_generate_daily_summary to get memories for the date, summarize with your LLM, then hyperclaw_write_daily_summary to save (cached once per day).",
      parameters: { type: "object", properties: {} },
      async execute() {
        const commands = bridge.readCommands();
        return { content: [{ type: "text", text: JSON.stringify(commands) }] };
      },
    });

    // ── hyperclaw_get_journal_by_hours_instructions ───────────────────────
    api.registerTool({
      name: "hyperclaw_get_journal_by_hours_instructions",
      description:
        "Returns instructions for creating a folder of daily journal files with entries summarized by hour. " +
        "Use when you see a 'create_journal_folder_by_hours' command from HyperClaw (e.g. on initial load).",
      parameters: { type: "object", properties: {} },
      async execute() {
        const instructions = `Create a folder of daily journal summaries organized by hour:

1. List or infer all relevant memory/activity for each day (from ~/.openclaw/workspace/memory or your context).
2. For each day (up to and including yesterday), create ONE file using hyperclaw_write_memory.
3. Filename: "journal-by-hours-YYYY-MM-DD.md" (e.g. journal-by-hours-2026-02-17.md).
4. Content format for each file:
   - Line 1: "Journal: YYYY-MM-DD"
   - Line 2: Full date, e.g. "Tuesday, February 17, 2026"
   - Line 3: Optional "SIZE · N words" if useful
   - Then blank line, then chronological entries:
   - Each entry: "HH:MM AM/PM - **Title:**" on one line, then 1–3 lines of summary (what was done, decision, outcome).
   - Example:
     "05:37 AM - **Architecture Discussion: Subagents Decision:**"
     "Decision: Keep 3 main persistent agents; each can spawn temporary sub-agents for parallel work."
     ""
     "05:47 AM - **Qwen3.5 Load Failures:**"
     "Issue: GGUF fail to load in LM Studio. Tried MLX; suggested Ollama or mlx_lm.server."
5. Group entries by time of day; keep each entry concise and scannable. This gives the user a clean memory sheet with summaries by hours.`;
        return { content: [{ type: "text", text: instructions }] };
      },
    });

    // ── hyperclaw_get_journal_summary_instructions ─────────────────────────
    api.registerTool({
      name: "hyperclaw_get_journal_summary_instructions",
      description:
        "Returns instructions for summarizing memory files into a clean journal. " +
        "Use this when you see a 'summarize_memory_journal' command from HyperClaw.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const instructions = `Summarize memory into a clean journal:

1. List all .md files in ~/.openclaw/workspace/memory (or use context you have about memory files).
2. Group them by date (use filename patterns like daily-YYYY-MM-DD.md or file mtime).
3. For each day up to and including yesterday:
   - Read that day's memory/notes.
   - Write a concise journal entry: what was done, key decisions, and outcomes.
   - Save using hyperclaw_write_memory with filename "daily-YYYY-MM-DD.md" (or "journal-YYYY-MM-DD.md").
4. Keep entries clear and scannable so the user has a clean memory sheet.`;
        return { content: [{ type: "text", text: instructions }] };
      },
    });

    // ── hyperclaw_generate_daily_summary ─────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_generate_daily_summary",
      description:
        "Get memory file contents for a given date so you can generate a TL;DR summary. " +
        "Returns concatenated content of all memory files for that date. " +
        "When you see a 'generate_daily_summary' command from HyperClaw, call this to get memories, summarize with your LLM, then call hyperclaw_write_daily_summary to save the result.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date as YYYY-MM-DD (default: today)",
          },
        },
      },
      async execute(_id: string, params: { date?: string }) {
        const today = new Date();
        const dateStr =
          params?.date ||
          `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return { content: [{ type: "text", text: "Error: date must be YYYY-MM-DD" }], isError: true };
        }
        try {
          if (!fs.existsSync(OPENCLAW_MEMORY_DIR)) {
            return { content: [{ type: "text", text: JSON.stringify({ date: dateStr, memories: "", message: "No memory directory" }) }] };
          }
          const entries = fs.readdirSync(OPENCLAW_MEMORY_DIR, { withFileTypes: true });
          const parts: string[] = [];
          for (const entry of entries) {
            if (!entry.isFile() || (!entry.name.endsWith(".md") && !entry.name.endsWith(".txt"))) continue;
            const fullPath = path.join(OPENCLAW_MEMORY_DIR, entry.name);
            const stat = fs.statSync(fullPath);
            const fileDate = stat.mtime.toISOString().slice(0, 10);
            const nameHasDate = entry.name.includes(dateStr);
            if (fileDate !== dateStr && !nameHasDate) continue;
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              parts.push(`--- ${entry.name} ---\n${content}`);
            } catch {
              parts.push(`--- ${entry.name} ---\n[Unable to read]`);
            }
          }
          const memories = parts.join("\n\n");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ date: dateStr, memories, fileCount: parts.length }),
              },
            ],
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      },
    });

    // ── hyperclaw_write_memory ─────────────────────────────────────────────
    api.registerTool({
      name: "hyperclaw_write_memory",
      description:
        "Write a memory file into ~/.openclaw/workspace/memory. " +
        "Use for daily memories (e.g. filename 'daily-YYYY-MM-DD.md') or any other memory note.",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Filename only, e.g. 'daily-2025-02-21.md'. Must not contain '..' or path separators.",
          },
          content: { type: "string", description: "Markdown or plain text content" },
        },
        required: ["filename", "content"],
      },
      async execute(_id: string, params: { filename: string; content: string }) {
        const { filename, content } = params;
        if (!filename || filename.includes("..") || path.isAbsolute(filename) || filename.includes("\n")) {
          return {
            content: [{ type: "text", text: "Error: invalid filename" }],
            isError: true,
          };
        }
        const basename = path.basename(filename);
        if (basename !== filename) {
          return {
            content: [{ type: "text", text: "Error: filename must be a single segment (e.g. daily-2025-02-21.md)" }],
            isError: true,
          };
        }
        try {
          if (!fs.existsSync(OPENCLAW_MEMORY_DIR)) {
            fs.mkdirSync(OPENCLAW_MEMORY_DIR, { recursive: true });
          }
          const filePath = path.join(OPENCLAW_MEMORY_DIR, basename);
          fs.writeFileSync(filePath, content, "utf-8");
          return { content: [{ type: "text", text: `Wrote ${basename}` }] };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: `Error: ${msg}` }],
            isError: true,
          };
        }
      },
    });
  },
};

export default plugin;
