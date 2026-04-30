import { Action, HyperchoErrorCode } from "@OS/AI/shared";
import { Message, ActionInput, AgentStateInput } from "../backend";
import { RuntimeEvent } from "../service-adapters/events";
import { Observable } from "rxjs";
import {
  constructLGCRemoteAction,
  constructRemoteActions,
  createHeaders,
} from "./remote-action-constructors";
import {
  HyperchoLowLevelError,
  ResolvedHyperchoError,
  HyperchoError,
} from "@OS/AI/shared";
import { MetaEventInput } from "../backend/inputs";
import { AbstractAgent } from "@ag-ui/client";
import { constructAGUIRemoteAction } from "./agui-action";

export type EndpointDefinition = CopilotKitEndpoint | LangGraphPlatformEndpoint;

export enum EndpointType {
  CopilotKit = "copilotKit",
  LangGraphPlatform = "langgraph-platform",
}

export interface BaseEndpointDefinition<TActionType extends EndpointType> {
  type?: TActionType;
}

export interface CopilotKitEndpoint
  extends BaseEndpointDefinition<EndpointType.CopilotKit> {
  url: string;
  onBeforeRequest?: ({ ctx }: { ctx: any }) => {
    headers?: Record<string, string> | undefined;
  };
}

export interface LangGraphPlatformAgent {
  name: string;
  description: string;
  assistantId?: string;
}

export interface LangGraphPlatformEndpoint
  extends BaseEndpointDefinition<EndpointType.LangGraphPlatform> {
  deploymentUrl: string;
  langsmithApiKey?: string | null;
  agents: LangGraphPlatformAgent[];
}

export type RemoteActionInfoResponse = {
  actions: any[];
  agents: any[];
};

export type RemoteAgentHandlerParams = {
  name: string;
  actionInputsWithoutAgents: ActionInput[];
  threadId?: string;
  nodeName?: string;
  additionalMessages?: Message[];
  metaEvents?: MetaEventInput[];
};

export type RemoteAgentAction = Action<any> & {
  remoteAgentHandler: (
    params: RemoteAgentHandlerParams
  ) => Promise<Observable<RuntimeEvent>>;
};

export function isRemoteAgentAction(
  action: Action<any>
): action is RemoteAgentAction {
  if (!action) {
    return false;
  }
  return typeof (action as RemoteAgentAction).remoteAgentHandler === "function";
}

async function fetchRemoteInfo({
  url,
  onBeforeRequest,
  frontendUrl,
}: {
  url: string;
  onBeforeRequest?: CopilotKitEndpoint["onBeforeRequest"];
  frontendUrl?: string;
}): Promise<RemoteActionInfoResponse> {
  console.debug({ url }, "Fetching actions from url");
  const headers = createHeaders(onBeforeRequest);

  const fetchUrl = `${url}/info`;
  try {
    const response = await fetch(fetchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        properties: {},
        frontendUrl,
      }),
    });

    if (!response.ok) {
      console.error(
        { url, status: response.status, body: await response.text() },
        "Failed to fetch actions from url"
      );
      throw new ResolvedHyperchoError({
        status: response.status,
        url: fetchUrl,
        isRemoteEndpoint: true,
      });
    }

    const json = await response.json();
    console.debug({ json }, "Fetched actions from url");
    return json;
  } catch (error: any) {
    if (error instanceof HyperchoError) {
      throw error;
    }
    throw new HyperchoLowLevelError({
      error: new Error(String(error)),
      url: fetchUrl,
    });
  }
}

export async function setupRemoteActions({
  remoteEndpointDefinitions,
  messages,
  agentStates,
  frontendUrl,
  agents,
  metaEvents,
  nodeName,
}: {
  remoteEndpointDefinitions: EndpointDefinition[];
  messages: Message[];
  agentStates?: AgentStateInput[];
  frontendUrl?: string;
  agents: Record<string, AbstractAgent>;
  metaEvents?: MetaEventInput[];
  nodeName?: string;
}): Promise<Action[]> {
  const threadMetadata = {};

  // Remove duplicates of remoteEndpointDefinitions.url
  const filtered = remoteEndpointDefinitions.filter((value, index, self) => {
    if (value.type === EndpointType.LangGraphPlatform) {
      return value;
    }
    return (
      index ===
      self.findIndex(
        (t: EndpointDefinition) =>
          (t as CopilotKitEndpoint).url === (value as CopilotKitEndpoint).url
      )
    );
  });

  const result = await Promise.all(
    filtered.map(async (endpoint) => {
      // Check for properties that can distinguish LG platform from other actions
      if (endpoint.type === EndpointType.LangGraphPlatform) {
        return constructLGCRemoteAction({
          endpoint,
          messages,
          agentStates,
        });
      }

      const json = await fetchRemoteInfo({
        url: (endpoint as CopilotKitEndpoint).url,
        onBeforeRequest: (endpoint as CopilotKitEndpoint).onBeforeRequest,
        frontendUrl,
      });

      return constructRemoteActions({
        json,
        messages,
        url: (endpoint as CopilotKitEndpoint).url,
        onBeforeRequest: (endpoint as CopilotKitEndpoint).onBeforeRequest,
        agentStates,
      });
    })
  );

  for (const [key, agent] of Object.entries(agents)) {
    if (agent.agentId !== undefined && agent.agentId !== key) {
      throw new HyperchoError({
        message: `Agent ${key} has agentId ${agent.agentId} which does not match the key ${key}`,
        code: HyperchoErrorCode.UNKNOWN,
      });
    } else if (agent.agentId === undefined) {
      agent.agentId = key;
    }

    result.push(
      constructAGUIRemoteAction({
        messages,
        agentStates,
        agent,
        metaEvents,
        threadMetadata,
        nodeName,
      })
    );
  }

  return result.flat();
}
