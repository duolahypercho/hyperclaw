import {
  Action,
  randomId,
  HyperchoError,
  HyperchoErrorCode,
  HyperchoLowLevelError,
  ensureStructuredError,
  Severity,
} from "@OS/AI/shared";
import { plainToInstance } from "class-transformer";
import {
  catchError,
  concat,
  concatMap,
  EMPTY,
  firstValueFrom,
  from,
  of,
  ReplaySubject,
  scan,
  Subject,
} from "rxjs";
import {
  ActionInput,
  ActionExecutionMessage,
  ResultMessage,
  TextMessage,
  GuardrailsResult,
} from "@OS/AI/runtime";
import { isRemoteAgentAction } from "../lib/remote-actions";
import { generateHelpfulErrorMessage } from "../lib/streaming";
import { streamLangChainResponse } from "./langchain/utils";

/**
 * Enumeration of all supported runtime event types.
 *
 * These events represent the different stages and types of interactions
 * that can occur during AI runtime execution, from message streaming
 * to action execution and error handling.
 */
export enum RuntimeEventTypes {
  /** Indicates the start of a text message stream */
  TextMessageStart = "TextMessageStart",
  /** Contains incremental content for a text message */
  TextMessageContent = "TextMessageContent",
  /** Indicates the end of a text message stream */
  TextMessageEnd = "TextMessageEnd",
  /** Indicates the start of an action execution */
  ActionExecutionStart = "ActionExecutionStart",
  /** Contains arguments for an action execution */
  ActionExecutionArgs = "ActionExecutionArgs",
  /** Indicates the end of an action execution */
  ActionExecutionEnd = "ActionExecutionEnd",
  /** Contains the result of an action execution */
  ActionExecutionResult = "ActionExecutionResult",
  /** Contains agent state information */
  AgentStateMessage = "AgentStateMessage",
  /** Contains metadata events */
  MetaEvent = "MetaEvent",
  /** Indicates a runtime error occurred */
  RunError = "RunError",
}

/**
 * Enumeration of supported meta event names.
 *
 * Meta events provide additional context and control flow information
 * for advanced AI runtime scenarios, particularly for LangGraph integration.
 */
export enum RuntimeMetaEventName {
  /** LangGraph interrupt event for workflow control */
  LangGraphInterruptEvent = "LangGraphInterruptEvent",
  /** LangGraph interrupt resume event for workflow continuation */
  LangGraphInterruptResumeEvent = "LangGraphInterruptResumeEvent",
  /** CopilotKit-specific LangGraph interrupt event */
  CopanionKitLangGraphInterruptEvent = "CopanionKitLangGraphInterruptEvent",
}

/**
 * Union type for all supported meta events.
 *
 * Meta events provide additional context and control flow information
 * beyond standard runtime events, enabling advanced workflow management.
 */
export type RunTimeMetaEvent =
  | {
      type: RuntimeEventTypes.MetaEvent;
      name: RuntimeMetaEventName.LangGraphInterruptEvent;
      value: string;
    }
  | {
      type: RuntimeEventTypes.MetaEvent;
      name: RuntimeMetaEventName.CopanionKitLangGraphInterruptEvent;
      data: {
        value: string;
        messages: (TextMessage | ActionExecutionMessage | ResultMessage)[];
      };
    }
  | {
      type: RuntimeEventTypes.MetaEvent;
      name: RuntimeMetaEventName.LangGraphInterruptResumeEvent;
      data: string;
    };

/**
 * Type definition for runtime error events.
 *
 * Error events provide structured error information with optional
 * error codes for better error handling and debugging.
 */
export type RuntimeErrorEvent = {
  type: RuntimeEventTypes.RunError;
  message: string;
  code?: string;
};

/**
 * Union type for all possible runtime events.
 *
 * This comprehensive type system ensures type safety across all
 * runtime event types, from basic text messages to complex action executions.
 */
