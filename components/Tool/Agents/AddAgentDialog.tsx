"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ImagePlus, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  readOpenClawConfig,
  getAvailableModels,
  saveAgentModel,
  resolveAgentFolder,
  saveAvatarImage,
  syncToIdentityMd,
} from "$/lib/identity-md";
import { patchIdentityCache } from "$/hooks/useAgentIdentity";
import { OpenClawIcon, HermesIcon } from "$/components/Onboarding/RuntimeIcons";

/* ── Runtime definitions ─────────────────────────────────────────── */

type RuntimeOption = {
  id: string;
  label: string;
  description: string;
  idNote: string;
};

// Only OpenClaw and Hermes are standalone agent platforms.
// Claude Code and Codex are coding tools/runtimes, not agents.
const RUNTIMES: RuntimeOption[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    description: "Multi-channel gateway (WhatsApp, Slack, Discord…)",
    idNote: "Letters, numbers, underscores, hyphens, dots only.",
  },
  {
    id: "hermes",
    label: "Hermes",
    description: "Self-improving agent framework",
    idNote: "Used as the Hermes profile name.",
  },
];

const RUNTIME_ICONS: Record<string, React.ReactNode> = {
  "openclaw": <OpenClawIcon className="w-5 h-5" />,
  "hermes":   <HermesIcon className="w-5 h-5" />,
};

const RUNTIME_ICONS_LG: Record<string, React.ReactNode> = {
  "openclaw": <OpenClawIcon className="w-6 h-6" />,
  "hermes":   <HermesIcon className="w-6 h-6" />,
};

const EMOJI_OPTIONS = [
  "🤖", "🦾", "⚡", "🧠", "🎯", "🔮", "🦅", "🐉",
  "🦁", "🌊", "🔥", "💡", "🛸", "🎭", "🧬", "🦞",
  "💻", "🔍", "✍️", "🎨", "📊", "🚀", "🔧", "🛡️",
];

/* ── ID slug helper ──────────────────────────────────────────────── */

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/* ── Personality file builders ───────────────────────────────────── */

// OpenClaw: IDENTITY.md with metadata fields
function buildIdentityMd(opts: {
  name: string;
  emoji: string;
  role: string;
  description: string;
}): string {
  const lines: string[] = [];
  lines.push(`- **Name:** ${opts.name}`);
  if (opts.emoji) lines.push(`- **Emoji:** ${opts.emoji}`);
  if (opts.role.trim()) lines.push(`- **Role:** ${opts.role.trim()}`);
  const header = lines.join("\n");
  if (opts.description.trim()) {
    return `${header}\n\n---\n\n${opts.description.trim()}\n`;
  }
  return `${header}\n`;
}

// Hermes: SOUL.md with name as H1 header and description as body
function buildSoulMd(opts: {
  name: string;
  description: string;
}): string {
  const lines: string[] = [];
  lines.push(`# ${opts.name}`);
  if (opts.description.trim()) {
    lines.push("");
    lines.push(opts.description.trim());
  }
  return lines.join("\n") + "\n";
}

/* ── Props ───────────────────────────────────────────────────────── */

export interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (agentId: string, runtime: string) => void;
  existingAgents?: Array<{ id: string; name: string; runtime?: string }>;
}

/* ── Component ───────────────────────────────────────────────────── */

