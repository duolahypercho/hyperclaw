export type MemorySearchProviderOption = {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  models: string[];
};

export type ResolvedMemorySearchSettings = {
  enabled: boolean;
  provider: string;
  model: string;
};

export const MEMORY_SEARCH_CONFIG_KEYS = {
  enabled: "agents.defaults.memorySearch.enabled",
  provider: "agents.defaults.memorySearch.provider",
  model: "agents.defaults.memorySearch.model",
} as const;

export const MEMORY_SEARCH_PROVIDERS: MemorySearchProviderOption[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "Fast, low-cost semantic recall",
    defaultModel: "text-embedding-3-small",
    models: ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Strong multimodal-friendly embeddings",
    defaultModel: "gemini-embedding-001",
    models: ["gemini-embedding-001", "gemini-embedding-2-preview", "text-embedding-004"],
  },
  {
    id: "voyage",
    name: "Voyage",
    description: "High-quality long-context retrieval",
    defaultModel: "voyage-4-large",
    models: ["voyage-4-large", "voyage-3", "voyage-3-lite", "voyage-code-3"],
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Simple remote embedding setup",
    defaultModel: "mistral-embed",
    models: ["mistral-embed"],
  },
  {
    id: "local",
    name: "Local",
    description: "Runs embeddings on this machine",
    defaultModel: "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf",
    models: ["hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf"],
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Uses a running local Ollama server",
    defaultModel: "nomic-embed-text",
    models: ["nomic-embed-text", "mxbai-embed-large"],
  },
];

const PROVIDER_IDS = new Set(MEMORY_SEARCH_PROVIDERS.map((provider) => provider.id));
const DEFAULT_PROVIDER_ID = MEMORY_SEARCH_PROVIDERS[0].id;

export function unwrapOpenClawConfigValue(result: unknown): string | null {
  if (typeof result === "string") {
    const trimmed = result.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (!result || typeof result !== "object" || !("value" in result)) {
    return null;
  }
  const value = (result as { value?: unknown }).value;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseOpenClawBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return null;
}

export function normalizeMemorySearchProvider(provider: string | null): string | null {
  if (!provider) return null;
  const normalized = provider.trim().toLowerCase();
  return PROVIDER_IDS.has(normalized) ? normalized : null;
}

export function getMemorySearchProviderOption(provider: string): MemorySearchProviderOption {
  const normalizedProvider = normalizeMemorySearchProvider(provider);
  return MEMORY_SEARCH_PROVIDERS.find((option) => option.id === normalizedProvider) ?? MEMORY_SEARCH_PROVIDERS[0];
}

export function getDefaultMemorySearchModel(provider: string): string {
  return getMemorySearchProviderOption(provider).defaultModel;
}

export function resolveMemorySearchSettings(values: {
  enabledValue: string | null;
  providerValue: string | null;
  modelValue: string | null;
}): ResolvedMemorySearchSettings {
  const explicitEnabled = parseOpenClawBoolean(values.enabledValue);
  const normalizedProvider = normalizeMemorySearchProvider(values.providerValue);
  const provider = normalizedProvider ?? DEFAULT_PROVIDER_ID;
  const model = values.modelValue?.trim() || getDefaultMemorySearchModel(provider);

  return {
    // OpenClaw treats memorySearch as enabled by default. If onboarding wrote a
    // provider but did not write enabled=true, surface it as on.
    enabled: explicitEnabled ?? Boolean(normalizedProvider),
    provider,
    model,
  };
}
