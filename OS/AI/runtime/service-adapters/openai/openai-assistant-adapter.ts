import OpenAI from "openai";
import {
  CopilotServiceAdapter,
  CopilotRuntimeChatCompletionRequest,
  CopilotRuntimeChatCompletionResponse,
} from "../service-adapter";
import {
  Message,
  ResultMessage,
  TextMessage,
  ActionInput,
} from "@OS/AI/runtime";
import {
  convertActionInputToOpenAITool,
  convertMessageToOpenAIMessage,
  convertSystemMessageToAssistantAPI,
} from "./utils";
import { RunSubmitToolOutputsStreamParams } from "openai/resources/beta/threads/runs/runs";
import { AssistantStream } from "openai/lib/AssistantStream";
import { RuntimeEventSource } from "../events";
import {
  AssistantStreamEvent,
  AssistantTool,
} from "openai/resources/beta/assistants";
import { ForwardedParametersInput } from "@OS/AI/runtime/backend/inputs";

/**
 * Configuration parameters for the OpenAI Assistant API adapter.
 *
 * @interface OpenAIAssistantAdapterParams
 */
export interface OpenAIAssistantAdapterParams {
  /**
   * The unique identifier of the OpenAI assistant to use for processing requests.
   * This ID is obtained from the OpenAI platform when creating an assistant.
   *
   * @required
   */
  assistantId: string;

  /**
   * Pre-configured OpenAI client instance. If not provided, a new instance will be created
   * with default configuration. Recommended for production environments where you need
   * specific API keys, organization settings, or custom configurations.
   *
   * @optional
   */
  openai?: OpenAI;

  /**
   * Enables the code interpreter tool, allowing the assistant to execute Python code,
   * analyze data, and generate visualizations. This is particularly useful for
   * data analysis, mathematical computations, and code generation tasks.
   *
   * @default true
   */
  codeInterpreterEnabled?: boolean;

  /**
   * Enables file search capabilities, allowing the assistant to search through
   * uploaded documents and files. This is essential for document analysis,
   * knowledge base queries, and content retrieval tasks.
   *
   * @default true
   */
  fileSearchEnabled?: boolean;

  /**
   * Controls the execution mode for tool calls. When disabled, tool calls are
   * executed sequentially, ensuring that state changes from one tool call are
   * visible to subsequent calls. This is useful for workflows where tool calls
   * depend on each other or when you need deterministic execution order.
   *
   * @default false
   */
  disableParallelToolCalls?: boolean;

  /**
   * Determines how system messages are handled. When false (default), system
   * messages are converted to "developer" role for compatibility with newer
   * OpenAI models. When true, the original "system" role is preserved.
   *
   * @default false
   */
  keepSystemRole?: boolean;
}

/**
 * Professional OpenAI Assistant API adapter implementation.
 *
 * This class provides a robust, type-safe interface for integrating with OpenAI's
 * Assistant API, handling message processing, tool execution, and streaming responses
 * with comprehensive error handling and state management.
 *
 * @implements {CopilotServiceAdapter}
 */
export class OpenAIAssistantAdapter implements CopilotServiceAdapter {
  private readonly openai: OpenAI;
  private readonly codeInterpreterEnabled: boolean;
  private readonly assistantId: string;
  private readonly fileSearchEnabled: boolean;
  private readonly disableParallelToolCalls: boolean;
  private readonly keepSystemRole: boolean;

  /**
   * Creates a new instance of the OpenAI Assistant API adapter.
   *
   * @param params - Configuration parameters for the adapter
   * @throws {Error} When required parameters are missing or invalid
   */
  constructor(params: OpenAIAssistantAdapterParams) {
    if (!params.assistantId) {
      throw new Error(
        "Assistant ID is required for OpenAI Assistant API adapter"
      );
    }

    this.openai = params.openai || new OpenAI({});
    this.assistantId = params.assistantId;
    this.codeInterpreterEnabled = params.codeInterpreterEnabled !== false;
    this.fileSearchEnabled = params.fileSearchEnabled !== false;
    this.disableParallelToolCalls = params.disableParallelToolCalls ?? false;
    this.keepSystemRole = params.keepSystemRole ?? false;
  }

