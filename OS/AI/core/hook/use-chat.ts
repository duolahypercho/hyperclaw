import React, { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import {
  FunctionCallHandler,
  CoAgentStateRenderHandler,
  randomId,
  parseJson,
  HyperchoError,
  HyperchoErrorCode,
} from "@OS/AI/shared";
import {
  Message,
  TextMessage,
  ResultMessage,
  convertMessagesToApiFormat,
  filterAdjacentAgentStateMessages,
  filterAgentStateMessages,
  convertApiOutputToMessages,
  Role,
  loadMessagesFromJsonRepresentation,
  MetaEvent,
  CopanionClient,
  ActionExecutionMessage,
} from "@OS/AI/runtime-client";
import {
  MessageStatusCode,
  MessageRole,
  CopanionRequestType,
  ForwardedParametersInput,
  ExtensionsInput,
  MetaEventInput,
  AgentStateInput,
  MetaEventName,
} from "@OS/AI/runtime";

import { CopanionkitApiConfig } from "../context";
import {
  FrontendAction,
  processActionsForRuntimeRequest,
} from "@OS/AI/types/frontend-action";
import { CoagentState } from "@OS/AI/types/coagent-state";
import { AgentSession, useCopanionContext } from "../context/copanion-context";
import { useCopanionRuntimeClient } from "./use-copanion-runtime-client";
import {
  useAsyncCallback,
  useErrorToast,
} from "../components/error-boundary/error-utils";
import { useToast } from "@/components/ui/use-toast";
import {
  LangGraphInterruptAction,
  LangGraphInterruptActionSetter,
} from "@OS/AI/types/interrupt-action";

// Simple implementation of langGraphInterruptEvent for compatibility
function langGraphInterruptEvent(event: any) {
  return {
    name: event.name || "LangGraphInterruptEvent",
    value: event.value,
    response: event.response,
  };
}

export type UseChatOptions = {
  /**
   * System messages of the chat. Defaults to an empty array.
   */
  initialMessages?: Message[];
  /**
   * Callback function to be called when a function call is received.
   * If the function returns a `ChatRequest` object, the request will be sent
   * automatically to the API and will be used to update the chat.
   */
  onFunctionCall?: FunctionCallHandler;

  /**
   * Callback function to be called when a coagent action is received.
   */
  onCoAgentStateRender?: CoAgentStateRenderHandler;

  /**
   * Function definitions to be sent to the API.
   */
  actions: FrontendAction<any>[];

  /**
   * The CopilotKit API configuration.
   */
  copilotConfig: CopanionkitApiConfig;

  /**
   * The current list of messages in the chat.
   */
  messages: Message[];
  /**
   * The setState-powered method to update the chat messages.
   */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;

  /**
   * A callback to get the latest system message.
   */
  makeSystemMessageCallback: () => TextMessage;

  /**
   * Whether the API request is in progress
   */
  isLoading: boolean;

  /**
   * setState-powered method to update the isChatLoading value
   */
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;

  /**
   * The current list of coagent states.
   */
  coagentStatesRef: React.RefObject<Record<string, CoagentState>>;

  /**
   * setState-powered method to update the agent states
   */
  setCoagentStatesWithRef: React.Dispatch<
    React.SetStateAction<Record<string, CoagentState>>
  >;

  /**
   * The current agent session.
   */
  agentSession: AgentSession | null;

  /**
   * setState-powered method to update the agent session
   */
  setAgentSession: React.Dispatch<React.SetStateAction<AgentSession | null>>;

  /**
   * The forwarded parameters.
   */
  forwardedParameters?: Pick<ForwardedParametersInput, "temperature">;

  /**
   * The current thread ID.
   */
  threadId: string;
  /**
   * set the current thread ID
   */
  setThreadId: (threadId: string) => void;
  /**
   * The current run ID.
   */
  runId: string | null;
  /**
   * set the current run ID
   */
  setRunId: (runId: string | null) => void;
  /**
   * The current conversation ID.
   */
  conversationId: string | null;
  /**
   * set the current conversation ID
   */
  setConversationId: (conversationId: string | null) => void;
  /**
   * The global chat abort controller.
   */
  chatAbortControllerRef: React.MutableRefObject<AbortController | null>;
  /**
   * The agent lock.
   */
  agentLock: string | null;
  /**
   * The extensions.
   */
  extensions: ExtensionsInput;
  /**
   * The setState-powered method to update the extensions.
   */
  setExtensions: React.Dispatch<React.SetStateAction<ExtensionsInput>>;

  langGraphInterruptAction: LangGraphInterruptAction | null;

  setLangGraphInterruptAction: LangGraphInterruptActionSetter;

  disableSystemMessage?: boolean;
};

export type UseChatHelpers = {
  /**
   * Append a user message to the chat list. This triggers the API call to fetch
   * the assistant's response.
   * @param message The message to append
   */
  append: (message: Message, options?: AppendMessageOptions) => Promise<void>;
  /**
   * Reload the last AI chat response for the given chat history. If the last
   * message isn't from the assistant, it will request the API to generate a
   * new response.
   */
  reload: (messageId: string) => Promise<void>;
  /**
   * Abort the current request immediately, keep the generated tokens if any.
   * Returns the requestId of the cancelled request for explicit backend cancellation.
   */
  stop: () => { requestId: string | null };

  /**
   * Get the current request ID (if a request is in progress).
   * Useful for cancellation even before conversationId is available.
   */
  getCurrentRequestId: () => string | null;

  /**
   * Run the chat completion.
   */
  runChatCompletion: () => Promise<Message[]>;
};

export interface AppendMessageOptions {
  /**
   * Whether to run the chat completion after appending the message. Defaults to `true`.
   */
  followUp?: boolean;
  /**
   * Whether to clear the suggestions after appending the message. Defaults to `true`.
   */
  clearSuggestions?: boolean;
}

export function useChat(options: UseChatOptions): UseChatHelpers {
  const {
    messages,
    setMessages,
    makeSystemMessageCallback,
    copilotConfig,
    setIsLoading,
    initialMessages,
    isLoading,
    actions,
    onFunctionCall,
    onCoAgentStateRender,
    setCoagentStatesWithRef,
    coagentStatesRef,
    agentSession,
    setAgentSession,
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
    disableSystemMessage = false,
  } = options;
  const runChatCompletionRef =
    useRef<(previousMessages: Message[]) => Promise<Message[]>>();
  const addErrorToast = useErrorToast();
  const { setBannerError } = useToast();

  // Get onError from context since it's not part of copilotConfig
  const { onError } = useCopanionContext();

  // Add tracing functionality to use-chat
  const traceUIError = async (error: HyperchoError, originalError?: any) => {
    // Just check if onError and publicApiKey are defined
    if (!onError) return;

    try {
      const traceEvent = {
        type: "error" as const,
        timestamp: Date.now(),
        context: {
          source: "ui" as const,
          request: {
            operation: "useChatCompletion",
            url: copilotConfig.chatApiEndpoint,
            startTime: Date.now(),
          },
          technical: {
            environment: "browser",
            userAgent:
              typeof navigator !== "undefined"
                ? navigator.userAgent
                : undefined,
            stackTrace:
              originalError instanceof Error ? originalError.stack : undefined,
          },
        },
        error,
      };

      await onError(traceEvent);
    } catch (traceError) {
      console.error("Error in use-chat onError handler:", traceError);
    }
  };
  // We need to keep a ref of coagent states and session because of renderAndWait - making sure
  // the latest state is sent to the API
  // This is a workaround and needs to be addressed in the future
  const agentSessionRef = useRef<AgentSession | null>(agentSession);
  agentSessionRef.current = agentSession;

  const runIdRef = useRef<string | null>(runId);
  runIdRef.current = runId;
  const conversationRef = useRef<string | null>(conversationId);
  conversationRef.current = conversationId;
  const extensionsRef = useRef<ExtensionsInput>(extensions);
  extensionsRef.current = extensions;

  // Track the current request ID for reliable cancellation
  // This is generated BEFORE each request and can be used to cancel even if conversationId isn't available yet
  const currentRequestIdRef = useRef<string | null>(null);

  const headers = {
    ...(copilotConfig.headers || {}),
  };

  const { showDevConsole } = useCopanionContext();

  const runtimeClient = useCopanionRuntimeClient({
    url: copilotConfig.chatApiEndpoint,
    headers,
    credentials: copilotConfig.credentials,
    showDevConsole,
    publicApiKey: copilotConfig.publicApiKey,
  });

  const pendingAppendsRef = useRef<{ message: Message; followUp: boolean }[]>(
    []
  );

  const runChatCompletion = useAsyncCallback(
    async (previousMessages: Message[]): Promise<Message[]> => {
      // Declare these at the top so they're accessible in the finally block for cleanup
      let abortHandler: (() => void) | null = null;
      let abortSignal: AbortSignal | null = null;

      // Generate a unique request ID BEFORE the request starts
      // This allows cancellation even before conversationId is returned
      const requestId = randomId();
      currentRequestIdRef.current = requestId;

      try {
        setIsLoading(true);
        const interruptEvent = langGraphInterruptAction?.event;
        // In case an interrupt event exist and valid but has no response yet, we cannot process further messages to an agent
        if (
          interruptEvent?.name === MetaEventName.LangGraphInterruptEvent &&
          interruptEvent?.value &&
          !interruptEvent?.response &&
          agentSessionRef.current
        ) {
          addErrorToast([
            new Error(
              "A message was sent while interrupt is active. This will cause failure on the agent side"
            ),
          ]);
        }

        // this message is just a placeholder. It will disappear once the first real message
        // is received
        let newMessages: Message[] = [
          new TextMessage({
            content: "",
            role: Role.assistant,
          }),
        ];

        chatAbortControllerRef.current = new AbortController();

        setMessages([...previousMessages, ...newMessages]);

        // ----- Set mcpServers in properties -----
        // Create a copy of properties to avoid modifying the original object
        const finalProperties = { ...(copilotConfig.properties || {}) };

        // Look for mcpServers in either direct property or properties
        let mcpServersToUse = null;

        // First check direct mcpServers property
        if (
          copilotConfig.mcpServers &&
          Array.isArray(copilotConfig.mcpServers) &&
          copilotConfig.mcpServers.length > 0
        ) {
          mcpServersToUse = copilotConfig.mcpServers;
        }
        // Then check mcpServers in properties
        else if (
          copilotConfig.properties?.mcpServers &&
          Array.isArray(copilotConfig.properties.mcpServers) &&
          copilotConfig.properties.mcpServers.length > 0
        ) {
          mcpServersToUse = copilotConfig.properties.mcpServers;
        }

        // Apply the mcpServers to properties if found
        if (mcpServersToUse) {
          // Set in finalProperties
          finalProperties.mcpServers = mcpServersToUse;

          // Also set in copilotConfig directly for future use
          copilotConfig.mcpServers = mcpServersToUse;
        }
        // -------------------------------------------------------------

        const isAgentRun = agentSessionRef.current !== null;

        // Find all pending messages in the conversation
        const allPendingMessages = previousMessages.filter(
          (msg) => msg.status?.code === MessageStatusCode.Pending
        );

        // When conversationId exists, only send system message + latest message
        // (since data is already saved in database, we don't need full history)
        let messagesToSend: Message[];
        if (conversationRef.current) {
          // If there are pending messages, include them
          if (allPendingMessages.length > 0) {
            messagesToSend = [
              makeSystemMessageCallback(),
              ...allPendingMessages,
            ];
          } else {
            // Otherwise, only send system message + the latest non-system message
            // Filter out system messages and action executions that already have results
            const nonSystemMessages = previousMessages.filter((msg) => {
              if (msg.isTextMessage()) {
                return msg.role !== Role.system;
              }
              // Skip action execution messages that already have result messages
              if (msg.isActionExecutionMessage()) {
                const hasResult = previousMessages.some(
                  (m) =>
                    m.isResultMessage() && m.actionExecutionId === msg.messageId
                );
                return !hasResult; // Only include if no result exists yet
              }
              return true; // Include result messages and other non-text messages
            });
            const latestMessage =
              nonSystemMessages.length > 0
                ? [nonSystemMessages[nonSystemMessages.length - 1]]
                : [];
            messagesToSend = [makeSystemMessageCallback(), ...latestMessage];
          }
        } else {
          // No conversationId: include initial messages for new conversations
          messagesToSend = [
            makeSystemMessageCallback(),
            ...(initialMessages || []),
            ...allPendingMessages,
          ];
        }

        const stream = runtimeClient.asStream(
          runtimeClient.generateCopanionResponse({
            data: {
              // Transform messages to the format expected by Hypercho API
              messages: convertMessagesToApiFormat(
                filterAgentStateMessages(messagesToSend)
              ),
              stream: true,
              threadId: threadId || undefined,
              conversationId: conversationRef.current || undefined,
              runId: runIdRef.current || undefined,
              extensions: extensionsRef.current,
              // Include additional data for compatibility
              frontend: {
                actions: processActionsForRuntimeRequest(actions),
                url: window.location.href,
              },
              metaEvents: composeAndFlushMetaEventsInput([
                langGraphInterruptAction?.event as any,
              ]),
              metadata: {
                requestType: CopanionRequestType.Chat,
                requestId: requestId, // Client-generated ID for reliable cancellation
              },
              ...(agentSessionRef.current
                ? {
                  agentSession: agentSessionRef.current,
                }
                : {}),
              agentStates: Object.values(coagentStatesRef.current!).map(
                (state) => {
                  const stateObject: AgentStateInput = {
                    agentName: state.name,
                    state: JSON.stringify(state.state),
                  };

                  if (state.config !== undefined) {
                    stateObject.config = JSON.stringify(state.config);
                  }

                  return stateObject;
                }
              ),
              forwardedParameters: options.forwardedParameters || {},
            },
            properties: finalProperties,
            signal: chatAbortControllerRef.current?.signal,
          }),
          {
            // CRITICAL: This callback is called when reader.cancel() is invoked
            // It ensures the fetch AbortController is aborted to close the TCP connection
            onCancel: () => {
              chatAbortControllerRef.current?.abort("Stream cancelled by user");
            }
          }
        );

        const reader = stream.getReader();

        // CRITICAL: Set up abort listener to cancel the reader when stop is called
        // This ensures the TCP connection is closed and backend receives the close event
        abortHandler = () => {
          try {
            reader.cancel("Aborted by user");
          } catch (e) {
          }
        };

        abortSignal = chatAbortControllerRef.current?.signal || null;
        if (abortSignal) {
          abortSignal.addEventListener("abort", abortHandler);
        }

        let executedCoAgentStateRenders: string[] = [];
        let followUp: FrontendAction["followUp"] = undefined;

        let messages: Message[] = [];
        let syncedMessages: Message[] = [];
        let interruptMessages: Message[] = [];
        let updatedMessages: Message[] = [];

        while (true) {
          // Check if aborted before reading
          if (chatAbortControllerRef.current?.signal.aborted) {
            // Cleanup abort handler before returning
            if (abortSignal && abortHandler) {
              abortSignal.removeEventListener("abort", abortHandler);
            }
            return [];
          }

          let done, value;

          try {
            const readResult = await reader.read();
            done = readResult.done;
            value = readResult.value;
          } catch (readError) {
            // Check if this is an abort - exit gracefully
            if (chatAbortControllerRef.current?.signal.aborted) {
              // Cleanup abort handler before returning
              if (abortSignal && abortHandler) {
                abortSignal.removeEventListener("abort", abortHandler);
              }
              return [];
            }
            // Handle stream errors properly
            console.error("❌ Stream read error:", readError);

            // Check if this is a rate limit or other specific error
            if (readError instanceof Error) {
              if (
                readError.name === "RateLimitError" ||
                readError.message.includes("429")
              ) {
                const errorMessage =
                  "Rate limit exceeded. Please wait a moment before trying again.";
                const errorCode = HyperchoErrorCode.RATE_LIMIT_ERROR;

                const structuredError = new HyperchoError({
                  message: errorMessage,
                  code: errorCode,
                });

                const errorMessages = [
                  new TextMessage({
                    role: MessageRole.assistant,
                    content: `❌ **Error Occurred**\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
                  }),
                ];

                setBannerError(structuredError);
                setMessages([...previousMessages, ...errorMessages]);

                await traceUIError(structuredError, {
                  originalError: readError,
                  errorType: readError.name,
                });

                return errorMessages;
              } else if (
                readError.name === "AuthenticationError" ||
                readError.message.includes("401")
              ) {
                const errorMessage =
                  "Authentication failed. Please refresh your session and try again.";
                const errorCode = HyperchoErrorCode.AUTHENTICATION_ERROR;

                const structuredError = new HyperchoError({
                  message: errorMessage,
                  code: errorCode,
                });

                const errorMessages = [
                  new TextMessage({
                    role: MessageRole.assistant,
                    content: `❌ **Error Occurred**\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
                  }),
                ];

                setBannerError(structuredError);
                setMessages([...previousMessages, ...errorMessages]);

                await traceUIError(structuredError, {
                  originalError: readError,
                  errorType: readError.name,
                });

                return errorMessages;
              } else if (
                readError.name === "ServerError" ||
                readError.message.includes("5")
              ) {
                const errorMessage =
                  "Server error occurred. Please try again later.";
                const errorCode = HyperchoErrorCode.OPERATION_ERROR;

                const structuredError = new HyperchoError({
                  message: errorMessage,
                  code: errorCode,
                });

                const errorMessages = [
                  new TextMessage({
                    role: MessageRole.assistant,
                    content: `❌ **Error Occurred**\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
                  }),
                ];

                setBannerError(structuredError);
                setMessages([...previousMessages, ...errorMessages]);

                await traceUIError(structuredError, {
                  originalError: readError,
                  errorType: readError.name,
                });

                return errorMessages;
              }
            }

            // For other errors, throw them to be caught by the outer catch block
            throw readError;
          }

          if (done) {
            if (chatAbortControllerRef.current.signal.aborted) {
              // Cleanup abort handler before returning
              if (abortSignal && abortHandler) {
                abortSignal.removeEventListener("abort", abortHandler);
              }
              return [];
            }
            break;
          }

          // Parse the string value as JSON to get the expected format
          let parsedValue: any;
          try {
            parsedValue = JSON.parse(value as string);
          } catch (parseError) {
            // If parsing fails, skip this chunk
            continue;
          }

          if (!parsedValue?.generateCopanionResponse) {
            continue;
          }

          if (parsedValue.generateCopanionResponse.runId) {
            runIdRef.current = parsedValue.generateCopanionResponse.runId;
          }

          if (parsedValue.generateCopanionResponse.conversationId) {
            conversationRef.current =
              parsedValue.generateCopanionResponse.conversationId;
          }

          // in the output, graphql inserts __typename, which leads to an error when sending it along
          // as input to the next request.
          extensionsRef.current = CopanionClient.removeGraphQLTypename(
            parsedValue.generateCopanionResponse.extensions || {}
          );

          setRunId(runIdRef.current);
          setExtensions(extensionsRef.current);
          setConversationId(conversationRef.current);
          let rawMessagesResponse =
            parsedValue.generateCopanionResponse.messages;

          const metaEvents: MetaEvent[] | undefined =
            parsedValue.generateCopanionResponse?.metaEvents ?? [];
          (metaEvents ?? []).forEach((ev) => {
            if ((ev as any).name === MetaEventName.LangGraphInterruptEvent) {
              let eventValue = langGraphInterruptEvent(ev).value;
              eventValue = parseJson(eventValue, eventValue);
              setLangGraphInterruptAction({
                event: {
                  ...langGraphInterruptEvent(ev),
                  value: eventValue,
                },
              });
            }
            if (
              (ev as any).name ===
              MetaEventName.CopanionKitLangGraphInterruptEvent
            ) {
              const data = (ev as any).data;

              rawMessagesResponse = [...rawMessagesResponse, ...data.messages];
              interruptMessages = convertApiOutputToMessages(
                // @ts-ignore
                filterAdjacentAgentStateMessages(data.messages)
              );
            }
          });

          if (rawMessagesResponse.length < 0) {
            continue;
          }

          messages = convertApiOutputToMessages(
            filterAdjacentAgentStateMessages(rawMessagesResponse)
          );

          // Handle UNKNOWN_ERROR failures (like authentication errors) by routing to banner error system
          if (
            parsedValue.generateCopanionResponse.status?.__typename ===
            "FailedResponseStatus" &&
            parsedValue.generateCopanionResponse.status.reason ===
            "UNKNOWN_ERROR"
          ) {
            const errorMessage =
              parsedValue.generateCopanionResponse.status.details
                ?.description || "An unknown error occurred";

            // Try to extract original error information from the response details
            const statusDetails =
              parsedValue.generateCopanionResponse.status.details;
            const originalError =
              statusDetails?.originalError || statusDetails?.error;

            // Extract structured error information if available (prioritize top-level over extensions)
            const originalCode =
              originalError?.code || originalError?.extensions?.code;
            const originalSeverity =
              originalError?.severity || originalError?.extensions?.severity;
            const originalVisibility =
              originalError?.visibility ||
              originalError?.extensions?.visibility;

            // Use the original error code if available, otherwise default to NETWORK_ERROR
            let errorCode = HyperchoErrorCode.NETWORK_ERROR;
            if (
              originalCode &&
              Object.values(HyperchoErrorCode).includes(originalCode)
            ) {
              errorCode = originalCode;
            }

            // Create a structured CopilotKitError preserving original error information
            const structuredError = new HyperchoError({
              message: errorMessage,
              code: errorCode,
              severity: originalSeverity,
              visibility: originalVisibility,
            });

            // Add error message to chat
            newMessages = [
              new TextMessage({
                role: MessageRole.assistant,
                content: `❌ **Error Occurred**\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
              }),
            ];

            // Display the error in the banner
            setBannerError(structuredError);

            // Trace the error for debugging/observability
            await traceUIError(structuredError, {
              statusReason: parsedValue.generateCopanionResponse.status.reason,
              statusDetails:
                parsedValue.generateCopanionResponse.status.details,
              originalErrorCode: originalCode,
              preservedStructure: !!originalCode,
            });

            // Add error message to chat and stop processing
            setMessages([...previousMessages, ...newMessages]);
            setIsLoading(false);
            break;
          }

          // add messages to the chat
          else if (messages.length > 0) {
            // Replace placeholder message with actual messages from stream
            if (
              newMessages.length === 1 &&
              newMessages[0] instanceof TextMessage &&
              newMessages[0].content === ""
            ) {
              // First real message - replace placeholder
              newMessages = [...messages];
            } else {
              // Subsequent messages - replace existing or add new
              messages.forEach((message) => {
                const existingIndex = newMessages.findIndex(
                  (msg) => msg.id === message.id
                );
                if (existingIndex !== -1) {
                  // Replace existing message with same ID
                  newMessages[existingIndex] = message;
                } else {
                  // Add new message
                  newMessages.push(message);
                }
              });
            }

            // Handle status updates for pending messages
            // When messages are generated back, assume all pending messages are successfully processed
            updatedMessages = [...previousMessages];
            if (messages.length > 0) {
              // Mark all pending messages as successfully processed
              updatedMessages = updatedMessages.map((msg) => {
                if (msg.status?.code === MessageStatusCode.Pending) {
                  const updatedMsg = Object.assign(
                    Object.create(Object.getPrototypeOf(msg)),
                    msg,
                    { status: { code: MessageStatusCode.Success } }
                  );
                  return updatedMsg;
                }
                return msg;
              });
            }

            for (const message of messages) {
              // execute onCoAgentStateRender handler
              if (
                message.isAgentStateMessage() &&
                !message.active &&
                !executedCoAgentStateRenders.includes(message.id) &&
                onCoAgentStateRender
              ) {
                // execute coagent action
                await onCoAgentStateRender({
                  name: message.agentName,
                  nodeName: message.nodeName || "default",
                  state: message.state,
                });
                executedCoAgentStateRenders.push(message.id);
              }
            }

            const lastAgentStateMessage = [...messages]
              .reverse()
              .find((message) => message.isAgentStateMessage());

            if (lastAgentStateMessage) {
              if (
                lastAgentStateMessage.state.messages &&
                lastAgentStateMessage.state.messages.length > 0
              ) {
                syncedMessages = loadMessagesFromJsonRepresentation(
                  lastAgentStateMessage.state.messages
                );
              }
              setCoagentStatesWithRef((prevAgentStates) => ({
                ...prevAgentStates,
                [lastAgentStateMessage.agentName]: {
                  name: lastAgentStateMessage.agentName,
                  state: lastAgentStateMessage.state,
                  running: lastAgentStateMessage.running || false,
                  active: lastAgentStateMessage.active || false,
                  threadId: lastAgentStateMessage.threadId || "default",
                  nodeName: lastAgentStateMessage.nodeName || "default",
                  runId: lastAgentStateMessage.runId || "",
                  // Preserve existing config from previous state
                  config:
                    prevAgentStates[lastAgentStateMessage.agentName]?.config,
                },
              }));
              if (lastAgentStateMessage.running) {
                setAgentSession({
                  threadId: lastAgentStateMessage.threadId,
                  agentName: lastAgentStateMessage.agentName,
                  nodeName: lastAgentStateMessage.nodeName,
                });
              } else {
                if (agentLock) {
                  setAgentSession({
                    threadId: randomId(),
                    agentName: agentLock,
                    nodeName: undefined,
                  });
                } else {
                  setAgentSession(null);
                }
              }
            }
          }

          if (newMessages.length > 0) {
            // Update message state with status updates for pending messages
            setMessages([...updatedMessages, ...newMessages]);
          }
        }

        // Fallback error handler: if no messages were processed and no error was handled,
        // add a generic error message to prevent the user from being left in the dark
        if (
          newMessages.length === 0 &&
          !chatAbortControllerRef.current?.signal.aborted
        ) {
          newMessages = [
            new TextMessage({
              role: MessageRole.assistant,
              content:
                "❌ **Something went wrong**\n\nI encountered an issue processing your request. Please try again or contact support if the problem persists.",
            }),
          ];
          setMessages([...previousMessages, ...newMessages]);
        }

        let finalMessages = constructFinalMessages(
          [...syncedMessages, ...interruptMessages],
          updatedMessages.length > 0 ? updatedMessages : previousMessages,
          newMessages
        );

        let didExecuteAction = false;

        // ----- Helper function to execute an action and manage its lifecycle -----
        const executeActionFromMessage = async (
          currentAction: FrontendAction<any>,
          actionMessage: ActionExecutionMessage
        ) => {
          const isInterruptAction = interruptMessages.find(
            (m) => m.id === actionMessage.id
          );

          // Determine follow-up behavior: use action's specific setting if defined, otherwise default based on interrupt status.
          followUp = currentAction?.followUp ?? !isInterruptAction;

          // Call _setActivatingMessageId before executing the action for HITL correlation
          if ((currentAction as any)?._setActivatingMessageId) {
            (currentAction as any)._setActivatingMessageId(
              actionMessage.messageId || actionMessage.id
            );
          }

          const resultMessage = await executeAction({
            onFunctionCall: onFunctionCall!,
            message: actionMessage,
            chatAbortControllerRef,
            onError: (error: Error) => {
              addErrorToast([error]);
              // console.error is kept here as it's a genuine error in action execution
              console.error(
                `Failed to execute action ${actionMessage.name}: ${error}`
              );
            },
            setMessages,
            getFinalMessages: () => finalMessages,
            isRenderAndWait: (currentAction as any)?._isRenderAndWait || false,
          });

          didExecuteAction = true;
          const messageIndex = finalMessages.findIndex(
            (msg) => msg.id === actionMessage.id
          );
          finalMessages.splice(messageIndex + 1, 0, resultMessage);

          // If the executed action was a renderAndWaitForResponse type, update messages immediately
          // to reflect its completion in the UI, making it interactive promptly.
          if ((currentAction as any)?._isRenderAndWait) {
            const messagesForImmediateUpdate = [...finalMessages];
            flushSync(() => {
              setMessages(messagesForImmediateUpdate);
            });
          }

          // Clear _setActivatingMessageId after the action is done
          if ((currentAction as any)?._setActivatingMessageId) {
            (currentAction as any)._setActivatingMessageId(null);
          }

          return resultMessage;
        };
        // ----------------------------------------------------------------------

        // execute regular action executions that are specific to the frontend (last actions)
        if (onFunctionCall) {
          // Find consecutive action execution messages at the end
          const lastMessages = [];

          for (let i = finalMessages.length - 1; i >= 0; i--) {
            const message = finalMessages[i];
            if (
              (message.isActionExecutionMessage() ||
                message.isResultMessage()) &&
              message.status?.code !== MessageStatusCode.Pending
            ) {
              lastMessages.unshift(message);
            } else if (!message.isAgentStateMessage()) {
              break;
            }
          }

          for (const message of lastMessages) {
            // We update the message state before calling the handler so that the render
            // function can be called with `executing` state
            setMessages(finalMessages);

            const action = actions.find(
              (action) =>
                action.name === (message as ActionExecutionMessage).name
            );
            if (action && action.available === "frontend") {
              // never execute frontend actions
              continue;
            }
            const currentResultMessagePairedFeAction = message.isResultMessage()
              ? getPairedFeAction(actions, message)
              : null;

            // execution message which has an action registered with the hook (remote availability):
            // execute that action first, and then the "paired FE action"
            if (action && message.isActionExecutionMessage()) {
              // For HITL actions, check if they've already been processed to avoid redundant handler calls.
              const isRenderAndWaitAction =
                (action as any)?._isRenderAndWait || false;

              const alreadyProcessed =
                isRenderAndWaitAction &&
                finalMessages.some(
                  (fm) =>
                    fm.isResultMessage() &&
                    fm.actionExecutionId === message.messageId
                );

              if (alreadyProcessed) {
                // Skip re-execution if already processed
              } else {
                // Call the single, externally defined executeActionFromMessage
                const resultMessage = await executeActionFromMessage(
                  action,
                  message as ActionExecutionMessage
                );
                const pairedFeAction = getPairedFeAction(
                  actions,
                  resultMessage
                );

                if (pairedFeAction) {
                  const newExecutionMessage = new ActionExecutionMessage({
                    name: pairedFeAction.name,
                    arguments: parseJson(
                      resultMessage.result,
                      resultMessage.result
                    ),
                    status: message.status,
                    createdAt: message.createdAt,
                    parentMessageId: message.parentMessageId,
                  });
                  // Call the single, externally defined executeActionFromMessage
                  await executeActionFromMessage(
                    pairedFeAction,
                    newExecutionMessage
                  );
                }
              }
            } else if (
              message.isResultMessage() &&
              currentResultMessagePairedFeAction
            ) {
              // Actions which are set up in runtime actions array: Grab the result, executed paired FE action with it as args.
              const newExecutionMessage = new ActionExecutionMessage({
                name: currentResultMessagePairedFeAction.name,
                arguments: parseJson(message.result, message.result),
                status: message.status,
                createdAt: message.createdAt,
              });
              finalMessages.push(newExecutionMessage);
              // Call the single, externally defined executeActionFromMessage
              await executeActionFromMessage(
                currentResultMessagePairedFeAction,
                newExecutionMessage
              );
            }
          }

          // Mark all result messages as Success before sending
          finalMessages = finalMessages.map((msg) => {
            if (
              msg.isResultMessage() &&
              msg.status?.code !== MessageStatusCode.Success
            ) {
              return Object.assign(
                Object.create(Object.getPrototypeOf(msg)),
                msg,
                { status: { code: MessageStatusCode.Success } }
              );
            }
            return msg;
          });

          setMessages(finalMessages);
        }

        // Conditionally run chat completion again if followUp is not explicitly false
        // and an action was executed or the last message is a server-side result (for non-agent runs).
        if (
          followUp !== false &&
          (didExecuteAction ||
            // the last message is a server side result
            (!isAgentRun &&
              finalMessages.length &&
              finalMessages[finalMessages.length - 1].isResultMessage())) &&
          // the user did not stop generation
          !chatAbortControllerRef.current?.signal.aborted
        ) {
          // run the completion again and return the result

          // wait for next tick to make sure all the react state updates
          // - tried using react-dom's flushSync, but it did not work
          await new Promise((resolve) => setTimeout(resolve, 10));

          return await runChatCompletionRef.current!(finalMessages);
        } else if (chatAbortControllerRef.current?.signal.aborted) {
          // filter out all the action execution messages that do not have a consecutive matching result message
          const repairedMessages = finalMessages.filter(
            (message, actionExecutionIndex) => {
              if (message.isActionExecutionMessage()) {
                return finalMessages.find(
                  (msg, resultIndex) =>
                    msg.isResultMessage() &&
                    msg.actionExecutionId === message.id &&
                    resultIndex === actionExecutionIndex + 1
                );
              }
              return true;
            }
          );
          const repairedMessageIds = repairedMessages.map(
            (message) => message.id
          );
          setMessages(repairedMessages);

          // LangGraph needs two pieces of information to continue execution:
          // 1. The threadId
          // 2. The nodeName it came from
          // When stopping the agent, we don't know the nodeName the agent would have ended with
          // Therefore, we set the nodeName to the most reasonable thing we can guess, which
          // is "__end__"
          if (agentSessionRef.current?.nodeName) {
            setAgentSession({
              threadId: agentSessionRef.current.threadId,
              agentName: agentSessionRef.current.agentName,
              nodeName: "__end__",
            });
          }
          // only return new messages that were not filtered out
          return newMessages.filter((message) =>
            repairedMessageIds.includes(message.id)
          );
        } else {
          return newMessages.slice();
        }
      } catch (error) {
        // Handle errors that occur during streaming
        console.error("❌ Error in runChatCompletion:", error);

        let errorMessage = "An unexpected error occurred. Please try again.";
        let errorCode = HyperchoErrorCode.NETWORK_ERROR;

        // Handle specific error types
        if (error instanceof Error) {
          if (
            error.name === "RateLimitError" ||
            error.message.includes("429")
          ) {
            errorMessage =
              "Rate limit exceeded. Please wait a moment before trying again.";
            errorCode = HyperchoErrorCode.RATE_LIMIT_ERROR;
          } else if (
            error.name === "AuthenticationError" ||
            error.message.includes("401")
          ) {
            errorMessage =
              "Authentication failed. Please refresh your session and try again.";
            errorCode = HyperchoErrorCode.AUTHENTICATION_ERROR;
          } else if (
            error.name === "ServerError" ||
            error.message.includes("5")
          ) {
            errorMessage = "Server error occurred. Please try again later.";
            errorCode = HyperchoErrorCode.OPERATION_ERROR;
          } else if (
            error.message.includes("Network error") ||
            error.message.includes("fetch")
          ) {
            errorMessage =
              "Network error. Please check your connection and try again.";
            errorCode = HyperchoErrorCode.NETWORK_ERROR;
          } else {
            errorMessage = error.message || errorMessage;
          }
        }

        // Create structured error
        const structuredError = new HyperchoError({
          message: errorMessage,
          code: errorCode,
        });

        // Add error message to chat
        const errorMessages = [
          new TextMessage({
            role: MessageRole.assistant,
            content: `❌ **Error Occurred**\n\n${errorMessage}\n\nPlease try again or contact support if the issue persists.`,
          }),
        ];

        // Display the error in the banner
        setBannerError(structuredError);

        // Add error message to chat and stop processing
        setMessages([...previousMessages, ...errorMessages]);

        // Trace the error for debugging/observability
        await traceUIError(structuredError, {
          originalError: error,
          errorType: error instanceof Error ? error.name : "Unknown",
        });

        return errorMessages;
      } finally {
        // Cleanup abort handler to prevent memory leaks
        if (abortSignal && abortHandler) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        // Clear the request ID when request completes (success or error)
        currentRequestIdRef.current = null;
        setIsLoading(false);
      }
    },
    [
      messages,
      setMessages,
      makeSystemMessageCallback,
      copilotConfig,
      setIsLoading,
      initialMessages,
      isLoading,
      actions,
      onFunctionCall,
      onCoAgentStateRender,
      setCoagentStatesWithRef,
      coagentStatesRef,
      agentSession,
      setAgentSession,
      disableSystemMessage,
    ]
  );

  runChatCompletionRef.current = runChatCompletion;

  const runChatCompletionAndHandleFunctionCall = useAsyncCallback(
    async (messages: Message[]): Promise<void> => {
      await runChatCompletionRef.current!(messages);
    },
    [messages]
  );

  useEffect(() => {
    if (!isLoading && pendingAppendsRef.current.length > 0) {
      const pending = pendingAppendsRef.current.splice(0);
      const followUp = pending.some((p) => p.followUp);
      const newMessages = [...messages, ...pending.map((p) => p.message)];
      setMessages(newMessages);

      if (followUp) {
        runChatCompletionAndHandleFunctionCall(newMessages);
      }
    }
  }, [
    isLoading,
    messages,
    setMessages,
    runChatCompletionAndHandleFunctionCall,
  ]);

  // Go over all events and see that they include data that should be returned to the agent
  const composeAndFlushMetaEventsInput = useCallback(
    (metaEvents: (MetaEvent | undefined | null)[]) => {
      return metaEvents.reduce((acc: MetaEventInput[], event) => {
        if (!event) return acc;

        switch ((event as any).name) {
          case MetaEventName.LangGraphInterruptEvent:
            if ((event as any).response) {
              // Flush interrupt event from state
              setLangGraphInterruptAction(null);
              const value = (event as any).value;
              return [
                ...acc,
                {
                  name: (event as any).name,
                  value:
                    typeof value === "string" ? value : JSON.stringify(value),
                  response:
                    typeof (event as any).response === "string"
                      ? (event as any).response
                      : JSON.stringify((event as any).response),
                },
              ];
            }
            return acc;
          default:
            return acc;
        }
      }, []);
    },
    [setLangGraphInterruptAction]
  );

  const append = useAsyncCallback(
    async (message: Message, options?: AppendMessageOptions): Promise<void> => {
      const followUp = options?.followUp ?? true;
      if (isLoading) {
        pendingAppendsRef.current.push({ message, followUp });
        return;
      }

      const newMessages = [...messages, message];
      setMessages(newMessages);
      if (followUp) {
        return runChatCompletionAndHandleFunctionCall(newMessages);
      }
    },
    [isLoading, messages, setMessages, runChatCompletionAndHandleFunctionCall]
  );

  const reload = useAsyncCallback(
    async (reloadMessageId: string): Promise<void> => {
      if (isLoading || messages.length === 0) {
        return;
      }

      const reloadMessageIndex = messages.findIndex(
        (msg) => msg.id === reloadMessageId
      );
      if (reloadMessageIndex === -1) {
        console.warn(`Message with id ${reloadMessageId} not found`);
        return;
      }

      // @ts-expect-error -- message has role
      const reloadMessageRole = messages[reloadMessageIndex].role;
      if (reloadMessageRole !== MessageRole.assistant) {
        console.warn(
          `Regenerate cannot be performed on ${reloadMessageRole} role`
        );
        return;
      }

      let historyCutoff: Message[] = [];
      if (messages.length > 2) {
        // message to regenerate from is now first.
        // Work backwards to find the first the closest user message
        const lastUserMessageBeforeRegenerate = messages
          .slice(0, reloadMessageIndex)
          .reverse()
          .find(
            (msg) =>
              // @ts-expect-error -- message has role
              msg.role === MessageRole.user
          );
        const indexOfLastUserMessageBeforeRegenerate = messages.findIndex(
          (msg) => msg.id === lastUserMessageBeforeRegenerate!.id
        );

        // Include the user message, remove everything after it
        historyCutoff = messages.slice(
          0,
          indexOfLastUserMessageBeforeRegenerate + 1
        );
      }

      setMessages(historyCutoff);

      return runChatCompletionAndHandleFunctionCall(historyCutoff);
    },
    [isLoading, messages, setMessages, runChatCompletionAndHandleFunctionCall]
  );

  const stop = (): { requestId: string | null } => {
    const requestId = currentRequestIdRef.current;
    chatAbortControllerRef.current?.abort("Stop was called");
    // Return the requestId so it can be used for explicit cancellation
    return { requestId };
  };

  // Getter for the current request ID (useful for cancellation)
  const getCurrentRequestId = (): string | null => currentRequestIdRef.current;

  return {
    append,
    reload,
    stop,
    getCurrentRequestId,
    runChatCompletion: () => runChatCompletionRef.current!(messages),
  };
}

export function constructFinalMessages(
  syncedMessages: Message[],
  previousMessages: Message[],
  newMessages: Message[]
): Message[] {
  const finalMessages =
    syncedMessages.length > 0
      ? [...syncedMessages]
      : [...previousMessages, ...newMessages];

  if (syncedMessages.length > 0) {
    const messagesWithAgentState = [...previousMessages, ...newMessages];

    let previousMessageId: string | undefined = undefined;

    for (const message of messagesWithAgentState) {
      if (message.isAgentStateMessage()) {
        // insert this message into finalMessages after the position of previousMessageId
        const index = finalMessages.findIndex(
          (msg) => msg.id === previousMessageId
        );
        if (index !== -1) {
          finalMessages.splice(index + 1, 0, message);
        }
      }

      previousMessageId = message.id;
    }
  }

  return finalMessages;
}

async function executeAction({
  onFunctionCall,
  message,
  chatAbortControllerRef,
  onError,
  setMessages,
  getFinalMessages,
  isRenderAndWait,
}: {
  onFunctionCall: FunctionCallHandler;
  message: ActionExecutionMessage;
  chatAbortControllerRef: React.MutableRefObject<AbortController | null>;
  onError: (error: Error) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  getFinalMessages: () => Message[];
  isRenderAndWait: boolean;
}) {
  let result: any;
  let error: Error | null = null;

  const currentMessagesForHandler = getFinalMessages();

  const handlerReturnedPromise = onFunctionCall({
    messages: currentMessagesForHandler,
    name: message.name,
    args: message.arguments,
  });

  // For HITL actions, call flushSync immediately after their handler has set up the promise
  // and before awaiting the promise. This ensures the UI updates to an interactive state.
  if (isRenderAndWait) {
    const currentMessagesForRender = getFinalMessages();
    flushSync(() => {
      setMessages([...currentMessagesForRender]);
    });
  }

  try {
    result = await Promise.race([
      handlerReturnedPromise, // Await the promise returned by the handler
      new Promise((resolve) =>
        chatAbortControllerRef.current?.signal.addEventListener("abort", () =>
          resolve("Operation was aborted by the user")
        )
      ),
      // if the user stopped generation, we also abort consecutive actions
      new Promise((resolve) => {
        if (chatAbortControllerRef.current?.signal.aborted) {
          resolve("Operation was aborted by the user");
        }
      }),
    ]);
  } catch (e) {
    error = e as Error;
    onError(error);
  }

  return new ResultMessage({
    id: randomId(),
    result: ResultMessage.encodeResult(
      error
        ? {
          content: result,
          error: JSON.parse(
            JSON.stringify(error, Object.getOwnPropertyNames(error))
          ),
        }
        : result || "Success"
    ),
    actionExecutionId: message.messageId,
    actionName: message.name,
    status: error
      ? {
        code: MessageStatusCode.Failed,
        reason: error.message || "Action execution failed",
      }
      : { code: MessageStatusCode.Success },
  });
}

function getPairedFeAction(
  actions: FrontendAction<any>[],
  message: ActionExecutionMessage | ResultMessage
) {
  let actionName = null;
  if (message.isActionExecutionMessage()) {
    actionName = message.name;
  } else if (message.isResultMessage()) {
    actionName = message.actionName;
  }
  return actions.find(
    (action) =>
      (action.name === actionName && action.available === "frontend") ||
      action.pairedAction === actionName
  );
}
