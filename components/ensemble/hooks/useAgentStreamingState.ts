"use client";

import { useEffect, useMemo, useState } from "react";
import {
  gatewayConnection,
  type ChatEventPayload,
} from "$/lib/openclaw-gateway-ws";

/* ─────────────────────────────────────────────────────────────────────────────
   useAgentStreamingState

   Singleton module-level tracker. Subscribes ONCE to gatewayConnection
   chat events and maintains:
     - activeRuns:        runId → agentId (for correct decrement on final/aborted)
     - agentRunCounts:    agentId → # of concurrent active runs
     - errorAgents:       agents that hit an error very recently (auto-expires)

   React components call `useAgentStreamingState(agentId)` to get the
   per-agent slice. All mounts share one WS listener.

   This is the "yellow / working" signal that every status indicator needs.
───────────────────────────────────────────────────────────────────────────── */

const ERROR_STICKY_MS = 10_000;
const OPTIMISTIC_RUN_TTL_MS = 5 * 60_000;

const activeRuns = new Map<string, string>();         // runId → agentId
const activeRunSessions = new Map<string, string>();  // runId → sessionKey
const agentRunCounts = new Map<string, number>();     // agentId → count
const errorAgents = new Map<string, number>();        // agentId → expire ts
const optimisticRunTimers = new Map<string, ReturnType<typeof setTimeout>>();

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

function incAgent(agentId: string): void {
  agentRunCounts.set(agentId, (agentRunCounts.get(agentId) ?? 0) + 1);
}

function decAgent(agentId: string): void {
  const n = (agentRunCounts.get(agentId) ?? 1) - 1;
  if (n <= 0) agentRunCounts.delete(agentId);
  else agentRunCounts.set(agentId, n);
}

export function extractAgentIdFromSessionKey(sessionKey: string): string | undefined {
  const parts = sessionKey.split(":");
  if (parts.length < 2) return undefined;

  // Ensemble DM sessions are keyed as "ensemble:dm:<agentId>".
  if (parts[0] === "ensemble") {
    if (parts[1] === "dm") {
      return parts.slice(2).join(":") || undefined;
    }
    return undefined;
  }

  // Agent sessions are keyed as "agent:<agentId>:<session>". Agent IDs can
  // contain ":" for runtime-prefixed IDs, so keep the middle section intact.
  if (parts[0] === "agent") {
    return parts.length >= 3 ? parts.slice(1, -1).join(":") : parts[1];
  }

  // Gateway protocol events usually use "<runtime>:<agentId>:<session>".
  return parts.length >= 2 ? parts[1] : undefined;
}

function clearOptimisticTimer(runId: string): void {
  const timer = optimisticRunTimers.get(runId);
  if (!timer) return;
  clearTimeout(timer);
  optimisticRunTimers.delete(runId);
}

export function markAgentRunStarted(runId: string, agentId?: string, sessionKey?: string): void {
  if (!runId || !agentId || activeRuns.has(runId)) return;
  activeRuns.set(runId, agentId);
  if (sessionKey) activeRunSessions.set(runId, sessionKey);
  incAgent(agentId);
  errorAgents.delete(agentId);
  clearOptimisticTimer(runId);
  optimisticRunTimers.set(
    runId,
    setTimeout(() => {
      markAgentRunFinished(runId);
    }, OPTIMISTIC_RUN_TTL_MS),
  );
  notify();
}

export function markAgentRunFinished(runId: string): void {
  if (!runId || !activeRuns.has(runId)) return;
  const agentId = activeRuns.get(runId);
  activeRuns.delete(runId);
  activeRunSessions.delete(runId);
  clearOptimisticTimer(runId);
  if (agentId) decAgent(agentId);
  notify();
}

export function markAgentRunsFinishedForAgent(agentId?: string): number {
  if (!agentId) return 0;
  let cleared = 0;
  for (const [runId, runAgentId] of activeRuns.entries()) {
    if (runAgentId !== agentId) continue;
    activeRuns.delete(runId);
    activeRunSessions.delete(runId);
    clearOptimisticTimer(runId);
    cleared += 1;
  }
  if (cleared > 0) {
    agentRunCounts.delete(agentId);
    notify();
  }
  return cleared;
}

export function __getAgentRunCount(agentId: string): number {
  return agentRunCounts.get(agentId) ?? 0;
}

let subscribed = false;
let unsubscribe: (() => void) | null = null;

function ensureSubscribed(): void {
  if (subscribed) return;
  if (typeof window === "undefined") return; // SSR no-op
  subscribed = true;
  unsubscribe = gatewayConnection.onChatEvent((payload: ChatEventPayload) => {
    const { runId, sessionKey, state } = payload;
    if (!runId || !sessionKey) return;
    const agentId = extractAgentIdFromSessionKey(sessionKey);
    if (!agentId) return;

    if (state === "delta") {
      // First delta for this run → mark working. Subsequent deltas are no-ops.
      if (!activeRuns.has(runId)) {
        markAgentRunStarted(runId, agentId, sessionKey);
      }
      return;
    }

    if (state === "final" || state === "aborted") {
      markAgentRunFinished(runId);
      return;
    }

    if (state === "error") {
      if (activeRuns.has(runId)) {
        activeRuns.delete(runId);
        activeRunSessions.delete(runId);
        clearOptimisticTimer(runId);
        decAgent(agentId);
      }
      errorAgents.set(agentId, Date.now() + ERROR_STICKY_MS);
      notify();
      // Auto-clear error state so the dot goes back to idle.
      setTimeout(() => {
        const expireAt = errorAgents.get(agentId);
        if (expireAt && expireAt <= Date.now()) {
          errorAgents.delete(agentId);
          notify();
        }
      }, ERROR_STICKY_MS + 50);
    }
  });
}

// Exposed for tests / hot-reload cleanup.
export function __resetAgentStreamingState(): void {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  subscribed = false;
  activeRuns.clear();
  activeRunSessions.clear();
  agentRunCounts.clear();
  errorAgents.clear();
  optimisticRunTimers.forEach((timer) => clearTimeout(timer));
  optimisticRunTimers.clear();
  listeners.clear();
}

export interface AgentStreamingState {
  isWorking: boolean;
  isError: boolean;
}

export function useAgentStreamingState(agentId: string): AgentStreamingState {
  // Force re-render whenever the module-level maps change.
  const [, setTick] = useState(0);

  useEffect(() => {
    ensureSubscribed();
    const l: Listener = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  return {
    isWorking: (agentRunCounts.get(agentId) ?? 0) > 0,
    isError: errorAgents.has(agentId),
  };
}

/**
 * Returns the set of agent IDs currently streaming. Useful for list views
 * that want to decorate multiple agents in one pass without calling the
 * per-agent hook N times.
 */
export function useWorkingAgentIds(): ReadonlySet<string> {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    ensureSubscribed();
    const l: Listener = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  return useMemo(() => {
    void tick;
    return new Set(agentRunCounts.keys());
  }, [tick]);
}

export function useWorkingSessionKeys(): ReadonlySet<string> {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    ensureSubscribed();
    const l: Listener = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  return useMemo(() => {
    void tick;
    return new Set(activeRunSessions.values());
  }, [tick]);
}
