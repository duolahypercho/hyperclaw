"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import { X, Paperclip, Pencil, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGatewayChat, GatewayChatMessage, GatewayChatAttachment } from "@OS/AI/core/hook/use-gateway-chat";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { useUser } from "$/Providers/UserProv";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CopanionIcon from "@OS/assets/copanion";
import { getMediaUrl } from "$/utils";
import {
  AnimatedThinkingText,
  ChatLoadingSkeleton,
  EmptyState,
} from "@OS/AI/components/Chat";
import type { AttachmentType, InputContainerHandle } from "@OS/AI/components/Chat";
import { InputContainer } from "@OS/AI/components/InputContainer";
import { useFocusMode } from "./hooks/useFocusMode";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import { useAgentIdentity, resolveAvatarUrl, isAvatarText } from "$/hooks/useAgentIdentity";

import { GatewayChatCustomHeader } from "./gateway-chat/GatewayChatHeader";
import { EnhancedMessageBubble, shouldShowAvatarLocal } from "./gateway-chat/EnhancedMessageBubble";
import { GroupedToolActions } from "./gateway-chat/GroupedToolActions";
import { mergeToolCallsWithResults } from "./gateway-chat/mergeToolCallsWithResults";
import { exportChatAsMarkdown } from "./gateway-chat/exportChat";
import { SlashCommandMenu } from "./gateway-chat/SlashCommandMenu";
import { SLASH_COMMANDS, type SlashCommand } from "./gateway-chat/slashCommands";

export { GatewayChatCustomHeader };

