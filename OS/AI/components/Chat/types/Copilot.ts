import React from "react";
import { Message } from "@OS/AI/shared";
import { SystemMessageFunction } from "@OS/AI/types";
import {
  OnStopGeneration,
  OnReloadMessages,
} from "@OS/AI/core/hook/use-copanion-chat-logic";

export interface SuggestionItem {
  id: string;
  title: string;
  message: string;
  icon?: React.ReactNode;
}

export type ChatSuggestions = "auto" | "manual" | SuggestionItem[];

export interface CopilotChatProps {
  /**
   * Custom instructions to be added to the system message. Use this property to
   * provide additional context or guidance to the language model, influencing
   * its responses. These instructions can include specific directions,
   * preferences, or criteria that the model should consider when generating
   * its output, thereby tailoring the conversation more precisely to the
   * user's needs or the application's requirements.
   */
  instructions?: string;

  /**
   * Controls the behavior of suggestions in the chat interface.
   *
   * `auto` (default) - Suggestions are generated automatically:
   *   - When the chat is first opened (empty state)
   *   - After each message exchange completes
   *   - Uses configuration from `useCopilotChatSuggestions` hooks
   *
   * `manual` - Suggestions are controlled programmatically:
   *   - Use `setSuggestions()` to set custom suggestions
   *   - Use `generateSuggestions()` to trigger AI generation
   *   - Access via `useCopilotChat` hook
   *
   * `SuggestionItem[]` - Static suggestions array:
   *   - Always shows the same suggestions
   *   - No AI generation involved
   */
  suggestions?: ChatSuggestions;

  /**
   * A callback that gets called when the in progress state changes.
   */
  onInProgress?: (inProgress: boolean) => void;

  /**
   * A callback that gets called when a new message it submitted.
   */
  onSubmitMessage?: (message: string) => void | Promise<void>;

  /**
   * A custom stop generation function.
   */
  onStopGeneration?: OnStopGeneration;

  /**
   * A custom reload messages function.
   */
  onReloadMessages?: OnReloadMessages;

  /**
   * A callback function to regenerate the assistant's response
   */
  onRegenerate?: (messageId: string) => void;

  /**
   * A callback function when the message is copied
   */
  onCopy?: (message: string) => void;

  /**
   * A callback function for thumbs up feedback
   */
  onThumbsUp?: (message: Message) => void;

  /**
   * A callback function for thumbs down feedback
   */
  onThumbsDown?: (message: Message) => void;

  /**
   * Enable image upload button (image inputs only supported on some models)
   */
  imageUploadsEnabled?: boolean;

  /**
   * The 'accept' attribute for the file input used for image uploads.
   * Defaults to "image/*".
   */
  inputFileAccept?: string;

  /**
   * A function that takes in context string and instructions and returns
   * the system message to include in the chat request.
   * Use this to completely override the system message, when providing
   * instructions is not enough.
   */
  makeSystemMessage?: SystemMessageFunction;

  /**
   * Disables inclusion of CopilotKit's default system message. When true, no system message is sent (this also suppresses any custom message from <code>makeSystemMessage</code>).
   */
  disableSystemMessage?: boolean;

  /**
   * A class name to apply to the root element.
   */
  className?: string;

  /**
   * Children to render.
   */
  children?: React.ReactNode;

  hideStopButton?: boolean;

  /**
   * Event hooks for CopilotKit chat events.
   * These hooks only work when publicApiKey is provided.
   */
  observabilityHooks?: CopilotObservabilityHooks;

  /**
   * Custom error renderer for chat-specific errors.
   * When provided, errors will be displayed inline within the chat interface.
   */
  renderError?: (error: {
    message: string;
    operation?: string;
    timestamp: number;
    onDismiss: () => void;
    onRetry?: () => void;
  }) => React.ReactNode;
}

export interface CopilotObservabilityHooks {
  onMessageSent?: (message: string) => void;
  onMessageRegenerated?: (messageId: string) => void;
  onMessageCopied?: (message: string) => void;
  onFeedbackGiven?: (
    messageId: string,
    feedback: "thumbsUp" | "thumbsDown"
  ) => void;
  onChatStarted?: () => void;
  onChatStopped?: () => void;
  onError?: (error: any) => void;
}

export interface ImageUpload {
  contentType: string;
  bytes: string;
}

export interface ChatError {
  message: string;
  operation?: string;
  timestamp: number;
  onDismiss: () => void;
  onRetry?: () => void;
}