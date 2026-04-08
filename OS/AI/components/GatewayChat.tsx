"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "$/Providers/UserProv";
import { useAssistant } from "$/Providers/AssistantProv";
import { getMediaUrl } from "$/utils";
import { User, X, ChevronDown, Plus, Clock, Copy, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import { rehypePlugins } from "@OS/AI/components/rehypeConfig";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import CopanionIcon from "@OS/assets/copanion";
import { ClaudeCodeIcon, CodexIcon } from "$/components/Onboarding/RuntimeIcons";
import { PROVIDER_MODELS } from "$/components/Home/widgets/gateway-chat/GatewayChatHeader";
import { useGatewayChat, GatewayChatMessage, GatewayChatAttachment } from "@OS/AI/core/hook/use-gateway-chat";
import { useClaudeCodeChat } from "@OS/AI/core/hook/use-claude-code-chat";
import { useCodexChat } from "@OS/AI/core/hook/use-codex-chat";
import type { AttachmentType } from "@OS/AI/components/Chat";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useAIProviderSafe, type AIProviderType } from "$/Providers/AIProviderProv";
import { InputContainer } from "@OS/AI/components/InputContainer";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import createMarkdownComponents from "@OS/AI/components/createMarkdownComponents";
import { EmptyState, AnimatedThinkingText } from "@OS/AI/components/Chat";
import { GenericToolMessage } from "@OS/AI/components/GenericToolMessage";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import { toolRegistry, UnifiedToolState } from "@OS/AI/components/ToolRegistry";
import { Collapsible } from "@/components/ui/collapsible";
import { ChevronRight, Check } from "lucide-react";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import HermesIcon from "@OS/assets/hermes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Memoized ReactMarkdown component for better performance
const MemoizedReactMarkdown: React.FC<Options> = React.memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.components === nextProps.components
);

// Memoized markdown components to prevent recreation during streaming
const memoizedMarkdownComponents = {
  user: createMarkdownComponents(true),
  assistant: createMarkdownComponents(false),
};

// Helper to check if avatar should be shown
const shouldShowAvatar = (messages: GatewayChatMessage[], index: number): boolean => {
  if (index === 0) return true;
  const prevMsg = messages[index - 1];
  const currMsg = messages[index];
  if (!prevMsg || !currMsg) return true;
  return prevMsg.role !== currMsg.role;
};

// Helper to determine if message actions should be shown
const shouldShowMessageActions = (message: GatewayChatMessage, isLoading: boolean): boolean => {
  // Show actions for assistant messages that have content and are not loading
  if (message.role === "assistant" && message.content && !isLoading) {
    return true;
  }
  return false;
};

