/**
 * Unified Tool State Hook
 *
 * Manages state for ALL tool types in a single, scalable way.
 * No more separate state maps for each tool type!
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Message } from "@OS/AI/shared";
import { MessageStatusCode } from "@OS/AI/runtime";
import {
  UnifiedToolState,
  normalizeToolArguments,
  isToolRejected,
  extractRejectionMessage,
  toolRegistry,
  ToolStatus,
} from "../ToolRegistry";
import isEqual from "lodash/isEqual";

/**
 * Helper function to convert MessageStatusCode to ToolStatus
 */
const messageStatusToToolStatus = (
  status: MessageStatusCode,
  hasResult: boolean = false,
  isExpired: boolean = false
): ToolStatus => {
  // If message is expired, always return "expired" status
  if (isExpired) {
    return "expired";
  }

  switch (status) {
    case MessageStatusCode.Pending:
      return hasResult ? "executing" : "pending";
    case MessageStatusCode.Success:
      return "completed";
    case MessageStatusCode.Failed:
      return "rejected";
    default:
      return "pending";
  }
};

/**
 * Hook to manage unified tool states
 */
export const useUnifiedToolState = (messages: Message[]) => {
  const [toolStates, setToolStates] = useState<Map<string, UnifiedToolState>>(
    new Map()
  );

  // Toggle expansion for any tool
  const toggleToolExpansion = useCallback((messageId: string) => {
    setToolStates((prev) => {
      const newMap = new Map(prev);
      const currentState = newMap.get(messageId);
      if (currentState) {
        newMap.set(messageId, {
          ...currentState,
          isExpanded: !currentState.isExpanded,
        });
      }
      return newMap;
    });
  }, []);

  // Reset/clear all tool states (useful when starting a new conversation)
  const resetToolStates = useCallback(() => {
    setToolStates(new Map());
  }, []);

  // Helper to get last 10 messages for performance (messages can get extremely massive)
  const getLastMessages = (msgs: Message[]) => msgs.slice(-10);

  // Memoize messages with deep equality check - only changes when last 10 messages actually change
  const prevLastMessagesRef = useRef<Message[]>(getLastMessages(messages));
  const memoizedMessagesRef = useRef<Message[]>(messages);

  const memoizedMessages = useMemo(() => {
    const lastMessages = getLastMessages(messages);

    // Deep equality check - only return new reference if messages actually changed
    if (!isEqual(prevLastMessagesRef.current, lastMessages)) {
      prevLastMessagesRef.current = lastMessages;
      memoizedMessagesRef.current = messages;
    }

    return memoizedMessagesRef.current;
  }, [messages]);

  const toolStatesRef = useRef<Map<string, UnifiedToolState>>(toolStates);

  // Keep toolStatesRef in sync with toolStates
  useEffect(() => {
    toolStatesRef.current = toolStates;
  }, [toolStates]);

  // Update tool states when messages change (using memoized messages for dependency)
  useEffect(() => {
    const newToolStates = new Map(toolStatesRef.current);
    let hasChanges = false;

    // Helper to find matching assistant message for a tool result
    const findMatchingAssistant = (toolMessage: Message) => {
      // Handle both "tool" and "toolResult" roles (cast to any to handle gateway's toolResult role)
      const msgRole = (toolMessage as any).role;
      if (msgRole === "tool" || msgRole === "toolResult") {
        // Get toolCallId from top-level or from toolResults array
        const toolCallId = (toolMessage as any).toolCallId || (toolMessage as any).toolResults?.[0]?.toolCallId;
        return messages.find(
          (msg) =>
            msg.role === "assistant" &&
            (msg as any).toolCalls?.some((call: any) => call.id === toolCallId)
        );
      }
      return null;
    };

    // Process each message
    messages.forEach((message) => {
      // Handle assistant messages with tool calls
      if (
        message.role === "assistant" &&
        (message as any).toolCalls?.length > 0
      ) {
        const id = message.id || "";
        const messageId = (message as any).messageId || "";
        const toolCall = (message as any).toolCalls[0];
        const normalizedArguments = normalizeToolArguments(
          toolCall.function.arguments
        );

        const existingState = newToolStates.get(id);

        // Check if there's already a tool result (handle both "tool" and "toolResult" roles)
        const toolCallId = toolCall.id;
        const toolResultMessage = messages.find(
          (msg) => {
            const msgRole = (msg as any).role;
            return (msgRole === "tool" || msgRole === "toolResult") &&
              ((msg as any).toolCallId === toolCallId || (msg as any).toolResults?.[0]?.toolCallId === toolCallId);
          }
        );

        const hasToolResult = !!toolResultMessage;

        // Get tool config for custom parsing
        const toolConfig = toolRegistry.getConfig(toolCall.function.name);

        // Parse arguments using custom parser if available
        let parsedArguments = normalizedArguments;
        if (toolConfig?.parseArguments) {
          try {
            parsedArguments = JSON.stringify(
              toolConfig.parseArguments(normalizedArguments)
            );
          } catch (e) {
            // Use normalized arguments as fallback
          }
        }

        // Extract metadata from arguments
        let metadata: Record<string, any> = {};
        try {
          const parsed = JSON.parse(parsedArguments);
          if (typeof parsed === "object" && parsed !== null) {
            metadata = parsed;
          }
        } catch (e) {
          // No metadata
        }

        // Determine status
        let statusCode: MessageStatusCode = MessageStatusCode.Pending;
        if (message.expired) {
          statusCode = MessageStatusCode.Failed;
        } else if ((message as any).status) {
          // Normalize status from message
          const rawStatus = (message as any).status;
          if (typeof rawStatus === "object" && "code" in rawStatus) {
            statusCode = rawStatus.code;
          } else if (typeof rawStatus === "string") {
            switch (rawStatus.toLowerCase()) {
              case "pending":
                statusCode = MessageStatusCode.Pending;
                break;
              case "success":
                statusCode = MessageStatusCode.Success;
                break;
              case "failed":
                statusCode = MessageStatusCode.Failed;
                break;
            }
          }
        }

        // Convert to ToolStatus
        const status = messageStatusToToolStatus(
          statusCode,
          hasToolResult,
          message.expired
        );

        if (existingState) {
          // Update only if arguments or status changed
          if (
            existingState.arguments !== parsedArguments ||
            existingState.status !== status
          ) {
            newToolStates.set(id, {
              ...existingState,
              arguments: parsedArguments,
              status,
              metadata,
            });
            hasChanges = true;
          }
        } else {
          // Create new state
          const newState: UnifiedToolState = {
            id,
            messageId,
            toolCallId,
            toolName: toolCall.function.name,
            status,
            arguments: parsedArguments,
            metadata,
            isExpanded: false,
          };

          // If tool result already exists, include it
          if (hasToolResult && toolResultMessage) {
            const isRejected = isToolRejected(toolResultMessage.content);
            newState.resultContent = toolResultMessage.content;
            newState.rejectionMessage = extractRejectionMessage(
              toolResultMessage.content
            );
            // If message is expired, always mark as expired regardless of tool result
            if (message.expired) {
              newState.status = "expired";
            } else if (isRejected) {
              newState.status = "rejected";
            } else {
              newState.status = "completed";
            }
          }

          newToolStates.set(id, newState);
          hasChanges = true;
        }
      }

      // Handle tool result messages (handle both "tool" and "toolResult" roles)
      const msgRole = (message as any).role;
      if (msgRole === "tool" || msgRole === "toolResult") {
        const matchingAssistant = findMatchingAssistant(message);
        if (matchingAssistant) {
          const assistantId = matchingAssistant.id || "";
          const toolState = newToolStates.get(assistantId);

          if (toolState) {
            // Get content from toolResults array or from message.content
            const toolResultContent = (message as any).toolResults?.[0]?.content || message.content;
            const isError = (message as any).toolResults?.[0]?.isError || false;
            const isRejected = isToolRejected(toolResultContent);
            const rejectionMessage = extractRejectionMessage(toolResultContent);

            // Check current status to determine transition
            if (toolState.status === "pending" || !toolState.resultContent) {
              // First update: Transition to Executing state
              newToolStates.set(assistantId, {
                ...toolState,
                status: isError ? "rejected" : "executing", // Show executing state (or rejected if error)
                resultContent: toolResultContent,
                rejectionMessage,
              });
              hasChanges = true;

              // Schedule final status update after brief delay to show execution state
              setTimeout(() => {
                setToolStates((prev) => {
                  const currentState = prev.get(assistantId);
                  if (currentState) {
                    const newMap = new Map(prev);
                    // If matching assistant message is expired, always mark as expired
                    let finalStatus: ToolStatus;
                    if ((matchingAssistant as any).expired) {
                      finalStatus = "expired";
                    } else if (isRejected) {
                      finalStatus = "rejected";
                    } else {
                      finalStatus = "completed";
                    }
                    newMap.set(assistantId, {
                      ...currentState,
                      status: finalStatus,
                      resultContent: toolResultContent,
                      rejectionMessage,
                      isExpanded: false, // Collapse when complete
                    });
                    return newMap;
                  }
                  return prev;
                });
              }, 600); // 600ms delay for smooth transition
            } else {
              // Direct update for already completed tools (e.g., when loading from history)
              // If matching assistant message is expired, always mark as expired
              let finalStatus: ToolStatus;
              if ((matchingAssistant as any).expired) {
                finalStatus = "expired";
              } else if (isRejected || isError) {
                finalStatus = "rejected";
              } else {
                finalStatus = "completed";
              }

              newToolStates.set(assistantId, {
                ...toolState,
                status: finalStatus,
                resultContent: toolResultContent,
                rejectionMessage,
              });
              hasChanges = true;
            }
          }
        }
      }
    });

    // Only update if there were changes
    if (hasChanges) {
      setToolStates(newToolStates);
    }
  }, [memoizedMessages]);

  return {
    toolStates,
    toggleToolExpansion,
    resetToolStates,
  };
};
