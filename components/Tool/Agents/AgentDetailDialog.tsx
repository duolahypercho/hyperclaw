"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Save, Trash2, Loader2, ImagePlus } from "lucide-react";
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
import { resolveAgentFolder } from "$/lib/identity-md";
import {
  useAgentIdentityEditor,
  EMOJI_OPTIONS,
} from "$/hooks/useAgentIdentityEditor";
import { DeleteAgentDialog } from "./DeleteAgentDialog";

/* ── Constants ─────────────────────────────────────────────── */

const TAB_FILES = [
  { key: "SOUL", label: "SOUL", desc: "Personality & behavior" },
  { key: "USER", label: "USER", desc: "Context about the human" },
  { key: "AGENTS", label: "AGENTS", desc: "Team awareness" },
  { key: "TOOLS", label: "TOOLS", desc: "Tools & MCP servers" },
  { key: "HEARTBEAT", label: "HEARTBEAT", desc: "Periodic tasks & health checks" },
] as const;

type TabKey = "INFO" | (typeof TAB_FILES)[number]["key"];

/* ── Helpers ────────────────────────────────────────────────── */

/** Footer state shared between child tabs and the dialog footer. */
interface FooterSaveState {
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
  workspaceFolder?: string;
  onDeleted?: () => void;
}

/* ── Main Component ────────────────────────────────────────── */

export function AgentDetailDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
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
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const displayName = identity?.name || agentName;

  const folder = resolveAgentFolder(agentId, workspaceFolder);
  const isMain = agentId === "main";

  useEffect(() => {
    if (open) {
      setTab("INFO");
      setFooterState({ isDirty: false, saving: false, saved: false, save: null });
    }
  }, [open]);

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
                  {avatarText || identity?.emoji || "🤖"}
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
          >
            <TabsList className="shrink-0 w-full justify-start rounded-none bg-transparent h-auto p-0 px-6">
              <TabsTrigger
                value="INFO"
                className="text-xs"
              >
                INFO
              </TabsTrigger>
              {TAB_FILES.map((tf) => (
                <TabsTrigger
                  key={tf.key}
                  value={tf.key}
                  className="text-xs"
                >
                  {tf.label}
                </TabsTrigger>
              ))}
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

            {TAB_FILES.map((tf) =>
              tab === tf.key ? (
                <TabsContent
                  key={tf.key}
                  value={tf.key}
                  className="flex-1 min-h-0 flex flex-col overflow-y-auto customScrollbar2 px-6 py-4 mt-0"
                >
                  <p className="text-xs text-muted-foreground mb-3">{tf.desc}</p>
                  <FileEditorTab
                    relativePath={`${folder}/${tf.key}.md`}
                    onStateChange={setFooterState}
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

function InfoTab({
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

  return (
    <div className="space-y-5">
      {/* ── Avatar ─────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium mb-2">Avatar</label>
        <div className="flex items-start gap-4 mb-3">
          <div className="relative group shrink-0">
            <Avatar className="h-16 w-16">
              {ed.displayAvatarSrc && <AvatarImage src={ed.displayAvatarSrc} alt={ed.name} />}
              <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                {ed.emoji || "🤖"}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => ed.fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
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
      <div>
        <label className="block text-sm font-medium mb-1.5">Model</label>
        <Select value={ed.model} onValueChange={ed.setModel}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Use OpenClaw default" />
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
          AI model used by this agent. Leave empty to use OpenClaw default.
        </p>
      </div>

      {/* ── Heartbeat ────────────────────────────── */}
      <div>
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
      </div>

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

function FileEditorTab({
  relativePath,
  onStateChange,
}: {
  relativePath: string;
  onStateChange: (state: FooterSaveState) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    setNotFound(false);
    (async () => {
      try {
        const res = (await bridgeInvoke("get-openclaw-doc", {
          relativePath,
        })) as { success?: boolean; content?: string | null; error?: string };
        if (cancelled) return;
        if (res?.success && typeof res.content === "string") {
          setContent(res.content);
          setOriginalContent(res.content);
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
  }, [relativePath]);

  const isDirty = notFound ? (content ?? "") !== "" : content !== originalContent;

  const handleSave = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = (await bridgeInvoke("write-openclaw-doc", {
        relativePath,
        content,
      })) as { success?: boolean; error?: string };
      if (res?.success) {
        setOriginalContent(content);
        setNotFound(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setSaveError(res?.error ?? "Failed to save");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  }, [relativePath, content]);

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
    <div className="flex flex-col flex-1 min-h-0 gap-2" onKeyDown={handleKeyDown}>
      {notFound && (
        <p className="text-xs text-amber-500/80 italic">
          This file doesn&apos;t exist yet. Start typing to create it.
        </p>
      )}
      <Textarea
        value={content ?? ""}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 min-h-[300px] text-xs font-mono leading-relaxed resize-none"
        spellCheck={false}
        placeholder={`Start writing ${relativePath.split("/").pop()} content...`}
      />
      <div className="flex items-center justify-end">
        {saveError && (
          <span className="text-[10px] text-destructive mr-auto">{saveError}</span>
        )}
        <span className="text-[10px] text-muted-foreground/60">{relativePath}</span>
      </div>
    </div>
  );
}
