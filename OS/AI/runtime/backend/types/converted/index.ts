import {
  ActionExecutionMessageInput,
  ResultMessageInput,
  TextMessageInput,
  AgentStateMessageInput,
  ImageMessageInput,
} from "../../inputs/message.input";
import { BaseMessageInput } from "../base";
import { MessageRole } from "../../enums";

export type MessageType =
  | "TextMessage"
  | "ActionExecutionMessage"
  | "ResultMessage"
  | "AgentStateMessage"
  | "ImageMessage";

export abstract class Message implements BaseMessageInput {
  readonly _id: string;
  readonly messageId: string;
  readonly createdAt: Date;
  type: MessageType;

  protected constructor(
    params: Partial<BaseMessageInput> & { type: MessageType }
  ) {
    this._id = params._id ?? Message.generateId();
    this.messageId = params.messageId ?? "";
    this.createdAt = params.createdAt ?? new Date();
    this.type = params.type;
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

export class TextMessage extends Message implements TextMessageInput {
  type: MessageType = "TextMessage";
  content: string;
  role: MessageRole;
  parentMessageId?: string;

  constructor(params: Partial<BaseMessageInput> & TextMessageInput) {
    super({
      _id: params._id,
      createdAt: params.createdAt,
      type: "TextMessage",
    });
    this.content = params.content;
    this.role = params.role;
    this.parentMessageId = params.parentMessageId;
  }
}

export class ActionExecutionMessage
  extends Message
  implements Omit<ActionExecutionMessageInput, "arguments" | "scope">
{
  type: MessageType = "ActionExecutionMessage";
  name: string;
  arguments: Record<string, unknown>;
  parentMessageId?: string;

  static parseArguments(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object")
      return value as Record<string, unknown>;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  constructor(
    params: Partial<BaseMessageInput> & {
      name: string;
      arguments: unknown; // accepts already-parsed object or JSON string
      parentMessageId?: string;
    }
  ) {
    super({
      _id: params._id,
      createdAt: params.createdAt,
      type: "ActionExecutionMessage",
    });
    this.name = params.name;
    this.arguments = ActionExecutionMessage.parseArguments(params.arguments);
    this.parentMessageId = params.parentMessageId;
  }
}

export class ResultMessage extends Message implements ResultMessageInput {
  type: MessageType = "ResultMessage";
  actionExecutionId: string;
  actionName: string;
  result: string;

  constructor(params: Partial<BaseMessageInput> & ResultMessageInput) {
    super({
      _id: params._id,
      createdAt: params.createdAt,
      type: "ResultMessage",
    });
    this.actionExecutionId = params.actionExecutionId;
    this.actionName = params.actionName;
    this.result = params.result;
  }

  static encodeResult(
    result: any,
    error?: { code: string; message: string } | string | Error
  ): string {
    const errorObj = error
      ? typeof error === "string"
        ? { code: "ERROR", message: error }
        : error instanceof Error
        ? { code: "ERROR", message: error.message }
        : error
      : undefined;

    if (errorObj) {
      return JSON.stringify({
        error: errorObj,
        result: result || "",
      });
    }
    if (result === undefined) {
      return "";
    }
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  static decodeResult(result: string): {
    error?: { code: string; message: string };
    result: string;
  } {
    if (!result) {
      return { result: "" };
    }
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === "object") {
        if ("error" in parsed) {
          return {
            error: parsed.error,
            result: parsed.result || "",
          };
        }
        return { result: JSON.stringify(parsed) };
      }
      return { result };
    } catch (e) {
      return { result };
    }
  }

  hasError(): boolean {
    try {
      const { error } = ResultMessage.decodeResult(this.result);
      return !!error;
    } catch {
      return false;
    }
  }

  getError(): { code: string; message: string } | undefined {
    try {
      const { error } = ResultMessage.decodeResult(this.result);
      return error;
    } catch {
      return undefined;
    }
  }
}

export class AgentStateMessage
  extends Message
  implements Omit<AgentStateMessageInput, "state">
{
  type: MessageType = "AgentStateMessage";
  threadId: string;
  agentName: string;
  nodeName: string;
  runId: string;
  active: boolean;
  role: MessageRole;
  state: any;
  running: boolean;

  static parseState(state: unknown): any {
    if (state && typeof state === "object") return state;
    if (typeof state === "string") {
      try {
        return JSON.parse(state);
      } catch {
        return state;
      }
    }
    return state;
  }

  constructor(
    params: Partial<BaseMessageInput> &
      (AgentStateMessageInput & { state: unknown })
  ) {
    super({
      _id: params._id,
      createdAt: params.createdAt,
      type: "AgentStateMessage",
    });
    this.threadId = params.threadId;
    this.agentName = params.agentName;
    this.nodeName = params.nodeName;
    this.runId = params.runId;
    this.active = params.active;
    this.role = params.role;
    this.running = params.running;
    this.state = AgentStateMessage.parseState(params.state);
  }
}

export class ImageMessage extends Message implements ImageMessageInput {
  type: MessageType = "ImageMessage";
  format: string;
  url: string;
  role: MessageRole;
  name: string;
  parentMessageId?: string;

  constructor(params: Partial<BaseMessageInput> & ImageMessageInput) {
    super({
      _id: params._id,
      createdAt: params.createdAt,
      type: "ImageMessage",
    });
    this.name = params.name;
    this.format = params.format;
    this.url = params.url;
    this.role = params.role;
    this.parentMessageId = params.parentMessageId;
  }
}

// Utilities
export namespace Message {
  let __objectIdCounter = Math.floor(Math.random() * 0xffffff);

  function toHex(value: number, length: number): string {
    return value.toString(16).padStart(length, "0");
  }

  function getRandomBytes(size: number): Uint8Array {
    try {
      // @ts-ignore
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        const arr = new Uint8Array(size);
        // @ts-ignore
        crypto.getRandomValues(arr);
        return arr;
      }
    } catch {}
    const arr = new Uint8Array(size);
    for (let i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  }

  // Generates a 24-char MongoDB ObjectId string
  export function generateId(): string {
    const time = Math.floor(Date.now() / 1000);
    const timeHex = toHex(time, 8);

    const random = getRandomBytes(5);
    let randomHex = "";
    for (let i = 0; i < random.length; i++) randomHex += toHex(random[i], 2);

    __objectIdCounter = (__objectIdCounter + 1) % 0xffffff;
    const counterHex = toHex(__objectIdCounter, 6);

    return timeHex + randomHex + counterHex;
  }
}
