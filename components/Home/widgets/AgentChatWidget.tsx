"use client";

import React, { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/router";
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
  Check,
  X,
  Database,
  ArrowUpRight,
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
import { ClaudeCodeIcon, CodexIcon, HermesIcon, OpenClawIcon } from "$/components/Onboarding/RuntimeIcons";
import {
  InfoTab,
  FileEditorTab,
  type FooterSaveState,
} from "$/components/Tool/Agents/AgentDetailDialog";
import { DeleteAgentDialog } from "$/components/Tool/Agents/DeleteAgentDialog";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import {
  CLEAR_AGENT_CHAT_EVENT,
  PanelChatView,
  type PanelChatViewHandle,
} from "./AgentChatPanel";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import { OPEN_AGENT_CHAT_EVENT, AGENT_READ_EVENT } from "./StatusWidget";
import { OPEN_AGENT_PANEL_EVENT } from "./AgentChatPanel";
import type { BackendTab } from "./gateway-chat/GatewayChatHeader";
import AgentStatsTab from "./AgentStatsTab";
import AgentOverviewTab from "./AgentOverviewTab";
import { AgentSkillsTab } from "./AgentSkillsTab";
import { AgentMcpsTab } from "./AgentMcpsTab";
// Crons imports - using direct bridge fetch instead of global provider
import { CronsProvider } from "$/components/Tool/Crons/provider/cronsProvider";
import { AddCronDialog } from "$/components/Tool/Crons/AddCronDialog";
import { EditCronDialog } from "$/components/Tool/Crons/EditCronDialog";
import { getJobPalette, getStatusColor } from "$/components/Tool/Crons/utils";
import { formatDistanceToNow } from "date-fns";
import type { OpenClawCronJobJson } from "$/types/electron";
import { ProjectsProvider, useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { ProjectPanel } from "./ProjectPanel";
import { OPEN_PROJECT_PANEL_EVENT } from "./ProjectWidgetEvents";
import { StatusDot, normalizeAgentState, useAgentStatus } from "$/components/ensemble";
import {
  MEMORY_SEARCH_CONFIG_KEYS,
  MEMORY_SEARCH_PROVIDERS,
  resolveMemorySearchSettings,
  unwrapOpenClawConfigValue,
} from "./openclaw-memory-search";

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

/* ── Tab definitions ──────────────────────────────────────── */

const TAB_FILES = [
  { key: "SOUL",      label: "Soul",      desc: "Personality & behavior" },
  { key: "IDENTITY",  label: "Identity",  desc: "Agent identity — name, emoji, avatar" },
  { key: "USER",      label: "User",      desc: "Context about the human" },
  { key: "AGENTS",    label: "Agents",    desc: "Team awareness" },
  { key: "TOOLS",     label: "Tools",     desc: "Agent tool context and built-in Hyperclaw actions" },
  { key: "HEARTBEAT", label: "Heartbeat", desc: "Periodic tasks & work schedule" },
  { key: "MEMORY",    label: "Memory",    desc: "Persistent memory" },
] as const;

type FileTabKey = (typeof TAB_FILES)[number]["key"];
type WidgetTab = "CHAT" | "OVERVIEW" | "INFO" | "FILES" | "CRONS" | "SKILLS" | "MCPS";
type WidgetMode = "agent" | "project";

const BACKEND_TABS = new Set<BackendTab>(["openclaw", "claude-code", "codex", "hermes"]);

function parseBackendTab(value: unknown): BackendTab | undefined {
  return typeof value === "string" && BACKEND_TABS.has(value as BackendTab)
    ? (value as BackendTab)
    : undefined;
}

/* ── Agent Crons Tab ──────────────────────────────────────── */

/**
 * Fetches and displays cron jobs for a specific agent.
 * Fetches directly from the bridge with agentId filter instead of using the global CronsProvider.
 * This ensures we only load crons for this agent.
 */
export function AgentCronsTab({ agentId, runtime }: { agentId: string; runtime?: string }) {
  const [jobs, setJobs] = useState<OpenClawCronJobJson[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<OpenClawCronJobJson | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningJobIds, setRunningJobIds] = useState<string[]>([]);

  // Fetch crons filtered by agentId
  const fetchAgentCrons = useCallback(async () => {
    setLoading(true);
    try {
      const { fetchCronsFromBridge } = await import("$/components/Tool/Crons/utils");
      const data = await fetchCronsFromBridge({ agentId, runtime });
      setJobs(data);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, runtime]);

  useEffect(() => {
    fetchAgentCrons();
  }, [fetchAgentCrons]);

  // Sort jobs: running first, then by last run time
  const sortedJobs = useMemo(() => {
    const running: OpenClawCronJobJson[] = [];
    const rest: OpenClawCronJobJson[] = [];
    for (const j of jobs) {
      if (runningJobIds.includes(j.id)) running.push(j);
      else rest.push(j);
    }
    rest.sort((a, b) => (b.state?.lastRunAtMs ?? 0) - (a.state?.lastRunAtMs ?? 0));
    return [...running, ...rest];
  }, [jobs, runningJobIds]);

  const handleDelete = useCallback(async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setDeletingId(jobId);
    try {
      const { cronDelete } = await import("$/components/Tool/Crons/utils");
      const result = await cronDelete(jobId);
      if (result.success) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleAddSuccess = useCallback(() => {
    setAddOpen(false);
    fetchAgentCrons();
  }, [fetchAgentCrons]);

  const handleEditClose = useCallback((open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setSelectedJob(null);
      fetchAgentCrons(); // Refresh after edit
    }
  }, [fetchAgentCrons]);

  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <CronsProvider>
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground">
          {sortedJobs.length} job{sortedJobs.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={fetchAgentCrons} title="Refresh">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => setAddOpen(true)} title="Add cron job">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {sortedJobs.length === 0 ? (
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
            {sortedJobs.map((job, i) => {
              const nextRunMs = job.state?.nextRunAtMs;
              const nextRunStr = nextRunMs ? formatDistanceToNow(new Date(nextRunMs), { addSuffix: true }) : "—";
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
        defaultRuntime={runtime}
        onSuccess={handleAddSuccess}
      />
      <EditCronDialog
        job={selectedJob}
        open={editOpen}
        onOpenChange={handleEditClose}
      />
    </CronsProvider>
  );
}

/* ── Empty state onboarding ────────────────────────────────── */

interface RuntimeCardProps {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  installed: boolean;
  onAdd: () => void;
}

function RuntimeCard({ id, label, description, icon, installed, onAdd }: RuntimeCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onAdd}
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border text-left transition-colors w-full",
        "bg-card/50 hover:bg-card/80 border-border/50 hover:border-primary/30"
      )}
    >
      <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">{label}</h4>
          {!installed && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
              Not installed
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
      </div>
    </motion.button>
  );
}

interface EmptyAgentsStateProps {
  onAddAgent: (runtime?: string) => void;
}

function EmptyAgentsState({ onAddAgent }: EmptyAgentsStateProps) {
  const [runtimeStatus, setRuntimeStatus] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectorAvailable, setConnectorAvailable] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await bridgeInvoke("list-available-runtimes", {}) as {
          runtimes?: Array<{ name: string; available: boolean }>;
        };
        const status: Record<string, boolean> = {};
        for (const rt of result?.runtimes ?? []) {
          status[rt.name] = rt.available;
        }
        setRuntimeStatus(status);
        setConnectorAvailable(true);
      } catch {
        // Connector not available - don't show install status
        setRuntimeStatus(null);
        setConnectorAvailable(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runtimes = [
    {
      id: "claude-code",
      label: "Claude Code",
      description: "Anthropic's agentic coding assistant. Works in any directory with custom instructions and memory.",
      icon: <ClaudeCodeIcon className="w-5 h-5" />,
    },
    {
      id: "codex",
      label: "Codex",
      description: "OpenAI's coding agent with sandboxed execution. Great for code generation and automation.",
      icon: <CodexIcon className="w-5 h-5" />,
    },
    {
      id: "hermes",
      label: "Hermes",
      description: "Self-improving agent framework with skill management. Learns and adapts over time.",
      icon: <HermesIcon className="w-5 h-5" />,
    },
    {
      id: "openclaw",
      label: "OpenClaw",
      description: "Multi-channel AI gateway for WhatsApp, Slack, Discord, and more. Connect AI to your messaging apps.",
      icon: <OpenClawIcon className="w-5 h-5" />,
    },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center mb-6"
      >
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Plus className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-base font-semibold mb-1">Add your first agent</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Connect an AI runtime to get started. Each agent can have its own personality and tools.
        </p>
      </motion.div>

      <div className="grid gap-3 w-full max-w-md">
        {runtimes.map((rt, i) => (
          <motion.div
            key={rt.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <RuntimeCard
              {...rt}
              installed={runtimeStatus?.[rt.id] ?? true}
              onAdd={() => onAddAgent(rt.id)}
            />
          </motion.div>
        ))}
      </div>

      {!connectorAvailable ? (
        <p className="text-[10px] text-amber-500 mt-6 text-center max-w-xs">
          Connector offline — install status unavailable. You can still add agents manually.
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground mt-6 text-center max-w-xs">
          Don&apos;t have any installed? Run <code className="px-1 py-0.5 rounded bg-muted text-[10px]">npm i -g @anthropics/claude-code</code> to get started with Claude Code.
        </p>
      )}
    </div>
  );
}

/* ── Widget content ────────────────────────────────────────── */

const AgentChatWidgetContent = memo((props: CustomProps) => {
  const { widget, isEditMode, isMaximized, onMaximize, onConfigChange, className } = props;
  const { isFocusModeActive } = useFocusMode();
  const { agents } = useHyperclawContext();
  const { selectProject } = useProjects();
  const router = useRouter();

  // Persisted config
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const configSessionKey = config?.sessionKey as string | undefined;
  const configBackendTab = parseBackendTab(config?.backendTab);
  const configHideTabs = config?.hideTabs === true;

  // Local state
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(configAgentId);
  const selectedAgentIdRef = useRef<string | undefined>(configAgentId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [widgetMode, setWidgetMode] = useState<WidgetMode>("agent");
  const [backendTab, setBackendTab] = useState<BackendTab>(configBackendTab ?? "openclaw");
  const [activeTab, setActiveTab] = useState<WidgetTab>("CHAT");
  const [selectedFileKey, setSelectedFileKey] = useState<FileTabKey>("SOUL");
  const [footerState, setFooterState] = useState<FooterSaveState>({
    isDirty: false, saving: false, saved: false, save: null,
  });
  // Personality cache keyed by agentId — fetched once per agent switch so
  // file-key tab changes inside the FILES tab are instant with no bridge round-trip.
  const [personalityCache, setPersonalityCache] = useState<Record<string, string> | null>(null);
  const personalityCacheAgentRef = useRef<string | undefined>(undefined);

  // Lazy-mount tabs: only mount when first visited, stay mounted thereafter.
  // Data survives tab switches; explicit refresh remounts via key change.
  const [mountedTabs, setMountedTabs] = useState<Set<WidgetTab>>(new Set(["CHAT"]));
  const [refreshCounter, setRefreshCounter] = useState(0);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean | null>(null);
  const [memoryProvider, setMemoryProvider] = useState<string | null>(null);
  const [memoryToggling, setMemoryToggling] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [addAgentInitialRuntime, setAddAgentInitialRuntime] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // Snapshot captured when the dialog opens — prevents deleting the wrong agent
  // if currentAgentId changes while the confirmation dialog is visible.
  const [pendingDeleteAgentId, setPendingDeleteAgentId] = useState<string>("");
  const chatRef = useRef<PanelChatViewHandle>(null);
  // Keyed by "agentId:backendTab" — avoids refetching when re-opening the same agent
  const sessionsCacheRef = useRef<Map<string, Session[]>>(new Map());
  // Primary session key — resolved from the connector for the current agent
  const [primarySessionKey, setPrimarySessionKey] = useState<string | undefined>();

  // Inbox state
  const [chatView, setChatView] = useState<"inbox" | "chat">("chat");
  const [inboxSessions, setInboxSessions] = useState<Session[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxLastSeenTs, setInboxLastSeenTs] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | undefined>();
  // Per-session read tracking — only sessions in this set show as read in the inbox
  const [readSessions, setReadSessions] = useState<Set<string>>(new Set());
  // Cache of last-assistant-message per session key, fetched lazily when inbox opens
  const [inboxPreviews, setInboxPreviews] = useState<Map<string, string>>(new Map());
  const previewFetchedForRef = useRef<Set<string>>(new Set());

  // Sync config on late hydration and when embedded surfaces (like /Tool/Chat)
  // switch the target agent via props instead of the global open-agent event.
  useEffect(() => {
    if (!configAgentId || configAgentId === selectedAgentIdRef.current) return;
    selectedAgentIdRef.current = configAgentId;
    setSelectedAgentId(configAgentId);
    setPrimarySessionKey(configSessionKey);
    setActiveSessionLabel(undefined);
    setInboxSessions([]);
    setInboxLoading(false);
    setReadSessions(new Set());
    setChatView("chat");
  }, [configAgentId, configSessionKey]);
  useEffect(() => { selectedAgentIdRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => {
    if (configBackendTab) setBackendTab(configBackendTab);
  }, [configBackendTab]);

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
  // agentListRuntime is authoritative for OpenClaw agents — a stale SQLite
  // identity record (e.g. runtime="hermes") must not override it.
  const agentListRuntime = (currentAgent as { runtime?: string }).runtime;
  const effectiveRuntime = agentListRuntime || identity?.runtime;
  const RuntimeIcon = effectiveRuntime === "claude-code" ? ClaudeCodeIcon
    : effectiveRuntime === "codex" ? CodexIcon
    : effectiveRuntime === "hermes" ? HermesIcon
    : null;
  const displayName = identity?.name || currentAgent.name;
  const { state: currentAgentState } = useAgentStatus(currentAgentId, {
    status: (currentAgent as { status?: string }).status,
  });
  const isCurrentAgentDeleting = currentAgentState === "deleting";
  const isCurrentAgentHiring = currentAgentState === "hiring";
  const sendDisabledReason = isCurrentAgentHiring
    ? `${displayName} is still being hired - chat unlocks when setup finishes.`
    : isCurrentAgentDeleting
      ? `${displayName} is being fired - chat is locked.`
      : undefined;

  // Lazily fetch last assistant message for each inbox session
  useEffect(() => {
    if (inboxSessions.length === 0) return;
    const unfetched = inboxSessions.filter((s) => !previewFetchedForRef.current.has(s.key) && !s.preview);
    if (unfetched.length === 0) return;
    unfetched.forEach((s) => previewFetchedForRef.current.add(s.key));

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
            const r = await bridgeInvoke("claude-code-load-history", {
              sessionId,
              agentId: currentAgentId,
              ...(identity?.project ? { projectPath: identity.project } : {}),
            }) as any;
            messages = r?.messages || [];
          } else if (backendTab === "codex") {
            // codex-load-history expects sessionId (without the "codex:" prefix)
            const codexSessionId = s.key.replace(/^codex:/, "");
            const r = await bridgeInvoke("codex-load-history", { sessionId: codexSessionId }) as any;
            messages = r?.messages || [];
          } else if (backendTab === "hermes") {
            // hermes-load-history expects sessionId (without the "hermes:" prefix)
            const hermesSessionId = s.key.replace(/^hermes:/, "").replace(/^agent:[^:]+:/, "");
            const r = await bridgeInvoke("hermes-load-history", { sessionId: hermesSessionId }) as any;
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
    });
  }, [inboxSessions, backendTab, currentAgentId, identity?.project]);

  useEffect(() => {
    if ((isCurrentAgentDeleting || isCurrentAgentHiring) && activeTab === "CHAT") {
      setActiveTab("OVERVIEW");
    }
  }, [activeTab, isCurrentAgentDeleting, isCurrentAgentHiring]);

  // Sync backendTab with the agent's runtime whenever the agent or its
  // identity changes. The agents list (HyperclawProv) is authoritative for
  // OpenClaw agents — always "openclaw" — so prefer it over the SQLite-backed
  // identity cache which can hold stale runtime values for the same agent ID.
  useEffect(() => {
    const runtime = agentListRuntime || identity?.runtime;
    if (!runtime) return;
    const expected: BackendTab =
      runtime === "claude-code" ? "claude-code"
      : runtime === "codex" ? "codex"
      : runtime === "hermes" ? "hermes"
      : "openclaw";
    setBackendTab(expected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgentId, agentListRuntime, identity?.runtime]);

  // Fetch memory search state for OpenClaw agents. Onboarding writes the
  // OpenClaw default memory-search keys, so this menu mirrors that scope.
  useEffect(() => {
    if (effectiveRuntime !== "openclaw") {
      setMemoryEnabled(null);
      setMemoryProvider(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [enabledRes, providerRes] = await Promise.all([
          bridgeInvoke("openclaw-config-get", { key: MEMORY_SEARCH_CONFIG_KEYS.enabled }),
          bridgeInvoke("openclaw-config-get", { key: MEMORY_SEARCH_CONFIG_KEYS.provider }),
        ]);
        if (cancelled) return;
        const settings = resolveMemorySearchSettings({
          enabledValue: unwrapOpenClawConfigValue(enabledRes),
          providerValue: unwrapOpenClawConfigValue(providerRes),
          modelValue: null,
        });
        setMemoryEnabled(settings.enabled);
        setMemoryProvider(settings.provider);
      } catch {
        if (!cancelled) {
          setMemoryEnabled(null);
          setMemoryProvider(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentAgentId, effectiveRuntime]);

  const handleMemoryToggle = useCallback(async () => {
    if (memoryEnabled === null) return;
    const next = !memoryEnabled;
    setMemoryEnabled(next);
    setMemoryToggling(true);
    try {
      if (next && !memoryProvider) {
        const provider = MEMORY_SEARCH_PROVIDERS[0].id;
        await bridgeInvoke("openclaw-config-set", {
          key: MEMORY_SEARCH_CONFIG_KEYS.provider,
          value: provider,
        });
        setMemoryProvider(provider);
      }
      await bridgeInvoke("openclaw-config-set", {
        key: MEMORY_SEARCH_CONFIG_KEYS.enabled,
        value: String(next),
      });
    } catch {
      setMemoryEnabled(!next);
    } finally {
      setMemoryToggling(false);
    }
  }, [memoryEnabled, memoryProvider]);

  // Listen for agent-click events from StatusWidget
  useEffect(() => {
    const handleAgentPanelOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        agentId?: string;
        sessionKey?: string;
        sessionCount?: number;
        unreadCount?: number;
        lastSeenTs?: number;
        runtime?: string;
        runtimeUnavailable?: boolean;
        hiring?: boolean;
      };
      if (!detail?.agentId) return;
      const { agentId, sessionKey, lastSeenTs = 0, unreadCount = 0, runtime, runtimeUnavailable: unavailable = false, hiring = false } = detail;
      const targetAgent = agents.find((agent) => agent.id === agentId);
      const targetIsHiring = hiring || normalizeAgentState((targetAgent as { status?: string } | undefined)?.status) === "hiring";
      const wasSameAgent = selectedAgentIdRef.current === agentId;
      const currentPanelSessionKey = chatRef.current?.selectedSessionKey;
      const tabForRuntime = parseBackendTab(runtime)
        ?? parseBackendTab((targetAgent as { runtime?: unknown } | undefined)?.runtime)
        ?? "openclaw";
      setWidgetMode("agent");
      setSelectedProjectId(undefined);
      setInboxUnreadCount(unreadCount);
      setRuntimeUnavailable(unavailable);

      // Set the correct backend tab immediately so fetchSessions queries the right endpoint
      setBackendTab(tabForRuntime);

      selectedAgentIdRef.current = agentId;
      setSelectedAgentId(agentId);
      // Default to OVERVIEW when the agent is not chat-ready.
      setActiveTab(unavailable || targetIsHiring ? "OVERVIEW" : "CHAT");
      setInboxLastSeenTs(lastSeenTs);
      setActiveSessionLabel(undefined);
      setReadSessions(new Set());

      // Resolve the primary session key from the connector
      if (sessionKey) {
        // Chat surfaces like /Tool/Chat pass an explicit DM key. Do not let the
        // async primary-session lookup switch Hermes to a different historical session.
        setPrimarySessionKey(sessionKey);
        if (wasSameAgent && currentPanelSessionKey && currentPanelSessionKey !== sessionKey) {
          chatRef.current?.onSessionChange(sessionKey);
        }
      } else {
        // Fetch primary session key (non-blocking — chat opens immediately)
        // Guard against stale async resolve when user switches agents quickly
        const resolveForAgentId = agentId;
        setPrimarySessionKey(undefined);
        bridgeInvoke("get-primary-session", { agentId, runtime: tabForRuntime })
          .then((result) => {
            const r = result as { success?: boolean; data?: { sessionKey?: string } };
            if (!r?.success || !r.data?.sessionKey) return;
            // Verify this agent is still the selected one
            if (selectedAgentIdRef.current === resolveForAgentId) {
              setPrimarySessionKey(r.data.sessionKey);
            }
          })
          .catch(() => { /* connector offline — PanelChatView uses its default */ });
      }

      // Check cache for session list (inbox dropdown)
      const cacheKey = `${agentId}:${tabForRuntime}`;
      const cached = sessionsCacheRef.current.get(cacheKey);

      if (cached) {
        setInboxSessions(cached);
        setInboxLoading(false);
        setChatView("chat");
      } else {
        setInboxSessions([]);
        setChatView("chat");
        setInboxLoading(true);
      }
    };

    const handleProjectPanelOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId) return;
      setWidgetMode("project");
      setSelectedProjectId(detail.projectId);
      void selectProject(detail.projectId);
    };

    window.addEventListener(OPEN_AGENT_CHAT_EVENT, handleAgentPanelOpen);
    window.addEventListener(OPEN_AGENT_PANEL_EVENT, handleAgentPanelOpen);
    window.addEventListener(OPEN_PROJECT_PANEL_EVENT, handleProjectPanelOpen);
    return () => {
      window.removeEventListener(OPEN_AGENT_CHAT_EVENT, handleAgentPanelOpen);
      window.removeEventListener(OPEN_AGENT_PANEL_EVENT, handleAgentPanelOpen);
      window.removeEventListener(OPEN_PROJECT_PANEL_EVENT, handleProjectPanelOpen);
    };
  }, [agents, selectProject]);

  // Reset footer state when switching tabs
  useEffect(() => {
    setFooterState({ isDirty: false, saving: false, saved: false, save: null });
  }, [activeTab, currentAgentId]);

  // Expand mounted-tabs set on first visit so the component stays alive across tab switches.
  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
  }, [activeTab]);

  // Reset mounted tabs on agent change — only CHAT and the active tab survive.
  // Other tabs will mount lazily when visited again, fetching for the new agent.
  useEffect(() => {
    setMountedTabs(new Set<WidgetTab>(["CHAT", activeTab]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgentId]);

  // Prefetch personality when FILES tab opens or agent changes — keeps tab switches instant.
  useEffect(() => {
    if (activeTab !== "FILES") return;
    if (personalityCacheAgentRef.current === currentAgentId && personalityCache !== null) return;
    personalityCacheAgentRef.current = currentAgentId;
    setPersonalityCache(null);
    (async () => {
      try {
        const p = (await bridgeInvoke("get-agent-personality", { agentId: currentAgentId })) as Record<string, unknown>;
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
  }, [activeTab, currentAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleAfterFileSave = useCallback((fileKey: string, newContent: string) => {
    setPersonalityCache(prev => prev ? { ...prev, [fileKey]: newContent } : null);
  }, []);

  /** Refresh all mounted data tabs — remounts via key change, clears personality cache. */
  const handleRefreshAll = useCallback(() => {
    setRefreshCounter(c => c + 1);
    personalityCacheAgentRef.current = undefined;
    setPersonalityCache(null);
  }, []);

  /** Stable callback for fetching sessions — prevents infinite loop in SessionHistoryDropdown.
   *  Only shows loading spinner if we don't have cached sessions — otherwise shows stale data
   *  immediately while refreshing in the background (stale-while-revalidate). */
  const handleFetchSessions = useCallback(() => {
    // Only show loading if cache is empty — otherwise show cached sessions immediately
    if (inboxSessions.length === 0) {
      setInboxLoading(true);
    }
    chatRef.current?.fetchSessions();
  }, [inboxSessions.length]);

  useEffect(() => {
    const handleClearCurrentChat = () => {
      if (!configHideTabs && widget.id !== "ensemble-chat") return;
      chatRef.current?.newChat();
      setActiveSessionLabel(undefined);
    };
    window.addEventListener(CLEAR_AGENT_CHAT_EVENT, handleClearCurrentChat);
    return () => window.removeEventListener(CLEAR_AGENT_CHAT_EVENT, handleClearCurrentChat);
  }, [configHideTabs, widget.id]);

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
          isFocusModeActive && "border-transparent grayscale-[30%]",
          className,
        )}
      >
        {widgetMode === "project" ? (
          <ProjectPanel projectId={selectedProjectId} />
        ) : agents.length === 0 ? (
          <EmptyAgentsState
            onAddAgent={(runtime) => {
              setAddAgentInitialRuntime(runtime);
              setAddAgentOpen(true);
            }}
          />
        ) : (
          <>
        {/* ── Header: avatar + tabs + actions ── */}
        <div className="shrink-0 border-b border-border/50">
          {/* Top row: agent info + maximize */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              {isEditMode ? (
                <div className="cursor-move h-7 w-7 flex items-center justify-center shrink-0">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              ) : null}
              <div className="relative shrink-0">
                <Avatar
                  key={currentAgentId}
                  className={cn("h-8 w-8", runtimeUnavailable && "grayscale opacity-60")}
                  title={runtimeUnavailable ? `${backendTab === "claude-code" ? "Claude Code" : backendTab === "codex" ? "Codex" : backendTab === "hermes" ? "Hermes" : "OpenClaw"} is not installed` : undefined}
                >
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
                <StatusDot state={currentAgentState} size="sm" corner />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-semibold truncate">
                    {activeSessionLabel ?? displayName}
                  </h3>
                  {isCurrentAgentDeleting && (
                    <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none flex items-center gap-0.5">
                      <Loader2 className="w-2 h-2 animate-spin" />Firing
                    </span>
                  )}
                  {isCurrentAgentHiring && (
                    <span className="shrink-0 text-[9px] text-red-400/80 border border-red-400/30 rounded px-1 py-px leading-none flex items-center gap-0.5">
                      <Loader2 className="w-2 h-2 animate-spin" />Hiring
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {activeSessionLabel
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
              {showChatActions && !isCurrentAgentDeleting && !isCurrentAgentHiring && (
                <>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => chatRef.current?.reload()} title="Reload chat">
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => { chatRef.current?.newChat(); setActiveSessionLabel(undefined); }} title="New chat">
                    <Plus className="w-3 h-3" />
                  </Button>
                  <SessionHistoryDropdown
                    sessions={inboxSessions}
                    isLoading={inboxLoading}
                    error={null}
                    currentSessionKey={chatRef.current?.selectedSessionKey}
                    primarySessionKey={primarySessionKey ?? configSessionKey}
                    onLoadSession={(key) => {
                      chatRef.current?.onSessionChange(key);
                      const s = inboxSessions.find((s) => s.key === key);
                      setActiveSessionLabel(s?.label || key.split(":").pop() || key);
                    }}
                    onNewChat={() => { chatRef.current?.newChat(); setActiveSessionLabel(undefined); }}
                    onFetchSessions={handleFetchSessions}
                    newChatLabel="+ New Chat"
                    onSetPrimary={(key) => {
                      const prevKey = primarySessionKey;
                      setPrimarySessionKey(key);
                      bridgeInvoke("set-primary-session", {
                        agentId: currentAgentId,
                        runtime: backendTab,
                        sessionKey: key,
                      }).catch(() => {
                        // Rollback on failure (connector offline)
                        setPrimarySessionKey(prevKey);
                      });
                    }}
                  />
                </>
              )}
              {/* Refresh button — visible on data tabs (overview, runs, skills, MCPs) */}
              {!showChatActions && !isEditorTab && (
                <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={handleRefreshAll} title="Refresh">
                  <RefreshCw className="w-3 h-3" />
                </Button>
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
              {currentAgentId && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-6 w-6"
                  title="View agent profile"
                  onClick={() => router.push(`/Tool/Agent/${currentAgentId}`)}
                >
                  <ArrowUpRight className="w-3 h-3" />
                </Button>
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
                  {effectiveRuntime === "openclaw" && memoryEnabled !== null && (
                    <DropdownMenuItem
                      className="gap-2 text-xs"
                      disabled={memoryToggling}
                      onSelect={(e) => {
                        e.preventDefault();
                        handleMemoryToggle();
                      }}
                    >
                      <Database className="w-3.5 h-3.5" />
                      Memory Search
                      <span className={cn(
                        "ml-auto text-[10px] font-medium",
                        memoryEnabled ? "text-emerald-500" : "text-muted-foreground",
                      )}>
                        {memoryEnabled ? "On" : "Off"}
                      </span>
                    </DropdownMenuItem>
                  )}
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

          {/* Tab row — hidden when embedded as a pure chat surface */}
          {!configHideTabs && <div className="flex items-center gap-0.5 px-3 pb-1 -mb-px overflow-x-auto">
            <button
              onClick={() => !runtimeUnavailable && !isCurrentAgentDeleting && !isCurrentAgentHiring && setActiveTab("CHAT")}
              disabled={runtimeUnavailable || isCurrentAgentDeleting || isCurrentAgentHiring}
              title={
                isCurrentAgentHiring
                  ? "Agent is still hiring - chat unlocks when setup finishes"
                  : isCurrentAgentDeleting
                  ? "Agent is firing - chat is locked"
                  : runtimeUnavailable
                    ? "Runtime not installed"
                    : undefined
              }
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                runtimeUnavailable || isCurrentAgentDeleting || isCurrentAgentHiring
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : activeTab === "CHAT"
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
              onClick={() => setActiveTab("OVERVIEW")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "OVERVIEW"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Overview
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
              Instructions
            </button>
            <button
              onClick={() => setActiveTab("SKILLS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "SKILLS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              Skills
            </button>
            <button
              onClick={() => setActiveTab("MCPS")}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded-md transition-all duration-200 shrink-0",
                activeTab === "MCPS"
                  ? "border-primary text-foreground bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground/70 hover:bg-muted/30"
              )}
            >
              MCPs
            </button>
          </div>}
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* PanelChatView — always mounted so chat history and ref survive tab switches. */}
          <div className={cn(
            "flex-1 min-h-0 flex flex-col",
            activeTab !== "CHAT" && "hidden"
          )}>
            <PanelChatView
              ref={chatRef}
              agentId={currentAgentId}
              initialSessionKey={primarySessionKey ?? configSessionKey}
              backendTab={backendTab}
              onBackendTabChange={setBackendTab}
              showSubHeader={false}
              initialSessions={inboxSessions}
              runtimeUnavailable={runtimeUnavailable}
              sendDisabledReason={sendDisabledReason}
              onSessionsUpdate={(sessions) => {
                setInboxSessions(sessions);
                setInboxLoading(false);
                sessionsCacheRef.current.set(`${currentAgentId}:${backendTab}`, sessions);
              }}
            />
          </div>

          {mountedTabs.has("INFO") && (
            <div className={cn("flex-1 min-h-0 overflow-y-auto customScrollbar2 px-4 py-4", activeTab !== "INFO" && "hidden")}>
              <InfoTab
                key={`info-${refreshCounter}`}
                agentId={currentAgentId}
                identity={identity}
                onStateChange={setFooterState}
              />
            </div>
          )}

          {mountedTabs.has("OVERVIEW") && (
            <div className={cn("flex-1 min-h-0 overflow-y-auto customScrollbar2 px-3 py-3", activeTab !== "OVERVIEW" && "hidden")}>
              <AgentOverviewTab
                key={`overview-${refreshCounter}`}
                agentId={currentAgentId}
                agentRuntime={agentListRuntime || identity?.runtime}
                sessions={inboxSessions.map((s) => ({
                  ...s,
                  preview: s.preview ?? inboxPreviews.get(s.key),
                }))}
                sessionsLoading={inboxLoading}
                lastSeenTs={inboxLastSeenTs}
                readSessions={readSessions}
                unreadCount={inboxUnreadCount}
                onOpenSession={runtimeUnavailable || isCurrentAgentHiring || isCurrentAgentDeleting ? undefined : (key) => {
                  const session = inboxSessions.find((s) => s.key === key);
                  setActiveSessionLabel(session?.label || key);
                  setChatView("chat");
                  setActiveTab("CHAT");
                  chatRef.current?.onSessionChange(key);
                  setReadSessions((prev) => new Set([...prev, key]));
                }}
                onNewChat={runtimeUnavailable || isCurrentAgentHiring || isCurrentAgentDeleting ? undefined : () => {
                  setActiveTab("CHAT");
                  setChatView("chat");
                  chatRef.current?.newChat();
                  setActiveSessionLabel(undefined);
                }}
                runtimeUnavailable={runtimeUnavailable}
              />
            </div>
          )}

          {mountedTabs.has("FILES") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", activeTab !== "FILES" && "hidden")}>
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
                  preloaded={personalityCache ? (personalityCache[selectedFileKey] ?? null) : undefined}
                  onAfterSave={handleAfterFileSave}
                />
              </div>
            </div>
          )}
          {mountedTabs.has("CRONS") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", activeTab !== "CRONS" && "hidden")}>
              <AgentCronsTab key={`crons-${refreshCounter}`} agentId={currentAgentId} runtime={effectiveRuntime} />
            </div>
          )}

          {mountedTabs.has("SKILLS") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", activeTab !== "SKILLS" && "hidden")}>
              <AgentSkillsTab
                key={`skills-${refreshCounter}`}
                agentId={currentAgentId}
                runtime={effectiveRuntime ?? backendTab}
                projectPath={identity?.project}
              />
            </div>
          )}

          {mountedTabs.has("MCPS") && (
            <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", activeTab !== "MCPS" && "hidden")}>
              <AgentMcpsTab key={`mcps-${refreshCounter}`} agentId={currentAgentId} runtime={effectiveRuntime} />
            </div>
          )}

        </div>
          </>
        )}
      </Card>

      <AddAgentDialog
        open={addAgentOpen}
        onOpenChange={(open) => {
          setAddAgentOpen(open);
          if (!open) setAddAgentInitialRuntime(undefined);
        }}
        initialRuntime={addAgentInitialRuntime}
        onSuccess={(id, runtime) => {
            setSelectedAgentId(id);
            if (runtime === "claude-code") setBackendTab("claude-code");
            else if (runtime === "codex") setBackendTab("codex");
            else if (runtime === "hermes") setBackendTab("hermes");
            else setBackendTab("openclaw");
          }}
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
          // If deleting the last agent, reset to agent mode so EmptyAgentsState shows
          if (!next) {
            setWidgetMode("agent");
            setSelectedProjectId(undefined);
            setActiveTab("CHAT");
            setActiveSessionLabel(undefined);
            setInboxSessions([]);
            setReadSessions(new Set());
          }
        }}
        onSuccess={() => { /* context refresh handled by agent.deleted event */ }}
      />
    </motion.div>
  );
});

AgentChatWidgetContent.displayName = "AgentChatWidgetContent";

export const AgentChatCustomHeader = () => null;

const AgentChatWidget = memo((props: CustomProps) => {
  return (
    <ProjectsProvider>
      <AgentChatWidgetContent className={props.className} {...props} />
    </ProjectsProvider>
  );
});

AgentChatWidget.displayName = "AgentChatWidget";

export default AgentChatWidget;
