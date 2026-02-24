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

export function useOpenClaw(autoRefreshMs = 0) {
  const [state, setState] = useState<OpenClawState>(initialState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setPartial = useCallback(
    (patch: Partial<OpenClawState>) =>
      setState((prev) => ({ ...prev, ...patch })),
    []
  );

  const checkInstalled = useCallback(async () => {
    const api = getApi();
    const res: OpenClawInstallCheck = await api.checkInstalled();
    setPartial({ installed: res.installed, version: res.version });
    return res.installed;
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
    setPartial({ loading: true });
    const isInstalled = await checkInstalled();
    // Always run gateway health so we can show "installed" when gateway is reachable even if CLI check failed (e.g. PATH)
    await Promise.all([
      fetchGatewayHealth(),
      ...(isInstalled
        ? [fetchStatus(), fetchCronList(), fetchCronListJson(), fetchAgents()]
        : [fetchStatus()]),
    ]);
    setPartial({ loading: false });
  }, [checkInstalled, fetchStatus, fetchGatewayHealth, fetchCronList, fetchCronListJson, fetchAgents, setPartial]);

  useEffect(() => {
    refreshAll();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoRefreshMs > 0 && state.installed) {
      intervalRef.current = setInterval(refreshAll, autoRefreshMs);
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
