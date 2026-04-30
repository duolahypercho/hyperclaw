import { MessageRole } from "../enums";
import { MessageStatus } from "./message-status.type";
import { BaseMetaEvent } from "./meta-events.type";

// Base interface for all message outputs
export interface BaseMessageOutput {
  id: string;
  messageId: string;
  hidden: boolean;
  createdAt: Date;
  status: MessageStatus;
}

// Text message output
export interface TextMessageOutput extends BaseMessageOutput {
  role: MessageRole;
  content: string[];
  parentMessageId?: string;
}

// Action execution message output
export interface ActionExecutionMessageOutput extends BaseMessageOutput {
  name: string;
  scope?: string; // Deprecated: This field will be removed in a future version
  arguments: string[];
  parentMessageId?: string;
}

// Result message output
export interface ResultMessageOutput extends BaseMessageOutput {
  actionExecutionId: string;
  actionName: string;
  result: string;
}

// Agent state message output
export interface AgentStateMessageOutput extends BaseMessageOutput {
  threadId: string;
  agentName: string;
  nodeName: string;
  runId: string;
  active: boolean;
  role: MessageRole;
  state: string;
  running: boolean;
}

// Image message output
export interface ImageMessageOutput extends BaseMessageOutput {
  format: string;
  bytes: string;
  role: MessageRole;
  parentMessageId?: string;
}

// Union type for all message outputs
export type MessageOutput =
  | TextMessageOutput
  | ActionExecutionMessageOutput
  | ResultMessageOutput
  | AgentStateMessageOutput
  | ImageMessageOutput;

// Type guards for message output discrimination
export function isTextMessageOutput(
  message: MessageOutput
): message is TextMessageOutput {
  return "content" in message;
}

export function isActionExecutionMessageOutput(
  message: MessageOutput
): message is ActionExecutionMessageOutput {
  return "name" in message && "arguments" in message;
}

export function isResultMessageOutput(
  message: MessageOutput
): message is ResultMessageOutput {
  return "result" in message && "actionExecutionId" in message;
}

export function isAgentStateMessageOutput(
  message: MessageOutput
): message is AgentStateMessageOutput {
  return "state" in message && "threadId" in message;
}

export function isImageMessageOutput(
  message: MessageOutput
): message is ImageMessageOutput {
  return "format" in message && "bytes" in message;
}

// Placeholder types for missing dependencies
export interface ResponseStatus {
  // Define based on your response status requirements
  code: string;
  message?: string;
}

export interface ExtensionsResponse {
  // Define based on your extensions requirements
  [key: string]: any;
}

// Main copilot response interface
export interface CopilotResponse {
  threadId: string;
  status: ResponseStatus;
  runId?: string;
  messages: MessageOutput[];
  extensions?: ExtensionsResponse;
  metaEvents?: BaseMetaEvent[];
}
