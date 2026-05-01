"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  type ArrCacheEntry,
  dominantCurrency,
  formatARR,
  getStripeArrStatus,
} from "$/lib/stripe-arr-client";
import { AreaChart, Area, Tooltip } from "recharts";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bell,
  Zap,
  Clock,
  Users,
  BarChart2,
  Folder,
  History,
  Plus,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

import { getLayout } from "$/layouts/MainLayout";
import Loading from "$/components/Loading";
import { useUser } from "$/Providers/UserProv";
import { SITE_URL } from "../lib/site-url";
import { SEOProv, type SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { isHubConfigured } from "$/lib/hub-direct";

import {
  ProjectsProvider,
  useProjects,
  type Project,
} from "$/components/Tool/Projects/provider/projectsProvider";
import {
  useEnsembleData,
  useEnsembleAgents,
  useLiveAgents,
  useAgentStatus,
  formatUSD,
  formatTokens,
  type InboxItem,
  type LogEntry,
  type CronJobParsed,
} from "$/components/ensemble";
import type { LiveAgentRow } from "$/components/ensemble/hooks/useLiveAgents";
import { AgentGlyph } from "$/components/ensemble/primitives/AgentGlyph";
import { StatusDot } from "$/components/ensemble/primitives";
import { OPEN_AGENT_CHAT_EVENT } from "$/components/Home/widgets/StatusWidget";

/* ─────────────────────────────── helpers ─────────────────────────────── */

function greet(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

function dateStr(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function relativeTime(ts: number | string | undefined): string {
  if (!ts) return "—";
  let ms: number;
  if (typeof ts === "string") {
    ms = new Date(ts).getTime();
    if (Number.isNaN(ms)) return "—";
  } else {
    // Normalize: Unix seconds → ms
    ms = ts < 1e11 ? ts * 1000 : ts;
  }
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function inboxKindLabel(kind: InboxItem["kind"]): "send" | "review" | "input" {
  if (kind === "approval") return "send";
  if (kind === "error") return "input";
  return "review";
}

/* ──────────────────────────────── page ──────────────────────────────── */

function DashboardInner() {
  const router = useRouter();
  const { session } = useUser() as unknown as {
    session?: { user?: { name?: string; email?: string } };
  };
  const { projects } = useProjects();
  const {
    inboxItems,
    crons,
    logs,
    activity,
    totalSpendToday,
    tokensToday,
    sessionsToday,
    dailySpend,
    status,
    refresh,
    resolveInboxItem,
  } = useEnsembleData();

  const agents = useEnsembleAgents();
  const allLiveAgents = useLiveAgents(agents, activity);

  // Only show real agents — never seed/default fallback data.
  // `agents` is EnsembleAgentView[] which carries the `real` flag;
  // `LiveAgentRow.agent` is narrowed to EnsembleAgent so we filter by id set.
  const realAgentIds = useMemo(
    () => new Set(agents.filter((a) => a.real).map((a) => a.id)),
    [agents]
  );
  const liveAgents = useMemo(
    () => allLiveAgents.filter((a) => realAgentIds.has(a.agent.id)),
    [allLiveAgents, realAgentIds]
  );

  const isLoading = status === "idle" || status === "loading";

  const firstName =
    session?.user?.name?.split(" ")[0] ||
    session?.user?.email?.split("@")[0] ||
    "there";

  const running = liveAgents.filter((a) => a.state === "running");
  const online = liveAgents.filter((a) => a.state !== "error");

  const totalMonthSpend = useMemo(
    () => liveAgents.reduce((s, a) => s + a.costMonth, 0),
    [liveAgents]
  );
  const needsYou = inboxItems.slice(0, 4);
  const activityFeed = logs.slice(0, 6);
  const upNext = crons.slice(0, 4);
  const activeProjects = projects.filter((p) => p.status === "active").slice(0, 4);


  const openAgentChat = useCallback((agentId: string) => {
    window.dispatchEvent(
      new CustomEvent(OPEN_AGENT_CHAT_EVENT, { detail: { agentId } })
    );
  }, []);

  return (
    <div className="ensemble-root px-7 pt-5 pb-10 bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="font-medium text-[26px] tracking-tight text-foreground">
            {greet()}, {firstName}
          </div>
          <div className="text-xs text-muted-foreground font-normal mt-0.5">
            {dateStr()}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isLoading ? (
            <>
              <div className="h-7 w-24 rounded-full bg-muted animate-pulse" />
              <div className="h-7 w-32 rounded-full bg-muted animate-pulse" />
              <div className="h-7 w-20 rounded-full bg-muted animate-pulse" />
            </>
          ) : (
            <>
              <HeroPill tone="attn">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {needsYou.length} need you
              </HeroPill>
              <HeroPill>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {running.length} agents running
              </HeroPill>
              <HeroPill mono>
                {formatUSD(totalSpendToday || 0)} today
              </HeroPill>
            </>
          )}
          <button
            onClick={refresh}
            disabled={status === "loading"}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-card border border-border border-solid text-foreground/80 text-[12.5px] hover:border-muted-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw size={12} className={status === "loading" ? "animate-spin" : ""} />
            {status === "loading" ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Row 1: Needs you / Live now / Today ─────────────────────── */}
      <div className="grid gap-3 mb-3 grid-cols-1 min-[1100px]:grid-cols-[1.3fr_1fr_1fr]">
        {/* Needs you */}
        <Card
          title="Needs you"
          icon={<Bell size={13} />}
          sub={isLoading ? undefined : `${needsYou.length} items`}
        >
          {isLoading ? (
            <SkeletonRows count={3} />
          ) : needsYou.length === 0 ? (
            <EmptyRow>Inbox is clear.</EmptyRow>
          ) : (
            needsYou.map((item) => (
              <NeedsRow
                key={item.id}
                item={item}
                onResolve={resolveInboxItem}
              />
            ))
          )}
        </Card>

        {/* Live now */}
        <Card
          title="Live now"
          icon={<Zap size={13} />}
          sub={isLoading ? undefined : `${running.length} running`}
        >
          {isLoading ? (
            <SkeletonRows count={3} narrow />
          ) : running.length === 0 ? (
            <EmptyRow>No agents running.</EmptyRow>
          ) : (
            running.slice(0, 4).map((row) => (
              <LiveRow
                key={row.agent.id}
                row={row}
                onClick={() => openAgentChat(row.agent.id)}
              />
            ))
          )}
        </Card>

        {/* Today */}
        <Card
          title="Today"
          icon={<Zap size={13} />}
          sub={isLoading ? undefined : formatUSD(totalSpendToday)}
        >
          {isLoading ? (
            <div className="space-y-3 animate-pulse py-1">
              <div className="h-8 w-24 rounded bg-muted" />
              <div className="h-10 rounded bg-muted/40 mt-1" />
              <div className="grid grid-cols-3 gap-1.5 pt-2">
                <div className="space-y-1.5"><div className="h-2 rounded bg-muted/60 w-12" /><div className="h-4 rounded bg-muted w-10" /></div>
                <div className="space-y-1.5"><div className="h-2 rounded bg-muted/60 w-10" /><div className="h-4 rounded bg-muted w-14" /></div>
                <div className="space-y-1.5"><div className="h-2 rounded bg-muted/60 w-14" /><div className="h-4 rounded bg-muted w-10" /></div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-1">
                <div className="font-medium text-[28px] tracking-tight text-foreground">
                  {formatUSD(totalSpendToday)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  spend today
                </div>
              </div>
              <TodaySparkline data={dailySpend} />
              <div className="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-b-0 border-l-0 border-r-0 border-dashed border-border">
                <KpiTiny label="Runs" value={sessionsToday || "—"} />
                <KpiTiny label="Tokens" value={tokensToday > 0 ? formatTokens(tokensToday) : "—"} />
                <KpiTiny
                  label="Avg/run"
                  value={
                    sessionsToday > 0
                      ? formatUSD(totalSpendToday / sessionsToday)
                      : "—"
                  }
                />
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── Row 2: Activity (2fr) · Up next ──────────────────────────── */}
      <div className="grid gap-3 mb-3 grid-cols-1 min-[1100px]:grid-cols-3">
        <div className="min-[1100px]:col-span-2">
          <Card
            title="Activity"
            icon={<History size={13} />}
            sub="live · recent events"
          >
            {isLoading ? (
              <SkeletonRows count={5} />
            ) : activityFeed.length === 0 ? (
              <EmptyRow>No recent activity.</EmptyRow>
            ) : (
              activityFeed.map((log, i) => <ActRow key={i} log={log} />)
            )}
          </Card>
        </div>

        <Card
          title="Up next"
          icon={<Clock size={13} />}
          footer={
            <button className="w-full justify-center inline-flex items-center gap-1.5 h-7 rounded-md bg-card border border-border border-solid text-foreground/80 text-[12.5px] hover:border-muted-foreground/40 hover:text-foreground">
              <Plus size={12} /> Schedule another
            </button>
          }
        >
          {isLoading ? (
            <SkeletonRows count={3} narrow />
          ) : upNext.length === 0 ? (
            <EmptyRow>Nothing scheduled.</EmptyRow>
          ) : (
            upNext.map((c, i) => <UpRow key={c.id || c.name || i} cron={c} />)
          )}
        </Card>
      </div>

      {/* ── Row 3: Team · Company · Pinned ───────────────────────────── */}
      <div className="grid gap-3 grid-cols-1 min-[1100px]:grid-cols-3">
        <Card
          title="Team"
          icon={<Users size={13} />}
          sub={isLoading ? undefined : `${online.length} online`}
        >
          {isLoading ? (
            <SkeletonRows count={4} avatar />
          ) : liveAgents.length === 0 ? (
            <EmptyRow>No agents connected yet.</EmptyRow>
          ) : (
            liveAgents.map((row) => (
              <TeamRow
                key={row.agent.id}
                row={row}
                onClick={() => router.push(`/Tool/Agent/${row.agent.id}`)}
              />
            ))
          )}
        </Card>

        <Card
          title="Company"
          icon={<BarChart2 size={13} />}
          sub={isLoading ? undefined : "metrics · daily"}
        >
          {isLoading ? (
            <div className="space-y-3 animate-pulse py-1">
              {/* ARR row skeleton */}
              <div className="flex justify-between items-center pb-2 border-b border-dashed border-border">
                <div className="space-y-1.5">
                  <div className="h-2 rounded bg-muted/60 w-8" />
                  <div className="h-6 rounded bg-muted w-20" />
                  <div className="h-2 rounded bg-muted/60 w-14" />
                </div>
                <div className="h-8 w-20 rounded bg-muted/40" />
              </div>
              {/* 2-col KPI skeleton */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-2 rounded bg-muted/60 w-14" />
                    <div className="h-5 rounded bg-muted w-10" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <CompanyMetrics
              totalAgents={liveAgents.length}
              runningAgents={running.length}
              monthSpend={totalMonthSpend}
              onOpenSettings={() => router.push("/setting?tab=company")}
            />
          )}
        </Card>

        <Card
          title="Pinned"
          icon={<Folder size={14} />}
          footer={
            <button className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-md bg-primary text-primary-foreground border border-primary text-[12.5px] hover:opacity-90">
              <Plus size={12} /> New project
            </button>
          }
        >
          {isLoading ? (
            <SkeletonRows count={3} narrow />
          ) : activeProjects.length === 0 ? (
            <EmptyRow>No active projects.</EmptyRow>
          ) : (
            activeProjects.map((p) => <PinRow key={p.id} project={p} />)
          )}
        </Card>
      </div>
    </div>
  );
}

/* ──────────────────────────── subcomponents ──────────────────────────── */

function Card({
  title,
  icon,
  sub,
  children,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border border-solid rounded-[10px] overflow-hidden flex flex-col">
      <div className="flex justify-between items-center px-3.5 py-3 border-b border-border border-solid border-t-0 border-l-0 border-r-0">
        <div className="flex items-center gap-2 font-medium text-[13px] text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </div>
        {sub && (
          <div className="font-mono text-[10.5px] text-muted-foreground/80 uppercase tracking-wider">
            {sub}
          </div>
        )}
      </div>
      <div className="px-3 py-2 flex-1 min-h-0">{children}</div>
      {footer && (
        <div className="px-3.5 pb-2.5 pt-2.5 border-t border-solid border-border border-b-0 border-l-0 border-r-0">
          {footer}
        </div>
      )}
    </div>
  );
}

function HeroPill({
  children,
  tone,
  mono,
}: {
  children: React.ReactNode;
  tone?: "attn";
  mono?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-solid text-[12px]";
  if (tone === "attn") {
    return (
      <span
        className={`${base} bg-primary/10 border-primary/30 text-primary font-medium`}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-card border-border text-foreground/80 ${
        mono ? "font-mono text-[11.5px]" : ""
      }`}
    >
      {children}
    </span>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-muted-foreground py-2">{children}</div>;
}

function SkeletonRows({
  count,
  avatar,
  narrow,
}: {
  count: number;
  avatar?: boolean;
  narrow?: boolean;
}) {
  return (
    <div className="space-y-2.5 py-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 animate-pulse">
          {avatar && (
            <div className="w-[22px] h-[22px] rounded-[5px] bg-muted shrink-0" />
          )}
          <div className="flex-1 space-y-1.5">
            <div
              className="h-2.5 rounded bg-muted"
              style={{ width: `${55 + ((i * 23) % 35)}%` }}
            />
            {!narrow && (
              <div
                className="h-2 rounded bg-muted/60"
                style={{ width: `${30 + ((i * 17) % 30)}%` }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiTiny({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] text-muted-foreground/80 uppercase tracking-wider">
        {label}
      </div>
      <div className="font-semibold text-[14px] mt-0.5 text-foreground">
        {value}
      </div>
    </div>
  );
}

const SPEND_CHART_CONFIG = {
  spend: { label: "Spend", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

function SpendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { h: string; spend: number } }> }) {
  if (!active || !payload?.length) return null;
  const { h, spend } = payload[0].payload ?? { h: "", spend: 0 };
  return (
    <div className="border-border bg-background rounded-lg border border-solid px-2.5 py-1.5 text-xs shadow-xl">
      <div className="text-muted-foreground mb-0.5">{h}</div>
      <div className="font-mono font-semibold tabular-nums text-foreground">{formatUSD(spend)}</div>
    </div>
  );
}

function TodaySparkline({ data }: { data: number[] }) {
  const chartData = data.map((v, i) => {
    const h12 = i % 12 === 0 ? 12 : i % 12;
    const ampm = i < 12 ? "am" : "pm";
    return { h: `${h12}${ampm}`, spend: v };
  });

  return (
    <ChartContainer
      config={SPEND_CHART_CONFIG}
      className="h-[52px] w-full my-1"
    >
      <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip content={<SpendTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="spend"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          fill="url(#spendGrad)"
          dot={false}
          activeDot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function NeedsRow({
  item,
  onResolve,
}: {
  item: InboxItem;
  onResolve: (
    id: number,
    resolution: "approved" | "rejected" | "dismissed"
  ) => Promise<void>;
}) {
  const kind = inboxKindLabel(item.kind);
  const kindClass =
    kind === "send"
      ? "bg-primary/10 text-primary border-primary/25"
      : kind === "review"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
      : "bg-secondary text-muted-foreground border-border";

  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-2.5 items-center py-2.5 border-b border-dashed border-border last:border-0">
      <div
        className={`font-mono text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${kindClass}`}
      >
        {kind}
      </div>
      <div className="min-w-0">
        <div className="text-[12.5px] text-foreground truncate">
          {item.title}
        </div>
        <div className="text-[11px] text-muted-foreground/80 truncate">
          <b className="font-medium text-muted-foreground">{item.agent_id}</b>{" "}
          · {relativeTime(item.created_at)}
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onResolve(item.id, "dismissed")}
          className="inline-flex items-center h-6 px-2 rounded bg-card border border-border border-solid text-[11px] text-foreground/80 hover:border-muted-foreground/40"
        >
          Skip
        </button>
        <button
          onClick={() => onResolve(item.id, "approved")}
          className="inline-flex items-center h-6 px-2 rounded bg-primary text-primary-foreground border border-primary text-[11px] hover:opacity-90"
        >
          <CheckCircle2 size={11} />
        </button>
      </div>
    </div>
  );
}

function LiveRow({
  row,
  onClick,
}: {
  row: LiveAgentRow;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full grid grid-cols-[auto_1fr_auto_auto] gap-2.5 items-center py-2 text-left border-b border-dashed border-border last:border-0 hover:text-primary transition-colors"
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-emerald-500"
        style={{ boxShadow: "0 0 0 3px rgb(34 197 94 / 0.25)" }}
      />
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium truncate">{row.agent.name}</div>
        <div className="font-mono text-[10px] text-muted-foreground/80 uppercase tracking-wider truncate">
          {row.agent.runtimeLabel}
        </div>
      </div>
      <AgentGlyph agent={row.agent} size={16} />
      <div className="font-mono text-[10.5px] text-muted-foreground/80">
        {row.sessions} · {formatUSD(row.costMonth)}
      </div>
    </button>
  );
}

function levelColors(level?: string): { message: string; badge: string } {
  const l = level?.toLowerCase();
  if (l === "error" || l === "fatal")
    return { message: "text-destructive", badge: "text-destructive/80 bg-destructive/10 border-destructive/25" };
  if (l === "warn" || l === "warning")
    return { message: "text-amber-600 dark:text-amber-400", badge: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25" };
  if (l === "debug" || l === "trace")
    return { message: "text-muted-foreground/60", badge: "text-muted-foreground/60 bg-transparent border-border" };
  // info or anything else
  return { message: "text-foreground/80", badge: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/25" };
}

function ActRow({ log }: { log: LogEntry }) {
  const colors = levelColors(log.level);
  return (
    <div className="flex gap-1.5 items-baseline py-1.5 text-[12.5px] border-b border-t-0 border-l-0 border-r-0 border-dashed border-border last:border-0">
      <span className="font-mono text-[10.5px] text-muted-foreground/80 w-[50px] shrink-0">
        {relativeTime(log.time ?? log.ts)}
      </span>
      {log.agent_id && (
        <b className="font-medium text-foreground shrink-0">{log.agent_id}</b>
      )}
      <span className={`${colors.message} truncate flex-1`}>
        {log.message || "—"}
      </span>
      {log.level && (
        <span className={`font-mono text-[9.5px] px-1 py-px rounded border uppercase tracking-wider shrink-0 ${colors.badge}`}>
          {log.level}
        </span>
      )}
    </div>
  );
}

function UpRow({ cron }: { cron: CronJobParsed }) {
  const when = cron.schedule || "manual";
  return (
    <div className="grid grid-cols-[70px_1fr] gap-2.5 py-2 border-b border-dashed border-border last:border-0">
      <span className="font-mono text-[12px] text-foreground pt-0.5 truncate">
        {when}
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium truncate">
          {cron.name || "Scheduled run"}
        </div>
        <div className="text-[10.5px] text-muted-foreground/80 mt-0.5 truncate">
          {cron.target || cron.agent || "—"}
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  row,
  onClick,
}: {
  row: LiveAgentRow;
  onClick: () => void;
}) {
  const { state, isWorking } = useAgentStatus(row.agent.id, { state: row.state });
  const subtitle = isWorking
    ? `working · ${row.sessions} sessions`
    : state === "running"
    ? `running · ${row.sessions} sessions`
    : state === "idle"
    ? "online"
    : state === "error"
    ? "error"
    : "idle";
  return (
    <button
      onClick={onClick}
      className="group w-full grid grid-cols-[28px_1fr_auto] gap-2.5 items-center py-2 px-2 cursor-pointer text-left border-b border-l-0 border-r-0 border-t-0 border-dashed border-border last:border-0 rounded transition-colors hover:bg-accent/60 active:bg-accent"
    >
      <div className="relative w-[22px] h-[22px] shrink-0">
        <AgentGlyph agent={row.agent} size={22} />
        <StatusDot state={state} size="xs" corner ringClassName="bg-card" />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] font-medium truncate text-muted-foreground group-hover:text-foreground">
          {row.agent.name}{" "}
          <span className="text-muted-foreground/80 font-normal text-[11.5px]">
            · {row.agent.title}
          </span>
        </div>
        <div className="text-[10.5px] text-muted-foreground/80 truncate flex items-center gap-1.5">
          <span className="font-mono uppercase tracking-wider text-[9.5px] px-1 py-px rounded border border-border border-solid text-foreground/70">
            {row.agent.runtimeLabel}
          </span>
          {subtitle}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[11px] text-muted-foreground transition-opacity group-hover:opacity-50">
          {formatUSD(row.costMonth)}
        </span>
        <ChevronRight
          size={13}
          className="text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
        />
      </div>
    </button>
  );
}

function CompanyMetrics({
  totalAgents,
  runningAgents,
  monthSpend,
  onOpenSettings,
}: {
  totalAgents: number;
  runningAgents: number;
  monthSpend: number;
  onOpenSettings: () => void;
}) {
  const idleAgents = totalAgents - runningAgents;

  const [arrConnected, setArrConnected] = useState(false);
  const [arrCache, setArrCache] = useState<ArrCacheEntry | null>(null);
  const [arrLoaded, setArrLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getStripeArrStatus();
      if (cancelled) return;
      setArrConnected(status.connected);
      setArrCache(status.cache || null);
      setArrLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const top = arrCache ? dominantCurrency(arrCache.by_currency) : null;
  const extraCurrencies = arrCache && top
    ? Object.entries(arrCache.by_currency).filter(
        ([code, amt]) => code !== top.currency && amt > 0
      ).length
    : 0;

  return (
    <div className="flex flex-col">
      {/* ARR metric row */}
      <div className="grid grid-cols-[1fr_auto] gap-2.5 items-center py-2 border-b border-dashed border-border border-t-0 border-l-0 border-r-0">
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] text-muted-foreground/70 uppercase tracking-wider">
            ARR
          </div>
          {!arrLoaded ? (
            <div className="h-6 w-20 rounded bg-muted/50 animate-pulse mt-1" />
          ) : arrConnected && top ? (
            <>
              <div className="font-semibold text-[20px] tracking-tight text-foreground leading-tight mt-0.5 truncate">
                {formatARR(top.amount, top.currency)}
              </div>
              <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">
                {arrCache!.subscriptions} sub{arrCache!.subscriptions === 1 ? "" : "s"}
                {extraCurrencies > 0 && ` · +${extraCurrencies} currency`}
                {arrCache!.live_mode === false && (
                  <span className="ml-1.5 text-amber-500">test</span>
                )}
              </div>
            </>
          ) : arrConnected ? (
            <>
              <div className="font-semibold text-[20px] tracking-tight text-foreground/40 leading-tight mt-0.5">
                —
              </div>
              <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">
                no recurring revenue yet
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-[20px] tracking-tight text-foreground/40 leading-tight mt-0.5">
                —
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="text-[10.5px] text-primary hover:underline mt-0.5"
              >
                Connect Stripe
              </button>
            </>
          )}
        </div>
      </div>

      {/* Agent + spend KPIs */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2.5">
        <CompanyKpi
          label="Agents"
          value={String(totalAgents)}
          detail={
            runningAgents > 0
              ? `${runningAgents} running · ${idleAgents} idle`
              : `${idleAgents} idle`
          }
          dotColor={runningAgents > 0 ? "emerald" : undefined}
        />
        <CompanyKpi
          label="Month spend"
          value={formatUSD(monthSpend)}
          detail="cost to date"
          mono
        />
      </div>
    </div>
  );
}

function CompanyKpi({
  label,
  value,
  detail,
  mono,
  dotColor,
}: {
  label: string;
  value: string;
  detail: string;
  mono?: boolean;
  dotColor?: "emerald";
}) {
  return (
    <div>
      <div className="font-mono text-[9.5px] text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1">
        {dotColor === "emerald" && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        )}
        {label}
      </div>
      <div
        className={`font-semibold text-[18px] tracking-tight mt-0.5 text-foreground leading-none ${
          mono ? "font-mono text-[15px]" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground/70 mt-0.5">{detail}</div>
    </div>
  );
}

function PinRow({ project }: { project: Project }) {
  return (
    <div className="flex justify-between items-center py-2 text-[12.5px] border-b border-t-0 border-l-0 border-r-0 border-dashed border-border last:border-0 hover:text-primary cursor-pointer transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base">{project.emoji || "📦"}</span>
        <span className="truncate font-medium">{project.name}</span>
      </div>
      <div className="font-mono text-[10.5px] text-muted-foreground/80 shrink-0">
        {project.status}
      </div>
    </div>
  );
}

/* ─────────────────────────────── page shell ─────────────────────────────── */

const dashboardSEOSchema: SEOSchema = {
  title: "Hyperclaw — AI company control plane",
  description:
    "Run your AI team: approvals, live activity, spend, and scheduled work in one place.",
  url: `${SITE_URL}/dashboard`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const Dashboard = () => {
  const { status } = useUser();
  const appSchema = useEnsembleToolSchema("Dashboard");

  if (isHubConfigured() && status !== "authenticated") {
    return <Loading text="Loading Hyperclaw..." />;
  }

  return (
    <SEOProv schema={dashboardSEOSchema}>
      <InteractApp appSchema={appSchema}>
        <ProjectsProvider>
          <DashboardInner />
        </ProjectsProvider>
      </InteractApp>
    </SEOProv>
  );
};

Dashboard.getLayout = getLayout;
export default Dashboard;
