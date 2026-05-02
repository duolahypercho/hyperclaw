import * as React from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { ProjectLeadHeartbeatResult } from "./project-automation";

const HEARTBEAT_INTERVAL_MS = 60_000;

interface UseProjectLeadHeartbeatOptions {
  projectId: string;
  enabled: boolean;
  onAfterHeartbeat?: () => void | Promise<void>;
}

export function useProjectLeadHeartbeat({
  projectId,
  enabled,
  onAfterHeartbeat,
}: UseProjectLeadHeartbeatOptions) {
  const [running, setRunning] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<ProjectLeadHeartbeatResult | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const inFlightRef = React.useRef(false);
  const mountedRef = React.useRef(false);
  const afterRef = React.useRef(onAfterHeartbeat);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    afterRef.current = onAfterHeartbeat;
  }, [onAfterHeartbeat]);

  const runHeartbeat = React.useCallback(async () => {
    if (!enabled || !projectId || inFlightRef.current) return;
    inFlightRef.current = true;
    setRunning(true);
    setLastError(null);
    try {
      const result = await bridgeInvoke("project-lead-heartbeat", {
        projectId,
        maxIssues: 5,
      }) as ProjectLeadHeartbeatResult;
      if (!mountedRef.current) return;
      setLastResult(result);
      try {
        await afterRef.current?.();
      } catch (refreshError) {
        console.warn("[project-heartbeat] refresh after heartbeat failed", refreshError);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setLastError(error instanceof Error ? error.message : "Project heartbeat failed.");
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setRunning(false);
    }
  }, [enabled, projectId]);

  React.useEffect(() => {
    if (!enabled || !projectId) return;
    const initial = window.setTimeout(() => void runHeartbeat(), 2_000);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void runHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [enabled, projectId, runHeartbeat]);

  return {
    running,
    lastResult,
    lastError,
    runHeartbeat,
  };
}