export type RuntimeEvent =
  | {
      type: RuntimeEventTypes.TextMessageStart;
      messageId: string;
      parentMessageId?: string;
    }
  | {
      type: RuntimeEventTypes.TextMessageContent;
      messageId: string;
      content: string;
    }
  | { type: RuntimeEventTypes.TextMessageEnd; messageId: string }
  | {
      type: RuntimeEventTypes.ActionExecutionStart;
      actionExecutionId: string;
      actionName: string;
      parentMessageId?: string;
    }
  | {
      type: RuntimeEventTypes.ActionExecutionArgs;
      actionExecutionId: string;
      args: string;
    }
  | { type: RuntimeEventTypes.ActionExecutionEnd; actionExecutionId: string }
  | {
      type: RuntimeEventTypes.ActionExecutionResult;
      actionName: string;
      actionExecutionId: string;
      result: string;
    }
  | {
      type: RuntimeEventTypes.AgentStateMessage;
      threadId: string;
      agentName: string;
      nodeName: string;
      runId: string;
      active: boolean;
      role: string;
      state: string;
      running: boolean;
    }
  | RunTimeMetaEvent
  | RuntimeErrorEvent;

/**
 * Internal interface for tracking runtime event state.
 *
 * This interface maintains the current state of event processing,
 * including action execution context and accumulated arguments.
 *
 * @internal
 */
interface RuntimeEventWithState {
  event: RuntimeEvent | null;
  callActionServerSide: boolean;
  action: Action<any> | null;
  actionExecutionId: string | null;
  args: string;
  actionExecutionParentMessageId: string | null;
}

/**
 * Type definition for event source callback functions.
 *
 * Callbacks are used to handle event streaming and provide
 * a clean interface for event processing.
 */
type EventSourceCallback = (eventStream$: RuntimeEventSubject) => Promise<void>;

/**
 * Professional runtime event subject for managing event streams.
 *
 * This class extends RxJS ReplaySubject to provide a robust event streaming
 * system with methods for sending different types of runtime events.
 * It serves as the primary interface for event communication in the AI runtime.
 *
 * @extends {ReplaySubject<RuntimeEvent>}
 */
export class RuntimeEventSubject extends ReplaySubject<RuntimeEvent> {
  /**
   * Creates a new instance of RuntimeEventSubject.
   *
   * Initializes the underlying ReplaySubject with default configuration
   * for optimal event streaming performance.
   */
  constructor() {
    super();
  }

  /**
   * Sends a text message start event.
   *
   * Indicates the beginning of a text message stream, allowing
   * the frontend to prepare for incoming content.
   *
   * @param params - Parameters for the text message start event
   * @param params.messageId - Unique identifier for the message
   * @param params.parentMessageId - Optional parent message ID for threading
   */
  sendTextMessageStart({
    messageId,
    parentMessageId,
  }: {
    messageId: string;
    parentMessageId?: string;
  }): void {
    this.next({
      type: RuntimeEventTypes.TextMessageStart,
      messageId,
      parentMessageId,
    });
  }

  /**
   * Sends text message content.
   *
   * Streams incremental content for a text message, enabling
   * real-time display of AI-generated responses.
   *
   * @param params - Parameters for the text message content
   * @param params.messageId - Unique identifier for the message
   * @param params.content - The content to stream
   */
  sendTextMessageContent({
    messageId,
    content,
  }: {
    messageId: string;
    content: string;
  }): void {
    this.next({
      type: RuntimeEventTypes.TextMessageContent,
      content,
      messageId,
    });
  }

  /**
   * Sends a text message end event.
   *
   * Indicates the completion of a text message stream,
   * allowing the frontend to finalize message display.
   *
   * @param params - Parameters for the text message end event
   * @param params.messageId - Unique identifier for the message
   */
  sendTextMessageEnd({ messageId }: { messageId: string }): void {
    this.next({ type: RuntimeEventTypes.TextMessageEnd, messageId });
  }

