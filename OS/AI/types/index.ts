// Response types for different interactions
export * from "./coagent-action";
export * from "./frontend-action";
export * from "./coagent-state";
export * from "./chat-suggestion-configuration";
export * from "./interrupt-action";
export * from "./system-message";

export interface StreamChunk {
  type: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface StreamError {
  success: false;
  status: number;
  code: string;
  message: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Messages {
  _id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | any[];
  timestamp?: Date;
  metadata?: { [key: string]: any };
  attachments?: any[];
  display?: boolean;
}

export interface ConversationRequest {
  initialMessages: Messages[];
  conversationId?: string;
}

export interface ConversationResponse {
  _id: string;
  title: string;
  createdAt: Date;
  messages: Messages[];
}

export interface DeleteConversationRequest {
  conversationId: string;
}

export interface DeleteConversationResponse {
  success: boolean;
}
