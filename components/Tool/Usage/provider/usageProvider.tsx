"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import {
  loadUsageWs,
  type UsageCostPayload,
  type SessionsUsageResult,
  type UsageFetchParams,
} from "$/lib/openclaw-gateway-ws";

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Default date range: today only (same as OpenClaw app.ts usageStartDate/usageEndDate). */
function defaultDateRange(): { startDate: string; endDate: string } {
  const d = new Date();
  const iso = formatIsoDate(d);
  return { startDate: iso, endDate: iso };
}

export interface UsageContextValue {
  /** Daily + totals from usage.cost */
  usage: UsageCostPayload | null;
  /** Sessions + totals + aggregates from sessions.usage (null if gateway does not support it) */
  sessionsUsage: SessionsUsageResult | null;
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  timeZone: "local" | "utc";
  /** Client-side filter state (same as OpenClaw Usage) */
  selectedDays: string[];
  selectedHours: number[];
  selectedSessions: string[];
  query: string;
  queryDraft: string;
  chartMode: "tokens" | "cost";
  refetch: () => Promise<void>;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setTimeZone: (tz: "local" | "utc") => void;
  applyPreset: (days: number) => void;
  setSelectedDays: (days: string[] | ((prev: string[]) => string[])) => void;
  setSelectedHours: (hours: number[] | ((prev: number[]) => number[])) => void;
  setSelectedSessions: (sessions: string[] | ((prev: string[]) => string[])) => void;
  setQueryDraft: (draft: string) => void;
  applyQuery: () => void;
  clearQuery: () => void;
  setChartMode: (mode: "tokens" | "cost") => void;
  onSelectDay: (day: string, shiftKey: boolean) => void;
  onSelectHour: (hour: number, shiftKey: boolean) => void;
  onSelectSession: (key: string, shiftKey: boolean) => void;
  onClearDays: () => void;
  onClearHours: () => void;
  onClearSessions: () => void;
  onClearFilters: () => void;
  sessionsLimitReached: boolean;
}

const UsageContext = createContext<UsageContextValue | null>(null);

export function useUsage() {
  const ctx = useContext(UsageContext);
  if (!ctx) throw new Error("useUsage must be used within UsageProvider");
  return ctx;
}

const USAGE_DEBOUNCE_MS = 400;

