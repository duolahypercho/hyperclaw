"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Hash,
  DollarSign,
  Layers,
  Clock,
  RefreshCw,
  Loader2,
  AlertCircle,
  Cpu,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

// ── types ─────────────────────────────────────────────────────────────────────

interface RuntimeBreakdown {
  runtime: string;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  sessionCount: number;
  lastActiveMs: number;
}

interface AgentStats {
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  sessionCount: number;
  lastActiveMs: number;
  runtimes: RuntimeBreakdown[];
}

interface RuntimeStatus {
  runtime: string;
  status: string; // "online" | "offline" | "unknown" | "error"
  version: string;
  checkedAt: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function fmtRelative(ms: number): string {
  if (!ms) return "Never";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "Just now";
}

const RUNTIME_COLORS: Record<string, string> = {
  "claude-code": "bg-violet-500/60",
  "openclaw":    "bg-blue-500/60",
  "hermes":      "bg-emerald-500/60",
  "codex":       "bg-amber-500/60",
};

const RUNTIME_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  "openclaw":    "OpenClaw",
  "hermes":      "Hermes",
  "codex":       "Codex",
};

const RUNTIME_DOT: Record<string, string> = {
  online:  "bg-emerald-400",
  offline: "bg-red-400/70",
  error:   "bg-red-500",
  unknown: "bg-white/20",
};

// ── stat pill ─────────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground truncate leading-none">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground leading-none">{sub}</span>}
    </div>
  );
}

// ── Runtime status card ───────────────────────────────────────────────────────

function RuntimeStatusCard({ statuses }: { statuses: RuntimeStatus[] }) {
  if (statuses.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-3">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Runtime status</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-3 pb-3 space-y-1.5">
        {statuses.map((rs) => (
          <div key={rs.runtime} className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  RUNTIME_DOT[rs.status] ?? RUNTIME_DOT.unknown
                )}
              />
              <span className="font-medium capitalize truncate">
                {RUNTIME_LABELS[rs.runtime] ?? rs.runtime}
              </span>
              {rs.version && (
                <span className="text-muted-foreground/60 font-mono text-[9px] shrink-0">
                  v{rs.version}
                </span>
              )}
            </div>
            <span
              className={cn(
                "capitalize shrink-0 font-medium",
                rs.status === "online"
                  ? "text-emerald-400"
                  : rs.status === "offline"
                  ? "text-muted-foreground/50"
                  : "text-red-400"
              )}
            >
              {rs.status}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const RANGES = [7, 30, 90] as const;

export default function AgentStatsTab({ agentId }: { agentId: string }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [runtimeStatuses, setRuntimeStatuses] = useState<RuntimeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const to = useMemo(() => Date.now(), [rangeDays]);
  const from = useMemo(() => to - rangeDays * 24 * 60 * 60 * 1000, [to, rangeDays]);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, statusRes] = await Promise.all([
        bridgeInvoke("get-agent-stats", { agentId, from, to }) as Promise<{
          success?: boolean; data?: AgentStats;
        }>,
        bridgeInvoke("get-runtime-status", {}) as Promise<
          RuntimeStatus[] | { success?: boolean; data?: RuntimeStatus[] }
        >,
      ]);

      if (statsRes?.success && statsRes.data) {
        setStats(statsRes.data);
      } else {
        setStats(null);
      }

      // get-runtime-status may return array directly or wrapped
      const rawStatuses = Array.isArray(statusRes)
        ? statusRes
        : (statusRes as { data?: RuntimeStatus[] })?.data ?? [];
      setRuntimeStatuses(rawStatuses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [agentId, from, to]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  // Live update: re-fetch when a runtime reports new token usage
  useEffect(() => {
    const handler = () => void fetch();
    window.addEventListener("token.usage.updated", handler);
    return () => window.removeEventListener("token.usage.updated", handler);
  }, [fetch]);

  const maxRuntimeCost = useMemo(
    () => (stats?.runtimes ?? []).reduce((m, r) => Math.max(m, r.totalCostUsd), 0),
    [stats]
  );

  const hasActivity = stats && (stats.totalCostUsd > 0 || stats.sessionCount > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setRangeDays(d)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                rangeDays === d
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => void fetch()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-[11px] text-destructive rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !stats && (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-border/40 bg-muted/10 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Runtime status — always show if available */}
      {!loading && runtimeStatuses.length > 0 && (
        <RuntimeStatusCard statuses={runtimeStatuses} />
      )}

      {/* No usage data notice (not a dead-end — runtime status is above) */}
      {!loading && !error && !hasActivity && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 px-1">
          <Hash className="h-3.5 w-3.5 shrink-0" />
          No token usage recorded in the last {rangeDays} days.
        </div>
      )}

      {/* Stats */}
      {hasActivity && stats && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatPill
              icon={DollarSign}
              label="Total cost"
              value={fmtCost(stats.totalCostUsd)}
            />
            <StatPill
              icon={Hash}
              label="Tokens"
              value={fmt(stats.inputTokens + stats.outputTokens)}
              sub={`${fmt(stats.inputTokens)} in · ${fmt(stats.outputTokens)} out`}
            />
            <StatPill
              icon={Layers}
              label="Sessions"
              value={String(stats.sessionCount)}
            />
            <StatPill
              icon={Clock}
              label="Last active"
              value={fmtRelative(stats.lastActiveMs)}
            />
          </div>

          {/* Token breakdown by runtime */}
          {stats.runtimes.length > 0 && (
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <div className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Token usage by runtime</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-3 pb-3 space-y-2">
                {stats.runtimes.map((r) => (
                  <div key={r.runtime} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                      <span className="truncate font-medium capitalize">
                        {RUNTIME_LABELS[r.runtime] ?? r.runtime}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                        <span className="font-mono font-semibold text-foreground">
                          {fmtCost(r.totalCostUsd)}
                        </span>
                        <span>{r.sessionCount} sess</span>
                      </div>
                    </div>
                    <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          RUNTIME_COLORS[r.runtime] ?? "bg-primary/50"
                        )}
                        style={{
                          width:
                            maxRuntimeCost > 0
                              ? `${(r.totalCostUsd / maxRuntimeCost) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <div className="flex gap-3 text-[9px] text-muted-foreground">
                      <span className="text-blue-400/70">{fmt(r.inputTokens)} in</span>
                      <span className="text-pink-400/70">{fmt(r.outputTokens)} out</span>
                      <span className="ml-auto">{fmtRelative(r.lastActiveMs)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
