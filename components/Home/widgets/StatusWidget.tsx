"use client";

import React, { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Activity,
  RefreshCw,
  Loader2,
  MessageSquare,
  AlertTriangle,
  EyeOff,
  Inbox,
  Check,
  X as XIcon,
  HelpCircle,
  Zap,
  Info,
  Plus,
  Users,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useFocusMode } from "./hooks/useFocusMode";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import {
  gatewayConnection,
  getGatewayConnectionState,
  subscribeGatewayConnection,
  type ChatEventPayload,
} from "$/lib/openclaw-gateway-ws";
import {
  useAgentIdentities,
  resolveAvatarUrl,
  resolveAvatarText,
  type AgentIdentity,
} from "$/hooks/useAgentIdentity";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { OPEN_AGENT_PANEL_EVENT } from "./AgentChatPanel";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import { ProjectsProvider, useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { CreateProjectDialog } from "$/components/Tool/Projects/CreateProjectDialog";
import { ClaudeCodeIcon, CodexIcon, HermesIcon } from "$/components/Onboarding/RuntimeIcons";

// Returns the branded React SVG icon for known runtimes, null otherwise.
function getRuntimeIcon(runtime?: string): React.ComponentType<{ className?: string }> | null {
  if (runtime === "claude-code") return ClaudeCodeIcon;
  if (runtime === "codex") return CodexIcon;
  if (runtime === "hermes") return HermesIcon;
  return null;
}

// True if avatar is a user-uploaded image (PNG/JPG/HTTP) vs. the SVG seed or empty.
function isCustomImageAvatar(avatarUrl: string | undefined): boolean {
  if (!avatarUrl) return false;
  return !avatarUrl.startsWith("data:image/svg+xml");
}

// ── Custom event for cross-widget communication ──
// StatusWidget dispatches this; GatewayChatWidget listens.
export const OPEN_AGENT_CHAT_EVENT = "open-agent-chat";
// Dispatched by AgentChatWidget when the user actually opens a session — this is when we clear unread
export const AGENT_READ_EVENT = "agent-read";

export function dispatchOpenAgentChat(agentId: string, sessionKey?: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_AGENT_CHAT_EVENT, { detail: { agentId, sessionKey } })
  );
}

export function dispatchOpenAgentPanel(
  agentId: string,
  sessionKey?: string,
  meta?: { sessionCount?: number; unreadCount?: number; lastSeenTs?: number; runtime?: string }
) {
  window.dispatchEvent(
    new CustomEvent(OPEN_AGENT_PANEL_EVENT, { detail: { agentId, sessionKey, ...meta } })
  );
}

// ── Types ──

interface Agent {
  id: string;
  name: string;
  status: string;
  runtime?: string;
  role?: string;
  lastActive?: string;
}

interface AgentStatus {
  agentId: string;
  name: string;
  state: "idle" | "running" | "error";
  lastActivity?: number;
  unreadCount: number;
  recentMessages: string[];
  sessionCount: number;
  lastSeenTs: number;
  errorMessage?: string;
  runtime?: string;
}

// ── Inbox types ──

type StatusTab = "agents" | "inbox" | "projects";

interface InboxItem {
  id: number;
  agent_id: string;
  kind: "approval" | "question" | "error" | "info";
  title: string;
  body?: string;
  status: "pending" | "approved" | "rejected" | "dismissed";
  created_at: number;
}

const INBOX_KIND_ICONS: Record<string, React.ReactNode> = {
  approval: <Zap className="w-3 h-3 text-amber-500" />,
  question: <HelpCircle className="w-3 h-3 text-blue-500" />,
  error: <AlertTriangle className="w-3 h-3 text-destructive" />,
  info: <Info className="w-3 h-3 text-muted-foreground" />,
};

// ── Quiet hours: hide agents with no activity within this window ──
const QUIET_HOURS = 48;

// ── LocalStorage helpers ──

const LAST_SEEN_KEY = "hyperclaw.agent-status.last-seen";

interface LastSeenEntry {
  ts: number;
  msgText?: string; // text of the last message the user saw
}

function getLastSeenMap(): Record<string, LastSeenEntry> {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Migrate old format (plain number) to new format
    const out: Record<string, LastSeenEntry> = {};
    for (const [id, v] of Object.entries(parsed)) {
      out[id] = typeof v === "number" ? { ts: v } : (v as LastSeenEntry);
    }
    return out;
  } catch {
    return {};
  }
}

