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
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Timer,
  AlertTriangle,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { CronsProvider, useCrons } from "$/components/Tool/Crons/provider/cronsProvider";
import { getJobNextRunDate } from "$/components/Tool/Crons/utils";
import { formatDistanceToNow } from "date-fns";
import {
  type AgentStatsSnapshot,
  getRuntimeSessionUsageQueryParams,
  getSessionUsageQueryParams,
  getStatsAgentId,
  hasStatsActivity,
  shouldUseRuntimeUsageFallback,
} from "./agent-overview-usage";
import {
  MEMORY_SEARCH_CONFIG_KEYS,
  MEMORY_SEARCH_PROVIDERS,
  getDefaultMemorySearchModel,
  getMemorySearchProviderOption,
  resolveMemorySearchSettings,
  unwrapOpenClawConfigValue,
} from "./openclaw-memory-search";

// ── Types ─────────────────────────────────────────────────────────────��──────────

export type OverviewSession = {
  key: string;
  label?: string;
  updatedAt?: number;
  status?: string;
  preview?: string;
};

interface AgentStats extends AgentStatsSnapshot {
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

interface CostDayStat {
  date: string; // YYYY-MM-DD
  cost: number;
}

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

// ── Helpers ──────────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDayArray(n: number): DayStat[] {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (n - 1 - i));
    return { date: toDateStr(d), count: 0 };
  });
}

// ── Mini sparkline bar chart (last N days) ───────────────────────────────────────

interface DayStat {
  date: string; // YYYY-MM-DD
  count: number;
}

