"use client";

import React, { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Save,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useFocusMode } from "./hooks/useFocusMode";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  useAgentIdentity,
  resolveAvatarUrl,
  resolveAvatarText,
} from "$/hooks/useAgentIdentity";
import { ClaudeCodeIcon, CodexIcon, HermesIcon } from "$/components/Onboarding/RuntimeIcons";
import {
  InfoTab,
  FileEditorTab,
  type FooterSaveState,
} from "$/components/Tool/Agents/AgentDetailDialog";
import { DeleteAgentDialog } from "$/components/Tool/Agents/DeleteAgentDialog";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import { PanelChatView, type PanelChatViewHandle } from "./AgentChatPanel";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import { OPEN_AGENT_CHAT_EVENT, AGENT_READ_EVENT } from "./StatusWidget";
import { OPEN_AGENT_PANEL_EVENT } from "./AgentChatPanel";
import type { BackendTab } from "./gateway-chat/GatewayChatHeader";
import AgentStatsTab from "./AgentStatsTab";
import { CronsProvider, useCrons } from "$/components/Tool/Crons/provider/cronsProvider";
import { AddCronDialog } from "$/components/Tool/Crons/AddCronDialog";
import { EditCronDialog } from "$/components/Tool/Crons/EditCronDialog";
import { getJobPalette, getJobNextRunDate, getStatusColor } from "$/components/Tool/Crons/utils";
import { formatDistanceToNow } from "date-fns";
import type { OpenClawCronJobJson } from "$/types/electron";

/* ── Helpers ──────────────────────────────────────────────── */

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

/** Pull the last assistant text out of a messages array */
function extractLastAssistantText(messages: Array<{ role?: string; content?: unknown }>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string" && content.trim()) return content.trim().slice(0, 200);
    if (Array.isArray(content)) {
      const block = content.find((b: unknown) => (b as { type?: string })?.type === "text") as { text?: string } | undefined;
      if (block?.text?.trim()) return block.text.trim().slice(0, 200);
    }
  }
  return undefined;
}

type Session = { key: string; label?: string; updatedAt?: number; status?: string; trigger?: string; preview?: string };

/* ── Agent Inbox ──────────────────────────────────────────── */

interface AgentInboxViewProps {
  sessions: Session[];
  loading: boolean;
  lastSeenTs: number;
  readSessions: Set<string>;
  unreadCount: number;
  previewLoadingKeys: Set<string>;
  onSelect: (key: string) => void;
  onNewChat: () => void;
}

