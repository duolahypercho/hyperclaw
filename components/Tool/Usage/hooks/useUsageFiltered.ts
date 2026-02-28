"use client";

import { useMemo } from "react";
import type { GatewayUsageTotals } from "$/lib/openclaw-gateway-ws";
import type { SessionsUsageEntry } from "$/lib/openclaw-gateway-ws";
import {
  filterSessionsByQuery,
  getZonedHour,
  setToHourEnd,
  normalizeQueryText,
  extractQueryTerms,
  type UsageQueryTerm,
} from "../lib/usage-helpers";
import { buildQuerySuggestions } from "../lib/usage-query";
import type { UsageContextValue } from "../provider/usageProvider";

const emptyTotals = (): GatewayUsageTotals => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  totalCost: 0,
  inputCost: 0,
  outputCost: 0,
  cacheReadCost: 0,
  cacheWriteCost: 0,
  missingCostEntries: 0,
});

function computeSessionTotals(sessions: SessionsUsageEntry[]): GatewayUsageTotals {
  return sessions.reduce(
    (acc, s) => {
      const u = s.usage;
      if (u) {
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
      return acc;
    },
    emptyTotals()
  );
}

function sessionTouchesHours(
  session: SessionsUsageEntry,
  hours: number[],
  timeZone: "local" | "utc"
): boolean {
  if (hours.length === 0) return true;
  const u = session.usage;
  const start = u?.firstActivity ?? session.updatedAt;
  const end = u?.lastActivity ?? session.updatedAt;
  if (start == null || end == null) return false;
  const startMs = Math.min(start, end);
  const endMs = Math.max(start, end);
  let cursor = startMs;
  while (cursor <= endMs) {
    const date = new Date(cursor);
    const hour = getZonedHour(date, timeZone);
    if (hours.includes(hour)) return true;
    const nextHour = setToHourEnd(date, timeZone);
    cursor = Math.min(nextHour.getTime(), endMs) + 1;
  }
  return false;
}

export function useUsageFiltered(ctx: UsageContextValue) {
  const {
    usage,
    sessionsUsage,
    startDate,
    endDate,
    timeZone,
    selectedDays,
    selectedHours,
    selectedSessions,
    query,
    chartMode,
  } = ctx;

  const costDaily = usage?.daily ?? [];
  const sessions = sessionsUsage?.sessions ?? [];
  const aggregates = sessionsUsage?.aggregates;
  const hasQuery = query.trim().length > 0;

  const isTokenMode = chartMode === "tokens";
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const valA = isTokenMode ? (a.usage?.totalTokens ?? 0) : (a.usage?.totalCost ?? 0);
        const valB = isTokenMode ? (b.usage?.totalTokens ?? 0) : (b.usage?.totalCost ?? 0);
        return valB - valA;
      }),
    [sessions, isTokenMode]
  );

  const dayFilteredSessions = useMemo(() => {
    if (selectedDays.length === 0) return sortedSessions;
    return sortedSessions.filter((s) => {
      const dates = s.usage?.activityDates;
      if (dates?.length) return dates.some((d) => selectedDays.includes(d));
      if (s.updatedAt == null) return false;
      const d = new Date(s.updatedAt);
      const sessionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return selectedDays.includes(sessionDate);
    });
  }, [sortedSessions, selectedDays]);

  const hourFilteredSessions = useMemo(
    () =>
      selectedHours.length > 0
        ? dayFilteredSessions.filter((s) =>
            sessionTouchesHours(s, selectedHours, timeZone)
          )
        : dayFilteredSessions,
    [dayFilteredSessions, selectedHours, timeZone]
  );

  const queryResult = useMemo(
    () => filterSessionsByQuery(hourFilteredSessions, query),
    [hourFilteredSessions, query]
  );
  const filteredSessions = queryResult.sessions;
  const queryWarnings = queryResult.warnings;

  const queryTerms: UsageQueryTerm[] = useMemo(
    () => extractQueryTerms(ctx.query),
    [ctx.query]
  );
  const queryTermsResolved = queryTerms;

  const querySuggestions = useMemo(
    () =>
      buildQuerySuggestions(ctx.queryDraft, sortedSessions, aggregates ?? undefined),
    [ctx.queryDraft, sortedSessions, aggregates]
  );

  const totalSessions = sortedSessions.length;

  const displayTotals = useMemo((): GatewayUsageTotals | null => {
    if (selectedSessions.length > 0) {
      const selected = filteredSessions.filter((s) =>
        selectedSessions.includes(s.key)
      );
      return computeSessionTotals(selected);
    }
    if (selectedDays.length > 0 && selectedHours.length === 0) {
      const matching = costDaily.filter((d) => selectedDays.includes(d.date));
      return matching.reduce(
        (acc, d) => {
          acc.input += d.input;
          acc.output += d.output;
          acc.cacheRead += d.cacheRead;
          acc.cacheWrite += d.cacheWrite;
          acc.totalTokens += d.totalTokens;
          acc.totalCost += d.totalCost;
          acc.inputCost += d.inputCost ?? 0;
          acc.outputCost += d.outputCost ?? 0;
          acc.cacheReadCost += d.cacheReadCost ?? 0;
          acc.cacheWriteCost += d.cacheWriteCost ?? 0;
          return acc;
        },
        emptyTotals()
      );
    }
    if (selectedHours.length > 0 || hasQuery) {
      return computeSessionTotals(filteredSessions);
    }
    return sessionsUsage?.totals ?? usage?.totals ?? null;
  }, [
    selectedSessions,
    selectedDays,
    selectedHours,
    hasQuery,
    filteredSessions,
    costDaily,
    sessionsUsage?.totals,
    usage?.totals,
  ]);

  const displaySessionCount =
    selectedSessions.length > 0
      ? filteredSessions.filter((s) => selectedSessions.includes(s.key)).length
      : selectedDays.length > 0 || selectedHours.length > 0 || hasQuery
        ? filteredSessions.length
        : totalSessions;

  const filteredDaily = useMemo(() => {
    if (selectedSessions.length === 0) return costDaily;
    const selected = filteredSessions.filter((s) =>
      selectedSessions.includes(s.key)
    );
    const dates = new Set<string>();
    for (const s of selected) {
      for (const d of s.usage?.activityDates ?? []) dates.add(d);
    }
    if (dates.size === 0) return costDaily;
    return costDaily.filter((d) => dates.has(d.date));
  }, [costDaily, selectedSessions, filteredSessions]);

  const unique = (items: Array<string | undefined>) => {
    const set = new Set<string>();
    for (const item of items) {
      if (item) set.add(item);
    }
    return Array.from(set);
  };
  const agentOptions = unique(sortedSessions.map((s) => s.agentId)).slice(0, 12);
  const channelOptions = unique(sortedSessions.map((s) => s.channel)).slice(0, 12);
  const providerOptions = unique([
    ...sortedSessions.map((s) => s.modelProvider),
    ...sortedSessions.map((s) => (s as { providerOverride?: string }).providerOverride),
    ...(aggregates?.byProvider?.map((p) => p.provider) ?? []),
  ]).slice(0, 12);
  const modelOptions = unique([
    ...sortedSessions.map((s) => s.model),
    ...(aggregates?.byModel?.map((m) => m.model) ?? []),
  ]).slice(0, 12);
  const toolOptions = unique(
    aggregates?.tools?.tools?.map((t) => t.name) ?? []
  ).slice(0, 12);

  const selectedValuesFor = (key: string): string[] => {
    const norm = normalizeQueryText(key);
    return queryTerms
      .filter((t) => normalizeQueryText(t.key ?? "") === norm)
      .map((t) => t.value)
      .filter(Boolean);
  };

  return {
    sortedSessions,
    dayFilteredSessions,
    hourFilteredSessions,
    filteredSessions,
    filteredDaily,
    queryResult,
    queryWarnings,
    queryTerms,
    querySuggestions,
    displayTotals,
    displaySessionCount,
    totalSessions,
    agentOptions,
    channelOptions,
    providerOptions,
    modelOptions,
    toolOptions,
    selectedValuesFor,
    hasQuery,
  };
}

