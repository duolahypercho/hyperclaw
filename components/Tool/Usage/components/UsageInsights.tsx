"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Wrench,
  AlertTriangle,
  Hash,
  DollarSign,
  Layers,
  Gauge,
  ShieldAlert,
  Database,
  Cpu,
  Server,
  User,
  Radio,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUsage } from "../provider/usageProvider";
import { useUsageFiltered } from "../hooks/useUsageFiltered";
import {
  buildAggregatesFromSessions,
  buildInsightStats,
  formatTokens,
  formatCost,
  type UsageAggregate,
} from "../lib/usage-metrics";
import type { GatewayUsageTotals } from "$/lib/openclaw-gateway-ws";

function StatCard({
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
  const severityClass =
    severity === "good"
      ? "text-emerald-500"
      : severity === "warn"
        ? "text-amber-500"
        : severity === "bad"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", severityClass)} />
        <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function InsightList({
  title,
  icon: Icon,
  items,
  mode,
}: {
  title: string;
  icon: React.ElementType;
  items: Array<{ label: string; value: string; sub?: string }>;
  mode: "tokens" | "cost";
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="space-y-1.5">
        {items.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs min-w-0">
            <span className="truncate text-foreground">{item.label}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-medium tabular-nums">{item.value}</span>
              {item.sub && <span className="text-muted-foreground">{item.sub}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsageInsights() {
  const ctx = useUsage();
  const { filteredSessions, displayTotals } = useUsageFiltered(ctx);
  const totals = displayTotals;

  const aggregates = useMemo(
    () => buildAggregatesFromSessions(filteredSessions, ctx.sessionsUsage?.aggregates),
    [filteredSessions, ctx.sessionsUsage?.aggregates]
  );

  const insights = useMemo(
    () => totals ? buildInsightStats(totals, aggregates, filteredSessions.length) : null,
    [totals, aggregates, filteredSessions.length]
  );

  if (!totals || totals.totalTokens === 0) return null;

  const isTokenMode = ctx.chartMode === "tokens";
  const msg = aggregates.messages;

  const errorSeverity: "good" | "warn" | "bad" =
    insights!.errorRate === 0 ? "good" : insights!.errorRate < 0.05 ? "warn" : "bad";
  const cacheSeverity: "good" | "warn" | "bad" =
    insights!.cacheHitRate > 0.5 ? "good" : insights!.cacheHitRate > 0.2 ? "warn" : "bad";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.25 }}
      className="space-y-4"
    >
      {/* Summary stats grid */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Overview</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <StatCard
              icon={MessageSquare}
              label="Messages"
              value={String(msg.total)}
              sub={`${msg.user} user · ${msg.assistant} assistant`}
            />
            <StatCard
              icon={Wrench}
              label="Tool Calls"
              value={String(aggregates.tools.totalCalls)}
              sub={`${aggregates.tools.uniqueTools} unique tools`}
            />
            <StatCard
              icon={AlertTriangle}
              label="Errors"
              value={String(msg.errors)}
              sub={msg.toolResults > 0 ? `${msg.toolResults} tool results` : undefined}
              severity={msg.errors === 0 ? "good" : "bad"}
            />
            <StatCard
              icon={Hash}
              label="Avg Tokens/Msg"
              value={formatTokens(Math.round(insights!.avgTokensPerMsg))}
            />
            <StatCard
              icon={DollarSign}
              label="Avg Cost/Msg"
              value={`$${formatCost(insights!.avgCostPerMsg, 4)}`}
            />
            <StatCard
              icon={Layers}
              label="Sessions"
              value={String(filteredSessions.length)}
            />
            <StatCard
              icon={ShieldAlert}
              label="Error Rate"
              value={`${(insights!.errorRate * 100).toFixed(1)}%`}
              severity={errorSeverity}
            />
            <StatCard
              icon={Database}
              label="Cache Hit Rate"
              value={`${(insights!.cacheHitRate * 100).toFixed(1)}%`}
              severity={cacheSeverity}
            />
          </div>
        </CardContent>
      </Card>

      {/* Insight cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <InsightList
          title="Top Models"
          icon={Cpu}
          mode={ctx.chartMode}
          items={aggregates.byModel.map((m) => ({
            label: m.model ?? "unknown",
            value: isTokenMode ? formatTokens(m.totals.totalTokens) : `$${formatCost(m.totals.totalCost)}`,
            sub: `${m.count} session${m.count !== 1 ? "s" : ""}`,
          }))}
        />
        <InsightList
          title="Top Providers"
          icon={Server}
          mode={ctx.chartMode}
          items={aggregates.byProvider.map((p) => ({
            label: p.provider ?? "unknown",
            value: isTokenMode ? formatTokens(p.totals.totalTokens) : `$${formatCost(p.totals.totalCost)}`,
            sub: `${p.count} session${p.count !== 1 ? "s" : ""}`,
          }))}
        />
        <InsightList
          title="Top Tools"
          icon={Wrench}
          mode={ctx.chartMode}
          items={aggregates.tools.tools.map((t) => ({
            label: t.name,
            value: `${t.count}`,
            sub: "calls",
          }))}
        />
        <InsightList
          title="Top Agents"
          icon={User}
          mode={ctx.chartMode}
          items={aggregates.byAgent.map((a) => ({
            label: a.agentId,
            value: isTokenMode ? formatTokens(a.totals.totalTokens) : `$${formatCost(a.totals.totalCost)}`,
          }))}
        />
        <InsightList
          title="Top Channels"
          icon={Radio}
          mode={ctx.chartMode}
          items={aggregates.byChannel.map((c) => ({
            label: c.channel,
            value: isTokenMode ? formatTokens(c.totals.totalTokens) : `$${formatCost(c.totals.totalCost)}`,
          }))}
        />
      </div>
    </motion.div>
  );
}
