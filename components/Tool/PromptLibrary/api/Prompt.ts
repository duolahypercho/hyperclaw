import { hyperchoApi } from "$/services/http.config";
import {
  OptimizePrompt as OptimizePromptType,
  Prompt,
} from "../types";
import { StreamService } from "@OS/AI/StreamService";
import { apiRouteUtils } from "@OS/AI/utils";

export const getAllOptimizePrompt = async (): Promise<
  HyperchoResponse<OptimizePromptType[]>
> => {
  try {
    const response = await hyperchoApi
      .get("/Tools/prompt/OptimizePromptTemplate")
      .then((res) => {
        return res.data;
      });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const OptimizePromptService = async (
  promptId: string,
  prompt: string,
  templateId: string
): Promise<AsyncGenerator<string, void, unknown>> => {
  const streamService = new StreamService();


  const baseURL = apiRouteUtils("Tools/prompt/optimize")

  return streamService.streamText(baseURL, {
    method: "POST",
    body: {
      promptId,
      prompt,
      templateId,
    },
  });
};

export const patchUpdatePrompt = async (
  promptId: string,
  data: Partial<Prompt>
): Promise<HyperchoResponse<Prompt>> => {
  const response = await hyperchoApi.patch(`/Tools/prompt/${promptId}`, data);
  return response.data;
};

export const GetorCreatePrompt = async (
  promptId?: string
): Promise<HyperchoResponse<Prompt>> => {
  try {
    const response = await hyperchoApi
      .get(`/Tools/prompt/get-or-create/${promptId}`)
      .then((res) => {
        return res.data;
      });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const deletePromptService = async (
  promptId: string
): Promise<HyperchoResponse<void>> => {
  const response = await hyperchoApi.delete(`/Tools/prompt/${promptId}`);
  return response.data;
};
