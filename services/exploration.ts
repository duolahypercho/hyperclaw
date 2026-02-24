import { entrepriseApi } from "./http.config";

export const generateExplorationFriend = async ({
  userId,
  businessId,
  input,
}: {
  userId: string;
  businessId:string;
  input: string;

}) =>
  entrepriseApi.post(`/Exploration/generateChat`, {
    userId,
    businessId,
    input,
  });
  
export const generateExplorationAssistant = async ({
  userId,
  entrepriseId,
  chatbotid,
  chatId,
}: {
  userId: string;
  entrepriseId: string;
  chatbotid: string;
  chatId: string;
}) =>
  entrepriseApi.post(`/Exploration/generateAssistantChat`, {
    userId,
    entrepriseId,
    chatbotid,
    chatId,
  });
