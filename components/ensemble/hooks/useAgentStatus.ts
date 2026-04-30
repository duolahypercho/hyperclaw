"use client";

import {
  type AgentState,
  normalizeAgentState,
} from "../primitives/StatusDot";
import { useAgentStreamingState } from "./useAgentStreamingState";

/* ─────────────────────────────────────────────────────────────────────────────
   useAgentStatus(agentId, base?)

   The single public accessor for an agent's visual status. Composes:
     1. a base state (from `useLiveAgents` result or a raw connector string), and
     2. a live "working" overlay from the gateway WS streaming signal.

   Overlay rules:
     - If streaming deltas are arriving for this agent → "working"  (amber)
     - Else if a recent stream ended in error          → "error"   (red)
     - Otherwise use the base state unchanged.

   Usage:
     const { state } = useAgentStatus(agentId, { state: row.state });
     const { state } = useAgentStatus(agentId, { status: agent.status });
     const { state } = useAgentStatus(agentId);              // idle fallback

   Render with the canonical primitive:
     <StatusDot state={state} size="sm" corner />
───────────────────────────────────────────────────────────────────────────── */

export interface UseAgentStatusBase {
  /** Pre-resolved AgentState (from useLiveAgents row). Wins over `status`. */
  state?: AgentState;
  /** Raw connector/registry status string — will be normalized. */
  status?: string;
}

export interface UseAgentStatusResult {
  /** Canonical state for rendering. */
  state: AgentState;
  /** True when the gateway is actively streaming for this agent. */
  isWorking: boolean;
  /** True when a recent stream ended in error. */
  isError: boolean;
}

export function useAgentStatus(
  agentId: string,
  base?: UseAgentStatusBase,
): UseAgentStatusResult {
  const stream = useAgentStreamingState(agentId);

  // Normalize even the pre-resolved state: callers may pass a LiveAgentRow/
  // snapshot string ("active", "online", …) whose runtime value drifted from
  // the AgentState union. `normalizeAgentState` is idempotent for valid inputs.
  const baseState: AgentState = base?.state
    ? normalizeAgentState(base.state as unknown as string)
    : normalizeAgentState(base?.status);

  let state: AgentState = baseState;
  if (baseState === "deleting" || baseState === "hiring") {
    state = baseState;
  } else if (stream.isWorking) {
    state = "working";
  } else if (stream.isError && baseState !== "error") {
    state = "error";
  }

  return {
    state,
    isWorking: stream.isWorking,
    isError: stream.isError,
  };
}