  /**
   * Sends a complete text message in one operation.
   *
   * Convenience method that sends start, content, and end events
   * for a complete text message in a single call.
   *
   * @param messageId - Unique identifier for the message
   * @param content - The complete message content
   */
  sendTextMessage(messageId: string, content: string): void {
    this.sendTextMessageStart({ messageId });
    this.sendTextMessageContent({ messageId, content });
    this.sendTextMessageEnd({ messageId });
  }

  /**
   * Sends an action execution start event.
   *
   * Indicates the beginning of an action execution, allowing
   * the frontend to track and display action progress.
   *
   * @param params - Parameters for the action execution start event
   * @param params.actionExecutionId - Unique identifier for the action execution
   * @param params.actionName - Name of the action being executed
   * @param params.parentMessageId - Optional parent message ID for threading
   */
  sendActionExecutionStart({
    actionExecutionId,
    actionName,
    parentMessageId,
  }: {
    actionExecutionId: string;
    actionName: string;
    parentMessageId?: string;
  }): void {
    this.next({
      type: RuntimeEventTypes.ActionExecutionStart,
      actionExecutionId,
      actionName,
      parentMessageId,
    });
  }

  /**
   * Sends action execution arguments.
   *
   * Streams the arguments being passed to an action execution,
   * enabling real-time display of action parameters.
   *
   * @param params - Parameters for the action execution args event
   * @param params.actionExecutionId - Unique identifier for the action execution
   * @param params.args - The arguments being passed to the action
   */
  sendActionExecutionArgs({
    actionExecutionId,
    args,
  }: {
    actionExecutionId: string;
    args: string;
  }): void {
    this.next({
      type: RuntimeEventTypes.ActionExecutionArgs,
      args,
      actionExecutionId,
    });
  }

  /**
   * Sends an action execution end event.
   *
   * Indicates the completion of an action execution,
   * allowing the frontend to finalize action display.
   *
   * @param params - Parameters for the action execution end event
   * @param params.actionExecutionId - Unique identifier for the action execution
   */
  sendActionExecutionEnd({
    actionExecutionId,
  }: {
    actionExecutionId: string;
  }): void {
    this.next({
      type: RuntimeEventTypes.ActionExecutionEnd,
      actionExecutionId,
    });
  }

  /**
   * Sends a complete action execution in one operation.
   *
   * Convenience method that sends start, args, and end events
   * for a complete action execution in a single call.
   *
   * @param params - Parameters for the complete action execution
   * @param params.actionExecutionId - Unique identifier for the action execution
   * @param params.actionName - Name of the action being executed
   * @param params.args - The arguments being passed to the action
   * @param params.parentMessageId - Optional parent message ID for threading
   */
  sendActionExecution({
    actionExecutionId,
    actionName,
    args,
    parentMessageId,
  }: {
    actionExecutionId: string;
    actionName: string;
    args: string;
    parentMessageId?: string;
  }): void {
    this.sendActionExecutionStart({
      actionExecutionId,
      actionName,
      parentMessageId,
    });
    this.sendActionExecutionArgs({ actionExecutionId, args });
    this.sendActionExecutionEnd({ actionExecutionId });
  }

  /**
   * Sends an action execution result.
   *
   * Provides the result or error from an action execution,
   * enabling the frontend to display outcomes to users.
   *
   * @param params - Parameters for the action execution result
   * @param params.actionExecutionId - Unique identifier for the action execution
   * @param params.actionName - Name of the action that was executed
   * @param params.result - Optional successful result from the action
   * @param params.error - Optional error information if the action failed
   */
  sendActionExecutionResult({
    actionExecutionId,
    actionName,
    result,
    error,
  }: {
    actionExecutionId: string;
    actionName: string;
    result?: string;
    error?: { code: string; message: string };
  }): void {
    this.next({
      type: RuntimeEventTypes.ActionExecutionResult,
      actionName,
      actionExecutionId,
      result: ResultMessage.encodeResult(result, error),
    });
  }

