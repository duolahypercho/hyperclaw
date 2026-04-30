import {
  CopilotKitEndpoint,
  RemoteAgentHandlerParams,
  RemoteActionInfoResponse,
  LangGraphPlatformEndpoint,
} from "./remote-actions";
import { Message } from "../backend";
import { AgentStateInput } from "../backend/inputs";
import { Observable } from "rxjs";
import { RuntimeEvent, RuntimeEventSubject } from "../service-adapters/events";
import { RemoteLangGraphEventSource } from "../langgraph/event-source";
import { Action } from "@OS/AI/shared";
import { execute } from "./remote-lg-action";
import {
  HyperchoError,
  HyperchoLowLevelError,
  HyperchoApiDiscoveryError,
  ResolvedHyperchoError,
} from "@OS/AI/shared";
import { writeJsonLineResponseToEventStream } from "./streaming";
import { parseJson, tryMap } from "@OS/AI/shared";
import { ActionInput } from "../backend/inputs";
import { fetchWithRetry } from "./retry-utils";

// Import the utility function from remote-lg-action
import { isUserConfigurationError } from "./remote-lg-action";

export function constructLGCRemoteAction({
  endpoint,
  messages,
  agentStates,
}: {
  endpoint: LangGraphPlatformEndpoint;
  messages: Message[];
  agentStates?: AgentStateInput[];
}) {
  const agents = endpoint.agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    parameters: [] as [],
    handler: async () => {},
    remoteAgentHandler: async ({
      name,
      actionInputsWithoutAgents,
      threadId,
      nodeName,
      additionalMessages = [],
      metaEvents,
    }: RemoteAgentHandlerParams): Promise<Observable<RuntimeEvent>> => {
      console.debug(
        { actionName: agent.name },
        "Executing LangGraph Platform agent"
      );

      let state = {};
      let config = {};
      if (agentStates) {
        const jsonState = agentStates.find((state) => state.agentName === name);
        if (jsonState) {
          state = parseJson(jsonState.state, {});
          config = parseJson(jsonState.config ?? "", {});
        }
      }

      try {
        const response = await execute({
          deploymentUrl: endpoint.deploymentUrl,
          langsmithApiKey: endpoint.langsmithApiKey,
          agent,
          threadId: threadId ?? "",
          nodeName: nodeName ?? "",
          messages: [...messages, ...additionalMessages],
          state,
          config,
          properties: {},
          actions: tryMap(actionInputsWithoutAgents, (action: ActionInput) => ({
            name: action.name,
            description: action.description,
            parameters: JSON.parse(action.jsonSchema),
          })),
          metaEvents,
        });

        const eventSource = new RemoteLangGraphEventSource();
        writeJsonLineResponseToEventStream(response, eventSource.eventStream$);
        return eventSource.processLangGraphEvents();
      } catch (error: any) {
        // Preserve structured CopilotKit errors with semantic information
        if (
          error instanceof HyperchoError ||
          error instanceof HyperchoLowLevelError
        ) {
          // Distinguish between user errors and system errors for logging
          if (isUserConfigurationError(error)) {
            console.debug(
              {
                url: endpoint.deploymentUrl,
                error: error.message,
                code: error.code,
              },
              "User configuration error in LangGraph Platform agent"
            );
          } else {
            console.error(
              {
                url: endpoint.deploymentUrl,
                error: error.message,
                type: error.constructor.name,
              },
              "LangGraph Platform agent error"
            );
          }
          throw error; // Re-throw the structured error to preserve semantic information
        }

        // For other errors, log and wrap them
        console.error(
          { url: endpoint.deploymentUrl, status: 500, body: error.message },
          "Failed to execute LangGraph Platform agent"
        );
        throw new HyperchoLowLevelError({
          error: error instanceof Error ? error : new Error(String(error)),
          url: endpoint.deploymentUrl,
          message: "Failed to execute LangGraph Platform agent",
        });
      }
    },
  }));

  return [...agents];
}

export enum RemoteAgentType {
  LangGraph = "langgraph",
  CrewAI = "crewai",
}

