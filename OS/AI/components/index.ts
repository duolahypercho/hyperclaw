// Main CopilotChat component
export { CopilotChat } from "./CopilotChat";

// Input and suggestions
export { InputContainer } from "./InputContainer";
export { Suggestions } from "./Chat/Suggestions";

// Confirmation dialog
export { ConfirmationDialog } from "./ConfirmationDialog";

// Presence indicator
export { CopanionPresenceIndicator } from "./CopanionPresenceIndicator";
export type { CopanionPresenceIndicatorProps } from "./CopanionPresenceIndicator";

// Types
export type {
  SuggestionItem,
  ChatSuggestions,
  CopilotObservabilityHooks,
  ImageUpload,
  ChatError,
} from "./Chat";

export type { InputContainerProps } from "./Chat/types/Input";

export type { SuggestionsProps } from "./Chat/Suggestions";
