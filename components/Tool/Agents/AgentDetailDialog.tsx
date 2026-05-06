"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Save, Trash2, Loader2, ImagePlus, Package, ScrollText, SmilePlus, ChevronDown, UserRound, SlidersHorizontal, BadgeInfo } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "$/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  useAgentIdentity,
  resolveAvatarUrl,
  isAvatarText,
} from "$/hooks/useAgentIdentity";
import { ClaudeCodeIcon, CodexIcon, HermesIcon } from "$/components/Onboarding/RuntimeIcons";
import {
  useAgentIdentityEditor,
  EMOJI_OPTIONS,
} from "$/hooks/useAgentIdentityEditor";
import { DeleteAgentDialog } from "./DeleteAgentDialog";

/* ── Constants ─────────────────────────────────────────────── */

// Hard cap on how much personality-file content we will load into a
// <Textarea>. Native textareas store the value in the DOM and React re-sets
// `.value` on every render; a multi-MB string pins the renderer process at
// multi-GB RSS and 100% CPU. 256 KiB is 100x the size of any healthy
// personality file and plenty for a manual edit. Anything larger is treated
// as a runaway-write victim: we show a read-only banner and refuse to bind
// it to a textarea.
const MAX_EDITOR_BYTES = 256 * 1024; // 256 KiB

/** Shared preview used when a personality file is too large to safely edit. */
function OversizedFileBanner({
  fileName,
  size,
}: {
  fileName: string;
  size: number;
}) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <p className="font-medium text-destructive">
        {fileName} is {(size / 1024 / 1024).toFixed(1)} MB — too large to edit in the dashboard.
      </p>
      <p className="mt-1 text-muted-foreground">
        Files over {(MAX_EDITOR_BYTES / 1024).toFixed(0)} KB are hidden to
        keep the renderer responsive. This usually means a runaway-write
        bug produced the file. Open it in a terminal or external editor
        (e.g. <code>~/.hyperclaw/agents/{"{runtime}-{agentId}"}/{fileName}</code>),
        inspect, then truncate it with <code>: &gt; path/to/{fileName}</code>.
      </p>
    </div>
  );
}

// IDENTITY.md intentionally omitted — name/emoji/avatar/description are edited
// through the structured form in InfoTab, which calls the identity editor hook.
// Having a second raw-file editor for the same data was the source of write
// conflicts and let the onboarding echo-loop bug hide for too long. The form
// is the single source of truth; open the workspace folder for raw access.
const TAB_FILES = [
  { key: "SOUL",      label: "SOUL",      desc: "Personality & behavior" },
  { key: "USER",      label: "USER",      desc: "Context about the human" },
  { key: "AGENTS",    label: "AGENTS",    desc: "Team awareness" },
  { key: "TOOLS",     label: "TOOLS",     desc: "Agent tool context and built-in Hyperclaw actions" },
  { key: "HEARTBEAT", label: "HEARTBEAT", desc: "Periodic tasks & health checks" },
  { key: "BOOTSTRAP", label: "BOOTSTRAP", desc: "Bootstrap instructions run on first contact" },
  { key: "MEMORY",    label: "MEMORY",    desc: "Persistent memory" },
] as const;

type FileTabDef = {
  key: string;
  label: string;
  desc: string;
  placeholder?: string;
  runtimeDocFileName?: string;
};

/**
 * Returns only the file tab(s) relevant for a given runtime.
 * Claude Code → SOUL plus the compiled CLAUDE.md startup file
 * Codex        → AGENTS (displayed as AGENTS.md)
 * OpenClaw / unknown → all 7 files
 */