function AgentInboxView({ sessions, loading, lastSeenTs, readSessions, unreadCount, previewLoadingKeys, onSelect, onNewChat }: AgentInboxViewProps) {
  // Key of the most recently updated unread session — this one shows the numeric count badge
  const latestUnreadKey = useMemo(() => {
    let best: Session | null = null;
    for (const s of sessions) {
      const isUnread = !readSessions.has(s.key) && lastSeenTs > 0 && (s.updatedAt || 0) > lastSeenTs;
      if (isUnread && (!best || (s.updatedAt || 0) > (best.updatedAt || 0))) best = s;
    }
    return best?.key ?? null;
  }, [sessions, readSessions, lastSeenTs]);
  if (loading) {
    return (
      <div className="flex flex-col overflow-y-auto customScrollbar2 flex-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2 px-3 py-2.5 border-b border-border/20 last:border-0">
            {/* Status icon placeholder */}
            <div className="shrink-0 w-3.5 flex items-center justify-center mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/10 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {/* Title row */}
              <div className="flex items-baseline gap-1.5">
                <div className="h-[11px] bg-muted-foreground/10 rounded animate-pulse flex-1" style={{ width: `${55 + (i % 3) * 15}%` }} />
                <div className="h-[10px] bg-muted-foreground/10 rounded animate-pulse w-7 shrink-0" />
              </div>
              {/* Preview lines */}
              <div className="space-y-1">
                <div className="h-[11px] bg-muted-foreground/10 rounded animate-pulse w-4/5" />
                <div className="h-[11px] bg-muted-foreground/10 rounded animate-pulse" style={{ width: `${40 + (i % 4) * 10}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
        <MessageSquare className="w-7 h-7 opacity-30" />
        <p className="text-xs">No sessions yet</p>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 mt-1" onClick={onNewChat}>
          <Plus className="w-3 h-3" />
          New Chat
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1 border-b border-border/20">
        <span className="text-[10px] text-muted-foreground">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
        <button
          onClick={onNewChat}
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
          title="New chat"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto customScrollbar2">
      {sessions.map((s) => {
        const isUnread = !readSessions.has(s.key) && lastSeenTs > 0 && (s.updatedAt || 0) > lastSeenTs;
        const isActive = s.status === "active";
        const isWaiting = s.status === "waiting";
        const isSuccess = s.status === "completed" || s.status === "success" || s.status === "done";
        const isError = s.status === "error" || s.status === "failed" || s.status === "aborted";
        const title = s.label || s.key.split(":").pop() || s.key;
        const preview = s.preview;
        return (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className="flex items-start w-full gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0"
          >
            {/* Status icon — top-aligned */}
            <div className="shrink-0 w-3.5 flex items-center justify-center mt-1.5">
              {isActive ? (
                <span className="relative flex w-2 h-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
                </span>
              ) : isWaiting ? (
                <span className="w-2 h-2 rounded-full bg-amber-400" />
              ) : isSuccess ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : isError ? (
                <X className="w-3 h-3 text-destructive" />
              ) : (
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isUnread ? "bg-primary" : "bg-muted-foreground/20"
                )} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Title row: session timestamp + status tags + time ago + NEW */}
              <div className="flex items-baseline gap-1.5 min-w-0">
                <p className={cn(
                  "text-[11px] truncate min-w-0 flex-1",
                  isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/60"
                )}>
                  {title}
                </p>
                {isActive && (
                  <span className="shrink-0 text-[9px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-px rounded-full">
                    generating
                  </span>
                )}
                {isWaiting && (
                  <span className="shrink-0 text-[9px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-px rounded-full">
                    waiting
                  </span>
                )}
                {!isActive && s.updatedAt && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">
                    {relTime(s.updatedAt)}
                  </span>
                )}
                {isUnread && (
                  <span className="shrink-0 text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    {s.key === latestUnreadKey && unreadCount > 1 ? unreadCount : "NEW"}
                  </span>
                )}
              </div>
              {/* Latest message preview — skeleton while loading, text when ready */}
              {preview ? (
                <p className={cn(
                  "text-[11px] line-clamp-2 [overflow-wrap:anywhere] mt-0.5",
                  isUnread ? "text-muted-foreground/80" : "text-muted-foreground/50"
                )}>
                  {preview}
                </p>
              ) : previewLoadingKeys.has(s.key) && (
                <div className="mt-0.5 space-y-1">
                  <div className="h-[11px] bg-muted-foreground/10 rounded animate-pulse w-4/5" />
                  <div className="h-[11px] bg-muted-foreground/10 rounded animate-pulse w-3/5" />
                </div>
              )}
            </div>
          </button>
        );
      })}
      </div>
    </div>
  );
}

/* ── Tab definitions ──────────────────────────────────────── */

const TAB_FILES = [
  { key: "SOUL",      label: "Soul",      desc: "Personality & behavior" },
  { key: "IDENTITY",  label: "Identity",  desc: "Agent identity — name, emoji, avatar" },
  { key: "USER",      label: "User",      desc: "Context about the human" },
  { key: "AGENTS",    label: "Agents",    desc: "Team awareness" },
  { key: "TOOLS",     label: "Tools",     desc: "Tools & MCP servers" },
  { key: "HEARTBEAT", label: "Heartbeat", desc: "Periodic tasks & work schedule" },
  { key: "MEMORY",    label: "Memory",    desc: "Persistent memory" },
] as const;

type FileTabKey = (typeof TAB_FILES)[number]["key"];
type WidgetTab = "CHAT" | "INFO" | "STATS" | "FILES" | "CRONS";

/* ── Agent Crons Tab ──────────────────────────────────────── */

function AgentCronsView({ agentId }: { agentId: string }) {
  const { jobsForList, parsedCronJobs, bridgeLoading, runningJobIds, cronDelete } = useCrons();
  const [selectedJob, setSelectedJob] = useState<OpenClawCronJobJson | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const agentJobs = useMemo(() => {
    const filtered = jobsForList.filter((j) => j.agentId === agentId);
    const running: OpenClawCronJobJson[] = [];
    const rest: OpenClawCronJobJson[] = [];
    for (const j of filtered) {
      if (runningJobIds.includes(j.id)) running.push(j);
      else rest.push(j);
    }
    rest.sort((a, b) => (b.state?.lastRunAtMs ?? 0) - (a.state?.lastRunAtMs ?? 0));
    return [...running, ...rest];
  }, [jobsForList, agentId, runningJobIds]);

  const handleDelete = useCallback(async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setDeletingId(jobId);
    try {
      await cronDelete(jobId);
    } finally {
      setDeletingId(null);
    }
  }, [cronDelete]);

  if (bridgeLoading && jobsForList.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground">
          {agentJobs.length} job{agentJobs.length !== 1 ? "s" : ""}
        </span>
        <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => setAddOpen(true)} title="Add cron job">
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {agentJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground py-6">
          <MessageSquare className="w-7 h-7 opacity-30" />
          <p className="text-xs">No cron jobs for this agent</p>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 mt-1" onClick={() => setAddOpen(true)}>
            <Plus className="w-3 h-3" />
            Add cron job
          </Button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2">
          <div className="space-y-1 px-2 py-2">
            {agentJobs.map((job, i) => {
              const nextRun = getJobNextRunDate(job, parsedCronJobs);
              const nextRunStr = nextRun ? formatDistanceToNow(nextRun, { addSuffix: true }) : "—";
              const lastRunMs = job.state?.lastRunAtMs;
              const lastRunStr = lastRunMs ? formatDistanceToNow(new Date(lastRunMs), { addSuffix: true }) : "—";
              const isRunning = runningJobIds.includes(job.id);
              const isDeleting = deletingId === job.id;
              const status = isRunning ? "running" : (job.state?.lastStatus ?? "idle");
              const palette = getJobPalette(job.id);
              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelectedJob(job); setEditOpen(true); }}
                  onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedJob(job); setEditOpen(true); }
                  }}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-1.5 rounded-md border-l-2 transition-colors cursor-pointer",
                    palette.border,
                    "hover:bg-muted/20",
                    !job.enabled && "opacity-50",
                    isRunning && "bg-primary/5",
                    isDeleting && "opacity-40 pointer-events-none"
                  )}
                >
                  <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isRunning ? "bg-amber-500" : getStatusColor(status))} />
                  {isRunning && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-primary" />}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-xs font-normal text-foreground truncate" title={job.name}>{job.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {isRunning ? "In progress…" : `Next ${nextRunStr} · Last ${lastRunStr}`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, job.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                    title="Delete"
                    tabIndex={-1}
                  >
                    {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <AddCronDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultAgent={agentId}
        onSuccess={() => setAddOpen(false)}
      />
      <EditCronDialog
        job={selectedJob}
        open={editOpen}
        onOpenChange={(open) => { setEditOpen(open); if (!open) setSelectedJob(null); }}
      />
    </>
  );
}

function AgentCronsTab({ agentId }: { agentId: string }) {
  return (
    <CronsProvider>
      <AgentCronsView agentId={agentId} />
    </CronsProvider>
  );
}

/* ── Widget content ────────────────────────────────────────── */

const AgentChatWidgetContent = memo((props: CustomProps) => {
  const { widget, isEditMode, isMaximized, onMaximize, onConfigChange } = props;
  const { isFocusModeActive } = useFocusMode();
  const { agents } = useHyperclawContext();

  // Persisted config
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const configBackendTab = config?.backendTab as BackendTab | undefined;

  // Local state
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(configAgentId);
  const [backendTab, setBackendTab] = useState<BackendTab>(configBackendTab ?? "openclaw");
  const [activeTab, setActiveTab] = useState<WidgetTab>("CHAT");
  const [selectedFileKey, setSelectedFileKey] = useState<FileTabKey>("SOUL");
  const [footerState, setFooterState] = useState<FooterSaveState>({
    isDirty: false, saving: false, saved: false, save: null,
  });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // Snapshot captured when the dialog opens — prevents deleting the wrong agent
  // if currentAgentId changes while the confirmation dialog is visible.
  const [pendingDeleteAgentId, setPendingDeleteAgentId] = useState<string>("");
  const chatRef = useRef<PanelChatViewHandle>(null);
  // Keyed by "agentId:backendTab" — avoids refetching when re-opening the same agent
  const sessionsCacheRef = useRef<Map<string, Session[]>>(new Map());

  // Inbox state
  const [chatView, setChatView] = useState<"inbox" | "chat">("chat");
  const [inboxSessions, setInboxSessions] = useState<Session[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxLastSeenTs, setInboxLastSeenTs] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | undefined>();
  // Per-session read tracking — only sessions in this set show as read in the inbox
  const [readSessions, setReadSessions] = useState<Set<string>>(new Set());
  // Cache of last-assistant-message per session key, fetched lazily when inbox opens
  const [inboxPreviews, setInboxPreviews] = useState<Map<string, string>>(new Map());
  const [previewLoadingKeys, setPreviewLoadingKeys] = useState<Set<string>>(new Set());
  const previewFetchedForRef = useRef<Set<string>>(new Set());

  // Sync config on late hydration
  useEffect(() => {
    if (configAgentId && !selectedAgentId) setSelectedAgentId(configAgentId);
  }, [configAgentId, selectedAgentId]);

  // Lazily fetch last assistant message for each inbox session
  useEffect(() => {
    if (inboxSessions.length === 0) return;
    const unfetched = inboxSessions.filter((s) => !previewFetchedForRef.current.has(s.key) && !s.preview);
    if (unfetched.length === 0) return;
    unfetched.forEach((s) => previewFetchedForRef.current.add(s.key));

    // Mark these sessions as loading so the skeleton is shown immediately
    setPreviewLoadingKeys((prev) => {
      const next = new Set(prev);
      unfetched.forEach((s) => next.add(s.key));
      return next;
    });

    Promise.all(
      unfetched.map(async (s): Promise<[string, string] | null> => {
        try {
          let messages: Array<{ role?: string; content?: unknown }> = [];
          if (backendTab === "openclaw") {
            const r = await gatewayConnection.getChatHistory(s.key, 20);
            messages = (r.messages || []) as typeof messages;
          } else if (backendTab === "claude-code") {
            // claude-code-load-history expects sessionId, not sessionKey
            // session keys are formatted as "claude:<sessionId>"
            const sessionId = s.key.startsWith("claude:") ? s.key.slice(7) : s.key;
            const r = await bridgeInvoke("claude-code-load-history", { sessionId }) as any;
            messages = r?.messages || [];
          } else if (backendTab === "codex") {
            const r = await bridgeInvoke("codex-load-history", { sessionKey: s.key }) as any;
            messages = r?.messages || [];
          } else if (backendTab === "hermes") {
            const r = await bridgeInvoke("hermes-load-history", { sessionKey: s.key }) as any;
            messages = r?.messages || [];
          }
          const text = extractLastAssistantText(messages);
          return text ? [s.key, text] : null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      const updates: Array<[string, string]> = results.filter(Boolean) as Array<[string, string]>;
      if (updates.length > 0) {
        setInboxPreviews((prev) => {
          const next = new Map(prev);
          for (const [key, text] of updates) next.set(key, text);
          return next;
        });
      }
      // Clear loading state for all fetched sessions (resolved or not)
      setPreviewLoadingKeys((prev) => {
        const next = new Set(prev);
        unfetched.forEach((s) => next.delete(s.key));
        return next;
      });
    });
  }, [inboxSessions, backendTab]);

  // Resolve agent
  const currentAgentId = selectedAgentId || configAgentId || agents[0]?.id || "main";
  const currentAgent = agents.find((a) => a.id === currentAgentId) || {
    id: currentAgentId,
    name: currentAgentId === "main" ? "General Assistant" : currentAgentId,
  };

  // Agent identity
  const identity = useAgentIdentity(currentAgentId);
  const resolvedAvatarUrl = resolveAvatarUrl(identity?.avatar);
  // Only use img for custom uploads (PNG/JPG/HTTP); SVG data URIs are the seed defaults.
  const avatarUrl = resolvedAvatarUrl && !resolvedAvatarUrl.startsWith("data:image/svg+xml") ? resolvedAvatarUrl : undefined;
  const avatarText = resolveAvatarText(identity?.avatar);
  const RuntimeIcon = identity?.runtime === "claude-code" ? ClaudeCodeIcon
    : identity?.runtime === "codex" ? CodexIcon
    : identity?.runtime === "hermes" ? HermesIcon
    : null;
  const displayName = identity?.name || currentAgent.name;
  // Listen for agent-click events from StatusWidget
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        agentId?: string;
        sessionKey?: string;
        sessionCount?: number;
        unreadCount?: number;
        lastSeenTs?: number;
        runtime?: string;
      };
      if (!detail?.agentId) return;
      const { agentId, sessionKey, lastSeenTs = 0, unreadCount = 0, runtime } = detail;
      setInboxUnreadCount(unreadCount);

      // Set the correct backend tab immediately so fetchSessions queries the right endpoint
      if (runtime === "claude-code") setBackendTab("claude-code");
      else if (runtime === "codex") setBackendTab("codex");
      else if (runtime === "hermes") setBackendTab("hermes");
      else setBackendTab("openclaw");

      setSelectedAgentId(agentId);
      setActiveTab("CHAT");
      setInboxLastSeenTs(lastSeenTs);
      setActiveSessionLabel(undefined);
      setReadSessions(new Set());

      // Check cache first so we never show a spinner for a previously loaded agent
      const tabForRuntime = runtime === "claude-code" ? "claude-code"
        : runtime === "codex" ? "codex"
        : runtime === "hermes" ? "hermes"
        : "openclaw";
      const cacheKey = `${agentId}:${tabForRuntime}`;
      const cached = sessionsCacheRef.current.get(cacheKey);

      if (cached) {
        setInboxSessions(cached);
        setInboxLoading(false);
        setChatView("inbox");
      } else {
        // First open — show spinner while PanelChatView fetches
        setInboxSessions([]);
        setChatView("inbox");
        setInboxLoading(true);
        // Kick off the fetch after React commits the new backendTab/agentId
        setTimeout(() => chatRef.current?.fetchSessions(), 0);
      }
    };
    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handler);
    window.addEventListener(OPEN_AGENT_PANEL_EVENT, handler);
    return () => {
      window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handler);
      window.removeEventListener(OPEN_AGENT_PANEL_EVENT, handler);
    };
  }, []);

  // Reset footer state when switching tabs
  useEffect(() => {
    setFooterState({ isDirty: false, saving: false, saved: false, save: null });
  }, [activeTab, currentAgentId]);

  // Persist config
  const onConfigChangeRef = useRef(onConfigChange);
  onConfigChangeRef.current = onConfigChange;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistMountedRef = useRef(false);

  useEffect(() => {
    if (!persistMountedRef.current) { persistMountedRef.current = true; return; }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      onConfigChangeRef.current?.({ agentId: currentAgentId, backendTab });
      persistTimerRef.current = null;
    }, 500);
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        onConfigChangeRef.current?.({ agentId: currentAgentId, backendTab });
      }
    };
  }, [currentAgentId, backendTab]);

  const isEditorTab = activeTab === "INFO" || activeTab === "FILES";
  const showChatActions = activeTab === "CHAT";
  const showSaveButton = isEditorTab;

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        {/* ── Header: avatar + tabs + actions ── */}
        <div className="shrink-0 border-b border-border/50">
          {/* Top row: agent info + maximize */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Back button — shown when drilling into a session from inbox */}
              {chatView === "chat" && activeTab === "CHAT" && inboxSessions.length > 1 ? (
                <button
                  onClick={() => { setChatView("inbox"); setActiveSessionLabel(undefined); }}
                  className="h-7 w-7 flex items-center justify-center shrink-0 rounded hover:bg-muted/40 transition-colors"
                  title="Back to sessions"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              ) : isEditMode ? (
                <div className="cursor-move h-7 w-7 flex items-center justify-center shrink-0">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              ) : null}
              <Avatar key={currentAgentId} className="h-8 w-8 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {(avatarText || identity?.emoji)
                    ? (avatarText || identity?.emoji)
                    : RuntimeIcon
                    ? <RuntimeIcon className="w-5 h-5" />
                    : "🤖"
                  }
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* Show session label when drilled in, otherwise agent name */}
                  <h3 className="text-xs font-semibold truncate">
                    {activeSessionLabel && chatView === "chat" ? activeSessionLabel : displayName}
                  </h3>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {activeSessionLabel && chatView === "chat"
                    ? displayName
                    : backendTab === "claude-code" ? "Claude Code"
                    : backendTab === "codex" ? "Codex"
                    : backendTab === "hermes" ? "Hermes"
                    : "OpenClaw"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Chat actions — only on Chat tab */}
              {showChatActions && (
                <>
                  {chatView === "chat" && (
                    <>
                      <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => chatRef.current?.reload()} title="Reload chat">
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => chatRef.current?.newChat()} title="New chat">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                  {/* Session history only shown in chat view (inbox replaces it for multi-session) */}
                  {chatView === "chat" && inboxSessions.length <= 1 && (
                    <SessionHistoryDropdown
                      sessions={chatRef.current?.sessions || []}
                      isLoading={chatRef.current?.sessionsLoading || false}
                      error={chatRef.current?.sessionsError || null}
                      currentSessionKey={chatRef.current?.selectedSessionKey}
                      onLoadSession={(key) => chatRef.current?.onSessionChange(key)}
                      onNewChat={() => chatRef.current?.newChat()}
                      onFetchSessions={() => chatRef.current?.fetchSessions()}
                    />
                  )}
                </>
              )}
              {/* Save button — only on editor tabs when dirty */}
              {showSaveButton && (
                <div className="flex items-center gap-1.5">
                  {footerState.saved && (
                    <span className="text-[10px] text-emerald-500">Saved</span>
                  )}
                  {footerState.isDirty && !footerState.saved && (
                    <span className="text-[10px] text-amber-500">Unsaved</span>
                  )}
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="h-6 w-6"
                    disabled={footerState.saving || !footerState.isDirty}
                    onClick={() => footerState.save?.()}
                    title="Save"
                  >
                    {footerState.saving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              )}
              <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" title="More options">
                    <MoreHorizontal className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 z-[60]">
                  <DropdownMenuItem
                    className="gap-2 text-xs"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoreMenuOpen(false);
                      // Mark all inbox sessions as read and clear the unread badge
                      const allKeys = new Set(inboxSessions.map((s) => s.key));
                      setReadSessions(allKeys);
                      setInboxUnreadCount(0);
                      window.dispatchEvent(
                        new CustomEvent(AGENT_READ_EVENT, {
                          detail: { agentId: currentAgentId, clearAll: true },
                        })
                      );
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mark all as read
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2 text-xs"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMoreMenuOpen(false);
                      setPendingDeleteAgentId(currentAgentId);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete agent
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Tab row */}
          <div className="flex items-center gap-0.5 px-3 pb-1 -mb-px overflow-x-auto">
            <button
              onClick={() => setActiveTab("CHAT")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "CHAT"
                  ? "border-border text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab("INFO")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "INFO"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Config
            </button>
            <button
              onClick={() => setActiveTab("STATS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "STATS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Usage
            </button>
            <button
              onClick={() => setActiveTab("CRONS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "CRONS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Runs
            </button>
            <button
              onClick={() => setActiveTab("FILES")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0 flex items-center gap-1",
                activeTab === "FILES"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              {activeTab === "FILES"
                ? TAB_FILES.find((t) => t.key === selectedFileKey)?.label ?? "Instructions"
                : "Instructions"}
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* Inbox — only rendered while on CHAT tab in inbox view */}
          {activeTab === "CHAT" && chatView === "inbox" && (
            <AgentInboxView
              sessions={inboxSessions.map((s) => ({
                ...s,
                preview: s.preview ?? inboxPreviews.get(s.key),
              }))}
              loading={inboxLoading}
              lastSeenTs={inboxLastSeenTs}
              unreadCount={inboxUnreadCount}
              previewLoadingKeys={previewLoadingKeys}
              readSessions={readSessions}
              onNewChat={() => {
                setChatView("chat");
                chatRef.current?.newChat();
              }}
              onSelect={(key) => {
                const session = inboxSessions.find((s) => s.key === key);
                setActiveSessionLabel(session?.label || key);
                setChatView("chat");
                chatRef.current?.onSessionChange(key);

                // Mark this specific session as read
                const newRead = new Set([...readSessions, key]);
                setReadSessions(newRead);

                // Only fire if this session was actually unread
                const wasUnread = !readSessions.has(key) && inboxLastSeenTs > 0 && (session?.updatedAt || 0) > inboxLastSeenTs;
                if (wasUnread) {
                  const anyStillUnread = inboxSessions.some(
                    (s) => !newRead.has(s.key) && inboxLastSeenTs > 0 && (s.updatedAt || 0) > inboxLastSeenTs
                  );
                  if (!anyStillUnread) setInboxUnreadCount(0);
                  // Decrement badge immediately; persist + zero on the last unread
                  window.dispatchEvent(
                    new CustomEvent(AGENT_READ_EVENT, {
                      detail: { agentId: currentAgentId, clearAll: !anyStillUnread },
                    })
                  );
                }
              }}
            />
          )}

          {/* PanelChatView — always mounted so chat history and ref survive tab switches.
              Hidden via CSS when not on the CHAT tab or when inbox is in front. */}
          <div className={cn(
            "flex-1 min-h-0 flex flex-col",
            (activeTab !== "CHAT" || chatView === "inbox") && "hidden"
          )}>
            <PanelChatView
              ref={chatRef}
              agentId={currentAgentId}
              backendTab={backendTab}
              onBackendTabChange={setBackendTab}
              showSubHeader={false}
              onSessionsUpdate={(sessions) => {
                setInboxSessions(sessions);
                setInboxLoading(false);
                // Persist to cache so subsequent opens are instant
                sessionsCacheRef.current.set(`${currentAgentId}:${backendTab}`, sessions);
              }}
            />
          </div>

          {activeTab === "INFO" && (
            <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-4 py-4">
              <InfoTab
                agentId={currentAgentId}
                identity={identity}
                onStateChange={setFooterState}
              />
            </div>
          )}

          {activeTab === "STATS" && (
            <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-3 py-3">
              <AgentStatsTab agentId={currentAgentId} />
            </div>
          )}

          {activeTab === "FILES" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* File selector bar */}
              <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 text-[10px] font-medium px-2"
                    >
                      {TAB_FILES.find((t) => t.key === selectedFileKey)?.label}
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 z-[60]">
                    {TAB_FILES.map((tf) => (
                      <DropdownMenuItem
                        key={tf.key}
                        className="flex flex-col items-start gap-0.5 py-2"
                        onSelect={() => setSelectedFileKey(tf.key)}
                      >
                        <span className={cn("text-xs font-medium", tf.key === selectedFileKey && "text-primary")}>
                          {tf.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{tf.desc}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-[10px] text-muted-foreground truncate">
                  {TAB_FILES.find((t) => t.key === selectedFileKey)?.desc}
                </span>
              </div>
              {/* Editor */}
              <div className="flex-1 min-h-0 flex flex-col px-4 py-3">
                <FileEditorTab
                  key={`${currentAgentId}-${selectedFileKey}`}
                  agentId={currentAgentId}
                  fileKey={selectedFileKey}
                  onStateChange={setFooterState}
                  className="flex-1 min-h-0"
                />
              </div>
            </div>
          )}
          {activeTab === "CRONS" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <AgentCronsTab agentId={currentAgentId} />
            </div>
          )}

        </div>
      </Card>

      <AddAgentDialog
        open={addAgentOpen}
        onOpenChange={setAddAgentOpen}
        onSuccess={(id) => setSelectedAgentId(id)}
      />

      <DeleteAgentDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        agentId={pendingDeleteAgentId}
        agentDisplayName={agents.find((a) => a.id === pendingDeleteAgentId)?.name ?? pendingDeleteAgentId}
        onDeleteStart={() => {
          // Switch to next agent immediately — no red/deleting state shown here.
          // StatusWidget shows the Firing… badge for that.
          const next = agents.find((a) => a.id !== pendingDeleteAgentId);
          setSelectedAgentId(next?.id);
        }}
        onSuccess={() => { /* context refresh handled by agent.deleted event */ }}
      />
    </motion.div>
  );
});

AgentChatWidgetContent.displayName = "AgentChatWidgetContent";

export const AgentChatCustomHeader = () => null;

const AgentChatWidget = memo((props: CustomProps) => {
  return <AgentChatWidgetContent {...props} />;
});

AgentChatWidget.displayName = "AgentChatWidget";

export default AgentChatWidget;
