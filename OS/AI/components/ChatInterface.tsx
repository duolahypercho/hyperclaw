"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  Bot,
  User,
  MessageSquare,
  Copy,
  Check,
  Clock,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import ClickableImage from "$/components/UI/ClickableImage";
import { getMediaUrl } from "$/utils";
import { InputAttachment } from "@OS/AI/components/Chat";
import CopanionIcon from "@OS/assets/copanion";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { ChatMessage, MessageContent } from "../utils/messageConverter";
import { getOrCreateConversation } from "../api/conversation";
import { generateMessageId } from "../shared/utils/random-id";
import { AnimationContainer } from "./AnimationContainer";
import { InputContainer } from "./InputContainer";

// Generic streaming API type for different chat implementations
export type StreamingAPI = (
  history: ChatMessage[],
  conversationId?: string
) => Promise<AsyncIterable<string>>;

// Generic chat hook interface for different implementations
export interface ChatHookInterface {
  messages: any[]; // Allow any message type for flexibility
  isLoading: boolean;
  sendMessage: (message: any, options?: any) => Promise<void>; // Flexible message type
  addMessage?: (message: any) => void;
  updateMessage?: (messageId: string, updates: any) => void;
  deleteMessage?: (messageId: string) => void;
  clearMessages?: () => void;
  setMessages?: (messages: any[]) => void;
  stopGeneration?: () => void;
  reset?: () => void;
  conversationId?: string | null;
  setConversationId?: (id: string | null) => void;
  // Additional properties for full Copanion context
  visibleMessages?: any[];
  appendMessage?: (message: any, options?: any) => Promise<void>;
  reloadMessages?: (messageId: string) => Promise<void>;
  runChatCompletion?: () => Promise<any[]>;
  mcpServers?: any[];
  setMcpServers?: (servers: any[]) => void;
  suggestions?: any[];
  setSuggestions?: (suggestions: any[]) => void;
  generateSuggestions?: () => Promise<void>;
  resetSuggestions?: () => void;
  isLoadingSuggestions?: boolean;
  interrupt?: any;
}

export interface ChatInterfaceProps {
  // Core props
  messages?: ChatMessage[]; // Made optional for internal state management

  // NEW: Generic chat hook for different implementations
  chatHook?: ChatHookInterface;

  // NEW: Simplified streaming API (fallback for direct API usage)
  streamingAPI?: StreamingAPI;

  // Internal state management
  useInternalState?: boolean;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onMessageAdd?: (message: ChatMessage) => void;
  onMessageUpdate?: (messageId: string, updates: Partial<ChatMessage>) => void;
  onMessageDelete?: (messageId: string) => void;
  onClose?: () => void;

  // UI customization
  title?: string;
  description?: string;
  className?: string;
  classNames?: {
    endOfMessages?: string;
  };

  // Avatar customization
  userAvatar?: {
    src?: string;
    fallback?: string;
    icon?: React.ReactNode;
    alt?: string;
  };
  assistantAvatar?: {
    src?: string;
    fallback?: string;
    icon?: React.ReactNode;
    alt?: string;
  };

  // State management
  isLoading?: boolean;
  loadingText?: string;

  // Features
  showHeader?: boolean;
  showCopyButton?: boolean;
  autoScrollOnLoad?: boolean; // NEW: Control auto-scroll on initial load
  maxHeight?: string;
  additionalContent?: React.ReactNode;
  additionalActions?: (message: ChatMessage) => React.ReactNode; // NEW: Function that receives the message
  showInput?: boolean; // NEW: Control input visibility
  showScrollToBottomButton?: boolean; // NEW: Control scroll to bottom button visibility

  // Message customization
  messageProps?: {
    maxWidth?: string;
    showAvatar?: boolean;
    showRole?: boolean;
  };

  // Callbacks
  onMessageCopy?: (message: ChatMessage) => void;
  onMessageAction?: (action: string, message: ChatMessage) => void;
  onStreamComplete?: (messageId: string, completeText: string) => void;
  onMessageSend?: (message: string) => void; // NEW: Callback when message is sent
  onMessageSelect?: (messageId: string | null) => void; // NEW: Callback when message is selected

  // Empty state
  emptyState?: {
    icon?: React.ReactNode;
    title?: string;
    description?: string;
  };
  // NEW: Quick prompts shown when there are no messages
  quickPrompts?: { title: string; message: string }[];

  // Additional content
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  sidebarContent?: React.ReactNode;

  // Bot image for assistant messages
  botPic?: string;

  // Input configuration
  inputProps?: {
    placeholder?: string;
    maxLength?: number;
    rows?: number;
    disabled?: boolean;
  };

