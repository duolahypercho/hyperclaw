import { entrepriseApi } from "./http.config";

export const deleteChatHistoryAPI = async (chatId: string) =>
  entrepriseApi.delete(`/Chat/deleteChatHistory`, {
    data: {
      chatId: chatId,
    },
  });

export const addChatAPI = async ({
  chatId,
  chat,
  role,
}: {
  chatId: string;
  chat: any;
  role: string;
}) =>
  entrepriseApi.post(`/Chat/addChat`, {
    chatId: chatId,
    chat: chat,
    role: role,
  });

export const getChatInfoAPI = async ({
  chatbotId,
  userId,
}: {
  chatbotId: string | string[] | undefined;
  userId: string;
}) =>
  entrepriseApi.post(`/Chat/getChatInfo`, {
    chatbotId: chatbotId,
    userId: userId,
  });

export const createChatInfoAPI = async ({
  chatbotId,
  userId,
}: {
  chatbotId: string | string[] | undefined;
  userId: string;
}) =>
  entrepriseApi.post(`/Chat/createChatInfo`, {
    chatbotId: chatbotId,
    userId: userId,
  });

export const getTempChatAPI = async ({
  chatbotId,
  userId,
}: {
  chatbotId: string | string[] | undefined;
  userId: string;
}) =>
  entrepriseApi.post(`/Chat/getTempChat`, {
    userId: userId,
    chatbotId: chatbotId,
  });

export const createTempChatAPI = async ({
  chatbotId,
}: {
  chatbotId: string | string[] | undefined;
}) =>
  entrepriseApi.post(`/Chat/createTempChat`, {
    chatbotId: chatbotId,
  });

export const editMemoryContent = async ({
  chatbotId,
  chatId,
  name,
  value
}: {
  chatbotId: string;
  chatId: string;
  name:string;
  value:string;
}) =>
  entrepriseApi.post(`/Chat/editMemory`, {
    chatbotId: chatbotId,
    chatId: chatId,
    name: name,
    value: value
  });
