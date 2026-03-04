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
import rehypeRaw from "rehype-raw";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import CopanionIcon from "@OS/assets/copanion";
import { useGatewayChat, GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { InputContainer } from "@OS/AI/components/InputContainer";
import createMarkdownComponents from "@OS/AI/components/createMarkdownComponents";
import { EmptyState, AnimatedThinkingText } from "@OS/AI/components/Chat";
import { GenericToolMessage } from "@OS/AI/components/GenericToolMessage";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import { toolRegistry, UnifiedToolState } from "@OS/AI/components/ToolRegistry";
import { Collapsible } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

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
        <div className="py-1.5 px-3 relative w-fit max-w-full transition-all duration-200 text-sm group select-text break-words rounded-lg border bg-muted/40 border-border/50">
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
              "bg-muted border-border/50 text-muted-foreground hover:text-foreground/80 hover:border-primary/50"
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
                          className="py-1.5 px-3 relative w-fit max-w-full transition-all duration-300 select-text break-words rounded-lg border bg-muted/40 border-border/50 text-muted-foreground"
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
              : "bg-muted/40 border border-border/50"
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
              rehypePlugins={[rehypeRaw]}
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
}) => {
  const { userInfo } = useUser();
  const { personality } = useAssistant();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sessionKeyState, setSessionKeyState] = useState(sessionKey || "default");
  console.log("sessionKeyState", sessionKeyState);

  // Sync sessionKey prop with internal state and reload when it changes
  useEffect(() => {
    if (sessionKey && sessionKey !== sessionKeyState) {
      console.log("[GatewayChat] Session key prop changed, updating state:", sessionKey);
      setSessionKeyState(sessionKey);
      // Clear chat when session changes
    }
  }, [sessionKey, sessionKeyState]);

  // Debug: Get current session model info
  useEffect(() => {
    const fetchSessionModel = async () => {
      if (!sessionKeyState || !gatewayConnection.connected) return;

      console.log("[GatewayChat] Fetching session model for:", sessionKeyState);

      try {
        // Try to get session details
        const sessionInfo = await gatewayConnection.getSession(sessionKeyState);
        console.log("[GatewayChat] Session info:", sessionInfo);

        // Try different response formats
        const session = sessionInfo as { model?: string; session?: { model?: string } };
        const model = session?.model || session?.session?.model;
        if (model) {
          console.log("[GatewayChat] Current session model:", model);
        } else {
          console.log("[GatewayChat] No model found in session info");
        }
      } catch (error) {
        console.log("[GatewayChat] Could not get session model:", error);
      }
    };

    // Wait a bit for connection to be established
    const timer = setTimeout(fetchSessionModel, 1000);
    return () => clearTimeout(timer);
  }, [sessionKeyState]);

  // Use the gateway chat hook
  const {
    messages,
    isLoading,
    isConnected,
    error,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    clearChat,
  } = useGatewayChat({
    sessionKey: sessionKeyState,
    autoConnect,
  });

  // Unified tool state management
  const { toolStates, toggleToolExpansion, resetToolStates } = useUnifiedToolState(messages as any);

  // Track previous message count for smart scrolling
  const prevMessagesLengthRef = useRef<number>(0);

  // Scroll to bottom when messages change - but only if user is near bottom
  useEffect(() => {
    if (scrollAreaRef.current && messages.length > 0) {
      const isNewMessage = messages.length > prevMessagesLengthRef.current;
      prevMessagesLengthRef.current = messages.length;

      if (isNewMessage) {
        const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;

        // Only auto-scroll if already near bottom
        if (isNearBottom) {
          scrollAreaRef.current.scrollTo({
            top: scrollAreaRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }
    }
  }, [messages.length]);

  // Check scroll position
  const checkScrollPosition = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const element = scrollAreaRef.current;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
    setShowScrollButton(!isAtBottom);
  }, []);

  // Handle send message
  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;
      setInputValue("");
      await sendMessage(message);
    },
    [sendMessage]
  );

  // Handle copy
  const handleCopy = useCallback((message: GatewayChatMessage) => {
    console.log("[GatewayChat] Copy message:", message.id);
  }, []);

  // Handle regenerate
  const handleRegenerate = useCallback((messageId: string) => {
    console.log("[GatewayChat] Regenerate message:", messageId);
    // Regeneration would require the gateway to support it
  }, []);

  const hasChatStarted = messages.length > 0;

  // Debug: Log messages state changes
  useEffect(() => {
    console.log("[GatewayChat] Messages updated, count:", messages.length);
    messages.forEach((msg, idx) => {
      if (idx < 15) { // Only log first 15 to avoid spam
        console.log(`[GatewayChat] Message[${idx}]:`, {
          id: msg.id?.substring(0, 8),
          role: msg.role,
          content: msg.content?.substring(0, 80),
          thinking: msg.thinking?.substring(0, 50),
          toolCalls: msg.toolCalls?.length,
          toolCallsId: msg.toolCalls?.[0]?.id?.substring(0, 20),
          toolResults: msg.toolResults?.length,
          toolResultsId: msg.toolResults?.[0]?.toolCallId?.substring(0, 20),
        });
      }
    });
  }, [messages]);

  // Debug: Log tool states
  useEffect(() => {
    console.log("[GatewayChat] ToolStates updated, count:", toolStates.size);
    toolStates.forEach((state, id) => {
      console.log(`[GatewayChat] ToolState[${id}]:`, {
        toolName: state.toolName,
        toolCallId: state.toolCallId,
        status: state.status,
        resultContent: state.resultContent?.substring(0, 50),
        arguments: state.arguments?.substring(0, 100),
      });
    });
  }, [toolStates]);

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
                <AvatarImage src={getMediaUrl(personality.coverPhoto)} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <CopanionIcon className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              {/* Connection indicator */}
              <div
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                  isConnected ? "bg-green-500" : "bg-red-500"
                )}
              />
            </div>
            <div>
              <CardTitle>{personality.name || "Copanion"}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {isConnected ? "Connected" : "Disconnected"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HyperchoTooltip value="New Chat">
              <Button
                variant="ghost"
                size="iconSm"
                onClick={clearChat}
                disabled={!hasChatStarted || isLoading}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </HyperchoTooltip>

            <HyperchoTooltip value={isConnected ? "Connected" : "Click to reconnect"}>
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => {
                  if (!isConnected) {
                    // Reconnect logic handled by hook
                  }
                }}
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    isConnected ? "bg-green-500" : "bg-red-500"
                  )}
                />
              </Button>
            </HyperchoTooltip>
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
                    src: getMediaUrl(personality.coverPhoto),
                    fallback: personality.name?.slice(0, 2) || "Co",
                    alt: personality.name || "Copanion",
                  }}
                  personality={personality}
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

                        if (toolMessages.length >= 2) {
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
              className="absolute w-full flex justify-center z-50"
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
                  className="rounded-full h-fit w-fit p-1.5 shadow-lg"
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
            showAttachments={false}
            showVoiceInput={false}
            showEmojiPicker={false}
            showActions={true}
            autoResize={true}
            allowEmptySend={false}
            sessionKey={sessionKeyState}
            onStopGeneration={stopGeneration}
            value={inputValue}
            onChange={setInputValue}
          />
        </div>
      </div>
    </Card>
  );
};

export default GatewayChat;