  onShowScrollButtonChange?: (show: boolean) => void; // NEW: Notify parent of scroll button state
}

export interface ChatInterfaceRef {
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  deleteMessage: (messageId: string) => void;
  clearMessages: () => void;
  setMessages: ((messages: ChatMessage[]) => void) | undefined;
  sendMessage: (
    message: string,
    attachments?: InputAttachment[]
  ) => Promise<void>; // NEW: Send message with streaming
  scrollToBottom: (smooth?: boolean) => void; // NEW: Manual scroll function
  getSelectedMessage: () => ChatMessage | null;
  setSelectedMessage: (messageId: string | null) => void; // NEW: Set selected message
  // NEW: Access to the underlying chat hook
  chatHook?: ChatHookInterface;
}

const LoadingDots = ({
  size = "default",
}: {
  size?: "small" | "default" | "large";
}) => {
  const sizeClasses = {
    small: "w-1 h-1",
    default: "w-2 h-2",
    large: "w-3 h-3",
  };

  return (
    <div className="flex space-x-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            "bg-muted-foreground rounded-full animate-bounce",
            sizeClasses[size]
          )}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
};

// Animated Copy Button Component
const AnimatedCopyButton = ({
  message,
  onCopy,
}: {
  message: ChatMessage;
  onCopy?: (message: ChatMessage) => void;
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const textToCopy =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content);

      await navigator.clipboard.writeText(textToCopy);

      // Call external callback
      onCopy?.(message);

      // Show success animation
      setIsCopied(true);

      // Reset after 2 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <HyperchoTooltip value="Copy to clipboard">
      <Button
        variant="ghost"
        size="iconSm"
        className={cn(isCopied && "bg-green-500 text-primary-foreground/80")}
        onClick={handleCopy}
        disabled={isCopied}
      >
        <AnimatePresence mode="wait">
          {isCopied ? (
            <motion.div
              key="check"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
                duration: 0.2,
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Check className="w-3 h-3" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ scale: 0, rotate: 90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: -90 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
                duration: 0.2,
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Copy className="w-3 h-3" />
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
    </HyperchoTooltip>
  );
};

const ChatbotObject = (content: MessageContent[]) => {
  return content.map((c, i) => {
    if (c.type === "text") {
      return <p key={i}>{c.text}</p>;
    }
    return null;
  });
};

const ImageObject = (content: MessageContent[]) => {
  return (
    <div className="flex flex-row p-1.5 gap-1">
      {content.map((c, i) => {
        if (c.type === "image_url") {
          return (
            <div key={i} className="relative">
              <ClickableImage
                src={getMediaUrl(c.image_url!.url)}
                alt={`image`}
                className="h-12 w-12 rounded-lg"
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
};

const MessageBubble = ({
  message,
  isUser,
  showAvatar = true,
  maxWidth = "80%",
  userAvatar,
  assistantAvatar,
  onCopy,
  onAction,
  onStreamComplete,
  botPic,
  additionalActions,
  isSelected = false,
  onSelect,
  onContentChange,
}: {
  message: ChatMessage;
  isUser: boolean;
  showAvatar?: boolean;
  maxWidth?: string;
  userAvatar?: ChatInterfaceProps["userAvatar"];
  assistantAvatar?: ChatInterfaceProps["assistantAvatar"];
  onCopy?: (message: ChatMessage) => void;
  onAction?: (action: string, message: ChatMessage) => void;
  onStreamComplete?: (messageId: string, completeText: string) => void;
  botPic?: string;
  additionalActions?: (message: ChatMessage) => React.ReactNode; // NEW: Function that receives the message
  isSelected?: boolean; // NEW: Whether this message is selected
  onSelect?: (messageId: string) => void; // NEW: Callback when message is selected
  onContentChange?: () => void; // NEW: Callback when streaming content changes
}) => {
  const avatar = isUser ? userAvatar : assistantAvatar;
  const defaultIcon = isUser ? (
    <User className="w-4 h-4" />
  ) : (
    <CopanionIcon className="w-4 h-4" />
  );

  // Check if this message is currently streaming
  const isStreaming = useMemo(
    () => !!message.stream && !isUser,
    [message.stream, isUser]
  );

  // Handle different content types
  const renderContent = () => {
    // If this message is streaming, use AnimationContainer
    if (isStreaming) {
      return (
        <AnimationContainer
          stream={message.stream}
          isMarkdown={true}
          onComplete={(completeText) => {
            if (message.id && onStreamComplete) {
              onStreamComplete(message.id, completeText);
            }
          }}
          onContentChange={onContentChange}
          autoScroll={false}
          className="bg-transparent border-none shadow-none p-0"
          variant="chat"
        />
      );
    }

    if (typeof message.content === "string") {
      // Don't render empty content
      if (!message.content.trim()) {
        return null;
      }

      return (
        <ReactMarkdown
          components={{
            pre: ({ node, ...props }) => (
              <div
                className={`overflow-auto w-full my-2 bg-background p-2 rounded-lg customScrollbar2 transition-opacity duration-1000`}
              >
                <pre {...props} />
              </div>
            ),
            code: ({ node, ...props }) => (
              <code
                {...props}
                className={`text-sm bg-black/20 p-1 rounded-lg transition-opacity duration-1000`}
              />
            ),
            p: ({ node, ...props }) => (
              <p
                {...props}
                className={`inline my-4 first:mt-0 text-sm last:mb-0 transition-opacity duration-1000`}
              />
            ),
            h3: ({ node, ...props }) => (
              <h3
                {...props}
                className={`font-semibold my-6 text-[1em] leading-relaxed transition-opacity duration-1000`}
              />
            ),
            strong: ({ node, ...props }) => (
              <strong
                {...props}
                className={`font-semibold text-sm transition-opacity duration-1000`}
              />
            ),
            ol: ({ node, ...props }) => (
              <ol
                {...props}
                className={`list-decimal list-inside pl-5 my-2 space-y-1 text-sm leading-relaxed transition-opacity duration-1000`}
              />
            ),
            ul: ({ node, ...props }) => (
              <ul
                {...props}
                className={`list-disc list-inside pl-5 my-2 space-y-1 text-sm leading-relaxed transition-opacity duration-1000`}
              />
            ),
            li: ({ node, ...props }) => (
              <li
                {...props}
                className={`mb-1 transition-opacity duration-1000`}
              />
            ),
            hr: ({ node, ...props }) => (
              <hr
                {...props}
                className={`my-[0.6em] h-[1px] bg-gray-100 px-3 transition-opacity duration-1000`}
              />
            ),
          }}
        >
          {message.content}
        </ReactMarkdown>
      );
    } else if (Array.isArray(message.content)) {
      return (
        <>
          {ImageObject(message.content)}
          {ChatbotObject(message.content)}
        </>
      );
    }

    return (
      <p className="text-sm whitespace-pre-wrap break-words">
        {message.content}
      </p>
    );
  };

  return (
    <div
      className={cn(
        "flex gap-3 group",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && showAvatar && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          {botPic ? (
            <AvatarImage
              src={getMediaUrl(botPic)}
              className="object-cover object-center"
            />
          ) : avatar?.src ? (
            <AvatarImage
              src={avatar.src}
              className="object-cover object-center"
            />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary">
            {avatar?.icon || avatar?.fallback || defaultIcon}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "relative flex flex-col max-w-[85%]",
          isUser ? "justify-end items-end" : "justify-start items-start"
        )}
      >
        <div
          className={cn(
            "py-1.5 px-3 relative w-fit transition-all duration-200",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted border border-border/50",
            isSelected && "ring-1 ring-primary shadow-lg" // NEW: Selection indicator
          )}
          style={{
            borderTopRightRadius: isUser ? "0px" : "10px",
            borderBottomRightRadius: isUser ? "10px" : "10px",
            borderTopLeftRadius: isUser ? "10px" : "0px",
            borderBottomLeftRadius: isUser ? "10px" : "10px",
          }}
          onClick={() => message.id && onSelect?.(message.id)} // NEW: Click to select
        >
          {renderContent()}
        </div>
        <div
          className={cn(
            "flex flex-row items-center gap-1 transition-opacity duration-200 mt-1 ml-3"
          )}
        >
          {additionalActions && additionalActions(message)}{" "}
          {/* NEW: Pass message to additionalActions */}
          <HyperchoTooltip
            value={
              message.timestamp?.toLocaleTimeString() || "Timestamp not found"
            }
          >
            <Button variant="ghost" size="iconSm">
              <Clock className="w-3 h-3" />
            </Button>
          </HyperchoTooltip>
          <AnimatedCopyButton message={message} onCopy={onCopy} />
        </div>
      </div>

      {isUser && showAvatar && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          {avatar?.src && (
            <AvatarImage
              src={avatar.src}
              className="object-cover object-center"
            />
          )}
          <AvatarFallback className="bg-secondary">
            {avatar?.icon || avatar?.fallback || defaultIcon}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

const EmptyState = ({
  emptyState,
  userAvatar,
  assistantAvatar,
  quickPrompts,
  onHintClick,
}: {
  emptyState?: ChatInterfaceProps["emptyState"];
  userAvatar?: ChatInterfaceProps["userAvatar"];
  assistantAvatar?: ChatInterfaceProps["assistantAvatar"];
  quickPrompts?: { title: string; message: string }[];
  onHintClick?: (message: string) => void;
}) => {
  const defaultIcon = <MessageSquare className="w-12 h-12" />;
  const defaultTitle = "No messages yet";
  const defaultDescription = "Messages will appear here";

  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 text-muted-foreground mx-auto mb-3">
        {emptyState?.icon || defaultIcon}
      </div>
      <h3 className="font-medium text-foreground mb-1">
        {emptyState?.title || defaultTitle}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {emptyState?.description || defaultDescription}
      </p>

      {quickPrompts && quickPrompts.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          {quickPrompts.map((qp, idx) => (
            <Button
              key={`${qp.title}-${idx}`}
              variant="secondary"
              size="sm"
              className="h-7 rounded-full px-3"
              onClick={() => onHintClick?.(qp.message)}
            >
              {qp.title}
            </Button>
          ))}
        </div>
      )}

      {/* Show avatars in empty state */}
      <div className="flex justify-center gap-4 mt-6">
        <div className="text-center">
          <Avatar className="w-8 h-8 mx-auto mb-2">
            <AvatarImage
              src={userAvatar?.src}
              alt={userAvatar?.alt || "You"}
              className="object-cover object-center"
            />
            <AvatarFallback className="bg-secondary text-xs">
              {userAvatar?.fallback || "U"}
            </AvatarFallback>
          </Avatar>
          <p className="text-xs text-muted-foreground">
            {userAvatar?.alt || "You"}
          </p>
        </div>
        <div className="text-center">
          <Avatar className="w-8 h-8 mx-auto mb-2">
            <AvatarImage
              src={assistantAvatar?.src}
              alt={assistantAvatar?.alt || "Copanion"}
              className="object-cover object-center"
            />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {assistantAvatar?.fallback || "CO"}
            </AvatarFallback>
          </Avatar>
          <p className="text-xs text-muted-foreground">
            {assistantAvatar?.alt || "Copanion"}
          </p>
        </div>
      </div>
    </div>
  );
};

// Scroll to Bottom Button Component
const ScrollToBottomButton = ({
  onClick,
  isVisible,
}: {
  onClick: () => void;
  isVisible: boolean;
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            duration: 0.2,
          }}
        >
          <HyperchoTooltip value="Scroll to bottom">
            <Button
              onClick={onClick}
              size="icon"
              className="rounded-full h-8 w-8 pointer-events-auto"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </HyperchoTooltip>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ChatInterface = React.forwardRef<
  ChatInterfaceRef,
  ChatInterfaceProps
>(
  (
    {
      messages: externalMessages,
      chatHook, // NEW: Generic chat hook
      streamingAPI,
      useInternalState = false,
      initialMessages = [],
      onMessagesChange,
      onMessageAdd,
      onMessageUpdate,
      onMessageDelete,
      title = "Chat",
      description,
      className,
      classNames = {},
      userAvatar,
      assistantAvatar,
      isLoading = false,
      loadingText,
      showHeader = true,
      showCopyButton = true,
      autoScrollOnLoad = true, // NEW: Default to true for better UX
      maxHeight = "100%",
      showInput = true, // NEW: Default to showing input
      showScrollToBottomButton = true, // NEW: Default to showing scroll button
      messageProps = {},
      onMessageCopy,
      onMessageAction,
      onStreamComplete,
      onMessageSend,
      onClose,
      onMessageSelect, // NEW: Callback when message is selected
      emptyState,
      quickPrompts,
      headerContent,
      footerContent,
      additionalContent,
      additionalActions,
      sidebarContent,
      botPic,
      inputProps = {},
      onShowScrollButtonChange,
    },
    ref
  ) => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const scrollToBottomRef = useRef<HTMLDivElement>(null);

    // Internal state management
    const [internalMessages, setInternalMessages] =
      useState<ChatMessage[]>(initialMessages);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
      null
    );
    const [initialLoad, setInitialLoad] = useState(autoScrollOnLoad);
    const [showScrollButton, setShowScrollButton] = useState(false); // NEW: Track scroll button visibility
    const [conversationId, setConversationId] = useState<string | null>(null);
    const { toast } = useToast();

    // Use chat hook, internal, or external messages based on priority
    // Convert messages to ChatMessage format if needed
    const messages = useMemo(() => {
      if (chatHook?.messages) {
        // Convert from any message format to ChatMessage format
        return chatHook.messages.map((msg: any) => {
          if (msg.role && msg.content !== undefined) {
            return {
              id: msg.id || Date.now().toString(),
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp || new Date(),
              attachments: msg.attachments,
              stream: msg.stream,
              display: msg.display,
              metadata: msg.metadata,
            } as ChatMessage;
          }
          return msg;
        });
      }
      return useInternalState ? internalMessages : externalMessages || [];
    }, [
      chatHook?.messages,
      useInternalState,
      internalMessages,
      externalMessages,
    ]);

    // Use chat hook loading state or fallback to prop
    const actualIsLoading = chatHook?.isLoading ?? isLoading;

    const {
      maxWidth = "80%",
      showAvatar = true,
      showRole = false,
    } = messageProps;

    // Check if scroll to bottom button should be visible
    const checkScrollPosition = useCallback(() => {
      if (!scrollAreaRef.current || !scrollToBottomRef.current) return;

      const scrollElement = scrollAreaRef.current;
      const bottomElement = scrollToBottomRef.current;

      const scrollRect = scrollElement.getBoundingClientRect();
      const bottomRect = bottomElement.getBoundingClientRect();

      // Check if the bottom element is visible in the scroll area
      const isBottomVisible = bottomRect.bottom <= scrollRect.bottom;

      setShowScrollButton((prev) => {
        const newValue = !isBottomVisible;
        if (prev !== newValue) {
          onShowScrollButtonChange?.(newValue);
        }
        return newValue;
      });
    }, [onShowScrollButtonChange]);

    // Manual scroll function for programmatic use
    const scrollToBottom = useCallback(
      (smooth = true) => {
        if (scrollAreaRef.current) {
          const scrollElement = scrollAreaRef.current;

          // Scroll to the very bottom of the content
          scrollElement.scrollTo({
            top: scrollElement.scrollHeight,
            behavior: smooth ? "smooth" : "auto",
          });
        }

        // If smooth scrolling, wait for animation to complete before checking position
        if (smooth) {
          setTimeout(() => {
            checkScrollPosition();
          }, 300); // Wait for scroll animation to complete
        } else {
          // For instant scroll, check immediately
          checkScrollPosition();
        }
      },
      [checkScrollPosition]
    );

    // Check if there's a streaming message (for loading state)
    const hasStreamingMessage = useMemo(() => {
      return messages.some((msg) => msg.stream && msg.role === "assistant");
    }, [messages]);

    // NEW: Determine if there is at least one visible message (display === true)
    const hasAtLeastOneDisplayed = useMemo(() => {
      // Treat undefined display as visible; only hide when display === false
      return messages.some(
        (msg) => msg.role !== "system" && msg.display !== false
      );
    }, [messages]);

    const [showLoadingDots, setShowLoadingDots] = useState(false);

    useEffect(() => {
      if (actualIsLoading || isProcessing) {
        setShowLoadingDots(true);
      } else if (hasStreamingMessage) {
        // Add a small delay before hiding loading dots when streaming starts
        const timer = setTimeout(() => {
          setShowLoadingDots(false);
        }, 100);
        return () => clearTimeout(timer);
      } else {
        setShowLoadingDots(false);
      }
    }, [actualIsLoading, isProcessing, hasStreamingMessage]);

    const shouldShowLoading = showLoadingDots;

    // NEW: Handle message selection
    const handleMessageSelect = useCallback(
      (messageId: string) => {
        setSelectedMessageId(messageId);
        onMessageSelect?.(messageId);
      },
      [onMessageSelect]
    );

    const getSelectedMessage = useCallback(() => {
      if (!selectedMessageId) return null;
      return messages.find((msg) => msg.id === selectedMessageId) || null;
    }, [selectedMessageId, messages]);

    const setSelectedMessage = useCallback(
      (messageId: string | null) => {
        setSelectedMessageId(messageId);
        onMessageSelect?.(messageId);
      },
      [onMessageSelect]
    );

    const addMessage = useCallback(
      (message: ChatMessage) => {
        if (chatHook?.addMessage) {
          chatHook.addMessage(message);
        } else if (useInternalState) {
          setInternalMessages((prev) => [...prev, message]);
          onMessageAdd?.(message);
          onMessagesChange?.([...messages, message]);
        }
      },
      [chatHook, useInternalState, messages, onMessageAdd, onMessagesChange]
    );

    const updateMessage = useCallback(
      (messageId: string, updates: Partial<ChatMessage>) => {
        if (chatHook?.updateMessage) {
          chatHook.updateMessage(messageId, updates);
        } else if (useInternalState) {
          setInternalMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, ...updates } : msg
            )
          );
          onMessageUpdate?.(messageId, updates);
          onMessagesChange?.(
            messages.map((msg) =>
              msg.id === messageId ? { ...msg, ...updates } : msg
            )
          );
        }
      },
      [chatHook, useInternalState, messages, onMessageUpdate, onMessagesChange]
    );

    const deleteMessage = useCallback(
      (messageId: string) => {
        if (chatHook?.deleteMessage) {
          chatHook.deleteMessage!(messageId);
        } else if (useInternalState) {
          setInternalMessages((prev) =>
            prev.filter((msg) => msg.id !== messageId)
          );
          onMessageDelete?.(messageId);
          onMessagesChange?.(messages.filter((msg) => msg.id !== messageId));
        }
      },
      [chatHook, useInternalState, messages, onMessageDelete, onMessagesChange]
    );

    const clearMessages = useCallback(() => {
      if (chatHook?.clearMessages) {
        chatHook.clearMessages!();
      } else if (useInternalState) {
        setInternalMessages([]);
        onMessagesChange?.([]);
      }
    }, [chatHook, useInternalState, onMessagesChange]);

    const sendMessage = useCallback(
      async (message: string, attachments?: InputAttachment[]) => {
        // Use chat hook sendMessage if available, otherwise fallback to streamingAPI
        if (chatHook?.sendMessage) {
          return chatHook.sendMessage({
            id: Date.now().toString(),
            role: "user",
            content: message,
          });
        }

        if (!streamingAPI || !message.trim()) return;

        if (isProcessing || hasStreamingMessage) {
          return;
        }

        try {
          setIsProcessing(true);

          // Add user message
          const userMessage: ChatMessage = {
            id: generateMessageId(),
            role: "user",
            content: message,
            timestamp: new Date(),
            attachments: attachments,
          };
          addMessage(userMessage);

          // Call external callback
          onMessageSend?.(message);

          const conversationHistory = [
            {
              role: "user" as const,
              content: message,
              attachments: attachments,
            },
          ];

          let newConversationId = conversationId;

          if (!conversationId) {
            try {
              const conversationResponse = await getOrCreateConversation({
                conversationId: conversationId || "",
                initialMessages: messages.map((msg) => ({
                  _id: generateMessageId(),
                  role: msg.role,
                  content: msg.content,
                  attachments: msg.attachments,
                  metadata: msg.metadata,
                  display: msg.display,
                  timestamp: msg.timestamp,
                })),
              });

              if (conversationResponse.data) {
                newConversationId = conversationResponse.data._id;
                setConversationId(newConversationId);
              } else {
                console.error("No conversation data received");
                toast({
                  title: "Error",
                  description:
                    "Failed to create conversation. Please try again.",
                  variant: "destructive",
                });
                return;
              }
            } catch (error) {
              console.error("Error creating conversation:", error);
              toast({
                title: "Error",
                description: "Failed to create conversation. Please try again.",
                variant: "destructive",
              });
              return;
            }
          }

          if (!newConversationId) {
            toast({
              title: "Error",
              description: "Failed to create conversation. Please try again.",
              variant: "destructive",
            });
            return;
          }

          // Get stream from API
          const stream = await streamingAPI(
            conversationHistory,
            newConversationId
          );

          // Add streaming assistant message
          const assistantMessage: ChatMessage = {
            id: generateMessageId(),
            role: "assistant",
            content: "",
            stream: stream,
            timestamp: new Date(),
            attachments: attachments,
          };
          addMessage(assistantMessage);
        } catch (error) {
          console.error("Error sending message:", error);

          // Add error message
          const errorMessage: ChatMessage = {
            id: generateMessageId(),
            role: "assistant",
            content:
              "Sorry, there was an error processing your request. Please try again.",
            timestamp: new Date(),
          };
          addMessage(errorMessage);
        } finally {
          setIsProcessing(false);
        }
      },
      [
        chatHook,
        streamingAPI,
        messages,
        addMessage,
        onMessageSend,
        isProcessing,
        hasStreamingMessage,
      ]
    );

    // Expose internal state management functions through ref
    React.useImperativeHandle(
      ref,
      () => ({
        messages,
        addMessage,
        updateMessage,
        deleteMessage,
        clearMessages,
        setMessages: chatHook
          ? chatHook.setMessages
          : useInternalState
          ? setInternalMessages
          : undefined,
        sendMessage, // NEW: Expose sendMessage function
        scrollToBottom, // NEW: Expose scrollToBottom function
        getSelectedMessage, // NEW: Expose getSelectedMessage function
        setSelectedMessage, // NEW: Expose setSelectedMessage function
        chatHook, // NEW: Expose chat hook for advanced usage
      }),
      [
        messages,
        addMessage,
        updateMessage,
        deleteMessage,
        clearMessages,
        chatHook,
        useInternalState,
        sendMessage,
        scrollToBottom,
        getSelectedMessage,
        setSelectedMessage,
      ]
    );

    // Check scroll position on scroll events
    useEffect(() => {
      const scrollElement = scrollAreaRef.current;
      if (!scrollElement) return;

      const handleScroll = () => {
        checkScrollPosition();
      };

      scrollElement.addEventListener("scroll", handleScroll);
      return () => scrollElement.removeEventListener("scroll", handleScroll);
    }, [checkScrollPosition]);

    // Auto-scroll to bottom on initial load and when messages change
    useEffect(() => {
      // Only auto-scroll if autoScroll is enabled and there are messages
      if (initialLoad && messages.length > 0) {
        // Use a small delay to ensure DOM is updated
        const timer = setTimeout(() => {
          scrollToBottom(false); // Use instant scroll for initial load
          setInitialLoad(false);
        }, 100);

        return () => clearTimeout(timer);
      }
    }, [initialLoad, messages.length, scrollToBottom]);

    // NEW: Auto-scroll when new messages are added (for streaming)
    useEffect(() => {
      if (hasStreamingMessage) {
        // Use smooth scroll for streaming messages
        const timer = setTimeout(() => {
          scrollToBottom(true);
        }, 50);

        return () => clearTimeout(timer);
      }
    }, [hasStreamingMessage, scrollToBottom]);

    const handleInternalStreamComplete = useCallback(
      (messageId: string, completeText: string) => {
        // Update the message with complete content
        if (useInternalState) {
          updateMessage(messageId, { content: completeText, stream: null });
        } else {
          // For external state management, call the update callback
          onMessageUpdate?.(messageId, { content: completeText, stream: null });
        }

        // Ensure processing state is reset when streaming completes
        setIsProcessing(false);

        // Call external callback if provided (for external state management)
        if (onStreamComplete) {
          onStreamComplete(messageId, completeText);
        }
      },
      [
        useInternalState,
        updateMessage,
        onMessageUpdate,
        onStreamComplete,
        scrollToBottom,
      ]
    );

    // Call onShowScrollButtonChange on mount and when showScrollButton changes
    useEffect(() => {
      onShowScrollButtonChange?.(showScrollButton);
    }, [showScrollButton, onShowScrollButtonChange]);

    const chatContent = (
      <div
        className={cn(
          "relative flex flex-col h-full rounded-lg bg-muted/20",
          className
        )}
      >
        {/* Messages Area */}
        <div
          ref={scrollAreaRef}
          className="flex-1 border border-border/50 p-3 overflow-y-auto overflow-x-hidden customScrollbar2"
          style={{ maxHeight }}
        >
          <div className="space-y-4">
            {messages.length === 0 ||
            messages.every((message) => message.role === "system") ||
            !hasAtLeastOneDisplayed ? (
              <EmptyState
                emptyState={emptyState}
                userAvatar={userAvatar}
                assistantAvatar={assistantAvatar}
                quickPrompts={
                  quickPrompts && quickPrompts.length > 0
                    ? quickPrompts
                    : [
                        {
                          title: "What can you do?",
                          message:
                            "Can you explain all the things you can help me with as my AI Copanion?",
                        },
                        {
                          title: "How do I begin?",
                          message:
                            "I'm new here. Can you guide me step by step on how to get started?",
                        },
                        {
                          title: "Explain your process",
                          message:
                            "Can you explain how you approach solving problems or generating business strategies?",
                        },
                      ]
                }
                onHintClick={(msg) => sendMessage(msg)}
              />
            ) : (
              // Filter out system messages - they should not be displayed
              messages
                .filter(
                  (message) =>
                    message.role !== "system" && message.display !== false
                )
                .map((message, index) => (
                  <MessageBubble
                    key={message.id || `message-${index}`}
                    message={message}
                    isUser={message.role === "user"}
                    showAvatar={showAvatar}
                    maxWidth={maxWidth}
                    userAvatar={userAvatar}
                    assistantAvatar={assistantAvatar}
                    onCopy={showCopyButton ? onMessageCopy : undefined}
                    onAction={onMessageAction}
                    onStreamComplete={handleInternalStreamComplete}
                    additionalActions={additionalActions}
                    botPic={botPic}
                    isSelected={message.id === selectedMessageId} // NEW: Pass selection state
                    onSelect={handleMessageSelect} // NEW: Pass selection handler
                    onContentChange={() => {
                      // Check scroll position when streaming content changes
                      setTimeout(() => {
                        checkScrollPosition();
                      }, 50);
                    }}
                  />
                ))
            )}

            {/* Loading message bubble */}
            {shouldShowLoading && (
              <div className="flex gap-3 justify-start">
                {showAvatar && (
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    {botPic ? (
                      <AvatarImage
                        src={getMediaUrl(botPic)}
                        className="object-cover object-center"
                      />
                    ) : assistantAvatar?.src ? (
                      <AvatarImage
                        src={assistantAvatar.src}
                        className="object-cover object-center"
                      />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {assistantAvatar?.icon || <Bot className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="relative flex max-w-[85%] justify-start">
                  <div className="py-1.5 px-3 rounded-lg relative bg-muted border border-border/50 flex items-center">
                    <>
                      {loadingText ? (
                        <span className="text-xs text-muted-foreground">
                          {loadingText}
                        </span>
                      ) : (
                        <LoadingDots size="small" />
                      )}
                    </>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scroll to bottom reference element */}
          <div
            ref={scrollToBottomRef}
            className={cn("h-28", classNames.endOfMessages)}
          />
        </div>
      </div>
    );

    return (
      <div className={cn("h-full flex flex-col", className)}>
        {showHeader &&
          (headerContent || (
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {title}
                    <div
                      className={cn(
                        "flex items-center gap-1 text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded-full opacity-0",
                        hasStreamingMessage && "opacity-100"
                      )}
                    >
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                      <span>AI responding...</span>
                    </div>
                  </CardTitle>
                  {description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {description}
                    </p>
                  )}
                </div>
                {onClose && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-fit w-fit p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
          ))}

        <CardContent className="flex-1 flex flex-col overflow-y-auto customScrollbar2 p-0">
          {sidebarContent ? (
            <div className="flex gap-4 h-full">
              <div className="flex-1">{chatContent}</div>
              <div className="w-64 border-l border-border/50 pl-4">
                {sidebarContent}
              </div>
            </div>
          ) : (
            chatContent
          )}
        </CardContent>

        {showInput && (
          <div className="absolute inset-x-0 bottom-3 w-full max-w-lg mx-auto flex flex-col items-center justify-end pointer-events-none px-6">
            <div className="mb-1">
              {/* Scroll to Bottom Button */}
              {showScrollToBottomButton && (
                <ScrollToBottomButton
                  onClick={() => scrollToBottom(true)}
                  isVisible={showScrollButton}
                />
              )}
              {additionalContent}
            </div>
            <InputContainer
              onSendMessage={sendMessage}
              placeholder={inputProps.placeholder || "Type your message..."}
              maxLength={inputProps.maxLength || 1000}
              rows={inputProps.rows || 2}
              disabled={
                inputProps.disabled ||
                actualIsLoading ||
                isProcessing ||
                hasStreamingMessage
              }
              className="w-full pointer-events-auto"
              isLoading={actualIsLoading || isProcessing || hasStreamingMessage}
              isSending={actualIsLoading || isProcessing || hasStreamingMessage}
              loadingText={
                hasStreamingMessage ? "AI is responding..." : "Processing..."
              }
              showAttachments={false}
              showVoiceInput={false}
              showEmojiPicker={false}
              showActions={true}
              autoResize={true}
              allowEmptySend={false}
            />
          </div>
        )}
      </div>
    );
  }
);

export default ChatInterface;

// Custom hook for using ChatInterface with internal state
export const useChatInterface = (initialMessages: ChatMessage[] = []) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateMessage = useCallback(
    (messageId: string, updates: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
      );
    },
    []
  );

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const addUserMessage = useCallback(
    (content: string) => {
      const message: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content,
        timestamp: new Date(),
      };
      addMessage(message);
      return message;
    },
    [addMessage]
  );

  const addAssistantMessage = useCallback(
    (content: string, stream?: AsyncIterable<string>) => {
      const message: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content,
        timestamp: new Date(),
        stream,
      };
      addMessage(message);
      return message;
    },
    [addMessage]
  );

  const addStreamingMessage = useCallback(
    (stream: AsyncIterable<string>) => {
      const message: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        stream,
      };
      addMessage(message);
      return message;
    },
    [addMessage]
  );

  return {
    messages,
    setMessages,
    addMessage,
    updateMessage,
    deleteMessage,
    clearMessages,
    addUserMessage,
    addAssistantMessage,
    addStreamingMessage,
  };
};
