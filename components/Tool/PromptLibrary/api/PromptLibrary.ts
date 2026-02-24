import { hyperchoApi } from "$/services/http.config";
import {
  PromptHistory,
  CategoryType,
  Prompt,
  PromptVersionDetails,
  PromptVersionSummary,
} from "../types";

export const getPromptHistory = async ({
  page,
  limit = 10,
}: {
  page: number;
  limit: number;
}): Promise<HyperchoPaginatedResponse<PromptHistory[]>> => {
  try {
    const response = await hyperchoApi
      .get(`/Tools/prompt/history`, {
        params: {
          page,
          limit,
        },
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

export const CreatePromptLibrary = async (): Promise<
  HyperchoResponse<Prompt>
> => {
  try {
    const response = await hyperchoApi
      .post("/Tools/prompt/create")
      .then((res) => {
        return res.data;
      });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const getPromptCategories = async (): Promise<
  HyperchoResponse<CategoryType[]>
> => {
  try {
    const response = await hyperchoApi
      .get("/Tools/prompt/library/categories")
      .then((res) => {
        return res.data;
      });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const publishPrompt = async ({
  promptId,
  promptName,
  promptCategory,
  promptDescription,
  promptImage,
  status,
}: {
  promptId: string;
  promptName: string;
  promptCategory: string;
  promptDescription: string;
  promptImage?: string;
  status: "draft" | "active" | "archived" | "pending";
}): Promise<HyperchoResponse<Prompt>> => {
  try {
    const response = await hyperchoApi
      .post(`/Tools/prompt/publish/${promptId}`, {
        promptName,
        promptCategory,
        promptDescription,
        promptImage,
        status,
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

export const getLibraryPrompts = async ({
  page = 1,
  limit = 10,
  category,
  search,
  filter,
}: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  filter?: string;
}): Promise<
  HyperchoResponse<{
    prompts: Prompt[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }>
> => {
  try {
    const params: any = { page, limit };
    if (category) params.category = category;
    if (search) params.search = search;
    if (filter) params.filter = filter;

    const response = await hyperchoApi
      .get("/Tools/prompt/library", { params })
      .then((res) => {
        return res.data;
      });
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
