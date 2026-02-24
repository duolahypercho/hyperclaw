import { useCallback } from "react";
import { useCopanionkit } from "$/OS/AI/core/copanionkit";
import { retry } from "../../lib/retry";
import { InsertionsApiConfig } from "../../types/autosuggestions-config/insertions-api-config";
import { EditingApiConfig } from "../../types/autosuggestions-config/editing-api-config";
import { DocumentPointer } from "$/OS/AI/core/copanionkit";
import { Generator_InsertionOrEditingSuggestion } from "../../types/autosuggestions-bare-function";
import { EditingEditorState } from "../../types";
import { FormattedMessage } from "../../../../../types";
import { getAuthToken } from "$/lib/auth-token-cache";

export function useMakeStandardInsertionOrEditingFunction(
  textareaPurpose: string,
  contextCategories: string[],
  insertionApiConfig: InsertionsApiConfig,
  editingApiConfig: EditingApiConfig
): Generator_InsertionOrEditingSuggestion {
  const { getContextString, copanionApiConfig } = useCopanionkit();

  const requestURL = "/api/copanion";

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

  const insertionFunction = useCallback(
    async (
      editorState: EditingEditorState,
      insertionPrompt: string,
      documents: DocumentPointer[],
      abortSignal: AbortSignal
    ) => {
      const res = await retry(async () => {
        const messages: FormattedMessage[] = [
          {
            id: "system",
            role: "system",
            content: insertionApiConfig.makeSystemPrompt(
              textareaPurpose,
              getContextString(documents, contextCategories)
            ),
          },
          ...insertionApiConfig.fewShotMessages,
          {
            id: "userInput1",
            role: "user",
            content: `<TextBeforeCursor>${editorState.textBeforeCursor}</TextBeforeCursor>`,
          },
          {
            id: "userInput2",
            role: "user",
            content: `<TextAfterCursor>${editorState.textAfterCursor}</TextAfterCursor>`,
          },
          {
            id: "userInsertion3",
            role: "user",
            content: `<InsertionPrompt>${insertionPrompt}</InsertionPrompt>`,
          },
        ];

        // Simplified payload with just the essential data
        const payload = {
          messages: messages,
          stream: true,
        };

        const token = await getAuthToken();

        const response = await fetch(requestURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
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
      /*       const fakeStreamingResponse = (): Response => {
        const fakeText = `data:  # Adventure Journal
  data:  [DONE]`;

        const chunks = fakeText.split("\n\n"); // Split text into chunks
        const encoder = new TextEncoder(); // To encode chunks into Uint8Array

        const stream = new ReadableStream({
          start(controller) {
            (async () => {
              try {
                for (const chunk of chunks) {
                  if (abortSignal.aborted) {
                    controller.error(new Error("Request aborted"));
                    return;
                  }
                  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate delay
                  controller.enqueue(encoder.encode(chunk)); // Send chunk
                }
                controller.close(); // End the stream
              } catch (error) {
                controller.error(error); // Handle errors
              }
            })();
          },
        });

        // Return a Response-like object
        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain",
          },
        });
      };

      return streamFromCopanionApi(fakeStreamingResponse()); */
    },
    [insertionApiConfig, getContextString, contextCategories, textareaPurpose]
  );

  const editingFunction = useCallback(
    async (
      editorState: EditingEditorState,
      editingPrompt: string,
      documents: DocumentPointer[],
      abortSignal: AbortSignal
    ) => {
      const res = await retry(async () => {
        const messages: FormattedMessage[] = [
          {
            id: "system",
            role: "system",
            content: editingApiConfig.makeSystemPrompt(
              textareaPurpose,
              getContextString(documents, contextCategories)
            ),
          },
          ...editingApiConfig.fewShotMessages,
          {
            id: "user1",
            role: "user",
            content: `<TextBeforeCursor>${editorState.textBeforeCursor}</TextBeforeCursor>`,
          },
          {
            id: "user2",
            role: "user",
            content: `<TextToEdit>${editorState.selectedText}</TextToEdit>`,
          },
          {
            id: "user3",
            role: "user",
            content: `<TextAfterCursor>${editorState.textAfterCursor}</TextAfterCursor>`,
          },
          {
            id: "user4",
            role: "user",
            content: `<EditingPrompt>${editingPrompt}</EditingPrompt>`,
          },
        ];
        // Simplified payload with just the essential data
        const payload = {
          messages: messages,
          stream: true,
        };

        const response = await fetch(requestURL, {
          method: "POST",
          headers: {
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
      /*       const fakeStreamingResponse = (): Response => {
        const fakeText = `data:  # Adventure Journal
  data:  [DONE]`;

        const chunks = fakeText.split("\n\n"); // Split text into chunks
        const encoder = new TextEncoder(); // To encode chunks into Uint8Array

        const stream = new ReadableStream({
          start(controller) {
            (async () => {
              try {
                for (const chunk of chunks) {
                  if (abortSignal.aborted) {
                    controller.error(new Error("Request aborted"));
                    return;
                  }
                  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate delay
                  controller.enqueue(encoder.encode(chunk)); // Send chunk
                }
                controller.close(); // End the stream
              } catch (error) {
                controller.error(error); // Handle errors
              }
            })();
          },
        });

        // Return a Response-like object
        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain",
          },
        });
      };

      return streamFromCopanionApi(fakeStreamingResponse()); */
    },
    [editingApiConfig, getContextString, contextCategories, textareaPurpose]
  );

  const insertionOrEditingFunction = useCallback(
    async (
      editorState: EditingEditorState,
      insertionPrompt: string,
      documents: DocumentPointer[],
      abortSignal: AbortSignal,
      markdownMode?: boolean
    ) => {
      if (editorState.selectedText === "") {
        return await insertionFunction(
          editorState,
          insertionPrompt,
          documents,
          abortSignal
        );
      } else {
        return await editingFunction(
          editorState,
          insertionPrompt,
          documents,
          abortSignal
        );
      }
    },
    [insertionFunction, editingFunction]
  );

  return insertionOrEditingFunction;
}