function getFileTabsForRuntime(runtime: string | undefined): FileTabDef[] {
  switch (runtime) {
    case "claude-code":
      return [
        {
          key: "SOUL",
          label: "SOUL.md",
          desc: "Canonical persona and operating style. Saving this refreshes Claude's compiled startup context.",
          placeholder: "# Agent Soul\n\nDescribe the agent's role, temperament, operating style, and boundaries.",
        },
        {
          key: "CLAUDE",
          label: "CLAUDE.md",
          desc: "Compiled startup instructions Claude reads at the beginning of coding sessions",
          placeholder: "# Project Instructions\n\nThis project uses TypeScript and React.\n\nBe concise and prefer editing existing files over creating new ones.",
          runtimeDocFileName: "CLAUDE.md",
        },
      ];
    case "codex":
      return [{
        key: "AGENTS",
        label: "AGENTS.md",
        desc: "Agent instructions Codex reads from AGENTS.md — coding standards, context and task guidelines",
        placeholder: "# Agent Instructions\n\nYou are working on a TypeScript codebase.\n\nFollow the existing code style and prefer small, focused edits.",
      }];
    default:
      return [...TAB_FILES];
  }
}

// Tabs shown only for Hermes runtime agents — maps to per-profile data in ~/.hermes/profiles/{id}/
const HERMES_TABS = [
  { key: "SOUL",   label: "SOUL",   desc: "Personality & behavior (SOUL.md in Hermes profile)" },
  { key: "CONFIG", label: "CONFIG", desc: "Model, env, toolsets (config.yaml in Hermes profile)" },
  { key: "SKILLS", label: "SKILLS", desc: "Installed skill bundles" },
  { key: "LOGS",   label: "LOGS",   desc: "Recent profile logs" },
] as const;

type HermesTabKey = "INFO" | (typeof HERMES_TABS)[number]["key"];
type TabKey = string;

/* ── Helpers ────────────────────────────────────────────────── */

/** Footer state shared between child tabs and the dialog footer. */
export interface FooterSaveState {
  isDirty: boolean;
  saving: boolean;
  saved: boolean;
  save: (() => Promise<void>) | null;
  reset?: (() => void) | null;
}

/* ── Props ─────────────────────────────────────────────────── */

export interface AgentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  /** Runtime from the live agents list — takes precedence over stale SQLite identity runtime. */
  agentRuntime?: string;
  workspaceFolder?: string;
  onDeleted?: () => void;
}

/* ── Main Component ────────────────────────────────────────── */

