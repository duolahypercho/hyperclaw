"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Paperclip,
  Pencil,
  Loader2,
  Settings,
  MessageSquare,
  Plus,
  RefreshCw,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useGatewayChat, GatewayChatMessage, GatewayChatAttachment, seedHermesSession } from "@OS/AI/core/hook/use-gateway-chat";
import { useClaudeCodeChat } from "@OS/AI/core/hook/use-claude-code-chat";
import { useCodexChat } from "@OS/AI/core/hook/use-codex-chat";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useUser } from "$/Providers/UserProv";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { getMediaUrl } from "$/utils";
import {
  AnimatedThinkingText,
  ChatLoadingSkeleton,
  EmptyState,
} from "@OS/AI/components/Chat";
import type { AttachmentType, InputContainerHandle } from "@OS/AI/components/Chat";
import { InputContainer } from "@OS/AI/components/InputContainer";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import {
  useAgentIdentity,
  resolveAvatarUrl,
  isAvatarText,
} from "$/hooks/useAgentIdentity";
import { EnhancedMessageBubble, shouldShowAvatarLocal } from "./gateway-chat/EnhancedMessageBubble";
import { GroupedToolActions } from "./gateway-chat/GroupedToolActions";
import { createMergeToolCalls } from "./gateway-chat/mergeToolCallsWithResults";
import { exportChatAsMarkdown } from "./gateway-chat/exportChat";
import { SlashCommandMenu } from "./gateway-chat/SlashCommandMenu";
import { SLASH_COMMANDS, type SlashCommand } from "./gateway-chat/slashCommands";
import { useRuntimeModels } from "@OS/AI/core/hook/use-runtime-models";
import { AgentDetailDialog } from "$/components/Tool/Agents/AgentDetailDialog";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import type { BackendTab } from "./gateway-chat/GatewayChatHeader";
import { OPEN_AGENT_CHAT_EVENT } from "./StatusWidget";
import { useAgentStatus } from "$/components/ensemble";
import { resolveClearedChatSessionKey } from "@OS/AI/core/hook/chat-clear-boundary";

/* ── Panel event ─────────────────────────────────────────── */

export const OPEN_AGENT_PANEL_EVENT = "open-agent-panel";
export const CLEAR_AGENT_CHAT_EVENT = "agent-chat:clear-current";

export function dispatchOpenAgentPanel(agentId: string, sessionKey?: string) {
  window.dispatchEvent(
    new CustomEvent(OPEN_AGENT_PANEL_EVENT, { detail: { agentId, sessionKey } })
  );
}

/* ── Types ────────────────────────────────────────────────── */

type PanelTab = "chat" | "edit";

interface AgentChatPanelProps {
  open: boolean;
  agentId: string;
  sessionKey?: string;
  onClose: () => void;
}

/* ── Main Panel ──────────────────────────────────────────── */