function setLastSeenLocal(agentId: string, ts: number, msgText?: string) {
  const map = getLastSeenMap();
  map[agentId] = { ts, msgText };
  try {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// Fetch last-seen entries from SQLite via bridge; falls back to localStorage when offline.
async function fetchLastSeenFromBridge(agentIds: string[]): Promise<Record<string, LastSeenEntry>> {
  try {
    const result = await bridgeInvoke("get-agent-last-seen", { agentIds }) as {
      success: boolean;
      data: Record<string, { ts: number; msgText?: string }>;
    };
    if (result?.success && result.data) return result.data;
  } catch { /* connector offline — fall through */ }
  return getLastSeenMap();
}

// ── Relative time formatter ──

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Absolute time formatter for inbox items ──

function formatAbsTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

// ── Extract last assistant text from history messages (skip tool-only) ──

function extractRecentAssistantTexts(
  messages: Array<{ role?: string; content?: unknown }>,
  n = 3
): string[] {
  const results: string[] = [];
  for (let i = messages.length - 1; i >= 0 && results.length < n; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;

    const content = msg.content;
    let text: string | undefined;

    if (typeof content === "string") {
      text = content.trim();
    } else if (Array.isArray(content)) {
      const textBlock = content.find(
        (b: unknown) => (b as { type?: string })?.type === "text"
      ) as { text?: string } | undefined;
      text = textBlock?.text?.trim();
    }

    if (text && text.length > 0) {
      results.unshift(text.slice(0, 120)); // newest last → unshift keeps chronological order
    }
  }
  return results;
}

// ── Custom header ──

interface StatusHeaderProps extends CustomProps {
  agentCount?: number;
  hiddenCount?: number;
  unreadTotal?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  connected?: boolean;
  showHidden?: boolean;
  onToggleHidden?: () => void;
}

export const StatusCustomHeader: React.FC<StatusHeaderProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
  agentCount = 0,
  hiddenCount = 0,
  unreadTotal = 0,
  onRefresh,
  refreshing = false,
  connected = false,
  showHidden = false,
  onToggleHidden,
}) => (
  <div className="flex items-center justify-between px-3 py-2">
    <div className="flex items-center gap-2 min-w-0">
      {isEditMode && (
        <div className="cursor-move h-7 w-7 flex items-center justify-center shrink-0">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
      <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
      <h3 className="text-xs font-normal text-foreground truncate">
        {widget.title}
      </h3>
      {agentCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">
          {agentCount}
        </span>
      )}
      {unreadTotal > 0 && (
        <Badge
          variant="default"
          className="h-4 px-1.5 text-[10px] font-medium bg-primary text-primary-foreground"
        >
          {unreadTotal} new
        </Badge>
      )}
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          connected ? "bg-emerald-500" : "bg-muted-foreground/40"
        )}
        title={connected ? "Connected" : "Disconnected"}
      />
    </div>
    <div className="flex items-center gap-1 shrink-0">
      {hiddenCount > 0 && onToggleHidden && (
        <Button
          variant="ghost"
          size="iconSm"
          className={cn("h-6 w-6", showHidden && "text-primary")}
          onClick={onToggleHidden}
          title={showHidden ? "Hide inactive agents" : `Show ${hiddenCount} inactive`}
        >
          <EyeOff className="w-3 h-3" />
        </Button>
      )}
      {onRefresh && (
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => onRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
        </Button>
      )}
      <Button variant="ghost" size="iconSm" onClick={onMaximize} className="h-6 w-6">
        {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
      </Button>
    </div>
  </div>
);

// ── Agent row (expanded — for running / unread / error / recent idle expanded) ──

