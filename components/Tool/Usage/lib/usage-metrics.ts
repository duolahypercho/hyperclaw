/**
 * Usage metrics, aggregation, and formatting helpers.
 * Ported from OpenClaw usage-metrics.ts — adapted for React/Hyperclaw.
 */

import type { SessionsUsageEntry, GatewayUsageTotals } from "$/lib/openclaw-gateway-ws";
import { getZonedHour, setToHourEnd } from "./usage-helpers";

// ── Formatting ──

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(c: number, decimals = 2): string {
  if (c < 0.01 && c > 0) return c.toFixed(4);
  return c.toFixed(decimals);
}

export function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Aggregation types ──

export interface UsageAggregate {
  messages: { total: number; user: number; assistant: number; toolCalls: number; toolResults: number; errors: number };
  tools: { totalCalls: number; uniqueTools: number; tools: Array<{ name: string; count: number }> };
  byModel: Array<{ provider?: string; model?: string; count: number; totals: GatewayUsageTotals }>;
  byProvider: Array<{ provider?: string; count: number; totals: GatewayUsageTotals }>;
  byAgent: Array<{ agentId: string; totals: GatewayUsageTotals }>;
  byChannel: Array<{ channel: string; totals: GatewayUsageTotals }>;
  daily: Array<{ date: string; tokens: number; cost: number; messages: number; toolCalls: number; errors: number }>;
}

export interface InsightStats {
  avgTokensPerMsg: number;
  avgCostPerMsg: number;
  throughputTokensPerMin: number;
  throughputCostPerMin: number;
  errorRate: number;
  cacheHitRate: number;
  avgSessionDurationMs: number;
  totalActiveDurationMs: number;
}

export interface MosaicHourBucket {
  hour: number;
  tokens: number;
  cost: number;
  intensity: number; // 0–1
}

export interface PeakErrorEntry {
  hour: number;
  errors: number;
  messages: number;
  errorRate: number;
}

// ── Build aggregates from sessions ──

function emptyTotals(): GatewayUsageTotals {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
    totalTokens: 0, totalCost: 0,
    inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0,
    missingCostEntries: 0,
  };
}

function addTotals(acc: GatewayUsageTotals, u: GatewayUsageTotals): void {
  acc.input += u.input;
  acc.output += u.output;
  acc.cacheRead += u.cacheRead;
  acc.cacheWrite += u.cacheWrite;
  acc.totalTokens += u.totalTokens;
  acc.totalCost += u.totalCost;
  acc.inputCost += u.inputCost ?? 0;
  acc.outputCost += u.outputCost ?? 0;
  acc.cacheReadCost += u.cacheReadCost ?? 0;
  acc.cacheWriteCost += u.cacheWriteCost ?? 0;
  acc.missingCostEntries += u.missingCostEntries ?? 0;
}

type SessionUsage = SessionsUsageEntry["usage"] & {
  messageCounts?: { total?: number; user?: number; assistant?: number; errors?: number; toolCalls?: number; toolResults?: number };
  toolUsage?: { totalCalls?: number; uniqueTools?: number; tools?: Array<{ name: string; count?: number }> };
  modelUsage?: Array<{ provider?: string; model?: string; count?: number; totals?: GatewayUsageTotals }>;
  firstActivity?: number;
  lastActivity?: number;
  activityDates?: string[];
};

