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
  emoji?: string;
  avatarData?: string;
  status?: string;
  role?: string;
  lastActive?: string;
  updatedAt?: number;
}

/* ── Context ─────────────────────────────────────────────────────── */

type OpenClawCtx = ReturnType<typeof useOpenClawContext>;
export type HyperclawContextValue = Omit<OpenClawCtx, "agents"> & {
  agents: HyperclawAgent[];
};

const HyperclawContext = createContext<HyperclawContextValue | null>(null);

/* ── Inner consumer — must live inside OpenClawProvider ──────────── */

function HyperclawInner({ children }: { children: ReactNode }) {
  const openClaw = useOpenClawContext();
  const [sqliteAgents, setSqliteAgents] = useState<HyperclawAgent[]>([]);
  const fnsRef = useRef(openClaw);
  fnsRef.current = openClaw;

  const fetchSeqRef = useRef(0);

  const fetchSQLiteAgents = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const res = (await bridgeInvoke("list-agent-identities", {})) as {
        success?: boolean;
        data?: HyperclawAgent[];
      };
      // Only apply if no newer fetch has started — prevents stale responses
      // from overwriting fresher data when multiple events fire concurrently.
      if (seq !== fetchSeqRef.current) return;
      if (res?.success && Array.isArray(res.data)) {
        // Trust the full response, even if it's an empty array.
        setSqliteAgents(res.data);
      }
      // On !success or unexpected shape: keep existing state — don't wipe.
    } catch {
      // On bridge error / timeout: keep existing state.
      // Wiping here would drop all non-OpenClaw agents until hard reload.
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSQLiteAgents();
  }, [fetchSQLiteAgents]);

  // Live refresh when agent data changes.
  // agent.file.changed — IDENTITY.md sync
  // agent.hired        — new agent confirmed by connector; refresh before StatusWidget runs
  // agent.deleted      — removed agent; refresh so StatusWidget doesn't re-add it
  useEffect(() => {
    const handler = () => fetchSQLiteAgents();
    window.addEventListener("agent.file.changed", handler);
    window.addEventListener("agent.hired", handler);
    window.addEventListener("agent.deleted", handler);
    return () => {
      window.removeEventListener("agent.file.changed", handler);
      window.removeEventListener("agent.hired", handler);
      window.removeEventListener("agent.deleted", handler);
    };
  }, [fetchSQLiteAgents]);

  // SQLite agents when available; fall back to OpenClaw list so nothing breaks
  // if the connector is offline or hasn't cold-synced yet.
  const agents = useMemo<HyperclawAgent[]>(() => {
    if (sqliteAgents.length > 0) return sqliteAgents;
    return openClaw.agents.map((a) => ({
      id: a.id,
      name: a.name,
      runtime: "openclaw",
      status: a.status,
      role: a.role,
      lastActive: a.lastActive,
    }));
  }, [sqliteAgents, openClaw.agents]);

  const value = useMemo<HyperclawContextValue>(
    () => ({
      ...openClaw,
      agents,
      // Override refreshAll so it also re-fetches Hyperclaw agents
      refreshAll: async () => {
        await fnsRef.current.refreshAll();
        await fetchSQLiteAgents();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openClaw, agents, fetchSQLiteAgents]
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
