import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ExternalLink,
  GripVertical,
  Loader2,
  Maximize2,
  Megaphone,
  Minimize2,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  StopCircle,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnimatedThinkingText } from "@OS/AI/components/Chat";
import createMarkdownComponents from "@OS/AI/components/createMarkdownComponents";
import { rehypePlugins } from "@OS/AI/components/rehypeConfig";
import { useFocusMode } from "./hooks/useFocusMode";
import {
  gatewayConnection,
  ChatEventPayload,
  getGatewayConnectionState,
  subscribeGatewayConnection,
} from "$/lib/openclaw-gateway-ws";
import { dispatchOpenAgentChat } from "./StatusWidget";
import { cronRun, fetchCronsFromBridge } from "$/components/Tool/Crons/utils";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

const MAX_BUFFER = 500;

// ── Persistence helpers (reads from connector's cron_announces SQLite table) ──

interface ConnectorAnnounceRow {
  id: number;
  cronId: string;
  agentId?: string;
  sessionKey?: string;
  eventType: string;
  category: string;
  source?: string;
  message: string;
  metadata?: string;
  runId?: string;
  createdAt: number;
}

const STALE_RUNNING_MS = 30 * 60 * 1000; // 30 minutes

function connectorRowToEventEntry(row: ConnectorAnnounceRow): EventEntry {
  let status: RunStatus =
    row.eventType === "running" ? "running"
    : row.eventType === "error" || row.eventType === "aborted" ? "error"
    : "completed";

  // If DB says "running" but it's older than 30 min, treat as completed
  if (status === "running" && Date.now() - row.createdAt > STALE_RUNNING_MS) {
    status = "completed";
  }

  let metadata: Record<string, unknown> | undefined;
  if (row.metadata) {
    try { metadata = JSON.parse(row.metadata); } catch { /* ignore */ }
  }

  return {
    id: `db-${row.id}`,
    runId: row.runId || undefined,
    sessionKey: row.sessionKey || `cron:${row.cronId}`,
    cronId: row.cronId,
    category: (row.category as Category) || "cron",
    source: row.source || row.cronId,
    eventType: row.eventType,
    message: isMeaningfulFinalMessage(row.message) ? row.message : "",
    metadata,
    timestamp: row.createdAt,
    startedAt: row.createdAt,
    status,
  };
}

async function loadPersistedAnnounces(cronIds: string[]): Promise<EventEntry[]> {
  if (cronIds.length === 0) return [];
  try {
    const res = (await bridgeInvoke("get-cron-announces", {
      cronIds,
      limit: MAX_BUFFER,
    })) as { announces?: ConnectorAnnounceRow[] };
    if (!res?.announces?.length) return [];
    return res.announces.map(connectorRowToEventEntry);
  } catch {
    return [];
  }
}

type Category = "agent" | "cron" | "system" | "tool" | "session" | "heartbeat";

const CATEGORY_COLORS: Record<Category, { dot: string }> = {
  agent: { dot: "bg-emerald-400" },
  cron: { dot: "bg-amber-400" },
  system: { dot: "bg-red-400" },
  tool: { dot: "bg-violet-400" },
  session: { dot: "bg-blue-400" },
  heartbeat: { dot: "bg-muted-foreground" },
};

type RunStatus = "running" | "completed" | "error";

interface EventEntry {
  id: string;
  runId?: string;
  sessionKey: string;
  cronId: string;
  category: Category;
  source: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  startedAt: number;
  status: RunStatus;
}

function isMeaningfulFinalMessage(message: string | undefined): boolean {
  if (!message) return false;
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed === "Cron is executing") return false;
  if (trimmed === "Waiting for output...") return false;
  if (trimmed === "Running...") return false;
  if (trimmed === "Completed") return false;
  if (trimmed === "Agent task completed") return false;
  return true;
}

type WidgetConfig = {
  selectedCronIds?: string[];
  soundEnabled?: boolean;
  customTitle?: string;
};

type CronJob = {
  id: string;
  name: string;
  enabled: boolean;
  agentId: string;
  lastStatus?: string;
};

function categorize(sessionKey: string, event: string, payload: Record<string, unknown>): Category {
  if (event === "heartbeat" || event === "tick") return "heartbeat";
  if (event === "sessions.changed") return "session";
  if (event === "presence" || event === "health" || event === "shutdown" || event.startsWith("device.pair")) return "system";
  if (sessionKey?.includes(":cron:") || sessionKey?.startsWith("cron:")) return "cron";
  if (sessionKey?.startsWith("agent:")) return "agent";
  const msg = payload?.message as Record<string, unknown> | undefined;
  if (msg?.role === "tool" || msg?.tool_calls) return "tool";
  return "agent";
}

