"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOpenClaw } from "$/hooks/useOpenClaw";

type OpenClawContextValue = ReturnType<typeof useOpenClaw>;

const OpenClawContext = createContext<OpenClawContextValue | null>(null);

/** Auto-refresh interval in ms (30s). Single global instance so OpenClaw loads on app init. */
const OPENCLAW_AUTO_REFRESH_MS = 30000;

export function OpenClawProvider({ children }: { children: ReactNode }) {
  const value = useOpenClaw(OPENCLAW_AUTO_REFRESH_MS);
  return (
    <OpenClawContext.Provider value={value}>
      {children}
    </OpenClawContext.Provider>
  );
}

export function useOpenClawContext(): OpenClawContextValue {
  const ctx = useContext(OpenClawContext);
  if (!ctx) {
    throw new Error("useOpenClawContext must be used within OpenClawProvider");
  }
  return ctx;
}
