import { ChatCompletionMessageParam } from "openai/resources";
import { ChatMessage } from "../utils/messageConverter";
import { getMediaUrl } from "$/utils";

export const convertChatMessageToChatCompletionMessage = (
  chatMessages: ChatMessage[]
): ChatCompletionMessageParam[] => {
  const messages: ChatCompletionMessageParam[] = [];

  for (const message of chatMessages) {
    if (message.role === "user") {
      // Compose content as an array of message parts
      let content: any[] = [];

      if (typeof message.content === "string") {
        content = [
          {
            type: "text",
            text: message.content,
          },
        ];
      } else if (typeof message.content === "object") {
        content = message.content;
      }

      if (message.attachments && Array.isArray(message.attachments)) {
        content = [
          ...content,
          ...message.attachments
            .map((attachment) => {
              if (attachment.type === "image") {
                return {
                  type: "image_url",
                  image_url: {
                    url: getMediaUrl(attachment.url),
                  },
                };
              } else if (
                attachment.type === "mp3" ||
                attachment.type === "wav"
              ) {
                return {
                  type: "input_audio",
                  input_audio: {
                    data: attachment.url,
                    format: attachment.type,
                  },
                };
              }
              return {
                type: "file",
                file: {
                  file_data: attachment.url,
                  file_id: attachment.id,
                  filename: attachment.name,
                },
              };
            })
            .filter(Boolean),
        ];
      }

      messages.push({
        role: message.role,
        content,
      });
    }

    if (message.role === "system") {
      messages.push({
        role: "system",
        content: message.content as string,
      });
    }

    if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: message.content as string,
      });
    }
  }

  return messages;
};
