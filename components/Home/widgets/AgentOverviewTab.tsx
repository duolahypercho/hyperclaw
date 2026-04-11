"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign,
  Hash,
  Layers,
  MessageSquare,
  Plus,
  Check,
  X,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { CronsProvider, useCrons } from "$/components/Tool/Crons/provider/cronsProvider";
import { getJobNextRunDate } from "$/components/Tool/Crons/utils";
import { formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────��──────────

export type OverviewSession = {
  key: string;
  label?: string;
  updatedAt?: number;
  status?: string;
  preview?: string;
};

interface AgentStats {
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  sessionCount: number;
  lastActiveMs: number;
  runtimes: Array<{
    runtime: string;
    totalCostUsd: number;
    inputTokens: number;
    outputTokens: number;
    sessionCount: number;
    lastActiveMs: number;
  }>;
}

interface SessionTokenRow {
  groupKey: string;      // session_id
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  lastActivityMs: number;
}

// Runtimes where the "main" singleton agent stores token_usage rows keyed by
// runtime name rather than a specific agent_id. Only applies when agentId === runtime
// (i.e. the dashboard is showing the root agent, not an isolated profile).
const RUNTIME_ONLY_STATS = new Set(["claude-code", "codex", "hermes"]);

// ── Helpers ──────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function shortId(id: string): string {
  const bare = id.replace(/^(claude:|codex:|hermes:[^:]+:[^:]+:)/, "");
  return bare.slice(0, 8);
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Mini sparkline bar chart (last 14 days) ─────────────────────────────────────

interface DayStat {
  date: string; // YYYY-MM-DD
  count: number;
}

function MiniBarChart({ data, color = "hsl(var(--primary))", height = 32 }: { data: DayStat[]; color?: string; height?: number }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-0.5" style={{ height: `${height}px` }}>
      {data.map((d, i) => {
        const h = Math.max((d.count / max) * height, d.count > 0 ? 2 : 0);
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{ height: `${h}px`, background: d.count > 0 ? color : "hsl(var(--muted))" }}
            title={`${d.date}: ${d.count}`}
          />
        );
      })}
    </div>
  );
}

// ── Donut/Ring chart for percentages ────────────────────────────────────────────

function MiniDonut({ value, color = "hsl(var(--primary))", size = 32 }: { value: number; color?: string; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}

// ── Section label ────────────────────────────────────────────────────────────���

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-medium px-0.5">
      {children}
    </p>
  );
}

// ── Crons summary (must be inside CronsProvider) ─────────────────────────────────

