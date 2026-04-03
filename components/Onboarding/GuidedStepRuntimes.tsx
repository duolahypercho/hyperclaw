import React, { useState, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Eye, EyeOff, ChevronDown, Plus, Key, ExternalLink, Terminal, X } from "lucide-react";

/*
  Step 2: "Pick your brain"
  Select AI providers, authenticate, and choose default models.

  Auth methods (matching OpenClaw):
  - api-key: Paste an API key
  - setup-token: Run a CLI command, paste the token
  - oauth: Browser-based PKCE OAuth flow (Google, OpenAI Codex)
  - cli: Detect existing CLI auth (Claude CLI, Gemini CLI)

  UX: Once any provider is selected, unselected providers hide
  and only selected ones show with their config expanded.
*/

const EASE = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

// --- Provider definitions ---

interface ModelOption {
  id: string;
  label: string;
}

type AuthMethod = "api-key" | "setup-token" | "oauth" | "cli";

interface AuthMethodDef {
  method: AuthMethod;
  label: string;
  placeholder: string;
  /** For setup-token: the CLI command to run */
  cliCommand?: string;
  /** For oauth: opens browser to this URL (PKCE handled separately) */
  oauthUrl?: string;
  /** For cli: which CLI to detect */
  cliName?: string;
  hint?: string;
}

interface ProviderDef {
  id: string;
  name: string;
  color: string;
  placeholder: string;
  models: ModelOption[];
  hint?: string;
  featured?: boolean;
  authMethods?: AuthMethodDef[];
}

