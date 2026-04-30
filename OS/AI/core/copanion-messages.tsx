/**
 * An internal context to separate the messages state (which is constantly changing) from the rest of CopilotKit context
 */

import {
  ReactNode,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from "react";
import { CopanionMessagesContext } from "@OS/AI/core/context/copanion-messages-context";
import {
  loadMessagesFromJsonRepresentation,
  Message,
} from "@OS/AI/runtime-client";
import { useCopanionContext } from "@OS/AI/core/context/copanion-context";
import { useToast } from "@/components/ui/use-toast";
import { shouldShowDevConsole } from "@OS/AI/core/utils/dev-console";
import {
  ErrorVisibility,
  HyperchoApiDiscoveryError,
  HyperchoRemoteEndpointDiscoveryError,
  HyperchoAgentDiscoveryError,
  HyperchoError,
  HyperchoErrorCode,
  isStructuredHyperchoError,
  shouldShowErrorToUser,
  getErrorDisplayType,
  logError,
} from "@OS/AI/shared";
import { SuggestionItem } from "@OS/AI/core/utils/suggestions";

// Helper to determine if error should show as banner based on visibility and error type
function shouldShowAsBanner(error: any): boolean {
  // If it's already a structured Hypercho error, use the built-in logic
  if (isStructuredHyperchoError(error)) {
    return getErrorDisplayType(error) === "banner";
  }

  // For unstructured errors, check for critical patterns
  const errorMessage = (error?.message || String(error)).toLowerCase();
  if (
    errorMessage.includes("api key") ||
    errorMessage.includes("401") ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("incorrect api key") ||
    errorMessage.includes("not found") ||
    errorMessage.includes("configuration")
  ) {
    return true;
  }

  // Check for specific error codes in response
  if (error?.code) {
    const criticalCodes = [
      HyperchoErrorCode.AGENT_NOT_FOUND,
      HyperchoErrorCode.API_NOT_FOUND,
      HyperchoErrorCode.REMOTE_ENDPOINT_NOT_FOUND,
      HyperchoErrorCode.CONFIGURATION_ERROR,
      HyperchoErrorCode.MISSING_API_KEY_ERROR,
      HyperchoErrorCode.UPGRADE_REQUIRED_ERROR,
      HyperchoErrorCode.AUTHENTICATION_ERROR,
      HyperchoErrorCode.AUTHORIZATION_ERROR,
    ];
    return criticalCodes.includes(error.code);
  }

  return false;
}

/**
 * MessagesTap is used to mitigate performance issues when we only need
 * a snapshot of the messages, not a continuously updating stream of messages.
 */

export type MessagesTap = {
  getMessagesFromTap: () => Message[];
  updateTapMessages: (messages: Message[]) => void;
};

const MessagesTapContext = createContext<MessagesTap | null>(null);

export function useMessagesTap() {
  const tap = useContext(MessagesTapContext);
  if (!tap)
    throw new Error("useMessagesTap must be used inside <MessagesTapProvider>");
  return tap;
}

export function MessagesTapProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const messagesRef = useRef<Message[]>([]);

  const tapRef = useRef<MessagesTap>({
    getMessagesFromTap: () => messagesRef.current,
    updateTapMessages: (messages: Message[]) => {
      messagesRef.current = messages;
    },
  });

  return (
    <MessagesTapContext.Provider value={tapRef.current}>
      {children}
    </MessagesTapContext.Provider>
  );
}

/**
 * CopilotKit messages context.
 */

