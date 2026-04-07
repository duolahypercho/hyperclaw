"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { BackendTab } from "$/components/Home/widgets/gateway-chat/GatewayChatHeader";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

export interface RuntimeModel {
  id: string;
  label: string;
}

/**
 * Hardcoded model lists for runtimes that don't support dynamic discovery.
 *
 * Claude Code only accepts aliases (sonnet, opus, haiku) or full model IDs —
 * there's no CLI command or OAuth-compatible API to list available models.
 *
 * Codex/OpenAI models are similarly fixed for the CLI tool.
 */
export const STATIC_MODELS: Partial<Record<BackendTab, RuntimeModel[]>> = {
  "claude-code": [
    { id: "", label: "Default" },
    { id: "sonnet", label: "Sonnet" },
    { id: "opus", label: "Opus" },
    { id: "haiku", label: "Haiku" },
  ],
  codex: [
    { id: "", label: "Default" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
    { id: "gpt-5.3-codex", label: "GPT-5.3-Codex" },
    { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "gpt-5.1-codex-max", label: "GPT-5.1-Codex-Max" },
    { id: "gpt-5.1-codex-mini", label: "GPT-5.1-Codex-Mini" },
  ],
  hermes: [
    { id: "", label: "Default" },
  ],
};

/**
 * useRuntimeModels — returns the model list for the active runtime tab.
 *
 * Claude Code and Codex use hardcoded lists (no dynamic discovery available).
 * OpenClaw and Hermes fetch dynamically via the bridge path:
 *   App → bridgeInvoke("list-models") → Hub → Connector → local runtime
 */
export function useRuntimeModels(activeTab: BackendTab) {
  const [models, setModels] = useState<RuntimeModel[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const fetchModels = useCallback(async (tab: BackendTab) => {
    const id = ++fetchIdRef.current;

    // Static models — return immediately, no network call
    const staticList = STATIC_MODELS[tab];
    if (staticList) {
      setModels(staticList);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let fetched: RuntimeModel[] | null = null;

      if (tab === "openclaw") {
        // OpenClaw: try gateway WS first (direct connection to local gateway)
        try {
          const { gatewayConnection } = await import("$/lib/openclaw-gateway-ws");
          if (gatewayConnection.connected) {
            const result = await gatewayConnection.listModels();
            if (result?.models?.length) {
              fetched = result.models.map((m) => ({
                id: m.id,
                label: m.displayName || m.id,
              }));
            }
          }
        } catch {
          // Gateway not available, fall through to bridge
        }
      }

      // Dynamic runtimes: go through the bridge (Hub → Connector → local)
      if (!fetched) {
        try {
          const result = (await bridgeInvoke("list-models", { runtime: tab })) as {
            models?: Array<{ id: string; label?: string; displayName?: string }>;
          } | null;
          if (result?.models?.length) {
            fetched = result.models.map((m) => ({
              id: m.id,
              label: m.label || m.displayName || m.id,
            }));
          }
        } catch {
          // Bridge call failed
        }
      }

      // Only apply if this is still the latest fetch
      if (id !== fetchIdRef.current) return;

      setModels(fetched && fetched.length > 0 ? fetched : []);
    } catch {
      if (id === fetchIdRef.current) {
        setModels([]);
      }
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch when tab changes
  useEffect(() => {
    setModels([]);
    setLoading(true);
    fetchModels(activeTab);
  }, [activeTab, fetchModels]);

  return { models, loading, refetch: () => fetchModels(activeTab) };
}