const AgentExpandedRow = React.forwardRef<HTMLDivElement, {
  status: AgentStatus;
  identity?: AgentIdentity;
  onClick: (agentId: string) => void;
  isActive?: boolean;
  isHiring?: boolean;
  isDeleting?: boolean;
}>(function AgentExpandedRow({ status, identity, onClick, isActive, isHiring, isDeleting }, ref) {
  const resolvedAvatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarUrl = isCustomImageAvatar(resolvedAvatarUrl) ? resolvedAvatarUrl : undefined;
  const avatarText = resolveAvatarText(identity?.avatar);
  const RuntimeIcon = getRuntimeIcon(identity?.runtime || status.runtime);
  const displayName = identity?.name || status.name || status.agentId;

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "w-full min-w-0 flex items-start gap-2.5 px-2.5 py-2 rounded-none transition-colors overflow-hidden",
        isHiring || isDeleting ? "opacity-60 cursor-not-allowed pointer-events-none" : "cursor-pointer",
        !isHiring && !isDeleting && (isActive ? "bg-muted/50" : "hover:bg-muted/30")
      )}
      onClick={() => !isHiring && !isDeleting && onClick(status.agentId)}
    >
      {/* Avatar with unread badge */}
      <div className="shrink-0 mt-0.5 relative">
        <Avatar className="w-7 h-7">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarFallback className="bg-primary/10 text-primary text-[11px] select-none">
            {RuntimeIcon && !avatarUrl
              ? <RuntimeIcon className="w-4 h-4" />
              : <span className="leading-[0]">{avatarText || identity?.emoji || displayName.slice(0, 2).toUpperCase()}</span>
            }
          </AvatarFallback>
        </Avatar>
        {status.unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 border border-card flex items-center justify-center text-[8px] font-bold text-white leading-none">
            {status.unreadCount >= 99 ? "99+" : status.unreadCount}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col gap-0.5">
        {/* Name line */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {displayName}
          </span>
          {isHiring ? (
            <span className="text-[10px] text-amber-500/80 shrink-0 border border-amber-500/30 rounded px-1 py-px leading-none flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin inline-block" />
              Hiring…
            </span>
          ) : isDeleting ? (
            <span className="text-[10px] text-red-400/80 shrink-0 border border-red-400/30 rounded px-1 py-px leading-none flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin inline-block" />
              Firing…
            </span>
          ) : (
            <>
              {status.runtime && status.runtime !== "openclaw" && (
                <span className="text-[9px] text-muted-foreground/50 shrink-0 border border-border/30 rounded px-1 py-px leading-none">
                  {status.runtime}
                </span>
              )}
              {status.state === "running" && (
                <span className="text-[10px] text-emerald-500 shrink-0">Running...</span>
              )}
              {status.lastActivity && status.state !== "running" && (
                <span className="text-[10px] text-muted-foreground/50 shrink-0">
                  {timeAgo(status.lastActivity)}
                </span>
              )}
            </>
          )}
        </div>

        {/* Error state */}
        {status.state === "error" && status.errorMessage && (
          <div className="flex items-center gap-1 text-[11px] text-destructive min-w-0 overflow-hidden">
            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            <span className="line-clamp-1 [overflow-wrap:anywhere]">{status.errorMessage}</span>
          </div>
        )}

        {/* Recent messages — always visible; opacity reflects read state */}
        {status.state !== "error" && status.recentMessages.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-0.5">
            {status.recentMessages.slice(0, 2).map((msg, i) => (
              <p
                key={i}
                className={cn(
                  "text-[11px] line-clamp-1 [overflow-wrap:anywhere] overflow-hidden transition-opacity",
                  status.unreadCount > 0
                    ? "text-muted-foreground/80"
                    : "text-muted-foreground/40"
                )}
              >
                {msg}
              </p>
            ))}
          </div>
        )}

      </div>
    </motion.div>
  );
});

AgentExpandedRow.displayName = "AgentExpandedRow";

// ── Collapsed idle agent row (compact single line) ──

function AgentCollapsedRow({
  status,
  identity,
  onClick,
  isHiring,
}: {
  status: AgentStatus;
  identity?: AgentIdentity;
  onClick: (agentId: string) => void;
  isHiring?: boolean;
}) {
  const resolvedAvatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarUrl = isCustomImageAvatar(resolvedAvatarUrl) ? resolvedAvatarUrl : undefined;
  const avatarText = resolveAvatarText(identity?.avatar);
  const RuntimeIcon = getRuntimeIcon(identity?.runtime || status.runtime);
  const displayName = identity?.name || status.name || status.agentId;

  return (
    <div
      className={cn(
        "w-full min-w-0 flex items-center gap-2 px-2.5 py-1 overflow-hidden rounded-md transition-colors",
        isHiring ? "opacity-60 cursor-not-allowed pointer-events-none" : "cursor-pointer hover:bg-muted/20"
      )}
      onClick={() => !isHiring && onClick(status.agentId)}
    >
      <Avatar className="w-5 h-5">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
        <AvatarFallback className="bg-muted text-muted-foreground text-[8px]">
          {isHiring
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : RuntimeIcon && !avatarUrl
              ? <RuntimeIcon className="w-3 h-3" />
              : (avatarText || identity?.emoji || displayName.slice(0, 2).toUpperCase())
          }
        </AvatarFallback>
      </Avatar>
      <span className="text-[11px] text-muted-foreground truncate">{displayName}</span>
      {isHiring ? (
        <span className="text-[10px] text-amber-500/80 ml-auto shrink-0 border border-amber-500/30 rounded px-1 py-px leading-none">
          Hiring…
        </span>
      ) : status.lastActivity ? (
        <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
          {timeAgo(status.lastActivity)}
        </span>
      ) : null}
    </div>
  );
}

// ── Project row (collapsible, shows members when expanded) ──

const STATUS_PROJECT_DOTS: Record<string, string> = {
  active: "bg-emerald-500",
  completed: "bg-blue-500",
  archived: "bg-muted-foreground/40",
};

