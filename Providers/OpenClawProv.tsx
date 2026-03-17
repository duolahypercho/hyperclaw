"use client";

import { createContext, useContext, type ReactNode, useRef, useMemo, useState, useEffect, useCallback } from "react";
import { useOpenClaw } from "$/hooks/useOpenClaw";
import { dashboardState } from "$/lib/dashboard-state";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { subscribeGatewayConnection, getGatewayConnectionState } from "$/lib/openclaw-gateway-ws";

/* ── Saved-layout type (shared with LayoutSwitcher) ─── */

export interface SavedLayout {
  id: string;
  name: string;
  createdAt: number;
  layout: string;
  visibleWidgets: string[];
  widgetConfigs: string;
  /** Serialised JSON array of dynamically-added widget instances (e.g. extra chat widgets) */
  widgetInstances?: string;
}

/* ── Context value ──────────────────────────────────── */

type OpenClawContextValue = ReturnType<typeof useOpenClaw> & {
  /** true once dashboard state is hydrated AND saved layouts are fetched */
  dashboardReady: boolean;
  /** User-saved layouts (excludes the implicit "Default") */
  savedLayouts: SavedLayout[];
  setSavedLayouts: React.Dispatch<React.SetStateAction<SavedLayout[]>>;
};

const OpenClawContext = createContext<OpenClawContextValue | null>(null);

/** Auto-refresh interval in ms (30s). Single global instance so OpenClaw loads on app init. */
const OPENCLAW_AUTO_REFRESH_MS = 30000;

export function OpenClawProvider({ children }: { children: ReactNode }) {
  const openClaw = useOpenClaw(OPENCLAW_AUTO_REFRESH_MS);

  // Keep function refs stable — they don't need to trigger re-renders of consumers
  const fnsRef = useRef(openClaw);
  fnsRef.current = openClaw;

  /* ── Dashboard state hydration + layout fetch ────── */

  const [dashboardReady, setDashboardReady] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);

  // Fetch saved layouts helper — reused for initial load + retry
  const fetchSavedLayouts = useCallback(async (): Promise<SavedLayout[] | null> => {
    try {
      const res = (await bridgeInvoke("get-layouts", {})) as {
        success?: boolean;
        data?: SavedLayout[];
      };
      if (res?.success && Array.isArray(res.data)) {
        return res.data;
      }
    } catch {}
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Hydrate dashboard in-memory cache from SQLite
      await dashboardState.hydrate();

      // 2. Fetch saved layouts from backend
      const layouts = await fetchSavedLayouts();
      if (!cancelled && layouts) {
        setSavedLayouts(layouts);
      }

      if (!cancelled) setDashboardReady(true);
    })();

    return () => { cancelled = true; };
  }, [fetchSavedLayouts]);

  // Retry layout fetch + dashboard state hydration when gateway connects —
  // the initial fetch may have failed because the hub/connector wasn't reachable during cold start.
  useEffect(() => {
    let retried = false;
    const unsub = subscribeGatewayConnection(() => {
      if (retried) return;
      const { connected } = getGatewayConnectionState();
      if (!connected) return;
      retried = true;

      // Retry saved layouts
      fetchSavedLayouts().then((layouts) => {
        if (layouts && layouts.length > 0) {
          setSavedLayouts(layouts);
        }
      });

      // If initial hydration got no data, retry now that the gateway is connected
      if (!dashboardState.isHydratedWithData()) {
        console.log("[OpenClawProv] re-hydrating dashboard state after gateway connect");
        dashboardState.rehydrate().then((gotData) => {
          if (gotData) {
            // Notify dashboard to re-read from cache
            window.dispatchEvent(new CustomEvent("dashboard-state-rehydrated"));
          }
        });
      }
    });
    return () => unsub();
  }, [fetchSavedLayouts]);

  // Only re-create context value when data fields actually change
  const value = useMemo<OpenClawContextValue>(
    () => ({
      installed: openClaw.installed,
      loading: openClaw.loading,
      version: openClaw.version,
      status: openClaw.status,
      gatewayHealthy: openClaw.gatewayHealthy,
      gatewayHealthError: openClaw.gatewayHealthError,
      cronJobs: openClaw.cronJobs,
      cronJobsJson: openClaw.cronJobsJson,
      agents: openClaw.agents,
      models: openClaw.models,
      logs: openClaw.logs,
      errors: openClaw.errors,
      // Stable function references via ref — these never change identity
      refreshAll: (...args: Parameters<typeof openClaw.refreshAll>) => fnsRef.current.refreshAll(...args),
      fetchStatus: (...args: Parameters<typeof openClaw.fetchStatus>) => fnsRef.current.fetchStatus(...args),
      fetchGatewayHealth: (...args: Parameters<typeof openClaw.fetchGatewayHealth>) => fnsRef.current.fetchGatewayHealth(...args),
      fetchCronList: (...args: Parameters<typeof openClaw.fetchCronList>) => fnsRef.current.fetchCronList(...args),
      fetchCronListJson: (...args: Parameters<typeof openClaw.fetchCronListJson>) => fnsRef.current.fetchCronListJson(...args),
      fetchAgents: (...args: Parameters<typeof openClaw.fetchAgents>) => fnsRef.current.fetchAgents(...args),
      fetchModels: (...args: Parameters<typeof openClaw.fetchModels>) => fnsRef.current.fetchModels(...args),
      fetchLogs: (...args: Parameters<typeof openClaw.fetchLogs>) => fnsRef.current.fetchLogs(...args),
      runCommand: (...args: Parameters<typeof openClaw.runCommand>) => fnsRef.current.runCommand(...args),
      sendMessage: (...args: Parameters<typeof openClaw.sendMessage>) => fnsRef.current.sendMessage(...args),
      cronEnable: (...args: Parameters<typeof openClaw.cronEnable>) => fnsRef.current.cronEnable(...args),
      cronDisable: (...args: Parameters<typeof openClaw.cronDisable>) => fnsRef.current.cronDisable(...args),
      // Dashboard state
      dashboardReady,
      savedLayouts,
      setSavedLayouts,
    }),
    [
      openClaw.installed,
      openClaw.loading,
      openClaw.version,
      openClaw.status,
      openClaw.gatewayHealthy,
      openClaw.gatewayHealthError,
      openClaw.cronJobs,
      openClaw.cronJobsJson,
      openClaw.agents,
      openClaw.models,
      openClaw.logs,
      openClaw.errors,
      dashboardReady,
      savedLayouts,
    ]
  );
  return (
    <OpenClawContext.Provider value={value}>
      {children}
    </OpenClawContext.Provider>
  );
}

export function useOpenClawContext(): OpenClawContextValue {
  const ctx = useContext(OpenClawContext);
  if (!ctx) {
    throw new Error("useOpenClawContext must be used within OpenClawProvider");
  }
  return ctx;
}
