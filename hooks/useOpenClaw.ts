import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { gatewayHttpToWs, probeGatewayWs } from "$/lib/openclaw-gateway-ws";
import type {
  OpenClawCommandResult,
  OpenClawInstallCheck,
  OpenClawAgent,
  OpenClawAgentListResult,
  OpenClawAPI,
  OpenClawCronJobJson,
  OpenClawGatewayHealthResult,
  OpenClawMessageSendParams,
  OpenClawMessageSendResult,
} from "$/types/electron";

interface OpenClawState {
  installed: boolean | null;
  version: string | null;
  status: string | null;
  gatewayHealthy: boolean | null;
  gatewayHealthError: string | null;
  cronJobs: string | null;
  cronJobsJson: OpenClawCronJobJson[] | null;
  agents: OpenClawAgent[];
  logs: string | null;
  loading: boolean;
  errors: Record<string, string | null>;
}

const initialState: OpenClawState = {
  installed: null,
  version: null,
  status: null,
  gatewayHealthy: null,
  gatewayHealthError: null,
  cronJobs: null,
  cronJobsJson: null,
  agents: [],
  logs: null,
  loading: true,
  errors: {},
};

async function apiFetch(action: string, args?: string) {
  const res = await fetch("/api/openclaw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  return res.json();
}

async function apiGatewayHealth(): Promise<OpenClawGatewayHealthResult> {
  const res = await apiFetch("gateway-health");
  return {
    healthy: res.healthy === true,
    error: res.error,
  };
}

async function apiMessageSend(params: OpenClawMessageSendParams): Promise<OpenClawMessageSendResult> {
  const res = await fetch("/api/openclaw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "message-send", params }),
  });
  return res.json();
}

const httpFallback: OpenClawAPI = {
  checkInstalled: () => apiFetch("check-installed"),
  getStatus: () => apiFetch("status"),
  getGatewayHealth: () => apiGatewayHealth(),
  sendMessage: (params) => apiMessageSend(params),
  getCronList: () => apiFetch("cron-list"),
  getCronListJson: () => apiFetch("cron-list-json"),
  getAgentList: () => apiFetch("agent-list"),
  runCommand: (args: string) => apiFetch("run-command", args),
  cronEnable: (id: string) => apiFetch("cron-enable", id),
  cronDisable: (id: string) => apiFetch("cron-disable", id),
};

function getApi(): OpenClawAPI {
  if (typeof window !== "undefined" && window.electronAPI?.openClaw) {
    return window.electronAPI.openClaw;
  }
  return httpFallback;
}

// Module-level single-flight: only one refresh across all useOpenClaw instances (prevents concurrent IPC burst)
let globalRefreshInProgress = false;
// Cooldown after a refresh completes: avoid starting another refresh immediately (second run was crashing renderer)
const REFRESH_COOLDOWN_MS = 8000;
let lastRefreshEndAt = 0;
// Cache install result so we skip checkInstalled() on subsequent refreshes (second checkInstalled was crashing renderer)
let cachedInstalled: boolean | null = null;

