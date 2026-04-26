#!/usr/bin/env node
/**
 * HyperClaw MCP Server
 *
 * Exposes all HyperClaw bridge tools via the Model Context Protocol (stdio transport).
 * Compatible with Claude Code, Codex CLI, Hermes, and any MCP-capable runtime.
 *
 * All tools share the same ~/.hyperclaw/connector.db as the OpenClaw plugin,
 * so data created here is instantly visible in the HyperClaw dashboard and
 * to agents using the OpenClaw plugin (and vice versa).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ── Import bridge from sibling OpenClaw plugin ───────────────────────────────
// Both share the same source so they stay in sync automatically.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { HyperClawBridge } = await import(
  path.join(__dirname, "../hyperclaw/bridge.ts")
).catch(() =>
  // Fallback: compiled JS (after build)
  import(path.join(__dirname, "../hyperclaw/bridge.js"))
);

const dataDir = process.env.HYPERCLAW_DATA_DIR ?? undefined;
const bridge = new HyperClawBridge(dataDir);

// ── Agent workspace helpers ──────────────────────────────────────────────────
// The MCP has direct filesystem access, so `hyperclaw_create_agent` writes
// workspace files directly rather than routing through the connector bridge.

type SupportedRuntime = "openclaw" | "hermes" | "claude-code" | "codex";

const SUPPORTED_RUNTIMES: readonly SupportedRuntime[] = [
  "openclaw",
  "hermes",
  "claude-code",
  "codex",
];

function isSupportedRuntime(value: unknown): value is SupportedRuntime {
  return typeof value === "string" && (SUPPORTED_RUNTIMES as readonly string[]).includes(value);
}

function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function resolveAgentWorkspace(runtime: SupportedRuntime, agentId: string): string {
  const home = os.homedir();
  switch (runtime) {
    case "openclaw":
      // Matches lib/identity-md.ts: "main" collapses to "workspace", else
      // "workspace-<id>" under ~/.openclaw/
      return path.join(
        home,
        ".openclaw",
        agentId === "main" ? "workspace" : `workspace-${agentId}`,
      );
    case "hermes":
      return path.join(home, ".hermes", "agents", agentId);
    case "claude-code":
      return path.join(home, ".claude", "agents", agentId);
    case "codex":
      return path.join(home, ".codex", "agents", agentId);
  }
}

interface AgentTemplateOpts {
  name: string;
  emoji?: string;
  role?: string;
  description?: string;
}

function buildIdentityMd(opts: AgentTemplateOpts): string {
  const lines: string[] = [`- **Name:** ${opts.name}`];
  if (opts.emoji) lines.push(`- **Emoji:** ${opts.emoji}`);
  if (opts.role && opts.role.trim()) lines.push(`- **Role:** ${opts.role.trim()}`);
  const header = lines.join("\n");
  const body = opts.description && opts.description.trim() ? opts.description.trim() : "";
  return body ? `${header}\n\n---\n\n${body}\n` : `${header}\n`;
}

function buildSoulMd(opts: AgentTemplateOpts): string {
  const mission = opts.description && opts.description.trim()
    ? opts.description.trim()
    : opts.role && opts.role.trim()
      ? `You focus on ${opts.role.trim().toLowerCase()} work.`
      : "Your mission will be defined by the work you're assigned.";
  return `# SOUL.md - Who You Are

You are **${opts.name}**. ${mission}

## Core Principles
- **Own your craft.** You're responsible for the quality of what you deliver.
- **Communicate clearly.** Short, direct updates. Lead with the outcome.
- **Escalate when blocked.** Don't silently stall.
- **Respect context.** Read USER.md and recent memory files each session.
- **Be concise.**

## How You Work
1. Start each session by reading SOUL.md, USER.md, and today's memory file.
2. Accept assignments from the orchestrator.
3. Deliver work, update task status, log a memory note.
4. Escalate if stuck for more than one heartbeat cycle.
`;
}

function buildAgentsMd(opts: AgentTemplateOpts): string {
  const role = opts.role && opts.role.trim() ? opts.role.trim() : "specialist";
  return `# AGENTS.md - Your Workspace

## Every Session
1. Read SOUL.md
2. Read USER.md
3. Read memory/YYYY-MM-DD.md for recent context

## Memory
- Daily notes: memory/YYYY-MM-DD.md
- Long-term: MEMORY.md

## Role
You operate as a ${role}. The orchestrator assigns tasks; you execute and report.
`;
}

function buildClaudeMd(opts: AgentTemplateOpts): string {
  const instructions = buildAgentsMd(opts)
    .replace("# AGENTS.md - Your Workspace", "# CLAUDE.md - Your Workspace")
    .trimEnd();
  const soul = buildSoulMd(opts).trimEnd();

  return `${instructions}

---

## Agent Personality (SOUL.md)

Claude Code reads \`CLAUDE.md\` on startup. The canonical persona is also written to
\`SOUL.md\`; this embedded copy makes the runtime wake up with the same soul even
when it only loads \`CLAUDE.md\`.

${soul}
`;
}

function buildHeartbeatMd(): string {
  return `# HEARTBEAT.md - Session Cycle

## Cycle
1. **Scan** — any active task? any open thread with the operator?
2. **Progress** — push work forward one concrete step, or flag blockers.
3. **Log** — write to memory/YYYY-MM-DD.md, update task status.
4. **Summary** — notify only if something changed meaningfully.
`;
}

function buildToolsMd(): string {
  return `# TOOLS.md - Local Notes

## Communication
- \`message({ message, channel: "announce" })\`
- \`sessions_send({ message, agentId })\`

## Tasks
- read ~/.hyperclaw/todo.json
- update task status as work moves

## Memory
- read/write memory/YYYY-MM-DD.md
- read/write MEMORY.md
`;
}

function buildUserMd(): string {
  return `# USER.md - About Your Human

- **Name:**
- **What to call them:**
- **Timezone:**
- **Notes:**

## Context
_(What are they building? What do they need from you?)_

## Operator Style
_(Detailed reports or "all good"? Approve every step or trust your judgment?)_

## What Annoys Them

## What Delights Them
`;
}

function buildMemoryMd(): string {
  return `# MEMORY.md - Long-Term Memory

## Categories
- operator-preference
- task-pattern
- blocker-pattern
- process-improvement

## Memories
_(Populated as you learn.)_
`;
}

function buildOpenClawTemplates(opts: AgentTemplateOpts): Record<string, string> {
  return {
    "IDENTITY.md":  buildIdentityMd(opts),
    "SOUL.md":      buildSoulMd(opts),
    "AGENTS.md":    buildAgentsMd(opts),
    "HEARTBEAT.md": buildHeartbeatMd(),
    "TOOLS.md":     buildToolsMd(),
    "USER.md":      buildUserMd(),
    "MEMORY.md":    buildMemoryMd(),
  };
}

function buildRuntimeFiles(runtime: SupportedRuntime, opts: AgentTemplateOpts): Record<string, string> {
  switch (runtime) {
    case "openclaw":
      return buildOpenClawTemplates(opts);
    case "hermes":
      return { "IDENTITY.md": buildIdentityMd(opts), "SOUL.md": buildSoulMd(opts), "USER.md": buildUserMd() };
    case "claude-code":
      return { "IDENTITY.md": buildIdentityMd(opts), "SOUL.md": buildSoulMd(opts), "USER.md": buildUserMd(), "CLAUDE.md": buildClaudeMd(opts) };
    case "codex":
      return { "IDENTITY.md": buildIdentityMd(opts), "SOUL.md": buildSoulMd(opts), "USER.md": buildUserMd(), "AGENTS.md": buildAgentsMd(opts) };
  }
}

function writeAgentWorkspace(
  runtime: SupportedRuntime,
  agentId: string,
  opts: AgentTemplateOpts,
): { workspacePath: string; filesWritten: string[] } {
  const workspacePath = resolveAgentWorkspace(runtime, agentId);
  fs.mkdirSync(workspacePath, { recursive: true });
  const files = buildRuntimeFiles(runtime, opts);
  const filesWritten: string[] = [];
  for (const [filename, content] of Object.entries(files)) {
    const fullPath = path.join(workspacePath, filename);
    // Never clobber an existing file — treat agent create as idempotent-safe.
    if (fs.existsSync(fullPath)) continue;
    fs.writeFileSync(fullPath, content, "utf8");
    filesWritten.push(filename);
  }
  return { workspacePath, filesWritten };
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "hyperclaw_add_task",
    description:
      "Create a new task in the HyperClaw dashboard. If externalId is provided and a task with " +
      "that ID already exists, the task is updated instead (idempotent upsert).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Detailed description" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        agent: { type: "string", description: "Agent name assigned to this task" },
        kind: { type: "string", description: "Task category (e.g. 'research', 'code', 'review')" },
        projectId: { type: "string" },
        goalId: { type: "string" },
        dueAt: { type: "string", description: "ISO 8601 due date" },
        externalId: { type: "string", description: "External ID for idempotent upsert" },
        metadata: { type: "object" },
      },
      required: ["title"],
    },
  },
  {
    name: "hyperclaw_query_tasks",
    description:
      "Query tasks with filters. Auto-releases expired leases. " +
      "Pass all=true to see all agents' tasks.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        all: { type: "boolean" },
        status: { type: "string", enum: ["pending", "in_progress", "blocked", "completed", "cancelled"] },
        kind: { type: "string" },
        projectId: { type: "string" },
        goalId: { type: "string" },
        limit: { type: "number" },
        sort: { type: "string", enum: ["newest", "oldest"] },
      },
    },
  },
  {
    name: "hyperclaw_update_task",
    description: "Update an existing task by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        status: { type: "string", enum: ["pending", "in_progress", "blocked", "completed", "cancelled"] },
        kind: { type: "string" },
        projectId: { type: "string" },
        goalId: { type: "string" },
        dueAt: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["id"],
    },
  },
  {
    name: "hyperclaw_delete_task",
    description: "Delete a task by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "hyperclaw_claim_task",
    description: "Atomically lease a task for multi-agent coordination.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        claimant: { type: "string" },
        leaseSeconds: { type: "number" },
      },
      required: ["claimant"],
    },
  },
  {
    name: "hyperclaw_notify",
    description: "Send a notification/event to the HyperClaw desktop UI.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        title: { type: "string" },
        message: { type: "string" },
        severity: { type: "string", enum: ["info", "success", "warning", "error"] },
        action: {
          type: "object",
          properties: {
            label: { type: "string" },
            tool: { type: "string" },
            params: { type: "object" },
          },
          required: ["label"],
        },
        data: { type: "object" },
      },
      required: ["type"],
    },
  },
  {
    name: "hyperclaw_intel_schema",
    description: "Introspect the intelligence database schema.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "hyperclaw_intel_query",
    description: "Execute a read-only SELECT against the intelligence database (auto-limits 1000 rows).",
    inputSchema: {
      type: "object",
      properties: { sql: { type: "string" } },
      required: ["sql"],
    },
  },
  {
    name: "hyperclaw_intel_execute",
    description:
      "Guarded write SQL (DDL/complex writes) against intelligence DB. " +
      "For simple INSERT/UPDATE/DELETE use hyperclaw_intel_write.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        agent_id: { type: "string" },
      },
      required: ["sql"],
    },
  },
  {
    name: "hyperclaw_intel_write",
    description: "Parameterized INSERT, UPDATE, or DELETE against an intelligence table.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["insert", "update", "delete"] },
        table: { type: "string" },
        data: { type: "object" },
        where: { type: "object" },
        agent_id: { type: "string" },
      },
      required: ["action", "table"],
    },
  },
  {
    name: "hyperclaw_save_transcript",
    description: "Append messages to a session transcript (creates session if needed).",
    inputSchema: {
      type: "object",
      properties: {
        sessionKey: { type: "string" },
        agentId: { type: "string" },
        label: { type: "string" },
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              content: {},
              runId: { type: "string" },
            },
            required: ["content"],
          },
        },
      },
      required: ["sessionKey", "messages"],
    },
  },
  {
    name: "hyperclaw_add_agent",
    description: "Register a new agent in HyperClaw (appears in StatusWidget).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        emoji: { type: "string" },
        config: { type: "object" },
      },
      required: ["name"],
    },
  },
  {
    name: "hyperclaw_create_agent",
    description:
      "Create a new agent end-to-end: provisions the workspace folder with " +
      "starter personality files (IDENTITY.md, SOUL.md, AGENTS.md, etc.) AND " +
      "registers it in the HyperClaw dashboard. Returns the workspace path so " +
      "the caller knows where the files were written. " +
      "If `runtime` is omitted it defaults to the env var HYPERCLAW_DEFAULT_RUNTIME, " +
      "otherwise 'openclaw'. Existing files are never overwritten.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name for the agent (required)" },
        description: {
          type: "string",
          description: "What the agent does — becomes the body of IDENTITY.md and the mission statement in SOUL.md",
        },
        runtime: {
          type: "string",
          enum: ["openclaw", "hermes", "claude-code", "codex"],
          description: "Runtime to provision for. Defaults to HYPERCLAW_DEFAULT_RUNTIME env var, else 'openclaw'.",
        },
        role: { type: "string", description: "Short role label, e.g. 'Code & Automation'" },
        emoji: { type: "string", description: "Emoji avatar (default 🤖)" },
        agentId: {
          type: "string",
          description: "Explicit agent id slug. If omitted, derived from name.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "hyperclaw_list_agents",
    description: "List all registered agents.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "hyperclaw_create_project",
    description: "Create a project in HyperClaw.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "hyperclaw_create_goal",
    description: "Create a goal with optional KPIs and project association.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        kpis: { type: "array", items: { type: "string" } },
        projectId: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "hyperclaw_create_issue",
    description: "Create an issue/bug report in HyperClaw.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        agentId: { type: "string" },
        projectId: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "hyperclaw_list_projects",
    description: "List all projects in HyperClaw.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "hyperclaw_list_goals",
    description: "List goals, optionally filtered by project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Filter by project ID" },
      },
    },
  },
  {
    name: "hyperclaw_list_issues",
    description: "List issues, optionally filtered by status, project, or agent.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] },
        projectId: { type: "string" },
        agentId: { type: "string" },
      },
    },
  },
  {
    name: "hyperclaw_read_commands",
    description: "Read and consume pending commands queued by the HyperClaw UI (each delivered once).",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

// ── Tool handlers ─────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "hyperclaw_add_task":
      return ok(bridge.addTask({
        title: args.title as string,
        description: args.description as string | undefined,
        priority: args.priority as string | undefined,
        status: "pending",
        agent: args.agent as string | undefined,
        kind: args.kind as string | undefined,
        projectId: args.projectId as string | undefined,
        goalId: args.goalId as string | undefined,
        dueAt: args.dueAt as string | undefined,
        externalId: args.externalId as string | undefined,
        metadata: args.metadata as Record<string, unknown> | undefined,
      }));

    case "hyperclaw_query_tasks": {
      const filters = {
        status: args.status as string | undefined,
        kind: args.kind as string | undefined,
        projectId: args.projectId as string | undefined,
        goalId: args.goalId as string | undefined,
        limit: args.limit as number | undefined,
        sort: args.sort as string | undefined,
        agent: args.all ? undefined : (args.agentId as string | undefined),
      };
      return ok(bridge.queryTasks(filters));
    }

    case "hyperclaw_update_task": {
      const { id, ...patch } = args;
      const task = bridge.updateTask(id as string, patch as Record<string, unknown>);
      return task ? ok(task) : err(`Task ${id} not found`);
    }

    case "hyperclaw_delete_task": {
      const deleted = bridge.deleteTask(args.id as string);
      return deleted ? ok({ deleted: true }) : err(`Task ${args.id} not found`);
    }

    case "hyperclaw_claim_task":
      return ok(bridge.claimTask({
        id: args.id as string | undefined,
        claimant: args.claimant as string,
        leaseSeconds: (args.leaseSeconds as number | undefined) ?? 300,
      }));

    case "hyperclaw_notify":
      bridge.emitEvent(args.type as string, {
        title: args.title,
        message: args.message,
        severity: args.severity ?? "info",
        ...(args.action ? { action: args.action } : {}),
        ...(args.data as object | undefined),
      });
      return ok({ emitted: args.type });

    case "hyperclaw_intel_schema":
      return ok(bridge.intelSchema());

    case "hyperclaw_intel_query": {
      const result = bridge.intelQuery(args.sql as string);
      return result.error ? err(result.error as string) : ok(result);
    }

    case "hyperclaw_intel_execute": {
      const result = bridge.intelExecute(args.sql as string, args.agent_id as string | undefined);
      return result.error ? err(result.error as string) : ok(result);
    }

    case "hyperclaw_intel_write": {
      const action = args.action as string;
      let result: Record<string, unknown>;
      if (action === "insert") {
        if (!args.data) return err("data required for insert");
        result = bridge.intelInsert(args.table as string, args.data as Record<string, unknown>, args.agent_id as string | undefined);
      } else if (action === "update") {
        if (!args.data || !args.where) return err("data and where required for update");
        result = bridge.intelUpdate(args.table as string, args.data as Record<string, unknown>, args.where as Record<string, unknown>);
      } else if (action === "delete") {
        if (!args.where) return err("where required for delete");
        result = bridge.intelDelete(args.table as string, args.where as Record<string, unknown>);
      } else {
        return err(`Unknown action: ${action}`);
      }
      return result.error ? err(result.error as string) : ok(result);
    }

    case "hyperclaw_save_transcript": {
      bridge.sessionUpsert({
        sessionKey: args.sessionKey as string,
        agentId: args.agentId as string | undefined,
        label: args.label as string | undefined,
      });
      return ok(bridge.sessionAppendMessages(
        args.sessionKey as string,
        args.messages as { role?: string; content: unknown; runId?: string }[]
      ));
    }

    case "hyperclaw_add_agent":
      return ok(bridge.addAgent({
        name: args.name as string,
        type: args.type as string | undefined,
        emoji: args.emoji as string | undefined,
        config: args.config as Record<string, unknown> | undefined,
      }));

    case "hyperclaw_create_agent": {
      const name = args.name as string;
      if (!name || !name.trim()) return err("name is required");

      const envRuntime = process.env.HYPERCLAW_DEFAULT_RUNTIME;
      const rawRuntime = (args.runtime as string | undefined) ?? envRuntime ?? "openclaw";
      if (!isSupportedRuntime(rawRuntime)) {
        return err(`unsupported runtime: ${rawRuntime}. Must be one of ${SUPPORTED_RUNTIMES.join(", ")}`);
      }
      const runtime: SupportedRuntime = rawRuntime;

      const agentId = (args.agentId as string | undefined)?.trim() || slugifyAgentName(name);
      if (!agentId || !/^[a-z0-9][a-z0-9._-]*$/.test(agentId)) {
        return err(`invalid agentId "${agentId}" — must start with letter/number and contain only [a-z0-9._-]`);
      }

      const emoji = (args.emoji as string | undefined) ?? "🤖";
      const role = args.role as string | undefined;
      const description = args.description as string | undefined;

      let workspacePath: string;
      let filesWritten: string[];
      try {
        const result = writeAgentWorkspace(runtime, agentId, { name, emoji, role, description });
        workspacePath = result.workspacePath;
        filesWritten = result.filesWritten;
      } catch (e) {
        return err(`workspace write failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Mirror into HyperClaw dashboard so the agent appears in StatusWidget.
      // Non-fatal if it fails — the workspace files are the source of truth.
      let registered: Record<string, unknown> | null = null;
      try {
        registered = bridge.addAgent({
          name,
          type: runtime,
          emoji,
          config: { agentId, role, description, workspacePath },
        });
      } catch {
        registered = null;
      }

      return ok({
        agentId,
        runtime,
        workspacePath,
        filesWritten,
        registered: registered ? true : false,
        registryId: registered?.id ?? null,
        note: filesWritten.length === 0
          ? "Workspace already existed — no files overwritten. Agent registered in dashboard."
          : `Wrote ${filesWritten.length} file(s) to ${workspacePath}`,
      });
    }

    case "hyperclaw_list_agents":
      return ok(bridge.listAgents());

    case "hyperclaw_create_project":
      return ok(bridge.createProject({
        name: args.name as string,
        description: args.description as string | undefined,
      }));

    case "hyperclaw_create_goal":
      return ok(bridge.createGoal({
        title: args.title as string,
        description: args.description as string | undefined,
        kpis: args.kpis as string[] | undefined,
        projectId: args.projectId as string | undefined,
      }));

    case "hyperclaw_create_issue":
      return ok(bridge.createIssue({
        title: args.title as string,
        description: args.description as string | undefined,
        severity: args.severity as string | undefined,
        agentId: args.agentId as string | undefined,
        projectId: args.projectId as string | undefined,
      }));

    case "hyperclaw_list_projects":
      return ok(bridge.listProjects());

    case "hyperclaw_list_goals":
      return ok(bridge.listGoals(args.projectId as string | undefined));

    case "hyperclaw_list_issues":
      return ok(bridge.listIssues({
        status: args.status as string | undefined,
        projectId: args.projectId as string | undefined,
        agentId: args.agentId as string | undefined,
      }));

    case "hyperclaw_read_commands":
      return ok(bridge.readCommands());

    default:
      return err(`Unknown tool: ${name}`);
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "hyperclaw", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ ...t, inputSchema: t.inputSchema as object })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  return callTool(req.params.name, args);
});

const transport = new StdioServerTransport();
await server.connect(transport);
