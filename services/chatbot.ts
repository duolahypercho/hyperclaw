import { entrepriseApi } from "./http.config";

//get chatbot's information
export const fetchChatbotInfoByNameAPI = (
  chatbotName: string,
  businessName: string
) =>
  entrepriseApi.post(`/APIAccess/getChatbotInfoByName`, {
    chatbotName,
    businessName,
  });
