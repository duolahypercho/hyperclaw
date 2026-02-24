/**
 * @fileoverview AGUI to API message conversion utilities
 *
 * This module provides conversion functions from AGUI (AI-GUI) message format
 * to the Node.js API message format used by the Hypercho AI system.
 *
 * @author Hypercho AI Team
 * @version 1.0.0
 */

import { Message as AGUIMessage } from "@OS/AI/shared";
import {
  TextMessage,
  ActionExecutionMessage,
  ResultMessage,
  AgentStateMessage,
  ImageMessage,
  Role as ApiRole,
  Message,
} from "../client/types";
import agui from "@ag-ui/core";

// Helper function to extract agent name from message
function extractAgentName(message: AGUIMessage): string {
  if (message.role !== ApiRole.assistant) {
    throw new Error(
      `Cannot extract agent name from message with role ${message.role}`
    );
  }

  return (message as any).agentName || "unknown";
}

// Type guard for agent state message
function isAgentStateMessage(message: AGUIMessage): boolean {
  return (
    message.role === ApiRole.assistant &&
    "agentName" in message &&
    "state" in message
  );
}

// Type guard for messages with image property
function hasImageProperty(message: AGUIMessage): boolean {
  const canContainImage =
    message.role === ApiRole.assistant || message.role === ApiRole.user;
  if (!canContainImage || !(message as any).image) {
    return false;
  }

  const image = (message as any).image;
  const isMalformed = image.format === undefined || image.url === undefined;
  if (isMalformed) {
    return false;
  }

  return true;
}

/**
 * Converts AGUI messages to API message format
 *
 * @param messages - AGUI messages to convert
 * @param actions - Optional actions context for preserving render functions
 * @param coAgentStateRenders - Optional co-agent state renders context
 * @returns Array of API message objects
 */
export function aguiToApi(
  messages: AGUIMessage[] | AGUIMessage,
  actions?: Record<string, any>,
  coAgentStateRenders?: Record<string, any>
): Message[] {
  const apiMessages: Message[] = [];
  messages = Array.isArray(messages) ? messages : [messages];

  // Track tool call names by their IDs for use in result messages
  const toolCallNames: Record<string, string> = {};

  for (const message of messages) {
    // Agent state message support
    if (isAgentStateMessage(message)) {
      const agentName = extractAgentName(message);
      const state = "state" in message && message.state ? message.state : {};
      apiMessages.push(
        new AgentStateMessage({
          id: message.id,
          agentName,
          state,
          role: ApiRole.assistant,
          threadId: "default", // Default thread ID, should be provided by caller
        })
      );
      // Optionally preserve render function
      if (
        "generativeUI" in message &&
        (message as any).generativeUI &&
        coAgentStateRenders
      ) {
        coAgentStateRenders[agentName] = {
          name: agentName,
          render: (message as any).generativeUI,
        };
      }
      continue;
    }

    if (hasImageProperty(message)) {
      apiMessages.push(aguiMessageWithImageToMessage(message));
      continue;
    }

    // Action execution message support
    if (message.role === "assistant" && (message as any).toolCalls) {
      apiMessages.push(aguiTextMessageToMessage(message));
      for (const toolCall of (message as any).toolCalls) {
        // Track the tool call name by its ID
        toolCallNames[toolCall.id] = toolCall.function.name;

        const actionExecMsg = aguiToolCallToApiActionExecution(
          toolCall,
          message.id
        );
        // Preserve render function in actions context
        if (
          "generativeUI" in message &&
          (message as any).generativeUI &&
          actions
        ) {
          const actionName = toolCall.function.name;
          // Check for specific action first, then wild card action
          const specificAction = Object.values(actions).find(
            (action: any) => action.name === actionName
          );
          const wildcardAction = Object.values(actions).find(
            (action: any) => action.name === "*"
          );

          // Assign render function to the matching action (specific takes priority)
          if (specificAction) {
            specificAction.render = (message as any).generativeUI;
          } else if (wildcardAction) {
            wildcardAction.render = (message as any).generativeUI;
          }
        }
        apiMessages.push(actionExecMsg);
      }
      continue;
    }
    // Regular text messages
    if (
      message.role === "developer" ||
      message.role === "system" ||
      message.role === "assistant" ||
      message.role === "user"
    ) {
      apiMessages.push(aguiTextMessageToMessage(message));
      continue;
    }
    // Tool result message
    if (message.role === "tool") {
      apiMessages.push(
        aguiToolMessageToApiResultMessage(message, toolCallNames)
      );
      continue;
    }
    throw new Error(
      `Unknown message role: "${(message as any).role}" in message with id: ${
        (message as any).id
      }`
    );
  }

  return apiMessages;
}

/**
 * Converts AGUI text message to API text message
 */
export function aguiTextMessageToMessage(message: AGUIMessage): TextMessage {
  if (
    message.role !== "developer" &&
    message.role !== "system" &&
    message.role !== "assistant" &&
    message.role !== "user"
  ) {
    throw new Error(
      `Cannot convert message with role ${message.role} to TextMessage`
    );
  }

  let roleValue: (typeof ApiRole)[keyof typeof ApiRole];

  if (message.role === "developer") {
    roleValue = ApiRole.developer;
  } else if (message.role === "system") {
    roleValue = ApiRole.system;
  } else if (message.role === "assistant") {
    roleValue = ApiRole.assistant;
  } else {
    roleValue = ApiRole.user;
  }

  return new TextMessage({
    id: message.id,
    content: message.content || "",
    role: roleValue,
  });
}