export function AgentDetailDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
  agentRuntime,
  workspaceFolder,
  onDeleted,
}: AgentDetailDialogProps) {
  const [tab, setTab] = useState<TabKey>("INFO");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [footerState, setFooterState] = useState<FooterSaveState>({
    isDirty: false,
    saving: false,
    saved: false,
    save: null,
  });

  const identity = useAgentIdentity(agentId);
  const resolvedAvatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarUrl = resolvedAvatarUrl && !resolvedAvatarUrl.startsWith("data:image/svg+xml") ? resolvedAvatarUrl : undefined;
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  // agentRuntime (from live agents list) takes precedence over stale SQLite identity runtime.
  const effectiveRuntime = agentRuntime || identity?.runtime;
  // Only the file tabs relevant to this agent's runtime
  const visibleFileTabs = getFileTabsForRuntime(effectiveRuntime);
  const DialogRuntimeIcon = effectiveRuntime === "claude-code" ? ClaudeCodeIcon
    : effectiveRuntime === "codex" ? CodexIcon
    : effectiveRuntime === "hermes" ? HermesIcon
    : null;
  const displayName = identity?.name || agentName;

  const isMain = agentId === "main" || agentId === "__main__";

  // Personality cache — fetched once per (agentId, open) so tab switches are instant.
  // Keys are uppercase file keys: SOUL, USER, AGENTS, TOOLS, HEARTBEAT, MEMORY.
  // IDENTITY is deliberately not cached here — the InfoTab form owns it.
  const [personalityCache, setPersonalityCache] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (open) {
      setTab("INFO");
      setFooterState({ isDirty: false, saving: false, saved: false, save: null });
      // Prefetch all personality files upfront so FileEditorTab tabs are instant.
      setPersonalityCache(null);
      (async () => {
        try {
          const p = (await bridgeInvoke("get-agent-personality", { agentId })) as Record<string, unknown>;
          // Safety: never let a runaway-write file (multi-MB SOUL.md, etc.)
          // enter React state. For oversized fields, we keep the length so
          // the child tab can render the "too large to edit" banner, but
          // drop the actual string so it can be garbage-collected after
          // this tick. The child's own length check catches this via the
          // sentinel-length string.
          const safe = (v: unknown): string => {
            const s = typeof v === "string" ? v : "";
            if (s.length > MAX_EDITOR_BYTES) {
              // Return a synthetic string of the same byte length so the
              // child's `text.length > MAX_EDITOR_BYTES` check trips in the
              // same way as reading a real oversized file, but the original
              // huge string is released for GC as soon as this scope exits.
              // We use a single repeated character so V8 can rope-compress
              // (O(1) memory) while still reporting the correct .length.
              return "\0".repeat(s.length > 1e9 ? 1e9 : s.length);
            }
            return s;
          };
          setPersonalityCache({
            SOUL:      safe(p?.soul),
            USER:      safe(p?.user),
            AGENTS:    safe(p?.agents),
            TOOLS:     safe(p?.tools),
            HEARTBEAT: safe(p?.heartbeat),
            MEMORY:    safe(p?.memory),
          });
        } catch {
          setPersonalityCache({});
        }
      })();
    }
  }, [open, agentId]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-2xl h-[85vh] min-h-[400px] gap-0 sm:rounded-xl p-0 overflow-hidden flex flex-col [-webkit-font-smoothing:subpixel-antialiased]"
          showCloseButton={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => { if (deleteOpen) e.preventDefault(); }}
        >
          {/* Header */}
          <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b border-border/40">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {DialogRuntimeIcon && !avatarUrl
                    ? <DialogRuntimeIcon className="w-6 h-6" />
                    : (avatarText || identity?.emoji || "🤖")
                  }
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold truncate">
                  Edit {displayName}
                </DialogTitle>
                <p className="text-xs text-muted-foreground truncate">{agentId}</p>
              </div>
            </div>
          </DialogHeader>

          {/* Tabs */}
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabKey)}
            className="flex flex-col flex-1 min-h-0"
            // Reset to INFO when switching between agents with different runtimes
          >
            <TabsList className="shrink-0 w-full justify-start rounded-none bg-transparent h-auto p-0 px-6">
              <TabsTrigger value="INFO" className="text-xs">INFO</TabsTrigger>
              {effectiveRuntime === "hermes"
                ? HERMES_TABS.map((tf) => (
                    <TabsTrigger key={tf.key} value={tf.key} className="text-xs">
                      {tf.label}
                    </TabsTrigger>
                  ))
                : visibleFileTabs.map((tf) => (
                    <TabsTrigger key={tf.key} value={tf.key} className="text-xs">
                      {tf.label}
                    </TabsTrigger>
                  ))
              }
            </TabsList>

            {tab === "INFO" && (
              <TabsContent value="INFO" className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-6 py-4 mt-0">
                <InfoTab
                  agentId={agentId}
                  identity={identity}
                  agentRuntime={effectiveRuntime}
                  workspaceFolder={workspaceFolder}
                  onStateChange={setFooterState}
                />
              </TabsContent>
            )}

            {/* Hermes-specific tabs — read/write directly from ~/.hermes/profiles/{agentId}/ */}
            {effectiveRuntime === "hermes" && HERMES_TABS.map((tf) =>
              tab === tf.key ? (
                <TabsContent
                  key={tf.key}
                  value={tf.key}
                  className="flex-1 min-h-0 flex flex-col overflow-y-auto customScrollbar2 px-6 py-4 mt-0"
                >
                  <p className="text-xs text-muted-foreground mb-3">{tf.desc}</p>
                  {tf.key === "SOUL" && (
                    <HermesTextFileTab
                      agentId={agentId}
                      action="hermes-get-soul"
                      updateAction="hermes-update-soul"
                      placeholder="Define Hermemes personality, values, and behavior..."
                      onStateChange={setFooterState}
                    />
                  )}
                  {tf.key === "CONFIG" && (
                    <HermesTextFileTab
                      agentId={agentId}
                      action="hermes-get-profile-config"
                      updateAction="hermes-update-profile-config"
                      placeholder="# config.yaml — model, toolsets, env, etc."
                      lang="yaml"
                      onStateChange={setFooterState}
                    />
                  )}
                  {tf.key === "SKILLS" && (
                    <HermesSkillsTab agentId={agentId} onStateChange={setFooterState} />
                  )}
                  {tf.key === "LOGS" && (
                    <HermesLogsTab agentId={agentId} onStateChange={setFooterState} />
                  )}
                </TabsContent>
              ) : null
            )}

            {/* OpenClaw / Claude Code / Codex — only the file(s) relevant to this runtime */}
            {effectiveRuntime !== "hermes" && visibleFileTabs.map((tf) =>
              tab === tf.key ? (
                <TabsContent
                  key={tf.key}
                  value={tf.key}
                  className="flex-1 min-h-0 flex flex-col overflow-y-auto customScrollbar2 px-6 py-4 mt-0"
                >
                  <p className="text-xs text-muted-foreground mb-3">{tf.desc}</p>
                  <FileEditorTab
                    agentId={agentId}
                    fileKey={tf.key}
                    runtime={effectiveRuntime}
                    runtimeDocFileName={tf.runtimeDocFileName}
                    onStateChange={setFooterState}
                    preloaded={tf.runtimeDocFileName ? undefined : personalityCache ? (personalityCache[tf.key] ?? null) : undefined}
                    onAfterSave={(fileKey, newContent) =>
                      setPersonalityCache(prev => prev ? { ...prev, [fileKey]: newContent } : null)
                    }
                    placeholder={tf.placeholder}
                  />
                </TabsContent>
              ) : null
            )}
          </Tabs>

          {/* Footer — shared Save button */}
          <DialogFooter className="shrink-0 px-6 py-3 border-t border-border/40 justify-between sm:justify-between">
            {!isMain ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              {footerState.saved && (
                <span className="text-xs text-emerald-500">Saved</span>
              )}
              {footerState.isDirty && !footerState.saved && (
                <span className="text-xs text-amber-500">Unsaved</span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                size="sm"
                disabled={footerState.saving || !footerState.isDirty}
                onClick={() => footerState.save?.()}
                className="gap-1.5"
              >
                {footerState.saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {footerState.saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isMain && (
        <DeleteAgentDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          agentId={agentId}
          agentDisplayName={displayName}
          onSuccess={() => {
            setDeleteOpen(false);
            onOpenChange(false);
            onDeleted?.();
          }}
        />
      )}
    </>
  );
}

/* ── Info Tab ─────────────────────────────────────────────── */

export function InfoTab({
  agentId,
  identity,
  agentRuntime,
  workspaceFolder,
  onStateChange,
}: {
  agentId: string;
  identity: ReturnType<typeof useAgentIdentity>;
  agentRuntime?: string;
  workspaceFolder?: string;
  onStateChange: (state: FooterSaveState) => void;
}) {
  const ed = useAgentIdentityEditor(agentId, {
    identityName: identity?.name,
    identityEmoji: identity?.emoji,
    identityAvatarUrl: resolveAvatarUrl(identity?.avatar),
    workspaceFolder,
    agentRuntime: agentRuntime || identity?.runtime,
  });
  const { isDirty, saving, saved, save } = ed;

  // Sync footer state
  useEffect(() => {
    onStateChange({
      isDirty,
      saving,
      saved,
      save: async () => { await save(); },
    });
  }, [isDirty, saving, saved, save, onStateChange]);

  if (ed.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // Skip SVG seeds (simple geometric shapes) — show branded runtime icon instead.
  const infoAvatarSrc = ed.displayAvatarSrc && !ed.displayAvatarSrc.startsWith("data:image/svg+xml")
    ? ed.displayAvatarSrc
    : undefined;
  const runtime = agentRuntime || identity?.runtime || ed.runtime;
  const InfoRuntimeIcon = !infoAvatarSrc && !ed.emoji
    ? (runtime === "claude-code" ? ClaudeCodeIcon
      : runtime === "codex" ? CodexIcon
      : runtime === "hermes" ? HermesIcon
      : null)
    : null;
  const showHeartbeat = !runtime || runtime === "openclaw";
  const showBehaviorSettings = runtime !== "codex" || showHeartbeat;

  return (
    <Accordion
      type="multiple"
      defaultValue={["identity"]}
      className="space-y-3"
    >
      <AccordionItem value="identity" className="rounded-xl border border-solid border-primary/10 bg-background/45 px-3 shadow-sm">
        <AccordionTrigger className="py-3 hover:no-underline">
          <div className="min-w-0 space-y-1 text-left">
            <div className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 text-primary/60 stroke-[1.8]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Identity
              </span>
            </div>
            <p className="text-[11px] font-normal leading-5 text-muted-foreground/70">
              Name, face, and quick visual cue for this agent.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative shrink-0 overflow-hidden rounded-md">
              <Avatar className="h-20 w-20 border border-primary/10 shadow-sm">
                {infoAvatarSrc && <AvatarImage src={infoAvatarSrc} alt={ed.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-3xl">
                  {InfoRuntimeIcon
                    ? <InfoRuntimeIcon className="w-10 h-10" />
                    : (ed.emoji || "🤖")
                  }
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => ed.fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                aria-label="Upload avatar image"
              >
                <ImagePlus className="h-6 w-6 text-white" />
              </button>
              <input
                ref={ed.fileInputRef}
                type="file"
                accept="image/*"
                onChange={ed.handleImageUpload}
                className="hidden"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                  Name
                </label>
                <Input
                  value={ed.name}
                  onChange={(e) => ed.setName(e.target.value)}
                  placeholder="Agent name"
                  className="h-10 rounded-lg border-primary/10 bg-foreground/[0.035] text-sm font-medium shadow-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-primary/10 bg-foreground/[0.035] text-xs gap-1.5 shadow-none"
                  onClick={() => ed.fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Upload image
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg border-primary/10 bg-foreground/[0.035] px-2.5 text-xs shadow-none"
                    >
                      <SmilePlus className="h-3.5 w-3.5" />
                      Emoji
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[102] w-64 rounded-xl border-primary/10 bg-popover/95 p-2 shadow-xl backdrop-blur-xl">
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJI_OPTIONS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => ed.setEmoji(e)}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-xl text-xl transition-colors hover:bg-primary/10",
                            ed.emoji === e && "bg-primary/15 ring-1 ring-primary/50"
                          )}
                          aria-label={`Use ${e} emoji`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                {ed.avatarPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-xs text-muted-foreground"
                    onClick={() => ed.setAvatarPreview(null)}
                  >
                    Clear upload
                  </Button>
                )}
                <span className="text-[11px] text-muted-foreground/60">
                  {ed.avatarPreview ? "Uploaded image ready to save" : ed.emoji ? `${ed.emoji} selected` : "Emoji fallback"}
                </span>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {showBehaviorSettings && (
        <AccordionItem value="behavior" className="rounded-xl border border-solid border-primary/10 bg-background/45 px-3 shadow-sm">
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="min-w-0 space-y-1 text-left">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary/60 stroke-[1.8]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Behavior
                </span>
              </div>
              <p className="text-[11px] font-normal leading-5 text-muted-foreground/70">
                Model and heartbeat settings for how this agent runs.
              </p>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-3 pt-0">
            {runtime !== "codex" && (
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1.5">Model</label>
                <Select value={ed.model || "__default__"} onValueChange={ed.setModel}>
                  <SelectTrigger className="h-10 rounded-lg border-primary/10 bg-foreground/[0.035] text-sm shadow-none">
                    <SelectValue placeholder={runtime === "hermes" ? "Hermes default" : "Use default"} />
                  </SelectTrigger>
                  <SelectContent className="z-[102]">
                    <SelectItem value="__default__">-- Use Default Model --</SelectItem>
                    {ed.availableModels.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  {runtime === "hermes"
                    ? "Model from Hermes profile config.yaml."
                    : runtime === "claude-code"
                    ? "Claude model for this agent."
                    : "AI model used by this agent. Leave empty to use OpenClaw default."}
                </p>
              </div>
            )}

            {showHeartbeat && (
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1.5">Heartbeat</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={ed.hbModel || "__default__"} onValueChange={ed.setHbModel}>
                      <SelectTrigger className="h-10 rounded-lg border-primary/10 bg-foreground/[0.035] text-sm shadow-none">
                        <SelectValue placeholder="Heartbeat model" />
                      </SelectTrigger>
                      <SelectContent className="z-[102]">
                        <SelectItem value="__default__">-- Use Default --</SelectItem>
                        {ed.availableModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[100px]">
                    <Input
                      value={ed.hbEvery}
                      onChange={(e) => ed.setHbEvery(e.target.value)}
                      placeholder="e.g., 30m"
                      className="h-10 rounded-lg border-primary/10 bg-foreground/[0.035] text-sm shadow-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Model and interval for periodic heartbeat tasks.
                </p>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      )}

      <AccordionItem value="profile" className="rounded-xl border border-solid border-primary/10 bg-background/45 px-3 shadow-sm">
        <AccordionTrigger className="py-3 hover:no-underline">
          <div className="min-w-0 space-y-1 text-left">
            <div className="flex items-center gap-1.5">
              <BadgeInfo className="h-3.5 w-3.5 text-primary/60 stroke-[1.8]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Profile details
              </span>
            </div>
            <p className="text-[11px] font-normal leading-5 text-muted-foreground/70">
              Role, department, and a short description for teammates.
            </p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-3 pt-0">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1.5">Role</label>
            <Input
              value={ed.role}
              onChange={(e) => ed.setRole(e.target.value)}
              placeholder="e.g., Code & Automation"
              className="h-10 rounded-lg border-primary/10 bg-foreground/[0.035] text-sm shadow-none"
            />
          </div>

          {ed.departments.length > 0 && (
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1.5">Department</label>
              <Select
                value={ed.department || "__none__"}
                onValueChange={(v) => ed.setDepartment(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-10 rounded-lg border-primary/10 bg-foreground/[0.035] text-sm shadow-none">
                  <SelectValue placeholder="No department" />
                </SelectTrigger>
                <SelectContent className="z-[102]">
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {ed.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-1.5">Description</label>
            <Textarea
              value={ed.description}
              onChange={(e) => ed.setDescription(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
                }
              }}
              placeholder="What does this agent do?"
              className="min-h-[72px] max-h-[300px] resize-y overflow-auto rounded-lg border-primary/10 bg-foreground/[0.035] text-sm shadow-none"
              rows={2}
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/* ── File editor tab ──────────────────────────────────────── */

export function FileEditorTab({
  agentId,
  fileKey,
  runtime,
  runtimeDocFileName,
  onStateChange,
  className,
  preloaded,
  onAfterSave,
  placeholder,
}: {
  agentId: string;
  fileKey: string;
  runtime?: string;
  runtimeDocFileName?: string;
  onStateChange: (state: FooterSaveState) => void;
  className?: string;
  /** Pre-fetched content from parent cache. `null` = file not found. `undefined` = not yet loaded. */
  preloaded?: string | null;
  /** Called after a successful save so the parent can update its cache. */
  onAfterSave?: (fileKey: string, newContent: string) => void;
  /** Custom placeholder shown in the textarea when the file is empty. */
  placeholder?: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // When content exceeds MAX_EDITOR_BYTES we keep the size but do NOT bind
  // the string to a textarea — guards against a runaway-write file pinning
  // the renderer at multi-GB RSS.
  const [oversizedBytes, setOversizedBytes] = useState<number | null>(null);
  const displayFileName = runtimeDocFileName ?? `${fileKey}.md`;

  useEffect(() => {
    setSaveError(null);
    setSaveSuccess(false);
    setOversizedBytes(null);

    const accept = (text: string | null): boolean => {
      // `null` means file not found — allowed.
      if (text === null) return true;
      if (text.length > MAX_EDITOR_BYTES) {
        setOversizedBytes(text.length);
        setContent("");
        setOriginalContent("");
        setNotFound(false);
        setLoading(false);
        return false;
      }
      return true;
    };

    // If the parent has already fetched personality data, use it directly —
    // no bridge round-trip needed on tab switch.
    if (!runtimeDocFileName && preloaded !== undefined) {
      if (!accept(preloaded)) return;
      const text = preloaded ?? "";
      setContent(text);
      setOriginalContent(preloaded === null ? null : text);
      setNotFound(preloaded === null || preloaded === "");
      setLoading(false);
      return;
    }

    // Fallback: fetch independently (e.g. when used outside AgentDetailDialog).
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        if (runtimeDocFileName) {
          const res = (await bridgeInvoke("get-agent-identity-doc", {
            agentId,
            runtime,
            fileName: runtimeDocFileName,
          })) as { success?: boolean; content?: string; error?: string };
          if (cancelled) return;
          const fileContent = typeof res?.content === "string" ? res.content : "";
          if (fileContent !== "") {
            if (!accept(fileContent)) return;
            setContent(fileContent);
            setOriginalContent(fileContent);
          } else {
            setContent("");
            setOriginalContent(null);
            setNotFound(true);
          }
          if (!cancelled) setLoading(false);
          return;
        }

        const personality = (await bridgeInvoke("get-agent-personality", {
          agentId,
        })) as Record<string, string | boolean | undefined>;
        if (cancelled) return;
        const fieldName = fileKey.toLowerCase();
        const fileContent = personality?.[fieldName];
        if (typeof fileContent === "string" && fileContent !== "") {
          if (!accept(fileContent)) return;
          setContent(fileContent);
          setOriginalContent(fileContent);
        } else {
          setContent("");
          setOriginalContent(null);
          setNotFound(true);
        }
      } catch {
        if (!cancelled) {
          setContent("");
          setOriginalContent(null);
          setNotFound(true);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, fileKey, preloaded, runtime, runtimeDocFileName]);

  const isDirty = oversizedBytes !== null
    ? false
    : notFound ? (content ?? "") !== "" : content !== originalContent;

  const handleSave = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = (await bridgeInvoke(
        runtimeDocFileName ? "write-agent-identity-doc" : "save-agent-file",
        runtimeDocFileName
          ? { agentId, runtime, fileName: runtimeDocFileName, content }
          : { agentId, fileKey, content },
      )) as { success?: boolean; error?: string };
      if (res?.success) {
        setOriginalContent(content);
        setNotFound(false);
        setSaveSuccess(true);
        if (runtimeDocFileName === "IDENTITY.md" && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("openclaw-gateway-event", {
            detail: { event: "agent.file.changed", data: { agentId, fileKey: "IDENTITY" } },
          }));
        }
        onAfterSave?.(fileKey, content);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setSaveError(res?.error ?? "Failed to save");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  }, [agentId, fileKey, runtime, runtimeDocFileName, content, onAfterSave]);

  const handleReset = useCallback(() => {
    setContent(originalContent ?? "");
    setSaveError(null);
    setSaveSuccess(false);
  }, [originalContent]);

  // Sync footer state
  useEffect(() => {
    onStateChange({ isDirty, saving, saved: saveSuccess, save: handleSave, reset: handleReset });
  }, [isDirty, saving, saveSuccess, handleSave, handleReset, onStateChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    },
    [isDirty, handleSave]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (oversizedBytes !== null) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <OversizedFileBanner fileName={displayFileName} size={oversizedBytes} />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 bg-secondary", className)} onKeyDown={handleKeyDown}>
      <Textarea
        value={content ?? ""}
        onChange={(e) => setContent(e.target.value)}
        className={cn(
          "w-full text-xs font-mono leading-relaxed resize-none border-none focus-visible:ring-0",
          className ? "flex-1 min-h-[120px]" : "min-h-[300px]"
        )}
        spellCheck={false}
        placeholder={placeholder ?? `Start writing ${displayFileName} content...`}
      />
      <div className="flex items-center justify-end">
        {saveError && (
          <span className="text-[10px] text-destructive mr-auto">{saveError}</span>
        )}
        <span className="text-[10px] text-muted-foreground/60">{displayFileName}</span>
      </div>
    </div>
  );
}

/* ── Hermes text-file tab (SOUL.md / config.yaml) ────────────── */

export function HermesTextFileTab({
  agentId,
  action,
  updateAction,
  placeholder,
  lang,
  onStateChange,
}: {
  agentId: string;
  action: string;
  updateAction: string;
  placeholder?: string;
  lang?: string;
  onStateChange: (state: FooterSaveState) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [oversizedBytes, setOversizedBytes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    setOversizedBytes(null);
    (async () => {
      try {
        const res = (await bridgeInvoke(action, { agentId })) as { content?: string };
        if (!cancelled) {
          const c = res?.content ?? "";
          if (c.length > MAX_EDITOR_BYTES) {
            // Don't let a runaway-write file into React state — would pin
            // the renderer at multi-GB RSS.
            setOversizedBytes(c.length);
            setContent("");
            setOriginalContent("");
          } else {
            setContent(c);
            setOriginalContent(c);
          }
        }
      } catch {
        if (!cancelled) { setContent(""); setOriginalContent(""); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, action]);

  const isDirty = oversizedBytes !== null ? false : content !== originalContent;

  const handleSave = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = (await bridgeInvoke(updateAction, { agentId, content })) as { success?: boolean; error?: string };
      if (res?.success) {
        setOriginalContent(content);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setSaveError(res?.error ?? "Failed to save");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  }, [agentId, updateAction, content]);

  const handleReset = useCallback(() => {
    setContent(originalContent ?? "");
    setSaveError(null);
    setSaveSuccess(false);
  }, [originalContent]);

  useEffect(() => {
    onStateChange({ isDirty, saving, saved: saveSuccess, save: handleSave, reset: handleReset });
  }, [isDirty, saving, saveSuccess, handleSave, handleReset, onStateChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    },
    [isDirty, handleSave]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (oversizedBytes !== null) {
    return (
      <div className="flex flex-col gap-2 flex-1">
        <OversizedFileBanner fileName="SOUL.md" size={oversizedBytes} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 flex-1" onKeyDown={handleKeyDown}>
      <Textarea
        value={content ?? ""}
        onChange={(e) => setContent(e.target.value)}
        className="w-full flex-1 min-h-[300px] text-xs font-mono leading-relaxed resize-none border-none focus-visible:ring-0"
        spellCheck={false}
        placeholder={placeholder}
      />
      <div className="flex items-center justify-end">
        {saveError && (
          <span className="text-[10px] text-destructive mr-auto">{saveError}</span>
        )}
        {lang && <span className="text-[10px] text-muted-foreground/60">{lang}</span>}
      </div>
    </div>
  );
}

/* ── Hermes skills tab ────────────────────────────────────────── */

interface HermesSkill {
  name: string;
  description: string;
  fileCount: number;
}

export function HermesSkillsTab({
  agentId,
  onStateChange,
}: {
  agentId: string;
  onStateChange: (state: FooterSaveState) => void;
}) {
  const [skills, setSkills] = useState<HermesSkill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onStateChange({ isDirty: false, saving: false, saved: false, save: null });
  }, [onStateChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("hermes-list-skills", { agentId })) as { skills?: HermesSkill[] };
        if (!cancelled) setSkills(res?.skills ?? []);
      } catch {
        if (!cancelled) setSkills([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Package className="h-8 w-8 opacity-30" />
        <p className="text-sm">No skill bundles installed</p>
        <p className="text-xs opacity-60">Install skills with <code className="font-mono bg-muted px-1 rounded">hermes skills install &lt;name&gt;</code></p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {skills.map((skill) => (
        <div key={skill.name} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
          <Package className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium font-mono">{skill.name}</p>
            {skill.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{skill.description}</p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/60 shrink-0">{skill.fileCount} file{skill.fileCount !== 1 ? "s" : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Hermes logs tab ──────────────────────────────────────────── */

interface HermesLogEntry {
  file: string;
  content: string;
}

export function HermesLogsTab({
  agentId,
  onStateChange,
}: {
  agentId: string;
  onStateChange: (state: FooterSaveState) => void;
}) {
  const [logs, setLogs] = useState<HermesLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onStateChange({ isDirty: false, saving: false, saved: false, save: null });
  }, [onStateChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("hermes-get-profile-logs", { agentId, limit: 300 })) as { logs?: HermesLogEntry[] };
        if (!cancelled) setLogs(res?.logs ?? []);
      } catch {
        if (!cancelled) setLogs([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <ScrollText className="h-8 w-8 opacity-30" />
        <p className="text-sm">No logs yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {logs.map((entry, i) => (
        <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
          <span className="text-muted-foreground/40 shrink-0 w-[72px] truncate">{entry.file}</span>
          <span className="text-muted-foreground/80 break-all">{entry.content}</span>
        </div>
      ))}
    </div>
  );
}