  /**
   * Sends an agent state message.
   *
   * Provides information about the current state of an AI agent,
   * enabling the frontend to display agent status and progress.
   *
   * @param params - Parameters for the agent state message
   * @param params.threadId - Unique identifier for the conversation thread
   * @param params.agentName - Name of the agent
   * @param params.nodeName - Name of the current node in the agent workflow
   * @param params.runId - Unique identifier for the current run
   * @param params.active - Whether the agent is currently active
   * @param params.role - Role of the agent in the conversation
   * @param params.state - Current state of the agent
   * @param params.running - Whether the agent is currently running
   */
  sendAgentStateMessage({
    threadId,
    agentName,
    nodeName,
    runId,
    active,
    role,
    state,
    running,
  }: {
    threadId: string;
    agentName: string;
    nodeName: string;
    runId: string;
    active: boolean;
    role: string;
    state: string;
    running: boolean;
  }): void {
    this.next({
      type: RuntimeEventTypes.AgentStateMessage,
      threadId,
      agentName,
      nodeName,
      runId,
      active,
      role,
      state,
      running,
    });
  }
}

/**
 * Professional runtime event source for managing event streams and callbacks.
 *
 * This class provides a robust event streaming system with comprehensive
 * error handling, callback management, and event processing capabilities.
 * It serves as the main orchestrator for runtime event communication.
 */
export class RuntimeEventSource {
  private readonly eventStream$ = new RuntimeEventSubject();
  private callback!: EventSourceCallback;
  private readonly errorHandler?: (error: any, context: any) => Promise<void>;
  private readonly errorContext?: any;

  /**
   * Creates a new instance of RuntimeEventSource.
   *
   * @param params - Optional configuration parameters
   * @param params.errorHandler - Custom error handler for runtime errors
   * @param params.errorContext - Context information for error handling
   */
  constructor(params?: {
    errorHandler?: (error: any, context: any) => Promise<void>;
    errorContext?: any;
  }) {
    this.errorHandler = params?.errorHandler;
    this.errorContext = params?.errorContext;
  }

  /**
   * Sets up the event streaming callback.
   *
   * This method establishes the callback function that will be used
   * to process runtime events and handle the event stream.
   *
   * @param callback - The callback function to handle event streaming
   * @throws {Error} When callback is not a function
   */
  async stream(callback: EventSourceCallback): Promise<void> {
    if (typeof callback !== "function") {
      throw new Error("Event source callback must be a function");
    }
    this.callback = callback;
  }

  /**
   * Sends an error message to the chat interface.
   *
   * This method provides a user-friendly way to display error messages
   * in the chat interface, with proper formatting and fallback handling.
   *
   * @param message - The error message to display (defaults to generic message)
   */
  sendErrorMessageToChat(
    message = "An error occurred. Please try again."
  ): void {
    const errorMessage = `❌ ${message}`;
    const messageId = randomId();

    try {
      if (!this.callback) {
        // If no callback is set, create a temporary one
        this.stream(async (eventStream$) => {
          eventStream$.sendTextMessage(messageId, errorMessage);
        }).catch((error) => {
          console.error("Failed to send error message to chat:", error);
        });
      } else {
        // Use existing callback
        this.eventStream$.sendTextMessage(messageId, errorMessage);
      }
    } catch (error) {
      console.error("Error sending error message to chat:", error);
    }
  }

