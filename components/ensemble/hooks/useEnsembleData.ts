"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { loadUsageWs, type UsageCostPayload } from "$/lib/openclaw-gateway-ws";
import { parseCronJobs, type CronJobParsed } from "$/components/Tool/Crons/utils";
export type { CronJobParsed };

const POLL_INTERVAL_MS = 30_000;

/** Format a Date as YYYY-MM-DD in local timezone (not UTC). */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface InboxItem {
  id: number;
  agent_id: string;
  kind: "approval" | "question" | "error" | "info";
  title: string;
  body?: string;
  status: "pending" | "approved" | "rejected" | "dismissed";
  created_at: number;
}

export interface LogEntry {
  ts?: number;
  time?: string;
  level?: string;
  agent_id?: string;
  message?: string;
  [k: string]: unknown;
}

export interface AgentActivitySnapshot {
  agent_id: string;
  /**
   * Base state from the polled bridge activity. Live "working" is overlaid
   * per-render via `useAgentStatus` from the gateway streaming signal, not
   * from this snapshot.
   */
  state?: "running" | "idle" | "working" | "error";
  sessions?: number;
  cost_month?: number;
  tokens_month?: number;
  last_activity?: number;
}

export interface EnsembleData {
  inboxItems: InboxItem[];
  crons: CronJobParsed[];
  logs: LogEntry[];
  activity: Map<string, AgentActivitySnapshot>;
  totalSpendToday: number;
  /** Tokens used today (from usage.cost daily entry). */
  tokensToday: number;
  /** Sessions with activity today (lastActivity >= today midnight). */
  sessionsToday: number;
  /** Cumulative $ spend by hour for today (oldest→newest). Falls back to last ≤8 daily totals when session data is unavailable. */
  dailySpend: number[];
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  lastSyncedAt: number | null;
  refresh: () => void;
  resolveInboxItem: (id: number, resolution: "approved" | "rejected" | "dismissed") => Promise<void>;
}

const EMPTY_USAGE: { usageCost: UsageCostPayload; sessionsUsage: null } = {
  usageCost: {},
  sessionsUsage: null,
};

