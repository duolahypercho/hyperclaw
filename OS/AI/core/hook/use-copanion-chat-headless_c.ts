import { useRef, useEffect } from "react";
import { ChatMessage } from "@OS/AI/utils/messageConverter";
import { AppendMessageOptions } from "./use-chat";
import { Message } from "@OS/AI/shared";
import { Message as DeprecatedGqlMessage } from "@OS/AI/runtime-client";
import { useCopanionChat, MCPServerConfig } from "./use-copanion-chat_internal";

// Re-export types from internal for consistency
export type {
  UseCopanionChatOptions as UseCopanionChatOptions_c,
  UseCopanionChatReturn as UseCopanionChatReturn_c,
  MCPServerConfig,
} from "./use-copanion-chat_internal";

// Simplified options for headless implementation
export interface UseCopanionChatHeadlessOptions {
  /**
   * A unique identifier for the chat. If not provided, a random one will be
   * generated. When provided, the `useChat` hook with the same `id` will
   * have shared states across components.
   */
  id?: string;

  /**
   * HTTP headers to be sent with the API request.
   */
  headers?: Record<string, string> | Headers;

  /**
   * Initial messages to populate the chat with
   */
  initialMessages?: Message[];

  /**
   * A function to generate the system message. Defaults to `defaultSystemMessage`.
   */
  makeSystemMessage?: (
    contextString: string,
    additionalInstructions?: string
  ) => string;

  /**
   * Disables inclusion of CopilotKit's default system message. When true, no system message is sent.
   */
  disableSystemMessage?: boolean;

  /**
   * Model to use for chat completion
   */
  model?: string;

  /**
   * Maximum tokens for responses
   */
  maxTokens?: number;

  /**
   * Temperature for response generation
   */
  temperature?: number;

  /**
   * Custom streaming API function (fallback if not using full context)
   */
  streamingAPI?: (
    history: ChatMessage[],
    conversationId?: string
  ) => Promise<AsyncIterable<string>>;

  /**
   * Callback when messages change
   */
  onMessagesChange?: (messages: ChatMessage[]) => void;

  /**
   * Callback when a message is added
   */
  onMessageAdd?: (message: ChatMessage) => void;

  /**
   * Callback when a message is updated
   */
  onMessageUpdate?: (messageId: string, updates: Partial<ChatMessage>) => void;

  /**
   * Callback when a message is deleted
   */
  onMessageDelete?: (messageId: string) => void;

  /**
   * Callback when streaming completes
   */
  onStreamComplete?: (messageId: string, completeText: string) => void;

  /**
   * Callback when message is sent
   */
  onMessageSend?: (message: string) => void;
}

// Return type for headless hook
export interface UseCopanionChatHeadlessReturn {
  /**
   * @deprecated use `messages` instead, this is an old non ag-ui version of the messages
   * Array of messages currently visible in the chat interface
   */
  visibleMessages: DeprecatedGqlMessage[];

  /**
   * The messages that are currently in the chat in AG-UI format.
   */
  messages: Message[];

  /** @deprecated use `sendMessage` instead */
  appendMessage: (
    message: DeprecatedGqlMessage,
    options?: AppendMessageOptions
  ) => Promise<void>;

  /**
   * Send a new message to the chat
   */
  sendMessage: (
    message: Message,
    options?: AppendMessageOptions
  ) => Promise<void>;

  /**
   * Replace all messages in the chat
   */
  setMessages: (messages: Message[] | DeprecatedGqlMessage[]) => void;

  /**
   * Remove a specific message by ID
   */
  deleteMessage: (messageId: string) => void;

  /**
   * Regenerate the response for a specific message
   */
  reloadMessages: (messageId: string) => Promise<void>;

  /**
   * Stop the current message generation.
   * Returns the requestId of the cancelled request for explicit backend cancellation.
   */
  stopGeneration: () => { requestId: string | null };

  /**
   * Clear all messages and reset chat state
   */
  reset: () => void;

  /**
   * Whether the chat is currently generating a response
   */
  isLoading: boolean;

  /** Manually trigger chat completion (advanced usage) */
  runChatCompletion: () => Promise<Message[]>;

  /** MCP (Model Context Protocol) server configurations */
  mcpServers: MCPServerConfig[];

  /** Update MCP server configurations */
  setMcpServers: (mcpServers: MCPServerConfig[]) => void;

  /**
   * Current suggestions array
   */
  suggestions: any[];

  /**
   * Manually set suggestions
   */
  setSuggestions: (suggestions: any[]) => void;

  /**
   * Trigger AI-powered suggestion generation
   */
  generateSuggestions: () => Promise<void>;

  /**
   * Clear all current suggestions
   */
  resetSuggestions: () => void;

  /** Whether suggestions are currently being generated */
  isLoadingSuggestions: boolean;

  /** Interrupt content for human-in-the-loop workflows */
  interrupt: string | React.ReactElement | null;

  /**
   * Fetch all conversation history
   */
  fetchConversationHistory: (options?: {
    limit?: number;
    offset?: number;
  }) => Promise<any[]>;

  /**
   * Current conversation history
   */
  conversationHistory: any[];

  /**
   * Whether conversation history is being loaded
   */
  isLoadingHistory: boolean;

  /**
   * Error message if conversation history failed to load
   */
  historyError: string | null;

  /**
   * Load a specific conversation by ID
   */
  loadConversation: (conversationId: string) => Promise<void>;
}

/**
 * Headless React hook that provides complete chat functionality for custom UI implementations.
 * This hook integrates with the full Copanion context to provide all features while maintaining
 * a clean, headless interface for custom UI implementations.
 *
 * @param options - Configuration options for the chat
 * @returns Complete chat interface with all enterprise features
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isLoading } = useCopanionChatHeadless_c({
 *   initialMessages: [],
 *   model: "gpt-5-mini"
 * });
 * ```
 */
function useCopanionChatHeadless_c(
  options: UseCopanionChatHeadlessOptions = {}
): UseCopanionChatHeadlessReturn {
  const internalResult = useCopanionChat(options);
  return internalResult;
}

// Re-export default system message for consistency
export { defaultSystemMessage } from "./use-copanion-chat_internal";

export { useCopanionChatHeadless_c };
