import { catchError, mergeMap, Observable, of, throwError } from "rxjs";
import { AgentStateInput, MetaEventInput } from "../backend/inputs";
import { Message } from "../backend";
import {
  RuntimeErrorEvent,
  RuntimeEvent,
  RuntimeEventTypes,
} from "../service-adapters/events";
import { RemoteAgentHandlerParams } from "./remote-actions";

import {
  AssistantMessage as AGUIAssistantMessage,
  Message as AGUIMessage,
  ToolCall,
} from "@ag-ui/client";

import { AbstractAgent } from "@ag-ui/client";
import { HyperchoError, HyperchoErrorCode, parseJson } from "@OS/AI/shared";

export function constructAGUIRemoteAction({
  messages,
  agentStates,
  agent,
  metaEvents,
  threadMetadata,
  nodeName,
}: {
  messages: Message[];
  agentStates?: AgentStateInput[];
  agent: AbstractAgent;
  metaEvents?: MetaEventInput[];
  threadMetadata?: Record<string, any>;
  nodeName?: string;
}) {
  const action = {
    name: agent.agentId || "unknown-agent",
    description: agent.description,
    parameters: [] as [],
    handler: async () => {},
    remoteAgentHandler: async ({
      actionInputsWithoutAgents,
      threadId,
    }: RemoteAgentHandlerParams): Promise<Observable<RuntimeEvent>> => {
      console.debug({ actionName: agent.agentId }, "Executing remote agent");

      const agentWireMessages = convertMessagesToAGUIMessage(messages);
      agent.messages = agentWireMessages;
      agent.threadId = threadId ?? "";

      let state = {};
      let config: Record<string, unknown> = {};
      if (agentStates) {
        const jsonState = agentStates.find(
          (state) => state.agentName === agent.agentId
        );
        if (jsonState) {
          state = parseJson(jsonState.state ?? "", {});
          config = parseJson(jsonState.config ?? "", {});
        }
      }
      agent.state = state;

      const tools = actionInputsWithoutAgents.map((input) => {
        return {
          name: input.name,
          description: input.description,
          parameters: JSON.parse(input.jsonSchema),
        };
      });

      const { streamSubgraphs, ...restConfig } = config;

      const forwardedProps = {
        config: restConfig,
        ...(metaEvents?.length
          ? { command: { resume: metaEvents[0]?.response } }
          : {}),
        ...(threadMetadata ? { threadMetadata } : {}),
        ...(nodeName ? { nodeName } : {}),
        ...(streamSubgraphs ? { streamSubgraphs } : {}),
      };

      return (
        agent.legacy_to_be_removed_runAgentBridged({
          tools,
          forwardedProps,
        }) as unknown as Observable<RuntimeEvent>
      ).pipe(
        mergeMap((event) => {
          if (event.type === RuntimeEventTypes.RunError) {
            const { message } = event as RuntimeErrorEvent;
            return throwError(
              () =>
                new HyperchoError({
                  message,
                  code: HyperchoErrorCode.UNKNOWN,
                })
            );
          }
          // pass through non-error events
          return of(event);
        }),
        catchError((err) => {
          throw new HyperchoError({
            message: err.message,
            code: HyperchoErrorCode.UNKNOWN,
          });
        })
      );
    },
  };
  return [action];
}

export function convertMessagesToAGUIMessage(
  messages: Message[]
): AGUIMessage[] {
  const result: AGUIMessage[] = [];

  for (const message of messages) {
    if (message.isTextMessage()) {
      result.push({
        id: message._id,
        role: message.role as any,
        content: message.content,
      });
    } else if (message.isActionExecutionMessage()) {
      const toolCall: ToolCall = {
        id: message._id,
        type: "function",
        function: {
          name: message.name,
          arguments: JSON.stringify(message.arguments),
        },
      };

      if (
        message.parentMessageId &&
        result.some((m) => m.id === message.parentMessageId)
      ) {
        const parentMessage: AGUIAssistantMessage | undefined = result.find(
          (m) => m.id === message.parentMessageId
        ) as AGUIAssistantMessage;
        if (parentMessage.toolCalls === undefined) {
          parentMessage.toolCalls = [];
        }
        parentMessage.toolCalls.push(toolCall);
      } else {
        result.push({
          id: message.parentMessageId ?? message._id,
          role: "assistant",
          toolCalls: [toolCall],
        });
      }
    } else if (message.isResultMessage()) {
      result.push({
        id: message._id,
        role: "tool",
        content: message.result,
        toolCallId: message.actionExecutionId,
      });
    }
  }

  return result;
}
