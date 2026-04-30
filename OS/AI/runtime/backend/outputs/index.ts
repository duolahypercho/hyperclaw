// Export all output types for easy importing
export * from "./generate-copilot-response.output";

// Re-export commonly used types for convenience
export type {
  GenerateCopilotResponseOutput,
  StreamingResponseChunk,
  ResponseStatus,
  BaseResponseStatus,
  FailedResponseStatus,
  ExtensionsResponse,
  OpenAIAssistantAPIExtension,
  MetaEventOutput,
} from "./generate-copilot-response.output";