/** Extract cron job ID from session keys like "agent:{agentId}:cron:{jobId}" or "cron:{jobId}" */
function extractCronJobId(sessionKey: string): string | null {
  const cronMatch = sessionKey?.match(/:cron:([^:]+)/);
  if (cronMatch) return cronMatch[1];
  if (sessionKey?.startsWith("cron:")) return sessionKey.replace(/^cron:/, "");
  return null;
}

function extractAgentId(sessionKey: string): string | null {
  if (!sessionKey?.startsWith("agent:")) return null;
  return sessionKey.split(":")[1] || null;
}

/** Build the correct OpenClaw session key: agent:{agentId}:cron:{cronId} */
function buildCronSessionKey(agentId: string, cronId: string): string {
  return `agent:${agentId}:cron:${cronId}`;
}

/** Extract plain text from a ChatEventPayload.message (which can be a structured object or string). */
function extractTextFromChatMessage(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message === "object") {
    const msg = message as Record<string, unknown>;
    if (Array.isArray(msg.content)) {
      return (msg.content as Array<{ type?: string; text?: string }>)
        .filter((b) => b?.type === "text" && typeof b?.text === "string")
        .map((b) => b.text!)
        .join("");
    }
    if (typeof msg.content === "string") return msg.content;
  }
  return "";
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(ms: number): string {
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)}m`;
  const hr = min / 60;
  return `${hr.toFixed(1)}h`;
}

let audioCtx: AudioContext | null = null;
function playErrorChime() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 440;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {}
}

const STATUS_DOT: Record<RunStatus, string> = {
  running: "bg-amber-400 animate-pulse",
  completed: "bg-emerald-400",
  error: "bg-red-400",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  completed: "Complete",
  error: "Error",
};

const MemoizedReactMarkdown: React.FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.components === nextProps.components
);

const markdownComponents = createMarkdownComponents(false);

const ExecutingPlaceholder: React.FC<{ status: RunStatus }> = memo(({ status }) => (
    <AnimatedThinkingText
      text={status === "error" ? "Run reported an error" : "Executing task..."}
      className="text-[11px] text-muted-foreground"
    />
));
ExecutingPlaceholder.displayName = "ExecutingPlaceholder";

const EventRow: React.FC<{
  entry: EventEntry;
  cronNameMap: Record<string, string>;
  onDeepLink: (entry: EventEntry) => void;
}> = memo(({ entry, cronNameMap, onDeepLink }) => {
  const hasMessage = entry.status !== "running" && entry.message.trim().length > 0 && entry.message !== "Waiting for output...";
  const showExecutingPlaceholder = entry.status === "running";
  const timeLabel = useMemo(() => formatTimestamp(entry.timestamp), [entry.timestamp]);

  const jobId = extractCronJobId(entry.sessionKey);
  const agentId = extractAgentId(entry.sessionKey);
  const displayName = (entry.cronId && cronNameMap[entry.cronId]) || entry.source;

  const handleAbort = useCallback(async () => {
    try {
      await gatewayConnection.abortChat({ sessionKey: entry.sessionKey });
    } catch (err) {
      console.error("[ChannelDashboard] Abort failed:", err);
    }
  }, [entry.sessionKey]);

  const handleRerun = useCallback(async () => {
    if (!jobId) return;
    const result = await cronRun(jobId);
    if (result.error) console.error("[ChannelDashboard] Rerun failed:", result.error);
  }, [jobId]);

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-3 py-2 border-b border-border/50 transition-colors hover:bg-muted/20"
      )}
    >
      <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", STATUS_DOT[entry.status])} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/80 truncate h-6 flex justify-start items-center w-full">{displayName}</span>
          {entry.status !== "running" && (
          <span className={cn(
            "px-1 py-0.5 rounded text-[9px] font-medium",
            entry.status === "completed" && "bg-emerald-500/15 text-emerald-400",
            entry.status === "error" && "bg-red-500/15 text-red-400",
          )}>{STATUS_LABEL[entry.status]}</span>
          )}
          <span className="ml-auto shrink-0">{timeLabel}</span>
          </div>

          <TooltipProvider delayDuration={250}>
            <div className="flex items-center gap-1 shrink-0">
              {agentId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => onDeepLink(entry)}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Open this cron run in chat
                  </TooltipContent>
                </Tooltip>
              )}
              {entry.status === "running" && agentId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={handleAbort}
                    >
                      <StopCircle className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Stop this running cron session
                  </TooltipContent>
                </Tooltip>
              )}
              {entry.status !== "running" && jobId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={handleRerun}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Rerun this cron job
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>

        <div className="mt-1 overflow-hidden">
          {showExecutingPlaceholder ? (
            <ExecutingPlaceholder status={entry.status} />
          ) : hasMessage ? (
            <div className="text-[11px] leading-5 break-words channel-dashboard-markdown text-foreground/80">
              <MemoizedReactMarkdown
                components={markdownComponents}
                remarkPlugins={[remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]}
                rehypePlugins={rehypePlugins}
              >
                {entry.message}
              </MemoizedReactMarkdown>
            </div>
          ) : null}

          {/* Metadata row */}
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {entry.metadata.duration ? <span>Duration: {formatDuration(Number(entry.metadata.duration))}</span> : null}
              {entry.metadata.model ? <span>Model: {String(entry.metadata.model)}</span> : null}
              {entry.metadata.totalTokens ? <span>Tokens: {String(entry.metadata.totalTokens)}</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
EventRow.displayName = "EventRow";

interface HeaderProps extends CustomProps {
  allCrons: CronJob[];
  cronsLoading: boolean;
  isRefreshing: boolean;
  selectedCronIds: Set<string>;
  eventCount: number;
  unreadCount: number;
  soundEnabled: boolean;
  displayTitle: string;
  onToggleCron: (cronId: string) => void;
  onToggleSound: () => void;
  onRefreshCrons: () => void;
  onRefresh: () => void;
  onClear: () => void;
  onRename: (newTitle: string) => void;
}

export const ChannelDashboardCustomHeader: React.FC<HeaderProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
  allCrons,
  cronsLoading,
  isRefreshing,
  selectedCronIds,
  eventCount,
  unreadCount,
  soundEnabled,
  onToggleCron,
  onToggleSound,
  onRefreshCrons,
  onRefresh,
  onClear,
  displayTitle,
  onRename,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayTitle);
  const [cronSearch, setCronSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredCrons = cronSearch.trim()
    ? allCrons.filter((c) =>
        c.name.toLowerCase().includes(cronSearch.toLowerCase()) ||
        c.id.toLowerCase().includes(cronSearch.toLowerCase())
      )
    : allCrons;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayTitle) {
      onRename(trimmed);
    } else {
      setDraft(displayTitle);
    }
    setEditing(false);
  };

  return (
  <div className={cn("flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 transition-opacity duration-200", !isEditMode && "absolute top-0 left-0 right-0 z-10 bg-card/90 backdrop-blur-sm rounded-t-md opacity-0 group-hover:opacity-100")}>
    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
      {isEditMode && (
        <div className="cursor-move h-7 w-7 flex shrink-0 items-center justify-center">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="text-primary shrink-0"><Radio className="w-3.5 h-3.5" /></div>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setDraft(displayTitle); setEditing(false); }
          }}
          className="text-xs font-normal text-foreground bg-transparent border-b border-primary/50 outline-none min-w-0 max-w-[200px] px-0.5"
        />
      ) : (
        <h3
          className="text-xs font-normal text-foreground truncate min-w-0 cursor-pointer group flex items-center gap-1"
          title="Double-click to rename"
          onDoubleClick={() => { setDraft(displayTitle); setEditing(true); }}
        >
          {displayTitle}
          <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </h3>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border border-solid inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer",
              "bg-background text-muted-foreground border-border/70 hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <span>{selectedCronIds.size} cron{selectedCronIds.size !== 1 ? "s" : ""}</span>
            {unreadCount > 0 && (
              <span className="inline-flex min-w-4 h-4 items-center justify-center rounded-full border border-solid border-blue-500/40 bg-blue-500/10 px-1 text-[9px] leading-none text-blue-500">
                {unreadCount}
              </span>
            )}
            <ChevronDown className="w-2.5 h-2.5 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <span className="text-xs font-medium text-foreground">Cron Jobs</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{selectedCronIds.size} selected</span>
              <Button variant="ghost" size="iconSm" onClick={onRefreshCrons} className="h-5 w-5" title="Refresh" disabled={cronsLoading}>
                <RefreshCw className={cn("w-3 h-3", cronsLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-solid border-t-0 border-l-0 border-r-0 border-border/50">
            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
            <input
              ref={searchInputRef}
              value={cronSearch}
              onChange={(e) => setCronSearch(e.target.value)}
              placeholder="Search cron jobs..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto customScrollbar2">
            {cronsLoading && allCrons.length === 0 ? (
              <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading crons...
              </div>
            ) : filteredCrons.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                {cronSearch.trim() ? "No matching cron jobs." : "No cron jobs found."}
              </div>
            ) : (
              filteredCrons.map((cron) => {
                const isSelected = selectedCronIds.has(cron.id);
                return (
                  <button
                    key={cron.id}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40",
                      isSelected && "bg-indigo-500/5"
                    )}
                    onClick={() => onToggleCron(cron.id)}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      isSelected
                        ? "bg-indigo-500 border-indigo-500"
                        : "border-border/80"
                    )}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-foreground truncate">{cron.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{cron.id}</div>
                    </div>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      cron.enabled ? "bg-emerald-400" : "bg-muted-foreground/40"
                    )} />
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
    <TooltipProvider delayDuration={250}>
      <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onRefresh}
              className="h-6 w-6"
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("w-3 h-3 text-muted-foreground", isRefreshing && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Refresh announces</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="iconSm" onClick={onClear} className="h-6 w-6">
              <Trash2 className="w-3 h-3 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Clear all announces</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="iconSm" onClick={onToggleSound} className="h-6 w-6">
              {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3 text-muted-foreground" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{soundEnabled ? "Mute sound" : "Enable sound"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="iconSm" onClick={onMaximize} className="h-6 w-6">
              {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{isMaximized ? "Minimize" : "Maximize"}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  </div>
  );
};

interface ChannelDashboardContentProps extends CustomProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const ChannelDashboardContent = memo((props: ChannelDashboardContentProps) => {
  const { widget, onConfigChange, soundEnabled, onToggleSound } = props;
  const { isFocusModeActive } = useFocusMode();
  const config = (widget.config || {}) as WidgetConfig;
  const [allCrons, setAllCrons] = useState<CronJob[]>([]);
  const [cronsLoading, setCronsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCronIds, setSelectedCronIds] = useState<Set<string>>(() => new Set(config.selectedCronIds || []));
  const [connected, setConnected] = useState(() => getGatewayConnectionState().connected);
  const [unreadCount, setUnreadCount] = useState(0);
  const userChangedCronsRef = useRef(false);

  const bufferRef = useRef<EventEntry[]>([]);
  const clearedAtRef = useRef<number>(0);
  const [renderTick, setRenderTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const isFirstEventRef = useRef<Map<string, boolean>>(new Map());
  const feedRef = useRef<HTMLDivElement>(null);
  const isAutoScrollRef = useRef(true);
  // Track accumulated delta text and tool boundaries per runId
  // so we can extract just the final summary segment on completion.
  const deltaAccumRef = useRef<Map<string, string>>(new Map());
  const deltaToolBoundaryRef = useRef<Map<string, number>>(new Map());

  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setRenderTick((tick) => tick + 1);
    });
  }, []);

  const handleScroll = useCallback(() => {
    const el = feedRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    isAutoScrollRef.current = atBottom;
    if (atBottom) setUnreadCount(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setUnreadCount(0);
    isAutoScrollRef.current = true;
  }, []);

  // Load all crons on mount
  const loadCrons = useCallback(() => {
    setCronsLoading(true);
    fetchCronsFromBridge()
      .then((jobs) => {
        const mapped = jobs.map((job) => ({
          id: job.id,
          name: typeof job.name === "string" && job.name.trim() ? job.name : job.id,
          enabled: job.enabled,
          agentId: job.agentId || "main",
          lastStatus: job.state?.lastStatus || job.state?.lastRunStatus,
        }));
        setAllCrons(mapped);
        // Prune selectedCronIds that no longer exist on this device
        const validIds = new Set(mapped.map((c) => c.id));
        setSelectedCronIds((prev) => {
          const pruned = new Set([...prev].filter((id) => validIds.has(id)));
          return pruned.size === prev.size ? prev : pruned;
        });
      })
      .catch((err) => console.error("[ChannelDashboard] Failed to load crons:", err))
      .finally(() => setCronsLoading(false));
  }, []);

  useEffect(() => {
    loadCrons();
  }, [loadCrons]);

  // Persist selected cron IDs — only after user interaction, not on initial mount
  // (mount-time writes with partial config can clobber customTitle when loading cross-device layouts)
  useEffect(() => {
    if (!userChangedCronsRef.current) return;
    onConfigChange?.({ selectedCronIds: Array.from(selectedCronIds) });
  }, [onConfigChange, selectedCronIds]);

  useEffect(() => {
    const nextIds = config.selectedCronIds || [];
    setSelectedCronIds((prev) => {
      if (prev.size === nextIds.length && nextIds.every((id) => prev.has(id))) {
        return prev;
      }
      return new Set(nextIds);
    });
  }, [config.selectedCronIds]);

  // Build a name lookup from allCrons
  const cronNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allCrons.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [allCrons]);

  // Build a lookup: cronId → agentId
  const cronAgentMap = useMemo(() => {
    const map: Record<string, string> = {};
    allCrons.forEach((c) => { map[c.id] = c.agentId; });
    return map;
  }, [allCrons]);

  // Build correct session keys: agent:{agentId}:cron:{cronId}
  const sessionKeys = useMemo(
    () => Array.from(selectedCronIds).map((cronId) =>
      buildCronSessionKey(cronAgentMap[cronId] || "main", cronId)
    ),
    [selectedCronIds, cronAgentMap]
  );

  // Map session key back to cron ID for event filtering
  const sessionKeyToCronId = useMemo(() => {
    const map: Record<string, string> = {};
    Array.from(selectedCronIds).forEach((cronId) => {
      const key = buildCronSessionKey(cronAgentMap[cronId] || "main", cronId);
      map[key] = cronId;
    });
    return map;
  }, [selectedCronIds, cronAgentMap]);

  useEffect(() => {
    return subscribeGatewayConnection(() => {
      const state = getGatewayConnectionState();
      setConnected(state.connected);
      if (state.connected) {
        // Re-subscribe on reconnect
        if (sessionKeys.length > 0) {
          gatewayConnection.subscribeAllSessionEvents().catch(() => {});
        }
        sessionKeys.forEach((sessionKey) => {
          gatewayConnection.subscribeSessionMessages(sessionKey).catch((err) => {
            // Silent — WS may not be ready yet, will retry on reconnect
          });
        });
      }
    });
  }, [sessionKeys]);

  useEffect(() => {
    if (sessionKeys.length === 0) return;
    // Subscribe broadly to catch all session events (including awareness on main sessions)
    gatewayConnection.subscribeAllSessionEvents().catch(() => {});
    // Also subscribe per-key for targeted delivery
    sessionKeys.forEach((sessionKey) => {
      gatewayConnection.subscribeSessionMessages(sessionKey).catch((err) => {
        // Silent — WS may not be ready yet, will retry on reconnect
      });
    });
    return () => {
      sessionKeys.forEach((sessionKey) => {
        gatewayConnection.unsubscribeSessionMessages(sessionKey).catch(() => {});
      });
    };
  }, [sessionKeys]);

  const selectedCronIdsKey = useMemo(
    () => Array.from(selectedCronIds).sort().join("|"),
    [selectedCronIds]
  );

  // Load persisted announces when the actual cron selection changes
  useEffect(() => {
    bufferRef.current = [];
    clearedAtRef.current = 0; // reset clear guard on cron selection change
    setUnreadCount(0);
    isFirstEventRef.current = new Map();
    isAutoScrollRef.current = true;

    const ids = Array.from(selectedCronIds);
    if (ids.length > 0) {
      loadPersistedAnnounces(ids).then((persisted) => {
        if (persisted.length > 0) {
          bufferRef.current = persisted;
          scheduleRender();
        }
      });
    }
  }, [selectedCronIdsKey, selectedCronIds, scheduleRender]);

  // Note: connector DB is the source of truth for run status.
  // If a row says "running", trust it — the connector's CronAnnounceTracker.Cleanup()
  // handles stale runs from crashes. Don't override based on cron.lastStatus
  // which reflects the *previous* run, not the current one.

  useEffect(() => {
    const findMatchingEntry = (sessionKey: string, runId?: string, status?: RunStatus) =>
      [...bufferRef.current]
        .reverse()
        .find((entry) => {
          if (entry.sessionKey !== sessionKey) return false;
          if (status && entry.status !== status) return false;
          if (!runId) return true;
          return entry.runId === runId;
        });
    const findLatestSessionEntry = (sessionKey: string) =>
      [...bufferRef.current]
        .reverse()
        .find((entry) => entry.sessionKey === sessionKey);

    // Upsert: find existing entry for this session key and update it, or create new
    const upsertEntry = (
      sessionKey: string,
      updates: Partial<EventEntry> & { cronId: string; source: string; runId: string }
    ) => {
      // Match by runId regardless of status — avoids duplicates when DB entries
      // already exist for the same run.
      const existing = findMatchingEntry(sessionKey, updates.runId, "running")
        || findMatchingEntry(sessionKey, updates.runId);
      if (existing) {
        // Don't downgrade a completed/error entry back to running
        if (existing.status !== "running" && updates.status === "running") {
          return;
        }
        // Update in-place
        const nextEntry = { ...existing, ...updates, timestamp: Date.now() };
        bufferRef.current = bufferRef.current.map((e) =>
          e === existing
            ? nextEntry
            : e
        );
      } else {
        // Don't re-populate cleared feed with events from runs that were already in-progress
        if (clearedAtRef.current > 0) return;

        // New run entry
        const entry: EventEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          runId: updates.runId,
          sessionKey,
          cronId: updates.cronId,
          category: "cron",
          source: updates.source,
          eventType: updates.eventType || "running",
          message: updates.message || "Waiting for output...",
          metadata: updates.metadata,
          timestamp: Date.now(),
          startedAt: Date.now(),
          status: updates.status || "running",
        };
        bufferRef.current = [...bufferRef.current.slice(-(MAX_BUFFER - 1)), entry];

        if (!isAutoScrollRef.current) {
          setUnreadCount((count) => count + 1);
        }
      }
      scheduleRender();
    };

    const finalizeEntry = (sessionKey: string, updates: Partial<EventEntry> & { runId?: string }) => {
      // Only match entries with the same runId to avoid overwriting a previous run's entry.
      // Fallback to session-level match only when no runId is provided.
      const existing = updates.runId
        ? (findMatchingEntry(sessionKey, updates.runId, "running") ||
           findMatchingEntry(sessionKey, updates.runId))
        : (findMatchingEntry(sessionKey, undefined, "running") ||
           findLatestSessionEntry(sessionKey));
      if (existing) {
        // Already finalized by a previous event (e.g. chat "final" + notification both fire) —
        // only update if the new message is more meaningful than what's already there.
        if (existing.status !== "running" && existing.runId && existing.runId === updates.runId) {
          const existingMeaningful = isMeaningfulFinalMessage(existing.message);
          const updateMeaningful = isMeaningfulFinalMessage(updates.message);
          if (existingMeaningful && !updateMeaningful) {
            // Already have a good message, skip the generic one
            return;
          }
          if (!updateMeaningful) {
            // Neither is meaningful, skip duplicate
            return;
          }
        }
        // Prefer the existing message if it's already meaningful (set by session.message
        // events during the run) — the finalize event's message is often the full accumulated
        // stream buffer which is noisier than the last individual message.
        const existingIsMeaningful = isMeaningfulFinalMessage(existing.message);
        const nextMessage = existingIsMeaningful
          ? existing.message
          : (isMeaningfulFinalMessage(updates.message) && typeof updates.message === "string"
              ? updates.message
              : existing.message);
        const finalized = {
          ...existing,
          ...updates,
          message: nextMessage,
          timestamp: Date.now(),
        };
        bufferRef.current = bufferRef.current.map((e) => (e === existing ? finalized : e));
      } else {
        // No existing entry — check if this run was already finalized (duplicate event)
        if (updates.runId) {
          const alreadyFinalized = bufferRef.current.find(
            (e) => e.runId === updates.runId && e.sessionKey === sessionKey && e.status !== "running"
          );
          if (alreadyFinalized) {
            // Already have a completed entry for this run — only update if better message
            if (!isMeaningfulFinalMessage(updates.message) || isMeaningfulFinalMessage(alreadyFinalized.message)) {
              return;
            }
            const upgraded = { ...alreadyFinalized, message: updates.message as string, timestamp: Date.now() };
            bufferRef.current = bufferRef.current.map((e) => (e === alreadyFinalized ? upgraded : e));
            scheduleRender();
            return;
          }
        }
        if ((updates.status as RunStatus | undefined) !== "error" && !isMeaningfulFinalMessage(updates.message)) {
          return;
        }
        // Don't re-populate cleared feed with finalized events from pre-clear runs
        if (clearedAtRef.current > 0) return;
        // No running entry found — create a completed one directly
        const entry: EventEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          runId: updates.runId,
          sessionKey,
          cronId: updates.cronId || extractCronJobId(sessionKey) || "",
          category: "cron",
          source: updates.source || sessionKey,
          eventType: "completed",
          message: updates.message || "Completed",
          metadata: updates.metadata,
          timestamp: Date.now(),
          startedAt: Date.now(),
          status: (updates.status as RunStatus) || "completed",
        };
        bufferRef.current = [...bufferRef.current.slice(-(MAX_BUFFER - 1)), entry];
      }
      scheduleRender();

      if (soundEnabled) {
        playErrorChime();
      }
    };

    const isSelectedSession = (sessionKey: string) => {
      const matchedCronId = extractCronJobId(sessionKey);
      return sessionKeys.includes(sessionKey) || !!(matchedCronId && selectedCronIds.has(matchedCronId));
    };

    const handleChatEvent = (payload: ChatEventPayload) => {
      const { runId, sessionKey, state } = payload;
      if (!sessionKey || !isSelectedSession(sessionKey)) return;

      const matchedCronId = extractCronJobId(sessionKey);
      const cronId = sessionKeyToCronId[sessionKey] || matchedCronId || "";
      const source = (cronId && cronNameMap[cronId]) || sessionKey;

      // Handle deltas — track the full accumulated text and tool boundaries
      // so we can extract the final summary segment on completion.
      if (state === "delta") {
        if (!runId) return;
        const deltaText = extractTextFromChatMessage(payload.message);

        // Check if this delta contains tool_calls — if so, record the boundary
        const chatMsg = payload.message as Record<string, unknown> | undefined;
        const hasToolCalls = chatMsg?.tool_calls || chatMsg?.toolCalls;
        if (hasToolCalls && deltaText) {
          // Tool call boundary — record where the text was before this tool
          deltaToolBoundaryRef.current.set(runId, deltaText.length);
        } else if (deltaText) {
          // Store full accumulated text for this run
          deltaAccumRef.current.set(runId, deltaText);
        }

        // Create entry if it doesn't exist, but don't overwrite message
        const existing = findMatchingEntry(sessionKey, runId);
        if (!existing) {
          upsertEntry(sessionKey, {
            runId,
            cronId,
            source,
            eventType: "running",
            message: "Running...",
            status: "running",
          });
        }
        return;
      }

      if (state === "final") {
        // Clean up delta tracking refs — we no longer reconstruct messages
        // from streaming deltas as the connector DB is the source of truth.
        if (runId) {
          deltaAccumRef.current.delete(runId);
          deltaToolBoundaryRef.current.delete(runId);
        }

        // Mark the entry as completed with a placeholder; the DB fetch below
        // will replace it with the real announce message.
        finalizeEntry(sessionKey, {
          runId,
          cronId,
          source,
          eventType: "completed",
          message: "Completed",
          metadata: runId ? { runId } : undefined,
          status: "completed",
        });

        // Fetch the authoritative announce message from the connector DB.
        const cronIds = Array.from(selectedCronIds);
        const fetchedAt = Date.now();
        setTimeout(() => {
          loadPersistedAnnounces(cronIds).then((entries) => {
            if (clearedAtRef.current > fetchedAt) return;
            if (entries.length > 0) {
              const cutoff = clearedAtRef.current;
              const filtered = cutoff ? entries.filter((e) => e.timestamp >= cutoff) : entries;
              bufferRef.current = filtered;
              scheduleRender();
            }
          });
        }, 500);
        return;
      }

      const errorMessage = payload.errorMessage || (state === "aborted" ? "Run aborted" : "Run reported an error");
      finalizeEntry(sessionKey, {
        runId,
        cronId,
        source,
        eventType: state === "aborted" ? "aborted" : "error",
        message: errorMessage,
        metadata: runId ? { runId } : undefined,
        status: "error",
      });
    };

    const unsubMessage = gatewayConnection.on("session.message", (msg) => {
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (!payload) return;

      const sessionKey = (payload.sessionKey || (msg as Record<string, unknown>).sessionKey) as string;
      const matchedCronId = extractCronJobId(sessionKey);
      if (!isSelectedSession(sessionKey)) return;

      const cronId = sessionKeyToCronId[sessionKey] || matchedCronId || "";
      const runId = typeof payload.runId === "string" ? payload.runId : undefined;

      // Skip without runId — can't distinguish which run this belongs to.
      if (!runId) return;

      // Extract message text if available, otherwise just mark as running.
      const msgText = typeof payload.message === "string" ? payload.message : extractTextFromChatMessage(payload.message);
      upsertEntry(sessionKey, {
        runId,
        cronId,
        source: (cronId && cronNameMap[cronId]) || sessionKey,
        eventType: "running",
        message: msgText,
        status: "running",
      });
    });

    const unsubChatEvent = gatewayConnection.onChatEvent(handleChatEvent);

    // Listen for agent_completed notifications (fired when a cron run finishes)
    const unsubNotification = gatewayConnection.onNotification((notification) => {
      if (notification.kind !== "agent_completed") return;
      const sessionKey = notification.sessionKey;
      const matchedCronId = extractCronJobId(sessionKey);
      if (!isSelectedSession(sessionKey)) return;

      // Re-fetch from connector DB — merge with in-memory entries.
      const cronIds = Array.from(selectedCronIds);
      const fetchedAt = Date.now();
      setTimeout(() => {
        loadPersistedAnnounces(cronIds).then((entries) => {
          if (clearedAtRef.current > fetchedAt) return;
          if (entries.length > 0) {
            const cutoff = clearedAtRef.current;
            const filtered = cutoff ? entries.filter((e) => e.timestamp >= cutoff) : entries;
            const inMemoryByRunId = new Map<string, EventEntry>();
            bufferRef.current.forEach((e) => { if (e.runId) inMemoryByRunId.set(e.runId, e); });
            const merged = filtered.map((dbEntry) => {
              if (!dbEntry.runId) return dbEntry;
              const mem = inMemoryByRunId.get(dbEntry.runId);
              if (!mem?.message.trim()) return dbEntry;
              if (!dbEntry.message.trim()) {
                return { ...dbEntry, message: mem.message };
              }
              if (isMeaningfulFinalMessage(mem.message) && mem.message.length < dbEntry.message.length) {
                return { ...dbEntry, message: mem.message };
              }
              return dbEntry;
            });
            bufferRef.current = merged;
            scheduleRender();
          }
        });
      }, 500);
    });

    return () => {
      unsubMessage();
      unsubChatEvent();
      unsubNotification();
    };
  }, [scheduleRender, cronNameMap, selectedCronIds, sessionKeyToCronId, sessionKeys, soundEnabled]);

  useEffect(() => {
    if (!isAutoScrollRef.current) return;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [renderTick]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const reloadPersistedAnnounces = useCallback(async (cronIds: string[]) => {
    bufferRef.current = [];
    clearedAtRef.current = 0; // reset clear guard — user explicitly refreshed
    setUnreadCount(0);
    isFirstEventRef.current = new Map();
    isAutoScrollRef.current = true;

    if (cronIds.length === 0) {
      scheduleRender();
      return;
    }

    const persisted = await loadPersistedAnnounces(cronIds);
    bufferRef.current = persisted;
    scheduleRender();
  }, [scheduleRender]);

  const events = bufferRef.current;

  const handleDeepLink = useCallback((entry: EventEntry) => {
    const agentId = extractAgentId(entry.sessionKey);
    if (agentId) dispatchOpenAgentChat(agentId, entry.sessionKey);
  }, []);

  const handleToggleCron = useCallback((cronId: string) => {
    userChangedCronsRef.current = true;
    setSelectedCronIds((prev) => {
      const next = new Set(prev);
      if (next.has(cronId)) {
        const key = buildCronSessionKey(cronAgentMap[cronId] || "main", cronId);
        gatewayConnection.unsubscribeSessionMessages(key).catch(() => {});
        next.delete(cronId);
      } else {
        next.add(cronId);
      }
      return next;
    });
  }, [cronAgentMap]);

  const handleClear = useCallback(() => {
    bufferRef.current = [];
    clearedAtRef.current = Date.now();
    setUnreadCount(0);
    isFirstEventRef.current = new Map();
    scheduleRender();
    // Delete from connector DB so announces don't reappear on refresh
    const cronIds = Array.from(selectedCronIds);
    if (cronIds.length > 0) {
      bridgeInvoke("delete-cron-announces", { cronIds }).catch(() => {});
    }
  }, [selectedCronIds, scheduleRender]);

  const displayTitle = config.customTitle || widget.title;

  const handleRename = useCallback((newTitle: string) => {
    onConfigChange?.({ customTitle: newTitle });
  }, [onConfigChange]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        Promise.resolve(loadCrons()),
        reloadPersistedAnnounces(Array.from(selectedCronIds)),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadCrons, reloadPersistedAnnounces, selectedCronIds]);

  if (isFocusModeActive) {
    return (
      <div className="flex-1 flex items-center justify-center opacity-30 grayscale">
        <span className="text-xs text-muted-foreground">Focus mode active</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <ChannelDashboardCustomHeader
        {...props}
        allCrons={allCrons}
        cronsLoading={cronsLoading}
        isRefreshing={isRefreshing}
        selectedCronIds={selectedCronIds}
        eventCount={events.length}
        unreadCount={unreadCount}
        soundEnabled={soundEnabled}
        onToggleCron={handleToggleCron}
        onToggleSound={onToggleSound}
        onRefreshCrons={loadCrons}
        onRefresh={handleRefresh}
        onClear={handleClear}
        displayTitle={displayTitle}
        onRename={handleRename}
      />

      <div className="flex-1 relative overflow-hidden">
        {selectedCronIds.size === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Radio className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No cron jobs selected.</p>
            <p className="text-[10px] text-muted-foreground/60">Click a cron tag above to start listening to its event stream.</p>
          </div>
        ) : events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Radio className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No announcements yet.</p>
            <p className="text-[10px] text-muted-foreground/60">Selected cron jobs are connected, but no events have arrived yet.</p>
          </div>
        ) : (
          <div ref={feedRef} className="h-full overflow-y-auto customScrollbar2" role="list" onScroll={handleScroll}>
            {events.map((entry, index) => (
              <EventRow
                key={entry.id}
                entry={entry}
                cronNameMap={cronNameMap}
                onDeepLink={handleDeepLink}
              />
            ))}
          </div>
        )}

        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="absolute bottom-2 inset-x-0 mx-auto w-fit px-3 py-1 rounded-full bg-blue-500/90 text-white text-[10px] flex items-center gap-1 shadow-lg z-10"
              onClick={scrollToBottom}
            >
              <ArrowDown className="w-3 h-3" />
              {unreadCount} new event{unreadCount !== 1 ? "s" : ""}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
ChannelDashboardContent.displayName = "ChannelDashboardContent";

const ChannelDashboardWidget = memo((props: CustomProps) => {
  const { widget, onConfigChange } = props;
  const config = (widget.config || {}) as WidgetConfig;
  const soundEnabled = config.soundEnabled ?? false;

  const handleToggleSound = useCallback(() => {
    onConfigChange?.({ soundEnabled: !soundEnabled });
  }, [onConfigChange, soundEnabled]);

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card className="group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md">
        <ChannelDashboardContent
          {...props}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
        />
      </Card>
    </motion.div>
  );
});
ChannelDashboardWidget.displayName = "ChannelDashboardWidget";

export default ChannelDashboardWidget;
