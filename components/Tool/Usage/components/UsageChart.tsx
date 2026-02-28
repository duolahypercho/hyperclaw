"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
  RefreshCw,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useUsage } from "../provider/usageProvider";
import { useUsageFiltered } from "../hooks/useUsageFiltered";
import type { GatewayUsageDaily, GatewayUsageTotals } from "$/lib/openclaw-gateway-ws";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(c: number): string {
  return c < 0.01 && c > 0 ? c.toFixed(4) : c.toFixed(2);
}

type ChartRow = GatewayUsageDaily & { label: string };

const chartConfigTokens = {
  input: { label: "Input", color: "hsl(var(--chart-1))" },
  output: { label: "Output", color: "hsl(var(--chart-2))" },
  cacheRead: { label: "Cache read", color: "hsl(var(--chart-3))" },
  cacheWrite: { label: "Cache write", color: "hsl(var(--chart-4))" },
};

const chartConfigCost = {
  inputCost: { label: "Input", color: "hsl(var(--chart-1))" },
  outputCost: { label: "Output", color: "hsl(var(--chart-2))" },
  cacheReadCost: { label: "Cache read", color: "hsl(var(--chart-3))" },
  cacheWriteCost: { label: "Cache write", color: "hsl(var(--chart-4))" },
};

function getClickedDay(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const activePayload = (state as { activePayload?: unknown }).activePayload;
  if (!Array.isArray(activePayload) || activePayload.length === 0) return null;
  const first = activePayload[0];
  if (!first || typeof first !== "object") return null;
  const payload = (first as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object") return null;
  const date = (payload as { date?: unknown }).date;
  return typeof date === "string" && date.trim() ? date : null;
}

export default function UsageChart() {
  const ctx = useUsage();
  const { displayTotals, filteredDaily } = useUsageFiltered(ctx);
  const { loading, error, refetch } = ctx;
  const isTokenMode = ctx.chartMode === "tokens";

  const chartData = useMemo(() => {
    if (!filteredDaily?.length) return [];
    return filteredDaily.map((d: GatewayUsageDaily): ChartRow => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [filteredDaily]);

  if (loading && !displayTotals) {
    return (
      <div className="w-full space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="mt-3 h-7 w-24 rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-4">
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="mt-4 h-56 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-destructive mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totals: GatewayUsageTotals | null = displayTotals ?? null;
  const hasData = (totals && totals.totalTokens > 0) || chartData.length > 0;

  const selectionCount = ctx.selectedDays.length;
  const chartTitle = isTokenMode ? "Usage by day (tokens)" : "Cost by day (USD)";
  const chartConfig = isTokenMode ? chartConfigTokens : chartConfigCost;

  return (
    <div className="w-full space-y-4">
      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 ring-1 ring-primary/15 flex items-center justify-center shrink-0">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground truncate">Total cost</span>
                  </div>
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums tracking-tight">
                  ${formatCost(totals.totalCost)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
          >
            <Card className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-muted/40 ring-1 ring-border/50 flex items-center justify-center shrink-0">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground truncate">Total tokens</span>
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums tracking-tight">
                  {formatTokens(totals.totalTokens)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <Card className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-muted/40 ring-1 ring-border/50 flex items-center justify-center shrink-0">
                    <ArrowDownToLine className="h-4 w-4 text-[hsl(var(--chart-1))]" />
                  </div>
                  <span className="text-xs text-muted-foreground truncate">Input</span>
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums tracking-tight">
                  {formatTokens(totals.input)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.15 }}
          >
            <Card className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-muted/40 ring-1 ring-border/50 flex items-center justify-center shrink-0">
                    <ArrowUpFromLine className="h-4 w-4 text-[hsl(var(--chart-2))]" />
                  </div>
                  <span className="text-xs text-muted-foreground truncate">Output</span>
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums tracking-tight">
                  {formatTokens(totals.output)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Cost breakdown */}
      {totals && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium truncate">Cost breakdown</span>
                </div>
                {totals.missingCostEntries > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {totals.missingCostEntries} missing entries
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Input</div>
                  <div className="mt-1 font-medium tabular-nums">${formatCost(totals.inputCost)}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Output</div>
                  <div className="mt-1 font-medium tabular-nums">${formatCost(totals.outputCost)}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Cache read</div>
                  <div className="mt-1 font-medium tabular-nums">${formatCost(totals.cacheReadCost)}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Cache write</div>
                  <div className="mt-1 font-medium tabular-nums">${formatCost(totals.cacheWriteCost)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Bar chart by day */}
      {chartData.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{chartTitle}</span>
                  {selectionCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {selectionCount} day{selectionCount !== 1 ? "s" : ""} selected
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {selectionCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={ctx.onClearDays}
                      className="h-8 px-2"
                    >
                      Clear selection
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    className="h-8 w-8 p-0"
                    aria-label="Refresh usage"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer
                config={chartConfig}
                className="h-56 w-full cursor-pointer"
              >
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 10, bottom: 6, left: 4 }}
                  barCategoryGap={8}
                  onClick={(state, e) => {
                    const day = getClickedDay(state);
                    if (!day) return;
                    const shiftKey =
                      !!(e && typeof e === "object" && "shiftKey" in e) &&
                      Boolean((e as { shiftKey?: boolean }).shiftKey);
                    ctx.onSelectDay(day, shiftKey);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) =>
                      isTokenMode ? formatTokens(Number(v)) : `$${formatCost(Number(v))}`
                    }
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          const label =
                            (chartConfig as Record<string, { label?: string }>)[
                              String(name)
                            ]?.label ?? String(name);
                          const formatted = isTokenMode
                            ? formatTokens(Number(value))
                            : `$${formatCost(Number(value))}`;
                          return (
                            <div className="flex flex-1 justify-between items-center gap-4">
                              <span className="text-muted-foreground">
                                {label}
                              </span>
                              <span className="text-foreground font-medium tabular-nums">
                                {formatted}
                              </span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  {isTokenMode ? (
                    <>
                      <Bar
                        dataKey="input"
                        fill="var(--color-input)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                      <Bar
                        dataKey="output"
                        fill="var(--color-output)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                      <Bar
                        dataKey="cacheRead"
                        fill="var(--color-cacheRead)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                      <Bar
                        dataKey="cacheWrite"
                        fill="var(--color-cacheWrite)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                    </>
                  ) : (
                    <>
                      <Bar
                        dataKey="inputCost"
                        fill="var(--color-inputCost)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                      <Bar
                        dataKey="outputCost"
                        fill="var(--color-outputCost)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                      <Bar
                        dataKey="cacheReadCost"
                        fill="var(--color-cacheReadCost)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                      <Bar
                        dataKey="cacheWriteCost"
                        fill="var(--color-cacheWriteCost)"
                        radius={[3, 3, 0, 0]}
                        stackId="a"
                      />
                    </>
                  )}
                </BarChart>
              </ChartContainer>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Click a bar to filter days (shift-click to multi-select).</span>
                <span className="tabular-nums">{chartData.length} day{chartData.length !== 1 ? "s" : ""}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!hasData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card className="border-dashed bg-muted/10">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto ring-1 ring-border/50">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-foreground">No gateway usage data</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl mx-auto">
                Usage and cost are loaded from the OpenClaw gateway (usage.cost and sessions.usage). Ensure the gateway is running and connected.
              </p>
              <div className="flex justify-center mt-4">
                <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
