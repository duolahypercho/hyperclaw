import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ChatSuggestions } from "@OS/AI/components/Chat";
import { SystemMessageFunction } from "@OS/AI/types";
import { Message, randomId } from "@OS/AI/shared";
import { HintFunction, runAgent, stopAgent } from "./use-coagent";
import { useCopanionChat } from "./use-copanion-chat_internal";
import { useCopanionContext } from "../context/copanion-context";
import { useCopanionMessagesContext } from "../context/copanion-messages-context";

interface OnStopGenerationArguments {
  /**
   * The name of the currently executing agent.
   */
  currentAgentName: string | undefined;

  /**
   * The messages in the chat (AGUI format - for reading/display).
   */
  messages: Message[];

  /**
   * The messages in API format - use this for setMessages to avoid double transformation.
   * When you slice these and call setMessages, they won't be re-transformed.
   */
  visibleMessages: any[];

  /**
   * Set the messages in the chat.
   * IMPORTANT: Pass API format messages (visibleMessages) to avoid transformation issues.
   */
  setMessages: (messages: Message[]) => void;

  /**
   * Stop chat generation.
   * Returns the requestId of the cancelled request for explicit backend cancellation.
   */
  stopGeneration: () => { requestId: string | null };

  /**
   * Restart the currently executing agent.
   */
  restartCurrentAgent: () => void;

  /**
   * Stop the currently executing agent.
   */
  stopCurrentAgent: () => void;

  /**
   * Run the currently executing agent.
   */
  runCurrentAgent: (hint?: HintFunction) => Promise<void>;

  /**
   * Set the state of the currently executing agent.
   */
  setCurrentAgentState: (state: any) => void;
}

export type OnReloadMessagesArguments = OnStopGenerationArguments & {
  /**
   * The message on which "regenerate" was pressed
   */
  messageId: string;
};

export type OnStopGeneration = (args: OnStopGenerationArguments) => void;

export type OnReloadMessages = (args: OnReloadMessagesArguments) => void;

