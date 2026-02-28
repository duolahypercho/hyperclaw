import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  getRunningJobIds,
  removeRunningJobIds,
  getRunningJobStartedAt,
} from "$/lib/crons-running-store";
import {
  buildGatewayWsUrl,
  connectGatewayWs,
  getGatewayConnectionState,
  subscribeGatewayConnection,
} from "$/lib/openclaw-gateway-ws";
import type {
  OpenClawCommandResult,
  OpenClawInstallCheck,
  OpenClawRegistryAgent,
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
  agents: OpenClawRegistryAgent[];
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
    // In Electron: use persistent gateway WebSocket (stays open, no repeated pings)
    if (typeof window !== "undefined" && window.electronAPI?.openClaw?.getGatewayConnectUrl) {
      try {
        const { gatewayUrl, token } = await window.electronAPI.openClaw.getGatewayConnectUrl();
        const wsUrl = buildGatewayWsUrl(gatewayUrl || "http://127.0.0.1:18789", token);
        connectGatewayWs(wsUrl, { token });
        const { connected, error } = getGatewayConnectionState();
        setPartial({
          gatewayHealthy: connected,
          gatewayHealthError: connected ? null : (error ?? "Not connected"),
          ...(connected ? { installed: true as boolean } : {}),
        });
        return;
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
    // Backend normalizes to data.jobs; accept array or data.jobs for resilience
    const jobs =
      res.success && res.data
        ? (Array.isArray(res.data) ? res.data : res.data.jobs)
        : null;
    if (jobs && Array.isArray(jobs)) {
      setPartial({ cronJobsJson: jobs, errors: { ...state.errors, cron: null } });
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
    // Use same source as Agents page: list-agents (openclaw agents list / openclaw.json)
    try {
      const res = (await bridgeInvoke("list-agents", {})) as {
        success?: boolean;
        data?: OpenClawRegistryAgent[];
      };
      if (res?.success && Array.isArray(res.data)) {
        setPartial({ agents: res.data, errors: { ...state.errors, agents: null } });
        return;
      }
    } catch {
      /* fall through to getAgentList fallback */
    }
    // Fallback: workspace subdirs (different source, map to registry shape)
    const api = getApi();
    const res = await api.getAgentList();
    if (res.success && res.data) {
      const mapped: OpenClawRegistryAgent[] = res.data.map((a) => ({
        id: a.name,
        name: a.name,
        status: "idle",
      }));
      setPartial({ agents: mapped, errors: { ...state.errors, agents: null } });
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
    const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Failed");

    try {
      // 1) Load cron data first (file-based, fast) and show list immediately
      const api = getApi();
      const [cronListRes, cronJsonRes] = await Promise.all([
        api.getCronList().catch((e) => ({ success: false as const, error: errMsg(e) })),
        api.getCronListJson().catch((e) => ({ success: false as const, error: errMsg(e), data: undefined })),
      ]);
      if (cronListRes.success && cronListRes.data != null) {
        setPartial({ cronJobs: cronListRes.data, errors: { ...state.errors, cron: null } });
      } else if (!cronListRes.success) {
        setPartial({ errors: { ...state.errors, cron: cronListRes.error ?? "Unknown error" } });
      }
      const jobs =
        cronJsonRes.success && cronJsonRes.data
          ? (Array.isArray(cronJsonRes.data) ? cronJsonRes.data : cronJsonRes.data.jobs)
          : null;
      if (jobs && Array.isArray(jobs)) {
        setPartial({ cronJobsJson: jobs, errors: { ...state.errors, cron: null } });
      } else if (!cronJsonRes.success) {
        setPartial({ cronJobsJson: null, errors: { ...state.errors, cron: cronJsonRes.error ?? "Unknown error" } });
      }
      setPartial({ loading: false });
      lastRefreshEndAt = Date.now();
      refreshInProgressRef.current = false;
      globalRefreshInProgress = false;

      // 2) Run install check, gateway, status, agents in background (don't block UI)
      let isInstalled: boolean;
      if (cachedInstalled !== null) {
        isInstalled = cachedInstalled;
      } else {
        try {
          isInstalled = await checkInstalled();
          cachedInstalled = isInstalled;
        } catch {
          isInstalled = false;
          cachedInstalled = false;
          setPartial({ installed: false });
          return;
        }
      }
      setPartial({ installed: isInstalled });
      await fetchGatewayHealth();
      if (isInstalled) {
        const [statusSettled, agentsSettled] = await Promise.allSettled([fetchStatus(), fetchAgents()]);
        if (statusSettled.status === "rejected") {
          console.warn("[useOpenClaw] fetchStatus failed:", statusSettled.reason);
          setState((prev) => ({ ...prev, errors: { ...prev.errors, status: errMsg(statusSettled.reason) } }));
        }
        if (agentsSettled.status === "rejected") {
          console.warn("[useOpenClaw] fetchAgents failed:", agentsSettled.reason);
          setState((prev) => ({ ...prev, errors: { ...prev.errors, agents: errMsg(agentsSettled.reason) } }));
        }
      } else {
        try {
          await fetchStatus();
        } catch (e) {
          setState((prev) => ({ ...prev, errors: { ...prev.errors, status: e instanceof Error ? e.message : "Failed" } }));
        }
      }
    } catch (err) {
      console.warn("[useOpenClaw] refreshAll failed:", err);
      setPartial({ installed: false, loading: false });
    } finally {
      lastRefreshEndAt = Date.now();
      refreshInProgressRef.current = false;
      globalRefreshInProgress = false;
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [checkInstalled, fetchStatus, fetchGatewayHealth, fetchCronList, fetchCronListJson, fetchAgents, setPartial, state.errors]);

  useEffect(() => {
    refreshAll().catch((err) => {
      console.warn("[useOpenClaw] initial refresh failed:", err);
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Sync UI with persistent gateway WebSocket state (Electron: one connection, no repeated pings)
  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI?.openClaw?.getGatewayConnectUrl) return;
    const unsub = subscribeGatewayConnection(() => {
      const { connected, error } = getGatewayConnectionState();
      setPartial({
        gatewayHealthy: connected,
        gatewayHealthError: connected ? null : (error ?? "Not connected"),
      });
    });
    return unsub;
  }, [setPartial]);

  // Cron running poll: match latest run by runAtMs close to our "Run now" time; remove when that run is finished.
  useEffect(() => {
    const CRON_POLL_MS = 2000;
    const DEBUG = typeof window !== "undefined" && (window as unknown as { __CRON_POLL_DEBUG?: boolean }).__CRON_POLL_DEBUG !== false;
    const debugLog = (...args: unknown[]) => DEBUG && console.log("[cron-poll]", ...args);
    // Run is "ours" if runAtMs is within this window of when we clicked Run now (clock skew + delay)
    const WINDOW_BEFORE_MS = 10_000;   // 10s before (clock skew)
    const WINDOW_AFTER_MS = 300_000;   // 5 min after (run can start a bit later)
    const RECENT_MS = 120_000;         // if no startedAt (legacy): treat run as ours if within 2 min

    const checkRunningCrons = async () => {
      const currentIds = getRunningJobIds();
      if (currentIds.length === 0) return;
      for (const jobId of currentIds) {
        try {
          const startedAt = getRunningJobStartedAt(jobId);
          const result = (await bridgeInvoke("get-cron-runs-for-job", {
            jobId,
            limit: 10,
            offset: 0,
          })) as { runs?: { action?: string; runAtMs?: number }[] };
          const runs = Array.isArray(result?.runs) ? result.runs : [];
          const latest = runs[0];

          if (!latest) continue;

          const runAtMs = latest.runAtMs ?? 0;
          const isOurs = startedAt != null
            ? runAtMs >= startedAt - WINDOW_BEFORE_MS && runAtMs <= startedAt + WINDOW_AFTER_MS
            : runAtMs >= Date.now() - RECENT_MS;

          if (isOurs && String(latest.action) === "finished") {
            debugLog("poll: job", jobId, "our run finished (runAtMs", runAtMs, "), removing");
            removeRunningJobIds([jobId]);
          }
        } catch (e) {
          if (DEBUG) console.warn("[cron-poll] error for job", jobId, e);
        }
      }
    };

    debugLog("start interval (time-based runAtMs)", CRON_POLL_MS, "ms. Disable: window.__CRON_POLL_DEBUG = false");
    const intervalId = setInterval(checkRunningCrons, CRON_POLL_MS);
    return () => clearInterval(intervalId);
  }, []);

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