export function constructRemoteActions({
  json,
  url,
  onBeforeRequest,
  messages,
  agentStates,
}: {
  json: RemoteActionInfoResponse;
  url: string;
  onBeforeRequest?: CopilotKitEndpoint["onBeforeRequest"];
  messages: Message[];
  agentStates?: AgentStateInput[];
}): Action<any>[] {
  const totalAgents = Array.isArray(json["agents"]) ? json["agents"].length : 0;

  const actions = json["actions"].map((action) => ({
    name: action.name,
    description: action.description,
    parameters: action.parameters,
    handler: async (args: any) => {
      console.debug(
        { actionName: action.name, args },
        "Executing remote action"
      );

      const headers = createHeaders(onBeforeRequest);

      const fetchUrl = `${url}/actions/execute`;
      try {
        const response = await fetchWithRetry(fetchUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: action.name,
            arguments: args,
            properties: {},
          }),
        });

        if (!response.ok) {
          console.error(
            { url, status: response.status, body: await response.text() },
            "Failed to execute remote action"
          );
          if (response.status === 404) {
            throw new HyperchoApiDiscoveryError({ url: fetchUrl });
          }
          throw new ResolvedHyperchoError({
            status: response.status,
            url: fetchUrl,
            isRemoteEndpoint: true,
          });
        }

        const requestResult = await response.json();

        const result = requestResult["result"];
        console.debug(
          { actionName: action.name, result },
          "Executed remote action"
        );
        return result;
      } catch (error) {
        if (
          error instanceof HyperchoError ||
          error instanceof HyperchoLowLevelError
        ) {
          throw error;
        }
        throw new HyperchoLowLevelError({
          error: new Error(String(error)),
          url: fetchUrl,
        });
      }
    },
  }));

  const agents = totalAgents
    ? json["agents"].map((agent) => ({
        name: agent.name,
        description: agent.description,
        parameters: [] as [],
        handler: async () => {},

        remoteAgentHandler: async ({
          name,
          actionInputsWithoutAgents,
          threadId,
          nodeName,
          additionalMessages = [],
          metaEvents,
        }: RemoteAgentHandlerParams): Promise<Observable<RuntimeEvent>> => {
          console.debug({ actionName: agent.name }, "Executing remote agent");

          const headers = createHeaders(onBeforeRequest);

          let state = {};
          let config = {};
          if (agentStates) {
            const jsonState = agentStates.find(
              (state) => state.agentName === name
            );
            if (jsonState) {
              state = parseJson(jsonState.state, {});
              config = parseJson(jsonState.config ?? "", {});
            }
          }

          const fetchUrl = `${url}/agents/execute`;
          try {
            const response = await fetchWithRetry(fetchUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                name,
                threadId,
                nodeName,
                messages: [...messages, ...additionalMessages],
                state,
                config,
                actions: tryMap(
                  actionInputsWithoutAgents,
                  (action: ActionInput) => ({
                    name: action.name,
                    description: action.description,
                    parameters: JSON.parse(action.jsonSchema),
                  })
                ),
                metaEvents,
              }),
            });

            if (!response.ok) {
              console.error(
                { url, status: response.status, body: await response.text() },
                "Failed to execute remote agent"
              );
              if (response.status === 404) {
                throw new HyperchoApiDiscoveryError({ url: fetchUrl });
              }
              throw new ResolvedHyperchoError({
                status: response.status,
                url: fetchUrl,
                isRemoteEndpoint: true,
              });
            }

            if (agent.type === RemoteAgentType.LangGraph) {
              const eventSource = new RemoteLangGraphEventSource();
              writeJsonLineResponseToEventStream(
                response.body!,
                eventSource.eventStream$
              );
              return eventSource.processLangGraphEvents();
            } else if (agent.type === RemoteAgentType.CrewAI) {
              const eventStream$ = new RuntimeEventSubject();
              writeJsonLineResponseToEventStream(response.body!, eventStream$);
              return eventStream$;
            } else {
              throw new Error("Unsupported agent type");
            }
          } catch (error) {
            if (
              error instanceof HyperchoError ||
              error instanceof HyperchoLowLevelError
            ) {
              throw error;
            }
            throw new HyperchoLowLevelError({
              error: new Error(String(error)),
              url: fetchUrl,
            });
          }
        },
      }))
    : [];

  return [...actions, ...agents];
}

export function createHeaders(
  onBeforeRequest: CopilotKitEndpoint["onBeforeRequest"]
) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (onBeforeRequest) {
    const { headers: additionalHeaders } = onBeforeRequest({
      ctx: {},
    });
    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }
  }

  return headers;
}