export const useCopanionChatLogic = (
  chatSuggestions: ChatSuggestions,
  makeSystemMessage?: SystemMessageFunction,
  disableSystemMessage?: boolean,
  onInProgress?: (isLoading: boolean) => void,
  onSubmitMessage?: (messageContent: string) => Promise<void> | void,
  onStopGeneration?: OnStopGeneration,
  onReloadMessages?: OnReloadMessages
) => {
  const {
    messages,
    visibleMessages, // API format messages - use for setMessages to avoid double transformation
    sendMessage,
    setMessages,
    reloadMessages: defaultReloadMessages,
    stopGeneration: defaultStopGeneration,
    runChatCompletion,
    isLoading,
    suggestions,
    setSuggestions,
    generateSuggestions,
    resetSuggestions: resetSuggestionsFromHook,
    isLoadingSuggestions,
    fetchConversationHistory,
    conversationHistory,
    isLoadingHistory,
    historyError,
    reset,
    loadConversation,
    isChatLoading,
  } = useCopanionChat({
    makeSystemMessage,
    disableSystemMessage,
  });

  const generalContext = useCopanionContext();
  const messagesContext = useCopanionMessagesContext();

  // Get actions from context for message conversion
  const { actions } = generalContext;

  // Suggestion state management
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const hasGeneratedInitialSuggestions = useRef<boolean>(false);

  // Handle static suggestions (when suggestions prop is an array)
  useEffect(() => {
    if (Array.isArray(chatSuggestions)) {
      setSuggestions(chatSuggestions);
      hasGeneratedInitialSuggestions.current = true;
    }
  }, [JSON.stringify(chatSuggestions), setSuggestions]);

  // Error handling wrapper
  const generateSuggestionsWithErrorHandling = useCallback(
    async (context: string) => {
      try {
        await generateSuggestions();
      } catch (error) {
        console.error("Failed to generate suggestions:", error);
        setSuggestionsFailed(true);
      }
    },
    [generateSuggestions]
  );

  // Automatic suggestion generation logic
  useEffect(() => {
    // Only proceed if in auto mode, not currently loading, and not failed
    if (
      chatSuggestions !== "auto" ||
      isLoadingSuggestions ||
      suggestionsFailed
    ) {
      return;
    }

    // Don't run during chat loading (when the assistant is responding)
    if (isLoading) {
      return;
    }

    // Check if we have any configurations
    if (Object.keys(generalContext.chatSuggestionConfiguration).length === 0) {
      return;
    }

    // Generate initial suggestions when chat is empty
    if (messages.length === 0 && !hasGeneratedInitialSuggestions.current) {
      hasGeneratedInitialSuggestions.current = true;
      generateSuggestionsWithErrorHandling("initial");
      return;
    }

    // Generate post-message suggestions after assistant responds
    if (messages.length > 0 && suggestions.length === 0) {
      generateSuggestionsWithErrorHandling("post-message");
      return;
    }
  }, [
    chatSuggestions,
    isLoadingSuggestions,
    suggestionsFailed,
    messages.length,
    isLoading,
    suggestions.length,
    Object.keys(generalContext.chatSuggestionConfiguration).join(","), // Use stable string instead of object reference
    generateSuggestionsWithErrorHandling,
  ]);

  // Reset suggestion state when switching away from auto mode
  useEffect(() => {
    if (chatSuggestions !== "auto") {
      hasGeneratedInitialSuggestions.current = false;
      setSuggestionsFailed(false);
    }
  }, [chatSuggestions]);

  // Memoize context to prevent infinite re-renders
  const stableContext = useMemo(
    () => ({
      ...generalContext,
      ...messagesContext,
    }),
    [
      // Only include stable dependencies
      generalContext.actions,
      messagesContext.messages.length,
      generalContext.isLoading,
    ]
  );

  // Wrapper for resetSuggestions that also resets local state
  const resetSuggestions = useCallback(() => {
    resetSuggestionsFromHook();
    setSuggestionsFailed(false);
    hasGeneratedInitialSuggestions.current = false;
  }, [resetSuggestionsFromHook]);

  useEffect(() => {
    onInProgress?.(isLoading);
  }, [onInProgress, isLoading]);

  const safelySendMessage = async (
    messageContent: string,
    imagesToUse?: Array<{ name: string; contentType: string; url: string }>
  ) => {
    const images = imagesToUse || [];

    // Clear existing suggestions when user sends a message
    // This prevents stale suggestions from remaining visible during new conversation flow
    if (chatSuggestions === "auto" || chatSuggestions === "manual") {
      setSuggestions([]);
    }

    let firstMessage: Message | null = null;

    // Send image messages
    if (images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const imageMessage: Message = {
          id: randomId(),
          role: "user",
          content: "",
          image: {
            name: images[i].name || "",
            format: images[i].contentType.replace("image/", ""),
            url: images[i].url,
          },
        };
        await sendMessage(imageMessage, {
          followUp:
            i === images.length - 1 && messageContent.trim().length === 0,
        });
        if (!firstMessage) {
          firstMessage = imageMessage;
        }
      }
    }

    // Send text message if content provided
    if (messageContent.trim().length > 0) {
      const textMessage: Message = {
        id: randomId(),
        role: "user",
        content: messageContent,
      };

      // Call user-provided submit handler if available
      if (onSubmitMessage) {
        try {
          await onSubmitMessage(messageContent);
        } catch (error) {
          console.error("Error in onSubmitMessage:", error);
        }
      }

      // Send the message and clear suggestions for auto/manual modes
      await sendMessage(textMessage, {
        followUp: true,
        clearSuggestions:
          chatSuggestions === "auto" || chatSuggestions === "manual",
      });

      if (!firstMessage) {
        firstMessage = textMessage;
      }
    }

    if (!firstMessage) {
      // Should not happen if send button is properly disabled, but handle just in case
      return {
        id: randomId(),
        role: "user",
        content: "",
      } as Message; // Return a dummy message
    }

    // The hook implicitly triggers API call on appendMessage.
    // We return the first message sent (either text or first image)
    return firstMessage;
  };

  const currentAgentName = generalContext.agentSession?.agentName;

  const restartCurrentAgent = async (hint?: HintFunction) => {
    if (generalContext.agentSession) {
      generalContext.setAgentSession({
        ...generalContext.agentSession,
        nodeName: undefined,
        threadId: undefined,
      });
      generalContext.setCoagentStates((prevAgentStates) => {
        return {
          ...prevAgentStates,
          [generalContext.agentSession!.agentName]: {
            ...prevAgentStates[generalContext.agentSession!.agentName],
            threadId: undefined,
            nodeName: undefined,
            runId: undefined,
          },
        };
      });
    }
  };

  const runCurrentAgent = async (hint?: HintFunction) => {
    if (generalContext.agentSession) {
      await runAgent(
        generalContext.agentSession.agentName,
        stableContext,
        messagesContext.messages,
        sendMessage,
        runChatCompletion
      );
    }
  };

  const stopCurrentAgent = () => {
    if (generalContext.agentSession) {
      stopAgent(generalContext.agentSession.agentName, stableContext);
    }
  };

  const setCurrentAgentState = (state: any) => {
    if (generalContext.agentSession) {
      generalContext.setCoagentStates((prevAgentStates) => {
        return {
          ...prevAgentStates,
          [generalContext.agentSession!.agentName]: {
            state,
          },
        } as any;
      });
    }
  };

  function stopGeneration() {
    // Clear suggestions when stopping generation
    setSuggestions([]);

    if (onStopGeneration) {
      onStopGeneration({
        messages: messages,
        visibleMessages: visibleMessages, // API format - use for setMessages
        setMessages,
        stopGeneration: defaultStopGeneration,
        currentAgentName,
        restartCurrentAgent,
        stopCurrentAgent,
        runCurrentAgent,
        setCurrentAgentState,
      });
    } else {
      defaultStopGeneration();
    }
  }

  function reloadMessages(messageId: string) {
    if (onReloadMessages) {
      onReloadMessages({
        messages: messages,
        visibleMessages: visibleMessages, // API format - use for setMessages
        setMessages,
        stopGeneration: defaultStopGeneration,
        currentAgentName,
        restartCurrentAgent,
        stopCurrentAgent,
        runCurrentAgent,
        setCurrentAgentState,
        messageId,
      });
    } else {
      defaultReloadMessages(messageId);
    }
  }

  function newConversation() {
    reset();
  }

  return {
    messages,
    isLoading,
    suggestions,
    sendMessage: safelySendMessage,
    stopGeneration,
    reloadMessages,
    resetSuggestions,
    context: stableContext,
    actions,
    fetchConversationHistory,
    conversationHistory,
    isLoadingHistory,
    historyError,
    loadConversation,
    newConversation,
    isChatLoading,
  };
};
