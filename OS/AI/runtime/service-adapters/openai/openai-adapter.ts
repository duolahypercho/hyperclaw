import OpenAI from "openai";
import {
  CopilotServiceAdapter,
  CopilotRuntimeChatCompletionRequest,
  CopilotRuntimeChatCompletionResponse,
} from "../service-adapter";
import {
  convertActionInputToOpenAITool,
  convertMessageToOpenAIMessage,
  limitMessagesToTokenCount,
} from "./utils";
import { randomUUID } from "@OS/AI/shared";
import { convertServiceAdapterError } from "../shared";

const DEFAULT_MODEL = "gpt-4o";

export interface OpenAIAdapterParams {
  /**
   * An optional OpenAI instance to use.  If not provided, a new instance will be
   * created.
   */
  openai?: OpenAI;

  /**
   * The model to use.
   */
  model?: string;

  /**
   * Whether to disable parallel tool calls.
   * You can disable parallel tool calls to force the model to execute tool calls sequentially.
   * This is useful if you want to execute tool calls in a specific order so that the state changes
   * introduced by one tool call are visible to the next tool call. (i.e. new actions or readables)
   *
   * @default false
   */
  disableParallelToolCalls?: boolean;

  /**
   * Whether to keep the role in system messages as "System".
   * By default, it is converted to "developer", which is used by newer OpenAI models
   *
   * @default false
   */
  keepSystemRole?: boolean;
}

export class OpenAIAdapter implements CopilotServiceAdapter {
  private model: string = DEFAULT_MODEL;

  private disableParallelToolCalls: boolean = false;
  private _openai: OpenAI;
  private keepSystemRole: boolean = false;

  public get openai(): OpenAI {
    return this._openai;
  }

  constructor(params?: OpenAIAdapterParams) {
    this._openai = params?.openai || new OpenAI({});
    if (params?.model) {
      this.model = params.model;
    }
    this.disableParallelToolCalls = params?.disableParallelToolCalls || false;
    this.keepSystemRole = params?.keepSystemRole ?? false;
  }

  async process(
    request: CopilotRuntimeChatCompletionRequest
  ): Promise<CopilotRuntimeChatCompletionResponse> {
    const {
      threadId: threadIdFromRequest,
      model = this.model,
      messages,
      actions,
      eventSource,
      forwardedParameters,
    } = request;
    const tools = actions.map(convertActionInputToOpenAITool);
    const threadId = threadIdFromRequest ?? randomUUID();

    // ALLOWLIST APPROACH: Only include tool_result messages that correspond to valid tool_calls
    // Step 1: Extract valid tool_call IDs
    const validToolUseIds = new Set<string>();

    for (const message of messages) {
      if (message.isActionExecutionMessage()) {
        validToolUseIds.add(message._id);
      }
    }

    // Step 2: Filter messages, keeping only those with valid tool_call IDs
    const filteredMessages = messages.filter((message) => {
      if (message.isResultMessage()) {
        // Skip if there's no corresponding tool_call
        if (!validToolUseIds.has(message.actionExecutionId)) {
          return false;
        }

        // Remove this ID from valid IDs so we don't process duplicates
        validToolUseIds.delete(message.actionExecutionId);
        return true;
      }

      // Keep all non-tool-result messages
      return true;
    });

    let openaiMessages = filteredMessages.map((m) =>
      convertMessageToOpenAIMessage(m, { keepSystemRole: this.keepSystemRole })
    );
    
    openaiMessages = limitMessagesToTokenCount(openaiMessages, tools, model);

    let toolChoice: any = forwardedParameters?.toolChoice;
    if (forwardedParameters?.toolChoice === "function") {
      toolChoice = {
        type: "function",
        function: { name: forwardedParameters.toolChoiceFunctionName },
      };
    }

    try {
      const stream = this.openai.beta.chat.completions.stream({
        model: model,
        stream: true,
        messages: openaiMessages,
        ...(tools.length > 0 && { tools }),
        ...(forwardedParameters?.maxTokens && {
          max_completion_tokens: forwardedParameters.maxTokens,
        }),
        ...(forwardedParameters?.stop && { stop: forwardedParameters.stop }),
        ...(toolChoice && { tool_choice: toolChoice }),
        ...(this.disableParallelToolCalls && { parallel_tool_calls: false }),
        ...(forwardedParameters?.temperature && {
          temperature: forwardedParameters.temperature,
        }),
      });

      eventSource.stream(async (eventStream$) => {
        let mode: "function" | "message" | null = null;
        let currentMessageId: string | undefined;
        let currentToolCallId: string | undefined;

        try {
          for await (const chunk of stream) {
            if (chunk.choices.length === 0) {
              continue;
            }

            const toolCall = chunk.choices[0].delta.tool_calls?.[0];
            const content = chunk.choices[0].delta.content;

            // When switching from message to function or vice versa,
            // send the respective end event.
            // If toolCall?.id is defined, it means a new tool call starts.
            if (mode === "message" && toolCall?.id && currentMessageId) {
              mode = null;
              eventStream$.sendTextMessageEnd({ messageId: currentMessageId });
            } else if (
              mode === "function" &&
              (toolCall === undefined || toolCall?.id) &&
              currentToolCallId
            ) {
              mode = null;
              eventStream$.sendActionExecutionEnd({
                actionExecutionId: currentToolCallId,
              });
            }

            // If we send a new message type, send the appropriate start event.
            if (mode === null) {
              if (toolCall?.id) {
                mode = "function";
                currentToolCallId = toolCall.id;
                eventStream$.sendActionExecutionStart({
                  actionExecutionId: currentToolCallId,
                  parentMessageId: chunk.id || "",
                  actionName: toolCall.function?.name || "",
                });
              } else if (content) {
                mode = "message";
                currentMessageId = chunk.id || "";
                eventStream$.sendTextMessageStart({
                  messageId: currentMessageId,
                });
              }
            }

            // send the content events
            if (mode === "message" && content && currentMessageId) {
              eventStream$.sendTextMessageContent({
                messageId: currentMessageId,
                content: content,
              });
            } else if (
              mode === "function" &&
              toolCall?.function?.arguments &&
              currentToolCallId
            ) {
              eventStream$.sendActionExecutionArgs({
                actionExecutionId: currentToolCallId,
                args: toolCall.function.arguments,
              });
            }
          }

          // send the end events
          if (mode === "message" && currentMessageId) {
            eventStream$.sendTextMessageEnd({ messageId: currentMessageId });
          } else if (mode === "function" && currentToolCallId) {
            eventStream$.sendActionExecutionEnd({
              actionExecutionId: currentToolCallId,
            });
          }
        } catch (error) {
          console.error("[OpenAI] Error during API call:", error);
          throw convertServiceAdapterError(error, "OpenAI");
        }

        eventStream$.complete();
      });
    } catch (error) {
      console.error("[OpenAI] Error during API call:", error);
      throw convertServiceAdapterError(error, "OpenAI");
    }

    return {
      threadId,
    };
  }
}
