export interface ForwardedParametersInput {
  model?: string;
  maxTokens?: number;
  stop?: string[];
  toolChoice?: string;
  toolChoiceFunctionName?: string;
  temperature?: number;
}