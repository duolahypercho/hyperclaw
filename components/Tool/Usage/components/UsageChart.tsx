"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
  RefreshCw,
  BarChart3,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Code,
  Loader2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useUsage } from "../provider/usageProvider";
import type { GatewayUsageDaily, GatewayUsageTotals, UsageCostPayload } from "$/lib/openclaw-gateway-ws";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(c: number): string {
  return c < 0.01 && c > 0 ? c.toFixed(4) : c.toFixed(2);
}

const chartConfig = {
  input: { label: "Input", color: "hsl(var(--chart-1))" },
  output: { label: "Output", color: "hsl(var(--chart-2))" },
  cacheRead: { label: "Cache read", color: "hsl(var(--chart-3))" },
  cacheWrite: { label: "Cache write", color: "hsl(var(--chart-4))" },
  totalCost: { label: "Cost (USD)", color: "hsl(var(--accent))" },
};

export default function UsageChart() {
  const { usage, loading, error, refetch } = useUsage();

  const chartData = useMemo(() => {
    const daily = usage?.daily;
    if (!daily?.length) return [];
    return daily.map((d: GatewayUsageDaily) => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [usage?.daily]);

  if (loading) {
    return (
      <div className="w-full space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-destructive mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const totals: GatewayUsageTotals | null = usage?.totals ?? null;
  const hasData = (totals && totals.totalTokens > 0) || chartData.length > 0;

  return (
    <div className="w-full space-y-4">
      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <motion.div
            className="rounded-lg border border-border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total cost</span>
            </div>
            <div className="text-xl font-semibold tabular-nums">
              ${formatCost(totals.totalCost)}
            </div>
          </motion.div>
          <motion.div
            className="rounded-lg border border-border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Hash className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted-foreground">Total tokens</span>
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {formatTokens(totals.totalTokens)}
            </div>
          </motion.div>
          <motion.div
            className="rounded-lg border border-border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownToLine className="h-4 w-4 text-[hsl(var(--chart-1))]" />
              <span className="text-xs text-muted-foreground">Input</span>
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {formatTokens(totals.input)}
            </div>
          </motion.div>
          <motion.div
            className="rounded-lg border border-border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.15 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpFromLine className="h-4 w-4 text-[hsl(var(--chart-2))]" />
              <span className="text-xs text-muted-foreground">Output</span>
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {formatTokens(totals.output)}
            </div>
          </motion.div>
        </div>
      )}

      {/* Cost breakdown */}
      {totals && (
        <motion.div
          className="rounded-lg border border-border bg-card p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Cost breakdown</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Input</span>
              <div className="font-medium tabular-nums">${formatCost(totals.inputCost)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Output</span>
              <div className="font-medium tabular-nums">${formatCost(totals.outputCost)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Cache read</span>
              <div className="font-medium tabular-nums">${formatCost(totals.cacheReadCost)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Cache write</span>
              <div className="font-medium tabular-nums">${formatCost(totals.cacheWriteCost)}</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Bar chart by day (tokens stacked) */}
      {chartData.length > 0 && (
        <motion.div
          className="rounded-lg border border-border bg-card p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Usage by day (tokens)</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <ChartContainer config={chartConfig} className="h-48 w-full">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
                tickFormatter={(v) => formatTokens(v)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatTokens(Number(value))}
                  />
                }
              />
              <Bar
                dataKey="input"
                fill="var(--color-input)"
                radius={[2, 2, 0, 0]}
                stackId="a"
              />
              <Bar
                dataKey="output"
                fill="var(--color-output)"
                radius={[2, 2, 0, 0]}
                stackId="a"
              />
              <Bar
                dataKey="cacheRead"
                fill="var(--color-cacheRead)"
                radius={[2, 2, 0, 0]}
                stackId="a"
              />
              <Bar
                dataKey="cacheWrite"
                fill="var(--color-cacheWrite)"
                radius={[2, 2, 0, 0]}
                stackId="a"
              />
            </BarChart>
          </ChartContainer>
        </motion.div>
      )}

      {!hasData && (
        <motion.div
          className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-left max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-2 mb-3 justify-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground shrink-0" />
            <h3 className="text-sm font-semibold text-foreground">No gateway usage data</h3>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Usage and cost are loaded from the OpenClaw gateway (usage.cost). Ensure the gateway is running and connected.
          </p>
          <div className="flex justify-center mt-4">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
