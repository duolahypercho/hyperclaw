/**
 * Orchestrator Chat Engine
 *
 * Agentic loop: user sends a message → LLM reasons → calls tools →
 * orchestrator executes → LLM responds. Conversation history stored
 * in Intel SQLite KV.
 *
 * The LLM uses whatever API key the user provided. No UserManager.
 */
import { LLMClient, type LLMConfig, type Message, type ContentBlock, type ToolCall } from './llm';
import { ORCHESTRATOR_TOOLS } from './tools-schema';
import { HyperClawOrchestrator } from './orchestrator';
import type { OrchestratorStore } from './store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatSession = {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  totalTokens: { input: number; output: number };
};

export type ChatConfig = {
  llm: LLMConfig;
  systemPrompt?: string;
  maxToolRounds?: number; // max consecutive tool-use rounds (default 10)
};

export type ChatResult = {
  reply: string;               // final text response
  toolCalls: ToolCallRecord[]; // all tool calls made in this turn
  usage: { inputTokens: number; outputTokens: number };
};

export type ToolCallRecord = {
  name: string;
  input: Record<string, unknown>;
  output: string;
  durationMs: number;
};

// ---------------------------------------------------------------------------
// Default System Prompt
// ---------------------------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT = `You are the HyperClaw orchestrator. You manage AI agents across devices.

You can:
- List and monitor devices
- Register agent definitions, deploy them to devices, and trigger runs
- Create and execute multi-agent workflows with dependency ordering
- Send ad-hoc bridge commands to any device (fetch logs, query data, manage cron jobs, read docs, etc.)
- Handle approval requests from agents

Be direct. Lead with actions, not explanations. When the user asks you to do something, use your tools immediately.
Format results as tables when showing lists. Report errors clearly with what failed and what to do next.