// GatewayChat Widget Content - matches CopilotChat UI
const GatewayChatWidgetContent: React.FC<CustomProps> = (props) => {
  const { widget, isEditMode, onConfigChange } = props;
  const { isFocusModeActive } = useFocusMode();

  // Get OpenClaw agents from provider
  const { agents, loading: agentsLoading } = useOpenClawContext();

  // Get agent config from widget config (persisted to SQLite via dashboardState)
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const configSessionKey = config?.sessionKey as string | undefined;

  // Local state for selected agent - initialized from widget config
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    configAgentId
  );

  // Imperative ref for InputContainer (clear/focus without controlled mode)
  const inputHandleRef = useRef<InputContainerHandle | null>(null);

  // Slash command menu state
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");

  // Track if user has manually selected an agent
  const [userHasSelectedAgent, setUserHasSelectedAgent] = useState(!!configAgentId);


  // Sessions state - initialize with configSessionKey if provided
  const [sessions, setSessions] = useState<Array<{ key: string; label?: string; updatedAt?: number }>>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | undefined>(
    configSessionKey
  );
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Sync config → local state when config loads after mount (e.g., async SQLite hydration).
  // useState initializers only run once, so late-arriving config needs an effect to propagate.
  useEffect(() => {
    if (configAgentId && !selectedAgentId) {
      setSelectedAgentId(configAgentId);
      setUserHasSelectedAgent(true);
    }
  }, [configAgentId, selectedAgentId]);

  useEffect(() => {
    if (configSessionKey && !selectedSessionKey) {
      setSelectedSessionKey(configSessionKey);
    }
  }, [configSessionKey, selectedSessionKey]);

  // Stable ref for onConfigChange to avoid re-triggering the persist effect
  // when Dashboard re-renders and creates a new closure.
  const onConfigChangeRef = useRef(onConfigChange);
  onConfigChangeRef.current = onConfigChange;

  // Persist widget config to dashboardState (SQLite) so it syncs across devices.
  // Only persist agentId and sessionKey — inputValue is ephemeral.
  // On unmount, flush the pending save instead of discarding it so navigation
  // within 500ms doesn't silently drop the user's last selection.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistValuesRef = useRef({ agentId: selectedAgentId, sessionKey: selectedSessionKey });
  persistValuesRef.current = { agentId: selectedAgentId, sessionKey: selectedSessionKey };

  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      onConfigChangeRef.current?.({ agentId: selectedAgentId, sessionKey: selectedSessionKey });
      persistTimerRef.current = null;
    }, 500);
    return () => {
      // Flush on unmount — save pending changes instead of losing them
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        onConfigChangeRef.current?.(persistValuesRef.current);
      }
    };
  }, [selectedAgentId, selectedSessionKey]);

  // Resolve the effective agent ID.  Priority:
  // 1. User's explicit selection (persisted or in-session)
  // 2. Widget config
  // 3. First available agent from the registry
  // 4. Fallback "main"
  // IMPORTANT: Once resolved, we lock it via a ref so that agents list re-fetches
  // don't cause the ID to bounce back to a different agent.
  const resolvedAgentIdRef = useRef<string | undefined>(selectedAgentId);
  const currentAgentId = useMemo(() => {
    // If user explicitly selected an agent, always honour it
    if (userHasSelectedAgent && selectedAgentId) {
      resolvedAgentIdRef.current = selectedAgentId;
      return selectedAgentId;
    }
    // If we already resolved an ID, keep it — even if agents list is temporarily empty (loading)
    if (resolvedAgentIdRef.current) {
      if (agents.length === 0 || agents.find(a => a.id === resolvedAgentIdRef.current)) {
        return resolvedAgentIdRef.current;
      }
    }
    // Resolve for the first time
    const id = selectedAgentId || configAgentId || agents[0]?.id || "main";
    resolvedAgentIdRef.current = id;
    return id;
  }, [userHasSelectedAgent, selectedAgentId, configAgentId, agents]);

  const currentAgent = agents.find(a => a.id === currentAgentId) || { id: "main", name: "General Assistant", icon: "🤖", coverPhoto: "" };

  // Generate session key - use selected session or create new one
  // When no session is selected, use the agent's main session to load existing chat history
  // The format follows OpenClaw's session key pattern: agent:{agentId}:main
  const sessionKey = selectedSessionKey || `agent:${currentAgentId}:main`;

  const {
    messages,
    isLoading,
    isConnected,
    error,
    sessionKey: currentSessionKey,
    hasMoreHistory,
    isLoadingMore,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    loadMoreHistory,
    clearChat,
    setSessionKey,
  } = useGatewayChat({
    sessionKey,
    autoConnect: true,
  });

  // Unified tool state management - handles ALL tool types!
  const { toolStates, toggleToolExpansion, resetToolStates } = useUnifiedToolState(messages as any);

  // Keep the hook's internal session key in sync with the widget's computed
  // sessionKey. The hook uses a ref internally, so it won't update unless we
  // explicitly call setSessionKey(). This handles agent resolution, session
  // switches, and initial prop changes that happen after the first render.
  useEffect(() => {
    setSessionKey(sessionKey);
  }, [sessionKey, setSessionKey]);

  // Show skeleton until agents are loaded, WS is connected, and first history load completes.
  // Once true, never resets — subsequent session switches keep existing UI visible.
  const initialLoadDoneRef = useRef(false);
  const [initialReady, setInitialReady] = useState(false);

  useEffect(() => {
    if (initialLoadDoneRef.current) return; // already done, never re-show skeleton
    if (!agentsLoading && isConnected) {
      // Set ref synchronously to prevent duplicate fires while async work is in flight
      initialLoadDoneRef.current = true;
      // Agents loaded + connected — load history and sessions in parallel
      Promise.all([
        loadChatHistory(),
        gatewayConnection.isConnected()
          ? gatewayConnection.listSessions(currentAgentId, 20).then(r => {
              console.log("[GatewayChat] Initial sessions loaded:", r.sessions?.length ?? 0);
              setSessions(r.sessions || []);
            }).catch((err) => {
              console.warn("[GatewayChat] Initial session list fetch failed:", err);
            })
          : Promise.resolve(),
      ]).then(() => {
        setInitialReady(true);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsLoading, isConnected]);

  // Reload chat history when session changes (after initial load is done).
  // Connection state changes are handled by use-gateway-chat internally.
  const prevSessionKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!initialLoadDoneRef.current) return; // initial load handles first fetch
    if (!sessionKey || sessionKey === prevSessionKeyRef.current) return;
    prevSessionKeyRef.current = sessionKey;
    if (isConnected) {
      loadChatHistory();
    }
  }, [isConnected, loadChatHistory, sessionKey]);

  // Fetch sessions when agent changes (not on every connection toggle).
  // Initial load is handled by the parallel fetch above, so skip if not ready yet.
  const prevAgentIdForSessionsRef = useRef(currentAgentId);
  useEffect(() => {
    if (!initialLoadDoneRef.current) return; // initial load handles its own fetch
    if (prevAgentIdForSessionsRef.current === currentAgentId) return;
    prevAgentIdForSessionsRef.current = currentAgentId;
    const fetchSessions = async () => {
      if (!gatewayConnection.isConnected()) return;
      setSessionsLoading(true);
      try {
        const result = await gatewayConnection.listSessions(currentAgentId, 20);
        setSessions(result.sessions || []);
      } catch (err) {
        console.error("[GatewayChat] Failed to fetch sessions:", err);
        setSessions([]);
      } finally {
        setSessionsLoading(false);
      }
    };
    fetchSessions();
  }, [currentAgentId]);

  // Manual fetch sessions callback (for dropdown)
  const fetchSessions = useCallback(async () => {
    if (!gatewayConnection.isConnected()) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const result = await gatewayConnection.listSessions(currentAgentId, 50);
      setSessions(result.sessions || []);
    } catch (err) {
      console.error("[GatewayChat] Failed to fetch sessions:", err);
      setSessionsError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, [currentAgentId]);

  // New chat — create a brand new session key so the old session is preserved
  const handleNewChat = useCallback(async () => {
    const newKey = `agent:${currentAgentId}:chat-${Date.now()}`;
    setSelectedSessionKey(newKey);
    setSessionKey(newKey);
    // Clear stale context data — new session has no usage yet
    setSessionContextTokens(null);
    setSessionTotalTokens(null);
    // Refresh session list so the previous session appears in history
    if (gatewayConnection.isConnected()) {
      try {
        const result = await gatewayConnection.listSessions(currentAgentId, 50);
        setSessions(result.sessions || []);
      } catch {}
    }
  }, [setSessionKey, currentAgentId]);

  // Reload chat — re-fetch messages from server
  const handleReloadChat = useCallback(() => {
    loadChatHistory();
  }, [loadChatHistory]);

  // Get user info for avatar
  const { userInfo } = useUser();

  // Local state
  const [inputAreaHeight, setInputAreaHeight] = useState(100);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState<GatewayChatMessage | null>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Cache for chain-breaker text-only messages to prevent re-renders
  const chainBreakerCacheRef = useRef<Map<string, GatewayChatMessage>>(new Map());

  // Message queue — messages queued while AI is still generating
  const [messageQueue, setMessageQueue] = useState<
    Array<{ id: string; text: string; displayText: string; attachments?: GatewayChatAttachment[] }>
  >([]);

  // Handle agent change - properly reset all state for new agent
  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setUserHasSelectedAgent(true); // Mark that user has manually selected

    // Generate new session key and persist both agent + session together
    // so the persist effect saves the correct pair to SQLite.
    const newSessionKey = `agent:${agentId}:main`;
    setSelectedSessionKey(newSessionKey);
    setSessionKey(newSessionKey); // This will clear state in the hook
  }, [setSessionKey]);

  // Note: StatusWidget now opens a floating chat popout instead of switching this widget

  // Handle session change - clear and prepare for new session
  const handleSessionChange = useCallback(async (newSessionKey: string) => {
    // Use hook's setSessionKey to properly clear state
    setSelectedSessionKey(newSessionKey);
    setSessionKey(newSessionKey);
  }, [setSessionKey]);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasMessages = messages.length > 0;

  // Merge tool calls with their results
  const mergedMessages = useMemo(() => mergeToolCallsWithResults(messages), [messages]);

  // Export chat as markdown file download
  const handleExport = useCallback(() => {
    exportChatAsMarkdown(mergedMessages, currentAgent.name);
  }, [mergedMessages, currentAgent.name]);

  // Measure input area height using ResizeObserver for reliable tracking
  useEffect(() => {
    const el = inputAreaRef.current;
    if (!el) return;

    const measure = () => {
      const height = el.offsetHeight;
      if (height > 0) {
        setInputAreaHeight(height + 10);
      }
    };

    // ResizeObserver fires when element size changes (including hidden→visible)
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();

    return () => ro.disconnect();
  }, [initialReady]);

  // Convert AttachmentType to GatewayChatAttachment (shared helper)
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

  // Auto-send next queued message when AI finishes generating
  const prevLoadingRef2 = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingRef2.current && !isLoading && messageQueue.length > 0) {
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      sendMessage(next.text, next.attachments);
    }
    prevLoadingRef2.current = isLoading;
  }, [isLoading, messageQueue, sendMessage]);

  // Queue handlers
  const handleEditQueueItem = useCallback(
    (id: string) => {
      const item = messageQueue.find((m) => m.id === id);
      if (item) {
        inputHandleRef.current?.setValue(item.displayText);
        setMessageQueue((prev) => prev.filter((m) => m.id !== id));
      }
    },
    [messageQueue]
  );

  const handleDeleteQueueItem = useCallback((id: string) => {
    setMessageQueue((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Handle reply — set quoted message
  const handleReply = useCallback((message: GatewayChatMessage) => {
    setQuotedMessage(message);
  }, []);

  // Handle copy
  const handleCopy = useCallback((message: GatewayChatMessage) => {
    const content = message.content || "";
    navigator.clipboard.writeText(content);
  }, []);

  // true when the user has manually scrolled away from the bottom during generation
  const userScrolledAwayRef = useRef(false);

  // Check scroll position
  const checkScrollPosition = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const element = scrollAreaRef.current;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
    setShowScrollButton(!isAtBottom);
    // Track whether the user scrolled away — if they scroll back to bottom, re-enable auto-scroll
    userScrolledAwayRef.current = !isAtBottom;
  }, []);

  // Scroll to bottom - instant, no animation
  const scrollToBottom = useCallback((_smooth = false) => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  // Auto-scroll only on initial load / session switch and when the user sends a message.
  // Do NOT auto-scroll during streaming or when assistant messages arrive.
  const prevMessagesLengthRef = useRef<number>(0);
  useEffect(() => {
    const prevLen = prevMessagesLengthRef.current;

    if (messages.length <= prevLen) {
      prevMessagesLengthRef.current = messages.length;
      // Streaming delta — do not auto-scroll.
      return;
    }

    // Bulk history load (session switch): previous was 0 or empty, now has many messages.
    // Always scroll to bottom so the user sees the latest messages.
    if (prevLen === 0 && messages.length > 1) {
      prevMessagesLengthRef.current = messages.length;
      userScrolledAwayRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom(false)));
      return;
    }

    const newMsg = messages[messages.length - 1];

    if (newMsg?.role === "user") {
      // User just sent — always scroll and reset the flag.
      userScrolledAwayRef.current = false;
      scrollToBottom(false);
    }
    // Do not auto-scroll for assistant messages or other new messages.
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, messages, scrollToBottom]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter((c) => {
      const next = c + 1;
      if (next === 1) {
        setIsDragging(true);
        dragTimeoutRef.current = setTimeout(() => {
          setIsDragging(false);
          setDragCounter(0);
        }, 10000);
      }
      return next;
    });
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter((c) => {
      const next = c - 1;
      if (next <= 0) {
        setIsDragging(false);
        setDragCounter(0);
        if (dragTimeoutRef.current) {
          clearTimeout(dragTimeoutRef.current);
          dragTimeoutRef.current = null;
        }
      }
      return next;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter(0);
    setIsDragging(false);
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }
  }, []);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

  // Reset chat
  const reset = useCallback(() => {
    if (isLoading) return;
    clearChat();
    setShowScrollButton(false);
    inputHandleRef.current?.clear();
  }, [isLoading, clearChat]);

  // Lightweight input change handler — only updates slash state when needed
  const handleInputChange = useCallback((value: string) => {
    if (value.startsWith("/")) {
      setSlashMenuVisible(true);
      setSlashQuery(value);
    } else {
      setSlashMenuVisible((prev) => prev ? false : prev);
      setSlashQuery((prev) => prev ? "" : prev);
    }
  }, []);

  // Execute a slash command and clear the input
  const handleSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      setSlashMenuVisible(false);
      inputHandleRef.current?.clear();

      switch (cmd.name) {
        case "/new":
          handleNewChat();
          break;
        case "/clear":
          reset();
          break;
        case "/stop":
          stopGeneration();
          break;
        case "/export":
          handleExport();
          break;
        case "/reload":
          handleReloadChat();
          break;
        default:
          break;
      }
    },
    [handleNewChat, reset, stopGeneration, handleExport, handleReloadChat]
  );

  // Handle send — queues the message if AI is still generating
  const handleSend = useCallback(
    async (message: string, attachments?: AttachmentType[]) => {
      if (!message.trim() && (!attachments || attachments.length === 0)) return;

      // Intercept slash commands — if the trimmed input matches a known command, execute it
      const trimmed = message.trim();
      if (trimmed.startsWith("/")) {
        const matched = SLASH_COMMANDS.find(
          (cmd) => cmd.name === trimmed || trimmed.startsWith(cmd.name + " ")
        );
        if (matched) {
          handleSlashCommand(matched);
          return;
        }
      }

      const displayText = trimmed;

      // Prepend quoted message as blockquote context
      let finalMessage = message;
      if (quotedMessage) {
        const quoted = quotedMessage.content.trim();
        const quotedLines = quoted.split("\n").map((l) => `> ${l}`).join("\n");
        const sender = quotedMessage.role === "user" ? "User" : "Assistant";
        finalMessage = `Replying to ${sender}:\n${quotedLines}\n\n${message}`;
        setQuotedMessage(null);
      }

      const gatewayAttachments = toGatewayAttachments(attachments);

      // If AI is generating, queue the message instead of sending
      if (isLoading) {
        setMessageQueue((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: finalMessage,
            displayText,
            attachments: gatewayAttachments,
          },
        ]);
        return;
      }

      await sendMessage(finalMessage, gatewayAttachments);
    },
    [sendMessage, quotedMessage, isLoading, toGatewayAttachments, handleSlashCommand]
  );

  // Determine if avatar should be shown (use mergedMessages since rendering iterates over it)
  const shouldShowAvatarCallback = useCallback(
    (index: number) => shouldShowAvatarLocal(mergedMessages, index),
    [mergedMessages]
  );

  // Real context window data from the gateway session entry.
  // Synced on initial load, session switches, and after each agent run completes.
  const [sessionContextTokens, setSessionContextTokens] = useState<number | null>(null);
  const [sessionTotalTokens, setSessionTotalTokens] = useState<number | null>(null);

  const fetchSessionContext = useCallback(async () => {
    if (!gatewayConnection.isConnected()) return;
    try {
      const data = await gatewayConnection.getSession(sessionKey) as {
        contextTokens?: number;
        totalTokens?: number;
      } | null;
      if (data?.contextTokens && data.contextTokens > 0) {
        setSessionContextTokens(data.contextTokens);
      }
      if (typeof data?.totalTokens === "number") {
        setSessionTotalTokens(data.totalTokens);
      }
    } catch {
      // Gateway may not support sessions.get — fall back to estimates
    }
  }, [sessionKey]);

  // Fetch context on initial ready + session changes
  useEffect(() => {
    if (!initialReady || !isConnected) return;
    fetchSessionContext();
  }, [initialReady, isConnected, sessionKey, fetchSessionContext]);

  // Re-fetch after each agent run completes (isLoading transitions false → fresh data)
  const prevLoadingForContextRef = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingForContextRef.current && !isLoading) {
      fetchSessionContext();
    }
    prevLoadingForContextRef.current = isLoading;
  }, [isLoading, fetchSessionContext]);

  // Estimate token usage from messages (rough: ~4 chars per token) — fallback only
  const estimatedTokenUsage = useMemo(() => {
    let chars = 0;
    for (const msg of mergedMessages) {
      chars += (msg.content || "").length;
      if ((msg as any).toolCalls) {
        for (const tc of (msg as any).toolCalls) {
          chars += (tc.function?.arguments || tc.arguments || "").length;
          chars += (tc.result || "").length;
        }
      }
    }
    return Math.round(chars / 4);
  }, [mergedMessages]);

  // Use real gateway values when available, fall back to client-side estimates
  const tokenUsage = sessionTotalTokens ?? estimatedTokenUsage;
  const contextLimit = sessionContextTokens ?? 200_000;

  // Get user avatar from user profile
  const userAvatar = {
    src: userInfo?.profilePic ? getMediaUrl(userInfo.profilePic) : undefined,
    fallback: userInfo?.username?.charAt(0).toUpperCase() || "U",
    alt: userInfo?.username || "User",
  };

  // Get agent identity from OpenClaw (avatar, name, emoji)
  const agentIdentity = useAgentIdentity(currentAgentId);
  const agentNameStr = agentIdentity?.name || (typeof currentAgent.name === "string" ? currentAgent.name : "");
  const agentAvatarUrl = resolveAvatarUrl(agentIdentity?.avatar);
  const agentAvatarText = isAvatarText(agentIdentity?.avatar) ? agentIdentity!.avatar! : undefined;
  const assistantAvatar = {
    src: agentAvatarUrl,
    fallback: agentAvatarText || agentIdentity?.emoji || agentNameStr.slice(0, 2).toUpperCase() || "AI",
    alt: agentNameStr || "AI Assistant",
  };

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
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag and drop overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none bg-background/30 border-2 border-dashed border-primary/60 shadow-2xl backdrop-blur-xl rounded-md z-50"
            >
              <div className="flex flex-col items-center justify-center">
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Paperclip className="w-8 h-8 text-primary" />
                </motion.div>
                <motion.span
                  className="text-xl font-semibold text-primary drop-shadow-lg mb-2"
                  animate={{ opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Drop your files here!
                </motion.span>
                <span className="text-sm text-muted-foreground text-center px-4">
                  Let your ideas flow—just drag and drop to upload.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Header */}
        <GatewayChatCustomHeader
          {...props}
          currentAgentId={currentAgentId}
          onAgentChange={handleAgentChange}
          selectedSessionKey={selectedSessionKey}
          onSessionChange={handleSessionChange}
          onNewChat={handleNewChat}
          onReloadChat={handleReloadChat}
          onExport={handleExport}
          onFetchSessions={fetchSessions}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          sessionsError={sessionsError}
          isConnected={isConnected}
        />

        <div className="flex flex-col w-full flex-1 p-0 overflow-hidden">
          <div className="flex flex-col w-full flex-1 p-0 overflow-hidden relative">
            {/* Messages Area */}
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
                  {/* Error display */}
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
                        tag: "OpenClaw Agent",
                      }}
                      suggestions={[]}
                      onSuggestionClick={() => {}}
                      isLoadingSuggestions={false}
                    />
                  ) : (
                    <>
                      {/* Load older messages button */}
                      {hasMoreHistory && (
                        <div className="flex justify-center py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7"
                            onClick={async () => {
                              // Preserve scroll position after prepending older messages
                              const el = scrollAreaRef.current;
                              const prevHeight = el?.scrollHeight ?? 0;
                              await loadMoreHistory();
                              requestAnimationFrame(() => {
                                if (el) {
                                  el.scrollTop = el.scrollHeight - prevHeight;
                                }
                              });
                            }}
                            disabled={isLoadingMore}
                          >
                            {isLoadingMore ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : null}
                            {isLoadingMore ? "Loading..." : "Load older messages"}
                          </Button>
                        </div>
                      )}
                      {(() => {
                        const nodes: React.ReactNode[] = [];

                        // Helper: does this assistant message contain tool calls?
                        const msgHasToolCalls = (m: GatewayChatMessage) =>
                          m.role === "assistant" &&
                          ((m as any).toolCalls?.length > 0 || (m as any).contentBlocks?.some((b: any) => b.type === "toolCall"));

                        for (let index = 0; index < mergedMessages.length; index++) {
                          const message = mergedMessages[index];
                          const isToolMessage = msgHasToolCalls(message);

                          // Deduplicate: skip text-only assistant messages with identical content
                          // to the previous message (gateway sometimes sends same text twice).
                          // Never skip tool messages — different tool calls can share narration text.
                          if (!isToolMessage && message.role === "assistant" && message.content?.trim() && index > 0) {
                            const prev = mergedMessages[index - 1];
                            if (prev.role === "assistant" && prev.content?.trim() === message.content.trim()) {
                              continue;
                            }
                          }

                          // Group consecutive tool messages into "N actions".
                          // Collect greedily. If a tool message has content, include it
                          // in the group but show its message text after and break the chain.
                          if (isToolMessage) {
                            const toolMessages: GatewayChatMessage[] = [];
                            let j = index;
                            let chainBreakerContent: string | null = null;
                            let chainBreakerKey: string = "";

                            while (j < mergedMessages.length) {
                              const m = mergedMessages[j];
                              if (!msgHasToolCalls(m)) break;
                              toolMessages.push(m);
                              j++;
                              // Tool with content breaks the chain
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

                              // Show the message that broke the chain (text-only, no tool actions)
                              if (chainBreakerContent) {
                                // Reuse cached text-only message to prevent re-renders
                                const cacheKey = `chain-${chainBreakerKey}`;
                                let textOnly = chainBreakerCacheRef.current.get(cacheKey);
                                if (!textOnly || textOnly.content !== chainBreakerContent) {
                                  textOnly = {
                                    id: chainBreakerKey,
                                    role: "assistant",
                                    content: chainBreakerContent,
                                    timestamp: 0,
                                  };
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

                          // Regular message (user text, assistant text, etc.)
                          nodes.push(
                            <EnhancedMessageBubble
                              key={message.id || index}
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
                              botPic={agentAvatarUrl}
                              userPic={userAvatar}
                              assistantAvatar={assistantAvatar}
                            />
                          );
                        }

                        // Show status indicator while agent is working.
                        // Always visible during loading (even after tool calls) so the user
                        // knows the agent is still active. Text adapts to the current phase.
                        if (isLoading) {
                          const lastMsg = mergedMessages[mergedMessages.length - 1];
                          const lastIsEmptyAssistant = lastMsg?.role === "assistant" && !lastMsg.content?.trim() && !(lastMsg as any).toolCalls?.length;
                          // Skip indicator when the last message is an empty assistant (shows its own thinking)
                          // OR when the assistant is actively streaming text (the text IS the response)
                          const lastIsStreamingText = lastMsg?.role === "assistant" && lastMsg.content?.trim() && !(lastMsg as any).toolCalls?.length;
                          if (!lastIsEmptyAssistant && !lastIsStreamingText) {
                            // Only count tools from the current turn (after the last user message)
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
                              <div
                                key="thinking-indicator"
                                className="flex gap-3 justify-start"
                              >
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

                {/* Scroll to bottom reference */}
                <div style={{ height: `${inputAreaHeight}px` }} />
              </>
              )}
            </CardContent>

            {/* Scroll to bottom button - hidden */}
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
                    onClick={() => scrollToBottom(true)}
                    size="icon"
                    className="rounded-full h-fit w-fit p-1.5 shadow-lg pointer-events-auto"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area — hidden until initial data is ready */}
            <div
              ref={inputAreaRef}
              className={cn(
                "absolute bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none",
                !initialReady && "hidden"
              )}
            >
              {/* Quoted message preview */}
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

              {/* Message Queue — shows queued messages above input while AI generates */}
              <AnimatePresence>
                {messageQueue.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                    className="pointer-events-auto mb-2 space-y-1.5"
                  >
                    <div className="flex items-center gap-2 px-1">
                      <div className="h-px flex-1 bg-border/40" />
                      <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                        {messageQueue.length} queued
                      </span>
                      <div className="h-px flex-1 bg-border/40" />
                    </div>
                    {messageQueue.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8, height: 0 }}
                        transition={{ delay: index * 0.04 }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-background/90 backdrop-blur-sm group hover:border-primary/30 transition-colors"
                      >
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground/40 font-mono tabular-nums w-4 text-center">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground/80 line-clamp-2">
                            {item.displayText}
                          </p>
                          {item.attachments && item.attachments.length > 0 && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {item.attachments.length} attachment{item.attachments.length > 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => handleEditQueueItem(item.id)}
                          className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => handleDeleteQueueItem(item.id)}
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

              {/* Slash command autocomplete menu + input */}
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
                  agentId={currentAgentId}
                  onStopGeneration={stopGeneration}
                  onInputChange={handleInputChange}
                  inputRef={inputHandleRef}
                  tokenUsage={tokenUsage}
                  contextLimit={contextLimit}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

// Main GatewayChat Widget
const GatewayChatWidget: React.FC<CustomProps> = (props) => {
  return <GatewayChatWidgetContent {...props} />;
};

GatewayChatWidget.displayName = "GatewayChatWidget";

export default GatewayChatWidget;