function CronsSummaryInner({ agentId }: { agentId: string }) {
  const { jobsForList, parsedCronJobs, runningJobIds } = useCrons();

  const agentJobs = useMemo(
    () => jobsForList.filter((j) => j.agentId === agentId).slice(0, 3),
    [jobsForList, agentId]
  );

  if (agentJobs.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <SectionLabel>Scheduled runs</SectionLabel>
      <div className="space-y-1">
        {agentJobs.map((job) => {
          const isRunning = runningJobIds.includes(job.id);
          const lastStatus = job.state?.lastStatus;
          const lastRunMs = job.state?.lastRunAtMs;
          const nextRun = getJobNextRunDate(job, parsedCronJobs);
          const nextRunStr = nextRun ? formatDistanceToNow(nextRun, { addSuffix: true }) : "—";
          const lastRunStr = lastRunMs ? formatDistanceToNow(new Date(lastRunMs), { addSuffix: true }) : "—";

          return (
            <div
              key={job.id}
              className="flex items-start gap-2 px-2.5 py-1.5 rounded-md border border-solid border-border text-[11px]"
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0 mt-0.5",
                  isRunning
                    ? "bg-emerald-400 animate-pulse"
                    : lastStatus === "success"
                    ? "bg-emerald-500/60"
                    : lastStatus === "error"
                    ? "bg-red-400/70"
                    : "bg-muted-foreground/30"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-foreground/80">{job.name || job.id}</p>
                <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                  {isRunning ? "In progress…" : `Next ${nextRunStr} · Last ${lastRunStr}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CronsSummary({ agentId }: { agentId: string }) {
  return (
    <CronsProvider>
      <CronsSummaryInner agentId={agentId} />
    </CronsProvider>
  );
}

// ── Main component ───────────────────────────────────────────────────────────────

interface AgentOverviewTabProps {
  agentId: string;
  /** Agent runtime (openclaw | claude-code | codex | hermes). */
  agentRuntime?: string;
  sessions: OverviewSession[];
  sessionsLoading: boolean;
  lastSeenTs: number;
  readSessions: Set<string>;
  unreadCount: number;
  onOpenSession: (key: string) => void;
  onNewChat: () => void;
}

export default function AgentOverviewTab({
  agentId,
  agentRuntime,
  sessions,
  sessionsLoading,
  lastSeenTs,
  readSessions,
  onOpenSession,
  onNewChat,
}: AgentOverviewTabProps) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [sessionTokenUsage, setSessionTokenUsage] = useState<SessionTokenRow[]>([]);
  const [showAllRuns, setShowAllRuns] = useState(false);

  // ── Fetch 30-day stats ───────────────────────────────────────────���─────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const to = Date.now();
      const from = to - 30 * 24 * 60 * 60 * 1000;
      // Only fall back to runtime-keyed query for the root singleton agent
      // (agentId equals the runtime name). Isolated profile agents have their
      // own agentId and must be queried directly.
      const isRootRuntimeAgent = agentRuntime && RUNTIME_ONLY_STATS.has(agentRuntime) && agentId === agentRuntime;
      const statsAgentId = isRootRuntimeAgent ? agentRuntime : agentId;
      const res = await (bridgeInvoke("get-agent-stats", { agentId: statsAgentId, from, to }) as Promise<{
        success?: boolean;
        data?: AgentStats;
      }>);
      if (res?.success && res.data) setStats(res.data);
    } catch {
      // connector offline
    } finally {
      setStatsLoading(false);
    }
  }, [agentId, agentRuntime]);

  // ── Fetch per-session token usage (last 30 days, matches stats window) ────

  const fetchSessionUsage = useCallback(async () => {
    try {
      const to = Date.now();
      const from = to - 30 * 24 * 60 * 60 * 1000;
      const isRootRuntimeAgent = agentRuntime && RUNTIME_ONLY_STATS.has(agentRuntime) && agentId === agentRuntime;
      const params = isRootRuntimeAgent
        ? { runtime: agentRuntime, groupBy: "session", from, to }
        : { agentId, groupBy: "session", from, to };
      const res = await (bridgeInvoke("get-token-usage", params) as Promise<{
        success?: boolean;
        data?: SessionTokenRow[];
      }>);
      if (res?.success && Array.isArray(res.data)) {
        setSessionTokenUsage(res.data);
      }
    } catch {
      // connector offline
    }
  }, [agentId, agentRuntime]);

  useEffect(() => {
    void fetchStats();
    void fetchSessionUsage();
  }, [fetchStats, fetchSessionUsage]);

  useEffect(() => {
    const handler = () => { void fetchStats(); void fetchSessionUsage(); };
    window.addEventListener("token.usage.updated", handler);
    return () => window.removeEventListener("token.usage.updated", handler);
  }, [fetchStats, fetchSessionUsage]);

  // ── Derived data ───────────────────────────────────────────────────────────

  // Latest session
  const latestSession = useMemo(() => sessions[0] ?? null, [sessions]);

  // Run activity: last 14 days, session count per day
  const activityData = useMemo((): DayStat[] => {
    const days: DayStat[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ date: dateStr, count: 0 });
    }

    // Count sessions per day from token_usage lastActivityMs
    for (const row of sessionTokenUsage) {
      if (!row.lastActivityMs) continue;
      const d = new Date(row.lastActivityMs);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const idx = days.findIndex((dd) => dd.date === dateStr);
      if (idx >= 0) days[idx].count++;
    }

    // Also count from sessions list (for OpenClaw agents)
    for (const s of sessions) {
      if (!s.updatedAt) continue;
      const d = new Date(s.updatedAt);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const idx = days.findIndex((dd) => dd.date === dateStr);
      if (idx >= 0 && sessionTokenUsage.length === 0) days[idx].count++;
    }

    return days;
  }, [sessionTokenUsage, sessions]);

  // Success rate: last 14 days
  const successRate = useMemo(() => {
    const relevant = sessions.filter((s) => s.status && s.updatedAt && (Date.now() - s.updatedAt) < 14 * 86400_000);
    if (relevant.length === 0) return null;
    const succeeded = relevant.filter((s) =>
      s.status === "completed" || s.status === "success" || s.status === "done"
    ).length;
    return Math.round((succeeded / relevant.length) * 100);
  }, [sessions]);

  // Per-run cost rows (last 10 unless showAllRuns)
  const runRows = useMemo(() => {
    const rows = [...sessionTokenUsage].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
    return showAllRuns ? rows : rows.slice(0, 10);
  }, [sessionTokenUsage, showAllRuns]);

  // Issue metrics (derived from session statuses)
  const issueMetrics = useMemo(() => {
    const recent14Days = sessions.filter((s) => s.updatedAt && (Date.now() - s.updatedAt) < 14 * 86400_000);
    const total = recent14Days.length;
    if (total === 0) return { byPriority: { high: 0, medium: 0, low: 0 }, byStandards: 0 };

    // Derive "issues" from error/failed statuses
    const errors = recent14Days.filter((s) =>
      s.status === "error" || s.status === "failed" || s.status === "aborted"
    );
    // Mock priority distribution based on status
    return {
      byPriority: {
        high: errors.filter((s) => s.status === "error").length,
        medium: errors.filter((s) => s.status === "failed").length,
        low: errors.filter((s) => s.status === "aborted").length,
      },
      byStandards: Math.round((errors.length / Math.max(total, 1)) * 100),
    };
  }, [sessions]);

  // Totals always computed from per-session rows so they are scoped to the
  // current agent. The aggregate stats endpoint can return broader data when
  // agent_id attribution doesn't match — summing "sections" is authoritative.
  const costTotals = useMemo(() => {
    return sessionTokenUsage.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.inputTokens,
        outputTokens: acc.outputTokens + r.outputTokens,
        cacheReadTokens: acc.cacheReadTokens + r.cacheReadTokens,
        totalCostUsd: acc.totalCostUsd + r.totalCostUsd,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, totalCostUsd: 0 }
    );
  }, [sessionTokenUsage]);

  const recentSessions = useMemo(() => sessions.slice(0, 5), [sessions]);
  const hasRunData = sessionTokenUsage.length > 0;

  const totalRuns14d = activityData.reduce((sum, d) => sum + d.count, 0);
  const totalIssues = issueMetrics.byPriority.high + issueMetrics.byPriority.medium + issueMetrics.byPriority.low;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Metrics Row: Run Activity, Issue by Priority, Issue by Standards, Success Rate ── */}
      <div className="grid grid-cols-4 gap-2">
        {/* Run Activity */}
        <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Run Activity</span>
            <span className="text-[10px] font-semibold tabular-nums">{totalRuns14d}</span>
          </div>
          <MiniBarChart data={activityData} height={24} />
        </div>

        {/* Issue by Priority */}
        <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">By Priority</span>
            <span className="text-[10px] font-semibold tabular-nums">{totalIssues}</span>
          </div>
          <div className="flex items-end gap-1 h-6">
            <div className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm bg-destructive/70"
                style={{ height: Math.max(issueMetrics.byPriority.high > 0 ? 4 : 0, Math.min((issueMetrics.byPriority.high / Math.max(totalIssues, 1)) * 24, 24)) }}
              />
              <span className="text-[8px] text-muted-foreground/50">H</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm bg-amber-500/70"
                style={{ height: Math.max(issueMetrics.byPriority.medium > 0 ? 4 : 0, Math.min((issueMetrics.byPriority.medium / Math.max(totalIssues, 1)) * 24, 24)) }}
              />
              <span className="text-[8px] text-muted-foreground/50">M</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-sm bg-muted-foreground/40"
                style={{ height: Math.max(issueMetrics.byPriority.low > 0 ? 4 : 0, Math.min((issueMetrics.byPriority.low / Math.max(totalIssues, 1)) * 24, 24)) }}
              />
              <span className="text-[8px] text-muted-foreground/50">L</span>
            </div>
          </div>
        </div>

        {/* Issue by Standards */}
        <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Error Rate</span>
            <span className="text-[10px] font-semibold tabular-nums">{issueMetrics.byStandards}%</span>
          </div>
          <div className="flex items-center justify-center h-6">
            <MiniDonut value={issueMetrics.byStandards} color="hsl(var(--destructive))" size={24} />
          </div>
        </div>

        {/* Success Rate */}
        <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Success Rate</span>
            <span className="text-[10px] font-semibold tabular-nums text-emerald-500">{successRate ?? 0}%</span>
          </div>
          <div className="flex items-center justify-center h-6">
            <MiniDonut value={successRate ?? 0} color="hsl(142, 71%, 45%)" size={24} />
          </div>
        </div>
      </div>

      {/* ── Latest Run ── */}
      {latestSession && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <SectionLabel>Latest Run</SectionLabel>
            <button
              onClick={() => onOpenSession(latestSession.key)}
              className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-foreground/60 transition-colors"
            >
              View details
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          </div>
          <div
            className="px-2.5 py-2 rounded-md border border-solid border-border cursor-pointer hover:bg-muted/10 transition-colors"
            onClick={() => onOpenSession(latestSession.key)}
          >
            <div className="flex items-center gap-2 mb-1">
              {latestSession.status === "completed" || latestSession.status === "success" || latestSession.status === "done" ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : latestSession.status === "error" || latestSession.status === "failed" || latestSession.status === "aborted" ? (
                <XCircle className="w-3 h-3 text-destructive shrink-0" />
              ) : latestSession.status === "active" ? (
                <span className="relative flex w-2 h-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
                </span>
              ) : (
                <Clock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
              )}
              <span className="text-[10px] font-mono text-foreground/60">
                {shortId(latestSession.key)}
              </span>
              {latestSession.status && (
                <span className={cn(
                  "text-[9px] font-medium px-1.5 py-0.5 rounded-full",
                  latestSession.status === "completed" || latestSession.status === "success" || latestSession.status === "done"
                    ? "bg-emerald-500/10 text-emerald-500"
                    : latestSession.status === "error" || latestSession.status === "failed" || latestSession.status === "aborted"
                    ? "bg-destructive/10 text-destructive"
                    : latestSession.status === "active"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted-foreground/10 text-muted-foreground/70"
                )}>
                  {latestSession.status}
                </span>
              )}
              {latestSession.updatedAt && (
                <span className="ml-auto text-[9px] text-muted-foreground/40">
                  {relTime(latestSession.updatedAt)}
                </span>
              )}
            </div>
            {latestSession.preview && (
              <p className="text-[10px] text-muted-foreground/60 line-clamp-2 [overflow-wrap:anywhere] mt-0.5">
                {latestSession.preview}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="space-y-1.5">
        <SectionLabel>Last 30 days</SectionLabel>
        {statsLoading && !stats ? (
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 flex-1 rounded-lg border border-solid border-border animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex flex-col gap-0.5 rounded-lg border border-solid border-border px-2.5 py-2 min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground truncate leading-none uppercase tracking-wide">Cost</span>
              </div>
              <span className="text-sm font-semibold tabular-nums leading-tight">{fmtCost(costTotals.totalCostUsd)}</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-solid border-border px-2.5 py-2 min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <Hash className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground truncate leading-none uppercase tracking-wide">Tokens</span>
              </div>
              <span className="text-sm font-semibold tabular-nums leading-tight">
                {fmt(costTotals.inputTokens + costTotals.outputTokens)}
              </span>
              {(costTotals.inputTokens > 0 || costTotals.outputTokens > 0) && (
                <span className="text-[9px] text-muted-foreground/60 leading-none">
                  {fmt(costTotals.inputTokens)} in · {fmt(costTotals.outputTokens)} out
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-solid border-border px-2.5 py-2 min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground truncate leading-none uppercase tracking-wide">Sessions</span>
              </div>
              <span className="text-sm font-semibold tabular-nums leading-tight">{String(stats?.sessionCount ?? 0)}</span>
              {successRate !== null && (
                <span className="text-[9px] text-muted-foreground/60 leading-none">{successRate}% success</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Recent sessions ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <SectionLabel>Recent Sessions</SectionLabel>
          <button
            onClick={onNewChat}
            className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-foreground/60 transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
            New
          </button>
        </div>

        {sessionsLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 rounded-md border border-solid border-border animate-pulse" />
            ))}
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-muted-foreground/50">
            <MessageSquare className="w-5 h-5 opacity-30" />
            <p className="text-[11px]">No sessions yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {recentSessions.map((s) => {
              const isUnread =
                !readSessions.has(s.key) &&
                lastSeenTs > 0 &&
                (s.updatedAt || 0) > lastSeenTs;
              const isActive = s.status === "active";
              const isWaiting = s.status === "waiting";
              const isSuccess =
                s.status === "completed" || s.status === "success" || s.status === "done";
              const isError =
                s.status === "error" || s.status === "failed" || s.status === "aborted";
              const title = s.label || s.key.split(":").pop() || s.key;

              return (
                <button
                  key={s.key}
                  onClick={() => onOpenSession(s.key)}
                  className="flex items-start gap-2 w-full px-2.5 py-2 rounded-md border border-solid border-border hover:bg-muted/10 transition-colors text-left"
                >
                  <div className="shrink-0 w-3 flex items-center justify-center mt-1">
                    {isActive ? (
                      <span className="relative flex w-2 h-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
                      </span>
                    ) : isWaiting ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    ) : isSuccess ? (
                      <Check className="w-3 h-3 text-emerald-500/70" />
                    ) : isError ? (
                      <X className="w-3 h-3 text-destructive/70" />
                    ) : (
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isUnread ? "bg-primary" : "bg-muted-foreground/20"
                        )}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          "flex-1 min-w-0 truncate text-[11px]",
                          isUnread ? "font-semibold text-foreground" : "text-foreground/70"
                        )}
                      >
                        {title}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isUnread && (
                          <span className="text-[8px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded-full">
                            NEW
                          </span>
                        )}
                        {s.updatedAt && !isActive && (
                          <span className="text-[10px] text-muted-foreground/40">
                            {relTime(s.updatedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    {s.preview && (
                      <p className="text-[10px] text-muted-foreground/55 line-clamp-2 mt-0.5 [overflow-wrap:anywhere]">
                        {s.preview}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Costs ── */}
      <div className="space-y-2">
        <SectionLabel>Costs</SectionLabel>

        {/* Token totals grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-md border border-solid border-border">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Input tokens</span>
            <span className="text-xs font-semibold tabular-nums">{fmt(costTotals.inputTokens)}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-md border border-solid border-border">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Output tokens</span>
            <span className="text-xs font-semibold tabular-nums">{fmt(costTotals.outputTokens)}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-md border border-solid border-border">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Cached tokens</span>
            <span className="text-xs font-semibold tabular-nums">{fmt(costTotals.cacheReadTokens)}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-md border border-solid border-border">
            <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Total cost</span>
            <span className="text-xs font-semibold tabular-nums text-primary">{fmtCost(costTotals.totalCostUsd)}</span>
          </div>
        </div>

        {/* Per-run table */}
        {hasRunData && (
          <div className="rounded-md border border-solid border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2.5 py-1.5 border-b border-border/40">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Date</span>
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide text-right">Input</span>
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide text-right">Output</span>
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide text-right">Cost</span>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-border/40">
              {runRows.map((row) => (
                <div
                  key={row.groupKey}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-2.5 py-1.5 hover:bg-muted/5 transition-colors"
                >
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-[10px] text-foreground/70 truncate">
                      {row.lastActivityMs ? fmtDate(row.lastActivityMs) : "—"}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground/50">
                      {shortId(row.groupKey)}
                    </span>
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground/70 text-right self-center">
                    {row.inputTokens > 0 ? fmt(row.inputTokens) : "—"}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground/70 text-right self-center">
                    {row.outputTokens > 0 ? fmt(row.outputTokens) : "—"}
                  </span>
                  <span className="text-[10px] tabular-nums text-right self-center">
                    {row.totalCostUsd > 0
                      ? <span className="text-primary/80">{fmtCost(row.totalCostUsd)}</span>
                      : <span className="text-muted-foreground/30">—</span>
                    }
                  </span>
                </div>
              ))}
            </div>

            {/* Show more / less */}
            {sessionTokenUsage.length > 10 && (
              <button
                onClick={() => setShowAllRuns((v) => !v)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground/50 hover:text-foreground/60 border-t border-border/40 transition-colors"
              >
                {showAllRuns
                  ? "Show less"
                  : `See all ${sessionTokenUsage.length} runs`}
                <ArrowRight className={cn("w-3 h-3 transition-transform", showAllRuns && "rotate-90")} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Scheduled runs ── */}
      <CronsSummary agentId={agentId} />
    </div>
  );
}