  /**
   * Processes a chat completion request using the OpenAI Assistant API.
   *
   * This method handles the complete lifecycle of a conversation, including
   * thread management, message processing, and response streaming.
   *
   * @param request - The chat completion request containing messages, actions, and configuration
   * @returns Promise resolving to the chat completion response with run and thread IDs
   * @throws {Error} When no actionable message is found or processing fails
   */
  async process(
    request: CopilotRuntimeChatCompletionRequest
  ): Promise<CopilotRuntimeChatCompletionResponse> {
    const { messages, actions, eventSource, runId, forwardedParameters } =
      request;

    // Initialize or retrieve existing thread ID
    let threadId = request.extensions?.openaiAssistantAPI?.threadId;
    if (!threadId) {
      try {
        const thread = await this.openai.beta.threads.create();
        threadId = thread.id;
      } catch (error) {
        throw new Error(
          `Failed to create OpenAI thread: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    const lastMessage = messages.at(-1);
    if (!lastMessage) {
      throw new Error("No messages provided in the request");
    }

    let nextRunId: string | undefined;

    try {
      // Process based on message type
      if (lastMessage.isResultMessage() && runId) {
        nextRunId = await this.submitToolOutputs(
          threadId,
          runId,
          messages,
          eventSource
        );
      } else if (lastMessage.isTextMessage()) {
        nextRunId = await this.submitUserMessage(
          threadId,
          messages,
          actions,
          eventSource,
          forwardedParameters ?? {}
        );
      } else {
        throw new Error(
          `Unsupported message type: ${lastMessage.constructor.name}. ` +
            "Only text messages and result messages are supported."
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to process message: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    return {
      runId: nextRunId,
      threadId,
      extensions: {
        ...request.extensions,
        openaiAssistantAPI: {
          threadId,
          runId: nextRunId,
        },
      },
    };
  }

  /**
   * Submits tool outputs to continue a run that requires tool execution.
   *
   * This method handles the submission of function call results back to the
   * OpenAI Assistant API, enabling the continuation of tool-based workflows.
   *
   * @private
   * @param threadId - The OpenAI thread identifier
   * @param runId - The OpenAI run identifier
   * @param messages - Array of messages containing result messages
   * @param eventSource - Event source for streaming responses
   * @returns Promise resolving to the run ID
   * @throws {Error} When tool outputs are not required or submission fails
   */
  private async submitToolOutputs(
    threadId: string,
    runId: string,
    messages: Message[],
    eventSource: RuntimeEventSource
  ): Promise<string> {
    try {
      const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);

      if (!run.required_action) {
        throw new Error(
          `Run ${runId} does not require tool outputs. ` +
            "This method should only be called when a run is waiting for tool results."
        );
      }

      // Extract required tool call IDs
      const toolCallIds =
        run.required_action.submit_tool_outputs.tool_calls.map(
          (toolCall) => toolCall.id
        );

      // Find corresponding result messages
      const resultMessages = messages.filter(
        (message) =>
          message.isResultMessage() &&
          toolCallIds.includes(message.actionExecutionId)
      ) as ResultMessage[];

      if (toolCallIds.length !== resultMessages.length) {
        throw new Error(
          `Tool call count mismatch: expected ${toolCallIds.length} results, ` +
            `but found ${resultMessages.length}. Missing results for tool calls: ` +
            toolCallIds
              .filter(
                (id) =>
                  !resultMessages.some((msg) => msg.actionExecutionId === id)
              )
              .join(", ")
        );
      }

      // Prepare tool outputs for submission
      const toolOutputs: RunSubmitToolOutputsStreamParams.ToolOutput[] =
        resultMessages.map((message) => ({
          tool_call_id: message.actionExecutionId,
          output: message.result,
        }));

      const stream = this.openai.beta.threads.runs.submitToolOutputsStream(
        threadId,
        runId,
        {
          tool_outputs: toolOutputs,
          ...(this.disableParallelToolCalls && { parallel_tool_calls: false }),
        }
      );

      await this.streamResponse(stream, eventSource);
      return runId;
    } catch (error) {
      throw new Error(
        `Failed to submit tool outputs for run ${runId}: ` +
          `${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Submits a user message to the OpenAI Assistant API and initiates a run.
   *
   * This method processes user messages, converts them to the appropriate format,
   * and starts a new run with the configured tools and parameters.
   *
   * @private
   * @param threadId - The OpenAI thread identifier
   * @param messages - Array of messages to process
   * @param actions - Available actions/tools for the assistant
   * @param eventSource - Event source for streaming responses
   * @param forwardedParameters - Additional parameters for the run
   * @returns Promise resolving to the run ID
   * @throws {Error} When message processing or run creation fails
   */
  private async submitUserMessage(
    threadId: string,
    messages: Message[],
    actions: ActionInput[],
    eventSource: RuntimeEventSource,
    forwardedParameters: ForwardedParametersInput
  ): Promise<string> {
    try {
      // Create a copy to avoid mutating the original array
      const messagesCopy = [...messages];

      // Extract system instructions from the first message
      const instructionsMessage = messagesCopy.shift();
      const instructions = instructionsMessage?.isTextMessage()
        ? instructionsMessage.content
        : "";

      // Convert and process the latest user message
      const userMessage = messagesCopy
        .map((message) =>
          convertMessageToOpenAIMessage(message, {
            keepSystemRole: this.keepSystemRole,
          })
        )
        .map(convertSystemMessageToAssistantAPI)
        .at(-1);

      if (!userMessage || userMessage.role !== "user") {
        throw new Error(
          "No valid user message found in the message array. " +
            "Ensure the last message is a text message with user role."
        );
      }

      // Handle different content types safely
      const content = this.serializeMessageContent(userMessage.content);

      // Submit the user message to the thread
      await this.openai.beta.threads.messages.create(threadId, {
        role: "user",
        content,
      });

      // Prepare tools configuration
      const tools = this.buildToolsConfiguration(actions);

      // Create and start the run
      const stream = this.openai.beta.threads.runs.stream(threadId, {
        assistant_id: this.assistantId,
        instructions,
        tools,
        ...(forwardedParameters?.maxTokens && {
          max_completion_tokens: forwardedParameters.maxTokens,
        }),
        ...(this.disableParallelToolCalls && { parallel_tool_calls: false }),
      });

      await this.streamResponse(stream, eventSource);
      return await getRunIdFromStream(stream);
    } catch (error) {
      throw new Error(
        `Failed to submit user message to thread ${threadId}: ` +
          `${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Streams the response from the OpenAI Assistant API and forwards events.
   *
   * This method processes the streaming response from OpenAI, handling different
   * event types including message creation, content deltas, and tool call execution.
   *
   * @private
   * @param stream - The OpenAI Assistant stream
   * @param eventSource - Event source for forwarding events to the client
   */
  private async streamResponse(
    stream: AssistantStream,
    eventSource: RuntimeEventSource
  ): Promise<void> {
    eventSource.stream(async (eventStream$) => {
      let inFunctionCall = false;
      let currentMessageId: string | undefined;
      let currentToolCallId: string | undefined;

      try {
        for await (const chunk of stream) {
          await this.processStreamChunk(chunk, eventStream$, {
            inFunctionCall,
            currentMessageId,
            currentToolCallId,
          });

          // Update state based on processed chunk
          if (chunk.event === "thread.message.created") {
            currentMessageId = chunk.data.id;
          }
        }
      } catch (error) {
        console.error("Error processing stream chunk:", error);
        throw error;
      } finally {
        // Ensure proper cleanup of function call state
        if (inFunctionCall && currentToolCallId) {
          eventStream$.sendActionExecutionEnd({
            actionExecutionId: currentToolCallId,
          });
        }
        eventStream$.complete();
      }
    });
  }

  /**
   * Builds the tools configuration array for the OpenAI Assistant API.
   *
   * @private
   * @param actions - Available actions to include as tools
   * @returns Array of configured tools
   */
  private buildToolsConfiguration(actions: ActionInput[]): AssistantTool[] {
    const openaiTools = actions.map(convertActionInputToOpenAITool);

    const tools: AssistantTool[] = [...openaiTools];

    if (this.codeInterpreterEnabled) {
      tools.push({ type: "code_interpreter" });
    }

    if (this.fileSearchEnabled) {
      tools.push({ type: "file_search" });
    }

    return tools;
  }

  /**
   * Safely serializes message content to a string format.
   *
   * @private
   * @param content - The message content to serialize
   * @returns Serialized content as string
   */
  private serializeMessageContent(content: any): string {
    if (typeof content === "string") {
      return content;
    }

    try {
      return JSON.stringify(content);
    } catch (error) {
      console.warn("Failed to serialize message content:", error);
      return String(content);
    }
  }

  /**
   * Processes individual stream chunks and forwards appropriate events.
   *
   * @private
   * @param chunk - The stream chunk to process
   * @param eventStream$ - Event stream for forwarding events
   * @param state - Current processing state
   */
  private async processStreamChunk(
    chunk: any,
    eventStream$: any,
    state: {
      inFunctionCall: boolean;
      currentMessageId: string | undefined;
      currentToolCallId: string | undefined;
    }
  ): Promise<void> {
    switch (chunk.event) {
      case "thread.message.created":
        if (state.inFunctionCall && state.currentToolCallId) {
          eventStream$.sendActionExecutionEnd({
            actionExecutionId: state.currentToolCallId,
          });
        }
        eventStream$.sendTextMessageStart({ messageId: chunk.data.id });
        break;

      case "thread.message.delta":
        this.handleMessageDelta(chunk, eventStream$, state.currentMessageId);
        break;

      case "thread.message.completed":
        if (state.currentMessageId) {
          eventStream$.sendTextMessageEnd({
            messageId: state.currentMessageId,
          });
        }
        break;

      case "thread.run.step.delta":
        await this.handleRunStepDelta(chunk, eventStream$, state);
        break;
    }
  }

  /**
   * Handles message delta events from the stream.
   *
   * @private
   * @param chunk - The message delta chunk
   * @param eventStream$ - Event stream for forwarding events
   * @param currentMessageId - Current message ID
   */
  private handleMessageDelta(
    chunk: any,
    eventStream$: any,
    currentMessageId: string | undefined
  ): void {
    if (chunk.data.delta.content?.[0]?.type === "text" && currentMessageId) {
      const textContent = chunk.data.delta.content[0].text?.value;
      if (textContent) {
        eventStream$.sendTextMessageContent({
          messageId: currentMessageId,
          content: textContent,
        });
      }
    }
  }

  /**
   * Handles run step delta events, particularly tool call execution.
   *
   * @private
   * @param chunk - The run step delta chunk
   * @param eventStream$ - Event stream for forwarding events
   * @param state - Current processing state (modified in place)
   */
  private async handleRunStepDelta(
    chunk: any,
    eventStream$: any,
    state: {
      inFunctionCall: boolean;
      currentMessageId: string | undefined;
      currentToolCallId: string | undefined;
    }
  ): Promise<void> {
    const stepDetails = chunk.data.delta.step_details;

    if (
      stepDetails &&
      stepDetails.type === "tool_calls" &&
      "tool_calls" in stepDetails &&
      stepDetails.tool_calls?.[0]?.type === "function"
    ) {
      const toolCall = stepDetails.tool_calls[0];

      if (toolCall && "function" in toolCall && toolCall.function) {
        const { id: toolCallId, function: func } = toolCall;

        if (func.name && toolCallId) {
          // End previous function call if active
          if (state.inFunctionCall && state.currentToolCallId) {
            eventStream$.sendActionExecutionEnd({
              actionExecutionId: state.currentToolCallId,
            });
          }

          // Start new function call
          state.inFunctionCall = true;
          state.currentToolCallId = toolCallId;

          eventStream$.sendActionExecutionStart({
            actionExecutionId: toolCallId,
            parentMessageId: chunk.data.id,
            actionName: func.name,
          });
        } else if (func.arguments && state.currentToolCallId) {
          // Send function arguments
          eventStream$.sendActionExecutionArgs({
            actionExecutionId: state.currentToolCallId,
            args: func.arguments,
          });
        }
      }
    }
  }
}

/**
 * Extracts the run ID from an OpenAI Assistant stream.
 *
 * This utility function listens for the "thread.run.created" event and
 * resolves with the run ID when it's available. Includes timeout handling
 * to prevent indefinite waiting.
 *
 * @param stream - The OpenAI Assistant stream
 * @returns Promise resolving to the run ID
 * @throws {Error} When timeout occurs or stream fails
 */
function getRunIdFromStream(stream: AssistantStream): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const TIMEOUT_MS = 30000; // 30 second timeout
    let isResolved = false;

    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        stream.off("event", runIdGetter);
        reject(
          new Error(
            `Timeout waiting for run ID from stream after ${TIMEOUT_MS}ms. ` +
              "The stream may have failed or the run creation event was not received."
          )
        );
      }
    }, TIMEOUT_MS);

    const runIdGetter = (event: AssistantStreamEvent) => {
      if (event.event === "thread.run.created" && !isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        stream.off("event", runIdGetter);
        resolve(event.data.id);
      }
    };

    stream.on("event", runIdGetter);

    // Handle stream errors
    stream.on("error", (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        stream.off("event", runIdGetter);
        reject(
          new Error(
            `Stream error while waiting for run ID: ${
              error.message || "Unknown error"
            }`
          )
        );
      }
    });
  });
}
