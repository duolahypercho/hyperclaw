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
