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
  const [agents, setAgents] = useState<HyperclawAgent[]>([]);
  const fnsRef = useRef(openClaw);
  fnsRef.current = openClaw;

  const fetchSeqRef = useRef(0);

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
        setAgents(res.data);
      }
    } catch {
      // On bridge error / timeout: keep existing state.
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Live refresh when agent data changes.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedHandler = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchAgents();
        debounceTimer = null;
      }, 300);
    };
    window.addEventListener("agent.file.changed", debouncedHandler);
    window.addEventListener("agent.hired", debouncedHandler);
    window.addEventListener("agent.deleted", debouncedHandler);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("agent.file.changed", debouncedHandler);
      window.removeEventListener("agent.hired", debouncedHandler);
      window.removeEventListener("agent.deleted", debouncedHandler);
    };
  }, [fetchAgents]);

  const value = useMemo<HyperclawContextValue>(
    () => ({
      ...openClaw,
      agents,
      refreshAll: async () => {
        await fnsRef.current.refreshAll();
        await fetchAgents();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openClaw, agents, fetchAgents]
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
