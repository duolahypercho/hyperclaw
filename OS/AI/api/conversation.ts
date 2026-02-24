import { hyperchoApi } from "$/services/http.config";
import {
  ConversationResponse,
  DeleteConversationRequest,
  DeleteConversationResponse,
  ConversationRequest,
} from "../types";

export const getOrCreateConversation = async ({
  initialMessages,
  conversationId,
}: ConversationRequest): Promise<HyperchoResponse<ConversationResponse>> => {
  try {
    const response = await hyperchoApi
      .post("/Copanion/Conversation", {
        conversationId,
        initialMessages,
      })
      .then((res) => {
        return res.data;
      });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const deleteConversation = async ({
  conversationId,
}: DeleteConversationRequest): Promise<
  HyperchoResponse<DeleteConversationResponse>
> => {
  try {
    const response = await hyperchoApi
      .delete(`/Copanion/Conversation/${conversationId}`)
      .then((res) => {
        return res.data;
      });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
