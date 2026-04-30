import React, { useState, useId, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ChevronDown, Plus, X, Search, Download, Brain, Database } from "lucide-react";
import { PROVIDER_ICONS } from "./ProviderIcons";
import { PROVIDERS, type ProviderDef } from "./provider-models";

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

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  idToken?: string;
  tokenType?: string;
}

export interface ProviderConfig {
  providerId: string;
  apiKey: string;
  model: string;
  authType?: "api_key" | "oauth";
  oauthTokens?: OAuthTokens;
  oauthProvider?: "openai-codex" | "anthropic-claude";
}

export interface MemorySearchConfig {
  enabled: boolean;
  provider: string;
  apiKey?: string;
}

export interface RuntimeStepResult {
  providers: ProviderConfig[];
  primaryBrain: { providerId: string; model: string };
  memorySearch?: MemorySearchConfig;
}

// Memory search embedding providers and their metadata.
// `matchesProviderIds` maps to brain provider IDs so we can reuse existing keys.
export interface MemoryProviderDef {
  id: string;
  name: string;
  needsApiKey: boolean;
  matchesProviderIds?: string[];
  description: string;
}

export const MEMORY_PROVIDERS: MemoryProviderDef[] = [
  { id: "openai", name: "OpenAI", needsApiKey: true, matchesProviderIds: ["openai"], description: "Fast, recommended" },
  { id: "gemini", name: "Google Gemini", needsApiKey: true, matchesProviderIds: ["google"], description: "Image/audio indexing" },
  { id: "voyage", name: "Voyage", needsApiKey: true, description: "High-quality embeddings" },
  { id: "mistral", name: "Mistral", needsApiKey: true, matchesProviderIds: ["mistral"], description: "Auto-detected" },
  { id: "local", name: "Local", needsApiKey: false, description: "GGUF model, ~0.6 GB download" },
  { id: "ollama", name: "Ollama", needsApiKey: false, description: "Local, must be running" },
  { id: "bedrock", name: "AWS Bedrock", needsApiKey: false, description: "Uses AWS credential chain" },
  { id: "github-copilot", name: "GitHub Copilot", needsApiKey: false, description: "Uses Copilot subscription" },
];

type RuntimeChoice = "openclaw" | "hermes" | "claude-code" | "codex";

interface GuidedStepRuntimesProps {
  selectedRuntimes?: RuntimeChoice[];
  onBack: () => void;
  onComplete: (result: RuntimeStepResult) => void;
}

// --- Provider logo marks ---

function ProviderMark({ id, color }: { id: string; color: string }) {
  const Icon = PROVIDER_ICONS[id];
  if (Icon) return <Icon color={color} className="w-5 h-5" />;
  // Fallback: colored circle with first letter
  return (
    <div className="w-5 h-5 flex items-center justify-center">
      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-background/70"
        style={{ backgroundColor: color }}>
        {PROVIDERS.find((p) => p.id === id)?.name.charAt(0) || "?"}
      </div>
    </div>
  );
}

// --- Provider config card (shown when selected) ---

