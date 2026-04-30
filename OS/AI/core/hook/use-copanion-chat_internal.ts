import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import {
  AgentSession,
  useCopanionContext,
  CopanionContextParams,
} from "../context/copanion-context";
import {
  useCopanionMessagesContext,
  CopanionMessagesContextParams,
} from "../context/copanion-messages-context";
import { SystemMessageFunction } from "@OS/AI/types";
import { useChat, AppendMessageOptions } from "./use-chat";
import { defaultCopanionContextCategories } from "@OS/AI/core/copanionkit";
import { CoAgentStateRenderHandlerArguments } from "@OS/AI/shared";
import { useAsyncCallback } from "../components/error-boundary/error-utils";
import { ConversationListItem } from "@OS/AI/runtime-client/client/CopanionClient";
import { reloadSuggestions as generateSuggestions } from "@OS/AI/core/utils/suggestions";
import type { SuggestionItem } from "@OS/AI/core/utils/suggestions";
import { Message } from "@OS/AI/shared";
import {
  TextMessage,
  Role as gqlRole,
  aguiToApi,
  apiToAgui,
  Message as APIMessage,
  loadMessagesFromJsonRepresentation,
} from "@OS/AI/runtime-client";
import { useLangGraphInterruptRender } from "./use-langgraph-interrupt-render";

export interface UseCopanionChatOptions {
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
   * Initial messages to populate the chat with.
   */
  initialMessages?: Message[];

  /**
   * A function to generate the system message. Defaults to `defaultSystemMessage`.
   */
  makeSystemMessage?: SystemMessageFunction;

  /**
   * Disables inclusion of CopilotKit’s default system message. When true, no system message is sent (this also suppresses any custom message from <code>makeSystemMessage</code>).
   */
  disableSystemMessage?: boolean;
}

export interface MCPServerConfig {
  endpoint: string;
  apiKey?: string;
}

export interface UseCopanionChatReturn {
  /**
   * @deprecated use `messages` instead, this is an old non ag-ui version of the messages
   * Array of messages currently visible in the chat interface
   *
   * This is the visible messages, not the raw messages from the runtime client.
   */
  visibleMessages: APIMessage[];

  /**
   * The messages that are currently in the chat in AG-UI format.
   */
  messages: Message[];

  /** @deprecated use `sendMessage` instead */
  appendMessage: (
    message: APIMessage,
    options?: AppendMessageOptions
  ) => Promise<void>;

  /**
   * Send a new message to the chat
   *
   * ```tsx
   * await sendMessage({
   *   id: "123",
   *   role: "user",
   *   content: "Hello, process this request",
   * });
   * ```
   */
  sendMessage: (
    message: Message,
    options?: AppendMessageOptions
  ) => Promise<void>;

  /**
   * Replace all messages in the chat
   *
   * ```tsx
   * setMessages([
   *   { id: "123", role: "user", content: "Hello, process this request" },
   *   { id: "456", role: "assistant", content: "Hello, I'm the assistant" },
   * ]);
   * ```
   *
   * **Deprecated** non-ag-ui version:
   *
   * ```tsx
   * setMessages([
   *   new TextMessage({
   *     content: "Hello, process this request",
   *     role: gqlRole.User,
   *   }),
   *   new TextMessage({
   *     content: "Hello, I'm the assistant",
   *     role: gqlRole.Assistant,
   * ]);
   * ```
   *
   */
  setMessages: (messages: Message[] | APIMessage[]) => void;

  /**
   * Remove a specific message by ID
   *
   * ```tsx
   * deleteMessage("123");
   * ```
   */
  deleteMessage: (messageId: string) => void;

  /**
   * Regenerate the response for a specific message
   *
   * ```tsx
   * reloadMessages("123");
   * ```
   */
  reloadMessages: (messageId: string) => Promise<void>;

