import { MessageRole } from "../enums";
import { BaseMessageInput } from "../types/base";

export interface TextMessageInput {
  content: string;
  parentMessageId?: string;
  role: MessageRole;
}

export interface ActionExecutionMessageInput {
  name: string;
  arguments: string;
  expired?: boolean;
  parentMessageId?: string;
  /**
   * @deprecated This field will be removed in a future version
   */
  scope?: string;
}

export interface ResultMessageInput {
  actionExecutionId: string;
  actionName: string;
  parentMessageId?: string;
  result: string;
}

export interface AgentStateMessageInput {
  threadId: string;
  agentName: string;
  role: MessageRole;
  state: string;
  running: boolean;
  nodeName: string;
  runId: string;
  active: boolean;
}

export interface ImageMessageInput {
  name: string;
  format: string;
  url: string;
  parentMessageId?: string;
  role: MessageRole;
}

// TypeScript supports union types, so we can use optional fields for the different subtypes.
export interface MessageInput extends BaseMessageInput {
  textMessage?: TextMessageInput;
  actionExecutionMessage?: ActionExecutionMessageInput;
  resultMessage?: ResultMessageInput;
  agentStateMessage?: AgentStateMessageInput;
  imageMessage?: ImageMessageInput;
}
