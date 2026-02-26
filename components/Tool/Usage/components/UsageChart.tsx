"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
  RefreshCw,
  Bot,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Bug,
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
import type { OpenClawUsageResult } from "$/types/electron";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const chartConfig = {
  inputTokens: {
    label: "Input",
    color: "hsl(var(--chart-1))",
  },
  outputTokens: {
    label: "Output",
    color: "hsl(var(--chart-2))",
  },
  totalTokens: {
    label: "Total",
    color: "hsl(var(--accent))",
  },
};

export default function UsageChart() {
  const { usage, loading, error, refetch } = useUsage();
  const [debugOpen, setDebugOpen] = useState(false);

  const chartData = useMemo(() => {
    if (!usage?.byDay?.length) return [];
    return usage.byDay.map((d) => ({
      date: d.date,
      label: new Date(d.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      totalTokens: d.totalTokens,
    }));
  }, [usage?.byDay]);

  if (loading) {
    return (
      <div className="w-full space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
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

  const totals = usage?.totals ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  const byAgent = usage?.byAgent ?? [];

  return (
    <div className="w-full space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <motion.div
          className="rounded-lg border border-border bg-card p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownToLine className="h-4 w-4 text-[hsl(var(--chart-1))]" />
            <span className="text-xs text-muted-foreground">Input tokens</span>
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {formatTokens(totals.inputTokens)}
          </div>
        </motion.div>
        <motion.div
          className="rounded-lg border border-border bg-card p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpFromLine className="h-4 w-4 text-[hsl(var(--chart-2))]" />
            <span className="text-xs text-muted-foreground">Output tokens</span>
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {formatTokens(totals.outputTokens)}
          </div>
        </motion.div>
        <motion.div
          className="rounded-lg border border-border bg-card p-4 col-span-2 sm:col-span-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Hash className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Total tokens</span>
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {formatTokens(totals.totalTokens)}
          </div>
        </motion.div>
      </div>

      {/* Bar chart by day */}
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
              <span className="text-sm font-medium">Usage by day</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 h-4" />
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
                dataKey="inputTokens"
                fill="var(--color-inputTokens)"
                radius={[2, 2, 0, 0]}
                stackId="a"
              />
              <Bar
                dataKey="outputTokens"
                fill="var(--color-outputTokens)"
                radius={[2, 2, 0, 0]}
                stackId="a"
              />
            </BarChart>
          </ChartContainer>
        </motion.div>
      )}

      {/* By agent */}
      {byAgent.length > 0 && (
        <motion.div
          className="rounded-lg border border-border bg-card p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">By agent</span>
          </div>
          <ul className="space-y-2">
            {byAgent.map((a) => (
              <li
                key={a.agentId}
                className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md bg-muted/50"
              >
                <span className="font-medium truncate">
                  {a.agentId === "_global" ? "Global" : a.agentId}
                </span>
                <span className="tabular-nums text-muted-foreground shrink-0 ml-2">
                  {formatTokens(a.totalTokens)} total
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {usage?.debug?.files?.length ? (
        <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
          <motion.div
            className="rounded-lg border border-border bg-card overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {debugOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <Bug className="h-4 w-4 shrink-0" />
                <span>Debug: {usage.debug.files.length} session files scanned</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Files read and record/token counts per file. Use this to verify every agents folder is included.
                </p>
                <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                  {usage.debug.files.map((f, i) => (
                    <li
                      key={`${f.path}-${i}`}
                      className="text-xs font-mono flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                    >
                      <span className="text-muted-foreground truncate max-w-[280px]" title={f.path}>
                        {f.path.replace(/^.*\/\.openclaw\//, "~/.openclaw/")}
                      </span>
                      <span className="text-foreground shrink-0">agent: {f.agentId}</span>
                      <span className="text-muted-foreground shrink-0">
                        {f.records} records, {formatTokens(f.totalTokens)} tokens
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CollapsibleContent>
          </motion.div>
        </Collapsible>
      ) : null}

      {!usage?.byDay?.length && !byAgent.length && totals.totalTokens === 0 && (
        <motion.div
          className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-left max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-2 mb-3 justify-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground shrink-0" />
            <h3 className="text-sm font-semibold text-foreground">No token usage data yet</h3>
          </div>
          {usage?.hint && (
            <p className="text-sm text-amber-600 dark:text-amber-500 mb-3 rounded-md bg-amber-500/10 dark:bg-amber-500/10 px-3 py-2 border border-amber-500/20">
              {usage.hint}
            </p>
          )}
          <p className="text-sm text-muted-foreground mb-3">
            Usage is read from these paths (create the file if it doesn’t exist):
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 mb-4 list-disc list-inside">
            <li><code className="bg-muted rounded px-1">~/.openclaw/sessions/sessions.json</code> — global</li>
            <li><code className="bg-muted rounded px-1">~/.openclaw/agents/&lt;agentId&gt;/sessions/sessions.json</code> — per agent</li>
            <li><code className="bg-muted rounded px-1">~/.openclaw/workspace/&lt;name&gt;/sessions/sessions.json</code> — per workspace</li>
          </ul>
          <p className="text-xs text-muted-foreground mb-2">Expected format: JSON array of objects with <code className="bg-muted rounded px-0.5">inputTokens</code>, <code className="bg-muted rounded px-0.5">outputTokens</code>, <code className="bg-muted rounded px-0.5">totalTokens</code>, and optional <code className="bg-muted rounded px-0.5">createdAt</code> or <code className="bg-muted rounded px-0.5">timestamp</code> for grouping by day.</p>
          <pre className="text-[11px] bg-muted/80 rounded-md p-3 overflow-x-auto border border-border/50">
{`[
  { "inputTokens": 100, "outputTokens": 50, "totalTokens": 150, "createdAt": "2025-02-25T12:00:00Z" },
  { "inputTokens": 200, "outputTokens": 80, "timestamp": 1730000000000 }
]`}
          </pre>
        </motion.div>
      )}
    </div>
  );
}
