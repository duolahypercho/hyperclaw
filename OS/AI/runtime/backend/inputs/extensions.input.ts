/**
 * The extensions input is used to pass additional information to the copilot runtime, specific to a
 * service adapter or agent framework.
 */

export type OpenAIApiAssistantAPIInput = {
  runId?: string;
  threadId?: string;
};

export type ExtensionsInput = {
  openaiAssistantAPI?: OpenAIApiAssistantAPIInput;
};