export function AddAgentDialog({ open, onOpenChange, onSuccess, existingAgents = [] }: AddAgentDialogProps) {
  const [selectedRuntime, setSelectedRuntime] = useState("openclaw");
  const [displayName, setDisplayName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("🤖");
  const [customEmoji, setCustomEmoji] = useState("");
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("__default__");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runtime = useMemo(
    () => RUNTIMES.find((r) => r.id === selectedRuntime) ?? RUNTIMES[0],
    [selectedRuntime]
  );

  const agentId = useMemo(() => toSlug(displayName), [displayName]);
  const activeEmoji = customEmoji.trim() || selectedEmoji;

  // Fetch available models when sheet opens
  useEffect(() => {
    if (!open) return;
    readOpenClawConfig().then((config) => {
      if (config) setAvailableModels(getAvailableModels(config));
    });
  }, [open]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") setAvatarDataUri(result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const reset = useCallback(() => {
    setDisplayName("");
    setSelectedEmoji("🤖");
    setCustomEmoji("");
    setAvatarDataUri(null);
    setRole("");
    setDescription("");
    setModel("__default__");
    setAvailableModels([]);
    setError(null);
    setSelectedRuntime("openclaw");
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const handleSubmit = useCallback(() => {
    setError(null);

    const name = displayName.trim();
    if (!name) { setError("Agent name is required"); return; }
    const id = toSlug(name);
    if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
      setError("Name must start with a letter or number");
      return;
    }

    // Duplicate check: compare against existing agents for the same runtime.
    const isDuplicate = existingAgents.some((a) => {
      if (selectedRuntime === "openclaw") {
        return a.runtime === "openclaw" && a.id === id;
      }
      if (selectedRuntime === "hermes") {
        return a.runtime === "hermes" && a.id === id;
      }
      return false;
    });
    if (isDuplicate) {
      setError(`An agent named "${name}" already exists in ${runtime.label}`);
      return;
    }

    // Populate identity cache now so avatar renders the moment the row appears.
    patchIdentityCache(id, {
      name,
      emoji: activeEmoji,
      runtime: selectedRuntime,
      ...(avatarDataUri ? { avatar: avatarDataUri } : {}),
    });

    // Close dialog immediately and signal StatusWidget to show the Hiring badge.
    window.dispatchEvent(new CustomEvent("agent.hiring", {
      detail: { agentId: id, name, emoji: activeEmoji, runtime: selectedRuntime },
    }));
    onSuccess?.(id, selectedRuntime);
    handleOpenChange(false);

    // Fire bridge calls in the background.
    // Build the appropriate personality file based on runtime:
    // - OpenClaw: IDENTITY.md with metadata fields
    // - Hermes: SOUL.md with name as header
    const personalityContent = selectedRuntime === "hermes"
      ? buildSoulMd({ name, description })
      : buildIdentityMd({ name, emoji: activeEmoji, role, description });

    const run = async () => {
      try {
        let result: { success?: boolean; error?: string };

        if (selectedRuntime === "openclaw") {
          result = (await bridgeInvoke("add-agent", { agentName: id })) as typeof result;
          if (result?.success) {
            const folder = resolveAgentFolder(id);
            await bridgeInvoke("write-openclaw-doc", {
              relativePath: `${folder}/IDENTITY.md`,
              content: personalityContent,
            });
            if (model && model !== "__default__") {
              await saveAgentModel(id, model);
            }
          }
        } else if (selectedRuntime === "hermes") {
          // Hermes: use setup-agent with soul content instead of identity
          result = (await bridgeInvoke("setup-agent", {
            agentId: id,
            runtime: "hermes",
            name,
            emoji: activeEmoji,
            soul: personalityContent,
          })) as typeof result;
        } else {
          result = (await bridgeInvoke("setup-agent", {
            agentId: id,
            runtime: selectedRuntime,
            name,
            emoji: activeEmoji,
            identity: personalityContent,
          })) as typeof result;
        }

        if (result?.success) {
          // Persist avatar image through the connector after the agent exists.
          if (avatarDataUri) {
            try {
              const fileName = await saveAvatarImage(id, avatarDataUri);
              await bridgeInvoke("update-agent-identity", {
                agentId: id,
                avatarData: avatarDataUri,
              });
              if (selectedRuntime === "openclaw" && fileName) {
                await syncToIdentityMd(id, { avatar: fileName });
              }
            } catch {
              // Non-fatal — avatar save failure doesn't block agent creation
            }
          }
          window.dispatchEvent(new CustomEvent("agent.hired", {
            detail: { agentId: id, runtime: selectedRuntime },
          }));
          window.dispatchEvent(new CustomEvent("agent.file.changed"));
        } else {
          window.dispatchEvent(new CustomEvent("agent.hire.failed", { detail: { agentId: id } }));
        }
      } catch {
        window.dispatchEvent(new CustomEvent("agent.hire.failed", { detail: { agentId: id } }));
      }
    };

    run();
  }, [displayName, selectedRuntime, activeEmoji, avatarDataUri, role, description, model, onSuccess, handleOpenChange, existingAgents, runtime.label]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              {RUNTIME_ICONS_LG[selectedRuntime]}
            </div>
            <div>
              <SheetTitle>New Agent</SheetTitle>
              <SheetDescription className="mt-0.5">
                Add an agent to your team
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Runtime */}
          <div className="space-y-2.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Runtime</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {RUNTIMES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRuntime(r.id)}
                  className={[
                    "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all border",
                    selectedRuntime === r.id
                      ? "border-primary/60 bg-primary/8 ring-1 ring-primary/30"
                      : "border-border/50 bg-muted/20 hover:bg-muted/40",
                  ].join(" ")}
                >
                  <span className="leading-none mt-0.5 shrink-0 text-foreground/70">{RUNTIME_ICONS[r.id]}</span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">{r.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{r.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="add-agent-name" className="text-xs uppercase tracking-wider text-muted-foreground">
              Name
            </Label>
            <Input
              id="add-agent-name"
              placeholder={selectedRuntime === "openclaw" ? "e.g. my-assistant" : "e.g. My Research Agent"}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
              autoComplete="off"
              autoFocus
              disabled={false}
            />
            {agentId && (
              <p className="text-[10px] text-muted-foreground">
                ID: <code className="bg-muted/50 px-1 rounded font-mono">{agentId}</code>
                {" · "}{runtime.idNote}
              </p>
            )}
          </div>

          {/* Avatar image */}
          <div className="space-y-2.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ImagePlus className="w-3 h-3" />
              Avatar photo
              <span className="text-muted-foreground/50 normal-case tracking-normal">optional</span>
            </Label>
            <div className="flex items-center gap-4">
              {/* Preview circle */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-16 h-16 rounded-2xl border-2 border-dashed border-border/60 flex items-center justify-center overflow-hidden hover:border-primary/50 transition-all group shrink-0"
              >
                {avatarDataUri ? (
                  <img src={avatarDataUri} alt="Agent avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl select-none">{activeEmoji}</span>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-[14px]">
                  <ImagePlus className="w-5 h-5 text-white" />
                </div>
              </button>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs h-7 px-2.5 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 transition-colors flex items-center gap-1.5 text-foreground/80"
                  >
                    <ImagePlus className="w-3 h-3" />
                    {avatarDataUri ? "Change photo" : "Upload photo"}
                  </button>
                  {avatarDataUri && (
                    <button
                      type="button"
                      onClick={() => setAvatarDataUri(null)}
                      className="text-xs h-7 px-2 rounded-lg border border-border/40 hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors text-muted-foreground flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  PNG, JPEG, WebP · max 5 MB<br />
                  Falls back to emoji if no photo.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          {/* Emoji */}
          <div className="space-y-2.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              {avatarDataUri ? "Fallback emoji" : "Emoji"}
            </Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { setSelectedEmoji(e); setCustomEmoji(""); }}
                  className={[
                    "w-10 h-10 text-xl rounded-xl flex items-center justify-center transition-all border",
                    selectedEmoji === e && !customEmoji
                      ? "bg-primary/15 ring-1 ring-primary/60 scale-110 border-primary/40"
                      : "border-border/40 bg-muted hover:bg-muted/80 hover:scale-105",
                  ].join(" ")}
                  disabled={false}
                >
                  {e}
                </button>
              ))}
            </div>
            <Input
              placeholder="Or type any emoji…"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
              className="h-9 w-40"
              disabled={false}
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="add-agent-role" className="text-xs uppercase tracking-wider text-muted-foreground">
                Role
              </Label>
              <span className="text-xs text-muted-foreground/50">optional</span>
            </div>
            <Input
              id="add-agent-role"
              placeholder="e.g. Code & Automation"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={false}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="add-agent-desc" className="text-xs uppercase tracking-wider text-muted-foreground">
                Description
              </Label>
              <span className="text-xs text-muted-foreground/50">optional</span>
            </div>
            <Textarea
              id="add-agent-desc"
              placeholder="What does this agent do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={false}
            />
          </div>

          {/* Model (OpenClaw only — stored in openclaw.json) */}
          {selectedRuntime === "openclaw" && availableModels.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Model</Label>
                <span className="text-xs text-muted-foreground/50">optional</span>
              </div>
              <Select value={model} onValueChange={setModel} disabled={false}>
                <SelectTrigger>
                  <SelectValue placeholder="Use OpenClaw default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">— Use default model —</SelectItem>
                  {availableModels.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t border-border flex flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={false}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!displayName.trim() || !agentId}
            className="flex-1"
          >
            {`Add to ${runtime.label}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
