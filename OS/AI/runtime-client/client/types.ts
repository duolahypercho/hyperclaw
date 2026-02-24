/**
 * @fileoverview Message types and utilities for the Hypercho AI Runtime Client
 *
 * This module provides professional TypeScript classes and utilities for working with
 * messages in the Hypercho AI system. It's designed to work with the Node.js Hypercho API
 * instead of GraphQL, providing clean interfaces and type safety.
 *
 * Key Features:
 * - Professional message classes with proper validation
 * - Node.js API compatibility (string-based arguments)
 * - Utility functions for common operations
 * - Type-safe message creation and conversion
 * - Comprehensive JSDoc documentation
 *
 * @author Hypercho AI Team
 * @version 1.0.0
 */

import { parseJson, randomId } from "@OS/AI/shared";
import {
  ActionExecutionMessageInput,
  MessageRole,
  MessageStatus,
  ResultMessageInput,
  TextMessageInput,
  BaseMessageOutput,
  AgentStateMessageInput,
  MessageStatusCode,
  ImageMessageInput,
  MessageInput,
} from "@OS/AI/runtime";

type MessageType =
  | "TextMessage"
  | "ActionExecutionMessage"
  | "ResultMessage"
  | "AgentStateMessage"
  | "ImageMessage";

/**
 * Base message class for all message types in the Copanion system.
 * Provides common functionality and type checking methods.
 */
export class Message {
  readonly type: MessageType;
  readonly id: BaseMessageOutput["id"];
  readonly messageId: BaseMessageOutput["messageId"];
  readonly hidden: BaseMessageOutput["hidden"];
  readonly createdAt: BaseMessageOutput["createdAt"];
  readonly status: MessageStatus;

  constructor(props: Partial<Message> & { type: MessageType }) {
    if (!props.type) {
      throw new Error("Message type is required");
    }

    this.type = props.type;
    this.id = props.id ?? randomId();
    this.messageId = props.messageId ?? "";
    this.hidden = props.hidden ?? false;
    this.createdAt = props.createdAt || new Date();
    this.status = props.status || { code: MessageStatusCode.Pending };
  }

  isTextMessage(): this is TextMessage {
    return this.type === "TextMessage";
  }

  isActionExecutionMessage(): this is ActionExecutionMessage {
    return this.type === "ActionExecutionMessage";
  }

  isResultMessage(): this is ResultMessage {
    return this.type === "ResultMessage";
  }

  isAgentStateMessage(): this is AgentStateMessage {
    return this.type === "AgentStateMessage";
  }

  isImageMessage(): this is ImageMessage {
    return this.type === "ImageMessage";
  }
}

// alias Role to MessageRole
export const Role = MessageRole;

/**
 * Represents a text message in the conversation.
 * Used for user messages, assistant responses, and system messages.
 */

// when constructing any message, the base fields are optional
type MessageConstructorOptions = Partial<Message>;

type TextMessageConstructorOptions = MessageConstructorOptions &
  TextMessageInput;
export class TextMessage
  extends Message
  implements TextMessageConstructorOptions
{
  readonly role: TextMessageInput["role"];
  readonly content: TextMessageInput["content"];
  readonly parentMessageId?: TextMessageInput["parentMessageId"];

  constructor(props: TextMessageConstructorOptions) {
    super({ ...props, type: "TextMessage" });
    this.role = props.role;
    this.content = props.content;
    this.parentMessageId = props.parentMessageId;
  }
}

/**
 * Represents an action execution message.
 * Used when the AI assistant needs to execute a specific action or function.
 */

type ActionExecutionMessageConstructorOptions = MessageConstructorOptions &
  Omit<ActionExecutionMessageInput, "arguments"> & {
    arguments: Record<string, any>;
  };

export class ActionExecutionMessage
  extends Message
  implements Omit<ActionExecutionMessageInput, "arguments" | "scope">
{
  readonly name: ActionExecutionMessageInput["name"];
  readonly arguments: Record<string, any>;
  readonly parentMessageId?: ActionExecutionMessageInput["parentMessageId"];
  readonly expired?: ActionExecutionMessageInput["expired"];

  constructor(props: ActionExecutionMessageConstructorOptions) {
    super({ ...props, type: "ActionExecutionMessage" });
    this.name = props.name;
    this.arguments = props.arguments;
    this.parentMessageId = props.parentMessageId;
    this.expired = props.expired;
  }

  /**
   * Gets the arguments as a JSON string (for Node.js API compatibility)
   */
  getArgumentsAsString(): string {
    if (typeof this.arguments === "string") {
      return this.arguments;
    }
    return JSON.stringify(this.arguments);
  }

  /**
   * Gets the arguments as a parsed object
   */
  getArgumentsAsObject(): Record<string, any> {
    if (typeof this.arguments === "object") {
      return this.arguments;
    }
    try {
      return JSON.parse(this.arguments);
    } catch {
      return {};
    }
  }
}

