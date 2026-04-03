import React, { useState, useId, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ChevronDown, Plus, X } from "lucide-react";

/*
  Step 2: "Pick your brain"
  Simple flow: pick providers, paste API keys, choose models.
  Auto-detects provider from key prefix when possible.
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
  /** Key prefixes used for auto-detection */
  keyPrefixes?: string[];
  models: ModelOption[];
  hint?: string;
  featured?: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    color: "#D4A574",
    placeholder: "sk-ant-api03-...",
    keyPrefixes: ["sk-ant-"],
    featured: true,
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
    keyPrefixes: ["sk-proj-", "sk-svcacct-"],
    featured: true,
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
    keyPrefixes: ["AIza"],
    featured: true,
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
    keyPrefixes: ["sk-or-"],
    featured: true,
    models: [
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-4.1", label: "GPT-4.1" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
  },
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
    keyPrefixes: ["xai-"],
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
    keyPrefixes: ["gsk_"],
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
    models: [{ id: "MiniMax-M2.7", label: "MiniMax M2.7" }],
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    color: "#1A1A2E",
    placeholder: "sk-...",
    models: [{ id: "kimi-k2.5", label: "Kimi K2.5" }],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    color: "#FF6B35",
    placeholder: "csk-...",
    keyPrefixes: ["csk-"],
    models: [{ id: "llama-4-scout-17b-16e", label: "Llama 4 Scout" }],
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
      { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct", label: "Llama 4 Maverick" },
    ],
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    color: "#76B900",
    placeholder: "nvapi-...",
    keyPrefixes: ["nvapi-"],
    models: [{ id: "meta/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick" }],
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

const FEATURED = PROVIDERS.filter((p) => p.featured);
const MORE = PROVIDERS.filter((p) => !p.featured);

/** Detect provider from API key prefix */
function detectProvider(key: string): ProviderDef | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  for (const p of PROVIDERS) {
    if (p.keyPrefixes?.some((prefix) => trimmed.startsWith(prefix))) return p;
  }
  return null;
}

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

// --- Added provider card (expanded inline) ---

