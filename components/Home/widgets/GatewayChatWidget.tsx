"use client";

import React, { useState, useCallback, useEffect, useRef, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import { GripVertical, X, Plus, Paperclip } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGatewayChat, GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { useUser } from "$/Providers/UserProv";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import type { OpenClawRegistryAgent } from "$/types/electron";
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CopanionIcon from "@OS/assets/copanion";
import { getMediaUrl } from "$/utils";
import {
  AnimatedThinkingText,
  ChatLoadingSkeleton,
  EmptyState,
  Suggestions,
  AttachmentMessage,
} from "@OS/AI/components/Chat";
import { InputContainer } from "@OS/AI/components/InputContainer";
import { useFocusMode } from "./hooks/useFocusMode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Check, RefreshCw, MessageCircle, ChevronRight } from "lucide-react";
import SessionHistoryDropdown from "$/components/SessionHistoryDropdown";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import { GenericToolMessage } from "@OS/AI/components/GenericToolMessage";
import { toolRegistry, UnifiedToolState } from "@OS/AI/components/ToolRegistry";
import createMarkdownComponents from "@OS/AI/components/createMarkdownComponents";
import { C } from "@upstash/redis/zmscore-C3G81zLz";

// Helper function to determine if avatar should be shown
function shouldShowAvatarLocal(messages: GatewayChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const prevMsg = messages[index - 1];
  const currMsg = messages[index];
  if (!prevMsg || !currMsg) return true;
  return prevMsg.role !== currMsg.role;
}

// Helper function to determine if message actions should be shown
function shouldShowMessageActionsLocal(message: GatewayChatMessage, isLoading: boolean): boolean {
  if (isLoading) return false;
  return message.role === "assistant" && !!message.content?.trim();
}

// Memoized ReactMarkdown component for better performance
const MemoizedReactMarkdown: React.FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.components === nextProps.components
);

// Custom Header for GatewayChat Widget - matches CopilotChat header style
interface GatewayChatHeaderProps extends CustomProps {
  onAgentChange?: (agentId: string) => void;
  onSessionChange?: (sessionKey: string) => void;
  onNewChat?: () => void;
  onFetchSessions?: () => void;
  currentAgentId?: string;
  selectedSessionKey?: string;
  sessions?: Array<{ key: string; label?: string; updatedAt?: number }>;
  sessionsLoading?: boolean;
  sessionsError?: string | null;
}

