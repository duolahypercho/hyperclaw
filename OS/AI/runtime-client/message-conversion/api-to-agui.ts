/**
 * @fileoverview API to AGUI message conversion utilities
 *
 * This module provides conversion functions from the Node.js API message format
 * to AGUI (AI-GUI) message format used by the Hypercho AI system.
 *
 * @author Hypercho AI Team
 * @version 1.0.0
 */

import { Message } from "@OS/AI/shared";
import {
  TextMessage,
  ActionExecutionMessage,
  ResultMessage,
  AgentStateMessage,
  ImageMessage,
  Role as ApiRole,
  Message as APIMessage,
} from "../client/types";
import agui from "@ag-ui/core";
import { MessageStatusCode } from "@OS/AI/runtime";

// Define valid image formats based on the supported formats in the codebase
const VALID_IMAGE_FORMATS = ["jpeg", "png", "webp", "gif"] as const;
type ValidImageFormat = (typeof VALID_IMAGE_FORMATS)[number];

// Validation function for image format
function validateImageFormat(format: string): format is ValidImageFormat {
  return VALID_IMAGE_FORMATS.includes(format as ValidImageFormat);
}

/**
 * Normalizes MongoDB-style messages to the expected API message format
 * Handles messages that have nested structures like { textMessage: { content, role } }
 */
function normalizeMessage(message: any): any {
  // If it's already a proper message object with type checking methods, return as is
  if (
    message.isTextMessage ||
    message.isActionExecutionMessage ||
    message.isResultMessage ||
    message.isAgentStateMessage ||
    message.isImageMessage
  ) {
    return message;
  }

  // Handle MongoDB-style message format
  if (message.textMessage) {
    return {
      id: message._id,
      createdAt: message.createdAt,
      type: "TextMessage",
      role: message.textMessage.role,
      content: message.textMessage.content,
      parentMessageId: message.textMessage.parentMessageId,
      messageId: message.messageId,
      isTextMessage: () => true,
      isActionExecutionMessage: () => false,
      isResultMessage: () => false,
      isAgentStateMessage: () => false,
      isImageMessage: () => false,
    };
  }

  if (message.actionExecutionMessage) {
    return {
      id: message._id,
      createdAt: message.createdAt,
      type: "ActionExecutionMessage",
      name: message.actionExecutionMessage.name,
      arguments: message.actionExecutionMessage.arguments,
      parentMessageId: message.actionExecutionMessage.parentMessageId,
      messageId: message.messageId,
      status:
        message.actionExecutionMessage.status?.code ||
        MessageStatusCode.Pending,
      getArgumentsAsString: () => {
        const args = message.actionExecutionMessage.arguments;
        return typeof args === "string" ? args : JSON.stringify(args);
      },
      getArgumentsAsObject: () => {
        const args = message.actionExecutionMessage.arguments;
        return typeof args === "object" ? args : JSON.parse(args || "{}");
      },
      isTextMessage: () => false,
      isActionExecutionMessage: () => true,
      isResultMessage: () => false,
      isAgentStateMessage: () => false,
      isImageMessage: () => false,
    };
  }

  if (message.resultMessage) {
    return {
      id: message._id,
      createdAt: message.createdAt,
      type: "ResultMessage",
      actionExecutionId: message.resultMessage.actionExecutionId,
      actionName: message.resultMessage.actionName,
      result: message.resultMessage.result,
      parentMessageId: message.resultMessage.parentMessageId,
      messageId: message.messageId,
      isTextMessage: () => false,
      isActionExecutionMessage: () => false,
      isResultMessage: () => true,
      isAgentStateMessage: () => false,
      isImageMessage: () => false,
    };
  }

  if (message.agentStateMessage) {
    return {
      id: message._id,
      createdAt: message.createdAt,
      type: "AgentStateMessage",
      agentName: message.agentStateMessage.agentName,
      state: message.agentStateMessage.state,
      running: message.agentStateMessage.running,
      threadId: message.agentStateMessage.threadId,
      role: message.agentStateMessage.role,
      nodeName: message.agentStateMessage.nodeName,
      runId: message.agentStateMessage.runId,
      active: message.agentStateMessage.active,
      messageId: message.messageId,
      isTextMessage: () => false,
      isActionExecutionMessage: () => false,
      isResultMessage: () => false,
      isAgentStateMessage: () => true,
      isImageMessage: () => false,
    };
  }

  if (message.imageMessage) {
    return {
      id: message._id,
      createdAt: message.createdAt,
      type: "ImageMessage",
      format: message.imageMessage.format,
      url: message.imageMessage.url,
      role: message.imageMessage.role,
      parentMessageId: message.imageMessage.parentMessageId,
      messageId: message.messageId,
      isTextMessage: () => false,
      isActionExecutionMessage: () => false,
      isResultMessage: () => false,
      isAgentStateMessage: () => false,
      isImageMessage: () => true,
    };
  }

  // If it's already in the expected format, return as is
  return message;
}

