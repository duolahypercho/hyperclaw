import React, { useState, useId, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ChevronDown, Plus, X, Search, Download } from "lucide-react";
import { PROVIDER_ICONS } from "./ProviderIcons";

/*
  Step: "Pick your brain"
  - Shows top 4 providers by default
  - Search bar reveals all providers filtered by query
  - Selecting a provider hides everything else, shows only the config card
  - X on the card returns to the picker
  - Multiple providers can be added sequentially
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
  keyPrefixes?: string[];
  models: ModelOption[];
  hint?: string;
  featured?: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic", name: "Anthropic", color: "#D4A574", placeholder: "sk-ant-api03-...",
    keyPrefixes: ["sk-ant-"], featured: true,
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "openai", name: "OpenAI", color: "#74AA9C", placeholder: "sk-proj-...",
    keyPrefixes: ["sk-proj-", "sk-svcacct-"], featured: true,
    models: [
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    ],
  },
  {
    id: "google", name: "Google Gemini", color: "#4285F4", placeholder: "AIza...",
    keyPrefixes: ["AIza"], featured: true,
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  {
    id: "openrouter", name: "OpenRouter", color: "#B175FF", placeholder: "sk-or-v1-...",
    keyPrefixes: ["sk-or-"], featured: true,
    models: [
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-4.1", label: "GPT-4.1" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
  },
  { id: "deepseek", name: "DeepSeek", color: "#4D6BFE", placeholder: "sk-...",
    models: [{ id: "deepseek-r1", label: "DeepSeek R1" }, { id: "deepseek-v3", label: "DeepSeek V3" }] },
  { id: "mistral", name: "Mistral", color: "#FF7000", placeholder: "...",
    models: [{ id: "mistral-large-latest", label: "Mistral Large" }, { id: "codestral-latest", label: "Codestral" }] },
  { id: "xai", name: "xAI", color: "#FFFFFF", placeholder: "xai-...", keyPrefixes: ["xai-"],
    models: [{ id: "grok-3", label: "Grok 3" }, { id: "grok-3-mini", label: "Grok 3 Mini" }] },
  { id: "groq", name: "Groq", color: "#F55036", placeholder: "gsk_...", keyPrefixes: ["gsk_"],
    hint: "Ultra-fast inference",
    models: [{ id: "llama-4-maverick-17b-128e", label: "Llama 4 Maverick" }, { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B" }] },
  { id: "together", name: "Together AI", color: "#00DDB3", placeholder: "...",
    models: [{ id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", label: "Llama 4 Maverick" }, { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" }] },
  { id: "minimax", name: "MiniMax", color: "#6C5CE7", placeholder: "...",
    models: [{ id: "MiniMax-M2.7", label: "MiniMax M2.7" }] },
  { id: "moonshot", name: "Moonshot (Kimi)", color: "#1A1A2E", placeholder: "sk-...",
    models: [{ id: "kimi-k2.5", label: "Kimi K2.5" }] },
  { id: "cerebras", name: "Cerebras", color: "#FF6B35", placeholder: "csk-...", keyPrefixes: ["csk-"],
    models: [{ id: "llama-4-scout-17b-16e", label: "Llama 4 Scout" }] },
  { id: "huggingface", name: "Hugging Face", color: "#FFD21E", placeholder: "hf_...", keyPrefixes: ["hf_"],
    hint: "Inference API",
    models: [{ id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" }, { id: "meta-llama/Llama-4-Maverick-17B-128E-Instruct", label: "Llama 4 Maverick" }] },
  { id: "nvidia", name: "NVIDIA", color: "#76B900", placeholder: "nvapi-...", keyPrefixes: ["nvapi-"],
    models: [{ id: "meta/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick" }] },
  { id: "perplexity", name: "Perplexity", color: "#20808D", placeholder: "pplx-...", keyPrefixes: ["pplx-"],
    hint: "Search-augmented AI",
    models: [{ id: "sonar-pro", label: "Sonar Pro" }, { id: "sonar", label: "Sonar" }] },
];

const FEATURED = PROVIDERS.filter((p) => p.featured);

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
  const Icon = PROVIDER_ICONS[id];
  if (Icon) return <Icon color={color} className="w-5 h-5" />;
  // Fallback: colored circle with first letter
  return (
    <div className="w-5 h-5 flex items-center justify-center">
      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-black/70"
        style={{ backgroundColor: color }}>
        {PROVIDERS.find((p) => p.id === id)?.name.charAt(0) || "?"}
      </div>
    </div>
  );
}

// --- Provider config card (shown when selected) ---

function ProviderConfigCard({
  provider, apiKey, model, showKeyVisible,
  onUpdateKey, onUpdateModel, onToggleShowKey, onRemove,
}: {
  provider: ProviderDef; apiKey: string; model: string; showKeyVisible: boolean;
  onUpdateKey: (v: string) => void; onUpdateModel: (v: string) => void;
  onToggleShowKey: () => void; onRemove: () => void;
}) {
  const hasKey = apiKey.trim().length > 0;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      className={`rounded-xl border overflow-hidden ${hasKey ? "bg-white/[0.06] border-white/20" : "bg-white/[0.05] border-white/15"}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <div className="flex items-center gap-3 p-3.5 pb-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.06]">
          <ProviderMark id={provider.id} color={provider.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white/90 flex items-center gap-2">
            {provider.name}
            {hasKey && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400/60 font-medium">ready</span>
            )}
          </div>
        </div>
        <button onClick={onRemove} className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3.5 pt-2.5 space-y-2.5">
        <div className="space-y-1">
          <label className="text-[11px] text-white/30 block">API Key</label>
          <div className="relative">
            <input ref={inputRef} type={showKeyVisible ? "text" : "password"} value={apiKey}
              onChange={(e) => onUpdateKey(e.target.value)} placeholder={provider.placeholder}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25 transition-colors font-mono pr-9"
              autoComplete="off" spellCheck={false} />
            <button onClick={onToggleShowKey} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors" tabIndex={-1}>
              {showKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-white/30 block">Default Model</label>
          <div className="relative">
            <select value={model} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdateModel(e.target.value)}
              className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 focus:outline-none focus:border-white/25 transition-colors pr-8">
              {provider.models.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#1a1a1e] text-white">{m.label}</option>
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

function PickerButton({ provider, onSelect, index }: {
  provider: ProviderDef; onSelect: () => void; index: number;
}) {
  return (
    <motion.button onClick={onSelect}
      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06] text-left transition-all duration-200"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={{ delay: 0.03 + index * 0.02, duration: 0.3, ease: EASE }}
      whileHover={{ y: -1 }} whileTap={{ y: 0 }}
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

// --- Compact added provider pill (shown when in picker mode with existing providers) ---

function AddedPill({ provider, onRemove }: { provider: ProviderDef; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/15">
      <ProviderMark id={provider.id} color={provider.color} />
      <span className="text-[11px] text-white/70">{provider.name}</span>
      <button onClick={onRemove} className="p-0.5 text-white/20 hover:text-white/50 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// --- Main component ---

// --- Detected provider from local tools ---

interface DetectedProvider {
  providerId: string;
  source: string; // "openclaw" | "hermes"
}

export default function GuidedStepRuntimes({ onComplete }: GuidedStepRuntimesProps) {
  const scopeId = useId().replace(/:/g, "");
  const [added, setAdded] = useState<Record<string, { apiKey: string; model: string }>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-detect existing provider keys from OpenClaw / Hermes
  const [detectedProviders, setDetectedProviders] = useState<DetectedProvider[]>([]);
  const [importingProvider, setImportingProvider] = useState<string | null>(null);
  const [dismissedDetection, setDismissedDetection] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.runtimes?.detectProviderKeys) {
      window.electronAPI.runtimes.detectProviderKeys()
        .then((results) => setDetectedProviders(results || []))
        .catch(() => {});
    }
  }, []);

  async function importDetectedProvider(det: DetectedProvider) {
    if (!window.electronAPI?.runtimes?.importProviderKey) return;
    setImportingProvider(det.providerId);
    try {
      const { apiKey } = await window.electronAPI.runtimes.importProviderKey({
        providerId: det.providerId,
        source: det.source,
      });
      if (apiKey) {
        const p = PROVIDERS.find((x) => x.id === det.providerId);
        if (p) {
          setAdded((prev) => ({ ...prev, [det.providerId]: { apiKey, model: p.models[0].id } }));
          // Remove from detected list after import
          setDetectedProviders((prev) => prev.filter((d) => d.providerId !== det.providerId));
        }
      }
    } catch { /* ignore */ }
    setImportingProvider(null);
  }

  function selectProvider(id: string) {
    const p = PROVIDERS.find((x) => x.id === id)!;
    setAdded((prev) => ({ ...prev, [id]: prev[id] || { apiKey: "", model: p.models[0].id } }));
    setIsAnimating(true);
    setEditingProvider(id);
    setSearch("");
  }

  function removeProvider(id: string) {
    setAdded((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (editingProvider === id) setEditingProvider(null);
  }

  function closeEditor() {
    // If the editing provider has no key, remove it
    if (editingProvider && !added[editingProvider]?.apiKey?.trim()) {
      removeProvider(editingProvider);
    }
    setIsAnimating(true);
    setEditingProvider(null);
  }

  function updateKey(id: string, value: string) {
    setAdded((prev) => ({ ...prev, [id]: { ...prev[id], apiKey: value } }));

    const detected = detectProvider(value);
    if (detected && detected.id !== id && !added[detected.id]) {
      setAdded((prev) => {
        const next = { ...prev };
        delete next[id];
        next[detected.id] = { apiKey: value, model: detected.models[0].id };
        return next;
      });
      setEditingProvider(detected.id);
    }
  }

  function updateModel(id: string, value: string) {
    setAdded((prev) => ({ ...prev, [id]: { ...prev[id], model: value } }));
  }

  const addedIds = new Set(Object.keys(added));
  const readyProviders = Object.entries(added).filter(([, v]) => v.apiKey.trim());
  const canContinue = readyProviders.length > 0;

  function handleContinue() {
    onComplete(readyProviders.map(([id, v]) => ({ providerId: id, apiKey: v.apiKey.trim(), model: v.model })));
  }

  // Search filtering
  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  // Providers available for picking (not already added)
  const availableFeatured = FEATURED.filter((p) => !addedIds.has(p.id));
  const availableAll = PROVIDERS.filter((p) => !addedIds.has(p.id));

  // When searching, filter all providers. Otherwise show only featured.
  const visiblePickers = isSearching
    ? availableAll.filter((p) => p.name.toLowerCase().includes(query) || p.id.includes(query)).slice(0, 6)
    : availableFeatured;

  const addedProvidersList = PROVIDERS.filter((p) => addedIds.has(p.id) && p.id !== editingProvider);
  const availableDetected = detectedProviders.filter((d) => !addedIds.has(d.providerId));
  const editingProviderDef = editingProvider ? PROVIDERS.find((p) => p.id === editingProvider) : null;

  const scrollClass = `scroll-${scopeId}`;

  // Mode: editing (show only the config card) or picking (show search + picker)
  const isEditing = editingProvider !== null;

  return (
    <motion.div className="text-center space-y-6 flex flex-col" style={{ maxHeight: "calc(100vh - 160px)" }} variants={stagger} initial="hidden" animate="show">
      <style>{`
        .${scrollClass}::-webkit-scrollbar { width: 4px; }
        .${scrollClass}::-webkit-scrollbar-track { background: transparent; }
        .${scrollClass}::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .${scrollClass}::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        .${scrollClass} { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent; }
      `}</style>

      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-white tracking-tight">Pick your brain</h1>
        <p className="text-white/40 text-[15px] max-w-sm mx-auto">
          {isEditing
            ? "Paste your API key below."
            : canContinue
              ? "Add more providers or continue."
              : "Which AI provider do you want to use?"}
        </p>
      </motion.div>

      <motion.div
        className={`${isEditing || isAnimating ? "overflow-hidden" : `overflow-y-auto overflow-x-hidden ${scrollClass}`} ${isEditing ? "w-full px-4" : "max-w-sm"} mx-auto text-left flex-1 min-h-0`}
        variants={fadeUp}
      >
        <AnimatePresence mode="wait" onExitComplete={() => setIsAnimating(false)}>
          {isEditing && editingProviderDef ? (
            /* ---- EDITING MODE: only show the selected provider's config ---- */
            <motion.div key="editing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }}>
              <ProviderConfigCard
                provider={editingProviderDef}
                apiKey={added[editingProvider]?.apiKey || ""}
                model={added[editingProvider]?.model || editingProviderDef.models[0].id}
                showKeyVisible={showKey[editingProvider] ?? false}
                onUpdateKey={(v) => updateKey(editingProvider, v)}
                onUpdateModel={(v) => updateModel(editingProvider, v)}
                onToggleShowKey={() => setShowKey((prev) => ({ ...prev, [editingProvider]: !prev[editingProvider] }))}
                onRemove={closeEditor}
              />

              {/* "Add another provider" link */}
              {availableAll.length > 0 && (
                <button
                  onClick={() => {
                    // Save current if it has a key, then go to picker
                    if (added[editingProvider]?.apiKey?.trim()) {
                      setEditingProvider(null);
                    } else {
                      closeEditor();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 mt-3 text-[12px] text-white/30 hover:text-white/50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add another provider
                </button>
              )}
            </motion.div>
          ) : (
            /* ---- PICKER MODE: search + provider list ---- */
            <motion.div key="picker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }}>
              {/* Already added providers as pills */}
              {addedProvidersList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {addedProvidersList.map((p) => (
                    <AddedPill key={p.id} provider={p} onRemove={() => removeProvider(p.id)} />
                  ))}
                </div>
              )}

              {/* Search bar */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search providers..."
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-white/20 hover:text-white/40">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Provider buttons */}
              <div className="space-y-2">
                {visiblePickers.map((p, i) => (
                  <PickerButton key={p.id} provider={p} onSelect={() => selectProvider(p.id)} index={i} />
                ))}
              </div>

              {/* Search hint */}
              {!isSearching && availableAll.length > availableFeatured.length && (
                <p className="text-[11px] text-white/15 text-center pt-3">
                  Search to find {availableAll.length - availableFeatured.length} more providers
                </p>
              )}

              {/* No results */}
              {isSearching && visiblePickers.length === 0 && (
                <p className="text-[11px] text-white/25 text-center py-4">No providers match "{search}"</p>
              )}

              {/* Detected existing keys — shown below providers */}
              {!dismissedDetection && availableDetected.length > 0 && (
                <motion.div
                  className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3.5"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <p className="text-[12px] text-white/50">
                      We found existing keys on this machine. Import them?
                    </p>
                    <button
                      onClick={() => setDismissedDetection(true)}
                      className="p-0.5 text-white/20 hover:text-white/40 transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {availableDetected.map((det) => {
                      const p = PROVIDERS.find((x) => x.id === det.providerId);
                      if (!p) return null;
                      const isImporting = importingProvider === det.providerId;
                      return (
                        <button
                          key={det.providerId}
                          onClick={() => importDetectedProvider(det)}
                          disabled={isImporting}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 hover:border-white/15 transition-all text-left"
                        >
                          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-white/[0.06]">
                            <ProviderMark id={p.id} color={p.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[12px] text-white/80">{p.name}</span>
                            <span className="text-[10px] text-white/25 ml-2">
                              via {det.source === "openclaw" ? "OpenClaw" : "Hermes"}
                            </span>
                          </div>
                          {isImporting ? (
                            <span className="text-[10px] text-blue-400/60">importing...</span>
                          ) : (
                            <Download className="w-3.5 h-3.5 text-blue-400/40" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Continue */}
      <motion.div variants={fadeUp} className="space-y-2 shrink-0 pb-2">
        <motion.button onClick={handleContinue} disabled={!canContinue}
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
            {isEditing ? "Paste an API key to continue" : "Select a provider to get started"}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
