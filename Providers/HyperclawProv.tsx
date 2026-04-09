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

  // Hyperclaw SQLite is the single source of truth for all agents across every
  // runtime. We never fall back to the OpenClaw agent list — that path was the
  // source of race conditions, flicker, and agents disappearing after add/delete.
  const fetchAgents = useCallback(async () => {
    try {
      const res = (await bridgeInvoke("list-agent-identities", {})) as {
        success?: boolean;
        data?: HyperclawAgent[];
      };
      if (res?.success && Array.isArray(res.data)) {
        setAgents(res.data);
      }
      // On !success or bad shape: keep existing state.
    } catch {
      // On bridge error: keep existing state — don't wipe the list.
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Refresh whenever agent data changes (add / delete / file sync).
  useEffect(() => {
    const handler = () => fetchAgents();
    window.addEventListener("agent.file.changed", handler);
    window.addEventListener("agent.hired", handler);
    window.addEventListener("agent.deleted", handler);
    return () => {
      window.removeEventListener("agent.file.changed", handler);
      window.removeEventListener("agent.hired", handler);
      window.removeEventListener("agent.deleted", handler);
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