  /**
   * Processes runtime events with comprehensive error handling and action execution.
   *
   * This method orchestrates the entire event processing pipeline, including
   * state tracking, action execution, and error handling. It provides a robust
   * foundation for AI runtime event management.
   *
   * @param params - Configuration parameters for event processing
   * @param params.serverSideActions - Actions that should be executed server-side
   * @param params.guardrailsResult$ - Optional guardrails result stream
   * @param params.actionInputsWithoutAgents - Action inputs excluding agent actions
   * @param params.threadId - Unique identifier for the conversation thread
   * @returns Observable stream of processed runtime events
   */
  processRuntimeEvents({
    serverSideActions,
    guardrailsResult$,
    actionInputsWithoutAgents,
    threadId,
  }: {
    serverSideActions: Action<any>[];
    guardrailsResult$?: Subject<GuardrailsResult>;
    actionInputsWithoutAgents: ActionInput[];
    threadId: string;
  }) {
    this.callback(this.eventStream$).catch(async (error) => {
      // Convert streaming errors to structured errors, but preserve already structured ones
      const structuredError = ensureStructuredError(
        error,
        convertStreamingErrorToStructured
      );

      // Call the runtime error handler if provided
      if (this.errorHandler && this.errorContext) {
        try {
          await this.errorHandler(structuredError, this.errorContext);
        } catch (errorHandlerError) {
          console.error("Error in streaming error handler:", errorHandlerError);
        }
      }

      this.eventStream$.error(structuredError);
      this.eventStream$.complete();
    });
    return this.eventStream$.pipe(
      // track state
      scan(
        (acc, event) => {
          // It seems like this is needed so that rxjs recognizes the object has changed
          // This fixes an issue where action were executed multiple times
          // Not investigating further for now (Markus)
          acc = { ...acc };

          if (event.type === RuntimeEventTypes.ActionExecutionStart) {
            acc.callActionServerSide =
              serverSideActions.find(
                (action) => action.name === event.actionName
              ) !== undefined;
            acc.args = "";
            acc.actionExecutionId = event.actionExecutionId;
            if (acc.callActionServerSide) {
              acc.action =
                serverSideActions.find(
                  (action) => action.name === event.actionName
                ) ?? null;
            }
            acc.actionExecutionParentMessageId = event.parentMessageId ?? null;
          } else if (event.type === RuntimeEventTypes.ActionExecutionArgs) {
            acc.args += event.args;
          }

          acc.event = event;

          return acc;
        },
        {
          event: null,
          callActionServerSide: false,
          args: "",
          actionExecutionId: null,
          action: null,
          actionExecutionParentMessageId: null,
        } as RuntimeEventWithState
      ),
      concatMap((eventWithState) => {
        if (
          eventWithState.event!.type === RuntimeEventTypes.ActionExecutionEnd &&
          eventWithState.callActionServerSide
        ) {
          const toolCallEventStream$ = new RuntimeEventSubject();
          executeAction(
            toolCallEventStream$,
            guardrailsResult$ ? guardrailsResult$ : null,
            eventWithState.action!,
            eventWithState.args,
            eventWithState.actionExecutionParentMessageId,
            eventWithState.actionExecutionId as string,
            actionInputsWithoutAgents,
            threadId
          ).catch((error) => {});

          return concat(of(eventWithState.event!), toolCallEventStream$).pipe(
            catchError((error) => {
              // Convert streaming errors to structured errors and send as action result, but preserve already structured ones
              const structuredError = ensureStructuredError(
                error,
                convertStreamingErrorToStructured
              );

              // Call the runtime error handler if provided
              if (this.errorHandler && this.errorContext) {
                // Use from() to handle async error handler
                from(
                  this.errorHandler(structuredError, {
                    ...this.errorContext,
                    action: {
                      name: eventWithState.action!.name,
                      executionId: eventWithState.actionExecutionId,
                    },
                  })
                ).subscribe({
                  error: (errorHandlerError) => {
                    console.error(
                      "Error in action execution error handler:",
                      errorHandlerError
                    );
                  },
                });
              }

              toolCallEventStream$.sendActionExecutionResult({
                actionExecutionId: eventWithState.actionExecutionId!,
                actionName: eventWithState.action!.name,
                error: {
                  code: structuredError.code,
                  message: structuredError.message,
                },
              });

              return EMPTY;
            })
          );
        } else {
          return of(eventWithState.event!);
        }
      })
    );
  }
}