export function UsageProvider({ children }: { children: ReactNode }) {
  const [usage, setUsage] = useState<UsageCostPayload | null>(null);
  const [sessionsUsage, setSessionsUsage] = useState<SessionsUsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDateState] = useState<string>(() => defaultDateRange().startDate);
  const [endDate, setEndDateState] = useState<string>(() => defaultDateRange().endDate);
  const [timeZoneState, setTimeZoneState] = useState<"local" | "utc">("local");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraftState] = useState("");
  const [chartMode, setChartMode] = useState<"tokens" | "cost">("tokens");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: UsageFetchParams = { startDate, endDate, timeZone: timeZoneState };
      const { usageCost, sessionsUsage: sessions } = await loadUsageWs(params);
      if (usageCost && (usageCost as { error?: string }).error) {
        setError((usageCost as { error: string }).error);
        setUsage(null);
        setSessionsUsage(null);
      } else {
        setUsage(usageCost ?? null);
        setSessionsUsage(sessions ?? null);
        // Debug: log data sources to detect sessions.usage failures
        if (!sessions && usageCost?.totals) {
          console.warn(
            "[Usage] sessions.usage returned null — falling back to usage.cost totals.",
            "usage.cost tokens:", usageCost.totals.totalTokens,
            "cost:", usageCost.totals.totalCost
          );
        }
        if (sessions?.totals && usageCost?.totals) {
          const diff = Math.abs(sessions.totals.totalTokens - usageCost.totals.totalTokens);
          if (diff > sessions.totals.totalTokens * 0.05) {
            console.warn(
              "[Usage] Totals mismatch — sessions.usage:",
              sessions.totals.totalTokens, "tokens /$" + sessions.totals.totalCost.toFixed(2),
              "| usage.cost:",
              usageCost.totals.totalTokens, "tokens /$" + usageCost.totals.totalCost.toFixed(2)
            );
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gateway usage");
      setUsage(null);
      setSessionsUsage(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, timeZoneState]);

  const refetch = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await load();
  }, [load]);

  const setStartDate = useCallback(
    (date: string) => {
      setStartDateState(date);
      setSelectedDays([]);
      setSelectedHours([]);
      setSelectedSessions([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void load(), USAGE_DEBOUNCE_MS);
    },
    [load]
  );

  const setEndDate = useCallback(
    (date: string) => {
      setEndDateState(date);
      setSelectedDays([]);
      setSelectedHours([]);
      setSelectedSessions([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void load(), USAGE_DEBOUNCE_MS);
    },
    [load]
  );

  const setTimeZone = useCallback(
    (tz: "local" | "utc") => {
      setTimeZoneState(tz);
      setSelectedDays([]);
      setSelectedHours([]);
      setSelectedSessions([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void load(), USAGE_DEBOUNCE_MS);
    },
    [load]
  );

  const applyPreset = useCallback(
    (days: number) => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      setStartDateState(formatIsoDate(start));
      setEndDateState(formatIsoDate(end));
      setSelectedDays([]);
      setSelectedHours([]);
      setSelectedSessions([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void load(), USAGE_DEBOUNCE_MS);
    },
    [load]
  );

  const setQueryDraft = useCallback((draft: string) => {
    setQueryDraftState(draft);
    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    queryDebounceRef.current = setTimeout(() => {
      setQuery(draft);
      queryDebounceRef.current = null;
    }, 250);
  }, []);

  const applyQuery = useCallback(() => {
    if (queryDebounceRef.current) {
      clearTimeout(queryDebounceRef.current);
      queryDebounceRef.current = null;
    }
    setQuery(queryDraft);
  }, [queryDraft]);

  const clearQuery = useCallback(() => {
    if (queryDebounceRef.current) {
      clearTimeout(queryDebounceRef.current);
      queryDebounceRef.current = null;
    }
    setQueryDraftState("");
    setQuery("");
  }, []);

  const onClearDays = useCallback(() => setSelectedDays([]), []);
  const onClearHours = useCallback(() => setSelectedHours([]), []);
  const onClearSessions = useCallback(() => setSelectedSessions([]), []);
  const onClearFilters = useCallback(() => {
    setSelectedDays([]);
    setSelectedHours([]);
    setSelectedSessions([]);
  }, []);

  const onSelectDay = useCallback((day: string, shiftKey: boolean) => {
    if (shiftKey && selectedDays.length > 0) {
      const daily = usage?.daily ?? [];
      const allDays = daily.map((d) => d.date);
      const lastSelected = selectedDays[selectedDays.length - 1];
      const lastIdx = allDays.indexOf(lastSelected);
      const thisIdx = allDays.indexOf(day);
      if (lastIdx !== -1 && thisIdx !== -1) {
        const [start, end] = lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
        const range = allDays.slice(start, end + 1);
        setSelectedDays((prev) => [...new Set([...prev, ...range])]);
      }
    } else {
      setSelectedDays((prev) =>
        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
      );
    }
  }, [selectedDays.length, usage?.daily]);

  const onSelectHour = useCallback((hour: number, shiftKey: boolean) => {
    if (shiftKey && selectedHours.length > 0) {
      const allHours = Array.from({ length: 24 }, (_, i) => i);
      const lastSelected = selectedHours[selectedHours.length - 1];
      const lastIdx = allHours.indexOf(lastSelected);
      const thisIdx = allHours.indexOf(hour);
      if (lastIdx !== -1 && thisIdx !== -1) {
        const [start, end] = lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
        const range = allHours.slice(start, end + 1);
        setSelectedHours((prev) => [...new Set([...prev, ...range])]);
      }
    } else {
      setSelectedHours((prev) =>
        prev.includes(hour) ? prev.filter((h) => h !== hour) : [...prev, hour]
      );
    }
  }, [selectedHours.length]);

  const onSelectSession = useCallback(
    (key: string, shiftKey: boolean) => {
      const sess = sessionsUsage?.sessions ?? [];
      const isTokenMode = chartMode === "tokens";
      const sorted = [...sess].sort((a, b) => {
        const valA = isTokenMode ? (a.usage?.totalTokens ?? 0) : (a.usage?.totalCost ?? 0);
        const valB = isTokenMode ? (b.usage?.totalTokens ?? 0) : (b.usage?.totalCost ?? 0);
        return valB - valA;
      });
      const allKeys = sorted.map((s) => s.key);

      if (shiftKey && selectedSessions.length > 0) {
        const lastSelected = selectedSessions[selectedSessions.length - 1];
        const lastIdx = allKeys.indexOf(lastSelected);
        const thisIdx = allKeys.indexOf(key);
        if (lastIdx !== -1 && thisIdx !== -1) {
          const [start, end] = lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
          const range = allKeys.slice(start, end + 1);
          setSelectedSessions((prev) => [...new Set([...prev, ...range])]);
        }
      } else {
        setSelectedSessions((prev) =>
          prev.length === 1 && prev[0] === key ? [] : [key]
        );
      }
    },
    [sessionsUsage?.sessions, chartMode, selectedSessions.length]
  );

  const sessionsLimitReached = (sessionsUsage?.sessions?.length ?? 0) >= 1000;

  // Initial load — retry once after a short delay if gateway was still connecting
  const initialLoadDone = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    load().then(() => {
      retryTimerRef.current = setTimeout(() => { load(); }, 3000);
    });
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    };
  }, []);

  const value: UsageContextValue = {
    usage,
    sessionsUsage,
    loading,
    error,
    startDate,
    endDate,
    timeZone: timeZoneState,
    selectedDays,
    selectedHours,
    selectedSessions,
    query,
    queryDraft,
    chartMode,
    refetch,
    setStartDate,
    setEndDate,
    setTimeZone,
    applyPreset,
    setSelectedDays,
    setSelectedHours,
    setSelectedSessions,
    setQueryDraft,
    applyQuery,
    clearQuery,
    setChartMode,
    onSelectDay,
    onSelectHour,
    onSelectSession,
    onClearDays,
    onClearHours,
    onClearSessions,
    onClearFilters,
    sessionsLimitReached,
  };

  return (
    <UsageContext.Provider value={value}>
      {children}
    </UsageContext.Provider>
  );
}
