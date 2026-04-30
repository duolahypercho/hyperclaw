import {
  PromptHistory,
  CategoryType,
  Prompt,
  PromptVersionDetails,
  PromptVersionSummary,
} from "../types";

const disabled = () =>
  Promise.reject(
    new Error("Prompt Library is not included in Hyperclaw Community Edition.")
  );

export const getPromptHistory = async ({
  page,
  limit = 10,
}: {
  page: number;
  limit: number;
}): Promise<HyperchoPaginatedResponse<PromptHistory[]>> => {
  return disabled();
};

export const CreatePromptLibrary = async (): Promise<
  HyperchoResponse<Prompt>
> => {
  return disabled();
};

export const getPromptCategories = async (): Promise<
  HyperchoResponse<CategoryType[]>
> => {
  return disabled();
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
  return disabled();
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
  return disabled();
};
