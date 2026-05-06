/**
 * Live bridges hook.
 *
 * Pulls credentials from the connector daemon (encrypted credentials store
 * at ~/.hyperclaw/credentials.enc, listed via `credentials:list`) and merges
 * them with the static catalog so each bridge has a `status` reflecting
 * whether the user has actually configured it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listCredentials,
  storeAndApply,
  deleteCredential,
  type MaskedCredential,
} from "$/lib/credential-client";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useSharedDevices } from "$/Providers/DevicesProv";
import { BRIDGES, type BridgeDef, type BridgeStatus } from "./bridges-catalog";

export interface LiveBridge extends BridgeDef {
  status: BridgeStatus;
  account: string;
  /** ISO timestamp the credential was added, when known. */
  addedAt?: string;
}

const ACCOUNT_NOT_CONFIGURED = "not configured";

type RuntimeProviderInfo = {
  sources: string[];
  modelCount: number;
};

function statusForBridge(
  cred: MaskedCredential | undefined,
  runtimeInfo: RuntimeProviderInfo | undefined
): BridgeStatus {
  // Credential presence or runtime-discovered models both mean the bridge is
  // usable on this local connector.
  if (cred || runtimeInfo) return "connected";
  return "off";
}

function accountFor(
  b: BridgeDef,
  cred: MaskedCredential | undefined,
  runtimeInfo?: RuntimeProviderInfo
): string {
  if (!cred) return runtimeAccountFor(b, runtimeInfo);
  return cred.masked ? `${b.id} · ${cred.masked}` : b.id;
}

function runtimeAccountFor(b: BridgeDef, runtimeInfo: RuntimeProviderInfo | undefined): string {
  if (!runtimeInfo) return ACCOUNT_NOT_CONFIGURED;
  const source = runtimeInfo.sources.join("+");
  return `${b.id} · ${source}${runtimeInfo.modelCount ? ` · ${runtimeInfo.modelCount} model${runtimeInfo.modelCount === 1 ? "" : "s"}` : ""}`;
}

function inferProviderFromModelId(modelId: string): string | null {
  const id = modelId.trim().toLowerCase();
  if (!id) return null;

  const prefix = id.split("/")[0];
  const prefixMap: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google",
    gemini: "google",
    minimax: "minimax",
    deepseek: "deepseek",
    mistral: "mistral",
    moonshot: "moonshot",
    kimi: "moonshot",
    groq: "groq",
    together: "together",
    cerebras: "cerebras",
    nvidia: "nvidia",
    perplexity: "perplexity",
    huggingface: "huggingface",
  };
  if (prefixMap[prefix]) return prefixMap[prefix];

  if (id.startsWith("claude") || id === "sonnet" || id === "opus" || id === "haiku") return "anthropic";
  if (id.startsWith("gpt-") || id.startsWith("o3") || id.startsWith("o4")) return "openai";
  if (id.startsWith("gemini")) return "google";
  if (id.includes("minimax")) return "minimax";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("mistral") || id.includes("codestral") || id.includes("devstral")) return "mistral";
  if (id.includes("moonshot") || id.includes("kimi")) return "moonshot";
  if (id.includes("grok")) return "xai";
  if (id.includes("llama") || id.includes("mixtral")) return "groq";
  if (id.includes("sonar")) return "perplexity";
  return null;
}

function modelIdsFromResult(value: unknown): string[] {
  const result = value as { models?: Array<{ id?: string; label?: string; displayName?: string }> };
  const models = Array.isArray(result?.models) ? result.models : [];
  return models
    .map((m) => m.id || m.label || m.displayName || "")
    .filter((id): id is string => Boolean(id));
}

function addRuntimeProvider(
  map: Map<string, RuntimeProviderInfo>,
  provider: string,
  source: string,
  modelCount = 1
): void {
  const current = map.get(provider) ?? { sources: [], modelCount: 0 };
  if (!current.sources.includes(source)) current.sources.push(source);
  current.modelCount += modelCount;
  map.set(provider, current);
}

