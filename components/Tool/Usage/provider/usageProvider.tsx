"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { OpenClawUsageResult } from "$/types/electron";

export interface UsageContextValue {
  usage: OpenClawUsageResult | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const UsageContext = createContext<UsageContextValue | null>(null);

export function useUsage() {
  const ctx = useContext(UsageContext);
  if (!ctx) throw new Error("useUsage must be used within UsageProvider");
  return ctx;
}

export function UsageProvider({ children }: { children: ReactNode }) {
  const [usage, setUsage] = useState<OpenClawUsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const emptyUsage = useMemo<OpenClawUsageResult>(
    () => ({
      byDay: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      byAgent: [],
    }),
    []
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await bridgeInvoke("get-openclaw-usage", {})) as {
        success?: boolean;
        data?: OpenClawUsageResult;
        error?: string;
        byDay?: OpenClawUsageResult["byDay"];
        totals?: OpenClawUsageResult["totals"];
        byAgent?: OpenClawUsageResult["byAgent"];
      };
      const data =
        res?.data ??
        (res && Array.isArray(res.byDay) && res.totals && Array.isArray(res.byAgent)
          ? (res as OpenClawUsageResult)
          : null);
      if (data && typeof data === "object") {
        setUsage({
          byDay: Array.isArray(data.byDay) ? data.byDay : emptyUsage.byDay,
          totals: data.totals && typeof data.totals === "object" ? data.totals : emptyUsage.totals,
          byAgent: Array.isArray(data.byAgent) ? data.byAgent : emptyUsage.byAgent,
          hint: typeof data.hint === "string" ? data.hint : undefined,
          debug:
            Array.isArray((data as OpenClawUsageResult).debug?.files)
              ? { files: (data as OpenClawUsageResult).debug!.files }
              : undefined,
        });
      } else {
        setUsage(emptyUsage);
        if (res?.error) setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage");
      setUsage(emptyUsage);
    } finally {
      setLoading(false);
    }
  }, [emptyUsage]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const value: UsageContextValue = {
    usage,
    loading,
    error,
    refetch,
  };

  return (
    <UsageContext.Provider value={value}>
      {children}
    </UsageContext.Provider>
  );
}
