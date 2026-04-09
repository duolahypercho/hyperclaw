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

async function fetchHermesProfiles(): Promise<HyperclawAgent[]> {
  try {
    const res = (await bridgeInvoke("list-hermes-profiles", {})) as {
      success?: boolean;
      data?: { profiles?: Array<{ id: string; name: string; status?: string; lastActive?: string }> };
    };
    if (!res?.success || !res.data?.profiles) return [];
    return res.data.profiles.map((p) => ({
      id: `hermes:${p.id}`,
      name: p.name,
      runtime: "hermes",
      status: p.status ?? "idle",
      lastActive: p.lastActive,
    }));
  } catch {
    return [];
  }
}

function HyperclawInner({ children }: { children: ReactNode }) {
  const openClaw = useOpenClawContext();
  const [sqliteAgents, setSqliteAgents] = useState<HyperclawAgent[]>([]);
  const [hermesProfiles, setHermesProfiles] = useState<HyperclawAgent[]>([]);
  const fnsRef = useRef(openClaw);
  fnsRef.current = openClaw;

  const fetchSeqRef = useRef(0);
  const hermesSeqRef = useRef(0);

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

  const refreshHermesProfiles = useCallback(async () => {
    const seq = ++hermesSeqRef.current;
    const profiles = await fetchHermesProfiles();
    if (seq !== hermesSeqRef.current) return;
    setHermesProfiles(profiles);
  }, []);

  // Initial load
  useEffect(() => {
    fetchSQLiteAgents();
    refreshHermesProfiles();
  }, [fetchSQLiteAgents, refreshHermesProfiles]);

  // Live refresh when agent data changes.
  // agent.file.changed — IDENTITY.md sync
  // agent.hired        — new agent confirmed by connector; refresh before StatusWidget runs
  // agent.deleted      — removed agent; refresh so StatusWidget doesn't re-add it
  useEffect(() => {
    const handler = () => { fetchSQLiteAgents(); refreshHermesProfiles(); };
    window.addEventListener("agent.file.changed", handler);
    window.addEventListener("agent.hired", handler);
    window.addEventListener("agent.deleted", handler);
    return () => {
      window.removeEventListener("agent.file.changed", handler);
      window.removeEventListener("agent.hired", handler);
      window.removeEventListener("agent.deleted", handler);
    };
  }, [fetchSQLiteAgents, refreshHermesProfiles]);

  // OpenClaw agents are always sourced from the OpenClaw registry — never from
  // SQLite — so an OpenClaw agent named "Hermes" is never conflated with the
  // actual Hermes runtime agent that also lives in SQLite.
  const agents = useMemo<HyperclawAgent[]>(() => {
    const ocAgents: HyperclawAgent[] = openClaw.agents.map((a) => ({
      id: a.id,
      name: a.name,
      runtime: "openclaw",
      status: a.status,
      role: a.role,
      lastActive: a.lastActive,
    }));

    const ocIds = new Set(ocAgents.map((a) => a.id));

    // Hermes filesystem profiles: deduplicate against OpenClaw and against
    // bare-id collision (e.g. an OpenClaw agent whose id is "hermes").
    const uniqueHermes = hermesProfiles.filter((h) => {
      if (ocIds.has(h.id)) return false;
      if (h.id.startsWith("hermes:") && ocIds.has(h.id.slice("hermes:".length))) return false;
      return true;
    });

    const mergedIds = new Set([...ocIds, ...uniqueHermes.map((h) => h.id)]);

    // Add only non-openclaw agents from SQLite (claude-code, codex, hermes that
    // were created via setup-agent). Skip any hermes entry already covered by
    // the filesystem scan above.
    const nonOcSqlite = sqliteAgents.filter(
      (a) => a.runtime !== "openclaw" && !mergedIds.has(a.id)
    );

    return [...ocAgents, ...uniqueHermes, ...nonOcSqlite];
  }, [sqliteAgents, hermesProfiles, openClaw.agents]);

  const value = useMemo<HyperclawContextValue>(
    () => ({
      ...openClaw,
      agents,
      // Override refreshAll so it also re-fetches Hyperclaw agents
      refreshAll: async () => {
        await fnsRef.current.refreshAll();
        await Promise.all([fetchSQLiteAgents(), refreshHermesProfiles()]);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openClaw, agents, fetchSQLiteAgents, refreshHermesProfiles]
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
