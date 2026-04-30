"use client";

import { useMemo } from "react";
import { type EnsembleAgent } from "../agents";
import { normalizeAgentState, type AgentState } from "../primitives/StatusDot";
import type { AgentActivitySnapshot } from "./useEnsembleData";
import type { EnsembleAgentView } from "./useEnsembleAgents";

export interface LiveAgentRow {
  agent: EnsembleAgent;
  /**
   * Base state from the connector activity poll. The "working" state is
   * NOT set here — it is overlaid per-render via `useAgentStatus(agentId)`
   * from the live gateway streaming signal.
   */
  state: AgentState;
  sessions: number;
  costMonth: number;
  tokensMonth: number;
  lastActivity?: number;
}

/**
 * Merge the real HyperClaw agent roster with live activity from the connector bridge.
 * The `agents` list should come from `useEnsembleAgents()` — that hook already
 * falls back to the seed when no real agents are configured, so this hook stays
 * unaware of the seed-vs-real distinction.
 */
export function useLiveAgents(
  agents: EnsembleAgentView[],
  activity: Map<string, AgentActivitySnapshot>
): LiveAgentRow[] {
  return useMemo(
    () =>
      agents.map((a) => {
        const live = activity.get(a.id);
        // Adapt EnsembleAgentView → EnsembleAgent for downstream card components.
        const agentShape: EnsembleAgent = {
          id: a.id,
          name: a.name,
          title: a.title,
          department: a.department,
          emoji: a.emoji,
          kind: a.kind,
          runtimeLabel: a.runtimeLabel,
          identity: a.identity,
          seedCostMonth: 0,
          seedTokensMonth: 0,
          seedState: "idle",
        };
        const registryState = normalizeAgentState(a.status);
        const activityState = live?.state
          ? normalizeAgentState(live.state)
          : agentShape.seedState;

        return {
          agent: agentShape,
          state: registryState !== "idle" ? registryState : activityState,
          sessions: live?.sessions ?? 0,
          costMonth: live?.cost_month ?? 0,
          tokensMonth: live?.tokens_month ?? 0,
          lastActivity: live?.last_activity,
        };
      }),
    [agents, activity]
  );
}
