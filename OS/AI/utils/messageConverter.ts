import { Message, MessageContent } from "$/types";

// Simple ID generator to avoid mongoose dependency
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 26);
};
import { InputAttachment } from "@OS/AI/components/Chat";

// Re-export MessageContent for convenience
export type { MessageContent } from "$/types";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | MessageContent[];
  timestamp?: Date;
  metadata?: {
    [key: string]: any;
  };
  stream?: AsyncIterable<string> | null;
  attachments?: InputAttachment[];
  display?: boolean;
}

/**
 * Utility functions to convert between ChatMessage and Message types
 *
 * ChatMessage is used internally by ChatInterface component
 * Message is the standard type used throughout the application
 */

/**
 * Convert a ChatMessage to Message type
 * @param chatMessage - The ChatMessage to convert
 * @returns Message object with display property set to true by default
 */
export const convertChatMessageToMessage = (
  chatMessage: ChatMessage
): Message => {
  return {
    id: chatMessage.id || generateId(),
    display: true, // Default to true for display
    content: chatMessage.content,
    role: chatMessage.role,
    timestamp: chatMessage.timestamp?.getTime(),
  };
};

/**
 * Convert a Message to ChatMessage type
 * @param message - The Message to convert
 * @returns ChatMessage object with default values for ChatInterface-specific properties
 */
export const convertMessageToChatMessage = (message: Message): ChatMessage => {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp ? new Date(message.timestamp) : undefined,
    metadata: {},
    stream: null,
  };
};

/**
 * Convert an array of ChatMessages to Messages
 * @param chatMessages - Array of ChatMessages to convert
 * @returns Array of Message objects
 */
export const convertChatMessagesToMessages = (
  chatMessages: ChatMessage[]
): Message[] => {
  return chatMessages.map(convertChatMessageToMessage);
};

/**
 * Convert an array of Messages to ChatMessages
 * @param messages - Array of Messages to convert
 * @returns Array of ChatMessage objects
 */
export const convertMessagesToChatMessages = (
  messages: Message[]
): ChatMessage[] => {
  return messages.map(convertMessageToChatMessage);
};

/**
 * Create a ChatMessage with default values
 * @param overrides - Properties to override defaults
 * @returns ChatMessage with default values
 */
export const createChatMessage = (
  overrides: Partial<ChatMessage>
): ChatMessage => {
  return {
    id: generateId(),
    role: "user",
    content: "",
    timestamp: new Date(),
    metadata: {},
    stream: null,
    ...overrides,
  };
};

/**
 * Create a Message with default values
 * @param overrides - Properties to override defaults
 * @returns Message with default values
 */
export const createMessage = (overrides: Partial<Message>): Message => {
  return {
    id: generateId(),
    display: true,
    content: "",
    role: "user",
    timestamp: Date.now(),
    ...overrides,
  };
};