/**
 * Converts AGUI tool call to API action execution message
 */
export function aguiToolCallToApiActionExecution(
  toolCall: agui.ToolCall,
  parentMessageId: string
): ActionExecutionMessage {
  if (toolCall.type !== "function") {
    throw new Error(`Unsupported tool call type: ${toolCall.type}`);
  }

  // Handle arguments - they should be a JSON string in AGUI format,
  // but we need to convert them to an object for API format
  let argumentsObj: any;

  if (typeof toolCall.function.arguments === "string") {
    // Expected case: arguments is a JSON string
    try {
      argumentsObj = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      console.warn(
        `Failed to parse tool call arguments for ${toolCall.function.name}:`,
        error
      );
      // Provide fallback empty object to prevent application crash
      argumentsObj = {};
    }
  } else if (
    typeof toolCall.function.arguments === "object" &&
    toolCall.function.arguments !== null
  ) {
    // Backward compatibility: arguments is already an object
    argumentsObj = toolCall.function.arguments;
  } else {
    // Fallback for undefined, null, or other types
    console.warn(
      `Invalid tool call arguments type for ${toolCall.function.name}:`,
      typeof toolCall.function.arguments
    );
    argumentsObj = {};
  }

  // Always include name and arguments
  return new ActionExecutionMessage({
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: argumentsObj,
    parentMessageId: parentMessageId,
  });
}

/**
 * Converts AGUI tool message to API result message
 */
export function aguiToolMessageToApiResultMessage(
  message: AGUIMessage,
  toolCallNames: Record<string, string>
): ResultMessage {
  if (message.role !== ApiRole.tool) {
    throw new Error(
      `Cannot convert message with role ${message.role} to ResultMessage`
    );
  }

  if (!(message as any).toolCallId) {
    throw new Error("Tool message must have a toolCallId");
  }

  const actionName = toolCallNames[(message as any).toolCallId] || "unknown";

  // Handle result content - it could be a string or an object that needs serialization
  let resultContent: string;
  const messageContent = message.content || "";

  if (typeof messageContent === "string") {
    // Expected case: content is already a string
    resultContent = messageContent;
  } else if (typeof messageContent === "object" && messageContent !== null) {
    // Handle case where content is an object that needs to be serialized
    try {
      resultContent = JSON.stringify(messageContent);
    } catch (error) {
      console.warn(`Failed to stringify tool result for ${actionName}:`, error);
      resultContent = String(messageContent);
    }
  } else {
    // Handle other types (number, boolean, etc.)
    resultContent = String(messageContent);
  }

  return new ResultMessage({
    id: message.id,
    result: resultContent,
    actionExecutionId: (message as any).toolCallId,
    actionName: (message as any).toolName || actionName,
  });
}

/**
 * Converts AGUI message with render function to API format
 */
export function aguiMessageWithRenderToApi(
  message: AGUIMessage,
  actions?: Record<string, any>,
  coAgentStateRenders?: Record<string, any>
): Message[] {
  // Handle the special case: assistant messages with render function but no tool calls
  if (
    message.role === ApiRole.assistant &&
    "generativeUI" in message &&
    (message as any).generativeUI &&
    !(message as any).toolCalls
  ) {
    const apiMessages: Message[] = [];
    apiMessages.push(
      new AgentStateMessage({
        id: message.id,
        agentName: "unknown",
        state: {},
        role: ApiRole.assistant,
      })
    );
    if (coAgentStateRenders) {
      coAgentStateRenders.unknown = {
        name: "unknown",
        render: (message as any).generativeUI,
      };
    }
    return apiMessages;
  }

  // For all other cases, delegate to aguiToApi
  return aguiToApi([message], actions, coAgentStateRenders);
}

/**
 * Converts AGUI message with image to API image message
 */
export function aguiMessageWithImageToMessage(
  message: AGUIMessage
): ImageMessage {
  if (!hasImageProperty(message)) {
    throw new Error(
      `Cannot convert message to ImageMessage: missing format or url`
    );
  }

  let roleValue: (typeof ApiRole)[keyof typeof ApiRole];
  if (message.role === "assistant") {
    roleValue = ApiRole.assistant;
  } else {
    roleValue = ApiRole.user;
  }

  if (message.role !== "assistant" && message.role !== "user") {
    throw new Error(
      `Cannot convert message with role ${message.role} to ImageMessage`
    );
  }

  const image = (message as any).image;

  return new ImageMessage({
    id: message.id,
    name: image.name,
    format: image.format,
    url: image.url,
    role: roleValue,
  });
}

/**
 * Example usage:
 *
 * ```typescript
 * import { aguiToApi } from './agui-to-api';
 *
 * const aguiMessages = [
 *   { id: "1", role: "user", content: "Hello!" },
 *   { id: "2", role: "assistant", content: "Hi there!" }
 * ];
 *
 * const apiMessages = aguiToApi(aguiMessages);
 * // Send to your Node.js API endpoint
 * ```
 */
