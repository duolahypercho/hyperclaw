import { useCopanionkit } from "$/OS/AI/core/copanionkit";
import { useCallback } from "react";
import { AutosuggestionsBareFunction, InsertionEditorState } from "../../types";
import { retry } from "../../lib/retry";
import { SuggestionsApiConfig } from "../../types/autosuggestions-config/suggestions-api-config";
import { FormattedMessage } from "../../../../../types";
import { getAuthToken } from "$/lib/auth-token-cache";

export function useMakeStandardAutosuggestionFunction(
  textareaPurpose: string,
  contextCategories: string[],
  apiConfig: SuggestionsApiConfig
): AutosuggestionsBareFunction {
  const { getContextString, copanionApiConfig } = useCopanionkit();
  const { maxTokens, stop } = apiConfig;

  const requestURL = "/api/copanion";

  return useCallback(
    async (editorState: InsertionEditorState, abortSignal: AbortSignal) => {
      const res = await retry(async () => {
        const messages: FormattedMessage[] = [
          {
            id: "system",
            role: "system",
            content: apiConfig.makeSystemPrompt(
              textareaPurpose,
              getContextString([], contextCategories)
            ),
          },
          ...apiConfig.fewShotMessages,
          {
            id: "1",
            role: "user",
            content: editorState.textAfterCursor,
          },
          {
            id: "2",
            role: "user",
            content: `<TextAfterCursor>${editorState.textAfterCursor}</TextAfterCursor>`,
          },
          {
            id: "3",
            role: "user",
            content: `<TextBeforeCursor>${editorState.textBeforeCursor}</TextBeforeCursor>`,
          },
        ];
        // Simplified payload with just the essential data
        const payload = {
          messages: messages,
          maxTokens: maxTokens,
          stop: stop,
        };
        const token = await getAuthToken();
        // Simple fetch request to your API endpoint
        const response = await fetch(requestURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: abortSignal, // Keeps the abort functionality
        });

        if (!response.ok) {
          throw new Error("API request failed");
        }

        const data = await response.json();
        return data.data; // Adjust based on your API response structure
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
