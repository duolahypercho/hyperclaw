export interface InputAttachment {
  id: string;
  type: string;
  name: string;
  size?: number;
  url?: string;
  preview?: string;
  uploading?: boolean;
}

export interface InternalAttachment {
  id: string;
  file: File;
  name: string;
  url: string;
  uploading: boolean;
  localPreview?: string;
}

export type AttachmentUnion = InputAttachment | InternalAttachment;

export interface InputAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export interface AttachmentType {
  id: string;
  type: string;
  name: string;
  size?: number;
  url?: string;
}

export interface InputContainerProps {
  // Core props
  onSendMessage: (
    message: string,
    attachments?: AttachmentType[]
  ) => void | Promise<void>;

  // Input customization
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;

  // State management
  isLoading?: boolean;
  isSending?: boolean;
  loadingText?: string;
  isClosed?: boolean;
  onStopGeneration?: () => void;

  // Features
  showAttachments?: boolean;
  showVoiceInput?: boolean;
  showEmojiPicker?: boolean;
  showActions?: boolean;
  autoResize?: boolean;
  allowEmptySend?: boolean;

  // File & attachment settings
  /** Maximum number of files a user can attach (default 5) */
  maxAttachments?: number;
  /** Allowed mime-types for attachments – defaults to images only */
  allowedFileTypes?: string[];
  /** Maximum file size in bytes (defaults to 10MB) */
  maxFileSize?: number;

  // Actions
  actions?: InputAction[];

  // Styling
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;

  // Callbacks
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;

  // Drag and drop props
  attachments?: AttachmentUnion[];
  onAttachmentsChange?: (
    attachments:
      | AttachmentUnion[]
      | ((prev: AttachmentUnion[]) => AttachmentUnion[])
  ) => void;
  onAddFiles?: (files: FileList | File[]) => Promise<void>;

  // Session management
  sessionKey?: string;

  // Agent identity — used to resolve default model from openclaw.json
  agentId?: string;

  // Context window usage
  tokenUsage?: number;
  contextLimit?: number;
}