function AddedProviderCard({
  provider,
  apiKey,
  model,
  showKeyVisible,
  onUpdateKey,
  onUpdateModel,
  onToggleShowKey,
  onRemove,
}: {
  provider: ProviderDef;
  apiKey: string;
  model: string;
  showKeyVisible: boolean;
  onUpdateKey: (value: string) => void;
  onUpdateModel: (value: string) => void;
  onToggleShowKey: () => void;
  onRemove: () => void;
}) {
  const hasKey = apiKey.trim().length > 0;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      layout
      className={`rounded-xl border overflow-hidden ${
        hasKey ? "bg-white/[0.06] border-white/20" : "bg-white/[0.05] border-white/15"
      }`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5 pb-0">
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

      {/* Config */}
      <div className="p-3.5 pt-2.5 space-y-2.5">
        <div className="space-y-1">
          <label className="text-[11px] text-white/30 block">API Key</label>
          <div className="relative">
            <input
              ref={inputRef}
              type={showKeyVisible ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onUpdateKey(e.target.value)}
              placeholder={provider.placeholder}
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

        <div className="space-y-1">
          <label className="text-[11px] text-white/30 block">Default Model</label>
          <div className="relative">
            <select
              value={model}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdateModel(e.target.value)}
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

// --- Picker button ---

function PickerButton({
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
      exit={{ opacity: 0, y: -4 }}
      transition={{ delay: 0.05 + index * 0.025, duration: 0.35, ease: EASE }}
      whileHover={{ y: -1 }}
      whileTap={{ y: 0 }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.06]">
        <ProviderMark id={provider.id} color={provider.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-white/90">{provider.name}</div>
        {provider.hint && <div className="text-[11px] text-white/25 mt-0.5">{provider.hint}</div>}
      </div>
      <Plus className="w-4 h-4 text-white/15" />
    </motion.button>
  );
}

// --- Main component ---

export default function GuidedStepRuntimes({ onComplete }: GuidedStepRuntimesProps) {
  const scopeId = useId().replace(/:/g, "");
  const [added, setAdded] = useState<Record<string, { apiKey: string; model: string }>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [showMore, setShowMore] = useState(false);

  function selectProvider(id: string) {
    const p = PROVIDERS.find((x) => x.id === id)!;
    setAdded((prev) => ({ ...prev, [id]: { apiKey: "", model: p.models[0].id } }));
  }

  function removeProvider(id: string) {
    setAdded((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateKey(id: string, value: string) {
    setAdded((prev) => ({ ...prev, [id]: { ...prev[id], apiKey: value } }));

    // Auto-detect: if user pasted a key for a different provider, swap
    const detected = detectProvider(value);
    if (detected && detected.id !== id && !added[detected.id]) {
      setAdded((prev) => {
        const next = { ...prev };
        delete next[id];
        next[detected.id] = { apiKey: value, model: detected.models[0].id };
        return next;
      });
    }
  }

  function updateModel(id: string, value: string) {
    setAdded((prev) => ({ ...prev, [id]: { ...prev[id], model: value } }));
  }

  const addedIds = new Set(Object.keys(added));
  const hasAdded = addedIds.size > 0;
  const readyProviders = Object.entries(added).filter(([, v]) => v.apiKey.trim());
  const canContinue = readyProviders.length > 0;

  function handleContinue() {
    onComplete(
      readyProviders.map(([id, v]) => ({
        providerId: id,
        apiKey: v.apiKey.trim(),
        model: v.model,
      }))
    );
  }

  const unselectedFeatured = FEATURED.filter((p) => !addedIds.has(p.id));
  const unselectedMore = MORE.filter((p) => !addedIds.has(p.id));
  const addedProviders = PROVIDERS.filter((p) => addedIds.has(p.id));

  const scrollClass = `scroll-${scopeId}`;

  return (
    <motion.div
      className="text-center space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <style>{`
        .${scrollClass}::-webkit-scrollbar { width: 4px; }
        .${scrollClass}::-webkit-scrollbar-track { background: transparent; }
        .${scrollClass}::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .${scrollClass}::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        .${scrollClass} { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
      `}</style>

      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">
          Pick your brain
        </h1>
        <p className="text-white/40 text-[15px] max-w-sm mx-auto">
          {hasAdded
            ? "Paste your API key. Add more providers if you'd like."
            : "Which AI provider do you want to use?"}
        </p>
      </motion.div>

      <motion.div
        className={`max-w-sm mx-auto text-left overflow-y-auto ${scrollClass}`}
        style={{ maxHeight: "calc(100vh - 340px)" }}
        variants={fadeUp}
      >
        {/* Added providers — expanded cards */}
        {addedProviders.length > 0 && (
          <div className="space-y-2 mb-3">
            <AnimatePresence mode="popLayout">
              {addedProviders.map((p) => (
                <AddedProviderCard
                  key={p.id}
                  provider={p}
                  apiKey={added[p.id].apiKey}
                  model={added[p.id].model}
                  showKeyVisible={showKey[p.id] ?? false}
                  onUpdateKey={(v) => updateKey(p.id, v)}
                  onUpdateModel={(v) => updateModel(p.id, v)}
                  onToggleShowKey={() => setShowKey((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  onRemove={() => removeProvider(p.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Unselected featured */}
        {unselectedFeatured.length > 0 && (
          <div className="space-y-2">
            {hasAdded && unselectedFeatured.length < FEATURED.length && (
              <p className="text-[11px] text-white/20 mb-1">Add another</p>
            )}
            <AnimatePresence>
              {unselectedFeatured.map((p, i) => (
                <PickerButton key={p.id} provider={p} onSelect={() => selectProvider(p.id)} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* More providers */}
        {unselectedMore.length > 0 && (
          <>
            <button
              onClick={() => setShowMore((v) => !v)}
              className="w-full flex items-center justify-center gap-2 py-3 mt-3 text-[12px] text-white/30 hover:text-white/50 transition-colors"
            >
              <Plus className={`w-3.5 h-3.5 transition-transform duration-200 ${showMore ? "rotate-45" : ""}`} />
              {showMore ? "Less" : `More providers (${unselectedMore.length})`}
            </button>
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
                    {unselectedMore.map((p, i) => (
                      <PickerButton key={p.id} provider={p} onSelect={() => selectProvider(p.id)} index={i} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

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
          <p className="text-[11px] text-white/20">
            {hasAdded ? "Paste an API key to continue" : "Select a provider to get started"}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