export function buildAggregatesFromSessions(
  sessions: SessionsUsageEntry[],
  fallback?: {
    byModel?: Array<{ provider?: string; model?: string; count: number; totals: GatewayUsageTotals }>;
    byProvider?: Array<{ provider?: string; count: number; totals: GatewayUsageTotals }>;
    byAgent?: Array<{ agentId: string; totals: GatewayUsageTotals }>;
    byChannel?: Array<{ channel: string; totals: GatewayUsageTotals }>;
    tools?: { totalCalls: number; uniqueTools: number; tools: Array<{ name: string; count: number }> };
    messages?: { total: number; user: number; assistant: number; toolCalls: number; toolResults: number; errors: number };
  }
): UsageAggregate {
  const messages = { total: 0, user: 0, assistant: 0, toolCalls: 0, toolResults: 0, errors: 0 };
  const toolMap = new Map<string, number>();
  let totalToolCalls = 0;
  const modelMap = new Map<string, { provider?: string; model?: string; count: number; totals: GatewayUsageTotals }>();
  const providerMap = new Map<string, { provider?: string; count: number; totals: GatewayUsageTotals }>();
  const agentMap = new Map<string, GatewayUsageTotals>();
  const channelMap = new Map<string, GatewayUsageTotals>();
  const dailyMap = new Map<string, { tokens: number; cost: number; messages: number; toolCalls: number; errors: number }>();

  for (const session of sessions) {
    const u = session.usage as SessionUsage | null;
    if (!u) continue;

    // Messages
    const mc = u.messageCounts;
    if (mc) {
      messages.total += mc.total ?? 0;
      messages.user += mc.user ?? 0;
      messages.assistant += mc.assistant ?? 0;
      messages.toolCalls += mc.toolCalls ?? 0;
      messages.toolResults += mc.toolResults ?? 0;
      messages.errors += mc.errors ?? 0;
    }

    // Tools
    const tu = u.toolUsage;
    if (tu) {
      totalToolCalls += tu.totalCalls ?? 0;
      for (const t of tu.tools ?? []) {
        toolMap.set(t.name, (toolMap.get(t.name) ?? 0) + (t.count ?? 1));
      }
    }

    // Models
    const mu = u.modelUsage;
    if (mu) {
      for (const entry of mu) {
        const key = `${entry.provider ?? ""}|${entry.model ?? ""}`;
        const existing = modelMap.get(key);
        if (existing) {
          existing.count += entry.count ?? 1;
          if (entry.totals) addTotals(existing.totals, entry.totals);
        } else {
          modelMap.set(key, {
            provider: entry.provider,
            model: entry.model,
            count: entry.count ?? 1,
            totals: entry.totals ? { ...entry.totals } : emptyTotals(),
          });
        }
      }
    } else if (session.model || session.modelProvider) {
      const key = `${session.modelProvider ?? ""}|${session.model ?? ""}`;
      const existing = modelMap.get(key);
      const sessionTotals: GatewayUsageTotals = {
        input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite,
        totalTokens: u.totalTokens, totalCost: u.totalCost,
        inputCost: u.inputCost ?? 0, outputCost: u.outputCost ?? 0,
        cacheReadCost: u.cacheReadCost ?? 0, cacheWriteCost: u.cacheWriteCost ?? 0,
        missingCostEntries: u.missingCostEntries ?? 0,
      };
      if (existing) {
        existing.count += 1;
        addTotals(existing.totals, sessionTotals);
      } else {
        modelMap.set(key, { provider: session.modelProvider, model: session.model, count: 1, totals: sessionTotals });
      }
    }

    // Provider
    const prov = session.modelProvider ?? (session as { providerOverride?: string }).providerOverride;
    if (prov) {
      const existing = providerMap.get(prov);
      const sessionTotals: GatewayUsageTotals = {
        input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite,
        totalTokens: u.totalTokens, totalCost: u.totalCost,
        inputCost: u.inputCost ?? 0, outputCost: u.outputCost ?? 0,
        cacheReadCost: u.cacheReadCost ?? 0, cacheWriteCost: u.cacheWriteCost ?? 0,
        missingCostEntries: u.missingCostEntries ?? 0,
      };
      if (existing) {
        existing.count += 1;
        addTotals(existing.totals, sessionTotals);
      } else {
        providerMap.set(prov, { provider: prov, count: 1, totals: sessionTotals });
      }
    }

    // Agent
    if (session.agentId) {
      const existing = agentMap.get(session.agentId) ?? emptyTotals();
      addTotals(existing, {
        input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite,
        totalTokens: u.totalTokens, totalCost: u.totalCost,
        inputCost: u.inputCost ?? 0, outputCost: u.outputCost ?? 0,
        cacheReadCost: u.cacheReadCost ?? 0, cacheWriteCost: u.cacheWriteCost ?? 0,
        missingCostEntries: u.missingCostEntries ?? 0,
      });
      agentMap.set(session.agentId, existing);
    }

    // Channel
    if (session.channel) {
      const existing = channelMap.get(session.channel) ?? emptyTotals();
      addTotals(existing, {
        input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite,
        totalTokens: u.totalTokens, totalCost: u.totalCost,
        inputCost: u.inputCost ?? 0, outputCost: u.outputCost ?? 0,
        cacheReadCost: u.cacheReadCost ?? 0, cacheWriteCost: u.cacheWriteCost ?? 0,
        missingCostEntries: u.missingCostEntries ?? 0,
      });
      channelMap.set(session.channel, existing);
    }

    // Daily
    for (const date of u.activityDates ?? []) {
      const existing = dailyMap.get(date) ?? { tokens: 0, cost: 0, messages: 0, toolCalls: 0, errors: 0 };
      // Proportionally distribute across activity dates
      const dateCount = (u.activityDates ?? []).length || 1;
      existing.tokens += u.totalTokens / dateCount;
      existing.cost += u.totalCost / dateCount;
      existing.messages += (mc?.total ?? 0) / dateCount;
      existing.toolCalls += (tu?.totalCalls ?? 0) / dateCount;
      existing.errors += (mc?.errors ?? 0) / dateCount;
      dailyMap.set(date, existing);
    }
  }

  // If we have no session-level data, use fallback aggregates
  const hasSessionData = sessions.some((s) => s.usage);
  if (!hasSessionData && fallback) {
    return {
      messages: fallback.messages ?? messages,
      tools: fallback.tools ?? { totalCalls: 0, uniqueTools: 0, tools: [] },
      byModel: fallback.byModel ?? [],
      byProvider: fallback.byProvider ?? [],
      byAgent: fallback.byAgent ?? [],
      byChannel: fallback.byChannel ?? [],
      daily: [],
    };
  }

  const tools = Array.from(toolMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    messages,
    tools: { totalCalls: totalToolCalls, uniqueTools: toolMap.size, tools },
    byModel: Array.from(modelMap.values()).sort((a, b) => b.totals.totalCost - a.totals.totalCost),
    byProvider: Array.from(providerMap.values()).sort((a, b) => b.totals.totalCost - a.totals.totalCost),
    byAgent: Array.from(agentMap.entries()).map(([agentId, totals]) => ({ agentId, totals })).sort((a, b) => b.totals.totalCost - a.totals.totalCost),
    byChannel: Array.from(channelMap.entries()).map(([channel, totals]) => ({ channel, totals })).sort((a, b) => b.totals.totalCost - a.totals.totalCost),
    daily: Array.from(dailyMap.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ── Insight stats ──

export function buildInsightStats(
  totals: GatewayUsageTotals,
  agg: UsageAggregate,
  sessionCount: number
): InsightStats {
  const totalMessages = agg.messages.total || 1;
  const avgTokensPerMsg = totals.totalTokens / totalMessages;
  const avgCostPerMsg = totals.totalCost / totalMessages;

  // Estimate total active duration from daily data
  let totalActiveDurationMs = 0;
  // Just estimate: each day with activity ~ 8 hours
  totalActiveDurationMs = agg.daily.length * 8 * 60 * 60 * 1000 || 1;

  const throughputTokensPerMin = totals.totalTokens / (totalActiveDurationMs / 60000);
  const throughputCostPerMin = totals.totalCost / (totalActiveDurationMs / 60000);

  const errorRate = agg.messages.total > 0 ? agg.messages.errors / agg.messages.total : 0;

  const cacheInput = totals.input + totals.cacheRead;
  const cacheHitRate = cacheInput > 0 ? totals.cacheRead / cacheInput : 0;

  const avgSessionDurationMs = 0; // Would need per-session firstActivity/lastActivity

  return {
    avgTokensPerMsg,
    avgCostPerMsg,
    throughputTokensPerMin,
    throughputCostPerMin,
    errorRate,
    cacheHitRate,
    avgSessionDurationMs,
    totalActiveDurationMs,
  };
}

// ── Activity Mosaic ──

export function buildUsageMosaicStats(
  sessions: SessionsUsageEntry[],
  timeZone: "local" | "utc"
): MosaicHourBucket[] {
  const buckets = Array.from({ length: 24 }, (_, i): MosaicHourBucket => ({
    hour: i,
    tokens: 0,
    cost: 0,
    intensity: 0,
  }));

  for (const session of sessions) {
    const u = session.usage as SessionUsage | null;
    if (!u) continue;

    const start = u.firstActivity ?? session.updatedAt;
    const end = u.lastActivity ?? session.updatedAt;
    if (start == null || end == null) continue;

    const startMs = Math.min(start, end);
    const endMs = Math.max(start, end);
    const totalDuration = Math.max(endMs - startMs, 1);

    let cursor = startMs;
    while (cursor <= endMs) {
      const date = new Date(cursor);
      const hour = getZonedHour(date, timeZone);
      const nextHourDate = setToHourEnd(date, timeZone);
      const sliceEnd = Math.min(nextHourDate.getTime(), endMs);
      const sliceDuration = sliceEnd - cursor;
      const fraction = sliceDuration / totalDuration;

      buckets[hour].tokens += u.totalTokens * fraction;
      buckets[hour].cost += u.totalCost * fraction;

      cursor = sliceEnd + 1;
    }
  }

  const maxTokens = Math.max(...buckets.map((b) => b.tokens), 1);
  for (const bucket of buckets) {
    bucket.intensity = bucket.tokens / maxTokens;
  }

  return buckets;
}

// ── Peak Error Hours ──

export function buildPeakErrorHours(
  sessions: SessionsUsageEntry[],
  timeZone: "local" | "utc"
): PeakErrorEntry[] {
  const hourErrors = new Array(24).fill(0);
  const hourMessages = new Array(24).fill(0);

  for (const session of sessions) {
    const u = session.usage as SessionUsage | null;
    if (!u) continue;

    const mc = u.messageCounts;
    const errors = mc?.errors ?? 0;
    const total = mc?.total ?? 0;
    if (errors === 0 && total === 0) continue;

    const start = u.firstActivity ?? session.updatedAt;
    const end = u.lastActivity ?? session.updatedAt;
    if (start == null || end == null) continue;

    const startMs = Math.min(start, end);
    const endMs = Math.max(start, end);
    const totalDuration = Math.max(endMs - startMs, 1);

    let cursor = startMs;
    while (cursor <= endMs) {
      const date = new Date(cursor);
      const hour = getZonedHour(date, timeZone);
      const nextHourDate = setToHourEnd(date, timeZone);
      const sliceEnd = Math.min(nextHourDate.getTime(), endMs);
      const fraction = (sliceEnd - cursor) / totalDuration;

      hourErrors[hour] += errors * fraction;
      hourMessages[hour] += total * fraction;

      cursor = sliceEnd + 1;
    }
  }

  const entries: PeakErrorEntry[] = [];
  for (let h = 0; h < 24; h++) {
    if (hourErrors[h] > 0) {
      entries.push({
        hour: h,
        errors: Math.round(hourErrors[h]),
        messages: Math.round(hourMessages[h]),
        errorRate: hourMessages[h] > 0 ? hourErrors[h] / hourMessages[h] : 0,
      });
    }
  }

  return entries
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 5);
}
