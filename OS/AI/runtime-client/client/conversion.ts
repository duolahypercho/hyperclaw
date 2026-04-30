/**
 * @fileoverview Message conversion utilities for the Hypercho AI Runtime Client
 *
 * This module provides conversion functions between different message formats,
 * supporting the Node.js Hypercho API with proper TypeScript types.
 *
 * @author Hypercho AI Team
 * @version 1.0.0
 */

import { MessageStatusCode, MessageRole, MessageStatus } from "@OS/AI/runtime/";
import {
  ActionExecutionMessage,
  AgentStateMessage,
  Message,
  ResultMessage,
  TextMessage,
  ImageMessage,
} from "./types";
import {
  MessageInput,
  TextMessageInput,
  ActionExecutionMessageInput,
  ResultMessageInput,
  AgentStateMessageInput,
  ImageMessageInput,
} from "@OS/AI/runtime/backend/inputs/message.input";

import untruncateJson from "untruncate-json";
import { parseJson } from "@OS/AI/shared";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts API status format to MessageStatus format
 */
function convertApiStatusToMessageStatus(apiStatus?: {
  code: MessageStatusCode;
  reason?: string;
  details?: string;
}): MessageStatus {
  if (!apiStatus) {
    return { code: MessageStatusCode.Success };
  }

  // Return the appropriate status object based on the code
  switch (apiStatus.code) {
    case MessageStatusCode.Pending:
      return { code: MessageStatusCode.Pending };
    case MessageStatusCode.Success:
      return { code: MessageStatusCode.Success };
    case MessageStatusCode.Failed:
      return {
        code: MessageStatusCode.Failed,
        reason: apiStatus.reason || "Unknown error",
      };
    default:
      return { code: MessageStatusCode.Success };
  }
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * API response format for conversations
 */
export interface ApiConversationResponse {
  messages: MessageInput[];
  metadata: {
    totalMessages: number;
    lastUpdated: string;
    messageTypes: Record<string, number>;
  };
}

/**
 * API validation result
 */
export interface ApiValidationResult {
  valid: boolean;
  errors: string[];
}

export function filterAgentStateMessages(messages: Message[]): Message[] {
  return messages.filter((message) => !message.isAgentStateMessage());
}

/**
 * Converts messages to the MessageInput format for the Hypercho API.
 * This is the main conversion function that sends data to the backend.
 */
export function convertMessagesToApiFormat(
  messages: Message[]
): MessageInput[] {
  return messages.map((message) => {
    const base = {
      _id: message.id,
      createdAt:
        message.createdAt instanceof Date
          ? message.createdAt
          : new Date(message.createdAt),
      messageId: message.messageId,
    };

    if (message.isTextMessage()) {
      return {
        ...base,
        textMessage: {
          content: message.content,
          role: message.role,
          parentMessageId: message.parentMessageId,
        },
      };
    }

    if (message.isActionExecutionMessage()) {
      return {
        ...base,
        actionExecutionMessage: {
          name: message.name,
          arguments: message.getArgumentsAsString(),
          parentMessageId: message.parentMessageId,
        },
      };
    }

    if (message.isResultMessage()) {
      return {
        ...base,
        resultMessage: {
          actionExecutionId: message.actionExecutionId,
          actionName: message.actionName,
          result: message.result,
          parentMessageId: message.parentMessageId,
        },
      };
    }

    if (message.isAgentStateMessage()) {
      return {
        ...base,
        agentStateMessage: {
          threadId: message.threadId,
          agentName: message.agentName,
          role: message.role || MessageRole.assistant,
          state: JSON.stringify(message.state),
          running: message.running || false,
          nodeName: message.nodeName || "default",
          runId: message.runId || "",
          active: message.active || false,
        },
      };
    }

    if (message.isImageMessage()) {
      return {
        ...base,
        imageMessage: {
          name: message.name,
          format: message.format,
          url: message.url,
          role: message.role,
          parentMessageId: message.parentMessageId,
        },
      };
    }

    throw new Error(`Unknown message type: ${message.type}`);
  });
}

/**
 * Filters adjacent agent state messages to avoid duplicates.
 * This function works with the MessageInput format.
 */
export function filterAdjacentAgentStateMessages(
  messages: MessageInput[]
): MessageInput[] {
  const filteredMessages: MessageInput[] = [];

  messages.forEach((message, i) => {
    // keep all other message types
    if (!message.agentStateMessage) {
      filteredMessages.push(message);
    } else {
      const agentStateMessage = message.agentStateMessage;
      const prevAgentStateMessageIndex = filteredMessages.findIndex(
        (m) =>
          m.agentStateMessage &&
          m.agentStateMessage.agentName === agentStateMessage.agentName
      );
      if (prevAgentStateMessageIndex === -1) {
        filteredMessages.push(message);
      } else {
        filteredMessages[prevAgentStateMessageIndex] = message;
      }
    }
  });

  return filteredMessages;
}

/**
 * Converts MessageInput messages to Message objects.
 * This is the recommended function for new implementations.
 */
export function convertApiOutputToMessages(messages: any): Message[] {
  return messages.map((message: any) => {
    if (message.__typename === "TextMessageOutput") {
      return new TextMessage({
        id: message.id,
        role: message.role,
        content: Array.isArray(message.content)
          ? message.content.join("")
          : message.content || "",
        parentMessageId: message.parentMessageId,
        createdAt: new Date(),
        messageId: message.messageId,
        status: message.status || { code: MessageStatusCode.Pending },
      });
    } else if (message.__typename === "ActionExecutionMessageOutput") {
      return new ActionExecutionMessage({
        id: message.id,
        name: message.name,
        arguments: getPartialArguments(message.arguments),
        parentMessageId: message.parentMessageId,
        createdAt: new Date(),
        messageId: message.messageId,
        status: message.status || { code: MessageStatusCode.Pending },
      });
    } else if (message.__typename === "ResultMessageOutput") {
      return new ResultMessage({
        id: message.id,
        result: message.result,
        actionExecutionId: message.actionExecutionId,
        actionName: message.actionName,
        createdAt: new Date(),
        messageId: message.messageId,
        status: message.status || { code: MessageStatusCode.Pending },
      });
    } else if (message.__typename === "AgentStateMessageOutput") {
      return new AgentStateMessage({
        id: message.id,
        threadId: message.threadId,
        role: message.role,
        agentName: message.agentName,
        nodeName: message.nodeName,
        runId: message.runId,
        active: message.active,
        running: message.running,
        state: parseJson(message.state, {}),
        createdAt: new Date(),
        messageId: message.messageId,
      });
    } else if (message.__typename === "ImageMessageOutput") {
      return new ImageMessage({
        id: message.id,
        name: message.name,
        format: message.format,
        url: message.url,
        role: message.role,
        parentMessageId: message.parentMessageId,
        createdAt: new Date(),
        messageId: message.messageId,
        status: message.status || { code: MessageStatusCode.Pending },
      });
    }

    throw new Error("Unknown message type");
  });
}

/**
 * Loads messages from a JSON representation.
 * Supports both legacy and new API formats.
 */
export function loadMessagesFromJsonRepresentation(json: any[]): Message[] {
  const result: Message[] = [];
  for (const item of json) {
    const baseProps = {
      id: item._id,
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      status: item.status || { code: MessageStatusCode.Success },
      messageId: item.messageId,
      hidden: item.hidden,
    };

    // Check for explicit type field first (new API format)
    if (item.type) {
      switch (item.type) {
        case "TextMessage":
          result.push(
            new TextMessage({
              ...baseProps,
              role: item.role,
              content: item.content,
              parentMessageId: item.parentMessageId,
            })
          );
          break;
        case "ActionExecutionMessage":
          result.push(
            new ActionExecutionMessage({
              ...baseProps,
              name: item.name,
              arguments: item.arguments,
              parentMessageId: item.parentMessageId,
              expired: item.expired,
            })
          );
          break;
        case "ResultMessage":
          result.push(
            new ResultMessage({
              ...baseProps,
              actionExecutionId: item.actionExecutionId,
              actionName: item.actionName,
              result: item.result,
              parentMessageId: item.parentMessageId,
            })
          );
          break;
        case "AgentStateMessage":
          result.push(
            new AgentStateMessage({
              ...baseProps,
              threadId: item.threadId,
              role: item.role,
              agentName: item.agentName,
              nodeName: item.nodeName,
              runId: item.runId,
              active: item.active,
              running: item.running,
              state: item.state,
            })
          );
          break;
        case "ImageMessage":
          result.push(
            new ImageMessage({
              ...baseProps,
              name: item.name,
              format: item.format,
              url: item.url,
              role: item.role,
              parentMessageId: item.parentMessageId,
            })
          );
          break;
      }
    } else {
      // Legacy format detection
      if ("content" in item) {
        result.push(
          new TextMessage({
            ...baseProps,
            role: item.role,
            content: item.content,
            parentMessageId: item.parentMessageId,
          })
        );
      } else if ("arguments" in item) {
        result.push(
          new ActionExecutionMessage({
            ...baseProps,
            name: item.name,
            arguments: item.arguments,
            parentMessageId: item.parentMessageId,
          })
        );
      } else if ("result" in item) {
        result.push(
          new ResultMessage({
            ...baseProps,
            actionExecutionId: item.actionExecutionId,
            actionName: item.actionName,
            result: item.result,
            parentMessageId: item.parentMessageId,
          })
        );
      } else if ("state" in item) {
        result.push(
          new AgentStateMessage({
            ...baseProps,
            threadId: item.threadId,
            role: item.role,
            agentName: item.agentName,
            nodeName: item.nodeName,
            runId: item.runId,
            active: item.active,
            running: item.running,
            state: item.state,
          })
        );
      } else if ("format" in item && "bytes" in item) {
        result.push(
          new ImageMessage({
            ...baseProps,
            format: item.format,
            name: item.name,
            url: item.url,
            role: item.role,
            parentMessageId: item.parentMessageId,
          })
        );
      } else if ("textMessage" in item) {
        result.push(
          new TextMessage({
            ...baseProps,
            role: item.textMessage.role,
            content: item.textMessage.content,
            parentMessageId: item.textMessage.parentMessageId,
          })
        );
      } else if ("actionExecutionMessage" in item) {
        result.push(
          new ActionExecutionMessage({
            ...baseProps,
            name: item.actionExecutionMessage.name,
            arguments: item.actionExecutionMessage.arguments,
            parentMessageId: item.actionExecutionMessage.parentMessageId,
            expired: item.actionExecutionMessage.expired,
          })
        );
      } else if ("resultMessage" in item) {
        result.push(
          new ResultMessage({
            ...baseProps,
            actionExecutionId: item.resultMessage.actionExecutionId,
            actionName: item.resultMessage.actionName,
            result: item.resultMessage.result,
            parentMessageId: item.resultMessage.parentMessageId,
          })
        );
      } else if ("agentStateMessage" in item) {
        result.push(
          new AgentStateMessage({
            ...baseProps,
            threadId: item.agentStateMessage.threadId,
            role: item.agentStateMessage.role,
            parentMessageId: item.agentStateMessage.parentMessageId,
          })
        );
      } else if ("imageMessage" in item) {
        result.push(
          new ImageMessage({
            ...baseProps,
            format: item.imageMessage.format,
            name: item.imageMessage.name,
            url: item.imageMessage.url,
            role: item.imageMessage.role,
            parentMessageId: item.imageMessage.parentMessageId,
          })
        );
      }
    }
  }
  return result;
}

/**
 * Utility functions for working with the Hypercho API
 */
export class ConversionUtils {
  /**
   * Prepares messages for sending to the Hypercho API
   */
  static prepareForApi(messages: Message[]): MessageInput[] {
    return convertMessagesToApiFormat(messages);
  }

  /**
   * Processes messages received from the Hypercho API
   */
  static processFromApi(apiMessages: MessageInput[]): Message[] {
    return convertApiOutputToMessages(apiMessages);
  }

  /**
   * Converts a conversation to API format for storage or transmission
   */
  static conversationToApiFormat(messages: Message[]): ApiConversationResponse {
    const apiMessages = convertMessagesToApiFormat(messages);
    const messageTypes = messages.reduce((acc, msg) => {
      acc[msg.type] = (acc[msg.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      messages: apiMessages,
      metadata: {
        totalMessages: messages.length,
        lastUpdated: new Date().toISOString(),
        messageTypes,
      },
    };
  }

  /**
   * Validates that messages are properly formatted for the API
   */
  static validateApiFormat(messages: MessageInput[]): ApiValidationResult {
    const errors: string[] = [];

    messages.forEach((msg, index) => {
      if (!msg._id) {
        errors.push(`Message ${index}: Missing _id field`);
      }
      if (!msg.createdAt) {
        errors.push(`Message ${index}: Missing createdAt field`);
      }

      // Check that exactly one message type is present
      const messageTypes = [
        msg.textMessage,
        msg.actionExecutionMessage,
        msg.resultMessage,
        msg.agentStateMessage,
        msg.imageMessage,
      ].filter(Boolean);

      if (messageTypes.length === 0) {
        errors.push(`Message ${index}: No message type specified`);
      } else if (messageTypes.length > 1) {
        errors.push(`Message ${index}: Multiple message types specified`);
      }

      // Type-specific validation
      if (msg.textMessage) {
        if (!msg.textMessage.content)
          errors.push(`Message ${index}: TextMessage missing content`);
        if (!msg.textMessage.role)
          errors.push(`Message ${index}: TextMessage missing role`);
      }

      if (msg.actionExecutionMessage) {
        if (!msg.actionExecutionMessage.name)
          errors.push(`Message ${index}: ActionExecutionMessage missing name`);
        if (!msg.actionExecutionMessage.arguments)
          errors.push(
            `Message ${index}: ActionExecutionMessage missing arguments`
          );
      }

      if (msg.resultMessage) {
        if (!msg.resultMessage.actionExecutionId)
          errors.push(
            `Message ${index}: ResultMessage missing actionExecutionId`
          );
        if (!msg.resultMessage.actionName)
          errors.push(`Message ${index}: ResultMessage missing actionName`);
      }

      if (msg.agentStateMessage) {
        if (!msg.agentStateMessage.agentName)
          errors.push(`Message ${index}: AgentStateMessage missing agentName`);
        if (!msg.agentStateMessage.threadId)
          errors.push(`Message ${index}: AgentStateMessage missing threadId`);
      }

      if (msg.imageMessage) {
        if (!msg.imageMessage.format)
          errors.push(`Message ${index}: ImageMessage missing format`);
        if (!msg.imageMessage.url)
          errors.push(`Message ${index}: ImageMessage missing url`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

function getPartialArguments(args: string | string[]) {
  try {
    // Handle both string and array inputs
    const argsString = Array.isArray(args) ? args.join("") : args;

    if (!argsString || argsString.trim() === "") return {};

    // Try to parse the JSON directly first (for complete JSON from backend)
    try {
      return JSON.parse(argsString);
    } catch (directParseError) {
      // If direct parsing fails, try with untruncate-json (for streaming chunks)
      return JSON.parse(untruncateJson(argsString));
    }
  } catch (e) {
    console.warn("Failed to parse action arguments:", args, e);
    return {};
  }
}
