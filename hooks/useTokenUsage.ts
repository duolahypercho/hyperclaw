"use client";

import { useState, useEffect, useCallback } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

export interface TokenUsageSummary {
  groupKey: string;
  totalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

interface UseTokenUsageOptions {
  agentId?: string;
  runtime?: string;
  from?: number;
  to?: number;
  groupBy?: "agent" | "runtime";
}

export function useTokenUsage(opts: UseTokenUsageOptions = {}) {
  const [data, setData] = useState<TokenUsageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await bridgeInvoke("get-token-usage", {
        agentId: opts.agentId ?? "",
        runtime: opts.runtime ?? "",
        from: opts.from ?? 0,
        to: opts.to ?? 0,
        groupBy: opts.groupBy ?? "agent",
      })) as { success?: boolean; data?: TokenUsageSummary[] };
      if (res?.success && Array.isArray(res.data)) {
        setData(res.data);
      } else {
        setData([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage");
    } finally {
      setLoading(false);
    }
  }, [opts.agentId, opts.runtime, opts.from, opts.to, opts.groupBy]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const totalCost = data.reduce((sum, r) => sum + r.totalCostUsd, 0);
  const totalInput = data.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutput = data.reduce((sum, r) => sum + r.outputTokens, 0);

  return { data, loading, error, refetch: fetch, totalCost, totalInput, totalOutput };
}
