import { Message } from "@OS/AI/shared";

// Helper function to remove environment details from user messages
export const stripEnvironmentDetails = (content: string): string => {
  if (!content) return content;

  // Remove <environment_details>...</environment_details> pattern
  const pattern = /<environment_details>[\s\S]*?<\/environment_details>/g;
  return content.replace(pattern, "").trim();
};

// Helper function to determine if a message should show avatar
export const shouldShowAvatar = (
  messages: Message[],
  currentIndex: number
): boolean => {
  if (currentIndex === 0) return true;

  const currentMessage = messages[currentIndex];
  const previousMessage = messages[currentIndex - 1];

  // If current message is system or tool, don't show avatar (these messages are hidden)
  if (
    currentMessage.role === "system" ||
    (currentMessage as any).role === "tool"
  )
    return false;

  // If previous message is a tool message, show avatar
  if (
    (previousMessage as any).role === "tool" &&
    currentMessage.role === "assistant"
  )
    return false;

  // If previous message has different role, show avatar
  if (previousMessage.role !== currentMessage.role) return true;

  // If previous message is system, show avatar
  if ((previousMessage as any).role === "system") return true;

  // For consecutive messages with same role, don't show avatar
  return false;
};

export const getFileType = (format: string): string => {
  if (!format) return "file";

  const normalizedFormat = format.toLowerCase();

  // Image types
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "image"].some((ext) =>
      normalizedFormat.includes(ext)
    )
  ) {
    return "image";
  }
  // Audio types
  if (
    ["mp3", "wav", "ogg", "m4a", "aac", "flac"].some((ext) =>
      normalizedFormat.includes(ext)
    )
  ) {
    return "audio";
  }
  // Text types
  if (
    ["txt", "md", "exercise", "xml", "csv", "log"].some((ext) =>
      normalizedFormat.includes(ext)
    )
  ) {
    return "file";
  }
  // Document types
  if (
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].some((ext) =>
      normalizedFormat.includes(ext)
    )
  ) {
    return "document";
  }

  return "file";
};

/**
 * Determines if message actions (copy, delete, etc.) should be displayed
 * @param message - The message object that may have content and/or image attachment
 * @param isLoading - Whether the message is currently loading
 * @returns true if actions should be shown, false otherwise
 */
export const shouldShowMessageActions = (
  message: Message & { image?: any },
  isLoading: boolean
): boolean => {
  const hasTextContent = message.content?.trim();
  const hasImage = !!(message as any).image;

  // Hide actions when there's no text content AND (has image OR is loading)
  // Show actions when there's text content, or when message is complete with content
  return !(!hasTextContent && (hasImage || isLoading));
};
