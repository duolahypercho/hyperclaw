"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { getUsageCostWs, type UsageCostPayload } from "$/lib/openclaw-gateway-ws";

export interface UsageContextValue {
  usage: UsageCostPayload | null;
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
  const [usage, setUsage] = useState<UsageCostPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getUsageCostWs({ detail: "full" });
      console.log("payload", payload);
      setUsage(payload ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gateway usage");
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