The user owns this platform — their API keys, their devices, their data. Everything runs on their infrastructure.`;

// ---------------------------------------------------------------------------
// Chat Engine
// ---------------------------------------------------------------------------

export class OrchestratorChat {
  private llm: LLMClient;
  private orch: HyperClawOrchestrator;
  private store: OrchestratorStore;
  private systemPrompt: string;
  private maxToolRounds: number;

  constructor(orch: HyperClawOrchestrator, config: ChatConfig) {
    this.llm = new LLMClient(config.llm);
    this.orch = orch;
    this.store = orch.store;
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.maxToolRounds = config.maxToolRounds ?? 10;
  }

  // ---------------------------------------------------------------------------
  // Session Management (KV-backed)
  // ---------------------------------------------------------------------------

  async createSession(): Promise<ChatSession> {
    const session: ChatSession = {
      id: crypto.randomUUID(),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalTokens: { input: 0, output: 0 },
    };
    await this.saveSession(session);
    return session;
  }

  async getSession(id: string): Promise<ChatSession | null> {
    await this.store.init();
    const rows = await this.queryKV(`chat:${id}`);
    if (!rows) return null;
    return JSON.parse(rows) as ChatSession;
  }

  async listSessions(): Promise<Array<{ id: string; createdAt: string; updatedAt: string; messageCount: number }>> {
    await this.store.init();
    const rows = await this.queryKVByNs('chat') as Array<{ key: string; value: string }>;
    if (!rows) return [];
    return rows.map((r) => {
      const s = JSON.parse(r.value) as ChatSession;
      return {
        id: s.id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.filter((m) => m.role === 'user').length,
      };
    });
  }

  async deleteSession(id: string): Promise<void> {
    await this.store.init();
    await this.execKV(`DELETE FROM hc_kv WHERE key = 'chat:${id}'`);
  }

  private async saveSession(session: ChatSession): Promise<void> {
    await this.store.init();
    session.updatedAt = new Date().toISOString();
    const v = escape(JSON.stringify(session));
    await this.execKV(
      `INSERT INTO hc_kv (key, value, ns, updated_at) VALUES ('chat:${session.id}', '${v}', 'chat', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = '${v}', updated_at = datetime('now')`,
    );
  }

  // ---------------------------------------------------------------------------
  // Send Message — the agentic loop
  // ---------------------------------------------------------------------------

  async send(sessionId: string, userMessage: string): Promise<ChatResult> {
    let session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    // Add user message
    session.messages.push({ role: 'user', content: userMessage });

    const allToolCalls: ToolCallRecord[] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let reply = '';

    // Agentic loop — keep going while LLM wants to use tools
    for (let round = 0; round < this.maxToolRounds; round++) {
      const response = await this.llm.chat(
        this.systemPrompt,
        session.messages,
        ORCHESTRATOR_TOOLS,
      );

      totalInput += response.usage.inputTokens;
      totalOutput += response.usage.outputTokens;

      // Extract text and tool calls
      const textParts: string[] = [];
      const toolUses: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') textParts.push(block.text);
        if (block.type === 'tool_use') toolUses.push(block);
      }

      // Add assistant message with full content
      session.messages.push({ role: 'assistant', content: response.content });

      // If no tool calls, we're done
      if (response.stopReason !== 'tool_use' || toolUses.length === 0) {
        reply = textParts.join('\n');
        break;
      }

      // Execute tool calls
      const toolResults: ContentBlock[] = [];
      for (const tc of toolUses) {
        const started = Date.now();
        let output: string;
        let isError = false;

        try {
          const result = await this.executeTool(tc.name, tc.input);
          output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (err) {
          output = err instanceof Error ? err.message : String(err);
          isError = true;
        }

        const duration = Date.now() - started;
        allToolCalls.push({ name: tc.name, input: tc.input, output, durationMs: duration });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: output,
          is_error: isError,
        });
      }

      // Add tool results as user message (Anthropic format)
      session.messages.push({ role: 'user', content: toolResults });
    }

    // Update session tokens
    session.totalTokens.input += totalInput;
    session.totalTokens.output += totalOutput;
    await this.saveSession(session);

    return {
      reply,
      toolCalls: allToolCalls,
      usage: { inputTokens: totalInput, outputTokens: totalOutput },
    };
  }

  // ---------------------------------------------------------------------------
  // Tool Execution — maps tool names to orchestrator methods
  // ---------------------------------------------------------------------------

  private async executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      // Devices
      case 'list_devices':
        return this.orch.listDevices();
      case 'get_online_devices':
        return this.orch.getOnlineDevices();

      // Agent Registry
      case 'list_registered_agents':
        return this.orch.listAgents();
      case 'register_agent':
        return this.orch.registerAgent({
          id: crypto.randomUUID(),
          name: input.name as string,
          title: (input.title as string) ?? '',
          skills: (input.skills as string[]) ?? [],
          instructions: input.instructions as string,
          soul: null,
          heartbeat: null,
        });
      case 'unregister_agent':
        return this.orch.unregisterAgent(input.agentId as string);

      // Deployments
      case 'deploy_agent':
        return this.orch.deploy({
          agentId: input.agentId as string,
          deviceId: input.deviceId as string,
          config: input.config as Record<string, unknown>,
        });
      case 'recall_agent':
        return this.orch.recall(input.deploymentId as string);
      case 'list_deployments':
        return this.orch.store.listDeployments({
          agentId: input.agentId as string | undefined,
          deviceId: input.deviceId as string | undefined,
          status: input.status as string | undefined,
        });
      case 'wake_agent':
        return this.orch.wake({
          deploymentId: input.deploymentId as string,
          trigger: 'manual',
          reason: input.reason as string | undefined,
        });
      case 'list_runs':
        return this.orch.store.listRuns(
          {
            deploymentId: input.deploymentId as string | undefined,
            agentId: input.agentId as string | undefined,
            status: input.status as string | undefined,
          },
          (input.limit as number) ?? 20,
        );

      // Workflows
      case 'create_workflow':
        return this.orch.createWorkflow(
          input.name as string,
          input.steps as Array<{ id: string; agentId: string; deviceId: string; action: string; params: Record<string, unknown>; dependsOn: string[] }>,
        );
      case 'execute_workflow':
        return this.orch.executeWorkflow(input.workflowId as string);
      case 'list_workflows':
        return this.orch.store.listWorkflows();

      // Approvals
      case 'list_approvals':
        return this.orch.listApprovals();
      case 'resolve_approval': {
        const decision = input.decision as string;
        if (decision === 'approve') {
          return this.orch.approve(input.approvalId as string);
        }
        return this.orch.deny(input.approvalId as string);
      }

      // Bridge (ad-hoc)
      case 'bridge_command':
        return this.orch.bridgeTo(
          input.deviceId as string,
          input.action as string,
          (input.params as Record<string, unknown>) ?? {},
        );

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // KV helpers (using the store's intel connection)
  // ---------------------------------------------------------------------------

  private async queryKV(key: string): Promise<string | null> {
    const rows = await this.store.intel.query(
      `SELECT value FROM hc_kv WHERE key = '${key}'`,
    ) as Array<{ value: string }> | null;
    if (!rows || rows.length === 0) return null;
    return rows[0].value;
  }

  private async queryKVByNs(ns: string): Promise<Array<{ key: string; value: string }> | null> {
    return this.store.intel.query(
      `SELECT key, value FROM hc_kv WHERE ns = '${ns}' ORDER BY updated_at DESC`,
    ) as Promise<Array<{ key: string; value: string }> | null>;
  }

  private async execKV(sql: string): Promise<void> {
    await this.store.intel.execute(sql);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escape(s: string): string {
  return s.replace(/'/g, "''");
}