export interface UseBridgesResult {
  bridges: LiveBridge[];
  loading: boolean;
  error: string | null;
  deviceId: string | null;
  refetch: () => Promise<void>;
  saveBridge: (bridgeId: string, apiKey: string, type?: string, models?: BridgeDef["models"]) => Promise<{ success: boolean; applied?: string[]; warning?: string; error?: string }>;
  removeBridge: (bridgeId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useBridges(): UseBridgesResult {
  const { devices } = useSharedDevices();
  const deviceId = useMemo(() => {
    const online = devices.find((d) => d.status === "online");
    return online?.id ?? devices[0]?.id ?? null;
  }, [devices]);

  const [creds, setCreds] = useState<MaskedCredential[]>([]);
  const [runtimeProviders, setRuntimeProviders] = useState<Map<string, RuntimeProviderInfo>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuntimeProviders = useCallback(async () => {
    try {
      const [runtimes, openclaw, hermes, claudeCode, codex] = await Promise.allSettled([
        bridgeInvoke("list-available-runtimes"),
        bridgeInvoke("list-models", { runtime: "openclaw" }),
        bridgeInvoke("list-models", { runtime: "hermes" }),
        bridgeInvoke("list-models", { runtime: "claude-code" }),
        bridgeInvoke("list-models", { runtime: "codex" }),
      ]);
      const discoveredProviders = new Map<string, RuntimeProviderInfo>();
      const runtimeItems = runtimes.status === "fulfilled" && Array.isArray((runtimes.value as { runtimes?: unknown[] })?.runtimes)
        ? (runtimes.value as { runtimes: Array<{ name?: string; authStatus?: string }> }).runtimes
        : [];
      const runtimeAuthReady = (name: string) =>
        runtimeItems.find((item) => item.name === name)?.authStatus === "ready";
      const collectModelProviders = (source: string, value: unknown, providerFilter?: string) => {
        const modelIds = modelIdsFromResult(value);
        const providerCounts = new Map<string, number>();
        modelIds.forEach((modelId) => {
          const provider = inferProviderFromModelId(modelId);
          if (!provider || (providerFilter && provider !== providerFilter)) return;
          providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
        });
        providerCounts.forEach((count, provider) => addRuntimeProvider(discoveredProviders, provider, source, count));
      };
      if (openclaw.status === "fulfilled") collectModelProviders("openclaw", openclaw.value);
      if (hermes.status === "fulfilled") collectModelProviders("hermes", hermes.value);
      if (claudeCode.status === "fulfilled" && runtimeAuthReady("claude-code")) collectModelProviders("claude-code", claudeCode.value, "anthropic");
      if (codex.status === "fulfilled" && runtimeAuthReady("codex")) collectModelProviders("codex", codex.value);
      return discoveredProviders;
    } catch (e: unknown) {
      return new Map<string, RuntimeProviderInfo>();
    }
  }, []);

  const refetch = useCallback(async () => {
    if (!deviceId) {
      setCreds([]);
      setRuntimeProviders(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, providers] = await Promise.all([
        listCredentials(deviceId),
        fetchRuntimeProviders(),
      ]);
      setCreds(list);
      setRuntimeProviders(providers);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load credentials");
      setCreds([]);
      setRuntimeProviders(new Map());
    } finally {
      setLoading(false);
    }
  }, [deviceId, fetchRuntimeProviders]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const credByProvider = useMemo(() => {
    const map = new Map<string, MaskedCredential>();
    creds.forEach((c) => {
      if (c.provider) map.set(c.provider, c);
    });
    return map;
  }, [creds]);

  const bridges: LiveBridge[] = useMemo(() => {
    return BRIDGES.map((b) => {
      const lookup = b.providerId ?? b.id;
      const cred = credByProvider.get(lookup);
      const runtimeInfo = runtimeProviders.get(lookup);
      return {
        ...b,
        status: statusForBridge(cred, runtimeInfo),
        account: accountFor(b, cred, runtimeInfo),
        addedAt: cred?.added,
      };
    });
  }, [credByProvider, runtimeProviders]);

  const saveBridge = useCallback(
    async (bridgeId: string, apiKey: string, type = "api_key", models?: BridgeDef["models"]) => {
      if (!deviceId) {
        return { success: false, error: "No device connected. Start the connector to save credentials." };
      }
      const trimmed = apiKey.trim();
      if (!trimmed) {
        return { success: false, error: "API key is empty." };
      }
      const result = await storeAndApply(deviceId, bridgeId, type, trimmed, models);
      if (result.success) {
        await refetch();
      }
      return result;
    },
    [deviceId, refetch],
  );

  const removeBridge = useCallback(
    async (bridgeId: string) => {
      if (!deviceId) return { success: false, error: "No device connected." };
      const result = await deleteCredential(deviceId, bridgeId);
      if (result.success) await refetch();
      return result;
    },
    [deviceId, refetch],
  );

  return { bridges, loading, error, deviceId, refetch, saveBridge, removeBridge };
}