  /**
   * Stop the current message generation.
   * Returns the requestId of the cancelled request for explicit backend cancellation.
   *
   * ```tsx
   * if (isLoading) {
   *   const { requestId } = stopGeneration();
   *   // Use requestId for explicit cancellation
   * }
   * ```
   */
  stopGeneration: () => { requestId: string | null };

  /**
   * Clear all messages and reset chat state
   *
   */
  reset: () => void;

  /**
   * Whether the chat is currently generating a response
   *
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
   * Use this to read the current suggestions or in conjunction with setSuggestions for manual control
   */
  suggestions: SuggestionItem[];

  /**
   * Manually set suggestions
   * Useful for manual mode or custom suggestion workflows
   */
  setSuggestions: (suggestions: SuggestionItem[]) => void;

  /**
   * Trigger AI-powered suggestion generation
   * Uses configurations from useCopilotChatSuggestions hooks
   * Respects global debouncing - only one generation can run at a time
   *
   * ```tsx
   * generateSuggestions();
   * ```
   */
  generateSuggestions: () => Promise<void>;

  /**
   * Clear all current suggestions
   * Also resets suggestion generation state
   */
  resetSuggestions: () => void;

  /** Whether suggestions are currently being generated */
  isLoadingSuggestions: boolean;

  /** Whether the chat is currently loading */
  isChatLoading: boolean;

  /** Interrupt content for human-in-the-loop workflows */
  interrupt: string | React.ReactElement | null;

  /**
   * Fetch all conversation history
   */
  fetchConversationHistory: (options?: {
    limit?: number;
    offset?: number;
  }) => Promise<ConversationListItem[]>;

