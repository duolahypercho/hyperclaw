"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// ── AI Provider types ────────────────────────────────────────────────────────

export type AIProviderType = "openclaw" | "claude-code";

export interface AIProviderInfo {
  id: AIProviderType;
  label: string;
  description: string;
  /** True when the backend is reachable / installed */
  available: boolean;
}

const PROVIDERS: Record<AIProviderType, Omit<AIProviderInfo, "available">> = {
  openclaw: {
    id: "openclaw",
    label: "OpenClaw",
    description: "OpenClaw gateway (default)",
  },
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    description: "Claude Code CLI (local subprocess)",
  },
};

// ── Context ──────────────────────────────────────────────────────────────────

interface AIProviderContextValue {
  /** Currently selected provider */
  provider: AIProviderType;
  /** Switch to a different provider */
  setProvider: (p: AIProviderType) => void;
  /** List of all known providers with availability */
  providers: AIProviderInfo[];
  /** Mark a provider as available/unavailable */
  setProviderAvailable: (id: AIProviderType, available: boolean) => void;
}

const AIProviderContext = createContext<AIProviderContextValue | null>(null);

// ── Provider component ───────────────────────────────────────────────────────

export function AIProviderProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<AIProviderType>("openclaw");
  const [availability, setAvailability] = useState<Record<AIProviderType, boolean>>({
    openclaw: true,     // Assumed available by default
    "claude-code": false, // Unknown until checked
  });

  const setProviderAvailable = useCallback(
    (id: AIProviderType, available: boolean) => {
      setAvailability((prev) => ({ ...prev, [id]: available }));
    },
    []
  );

  const providers: AIProviderInfo[] = (Object.keys(PROVIDERS) as AIProviderType[]).map(
    (id) => ({
      ...PROVIDERS[id],
      available: availability[id],
    })
  );

  return (
    <AIProviderContext.Provider
      value={{ provider, setProvider, providers, setProviderAvailable }}
    >
      {children}
    </AIProviderContext.Provider>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useAIProvider(): AIProviderContextValue {
  const ctx = useContext(AIProviderContext);
  if (!ctx) {
    throw new Error("useAIProvider must be used within AIProviderProvider");
  }
  return ctx;
}

const defaultProviderValue: AIProviderContextValue = {
  provider: "openclaw",
  setProvider: () => {},
  providers: [{ ...PROVIDERS.openclaw, available: true }],
  setProviderAvailable: () => {},
};

/** Safe variant that returns defaults when AIProviderProvider is not mounted. */
export function useAIProviderSafe(): AIProviderContextValue {
  const ctx = useContext(AIProviderContext);
  return ctx ?? defaultProviderValue;
}
