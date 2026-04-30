import {
  ConversationResponse,
  DeleteConversationRequest,
  DeleteConversationResponse,
  ConversationRequest,
} from "../types";
import { apiRouteUtils } from "../utils";

export const getOrCreateConversation = async ({
  initialMessages,
  conversationId,
}: ConversationRequest): Promise<HyperchoResponse<ConversationResponse>> => {
  try {
    const response = await fetch(apiRouteUtils("Copanion/Conversation"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        initialMessages,
      }),
    }).then((res) => res.json());
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
    const response = await fetch(apiRouteUtils(`Copanion/Conversation/${conversationId}`), {
      method: "DELETE",
    }).then((res) => res.json());
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
