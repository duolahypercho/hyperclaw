/**
 * Unified Tool State Hook
 *
 * Manages state for ALL tool types in a single, scalable way.
 * No more separate state maps for each tool type!
 */

import { useState, useCallback, useEffect } from "react";
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

  // Update tool states when messages change.
  // Uses functional updater (prev =>) to always read the latest state, avoiding
  // the stale-ref race condition that caused all tools to flash back to "executing".
  // The `hasChanges` guard inside prevents unnecessary re-renders, so we can
  // safely depend on `messages` directly without aggressive memoization.
  useEffect(() => {
    setToolStates((prev) => {
      const newToolStates = new Map(prev);
      let hasChanges = false;

      // Helper to find matching assistant message for a tool result
      const findMatchingAssistant = (toolMessage: Message) => {
        const msgRole = (toolMessage as any).role;
        if (msgRole === "tool" || msgRole === "toolResult") {
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

          // Check if there's already a tool result
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
            // Don't downgrade from terminal states (completed/rejected/expired)
            const isTerminal = existingState.status === "completed" ||
              existingState.status === "rejected" ||
              existingState.status === "expired";
            const effectiveStatus = isTerminal ? existingState.status : status;

            // Update only if arguments or status actually changed
            if (
              existingState.arguments !== parsedArguments ||
              existingState.status !== effectiveStatus
            ) {
              newToolStates.set(id, {
                ...existingState,
                arguments: parsedArguments,
                status: effectiveStatus,
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
              const isResultError = (toolResultMessage as any).toolResults?.[0]?.isError ||
                (toolResultMessage as any).isError || false;
              newState.resultContent = toolResultMessage.content;
              newState.rejectionMessage = extractRejectionMessage(
                toolResultMessage.content
              );
              if (message.expired) {
                newState.status = "expired";
              } else if (isRejected || isResultError) {
                newState.status = "rejected";
              } else {
                newState.status = "completed";
              }
            }

            newToolStates.set(id, newState);
            hasChanges = true;
          }
        }

        // Handle tool result messages
        const msgRole = (message as any).role;
        if (msgRole === "tool" || msgRole === "toolResult") {
          const matchingAssistant = findMatchingAssistant(message);
          if (matchingAssistant) {
            const assistantId = matchingAssistant.id || "";
            const toolState = newToolStates.get(assistantId);

            if (toolState) {
              const toolResultContent = (message as any).toolResults?.[0]?.content || message.content;
              const isError = (message as any).toolResults?.[0]?.isError || false;
              const isRejected = isToolRejected(toolResultContent);
              const rejectionMessage = extractRejectionMessage(toolResultContent);

              // Determine final status directly — no more setTimeout dance.
              // The executing→completed animation is handled by the UI components.
              let finalStatus: ToolStatus;
              if ((matchingAssistant as any).expired) {
                finalStatus = "expired";
              } else if (isRejected || isError) {
                finalStatus = "rejected";
              } else {
                finalStatus = "completed";
              }

              if (toolState.status !== finalStatus || toolState.resultContent !== toolResultContent) {
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

      // If the conversation has a final assistant text response after tool calls,
      // all tools before it must have completed. Mark any still-pending tools as
      // "completed" — their phase:"result" events may not arrive via the hub relay.
      // Check for a final text assistant message anywhere after the last tool call,
      // not just the very last message (gateway puts toolResult messages at the end).
      let hasFinalTextAfterTools = false;
      let lastToolCallIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if ((messages[i] as any).toolCalls?.length) {
          lastToolCallIdx = i;
          break;
        }
      }
      for (let i = lastToolCallIdx + 1; i < messages.length; i++) {
        if (
          messages[i].role === "assistant" &&
          !(messages[i] as any).toolCalls?.length &&
          (messages[i].content || "").trim()
        ) {
          hasFinalTextAfterTools = true;
          break;
        }
      }
      if (hasFinalTextAfterTools) {
        newToolStates.forEach((state, key) => {
          if (state.status === "pending" || state.status === "executing") {
            newToolStates.set(key, { ...state, status: "completed" });
            hasChanges = true;
          }
        });
      }

      return hasChanges ? newToolStates : prev;
    });
  }, [messages]);

  return {
    toolStates,
    toggleToolExpansion,
    resetToolStates,
  };
};
