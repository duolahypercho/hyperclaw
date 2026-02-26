"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  FC,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCopanionChatOS } from "@OS/Provider/OSProv";
import { useUser } from "$/Providers/UserProv";
import { useAssistant } from "$/Providers/AssistantProv";
import { useToast } from "@/components/ui/use-toast";
import { getMediaUrl } from "$/utils";
import {
  User,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  Trash2,
  Plus,
  Paperclip,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import CopanionIcon from "@OS/assets/copanion";
import { useCopanionChatLogic } from "@OS/AI/core/hook/use-copanion-chat-logic";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import { GenericToolMessage } from "@OS/AI/components/GenericToolMessage";
import { Message } from "@OS/AI/shared";
import { useCopanionContext } from "@OS/AI/core/context/copanion-context";
import HistoryDropdown from "$/components/HistoryDropdown";
import { AllowedFileTypes, useService } from "$/Providers/ServiceProv";
import { toolRegistry, UnifiedToolState } from "@OS/AI/components/ToolRegistry";
import { InputContainer } from "./InputContainer";
import createMarkdownComponents from "@OS/AI/components/createMarkdownComponents";
import {
  EnhancedCopyButton,
  RegenerateButton,
  FeedbackButton,
  ChatLoadingSkeleton,
  AnimatedThinkingText,
  CopilotChatProps,
  CopilotObservabilityHooks,
  SuggestionItem,
  stripEnvironmentDetails,
  shouldShowAvatar,
  shouldShowMessageActions,
  ChatError,
  ErrorDisplay,
  EmptyState,
  Suggestions,
  AttachmentUnion,
  AttachmentMessage,
} from "@OS/AI/components/Chat";
import { Collapsible } from "@/components/ui/collapsible";

// Memoized ReactMarkdown component for better performance
const MemoizedReactMarkdown: FC<Options> = memo(
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

const isAssistantToolCallMessage = (message: Message) =>
  message.role === "assistant" &&
  Array.isArray((message as any).toolCalls) &&
  (message as any).toolCalls.length > 0;

const isToolResultMessage = (message: Message) => message.role === "tool";

const ToolActionsGroupMessage = ({
  toolMessages,
  toolStates,
  toggleToolExpansion,
  assistantAvatar,
  botPic,
  showAvatar,
}: {
  toolMessages: Message[];
  toolStates?: Map<string, UnifiedToolState>;
  toggleToolExpansion?: (messageId: string) => void;
  assistantAvatar?: any;
  botPic?: string;
  showAvatar: boolean;
}) => {
  const [open, setOpen] = useState(false);

  // Auto-open if any tool is in permission stage (needs user interaction).
  useEffect(() => {
    const needsPermission = toolMessages.some((m) => {
      const id = (m as any).id || m.id || "";
      const state = id ? toolStates?.get(id) : undefined;
      const hasGenerativeUI = typeof (m as any)?.generativeUI === "function";
      return Boolean(state && hasGenerativeUI && state.status === "pending");
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
                {assistantAvatar?.icon || <CopanionIcon className="w-4 h-4" />}
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
                    const id = (toolMessage as any).id || toolMessage.id || "";
                    const state = id ? toolStates?.get(id) : undefined;

                    if (!state || !toggleToolExpansion) {
                      const toolName =
                        (toolMessage as any)?.toolCalls?.[0]?.function?.name ||
                        "action";
                      return (
                        <motion.div
                          key={id || `tool-action-fallback-${toolName}-${toolIndex}`}
                          className="py-1.5 px-3 relative w-fit max-w-full transition-all duration-300 select-text break-words overflow-wrap-anywhere rounded-lg border bg-muted/40 border-border/50 text-muted-foreground"
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
                        message={toolMessage}
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

// Enhanced message bubble - memoized for better streaming performance
const EnhancedMessageBubble = memo(
  ({
    message,
    isUser,
    showAvatar = true,
    userAvatar,
    assistantAvatar,
    onCopy,
    onRegenerate,
    onThumbsUp,
    onThumbsDown,
    botPic,
    isRegenerating = false,
    isLoading = false,
    onAttachmentClick,
    toolStates,
    toggleToolExpansion,
  }: {
    message: Message;
    isUser: boolean;
    showAvatar?: boolean;
    userAvatar?: any;
    assistantAvatar?: any;
    onCopy?: (message: Message) => void;
    onRegenerate?: (messageId: string) => void;
    onThumbsUp?: (message: Message) => void;
    onThumbsDown?: (message: Message) => void;
    botPic?: string;
    isRegenerating?: boolean;
    isLoading?: boolean;
    onAttachmentClick?: (url: string, alt: string) => void;
    toolStates?: Map<string, UnifiedToolState>;
    toggleToolExpansion?: (messageId: string) => void;
  }) => {
    const avatar = isUser ? userAvatar : assistantAvatar;
    const defaultIcon = isUser ? (
      <User className="w-4 h-4" />
    ) : (
      <CopanionIcon className="w-4 h-4" />
    );

    if (message.role === "system" || message.role === "tool") {
      return null;
    }

    // ✨ NEW: Handle assistant messages with tool calls using GenericToolMessage
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
            message={message}
            onToggleExpand={() => toggleToolExpansion(messageId)}
            assistantAvatar={assistantAvatar}
            botPic={botPic}
            showAvatar={showAvatar}
          />
        );
      }
    }

    // Check if message has content before rendering
    const hasImage = (message as any).image;
    const content = isUser
      ? stripEnvironmentDetails(message.content || "")
      : message.content || "";
    const hasTextContent = content.trim();

    // If no content and no image, and not loading, return null early (don't render avatar)
    if (!hasTextContent && !hasImage && !isLoading) {
      return null;
    }

    const renderContent = () => {
      // Only show loading if message is truly empty and it's the last message
      if (isLoading && !message.content?.trim()) {
        return (
          <div className="flex items-center">
            <AnimatedThinkingText />
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {/* Render image or file if present */}
          {hasImage && (
            <AttachmentMessage
              attachment={hasImage}
              onClick={onAttachmentClick}
            />
          )}

          {/* Render text content if present */}
          {hasTextContent && (
            <MemoizedReactMarkdown
              components={
                isUser
                  ? memoizedMarkdownComponents.user
                  : memoizedMarkdownComponents.assistant
              }
              remarkPlugins={[
                remarkGfm,
                remarkBreaks,
                [remarkMath, { singleDollarTextMath: false }],
              ]}
              rehypePlugins={[rehypeRaw]}
            >
              {content}
            </MemoizedReactMarkdown>
          )}
        </div>
      );
    };

    // Call generativeUI with proper props including messageId for HITL actions
    const subComponent = (message as any)?.generativeUI?.({
      messageId: (message as any).messageId || (message as any).id,
    });

    return (
      <>
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
                  ) : avatar?.src !== "/" ? (
                    <AvatarImage src={avatar.src} />
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
                "py-1.5 px-3 relative w-fit transition-all duration-200 group select-text break-words overflow-wrap-anywhere font-medium",
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
              onCopy={(e) => {
                // Intercept copy event to clean text from markdown HTML structure
                // The issue: markdown <p> tags create extra line breaks when copying
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed) return;

                let selectedText = selection.toString();

                // For simple single-line selections (like double-clicking "Hello there!"),
                // just trim whitespace. For multi-line, normalize intelligently.
                const isSingleLine = !selectedText.includes('\n') ||
                  selectedText.split('\n').filter(l => l.trim().length > 0).length === 1;

                let cleanedText: string;

                if (isSingleLine) {
                  // Simple case: just trim and normalize spaces
                  cleanedText = selectedText.trim().replace(/[ \t]+/g, ' ');
                } else {
                  // Multi-line: normalize whitespace while preserving structure
                  cleanedText = selectedText
                    // Replace 3+ newlines with double newline (preserve paragraph breaks)
                    .replace(/\n{3,}/g, '\n\n')
                    // Replace multiple spaces/tabs with single space
                    .replace(/[ \t]+/g, ' ')
                    // Trim each line but preserve line structure
                    .split('\n')
                    .map(line => line.trim())
                    .join('\n')
                    // Remove leading/trailing newlines
                    .trim();
                }

                // Prevent default copy and set cleaned text
                e.preventDefault();
                e.clipboardData.setData('text/plain', cleanedText);
              }}
            >
              {renderContent()}
            </div>

            {/* Message actions */}
            {shouldShowMessageActions(message, isLoading) && (
              <div className="flex items-center gap-1 mt-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <HyperchoTooltip
                  value={
                    (message as any).createdAt instanceof Date
                      ? (message as any).createdAt.toLocaleTimeString()
                      : new Date().toLocaleTimeString()
                  }
                >
                  <Button variant="ghost" size="iconSm">
                    <Clock className="w-3 h-3" />
                  </Button>
                </HyperchoTooltip>

                <EnhancedCopyButton message={message} onCopy={onCopy} />

                {!isUser && (
                  <>
                    <RegenerateButton
                      message={message}
                      onRegenerate={onRegenerate}
                      isLoading={isRegenerating}
                    />

                    <FeedbackButton
                      message={message}
                      onThumbsUp={onThumbsUp}
                      onThumbsDown={onThumbsDown}
                    />
                  </>
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
                // Invisible spacer to maintain alignment
                <div className="w-8 h-8 flex-shrink-0" />
              )}
            </div>
          )}
        </motion.div>
        <div style={{ marginBottom: "0.5rem" }}>{subComponent}</div>
      </>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for memo to prevent unnecessary re-renders during streaming
    // Also check message status to ensure generativeUI updates when status changes
    const prevStatus = (prevProps.message as any)?.status;
    const nextStatus = (nextProps.message as any)?.status;
    const prevExpired = (prevProps.message as any)?.expired;
    const nextExpired = (nextProps.message as any)?.expired;

    return (
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.role === nextProps.message.role &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.isRegenerating === nextProps.isRegenerating &&
      prevProps.showAvatar === nextProps.showAvatar &&
      prevProps.toolStates === nextProps.toolStates &&
      prevProps.onCopy === nextProps.onCopy &&
      prevProps.onRegenerate === nextProps.onRegenerate &&
      prevProps.onThumbsUp === nextProps.onThumbsUp &&
      prevProps.onThumbsDown === nextProps.onThumbsDown &&
      prevStatus === nextStatus &&
      prevExpired === nextExpired &&
      // Check if generativeUI function reference changed (indicates message was recreated)
      (prevProps.message as any)?.generativeUI ===
      (nextProps.message as any)?.generativeUI
    );
  }
);

// Main CopilotChat component
export const CopilotChat = ({
  suggestions = "auto",
  onSubmitMessage,
  makeSystemMessage,
  disableSystemMessage,
  onInProgress,
  onStopGeneration,
  onReloadMessages,
  onRegenerate,
  onCopy,
  onThumbsUp,
  onThumbsDown,
  observabilityHooks,
  renderError,
  children = null,
}: CopilotChatProps) => {
  const { updateOSSettings, showState } = useCopanionChatOS();
  const { userInfo } = useUser();
  const { personality } = useAssistant();
  const { toast } = useToast();
  const { uploadFileToCloud, deleteFileFromCloud } = useService();
  const { runtimeClient, conversationId } = useCopanionContext();

  // Dynamic height calculation for scroll reference
  const [inputAreaHeight, setInputAreaHeight] = useState(100); // Default fallback - increased for better spacing
  const inputAreaRef = useRef<HTMLDivElement>(null);
  // Input value state for controlled input
  const [inputValue, setInputValue] = useState("");
  // Store the last sent message so we can restore it if user stops generation
  const lastSentMessageRef = useRef<string>("");

  // Custom stop handler that removes all messages from the last user message onward
  const handleStopGeneration = useCallback(
    async (args: {
      messages: Message[];
      visibleMessages: any[]; // API format messages - use for setMessages
      setMessages: (messages: Message[]) => void;
      stopGeneration: () => { requestId: string | null };
    }) => {
      // IMPORTANT: Save the last sent message BEFORE any async operations
      // because stopGeneration() sets isLoading=false, which triggers useEffect
      // that clears lastSentMessageRef.current
      const messageToRestore = lastSentMessageRef.current;

      // CRITICAL: Stop the generation FIRST - this aborts the fetch request
      // The stop function returns the requestId which we can use for cancellation
      const { requestId } = args.stopGeneration();

      // CRITICAL: Send explicit cancel request to backend using requestId
      // requestId is generated BEFORE the request starts, so it's always available
      // conversationId might not be available yet if we haven't received the first response
      runtimeClient.cancelGeneration({ requestId, conversationId });

      // Use visibleMessages (API format) for setMessages to avoid double transformation
      // AGUI messages would be re-transformed by aguiToApi, creating duplicate tool messages
      const currentMessages = args.visibleMessages;

      // Find the last user message index
      const lastUserMessageIndex = currentMessages
        .map((msg: any, idx: number) => ({ msg, idx }))
        .reverse()
        .find(({ msg }: { msg: any }) => msg.role === "user")?.idx;

      // If we found a user message, remove all messages from that point onward
      if (lastUserMessageIndex !== undefined) {
        const lastUserMessage = currentMessages[lastUserMessageIndex];

        // Calculate chatID as the message before the initial user message
        const isInitialMessage = lastUserMessageIndex === 0;
        let chatID: string | null = null;

        if (!isInitialMessage) {
          const priorIndex = lastUserMessageIndex - 1;
          if (priorIndex >= 0) {
            const priorMessage = currentMessages[priorIndex];
            chatID =
              (priorMessage as any)?._id ||
              (priorMessage as any)?.messageId ||
              priorMessage?.id ||
              null;
          }
        }

        // Call revertLastUserMessage to remove it from the backend
        // Note: This endpoint may not exist on all backends, so we handle errors gracefully
        if (conversationId) {
          try {
            await runtimeClient.revertLastUserMessage({
              conversationId,
              chatID,
            });
          } catch (error) {
            // Silently handle 404s and other errors - the backend will handle cancellation
            // through the connection close event, so this is not critical
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes("404")) {
              // Only log non-404 errors for debugging
              console.warn("Failed to revert last user message on backend (non-critical):", error);
            }
            // Continue with frontend removal even if backend call fails
          }
        }

        // Remove all messages starting from the last user message (including it)
        // Using API format messages avoids the aguiToApi transformation that creates duplicates
        const updatedMessages = currentMessages.slice(0, lastUserMessageIndex);
        args.setMessages(updatedMessages);

        // Restore the original message the user typed (before environment details were added)
        // We use messageToRestore which was saved at the START of this function
        // (before stopGeneration() triggered the useEffect that clears the ref)
        if (messageToRestore) {
          setInputValue(stripEnvironmentDetails(messageToRestore));
        } else {
          // Fallback: try to get the content from the message being removed
          const removedUserMessage = lastUserMessage;
          const rawContent = (removedUserMessage as any)?.content || "";
          const cleanContent = stripEnvironmentDetails(rawContent);
          if (cleanContent) {
            setInputValue(cleanContent);
          }
        }

        // Clear the stored message after restoring (or if there was nothing to restore)
        lastSentMessageRef.current = "";
      }
    },
    [runtimeClient, conversationId]
  );

  // Use the real production chat hook
  const {
    messages,
    sendMessage,
    isLoading,
    stopGeneration,
    reloadMessages,
    suggestions: chatSuggestions,
    resetSuggestions,
    context,
    actions,
    fetchConversationHistory,
    conversationHistory,
    isLoadingHistory,
    historyError,
    loadConversation,
    newConversation,
    isChatLoading,
  } = useCopanionChatLogic(
    suggestions,
    makeSystemMessage,
    disableSystemMessage,
    onInProgress,
    onSubmitMessage,
    handleStopGeneration, // Use custom stop handler
    onReloadMessages
  );

  // State management
  const hasChatStarted = useMemo(() => {
    return messages.length > 0;
  }, [messages]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<
    string | null
  >(null);
  // ✨ NEW: Unified tool state management - handles ALL tool types!
  const { toolStates, toggleToolExpansion, resetToolStates } =
    useUnifiedToolState(messages);

  // Additional state for functionality that was in the old hook
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Helper function to convert core SuggestionItem to CopilotChat SuggestionItem
  const convertSuggestions = useCallback(
    (coreSuggestions: any[]): SuggestionItem[] => {
      return coreSuggestions.map((suggestion, index) => ({
        id: suggestion.id || `suggestion-${index}`,
        title: suggestion.title,
        message: suggestion.message,
        icon: suggestion.icon,
      }));
    },
    []
  );

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentUnion[]>([]);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Measure input area height dynamically
  useEffect(() => {
    const measureInputHeight = (): void => {
      if (inputAreaRef.current) {
        const height = inputAreaRef.current.offsetHeight;
        setInputAreaHeight(height + 10); // Add 10px buffer
      }
    };

    // Measure on mount and when window resizes
    measureInputHeight();
    window.addEventListener("resize", measureInputHeight);

    // Also measure when messages change (in case input area height changes)
    const timeoutId = setTimeout(measureInputHeight, 100);

    return () => {
      window.removeEventListener("resize", measureInputHeight);
      clearTimeout(timeoutId);
    };
  }, [messages.length]); // Re-measure when messages change

  // Add ResizeObserver to track input area height changes
  useEffect(() => {
    if (!inputAreaRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        setInputAreaHeight(height + 10); // Add 10px buffer
      }
    });

    resizeObserver.observe(inputAreaRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Also measure when attachments change (since they affect input height)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (inputAreaRef.current) {
        const height = inputAreaRef.current.offsetHeight;
        setInputAreaHeight(height + 10);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [attachments.length]);

  // Helper function to trigger observability hooks
  const triggerObservabilityHook = useCallback(
    (hookName: keyof CopilotObservabilityHooks, ...args: any[]) => {
      if (observabilityHooks?.[hookName]) {
        (observabilityHooks[hookName] as any)(...args);
      }
    },
    [observabilityHooks]
  );

  // Helper function to trigger chat error
  const triggerChatError = useCallback(
    (error: any, operation: string, originalError?: any) => {
      const errorMessage =
        error?.message || error?.toString() || "An error occurred";

      setChatError({
        message: errorMessage,
        operation,
        timestamp: Date.now(),
        onDismiss: () => setChatError(null),
        onRetry: () => {
          setChatError(null);
        },
      });

      if (observabilityHooks?.onError) {
        observabilityHooks.onError(error);
      }
    },
    [observabilityHooks]
  );

  // Handle sending messages
  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() && attachments.length === 0) return;

      // Store the original message before sending (for potential restoration on stop)
      const originalMessage = message.trim();
      lastSentMessageRef.current = originalMessage;

      // Clear input immediately for better UX (before async operations)
      setInputValue("");

      try {
        // Trigger message sent event
        triggerObservabilityHook("onMessageSent", message);

        // Convert attachments to the format expected by safelySendMessage
        const imagesToUse = await Promise.all(
          attachments
            .filter((attachment) => {
              // Only include attachments that have been successfully uploaded
              return attachment.url && !attachment.uploading;
            })
            .map(async (attachment) => {
              // Convert URL to base64 content
              const mediaUrl = getMediaUrl(attachment.url);

              if ("type" in attachment) {
                return {
                  name: attachment.name,
                  contentType: attachment.type,
                  url: mediaUrl,
                };
              }

              return {
                name: attachment.file.name,
                contentType: attachment.file.type,
                url: mediaUrl,
              };
            })
        );

        // Use the new hook's sendMessage function with attachments
        await sendMessage(message, imagesToUse);

        // Clear attachments after successful send
        setAttachments([]);
        // Keep lastSentMessageRef.current until message is fully processed
        // It will be cleared when generation completes or is stopped
      } catch (error) {
        console.error("Error sending message:", error);
        triggerChatError(error, "sendMessage", error);
        // On error, restore the message to input so user can retry
        setInputValue(originalMessage);
        // Clear the stored message on error since we restored it to input
        lastSentMessageRef.current = "";
      }
    },
    [attachments, triggerObservabilityHook, triggerChatError, sendMessage]
  );

  // Handle message regeneration
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      try {
        setRegeneratingMessageId(messageId);
        triggerObservabilityHook("onMessageRegenerated", messageId);

        // Use the new hook's reloadMessages function
        await reloadMessages(messageId);

        if (onRegenerate) {
          onRegenerate(messageId);
        } else {
          toast({
            title: "Regenerating",
            description: "Regenerating response...",
          });
        }
      } catch (error) {
        console.error("Error regenerating message:", error);
        triggerChatError(error, "regenerateMessage", error);
      } finally {
        setRegeneratingMessageId(null);
      }
    },
    [
      triggerObservabilityHook,
      onRegenerate,
      triggerChatError,
      toast,
      reloadMessages,
    ]
  );

  // Handle copy action (clipboard copy is done in EnhancedCopyButton)
  const handleCopy = useCallback(
    (message: Message) => {
      const content = stripEnvironmentDetails(message.content || "");
      triggerObservabilityHook("onMessageCopied", content);
      onCopy?.(content);
    },
    [triggerObservabilityHook, onCopy]
  );

  // Handle feedback actions
  const handleThumbsUp = useCallback(
    (message: Message) => {
      const messageId = (message as any).id || message.id || "";
      triggerObservabilityHook("onFeedbackGiven", messageId, "thumbsUp");

      if (onThumbsUp) {
        onThumbsUp(message);
      }

      toast({
        title: "Feedback received",
        description: "Thank you for your feedback!",
      });
    },
    [triggerObservabilityHook, onThumbsUp, toast]
  );

  const handleThumbsDown = useCallback(
    (message: Message) => {
      const messageId = (message as any).id || message.id || "";
      triggerObservabilityHook("onFeedbackGiven", messageId, "thumbsDown");

      if (onThumbsDown) {
        onThumbsDown(message);
      }

      toast({
        title: "Feedback received",
        description: "Thank you for your feedback!",
      });
    },
    [triggerObservabilityHook, onThumbsDown, toast]
  );

  // Handle suggestion clicks
  const handleSuggestionClick = useCallback(
    (message: string) => {
      handleSendMessage(message);
    },
    [handleSendMessage]
  );

  const handleConversationClick = useCallback(
    (conversationId: string) => {
      resetToolStates(); // Clear tool states when switching conversations
      loadConversation(conversationId);
    },
    [loadConversation, resetToolStates]
  );

  // Drag and drop functionality
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const filesArr = Array.from(files);
      const maxAttachments = 5;
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const allowedFileTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
      ];

      // Check limit
      if (attachments.length + filesArr.length > maxAttachments) {
        toast({
          title: `Maximum ${maxAttachments} files allowed`,
          variant: "destructive",
        });
        return;
      }

      for (const file of filesArr) {
        // Validate size
        if (maxFileSize && file.size > maxFileSize) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds the size limit`,
            variant: "destructive",
          });
          continue;
        }

        // Validate type if provided
        if (allowedFileTypes && !allowedFileTypes.includes(file.type)) {
          toast({
            title: "Unsupported file type",
            description: file.type,
            variant: "destructive",
          });
          continue;
        }

        const id = uuidv4();
        const localPreview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;

        // Optimistically add with uploading flag
        setAttachments((prev) => [
          ...prev,
          {
            id,
            type: file.type,
            name: file.name,
            size: file.size,
            url: "",
            preview: localPreview,
            uploading: true,
          },
        ]);

        // Determine allowedType for service upload
        const mimeMain = file.type.split("/")[0];
        let allowedType: AllowedFileTypes;
        if (mimeMain === "image") {
          allowedType = "image";
        } else if (file.type === "application/pdf") {
          allowedType = "pdf";
        } else {
          allowedType = "txt";
        }

        const urlKey = await uploadFileToCloud(
          file,
          allowedType,
          "chatTempFiles/",
          maxFileSize
        );

        if (!urlKey) {
          // Remove failed upload
          setAttachments((prev) => prev.filter((a) => a.id !== id));
          continue;
        }

        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, url: urlKey as string, uploading: false } : a
          )
        );
      }
    },
    [attachments.length, toast, uploadFileToCloud]
  );

  // Check if user is selecting text
  const isTextSelection = useCallback((e: DragEvent): boolean => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return false;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Check if drag started from within the selected text area
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }, []);

  // Drag and drop event handlers
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      // Only check for text selection, not draggable elements
      // This allows dragging files over the chat area
      if (isTextSelection(e.nativeEvent)) {
        return;
      }

      // Clear any existing timeout
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
        dragTimeoutRef.current = null;
      }

      setDragCounter((c) => {
        const next = c + 1;
        if (next === 1) {
          setIsDragging(true);
          // Safety timeout to reset drag state if it gets stuck
          dragTimeoutRef.current = setTimeout(() => {
            setIsDragging(false);
            setDragCounter(0);
          }, 10000); // 10 seconds timeout
        }
        return next;
      });
    },
    [isTextSelection]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragCounter((c) => {
      const next = c - 1;
      if (next <= 0) {
        setIsDragging(false);
        setDragCounter(0);
        // Clear timeout when drag ends
        if (dragTimeoutRef.current) {
          clearTimeout(dragTimeoutRef.current);
          dragTimeoutRef.current = null;
        }
        return 0;
      }
      return next;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragCounter(0);
      setIsDragging(false);

      // Clear timeout when drop occurs
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
        dragTimeoutRef.current = null;
      }

      // Only check for text selection, not draggable elements
      if (isTextSelection(e.nativeEvent)) {
        return;
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [isTextSelection, addFiles]
  );

  // Reset function for new chat
  const reset = useCallback(() => {
    if (isLoading) return;

    // Reset messages and suggestions
    newConversation();
    resetSuggestions();
    resetToolStates(); // Clear all tool states
    setShowScrollButton(false);
    setSessionKey((prev) => prev + 1);
    setInputValue(""); // Clear input
  }, [resetSuggestions, newConversation, resetToolStates]);

  // Reset state when copanion is closed
  useEffect(() => {
    if (!showState) {
      setShowScrollButton(false);
      setSessionKey(0);
      resetToolStates(); // Clear tool states when closing copanion
      setInputValue(""); // Clear input when closing
      // Clean up attachments when copanion is closed
      if (attachments.length > 0) {
        attachments.forEach(({ url }) => {
          if (url) deleteFileFromCloud(url);
        });
        setAttachments([]);
      }
      // Reset drag state
      setIsDragging(false);
      setDragCounter(0);
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
        dragTimeoutRef.current = null;
      }
    } else {
      setSessionKey((prev) => prev + 1);
    }
  }, [showState, attachments, deleteFileFromCloud, resetToolStates]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

  // Memoize the last message to prevent unnecessary re-renders
  const lastMessage = useMemo(() => {
    return messages[messages.length - 1];
  }, [messages.length]);

  // Scroll to bottom functionality
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  // Check scroll position
  const checkScrollPosition = useCallback(() => {
    if (!scrollAreaRef.current) return;

    const element = scrollAreaRef.current;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
    setShowScrollButton(!isAtBottom);
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollToBottom(true), 100);
    }
  }, [messages.length, scrollToBottom]);

  // Track loading state changes for chat start/stop events
  const prevIsLoading = useRef(isLoading);

  useEffect(() => {
    if (prevIsLoading.current !== isLoading) {
      if (isLoading) {
        triggerObservabilityHook("onChatStarted");
      } else {
        triggerObservabilityHook("onChatStopped");
        // Clear the stored message when generation completes successfully
        // (it was already used or is no longer needed)
        lastSentMessageRef.current = "";
      }
      prevIsLoading.current = isLoading;
    }
  }, [isLoading, triggerObservabilityHook]);

  return (
    <>
      <Card
        className="relative h-full flex flex-col overflow-hidden bg-transparent border-none rounded-none shadow-none"
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
              </div>
              <div>
                <CardTitle>{personality.name || "Copanion"}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {personality.tag || "Your AI companion for daily life"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <HyperchoTooltip value="New Chat">
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={reset}
                  disabled={!hasChatStarted || isLoading}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </HyperchoTooltip>

              <HistoryDropdown
                conversations={conversationHistory}
                isLoading={isLoadingHistory}
                error={historyError}
                onLoadConversation={handleConversationClick}
                onFetchHistory={fetchConversationHistory}
              />

              <HyperchoTooltip value="Close">
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => updateOSSettings?.({ copanion: false })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </HyperchoTooltip>
            </div>
          </div>
        </CardHeader>

        <div className={cn("flex flex-col w-full flex-1 p-0 overflow-hidden")}>
          <div className="flex flex-col w-full flex-1 p-0 overflow-hidden relative">
            {/* Messages Area */}
            <CardContent
              ref={scrollAreaRef}
              onScroll={checkScrollPosition}
              className="flex-1 min-h-0 p-0 overflow-y-auto overflow-x-hidden customScrollbar2"
            >
              <div className="p-4">
                <div className="space-y-2">
                  {/* Render error if present */}
                  {chatError && renderError && renderError(chatError)}
                  {chatError && !renderError && (
                    <ErrorDisplay
                      error={chatError}
                      onDismiss={chatError.onDismiss}
                      onRetry={chatError.onRetry}
                    />
                  )}

                  {isChatLoading ? (
                    <ChatLoadingSkeleton />
                  ) : messages.length === 0 ? (
                    <EmptyState
                      userAvatar={{
                        src: getMediaUrl(userInfo?.profilePic),
                        fallback:
                          userInfo?.username?.charAt(0).toUpperCase() || "U",
                        alt: userInfo?.username || "User",
                      }}
                      assistantAvatar={{
                        src: getMediaUrl(personality.coverPhoto),
                        fallback: personality.name?.slice(0, 2) || "Co",
                        alt: personality.name || "Copanion",
                      }}
                      onHintClick={handleSuggestionClick}
                      personality={personality}
                      suggestions={convertSuggestions(chatSuggestions)}
                      onSuggestionClick={handleSuggestionClick}
                      isLoadingSuggestions={isLoadingSuggestions}
                    />
                  ) : (
                    <AnimatePresence>
                      {(() => {
                        const nodes: React.ReactNode[] = [];

                        for (let index = 0; index < messages.length; index++) {
                          const message = messages[index];

                          // Group consecutive tool-call assistant messages (tool results may be interleaved)
                          if (isAssistantToolCallMessage(message)) {
                            const toolMessages: Message[] = [];
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

                              index = j - 1;
                              continue;
                            }
                          }

                          nodes.push(
                            <EnhancedMessageBubble
                              key={`${message.role}-${index}`} // Use stable key based on role and index
                              message={message}
                              isUser={message.role === "user"}
                              showAvatar={shouldShowAvatar(messages, index)}
                              userAvatar={{
                                src: getMediaUrl(userInfo?.profilePic),
                                fallback:
                                  userInfo?.username
                                    ?.charAt(0)
                                    .toUpperCase() || "U",
                                alt: userInfo?.username || "User",
                              }}
                              assistantAvatar={{
                                src: getMediaUrl(personality.coverPhoto),
                                fallback: personality.name || "Co",
                                alt: "Copanion",
                              }}
                              onCopy={handleCopy}
                              onRegenerate={handleRegenerate}
                              onThumbsUp={handleThumbsUp}
                              onThumbsDown={handleThumbsDown}
                              botPic={personality.coverPhoto}
                              isRegenerating={
                                regeneratingMessageId === (message as any).id ||
                                regeneratingMessageId === message.id
                              }
                              isLoading={
                                isLoading &&
                                !message.content?.trim() &&
                                message.id === messages[messages.length - 1]?.id
                              }
                              toolStates={toolStates}
                              toggleToolExpansion={toggleToolExpansion}
                            />
                          );
                        }

                        return nodes;
                      })()}
                    </AnimatePresence>
                  )}

                  {/* Show suggestions after messages if in auto mode */}
                  {suggestions === "auto" &&
                    messages.length > 0 &&
                    chatSuggestions.length > 0 &&
                    !isLoading && (
                      <Suggestions
                        suggestions={convertSuggestions(chatSuggestions)}
                        onSuggestionClick={handleSuggestionClick}
                        isLoading={isLoadingSuggestions}
                      />
                    )}
                </div>

                {/* Scroll to bottom reference */}
                <div style={{ height: `${inputAreaHeight}px` }} />
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
                  style={{ bottom: `${inputAreaHeight}px` }}
                >
                  <HyperchoTooltip value="Scroll to bottom">
                    <Button
                      onClick={() => scrollToBottom(true)}
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
            <div
              ref={inputAreaRef}
              className="absolute bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none"
            >
              <InputContainer
                onSendMessage={handleSendMessage}
                placeholder={
                  hasChatStarted
                    ? "Continue the conversation..."
                    : `Ask ${personality.name || "Copanion"} anything...`
                }
                disabled={isLoading}
                isLoading={isLoading}
                isSending={isLoading}
                showAttachments={true}
                showVoiceInput={true}
                showEmojiPicker={false}
                showActions={true}
                autoResize={true}
                allowEmptySend={false}
                maxAttachments={5}
                maxFileSize={10 * 1024 * 1024} // 10MB
                allowedFileTypes={[
                  "image/jpeg",
                  "image/png",
                  "image/gif",
                  "image/webp",
                  "application/pdf",
                  "text/plain",
                ]}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                onAddFiles={addFiles}
                sessionKey={sessionKey}
                onStopGeneration={stopGeneration}
                value={inputValue}
                onChange={setInputValue}
              />
            </div>
          </div>
        </div>
      </Card>
    </>
  );
};