export function CopanionMessages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const lastLoadedThreadId = useRef<string>();
  const lastLoadedAgentName = useRef<string>();
  const lastLoadedMessages = useRef<string>();

  const { updateTapMessages } = useMessagesTap();

  const {
    threadId,
    agentSession,
    runtimeClient,
    showDevConsole,
    onError,
    copanionApiConfig,
  } = useCopanionContext();
  const { setBannerError } = useToast();

  // Helper function to trace UI errors (similar to useCopilotRuntimeClient)
  const traceUIError = useCallback(
    async (error: HyperchoError, originalError?: any) => {
      // Just check if onError and publicApiKey are defined
      if (!onError || !copanionApiConfig.publicApiKey) return;

      try {
        const traceEvent = {
          type: "error" as const,
          timestamp: Date.now(),
          context: {
            source: "ui" as const,
            request: {
              operation: "loadAgentState",
              url: copanionApiConfig.chatApiEndpoint,
              startTime: Date.now(),
            },
            technical: {
              environment: "browser",
              userAgent:
                typeof navigator !== "undefined"
                  ? navigator.userAgent
                  : undefined,
              stackTrace:
                originalError instanceof Error
                  ? originalError.stack
                  : undefined,
            },
          },
          error,
        };
        await onError(traceEvent);
      } catch (traceError) {
        console.error("Error in CopanionMessages onError handler:", traceError);
      }
    },
    [onError, copanionApiConfig.publicApiKey, copanionApiConfig.chatApiEndpoint]
  );

  const createStructuredError = (error: any): HyperchoError | null => {
    // If it's already a structured error, return as-is
    if (isStructuredHyperchoError(error)) {
      return error;
    }

    // Check for specific error patterns in stack trace or message
    const errorMessage = error?.message || String(error);
    const stack = error?.stack || "";

    if (
      stack.includes("ApiDiscoveryError") ||
      errorMessage.includes("API endpoint")
    ) {
      return new HyperchoApiDiscoveryError({ message: errorMessage });
    }
    if (
      stack.includes("RemoteEndpointDiscoveryError") ||
      errorMessage.includes("remote endpoint")
    ) {
      return new HyperchoRemoteEndpointDiscoveryError({
        message: errorMessage,
      });
    }
    if (
      stack.includes("AgentDiscoveryError") ||
      errorMessage.includes("agent not found")
    ) {
      return new HyperchoAgentDiscoveryError({
        agentName: "",
        availableAgents: [],
      });
    }

    // Check for HTTP status codes
    if (error?.status || error?.statusCode) {
      const status = error.status || error.statusCode;
      switch (status) {
        case 401:
          return new HyperchoError({
            message: errorMessage,
            code: HyperchoErrorCode.AUTHENTICATION_ERROR,
          });
        case 403:
          return new HyperchoError({
            message: errorMessage,
            code: HyperchoErrorCode.AUTHORIZATION_ERROR,
          });
        case 404:
          return new HyperchoApiDiscoveryError({ message: errorMessage });
        case 429:
          return new HyperchoError({
            message: errorMessage,
            code: HyperchoErrorCode.RATE_LIMIT_ERROR,
          });
        default:
          return new HyperchoError({
            message: errorMessage,
            code: HyperchoErrorCode.UNKNOWN,
          });
      }
    }

    // Check for specific error codes
    if (error?.code) {
      return new HyperchoError({ message: errorMessage, code: error.code });
    }

    // Fallback to unknown error
    return new HyperchoError({
      message: errorMessage,
      code: HyperchoErrorCode.UNKNOWN,
    });
  };

  const handleApiErrors = useCallback(
    (error: any) => {
      const isDev = shouldShowDevConsole(showDevConsole);

      // Log the error appropriately
      logError(error, "API Error in CopanionMessages");

      // Check if error should be shown to user
      if (!shouldShowErrorToUser(error, isDev)) {
        return;
      }

      // Create structured error
      const structuredError = createStructuredError(error);

      if (structuredError) {
        // Determine display type
        const displayType = getErrorDisplayType(structuredError);

        if (displayType === "banner") {
          setBannerError(structuredError);
        } else if (displayType === "toast") {
          // For now, also show as banner for consistency
          // You can implement toast notifications later
          setBannerError(structuredError);
        }

        // Trace the structured error
        traceUIError(structuredError, error);
      } else {
        // Fallback: create a generic error for unstructured errors
        const fallbackError = new HyperchoError({
          message: error?.message || String(error),
          code: HyperchoErrorCode.UNKNOWN,
        });
        setBannerError(fallbackError);
        traceUIError(fallbackError, error);
      }
    },
    [setBannerError, showDevConsole, traceUIError]
  );

  useEffect(() => {
    if (!threadId || threadId === lastLoadedThreadId.current) return;
    if (
      threadId === lastLoadedThreadId.current &&
      agentSession?.agentName === lastLoadedAgentName.current
    ) {
      return;
    }

    const fetchMessages = async () => {
      if (!agentSession?.agentName) return;

      const result = await runtimeClient.loadAgentState({
        threadId,
        agentName: agentSession?.agentName,
      });

      // Check for API errors and manually trigger error handling
      if (result.errors) {
        // Update refs to prevent infinite retries of the same failed request
        lastLoadedThreadId.current = threadId;
        lastLoadedAgentName.current = agentSession?.agentName;
        handleApiErrors(result.errors);
        return; // Don't try to process the data if there's an error
      }

      const newMessages = result.data?.loadAgentState?.messages;
      if (newMessages === lastLoadedMessages.current) return;

      if (result.data?.loadAgentState) {
        lastLoadedMessages.current = newMessages;
        lastLoadedThreadId.current = threadId;
        lastLoadedAgentName.current = agentSession?.agentName;

        const messages = loadMessagesFromJsonRepresentation(
          JSON.parse(newMessages || "[]")
        );
        setMessages(messages);
      }
    };
    void fetchMessages();
  }, [threadId, agentSession?.agentName]);

  useEffect(() => {
    updateTapMessages(messages);
  }, [messages, updateTapMessages]);

  const memoizedChildren = useMemo(() => children, [children]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);

  return (
    <CopanionMessagesContext.Provider
      value={{
        messages,
        setMessages,
        suggestions,
        setSuggestions,
      }}
    >
      {memoizedChildren}
    </CopanionMessagesContext.Provider>
  );
}
