"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Save, Trash2, Loader2, ImagePlus, Package, ScrollText } from "lucide-react";
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

const TAB_FILES = [
  { key: "SOUL",      label: "SOUL",      desc: "Personality & behavior" },
  { key: "IDENTITY",  label: "IDENTITY",  desc: "Agent identity — name, emoji, avatar" },
  { key: "USER",      label: "USER",      desc: "Context about the human" },
  { key: "AGENTS",    label: "AGENTS",    desc: "Team awareness" },
  { key: "TOOLS",     label: "TOOLS",     desc: "Tools & MCP servers" },
  { key: "HEARTBEAT", label: "HEARTBEAT", desc: "Periodic tasks & health checks" },
  { key: "MEMORY",    label: "MEMORY",    desc: "Persistent memory" },
] as const;

// Tabs shown only for Hermes runtime agents — maps to per-profile data in ~/.hermes/profiles/{id}/
const HERMES_TABS = [
  { key: "SOUL",   label: "SOUL",   desc: "Personality & behavior (SOUL.md in Hermes profile)" },
  { key: "CONFIG", label: "CONFIG", desc: "Model, env, toolsets (config.yaml in Hermes profile)" },
  { key: "SKILLS", label: "SKILLS", desc: "Installed skill bundles" },
  { key: "LOGS",   label: "LOGS",   desc: "Recent profile logs" },
] as const;

type HermesTabKey = "INFO" | (typeof HERMES_TABS)[number]["key"];
type TabKey = "INFO" | (typeof TAB_FILES)[number]["key"] | (typeof HERMES_TABS)[number]["key"];

/* ── Helpers ────────────────────────────────────────────────── */

/** Footer state shared between child tabs and the dialog footer. */
export interface FooterSaveState {
  isDirty: boolean;
  saving: boolean;
  saved: boolean;
  save: (() => Promise<void>) | null;
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
  const DialogRuntimeIcon = effectiveRuntime === "claude-code" ? ClaudeCodeIcon
    : effectiveRuntime === "codex" ? CodexIcon
    : effectiveRuntime === "hermes" ? HermesIcon
    : null;
  const displayName = identity?.name || agentName;

  const isMain = agentId === "main" || agentId === "__main__";

