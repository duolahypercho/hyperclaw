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

  const fetchSQLiteAgents = useCallback(async () => {
    try {
      const res = (await bridgeInvoke("list-agent-identities", {})) as {
        success?: boolean;
        data?: HyperclawAgent[];
      };
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        setSqliteAgents(res.data);
        return;
      }
    } catch {}
    setSqliteAgents([]);
  }, []);

  // Initial load
  useEffect(() => {
    fetchSQLiteAgents();
  }, [fetchSQLiteAgents]);

  // Live refresh when any agent file changes (IDENTITY.md sync fires this)
  useEffect(() => {
    const handler = () => fetchSQLiteAgents();
    window.addEventListener("agent.file.changed", handler);
    return () => window.removeEventListener("agent.file.changed", handler);
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
