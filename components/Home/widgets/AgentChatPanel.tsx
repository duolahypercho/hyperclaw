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
import { useGatewayChat, GatewayChatMessage, GatewayChatAttachment } from "@OS/AI/core/hook/use-gateway-chat";
import { useClaudeCodeChat } from "@OS/AI/core/hook/use-claude-code-chat";
import { useCodexChat } from "@OS/AI/core/hook/use-codex-chat";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useUser } from "$/Providers/UserProv";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import CopanionIcon from "@OS/assets/copanion";
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

/* ── Panel event ─────────────────────────────────────────── */

export const OPEN_AGENT_PANEL_EVENT = "open-agent-panel";

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
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const displayName = identity?.name || currentAgent.name;

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
                    onClick={() => setActiveTab("chat")}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                      activeTab === "chat"
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
              />
            </div>

            {/* Agent detail dialog */}
            <AgentDetailDialog
              open={editDialogOpen}
              onOpenChange={setEditDialogOpen}
              agentId={agentId}
              agentName={displayName}
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
  sessions: Array<{ key: string; label?: string; updatedAt?: number }>;
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
  onSessionsUpdate?: (sessions: Array<{ key: string; label?: string; updatedAt?: number }>) => void;
}

export const PanelChatView = forwardRef<PanelChatViewHandle, PanelChatViewProps>(function PanelChatView({
  agentId,
  initialSessionKey,
  backendTab,
  onSessionsUpdate,
  onBackendTabChange,
  showSubHeader = true,
}, ref) {
  const { agents } = useHyperclawContext();
  const currentAgent = agents.find((a) => a.id === agentId) || {
    id: agentId,
    name: agentId,
    icon: "🤖",
    coverPhoto: "",
  };

  // Sessions
  const [sessions, setSessions] = useState<Array<{ key: string; label?: string; updatedAt?: number }>>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | undefined>(initialSessionKey);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const inputHandleRef = useRef<InputContainerHandle | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Slash command state
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");

  // Dynamic model list
  const { models: runtimeModels, loading: runtimeModelsLoading } = useRuntimeModels(backendTab);

  // Session key
  const sessionKey = selectedSessionKey || `agent:${agentId}:main`;

  // Determine effective provider
  const effectiveProvider = backendTab === "claude-code" ? "claude-code"
    : backendTab === "codex" ? "codex"
    : "gateway";

  const gatewayChat = useGatewayChat({
    sessionKey,
    autoConnect: effectiveProvider === "gateway",
    backend: backendTab === "hermes" ? "hermes" : "openclaw",
  });

  const claudeCodeChat = useClaudeCodeChat({
    sessionKey,
    autoConnect: effectiveProvider === "claude-code",
  });

  const codexChat = useCodexChat({
    sessionKey,
    autoConnect: effectiveProvider === "codex",
  });

  const activeChat = effectiveProvider === "claude-code" ? claudeCodeChat
    : effectiveProvider === "codex" ? codexChat
    : gatewayChat;

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

  // Initial load
  const initialLoadDoneRef = useRef(false);
  const [initialReady, setInitialReady] = useState(false);

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    loadChatHistory()
      .catch(() => {})
      .finally(() => {
        setInitialReady(true);
        fetchSessions();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset on agent change
  const prevAgentRef = useRef(agentId);
  useEffect(() => {
    if (prevAgentRef.current === agentId) return;
    prevAgentRef.current = agentId;
    const newKey = `agent:${agentId}:main`;
    setSelectedSessionKey(newKey);
    setChatSessionKey(newKey);
    initialLoadDoneRef.current = false;
    setInitialReady(false);
    loadChatHistory().catch(() => {}).finally(() => {
      initialLoadDoneRef.current = true;
      setInitialReady(true);
      fetchSessions();
    });
  }, [agentId, setChatSessionKey, loadChatHistory]);

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
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      let result: Array<{ key: string; label?: string; updatedAt?: number }> = [];
      if (backendTab === "openclaw") {
        if (gatewayConnection.isConnected()) {
          const r = await gatewayConnection.listSessions(agentId, 50).catch(() => ({ sessions: [] as any[] }));
          result = (r.sessions || []).map((s: any) => ({ ...s, label: s.label || s.key }));
        }
      } else if (backendTab === "claude-code") {
        const r = await bridgeInvoke("claude-code-list-sessions", {}).catch(() => ({ sessions: [] })) as any;
        result = (r?.sessions || []).map((s: any) => ({
          key: s.key || `claude:${s.id}`,
          label: s.label || s.id?.slice(0, 8),
          updatedAt: s.updatedAt,
        }));
      } else if (backendTab === "codex") {
        const r = await bridgeInvoke("codex-list-sessions", {}).catch(() => ({ sessions: [] })) as any;
        result = (r?.sessions || []).map((s: any) => ({
          key: s.key || `codex:${s.id}`,
          label: s.label || s.id?.slice(0, 8),
          updatedAt: s.updatedAt,
        }));
      } else if (backendTab === "hermes") {
        const r = await bridgeInvoke("hermes-list-sessions", {}).catch(() => ({ sessions: [] })) as any;
        result = (r?.sessions || []).map((s: any) => ({
          key: s.key || `hermes:${s.id}`,
          label: s.label || s.id?.slice(0, 16),
          updatedAt: s.updatedAt,
        }));
      }
      result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setSessions(result);
      onSessionsUpdate?.(result);
    } catch {
      setSessionsError("Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, [agentId, backendTab]);

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

  // Agent identity for avatar
  const isProviderTab = backendTab === "claude-code" || backendTab === "codex" || backendTab === "hermes";
  const agentIdentity = useAgentIdentity(isProviderTab ? undefined : agentId);
  const agentNameStr = backendTab === "claude-code" ? "Claude Code"
    : backendTab === "codex" ? "Codex"
    : backendTab === "hermes" ? "Hermes Agent"
    : agentIdentity?.name || (typeof currentAgent.name === "string" ? currentAgent.name : "");
  const agentAvatarUrl = isProviderTab ? undefined : resolveAvatarUrl(agentIdentity?.avatar);
  const agentAvatarText = isProviderTab ? undefined : (isAvatarText(agentIdentity?.avatar) ? agentIdentity!.avatar! : undefined);

  const assistantAvatar = {
    src: backendTab === "hermes" ? "/assets/hermes-agent.png"
      : backendTab === "claude-code" ? "/assets/claude-code.svg"
      : backendTab === "codex" ? "/assets/codex.svg"
      : agentAvatarUrl,
    fallback: backendTab === "claude-code" ? "CC"
      : backendTab === "codex" ? "CX"
      : backendTab === "hermes" ? "H"
      : agentAvatarText || agentIdentity?.emoji || agentNameStr.slice(0, 2).toUpperCase() || "AI",
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

  // Auto-scroll on new messages
  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;
    if (messages.length <= prevLen) {
      prevMessagesLengthRef.current = messages.length;
      return;
    }
    if (prevLen === 0 && messages.length > 1) {
      prevMessagesLengthRef.current = messages.length;
      userScrolledAwayRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom()));
      return;
    }
    const newMsg = messages[messages.length - 1];
    if (newMsg?.role === "user") {
      userScrolledAwayRef.current = false;
      scrollToBottom();
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, messages, scrollToBottom]);

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

  // New chat
  const handleNewChat = useCallback(() => {
    const newKey = `agent:${agentId}:chat-${Date.now()}`;
    setSelectedSessionKey(newKey);
    setChatSessionKey(newKey);
    fetchSessions();
  }, [agentId, setChatSessionKey, fetchSessions]);

  // Session change
  const handleSessionChange = useCallback((newSessionKey: string) => {
    setSelectedSessionKey(newSessionKey);
    setChatSessionKey(newSessionKey);
  }, [setChatSessionKey]);

  // Export
  // Expose actions to parent via ref
  useImperativeHandle(ref, () => ({
    newChat: handleNewChat,
    reload: () => { loadChatHistory(); },
    sessions,
    sessionsLoading,
    sessionsError,
    selectedSessionKey,
    onSessionChange: handleSessionChange,
    fetchSessions,
  }), [handleNewChat, loadChatHistory, sessions, sessionsLoading, sessionsError, selectedSessionKey, handleSessionChange, fetchSessions]);

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
        case "/new": handleNewChat(); break;
        case "/clear": clearChat(); break;
        case "/stop": stopGeneration(); break;
        case "/export": handleExport(); break;
        case "/reload": loadChatHistory(); break;
      }
    },
    [handleNewChat, clearChat, stopGeneration, handleExport, loadChatHistory]
  );

  // Send message
  const handleSend = useCallback(
    async (message: string, attachments?: AttachmentType[]) => {
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
    [sendMessage, quotedMessage, isLoading, toGatewayAttachments, handleSlashCommand]
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
          <Button variant="ghost" size="iconSm" className="h-6 w-6" onClick={handleNewChat} title="New chat">
            <Plus className="w-3 h-3" />
          </Button>
          <SessionHistoryDropdown
            sessions={sessions}
            isLoading={sessionsLoading}
            error={sessionsError}
            currentSessionKey={selectedSessionKey}
            onLoadSession={handleSessionChange}
            onNewChat={handleNewChat}
            onFetchSessions={fetchSessions}
          />
        </div>
      </div>}

      {/* Messages area */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <CardContent
          ref={scrollAreaRef}
          onScroll={checkScrollPosition}
          className="flex-1 min-h-0 p-0 overflow-y-auto overflow-x-hidden customScrollbar2"
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
                    <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
                      {error}
                    </div>
                  )}

                  {messages.length === 0 ? (
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
                                        : <CopanionIcon className="w-4 h-4" />}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>
                                <div className="flex items-center py-1.5">
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
                onClick={scrollToBottom}
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
              placeholder={`Ask ${agentNameStr || currentAgent.name} anything...`}
              isLoading={isLoading}
              isSending={isLoading}
              showAttachments={true}
              showVoiceInput={false}
              showEmojiPicker={false}
              showActions={true}
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