  // Personality cache — fetched once per (agentId, open) so tab switches are instant.
  // Keys are uppercase file keys: SOUL, IDENTITY, USER, AGENTS, TOOLS, HEARTBEAT, MEMORY.
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
          setPersonalityCache({
            SOUL:      (p?.soul      as string) ?? "",
            IDENTITY:  (p?.identity  as string) ?? "",
            USER:      (p?.user      as string) ?? "",
            AGENTS:    (p?.agents    as string) ?? "",
            TOOLS:     (p?.tools     as string) ?? "",
            HEARTBEAT: (p?.heartbeat as string) ?? "",
            MEMORY:    (p?.memory    as string) ?? "",
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
                : TAB_FILES.map((tf) => (
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

            {/* OpenClaw / Claude Code / default tabs */}
            {effectiveRuntime !== "hermes" && TAB_FILES.map((tf) =>
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
                    onStateChange={setFooterState}
                    preloaded={personalityCache ? (personalityCache[tf.key] ?? null) : undefined}
                    onAfterSave={(fileKey, newContent) =>
                      setPersonalityCache(prev => prev ? { ...prev, [fileKey]: newContent } : null)
                    }
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
  workspaceFolder,
  onStateChange,
}: {
  agentId: string;
  identity: ReturnType<typeof useAgentIdentity>;
  workspaceFolder?: string;
  onStateChange: (state: FooterSaveState) => void;
}) {
  const ed = useAgentIdentityEditor(agentId, {
    identityName: identity?.name,
    identityEmoji: identity?.emoji,
    identityAvatarUrl: resolveAvatarUrl(identity?.avatar),
    workspaceFolder,
    agentRuntime: identity?.runtime,
  });

  // Sync footer state
  useEffect(() => {
    onStateChange({
      isDirty: ed.isDirty,
      saving: ed.saving,
      saved: ed.saved,
      save: async () => { await ed.save(); },
    });
  }, [ed.isDirty, ed.saving, ed.saved, ed.save, onStateChange]);

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
  const runtime = identity?.runtime || ed.runtime;
  const InfoRuntimeIcon = !infoAvatarSrc
    ? (runtime === "claude-code" ? ClaudeCodeIcon
      : runtime === "codex" ? CodexIcon
      : runtime === "hermes" ? HermesIcon
      : null)
    : null;

  return (
    <div className="space-y-5">
      {/* ── Avatar ─────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium mb-2">Avatar</label>
        <div className="flex items-start gap-4 mb-3">
          <div className="relative shrink-0">
            <Avatar className="h-16 w-16">
              {infoAvatarSrc && <AvatarImage src={infoAvatarSrc} alt={ed.name} />}
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                {InfoRuntimeIcon
                  ? <InfoRuntimeIcon className="w-9 h-9" />
                  : (ed.emoji || "🤖")
                }
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => ed.fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
            >
              <ImagePlus className="h-5 w-5 text-white" />
            </button>
            <input
              ref={ed.fileInputRef}
              type="file"
              accept="image/*"
              onChange={ed.handleImageUpload}
              className="hidden"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <Input
              value={ed.avatarPreview ? "(uploaded image)" : ed.avatarPath}
              onChange={(e) => {
                ed.setAvatarPath(e.target.value);
                ed.setAvatarPreview(null);
              }}
              disabled={!!ed.avatarPreview}
              placeholder="Image URL or filename (e.g. avatar.png)"
              className="h-8 text-xs"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => ed.fileInputRef.current?.click()}
              >
                <ImagePlus className="h-3 w-3" />
                Upload image
              </Button>
              {ed.avatarPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => ed.setAvatarPreview(null)}
                >
                  Clear upload
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* Emoji picker */}
        <div className="flex flex-wrap gap-1.5">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => ed.setEmoji(e)}
              className={cn(
                "text-xl p-1.5 rounded-md hover:bg-primary/10 transition-colors",
                ed.emoji === e && "bg-primary/15 ring-2 ring-primary/50"
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* ── Model ──────────────────────────────── */}
      {runtime !== "codex" && (
        <div>
          <label className="block text-sm font-medium mb-1.5">Model</label>
          <Select value={ed.model || "__default__"} onValueChange={ed.setModel}>
            <SelectTrigger className="h-10">
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

      {/* ── Runtime (read-only — set at agent creation) ── */}
      {ed.runtime && (
        <div>
          <label className="block text-sm font-medium mb-1.5">Runtime</label>
          <div className="h-10 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none">
            {ed.runtime}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Runtime is set when the agent is created and cannot be changed.
          </p>
        </div>
      )}

      {/* ── Heartbeat — OpenClaw only ────────────── */}
      {(!runtime || runtime === "openclaw") && <div>
        <label className="block text-sm font-medium mb-1.5">Heartbeat</label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Select value={ed.hbModel || "__default__"} onValueChange={ed.setHbModel}>
              <SelectTrigger className="h-10">
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
              className="h-10"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Model and interval for periodic heartbeat tasks.
        </p>
      </div>}

      {/* ── Name ───────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Name</label>
        <Input
          value={ed.name}
          onChange={(e) => ed.setName(e.target.value)}
          placeholder="Agent name"
        />
      </div>

      {/* ── Role ───────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Role</label>
        <Input
          value={ed.role}
          onChange={(e) => ed.setRole(e.target.value)}
          placeholder="e.g., Code & Automation"
        />
      </div>

      {/* ── Department ─────────────────────────── */}
      {ed.departments.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1.5">Department</label>
          <Select
            value={ed.department || "__none__"}
            onValueChange={(v) => ed.setDepartment(v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="h-10">
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

      {/* ── Description ────────────────────────── */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Description</label>
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
          className="min-h-[60px] max-h-[300px] resize-y overflow-auto"
          rows={2}
        />
      </div>
    </div>
  );
}

/* ── File editor tab ──────────────────────────────────────── */

export function FileEditorTab({
  agentId,
  fileKey,
  onStateChange,
  className,
  preloaded,
  onAfterSave,
}: {
  agentId: string;
  fileKey: string;
  onStateChange: (state: FooterSaveState) => void;
  className?: string;
  /** Pre-fetched content from parent cache. `null` = file not found. `undefined` = not yet loaded. */
  preloaded?: string | null;
  /** Called after a successful save so the parent can update its cache. */
  onAfterSave?: (fileKey: string, newContent: string) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setSaveError(null);
    setSaveSuccess(false);

    // If the parent has already fetched personality data, use it directly —
    // no bridge round-trip needed on tab switch.
    if (preloaded !== undefined) {
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
        const personality = (await bridgeInvoke("get-agent-personality", {
          agentId,
        })) as Record<string, string | boolean | undefined>;
        if (cancelled) return;
        const fieldName = fileKey.toLowerCase();
        const fileContent = personality?.[fieldName];
        if (typeof fileContent === "string" && fileContent !== "") {
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
  }, [agentId, fileKey, preloaded]);

  const isDirty = notFound ? (content ?? "") !== "" : content !== originalContent;

  const handleSave = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = (await bridgeInvoke("save-agent-file", {
        agentId,
        fileKey,
        content,
      })) as { success?: boolean; error?: string };
      if (res?.success) {
        setOriginalContent(content);
        setNotFound(false);
        setSaveSuccess(true);
        onAfterSave?.(fileKey, content);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setSaveError(res?.error ?? "Failed to save");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  }, [agentId, fileKey, content, onAfterSave]);

  // Sync footer state
  useEffect(() => {
    onStateChange({ isDirty, saving, saved: saveSuccess, save: handleSave });
  }, [isDirty, saving, saveSuccess, handleSave, onStateChange]);

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

  return (
    <div className={cn("flex flex-col gap-2", className)} onKeyDown={handleKeyDown}>
      {notFound && (
        <p className="text-xs text-amber-500/80 italic">
          This file doesn&apos;t exist yet. Start typing to create it.
        </p>
      )}
      <Textarea
        value={content ?? ""}
        onChange={(e) => setContent(e.target.value)}
        className={cn(
          "w-full text-xs font-mono leading-relaxed resize-none",
          className ? "flex-1 min-h-[120px]" : "min-h-[300px]"
        )}
        spellCheck={false}
        placeholder={`Start writing ${fileKey}.md content...`}
      />
      <div className="flex items-center justify-end">
        {saveError && (
          <span className="text-[10px] text-destructive mr-auto">{saveError}</span>
        )}
        <span className="text-[10px] text-muted-foreground/60">{fileKey}.md</span>
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    (async () => {
      try {
        const res = (await bridgeInvoke(action, { agentId })) as { content?: string };
        if (!cancelled) {
          const c = res?.content ?? "";
          setContent(c);
          setOriginalContent(c);
        }
      } catch {
        if (!cancelled) { setContent(""); setOriginalContent(""); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, action]);

  const isDirty = content !== originalContent;

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

  useEffect(() => {
    onStateChange({ isDirty, saving, saved: saveSuccess, save: handleSave });
  }, [isDirty, saving, saveSuccess, handleSave, onStateChange]);

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

  return (
    <div className="flex flex-col gap-2 flex-1" onKeyDown={handleKeyDown}>
      <Textarea
        value={content ?? ""}
        onChange={(e) => setContent(e.target.value)}
        className="w-full flex-1 min-h-[300px] text-xs font-mono leading-relaxed resize-none"
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