interface DayPriority {
  date: string;
  high: number;
  medium: number;
  low: number;
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function MiniBarChart({
  data,
  color = "hsl(var(--primary))",
  height = 28,
  showLabels = false,
}: {
  data: DayStat[];
  color?: string;
  height?: number;
  showLabels?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex flex-col gap-0.5">
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
      {showLabels && (
        <div className="flex gap-0.5">
          {data.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[7px] text-muted-foreground/30 leading-none">
              {DAY_LETTERS[new Date(d.date + "T12:00:00").getDay()]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StackedMiniBarChart({
  data,
  height = 28,
  showLabels = false,
}: {
  data: DayPriority[];
  height?: number;
  showLabels?: boolean;
}) {
  const maxTotal = Math.max(...data.map((d) => d.high + d.medium + d.low), 1);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-end gap-0.5" style={{ height: `${height}px` }}>
        {data.map((d, i) => {
          const total = d.high + d.medium + d.low;
          if (total === 0) {
            return (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{ height: "2px", background: "hsl(var(--muted))" }}
                title={`${d.date}: no issues`}
              />
            );
          }
          const totalH = (total / maxTotal) * height;
          const highH = (d.high / total) * totalH;
          const medH = (d.medium / total) * totalH;
          const lowH = (d.low / total) * totalH;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col-reverse rounded-sm overflow-hidden"
              style={{ height: `${totalH}px` }}
              title={`${d.date}: H${d.high} M${d.medium} L${d.low}`}
            >
              <div style={{ height: `${highH}px`, background: "hsl(var(--destructive) / 0.75)" }} />
              <div style={{ height: `${medH}px`, background: "hsl(38 92% 50% / 0.7)" }} />
              <div style={{ height: `${lowH}px`, background: "hsl(var(--muted-foreground) / 0.35)" }} />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="flex gap-0.5">
          {data.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[7px] text-muted-foreground/30 leading-none">
              {DAY_LETTERS[new Date(d.date + "T12:00:00").getDay()]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section label ────────────────────────────────────────────────────────────���

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-medium">
        {children}
      </p>
      {action}
    </div>
  );
}

// ── Cost mini chart ──────────────────────────────────────────────────────────────

function CostMiniChart({
  data,
  height = 28,
  showLabels = false,
}: {
  data: CostDayStat[];
  height?: number;
  showLabels?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.cost), 0.01);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-end gap-0.5" style={{ height: `${height}px` }}>
        {data.map((d, i) => {
          const h = Math.max((d.cost / max) * height, d.cost > 0 ? 2 : 0);
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all"
              style={{
                height: `${h}px`,
                background: d.cost > 0 ? "hsl(var(--primary) / 0.7)" : "hsl(var(--muted))",
              }}
              title={`${d.date}: $${d.cost.toFixed(2)}`}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="flex gap-0.5">
          {data.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[7px] text-muted-foreground/30 leading-none">
              {DAY_LETTERS[new Date(d.date + "T12:00:00").getDay()]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Current Task section ─────────────────────────────────────────────────────────

interface CurrentTaskProps {
  sessions: OverviewSession[];
  onOpenSession?: (key: string) => void;
}

function CurrentTaskSection({ sessions, onOpenSession }: CurrentTaskProps) {
  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status === "active" || s.status === "running"),
    [sessions]
  );

  if (activeSessions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <SectionLabel>
        <span className="flex items-center gap-1">
          <span className="relative flex w-1.5 h-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-500" />
          </span>
          Current Task
        </span>
      </SectionLabel>
      {activeSessions.map((s) => (
        <div
          key={s.key}
          onClick={() => onOpenSession?.(s.key)}
          className={cn(
            "px-2.5 py-2 rounded-md border border-solid border-emerald-500/30 bg-emerald-500/5 transition-colors",
            onOpenSession ? "cursor-pointer hover:bg-emerald-500/10" : "cursor-default"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-3 h-3 text-emerald-500 animate-spin shrink-0" />
            <span className="text-[11px] font-medium text-foreground/80 truncate flex-1">
              {s.label || shortId(s.key)}
            </span>
            {s.updatedAt && (
              <span className="text-[9px] text-muted-foreground/40 shrink-0">
                {relTime(s.updatedAt)}
              </span>
            )}
            {onOpenSession && (
              <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            )}
          </div>
          {s.preview && (
            <p className="text-[10px] text-muted-foreground/60 line-clamp-2 [overflow-wrap:anywhere]">
              {s.preview}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Error Log section ────────────────────────────────────────────────────────────

interface ErrorLogProps {
  sessions: OverviewSession[];
  onOpenSession?: (key: string) => void;
  showAll?: boolean;
  onToggleShowAll?: () => void;
}

function ErrorLogSection({ sessions, onOpenSession, showAll, onToggleShowAll }: ErrorLogProps) {
  const errorSessions = useMemo(
    () => sessions.filter((s) => s.status === "error" || s.status === "failed" || s.status === "aborted"),
    [sessions]
  );

  const displayedErrors = showAll ? errorSessions : errorSessions.slice(0, 3);

  if (errorSessions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <SectionLabel
        action={
          errorSessions.length > 3 && (
            <button
              onClick={onToggleShowAll}
              className="text-[9px] text-muted-foreground/50 hover:text-foreground/60 transition-colors"
            >
              {showAll ? "Show less" : `View all ${errorSessions.length}`}
            </button>
          )
        }
      >
        <span className="flex items-center gap-1 text-destructive/80">
          <AlertTriangle className="w-2.5 h-2.5" />
          Error Log
        </span>
      </SectionLabel>
      <div className="space-y-1">
        {displayedErrors.map((s) => (
          <div
            key={s.key}
            onClick={() => onOpenSession?.(s.key)}
            className={cn(
              "flex items-start gap-2 px-2.5 py-2 rounded-md border border-solid border-destructive/20 bg-destructive/5 transition-colors",
              onOpenSession ? "cursor-pointer hover:bg-destructive/10" : "cursor-default"
            )}
          >
            <XCircle className="w-3 h-3 text-destructive/70 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium text-foreground/70 truncate flex-1">
                  {s.label || shortId(s.key)}
                </span>
                {s.updatedAt && (
                  <span className="text-[9px] text-muted-foreground/40 shrink-0">
                    {relTime(s.updatedAt)}
                  </span>
                )}
              </div>
              {s.preview && (
                <p className="text-[10px] text-destructive/60 line-clamp-1 mt-0.5 [overflow-wrap:anywhere]">
                  {s.preview}
                </p>
              )}
            </div>
            {onOpenSession && <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0 mt-0.5" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Crons summary (must be inside CronsProvider) ─────────────────────────────────

function CronsSummaryInner({ agentId, showAllCrons, onToggleShowAll }: { agentId: string; showAllCrons?: boolean; onToggleShowAll?: () => void }) {
  const { jobsForList, parsedCronJobs, runningJobIds } = useCrons();

  const agentJobs = useMemo(
    () => jobsForList.filter((j) => j.agentId === agentId),
    [jobsForList, agentId]
  );

  // Sort by last run time (most recent first), then by running status
  const sortedJobs = useMemo(() => {
    return [...agentJobs].sort((a, b) => {
      // Running jobs first
      const aRunning = runningJobIds.includes(a.id);
      const bRunning = runningJobIds.includes(b.id);
      if (aRunning && !bRunning) return -1;
      if (!aRunning && bRunning) return 1;
      // Then by last run time
      const aMs = a.state?.lastRunAtMs ?? 0;
      const bMs = b.state?.lastRunAtMs ?? 0;
      return bMs - aMs;
    });
  }, [agentJobs, runningJobIds]);

  const displayedJobs = showAllCrons ? sortedJobs : sortedJobs.slice(0, 4);
  const hasErrors = agentJobs.some((j) => j.state?.lastStatus === "error");

  if (agentJobs.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <SectionLabel
        action={
          agentJobs.length > 4 && (
            <button
              onClick={onToggleShowAll}
              className="text-[9px] text-muted-foreground/50 hover:text-foreground/60 transition-colors"
            >
              {showAllCrons ? "Show less" : `View all ${agentJobs.length}`}
            </button>
          )
        }
      >
        <span className="flex items-center gap-1">
          <Timer className="w-2.5 h-2.5 text-muted-foreground/60" />
          Cron Runs
          {hasErrors && <span className="w-1.5 h-1.5 rounded-full bg-destructive/70" />}
        </span>
      </SectionLabel>
      <div className="space-y-1">
        {displayedJobs.map((job) => {
          const isRunning = runningJobIds.includes(job.id);
          const lastStatus = job.state?.lastStatus;
          const lastRunMs = job.state?.lastRunAtMs;
          const nextRun = getJobNextRunDate(job, parsedCronJobs);
          const nextRunStr = nextRun ? formatDistanceToNow(nextRun, { addSuffix: true }) : "—";
          const lastRunStr = lastRunMs ? formatDistanceToNow(new Date(lastRunMs), { addSuffix: true }) : "never";
          const isError = lastStatus === "error";

          return (
            <div
              key={job.id}
              className={cn(
                "flex items-start gap-2 px-2.5 py-1.5 rounded-md border border-solid text-[11px]",
                isRunning
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : isError
                  ? "border-destructive/20 bg-destructive/5"
                  : "border-border"
              )}
            >
              <div className="shrink-0 mt-0.5">
                {isRunning ? (
                  <Loader2 className="w-3 h-3 text-emerald-500 animate-spin" />
                ) : lastStatus === "success" ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500/60" />
                ) : isError ? (
                  <XCircle className="w-3 h-3 text-destructive/70" />
                ) : (
                  <Clock className="w-3 h-3 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <p className="truncate text-foreground/80 flex-1">{job.name || job.id}</p>
                  {lastStatus && !isRunning && (
                    <span className={cn(
                      "text-[8px] font-medium px-1 py-0.5 rounded-full shrink-0",
                      lastStatus === "success"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-destructive/10 text-destructive"
                    )}>
                      {lastStatus}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                  {isRunning ? (
                    "Running now..."
                  ) : (
                    <>
                      <span className="text-muted-foreground/40">Last:</span> {lastRunStr}
                      <span className="mx-1">·</span>
                      <span className="text-muted-foreground/40">Next:</span> {nextRunStr}
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CronsSummary({ agentId, showAllCrons, onToggleShowAll }: { agentId: string; showAllCrons?: boolean; onToggleShowAll?: () => void }) {
  return (
    <CronsProvider>
      <CronsSummaryInner agentId={agentId} showAllCrons={showAllCrons} onToggleShowAll={onToggleShowAll} />
    </CronsProvider>
  );
}

// ── Memory Search toggle ─────────────────────────────────────────────────────────

function MemorySearchToggle({ agentId }: { agentId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState(MEMORY_SEARCH_PROVIDERS[0].id);
  const [model, setModel] = useState(getDefaultMemorySearchModel(MEMORY_SEARCH_PROVIDERS[0].id));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [enabledRes, providerRes, modelRes] = await Promise.all([
          bridgeInvoke("openclaw-config-get", { key: MEMORY_SEARCH_CONFIG_KEYS.enabled }),
          bridgeInvoke("openclaw-config-get", { key: MEMORY_SEARCH_CONFIG_KEYS.provider }),
          bridgeInvoke("openclaw-config-get", { key: MEMORY_SEARCH_CONFIG_KEYS.model }),
        ]);
        if (cancelled) return;
        const settings = resolveMemorySearchSettings({
          enabledValue: unwrapOpenClawConfigValue(enabledRes),
          providerValue: unwrapOpenClawConfigValue(providerRes),
          modelValue: unwrapOpenClawConfigValue(modelRes),
        });
        setEnabled(settings.enabled);
        setProvider(settings.provider);
        setModel(settings.model);
      } catch {
        if (!cancelled) {
          setError("Could not read OpenClaw memory config.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const setConfigValue = useCallback(async (key: string, value: string) => {
    await bridgeInvoke("openclaw-config-set", { key, value });
  }, []);

  const persistToggle = useCallback(async (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      if (next) {
        await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.provider, provider);
        if (model.trim()) {
          await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.model, model.trim());
        }
      }
      await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.enabled, String(next));
    } catch {
      setEnabled(previous);
      setError("Could not update memory search.");
    } finally {
      setSaving(false);
    }
  }, [enabled, model, provider, setConfigValue]);

  const persistProvider = useCallback(async (nextProvider: string) => {
    const previousEnabled = enabled;
    const previousProvider = provider;
    const previousModel = model;
    const nextModel = getDefaultMemorySearchModel(nextProvider);
    setProvider(nextProvider);
    setModel(nextModel);
    setSaving(true);
    setError(null);
    try {
      await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.provider, nextProvider);
      await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.model, nextModel);
      if (!enabled) {
        setEnabled(true);
        await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.enabled, "true");
      }
    } catch {
      setEnabled(previousEnabled);
      setProvider(previousProvider);
      setModel(previousModel);
      await Promise.allSettled([
        setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.provider, previousProvider),
        setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.model, previousModel),
        setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.enabled, String(previousEnabled)),
      ]);
      setError("Could not change memory provider.");
    } finally {
      setSaving(false);
    }
  }, [enabled, model, provider, setConfigValue]);

  const persistModel = useCallback(async (nextModel: string) => {
    const previousEnabled = enabled;
    const previousModel = model;
    setModel(nextModel);
    setSaving(true);
    setError(null);
    try {
      await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.model, nextModel);
      if (!enabled) {
        setEnabled(true);
        await setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.enabled, "true");
      }
    } catch {
      setEnabled(previousEnabled);
      setModel(previousModel);
      await Promise.allSettled([
        setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.model, previousModel),
        setConfigValue(MEMORY_SEARCH_CONFIG_KEYS.enabled, String(previousEnabled)),
      ]);
      setError("Could not change memory model.");
    } finally {
      setSaving(false);
    }
  }, [enabled, model, setConfigValue]);

  const selectedProvider = getMemorySearchProviderOption(provider);
  const modelOptions = selectedProvider.models.includes(model)
    ? selectedProvider.models
    : [model, ...selectedProvider.models];

  return (
    <div className="rounded-xl border border-solid border-primary/10 bg-background/45 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Memory Search
            </span>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground/70">
            {enabled
              ? `Semantic recall is using ${selectedProvider.name}.`
              : "Enable semantic recall across OpenClaw conversations."}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          {(loading || saving) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />}
          <Switch
            checked={enabled}
            disabled={loading || saving}
            onCheckedChange={(next) => { void persistToggle(next); }}
            aria-label="Toggle OpenClaw memory search"
            className="h-5 w-9"
          />
        </div>
      </div>

      <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", !enabled && "opacity-60")}>
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Provider
          </span>
          <Select
            value={provider}
            onValueChange={(next) => { void persistProvider(next); }}
            disabled={loading || saving}
          >
            <SelectTrigger className="h-9 rounded-lg border-primary/10 bg-foreground/[0.035] text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-primary/10 bg-popover/95 text-foreground shadow-xl backdrop-blur-xl">
              {MEMORY_SEARCH_PROVIDERS.map((option) => (
                <SelectItem key={option.id} value={option.id} className="rounded-lg text-xs">
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Model
          </span>
          <Select
            value={model}
            onValueChange={(next) => { void persistModel(next); }}
            disabled={loading || saving}
          >
            <SelectTrigger className="h-9 rounded-lg border-primary/10 bg-foreground/[0.035] text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-primary/10 bg-popover/95 text-foreground shadow-xl backdrop-blur-xl">
              {modelOptions.map((option) => (
                <SelectItem key={option} value={option} className="rounded-lg text-xs">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-[10px] text-muted-foreground/45">{selectedProvider.description}</p>
        {error && <p className="shrink-0 text-[10px] text-destructive">{error}</p>}
      </div>
    </div>
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
  onOpenSession?: (key: string) => void;
  onNewChat?: () => void;
  /** If true, the runtime is unavailable and chat actions are disabled */
  runtimeUnavailable?: boolean;
}

export default function AgentOverviewTab({
  agentId,
  agentRuntime,
  sessions,
  sessionsLoading,
  lastSeenTs,
  readSessions,
  unreadCount,
  onOpenSession,
  onNewChat,
  runtimeUnavailable = false,
}: AgentOverviewTabProps) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [sessionUsageLoading, setSessionUsageLoading] = useState(true);
  const [sessionTokenUsage, setSessionTokenUsage] = useState<SessionTokenRow[]>([]);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [showAllCrons, setShowAllCrons] = useState(false);

  // ── Fetch 30-day stats ───────────────────────────────────────────���─────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const to = Date.now();
      const from = to - 30 * 24 * 60 * 60 * 1000;
      const statsAgentId = getStatsAgentId(agentId, agentRuntime);
      const res = await (bridgeInvoke("get-agent-stats", { agentId: statsAgentId, from, to }) as Promise<{
        success?: boolean;
        data?: AgentStats;
      }>);
      let nextStats = res?.success && res.data ? res.data : null;

      if (!hasStatsActivity(nextStats) && shouldUseRuntimeUsageFallback(agentId, agentRuntime)) {
        const fallback = await (bridgeInvoke("get-agent-stats", { agentId: agentRuntime, from, to }) as Promise<{
          success?: boolean;
          data?: AgentStats;
        }>);
        if (fallback?.success && hasStatsActivity(fallback.data)) {
          nextStats = fallback.data ?? null;
        }
      }

      setStats(nextStats);
    } catch {
      // connector offline
    } finally {
      setStatsLoading(false);
    }
  }, [agentId, agentRuntime]);

  // ── Fetch per-session token usage (last 30 days, matches stats window) ────

  const fetchSessionUsage = useCallback(async () => {
    setSessionUsageLoading(true);
    try {
      const to = Date.now();
      const from = to - 30 * 24 * 60 * 60 * 1000;
      const params = getSessionUsageQueryParams(agentId, agentRuntime, from, to);
      const res = await (bridgeInvoke("get-token-usage", params) as Promise<{
        success?: boolean;
        data?: SessionTokenRow[];
      }>);
      let rows = res?.success && Array.isArray(res.data) ? res.data : [];

      if (rows.length === 0 && shouldUseRuntimeUsageFallback(agentId, agentRuntime)) {
        const fallback = await (bridgeInvoke("get-token-usage", getRuntimeSessionUsageQueryParams(agentRuntime, from, to)) as Promise<{
          success?: boolean;
          data?: SessionTokenRow[];
        }>);
        if (fallback?.success && Array.isArray(fallback.data)) {
          rows = fallback.data;
        }
      }

      setSessionTokenUsage(rows);
    } catch {
      // connector offline
    } finally {
      setSessionUsageLoading(false);
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

  // Run activity: sessions per day, last 7 days
  const activityData = useMemo((): DayStat[] => {
    const days = buildDayArray(7);

    // Count from connector token_usage rows (precise session tracking)
    for (const row of sessionTokenUsage) {
      if (!row.lastActivityMs) continue;
      const dateStr = toDateStr(new Date(row.lastActivityMs));
      const idx = days.findIndex((d) => d.date === dateStr);
      if (idx >= 0) days[idx].count++;
    }

    // Fallback: count from sessions list when no connector data (OpenClaw agents)
    if (sessionTokenUsage.length === 0) {
      for (const s of sessions) {
        if (!s.updatedAt) continue;
        const dateStr = toDateStr(new Date(s.updatedAt));
        const idx = days.findIndex((d) => d.date === dateStr);
        if (idx >= 0) days[idx].count++;
      }
    }

    return days;
  }, [sessionTokenUsage, sessions]);

  // Successful sessions per day, last 7 days
  const successData = useMemo((): DayStat[] => {
    const days = buildDayArray(7);
    for (const s of sessions) {
      if (!s.updatedAt) continue;
      if (s.status !== "completed" && s.status !== "success" && s.status !== "done") continue;
      const dateStr = toDateStr(new Date(s.updatedAt));
      const idx = days.findIndex((d) => d.date === dateStr);
      if (idx >= 0) days[idx].count++;
    }
    return days;
  }, [sessions]);

  // Error sessions per day, last 7 days
  const errorData = useMemo((): DayStat[] => {
    const days = buildDayArray(7);
    for (const s of sessions) {
      if (!s.updatedAt) continue;
      if (s.status !== "error" && s.status !== "failed" && s.status !== "aborted") continue;
      const dateStr = toDateStr(new Date(s.updatedAt));
      const idx = days.findIndex((d) => d.date === dateStr);
      if (idx >= 0) days[idx].count++;
    }
    return days;
  }, [sessions]);

  // Priority breakdown per day, last 7 days (H=error, M=failed, L=aborted)
  const priorityData = useMemo((): DayPriority[] => {
    const days = buildDayArray(7).map((d) => ({ date: d.date, high: 0, medium: 0, low: 0 }));
    for (const s of sessions) {
      if (!s.updatedAt) continue;
      const dateStr = toDateStr(new Date(s.updatedAt));
      const idx = days.findIndex((d) => d.date === dateStr);
      if (idx < 0) continue;
      if (s.status === "error") days[idx].high++;
      else if (s.status === "failed") days[idx].medium++;
      else if (s.status === "aborted") days[idx].low++;
    }
    return days;
  }, [sessions]);

  // 7-day totals for metric card headers
  const totalRuns7d = activityData.reduce((sum, d) => sum + d.count, 0);
  const totalSuccess7d = successData.reduce((sum, d) => sum + d.count, 0);
  const totalErrors7d = errorData.reduce((sum, d) => sum + d.count, 0);
  const totalIssues7d = priorityData.reduce((sum, d) => sum + d.high + d.medium + d.low, 0);

  // Success rate: last 7 days
  const successRate = useMemo(() => {
    const relevant = sessions.filter((s) => s.status && s.updatedAt && (Date.now() - s.updatedAt) < 7 * 86400_000);
    if (relevant.length === 0) return null;
    const succeeded = relevant.filter((s) =>
      s.status === "completed" || s.status === "success" || s.status === "done"
    ).length;
    return Math.round((succeeded / relevant.length) * 100);
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

  // Cost per day (last 7 days)
  const costData = useMemo((): CostDayStat[] => {
    const days = buildDayArray(7).map((d) => ({ date: d.date, cost: 0 }));
    for (const row of sessionTokenUsage) {
      if (!row.lastActivityMs || !row.totalCostUsd) continue;
      const dateStr = toDateStr(new Date(row.lastActivityMs));
      const idx = days.findIndex((d) => d.date === dateStr);
      if (idx >= 0) days[idx].cost += row.totalCostUsd;
    }
    return days;
  }, [sessionTokenUsage]);

  const totalCost7d = costData.reduce((sum, d) => sum + d.cost, 0);

  // Filter recent sessions to exclude cron-generated results (human chats only)
  const recentSessions = useMemo(() => {
    // For now, show all sessions - cron filtering will be based on session source tag when available
    return sessions.slice(0, 5);
  }, [sessions]);
  const hasRunData = sessionTokenUsage.length > 0;

  const runRows = useMemo(() => {
    const rows = [...sessionTokenUsage].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
    return showAllRuns ? rows : rows.slice(0, 10);
  }, [sessionTokenUsage, showAllRuns]);
  const sessionCount30d = sessionTokenUsage.length > 0 ? sessionTokenUsage.length : (stats?.sessionCount ?? 0);

  // Show skeletons while both stats and session data are still loading
  const metricsLoading = (statsLoading || sessionUsageLoading) && sessionTokenUsage.length === 0 && sessions.length === 0;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Metrics Row: Activity · Success · Errors · Priority (last 7 days) ── */}
      {metricsLoading ? (
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-solid border-border px-2.5 py-2 h-[62px]">
              <div className="flex items-center justify-between">
                <Skeleton className="h-2 w-12" />
                <Skeleton className="h-2.5 w-5" />
              </div>
              <Skeleton className="flex-1 rounded-sm" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {/* Activity */}
          <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Activity</span>
              <span className="text-[10px] font-semibold tabular-nums">{totalRuns7d}</span>
            </div>
            <MiniBarChart data={activityData} height={28} showLabels />
          </div>

          {/* Success */}
          <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Success</span>
              <span className="text-[10px] font-semibold tabular-nums text-emerald-500">{totalSuccess7d}</span>
            </div>
            <MiniBarChart data={successData} color="hsl(142, 71%, 45%)" height={28} showLabels />
          </div>

          {/* Errors */}
          <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Errors</span>
              <span className="text-[10px] font-semibold tabular-nums text-destructive">{totalErrors7d}</span>
            </div>
            <MiniBarChart data={errorData} color="hsl(var(--destructive))" height={28} showLabels />
          </div>

          {/* Cost (7 days) */}
          <div className="flex flex-col gap-1.5 rounded-md border border-solid border-border px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Cost</span>
              <span className="text-[10px] font-semibold tabular-nums text-primary">{fmtCost(totalCost7d)}</span>
            </div>
            <CostMiniChart data={costData} height={28} showLabels />
          </div>
        </div>
      )}

      {/* ── Current Task (running sessions) ── */}
      <CurrentTaskSection sessions={sessions} onOpenSession={onOpenSession} />

      {/* ── Error Log ── */}
      <ErrorLogSection
        sessions={sessions}
        onOpenSession={onOpenSession}
        showAll={showAllErrors}
        onToggleShowAll={() => setShowAllErrors((v) => !v)}
      />

      {/* ── Cron Runs ── */}
      <CronsSummary
        agentId={agentId}
        showAllCrons={showAllCrons}
        onToggleShowAll={() => setShowAllCrons((v) => !v)}
      />

      {/* ── Memory Search toggle (OpenClaw agents only) ── */}
      {agentRuntime === "openclaw" && (
        <MemorySearchToggle agentId={agentId} />
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
              <span className="text-sm font-semibold tabular-nums leading-tight">{String(sessionCount30d)}</span>
              {successRate !== null && (
                <span className="text-[9px] text-muted-foreground/60 leading-none">{successRate}% success</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Recent sessions ── */}
      <div className="space-y-1.5">
        <SectionLabel
          action={
            onNewChat && (
              <button
                onClick={onNewChat}
                className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60 hover:text-foreground/60 transition-colors"
              >
                <Plus className="w-2.5 h-2.5" />
                Clear
              </button>
            )
          }
        >
          <span className="inline-flex items-center gap-1">
            Recent Chats
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold text-primary">
                {unreadCount} new
              </span>
            )}
          </span>
        </SectionLabel>

        {runtimeUnavailable ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-muted-foreground/50">
            <MessageSquare className="w-5 h-5 opacity-30 grayscale" />
            <p className="text-[11px]">Runtime not installed</p>
          </div>
        ) : sessionsLoading ? (
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
                  onClick={() => onOpenSession?.(s.key)}
                  disabled={!onOpenSession}
                  className={cn(
                    "flex items-start gap-2 w-full px-2.5 py-2 rounded-md border border-solid border-border transition-colors text-left",
                    onOpenSession ? "hover:bg-muted/10" : "cursor-default opacity-60"
                  )}
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
              {runRows.map((row) => {
                const hasTokenActivity = row.inputTokens > 0 || row.outputTokens > 0 || row.cacheReadTokens > 0;
                return (
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
                      {row.totalCostUsd > 0 ? (
                        <span className="text-primary/80">{fmtCost(row.totalCostUsd)}</span>
                      ) : hasTokenActivity ? (
                        <span
                          className="text-muted-foreground/50"
                          title="Tokens were recorded, but this runtime did not report a priced USD cost."
                        >
                          Unpriced
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
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

    </div>
  );
}
