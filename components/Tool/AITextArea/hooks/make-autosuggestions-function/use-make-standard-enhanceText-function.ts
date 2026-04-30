import { useCallback } from "react";
import { useCopanionkit } from "$/OS/AI/core/copanionkit";
import { retry } from "../../lib/retry";
import { EnhanceTextApiConfig } from "../../types/autosuggestions-config/enhance-api-config";
import { FormattedMessage } from "../../../../../types";
import { EnhanceTextBareFunction } from "../../types/autosuggestions-bare-function";
import { EditorEnhancedState } from "../../types/editor-autocomplete-state";

export function useMakeStandardEnhanceTextFunction(
  textareaPurpose: string,
  contextCategories: string[],
  apiConfig: EnhanceTextApiConfig
): EnhanceTextBareFunction {
  const { getContextString, copanionApiConfig } = useCopanionkit();

  const { maxTokens, stop } = apiConfig;

  const requestURL = "/api/ai-textarea";

  async function streamFromCopanionApi(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }
    const decoder = new TextDecoder();
    let buffer = "";

    return new ReadableStream({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          let lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (let line of lines) {
            line = line.trim();
            if (line.startsWith("data: ")) {
              const data = line.slice(6); // Remove 'data: ' prefix
              if (data === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const message = JSON.parse(data);
                if (message?.content) {
                  controller.enqueue(message.content);
                }
              } catch (e) {
                // Skip invalid JSON
                controller.enqueue(data + "\n");
                console.error("Failed to parse JSON:", e);
              }
            }
          }
        }

        // Process any remaining data in the buffer
        if (buffer.length > 0) {
          const line = buffer.trim();
          if (line.startsWith("data: ")) {
            const data = line.slice(6); // Remove 'data: ' prefix
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const messages = JSON.parse(data);
              if (Array.isArray(messages)) {
                for (const message of messages) {
                  if (message?.content) {
                    controller.enqueue(message.content);
                  }
                }
              }
            } catch (e) {
              console.error("Failed to parse JSON:", e);
            }
          }
        }
        controller.close();
      },
    });
  }

  return useCallback(
    async (
      editorState: EditorEnhancedState,
      abortSignal: AbortSignal,
      systemPrompt?: string
    ) => {
      const res = await retry(async () => {
        const history = editorState.history ?? apiConfig.fewShotMessages;
        const additionalPrompt = editorState.enhancedText
          ? `The user has provided the following task information: ${editorState.enhancedText}`
          : "";

        const headers = {};
        const messages: FormattedMessage[] = [
          {
            id: "system",
            role: "system",
            content:
              editorState.systemPrompt ??
              apiConfig.makeSystemPrompt(
                textareaPurpose,
                getContextString([], contextCategories)
              ),
          },
          ...history,
          {
            id: "2",
            role: "user",
            content: `${additionalPrompt}\n<EnhancedText>${editorState.entireText}</EnhancedText>`,
          },
        ];

        // Simplified payload with just the essential data
        const payload = {
          messages: messages,
          maxTokens: maxTokens,
          stop: stop,
          stream: true,
        };

        const response = await fetch(requestURL, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: abortSignal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return streamFromCopanionApi(response);
      });
      return res;
    },
    [
      apiConfig,
      getContextString,
      contextCategories,
      textareaPurpose,
      maxTokens,
      stop,
    ]
  );
}
