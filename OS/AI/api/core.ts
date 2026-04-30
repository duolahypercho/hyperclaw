import { StreamService } from "@OS/AI/StreamService";
import { ChatModel } from "openai/resources";
import { ChatMessage } from "../utils/messageConverter";
import { apiRouteUtils } from "../utils";
interface BasicChatAPIProps {
  history?: ChatMessage[];
  model?: ChatModel;
}

const BasicChatAPI = async ({
  history,
  model,
}: BasicChatAPIProps): Promise<AsyncGenerator<string, void, unknown>> => {
  const streamService = new StreamService();
  const baseURL = apiRouteUtils("Copanion/streamBasicChat");

  return streamService.streamText(baseURL, {
    method: "POST",
    body: {
      history,
      model,
    },
  });
};

const BasicChatService = async (history: ChatMessage[], model: ChatModel) => {
  return await BasicChatAPI({
    history: history,
    model: model,
  });
};

interface CopanionChatAPIProps {
  history?: ChatMessage[];
  model?: ChatModel;
  chatId?: string;
}

const CopanionChatAPI = async ({
  history,
  model,
  chatId,
}: CopanionChatAPIProps): Promise<AsyncGenerator<string, void, unknown>> => {
  const streamService = new StreamService();
  const baseURL = apiRouteUtils("Copanion/Chat");

  return streamService.streamText(baseURL, {
    method: "POST",
    body: {
      history,
      model,
      chatId,
    },
  });
};

const CopanionChatService = async (
  history: ChatMessage[],
  model: ChatModel,
  chatId?: string
) => {
  return await CopanionChatAPI({
    history: history,
    model: model,
    chatId,
  });
};

export { BasicChatService, CopanionChatService };