function ProviderConfigCard({
  provider, apiKey, model, showKeyVisible,
  oauthConnected, oauthLoading, showOAuth,
  onUpdateKey, onUpdateModel, onToggleShowKey, onRemove, onOAuthClick,
}: {
  provider: ProviderDef; apiKey: string; model: string; showKeyVisible: boolean;
  oauthConnected: boolean; oauthLoading: boolean; showOAuth: boolean;
  onUpdateKey: (v: string) => void; onUpdateModel: (v: string) => void;
  onToggleShowKey: () => void; onRemove: () => void; onOAuthClick: () => void;
}) {
  const hasKey = apiKey.trim().length > 0;
  const isReady = hasKey || oauthConnected;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!oauthConnected) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [oauthConnected]);

  return (
    <motion.div
      className={`rounded-xl border overflow-hidden ${isReady ? "bg-foreground/[0.06] border-foreground/20" : "bg-foreground/[0.05] border-foreground/15"}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <div className="flex items-center gap-3 p-3.5 pb-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-foreground/[0.06]">
          <ProviderMark id={provider.id} color={provider.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-foreground/90 flex items-center gap-2">
            {provider.name}
            {oauthConnected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/[0.15] text-green-600/90 dark:bg-green-500/10 dark:text-green-400/60 font-medium">signed in</span>
            )}
            {!oauthConnected && hasKey && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/[0.15] text-green-600/90 dark:bg-green-500/10 dark:text-green-400/60 font-medium">ready</span>
            )}
          </div>
        </div>
        <button onClick={onRemove} className="p-1.5 rounded-lg text-foreground/20 hover:text-foreground/50 hover:bg-foreground/[0.06] transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3.5 pt-2.5 space-y-2.5">
        {/* OAuth button — only shown when the provider supports it and the runtime context allows it */}
        {showOAuth && provider.oauthId && !oauthConnected && (
          <>
            <button
              onClick={onOAuthClick}
              disabled={oauthLoading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-foreground/15 bg-foreground/[0.06] hover:bg-foreground/[0.10] hover:border-foreground/25 transition-all text-[13px] font-medium text-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ProviderMark id={provider.id} color={provider.color} />
              {oauthLoading ? "Signing in\u2026" : provider.oauthLabel || `Sign in with ${provider.name}`}
            </button>
            {provider.oauthId === "anthropic-claude" && (
              <p className="text-[11px] text-amber-400/75 dark:text-amber-300/60 leading-snug px-0.5">
                Works with Claude Code only. Hermes, OpenClaw, and Codex still need an API key below.
              </p>
         
            )}
          </>
        )}
        {oauthConnected && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/[0.10] border border-green-500/25 dark:bg-green-500/[0.06] dark:border-green-500/15">
            <div className="w-2 h-2 rounded-full bg-green-500/80 dark:bg-green-400/60" />
            <span className="text-[12px] text-green-700/80 dark:text-green-400/70">Connected via OAuth</span>
          </div>
        )}
        {/* Divider between OAuth and API key */}
        {showOAuth && provider.oauthId && !oauthConnected && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-foreground/[0.12]" />
            <span className="text-[10px] text-foreground/20 uppercase tracking-wider">or paste key</span>
            <div className="flex-1 h-px bg-foreground/[0.12]" />
          </div>
        )}
        {/* API key input — hidden when OAuth is connected */}
        {!oauthConnected && (
          <div className="space-y-1">
            <label className="text-[11px] text-foreground/30 block">API Key</label>
            <div className="relative">
              <input ref={inputRef} type={showKeyVisible ? "text" : "password"} value={apiKey}
                onChange={(e) => onUpdateKey(e.target.value)} placeholder={provider.placeholder}
                className="w-full bg-foreground/[0.04] border border-foreground/[0.12] rounded-lg px-3 py-2 text-[12px] text-foreground/80 placeholder-foreground/25 focus:outline-none focus:border-foreground/30 transition-colors font-mono pr-9"
                autoComplete="off" spellCheck={false} />
              <button onClick={onToggleShowKey} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-foreground/20 hover:text-foreground/40 transition-colors" tabIndex={-1}>
                {showKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}
        {!oauthConnected && (
          <div className="space-y-1">
            <label className="text-[11px] text-foreground/30 block">Default Model</label>
            <div className="relative">
              <select value={model} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdateModel(e.target.value)}
                className="w-full appearance-none bg-foreground/[0.04] border border-foreground/10 rounded-lg px-3 py-2 text-[12px] text-foreground/80 focus:outline-none focus:border-foreground/25 transition-colors pr-8">
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id} className="bg-card text-foreground">{m.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground/20 pointer-events-none" />
            </div>
          </div>
        )}
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
      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-foreground/[0.12] bg-foreground/[0.05] hover:border-foreground/[0.20] hover:bg-foreground/[0.08] text-left transition-all duration-200"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={{ delay: 0.03 + index * 0.02, duration: 0.3, ease: EASE }}
      whileHover={{ y: -1 }} whileTap={{ y: 0 }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-foreground/[0.06]">
        <ProviderMark id={provider.id} color={provider.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-foreground/90">{provider.name}</div>
        {provider.hint && <div className="text-[11px] text-foreground/40 mt-0.5">{provider.hint}</div>}
      </div>
      <Plus className="w-4 h-4 text-foreground/30" />
    </motion.button>
  );
}

// --- Compact added provider pill (shown when in picker mode with existing providers) ---

function AddedPill({
  provider,
  onRemove,
  onOpen,
}: {
  provider: ProviderDef;
  onRemove: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-foreground/[0.06] border border-foreground/15">
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-foreground/70 hover:text-foreground/90 transition-colors"
      >
        <ProviderMark id={provider.id} color={provider.color} />
        <span>{provider.name}</span>
      </button>
      <button onClick={onRemove} className="p-1 pr-1.5 text-foreground/20 hover:text-foreground/50 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// --- Main component ---

// --- Detected provider from local tools ---

interface DetectedProvider {
  providerId: string;
  source: string; // "hermes" or other runtime
}

export default function GuidedStepRuntimes({ selectedRuntimes = [], onBack, onComplete }: GuidedStepRuntimesProps) {
  const scopeId = useId().replace(/:/g, "");
  const [added, setAdded] = useState<Record<string, { apiKey: string; model: string }>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Primary brain selection (defaults to first added provider)
  const [primaryBrainId, setPrimaryBrainId] = useState<string | null>(null);

  // OAuth state
  const [oauthTokens, setOauthTokens] = useState<Record<string, OAuthTokens>>({});
  const [oauthLoading, setOauthLoading] = useState<Record<string, boolean>>({});
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Determine which OAuth options to show based on selected runtimes:
  // - Anthropic OAuth: only when Claude Code is selected (Anthropic OAuth is only for Claude Code)
  // - OpenAI OAuth: when Codex, Hermes, or OpenClaw is selected (reusable for all except Claude Code)
  const showAnthropicOAuth = selectedRuntimes.includes("claude-code");
  const showOpenAIOAuth = selectedRuntimes.some((rt) => rt === "codex" || rt === "hermes" || rt === "openclaw");

  function shouldShowOAuth(providerId: string): boolean {
    if (providerId === "anthropic") return showAnthropicOAuth;
    if (providerId === "openai") return showOpenAIOAuth;
    return false;
  }

  async function startOAuthFlow(providerId: string) {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider?.oauthId) return;
    if (!window.electronAPI?.oauth?.startFlow) {
      setOauthError("OAuth requires the desktop app.");
      return;
    }

    setOauthLoading((prev) => ({ ...prev, [providerId]: true }));
    setOauthError(null);

    try {
      const result = await window.electronAPI.oauth.startFlow(provider.oauthId);
      if (result?.success && result.tokens) {
        const tokens: OAuthTokens = result.tokens;
        setOauthTokens((prev) => ({ ...prev, [providerId]: tokens }));
        // Auto-add the provider if not already added
        setAdded((prev) => ({
          ...prev,
          [providerId]: prev[providerId] || { apiKey: "", model: provider.models[0].id },
        }));
      } else {
        // Don't show error for user-cancelled flows
        if (result?.error && !result.error.includes("window was closed")) {
          setOauthError(result.error);
        }
      }
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : "OAuth flow failed");
    } finally {
      setOauthLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  }

  // Auto-detect existing provider keys from installed runtimes
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
  const readyProviders = Object.entries(added).filter(
    ([id, v]) => v.apiKey.trim() || oauthTokens[id]
  );
  const canContinueBase = readyProviders.length > 0;

  // Resolve the effective primary brain: explicit selection, or first ready provider.
  const effectivePrimaryId = primaryBrainId && added[primaryBrainId] ? primaryBrainId : readyProviders[0]?.[0];

  const canContinue = canContinueBase;

  function handleContinue() {
    const providers = readyProviders.map(([id, v]) => {
      const tokens = oauthTokens[id];
      const provider = PROVIDERS.find((p) => p.id === id);
      if (tokens) {
        return {
          providerId: id,
          apiKey: tokens.accessToken,
          model: v.model,
          authType: "oauth" as const,
          oauthTokens: tokens,
          oauthProvider: provider?.oauthId,
        };
      }
      return { providerId: id, apiKey: v.apiKey.trim(), model: v.model, authType: "api_key" as const };
    });

    const primaryProvider = providers.find((p) => p.providerId === effectivePrimaryId) || providers[0];

    onComplete({
      providers,
      primaryBrain: {
        providerId: primaryProvider.providerId,
        model: primaryProvider.model,
      },
    });
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
    <motion.div className="h-full text-center space-y-6 flex flex-col" variants={stagger} initial="hidden" animate="show">
      <style>{`
        .${scrollClass}::-webkit-scrollbar { width: 4px; }
        .${scrollClass}::-webkit-scrollbar-track { background: transparent; }
        .${scrollClass}::-webkit-scrollbar-thumb { background: hsl(var(--foreground) / 0.08); border-radius: 4px; }
        .${scrollClass}::-webkit-scrollbar-thumb:hover { background: hsl(var(--foreground) / 0.15); }
        .${scrollClass} { scrollbar-width: thin; scrollbar-color: hsl(var(--foreground) / 0.08) transparent; }
      `}</style>

      <motion.div className="space-y-3" variants={fadeUp}>
        <h1 className="text-[28px] font-medium text-foreground tracking-tight">Pick your brain</h1>
        <p className="text-foreground/40 text-[15px] w-full">
          {isEditing
            ? "Paste your API key below."
            : canContinueBase
              ? "Add more providers or continue."
              : "Which AI provider do you want to use?"}
        </p>
      </motion.div>

      <motion.div
        className={`${isAnimating ? "overflow-hidden" : `overflow-y-auto overflow-x-hidden ${scrollClass}`} ${isEditing ? "w-full px-4" : "w-full"} mx-auto text-left flex-1 min-h-0`}
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
                oauthConnected={!!oauthTokens[editingProvider]}
                oauthLoading={!!oauthLoading[editingProvider]}
                showOAuth={shouldShowOAuth(editingProvider)}
                onUpdateKey={(v) => updateKey(editingProvider, v)}
                onUpdateModel={(v) => updateModel(editingProvider, v)}
                onToggleShowKey={() => setShowKey((prev) => ({ ...prev, [editingProvider]: !prev[editingProvider] }))}
                onRemove={closeEditor}
                onOAuthClick={() => startOAuthFlow(editingProvider)}
              />
              {oauthError && (
                <motion.p
                  className="text-[11px] text-red-400/70 text-center mt-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {oauthError}
                </motion.p>
              )}
            </motion.div>
          ) : (
            /* ---- PICKER MODE: search + provider list ---- */
            <motion.div key="picker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }}>
              {/* Already added providers as pills */}
              {addedProvidersList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {addedProvidersList.map((p) => (
                    <AddedPill
                      key={p.id}
                      provider={p}
                      onOpen={() => selectProvider(p.id)}
                      onRemove={() => removeProvider(p.id)}
                    />
                  ))}
                </div>
              )}

              {/* Search bar */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/20" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search providers..."
                  className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-lg pl-9 pr-3 py-2.5 text-[13px] text-foreground/80 placeholder-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-foreground/20 hover:text-foreground/40">
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
                <p className="text-[11px] text-foreground/30 text-center pt-3">
                  Search to find {availableAll.length - availableFeatured.length} more providers
                </p>
              )}

              {/* No results */}
              {isSearching && visiblePickers.length === 0 && (
                <p className="text-[11px] text-foreground/25 text-center py-4">No providers match &quot;{search}&quot;</p>
              )}

              {/* Detected existing keys — shown below providers */}
              {!dismissedDetection && availableDetected.length > 0 && (
                <motion.div
                  className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.06] p-3.5"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <p className="text-[12px] text-foreground/50">
                      We found existing keys on this machine. Import them?
                    </p>
                    <button
                      onClick={() => setDismissedDetection(true)}
                      className="p-0.5 text-foreground/20 hover:text-foreground/40 transition-colors shrink-0"
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
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/8 hover:border-foreground/15 transition-all text-left"
                        >
                          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-foreground/[0.06]">
                            <ProviderMark id={p.id} color={p.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[12px] text-foreground/80">{p.name}</span>
                            <span className="text-[10px] text-foreground/25 ml-2">
                              via {det.source === "hermes" ? "Hermes" : det.source}
                            </span>
                          </div>
                          {isImporting ? (
                            <span className="text-[10px] text-primary/60">importing...</span>
                          ) : (
                            <Download className="w-3.5 h-3.5 text-primary/40" />
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

        {/* --- Primary Brain selector (shown when 2+ providers are ready) --- */}
        {readyProviders.length >= 2 && (
          <motion.div
            className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <Brain className="w-3.5 h-3.5 text-foreground/30" />
              <span className="text-[12px] text-foreground/50 font-medium">Default Brain</span>
            </div>
            <div className="space-y-1.5">
              {readyProviders.map(([id, v]) => {
                const p = PROVIDERS.find((x) => x.id === id);
                if (!p) return null;
                const isSelected = id === effectivePrimaryId;
                const modelLabel = p.models.find((m) => m.id === v.model)?.label || v.model;
                return (
                  <button
                    key={id}
                    onClick={() => setPrimaryBrainId(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left ${
                      isSelected
                        ? "bg-foreground/[0.08] border-foreground/20"
                        : "bg-foreground/[0.02] border-foreground/8 hover:border-foreground/15 hover:bg-foreground/[0.05]"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? "border-foreground/60" : "border-foreground/20"
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-foreground/80" />}
                    </div>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-foreground/[0.06]">
                      <ProviderMark id={p.id} color={p.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] text-foreground/80">{p.name}</span>
                      <span className="text-[10px] text-foreground/25 ml-2">{modelLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Continue */}
      <motion.div
        variants={fadeUp}
        className="mt-2 pt-4 border-t border-foreground/8 flex items-center justify-center gap-3 shrink-0"
      >
        <motion.button
          type="button"
          onClick={isEditing ? closeEditor : onBack}
          className="min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-medium text-foreground/70 bg-foreground/[0.04] hover:bg-foreground/[0.07] border border-foreground/10 hover:border-foreground/20 transition-all"
          whileHover={{ y: -1 }}
          whileTap={{ y: 0 }}
        >
          {isEditing ? "Add another provider" : "Back"}
        </motion.button>
        <motion.button onClick={handleContinue} disabled={!canContinue}
          className={`min-h-[44px] px-8 py-2.5 rounded-lg text-sm font-medium transition-all ${
            canContinue
              ? "text-primary-foreground bg-primary hover:bg-primary/80 border border-foreground/10 hover:border-foreground/20"
              : "text-primary-foreground/30 bg-foreground/[0.03] border border-foreground/6 disabled:cursor-not-allowed disabled:border-foreground/6 disabled:text-foreground/30"
          }`}
          whileHover={canContinue ? { y: -1 } : {}}
          whileTap={canContinue ? { y: 0 } : {}}
        >
          Continue
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