const PROVIDERS: ProviderDef[] = [
  // --- Featured ---
  {
    id: "anthropic",
    name: "Anthropic",
    color: "#D4A574",
    placeholder: "sk-ant-api03-...",
    featured: true,
    authMethods: [
      { method: "api-key", label: "API Key", placeholder: "sk-ant-api03-..." },
      {
        method: "setup-token",
        label: "Setup Token",
        placeholder: "Paste the setup token...",
        cliCommand: "claude setup-token",
        hint: "Run the command below, then paste the generated token",
      },
      {
        method: "cli",
        label: "Claude CLI",
        placeholder: "",
        cliName: "claude",
        hint: "Reuse your existing Claude CLI login",
      },
    ],
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    color: "#74AA9C",
    placeholder: "sk-proj-...",
    featured: true,
    authMethods: [
      { method: "api-key", label: "API Key", placeholder: "sk-proj-..." },
      {
        method: "oauth",
        label: "ChatGPT OAuth",
        placeholder: "",
        oauthUrl: "https://auth.openai.com",
        hint: "Sign in with your ChatGPT account via browser",
      },
    ],
    models: [
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    color: "#4285F4",
    placeholder: "AIza...",
    featured: true,
    authMethods: [
      { method: "api-key", label: "API Key", placeholder: "AIza..." },
      {
        method: "oauth",
        label: "Google OAuth",
        placeholder: "",
        oauthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        hint: "Sign in with your Google account via browser",
      },
    ],
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    color: "#B175FF",
    placeholder: "sk-or-v1-...",
    featured: true,
    authMethods: [
      { method: "api-key", label: "API Key", placeholder: "sk-or-v1-..." },
    ],
    models: [
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-4.1", label: "GPT-4.1" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
  },
  // --- More providers ---
  {
    id: "deepseek",
    name: "DeepSeek",
    color: "#4D6BFE",
    placeholder: "sk-...",
    models: [
      { id: "deepseek-r1", label: "DeepSeek R1" },
      { id: "deepseek-v3", label: "DeepSeek V3" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    color: "#FF7000",
    placeholder: "...",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "codestral-latest", label: "Codestral" },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    color: "#FFFFFF",
    placeholder: "xai-...",
    models: [
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 Mini" },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    color: "#F55036",
    placeholder: "gsk_...",
    hint: "Ultra-fast inference",
    models: [
      { id: "llama-4-maverick-17b-128e", label: "Llama 4 Maverick" },
      { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B" },
    ],
  },
  {
    id: "together",
    name: "Together AI",
    color: "#00DDB3",
    placeholder: "...",
    models: [
      { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", label: "Llama 4 Maverick" },
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    color: "#6C5CE7",
    placeholder: "...",
    models: [
      { id: "MiniMax-M2.7", label: "MiniMax M2.7" },
    ],
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    color: "#1A1A2E",
    placeholder: "sk-...",
    models: [
      { id: "kimi-k2.5", label: "Kimi K2.5" },
    ],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    color: "#FF6B35",
    placeholder: "csk-...",
    models: [
      { id: "llama-4-scout-17b-16e", label: "Llama 4 Scout" },
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    color: "#FFD21E",
    placeholder: "hf_...",
    hint: "Inference API",
    models: [
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
      { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct", label: "Llama 4 Maverick" },
    ],
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    color: "#76B900",
    placeholder: "nvapi-...",
    models: [
      { id: "meta/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick" },
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    color: "#20808D",
    placeholder: "pplx-...",
    hint: "Search-augmented AI",
    models: [
      { id: "sonar-pro", label: "Sonar Pro" },
      { id: "sonar", label: "Sonar" },
    ],
  },
];

const FEATURED = PROVIDERS.filter((p) => p.featured);
const MORE = PROVIDERS.filter((p) => !p.featured);

// --- Types ---

export interface ProviderConfig {
  providerId: string;
  apiKey: string;
  model: string;
  authMethod?: AuthMethod;
}

interface GuidedStepRuntimesProps {
  onComplete: (providers: ProviderConfig[]) => void;
}

// --- Provider logo marks ---

function ProviderMark({ id, color }: { id: string; color: string }) {
  const size = "w-5 h-5";
  switch (id) {
    case "anthropic":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={size}>
          <path fill={color} d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
        </svg>
      );
    case "openai":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={size}>
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill={color} />
        </svg>
      );
    case "google":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={size}>
          <path d="M12 11v2.4h3.97c-.16 1.03-1.2 3.02-3.97 3.02-2.39 0-4.34-1.98-4.34-4.42S9.61 7.58 12 7.58c1.36 0 2.27.58 2.79 1.08l1.9-1.83C15.47 5.69 13.89 5 12 5 8.13 5 5 8.13 5 12s3.13 7 7 7c4.04 0 6.72-2.84 6.72-6.84 0-.46-.05-.81-.11-1.16H12z" fill={color} />
        </svg>
      );
    case "openrouter":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={size}>
          <path d="M12 2L2 7l10 5 10-5-10-5z" fill={color} opacity="0.3" />
          <path d="M2 17l10 5 10-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 12l10 5 10-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 7l10 5 10-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <div className={`${size} flex items-center justify-center`}>
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-black/70"
            style={{ backgroundColor: color }}
          >
            {PROVIDERS.find((p) => p.id === id)?.name.charAt(0) || "?"}
          </div>
        </div>
      );
  }
}

// --- Auth method content ---

function AuthMethodContent({
  provider,
  activeMethod,
  config,
  showKeyVisible,
  onUpdateConfig,
  onToggleShowKey,
}: {
  provider: ProviderDef;
  activeMethod: AuthMethodDef | undefined;
  config: { apiKey: string; model: string; enabled: boolean } | undefined;
  showKeyVisible: boolean;
  onUpdateConfig: (field: "apiKey" | "model", value: string) => void;
  onToggleShowKey: () => void;
}) {
  const method = activeMethod?.method || "api-key";
  const placeholder = activeMethod?.placeholder || provider.placeholder;

  if (method === "cli") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-white/[0.04] border border-white/8">
          <Terminal className="w-4 h-4 text-white/30 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-white/60">
              Detecting <span className="font-mono text-white/80">{activeMethod?.cliName}</span> login...
            </p>
            {activeMethod?.hint && (
              <p className="text-[10px] text-white/25 mt-0.5">{activeMethod.hint}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (method === "oauth") {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            // TODO: Implement real PKCE OAuth flow via Electron IPC
            // For now, this is a placeholder that will be wired to the actual flow
            if (activeMethod?.oauthUrl) {
              window.open(activeMethod.oauthUrl, "_blank");
            }
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-medium text-white/90 border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] hover:border-white/25 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Sign in with {provider.name}
        </button>
        {activeMethod?.hint && (
          <p className="text-[10px] text-white/25 text-center">{activeMethod.hint}</p>
        )}
        {/* Fallback paste for remote/headless */}
        <div className="space-y-1">
          <label className="text-[11px] text-white/20 block">Or paste authorization code</label>
          <div className="relative">
            <input
              type={showKeyVisible ? "text" : "password"}
              value={config?.apiKey || ""}
              onChange={(e) => onUpdateConfig("apiKey", e.target.value)}
              placeholder="Paste redirect URL or auth code..."
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25 transition-colors font-mono pr-9"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={onToggleShowKey}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
              tabIndex={-1}
            >
              {showKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (method === "setup-token") {
    return (
      <div className="space-y-2">
        {/* CLI command to run */}
        {activeMethod?.cliCommand && (
          <div className="space-y-1">
            {activeMethod.hint && (
              <p className="text-[11px] text-white/30">{activeMethod.hint}</p>
            )}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/8">
              <Terminal className="w-3.5 h-3.5 text-white/25 shrink-0" />
              <code className="text-[12px] font-mono text-white/70 flex-1">{activeMethod.cliCommand}</code>
              <button
                onClick={() => navigator.clipboard.writeText(activeMethod.cliCommand!)}
                className="text-[10px] text-white/25 hover:text-white/50 transition-colors shrink-0"
              >
                copy
              </button>
            </div>
          </div>
        )}
        {/* Token paste */}
        <div className="space-y-1">
          <label className="text-[11px] text-white/30 block">Paste token</label>
          <div className="relative">
            <input
              type={showKeyVisible ? "text" : "password"}
              value={config?.apiKey || ""}
              onChange={(e) => onUpdateConfig("apiKey", e.target.value)}
              placeholder={placeholder}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25 transition-colors font-mono pr-9"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={onToggleShowKey}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
              tabIndex={-1}
            >
              {showKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default: api-key
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-white/30 block">API Key</label>
      <div className="relative">
        <input
          type={showKeyVisible ? "text" : "password"}
          value={config?.apiKey || ""}
          onChange={(e) => onUpdateConfig("apiKey", e.target.value)}
          placeholder={placeholder}
          className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25 transition-colors font-mono pr-9"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onClick={onToggleShowKey}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
          tabIndex={-1}
        >
          {showKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// --- Selected provider card (expanded, no checkbox) ---

function SelectedProviderCard({
  provider,
  config,
  showKeyVisible,
  authMethod,
  onRemove,
  onUpdateConfig,
  onToggleShowKey,
  onSetAuthMethod,
}: {
  provider: ProviderDef;
  config: { apiKey: string; model: string; enabled: boolean } | undefined;
  showKeyVisible: boolean;
  authMethod: AuthMethod;
  onRemove: () => void;
  onUpdateConfig: (field: "apiKey" | "model", value: string) => void;
  onToggleShowKey: () => void;
  onSetAuthMethod: (method: AuthMethod) => void;
}) {
  const hasKey = !!(config?.apiKey?.trim());
  const methods = provider.authMethods || [{ method: "api-key" as AuthMethod, label: "API Key", placeholder: provider.placeholder }];
  const hasMultipleMethods = methods.length > 1;
  const activeMethod = methods.find((m) => m.method === authMethod) || methods[0];

  return (
    <motion.div
      layout
      className={`rounded-xl border overflow-hidden ${
        hasKey ? "bg-white/[0.06] border-white/20" : "bg-white/[0.05] border-white/15"
      }`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.06]">
          <ProviderMark id={provider.id} color={provider.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white/90 flex items-center gap-2">
            {provider.name}
            {hasKey && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400/60 font-medium">
                ready
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Config body */}
      <div className="px-3.5 pb-3.5 space-y-2.5">
        {/* Auth method tabs */}
        {hasMultipleMethods && (
          <div className="flex gap-1 p-0.5 bg-white/[0.04] rounded-lg">
            {methods.map((m) => (
              <button
                key={m.method}
                onClick={() => onSetAuthMethod(m.method)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all ${
                  authMethod === m.method
                    ? "bg-white/[0.08] text-white/80"
                    : "text-white/30 hover:text-white/50"
                }`}
              >
                {m.method === "api-key" && <Key className="w-3 h-3" />}
                {m.method === "setup-token" && <Terminal className="w-3 h-3" />}
                {m.method === "oauth" && <ExternalLink className="w-3 h-3" />}
                {m.method === "cli" && <Terminal className="w-3 h-3" />}
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Auth method content */}
        <AuthMethodContent
          provider={provider}
          activeMethod={activeMethod}
          config={config}
          showKeyVisible={showKeyVisible}
          onUpdateConfig={onUpdateConfig}
          onToggleShowKey={onToggleShowKey}
        />

        {/* Model selector */}
        <div className="space-y-1">
          <label className="text-[11px] text-white/30 block">Default Model</label>
          <div className="relative">
            <select
              value={config?.model || provider.models[0].id}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdateConfig("model", e.target.value)}
              className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 focus:outline-none focus:border-white/25 transition-colors pr-8"
            >
              {provider.models.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#1a1a1e] text-white">
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20 pointer-events-none" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// --- Picker card (unselected, compact) ---

function PickerCard({
  provider,
  onSelect,
  index,
}: {
  provider: ProviderDef;
  onSelect: () => void;
  index: number;
}) {
  return (
    <motion.button
      onClick={onSelect}
      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06] text-left transition-all duration-200"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.03, duration: 0.4, ease: EASE }}
      whileHover={{ y: -1 }}
      whileTap={{ y: 0 }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.06]">
        <ProviderMark id={provider.id} color={provider.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-white/90">{provider.name}</div>
        {provider.hint && (
          <div className="text-[11px] text-white/25 mt-0.5">{provider.hint}</div>
        )}
      </div>
      <Plus className="w-4 h-4 text-white/15" />
    </motion.button>
  );
}

// --- Main component ---

export default function GuidedStepRuntimes({ onComplete }: GuidedStepRuntimesProps) {
  const scopeId = useId().replace(/:/g, "");
  const [configs, setConfigs] = useState<Record<string, { apiKey: string; model: string; enabled: boolean }>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [authMethods, setAuthMethods] = useState<Record<string, AuthMethod>>({});
  const [showMore, setShowMore] = useState(false);

  function selectProvider(id: string) {
    const provider = PROVIDERS.find((p) => p.id === id)!;
    setConfigs((prev) => ({
      ...prev,
      [id]: {
        apiKey: prev[id]?.apiKey || "",
        model: prev[id]?.model || provider.models[0].id,
        enabled: true,
      },
    }));
  }

  function removeProvider(id: string) {
    setConfigs((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled: false },
    }));
  }

  function updateConfig(id: string, field: "apiKey" | "model", value: string) {
    setConfigs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  const selectedIds = new Set(
    Object.entries(configs).filter(([, c]) => c.enabled).map(([id]) => id)
  );
  const hasSelections = selectedIds.size > 0;
  const enabledWithKeys = Object.entries(configs).filter(
    ([, c]) => c.enabled && c.apiKey.trim()
  );
  const canContinue = enabledWithKeys.length > 0;

  function handleContinue() {
    const result: ProviderConfig[] = enabledWithKeys.map(([id, c]) => ({
      providerId: id,
      apiKey: c.apiKey.trim(),
      model: c.model,
      authMethod: authMethods[id] || "api-key",
    }));
    onComplete(result);
  }

  // Unselected providers for the picker
  const unselectedFeatured = FEATURED.filter((p) => !selectedIds.has(p.id));
  const unselectedMore = MORE.filter((p) => !selectedIds.has(p.id));
  const selectedProviders = PROVIDERS.filter((p) => selectedIds.has(p.id));

  const scrollClass = `scroll-${scopeId}`;

  return (
    <motion.div
      className="text-center space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Scoped thin scrollbar */}
      <style>{`
        .${scrollClass}::-webkit-scrollbar { width: 4px; }
        .${scrollClass}::-webkit-scrollbar-track { background: transparent; }
        .${scrollClass}::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.08);
          border-radius: 4px;
        }
        .${scrollClass}::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.15);
        }
        .${scrollClass} { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
      `}</style>

      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">
          Pick your brain
        </h1>
        <p className="text-white/40 text-[15px] max-w-sm mx-auto">
          {hasSelections
            ? "Configure your providers below, or add more."
            : "Connect at least one AI provider. Your keys are encrypted and stored locally."}
        </p>
      </motion.div>

      {/* Scrollable content area */}
      <motion.div
        className={`max-w-sm mx-auto text-left overflow-y-auto ${scrollClass}`}
        style={{ maxHeight: "calc(100vh - 340px)" }}
        variants={fadeUp}
      >
        {/* Selected providers — always visible, expanded */}
        {selectedProviders.length > 0 && (
          <div className="space-y-2 mb-3">
            <AnimatePresence mode="popLayout">
              {selectedProviders.map((provider) => (
                <SelectedProviderCard
                  key={provider.id}
                  provider={provider}
                  config={configs[provider.id]}
                  showKeyVisible={showKey[provider.id] ?? false}
                  authMethod={authMethods[provider.id] || "api-key"}
                  onRemove={() => removeProvider(provider.id)}
                  onUpdateConfig={(field, value) => updateConfig(provider.id, field, value)}
                  onToggleShowKey={() => setShowKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                  onSetAuthMethod={(method) => setAuthMethods((prev) => ({ ...prev, [provider.id]: method }))}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Unselected providers — picker mode */}
        {unselectedFeatured.length > 0 && (
          <div className="space-y-2">
            {hasSelections && (
              <p className="text-[11px] text-white/20 mb-1">Add another provider</p>
            )}
            {unselectedFeatured.map((provider, i) => (
              <PickerCard
                key={provider.id}
                provider={provider}
                onSelect={() => selectProvider(provider.id)}
                index={i}
              />
            ))}
          </div>
        )}

        {/* More providers toggle */}
        {unselectedMore.length > 0 && (
          <>
            <motion.button
              onClick={() => setShowMore((prev) => !prev)}
              className="w-full flex items-center justify-center gap-2 py-3 mt-3 text-[12px] text-white/30 hover:text-white/50 transition-colors"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.4 }}
            >
              <Plus className={`w-3.5 h-3.5 transition-transform duration-200 ${showMore ? "rotate-45" : ""}`} />
              {showMore ? "Less providers" : `More providers (${unselectedMore.length})`}
            </motion.button>

            <AnimatePresence>
              {showMore && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-1">
                    {unselectedMore.map((provider, i) => (
                      <PickerCard
                        key={provider.id}
                        provider={provider}
                        onSelect={() => selectProvider(provider.id)}
                        index={i}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* All providers selected */}
        {unselectedFeatured.length === 0 && unselectedMore.length === 0 && (
          <p className="text-[11px] text-white/20 text-center py-2">All providers added</p>
        )}
      </motion.div>

      {/* Continue */}
      <motion.div variants={fadeUp} className="space-y-2">
        <motion.button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium transition-all ${
            canContinue
              ? "text-white bg-white/10 hover:bg-white/[0.15] border border-white/10 hover:border-white/20"
              : "text-white/20 bg-white/[0.04] border border-white/5 cursor-not-allowed"
          }`}
          whileHover={canContinue ? { y: -1 } : {}}
          whileTap={canContinue ? { y: 0 } : {}}
        >
          Continue
        </motion.button>
        {!canContinue && (
          <p className="text-[11px] text-white/20">Add at least one API key to continue</p>
        )}
      </motion.div>
    </motion.div>
  );
}