export function useEnsembleData(): EnsembleData {
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [crons, setCrons] = useState<CronJobParsed[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activity, setActivity] = useState<Map<string, AgentActivitySnapshot>>(new Map());
  const [totalSpendToday, setTotalSpendToday] = useState(0);
  const [tokensToday, setTokensToday] = useState(0);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [dailySpend, setDailySpend] = useState<number[]>([]);
  const [status, setStatus] = useState<EnsembleData["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (isBackground = false) => {
    if (!isBackground) setStatus("loading");
    setError(null);

    const safeCall = async <T,>(action: string, args: Record<string, unknown>, fallback: T): Promise<T> => {
      try {
        const res = await bridgeInvoke(action, args);
        return (res as T) ?? fallback;
      } catch {
        return fallback;
      }
    };

    try {
      const now = new Date();
      const todayStr = toLocalDateStr(now);
      const monthStartStr = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));

      const [inboxRes, cronsRes, logsRes, monthUsage] = await Promise.all([
        safeCall<{ items?: InboxItem[] }>("inbox-list", { status: "pending", limit: 20 }, {}),
        safeCall<unknown>("get-crons", {}, {}),
        safeCall<LogEntry[] | { data?: LogEntry[] }>("get-logs", { lines: 50 }, []),
        // Month-to-date: per-agent stats + sparkline + today's cost from daily[].
        loadUsageWs({ startDate: monthStartStr, endDate: todayStr, limit: 2000 }).catch(() => EMPTY_USAGE),
      ]);

      // ── inbox ────────────────────────────────────────────────────────────
      setInboxItems(inboxRes.items || []);

      // ── crons ────────────────────────────────────────────────────────────
      const cronsText =
        typeof cronsRes === "string"
          ? cronsRes
          : ((cronsRes as { data?: string })?.data || "");
      setCrons(parseCronJobs(cronsText));

      // ── logs ─────────────────────────────────────────────────────────────
      const logsData = Array.isArray(logsRes)
        ? logsRes
        : ((logsRes as { data?: LogEntry[] })?.data || []);
      setLogs(logsData as LogEntry[]);

      // ── per-agent activity (month) ────────────────────────────────────────
      const { sessionsUsage } = monthUsage;
      const activityMap = new Map<string, AgentActivitySnapshot>();

      if (sessionsUsage?.aggregates?.byAgent) {
        const sessionCountByAgent = new Map<string, number>();
        const lastActivityByAgent = new Map<string, number>();

        for (const s of sessionsUsage.sessions ?? []) {
          if (!s.agentId) continue;
          sessionCountByAgent.set(s.agentId, (sessionCountByAgent.get(s.agentId) ?? 0) + 1);
          const la = s.usage?.lastActivity;
          if (la && la > (lastActivityByAgent.get(s.agentId) ?? 0)) {
            lastActivityByAgent.set(s.agentId, la);
          }
        }

        for (const { agentId, totals } of sessionsUsage.aggregates.byAgent) {
          activityMap.set(agentId, {
            agent_id: agentId,
            cost_month: totals.totalCost ?? 0,
            tokens_month: totals.totalTokens ?? 0,
            sessions: sessionCountByAgent.get(agentId) ?? 0,
            last_activity: lastActivityByAgent.get(agentId),
          });
        }
      }

      setActivity(activityMap);

      // ── today's spend + sparkline ─────────────────────────────────────────
      // usage.cost daily[] is keyed by local date — use toLocalDateStr() to match.
      // This is the same source the OpenClaw usage tab reads, so it reflects
      // cost log entries for today regardless of when each session started.
      const sortedDaily = (monthUsage.usageCost?.daily ?? [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));

      const todayEntry = sortedDaily.find((d) => d.date === todayStr);
      setTotalSpendToday(todayEntry?.totalCost ?? 0);
      setTokensToday(todayEntry?.totalTokens ?? 0);

      // ── cumulative intraday spend series ─────────────────────────────────
      // x = hours of today (0 … currentHour), y = running $ total at each hour.
      // This always climbs and shows exactly when spend is happening today.
      const todayMidnightMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todaySessions = (monthUsage.sessionsUsage?.sessions ?? []).filter(
        (s) => (s.usage?.lastActivity ?? 0) >= todayMidnightMs
      );
      setSessionsToday(todaySessions.length);

      if (todaySessions.length >= 1) {
        // Bucket each session's cost into the hour of its last activity.
        const hourlyCosts = new Array(24).fill(0) as number[];
        for (const s of todaySessions) {
          if (!s.usage?.lastActivity) continue;
          const hour = new Date(s.usage.lastActivity).getHours();
          hourlyCosts[hour] += s.usage.totalCost ?? 0;
        }
        // Build running cumulative up to the current hour.
        const currentHour = now.getHours();
        let cumSum = 0;
        const series: number[] = [];
        for (let h = 0; h <= currentHour; h++) {
          cumSum += hourlyCosts[h];
          series.push(cumSum);
        }
        // Ensure at least 2 points so the sparkline can draw a line.
        setDailySpend(series.length >= 2 ? series : [0, ...series]);
      } else {
        // No session data — fall back to last 8 days of daily totals.
        setDailySpend(sortedDaily.slice(-8).map((d) => d.totalCost));
      }

      setStatus("success");
      setLastSyncedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch data";
      setError(message);
      if (!isBackground) setStatus("error");
    }
  }, []);

  const refresh = useCallback(() => fetchAll(false), [fetchAll]);

  const resolveInboxItem = useCallback(
    async (id: number, resolution: "approved" | "rejected" | "dismissed") => {
      try {
        await bridgeInvoke("inbox-resolve", { id, resolution });
      } catch {
        // Swallow — optimistic local update still applies.
      }
      setInboxItems((prev) => prev.filter((item) => item.id !== id));
    },
    []
  );

  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  useEffect(() => {
    intervalRef.current = setInterval(() => fetchAll(true), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  useEffect(() => {
    const handleFocus = () => fetchAll(true);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchAll]);

  return {
    inboxItems,
    crons,
    logs,
    activity,
    totalSpendToday,
    tokensToday,
    sessionsToday,
    dailySpend,
    status,
    error,
    lastSyncedAt,
    refresh,
    resolveInboxItem,
  };
}
