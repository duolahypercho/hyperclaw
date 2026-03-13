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
  ChevronDown,
  ChevronRight,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useFocusMode } from "./hooks/useFocusMode";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  gatewayConnection,
  getGatewayConnectionState,
  subscribeGatewayConnection,
  type ChatEventPayload,
} from "$/lib/openclaw-gateway-ws";
import {
  useAgentIdentities,
  resolveAvatarUrl,
  isAvatarText,
  type AgentIdentity,
} from "$/hooks/useAgentIdentity";
import { useFloatingChatOS } from "@OS/Provider/OSProv";

// ── Custom event for cross-widget communication ──
// StatusWidget dispatches this; GatewayChatWidget listens.
export const OPEN_AGENT_CHAT_EVENT = "open-agent-chat";

export function dispatchOpenAgentChat(agentId: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_AGENT_CHAT_EVENT, { detail: { agentId } })
  );
}

// ── Types ──

interface Agent {
  id: string;
  name: string;
  status: string;
  role?: string;
  lastActive?: string;
}

interface AgentStatus {
  agentId: string;
  name: string;
  state: "idle" | "running" | "error";
  lastActivity?: number;
  unreadCount: number;
  lastMessage?: string;
  sessionCount: number;
  errorMessage?: string;
}

// ── Quiet hours: hide agents with no activity within this window ──
const QUIET_HOURS = 48;

// ── LocalStorage helpers ──

const LAST_SEEN_KEY = "hyperclaw.agent-status.last-seen";

function getLastSeenMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLastSeen(agentId: string, ts: number) {
  const map = getLastSeenMap();
  map[agentId] = ts;
  try {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
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

// ── Extract last assistant text from history messages (skip tool-only) ──

function extractLastAssistantText(
  messages: Array<{ role?: string; content?: unknown }>
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
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
      return text.slice(0, 120);
    }
  }
  return undefined;
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
}>(function AgentExpandedRow({ status, identity, onClick }, ref) {
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const displayName = identity?.name || status.name || status.agentId;

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "flex items-start gap-2.5 px-2.5 py-2 rounded-md transition-colors cursor-pointer overflow-hidden",
        "hover:bg-muted/30",
        status.unreadCount > 0 && "bg-primary/5 border-l-2 border-primary",
        status.state === "error" && status.unreadCount === 0 && "bg-destructive/5 border-l-2 border-destructive"
      )}
      onClick={() => onClick(status.agentId)}
    >
      {/* Avatar with optional pulse */}
      <div className="shrink-0 mt-0.5 relative">
        <Avatar className="w-7 h-7">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
            {avatarText || identity?.emoji || displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {status.state === "running" && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card animate-pulse" />
        )}
        {status.state === "error" && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-card" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col gap-0.5">
        {/* Name line */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {displayName}
          </span>
          {status.state === "running" && (
            <span className="text-[10px] text-emerald-500 shrink-0">Generating...</span>
          )}
          {status.lastActivity && status.state !== "running" && (
            <span className="text-[10px] text-muted-foreground/50 shrink-0">
              {timeAgo(status.lastActivity)}
            </span>
          )}
          {status.unreadCount > 0 && (
            <Badge
              variant="default"
              className="h-3.5 px-1 text-[9px] font-medium bg-primary text-primary-foreground ml-auto shrink-0"
            >
              new
            </Badge>
          )}
        </div>

        {/* Error or message preview */}
        {status.state === "error" && status.errorMessage ? (
          <div className="flex items-center gap-1 text-[11px] text-destructive min-w-0">
            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            <span className="break-words line-clamp-2">{status.errorMessage}</span>
          </div>
        ) : status.lastMessage ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed break-words line-clamp-2">
            {status.lastMessage}
          </p>
        ) : null}

        {/* Session count */}
        {status.sessionCount > 0 && (
          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40">
            <MessageSquare className="w-2.5 h-2.5" />
            {status.sessionCount} session{status.sessionCount !== 1 ? "s" : ""}
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
}: {
  status: AgentStatus;
  identity?: AgentIdentity;
  onClick: (agentId: string) => void;
}) {
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const displayName = identity?.name || status.name || status.agentId;

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 overflow-hidden cursor-pointer hover:bg-muted/20 rounded-md transition-colors"
      onClick={() => onClick(status.agentId)}
    >
      <Avatar className="w-5 h-5">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
        <AvatarFallback className="bg-muted text-muted-foreground text-[8px]">
          {avatarText || identity?.emoji || displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-[11px] text-muted-foreground truncate">{displayName}</span>
      {status.lastActivity && (
        <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
          {timeAgo(status.lastActivity)}
        </span>
      )}
    </div>
  );
}

// ── Main widget content ──

const StatusWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [statuses, setStatuses] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(() => getGatewayConnectionState().connected);
  const [showHidden, setShowHidden] = useState(false);
  const [idleExpanded, setIdleExpanded] = useState(false);
  const activeRunsRef = useRef<Map<string, { agentId: string; ts: number }>>(new Map());
  const isMounted = useRef(true);

  // Track connection state
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      setConnected(getGatewayConnectionState().connected);
    });
  }, []);

  // Fetch agents list
  const fetchAgents = useCallback(async (): Promise<Agent[]> => {
    try {
      const res = (await bridgeInvoke("list-agents", {})) as {
        success?: boolean;
        data?: Agent[];
      };
      if (res?.success && Array.isArray(res.data)) return res.data;
    } catch { /* ignore */ }
    return [];
  }, []);

  // Fetch session data for a single agent
  const fetchAgentSessions = useCallback(
    async (agentId: string): Promise<{ sessionCount: number; lastActivity?: number; lastMessage?: string }> => {
      if (!gatewayConnection.isConnected()) return { sessionCount: 0 };
      try {
        const result = await gatewayConnection.listSessions(agentId, 10);
        const sessions = result.sessions || [];
        const lastActivity = sessions.length > 0
          ? Math.max(...sessions.map((s) => s.updatedAt || 0))
          : undefined;

        let lastMessage: string | undefined;
        if (sessions.length > 0) {
          try {
            const history = await gatewayConnection.getChatHistory(sessions[0].key, 10);
            const messages = (history.messages || []) as Array<{ role?: string; content?: unknown }>;
            lastMessage = extractLastAssistantText(messages);
          } catch { /* ignore */ }
        }

        return { sessionCount: sessions.length, lastActivity, lastMessage };
      } catch {
        return { sessionCount: 0 };
      }
    },
    []
  );

  // Build statuses
  const refresh = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const agentList = await fetchAgents();
      if (!isMounted.current) return;
      setAgents(agentList);

      const lastSeenMap = getLastSeenMap();

      const sessionInfos = await Promise.all(
        agentList.map((a) => fetchAgentSessions(a.id))
      );
      if (!isMounted.current) return;

      const newStatuses: AgentStatus[] = agentList.map((agent, i) => {
        const info = sessionInfos[i];
        const activeRun = Array.from(activeRunsRef.current.values()).find(
          (r) => r.agentId === agent.id
        );
        const lastSeen = lastSeenMap[agent.id] || 0;
        const lastActivity = info.lastActivity || 0;
        const unreadCount = lastActivity > lastSeen && lastActivity > 0 ? 1 : 0;

        return {
          agentId: agent.id,
          name: agent.name,
          state: activeRun ? "running" as const : "idle" as const,
          lastActivity: lastActivity || undefined,
          unreadCount,
          lastMessage: info.lastMessage,
          sessionCount: info.sessionCount,
        };
      });

      // Sort: running first, then unread, then by lastActivity
      newStatuses.sort((a, b) => {
        if (a.state === "running" && b.state !== "running") return -1;
        if (b.state === "running" && a.state !== "running") return 1;
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        return (b.lastActivity || 0) - (a.lastActivity || 0);
      });

      setStatuses(newStatuses);
    } catch { /* ignore */ } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [fetchAgents, fetchAgentSessions]);

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

  // Agent identities
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const identities = useAgentIdentities(agentIds);

  // Floating chat
  const { openChat } = useFloatingChatOS();

  // Click handler: mark as read + open floating chat popout
  const handleAgentClick = useCallback((agentId: string) => {
    setLastSeen(agentId, Date.now());
    setStatuses((prev) =>
      prev.map((s) => (s.agentId === agentId ? { ...s, unreadCount: 0 } : s))
    );
    openChat(agentId);
  }, [openChat]);

  // ── Partition into visible groups ──
  const quietCutoff = Date.now() - QUIET_HOURS * 60 * 60 * 1000;

  // "Active" = running, error, or has unread — always shown expanded
  const activeStatuses = useMemo(
    () => statuses.filter((s) => s.state === "running" || s.state === "error" || s.unreadCount > 0),
    [statuses]
  );

  // "Recent idle" = idle, no unread, had activity within QUIET_HOURS — shown collapsed
  const recentIdleStatuses = useMemo(
    () =>
      statuses.filter(
        (s) =>
          s.state === "idle" &&
          s.unreadCount === 0 &&
          s.lastActivity &&
          s.lastActivity > quietCutoff
      ),
    [statuses, quietCutoff]
  );

  // "Hidden" = idle, no unread, no activity within QUIET_HOURS
  const hiddenStatuses = useMemo(
    () =>
      statuses.filter(
        (s) =>
          s.state === "idle" &&
          s.unreadCount === 0 &&
          (!s.lastActivity || s.lastActivity <= quietCutoff)
      ),
    [statuses, quietCutoff]
  );

  const unreadTotal = useMemo(
    () => statuses.reduce((sum, s) => sum + s.unreadCount, 0),
    [statuses]
  );

  const visibleCount = activeStatuses.length + recentIdleStatuses.length;

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
          "h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all shadow-sm duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        <StatusCustomHeader
          {...props}
          agentCount={visibleCount}
          hiddenCount={hiddenStatuses.length}
          unreadTotal={unreadTotal}
          onRefresh={refresh}
          refreshing={loading}
          connected={connected}
          showHidden={showHidden}
          onToggleHidden={() => setShowHidden((v) => !v)}
        />

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-2 pb-2">
          {loading && statuses.length === 0 ? (
            <div className="flex-1 flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading agents...</span>
            </div>
          ) : !connected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
              <Activity className="w-6 h-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground text-center">
                Not connected to gateway
              </p>
            </div>
          ) : statuses.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
              <Activity className="w-6 h-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground text-center">
                No agents found
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-0.5 pr-1">
                {/* Active agents — always expanded */}
                <AnimatePresence mode="popLayout">
                  {activeStatuses.map((status) => (
                    <AgentExpandedRow
                      key={status.agentId}
                      status={status}
                      identity={identities.get(status.agentId)}
                      onClick={handleAgentClick}
                    />
                  ))}
                </AnimatePresence>

                {/* Recent idle — collapsed with expand toggle */}
                {recentIdleStatuses.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2.5 py-1 w-full text-left hover:bg-muted/20 rounded-md transition-colors"
                      onClick={() => setIdleExpanded((v) => !v)}
                    >
                      {idleExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
                      )}
                      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium">
                        Recent ({recentIdleStatuses.length})
                      </span>
                    </button>

                    {idleExpanded ? (
                      <AnimatePresence mode="popLayout">
                        {recentIdleStatuses.map((status) => (
                          <AgentExpandedRow
                            key={status.agentId}
                            status={status}
                            identity={identities.get(status.agentId)}
                            onClick={handleAgentClick}
                          />
                        ))}
                      </AnimatePresence>
                    ) : (
                      recentIdleStatuses.map((status) => (
                        <AgentCollapsedRow
                          key={status.agentId}
                          status={status}
                          identity={identities.get(status.agentId)}
                          onClick={handleAgentClick}
                        />
                      ))
                    )}
                  </div>
                )}

                {/* Hidden (quiet) agents — behind eye toggle */}
                {showHidden && hiddenStatuses.length > 0 && (
                  <div className="pt-1 border-t border-border/30 mt-1">
                    <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wide font-medium px-2.5 py-1">
                      Inactive ({hiddenStatuses.length})
                    </p>
                    {hiddenStatuses.map((status) => (
                      <AgentCollapsedRow
                        key={status.agentId}
                        status={status}
                        identity={identities.get(status.agentId)}
                        onClick={handleAgentClick}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </Card>
    </motion.div>
  );
});

StatusWidgetContent.displayName = "StatusWidgetContent";

const StatusWidget = memo((props: CustomProps) => {
  return <StatusWidgetContent {...props} />;
});

StatusWidget.displayName = "StatusWidget";

export default StatusWidget;
