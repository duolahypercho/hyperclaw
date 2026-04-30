"use client";

import {
  createContext,
  useContext,
  type ReactNode,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { OpenClawProvider, useOpenClawContext, type SavedLayout } from "./OpenClawProv";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { subscribeGatewayConnection } from "$/lib/openclaw-gateway-ws";
import { AGENT_IDENTITY_CACHE_PATCHED_EVENT, type AgentIdentity } from "$/hooks/useAgentIdentity";

// Re-export for convenience
export type { SavedLayout };

/* ── Runtime-agnostic agent type ─────────────────────────────────── */

/**
 * A Hyperclaw agent — covers all runtimes: openclaw, claude-code, codex,
 * hermes, hyperclaw. Superset of OpenClawRegistryAgent so existing consumers
 * work without changes.
 */
export interface HyperclawAgent {
  id: string;
  name: string;
  runtime: string;
  config?: Record<string, unknown>;
  emoji?: string;
  avatarData?: string;
  status?: string;
  role?: string;
  description?: string;
  lastActive?: string;
  updatedAt?: number;
}

/* ── Context ─────────────────────────────────────────────────────── */

type OpenClawCtx = ReturnType<typeof useOpenClawContext>;
export type HyperclawContextValue = Omit<OpenClawCtx, "agents"> & {
  agents: HyperclawAgent[];
  /** Agent ids whose delete-bridge call is in flight (red "firing" state). */
  deletingAgentIds: Set<string>;
};

const HyperclawContext = createContext<HyperclawContextValue | null>(null);

/* ── Inner consumer — must live inside OpenClawProvider ──────────── */

function HyperclawInner({ children }: { children: ReactNode }) {
  const openClaw = useOpenClawContext();
  const [agents, setAgents] = useState<HyperclawAgent[]>([]);
  // Agents whose delete bridge call is in flight. We keep them in the `agents`
  // list (just visually stamped as "firing") until the bridge confirms the
  // removal. On refresh the data still exists — that's the honest state.
  const [deletingAgentIds, setDeletingAgentIds] = useState<Set<string>>(new Set());
  const deletingAgentIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { deletingAgentIdsRef.current = deletingAgentIds; }, [deletingAgentIds]);
  const pendingHireAgentsRef = useRef<Record<string, HyperclawAgent>>({});
  const identityPatchesRef = useRef<Record<string, Partial<HyperclawAgent>>>({});
  const fnsRef = useRef(openClaw);
  fnsRef.current = openClaw;

  const fetchSeqRef = useRef(0);

  // Agents are displayed oldest → newest across navbar, Team, and Chat.
  // Backend query orders by name; re-sort by `updatedAt` ascending since
  // that column is populated at first insert and effectively represents
  // creation time for un-edited agents. Agents without `updatedAt` fall
  // back to id so ordering stays stable. Optimistic inserts use Date.now()
  // so newly-hired agents append while setup finishes.
  const sortAgentsOldToNew = useCallback((list: HyperclawAgent[]): HyperclawAgent[] =>
    [...list].sort((a, b) => {
      const ta = typeof a.updatedAt === "number" ? a.updatedAt : Number.POSITIVE_INFINITY;
      const tb = typeof b.updatedAt === "number" ? b.updatedAt : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    }), []);

  const mergePendingHireAgents = useCallback((backendAgents: HyperclawAgent[]): HyperclawAgent[] => {
    const pending = pendingHireAgentsRef.current;
    const pendingEntries = Object.entries(pending);
    if (pendingEntries.length === 0) return sortAgentsOldToNew(backendAgents);

    const byId = new Map(backendAgents.map((agent) => [agent.id, agent] as const));
    let nextPending = pending;
    let pendingChanged = false;

    for (const [agentId, pendingAgent] of pendingEntries) {
      const backendAgent = byId.get(agentId);

      if (!backendAgent) {
        byId.set(agentId, pendingAgent);
        continue;
      }

      if (pendingAgent.status === "hiring") {
        byId.set(agentId, {
          ...backendAgent,
          ...pendingAgent,
          updatedAt: backendAgent.updatedAt ?? pendingAgent.updatedAt,
          status: "hiring",
        });
        continue;
      }

      const mergedBackendAgent: HyperclawAgent = {
        ...backendAgent,
        role: backendAgent.role || pendingAgent.role,
        description: backendAgent.description || pendingAgent.description,
        emoji: backendAgent.emoji || pendingAgent.emoji,
        avatarData: backendAgent.avatarData || pendingAgent.avatarData,
      };
      const stillNeedsCachedMetadata =
        (!!pendingAgent.role && !backendAgent.role) ||
        (!!pendingAgent.description && !backendAgent.description);

      byId.set(agentId, mergedBackendAgent);
      if (stillNeedsCachedMetadata) continue;

      if (!pendingChanged) {
        nextPending = { ...pending };
        pendingChanged = true;
      }
      delete nextPending[agentId];
    }

    if (pendingChanged) {
      pendingHireAgentsRef.current = nextPending;
    }

    return sortAgentsOldToNew(Array.from(byId.values()));
  }, [sortAgentsOldToNew]);

  const applyIdentityPatches = useCallback((list: HyperclawAgent[]): HyperclawAgent[] => {
    const patches = identityPatchesRef.current;
    if (Object.keys(patches).length === 0) return list;
    return list.map((agent) => {
      const patch = patches[agent.id];
      return patch ? { ...agent, ...patch } : agent;
    });
  }, []);

  // Single-source fetch: all agents (every runtime) come from SQLite.
  // The connector's SyncEngine + SeedAgents ensure SQLite is up-to-date.
  const fetchAgents = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const res = (await bridgeInvoke("list-agent-identities", {})) as {
        success?: boolean;
        data?: HyperclawAgent[];
      };
      if (seq !== fetchSeqRef.current) return;
      if (res?.success && Array.isArray(res.data)) {
        const mergedAgents = applyIdentityPatches(mergePendingHireAgents(res.data));
        setAgents(mergedAgents);
      }
    } catch {
      // On bridge error / timeout: keep existing state.
    }
  }, [applyIdentityPatches, mergePendingHireAgents]);

  const handleIdentityPatched = useCallback((e: Event) => {
    const detail = (e as CustomEvent<{ agentId?: string; identity?: AgentIdentity }>).detail;
    const agentId = detail?.agentId;
    const identity = detail?.identity;
    if (!agentId || !identity) return;

    const patch: Partial<HyperclawAgent> = {};
    if (typeof identity.name === "string") patch.name = identity.name;
    if (typeof identity.emoji === "string") patch.emoji = identity.emoji;
    if (typeof identity.role === "string") patch.role = identity.role;
    if (typeof identity.description === "string") patch.description = identity.description;
    if (typeof identity.runtime === "string") patch.runtime = identity.runtime;
    if (typeof identity.avatar === "string") patch.avatarData = identity.avatar;
    if (Object.keys(patch).length === 0) return;

    identityPatchesRef.current = {
      ...identityPatchesRef.current,
      [agentId]: {
        ...identityPatchesRef.current[agentId],
        ...patch,
      },
    };

    setAgents((prev) =>
      sortAgentsOldToNew(
        prev.map((agent) => (
          agent.id === agentId ? { ...agent, ...patch } : agent
        )),
      ),
    );
  }, [sortAgentsOldToNew]);

  // Keep fetching agents forever with adaptive cadence:
  // - Fast backoff retries while the list is empty (cold start / post-onboarding).
  // - Slow heartbeat refresh after agents are available.
  // This avoids a "give up after 10s" state that required manual app restart.
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let emptyAttempts = 0;

    const schedule = async () => {
      await fetchAgents();
      if (cancelled) return;

      const hasAgents = agentsRef.current.length > 0;
      if (!hasAgents) emptyAttempts += 1;
      else emptyAttempts = 0;

      const delay = hasAgents
        ? 30_000
        : Math.min(15_000, 1000 * Math.pow(2, Math.min(emptyAttempts, 4)));

      timer = setTimeout(schedule, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchAgents]);

  // Live refresh when agent data changes.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const retryTimers: ReturnType<typeof setTimeout>[] = [];
    const clearRetries = () => {
      while (retryTimers.length) {
        const t = retryTimers.shift();
        if (t) clearTimeout(t);
      }
    };

    const debouncedHandler = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchAgents();
        debounceTimer = null;
      }, 300);
    };

    // After a hire: connector's SyncEngine may take a moment to index the new
    // agent into SQLite, so retry a few times with increasing delays to catch
    // eventual consistency instead of relying on the 30s heartbeat.
    const hiredHandler = (e: Event) => {
      const expectedId = (e as CustomEvent).detail?.agentId as string | undefined;
      if (expectedId) {
        const pendingAgent = pendingHireAgentsRef.current[expectedId];
        if (pendingAgent) {
          pendingHireAgentsRef.current = {
            ...pendingHireAgentsRef.current,
            [expectedId]: {
              ...pendingAgent,
              status: "idle",
            },
          };
          setAgents((prev) => {
            if (prev.some((agent) => agent.id === expectedId)) {
              return prev.map((agent) =>
                agent.id === expectedId ? { ...agent, status: "idle" } : agent,
              );
            }
            return [...prev, { ...pendingAgent, status: "idle" }];
          });
        }
      }
      clearRetries();
      debouncedHandler();
      const delays = [500, 1200, 2500, 5000];
      for (const delay of delays) {
        const t = setTimeout(() => {
          if (
            expectedId &&
            !pendingHireAgentsRef.current[expectedId] &&
            agentsRef.current.some((a) => a.id === expectedId)
          ) {
            return;
          }
          fetchAgents();
        }, delay);
        retryTimers.push(t);
      }
    };

    // Optimistic insert while the bridge call is still in flight so UI updates
    // instantly. The real record arrives through agent.hired / retries.
    const hiringHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { agentId?: string; name?: string; emoji?: string; runtime?: string; role?: string; description?: string }
        | undefined;
      if (!detail?.agentId) return;
      const optimisticAgent: HyperclawAgent = {
        id: detail.agentId,
        name: detail.name || detail.agentId,
        runtime: detail.runtime || "openclaw",
        emoji: detail.emoji,
        role: detail.role,
        description: detail.description,
        status: "hiring",
        updatedAt: Date.now(),
      };
      pendingHireAgentsRef.current = {
        ...pendingHireAgentsRef.current,
        [detail.agentId]: optimisticAgent,
      };
      setAgents((prev) => {
        const existing = prev.find((agent) => agent.id === detail.agentId);
        const nextAgent = existing
          ? {
              ...existing,
              ...optimisticAgent,
              updatedAt: existing.updatedAt ?? optimisticAgent.updatedAt,
              status: "hiring",
            }
          : optimisticAgent;
        return sortAgentsOldToNew([
          ...prev.filter((agent) => agent.id !== detail.agentId),
          nextAgent,
        ]);
      });
    };

    const hireFailedHandler = (e: Event) => {
      const failedId = (e as CustomEvent).detail?.agentId as string | undefined;
      if (!failedId) return;
      if (pendingHireAgentsRef.current[failedId]) {
        const nextPending = { ...pendingHireAgentsRef.current };
        delete nextPending[failedId];
        pendingHireAgentsRef.current = nextPending;
      }
      setAgents((prev) => prev.filter((agent) => agent.id !== failedId));
    };

    // Bridge delete is in flight. Mark the agent as "deleting" so the UI
    // stamps it red/firing, but DO NOT remove it from the list — if the bridge
    // fails or the underlying data still exists, we want an honest reappear
    // rather than a ghost that pops back on refresh.
    const deletingHandler = (e: Event) => {
      const deletedId = (e as CustomEvent).detail?.agentId as string | undefined;
      if (!deletedId) return;
      setDeletingAgentIds((prev) => {
        if (prev.has(deletedId)) return prev;
        const next = new Set(prev);
        next.add(deletedId);
        return next;
      });
    };

    // After the bridge confirms delete, drop the agent from the list and
    // poll with backoff to catch SyncEngine eventual consistency. Also
    // clears the "deleting" badge.
    const deletedHandler = (e: Event) => {
      const deletedId = (e as CustomEvent).detail?.agentId as string | undefined;
      clearRetries();
      if (deletedId) {
        setAgents((prev) => prev.filter((a) => a.id !== deletedId));
        setDeletingAgentIds((prev) => {
          if (!prev.has(deletedId)) return prev;
          const next = new Set(prev);
          next.delete(deletedId);
          return next;
        });
      }
      debouncedHandler();
      const delays = [500, 1200, 2500, 5000];
      for (const delay of delays) {
        const t = setTimeout(() => {
          if (deletedId && !agentsRef.current.some((a) => a.id === deletedId)) {
            return;
          }
          fetchAgents().then(() => {
            if (deletedId && agentsRef.current.some((a) => a.id === deletedId)) {
              setAgents((prev) => prev.filter((a) => a.id !== deletedId));
            }
          });
        }, delay);
        retryTimers.push(t);
      }
    };

    // Delete bridge errored — drop the "deleting" badge so the agent returns
    // to its normal visual state. Keep the agent in the list (it still exists).
    const deleteFailedHandler = (e: Event) => {
      const failedId = (e as CustomEvent).detail?.agentId as string | undefined;
      if (!failedId) return;
      setDeletingAgentIds((prev) => {
        if (!prev.has(failedId)) return prev;
        const next = new Set(prev);
        next.delete(failedId);
        return next;
      });
    };

    window.addEventListener("agent.file.changed", debouncedHandler);
    window.addEventListener("agent.hiring", hiringHandler);
    window.addEventListener("agent.hired", hiredHandler);
    window.addEventListener("agent.hire.failed", hireFailedHandler);
    window.addEventListener("agent.deleting", deletingHandler);
    window.addEventListener("agent.deleted", deletedHandler);
    window.addEventListener("agent.delete.failed", deleteFailedHandler);
    window.addEventListener(AGENT_IDENTITY_CACHE_PATCHED_EVENT, handleIdentityPatched);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearRetries();
      window.removeEventListener("agent.file.changed", debouncedHandler);
      window.removeEventListener("agent.hiring", hiringHandler);
      window.removeEventListener("agent.hired", hiredHandler);
      window.removeEventListener("agent.hire.failed", hireFailedHandler);
      window.removeEventListener("agent.deleting", deletingHandler);
      window.removeEventListener("agent.deleted", deletedHandler);
      window.removeEventListener("agent.delete.failed", deleteFailedHandler);
      window.removeEventListener(AGENT_IDENTITY_CACHE_PATCHED_EVENT, handleIdentityPatched);
    };
  }, [fetchAgents, handleIdentityPatched, mergePendingHireAgents, sortAgentsOldToNew]);

  // If gateway connection transitions to connected, fetch immediately.
  // This catches the "connector came online after onboarding finished" case.
  useEffect(() => {
    const unsub = subscribeGatewayConnection(() => {
      fetchAgents();
    });
    return () => unsub();
  }, [fetchAgents]);

  // Stamp agents currently being deleted with status: "deleting" so every
  // downstream consumer (StatusDot, navbar row, team page) renders the red
  // "firing" treatment without needing its own deleting-id plumbing.
  const visibleAgents = useMemo<HyperclawAgent[]>(() => {
    if (deletingAgentIds.size === 0) return agents;
    return agents.map((a) =>
      deletingAgentIds.has(a.id) ? { ...a, status: "deleting" } : a,
    );
  }, [agents, deletingAgentIds]);

  const value = useMemo<HyperclawContextValue>(
    () => ({
      ...openClaw,
      agents: visibleAgents,
      deletingAgentIds,
      refreshAll: async () => {
        await fnsRef.current.refreshAll();
        await fetchAgents();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openClaw, visibleAgents, deletingAgentIds, fetchAgents]
  );

  return (
    <HyperclawContext.Provider value={value}>
      {children}
    </HyperclawContext.Provider>
  );
}

/* ── Public provider ─────────────────────────────────────────────── */

export function HyperclawProvider({ children }: { children: ReactNode }) {
  return (
    <OpenClawProvider>
      <HyperclawInner>{children}</HyperclawInner>
    </OpenClawProvider>
  );
}

export function useHyperclawContext(): HyperclawContextValue {
  const ctx = useContext(HyperclawContext);
  if (!ctx) {
    throw new Error("useHyperclawContext must be used within HyperclawProvider");
  }
  return ctx;
}
