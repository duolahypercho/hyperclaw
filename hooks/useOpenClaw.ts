import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { hubCommand } from "$/lib/hub-direct";
import {
  getRunningJobIds,
  removeRunningJobIds,
  getRunningJobStartedAt,
} from "$/lib/crons-running-store";
import {
  connectGatewayWs,
  getGatewayConfig,
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

/**
 * Hub-based API: all operations route through hubCommand which
 * calls the Hub API directly from the browser (no serverless proxy).
 */
/**
 * Normalize a hub response into { success, data?, error? }.
 * hubCommand → unwrapHubResponse strips the hub envelope, so responses may be:
 *   - Raw data (array, object without "success") from bridge actions like get-crons, get-config
 *   - Bridge envelope { success: true, data: ... } from actions like list-agents
 *   - Error envelope { success: false, error: "..." }
 */
function wrapHubResult(res: unknown): { success: boolean; data?: unknown; error?: string } {
  if (res && typeof res === "object" && "success" in (res as Record<string, unknown>)) {
    const r = res as { success: boolean; data?: unknown; error?: string };
    return r;
  }
  if (res && typeof res === "object" && "error" in (res as Record<string, unknown>)) {
    return { success: false, error: (res as { error: string }).error };
  }
  // Raw data (array or plain object) — treat as success
  return { success: true, data: res };
}

const hubApi: OpenClawAPI = {
  checkInstalled: async () => {
    return { installed: true, version: "remote" };
  },
  getStatus: async () => {
    const res = await hubCommand({ action: "get-config" });
    const w = wrapHubResult(res);
    return {
      success: w.success,
      data: typeof w.data === "string" ? w.data : (w.data != null ? JSON.stringify(w.data) : undefined),
      error: w.error,
    };
  },
  getGatewayHealth: async () => {
    return { healthy: true, error: undefined };
  },
  sendMessage: async (params) => {
    const res = await hubCommand({ action: "send-command", command: params });
    const w = wrapHubResult(res);
    return { success: w.success, error: w.error };
  },
  getCronList: async () => {
    const res = await hubCommand({ action: "get-crons" });
    const w = wrapHubResult(res);
    // Text cron list not available via hub; return success with null data
    return { success: w.success, data: undefined, error: w.error };
  },
  getCronListJson: async () => {
    const res = await hubCommand({ action: "get-crons" });
    const w = wrapHubResult(res);
    return { success: w.success, data: w.data as { jobs: OpenClawCronJobJson[] } | undefined, error: w.error };
  },
  getAgentList: async () => {
    const res = await hubCommand({ action: "list-agents" });
    return wrapHubResult(res) as any;
  },
  runCommand: async (args: string) => {
    const res = await hubCommand({ action: "send-command", command: args });
    return wrapHubResult(res) as OpenClawCommandResult;
  },
  cronEnable: async (id: string) => {
    const res = await hubCommand({ action: "cron-edit", cronEditJobId: id, cronEditParams: { enabled: true } });
    return wrapHubResult(res) as OpenClawCommandResult;
  },
  cronDisable: async (id: string) => {
    const res = await hubCommand({ action: "cron-edit", cronEditJobId: id, cronEditParams: { enabled: false } });
    return wrapHubResult(res) as OpenClawCommandResult;
  },
};

function getApi(): OpenClawAPI {
  // Priority 1: Electron IPC
  if (typeof window !== "undefined" && window.electronAPI?.openClaw) {
    return window.electronAPI.openClaw;
  }
  // Priority 2: Hub direct
  return hubApi;
}

// Module-level single-flight: only one refresh across all useOpenClaw instances
let globalRefreshInProgress = false;
const REFRESH_COOLDOWN_MS = 8000;
let lastRefreshEndAt = 0;
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
      setState((prev) => ({ ...prev, status: res.data ?? null, errors: { ...prev.errors, status: null } }));
    } else {
      setState((prev) => ({ ...prev, errors: { ...prev.errors, status: res.error ?? "Unknown error" } }));
    }
  }, []);

  const fetchGatewayHealth = useCallback(async () => {
    const api = getApi();

    const connectAndWait = (wsUrl: string, options: Parameters<typeof connectGatewayWs>[1]) => {
      return new Promise<{ connected: boolean; error: string | null }>((resolve) => {
        const existing = getGatewayConnectionState();
        if (existing.connected) { resolve(existing); return; }
        connectGatewayWs(wsUrl, options);
        const immediate = getGatewayConnectionState();
        if (immediate.connected) { resolve(immediate); return; }
        const timeout = setTimeout(() => { unsub(); resolve(getGatewayConnectionState()); }, 8000);
        const unsub = subscribeGatewayConnection(() => {
          const state = getGatewayConnectionState();
          if (state.connected || state.error) {
            clearTimeout(timeout);
            unsub();
            resolve(state);
          }
        });
      });
    };

    const config = await getGatewayConfig();

    if (config.gatewayUrl && config.hubMode) {
      try {
        const { connected, error } = await connectAndWait(config.gatewayUrl, {
          token: config.token,
          hubMode: true,
          hubDeviceId: config.hubDeviceId,
        });
        setPartial({
          gatewayHealthy: connected,
          gatewayHealthError: connected ? null : (error ?? "Not connected"),
          ...(connected ? { installed: true as boolean } : {}),
        });
        return;
      } catch {
        /* fall through */
      }
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
      setState((prev) => ({ ...prev, cronJobs: res.data ?? null, errors: { ...prev.errors, cron: null } }));
    } else {
      setState((prev) => ({ ...prev, errors: { ...prev.errors, cron: res.error ?? "Unknown error" } }));
    }
  }, []);

  const fetchCronListJson = useCallback(async () => {
    const api = getApi();
    const res = await api.getCronListJson();
    const jobs =
      res.success && res.data
        ? (Array.isArray(res.data) ? res.data : res.data.jobs)
        : null;
    if (jobs && Array.isArray(jobs)) {
      setState((prev) => ({ ...prev, cronJobsJson: jobs, errors: { ...prev.errors, cron: null } }));
    } else {
      setState((prev) => ({
        ...prev,
        cronJobsJson: null,
        errors: { ...prev.errors, cron: res.error ?? "Unknown error" },
      }));
    }
  }, []);

  const cronEnable = useCallback(async (id: string) => {
    const api = getApi();
    return api.cronEnable(id);
  }, []);

  const cronDisable = useCallback(async (id: string) => {
    const api = getApi();
    return api.cronDisable(id);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = (await bridgeInvoke("list-agents", {})) as {
        success?: boolean;
        data?: OpenClawRegistryAgent[];
      };
      if (res?.success && Array.isArray(res.data)) {
        setState((prev) => ({ ...prev, agents: res.data!, errors: { ...prev.errors, agents: null } }));
        return;
      }
    } catch {
      /* fall through */
    }
    const api = getApi();
    const res = await api.getAgentList();
    if (res.success && res.data) {
      const mapped: OpenClawRegistryAgent[] = res.data.map((a) => ({
        id: a.name,
        name: a.name,
        status: "idle",
      }));
      setState((prev) => ({ ...prev, agents: mapped, errors: { ...prev.errors, agents: null } }));
    } else {
      setState((prev) => ({ ...prev, errors: { ...prev.errors, agents: res.error ?? "Unknown error" } }));
    }
  }, []);

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
        setState((prev) => ({ ...prev, logs: null, errors: { ...prev.errors, logs: err } }));
        return;
      }
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
      setState((prev) => ({ ...prev, logs: logText, errors: { ...prev.errors, logs: null } }));
    } catch (e) {
      setState((prev) => ({ ...prev, logs: null, errors: { ...prev.errors, logs: (e as Error).message ?? "Failed to fetch logs" } }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (refreshInProgressRef.current || globalRefreshInProgress) return;
    if (Date.now() - lastRefreshEndAt < REFRESH_COOLDOWN_MS) return;
    refreshInProgressRef.current = true;
    globalRefreshInProgress = true;
    setPartial({ loading: true });
    const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Failed");

    try {
      const api = getApi();
      const [cronListRes, cronJsonRes] = await Promise.all([
        api.getCronList().catch((e) => ({ success: false as const, error: errMsg(e) })),
        api.getCronListJson().catch((e) => ({ success: false as const, error: errMsg(e), data: undefined })),
      ]);

      setState((prev) => {
        const cronUpdates: Partial<OpenClawState> = {};

        if (cronListRes.success && cronListRes.data != null) {
          cronUpdates.cronJobs = cronListRes.data;
          cronUpdates.errors = { ...prev.errors, cron: null };
        } else if (!cronListRes.success) {
          cronUpdates.errors = { ...prev.errors, cron: cronListRes.error ?? "Unknown error" };
        }

        const jobs =
          cronJsonRes.success && cronJsonRes.data
            ? (Array.isArray(cronJsonRes.data) ? cronJsonRes.data : cronJsonRes.data.jobs)
            : null;
        if (jobs && Array.isArray(jobs)) {
          cronUpdates.cronJobsJson = jobs;
          cronUpdates.errors = { ...(cronUpdates.errors ?? prev.errors), cron: null };
        } else if (!cronJsonRes.success) {
          cronUpdates.cronJobsJson = null;
          cronUpdates.errors = { ...(cronUpdates.errors ?? prev.errors), cron: cronJsonRes.error ?? "Unknown error" };
        }

        cronUpdates.loading = false;

        return { ...prev, ...cronUpdates };
      });

      lastRefreshEndAt = Date.now();
      refreshInProgressRef.current = false;
      globalRefreshInProgress = false;

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
  }, [checkInstalled, fetchStatus, fetchGatewayHealth, fetchAgents, setPartial]);

  useEffect(() => {
    refreshAll().catch((err) => {
      console.warn("[useOpenClaw] initial refresh failed:", err);
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsub = subscribeGatewayConnection(() => {
      const { connected, error } = getGatewayConnectionState();
      setPartial({
        gatewayHealthy: connected,
        gatewayHealthError: connected ? null : (error ?? "Not connected"),
      });
    });
    return unsub;
  }, [setPartial]);

  useEffect(() => {
    const CRON_POLL_MS = 5_000;
    const DEBUG = typeof window !== "undefined" && (window as unknown as { __CRON_POLL_DEBUG?: boolean }).__CRON_POLL_DEBUG !== false;
    const debugLog = (...args: unknown[]) => DEBUG && console.log("[cron-poll]", ...args);
    const WINDOW_BEFORE_MS = 10_000;
    const WINDOW_AFTER_MS = 300_000;
    const RECENT_MS = 120_000;

    const checkRunningCrons = async () => {
      const currentIds = getRunningJobIds();
      if (currentIds.length === 0) return;

      const results = await Promise.allSettled(
        currentIds.map(jobId =>
          bridgeInvoke("get-cron-runs-for-job", {
            jobId,
            limit: 10,
            offset: 0,
          }).then(result => ({ jobId, result }))
        )
      );

      for (const settled of results) {
        if (settled.status !== "fulfilled") continue;

        const { jobId, result } = settled.value;
        try {
          const startedAt = getRunningJobStartedAt(jobId);
          const runs = Array.isArray((result as { runs?: unknown })?.runs) ? (result as { runs: { action?: string; runAtMs?: number }[] }).runs : [];
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

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!intervalId) intervalId = setInterval(checkRunningCrons, CRON_POLL_MS); };
    const stop = () => { if (intervalId) { clearInterval(intervalId); intervalId = null; } };
    const onVisibility = () => { document.visibilityState === "visible" ? start() : stop(); };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (autoRefreshMs > 0 && state.installed) {
      const startRefresh = () => {
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            refreshAll().catch((err) => console.warn("[useOpenClaw] interval refresh failed:", err));
          }, autoRefreshMs);
        }
      };
      const stopRefresh = () => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      };
      const onVisibility = () => { document.visibilityState === "visible" ? startRefresh() : stopRefresh(); };

      if (document.visibilityState === "visible") startRefresh();
      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        stopRefresh();
        document.removeEventListener("visibilitychange", onVisibility);
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
