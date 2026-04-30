import { MessageInput } from "./message.input";
import { FrontendInput } from "./frontend.input";
import { CopanionRequestType } from "../enums";
import { ForwardedParametersInput } from "./forwarded-parameters.input";
import { AgentSessionInput } from "./agent-session.input";
import { AgentStateInput } from "./agent-state.input";
import { ExtensionsInput } from "./extensions.input";
import { MetaEventInput } from "./meta-event.input";

export interface GenerateCopanionResponseMetadataInput {
  requestType: CopanionRequestType;
  /**
   * Client-generated request ID for reliable cancellation.
   * This is generated BEFORE the request starts and can be used
   * to cancel even if conversationId isn't available yet.
   */
  requestId?: string;
}

export interface GenerateCopanionResponseInput {
  metadata: GenerateCopanionResponseMetadataInput;
  conversationId?: string;
  threadId?: string;
  runId?: string;
  messages: MessageInput[];
  frontend: FrontendInput;
  forwardedParameters?: ForwardedParametersInput;
  agentSession?: AgentSessionInput;
  agentState?: AgentStateInput;
  agentStates?: AgentStateInput[];
  extensions?: ExtensionsInput;
  metaEvents?: MetaEventInput[];
}
