import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Eye, EyeOff, ChevronDown } from "lucide-react";

/*
  Step 2: "Pick your brain"
  Select AI providers, enter API keys, and choose default models.
  No runtime detection — just credentials + model preference.
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

interface ProviderDef {
  id: string;
  name: string;
  color: string;
  placeholder: string;
  models: ModelOption[];
  hint?: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    color: "#D4A574",
    placeholder: "sk-ant-api03-...",
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
    models: [
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    ],
  },
  {
    id: "google",
    name: "Google",
    color: "#4285F4",
    placeholder: "AIza...",
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
    models: [
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-4.1", label: "GPT-4.1" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
    hint: "Use any model via OpenRouter",
  },
];

// --- Types ---

export interface ProviderConfig {
  providerId: string;
  apiKey: string;
  model: string;
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
        <div className={`${size} flex items-center justify-center`}>
          <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: color }} />
        </div>
      );
    default:
      return null;
  }
}

// --- Component ---

export default function GuidedStepRuntimes({ onComplete }: GuidedStepRuntimesProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, { apiKey: string; model: string; enabled: boolean }>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  function toggleProvider(id: string) {
    setConfigs((prev) => {
      const existing = prev[id];
      if (existing?.enabled) {
        // Disable — collapse too
        setExpanded((e) => (e === id ? null : e));
        return { ...prev, [id]: { ...existing, enabled: false } };
      }
      // Enable + expand
      const provider = PROVIDERS.find((p) => p.id === id)!;
      setExpanded(id);
      return {
        ...prev,
        [id]: {
          apiKey: existing?.apiKey || "",
          model: existing?.model || provider.models[0].id,
          enabled: true,
        },
      };
    });
  }

  function updateConfig(id: string, field: "apiKey" | "model", value: string) {
    setConfigs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  function toggleExpand(id: string) {
    if (!configs[id]?.enabled) return;
    setExpanded((prev) => (prev === id ? null : id));
  }

  const enabledProviders = Object.entries(configs).filter(
    ([, c]) => c.enabled && c.apiKey.trim()
  );
  const canContinue = enabledProviders.length > 0;

  function handleContinue() {
    const result: ProviderConfig[] = enabledProviders.map(([id, c]) => ({
      providerId: id,
      apiKey: c.apiKey.trim(),
      model: c.model,
    }));
    onComplete(result);
  }

  return (
    <motion.div
      className="text-center space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">
          Pick your brain
        </h1>
        <p className="text-white/40 text-[15px] max-w-sm mx-auto">
          Connect at least one AI provider. Your keys are encrypted and stored locally.
        </p>
      </motion.div>

      {/* Provider list */}
      <motion.div className="space-y-2 max-w-sm mx-auto text-left" variants={fadeUp}>
        {PROVIDERS.map((provider, i) => {
          const config = configs[provider.id];
          const isEnabled = config?.enabled ?? false;
          const isExpanded = expanded === provider.id;
          const hasKey = !!(config?.apiKey?.trim());

          return (
            <motion.div
              key={provider.id}
              className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                isEnabled
                  ? hasKey
                    ? "bg-white/[0.06] border-white/20"
                    : "bg-white/[0.05] border-white/15"
                  : "bg-white/[0.03] border-white/8 hover:border-white/12 hover:bg-white/[0.04]"
              }`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: EASE }}
            >
              {/* Header row */}
              <button
                onClick={() => toggleProvider(provider.id)}
                className="w-full flex items-center gap-3.5 p-3.5"
              >
                {/* Checkbox */}
                <div
                  className={`w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center shrink-0 transition-all ${
                    isEnabled
                      ? hasKey
                        ? "border-green-400/60 bg-green-500/15"
                        : "border-white/40 bg-white/10"
                      : "border-white/15"
                  }`}
                >
                  <AnimatePresence>
                    {isEnabled && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Check
                          className={`w-3 h-3 ${hasKey ? "text-green-400/80" : "text-white/60"}`}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Icon */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.06]">
                  <ProviderMark id={provider.id} color={provider.color} />
                </div>

                {/* Name + hint */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-white/90 flex items-center gap-2">
                    {provider.name}
                    {isEnabled && hasKey && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400/60 font-medium">
                        ready
                      </span>
                    )}
                  </div>
                  {provider.hint && (
                    <div className="text-[11px] text-white/25 mt-0.5">{provider.hint}</div>
                  )}
                </div>

                {/* Expand chevron (only when enabled) */}
                {isEnabled && (
                  <motion.div
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      toggleExpand(provider.id);
                    }}
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="p-1"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-white/25" />
                  </motion.div>
                )}
              </button>

              {/* Expanded config */}
              <AnimatePresence>
                {isEnabled && isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="px-3.5 pb-3.5 space-y-2.5">
                      {/* API key input */}
                      <div className="space-y-1">
                        <label className="text-[11px] text-white/30 block">API Key</label>
                        <div className="relative">
                          <input
                            type={showKey[provider.id] ? "text" : "password"}
                            value={config?.apiKey || ""}
                            onChange={(e) => updateConfig(provider.id, "apiKey", e.target.value)}
                            placeholder={provider.placeholder}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25 transition-colors font-mono pr-9"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button
                            onClick={() =>
                              setShowKey((prev) => ({
                                ...prev,
                                [provider.id]: !prev[provider.id],
                              }))
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
                            tabIndex={-1}
                          >
                            {showKey[provider.id] ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Model selector */}
                      <div className="space-y-1">
                        <label className="text-[11px] text-white/30 block">Default Model</label>
                        <div className="relative">
                          <select
                            value={config?.model || provider.models[0].id}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateConfig(provider.id, "model", e.target.value)}
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
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
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