async function executeAction(
  eventStream$: RuntimeEventSubject,
  guardrailsResult$: Subject<GuardrailsResult> | null,
  action: Action<any>,
  actionArguments: string,
  actionExecutionParentMessageId: string | null,
  actionExecutionId: string,
  actionInputsWithoutAgents: ActionInput[],
  threadId: string
) {
  if (guardrailsResult$) {
    const { status } = await firstValueFrom(guardrailsResult$);

    if (status === "denied") {
      eventStream$.complete();
      return;
    }
  }

  // Prepare arguments for function calling
  let args: Record<string, any>[] = [];
  if (actionArguments) {
    try {
      args = JSON.parse(actionArguments);
    } catch (e) {
      console.error("Action argument unparsable", { actionArguments });
      eventStream$.sendActionExecutionResult({
        actionExecutionId,
        actionName: action.name,
        error: {
          code: "INVALID_ARGUMENTS",
          message: "Failed to parse action arguments",
        },
      });
      return;
    }
  }

  // handle LangGraph agents
  if (isRemoteAgentAction(action)) {
    const result = `${action.name} agent started`;

    const agentExecution = plainToInstance(ActionExecutionMessage, {
      id: actionExecutionId,
      createdAt: new Date(),
      name: action.name,
      arguments: JSON.parse(actionArguments),
      parentMessageId: actionExecutionParentMessageId ?? actionExecutionId,
    });

    const agentExecutionResult = plainToInstance(ResultMessage, {
      id: randomId(),
      createdAt: new Date(),
      actionExecutionId,
      actionName: action.name,
      result,
    });

    eventStream$.sendActionExecutionResult({
      actionExecutionId,
      actionName: action.name,
      result,
    });

    const stream = await action.remoteAgentHandler({
      name: action.name,
      threadId,
      actionInputsWithoutAgents,
      additionalMessages: [agentExecution, agentExecutionResult],
    });

    // forward to eventStream$
    from(stream).subscribe({
      next: (event) => eventStream$.next(event),
      error: (err) => {
        // Preserve already structured CopilotKit errors, only convert unstructured errors
        const structuredError = ensureStructuredError(
          err,
          convertStreamingErrorToStructured
        );
        eventStream$.sendActionExecutionResult({
          actionExecutionId,
          actionName: action.name,
          error: {
            code: structuredError.code,
            message: structuredError.message,
          },
        });
        eventStream$.complete();
      },
      complete: () => eventStream$.complete(),
    });
  } else {
    // call the function
    try {
      const result = await action.handler?.(args);
      await streamLangChainResponse({
        result,
        eventStream$,
        actionExecution: {
          name: action.name,
          id: actionExecutionId,
        },
      });
    } catch (e: any) {
      console.error("Error in action handler", e);
      eventStream$.sendActionExecutionResult({
        actionExecutionId,
        actionName: action.name,
        error: {
          code: "HANDLER_ERROR",
          message: e.message,
        },
      });
      eventStream$.complete();
    }
  }
}

function convertStreamingErrorToStructured(error: any): HyperchoError {
  // Determine a more helpful error message based on context
  let helpfulMessage = generateHelpfulErrorMessage(
    error,
    "event streaming connection"
  );

  // For network-related errors, use CopilotKitLowLevelError to preserve the original error
  if (
    error?.message?.includes("fetch failed") ||
    error?.message?.includes("ECONNREFUSED") ||
    error?.message?.includes("ENOTFOUND") ||
    error?.message?.includes("ETIMEDOUT") ||
    error?.message?.includes("terminated") ||
    error?.cause?.code === "UND_ERR_SOCKET" ||
    error?.message?.includes("other side closed") ||
    error?.code === "UND_ERR_SOCKET"
  ) {
    return new HyperchoLowLevelError({
      error: error instanceof Error ? error : new Error(String(error)),
      url: "event streaming connection",
      message: helpfulMessage,
    });
  }

  // For all other errors, preserve the raw error in a basic CopilotKitError
  return new HyperchoError({
    message: helpfulMessage,
    code: HyperchoErrorCode.UNKNOWN,
    severity: Severity.CRITICAL,
  });
}
