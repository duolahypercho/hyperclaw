export interface AgentStatsSnapshot {
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  sessionCount: number;
  lastActiveMs: number;
}

export type SessionUsageQueryParams =
  | { runtime: string; groupBy: "session"; from: number; to: number }
  | { agentId: string; groupBy: "session"; from: number; to: number };

const RUNTIME_ONLY_STATS = new Set(["claude-code", "codex", "hermes"]);

export function isRootRuntimeUsageAgent(agentId: string, agentRuntime?: string): agentRuntime is string {
  return typeof agentRuntime === "string" && RUNTIME_ONLY_STATS.has(agentRuntime) && agentId === agentRuntime;
}

export function getStatsAgentId(agentId: string, agentRuntime?: string): string {
  return isRootRuntimeUsageAgent(agentId, agentRuntime) ? agentRuntime : agentId;
}

export function getSessionUsageQueryParams(
  agentId: string,
  agentRuntime: string | undefined,
  from: number,
  to: number,
): SessionUsageQueryParams {
  return isRootRuntimeUsageAgent(agentId, agentRuntime)
    ? { runtime: agentRuntime, groupBy: "session", from, to }
    : { agentId, groupBy: "session", from, to };
}

export function getRuntimeSessionUsageQueryParams(
  runtime: string,
  from: number,
  to: number,
): SessionUsageQueryParams {
  return { runtime, groupBy: "session", from, to };
}

export function hasStatsActivity(stats: AgentStatsSnapshot | null | undefined): boolean {
  if (!stats) return false;
  return (
    stats.totalCostUsd > 0 ||
    stats.inputTokens > 0 ||
    stats.outputTokens > 0 ||
    stats.cacheReadTokens > 0 ||
    stats.sessionCount > 0 ||
    stats.lastActiveMs > 0
  );
}

export function shouldUseRuntimeUsageFallback(agentId: string, agentRuntime?: string): agentRuntime is "hermes" {
  // Hermes currently records singleton API-mode usage under runtime="hermes",
  // while the agent profile route uses the human profile id, for example "rell".
  return agentRuntime === "hermes" && agentId !== agentRuntime;
}