function ProjectRow({ project }: { project: import("$/components/Tool/Projects/provider/projectsProvider").Project }) {
  const { agents } = useHyperclawContext();
  const { selectProject } = useProjects();
  const [expanded, setExpanded] = useState(false);
  const members = project.members ?? [];

  const handleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && members.length === 0) selectProject(project.id);
  }, [expanded, members.length, project.id, selectProject]);

  return (
    <div>
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-muted/30 rounded-md transition-colors"
      >
        <span className="text-base shrink-0">{project.emoji}</span>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">{project.name}</span>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_PROJECT_DOTS[project.status] ?? "bg-muted-foreground/40")} />
          </div>
          {project.description && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 text-muted-foreground/50">
          <span className="text-[10px]">{members.length}</span>
          <Users className="w-2.5 h-2.5" />
          <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", expanded && "rotate-180")} />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {members.length === 0 ? (
              <p className="px-9 py-1.5 text-[10px] text-muted-foreground/40">No members yet</p>
            ) : (
              <div className="px-2 pb-1 space-y-0.5">
                {members.map((m) => {
                  const agent = agents.find((a) => a.id === m.agentId);
                  return (
                    <div key={m.agentId} className="flex items-center gap-2 px-2 py-1 rounded">
                      <span className="text-sm shrink-0">{agent?.emoji ?? "🤖"}</span>
                      <span className="text-[11px] text-muted-foreground truncate flex-1">{agent?.name ?? m.agentId}</span>
                      <span className="text-[9px] text-muted-foreground/40 capitalize shrink-0">{m.role}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main widget content ──

const StatusWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const { agents: openClawAgents } = useHyperclawContext();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [statuses, setStatuses] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(() => getGatewayConnectionState().connected);
  const activeRunsRef = useRef<Map<string, { agentId: string; ts: number }>>(new Map());
  const isMounted = useRef(true);

  // ── Projects ──
  const { projects, loading: projectsLoading } = useProjects();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // ── Inbox ──
  const [activeTab, setActiveTab] = useState<StatusTab>("agents");
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const activeAgentIdRef = useRef<string | null>(null);
  useEffect(() => { activeAgentIdRef.current = activeAgentId; }, [activeAgentId]);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [hiringAgentIds, setHiringAgentIds] = useState<Set<string>>(new Set());
  const [deletingAgentIds, setDeletingAgentIds] = useState<Set<string>>(new Set());
  // Refs kept in sync so refresh() can read without stale closures
  const hiringAgentIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { hiringAgentIdsRef.current = hiringAgentIds; }, [hiringAgentIds]);
  const deletingAgentIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { deletingAgentIdsRef.current = deletingAgentIds; }, [deletingAgentIds]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);

  const pendingInboxCount = useMemo(
    () => inboxItems.filter((i) => i.status === "pending").length,
    [inboxItems]
  );

  const fetchInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const result = await bridgeInvoke("inbox-list", { status: "pending", limit: 50 });
      const items = (result as { items?: InboxItem[] })?.items || [];
      if (isMounted.current) setInboxItems(items);
    } catch { /* connector may not be connected yet */ }
    finally { if (isMounted.current) setInboxLoading(false); }
  }, []);

  const resolveInboxItem = useCallback(async (itemId: number, resolution: "approved" | "rejected" | "dismissed") => {
    try {
      await bridgeInvoke("inbox-resolve", { id: itemId, resolution });
      setInboxItems((prev) =>
        prev.map((item) => item.id === itemId ? { ...item, status: resolution } : item)
      );
    } catch { /* ignore */ }
  }, []);

  // Fetch inbox on tab switch + poll every 60s for badge count
  useEffect(() => {
    if (activeTab === "inbox") fetchInbox();
  }, [activeTab, fetchInbox]);

  useEffect(() => {
    fetchInbox();
    const timer = setInterval(() => fetchInbox(), 60_000);
    return () => clearInterval(timer);
  }, [fetchInbox]);

  // Track connection state
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      setConnected(getGatewayConnectionState().connected);
    });
  }, []);

  // Get agents from context (no separate fetch needed).
  // Use a ref so the callback identity is stable — prevents refresh/effect churn
  // when the context provides a new agents array with the same content.
  const openClawAgentsRef = useRef(openClawAgents);
  openClawAgentsRef.current = openClawAgents;
  const fetchAgents = useCallback(async (): Promise<Agent[]> => {
    return openClawAgentsRef.current as Agent[];
  }, []);

  // Fetch session/activity data for a single agent.
  // OpenClaw agents use the gateway; all other runtimes use the bridge (SQLite-backed).
  const fetchAgentSessions = useCallback(
    async (agent: Agent): Promise<{ sessionCount: number; lastActivity?: number; recentMessages: string[] }> => {
      const runtime = agent.runtime || "openclaw";

      // Non-OpenClaw runtimes: read actual session history from disk via bridge
      if (runtime !== "openclaw") {
        try {
          const result = await bridgeInvoke("get-runtime-sessions", { agentId: agent.id, limit: 20 }) as {
            success?: boolean;
            data?: { sessionCount?: number; lastActiveMs?: number; recentMessages?: Array<{ role: string; content: string; timestamp: number }> };
          };
          if (result?.success && result.data) {
            // Only count assistant messages — same behaviour as OpenClaw path
            const msgs = (result.data.recentMessages || [])
              .filter((m) => m.role === "assistant")
              .map((m) => m.content)
              .filter(Boolean);
            return {
              sessionCount: result.data.sessionCount || 0,
              lastActivity: result.data.lastActiveMs || undefined,
              recentMessages: msgs,
            };
          }
        } catch { /* ignore */ }
        return { sessionCount: 0, recentMessages: [] };
      }

      // OpenClaw: fetch live sessions from gateway
      if (!gatewayConnection.isConnected()) return { sessionCount: 0, recentMessages: [] };
      try {
        const result = await gatewayConnection.listSessions(agent.id, 10);
        const sessions = result.sessions || [];
        const lastActivity = sessions.length > 0
          ? Math.max(...sessions.map((s) => s.updatedAt || 0))
          : undefined;

        let recentMessages: string[] = [];
        if (sessions.length > 0) {
          try {
            const history = await gatewayConnection.getChatHistory(sessions[0].key, 20);
            const messages = (history.messages || []) as Array<{ role?: string; content?: unknown }>;
            recentMessages = extractRecentAssistantTexts(messages, 10);
          } catch { /* ignore */ }
        }

        return { sessionCount: sessions.length, lastActivity, recentMessages };
      } catch {
        return { sessionCount: 0, recentMessages: [] };
      }
    },
    []
  );

  // Build statuses
  const refresh = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    setError(null);
    try {
      const rawAgentList = await fetchAgents();
      if (!isMounted.current) return;
      // Exclude agents whose deletion is in-flight so refresh() can't re-add them
      // before the context catches up to the server-side removal.
      const agentList = rawAgentList.filter((a) => !deletingAgentIdsRef.current.has(a.id));
      setAgents(agentList);
      // Clear hiring flags for agents now confirmed by the server
      setHiringAgentIds((prev) => {
        if (prev.size === 0) return prev;
        const confirmedIds = new Set(agentList.map((a) => a.id));
        const next = new Set([...prev].filter((id) => !confirmedIds.has(id)));
        return next.size === prev.size ? prev : next;
      });

      const [lastSeenMap, sessionInfos] = await Promise.all([
        fetchLastSeenFromBridge(agentList.map((a) => a.id)),
        Promise.all(agentList.map((a) => fetchAgentSessions(a))),
      ]);
      if (!isMounted.current) return;

      const newStatuses: AgentStatus[] = agentList.map((agent, i) => {
        const info = sessionInfos[i];
        const activeRun = Array.from(activeRunsRef.current.values()).find(
          (r) => r.agentId === agent.id
        );
        const entry = lastSeenMap[agent.id];
        const lastSeen = entry?.ts || 0;
        const lastSeenMsg = entry?.msgText;
        const lastActivity = info.lastActivity || 0;
        const latestMsg = info.recentMessages[0]; // index 0 = newest (array is newest-first)
        // Unread if: there's been activity AND either the timestamp is newer
        // OR the latest message text differs from what was last seen.
        // Text comparison survives page reloads and ignores metadata-only updates.
        const hasNewActivity = lastActivity > lastSeen && lastActivity > 0;
        const hasNewMessage = !!latestMsg && latestMsg !== lastSeenMsg;
        // recentMessages is newest-first. lastSeenMsg = recentMessages[0] at time of last save.
        // seenIdx is where that message now sits — everything before it (lower index) is newer/unread.
        // seenIdx === 0 means user has seen the very latest → 0 unread.
        // seenIdx === -1 means last-seen message isn't in the window → count the whole window.
        let unreadCount = 0;
        if (hasNewActivity && hasNewMessage) {
          const seenIdx = lastSeenMsg ? info.recentMessages.indexOf(lastSeenMsg) : -1;
          unreadCount = seenIdx === -1 ? (info.recentMessages.length || 1) : seenIdx;
        }

        return {
          agentId: agent.id,
          name: agent.name,
          state: activeRun ? "running" as const : "idle" as const,
          lastActivity: lastActivity || undefined,
          unreadCount,
          recentMessages: info.recentMessages,
          sessionCount: info.sessionCount,
          lastSeenTs: lastSeen,
          runtime: agent.runtime,
        };
      });

      // Sort: running first, then unread, then by lastActivity
      newStatuses.sort((a, b) => {
        if (a.state === "running" && b.state !== "running") return -1;
        if (b.state === "running" && a.state !== "running") return 1;
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        return (b.lastActivity || 0) - (a.lastActivity || 0);
      });

      // Preserve optimistic hiring entries that the server doesn't know about yet.
      // Once the connector confirms and context updates, the server list will include
      // them and the hiring flag will be cleared naturally.
      setStatuses((prev) => {
        const serverIds = new Set(newStatuses.map((s) => s.agentId));
        const pendingHiring = prev.filter(
          (s) => hiringAgentIdsRef.current.has(s.agentId) && !serverIds.has(s.agentId)
        );
        return [...newStatuses, ...pendingHiring];
      });
    } catch { /* ignore */ } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [fetchAgents, fetchAgentSessions]);

  // Re-run refresh when the context agents list changes (e.g. initial load completes)
  const prevAgentCountRef = useRef(openClawAgents.length);
  useEffect(() => {
    if (openClawAgents.length > 0 && prevAgentCountRef.current === 0) {
      refresh();
    }
    prevAgentCountRef.current = openClawAgents.length;
  }, [openClawAgents, refresh]);

  // Initial load + auto-refresh (30s, pauses when tab hidden)
  useEffect(() => {
    isMounted.current = true;
    refresh();

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => refresh(), 30_000); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => { document.visibilityState === "visible" ? start() : stop(); };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isMounted.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  // Refresh on gateway reconnect
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      if (getGatewayConnectionState().connected) {
        setTimeout(() => refresh(), 500);
      }
    });
  }, [refresh]);

  // Real-time agent events for live status
  useEffect(() => {
    const unsub = gatewayConnection.onChatEvent((payload: ChatEventPayload) => {
      const { runId, sessionKey, state } = payload;
      if (!runId || !sessionKey) return;

      const parts = sessionKey.split(":");
      const agentId = parts.length >= 2 ? parts[1] : undefined;
      if (!agentId) return;

      if (state === "delta") {
        activeRunsRef.current.set(runId, { agentId, ts: Date.now() });
        setStatuses((prev) =>
          prev.map((s) =>
            s.agentId === agentId ? { ...s, state: "running" as const } : s
          )
        );
      } else if (state === "final" || state === "aborted") {
        activeRunsRef.current.delete(runId);
        const stillActive = Array.from(activeRunsRef.current.values()).some(
          (r) => r.agentId === agentId
        );
        if (!stillActive) {
          setStatuses((prev) =>
            prev.map((s) =>
              s.agentId === agentId
                ? { ...s, state: "idle" as const, lastActivity: Date.now(), unreadCount: s.unreadCount + 1 }
                : s
            )
          );
          // Fetch fresh messages once the session is written (~600ms is enough for connector)
          setTimeout(() => {
            fetchAgentSessions({ id: agentId, name: agentId, status: "", runtime: "openclaw" }).then((info) => {
              if (!isMounted.current) return;
              // Only update if we actually got messages — keeps existing preview while waiting
              if (info.recentMessages.length > 0) {
                setStatuses((prev) =>
                  prev.map((s) =>
                    s.agentId === agentId ? { ...s, recentMessages: info.recentMessages } : s
                  )
                );
              }
            }).catch(() => { /* ignore */ });
          }, 600);
        }
      } else if (state === "error") {
        activeRunsRef.current.delete(runId);
        setStatuses((prev) =>
          prev.map((s) =>
            s.agentId === agentId
              ? { ...s, state: "error" as const, errorMessage: payload.errorMessage || "Agent error", lastActivity: Date.now() }
              : s
          )
        );
      }
    });
    return unsub;
  }, []);

  // Expire stale runs (>5min)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [runId, run] of activeRunsRef.current) {
        if (now - run.ts > 5 * 60_000) activeRunsRef.current.delete(runId);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Derive IDs from statuses (not agents) so optimistic hiring entries are included.
  const agentIds = useMemo(() => statuses.map((s) => s.agentId), [statuses]);
  const identities = useAgentIdentities(agentIds);

  // Keep a ref so handleAgentClick can read latest statuses without stale closure
  const statusesRef = useRef<AgentStatus[]>([]);
  useEffect(() => { statusesRef.current = statuses; }, [statuses]);

  // Click handler: open the agent panel (unread is NOT cleared here — cleared when session is opened)
  const handleAgentClick = useCallback((agentId: string) => {
    const current = statusesRef.current.find((s) => s.agentId === agentId);
    const sessionCount = current?.sessionCount ?? 0;
    const unreadCount = current?.unreadCount ?? 0;
    const lastSeenTs = current?.lastSeenTs ?? 0;
    const runtime = current?.runtime;

    setActiveAgentId(agentId);
    dispatchOpenAgentPanel(agentId, undefined, { sessionCount, unreadCount, lastSeenTs, runtime });
  }, []);

  // Decrement unread per session opened; persist + zero out when clearAll is true
  useEffect(() => {
    const handler = (e: Event) => {
      const { agentId, clearAll } = (e as CustomEvent<{ agentId: string; clearAll?: boolean }>).detail ?? {};
      if (!agentId) return;
      setStatuses((prev) => prev.map((s) => {
        if (s.agentId !== agentId) return s;
        if (clearAll) {
          const lastMsg = s.recentMessages[0]; // newest message
          const ts = Date.now();
          bridgeInvoke("set-agent-last-seen", { agentId, ts, msgText: lastMsg || "" }).catch(() => {
            setLastSeenLocal(agentId, ts, lastMsg);
          });
          return { ...s, unreadCount: 0 };
        }
        return { ...s, unreadCount: Math.max(0, s.unreadCount - 1) };
      }));
    };
    window.addEventListener(AGENT_READ_EVENT, handler);
    return () => window.removeEventListener(AGENT_READ_EVENT, handler);
  }, []);

  // Track agents being deleted (background bridge call in flight)
  useEffect(() => {
    const onDeleting = (e: Event) => {
      const { agentId } = (e as CustomEvent<{ agentId: string }>).detail ?? {};
      if (!agentId) return;
      setDeletingAgentIds((prev) => new Set([...prev, agentId]));
      // Auto-select the first agent that isn't the one being deleted.
      // Read activeAgentId from a ref — never call side effects inside a state updater.
      if (activeAgentIdRef.current === agentId) {
        const next = statusesRef.current.find((s) => s.agentId !== agentId);
        if (next) {
          setActiveAgentId(next.agentId);
          dispatchOpenAgentPanel(next.agentId, undefined, {
            sessionCount: next.sessionCount,
            unreadCount: next.unreadCount,
            lastSeenTs: next.lastSeenTs,
            runtime: next.runtime,
          });
        } else {
          setActiveAgentId(null);
        }
      }
    };
    const onDeleted = (e: Event) => {
      const { agentId } = (e as CustomEvent<{ agentId: string }>).detail ?? {};
      if (!agentId) return;
      setDeletingAgentIds((prev) => { const n = new Set(prev); n.delete(agentId); return n; });
      setStatuses((prev) => prev.filter((s) => s.agentId !== agentId));
      refresh();
    };
    window.addEventListener("agent.deleting", onDeleting);
    window.addEventListener("agent.deleted", onDeleted);
    return () => {
      window.removeEventListener("agent.deleting", onDeleting);
      window.removeEventListener("agent.deleted", onDeleted);
    };
  }, [refresh]);

  // Track agents being hired (background bridge call in flight)
  useEffect(() => {
    const onHiring = (e: Event) => {
      const { agentId, name, emoji, runtime } = (e as CustomEvent<{
        agentId: string; name: string; emoji: string; runtime: string;
      }>).detail ?? {};
      if (!agentId) return;
      setHiringAgentIds((prev) => new Set([...prev, agentId]));
      setStatuses((prev) => {
        if (prev.some((s) => s.agentId === agentId)) return prev;
        return [...prev, {
          agentId,
          name: name || agentId,
          state: "idle",
          unreadCount: 0,
          recentMessages: [],
          sessionCount: 0,
          lastSeenTs: 0,
          runtime: runtime ?? "openclaw",
        }];
      });
    };
    const onHired = (e: Event) => {
      const { agentId } = (e as CustomEvent<{ agentId: string }>).detail ?? {};
      if (!agentId) return;
      setHiringAgentIds((prev) => { const n = new Set(prev); n.delete(agentId); return n; });
      refresh();
      setTimeout(() => refresh(), 1500);
    };
    const onHireFailed = (e: Event) => {
      const { agentId } = (e as CustomEvent<{ agentId: string }>).detail ?? {};
      if (!agentId) return;
      setHiringAgentIds((prev) => { const n = new Set(prev); n.delete(agentId); return n; });
      setStatuses((prev) => prev.filter((s) => s.agentId !== agentId));
    };
    window.addEventListener("agent.hiring", onHiring);
    window.addEventListener("agent.hired", onHired);
    window.addEventListener("agent.hire.failed", onHireFailed);
    return () => {
      window.removeEventListener("agent.hiring", onHiring);
      window.removeEventListener("agent.hired", onHired);
      window.removeEventListener("agent.hire.failed", onHireFailed);
    };
  }, [refresh]);

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full min-w-0 overflow-hidden"
    >
      <Card
        className={cn(
          "group h-full w-full min-w-0 flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        {/* Compact tab bar — no title, just tabs + controls */}
        <div className="flex items-center justify-between px-3 pt-2 pb-2 shrink-0 -mb-px">
          <div className="flex items-center gap-0.5">
            {props.isEditMode && (
              <div className="cursor-move h-6 w-6 flex items-center justify-center shrink-0 mr-1">
                <GripVertical className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
            <button
              onClick={() => setActiveTab("agents")}
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition-all duration-200 rounded-md shrink-0",
                activeTab === "agents"
                  ? "text-foreground bg-muted/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Users className="w-3 h-3 inline mr-1" />
              Agents
            </button>
            <button
              onClick={() => setActiveTab("projects")}
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition-all duration-200 rounded-md shrink-0",
                activeTab === "projects"
                  ? "text-foreground bg-muted/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <FolderOpen className="w-3 h-3 inline mr-1" />
              Projects
            </button>
            <button
              onClick={() => setActiveTab("inbox")}
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition-all duration-200 rounded-md shrink-0",
                activeTab === "inbox"
                  ? "text-foreground bg-muted/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Inbox className="w-3 h-3 inline mr-1" />
              Inbox
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-0 pb-2">
          {activeTab === "projects" ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between px-2 pb-2 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  {projects.length} project{projects.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setCreateProjectOpen(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  New
                </button>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                {projectsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <FolderOpen className="w-6 h-6 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground/60">No projects yet</p>
                    <button
                      onClick={() => setCreateProjectOpen(true)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Create your first project
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0.5 pr-1">
                    {projects.map((p) => (
                      <ProjectRow key={p.id} project={p} />
                    ))}
                  </div>
                )}
              </ScrollArea>
              <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
            </div>
          ) : activeTab === "inbox" ? (
            <ScrollArea className="flex-1 min-h-0">
              {inboxLoading ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Loading...</span>
                </div>
              ) : inboxItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Inbox className="w-6 h-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/60">Inbox is clear</p>
                  <p className="text-[10px] text-muted-foreground/40">Agent requests will appear here</p>
                </div>
              ) : (
                <div className="space-y-1 pr-1">
                  {inboxItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "p-2.5 rounded-md border transition-all",
                        item.status === "pending" ? "border-border/50 bg-card/50" : "border-border/20 bg-muted/20 opacity-60"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="shrink-0 mt-0.5">{INBOX_KIND_ICONS[item.kind] || INBOX_KIND_ICONS.info}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground truncate">{item.title}</span>
                            <span className="text-[9px] text-muted-foreground/40 shrink-0">{formatAbsTime(item.created_at)}</span>
                          </div>
                          {item.body && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{item.body}</p>
                          )}
                          {item.status === "pending" && (
                            <div className="flex items-center gap-1 mt-1.5">
                              {item.kind === "approval" && (
                                <>
                                  <button
                                    onClick={() => resolveInboxItem(item.id, "approved")}
                                    className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                                  >
                                    <Check className="w-2.5 h-2.5" />Approve
                                  </button>
                                  <button
                                    onClick={() => resolveInboxItem(item.id, "rejected")}
                                    className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                  >
                                    <XIcon className="w-2.5 h-2.5" />Reject
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => resolveInboxItem(item.id, "dismissed")}
                                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted/30 transition-colors ml-auto"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                          {item.status !== "pending" && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "mt-1 h-4 px-1.5 text-[9px]",
                                item.status === "approved" && "text-emerald-600 border-emerald-500/30",
                                item.status === "rejected" && "text-red-500 border-red-500/30",
                                item.status === "dismissed" && "text-muted-foreground border-border/30"
                              )}
                            >
                              {item.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Agents sub-header */}
              <div className="flex items-center justify-between px-2 pb-2 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  {statuses.length} agent{statuses.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setAddAgentOpen(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  New
                </button>
              </div>
              {loading && statuses.length === 0 ? (
                <div className="flex-1 flex items-center justify-center gap-2 py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading agents...</span>
                </div>
              ) : error && statuses.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
                  <AlertTriangle className="w-6 h-6 text-destructive/60" />
                  <p className="text-xs text-destructive text-center max-w-[200px]">{error}</p>
                  <Button variant="outline" size="sm" className="h-6 text-xs mt-1" onClick={() => refresh()} disabled={loading}>
                    <RefreshCw className={cn("w-3 h-3 mr-1", loading && "animate-spin")} />Retry
                  </Button>
                </div>
              ) : statuses.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
                  <Activity className="w-6 h-6 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground text-center">No employees yet</p>
                </div>
              ) : (
                <ScrollArea className="flex-1 min-h-0 w-full min-w-0">
                  <div className="space-y-0.5 pr-1 w-full min-w-0 overflow-hidden">
                    <AnimatePresence mode="popLayout">
                      {statuses.map((status) => (
                        <AgentExpandedRow
                          key={status.agentId}
                          status={status}
                          identity={identities.get(status.agentId)}
                          onClick={handleAgentClick}
                          isActive={activeAgentId === status.agentId}
                          isHiring={hiringAgentIds.has(status.agentId)}
                          isDeleting={deletingAgentIds.has(status.agentId)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>
      </Card>

      <AddAgentDialog
        open={addAgentOpen}
        onOpenChange={setAddAgentOpen}
      />
    </motion.div>
  );
});

StatusWidgetContent.displayName = "StatusWidgetContent";

const StatusWidget = memo((props: CustomProps) => {
  return (
    <ProjectsProvider>
      <StatusWidgetContent {...props} />
    </ProjectsProvider>
  );
});

StatusWidget.displayName = "StatusWidget";

export default StatusWidget;
