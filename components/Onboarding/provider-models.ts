/**
 * Provider and model definitions for onboarding.
 *
 * HOW TO UPDATE:
 * 1. Edit the `models` array for the provider you want to update.
 * 2. Put the most recommended model first (it becomes the default).
 * 3. Model `id` must match the provider's API model ID exactly.
 * 4. `featured: true` shows the provider on the main picker (top 4 max).
 *
 * Model sources (check these for new releases):
 *   Anthropic  docs.anthropic.com/en/docs/about-claude/models
 *   OpenAI     platform.openai.com/docs/models
 *   Google     ai.google.dev/gemini-api/docs/models
 *   Mistral    docs.mistral.ai/getting-started/models/
 *   xAI        docs.x.ai/docs/models
 *   DeepSeek   api-docs.deepseek.com/
 *   OpenClaw   ~/code/openclaw/extensions/{provider}/models.ts
 */

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderDef {
  id: string;
  name: string;
  color: string;
  placeholder: string;
  keyPrefixes?: string[];
  models: ModelOption[];
  hint?: string;
  featured?: boolean;
  oauthId?: "openai-codex" | "anthropic-claude";
  oauthLabel?: string;
}

// --- Providers ---

export const PROVIDERS: ProviderDef[] = [
  // -- Featured (shown by default) --

  {
    id: "anthropic",
    name: "Anthropic",
    color: "#D4A574",
    placeholder: "sk-ant-api03-...",
    keyPrefixes: ["sk-ant-"],
    featured: true,
    oauthId: "anthropic-claude",
    oauthLabel: "Sign in with Anthropic",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },

  {
    id: "openai",
    name: "OpenAI",
    color: "#74AA9C",
    placeholder: "sk-proj-...",
    keyPrefixes: ["sk-proj-", "sk-svcacct-"],
    featured: true,
    oauthId: "openai-codex",
    oauthLabel: "Sign in with OpenAI",
    models: [
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
    ],
  },

  {
    id: "google",
    name: "Google Gemini",
    color: "#4285F4",
    placeholder: "AIza...",
    keyPrefixes: ["AIza"],
    featured: true,
    models: [
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
      { id: "gemini-3.1-flash-preview", label: "Gemini 3.1 Flash" },
      { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    ],
  },

  {
    id: "openrouter",
    name: "OpenRouter",
    color: "#B175FF",
    placeholder: "sk-or-v1-...",
    keyPrefixes: ["sk-or-"],
    featured: true,
    models: [
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-5.4", label: "GPT-5.4" },
      { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1" },
    ],
  },

  // -- Searchable (hidden until user searches) --

  {
    id: "deepseek",
    name: "DeepSeek",
    color: "#4D6BFE",
    placeholder: "sk-...",
    models: [
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
      { id: "deepseek-chat", label: "DeepSeek Chat" },
    ],
  },

  {
    id: "mistral",
    name: "Mistral",
    color: "#FF7000",
    placeholder: "...",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-small-latest", label: "Mistral Small" },
      { id: "mistral-medium-2508", label: "Mistral Medium 3.1" },
      { id: "codestral-latest", label: "Codestral" },
      { id: "devstral-medium-latest", label: "Devstral 2" },
      { id: "magistral-small", label: "Magistral Small" },
      { id: "pixtral-large-latest", label: "Pixtral Large" },
    ],
  },

  {
    id: "xai",
    name: "xAI",
    color: "#FFFFFF",
    placeholder: "xai-...",
    keyPrefixes: ["xai-"],
    models: [
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-4-fast", label: "Grok 4 Fast" },
      { id: "grok-4-1-fast", label: "Grok 4.1 Fast" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 Mini" },
      { id: "grok-code-fast-1", label: "Grok Code Fast" },
    ],
  },

  {
    id: "groq",
    name: "Groq",
    color: "#F55036",
    placeholder: "gsk_...",
    keyPrefixes: ["gsk_"],
    hint: "Ultra-fast inference",
    models: [
      { id: "llama-4-maverick-17b-128e", label: "Llama 4 Maverick" },
      { id: "llama-4-scout-17b-16e", label: "Llama 4 Scout" },
      { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B" },
    ],
  },

  {
    id: "together",
    name: "Together AI",
    color: "#00DDB3",
    placeholder: "...",
    models: [
      { id: "deepseek-ai/DeepSeek-V3.1", label: "DeepSeek V3.1" },
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
      { id: "moonshotai/Kimi-K2.5", label: "Kimi K2.5" },
      { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", label: "Llama 4 Maverick" },
      { id: "meta-llama/Llama-4-Scout-17B-16E-Instruct", label: "Llama 4 Scout" },
    ],
  },

  {
    id: "minimax",
    name: "MiniMax",
    color: "#6C5CE7",
    placeholder: "...",
    models: [
      { id: "MiniMax-M2.7", label: "MiniMax M2.7" },
      { id: "MiniMax-M2.5", label: "MiniMax M2.5" },
    ],
  },

  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    color: "#1A1A2E",
    placeholder: "sk-...",
    models: [
      { id: "kimi-k2.5", label: "Kimi K2.5" },
      { id: "kimi-k2-thinking", label: "Kimi K2 Thinking" },
      { id: "kimi-k2-thinking-turbo", label: "Kimi K2 Thinking Turbo" },
      { id: "kimi-k2-turbo", label: "Kimi K2 Turbo" },
    ],
  },

  {
    id: "cerebras",
    name: "Cerebras",
    color: "#FF6B35",
    placeholder: "csk-...",
    keyPrefixes: ["csk-"],
    models: [
      { id: "llama-4-scout-17b-16e", label: "Llama 4 Scout" },
      { id: "llama-4-maverick-17b-128e", label: "Llama 4 Maverick" },
    ],
  },

  {
    id: "huggingface",
    name: "Hugging Face",
    color: "#FFD21E",
    placeholder: "hf_...",
    keyPrefixes: ["hf_"],
    hint: "Inference API",
    models: [
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
      { id: "deepseek-ai/DeepSeek-V3.1", label: "DeepSeek V3.1" },
      { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct", label: "Llama 4 Maverick" },
    ],
  },

  {
    id: "nvidia",
    name: "NVIDIA",
    color: "#76B900",
    placeholder: "nvapi-...",
    keyPrefixes: ["nvapi-"],
    models: [
      { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B" },
      { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
      { id: "minimaxai/minimax-m2.5", label: "MiniMax M2.5" },
    ],
  },

  {
    id: "perplexity",
    name: "Perplexity",
    color: "#20808D",
    placeholder: "pplx-...",
    keyPrefixes: ["pplx-"],
    hint: "Search-augmented AI",
    models: [
      { id: "sonar-pro", label: "Sonar Pro" },
      { id: "sonar", label: "Sonar" },
    ],
  },
];
