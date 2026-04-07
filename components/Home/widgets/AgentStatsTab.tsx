"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Hash,
  DollarSign,
  Layers,
  MessageSquare,
  ShieldCheck,
  Database,
  Cpu,
  BarChart3,
  Clock,
  RefreshCw,
  Loader2,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  loadUsageWs,
  type SessionsUsageResult,
  type SessionsUsageEntry,
} from "$/lib/openclaw-gateway-ws";
import {
  buildAggregatesFromSessions,
  buildUsageMosaicStats,
  buildInsightStats,
  formatTokens,
  formatCost,
} from "$/components/Tool/Usage/lib/usage-metrics";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
}

function shortDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon,
  label,
  value,
  sub,
  severity,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  severity?: "good" | "warn" | "bad" | "neutral";
}) {
  const iconClass =
    severity === "good"
      ? "text-emerald-500"
      : severity === "warn"
        ? "text-amber-500"
        : severity === "bad"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3 shrink-0", iconClass)} />
        <span className="text-[10px] text-muted-foreground truncate leading-none">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums leading-tight">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground leading-none">{sub}</span>}
    </div>
  );
}

const chartConfig = {
  tokens: { label: "Tokens", color: "hsl(var(--primary))" },
};

// ── main component ────────────────────────────────────────────────────────────

