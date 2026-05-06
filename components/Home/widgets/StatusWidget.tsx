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
  Search,
  CalendarClock,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  type AgentIdentity,
} from "$/hooks/useAgentIdentity";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { OPEN_AGENT_PANEL_EVENT } from "./AgentChatPanel";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import { AddCronDialog } from "$/components/Tool/Crons/AddCronDialog";
import { CronsProvider } from "$/components/Tool/Crons/provider/cronsProvider";
import {
  fetchCronsFromBridge,
  fetchCronRunsFromBridge,
} from "$/components/Tool/Crons/utils";
import { getRunningJobIds, subscribeToRunningCrons } from "$/lib/crons-running-store";
import type { CronRunRecord, OpenClawCronJobJson } from "$/types/electron";
import { ProjectsProvider, useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { CreateProjectDialog } from "$/components/Tool/Projects/CreateProjectDialog";
import { ClaudeCodeIcon, CodexIcon, HermesIcon } from "$/components/Onboarding/RuntimeIcons";
import { dispatchOpenProjectPanel } from "./ProjectWidgetEvents";
import { ConnectorStatusIndicator } from "./ConnectorStatusIndicator";
import { StatusDot, useAgentStatus, useWorkingSessionKeys, normalizeAgentState, type AgentState } from "$/components/ensemble";
import { createAgentPrimarySessionKey } from "./gateway-chat/sessionKeys";
import {
  fetchAgentSessions as fetchAgentSessionList,
  filterDirectChatSessions,
  type AgentSessionListItem,
} from "./agent-session-list";
import type { BackendTab } from "./gateway-chat/GatewayChatHeader";
import { useRouter } from "next/router";

// Returns the branded React SVG icon for known runtimes, null otherwise.
function getRuntimeIcon(runtime?: string): React.ComponentType<{ className?: string }> | null {
  if (runtime === "claude-code") return ClaudeCodeIcon;
  if (runtime === "codex") return CodexIcon;
  if (runtime === "hermes") return HermesIcon;
  return null;
}

// Runtime display names for orphaned runtime UI
const RUNTIME_NAMES: Record<string, string> = {
  openclaw: "OpenClaw",
  hermes: "Hermes",
  "claude-code": "Claude Code",
  codex: "Codex",
};

// True if avatar is a user-uploaded image (PNG/JPG/HTTP) vs. the SVG seed or empty.
function isCustomImageAvatar(avatarUrl: string | undefined): boolean {
  if (!avatarUrl) return false;
  return !avatarUrl.startsWith("data:image/svg+xml");
}

function agentInitials(displayName: string, agentId: string): string {
  return (displayName || agentId || "AI").slice(0, 2).toUpperCase();
}

// ── Custom event for cross-widget communication ──
// StatusWidget dispatches this; GatewayChatWidget listens.
export const OPEN_AGENT_CHAT_EVENT = "open-agent-chat";

// ── Pending agent for first-visit navigation ──
// Set before navigating to Chat; consumed by the chat surface on mount.
let _pendingOpenAgent: { agentId: string; runtime?: string } | null = null;
export const setPendingOpenAgent = (agentId: string, runtime?: string) => {
  _pendingOpenAgent = { agentId, runtime };
};
export const consumePendingOpenAgent = () => {
  const p = _pendingOpenAgent;
  _pendingOpenAgent = null;
  return p;
};
// Dispatched by AgentChatWidget when the user actually opens a session — this is when we clear unread
export const AGENT_READ_EVENT = "agent-read";

export function dispatchOpenAgentChat(
  agentId: string,
  sessionKey?: string,
  meta?: { runtime?: string; runtimeUnavailable?: boolean; hiring?: boolean; newChat?: boolean }
) {
  window.dispatchEvent(
    new CustomEvent(OPEN_AGENT_CHAT_EVENT, { detail: { agentId, sessionKey, ...meta } })
  );
}

export function dispatchOpenAgentPanel(
  agentId: string,
  sessionKey?: string,
  meta?: {
    sessionCount?: number;
    unreadCount?: number;
    lastSeenTs?: number;
    runtime?: string;
    runtimeUnavailable?: boolean;
    hiring?: boolean;
    cronJobId?: string;
  }
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
  state: AgentState;
  lastActivity?: number;
  unreadCount: number;
  recentMessages: string[];
  sessionCount: number;
  lastSeenTs: number;
  errorMessage?: string;
  runtime?: string;
}

interface AgentSessionActivity {
  sessionCount: number;
  lastActivity?: number;
  recentMessages: string[];
  hasRunningSession?: boolean;
}

interface AgentCronActivity {
  lastActivity?: number;
  hasRunningCron: boolean;
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

interface TeamRuntimeStatus {
  runtime: string;
  status: "available" | "needs_auth" | "missing" | "unsupported" | "sync_error" | string;
  authStatus?: "ready" | "needs_auth" | "unknown" | string;
  syncStatus?: "configured" | "pending" | "sync_error" | string;
  message?: string;
}

function runtimeStatusTone(status: TeamRuntimeStatus): string {
  if (status.status === "sync_error" || status.syncStatus === "sync_error") {
    return "border-red-500/30 text-red-400/80";
  }
  if (status.authStatus === "needs_auth") {
    return "border-amber-500/30 text-amber-400/80";
  }
  if (status.status === "available" && status.syncStatus === "configured") {
    return "border-emerald-500/30 text-emerald-400/80";
  }
  return "border-border/40 text-muted-foreground";
}

const INBOX_KIND_ICONS: Record<string, React.ReactNode> = {
  approval: <Zap className="w-3 h-3 text-amber-500" />,
  question: <HelpCircle className="w-3 h-3 text-blue-500" />,
  error: <AlertTriangle className="w-3 h-3 text-destructive" />,
  info: <Info className="w-3 h-3 text-muted-foreground" />,
};

// ── Quiet hours: hide agents with no activity within this window ──
const QUIET_HOURS = 48;
const STATUS_WIDGET_BRIDGE_TIMEOUT_MS = 3500;
const STATUS_WIDGET_SESSION_TIMEOUT_MS = 5000;
const STATUS_WIDGET_CHAT_HISTORY_TIMEOUT_MS = 2500;
const CHAT_SIDEBAR_SESSION_READ_KEY = "hyperclaw.tool-chat.session-read";
const CHAT_SIDEBAR_CACHE_TTL_MS = 15_000;
const CHAT_SIDEBAR_SCROLL_AREA_CLASS = cn(
  "flex-1 min-h-0 w-full min-w-0 overflow-hidden",
  "[&_[data-radix-scroll-area-viewport]]:w-full",
  "[&_[data-radix-scroll-area-viewport]]:max-w-full",
  "[&_[data-radix-scroll-area-viewport]]:min-w-0",
  "[&_[data-radix-scroll-area-viewport]>div]:!block",
  "[&_[data-radix-scroll-area-viewport]>div]:!w-full",
  "[&_[data-radix-scroll-area-viewport]>div]:!min-w-0",
  "[&_[data-radix-scroll-area-viewport]>div]:!max-w-full",
);

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

function getSessionReadMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CHAT_SIDEBAR_SESSION_READ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function setSessionReadLocal(readMap: Record<string, number>) {
  try {
    localStorage.setItem(CHAT_SIDEBAR_SESSION_READ_KEY, JSON.stringify(readMap));
  } catch { /* ignore */ }
}

function readSessionKey(agentId: string, sessionKey: string): string {
  return `${agentId}:${sessionKey}`;
}

// ── Cron-seen helpers ──
// Tracks the runAtMs of the latest run the user has seen for each cron job.

const CRON_SEEN_KEY = "hyperclaw.tool-chat.cron-seen";

function getCronSeenMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CRON_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function setCronSeenLocal(seenMap: Record<string, number>) {
  try {
    localStorage.setItem(CRON_SEEN_KEY, JSON.stringify(seenMap));
  } catch { /* ignore */ }
}

function cronSeenKey(agentId: string, jobId: string): string {
  return `${agentId}:cron:${jobId}`;
}

function cronRunActivityTs(run: CronRunRecord): number {
  return run.runAtMs || run.ts || 0;
}

function numberFromUnknown(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cronStatusIsRunning(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const normalized = status.trim().toLowerCase();
  return ["active", "in_progress", "running", "streaming"].includes(normalized);
}

function getCronJobAgentId(job: OpenClawCronJobJson): string {
  return typeof job.agentId === "string" && job.agentId.trim() ? job.agentId.trim() : "main";
}

function getCronJobActivityTs(job: OpenClawCronJobJson): number {
  return Math.max(
    numberFromUnknown(job.state?.lastRunAtMs),
    numberFromUnknown((job as Record<string, unknown>).lastRunAtMs),
  );
}

function mergeAgentCronActivity(
  map: Map<string, AgentCronActivity>,
  agentId: string,
  activityTs: number,
  hasRunningCron: boolean,
) {
  const previous = map.get(agentId);
  map.set(agentId, {
    lastActivity: Math.max(previous?.lastActivity || 0, activityTs || 0) || undefined,
    hasRunningCron: Boolean(previous?.hasRunningCron || hasRunningCron),
  });
}

function mergeCronJobsById(jobGroups: OpenClawCronJobJson[][]): OpenClawCronJobJson[] {
  const merged = new Map<string, OpenClawCronJobJson>();
  for (const jobs of jobGroups) {
    for (const job of jobs) {
      if (!job.id) continue;
      const previous = merged.get(job.id);
      if (!previous) {
        merged.set(job.id, job);
        continue;
      }
      const previousLastRunAtMs = getCronJobActivityTs(previous);
      const nextLastRunAtMs = getCronJobActivityTs(job);
      merged.set(job.id, {
        ...previous,
        ...job,
        state: {
          ...(previous.state ?? {}),
          ...(job.state ?? {}),
          lastRunAtMs: Math.max(previousLastRunAtMs, nextLastRunAtMs) || undefined,
        },
      });
    }
  }
  return [...merged.values()];
}

async function fetchCronActivityByAgent(agentIds: string[]): Promise<Map<string, AgentCronActivity>> {
  const activityByAgent = new Map<string, AgentCronActivity>();
  if (agentIds.length === 0) return activityByAgent;

  const agentIdSet = new Set(agentIds);
  const [allJobs, openClawJobs] = await Promise.all([
    withTimeout(
      fetchCronsFromBridge(),
      STATUS_WIDGET_BRIDGE_TIMEOUT_MS,
      [] as OpenClawCronJobJson[],
    ),
    withTimeout(
      fetchCronsFromBridge({ runtime: "openclaw" }),
      STATUS_WIDGET_BRIDGE_TIMEOUT_MS,
      [] as OpenClawCronJobJson[],
    ),
  ]);
  const jobs = mergeCronJobsById([allJobs, openClawJobs]);
  const locallyRunningJobIds = new Set(getRunningJobIds());
  const relevantJobs = jobs.filter((job) => agentIdSet.has(getCronJobAgentId(job)));
  const jobIds = relevantJobs.map((job) => job.id).filter(Boolean);
  const runsByJobId = jobIds.length > 0
    ? await withTimeout(
      fetchCronRunsFromBridge(jobIds),
      STATUS_WIDGET_BRIDGE_TIMEOUT_MS,
      {} as Record<string, CronRunRecord[]>,
    )
    : {};

  for (const job of relevantJobs) {
    const agentId = getCronJobAgentId(job);
    const runs = (runsByJobId[job.id] ?? []).slice().sort((a, b) => cronRunActivityTs(b) - cronRunActivityTs(a));
    const latestRun = runs[0];
    const latestRunActivity = latestRun ? cronRunActivityTs(latestRun) : 0;
    const hasRunningCron =
      locallyRunningJobIds.has(job.id) ||
      cronStatusIsRunning(job.state?.lastStatus) ||
      cronStatusIsRunning(job.state?.lastRunStatus) ||
      cronStatusIsRunning((job as Record<string, unknown>).status) ||
      cronStatusIsRunning(latestRun?.status);
    const activityTs = hasRunningCron
      ? Date.now()
      : Math.max(getCronJobActivityTs(job), latestRunActivity);

    mergeAgentCronActivity(activityByAgent, agentId, activityTs, hasRunningCron);
  }

  return activityByAgent;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
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

function cronSessionActivityTs(sessions: AgentSessionListItem[], jobId: string): number {
  if (!jobId) return 0;
  const cronKeyPart = `:cron:${jobId}`;
  return sessions.reduce((latest, session) => {
    if (!session.key.includes(cronKeyPart)) return latest;
    return Math.max(latest, session.updatedAt || 0);
  }, 0);
}

function parseBackendTab(runtime?: string): BackendTab {
  if (runtime === "claude-code") return "claude-code";
  if (runtime === "codex") return "codex";
  if (runtime === "hermes") return "hermes";
  return "openclaw";
}

function isRunningSessionStatus(status?: string): boolean {
  const normalized = (status || "").toLowerCase();
  return [
    "active",
    "running",
    "in_progress",
    "in-progress",
    "streaming",
    "working",
    "generating",
    "spawning",
    "processing",
    "busy",
  ].includes(normalized);
}

function sessionDisplayTitle(session: AgentSessionListItem): string {
  return session.label || session.key.split(":").pop() || session.key;
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
      results.push(text.slice(0, 120)); // iterating backward → push keeps newest-first
    }
  }
  return results;
}

// ── Custom header ──

interface StatusHeaderProps extends CustomProps {
  agentCount?: number;
  hiddenCount?: number;
  unreadTotal?: number;
  className?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** @deprecated Replaced by ConnectorStatusIndicator which derives state internally. */
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
      <ConnectorStatusIndicator />
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

// Tiny hook-bridge: overlay live streaming "working" onto AgentStatus.state.
function AgentRowStatusDot({
  agentId,
  baseState,
}: {
  agentId: string;
  baseState: AgentState;
}) {
  const { state } = useAgentStatus(agentId, { state: baseState });
  return <StatusDot state={state} size="sm" corner ringClassName="bg-card" />;
}

// ── Agent row (expanded — for running / unread / error / recent idle expanded) ──

const AgentExpandedRow = React.forwardRef<HTMLDivElement, {
  status: AgentStatus;
  identity?: AgentIdentity;
  onClick: (agentId: string) => void;
  isActive?: boolean;
  isHiring?: boolean;
  isDeleting?: boolean;
  isUnavailable?: boolean;
}>(function AgentExpandedRow({ status, identity, onClick, isActive, isHiring, isDeleting, isUnavailable }, ref) {
  const resolvedAvatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarUrl = isCustomImageAvatar(resolvedAvatarUrl) ? resolvedAvatarUrl : undefined;
  const displayName = identity?.name || status.name || status.agentId;
  const runtime = identity?.runtime || status.runtime;
  const showRuntime = runtime && runtime !== "openclaw";
  const visualState: AgentState = isDeleting ? "deleting" : status.state;
  const isHiringVisual = isHiring || visualState === "hiring";
  // Only deleting blocks clicking. Hiring agents can still be opened/checked
  // while setup finishes; sending may be unavailable until the bridge is ready.
  const isDisabled = visualState === "deleting";

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "w-full min-w-0 flex items-start gap-2.5 px-2.5 py-2 rounded-none transition-colors overflow-hidden",
        isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        !isDisabled && (isActive ? "bg-muted/50" : "hover:bg-muted/30")
      )}
      onClick={() => !isDisabled && onClick(status.agentId)}
      title={isUnavailable ? `${RUNTIME_NAMES[runtime || ""] || runtime} is not installed — view only` : undefined}
    >
      {/* Avatar - grayed out when runtime unavailable */}
      <div className={cn("shrink-0 mt-0.5 relative", isUnavailable && "grayscale opacity-60")}>
        <Avatar className="w-7 h-7">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarFallback className="bg-primary/10 text-primary text-[11px] select-none">
            {identity?.emoji
              ? <span className="leading-[0]">{identity.emoji}</span>
              : <span className="leading-[0]">{agentInitials(displayName, status.agentId)}</span>
            }
          </AvatarFallback>
        </Avatar>
        {/* Suppress the red unread badge while the agent is mid-run or while
            the user is actively viewing it — the "Running" pill conveys live
            status, and the open panel is the read state. The badge reappears
            once the agent is idle AND the user has moved away. */}
        {status.unreadCount > 0 && status.state !== "running" && !isActive && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 border border-card flex items-center justify-center text-[8px] font-bold text-white leading-none">
            {status.unreadCount >= 99 ? "99+" : status.unreadCount}
          </span>
        )}
        {/* Status ring — canonical primitive with live streaming overlay */}
        <AgentRowStatusDot agentId={status.agentId} baseState={visualState} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col gap-0.5">

        {/* Line 1: Name · badge · [flex spacer] · runtime · ago */}
        <div className="flex items-center gap-1 min-w-0 w-full">
          <span className="text-xs font-medium text-foreground truncate shrink min-w-0">
            {displayName}
          </span>

          {/* Status badge — inline after name */}
          {isHiringVisual ? (
            <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none flex items-center gap-0.5">
              <Loader2 className="w-2 h-2 animate-spin" />Hiring
            </span>
          ) : visualState === "deleting" ? (
            <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none flex items-center gap-0.5">
              <Loader2 className="w-2 h-2 animate-spin" />Firing
            </span>
          ) : visualState === "running" ? (
            <span className="shrink-0 text-[9px] text-emerald-500 border border-emerald-500/30 rounded px-1 py-px leading-none flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />Running
            </span>
          ) : null}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Runtime tag */}
          {!isHiringVisual && visualState !== "deleting" && showRuntime && (
            <span className="shrink-0 text-[9px] text-muted-foreground/40 border border-border/20 rounded px-1 py-px leading-none">
              {runtime}
            </span>
          )}

          {/* Timestamp */}
          {!isHiringVisual && visualState !== "deleting" && status.lastActivity ? (
            <span className="shrink-0 text-[10px] text-muted-foreground/40">
              {timeAgo(status.lastActivity)}
            </span>
          ) : null}
        </div>

        {/* Line 2: message preview or error */}
        {status.state === "error" && status.errorMessage ? (
          <div className="flex items-center gap-1 text-[11px] text-destructive min-w-0 overflow-hidden">
            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            <span className="line-clamp-2 [overflow-wrap:anywhere]">{status.errorMessage}</span>
          </div>
        ) : status.recentMessages.length > 0 && !isHiringVisual && visualState !== "deleting" ? (
          <p className={cn(
            "text-[11px] line-clamp-2 [overflow-wrap:anywhere] overflow-hidden leading-snug",
            status.unreadCount > 0 ? "text-muted-foreground/80" : "text-muted-foreground/40"
          )}>
            {status.recentMessages[0]}
          </p>
        ) : null}

      </div>
    </motion.div>
  );
});

