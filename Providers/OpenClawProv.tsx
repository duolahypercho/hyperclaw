"use client";

import { createContext, useContext, type ReactNode, useRef, useMemo } from "react";
import { useOpenClaw } from "$/hooks/useOpenClaw";

type OpenClawContextValue = ReturnType<typeof useOpenClaw>;

const OpenClawContext = createContext<OpenClawContextValue | null>(null);

/** Auto-refresh interval in ms (30s). Single global instance so OpenClaw loads on app init. */
const OPENCLAW_AUTO_REFRESH_MS = 30000;

export function OpenClawProvider({ children }: { children: ReactNode }) {
  const openClaw = useOpenClaw(OPENCLAW_AUTO_REFRESH_MS);

  // Keep function refs stable — they don't need to trigger re-renders of consumers
  const fnsRef = useRef(openClaw);
  fnsRef.current = openClaw;

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
      logs: openClaw.logs,
      errors: openClaw.errors,
      // Stable function references via ref — these never change identity
      refreshAll: (...args: Parameters<typeof openClaw.refreshAll>) => fnsRef.current.refreshAll(...args),
      fetchStatus: (...args: Parameters<typeof openClaw.fetchStatus>) => fnsRef.current.fetchStatus(...args),
      fetchGatewayHealth: (...args: Parameters<typeof openClaw.fetchGatewayHealth>) => fnsRef.current.fetchGatewayHealth(...args),
      fetchCronList: (...args: Parameters<typeof openClaw.fetchCronList>) => fnsRef.current.fetchCronList(...args),
      fetchCronListJson: (...args: Parameters<typeof openClaw.fetchCronListJson>) => fnsRef.current.fetchCronListJson(...args),
      fetchAgents: (...args: Parameters<typeof openClaw.fetchAgents>) => fnsRef.current.fetchAgents(...args),
      fetchLogs: (...args: Parameters<typeof openClaw.fetchLogs>) => fnsRef.current.fetchLogs(...args),
      runCommand: (...args: Parameters<typeof openClaw.runCommand>) => fnsRef.current.runCommand(...args),
      sendMessage: (...args: Parameters<typeof openClaw.sendMessage>) => fnsRef.current.sendMessage(...args),
      cronEnable: (...args: Parameters<typeof openClaw.cronEnable>) => fnsRef.current.cronEnable(...args),
      cronDisable: (...args: Parameters<typeof openClaw.cronDisable>) => fnsRef.current.cronDisable(...args),
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
      openClaw.logs,
      openClaw.errors,
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
