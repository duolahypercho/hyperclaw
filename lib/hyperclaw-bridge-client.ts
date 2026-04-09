/**
 * Single entry point for all bridge calls.
 *
 * All commands route through Hub API → Connector (cross-device compatible).
 * Claude Code, Codex, and other runtime actions are handled by the connector
 * daemon — no Electron IPC needed.
 */
import { hubCommand } from "$/lib/hub-direct";

export type BridgeBody = Record<string, unknown>;

export async function bridgeInvoke(action: string, body: BridgeBody = {}): Promise<unknown> {
  // Streaming actions (claude-code-send, codex-send) always use hubCommand
  // for the WS path with proper timeout + streaming event support.
  // The Electron bridge uses a 60s REST timeout which is too short.
  const isStreaming =
    action === "claude-code-send" || action === "codex-send";

  if (
    !isStreaming &&
    typeof window !== "undefined" &&
    window.electronAPI?.hyperClawBridge?.invoke
  ) {
    return window.electronAPI.hyperClawBridge.invoke(action, body);
  }
  return hubCommand({ action, ...body });
}

// Local usage storage helpers
export interface LocalUsageData {
  daily: Record<string, {
    input: number;
    output: number;
    totalTokens: number;
    totalCost: number;
    inputCost: number;
    outputCost: number;
    cacheRead: number;
    cacheWrite: number;
    cacheReadCost: number;
    cacheWriteCost: number;
  }>;
  lastUpdated: string;
}

export async function saveLocalUsage(usageData: LocalUsageData): Promise<{ success: boolean; error?: string }> {
  return await bridgeInvoke("save-local-usage", { usageData }) as { success: boolean; error?: string };
}

export async function loadLocalUsage(): Promise<{ success: boolean; data: LocalUsageData | null; error?: string }> {
  return await bridgeInvoke("load-local-usage", {}) as { success: boolean; data: LocalUsageData | null; error?: string };
}

// Agent event storage helpers

export interface AgentEvent {
  id: number;
  agentId: string;
  runId?: string;
  sessionKey?: string;
  eventType: string;
  status: string;
  data?: Record<string, unknown>;
  createdAt: number;
}

export async function getAgentEvents(agentId?: string, limit = 50): Promise<AgentEvent[]> {
  const result = await bridgeInvoke("get-agent-events", {
    ...(agentId ? { agentId } : {}),
    limit,
  }) as { events?: AgentEvent[] } | AgentEvent[];
  if (Array.isArray(result)) return result;
  return (result as { events?: AgentEvent[] })?.events ?? [];
}

export async function addAgentEvent(event: {
  agentId: string;
  eventType: string;
  status?: string;
  runId?: string;
  sessionKey?: string;
  data?: Record<string, unknown>;
}): Promise<{ success: boolean; id?: number }> {
  return await bridgeInvoke("add-agent-event", event) as { success: boolean; id?: number };
}