export function AgentChatPanel({ open, agentId, sessionKey: initialSessionKey, onClose }: AgentChatPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");
  const [backendTab, setBackendTab] = useState<BackendTab>("openclaw");
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Reset to chat tab when panel opens with a new agent
  useEffect(() => {
    if (open) setActiveTab("chat");
  }, [open, agentId]);

  const { agents } = useHyperclawContext();
  const currentAgent = agents.find((a) => a.id === agentId) || {
    id: agentId,
    name: agentId === "main" ? "General Assistant" : agentId,
    icon: "🤖",
    coverPhoto: "",
  };

  const identity = useAgentIdentity(agentId);

  // Sync backendTab with the agent's runtime so the panel uses the correct backend.
  const agentListRuntime = (currentAgent as { runtime?: string }).runtime;
  useEffect(() => {
    const runtime = agentListRuntime || identity?.runtime;
    if (!runtime) return;
    const expected: BackendTab =
      runtime === "claude-code" ? "claude-code"
      : runtime === "codex" ? "codex"
      : runtime === "hermes" ? "hermes"
      : "openclaw";
    setBackendTab(expected);
  }, [agentId, agentListRuntime, identity?.runtime]);
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const displayName = identity?.name || currentAgent.name;
  const { state: agentState } = useAgentStatus(agentId, {
    status: (currentAgent as { status?: string }).status,
  });
  const isDeleting = agentState === "deleting";
  const isHiring = agentState === "hiring";
  const sendDisabledReason = isHiring
    ? `${displayName} is still being hired - chat unlocks when setup finishes.`
    : isDeleting
      ? `${displayName} is being fired - chat is locked.`
      : undefined;

  useEffect(() => {
    if ((isDeleting || isHiring) && activeTab === "chat") {
      setActiveTab("edit");
    }
  }, [activeTab, isDeleting, isHiring]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[90]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel-content"
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.8 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-[520px] max-w-[90vw] z-[91] flex flex-col bg-card border-l border-border shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/50">
              <Avatar className="h-9 w-9 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {avatarText || identity?.emoji || "🤖"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold truncate">{displayName}</h3>
                <p className="text-[10px] text-muted-foreground truncate">{agentId}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Tab toggle */}
                <div className="flex items-center bg-muted/40 rounded-md p-0.5 mr-1">
                  <button
                    onClick={() => !isDeleting && !isHiring && setActiveTab("chat")}
                    disabled={isDeleting || isHiring}
                    aria-disabled={isDeleting || isHiring}
                    title={isHiring ? "Agent is still hiring - chat unlocks when setup finishes" : isDeleting ? "Agent is firing - chat is locked" : undefined}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                      isDeleting || isHiring
                        ? "text-muted-foreground/40 cursor-not-allowed"
                      : activeTab === "chat"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MessageSquare className="w-3 h-3" />
                    Chat
                  </button>
                  <button
                    onClick={() => setEditDialogOpen(true)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Settings className="w-3 h-3" />
                    Edit
                  </button>
                </div>
                <Button variant="ghost" size="iconSm" className="h-7 w-7" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <PanelChatView
                agentId={agentId}
                initialSessionKey={initialSessionKey}
                backendTab={backendTab}
                onBackendTabChange={setBackendTab}
                sendDisabledReason={sendDisabledReason}
              />
            </div>

            {/* Agent detail dialog */}
            <AgentDetailDialog
              open={editDialogOpen}
              onOpenChange={setEditDialogOpen}
              agentId={agentId}
              agentName={displayName}
              agentRuntime={agentListRuntime}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Chat View (inside panel) ────────────────────────────── */

export interface PanelChatViewHandle {
  newChat: () => void;
  reload: () => void;
  sessions: Array<{ key: string; label?: string; updatedAt?: number; status?: string; trigger?: string; preview?: string }>;
  sessionsLoading: boolean;
  sessionsError: string | null;
  selectedSessionKey: string | undefined;
  onSessionChange: (key: string) => void;
  fetchSessions: () => void;
}

interface PanelChatViewProps {
  agentId: string;
  initialSessionKey?: string;
  backendTab: BackendTab;
  onBackendTabChange: (tab: BackendTab) => void;
  showSubHeader?: boolean;
  onSessionsUpdate?: (sessions: Array<{ key: string; label?: string; updatedAt?: number; status?: string; trigger?: string; preview?: string }>) => void;
  /** Pre-populated sessions from parent cache — skips initial fetch and loading state */
  initialSessions?: Array<{ key: string; label?: string; updatedAt?: number; status?: string; trigger?: string; preview?: string }>;
  /** If true, the runtime is unavailable (uninstalled) and sending is disabled */
  runtimeUnavailable?: boolean;
  /** Optional lifecycle block, e.g. agent is being fired. Disables sending. */
  sendDisabledReason?: string;
}

export const PanelChatView = forwardRef<PanelChatViewHandle, PanelChatViewProps>(function PanelChatView({
  agentId,
  initialSessionKey,
  backendTab,
  onSessionsUpdate,
  onBackendTabChange,
  showSubHeader = true,
  initialSessions,
  runtimeUnavailable = false,
  sendDisabledReason,
}, ref) {
  const { agents } = useHyperclawContext();
  const currentAgent = agents.find((a) => a.id === agentId) || {
    id: agentId,
    name: agentId,
    icon: "🤖",
    coverPhoto: "",
  };

  // Sessions — initialize from parent cache if provided to avoid redundant fetches
  const [sessions, setSessions] = useState<Array<{ key: string; label?: string; updatedAt?: number; status?: string; trigger?: string; preview?: string }>>(initialSessions ?? []);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | undefined>(initialSessionKey);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  // Track if we received pre-populated sessions to skip redundant work
  const hadInitialSessionsRef = useRef(!!initialSessions && initialSessions.length > 0);
  const selectedSessionOwnerRef = useRef(agentId);
  const latestSessionScopeRef = useRef({ agentId, backendTab });
  latestSessionScopeRef.current = { agentId, backendTab };

  const setOwnedSelectedSessionKey = useCallback((key: string | undefined) => {
    selectedSessionOwnerRef.current = agentId;
    setSelectedSessionKey(key);
  }, [agentId]);

  const selectedSessionKeyForActiveAgent =
    selectedSessionOwnerRef.current === agentId ? selectedSessionKey : undefined;

  const inputHandleRef = useRef<InputContainerHandle | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Slash command state
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");

  // Dynamic model list
  const { models: runtimeModels, loading: runtimeModelsLoading } = useRuntimeModels(backendTab);

  // Session key — prefer the primary session key when provided
  const sessionKey = selectedSessionKeyForActiveAgent || initialSessionKey || `agent:${agentId}:main`;

  // Determine effective provider
  const effectiveProvider = backendTab === "claude-code" ? "claude-code"
    : backendTab === "codex" ? "codex"
    : "gateway";

  const hermesProfileId = backendTab === "hermes"
    ? (agentId.startsWith("hermes:") ? agentId.slice(7) : agentId)
    : undefined;

  // Agent identity — needed for project-scoped session filtering (claude-code)
  const sessionAgentIdentity = useAgentIdentity(agentId);

  const gatewayChat = useGatewayChat({
    sessionKey,
    autoConnect: effectiveProvider === "gateway",
    backend: backendTab === "hermes" ? "hermes" : "openclaw",
    agentId: hermesProfileId,
    statusAgentId: agentId,
  });

  const claudeCodeChat = useClaudeCodeChat({
    sessionKey,
    autoConnect: effectiveProvider === "claude-code",
    agentId,
    projectPath: sessionAgentIdentity?.project,
  });

  const codexChat = useCodexChat({
    sessionKey,
    autoConnect: effectiveProvider === "codex",
    agentId,
    projectPath: sessionAgentIdentity?.project,
  });

  const activeChat = effectiveProvider === "claude-code" ? claudeCodeChat
    : effectiveProvider === "codex" ? codexChat
    : gatewayChat;
  const inputBlocked = runtimeUnavailable || !!sendDisabledReason;

  const {
    messages,
    isLoading,
    isConnected,
    error,
    hasMoreHistory,
    isLoadingMore,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    loadMoreHistory,
    clearChat,
    setSessionKey: setChatSessionKey,
    model: currentModel,
    setModel: setCurrentModel,
  } = activeChat;

  const { toolStates, toggleToolExpansion } = useUnifiedToolState(messages as any);

  // Keep hook session key in sync
  useEffect(() => {
    setChatSessionKey(sessionKey);
  }, [sessionKey, setChatSessionKey]);

  // Initial load — cached session lists skip the skeleton, not the chat history.
  const initialLoadDoneRef = useRef(false);
  const [initialReady, setInitialReady] = useState(hadInitialSessionsRef.current);

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    loadChatHistory()
      .catch(() => {})
      .finally(() => {
        setInitialReady(true);
        // Only fetch sessions if parent didn't provide cached ones.
        // Session list cache and message history are separate data sources.
        if (!hadInitialSessionsRef.current) {
          fetchSessions();
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset on agent change — ref and effect are below fetchSessions definition
  const prevAgentRef = useRef(agentId);

  // Reload on session change — reset initialReady so skeleton shows while loading
  const prevSessionRef = useRef(sessionKey);
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (sessionKey === prevSessionRef.current) return;
    prevSessionRef.current = sessionKey;
    setInitialReady(false);
    loadChatHistory()
      .catch(() => {})
      .finally(() => setInitialReady(true));
  }, [sessionKey, loadChatHistory]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    const requestAgentId = agentId;
    const requestBackendTab = backendTab;
    const isCurrentRequest = () =>
      latestSessionScopeRef.current.agentId === requestAgentId &&
      latestSessionScopeRef.current.backendTab === requestBackendTab;

    // A firing agent is read-only. Keep existing cached sessions intact.
    if (sendDisabledReason) {
      setSessionsLoading(false);
      return;
    }

    // Skip fetching if runtime is unavailable — no sessions can be loaded.
    if (runtimeUnavailable) {
      setSessions([]);
      onSessionsUpdate?.([]);
      setSessionsLoading(false);
      return;
    }

    setSessionsLoading(true);
    setSessionsError(null);
    try {
      let result: Array<{ key: string; label?: string; updatedAt?: number; status?: string; trigger?: string }> = [];
      if (backendTab === "openclaw") {
        if (gatewayConnection.isConnected()) {
          const r = await gatewayConnection.listSessions(agentId, 50).catch(() => ({ sessions: [] as any[] }));
          result = (r.sessions || []).map((s: any) => ({
            ...s,
            label: s.label || s.key,
            trigger: s.kind || s.trigger,
            preview: s.preview || s.lastMessage,
          }));
        }
      } else if (backendTab === "claude-code") {
        const projectPath = sessionAgentIdentity?.project;
        const r = await bridgeInvoke("claude-code-list-sessions", { agentId, limit: 50, ...(projectPath ? { projectPath } : {}) }).catch(() => ({ sessions: [] })) as any;
        result = (r?.sessions || []).map((s: any) => ({
          key: s.key || `claude:${s.id}`,
          label: s.label || s.id?.slice(0, 8),
          updatedAt: s.updatedAt,
          status: s.status,
          trigger: s.kind || s.trigger,
          preview: s.preview,
        }));
      } else if (backendTab === "codex") {
        const projectPath = sessionAgentIdentity?.project;
        const r = await bridgeInvoke("codex-list-sessions", { agentId, limit: 50, ...(projectPath ? { projectPath } : {}) }).catch(() => ({ sessions: [] })) as any;
        result = (r?.sessions || []).map((s: any) => ({
          key: s.key || `codex:${s.id}`,
          label: s.label || s.id?.slice(0, 8),
          updatedAt: s.updatedAt,
          status: s.status,
          trigger: s.kind || s.trigger,
          preview: s.preview,
        }));
      } else if (backendTab === "hermes") {
        // Strip "hermes:" prefix — the connector expects the bare profile name
        const hermesProfileId = agentId.startsWith("hermes:") ? agentId.slice(7) : agentId;
        const r = await bridgeInvoke("hermes-sessions", { agentId: hermesProfileId }).catch(() => ({ sessions: [] })) as any;
        result = (r?.sessions || []).map((s: any) => ({
          key: `hermes:${s.key || s.id}`,
          label: s.label || (s.key || s.id)?.slice(0, 16),
          updatedAt: s.updatedAt,
          status: s.status,
          trigger: s.kind || s.trigger,
          preview: s.preview,
        }));
      }
      result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (!isCurrentRequest()) return;
      // Safety cap at 100 — the dropdown is scrollable and has a built-in
      // search filter, so we no longer need the aggressive 15-item cut-off
      // that was previously hiding legitimate Codex/Claude history.
      const capped = result.slice(0, 100);
      setSessions(capped);
      onSessionsUpdate?.(capped);
    } catch {
      if (isCurrentRequest()) {
        setSessionsError("Failed to load sessions");
      }
    } finally {
      if (isCurrentRequest()) {
        setSessionsLoading(false);
      }
    }
  }, [agentId, backendTab, sessionAgentIdentity, runtimeUnavailable, sendDisabledReason, onSessionsUpdate]);

  const prevInputBlockedRef = useRef(inputBlocked);
  useEffect(() => {
    const wasBlocked = prevInputBlockedRef.current;
    prevInputBlockedRef.current = inputBlocked;
    if (wasBlocked && !inputBlocked) {
      fetchSessions();
    }
  }, [fetchSessions, inputBlocked]);

  // Re-fetch sessions once agent identity loads — the initial fetch fires before
  // the async get-agent-identity call resolves. If the agent has an explicit
  // project path in IDENTITY.md, we need to re-fetch to scope to that project.
  const prevIdentityProjectRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (backendTab !== "claude-code") return;
    const newProject = sessionAgentIdentity?.project;
    if (newProject && prevIdentityProjectRef.current !== newProject) {
      prevIdentityProjectRef.current = newProject;
      fetchSessions();
    }
  }, [sessionAgentIdentity, backendTab, fetchSessions]);

  // Re-fetch sessions when the backend tab switches (e.g. openclaw → claude-code)
  // without the agent changing. Guard against firing on mount.
  const prevBackendTabRef = useRef(backendTab);
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (prevBackendTabRef.current === backendTab) return;
    prevBackendTabRef.current = backendTab;
    fetchSessions();
  }, [backendTab, fetchSessions]);

  // Keep fetchSessions in a ref so the agent-change effect can call the latest
  // version without adding it to the dependency array (which would cause extra
  // runs when backendTab or sessionAgentIdentity changes).
  const fetchSessionsRef = useRef(fetchSessions);
  fetchSessionsRef.current = fetchSessions;

  // Sync primary session key when it arrives asynchronously from the connector
  // Sync primary session key when it arrives asynchronously from the connector.
  // Also triggers chat history load if it was deferred during agent-change reset.
  const prevInitialSessionKeyRef = useRef(initialSessionKey);
  useEffect(() => {
    if (initialSessionKey && initialSessionKey !== prevInitialSessionKeyRef.current) {
      prevInitialSessionKeyRef.current = initialSessionKey;
      setOwnedSelectedSessionKey(initialSessionKey);
      setChatSessionKey(initialSessionKey);
      // Load chat history for the newly-arrived primary session key
      loadChatHistory().catch(() => {});
    }
  }, [initialSessionKey, setChatSessionKey, loadChatHistory, setOwnedSelectedSessionKey]);

  // Sync sessions from parent when initialSessions prop changes (e.g., parent has cached sessions for new agent)
  const prevInitialSessionsRef = useRef(initialSessions);
  useEffect(() => {
    if (initialSessions && initialSessions !== prevInitialSessionsRef.current) {
      prevInitialSessionsRef.current = initialSessions;
      setSessions(initialSessions);
      hadInitialSessionsRef.current = initialSessions.length > 0;
    }
  }, [initialSessions]);

  // Reset on agent change — skip skeleton and session fetch if parent provided cached sessions
  useEffect(() => {
    if (prevAgentRef.current === agentId) return;
    prevAgentRef.current = agentId;
    // Use the primary session key if provided, otherwise fall back to the default.
    // When initialSessionKey is undefined (primary key still resolving from connector),
    // use the fallback — the sync effect will update when the real key arrives.
    const newKey = initialSessionKey || `agent:${agentId}:main`;
    setOwnedSelectedSessionKey(newKey);
    setChatSessionKey(newKey);

    // If parent provided fresh cached sessions, skip the skeleton and session fetch
    const hasCachedSessions = initialSessions && initialSessions.length > 0;
    if (hasCachedSessions) {
      initialLoadDoneRef.current = true;
      hadInitialSessionsRef.current = true;
      setInitialReady(true);
      setSessions(initialSessions);
      // Only load chat history if we have the real primary key — otherwise the sync
      // effect will trigger it when initialSessionKey arrives.
      if (initialSessionKey) {
        loadChatHistory().catch(() => {});
      }
    } else {
      // No cached sessions — show skeleton while loading
      initialLoadDoneRef.current = false;
      setInitialReady(false);
      hadInitialSessionsRef.current = false;
      loadChatHistory().catch(() => {}).finally(() => {
        initialLoadDoneRef.current = true;
        setInitialReady(true);
        fetchSessionsRef.current();
      });
    }
  }, [agentId, setChatSessionKey, loadChatHistory, initialSessions, initialSessionKey, setOwnedSelectedSessionKey]);

  // Merge tool calls
  const mergeToolCalls = useMemo(() => createMergeToolCalls(), []);
  const mergedMessages = useMemo(() => mergeToolCalls(messages), [mergeToolCalls, messages]);

  // User info for avatar
  const { userInfo } = useUser();
  const userAvatar = {
    src: userInfo?.profilePic ? getMediaUrl(userInfo.profilePic) : undefined,
    fallback: userInfo?.username?.charAt(0).toUpperCase() || "U",
    alt: userInfo?.username || "User",
  };

  // Agent identity for avatar — always fetch so custom emoji/avatar is used
  const isProviderTab = backendTab === "claude-code" || backendTab === "codex" || backendTab === "hermes";
  const agentIdentity = useAgentIdentity(agentId);
  // Use HyperclawProv agent data as an immediate synchronous fallback while
  // agentIdentity is still loading from the bridge (avoids blank avatar on first render).
  const hyperclawAgent = agents.find((a) => a.id === agentId);
  const avatarSource = agentIdentity?.avatar ?? hyperclawAgent?.avatarData;
  const agentAvatarUrl = resolveAvatarUrl(avatarSource);
  const agentAvatarText = isAvatarText(avatarSource) ? avatarSource! : undefined;
  // Use agent's custom name if available, otherwise default to runtime name
  const agentNameStr = agentIdentity?.name
    || hyperclawAgent?.name
    || (backendTab === "claude-code" ? "Claude Code"
      : backendTab === "codex" ? "Codex"
      : backendTab === "hermes" ? "Hermes Agent"
      : (typeof currentAgent.name === "string" ? currentAgent.name : ""));

  // Default runtime icon paths
  const runtimeIconSrc = backendTab === "hermes" ? "/assets/hermes-agent.png"
    : backendTab === "claude-code" ? "/assets/claude-code.svg"
    : backendTab === "codex" ? "/assets/codex.svg"
    : undefined;

  // Default runtime fallback text
  const runtimeFallback = backendTab === "claude-code" ? "CC"
    : backendTab === "codex" ? "CX"
    : backendTab === "hermes" ? "H"
    : undefined;

  // Use custom avatar/emoji if agent has one, otherwise fall back to runtime defaults
  const customEmoji = agentAvatarText || agentIdentity?.emoji || hyperclawAgent?.emoji;
  const assistantAvatar = {
    // If agent has custom image avatar, use it; else if no custom emoji, use runtime icon
    src: agentAvatarUrl || (!customEmoji ? runtimeIconSrc : undefined),
    // If agent has custom emoji/text, use it; else use runtime fallback or initials
    fallback: customEmoji || runtimeFallback || agentNameStr.slice(0, 2).toUpperCase() || "AI",
    alt: agentNameStr || "AI Assistant",
  };

  // Scroll management
  const [inputAreaHeight, setInputAreaHeight] = useState(80);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const userScrolledAwayRef = useRef(false);
  const chainBreakerCacheRef = useRef<Map<string, GatewayChatMessage>>(new Map());

  // Quoted message for reply
  const [quotedMessage, setQuotedMessage] = useState<GatewayChatMessage | null>(null);

  // Message queue
  const [messageQueue, setMessageQueue] = useState<
    Array<{ id: string; text: string; displayText: string; attachments?: GatewayChatAttachment[] }>
  >([]);

  // Measure input area
  useEffect(() => {
    const el = inputAreaRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.offsetHeight;
      if (height > 0) setInputAreaHeight(height + 10);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [initialReady]);

  // Scroll handling
  const checkScrollPosition = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const el = scrollAreaRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    setShowScrollButton(!isAtBottom);
    userScrolledAwayRef.current = !isAtBottom;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  // Snap to bottom whenever history finishes loading for this agent / session.
  // On agent toggle, AgentChatWidget is remounted via key={chatSurfaceKey} in
  // EnsembleChat, so PanelChatView mounts fresh — initialReady starts false and
  // flips to true once loadChatHistory() resolves. That edge is our trigger.
  useEffect(() => {
    if (!initialReady) return;
    userScrolledAwayRef.current = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToBottom());
    });
    return () => cancelAnimationFrame(id);
  }, [initialReady, sessionKey, scrollToBottom]);

  // Keep pinned to bottom while bubbles finish reflowing after the snap —
  // markdown, syntax-highlighted code blocks, and images all expand the
  // inner height *after* the rAFs fire, which is why scrollTop alone lands
  // mid-history. ResizeObserver on the children re-snaps as content grows.
  // Disengages the moment the user scrolls up; auto-stops after the burst.
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el || !initialReady) return;

    const stick = () => {
      if (userScrolledAwayRef.current) return;
      el.scrollTop = el.scrollHeight;
    };

    const ro = new ResizeObserver(stick);
    for (const child of Array.from(el.children)) {
      ro.observe(child);
    }
    stick();

    const stopAt = window.setTimeout(() => ro.disconnect(), 2000);
    return () => {
      window.clearTimeout(stopAt);
      ro.disconnect();
    };
  }, [initialReady, sessionKey]);

  // Snap to bottom when the user sends a new message.
  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    if (messages.length > prevLen) {
      const last = messages[messages.length - 1];
      if (last?.role === "user") {
        userScrolledAwayRef.current = false;
        scrollToBottom();
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, scrollToBottom]);

  // Auto-send queued messages
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && messageQueue.length > 0) {
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      sendMessage(next.text, next.attachments);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, messageQueue, sendMessage]);

  // Attachment converter
  const toGatewayAttachments = useCallback(
    (attachments?: AttachmentType[]): GatewayChatAttachment[] | undefined => {
      if (!attachments?.length) return undefined;
      return attachments.map((att) => {
        const dataUrl = att.url || "";
        const mimeMatch = dataUrl.match(/^data:([^;]+);/);
        const mimeType = mimeMatch?.[1] || `${att.type}/*`;
        return { id: att.id, type: att.type, mimeType, name: att.name, dataUrl };
      });
    },
    []
  );

  // Clear the visible conversation while keeping the same UI session selected.
  const handleClearCurrentChat = useCallback(() => {
    if (inputBlocked) return;
    const currentKey = resolveClearedChatSessionKey(
      selectedSessionKeyForActiveAgent || initialSessionKey,
      agentId
    );
    setOwnedSelectedSessionKey(currentKey);
    setChatSessionKey(currentKey);
    clearChat();
    setMessageQueue([]);
    setQuotedMessage(null);
    setShowScrollButton(false);
    inputHandleRef.current?.clear();
  }, [
    agentId,
    clearChat,
    initialSessionKey,
    inputBlocked,
    selectedSessionKeyForActiveAgent,
    setOwnedSelectedSessionKey,
    setChatSessionKey,
  ]);

  // Session change
  const handleSessionChange = useCallback((newSessionKey: string) => {
    if (sendDisabledReason) return;
    // For Hermes sessions (keyed as "hermes:<uuid>"), seed the session state
    // so sendMessageViaHermes can resume the conversation instead of starting a new one.
    if (backendTab === "hermes" && newSessionKey.startsWith("hermes:")) {
      const hermesSessionId = newSessionKey.slice(7);
      seedHermesSession(newSessionKey, hermesSessionId);
    }
    setOwnedSelectedSessionKey(newSessionKey);
    setChatSessionKey(newSessionKey);
  }, [backendTab, sendDisabledReason, setChatSessionKey, setOwnedSelectedSessionKey]);

  // Export
  // Expose actions to parent via ref
  useImperativeHandle(ref, () => ({
    newChat: handleClearCurrentChat,
    reload: () => { loadChatHistory(); },
    sessions,
    sessionsLoading,
    sessionsError,
    selectedSessionKey: selectedSessionKeyForActiveAgent,
    onSessionChange: handleSessionChange,
    fetchSessions,
  }), [handleClearCurrentChat, loadChatHistory, sessions, sessionsLoading, sessionsError, selectedSessionKeyForActiveAgent, handleSessionChange, fetchSessions]);

  const handleExport = useCallback(() => {
    exportChatAsMarkdown(mergedMessages, currentAgent.name);
  }, [mergedMessages, currentAgent.name]);

  // Slash commands
  const handleInputChange = useCallback((value: string) => {
    if (value.startsWith("/")) {
      setSlashMenuVisible(true);
      setSlashQuery(value);
    } else {
      setSlashMenuVisible((prev) => prev ? false : prev);
      setSlashQuery((prev) => prev ? "" : prev);
    }
  }, []);

  const handleSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      setSlashMenuVisible(false);
      inputHandleRef.current?.clear();
      switch (cmd.name) {
        case "/new": handleClearCurrentChat(); break;
        case "/clear": handleClearCurrentChat(); break;
        case "/stop": stopGeneration(); break;
        case "/export": handleExport(); break;
        case "/reload": loadChatHistory(); break;
      }
    },
    [handleClearCurrentChat, stopGeneration, handleExport, loadChatHistory]
  );

  // Send message
  const handleSend = useCallback(
    async (message: string, attachments?: AttachmentType[]) => {
      if (inputBlocked) return;
      if (!message.trim() && (!attachments || attachments.length === 0)) return;

      const trimmed = message.trim();
      if (trimmed.startsWith("/")) {
        const matched = SLASH_COMMANDS.find(
          (cmd) => cmd.name === trimmed || trimmed.startsWith(cmd.name + " ")
        );
        if (matched) { handleSlashCommand(matched); return; }
      }

      let finalMessage = message;
      if (quotedMessage) {
        const quoted = quotedMessage.content.trim();
        const quotedLines = quoted.split("\n").map((l) => `> ${l}`).join("\n");
        const sender = quotedMessage.role === "user" ? "User" : "Assistant";
        finalMessage = `Replying to ${sender}:\n${quotedLines}\n\n${message}`;
        setQuotedMessage(null);
      }

      const gatewayAttachments = toGatewayAttachments(attachments);

      if (isLoading) {
        setMessageQueue((prev) => [
          ...prev,
          { id: crypto.randomUUID(), text: finalMessage, displayText: trimmed, attachments: gatewayAttachments },
        ]);
        return;
      }

      await sendMessage(finalMessage, gatewayAttachments);
    },
    [sendMessage, quotedMessage, isLoading, toGatewayAttachments, handleSlashCommand, inputBlocked]
  );

  // Callbacks
  const handleCopy = useCallback((message: GatewayChatMessage) => {
    navigator.clipboard.writeText(message.content || "");
  }, []);

  const handleReply = useCallback((message: GatewayChatMessage) => {
    setQuotedMessage(message);
  }, []);

  const shouldShowAvatarCallback = useCallback(
    (index: number) => shouldShowAvatarLocal(mergedMessages, index),
    [mergedMessages]
  );

  // Backend tabs
  const BACKEND_TABS: { id: BackendTab; label: string }[] = [
    { id: "openclaw", label: "OpenClaw" },
    { id: "claude-code", label: "Claude" },
    { id: "codex", label: "Codex" },
    { id: "hermes", label: "Hermes" },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Sub-header: backend tabs + session actions */}
      {showSubHeader && <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-0.5">
          {BACKEND_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onBackendTabChange(tab.id)}
              className={cn(
                "px-2 py-1 text-[10px] font-medium rounded transition-colors",
                backendTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={handleExport} title="Export chat">
            <Download className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={() => loadChatHistory()} title="Reload">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <SessionHistoryDropdown
            sessions={sessions}
            isLoading={sessionsLoading}
            error={sessionsError}
            currentSessionKey={selectedSessionKeyForActiveAgent}
            onLoadSession={handleSessionChange}
            onNewChat={handleClearCurrentChat}
            onFetchSessions={fetchSessions}
            newChatLabel="Clear Session"
            disabled={!!sendDisabledReason}
          />
        </div>
      </div>}

      {/* Messages area */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <CardContent
          ref={scrollAreaRef}
          onScroll={checkScrollPosition}
          className="flex-1 min-h-0 p-0 overflow-y-auto overflow-x-hidden customScrollbar2"
          style={{ scrollBehavior: "auto" }}
        >
          {!initialReady ? (
            <div className="p-4">
              <ChatLoadingSkeleton assistantAvatar={assistantAvatar} />
            </div>
          ) : (
            <>
              <div className="p-4 min-w-0">
                <div className="space-y-2 min-w-0 overflow-hidden">
                  {error && (
                    <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-xs flex items-center justify-between gap-2">
                      <span>{error}</span>
                      <button
                        onClick={() => loadChatHistory().catch(() => {})}
                        className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {messages.length === 0 ? (
                    inputBlocked ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-12">
                        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center grayscale">
                          <MessageSquare className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {sendDisabledReason ? "Chat locked" : `${backendTab === "openclaw" ? "OpenClaw" : backendTab === "claude-code" ? "Claude Code" : backendTab === "hermes" ? "Hermes" : "Codex"} not installed`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {sendDisabledReason || "Install the runtime to view chat history and send messages"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <EmptyState
                        userAvatar={userAvatar}
                        assistantAvatar={assistantAvatar}
                        onHintClick={() => {}}
                        personality={{
                          name: agentNameStr || currentAgent.name,
                          coverPhoto: "",
                          tag: backendTab === "hermes" ? "Hermes Agent"
                            : backendTab === "claude-code" ? "Claude Code"
                            : backendTab === "codex" ? "Codex"
                            : "OpenClaw Agent",
                        }}
                        suggestions={[]}
                        onSuggestionClick={() => {}}
                        isLoadingSuggestions={false}
                      />
                    )
                  ) : (
                    <>
                      {hasMoreHistory && (
                        <div className="flex justify-center py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7"
                            onClick={async () => {
                              const el = scrollAreaRef.current;
                              const prevHeight = el?.scrollHeight ?? 0;
                              await loadMoreHistory();
                              requestAnimationFrame(() => {
                                if (el) el.scrollTop = el.scrollHeight - prevHeight;
                              });
                            }}
                            disabled={isLoadingMore}
                          >
                            {isLoadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {isLoadingMore ? "Loading..." : "Load older messages"}
                          </Button>
                        </div>
                      )}

                      {(() => {
                        const nodes: React.ReactNode[] = [];

                        const msgHasToolCalls = (m: GatewayChatMessage) =>
                          (m.role === "assistant" &&
                            ((m as any).toolCalls?.length > 0 || (m as any).contentBlocks?.some((b: any) => b.type === "toolCall"))) ||
                          m.role === "toolResult" ||
                          (m as any).toolResults?.length > 0;

                        const copyButtonIndices = new Set<number>();
                        let lastAssistantWithText = -1;
                        for (let i = 0; i < mergedMessages.length; i++) {
                          const m = mergedMessages[i];
                          if (m.role === "assistant" && m.content?.trim()) lastAssistantWithText = i;
                          else if (m.role === "user" && lastAssistantWithText >= 0) {
                            copyButtonIndices.add(lastAssistantWithText);
                            lastAssistantWithText = -1;
                          }
                        }
                        if (lastAssistantWithText >= 0) copyButtonIndices.add(lastAssistantWithText);

                        for (let index = 0; index < mergedMessages.length; index++) {
                          const message = mergedMessages[index];
                          const isToolMessage = msgHasToolCalls(message);

                          if (!isToolMessage && message.role === "assistant" && message.content?.trim() && index > 0) {
                            const prev = mergedMessages[index - 1];
                            if (prev.role === "assistant" && prev.content?.trim() === message.content.trim()) continue;
                          }

                          if (isToolMessage) {
                            const toolMessages: GatewayChatMessage[] = [];
                            let j = index;
                            let chainBreakerContent: string | null = null;
                            let chainBreakerKey = "";

                            while (j < mergedMessages.length) {
                              const m = mergedMessages[j];
                              if (!msgHasToolCalls(m)) break;
                              toolMessages.push(m);
                              j++;
                              if (m.content?.trim()) {
                                chainBreakerContent = m.content;
                                chainBreakerKey = m.id || `chain-${j}`;
                                break;
                              }
                            }

                            if (toolMessages.length >= 1) {
                              nodes.push(
                                <GroupedToolActions
                                  key={`tool-actions-${index}`}
                                  toolMessages={toolMessages}
                                  toolStates={toolStates}
                                  toggleToolExpansion={toggleToolExpansion}
                                  showAvatar={shouldShowAvatarCallback(index)}
                                  assistantAvatar={assistantAvatar}
                                />
                              );

                              if (chainBreakerContent) {
                                const cacheKey = `chain-${chainBreakerKey}`;
                                let textOnly = chainBreakerCacheRef.current.get(cacheKey);
                                if (!textOnly || textOnly.content !== chainBreakerContent) {
                                  textOnly = { id: chainBreakerKey, role: "assistant", content: chainBreakerContent, timestamp: 0 };
                                  chainBreakerCacheRef.current.set(cacheKey, textOnly);
                                }
                                nodes.push(
                                  <EnhancedMessageBubble
                                    key={`tool-text-${index}-${chainBreakerKey}`}
                                    message={textOnly}
                                    isUser={false}
                                    showAvatar={false}
                                    onCopy={handleCopy}
                                    onReply={handleReply}
                                    isLoading={false}
                                    botPic={agentAvatarUrl}
                                    userPic={userAvatar}
                                    assistantAvatar={assistantAvatar}
                                  />
                                );
                              }
                              index = j - 1;
                              continue;
                            }
                          }

                          nodes.push(
                            <EnhancedMessageBubble
                              key={`${message.id}-${index}`}
                              message={message}
                              isUser={message.role === "user"}
                              showAvatar={shouldShowAvatarCallback(index)}
                              onCopy={handleCopy}
                              onReply={handleReply}
                              isLoading={
                                isLoading &&
                                index === mergedMessages.length - 1 &&
                                message.role === "assistant" &&
                                !message.content.trim()
                              }
                              isLastAssistantMessage={!isLoading && copyButtonIndices.has(index)}
                              botPic={agentAvatarUrl}
                              userPic={userAvatar}
                              assistantAvatar={assistantAvatar}
                            />
                          );
                        }

                        if (isLoading) {
                          const lastMsg = mergedMessages[mergedMessages.length - 1];
                          const lastIsEmptyAssistant = lastMsg?.role === "assistant" && !lastMsg.content?.trim() && !(lastMsg as any).toolCalls?.length;
                          const lastIsStreamingText = lastMsg?.role === "assistant" && lastMsg.content?.trim() && !(lastMsg as any).toolCalls?.length;
                          if (!lastIsEmptyAssistant && !lastIsStreamingText) {
                            const lastUserIdx = mergedMessages.reduce((acc, m, i) => m.role === "user" ? i : acc, -1);
                            const currentTurn = lastUserIdx >= 0 ? mergedMessages.slice(lastUserIdx + 1) : mergedMessages;
                            const toolCallCount = currentTurn.filter(m =>
                              m.role === "assistant" && (m as any).toolCalls?.length > 0
                            ).length;

                            let thinkingText = "AI is thinking";
                            if (toolCallCount > 0) {
                              thinkingText = `Executed ${toolCallCount} action${toolCallCount > 1 ? "s" : ""} — working`;
                            }

                            nodes.push(
                              <div key="thinking-indicator" className="flex gap-3 justify-start">
                                <div className="w-8 h-8 flex-shrink-0">
                                  <Avatar className="w-8 h-8">
                                    {assistantAvatar?.src ? (
                                      <AvatarImage src={assistantAvatar.src} alt={assistantAvatar.alt} />
                                    ) : null}
                                    <AvatarFallback className="bg-primary/10 text-primary">
                                      {assistantAvatar?.fallback
                                        ? <span className="text-xs">{assistantAvatar.fallback}</span>
                                        : <MessageSquare className="w-4 h-4" />}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>
                                <div className="flex items-center px-3 py-1.5">
                                  <AnimatedThinkingText text={thinkingText} />
                                </div>
                              </div>
                            );
                          }
                        }

                        return nodes;
                      })()}
                    </>
                  )}
                </div>
              </div>
              <div style={{ height: `${inputAreaHeight}px` }} />
            </>
          )}
        </CardContent>

        {/* Scroll to bottom */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute w-full flex justify-center z-50 pointer-events-none"
              style={{ bottom: `${inputAreaHeight}px` }}
            >
              <Button
                onClick={() => scrollToBottom()}
                size="icon"
                className="rounded-full h-fit w-fit p-1.5 shadow-lg pointer-events-auto"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div
          ref={inputAreaRef}
          className={cn(
            "absolute bottom-0 left-0 right-0 p-3 bg-transparent pointer-events-none",
            !initialReady && "hidden"
          )}
        >
          {/* Quoted message */}
          <AnimatePresence>
            {quotedMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="pointer-events-auto mb-2 flex items-start gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-background/90 backdrop-blur-sm"
              >
                <div className="flex-shrink-0 w-1 self-stretch rounded-full bg-primary/50" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                    Replying to {quotedMessage.role === "user" ? "yourself" : "assistant"}
                  </p>
                  <p className="text-xs text-foreground/80 line-clamp-2">
                    {quotedMessage.content?.slice(0, 150) || "..."}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => setQuotedMessage(null)}
                  className="h-5 w-5 flex-shrink-0 pointer-events-auto"
                >
                  <X className="w-3 h-3" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Message queue */}
          <AnimatePresence>
            {messageQueue.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="pointer-events-auto mb-2 space-y-1.5"
              >
                <div className="flex items-center gap-2 px-1">
                  <div className="h-px flex-1 bg-border/40" />
                  <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {messageQueue.length} queued
                  </span>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                {messageQueue.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8, height: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background/90 backdrop-blur-sm group hover:border-primary/30 transition-colors"
                  >
                    <span className="flex-shrink-0 text-[10px] text-muted-foreground/40 font-mono tabular-nums w-4 text-center">
                      {idx + 1}
                    </span>
                    <p className="flex-1 min-w-0 text-xs text-foreground/80 line-clamp-2">
                      {item.displayText}
                    </p>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => {
                        inputHandleRef.current?.setValue(item.displayText);
                        setMessageQueue((prev) => prev.filter((m) => m.id !== item.id));
                      }}
                      className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => setMessageQueue((prev) => prev.filter((m) => m.id !== item.id))}
                      className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <div className="relative pointer-events-auto">
            <SlashCommandMenu
              query={slashQuery}
              onSelect={handleSlashCommand}
              visible={slashMenuVisible}
              onClose={() => setSlashMenuVisible(false)}
            />
            <InputContainer
              onSendMessage={handleSend}
              placeholder={sendDisabledReason
                ? sendDisabledReason
                : runtimeUnavailable
                ? `${backendTab === "openclaw" ? "OpenClaw" : backendTab === "claude-code" ? "Claude Code" : backendTab === "hermes" ? "Hermes" : "Codex"} is not installed — view only`
                : `Ask ${agentNameStr || currentAgent.name} anything...`}
              isLoading={isLoading}
              isSending={isLoading}
              disabled={inputBlocked}
              showAttachments={!inputBlocked}
              showVoiceInput={false}
              showEmojiPicker={false}
              showActions={!inputBlocked}
              autoResize={true}
              allowEmptySend={false}
              maxAttachments={5}
              maxFileSize={5 * 1024 * 1024}
              allowedFileTypes={["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp"]}
              sessionKey={sessionKey}
              agentId={agentId}
              onStopGeneration={stopGeneration}
              onInputChange={handleInputChange}
              inputRef={inputHandleRef}
              {...(backendTab !== "openclaw" ? {
                runtimeModels,
                runtimeModelsLoading,
                currentModel: currentModel || "",
                onModelChange: setCurrentModel,
              } : {})}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default AgentChatPanel;