export default function AgentStatsTab({ agentId }: { agentId: string }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [chartMode, setChartMode] = useState<"tokens" | "cost">("tokens");
  const [data, setData] = useState<SessionsUsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getDateRange(rangeDays);
      const { sessionsUsage } = await loadUsageWs({ startDate, endDate, timeZone: "local" });
      setData(sessionsUsage ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage");
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  // Filter sessions for this agent.
  // agentId is optional on the entry — fall back to parsing from key: "agent:{agentId}:{sessionName}"
  const agentSessions = useMemo<SessionsUsageEntry[]>(
    () =>
      (data?.sessions ?? []).filter((s) => {
        if (s.agentId) return s.agentId === agentId;
        // Parse from key format "agent:{agentId}:{rest}"
        const parts = s.key.split(":");
        return parts.length >= 2 && parts[1] === agentId;
      }),
    [data, agentId]
  );

  const agg = useMemo(
    () => buildAggregatesFromSessions(agentSessions),
    [agentSessions]
  );

  const totals = useMemo(() => {
    // Prefer summing from session-level usage (most accurate)
    const sessionsWithUsage = agentSessions.filter((s) => s.usage);
    if (sessionsWithUsage.length > 0) {
      return {
        input: sessionsWithUsage.reduce((acc, x) => acc + (x.usage!.input), 0),
        output: sessionsWithUsage.reduce((acc, x) => acc + (x.usage!.output), 0),
        cacheRead: sessionsWithUsage.reduce((acc, x) => acc + (x.usage!.cacheRead), 0),
        cacheWrite: sessionsWithUsage.reduce((acc, x) => acc + (x.usage!.cacheWrite), 0),
        totalTokens: sessionsWithUsage.reduce((acc, x) => acc + (x.usage!.totalTokens), 0),
        totalCost: sessionsWithUsage.reduce((acc, x) => acc + (x.usage!.totalCost), 0),
        inputCost: sessionsWithUsage.reduce((acc, x) => acc + (x.usage?.inputCost ?? 0), 0),
        outputCost: sessionsWithUsage.reduce((acc, x) => acc + (x.usage?.outputCost ?? 0), 0),
        cacheReadCost: sessionsWithUsage.reduce((acc, x) => acc + (x.usage?.cacheReadCost ?? 0), 0),
        cacheWriteCost: sessionsWithUsage.reduce((acc, x) => acc + (x.usage?.cacheWriteCost ?? 0), 0),
        missingCostEntries: sessionsWithUsage.reduce((acc, x) => acc + (x.usage!.missingCostEntries), 0),
      };
    }
    // Fall back to server-side per-agent aggregate
    const agentEntry = data?.aggregates?.byAgent?.find((a) => a.agentId === agentId);
    return agentEntry?.totals ?? null;
  }, [agentSessions, data?.aggregates, agentId]);

  const insights = useMemo(
    () => (totals ? buildInsightStats(totals, agg, agentSessions.length) : null),
    [totals, agg, agentSessions.length]
  );

  // Build daily chart data from agg.daily
  const chartData = useMemo(() => {
    if (agg.daily.length > 0) return agg.daily.map((d) => ({
      date: d.date,
      label: shortDayLabel(d.date),
      value: chartMode === "tokens" ? Math.round(d.tokens) : d.cost,
    }));
    // If no daily from session data, try to build from daily cost payload (not agent-filtered)
    return [];
  }, [agg.daily, chartMode]);

  // Mosaic buckets
  const mosaicBuckets = useMemo(
    () => buildUsageMosaicStats(agentSessions, "local"),
    [agentSessions]
  );

  const peakHour = useMemo(() => {
    const best = mosaicBuckets.reduce(
      (best, b) => (b.tokens > best.tokens ? b : best),
      mosaicBuckets[0]
    );
    return best?.tokens > 0 ? best.hour : null;
  }, [mosaicBuckets]);

  const hasActivity = totals && totals.totalTokens > 0;
  const errorRate = insights?.errorRate ?? 0;
  const responseRate = 1 - errorRate;
  const cacheHitRate = insights?.cacheHitRate ?? 0;

  const errorSeverity: "good" | "warn" | "bad" =
    errorRate === 0 ? "good" : errorRate < 0.05 ? "warn" : "bad";
  const cacheSeverity: "good" | "warn" | "bad" =
    cacheHitRate > 0.5 ? "good" : cacheHitRate > 0.2 ? "warn" : "bad";

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {([7, 30, 90] as const).map((d) => (
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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChartMode(chartMode === "tokens" ? "cost" : "tokens")}
            className="px-2 py-0.5 text-[10px] font-medium rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            {chartMode === "tokens" ? "$ cost" : "# tokens"}
          </button>
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
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-[11px] text-destructive rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-border/40 bg-muted/10 animate-pulse" />
            ))}
          </div>
          <div className="h-32 rounded-lg border border-border/40 bg-muted/10 animate-pulse" />
        </div>
      )}

      {/* No data */}
      {!loading && !error && !hasActivity && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <BarChart3 className="h-8 w-8 opacity-30" />
          <p className="text-xs">No usage data for this agent in the last {rangeDays} days.</p>
        </div>
      )}

      {/* Stats */}
      {hasActivity && totals && insights && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatPill
              icon={Hash}
              label="Total tokens"
              value={formatTokens(totals.totalTokens)}
              sub={`${formatTokens(totals.input)} in · ${formatTokens(totals.output)} out`}
            />
            <StatPill
              icon={DollarSign}
              label="Total cost"
              value={`$${formatCost(totals.totalCost)}`}
              sub={`$${formatCost(insights.avgCostPerMsg, 4)} / msg`}
            />
            <StatPill
              icon={Layers}
              label="Sessions"
              value={String(agentSessions.length)}
              sub={peakHour !== null ? `Peak: ${formatHour(peakHour)}` : undefined}
            />
            <StatPill
              icon={MessageSquare}
              label="Messages"
              value={String(agg.messages.total)}
              sub={`${agg.messages.user} user · ${agg.messages.assistant} assist`}
            />
            <StatPill
              icon={ShieldCheck}
              label="Response rate"
              value={`${(responseRate * 100).toFixed(1)}%`}
              sub={`${agg.messages.errors} error${agg.messages.errors !== 1 ? "s" : ""}`}
              severity={errorSeverity === "good" ? "good" : errorSeverity === "warn" ? "warn" : "bad"}
            />
            <StatPill
              icon={Database}
              label="Cache hit rate"
              value={`${(cacheHitRate * 100).toFixed(1)}%`}
              sub={`${formatTokens(totals.cacheRead)} cache reads`}
              severity={cacheSeverity}
            />
          </div>

          {/* Daily usage chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {chartMode === "tokens" ? "Tokens" : "Cost"} over time
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-2 pb-2">
                <ChartContainer config={chartConfig} className="h-[110px] w-full">
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        chartMode === "tokens" ? formatTokens(v) : `$${formatCost(v)}`
                      }
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => {
                            const n = typeof value === "number" ? value : Number(value);
                            return chartMode === "tokens" ? formatTokens(n) : `$${formatCost(n)}`;
                          }}
                        />
                      }
                    />
                    <Bar
                      dataKey="value"
                      name={chartMode === "tokens" ? "Tokens" : "Cost ($)"}
                      fill="hsl(var(--primary))"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Hourly activity mosaic */}
          {mosaicBuckets.some((b) => b.tokens > 0) && (
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Activity by hour</span>
                  {peakHour !== null && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">
                      Peak {formatHour(peakHour)}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-3 pb-3">
                <TooltipProvider delayDuration={100}>
                  <div className="flex gap-0.5 flex-wrap">
                    {mosaicBuckets.map((bucket) => (
                      <Tooltip key={bucket.hour}>
                        <TooltipTrigger asChild>
                          <div
                            className="relative flex flex-col items-center gap-0.5 rounded-sm cursor-default"
                            style={{ width: "calc((100% - 23 * 2px) / 24)" }}
                          >
                            <div
                              className="w-full rounded-sm transition-all duration-200"
                              style={{
                                height: `${Math.max(bucket.intensity * 24, 2)}px`,
                                backgroundColor:
                                  bucket.intensity > 0
                                    ? `hsl(var(--primary) / ${0.12 + bucket.intensity * 0.78})`
                                    : "hsl(var(--muted))",
                              }}
                            />
                            <span className="text-[8px] text-muted-foreground tabular-nums leading-none">
                              {bucket.hour}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="font-medium">{formatHour(bucket.hour)}</div>
                          <div className="text-muted-foreground">
                            {formatTokens(Math.round(bucket.tokens))} tokens
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>
          )}

          {/* Models breakdown */}
          {agg.byModel.length > 0 && (
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <div className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Models used</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-3 pb-3 space-y-1.5">
                {agg.byModel.slice(0, 5).map((m, i) => {
                  const label = [m.provider, m.model].filter(Boolean).join(" / ") || "Unknown";
                  const value =
                    chartMode === "tokens"
                      ? formatTokens(m.totals.totalTokens)
                      : `$${formatCost(m.totals.totalCost)}`;
                  const maxVal = agg.byModel[0]
                    ? chartMode === "tokens"
                      ? agg.byModel[0].totals.totalTokens
                      : agg.byModel[0].totals.totalCost
                    : 1;
                  const pct =
                    maxVal > 0
                      ? ((chartMode === "tokens"
                          ? m.totals.totalTokens
                          : m.totals.totalCost) /
                          maxVal) *
                        100
                      : 0;

                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                        <span className="truncate text-foreground">{label}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-medium tabular-nums">{value}</span>
                          <span className="text-muted-foreground">
                            {m.count} sess
                          </span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/50 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