/**
 * Converts API messages to AGUI message format
 *
 * @param messages - API messages to convert (can be MongoDB-style or direct message objects)
 * @param actions - Optional actions context for preserving render functions
 * @param coAgentStateRenders - Optional co-agent state renders context
 * @returns Array of AGUI message objects
 */
export function apiToAgui(
  messages: APIMessage[] | APIMessage | any[] | any,
  actions?: Record<string, any>,
  coAgentStateRenders?: Record<string, any>
): Message[] {
  let aguiMessages: Message[] = [];
  messages = Array.isArray(messages) ? messages : [messages];
  // Create a map of action execution ID to result for completed actions
  const actionResults = new Map<string, string>();
  for (const message of messages) {
    if (message.isResultMessage && message.isResultMessage()) {
      actionResults.set(message.actionExecutionId, message.result);
    }
  }

  for (const message of messages) {
    // Handle MongoDB-style message format

    const normalizedMessage = normalizeMessage(message);

    if (normalizedMessage.isTextMessage && normalizedMessage.isTextMessage()) {
      aguiMessages.push(apiTextMessageToAguiMessage(normalizedMessage));
    } else if (
      normalizedMessage.isResultMessage &&
      normalizedMessage.isResultMessage()
    ) {
      aguiMessages.push(apiResultMessageToAguiMessage(normalizedMessage));
    } else if (
      normalizedMessage.isActionExecutionMessage &&
      normalizedMessage.isActionExecutionMessage()
    ) {
      aguiMessages.push(
        apiActionExecutionMessageToAguiMessage(
          normalizedMessage,
          actions,
          actionResults,
          messages // Pass all messages so render wrapper can access latest status
        )
      );
    } else if (
      normalizedMessage.isAgentStateMessage &&
      normalizedMessage.isAgentStateMessage()
    ) {
      aguiMessages.push(
        apiAgentStateMessageToAguiMessage(
          normalizedMessage,
          coAgentStateRenders
        )
      );
    } else if (
      normalizedMessage.isImageMessage &&
      normalizedMessage.isImageMessage()
    ) {
      aguiMessages.push(apiImageMessageToAguiMessage(normalizedMessage));
    } else {
      throw new Error("Unknown message type");
    }
  }

  return aguiMessages;
}

/**
 * Calculates the status and action result for an action execution message
 * This is extracted to avoid duplication between initial calculation and render wrapper
 */
function calculateActionStatus(
  message: ActionExecutionMessage,
  actionResults?: Map<string, string>
): {
  actionResult: any;
  status: "inProgress" | "executing" | "complete" | "expired";
} {
  const actionResult = actionResults?.get(message.id);
  let status: "inProgress" | "executing" | "complete" | "expired" =
    "inProgress";

  if (actionResult !== undefined) {
    status = "complete";
  } else if (message.expired === true) {
    status = "expired";
  } else if (
    message.status &&
    message.status.code === MessageStatusCode.Success
  ) {
    status = "executing";
  }

  return { actionResult, status };
}