AgentExpandedRow.displayName = "AgentExpandedRow";

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

  const handleOpenProject = useCallback(() => {
    selectProject(project.id);
    dispatchOpenProjectPanel(project.id);
  }, [project.id, selectProject]);

  const handleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && members.length === 0) selectProject(project.id);
  }, [expanded, members.length, project.id, selectProject]);

  return (
    <div>
      <div className="w-full flex items-center gap-1">
        <button
          onClick={handleOpenProject}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/30"
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
        </div>
        </button>
        <button
          onClick={handleExpand}
          aria-label={expanded ? "Collapse project members" : "Expand project members"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      </div>

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
  const router = useRouter();
  const { className } = props;
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
  const [teamRuntimeStatuses, setTeamRuntimeStatuses] = useState<TeamRuntimeStatus[]>([]);
  const [teamModeSyncing, setTeamModeSyncing] = useState(false);

  // ── Inbox ──
  const [activeTab, setActiveTab] = useState<StatusTab>("agents");
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const activeAgentIdRef = useRef<string | null>(null);
  useEffect(() => { activeAgentIdRef.current = activeAgentId; }, [activeAgentId]);
  // Tracks which specific session row is active (highlighted) in the sidebar
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const workingSessionKeys = useWorkingSessionKeys();
  // Tracks which cron job row is active — separate from chat session highlight.
  // Format: `${agentId}:${jobId}` or null.
  const [activeCronKey, setActiveCronKey] = useState<string | null>(null);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hiringAgentIds, setHiringAgentIds] = useState<Set<string>>(new Set());
  const [deletingAgentIds, setDeletingAgentIds] = useState<Set<string>>(new Set());
  // Refs kept in sync so refresh() can read without stale closures
  const hiringAgentIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { hiringAgentIdsRef.current = hiringAgentIds; }, [hiringAgentIds]);
  const deletingAgentIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { deletingAgentIdsRef.current = deletingAgentIds; }, [deletingAgentIds]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  // Orphaned runtimes (uninstalled runtimes with agents still in DB)
  const [orphanedRuntimes, setOrphanedRuntimes] = useState<Array<{ runtime: string; agentCount: number }>>([]);
  const [orphanProcessing, setOrphanProcessing] = useState<string | null>(null);
  // Orphaned agents (individual agents whose workspace was deleted)
  const [orphanedAgents, setOrphanedAgents] = useState<Array<{ id: string; name: string; runtime: string; avatar?: string; emoji?: string }>>([]);
  const [orphanedAgentProcessing, setOrphanedAgentProcessing] = useState<string | null>(null);
  const [inboxLoading, setInboxLoading] = useState(false);

  // Runtimes that need authentication (e.g., `codex login`)
  const needsAuthRuntimes = useMemo(
    () => teamRuntimeStatuses.filter((r) => r.authStatus === "needs_auth" && r.status === "available"),
    [teamRuntimeStatuses]
  );

  const filteredStatuses = useMemo(() => {
    if (!search.trim()) return statuses;
    const q = search.trim().toLowerCase();
    return statuses.filter((s) =>
      s.name.toLowerCase().includes(q) || s.agentId.toLowerCase().includes(q)
    );
  }, [statuses, search]);
  const unreadTotal = useMemo(
    () => statuses.reduce((sum, status) => sum + status.unreadCount, 0),
    [statuses]
  );

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter((p) =>
      (p.name || "").toLowerCase().includes(q)
    );
  }, [projects, search]);

  const openAgentProfile = useCallback((agentId: string) => {
    void router.push(`/Tool/Agent/${agentId}`).catch((err: unknown) => {
      if (err && typeof err === "object" && (err as { cancelled?: boolean }).cancelled) return;
      console.error("Agent profile navigation failed:", err);
    });
  }, [router]);

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

  const fetchTeamRuntimeStatuses = useCallback(async () => {
    try {
      const result = await bridgeInvoke("get-team-mode-status", {}) as {
        success?: boolean;
        data?: TeamRuntimeStatus[];
      };
      if (result?.success && Array.isArray(result.data) && isMounted.current) {
        setTeamRuntimeStatuses(result.data);
      }
    } catch {
      if (isMounted.current) setTeamRuntimeStatuses([]);
    }
  }, []);

  const syncTeamMode = useCallback(async () => {
    setTeamModeSyncing(true);
    try {
      await bridgeInvoke("sync-team-mode", {});
      await fetchTeamRuntimeStatuses();
    } catch {
      // ignore and let the next poll refresh status
    } finally {
      if (isMounted.current) setTeamModeSyncing(false);
    }
  }, [fetchTeamRuntimeStatuses]);

  // ── Orphaned runtimes ──
  const fetchOrphanedRuntimes = useCallback(async () => {
    try {
      const result = (await bridgeInvoke("check-orphaned-runtimes")) as {
        success: boolean;
        data?: { orphaned: Array<{ runtime: string; agentCount: number }> };
      };
      if (result.success && result.data?.orphaned && isMounted.current) {
        setOrphanedRuntimes(result.data.orphaned);
      }
    } catch { /* connector offline */ }
  }, []);

  const handleOrphanExportAndDelete = useCallback(async (runtime: string) => {
    setOrphanProcessing(runtime);
    try {
      // Export first
      const exportResult = (await bridgeInvoke("runtime-cleanup-export", { runtime })) as {
        success: boolean;
        data?: { agents: unknown[]; count: number };
        error?: string;
      };
      if (!exportResult.success) {
        console.error("Export failed:", exportResult.error);
        return;
      }
      // Download JSON
      const blob = new Blob([JSON.stringify(exportResult.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${runtime}-agents-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Then delete
      const deleteResult = (await bridgeInvoke("runtime-cleanup-delete", { runtime })) as {
        success: boolean;
        data?: { deleted: number };
        error?: string;
      };
      if (deleteResult.success) {
        setOrphanedRuntimes((prev) => prev.filter((o) => o.runtime !== runtime));
      }
    } catch (error) {
      console.error("Orphan cleanup failed:", error);
    } finally {
      if (isMounted.current) setOrphanProcessing(null);
    }
  }, []);

  const handleOrphanDeleteOnly = useCallback(async (runtime: string) => {
    setOrphanProcessing(runtime);
    try {
      const result = (await bridgeInvoke("runtime-cleanup-delete", { runtime })) as {
        success: boolean;
        data?: { deleted: number };
        error?: string;
      };
      if (result.success) {
        setOrphanedRuntimes((prev) => prev.filter((o) => o.runtime !== runtime));
      }
    } catch (error) {
      console.error("Orphan delete failed:", error);
    } finally {
      if (isMounted.current) setOrphanProcessing(null);
    }
  }, []);

  const handleOrphanDismiss = useCallback((runtime: string) => {
    setOrphanedRuntimes((prev) => prev.filter((o) => o.runtime !== runtime));
  }, []);

  // ── Orphaned Agents (individual workspace detection) ──
  const fetchOrphanedAgents = useCallback(async () => {
    try {
      const result = (await bridgeInvoke("check-orphaned-agents")) as {
        success: boolean;
        data?: { orphanedAgents: Array<{ id: string; name: string; runtime: string; avatar?: string; emoji?: string }>; count: number };
      };
      if (result.success && result.data?.orphanedAgents && isMounted.current) {
        setOrphanedAgents(result.data.orphanedAgents);
      }
    } catch { /* connector offline */ }
  }, []);

  const handleOrphanedAgentDelete = useCallback(async (agentId: string) => {
    setOrphanedAgentProcessing(agentId);
    try {
      const result = (await bridgeInvoke("delete-orphaned-agent", { agentId })) as {
        success: boolean;
        error?: string;
      };
      if (result.success) {
        setOrphanedAgents((prev) => prev.filter((a) => a.id !== agentId));
        // Notify agent providers to refresh
        gatewayConnection.emit("agents.changed");
      }
    } catch (error) {
      console.error("Orphaned agent delete failed:", error);
    } finally {
      if (isMounted.current) setOrphanedAgentProcessing(null);
    }
  }, []);

  const handleOrphanedAgentDeleteAllByRuntime = useCallback(async (runtime: string) => {
    setOrphanedAgentProcessing(runtime);
    try {
      const result = (await bridgeInvoke("delete-all-orphaned-agents", { runtime })) as {
        success: boolean;
        data?: { deleted: string[]; count: number };
        error?: string;
      };
      if (result.success && result.data?.deleted) {
        const deletedSet = new Set(result.data.deleted);
        setOrphanedAgents((prev) => prev.filter((a) => !deletedSet.has(a.id)));
        // Notify agent providers to refresh
        gatewayConnection.emit("agents.changed");
      }
    } catch (error) {
      console.error("Orphaned agents bulk delete failed:", error);
    } finally {
      if (isMounted.current) setOrphanedAgentProcessing(null);
    }
  }, []);

  const handleOrphanedAgentDismiss = useCallback((agentId: string) => {
    setOrphanedAgents((prev) => prev.filter((a) => a.id !== agentId));
  }, []);

  // Derive unavailable runtimes set from orphaned runtimes AND missing runtimes from team status
  const unavailableRuntimes = useMemo(() => {
    const set = new Set(orphanedRuntimes.map((o) => o.runtime));
    // Also include runtimes that are marked as "missing" in team status
    for (const status of teamRuntimeStatuses) {
      if (status.status === "missing") {
        set.add(status.runtime);
      }
    }
    return set;
  }, [orphanedRuntimes, teamRuntimeStatuses]);
  // Ref for use in callbacks
  const unavailableRuntimesRef = useRef<Set<string>>(new Set());
  useEffect(() => { unavailableRuntimesRef.current = unavailableRuntimes; }, [unavailableRuntimes]);

  // Fetch inbox on tab switch + poll every 60s for badge count
  useEffect(() => {
    if (activeTab === "inbox") fetchInbox();
  }, [activeTab, fetchInbox]);

  useEffect(() => {
    fetchInbox();
    const timer = setInterval(() => fetchInbox(), 60_000);
    return () => clearInterval(timer);
  }, [fetchInbox]);

  useEffect(() => {
    fetchTeamRuntimeStatuses();
    const timer = setInterval(() => fetchTeamRuntimeStatuses(), 60_000);
    return () => clearInterval(timer);
  }, [fetchTeamRuntimeStatuses]);

  // Runtime-level orphan detection disabled — individual agent detection is more accurate.
  // The "check-orphaned-agents" action checks each agent's workspace directory.
  // Keeping the state/handlers for backwards compatibility but not fetching.
  // useEffect(() => {
  //   fetchOrphanedRuntimes();
  //   const handleUninstall = ...
  // }, [fetchOrphanedRuntimes]);

  // Fetch orphaned agents (individual workspace detection) on mount
  useEffect(() => {
    fetchOrphanedAgents();
  }, [fetchOrphanedAgents]);

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

  // Fetch session/activity data for a single agent. The canonical freshness source is
  // the session list sorted by updatedAt, so status rows reflect the newest chat across
  // normal sessions, cron-owned sessions, and non-OpenClaw runtime sessions.
  const fetchAgentSessions = useCallback(
    async (agent: Agent): Promise<AgentSessionActivity> => {
      const runtime = agent.runtime || "openclaw";
      const backendTab = parseBackendTab(runtime);
      const empty = { sessionCount: 0, recentMessages: [] as string[] };
      let sessions: AgentSessionListItem[] = [];
      try {
        sessions = await withTimeout(
          fetchAgentSessionList({ agentId: agent.id, backendTab, includeDefault: false, limit: 100 }),
          STATUS_WIDGET_SESSION_TIMEOUT_MS,
          [] as AgentSessionListItem[]
        );
      } catch { /* ignore */ }

      const directSessions = filterDirectChatSessions(sessions);
      const latestSession = sessions[0];
      const latestDirectSession = directSessions[0];
      const latestSessionActivity = latestSession?.updatedAt || 0;
      const hasRunningSession = sessions.some((session) => isRunningSessionStatus(session.status));

      // Non-OpenClaw runtimes: the connector can aggregate recent messages across
      // all scoped sessions. Prefer the session-list updatedAt for freshness, but
      // keep the runtime bridge as a fallback when the list is unavailable.
      if (runtime !== "openclaw") {
        try {
          const result = await withTimeout(
            bridgeInvoke("get-runtime-sessions", { agentId: agent.id, runtime, limit: 20 }) as Promise<{
              success?: boolean;
              data?: { sessionCount?: number; lastActiveMs?: number; recentMessages?: Array<{ role: string; content: string; timestamp: number }> };
            }>,
            STATUS_WIDGET_SESSION_TIMEOUT_MS,
            { success: false }
          );
          if (result?.success && result.data) {
            const msgs = (result.data.recentMessages || [])
              .filter((m) => m.role === "assistant")
              .map((m) => m.content)
              .filter(Boolean)
              .reverse();
            return {
              sessionCount: sessions.length > 0 ? directSessions.length : result.data.sessionCount || 0,
              lastActivity: Math.max(latestSessionActivity, result.data.lastActiveMs || 0) || undefined,
              recentMessages: msgs,
              hasRunningSession,
            };
          }
        } catch { /* ignore */ }
        return sessions.length > 0
          ? {
              sessionCount: directSessions.length,
              lastActivity: latestSessionActivity || undefined,
              recentMessages: [],
              hasRunningSession,
            }
          : empty;
      }

      // OpenClaw: aggregate activity from all sessions, but previews/read counts
      // stay on the newest direct chat so cron-owned chats remain in cron history.
      const sessionKey = latestDirectSession?.key || createAgentPrimarySessionKey(agent.id);
      try {
        let recentMessages: string[] = [];
        const history = await withTimeout(
          gatewayConnection.getChatHistory(sessionKey, 20),
          STATUS_WIDGET_CHAT_HISTORY_TIMEOUT_MS,
          { messages: [] as Array<{ role?: string; content?: unknown }> }
        );
        const messages = (history.messages || []) as Array<{ role?: string; content?: unknown }>;
        recentMessages = extractRecentAssistantTexts(messages, 10);

        return {
          sessionCount: directSessions.length || (messages.length > 0 ? 1 : 0),
          lastActivity: latestSessionActivity || undefined,
          recentMessages,
          hasRunningSession,
        };
      } catch {
        return sessions.length > 0
          ? {
              sessionCount: directSessions.length,
              lastActivity: latestSessionActivity || undefined,
              recentMessages: [],
              hasRunningSession,
            }
          : empty;
      }
    },
    []
  );

  // Build statuses
  const refreshSeqRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!isMounted.current) return;
    const refreshSeq = ++refreshSeqRef.current;
    if (statusesRef.current.length === 0) setLoading(true);
    setError(null);
    try {
      const rawAgentList = await fetchAgents();
      if (!isMounted.current) return;
      // Keep agents whose deletion is in flight visible so Chat can show the
      // same red "Firing" state as the main sidebar.
      const agentList = rawAgentList;
      setAgents(agentList);
      // Clear hiring flags only after the context row has left "hiring".
      // Optimistic rows are intentionally merged into the context while setup
      // runs, so mere presence in the list is not enough to clear the badge.
      setHiringAgentIds((prev) => {
        if (prev.size === 0) return prev;
        const confirmedIds = new Set(
          agentList
            .filter((agent) => normalizeAgentState(agent.status) !== "hiring")
            .map((a) => a.id),
        );
        const next = new Set([...prev].filter((id) => !confirmedIds.has(id)));
        return next.size === prev.size ? prev : next;
      });

      // Render immediately with prior-known data, then hydrate in background.
      const prevById = new Map(statusesRef.current.map((s) => [s.agentId, s] as const));
      const baseStatuses: AgentStatus[] = agentList.map((agent) => {
        const prev = prevById.get(agent.id);
        const registryState = normalizeAgentState(agent.status);
        return {
          agentId: agent.id,
          name: agent.name,
          state: deletingAgentIdsRef.current.has(agent.id)
            ? "deleting"
            : registryState !== "idle"
              ? registryState
              : prev?.state || "idle",
          lastActivity: prev?.lastActivity,
          unreadCount: prev?.unreadCount || 0,
          recentMessages: prev?.recentMessages || [],
          sessionCount: prev?.sessionCount || 0,
          lastSeenTs: prev?.lastSeenTs || 0,
          runtime: agent.runtime,
          errorMessage: prev?.errorMessage,
        };
      });

      baseStatuses.sort((a, b) => {
        if (a.state === "running" && b.state !== "running") return -1;
        if (b.state === "running" && a.state !== "running") return 1;
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        return (b.lastActivity || 0) - (a.lastActivity || 0);
      });

      setStatuses((prev) => {
        const baseIds = new Set(baseStatuses.map((s) => s.agentId));
        const pendingHiring = prev.filter(
          (s) => hiringAgentIdsRef.current.has(s.agentId) && !baseIds.has(s.agentId)
        );
        return [...baseStatuses, ...pendingHiring];
      });
      if (isMounted.current) setLoading(false);

      // Hydrate session/unread in background with strict time budgets.
      const [lastSeenMap, cronActivityByAgent, sessionInfos] = await Promise.all([
        withTimeout(
          fetchLastSeenFromBridge(agentList.map((a) => a.id)),
          STATUS_WIDGET_BRIDGE_TIMEOUT_MS,
          {} as Record<string, LastSeenEntry>
        ),
        withTimeout(
          fetchCronActivityByAgent(agentList.map((a) => a.id)),
          STATUS_WIDGET_BRIDGE_TIMEOUT_MS * 2,
          new Map<string, AgentCronActivity>(),
        ),
        Promise.all(agentList.map((a) =>
          withTimeout(
            fetchAgentSessions(a),
            STATUS_WIDGET_SESSION_TIMEOUT_MS,
            { sessionCount: 0, recentMessages: [] as string[] }
          )
        )),
      ]);
      if (!isMounted.current || refreshSeq !== refreshSeqRef.current) return;

      const enrichedStatuses: AgentStatus[] = agentList.map((agent, i) => {
        const info = sessionInfos[i];
        const activeRun = Array.from(activeRunsRef.current.values()).find(
          (r) => r.agentId === agent.id
        );
        const registryState = normalizeAgentState(agent.status);
        const previous = prevById.get(agent.id);
        const entry = lastSeenMap[agent.id];
        const lastSeen = entry?.ts || previous?.lastSeenTs || 0;
        const lastSeenMsg = entry?.msgText;
        const cronActivity = cronActivityByAgent.get(agent.id);
        const lastActivity = Math.max(info.lastActivity || 0, cronActivity?.lastActivity || 0);
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
        // The currently-open agent panel is "always read" while focused — the
        // user is literally looking at it. This keeps the badge from piling up
        // count during an active chat.
        const isActivelyViewing =
          activeAgentIdRef.current === agent.id &&
          (typeof document === "undefined" || document.visibilityState === "visible");
        if (isActivelyViewing) unreadCount = 0;

        return {
          agentId: agent.id,
          name: agent.name,
          state: deletingAgentIdsRef.current.has(agent.id)
            ? "deleting"
            : registryState !== "idle"
              ? registryState
              : activeRun || info.hasRunningSession || cronActivity?.hasRunningCron ? "running" : "idle",
          lastActivity: lastActivity || previous?.lastActivity || undefined,
          unreadCount,
          recentMessages: info.recentMessages.length > 0 ? info.recentMessages : (previous?.recentMessages || []),
          sessionCount: info.sessionCount,
          lastSeenTs: lastSeen,
          runtime: agent.runtime,
          errorMessage: previous?.errorMessage,
        };
      });

      // Sort: running first, then unread, then by lastActivity
      enrichedStatuses.sort((a, b) => {
        if (a.state === "running" && b.state !== "running") return -1;
        if (b.state === "running" && a.state !== "running") return 1;
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        return (b.lastActivity || 0) - (a.lastActivity || 0);
      });

      // Preserve optimistic hiring entries that the server doesn't know about yet.
      // Once the connector confirms and context updates, the server list will include
      // them and the hiring flag will be cleared naturally.
      setStatuses((prev) => {
        const serverIds = new Set(enrichedStatuses.map((s) => s.agentId));
        const pendingHiring = prev.filter(
          (s) => hiringAgentIdsRef.current.has(s.agentId) && !serverIds.has(s.agentId)
        );
        return [...enrichedStatuses, ...pendingHiring];
      });
    } catch {
      if (isMounted.current) {
        setError("Status load timed out. Showing cached/partial data.");
        setLoading(false);
      }
    }
  }, [fetchAgents, fetchAgentSessions]);

  // Re-run refresh whenever new agents are added to the context list.
  // Using count > prev covers both 0→N (initial load) and N→M (OpenClaw agents
  // arriving after SQLite agents have already populated the list).
  const prevAgentCountRef = useRef(openClawAgents.length);
  useEffect(() => {
    if (openClawAgents.length > prevAgentCountRef.current) {
      refresh();
    }
    prevAgentCountRef.current = openClawAgents.length;
  }, [openClawAgents, refresh]);

  // Initial load + auto-refresh (10s, pauses when tab hidden)
  useEffect(() => {
    isMounted.current = true;
    refresh();

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => refresh(), 10_000); };
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
            s.agentId === agentId ? { ...s, state: "running" as const, lastActivity: Date.now() } : s
          )
        );
      } else if (state === "final" || state === "aborted") {
        activeRunsRef.current.delete(runId);
        const stillActive = Array.from(activeRunsRef.current.values()).some(
          (r) => r.agentId === agentId
        );
        if (!stillActive) {
          // Suppress the unread bump when the user is actively looking at this
          // agent's panel — they're already "reading" it. Hitting +1 anyway
          // produces phantom unread badges as you chat.
          const isActivelyViewing =
            activeAgentIdRef.current === agentId &&
            (typeof document === "undefined" || document.visibilityState === "visible");
          setStatuses((prev) =>
            prev.map((s) =>
              s.agentId === agentId
                ? {
                    ...s,
                    state: "idle" as const,
                    lastActivity: Date.now(),
                    unreadCount: isActivelyViewing ? 0 : s.unreadCount + 1,
                  }
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
                // If the user is actively viewing this agent, persist the latest
                // message as "seen" so the next refresh() doesn't re-introduce
                // the unread count we just zeroed above.
                if (isActivelyViewing) {
                  const latest = info.recentMessages[0];
                  const ts = Date.now();
                  bridgeInvoke("set-agent-last-seen", { agentId, ts, msgText: latest || "" })
                    .catch(() => setLastSeenLocal(agentId, ts, latest));
                }
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
  }, [fetchAgentSessions]);

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
  const isChatSidebarLayout = props.widget.config?.layout === "agent-accordion";
  const [expandedAgentIds, setExpandedAgentIds] = useState<string[]>([]);
  const expandedAgentIdsRef = useRef<string[]>([]);
  useEffect(() => { expandedAgentIdsRef.current = expandedAgentIds; }, [expandedAgentIds]);
  const [sidebarSessions, setSidebarSessions] = useState<Record<string, AgentSessionListItem[]>>({});
  const sidebarSessionsRef = useRef<Record<string, AgentSessionListItem[]>>({});
  useEffect(() => { sidebarSessionsRef.current = sidebarSessions; }, [sidebarSessions]);
  const [sidebarSessionLoading, setSidebarSessionLoading] = useState<Record<string, boolean>>({});
  const [sidebarCrons, setSidebarCrons] = useState<Record<string, OpenClawCronJobJson[]>>({});
  const sidebarCronsRef = useRef<Record<string, OpenClawCronJobJson[]>>({});
  useEffect(() => { sidebarCronsRef.current = sidebarCrons; }, [sidebarCrons]);
  const [sidebarCronRuns, setSidebarCronRuns] = useState<Record<string, Record<string, CronRunRecord[]>>>({});
  const [sidebarCronLoading, setSidebarCronLoading] = useState<Record<string, boolean>>({});
  const [sidebarSessionsShowAll, setSidebarSessionsShowAll] = useState<Record<string, boolean>>({});
  const [sidebarCacheTs, setSidebarCacheTs] = useState<Record<string, number>>({});
  const sidebarCacheTsRef = useRef<Record<string, number>>({});
  useEffect(() => { sidebarCacheTsRef.current = sidebarCacheTs; }, [sidebarCacheTs]);
  const sidebarLoadInflightRef = useRef<Set<string>>(new Set());
  const identitiesRef = useRef(identities);
  useEffect(() => { identitiesRef.current = identities; }, [identities]);
  const [sessionReadMap, setSessionReadMap] = useState<Record<string, number>>(() => getSessionReadMap());
  const sessionReadMapRef = useRef<Record<string, number>>(sessionReadMap);
  useEffect(() => { sessionReadMapRef.current = sessionReadMap; }, [sessionReadMap]);
  const [cronSeenMap, setCronSeenMap] = useState<Record<string, number>>(() => getCronSeenMap());
  const [addCronDefaults, setAddCronDefaults] = useState<{ agentId: string; runtime?: string } | null>(null);

  // Keep a ref so handleAgentClick can read latest statuses without stale closure
  const statusesRef = useRef<AgentStatus[]>([]);
  useEffect(() => { statusesRef.current = statuses; }, [statuses]);

  const markSidebarSessionRead = useCallback((agentId: string, sessionKey: string, ts = Date.now()) => {
    const storageKey = readSessionKey(agentId, sessionKey);
    const previousReadTs = sessionReadMapRef.current[storageKey] ?? 0;
    const sessionUpdatedAt = sidebarSessionsRef.current[agentId]?.find((s) => s.key === sessionKey)?.updatedAt ?? 0;
    const shouldDecrementUnread = previousReadTs === 0 || (sessionUpdatedAt > 0 && sessionUpdatedAt > previousReadTs);
    const next = { ...sessionReadMapRef.current, [storageKey]: ts };
    sessionReadMapRef.current = next;
    setSessionReadMap(next);
    setSessionReadLocal(next);
    setLastSeenLocal(agentId, ts);
    if (shouldDecrementUnread) {
      setStatuses((prev) => prev.map((s) => (
        s.agentId === agentId
          ? { ...s, unreadCount: Math.max(0, s.unreadCount - 1) }
          : s
      )));
    }
  }, []);

  const loadSidebarAgentData = useCallback(async (status: AgentStatus, force = false, showLoading = false) => {
    const agentId = status.agentId;
    const identity = identitiesRef.current.get(agentId);
    const runtime = identity?.runtime || status.runtime;
    const backendTab = parseBackendTab(runtime);
    const projectPath = identity?.project || "";
    const cacheKey = `${agentId}:${backendTab}:${projectPath}`;
    const cachedAt = sidebarCacheTsRef.current[cacheKey] ?? 0;

    if (!force && cachedAt && Date.now() - cachedAt < CHAT_SIDEBAR_CACHE_TTL_MS) return;
    if (sidebarLoadInflightRef.current.has(cacheKey)) return;
    sidebarLoadInflightRef.current.add(cacheKey);

    const runtimeUnavailable = runtime ? unavailableRuntimesRef.current.has(runtime) : false;
    const shouldShowSessionLoading =
      showLoading || !Object.prototype.hasOwnProperty.call(sidebarSessionsRef.current, agentId);
    const shouldShowCronLoading =
      showLoading || !Object.prototype.hasOwnProperty.call(sidebarCronsRef.current, agentId);

    if (shouldShowSessionLoading) {
      setSidebarSessionLoading((prev) => ({ ...prev, [agentId]: true }));
    }
    if (shouldShowCronLoading) {
      setSidebarCronLoading((prev) => ({ ...prev, [agentId]: true }));
    }

    try {
      const [sessions, jobs] = await Promise.all([
        runtimeUnavailable
          ? Promise.resolve([] as AgentSessionListItem[])
          : fetchAgentSessionList({ agentId, backendTab, projectPath, includeDefault: false, limit: 100 }),
        fetchCronsFromBridge({ agentId, runtime: backendTab === "openclaw" ? "openclaw" : runtime }),
      ]);

      if (!isMounted.current) return;

      setSidebarSessions((prev) => ({ ...prev, [agentId]: sessions }));
      setSidebarCrons((prev) => ({ ...prev, [agentId]: jobs }));
      const cachedAtNext = Date.now();
      sidebarCacheTsRef.current = { ...sidebarCacheTsRef.current, [cacheKey]: cachedAtNext };
      setSidebarCacheTs((prev) => ({ ...prev, [cacheKey]: cachedAtNext }));

      const jobIds = jobs.map((job) => job.id).filter(Boolean);
      if (jobIds.length > 0) {
        const runsByJobId = await fetchCronRunsFromBridge(jobIds).catch(() => ({}));
        if (isMounted.current) {
          setSidebarCronRuns((prev) => ({ ...prev, [agentId]: runsByJobId }));
        }
      } else {
        setSidebarCronRuns((prev) => ({ ...prev, [agentId]: {} }));
      }
    } finally {
      sidebarLoadInflightRef.current.delete(cacheKey);
      if (isMounted.current) {
        if (shouldShowSessionLoading) {
          setSidebarSessionLoading((prev) => ({ ...prev, [agentId]: false }));
        }
        if (shouldShowCronLoading) {
          setSidebarCronLoading((prev) => ({ ...prev, [agentId]: false }));
        }
      }
    }
  }, []);

  // Manual "Run now" cron actions update a small running-cron store. Refresh
  // both the top agent rows and any expanded cron rows immediately.
  useEffect(() => subscribeToRunningCrons(() => {
    refresh();
    if (!isChatSidebarLayout) return;
    const expanded = new Set(expandedAgentIdsRef.current);
    statusesRef.current
      .filter((status) => expanded.has(status.agentId))
      .forEach((status) => {
        void loadSidebarAgentData(status, true);
      });
  }), [isChatSidebarLayout, loadSidebarAgentData, refresh]);

  const handleSidebarAccordionToggle = useCallback((agentId: string) => {
    const isOpen = expandedAgentIds.includes(agentId);
    setExpandedAgentIds((prev) => (
      isOpen ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    ));
    if (!isOpen) {
      const status = statusesRef.current.find((item) => item.agentId === agentId);
      if (status) void loadSidebarAgentData(status);
    }
  }, [expandedAgentIds, loadSidebarAgentData]);

  useEffect(() => {
    if (!isChatSidebarLayout) return;

    const refreshExpandedAgents = () => {
      if (expandedAgentIdsRef.current.length === 0) return;
      const expanded = new Set(expandedAgentIdsRef.current);
      statusesRef.current
        .filter((status) => expanded.has(status.agentId))
        .forEach((status) => {
          void loadSidebarAgentData(status, true);
        });
    };

    const timer = window.setInterval(refreshExpandedAgents, CHAT_SIDEBAR_CACHE_TTL_MS);
    return () => window.clearInterval(timer);
  }, [isChatSidebarLayout, loadSidebarAgentData]);

  const openSidebarChatSession = useCallback((status: AgentStatus, sessionKey: string) => {
    const runtime = identities.get(status.agentId)?.runtime || status.runtime;
    const runtimeUnavailable = runtime ? unavailableRuntimesRef.current.has(runtime) : false;
    markSidebarSessionRead(status.agentId, sessionKey);
    setActiveAgentId(status.agentId);
    setActiveSessionKey(sessionKey);
    setActiveCronKey(null);
    dispatchOpenAgentChat(status.agentId, sessionKey, {
      runtime,
      runtimeUnavailable,
      hiring: status.state === "hiring",
    });
  }, [identities, markSidebarSessionRead]);

  const openSidebarCronJob = useCallback((status: AgentStatus, cronJobId: string) => {
    const runtime = identities.get(status.agentId)?.runtime || status.runtime;
    const runtimeUnavailable = runtime ? unavailableRuntimesRef.current.has(runtime) : false;
    setActiveAgentId(status.agentId);
    setActiveSessionKey(null);
    setActiveCronKey(`${status.agentId}:${cronJobId}`);
    setLastSeenLocal(status.agentId, Date.now());
    // Resolve the latest run's session key so chat-only surfaces can open the session directly
    const jobRuns = (sidebarCronRuns[status.agentId] ?? {})[cronJobId] ?? [];
    const latestRun = jobRuns.length > 0
      ? [...jobRuns].sort((a, b) => cronRunActivityTs(b) - cronRunActivityTs(a))[0]
      : undefined;
    const cronSessionKey = latestRun?.sessionId;
    // Mark this job's latest run as seen so the row can switch from dot → timeAgo
    if (latestRun) {
      const seenTs = latestRun.runAtMs || latestRun.ts;
      const key = cronSeenKey(status.agentId, cronJobId);
      setCronSeenMap((prev) => {
        const next = { ...prev, [key]: seenTs };
        setCronSeenLocal(next);
        return next;
      });
    }
    dispatchOpenAgentPanel(status.agentId, cronSessionKey, {
      sessionCount: status.sessionCount,
      unreadCount: status.unreadCount,
      lastSeenTs: status.lastSeenTs,
      runtime,
      runtimeUnavailable,
      hiring: status.state === "hiring",
      cronJobId,
    });
  }, [identities, sidebarCronRuns]);

  // Click handler: open the agent panel (unread is NOT cleared here — cleared when session is opened)
  const handleAgentClick = useCallback((agentId: string) => {
    const current = statusesRef.current.find((s) => s.agentId === agentId);
    const sessionCount = current?.sessionCount ?? 0;
    const unreadCount = current?.unreadCount ?? 0;
    const lastSeenTs = current?.lastSeenTs ?? 0;
    const runtime = current?.runtime;
    const hiring = current?.state === "hiring";
    const runtimeUnavailable = runtime ? unavailableRuntimesRef.current.has(runtime) : false;

    setActiveAgentId(agentId);
    setActiveCronKey(null);
    dispatchOpenAgentPanel(agentId, undefined, { sessionCount, unreadCount, lastSeenTs, runtime, runtimeUnavailable, hiring });
  }, []);

  // Decrement unread per session opened; persist + zero out when clearAll is true.
  // Session-level reads are localStorage-backed so hard reloads do not mark
  // already-opened sessions unread again.
  useEffect(() => {
    const handler = (e: Event) => {
      const { agentId, sessionKey, clearAll } = (e as CustomEvent<{
        agentId: string;
        sessionKey?: string;
        clearAll?: boolean;
      }>).detail ?? {};
      if (!agentId) return;
      const ts = Date.now();
      if (sessionKey) {
        markSidebarSessionRead(agentId, sessionKey, ts);
        bridgeInvoke("set-agent-last-seen", { agentId, ts, msgText: "" }).catch(() => {
          // Local session read state is the source of truth for sidebar rows.
        });
      }
      setStatuses((prev) => prev.map((s) => {
        if (s.agentId !== agentId) return s;
        if (clearAll) {
          const lastMsg = s.recentMessages[0]; // newest message
          bridgeInvoke("set-agent-last-seen", { agentId, ts, msgText: lastMsg || "" }).catch(() => {
            setLastSeenLocal(agentId, ts, lastMsg);
          });
          return { ...s, unreadCount: 0 };
        }
        if (sessionKey) return s;
        return { ...s, unreadCount: Math.max(0, s.unreadCount - 1) };
      }));
    };
    window.addEventListener(AGENT_READ_EVENT, handler);
    return () => window.removeEventListener(AGENT_READ_EVENT, handler);
  }, [markSidebarSessionRead]);

  // Sync activeSessionKey when an external caller (GatewayChatWidget, new-chat button) opens a session
  useEffect(() => {
    const handler = (e: Event) => {
      const { agentId, sessionKey } = (e as CustomEvent<{ agentId: string; sessionKey?: string }>).detail ?? {};
      if (!agentId) return;
      setActiveAgentId(agentId);
      setActiveSessionKey(sessionKey ?? null);
      setActiveCronKey(null);
    };
    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handler);
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
          const runtimeUnavailable = next.runtime
            ? unavailableRuntimesRef.current.has(next.runtime)
            : false;
          setActiveAgentId(next.agentId);
          dispatchOpenAgentPanel(next.agentId, undefined, {
            sessionCount: next.sessionCount,
            unreadCount: next.unreadCount,
            lastSeenTs: next.lastSeenTs,
            runtime: next.runtime,
            runtimeUnavailable,
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
    const onDeleteFailed = (e: Event) => {
      const { agentId } = (e as CustomEvent<{ agentId: string }>).detail ?? {};
      if (!agentId) return;
      setDeletingAgentIds((prev) => { const n = new Set(prev); n.delete(agentId); return n; });
    };
    window.addEventListener("agent.deleting", onDeleting);
    window.addEventListener("agent.deleted", onDeleted);
    window.addEventListener("agent.delete.failed", onDeleteFailed);
    return () => {
      window.removeEventListener("agent.deleting", onDeleting);
      window.removeEventListener("agent.deleted", onDeleted);
      window.removeEventListener("agent.delete.failed", onDeleteFailed);
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
      hiringAgentIdsRef.current = new Set([...hiringAgentIdsRef.current, agentId]);
      setStatuses((prev) => {
        if (prev.some((s) => s.agentId === agentId)) {
          return prev.map((status) =>
            status.agentId === agentId
              ? {
                  ...status,
                  name: name || status.name,
                  state: "hiring",
                  runtime: runtime ?? status.runtime,
                }
              : status,
          );
        }
        return [...prev, {
          agentId,
          name: name || agentId,
          state: "hiring",
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
      // Hired only fires after setup writes complete, so flip the row back to
      // ready immediately, then stagger refreshes to catch SQLite indexing.
      setStatuses((prev) =>
        prev.map((status) =>
          status.agentId === agentId ? { ...status, state: "idle" } : status,
        ),
      );
      setHiringAgentIds((prev) => {
        if (!prev.has(agentId)) return prev;
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
      refresh();
      setTimeout(() => refresh(), 1500);
      setTimeout(() => refresh(), 3500);
      setTimeout(() => {
        setHiringAgentIds((prev) => {
          if (!prev.has(agentId)) return prev;
          const n = new Set(prev);
          n.delete(agentId);
          return n;
        });
      }, 6000);
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

  useEffect(() => {
    const onNewAgent = () => setAddAgentOpen(true);
    window.addEventListener("ensemble:new-agent", onNewAgent);
    return () => window.removeEventListener("ensemble:new-agent", onNewAgent);
  }, []);

  if (isChatSidebarLayout) {
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
            isFocusModeActive && "border-transparent grayscale-[30%]",
            className
          )}
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {props.isEditMode && (
                <div className="cursor-move h-6 w-6 flex items-center justify-center shrink-0">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
              <Activity className="w-3 h-3 text-primary shrink-0" />
              <span className="text-[11px] font-medium text-foreground truncate">
                Agents
              </span>
              {unreadTotal > 0 && (
                <Badge
                  variant="default"
                  className="h-4 px-1.5 text-[10px] font-medium bg-primary text-primary-foreground"
                >
                  {unreadTotal} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="iconSm"
                className="h-6 w-6"
                onClick={() => refresh()}
                disabled={loading}
                title="Refresh agents"
              >
                <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                className="h-6 w-6"
                onClick={() => setAddAgentOpen(true)}
                title="Add agent"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="px-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents"
                className="w-full h-7 pl-6 pr-2 rounded-md bg-muted/40 border border-border/30 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-0 pb-2">
            {loading && statuses.length === 0 ? (
              <div className="space-y-1 px-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-md border border-solid border-border/40 animate-pulse" />
                ))}
              </div>
            ) : error && statuses.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 px-4">
                <AlertTriangle className="w-6 h-6 text-destructive/60" />
                <p className="text-xs text-destructive text-center">{error}</p>
                <Button variant="outline" size="sm" className="h-6 text-xs mt-1" onClick={() => refresh()} disabled={loading}>
                  <RefreshCw className={cn("w-3 h-3 mr-1", loading && "animate-spin")} />Retry
                </Button>
              </div>
            ) : filteredStatuses.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
                <Activity className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground text-center">
                  {search.trim() ? "No matching agents" : "No employees yet"}
                </p>
              </div>
            ) : (
              <ScrollArea className={CHAT_SIDEBAR_SCROLL_AREA_CLASS}>
                <div className="box-border w-full max-w-full min-w-0 space-y-1 overflow-hidden px-2 pr-1 [contain:inline-size]">
                  {filteredStatuses.map((status) => {
                    const identity = identities.get(status.agentId);
                    const resolvedAvatarUrl = resolveAvatarUrl(identity?.avatar);
                    const avatarUrl = isCustomImageAvatar(resolvedAvatarUrl) ? resolvedAvatarUrl : undefined;
                    const displayName = identity?.name || status.name || status.agentId;
                    const runtime = identity?.runtime || status.runtime;
                    const visualState: AgentState = deletingAgentIds.has(status.agentId)
                      ? "deleting"
                      : hiringAgentIds.has(status.agentId)
                        ? "hiring"
                        : status.state;
                    const isOpen = expandedAgentIds.includes(status.agentId);
                    const sessions = filterDirectChatSessions(sidebarSessions[status.agentId] ?? []);
                    const sessionsLoading = Boolean(sidebarSessionLoading[status.agentId]);
                    const jobs = sidebarCrons[status.agentId] ?? [];
                    const cronsLoading = Boolean(sidebarCronLoading[status.agentId]);
                    const isUnavailable = unavailableRuntimes.has(runtime || "");

                    return (
                      <div
                        key={status.agentId}
                        className={cn(
                          "box-border w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-solid border-border/60 bg-background/30 transition-colors",
                          isUnavailable && "opacity-75"
                        )}
                      >
                        {/* Header row: entire row is the expand/collapse target; inner controls stop propagation */}
                        <div
                          className="group box-border flex w-full max-w-full min-w-0 cursor-pointer items-center gap-1 overflow-hidden rounded-t-lg transition-colors hover:bg-muted/30"
                          onClick={() => handleSidebarAccordionToggle(status.agentId)}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSidebarAccordionToggle(status.agentId);
                            }}
                            className="box-border flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left transition-colors"
                            aria-label={`${isOpen ? "Collapse" : "Expand"} ${displayName}`}
                          >
                            <div className={cn("shrink-0 relative", isUnavailable && "grayscale opacity-60")}>
                              <Avatar className="w-7 h-7">
                                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                                <AvatarFallback className="bg-primary/10 text-primary text-[11px] select-none">
                                  {identity?.emoji
                                    ? <span className="leading-[0]">{identity.emoji}</span>
                                    : <span className="leading-[0]">{agentInitials(displayName, status.agentId)}</span>
                                  }
                                </AvatarFallback>
                              </Avatar>
                              {status.unreadCount > 0 && visualState !== "running" && activeAgentId !== status.agentId && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 border border-card flex items-center justify-center text-[8px] font-normal text-white leading-none">
                                  {status.unreadCount >= 99 ? "99+" : status.unreadCount}
                                </span>
                              )}
                              <AgentRowStatusDot agentId={status.agentId} baseState={visualState} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-normal text-foreground">
                                  {displayName}
                                </span>
                                {visualState === "running" && (
                                  <span className="shrink-0 text-[9px] text-emerald-500 border border-emerald-500/30 rounded px-1 py-px leading-none">
                                    Running
                                  </span>
                                )}
                                {visualState === "hiring" && (
                                  <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none">
                                    Hiring
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-[10px] text-muted-foreground/55">
                                {status.lastActivity ? timeAgo(status.lastActivity) : runtime || "openclaw"}
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAgentProfile(status.agentId);
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                            aria-label={`View ${displayName} profile`}
                            title={`View ${displayName} profile`}
                          >
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                                aria-label={`Add for ${displayName}`}
                                title={`Add chat or cron for ${displayName}`}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-40 z-[80]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DropdownMenuItem
                                className="gap-2 text-[11px]"
                                onClick={(e) => e.stopPropagation()}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setActiveAgentId(status.agentId);
                                  dispatchOpenAgentChat(status.agentId, undefined, {
                                    runtime,
                                    runtimeUnavailable: isUnavailable,
                                    hiring: visualState === "hiring",
                                    newChat: true,
                                  });
                                }}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                New chat
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2 text-[11px]"
                                onClick={(e) => e.stopPropagation()}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setAddCronDefaults({ agentId: status.agentId, runtime });
                                }}
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                                New cron job
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="box-border w-full max-w-full min-w-0 overflow-hidden"
                            >
                              <div className="box-border w-full max-w-full min-w-0 overflow-hidden border-t border-border/50">
                              <div className="box-border w-full max-w-full min-w-0 overflow-hidden space-y-3 px-2.5 py-2.5">
                                <section className="box-border w-full max-w-full min-w-0 overflow-hidden space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-normal uppercase tracking-[0.14em] text-muted-foreground/60">
                                      All chats
                                    </p>
                                  </div>
                                  {sessionsLoading ? (
                                    <div className="space-y-1">
                                      {[0, 1, 2].map((i) => (
                                        <div key={i} className="h-8 rounded-md bg-muted/40 animate-pulse" />
                                      ))}
                                    </div>
                                  ) : sessions.length === 0 ? (
                                    <p className="rounded-md border border-dashed border-border/60 px-2 py-2 text-[11px] text-muted-foreground/55">
                                      No chats yet.
                                    </p>
                                  ) : (
                                    <div className="box-border w-full max-w-full min-w-0 space-y-0.5 overflow-hidden">
                                      {(() => {
                                        const showAll = sidebarSessionsShowAll[status.agentId] ?? false;
                                        const visibleSessions = showAll ? sessions : sessions.slice(0, 6);
                                        const remainingCount = sessions.length - 6;
                                        return (
                                          <>
                                            {visibleSessions.map((session) => {
                                              const readTs = sessionReadMap[readSessionKey(status.agentId, session.key)] ?? status.lastSeenTs;
                                              const isUnread = Boolean(session.updatedAt && session.updatedAt > readTs);
                                              const isSessionRunning =
                                                isRunningSessionStatus(session.status) ||
                                                workingSessionKeys.has(session.key);
                                              const hasTrailing = isSessionRunning || isUnread || Boolean(session.updatedAt);
                                              return (
                                                <button
                                                  key={session.key}
                                                  type="button"
                                                  onClick={() => openSidebarChatSession(status, session.key)}
                                                  className={cn(
                                                    "box-border w-full max-w-full min-w-0 rounded-md px-2 py-1.5 text-left font-normal transition-colors hover:bg-muted/30",
                                                    activeAgentId === status.agentId && activeSessionKey === session.key && "bg-muted/50",
                                                    isSessionRunning && "hover:bg-amber-400/10",
                                                    hasTrailing
                                                      ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
                                                      : "block",
                                                  )}
                                                >
                                                  <span className={cn(
                                                    "block min-w-0 truncate text-[11px] font-normal",
                                                    isSessionRunning
                                                      ? "text-amber-700 dark:text-amber-300"
                                                      : isUnread
                                                        ? "text-foreground"
                                                        : "text-foreground/70",
                                                  )}>
                                                    {sessionDisplayTitle(session)}
                                                  </span>
                                                  {isSessionRunning ? (
                                                    <span className="mt-1.5 flex w-2 shrink-0 justify-center">
                                                      <span className="relative flex h-2 w-2">
                                                        <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                                                      </span>
                                                    </span>
                                                  ) : !isUnread && session.updatedAt ? (
                                                    <span className="shrink-0 pt-0.5 text-[9px] text-muted-foreground/45">
                                                      {timeAgo(session.updatedAt)}
                                                    </span>
                                                  ) : null}
                                                  {!isSessionRunning && isUnread && (
                                                    <span className="mt-1.5 flex w-2 shrink-0 justify-center">
                                                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                                    </span>
                                                  )}
                                                </button>
                                              );
                                            })}
                                            {!showAll && remainingCount > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => setSidebarSessionsShowAll((prev) => ({ ...prev, [status.agentId]: true }))}
                                                className="box-border w-full max-w-full min-w-0 overflow-hidden rounded-md px-2 py-1 text-left text-[10px] font-normal text-muted-foreground/50 transition-colors hover:text-muted-foreground/80"
                                              >
                                                {remainingCount} more
                                              </button>
                                            )}
                                          </>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </section>

                                <section className="box-border w-full max-w-full min-w-0 overflow-hidden space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-normal uppercase tracking-[0.14em] text-muted-foreground/60">
                                      Cron jobs
                                    </p>
                                    <span className="text-[9px] text-muted-foreground/45">
                                      {jobs.length ? `${jobs.length}` : ""}
                                    </span>
                                  </div>
                                  {cronsLoading ? (
                                    <div className="space-y-1">
                                      {[0, 1].map((i) => (
                                        <div key={i} className="h-10 rounded-md bg-muted/40 animate-pulse" />
                                      ))}
                                    </div>
                                  ) : jobs.length === 0 ? (
                                    <p className="rounded-md border border-dashed border-border/60 px-2 py-2 text-[11px] text-muted-foreground/55">
                                      No cron jobs for this agent.
                                    </p>
                                  ) : (
                                    <div className="box-border w-full max-w-full min-w-0 space-y-0.5 overflow-hidden">
                                      {jobs.map((job) => {
                                        const cronRuns = sidebarCronRuns[status.agentId] ?? {};
                                        const runs = (cronRuns[job.id] ?? []).slice().sort((a, b) => cronRunActivityTs(b) - cronRunActivityTs(a));
                                        const latestRun = runs[0];
                                        const rawStatus = job.state?.lastStatus ?? latestRun?.status ?? "";
                                        const ls = rawStatus.toLowerCase();
                                        const isRunning =
                                          cronStatusIsRunning(job.state?.lastStatus) ||
                                          cronStatusIsRunning(job.state?.lastRunStatus) ||
                                          cronStatusIsRunning((job as Record<string, unknown>).status) ||
                                          cronStatusIsRunning(latestRun?.status);
                                        const isSuccess = !isRunning && ["ok", "success", "completed", "done"].includes(ls);
                                        const isError = !isRunning && ["error", "failed", "aborted"].includes(ls);
                                        const isDisabled = !job.enabled;
                                        // Read/unread semantics:
                                        // latestRunTs: canonical timestamp for the most recent run
                                        const latestRunTs = Math.max(
                                          latestRun ? cronRunActivityTs(latestRun) : 0,
                                          getCronJobActivityTs(job),
                                          cronSessionActivityTs(sidebarSessions[status.agentId] ?? [], job.id),
                                        );
                                        const seenTs = cronSeenMap[cronSeenKey(status.agentId, job.id)] ?? 0;
                                        // A run is "seen" once the user has clicked the row (seenTs === the run's ts)
                                        // Running is always shown as unseen/active dot — never show text while running
                                        const isCronSeen = !isRunning && latestRunTs > 0 && seenTs >= latestRunTs;
                                        const hasTrailing = isRunning || isSuccess || isError || isDisabled;
                                        return (
                                          <button
                                            key={job.id}
                                            type="button"
                                            onClick={() => openSidebarCronJob(status, job.id)}
                                            className={cn(
                                              "box-border w-full min-w-0 max-w-full overflow-hidden rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/30",
                                              // Highlight the selected cron row — does NOT touch dot color
                                              activeCronKey === `${status.agentId}:${job.id}` && "bg-muted/30",
                                              hasTrailing ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" : "block",
                                            )}
                                          >
                                            <span className="block min-w-0 truncate text-[11px] font-normal text-foreground/70">
                                              {job.name}
                                            </span>
                                            {hasTrailing && (
                                              <span className="flex shrink-0 items-center gap-1">
                                                {isCronSeen ? (
                                                  <span className="shrink-0 text-[9px] text-muted-foreground/45">
                                                    {timeAgo(latestRunTs)}
                                                  </span>
                                                ) : (
                                                  <span className={cn(
                                                    "h-1.5 w-1.5 shrink-0 rounded-full",
                                                    isRunning && "bg-yellow-400",
                                                    isSuccess && "bg-green-500",
                                                    isError && "bg-red-500",
                                                    !isRunning && !isSuccess && !isError && "bg-muted-foreground/35",
                                                  )} />
                                                )}
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </section>
                              </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </Card>

        <AddAgentDialog
          open={addAgentOpen}
          onOpenChange={setAddAgentOpen}
        />
        <CronsProvider>
          <AddCronDialog
            key={`${addCronDefaults?.agentId ?? "none"}:${addCronDefaults?.runtime ?? "openclaw"}`}
            open={Boolean(addCronDefaults)}
            onOpenChange={(open) => {
              if (!open) setAddCronDefaults(null);
            }}
            defaultAgent={addCronDefaults?.agentId}
            defaultRuntime={addCronDefaults?.runtime}
            onSuccess={() => {
              if (!addCronDefaults) return;
              const status = statusesRef.current.find((item) => item.agentId === addCronDefaults.agentId);
              if (status) void loadSidebarAgentData(status, true);
            }}
          />
        </CronsProvider>
      </motion.div>
    );
  }

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
          isFocusModeActive && "border-transparent grayscale-[30%]",
          className
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
              onClick={() => { setActiveTab("agents"); setSearch(""); }}
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
              onClick={() => { setActiveTab("projects"); setSearch(""); }}
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
              onClick={() => { setActiveTab("inbox"); setSearch(""); }}
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
          <div className="flex items-center gap-1 shrink-0">
            <ConnectorStatusIndicator />
          </div>
        </div>

        {/* Search bar — shown on agents and projects tabs */}
        {activeTab !== "inbox" && (
          <div className="px-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={activeTab === "agents" ? "Search agents" : "Search projects"}
                className="w-full h-7 pl-6 pr-2 rounded-md bg-muted/40 border border-border/30 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-colors"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-0 pb-2">
          {activeTab === "projects" ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between px-2 pb-2 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  {projects.length} project{projects.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void syncTeamMode()}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    {teamModeSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Team
                  </button>
                  <button
                    onClick={() => setCreateProjectOpen(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    New
                  </button>
                </div>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                {projectsLoading ? (
                  <div className="space-y-0.5 pr-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-2">
                        <div className="w-5 h-5 rounded bg-muted/50 animate-pulse shrink-0" />
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <div className="h-2.5 rounded bg-muted/50 animate-pulse" style={{ width: `${40 + (i % 3) * 15}%` }} />
                          {i % 2 === 0 && (
                            <div className="h-2 rounded bg-muted/40 animate-pulse" style={{ width: `${55 + (i % 2) * 10}%` }} />
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="w-4 h-2 rounded bg-muted/40 animate-pulse" />
                          <div className="w-3 h-3 rounded bg-muted/40 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <FolderOpen className="w-6 h-6 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground/60">
                      {search.trim() ? "No matching projects" : "No projects yet"}
                    </p>
                    {!search.trim() && (
                      <button
                        onClick={() => setCreateProjectOpen(true)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Create your first project
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0.5 pr-1">
                    {filteredProjects.map((p) => (
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
                <div className="space-y-1 pr-1 px-0.5 pt-0.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-2.5 rounded-md border border-border/30 bg-card/40">
                      <div className="flex items-start gap-2">
                        <div className="w-3.5 h-3.5 rounded bg-muted/50 animate-pulse shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 rounded bg-muted/50 animate-pulse" style={{ width: `${50 + (i % 3) * 12}%` }} />
                            <div className="flex-1" />
                            <div className="h-2 w-10 rounded bg-muted/40 animate-pulse" />
                          </div>
                          {i % 2 !== 0 && (
                            <div className="h-2 rounded bg-muted/40 animate-pulse" style={{ width: `${65 + (i % 2) * 10}%` }} />
                          )}
                          <div className="h-2 rounded bg-muted/40 animate-pulse w-3/4" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : inboxItems.length === 0 && orphanedRuntimes.length === 0 && orphanedAgents.length === 0 && needsAuthRuntimes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Inbox className="w-6 h-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/60">Inbox is clear</p>
                  <p className="text-[10px] text-muted-foreground/40">Agent requests will appear here</p>
                </div>
              ) : (
                <div className="space-y-1 pr-1">
                  {/* Orphaned runtime cleanup items */}
                  {orphanedRuntimes.map((orphan) => {
                    const runtimeName = RUNTIME_NAMES[orphan.runtime] || orphan.runtime;
                    const isProcessing = orphanProcessing === orphan.runtime;
                    const RuntimeIcon = getRuntimeIcon(orphan.runtime);
                    return (
                      <div
                        key={`orphan-${orphan.runtime}`}
                        className="p-2.5 rounded-md border border-amber-500/30 bg-amber-500/5"
                      >
                        <div className="flex items-start gap-2">
                          <div className="shrink-0 mt-0.5">
                            {RuntimeIcon ? (
                              <RuntimeIcon className="w-4 h-4 text-amber-500" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground truncate">
                                {runtimeName} uninstalled
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                              {orphan.agentCount} {runtimeName} agent{orphan.agentCount !== 1 ? "s" : ""} still in database.
                              {" "}Delete all {runtimeName} agents?
                            </p>
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              <button
                                onClick={() => handleOrphanExportAndDelete(orphan.runtime)}
                                disabled={isProcessing}
                                className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                              >
                                {isProcessing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                Export & Delete All
                              </button>
                              <button
                                onClick={() => handleOrphanDeleteOnly(orphan.runtime)}
                                disabled={isProcessing}
                                className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                              >
                                Delete All
                              </button>
                              <button
                                onClick={() => handleOrphanDismiss(orphan.runtime)}
                                disabled={isProcessing}
                                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted/30 transition-colors ml-auto disabled:opacity-50"
                              >
                                Keep
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Orphaned agents (workspace deleted but still in DB) */}
                  {orphanedAgents.length > 0 && (
                    <div className="p-2.5 rounded-md border border-amber-500/30 bg-amber-500/5">
                      <div className="flex items-start gap-2">
                        <div className="shrink-0 mt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground truncate">
                              {orphanedAgents.length} orphaned agent{orphanedAgents.length !== 1 ? "s" : ""} found
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                            These agents were deleted but still exist in the database.
                          </p>
                          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {orphanedAgents.map((agent) => {
                              const isProcessing = orphanedAgentProcessing === agent.id;
                              const RuntimeIcon = getRuntimeIcon(agent.runtime);
                              return (
                                <div
                                  key={`orphan-agent-${agent.id}`}
                                  className="flex items-center justify-between gap-2 py-1 px-1.5 rounded bg-background/50"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {RuntimeIcon && <RuntimeIcon className="w-3 h-3 text-muted-foreground shrink-0" />}
                                    <span className="text-[11px] truncate">{agent.name || agent.id}</span>
                                    <span className="text-[10px] text-muted-foreground/60">({agent.runtime})</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => handleOrphanedAgentDelete(agent.id)}
                                      disabled={isProcessing}
                                      className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                                    >
                                      {isProcessing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Delete"}
                                    </button>
                                    <button
                                      onClick={() => handleOrphanedAgentDismiss(agent.id)}
                                      disabled={isProcessing}
                                      className="px-1 py-0.5 rounded text-[9px] text-muted-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                                    >
                                      Keep
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Bulk actions by runtime */}
                          {(() => {
                            const runtimeCounts = orphanedAgents.reduce((acc, a) => {
                              acc[a.runtime] = (acc[a.runtime] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>);
                            const runtimes = Object.keys(runtimeCounts);
                            if (runtimes.length === 0) return null;
                            return (
                              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50 flex-wrap">
                                {runtimes.map((runtime) => (
                                  <button
                                    key={runtime}
                                    onClick={() => handleOrphanedAgentDeleteAllByRuntime(runtime)}
                                    disabled={orphanedAgentProcessing === runtime}
                                    className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                                  >
                                    {orphanedAgentProcessing === runtime && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                    Delete all {RUNTIME_NAMES[runtime] || runtime} ({runtimeCounts[runtime]})
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Runtimes needing authentication */}
                  {needsAuthRuntimes.map((runtimeStatus) => {
                    const runtimeName = RUNTIME_NAMES[runtimeStatus.runtime] || runtimeStatus.runtime;
                    const RuntimeIcon = getRuntimeIcon(runtimeStatus.runtime);
                    const loginCmd = runtimeStatus.runtime === "codex" ? "codex login" : `${runtimeStatus.runtime} login`;
                    return (
                      <div
                        key={`auth-${runtimeStatus.runtime}`}
                        className="p-2.5 rounded-md border border-amber-500/30 bg-amber-500/5"
                      >
                        <div className="flex items-start gap-2">
                          <div className="shrink-0 mt-0.5">
                            {RuntimeIcon ? (
                              <RuntimeIcon className="w-4 h-4 text-amber-500" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground truncate">
                                {runtimeName} login needed
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                              Run <code className="px-1 py-0.5 bg-muted/50 rounded text-[10px] font-mono">{loginCmd}</code> in your terminal to authenticate.
                            </p>
                            <div className="flex items-center gap-1 mt-1.5">
                              <button
                                onClick={() => syncTeamMode()}
                                disabled={teamModeSyncing}
                                className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                              >
                                {teamModeSyncing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                Check Again
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Regular inbox items */}
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
                <div className="flex-1 overflow-hidden">
                  <div className="space-y-0.5 pr-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-2.5 py-2">
                        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-muted/50 animate-pulse" />
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-0.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 rounded bg-muted/50 animate-pulse" style={{ width: `${45 + (i % 3) * 15}%` }} />
                            <div className="flex-1" />
                            <div className="h-2 w-8 rounded bg-muted/40 animate-pulse" />
                          </div>
                          <div className="h-2 rounded bg-muted/40 animate-pulse" style={{ width: `${60 + (i % 4) * 8}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : error && statuses.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
                  <AlertTriangle className="w-6 h-6 text-destructive/60" />
                  <p className="text-xs text-destructive text-center max-w-[200px]">{error}</p>
                  <Button variant="outline" size="sm" className="h-6 text-xs mt-1" onClick={() => refresh()} disabled={loading}>
                    <RefreshCw className={cn("w-3 h-3 mr-1", loading && "animate-spin")} />Retry
                  </Button>
                </div>
              ) : filteredStatuses.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
                  <Activity className="w-6 h-6 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground text-center">
                    {search.trim() ? "No matching agents" : "No employees yet"}
                  </p>
                </div>
              ) : (
                <ScrollArea className="flex-1 min-h-0 w-full min-w-0">
                  <div className="space-y-0.5 pr-1 w-full min-w-0 overflow-hidden">
                    <AnimatePresence mode="popLayout">
                      {filteredStatuses.map((status) => (
                        <AgentExpandedRow
                          key={status.agentId}
                          status={status}
                          identity={identities.get(status.agentId)}
                          onClick={handleAgentClick}
                          isActive={activeAgentId === status.agentId}
                          isHiring={hiringAgentIds.has(status.agentId) || status.state === "hiring"}
                          isDeleting={deletingAgentIds.has(status.agentId)}
                          isUnavailable={unavailableRuntimes.has(status.runtime || "")}
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
  const { className } = props;
  return (
    <ProjectsProvider>
      <StatusWidgetContent className={className} {...props} />
    </ProjectsProvider>
  );
});

StatusWidget.displayName = "StatusWidget";

export default StatusWidget;