// Tool Result Message Component
const ToolResultMessage: React.FC<{
  toolResults: GatewayChatMessage["toolResults"];
  showAvatar: boolean;
  assistantAvatar?: { src?: string; fallback: string; alt?: string };
  botPic?: string;
}> = ({ toolResults, showAvatar, assistantAvatar, botPic }) => {
  if (!toolResults || toolResults.length === 0) return null;

  return (
    <motion.div
      className="flex gap-3 justify-start"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="w-8 h-8 flex-shrink-0">
        {showAvatar ? (
          <Avatar className="w-8 h-8">
            {botPic ? (
              <AvatarImage src={getMediaUrl(botPic)} />
            ) : assistantAvatar?.src ? (
              <AvatarImage src={assistantAvatar.src} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary">
              <CopanionIcon className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-8 h-8 flex-shrink-0" />
        )}
      </div>

      <div className="relative flex flex-col max-w-[85%] min-w-0 justify-start items-start">
        <div className="py-1.5 px-3 relative w-fit max-w-full transition-all duration-200 text-sm group select-text break-words rounded-lg border border-border/50">
          {toolResults.map((result, index) => (
            <div key={result.toolCallId || index} className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                {result.toolName}
                {result.isError && <span className="text-red-500 ml-2">Error</span>}
              </div>
              <div className="text-xs text-foreground/80 whitespace-pre-wrap">
                {result.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// Tool Actions Group Message Component (for grouped tool calls)
const ToolActionsGroupMessage: React.FC<{
  toolMessages: GatewayChatMessage[];
  toolStates?: Map<string, UnifiedToolState>;
  toggleToolExpansion?: (messageId: string) => void;
  assistantAvatar?: { src?: string; fallback: string; alt?: string };
  botPic?: string;
  showAvatar: boolean;
}> = ({ toolMessages, toolStates, toggleToolExpansion, assistantAvatar, botPic, showAvatar }) => {
  const [open, setOpen] = useState(false);

  // Auto-open if any tool is in permission stage (needs user interaction).
  useEffect(() => {
    const needsPermission = toolMessages.some((m) => {
      const id = m.id || "";
      const state = id ? toolStates?.get(id) : undefined;
      return Boolean(state && state.status === "pending");
    });

    if (needsPermission) setOpen(true);
  }, [toolMessages, toolStates]);

  const count = toolMessages.length;
  const label = `${count} action${count === 1 ? "" : "s"}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <motion.div
        className="flex gap-3 justify-start"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Avatar */}
        <div className="w-8 h-8 flex-shrink-0">
          {showAvatar ? (
            <Avatar className="w-8 h-8">
              {botPic ? (
                <AvatarImage src={getMediaUrl(botPic)} />
              ) : assistantAvatar?.src ? (
                <AvatarImage src={assistantAvatar.src} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                <CopanionIcon className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8 flex-shrink-0" />
          )}
        </div>

        {/* Group Bubble + Content */}
        <div className="relative flex flex-col max-w-[85%] min-w-0 justify-start items-start">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "py-1.5 px-3 relative w-fit max-w-full transition-all duration-300 select-none rounded-lg border",
              "border-border/50 text-muted-foreground hover:text-foreground/80 hover:border-primary/50"
            )}
            style={{
              borderTopRightRadius: "10px",
              borderBottomRightRadius: "10px",
              borderTopLeftRadius: "0px",
              borderBottomLeftRadius: "10px",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{label}</span>
              <motion.div
                animate={{ rotate: open ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-3 h-3" />
              </motion.div>
            </div>
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden w-full"
              >
                <div className="mt-2 space-y-2">
                  {toolMessages.map((toolMessage, toolIndex) => {
                    const id = toolMessage.id || "";
                    const state = id ? toolStates?.get(id) : undefined;

                    if (!state || !toggleToolExpansion) {
                      const toolName = toolMessage.toolCalls?.[0]?.function?.name || toolMessage.toolCalls?.[0]?.name || "action";
                      return (
                        <motion.div
                          key={id || `tool-action-fallback-${toolName}-${toolIndex}`}
                          className="py-1.5 px-3 relative w-fit max-w-full transition-all duration-300 select-text break-words rounded-lg border border-border/50 text-muted-foreground"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <span className="text-xs font-medium">
                            {toolName}
                          </span>
                        </motion.div>
                      );
                    }

                    const Renderer = toolRegistry.getRenderer(state.toolName);
                    if (!Renderer) return null;

                    return (
                      <Renderer
                        key={id}
                        toolState={state}
                        message={toolMessage as any}
                        onToggleExpand={() => toggleToolExpansion(id)}
                        assistantAvatar={assistantAvatar}
                        botPic={botPic}
                        showAvatar={false}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </Collapsible>
  );
};

interface GatewayChatProps {
  sessionKey?: string;
  autoConnect?: boolean;
  className?: string;
  backend?: "openclaw" | "hermes";
  agentId?: string;
}

// Enhanced message bubble component with tool support
const MessageBubble: React.FC<{
  message: GatewayChatMessage;
  showAvatar: boolean;
  userAvatar?: { src?: string; fallback: string; alt?: string };
  assistantAvatar?: { src?: string; fallback: string; alt?: string };
  isLoading?: boolean;
  toolStates?: Map<string, UnifiedToolState>;
  toggleToolExpansion?: (messageId: string) => void;
  botPic?: string;
  onCopy?: (message: GatewayChatMessage) => void;
  onRegenerate?: (messageId: string) => void;
}> = ({ message, showAvatar, userAvatar, assistantAvatar, isLoading, toolStates, toggleToolExpansion, botPic, onCopy, onRegenerate }) => {
  const isUser = message.role === "user";

  const avatar = isUser ? userAvatar : assistantAvatar;
  const defaultIcon = isUser ? (
    <User className="w-4 h-4" />
  ) : (
    <CopanionIcon className="w-4 h-4" />
  );

  // Handle tool messages - render using GenericToolMessage if available
  if (message.role === "tool") {
    return null; // Tool results are handled separately
  }

  if (message.role === "system") {
    return null;
  }

  // Handle assistant messages with tool calls
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    const messageId = message.id || "";
    const toolState = toolStates?.get(messageId);

    if (toolState && toggleToolExpansion) {
      return (
        <GenericToolMessage
          toolState={toolState}
          message={message as any}
          onToggleExpand={() => toggleToolExpansion(messageId)}
          assistantAvatar={assistantAvatar}
          botPic={botPic}
          showAvatar={showAvatar}
        />
      );
    }

    // Fallback: show tool call without state management
    return (
      <ToolActionsGroupMessage
        toolMessages={[message]}
        toolStates={toolStates}
        toggleToolExpansion={toggleToolExpansion}
        assistantAvatar={assistantAvatar}
        botPic={botPic}
        showAvatar={showAvatar}
      />
    );
  }

  const hasThinking = message.thinking || (isLoading && !message.content.trim() && !isUser);

  // Handle copy function
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const textToCopy = message.content || "";
    navigator.clipboard.writeText(textToCopy);
    onCopy?.(message);
  }, [message.content, onCopy]);

  return (
    <motion.div
      className={cn(
        "flex gap-3 group",
        isUser ? "justify-end" : "justify-start"
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {!isUser && (
        <div className="w-8 h-8 flex-shrink-0">
          {showAvatar ? (
            <Avatar className="w-8 h-8">
              {botPic ? (
                <AvatarImage src={getMediaUrl(botPic)} />
              ) : avatar?.src ? (
                <AvatarImage src={avatar.src} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                {defaultIcon}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8 flex-shrink-0" />
          )}
        </div>
      )}

      <div
        className={cn(
          "relative flex flex-col max-w-[85%] min-w-0",
          isUser ? "justify-end items-end" : "justify-start items-start"
        )}
      >
        {/* Thinking indicator */}
        {hasThinking && (
          <div className="mb-2">
            <AnimatedThinkingText text="Thinking" />
          </div>
        )}

        <div
          className={cn(
            "py-1.5 px-3 relative w-fit transition-all duration-200 text-sm group select-text break-words font-normal",
            isUser
              ? "bg-primary text-primary-foreground"
              : "border border-border/50"
          )}
          style={{
            borderTopRightRadius: isUser ? "0px" : "10px",
            borderBottomRightRadius: isUser ? "10px" : "10px",
            borderTopLeftRadius: isUser ? "10px" : "0px",
            borderBottomLeftRadius: isUser ? "10px" : "10px",
          }}
          onCopy={(e) => {
            // Intercept copy event to clean text from markdown HTML structure
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return;

            let selectedText = selection.toString();
            const isSingleLine = !selectedText.includes('\n') ||
              selectedText.split('\n').filter(l => l.trim().length > 0).length === 1;

            let cleanedText: string;
            if (isSingleLine) {
              cleanedText = selectedText.trim().replace(/[ \t]+/g, ' ');
            } else {
              cleanedText = selectedText
                .replace(/\n{3,}/g, '\n\n')
                .replace(/[ \t]+/g, ' ')
                .split('\n')
                .map(line => line.trim())
                .join('\n')
                .trim();
            }

            e.preventDefault();
            e.clipboardData.setData('text/plain', cleanedText);
            onCopy?.(message);
          }}
        >
          {message.content ? (
            <MemoizedReactMarkdown
              components={isUser ? memoizedMarkdownComponents.user : memoizedMarkdownComponents.assistant}
              remarkPlugins={[
                remarkGfm,
                remarkBreaks,
                [remarkMath, { singleDollarTextMath: false }],
              ]}
              rehypePlugins={rehypePlugins}
            >
              {message.content}
            </MemoizedReactMarkdown>
          ) : null}
        </div>

        {/* Message actions */}
        {shouldShowMessageActions(message, isLoading || false) && (
          <div className="flex items-center gap-1 mt-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <HyperchoTooltip value={new Date(message.timestamp || Date.now()).toLocaleTimeString()}>
              <Button variant="ghost" size="iconSm">
                <Clock className="w-3 h-3" />
              </Button>
            </HyperchoTooltip>

            <HyperchoTooltip value="Copy">
              <Button variant="ghost" size="iconSm" onClick={handleCopy}>
                <Copy className="w-3 h-3" />
              </Button>
            </HyperchoTooltip>

            {!isUser && onRegenerate && (
              <HyperchoTooltip value="Regenerate">
                <Button variant="ghost" size="iconSm" onClick={() => onRegenerate(message.id || "")}>
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </HyperchoTooltip>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 flex-shrink-0">
          {showAvatar ? (
            <Avatar className="w-8 h-8">
              {avatar?.src && <AvatarImage src={avatar.src} />}
              <AvatarFallback className="bg-secondary">
                {defaultIcon}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8 flex-shrink-0" />
          )}
        </div>
      )}
    </motion.div>
  );
};

export const GatewayChat: React.FC<GatewayChatProps> = ({
  sessionKey,
  autoConnect = true,
  className,
  backend: backendProp,
  agentId: agentIdProp,
}) => {
  const { userInfo } = useUser();
  const { personality } = useAssistant();
  const { agents } = useHyperclawContext();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(agentIdProp);

  // Resolve current agent and backend
  const currentAgentId = selectedAgentId || agentIdProp || "main";
  const currentAgent = agents.find(a => a.id === currentAgentId);
  const backend = (currentAgent as any)?.backend || backendProp || "openclaw";
  const isHermes = backend === "hermes";

  const [sessionKeyState, setSessionKeyState] = useState(
    sessionKey || `agent:${currentAgentId}:main`
  );

  // AI provider switching (safe variant returns defaults if provider not mounted)
  const { provider: activeProvider, setProvider, providers: availableProviders } = useAIProviderSafe();

  // Sync sessionKey prop with internal state and reload when it changes
  useEffect(() => {
    if (sessionKey && sessionKey !== sessionKeyState) {
      setSessionKeyState(sessionKey);
    }
  }, [sessionKey, sessionKeyState]);

  // Use the correct chat hook based on provider
  const gatewayChat = useGatewayChat({
    sessionKey: sessionKeyState,
    autoConnect: autoConnect && activeProvider !== "claude-code" && activeProvider !== "codex",
    backend,
  });

  const claudeCodeChat = useClaudeCodeChat({
    sessionKey: sessionKeyState,
    autoConnect: activeProvider === "claude-code",
  });

  const codexChat = useCodexChat({
    sessionKey: sessionKeyState,
    autoConnect: activeProvider === "codex",
  });

  const activeChat = activeProvider === "claude-code" ? claudeCodeChat
    : activeProvider === "codex" ? codexChat
    : gatewayChat;

  const {
    messages,
    isLoading,
    isConnected,
    error,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    clearChat,
    setSessionKey: setHookSessionKey,
    model: currentModel,
    setModel: setCurrentModel,
  } = activeChat;

  // Unified tool state management
  const { toolStates, toggleToolExpansion, resetToolStates } = useUnifiedToolState(messages as any);

  // Session history state
  const [sessions, setSessions] = useState<Array<{ key: string; label?: string; updatedAt?: number }>>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Handle agent change
  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    const newSessionKey = `agent:${agentId}:main`;
    setSessionKeyState(newSessionKey);
    setHookSessionKey(newSessionKey);
  }, [setHookSessionKey]);

  // Fetch sessions callback — merges OpenClaw + Claude + Codex
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const fetches: Promise<Array<{ key: string; label?: string; updatedAt?: number }>>[] = [];

      if (gatewayConnection.isConnected()) {
        fetches.push(
          gatewayConnection.listSessions(currentAgentId, 50)
            .then(r => (r.sessions || []).map((s: any) => ({ ...s, label: s.label || s.key })))
            .catch(() => [])
        );
      }

      // Claude Code sessions (via connector relay)
      fetches.push(
        bridgeInvoke("claude-code-list-sessions", {})
          .then((r: any) => (r?.sessions || []).map((s: any) => ({
            key: s.key || `claude:${s.id}`,
            label: `[Claude] ${s.label || s.id?.slice(0, 8)}`,
            updatedAt: s.updatedAt,
          })))
          .catch(() => [])
      );

      // Codex sessions (via connector relay)
      fetches.push(
        bridgeInvoke("codex-list-sessions", {})
          .then((r: any) => (r?.sessions || []).map((s: any) => ({
            key: s.key || `codex:${s.id}`,
            label: `[Codex] ${s.label || s.id?.slice(0, 8)}`,
            updatedAt: s.updatedAt,
          })))
          .catch(() => [])
      );

      const results = await Promise.all(fetches);
      const merged = results.flat().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setSessions(merged);
    } catch (err) {
      console.error("[GatewayChat] Failed to fetch sessions:", err);
      setSessionsError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, [currentAgentId]);

  // Handle session switch
  const handleSessionChange = useCallback((newSessionKey: string) => {
    setSessionKeyState(newSessionKey);
    setHookSessionKey(newSessionKey);
  }, [setHookSessionKey]);

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    const newKey = `agent:${currentAgentId}:chat-${Date.now()}`;
    setSessionKeyState(newKey);
    setHookSessionKey(newKey);
    // Refresh session list so the previous session appears in history
    fetchSessions();
  }, [setHookSessionKey, currentAgentId, fetchSessions]);

  // Track previous message count for smart scrolling
  const prevMessagesLengthRef = useRef<number>(0);
  // true when the user has manually scrolled away from the bottom during generation
  const userScrolledAwayRef = useRef(false);

  // Auto-scroll only on initial load / session switch and when the user sends a message.
  // Do NOT auto-scroll during streaming or when assistant messages arrive.
  useEffect(() => {
    if (!scrollAreaRef.current || messages.length === 0) return;

    const prevLen = prevMessagesLengthRef.current;

    if (messages.length <= prevLen) {
      prevMessagesLengthRef.current = messages.length;
      // Streaming delta — do not auto-scroll.
      return;
    }

    // Bulk history load: previous was 0 or empty, now has many messages.
    if (prevLen === 0 && messages.length > 1) {
      prevMessagesLengthRef.current = messages.length;
      userScrolledAwayRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }));
      return;
    }

    const newMsg = messages[messages.length - 1];
    if (newMsg?.role === "user") {
      // User just sent — always scroll and reset the flag.
      userScrolledAwayRef.current = false;
      if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
    // Do not auto-scroll for assistant messages or other new messages.
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, messages]);

  // Check scroll position and track whether user scrolled away
  const checkScrollPosition = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const element = scrollAreaRef.current;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    setShowScrollButton(!isAtBottom);
    userScrolledAwayRef.current = !isAtBottom;
  }, []);

  // Handle send message with attachment support
  const handleSendMessage = useCallback(
    async (message: string, attachments?: AttachmentType[]) => {
      if (!message.trim() && (!attachments || attachments.length === 0)) return;

      const gatewayAttachments: GatewayChatAttachment[] | undefined = attachments?.length
        ? attachments.map((att) => {
            const dataUrl = att.url || "";
            const mimeMatch = dataUrl.match(/^data:([^;]+);/);
            const mimeType = mimeMatch?.[1] || `${att.type}/*`;
            return { id: att.id, type: att.type, mimeType, name: att.name, dataUrl };
          })
        : undefined;

      await sendMessage(message, gatewayAttachments);
    },
    [sendMessage]
  );

  // Handle copy
  const handleCopy = useCallback((message: GatewayChatMessage) => {
    navigator.clipboard.writeText(message.content || "");
  }, []);

  // Handle regenerate — resend the last user message
  const handleRegenerate = useCallback((_messageId: string) => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg?.content) return;
    sendMessage(lastUserMsg.content);
  }, [messages, sendMessage]);

  const hasChatStarted = messages.length > 0;

  // Helper to check if message has tool calls
  const hasToolCalls = (message: GatewayChatMessage): boolean => {
    return !!(message.toolCalls && message.toolCalls.length > 0);
  };

  // Helper to check if message has tool results
  const hasToolResults = (message: GatewayChatMessage): boolean => {
    return !!(message.toolResults && message.toolResults.length > 0);
  };

  // Helper to group consecutive tool call messages
  const isAssistantToolCallMessage = (message: GatewayChatMessage) =>
    message.role === "assistant" && hasToolCalls(message);

  // Handle both "tool" and "toolResult" roles
  const isToolResultMessage = (message: GatewayChatMessage) =>
    message.role === "tool" || message.role === "toolResult";

  return (
    <Card
      className={cn(
        "relative h-full flex flex-col overflow-hidden bg-transparent border-none rounded-none shadow-none",
        className
      )}
    >
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="w-10 h-10">
                {activeProvider === "claude-code" ? (
                  <AvatarFallback className="bg-primary/10">
                    <ClaudeCodeIcon className="w-6 h-6" />
                  </AvatarFallback>
                ) : activeProvider === "codex" ? (
                  <AvatarFallback className="bg-primary/10">
                    <CodexIcon className="w-6 h-6" />
                  </AvatarFallback>
                ) : isHermes ? (
                  <>
                    <AvatarImage src="/assets/hermes-agent.png" alt="Hermes Agent" />
                    <AvatarFallback className="bg-orange-500/10">
                      <HermesIcon className="w-5 h-5 text-orange-500" />
                    </AvatarFallback>
                  </>
                ) : (
                  <>
                    <AvatarImage src={getMediaUrl(personality.coverPhoto)} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <CopanionIcon className="w-5 h-5" />
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
              {/* Connection status dot */}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background shadow-sm">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-all duration-300",
                    isConnected
                      ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                      : isLoading
                        ? "bg-amber-500/80 animate-pulse"
                        : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  )}
                />
              </span>
            </div>
            <div>
              {activeProvider === "claude-code" || activeProvider === "codex" ? (
                <div className="flex flex-col">
                  <CardTitle className="text-sm">
                    {activeProvider === "claude-code" ? "Claude Code" : "Codex"}
                  </CardTitle>
                  {PROVIDER_MODELS[activeProvider] && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-opacity text-left">
                          {PROVIDER_MODELS[activeProvider]!.find(m => m.id === (currentModel || ""))?.label || "Default"}
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-36">
                        {PROVIDER_MODELS[activeProvider]!.map((m) => (
                          <DropdownMenuItem
                            key={m.id}
                            onClick={() => setCurrentModel?.(m.id)}
                            className="flex items-center justify-between cursor-pointer text-xs"
                          >
                            {m.label}
                            {m.id === (currentModel || "") && <Check className="w-3 h-3" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ) : isHermes ? (
                <CardTitle className="text-sm">Hermes Agent</CardTitle>
              ) : agents.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left">
                      <CardTitle className="text-sm">
                        {isHermes ? "Hermes Agent" : (personality.name || "Copanion")}
                      </CardTitle>
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {agents.map((a) => {
                      const isAgentHermes = a.id === "hermes" || (a as any).backend === "hermes";
                      return (
                        <DropdownMenuItem
                          key={a.id}
                          onClick={() => handleAgentChange(a.id)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            {isAgentHermes && <HermesIcon className="w-3.5 h-3.5 text-orange-500" />}
                            {a.name}
                          </span>
                          {a.id === currentAgentId && <Check className="w-3 h-3" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <CardTitle className="text-sm">{isHermes ? "Hermes Agent" : (personality.name || "Copanion")}</CardTitle>
              )}
              <p className="text-xs text-muted-foreground">
                {isConnected ? "Online" : isLoading ? "Connecting..." : "Offline"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* AI Provider Toggle */}
            {availableProviders.length > 1 && (
              <div className="flex items-center rounded-md border border-border/50 overflow-hidden mr-1">
                {availableProviders.map((p) => (
                  <HyperchoTooltip key={p.id} value={p.label}>
                    <button
                      type="button"
                      onClick={() => setProvider(p.id)}
                      className={cn(
                        "px-2 py-1 text-[10px] font-medium transition-colors",
                        activeProvider === p.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      {p.id === "openclaw" ? "OC" : p.id === "claude-code" ? "CC" : "CX"}
                    </button>
                  </HyperchoTooltip>
                ))}
              </div>
            )}

            <HyperchoTooltip value="Reload Chat">
              <Button
                variant="ghost"
                size="iconSm"
                onClick={loadChatHistory}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </HyperchoTooltip>

            <HyperchoTooltip value="New Chat">
              <Button
                variant="ghost"
                size="iconSm"
                onClick={handleNewChat}
                disabled={!hasChatStarted || isLoading}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </HyperchoTooltip>

            <SessionHistoryDropdown
              sessions={sessions}
              isLoading={sessionsLoading}
              error={sessionsError}
              currentSessionKey={sessionKeyState}
              onLoadSession={handleSessionChange}
              onNewChat={handleNewChat}
              onFetchSessions={fetchSessions}
            />
          </div>
        </div>
      </CardHeader>

      <div className="flex flex-col w-full flex-1 p-0 overflow-hidden">
        {/* Messages Area */}
        <CardContent
          ref={scrollAreaRef}
          onScroll={checkScrollPosition}
          className="flex-1 min-h-0 p-0 overflow-y-auto overflow-x-hidden customScrollbar2"
        >
          <div className="p-4">
            <div className="space-y-2">
              {/* Error display */}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Empty state */}
              {messages.length === 0 ? (
                <EmptyState
                  userAvatar={{
                    src: getMediaUrl(userInfo?.profilePic),
                    fallback: userInfo?.username?.charAt(0).toUpperCase() || "U",
                    alt: userInfo?.username || "User",
                  }}
                  assistantAvatar={{
                    src: activeProvider === "claude-code" ? "/assets/claude-code.svg"
                      : activeProvider === "codex" ? "/assets/codex.svg"
                      : isHermes ? "/assets/hermes-agent.png"
                      : getMediaUrl(personality.coverPhoto),
                    fallback: activeProvider === "claude-code" ? "CC"
                      : activeProvider === "codex" ? "CX"
                      : isHermes ? "H"
                      : (typeof personality.name === "string" ? personality.name : "").slice(0, 2) || "Co",
                    alt: activeProvider === "claude-code" ? "Claude Code"
                      : activeProvider === "codex" ? "Codex"
                      : isHermes ? "Hermes Agent"
                      : (typeof personality.name === "string" ? personality.name : "") || "Copanion",
                  }}
                  personality={{
                    ...personality,
                    name: activeProvider === "claude-code" ? "Claude Code"
                      : activeProvider === "codex" ? "Codex"
                      : isHermes ? "Hermes Agent"
                      : personality.name,
                    tag: activeProvider === "claude-code" ? "Anthropic's AI coding assistant. Ask me anything about code!"
                      : activeProvider === "codex" ? "OpenAI's coding agent. Ask me to help with your code!"
                      : isHermes ? "Self-improving AI agent with skill management"
                      : personality.tag,
                  }}
                  onSuggestionClick={handleSendMessage}
                />
              ) : (
                <AnimatePresence>
                  {(() => {
                    const nodes: React.ReactNode[] = [];

                    for (let index = 0; index < messages.length; index++) {
                      const message = messages[index];

                      // Group consecutive tool-call assistant messages (tool results may be interleaved)
                      if (isAssistantToolCallMessage(message)) {
                        const toolMessages: GatewayChatMessage[] = [];
                        let j = index;

                        while (j < messages.length) {
                          const m = messages[j];
                          if (isToolResultMessage(m)) {
                            j += 1;
                            continue;
                          }
                          if (isAssistantToolCallMessage(m)) {
                            toolMessages.push(m);
                            j += 1;
                            continue;
                          }
                          break;
                        }

                        if (toolMessages.length >= 1) {
                          nodes.push(
                            <ToolActionsGroupMessage
                              key={`tool-actions-${index}`}
                              toolMessages={toolMessages}
                              toolStates={toolStates}
                              toggleToolExpansion={toggleToolExpansion}
                              assistantAvatar={{
                                src: getMediaUrl(personality.coverPhoto),
                                fallback: personality.name || "Co",
                                alt: "Copanion",
                              }}
                              botPic={personality.coverPhoto}
                              showAvatar={shouldShowAvatar(messages, index)}
                            />
                          );

                          // Also render any interleaved tool results
                          for (let k = index + 1; k < j; k++) {
                            const m = messages[k];
                            if (isToolResultMessage(m) && m.toolResults) {
                              nodes.push(
                                <ToolResultMessage
                                  key={`tool-result-${k}`}
                                  toolResults={m.toolResults}
                                  showAvatar={false}
                                  assistantAvatar={{
                                    src: getMediaUrl(personality.coverPhoto),
                                    fallback: personality.name || "Co",
                                  }}
                                  botPic={personality.coverPhoto}
                                />
                              );
                            }
                          }

                          index = j - 1;
                          continue;
                        }
                      }

                      // Handle standalone tool results
                      if (isToolResultMessage(message) && message.toolResults) {
                        nodes.push(
                          <ToolResultMessage
                            key={message.id || `tool-result-${index}`}
                            toolResults={message.toolResults}
                            showAvatar={shouldShowAvatar(messages, index)}
                            assistantAvatar={{
                              src: getMediaUrl(personality.coverPhoto),
                              fallback: personality.name || "Co",
                            }}
                            botPic={personality.coverPhoto}
                          />
                        );
                        continue;
                      }

                      nodes.push(
                        <MessageBubble
                          key={message.id || `${message.role}-${index}`}
                          message={message}
                          showAvatar={shouldShowAvatar(messages, index)}
                          userAvatar={{
                            src: getMediaUrl(userInfo?.profilePic),
                            fallback:
                              userInfo?.username?.charAt(0).toUpperCase() || "U",
                            alt: userInfo?.username || "User",
                          }}
                          assistantAvatar={{
                            src: getMediaUrl(personality.coverPhoto),
                            fallback: personality.name || "Co",
                            alt: personality.name || "Copanion",
                          }}
                          isLoading={
                            isLoading &&
                            index === messages.length - 1 &&
                            message.role === "assistant"
                          }
                          toolStates={toolStates}
                          toggleToolExpansion={toggleToolExpansion}
                          botPic={personality.coverPhoto}
                          onCopy={handleCopy}
                          onRegenerate={handleRegenerate}
                        />
                      );
                    }

                    return nodes;
                  })()}
                </AnimatePresence>
              )}
            </div>

            {/* Scroll spacer */}
            <div style={{ height: "100px" }} />
          </div>
        </CardContent>

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute w-full flex justify-center z-50 pointer-events-none"
              style={{ bottom: "100px" }}
            >
              <HyperchoTooltip value="Scroll to bottom">
                <Button
                  onClick={() => {
                    scrollAreaRef.current?.scrollTo({
                      top: scrollAreaRef.current.scrollHeight,
                      behavior: "smooth",
                    });
                  }}
                  size="icon"
                  className="rounded-full h-fit w-fit p-1.5 shadow-lg pointer-events-auto"
                >
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </HyperchoTooltip>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none">
          <InputContainer
            onSendMessage={handleSendMessage}
            placeholder={
              hasChatStarted
                ? "Continue the conversation..."
                : `Ask ${personality.name || "Copanion"} anything...`
            }
            disabled={!isConnected || isLoading}
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
            sessionKey={sessionKeyState}
            onStopGeneration={stopGeneration}
          />
        </div>
      </div>
    </Card>
  );
};

export default GatewayChat;
