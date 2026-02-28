"use client";

import { createContext, useContext, type ReactNode, useMemo } from "react";
import { useOpenClaw } from "$/hooks/useOpenClaw";

type OpenClawContextValue = ReturnType<typeof useOpenClaw>;

const OpenClawContext = createContext<OpenClawContextValue | null>(null);

/** Auto-refresh interval in ms (30s). Single global instance so OpenClaw loads on app init. */
const OPENCLAW_AUTO_REFRESH_MS = 30000;

export function OpenClawProvider({ children }: { children: ReactNode }) {
  const openClaw = useOpenClaw(OPENCLAW_AUTO_REFRESH_MS);
  const value = useMemo(
    () => openClaw,
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
      openClaw.logs,
      openClaw.errors,
      openClaw.refreshAll,
      openClaw.fetchStatus,
      openClaw.fetchGatewayHealth,
      openClaw.fetchCronList,
      openClaw.fetchCronListJson,
      openClaw.fetchAgents,
      openClaw.fetchLogs,
      openClaw.runCommand,
      openClaw.sendMessage,
      openClaw.cronEnable,
      openClaw.cronDisable,
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