/**
 * Converts API action execution message to AGUI message
 */
export function apiActionExecutionMessageToAguiMessage(
  message: ActionExecutionMessage,
  actions?: Record<string, any>,
  actionResults?: Map<string, string>,
  allMessages?: APIMessage[] // Add allMessages parameter to access latest status
): Message {
  // Check if we have actions and if there's a specific action or wild card action
  const hasSpecificAction =
    actions &&
    Object.values(actions).some((action: any) => action.name === message.name);
  const hasWildcardAction =
    actions &&
    Object.values(actions).some((action: any) => action.name === "*");

  if (!actions || (!hasSpecificAction && !hasWildcardAction)) {
    return {
      id: message.id,
      role: "assistant",
      toolCalls: [actionExecutionMessageToAguiMessage(message)],
      name: message.name,
      expired: message.expired,
      messageId: message.messageId,
      status: message.status?.code || MessageStatusCode.Pending,
    };
  }

  // Find the specific action first, then fall back to wild card action
  const action =
    Object.values(actions).find(
      (action: any) => action.name === message.name
    ) || Object.values(actions).find((action: any) => action.name === "*");

  // Create render function wrapper that provides proper props
  const createRenderWrapper = (originalRender: any) => {
    if (!originalRender) return undefined;

    return (props?: any) => {
      // Get the latest message from allMessages if available to ensure we have the most recent status
      let latestMessage = message;
      if (allMessages) {
        const foundMessage = allMessages.find(
          (msg: any) =>
            (msg.id === message.id || msg.messageId === message.messageId) &&
            (msg.isActionExecutionMessage?.() || msg.actionExecutionMessage)
        );
        if (foundMessage) {
          const normalized = normalizeMessage(foundMessage);
          latestMessage = normalized as ActionExecutionMessage;
        }
      }

      // Recalculate status/result when render is called using the latest message
      // Also rebuild actionResults from allMessages to get the most recent results
      let latestActionResults = actionResults;
      if (allMessages) {
        const freshActionResults = new Map<string, string>();
        for (const msg of allMessages) {
          const normalized = normalizeMessage(msg);
          if (normalized.isResultMessage && normalized.isResultMessage()) {
            freshActionResults.set(
              normalized.actionExecutionId,
              normalized.result
            );
          }
        }
        latestActionResults = freshActionResults;
      }

      const { actionResult, status } = calculateActionStatus(
        latestMessage,
        latestActionResults
      );

      // if props.result is a string, parse it as JSON but don't throw an error if it's not valid JSON
      if (typeof props?.result === "string") {
        try {
          props.result = JSON.parse(props.result);
        } catch (e) {
          /* do nothing */
        }
      }

      // if actionResult is a string, parse it as JSON but don't throw an error if it's not valid JSON
      let parsedActionResult = actionResult;
      if (typeof actionResult === "string") {
        try {
          parsedActionResult = JSON.parse(actionResult);
        } catch (e) {
          /* do nothing */
        }
      }

      // Extract args from latest message
      const extractedArgs = latestMessage.getArgumentsAsObject
        ? latestMessage.getArgumentsAsObject()
        : (latestMessage as any).arguments || {};

      // Base props that all actions receive
      const baseProps = {
        status: props?.status || status,
        args: extractedArgs,
        result: props?.result || parsedActionResult || undefined,
        messageId: latestMessage.messageId || latestMessage.id,
      };

      // Add properties based on action type
      if (action.name === "*") {
        // Wildcard actions get the tool name; ensure it cannot be overridden by incoming props
        return originalRender({
          ...baseProps,
          ...props,
          name: latestMessage.name,
        });
      } else {
        // Regular actions get respond (defaulting to a no-op if not provided)
        const respond = props?.respond ?? (() => {});
        return originalRender({
          ...baseProps,
          ...props,
          respond,
        });
      }
    };
  };

  return {
    id: message.id,
    role: "assistant",
    messageId: message.messageId,
    content: "",
    toolCalls: [actionExecutionMessageToAguiMessage(message)],
    generativeUI: createRenderWrapper(action.render),
    name: message.name,
    expired: message.expired,
  } as any;
}

