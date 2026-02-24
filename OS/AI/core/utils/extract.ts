import {
  Action,
  MappedParameterTypes,
  Parameter,
  actionParametersToJsonSchema,
} from "@OS/AI/shared";
import {
  MessageRole,
  CopanionRequestType,
  ForwardedParametersInput,
} from "@OS/AI/runtime";
import {
  ActionExecutionMessage,
  Message,
  TextMessage,
  convertMessagesToApiFormat,
  filterAgentStateMessages,
  convertApiOutputToMessages,
} from "@OS/AI/runtime-client";
import {
  CopanionContextParams,
  CopanionMessagesContextParams,
} from "../context";
import { defaultCopanionContextCategories } from "@OS/AI/core/copanionkit";

interface InitialState<T extends Parameter[] | [] = []> {
  status: "initial";
  args: Partial<MappedParameterTypes<T>>;
}

interface InProgressState<T extends Parameter[] | [] = []> {
  status: "inProgress";
  args: Partial<MappedParameterTypes<T>>;
}

interface CompleteState<T extends Parameter[] | [] = []> {
  status: "complete";
  args: MappedParameterTypes<T>;
}

type StreamHandlerArgs<T extends Parameter[] | [] = []> =
  | InitialState<T>
  | InProgressState<T>
  | CompleteState<T>;

interface ExtractOptions<T extends Parameter[]> {
  context: CopanionContextParams & CopanionMessagesContextParams;
  instructions: string;
  parameters: T;
  include?: IncludeOptions;
  data?: any;
  abortSignal?: AbortSignal;
  stream?: (args: StreamHandlerArgs<T>) => void;
  requestType?: CopanionRequestType;
  forwardedParameters?: ForwardedParametersInput;
}

interface IncludeOptions {
  readable?: boolean;
  messages?: boolean;
}

export async function extract<const T extends Parameter[]>({
  context,
  instructions,
  parameters,
  include,
  data,
  abortSignal,
  stream,
  requestType = CopanionRequestType.Task,
  forwardedParameters,
}: ExtractOptions<T>): Promise<MappedParameterTypes<T>> {
  const { messages } = context;

  const action: Action<any> = {
    name: "extract",
    description: instructions,
    parameters,
    handler: (args: any) => {},
  };

  const includeReadable = include?.readable ?? false;
  const includeMessages = include?.messages ?? false;

  let contextString = "";

  if (data) {
    contextString =
      (typeof data === "string" ? data : JSON.stringify(data)) + "\n\n";
  }

  if (includeReadable) {
    contextString += context.getContextString(
      [],
      defaultCopanionContextCategories
    );
  }

  const systemMessage: Message = new TextMessage({
    content: makeSystemMessage(contextString, instructions),
    role: MessageRole.system,
  });

  const instructionsMessage: Message = new TextMessage({
    content: makeInstructionsMessage(instructions),
    role: MessageRole.user,
  });

  const response = context.runtimeClient.asStream(
    context.runtimeClient.generateCopanionResponse({
      data: {
        frontend: {
          actions: [
            {
              name: action.name,
              description: action.description || "",
              jsonSchema: JSON.stringify(
                actionParametersToJsonSchema(action.parameters || [])
              ),
            },
          ],
          url: window.location.href,
        },

        messages: convertMessagesToApiFormat(
          includeMessages
            ? [
                systemMessage,
                instructionsMessage,
                ...filterAgentStateMessages(messages),
              ]
            : [systemMessage, instructionsMessage]
        ),

        metadata: {
          requestType: requestType,
        },

        forwardedParameters: {
          ...(forwardedParameters ?? {}),
          toolChoice: "function",
          toolChoiceFunctionName: action.name,
        },
      },
      properties: context.copanionApiConfig.properties,
      signal: abortSignal,
    })
  );

  const reader = response.getReader();

  let isInitial = true;

  let actionExecutionMessage: ActionExecutionMessage | undefined = undefined;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (abortSignal?.aborted) {
      throw new Error("Aborted");
    }

    const responseData = JSON.parse(value as string);
    actionExecutionMessage = convertApiOutputToMessages(
      responseData.generateCopanionResponse.messages
    ).find((msg) => msg.isActionExecutionMessage()) as
      | ActionExecutionMessage
      | undefined;

    if (!actionExecutionMessage) {
      continue;
    }

    stream?.({
      status: isInitial ? "initial" : "inProgress",
      args: actionExecutionMessage.arguments as Partial<
        MappedParameterTypes<T>
      >,
    });

    isInitial = false;
  }

  if (!actionExecutionMessage) {
    throw new Error("extract() failed: No function call occurred");
  }

  stream?.({
    status: "complete",
    args: actionExecutionMessage.arguments as MappedParameterTypes<T>,
  });

  return actionExecutionMessage.arguments as MappedParameterTypes<T>;
}

// We need to put this in a user message since some LLMs need
// at least one user message to function
function makeInstructionsMessage(instructions: string): string {
  return `
The user has given you the following task to complete:

\`\`\`
${instructions}
\`\`\`

Any additional messages provided are for providing context only and should not be used to ask questions or engage in conversation.
`;
}

function makeSystemMessage(
  contextString: string,
  instructions: string
): string {
  return `
Please act as an efficient, competent, conscientious, and industrious professional assistant.

Help the user achieve their goals, and you do so in a way that is as efficient as possible, without unnecessary fluff, but also without sacrificing professionalism.
Always be polite and respectful, and prefer brevity over verbosity.

The user has provided you with the following context:
\`\`\`
${contextString}
\`\`\`

They have also provided you with a function called extract you MUST call to initiate actions on their behalf.

Please assist them as best you can.

This is not a conversation, so please do not ask questions. Just call the function without saying anything else.
`;
}
