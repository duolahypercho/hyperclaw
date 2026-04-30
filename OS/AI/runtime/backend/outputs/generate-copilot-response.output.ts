import { MessageOutput } from "../types/copilot-response.type";
import { MessageStatus } from "../types/message-status.type";
import {
  BaseMetaEvent,
  MetaEvent,
  LangGraphInterruptEvent,
  CopanionKitLangGraphInterruptEvent,
} from "../types/meta-events.type";

// ============================================================================
// Response Status Types
// ============================================================================

export interface BaseResponseStatus {
  code: string;
}

export interface FailedResponseStatus extends BaseResponseStatus {
  reason: string;
  details?: any;
}

export type ResponseStatus = BaseResponseStatus | FailedResponseStatus;

// ============================================================================
// Extensions Types
// ============================================================================

export interface OpenAIAssistantAPIExtension {
  runId: string;
  threadId: string;
}

export interface ExtensionsResponse {
  openaiAssistantAPI?: OpenAIAssistantAPIExtension;
  [key: string]: any;
}

// ============================================================================
// Meta Event Types (using existing types from meta-events.type.ts)
// ============================================================================

export type MetaEventOutput = MetaEvent;

// ============================================================================
// Main Response Types
// ============================================================================

export interface GenerateCopilotResponseOutput {
  threadId: string;
  runId?: string;
  extensions?: ExtensionsResponse;
  status?: ResponseStatus;
  messages: MessageOutput[];
  metaEvents?: MetaEventOutput[];
}

// ============================================================================
// Streaming Response Types
// ============================================================================

export interface StreamingMessageChunk {
  __typename: string;
  id?: string;
  createdAt?: Date;
  status?: MessageStatus;
  content?: string;
  role?: string;
  parentMessageId?: string;
  name?: string;
  arguments?: string;
  result?: string;
  actionExecutionId?: string;
  actionName?: string;
  threadId?: string;
  state?: string;
  running?: boolean;
  agentName?: string;
  nodeName?: string;
  runId?: string;
  active?: boolean;
  format?: string;
  bytes?: string;
}

export interface StreamingMetaEventChunk {
  type: string;
  name?: string;
  value?: any;
  data?: {
    messages?: MessageOutput[];
    value?: any;
  };
}

export interface StreamingResponseChunk {
  type: "message" | "metaEvent" | "status" | "extensions";
  data:
    | StreamingMessageChunk
    | StreamingMetaEventChunk
    | ResponseStatus
    | ExtensionsResponse;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isFailedResponseStatus(
  status: ResponseStatus
): status is FailedResponseStatus {
  return "reason" in status;
}