/**
 * Converts API agent state message to AGUI message
 */
function apiAgentStateMessageToAguiMessage(
  message: AgentStateMessage,
  coAgentStateRenders?: Record<string, any>
): Message {
  if (
    coAgentStateRenders &&
    Object.values(coAgentStateRenders).some(
      (render: any) => render.name === message.agentName
    )
  ) {
    const render = Object.values(coAgentStateRenders).find(
      (render: any) => render.name === message.agentName
    );

    // Create render function wrapper that provides proper props
    const createRenderWrapper = (originalRender: any) => {
      if (!originalRender) return undefined;

      return (props?: any) => {
        // Determine the correct status based on the same logic as RenderActionExecutionMessage
        const state = message.state;

        // Provide the full props structure that the render function expects
        const renderProps = {
          state: state,
        };

        return originalRender(renderProps);
      };
    };

    return {
      id: message.id,
      role: "assistant",
      generativeUI: createRenderWrapper(render.render),
      agentName: message.agentName,
      state: message.state,
    };
  }

  return {
    id: message.id,
    role: "assistant",
    agentName: message.agentName,
    state: message.state,
  };
}

/**
 * Converts API action execution message to AGUI tool call
 */
function actionExecutionMessageToAguiMessage(
  actionExecutionMessage: ActionExecutionMessage
): agui.ToolCall {
  return {
    id: actionExecutionMessage.messageId,
    function: {
      name: actionExecutionMessage.name,
      arguments: actionExecutionMessage.getArgumentsAsString
        ? actionExecutionMessage.getArgumentsAsString()
        : JSON.stringify((actionExecutionMessage as any).arguments || {}),
    },
    type: "function",
  };
}

/**
 * Converts API text message to AGUI message
 */
export function apiTextMessageToAguiMessage(message: TextMessage): Message {
  switch (message.role) {
    case ApiRole.developer:
      return {
        id: message.id,
        role: "developer",
        content: message.content,
      };
    case ApiRole.system:
      return {
        id: message.id,
        role: "system",
        content: message.content,
      };
    case ApiRole.assistant:
      return {
        id: message.id,
        role: "assistant",
        content: message.content,
        messageId: message.messageId,
        status: message.status.code,
      };
    case ApiRole.user:
      return {
        id: message.id,
        role: "user",
        content: message.content,
      };
    default:
      throw new Error("Unknown message role");
  }
}

/**
 * Converts API result message to AGUI message
 */
export function apiResultMessageToAguiMessage(message: ResultMessage): Message {
  return {
    id: message.id,
    role: "tool",
    content: message.result,
    toolCallId: message.actionExecutionId,
    toolName: message.actionName,
  };
}

/**
 * Converts API image message to AGUI message
 */
export function apiImageMessageToAguiMessage(message: ImageMessage): Message {
  // Validate that url is a non-empty string
  if (
    !message.url ||
    typeof message.url !== "string" ||
    message.url.trim() === ""
  ) {
    throw new Error("Image url must be a non-empty string");
  }

  // Determine the role based on the message role
  const role = message.role === ApiRole.assistant ? "assistant" : "user";

  // Create the image message with proper typing
  const imageMessage: Message = {
    id: message.id,
    role,
    content: "",
    image: {
      name: message.name,
      format: message.format,
      url: message.url,
    },
  };

  return imageMessage;
}

/**
 * Example usage:
 *
 * ```typescript
 * import { apiToAgui } from './api-to-agui';
 *
 * const apiMessages = [
 *   new TextMessage({ role: ApiRole.user, content: "Hello!" }),
 *   new TextMessage({ role: ApiRole.assistant, content: "Hi there!" })
 * ];
 *
 * const aguiMessages = apiToAgui(apiMessages);
 * // Use AGUI messages in your UI components
 * ```
 */