export const GatewayChatCustomHeader: React.FC<GatewayChatHeaderProps> = ({
  widget,
  isEditMode,
  onAgentChange,
  onSessionChange,
  onNewChat,
  onFetchSessions,
  currentAgentId,
  selectedSessionKey,
  sessions = [],
  sessionsLoading = false,
  sessionsError = null,
}) => {
  // Get OpenClaw agents from provider
  const { agents } = useOpenClawContext();

  // Get agent from config or use first available
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const selectedAgent = currentAgentId
    ? agents.find(a => a.id === currentAgentId)
    : configAgentId
      ? agents.find(a => a.id === configAgentId)
      : agents[0];

  const agent = selectedAgent || { id: "main", name: "General Assistant", status: "active" };

  return (
    <CardHeader className="pb-3 border-b border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEditMode && (
            <div className="cursor-move h-7 w-7 flex items-center justify-center flex-shrink-0">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          )}
          <div className="relative">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                <span className="text-xl">🤖</span>
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex flex-col">
            {agents.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left">
                    <CardTitle className="text-sm">{agent.name}</CardTitle>
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {agents.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onClick={() => onAgentChange?.(a.id)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span>{a.name}</span>
                      {a.id === (currentAgentId || configAgentId || agents[0]?.id) && (
                        <Check className="w-3 h-3" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <CardTitle className="text-sm">{agent.name}</CardTitle>
            )}
          </div>
        </div>

        {/* Session selector */}
        <div className="flex items-center gap-2">
          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Online</span>
          </div>

          {/* Session History Dropdown */}
          <SessionHistoryDropdown
            sessions={sessions}
            isLoading={sessionsLoading}
            error={sessionsError}
            currentSessionKey={selectedSessionKey}
            onLoadSession={onSessionChange || (() => {})}
            onNewChat={onNewChat || (() => {})}
            onFetchSessions={onFetchSessions || (() => {})}
          />
        </div>
      </div>
    </CardHeader>
  );
};

const memoizedMarkdownComponents = {
  user: createMarkdownComponents(true),
  assistant: createMarkdownComponents(false),
};

// Enhanced message bubble - matches CopilotChat styling
const EnhancedMessageBubble = memo(
  ({
    message,
    isUser,
    showAvatar = true,
    onCopy,
    isLoading = false,
    botPic,
    userPic,
    toolStates,
    toggleToolExpansion,
  }: {
    message: GatewayChatMessage;
    isUser: boolean;
    showAvatar?: boolean;
    onCopy?: (message: GatewayChatMessage) => void;
    isLoading?: boolean;
    botPic?: string;
    userPic?: { src?: string; fallback: string; alt?: string };
    toolStates?: Map<string, UnifiedToolState>;
    toggleToolExpansion?: (messageId: string) => void;
  }) => {
    const defaultIcon = isUser ? (
      <span className="text-xs">U</span>
    ) : (
      <CopanionIcon className="w-4 h-4" />
    );

    if (message.role === "system" || message.role === "tool") {
      return null;
    }

    // Handle assistant messages with tool calls using GenericToolMessage
    if (
      message.role === "assistant" &&
      (message as any).toolCalls?.length > 0
    ) {
      const messageId = message.id || "";
      const toolState = toolStates?.get(messageId);

      if (toolState && toggleToolExpansion) {
        return (
          <GenericToolMessage
            toolState={toolState}
            message={message as any}
            onToggleExpand={() => toggleToolExpansion(messageId)}
            assistantAvatar={undefined}
            botPic={botPic}
            showAvatar={showAvatar}
          />
        );
      }
    }

    const content = isUser
      ? message.content || ""
      : message.content || "";
    const hasTextContent = content.trim();

    // If no content and not loading, return null early
    if (!hasTextContent && !isLoading) {
      return null;
    }

    // Check for content blocks (thinking, tool calls, etc.)
    const contentBlocks = (message as any).contentBlocks;

    const renderContent = () => {
      // Show loading/thinking state
      if (isLoading && !message.content?.trim()) {
        return (
          <div className="flex items-center">
            <AnimatedThinkingText />
          </div>
        );
      }

      // If we have content blocks, render them
      if (contentBlocks && contentBlocks.length > 0) {
        return (
          <div className="space-y-2">
            {contentBlocks.map((block: any, index: number) => {
              // Render thinking block (matching ThinkingToolRenderer style)
              if (block.type === "thinking" && block.thinking) {
                return (
                  <motion.div
                    key={`thinking-${index}`}
                    className="relative w-full transition-all duration-300 select-text break-all overflow-wrap-anywhere rounded-lg border bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground/80"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      borderTopRightRadius: "10px",
                      borderBottomRightRadius: "10px",
                      borderTopLeftRadius: "0px",
                      borderBottomLeftRadius: "10px",
                    }}
                  >
                    <Accordion type="single" collapsible defaultValue="">
                      <AccordionItem value="thoughts" className="border-0">
                        <AccordionTrigger className="flex items-center gap-2 justify-start py-0 px-0 text-xs font-medium hover:no-underline [&>svg]:h-3 [&>svg]:w-3 [&[data-state=open]>svg]:rotate-180">
                          <span className="text-muted-foreground hover:text-foreground/80">
                            Thoughts
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0 pt-0">
                          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                            <div className="text-xs text-foreground/80 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                              <MemoizedReactMarkdown
                                components={memoizedMarkdownComponents.assistant}
                                remarkPlugins={[
                                  remarkGfm,
                                  remarkBreaks,
                                  [remarkMath, { singleDollarTextMath: false }],
                                ]}
                                rehypePlugins={[rehypeRaw]}
                              >
                                {block.thinking}
                              </MemoizedReactMarkdown>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </motion.div>
                );
              }

              // Render tool result block (only if not merged into toolCall)
              if (block.type === "toolResult") {
                return (
                  <div key={`toolresult-${index}`} className={cn(
                    "p-2 rounded-md text-xs font-mono break-all overflow-wrap-anywhere",
                    block.isError ? "bg-red-500/10 text-red-500" : "bg-muted/50 text-muted-foreground"
                  )}>
                    <div className="flex items-center gap-1 mb-1 text-[10px] uppercase opacity-70">
                      <span>Result:</span>
                      <span className="font-semibold">{block.toolName}</span>
                    </div>
                    <pre className="whitespace-pre-wrap">{block.content}</pre>
                  </div>
                );
              }

              // Render text block
              if (block.type === "text" && block.text) {
                const processedContent = block.text.replace(/<(\w+)>/g, "@$1");
                return (
                  <MemoizedReactMarkdown
                    key={`text-${index}`}
                    components={
                      isUser
                        ? memoizedMarkdownComponents.user
                        : memoizedMarkdownComponents.assistant
                    }
                    remarkPlugins={[remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]}
                    rehypePlugins={[rehypeRaw]}
                  >
                    {processedContent}
                  </MemoizedReactMarkdown>
                );
              }

              return null;
            })}
          </div>
        );
      }

      // Fallback to simple content rendering
      // Pre-process content to handle unknown HTML tags like <username>
      const processedContent = content.replace(/<(\w+)>/g, "@$1");

      return (
        <MemoizedReactMarkdown
          components={
            isUser
              ? memoizedMarkdownComponents.user
              : memoizedMarkdownComponents.assistant
          }
          remarkPlugins={[remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]}
          rehypePlugins={[rehypeRaw]}
        >
          {processedContent}
        </MemoizedReactMarkdown>
      );
    };

    return (
      <motion.div
        className={cn(
          "flex gap-3 group",
          isUser ? "justify-end" : "justify-start"
        )}
      >
        {!isUser && (
          <div className="w-8 h-8 flex-shrink-0">
            {showAvatar ? (
              <Avatar className="w-8 h-8">
                {botPic ? (
                  <AvatarImage src={getMediaUrl(botPic)} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary">
                  {defaultIcon}
                </AvatarFallback>
              </Avatar>
            ) : (
              // Invisible spacer to maintain alignment
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
          <div
            className={cn(
              "py-1.5 px-3 relative w-full max-w-full transition-all duration-200 group select-text break-all overflow-wrap-anywhere font-normal text-sm",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted border border-border/50"
            )}
            style={{
              borderTopRightRadius: isUser ? "0px" : "10px",
              borderBottomRightRadius: isUser ? "10px" : "10px",
              borderTopLeftRadius: isUser ? "10px" : "0px",
              borderBottomLeftRadius: isUser ? "10px" : "10px",
            }}
          >
            {renderContent()}
          </div>

          {/* Message actions - show on hover */}
          {shouldShowMessageActionsLocal(message, isLoading) && !isUser && (
            <div className="flex items-center gap-1 mt-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => onCopy?.(message)}
                className="h-6 w-6"
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
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </Button>
            </div>
          )}
        </div>

        {isUser && (
          <div className="w-8 h-8 flex-shrink-0">
            {showAvatar ? (
              <Avatar className="w-8 h-8">
                {userPic?.src && (
                  <AvatarImage src={userPic.src} alt={userPic.alt} />
                )}
                <AvatarFallback className="bg-secondary">
                  {defaultIcon}
                </AvatarFallback>
              </Avatar>
            ) : (
              // Invisible spacer to maintain alignment
              <div className="w-8 h-8 flex-shrink-0" />
            )}
          </div>
        )}
      </motion.div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.role === nextProps.message.role &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.showAvatar === nextProps.showAvatar &&
      prevProps.userPic?.src === nextProps.userPic?.src &&
      prevProps.toolStates === nextProps.toolStates
    );
  }
);

// Grouped Tool Actions - handles accordion state for multiple tool messages
const GroupedToolActions: React.FC<{
  toolMessages: GatewayChatMessage[];
  toolStates?: Map<string, UnifiedToolState>;
  toggleToolExpansion?: (messageId: string) => void;
  showAvatar: boolean;
  index: number;
  shouldShowAvatar: (index: number) => boolean;
}> = ({ toolMessages, toolStates, toggleToolExpansion, showAvatar, index, shouldShowAvatar }) => {
  const [groupOpen, setGroupOpen] = useState(false);

  return (
    <Collapsible.Root
      open={groupOpen}
      onOpenChange={setGroupOpen}
    >
      <div className="flex gap-3 justify-start">
        {/* Avatar */}
        <div className="w-8 h-8 flex-shrink-0">
          {showAvatar ? (
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/10 text-primary">
                <CopanionIcon className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8 flex-shrink-0" />
          )}
        </div>

        <div className="relative flex flex-col max-w-[85%] min-w-0 justify-start items-start">
          {/* Group Header Button */}
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className={cn(
                "py-1.5 px-3 relative w-fit transition-all duration-300 select-none rounded-lg border break-all overflow-wrap-anywhere",
                "bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground/80 hover:border-primary/50"
              )}
              style={{
                borderTopRightRadius: "10px",
                borderBottomRightRadius: "10px",
                borderTopLeftRadius: "0px",
                borderBottomLeftRadius: "10px",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {toolMessages.length} action{toolMessages.length === 1 ? "" : "s"}
                </span>
                <motion.div
                  animate={{ rotate: groupOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight className="w-3 h-3" />
                </motion.div>
              </div>
            </button>
          </Collapsible.Trigger>

          {/* Expanded Content */}
          <Collapsible.Content>
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-x-auto overflow-y-hidden"
            >
              <div className="mt-2 space-y-2">
                {toolMessages.map((toolMsg, msgIdx) => {
                  const msgId = toolMsg.id || "";
                  const state = toolStates?.get(msgId);

                  if (state && toggleToolExpansion) {
                    return (
                      <GenericToolMessage
                        key={msgId || msgIdx}
                        toolState={state}
                        message={toolMsg as any}
                        onToggleExpand={() => toggleToolExpansion(msgId)}
                        assistantAvatar={undefined}
                        botPic={undefined}
                        showAvatar={false}
                      />
                    );
                  }

                  // Fallback: simple display
                  const toolName = toolMsg.toolCalls?.[0]?.function?.name || "action";
                  return (
                    <motion.div
                      key={msgId || `tool-fallback-${msgIdx}`}
                      className="py-1.5 px-3 relative w-fit max-w-full transition-all duration-300 select-text break-all overflow-wrap-anywhere rounded-lg border bg-muted/40 border-border/50 text-muted-foreground"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <span className="text-xs font-medium">{toolName}</span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </Collapsible.Content>
        </div>
      </div>
    </Collapsible.Root>
  );
};

// Helper to merge tool calls with their results from subsequent toolResult messages
// Matching logic from useUnifiedToolState.ts
function mergeToolCallsWithResults(
  messages: GatewayChatMessage[]
): GatewayChatMessage[] {
  const merged: GatewayChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Skip tool result messages - they'll be merged
    if ((msg.role as string) === "toolResult" || msg.role === "tool") {
      continue;
    }

    // Check if this is an assistant message with tool calls
    const hasToolCalls = (msg.toolCalls?.length || 0) > 0 || (msg.contentBlocks?.some((b: any) => b.type === "toolCall") || false);

    if (msg.role === "assistant" && hasToolCalls) {
      // Find tool results for this message's tool calls
      const toolCalls = msg.toolCalls || [];
      const contentBlocks = msg.contentBlocks?.filter((b: any) => b.type === "toolCall") || [];

      // Merge tool results from subsequent messages
      const mergedToolCalls = toolCalls.map((tc) => {
        const toolId = tc.id || tc.function?.name || "";

        // Find matching tool result message - check both "tool" and "toolResult" roles
        // Also check both top-level toolCallId and toolResults[0].toolCallId
        const toolResultMsg = messages.find((m) => {
          const role = m.role as string;
          if (role !== "tool" && role !== "toolResult") return false;
          const msgToolCallId = (m as any).toolCallId || (m as any).toolResults?.[0]?.toolCallId;
          return msgToolCallId === toolId;
        });

        // Extract content from both "tool" and "toolResult" roles
        // For toolResult: content is in toolResults[0].content
        // For tool: content is in top-level content
        const resultContent = toolResultMsg
          ? ((toolResultMsg as any).toolResults?.[0]?.content || (toolResultMsg as any).content)
          : undefined;
        const resultIsError = toolResultMsg
          ? ((toolResultMsg as any).toolResults?.[0]?.isError || (toolResultMsg as any).isError || false)
          : false;

        return {
          ...tc,
          result: resultContent,
          isError: resultIsError,
        };
      });

      // Merge content blocks with results
      const mergedContentBlocks = contentBlocks.map((block: any) => {
        const toolId = block.id;
        const toolResultMsg = messages.find((m) => {
          const role = m.role as string;
          if (role !== "tool" && role !== "toolResult") return false;
          const msgToolCallId = (m as any).toolCallId || (m as any).toolResults?.[0]?.toolCallId;
          return msgToolCallId === toolId;
        });

        return {
          ...block,
          result: toolResultMsg
            ? ((toolResultMsg as any).toolResults?.[0]?.content || (toolResultMsg as any).content)
            : undefined,
          isError: toolResultMsg
            ? ((toolResultMsg as any).toolResults?.[0]?.isError || (toolResultMsg as any).isError || false)
            : false,
        };
      });

      merged.push({
        ...msg,
        toolCalls: mergedToolCalls as any,
        contentBlocks: [
          ...(msg.contentBlocks?.filter((b: any) => b.type !== "toolCall") || []),
          ...mergedContentBlocks,
        ],
      } as GatewayChatMessage);
    } else {
      merged.push(msg);
    }
  }

  return merged;
}

// GatewayChat Widget Content - matches CopilotChat UI
const GatewayChatWidgetContent: React.FC<CustomProps> = (props) => {
  const { widget, isEditMode } = props;
  const { isFocusModeActive } = useFocusMode();

  // Get OpenClaw agents from provider
  const { agents } = useOpenClawContext();

  // Get agent config from widget config or use default (first available agent)
  const config = widget.config as Record<string, unknown> | undefined;
  const configAgentId = config?.agentId as string | undefined;
  const configSessionKey = config?.sessionKey as string | undefined;

  // Storage key for this widget's state
  const widgetStorageKey = `gateway-chat-state-${widget.id}`;

  // Load persisted state from localStorage
  const loadPersistedState = () => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem(widgetStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };

  // Initialize state from localStorage or config
  const persistedState = loadPersistedState();

  // Local state for selected agent - initialized with config/persisted, but persists after user selection
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    persistedState.agentId || configAgentId
  );

  // Input field state - persisted per widget
  const [inputValue, setInputValue] = useState<string>(persistedState.inputValue || "");

  // Track if user has manually selected an agent
  const [userHasSelectedAgent, setUserHasSelectedAgent] = useState(!!persistedState.agentId);

  // Debug logging
  useEffect(() => {
  }, [selectedAgentId, configAgentId, userHasSelectedAgent]);

  // Sessions state - initialize with configSessionKey/persisted if provided
  const [sessions, setSessions] = useState<Array<{ key: string; label?: string; updatedAt?: number }>>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | undefined>(
    persistedState.sessionKey || configSessionKey
  );
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Update selectedSessionKey when configSessionKey changes (e.g., new widget added)
  useEffect(() => {
    if (configSessionKey && !selectedSessionKey) {
      setSelectedSessionKey(configSessionKey);
    }
  }, [configSessionKey, selectedSessionKey]);

  // Persist widget state to localStorage (debounced to avoid thrashing on every keystroke)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const state = {
        agentId: selectedAgentId,
        sessionKey: selectedSessionKey,
        inputValue: inputValue,
      };
      localStorage.setItem(widgetStorageKey, JSON.stringify(state));
    }, 500);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [widgetStorageKey, selectedAgentId, selectedSessionKey, inputValue]);

  // Use selectedAgentId from state if available, otherwise fall back to config or first agent
  // Once user has selected an agent, always use that selection
  const currentAgentId = userHasSelectedAgent
    ? (selectedAgentId || agents[0]?.id || "main")
    : (selectedAgentId || configAgentId || agents[0]?.id || "main");
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
    sendMessage,
    stopGeneration,
    loadChatHistory,
    clearChat,
    setSessionKey,
  } = useGatewayChat({
    sessionKey,
    autoConnect: true,
  });

  // Unified tool state management - handles ALL tool types!
  const { toolStates, toggleToolExpansion, resetToolStates } = useUnifiedToolState(messages as any);

  // Reload chat history when session changes (including new sessions)
  // Track previous session key to avoid double-loading
  const prevSessionKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Skip initial render
    if (!sessionKey || sessionKey === prevSessionKeyRef.current) {
      return;
    }

    prevSessionKeyRef.current = sessionKey;

    // Load history when connected and we have a valid session key
    // This handles both existing sessions (selectedSessionKey) and new sessions
    if (isConnected && sessionKey) {
      loadChatHistory();
    }
  }, [isConnected, loadChatHistory, sessionKey]);

  // Fetch sessions when agent changes
  useEffect(() => {
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
    // Reset session selection when agent changes
    setSelectedSessionKey(undefined);
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

  // New chat callback
  const handleNewChat = useCallback(() => {
    setSelectedSessionKey(undefined);
    clearChat();
  }, [clearChat]);

  // Get user info for avatar
  const { userInfo } = useUser();

  // Local state
  const [inputAreaHeight, setInputAreaHeight] = useState(100);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Handle agent change - properly reset all state for new agent
  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setUserHasSelectedAgent(true); // Mark that user has manually selected

    // Generate new session key and explicitly tell the hook
    const newSessionKey = `agent:${agentId}:main`;
    setSessionKey(newSessionKey); // This will clear state in the hook
  }, [setSessionKey]);

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

  // Measure input area height
  useEffect(() => {
    const measureInputHeight = (): void => {
      if (inputAreaRef.current) {
        const height = inputAreaRef.current.offsetHeight;
        setInputAreaHeight(height + 10);
      }
    };

    measureInputHeight();
    window.addEventListener("resize", measureInputHeight);

    const timeoutId = setTimeout(measureInputHeight, 100);

    return () => {
      window.removeEventListener("resize", measureInputHeight);
      clearTimeout(timeoutId);
    };
  }, [messages.length]);

  // Handle send
  const handleSend = useCallback(
    async (message: string) => {
      if (!message.trim()) return;
      setInputValue("");
      await sendMessage(message);
    },
    [sendMessage]
  );

  // Handle copy
  const handleCopy = useCallback((message: GatewayChatMessage) => {
    const content = message.content || "";
    navigator.clipboard.writeText(content);
  }, []);

  // Check scroll position
  const checkScrollPosition = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const element = scrollAreaRef.current;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
    setShowScrollButton(!isAtBottom);
  }, []);

  // Scroll to bottom - instant, no animation
  const scrollToBottom = useCallback((_smooth = false) => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  // Scroll to bottom every time messages change
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [messages.length, scrollToBottom]);

  // Auto-scroll when new messages arrive - but only if user is already near bottom
  // or if this is a new message (not a history reload)
  const prevMessagesLengthRef = useRef<number>(0);

  // Note: Auto-scroll removed - using flex-col-reverse to show newest messages at bottom

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
    setInputValue("");
  }, [isLoading, clearChat]);

  // Determine if avatar should be shown
  const shouldShowAvatarCallback = useCallback(
    (index: number) => shouldShowAvatarLocal(messages, index),
    [messages]
  );

  // Get user avatar from user profile
  const userAvatar = {
    src: userInfo?.profilePic ? getMediaUrl(userInfo.profilePic) : undefined,
    fallback: userInfo?.username?.charAt(0).toUpperCase() || "U",
    alt: userInfo?.username || "User",
  };

  // Get assistant avatar
  const assistantAvatar = {
    src: undefined,
    fallback: currentAgent.name?.slice(0, 2).toUpperCase() || "AI",
    alt: currentAgent.name || "AI Assistant",
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
          onFetchSessions={fetchSessions}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          sessionsError={sessionsError}
        />

        <div className="flex flex-col w-full flex-1 p-0 overflow-hidden">
          <div className="flex flex-col w-full flex-1 p-0 overflow-hidden relative">
            {/* Messages Area */}
            <CardContent
              ref={scrollAreaRef}
              onScroll={checkScrollPosition}
              className="flex-1 min-h-0 p-0 overflow-y-auto overflow-x-auto customScrollbar2"
            >
              <div className="p-4">
                <div className="space-y-2">
                  {/* Error display */}
                  {error && (
                    <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
                      {error}
                    </div>
                  )}

                  {!isConnected ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                      <div className="text-3xl mb-2">🔌</div>
                      <p className="text-sm text-muted-foreground">
                        Connecting to gateway...
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Make sure OpenClaw gateway is running
                      </p>
                    </div>
                  ) : messages.length === 0 ? (
                    <EmptyState
                      userAvatar={userAvatar}
                      assistantAvatar={assistantAvatar}
                      onHintClick={() => {}}
                      personality={{
                        name: currentAgent.name,
                        coverPhoto: "",
                        tag: "OpenClaw Agent",
                      }}
                      suggestions={[]}
                      onSuggestionClick={() => {}}
                      isLoadingSuggestions={false}
                    />
                  ) : (
                    <AnimatePresence>
                      {(() => {
                        const nodes: React.ReactNode[] = [];

                        for (let index = 0; index < mergedMessages.length; index++) {
                          const message = mergedMessages[index];
                          const isToolMessage = message.role === "assistant" &&
                            ((message as any).toolCalls?.length > 0 || (message as any).contentBlocks?.some((b: any) => b.type === "toolCall"));

                          // Group consecutive tool call messages
                          if (isToolMessage) {
                            const toolMessages: GatewayChatMessage[] = [];
                            let j = index;

                            while (j < mergedMessages.length) {
                              const m = mergedMessages[j];
                              const isToolResultMsg = m.role === "tool" || (m.role as string) === "toolResult";
                              const isToolMsg = m.role === "assistant" &&
                                ((m as any).toolCalls?.length > 0 || (m as any).contentBlocks?.some((b: any) => b.type === "toolCall"));

                              if (isToolResultMsg || !isToolMsg) {
                                break;
                              }

                              toolMessages.push(m);
                              j++;
                            }

                            // If we have 2+ tool messages, group them in an accordion
                            if (toolMessages.length >= 2) {
                              // Use accordion pattern - shows summary header that expands to show all tools
                              nodes.push(
                                <GroupedToolActions
                                  key={`tool-actions-${index}`}
                                  toolMessages={toolMessages}
                                  toolStates={toolStates}
                                  toggleToolExpansion={toggleToolExpansion}
                                  showAvatar={shouldShowAvatarCallback(index)}
                                  index={index}
                                  shouldShowAvatar={shouldShowAvatarCallback}
                                />
                              );

                              index = j - 1;
                              continue;
                            }
                          }

                          // Single message
                          nodes.push(
                            <EnhancedMessageBubble
                              key={message.id || index}
                              message={message}
                              isUser={message.role === "user"}
                              showAvatar={shouldShowAvatarCallback(index)}
                              onCopy={handleCopy}
                              isLoading={
                                isLoading &&
                                index === mergedMessages.length - 1 &&
                                message.role === "assistant" &&
                                !message.content.trim()
                              }
                              botPic={undefined}
                              userPic={userAvatar}
                              toolStates={toolStates}
                              toggleToolExpansion={toggleToolExpansion}
                            />
                          );
                        }

                        return nodes;
                      })()}
                    </AnimatePresence>
                  )}
                </div>
                </div>

                {/* Scroll to bottom reference */}
                <div style={{ height: `${inputAreaHeight}px` }} />
            </CardContent>

            {/* Scroll to bottom button - hidden */}
            <AnimatePresence>
              {false && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 20 }}
                  className="absolute w-full flex justify-center z-50"
                  style={{ bottom: `${inputAreaHeight}px` }}
                >
                  <Button
                    onClick={() => scrollToBottom(true)}
                    size="icon"
                    className="rounded-full h-fit w-fit p-1.5 shadow-lg"
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

            {/* Input Area */}
            <div
              ref={inputAreaRef}
              className="absolute bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none"
            >
              <InputContainer
                onSendMessage={handleSend}
                placeholder={`Ask ${currentAgent.name} anything...`}
                disabled={isLoading}
                isLoading={isLoading}
                isSending={isLoading}
                showAttachments={false}
                showVoiceInput={false}
                showEmojiPicker={false}
                showActions={true}
                autoResize={true}
                allowEmptySend={false}
                maxAttachments={0}
                maxFileSize={0}
                allowedFileTypes={[]}
                attachments={[]}
                onAttachmentsChange={() => {}}
                onAddFiles={async () => {}}
                sessionKey={sessionKey}
                onStopGeneration={stopGeneration}
                value={inputValue}
                onChange={setInputValue}
              />
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