type ResultMessageConstructorOptions = MessageConstructorOptions &
  ResultMessageInput;

/**
 * Represents the result of an action execution.
 * Contains the output or result data from a previously executed action.
 */
export class ResultMessage
  extends Message
  implements ResultMessageConstructorOptions
{
  readonly actionExecutionId: ResultMessageInput["actionExecutionId"];
  readonly actionName: ResultMessageInput["actionName"];
  readonly result: ResultMessageInput["result"];
  readonly parentMessageId?: ResultMessageInput["parentMessageId"];

  constructor(props: ResultMessageConstructorOptions) {
    super({ ...props, type: "ResultMessage" });
    this.actionExecutionId = props.actionExecutionId;
    this.actionName = props.actionName;
    this.result = props.result;
    this.parentMessageId = props.parentMessageId;
  }

  /**
   * Decodes a JSON string result into a JavaScript object.
   * @param result - The JSON string to decode
   * @returns The decoded object or the original string if parsing fails
   */
  static decodeResult(result: string): any {
    return parseJson(result, result);
  }

  /**
   * Encodes a JavaScript value into a JSON string.
   * @param result - The value to encode
   * @returns The JSON string representation
   */
  static encodeResult(result: any): string {
    if (result === undefined) {
      return "";
    } else if (typeof result === "string") {
      return result;
    } else {
      return JSON.stringify(result);
    }
  }
}

/**
 * Represents the state of an AI agent during execution.
 * Used for tracking agent progress, state changes, and execution context.
 */
export class AgentStateMessage
  extends Message
  implements Omit<AgentStateMessageInput, "state">
{
  agentName: AgentStateMessageInput["agentName"];
  state: any;
  running: AgentStateMessageInput["running"];
  threadId: AgentStateMessageInput["threadId"];
  role: AgentStateMessageInput["role"];
  nodeName: AgentStateMessageInput["nodeName"];
  runId: AgentStateMessageInput["runId"];
  active: AgentStateMessageInput["active"];

  constructor(props: any) {
    super({ ...props, type: "AgentStateMessage" });
    this.agentName = props.agentName;
    this.threadId = props.threadId;
    this.state = props.state;
    this.running = props.running || false;
    this.role = props.role || MessageRole.assistant;
    this.nodeName = props.nodeName || "default";
    this.runId = props.runId || "";
    this.active = props.active || false;
  }
}

/**
 * Represents an image message in the conversation.
 * Used for handling image data and visual content in AI interactions.
 */

type ImageMessageConstructorOptions = MessageConstructorOptions &
  ImageMessageInput;

export class ImageMessage
  extends Message
  implements ImageMessageConstructorOptions
{
  readonly name: ImageMessageInput["name"];
  readonly format: ImageMessageInput["format"];
  readonly url: ImageMessageInput["url"];
  readonly role: ImageMessageInput["role"];
  readonly parentMessageId: ImageMessageInput["parentMessageId"];

  constructor(props: ImageMessageConstructorOptions) {
    super({ ...props, type: "ImageMessage" });
    this.format = props.format;
    this.name = props.name;
    this.url = props.url;
    this.role = props.role;
    this.parentMessageId = props.parentMessageId;
  }
}

/**
 * Creates a meta event for agent execution control in the Hypercho API.
 * @param eventType - The type of meta event
 * @param data - The event data
 * @returns A properly formatted meta event
 */
export function createMetaEvent(eventType: string, data: any) {
  return {
    type: "MetaEvent",
    eventType,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Meta event types for the Hypercho API
 */
export enum MetaEventType {
  AgentStateChange = "AgentStateChange",
  ExecutionInterrupt = "ExecutionInterrupt",
  CustomEvent = "CustomEvent",
}

/**
 * Meta event interface for the Hypercho API
 */
export interface MetaEvent {
  type: "MetaEvent";
  eventType: string;
  data: any;
  timestamp: string;
}