export function useOpenClaw(autoRefreshMs = 0) {
  const [state, setState] = useState<OpenClawState>(initialState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshInProgressRef = useRef(false);

  const setPartial = useCallback(
    (patch: Partial<OpenClawState>) =>
      setState((prev) => ({ ...prev, ...patch })),
    []
  );

  const checkInstalled = useCallback(async (): Promise<boolean> => {
    try {
      const api = getApi();
      const res: OpenClawInstallCheck = await api.checkInstalled();
      setPartial({ installed: res.installed, version: res.version });
      return res.installed ?? false;
    } catch (e) {
      console.warn("[useOpenClaw] checkInstalled failed:", e);
      setPartial({ installed: false, version: null });
      return false;
    }
  }, [setPartial]);

  const fetchStatus = useCallback(async () => {
    const api = getApi();
    const res: OpenClawCommandResult = await api.getStatus();
    if (res.success) {
      setPartial({ status: res.data ?? null, errors: { ...state.errors, status: null } });
    } else {
      setPartial({ errors: { ...state.errors, status: res.error ?? "Unknown error" } });
    }
  }, [setPartial, state.errors]);

  const fetchGatewayHealth = useCallback(async () => {
    const api = getApi();
    // In Electron: try renderer WebSocket first (ws://127.0.0.1:port), then fall back to CLI
    if (typeof window !== "undefined" && window.electronAPI?.openClaw?.getGatewayConnectUrl) {
      try {
        const { gatewayUrl } = await window.electronAPI.openClaw.getGatewayConnectUrl();
        const wsUrl = gatewayHttpToWs(gatewayUrl || "http://127.0.0.1:18789");
        const probe = await probeGatewayWs(wsUrl, 5000);
        if (probe.healthy) {
          setPartial({
            gatewayHealthy: true,
            gatewayHealthError: null,
            installed: true,
          });
          return;
        }
      } catch {
        /* fall through to CLI */
      }
    }
    if (!api.getGatewayHealth) {
      setPartial({ gatewayHealthy: null, gatewayHealthError: null });
      return;
    }
    try {
      const res = await api.getGatewayHealth();
      setPartial({
        gatewayHealthy: res.healthy,
        gatewayHealthError: res.healthy ? null : (res.error ?? "Unknown error"),
        ...(res.healthy ? { installed: true as boolean } : {}),
      });
    } catch (e) {
      setPartial({
        gatewayHealthy: false,
        gatewayHealthError: e instanceof Error ? e.message : "Health check failed",
      });
    }
  }, [setPartial]);

  const fetchCronList = useCallback(async () => {
    const api = getApi();
    const res: OpenClawCommandResult = await api.getCronList();
    if (res.success) {
      setPartial({ cronJobs: res.data ?? null, errors: { ...state.errors, cron: null } });
    } else {
      setPartial({ errors: { ...state.errors, cron: res.error ?? "Unknown error" } });
    }
  }, [setPartial, state.errors]);

  const fetchCronListJson = useCallback(async () => {
    const api = getApi();
    const res = await api.getCronListJson();
    if (res.success && res.data?.jobs) {
      setPartial({ cronJobsJson: res.data.jobs, errors: { ...state.errors, cron: null } });
    } else {
      setPartial({
        cronJobsJson: null,
        errors: { ...state.errors, cron: res.error ?? "Unknown error" },
      });
    }
  }, [setPartial, state.errors]);

  const cronEnable = useCallback(async (id: string) => {
    const api = getApi();
    return api.cronEnable(id);
  }, []);

  const cronDisable = useCallback(async (id: string) => {
    const api = getApi();
    return api.cronDisable(id);
  }, []);

  const fetchAgents = useCallback(async () => {
    const api = getApi();
    const res: OpenClawAgentListResult = await api.getAgentList();
    if (res.success && res.data) {
      setPartial({ agents: res.data, errors: { ...state.errors, agents: null } });
    } else {
      setPartial({ errors: { ...state.errors, agents: res.error ?? "Unknown error" } });
    }
  }, [setPartial, state.errors]);

  const runCommand = useCallback(async (args: string): Promise<OpenClawCommandResult> => {
    const api = getApi();
    return api.runCommand(args);
  }, []);

  const sendMessage = useCallback(
    async (params: OpenClawMessageSendParams): Promise<OpenClawMessageSendResult> => {
      const api = getApi();
      if (!api.sendMessage) {
        return { success: false, error: "Send message not available" };
      }
      return api.sendMessage(params);
    },
    []
  );

  const fetchLogs = useCallback(async () => {
    try {
      const json = await bridgeInvoke("get-logs", { lines: 500 });
      const err = (json as { error?: string })?.error;
      if (err) {
        setPartial({ logs: null, errors: { ...state.errors, logs: err } });
        return;
      }
      // API returns the log array directly: [{ time, level, message }, ...]
      let logText: string | null = null;
      if (Array.isArray(json)) {
        logText = json
          .map((e: { time?: string; level?: string; message?: string }) => {
            const t = e.time ?? "";
            const l = (e.level ?? "").toUpperCase();
            const m = e.message ?? "";
            return t ? `[${t}] ${l} ${m}` : `${l} ${m}`.trim();
          })
          .join("\n");
      } else if (typeof (json as { data?: string })?.data === "string") {
        logText = (json as { data: string }).data;
      }
      setPartial({ logs: logText, errors: { ...state.errors, logs: null } });
    } catch (e) {
      setPartial({ logs: null, errors: { ...state.errors, logs: (e as Error).message ?? "Failed to fetch logs" } });
    }
  }, [setPartial, state.errors]);

  const refreshAll = useCallback(async () => {
    if (refreshInProgressRef.current || globalRefreshInProgress) return;
    if (Date.now() - lastRefreshEndAt < REFRESH_COOLDOWN_MS) return;
    refreshInProgressRef.current = true;
    globalRefreshInProgress = true;
    setPartial({ loading: true });
    // #region agent log
    if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll", message: "refreshAll start", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    try {
      let isInstalled: boolean;
      if (cachedInstalled !== null) {
        isInstalled = cachedInstalled;
        // #region agent log
        if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after checkInstalled (cached)", message: "refreshAll after checkInstalled (cached)", data: { isInstalled }, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
        // #endregion
      } else {
        isInstalled = await checkInstalled();
        cachedInstalled = isInstalled;
        // #region agent log
        if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after checkInstalled", message: "refreshAll after checkInstalled", data: { isInstalled }, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
        // #endregion
      }
      // Run gateway health first (isolate crash: WebSocket probe vs other IPC)
      await fetchGatewayHealth();
      // #region agent log
      if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after fetchGatewayHealth", message: "refreshAll after fetchGatewayHealth", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      if (isInstalled) {
        await fetchStatus();
        if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after fetchStatus", message: "after fetchStatus", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
        await fetchCronList();
        if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after fetchCronList", message: "after fetchCronList", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
        await fetchCronListJson();
        if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after fetchCronListJson", message: "after fetchCronListJson", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
        await fetchAgents();
        if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after fetchAgents", message: "after fetchAgents", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
      } else {
        await fetchStatus();
      }
      // #region agent log
      if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll after Promise.all", message: "refreshAll after Promise.all", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
      // #endregion
    } catch (err) {
      // #region agent log
      if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll catch", message: "refreshAll catch", data: { err: String(err) }, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      // Prevent unhandled rejection from crashing the renderer (e.g. IPC disconnect in Electron)
      console.warn("[useOpenClaw] refreshAll failed:", err);
      setPartial({ installed: false, loading: false });
      return;
    } finally {
      lastRefreshEndAt = Date.now();
      refreshInProgressRef.current = false;
      globalRefreshInProgress = false;
      // #region agent log
      if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "useOpenClaw.ts:refreshAll finally", message: "refreshAll end", data: {}, hypothesisId: "H1", timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      setPartial({ loading: false });
    }
  }, [checkInstalled, fetchStatus, fetchGatewayHealth, fetchCronList, fetchCronListJson, fetchAgents, setPartial]);

  useEffect(() => {
    refreshAll().catch((err) => {
      console.warn("[useOpenClaw] initial refresh failed:", err);
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoRefreshMs > 0 && state.installed) {
      intervalRef.current = setInterval(() => {
        refreshAll().catch((err) => console.warn("[useOpenClaw] interval refresh failed:", err));
      }, autoRefreshMs);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [autoRefreshMs, state.installed, refreshAll]);

  return {
    ...state,
    refreshAll,
    fetchStatus,
    fetchGatewayHealth,
    fetchCronList,
    fetchCronListJson,
    fetchAgents,
    fetchLogs,
    runCommand,
    sendMessage,
    cronEnable,
    cronDisable,
  };
}