  /**
   * Current conversation history
   */
  conversationHistory: ConversationListItem[];

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

let globalSuggestionPromise: Promise<void> | null = null;

// Global state to prevent multiple instances from loading simultaneously
const globalInitialDataState = {
  loadedApiKey: null as string | null,
  hasLoaded: false,
  isLoading: false,
  loadPromise: null as Promise<void> | null,
};

export function useCopanionChat(
  options: UseCopanionChatOptions = {}
): UseCopanionChatReturn {
  const makeSystemMessage = options.makeSystemMessage ?? defaultSystemMessage;
  const {
    getContextString,
    getFunctionCallHandler,
    copanionApiConfig,
    isLoading,
    setIsLoading,
    chatInstructions,
    actions,
    coagentStatesRef,
    setCoagentStatesWithRef,
    coAgentStateRenders,
    agentSession,
    setAgentSession,
    forwardedParameters,
    agentLock,
    threadId,
    setThreadId,
    runId,
    setRunId,
    conversationId,
    setConversationId,
    chatAbortControllerRef,
    extensions,
    setExtensions,
    langGraphInterruptAction,
    setLangGraphInterruptAction,
    chatSuggestionConfiguration,
    runtimeClient,
  } = useCopanionContext();
  const { messages, setMessages, suggestions, setSuggestions } =
    useCopanionMessagesContext();

  // Simple state for MCP servers (keep for interface compatibility)
  const [mcpServers, setLocalMcpServers] = useState<MCPServerConfig[]>([]);

  // Basic suggestion state for programmatic control
  const suggestionsAbortControllerRef = useRef<AbortController | null>(null);
  const isLoadingSuggestionsRef = useRef<boolean>(false);

  // Conversation history state
  const [conversationHistory, setConversationHistory] = useState<
    ConversationListItem[]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const abortSuggestions = useCallback(
    (clear: boolean = true) => {
      suggestionsAbortControllerRef.current?.abort(
        "suggestions aborted by user"
      );
      suggestionsAbortControllerRef.current = null;
      if (clear) {
        setSuggestions([]);
      }
    },
    [setSuggestions]
  );

  // Memoize context with stable dependencies only
  const stableContext = useMemo(() => {
    return {
      actions,
      copanionApiConfig,
      chatSuggestionConfiguration,
      messages,
      setMessages,
      getContextString,
      runtimeClient,
    };
  }, [
    JSON.stringify(Object.keys(actions)),
    copanionApiConfig.chatApiEndpoint,
    messages.length,
    Object.keys(chatSuggestionConfiguration).length,
  ]);

  // Programmatic suggestion generation function
  const generateSuggestionsFunc = useCallback(async () => {
    // If a global suggestion is running, ignore this call
    if (globalSuggestionPromise) {
      return globalSuggestionPromise;
    }

    globalSuggestionPromise = (async () => {
      try {
        abortSuggestions();
        isLoadingSuggestionsRef.current = true;
        suggestionsAbortControllerRef.current = new AbortController();

        setSuggestions([]);

        await generateSuggestions(
          stableContext as CopanionContextParams &
            CopanionMessagesContextParams,
          chatSuggestionConfiguration,
          setSuggestions,
          suggestionsAbortControllerRef
        );
      } catch (error) {
        // Re-throw to allow caller to handle the error
        throw error;
      } finally {
        isLoadingSuggestionsRef.current = false;
        globalSuggestionPromise = null;
      }
    })();

    return globalSuggestionPromise;
  }, [
    stableContext,
    chatSuggestionConfiguration,
    setSuggestions,
    abortSuggestions,
  ]);

  const resetSuggestions = useCallback(() => {
    setSuggestions([]);
  }, [setSuggestions]);

  // Conversation history functions
  const fetchConversationHistory = useAsyncCallback(
    async (options: { limit?: number; offset?: number } = {}) => {
      try {
        setIsLoadingHistory(true);
        setHistoryError(null); // Clear any previous errors

        const response = await runtimeClient.getAllConversations({
          limit: options.limit || 20,
          offset: options.offset || 0,
        });

        setConversationHistory(response.conversations);
        return response.conversations;
      } catch (error) {
        // Set error message for display
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to load conversation history";
        setHistoryError(errorMessage);

        // Reset conversation history to empty array on error
        setConversationHistory([]);

        // Don't re-throw the error to prevent infinite retries
        // The error is already handled by the circuit breaker
        return [];
      } finally {
        // Always reset loading state, even on error
        setIsLoadingHistory(false);
      }
    },
    [runtimeClient]
  );

  const loadConversation = useAsyncCallback(
    async (conversationId: string) => {
      try {
        setIsChatLoading(true);
        // Load the specific conversation
        const response = await runtimeClient.getOrCreateConversation({
          conversationId,
          initialMessages: [],
        });

        // Convert and set the messages
        const tempMessages: APIMessage[] = loadMessagesFromJsonRepresentation(
          response.data.conversation
        );

        setMessages(tempMessages);
        setConversationId(conversationId);
        setIsChatLoading(false);
        setIsLoading(false);
      } catch (error) {
        console.error("Error loading conversation:", error);
        throw error;
      }
    },
    [runtimeClient, setMessages, setConversationId, actions]
  );

  // MCP servers logic
  useEffect(() => {
    if (mcpServers.length > 0) {
      const serversCopy = [...mcpServers];
      copanionApiConfig.mcpServers = serversCopy;
      if (!copanionApiConfig.properties) {
        copanionApiConfig.properties = {};
      }
      copanionApiConfig.properties.mcpServers = serversCopy;
    }
  }, [mcpServers, copanionApiConfig]);

  // Store refs for this instance
  const runtimeClientRef = useRef(runtimeClient);
  const setMessagesRef = useRef(setMessages);
  const setConversationIdRef = useRef(setConversationId);

  // Keep refs up to date
  useEffect(() => {
    runtimeClientRef.current = runtimeClient;
    setMessagesRef.current = setMessages;
    setConversationIdRef.current = setConversationId;
  }, [runtimeClient, setMessages, setConversationId]);

  useEffect(() => {
    const currentApiKey = copanionApiConfig.publicApiKey ?? null;

    // Reset global state if the API key changed
    if (globalInitialDataState.loadedApiKey !== currentApiKey) {
      globalInitialDataState.hasLoaded = false;
      globalInitialDataState.loadedApiKey = currentApiKey;
      globalInitialDataState.isLoading = false;
      globalInitialDataState.loadPromise = null;
    }

    // Skip if we've already loaded for this API key (globally)
    if (globalInitialDataState.hasLoaded) return;

    // Don't fetch if we don't have a publicApiKey yet
    if (!currentApiKey) {
      return;
    }

    // If there's already a load in progress, wait for it
    if (globalInitialDataState.loadPromise) {
      void globalInitialDataState.loadPromise;
      return;
    }

    // Create a global load promise that all instances can wait for
    const fetchData = async () => {
      try {
        const result = await runtimeClientRef.current.recentConversations();

        if (!result.data) {
          return;
        }

        const tempMessages: APIMessage[] = loadMessagesFromJsonRepresentation(
          result.data.conversation
        );

        // Update the messages (shared across all instances via context)
        setMessagesRef.current(tempMessages);
        setConversationIdRef.current(result.data._id);

        // Mark as loaded globally
        globalInitialDataState.hasLoaded = true;
      } catch (error) {
        console.error("❌ Failed to load agents:", error);
        // Don't set hasLoaded to true on error, so we can retry
        // when the session token becomes available
      } finally {
        globalInitialDataState.isLoading = false;
        globalInitialDataState.loadPromise = null;
      }
    };

    // Atomically set loading state and create promise
    globalInitialDataState.isLoading = true;
    globalInitialDataState.loadPromise = fetchData();
    void globalInitialDataState.loadPromise;
  }, [copanionApiConfig.publicApiKey]);

  const setMcpServers = useCallback((servers: MCPServerConfig[]) => {
    setLocalMcpServers(servers);
  }, []);

  // Move these function declarations above the useChat call
  const onCoAgentStateRender = useAsyncCallback(
    async (args: CoAgentStateRenderHandlerArguments) => {
      const { name, nodeName, state } = args;
      let action = Object.values(coAgentStateRenders).find(
        (action) => action.name === name && action.nodeName === nodeName
      );
      if (!action) {
        action = Object.values(coAgentStateRenders).find(
          (action) => action.name === name && !action.nodeName
        );
      }
      if (action) {
        await action.handler?.({ state, nodeName });
      }
    },
    [coAgentStateRenders]
  );

  const makeSystemMessageCallback = useCallback(() => {
    const systemMessageMaker = makeSystemMessage || defaultSystemMessage;
    // this always gets the latest context string
    const contextString = getContextString(
      [],
      defaultCopanionContextCategories
    );

    return new TextMessage({
      content: systemMessageMaker(contextString, chatInstructions),
      role: gqlRole.system,
    });
  }, [getContextString, makeSystemMessage, chatInstructions]);

  const deleteMessage = useCallback(
    (messageId: string) => {
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
    },
    [setMessages]
  );

  // Get chat helpers with updated config
  const { append, reload, stop, runChatCompletion } = useChat({
    ...options,
    actions: Object.values(actions),
    copilotConfig: copanionApiConfig,
    initialMessages: aguiToApi(options.initialMessages || []),
    onFunctionCall: getFunctionCallHandler(),
    onCoAgentStateRender,
    messages,
    setMessages,
    makeSystemMessageCallback,
    isLoading,
    setIsLoading,
    coagentStatesRef,
    setCoagentStatesWithRef,
    agentSession,
    setAgentSession,
    forwardedParameters,
    threadId,
    setThreadId,
    runId,
    setRunId,
    conversationId,
    setConversationId,
    chatAbortControllerRef,
    agentLock,
    extensions,
    setExtensions,
    langGraphInterruptAction,
    setLangGraphInterruptAction,
    disableSystemMessage: options.disableSystemMessage,
  });

  const latestAppend = useUpdatedRef(append);
  const latestAppendFunc = useAsyncCallback(
    async (message: APIMessage, options?: AppendMessageOptions) => {
      abortSuggestions(options?.clearSuggestions);
      return await latestAppend.current(message, options);
    },
    [latestAppend]
  );

  const latestSendMessageFunc = useAsyncCallback(
    async (message: Message, options?: AppendMessageOptions) => {
      abortSuggestions(options?.clearSuggestions);
      return await latestAppend.current(
        aguiToApi([message])[0] as APIMessage,
        options
      );
    },
    [latestAppend]
  );

  const latestReload = useUpdatedRef(reload);
  const latestReloadFunc = useAsyncCallback(
    async (messageId: string) => {
      return await latestReload.current(messageId);
    },
    [latestReload]
  );

  const latestStop = useUpdatedRef(stop);
  const latestStopFunc = useCallback(() => {
    return latestStop.current();
  }, [latestStop]);

  const latestDelete = useUpdatedRef(deleteMessage);
  const latestDeleteFunc = useCallback(
    (messageId: string) => {
      return latestDelete.current(messageId);
    },
    [latestDelete]
  );

  const latestSetMessages = useUpdatedRef(setMessages);
  const latestSetMessagesFunc = useCallback(
    (messages: Message[] | APIMessage[]) => {
      if (messages.every((message) => message instanceof APIMessage)) {
        return latestSetMessages.current(messages as APIMessage[]);
      }
      return latestSetMessages.current(aguiToApi(messages));
    },
    [latestSetMessages]
  );

  const latestRunChatCompletion = useUpdatedRef(runChatCompletion);
  const latestRunChatCompletionFunc = useAsyncCallback(async () => {
    return await latestRunChatCompletion.current!();
  }, [latestRunChatCompletion]);

  const reset = useCallback(() => {
    latestStopFunc();
    setMessages([]);
    setRunId(null);
    setConversationId("");
    setThreadId("");
    setCoagentStatesWithRef({});
    setIsChatLoading(false);
    setIsLoading(false);
    setIsLoadingHistory(false);
    let initialAgentSession: AgentSession | null = null;
    if (agentLock) {
      initialAgentSession = {
        agentName: agentLock,
      };
    }
    setAgentSession(initialAgentSession);
    // Reset suggestions when chat is reset
    resetSuggestions();
  }, [
    latestStopFunc,
    setMessages,
    setThreadId,
    setCoagentStatesWithRef,
    setAgentSession,
    agentLock,
    resetSuggestions,
  ]);

  const latestReset = useUpdatedRef(reset);
  const latestResetFunc = useCallback(() => {
    return latestReset.current();
  }, [latestReset]);

  const interrupt = useLangGraphInterruptRender();

  // Memoize the apiToAgui conversion to prevent unnecessary re-renders
  const aguiMessages = useMemo(() => {
    return apiToAgui(messages, actions, coAgentStateRenders);
  }, [messages, actions, coAgentStateRenders]);

  return {
    visibleMessages: messages,
    messages: aguiMessages,
    sendMessage: latestSendMessageFunc,
    appendMessage: latestAppendFunc,
    setMessages: latestSetMessagesFunc,
    reloadMessages: latestReloadFunc,
    stopGeneration: latestStopFunc,
    reset: latestResetFunc,
    deleteMessage: latestDeleteFunc,
    runChatCompletion: latestRunChatCompletionFunc,
    isLoading,
    mcpServers,
    setMcpServers,
    suggestions,
    setSuggestions,
    generateSuggestions: generateSuggestionsFunc,
    resetSuggestions,
    isLoadingSuggestions: isLoadingSuggestionsRef.current,
    interrupt,
    fetchConversationHistory,
    conversationHistory,
    isLoadingHistory,
    historyError,
    loadConversation,
    isChatLoading,
  };
}

// store `value` in a ref and update
// it whenever it changes.
function useUpdatedRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export function defaultSystemMessage(
  contextString: string,
  additionalInstructions?: string
): string {
  return (
    `
The user has provided you with the following context:
\`\`\`
${contextString}
\`\`\`
` + (additionalInstructions ? `\n\n${additionalInstructions}` : "")
  );
}
