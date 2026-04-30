import {
  OptimizePrompt as OptimizePromptType,
  Prompt,
} from "../types";

const disabled = () =>
  Promise.reject(
    new Error("Prompt Library is not included in Hyperclaw Community Edition.")
  );

export const getAllOptimizePrompt = async (): Promise<
  HyperchoResponse<OptimizePromptType[]>
> => {
  return disabled();
};

export const OptimizePromptService = async (
  promptId: string,
  prompt: string,
  templateId: string
): Promise<AsyncGenerator<string, void, unknown>> => {
  return disabled();
};

export const patchUpdatePrompt = async (
  promptId: string,
  data: Partial<Prompt>
): Promise<HyperchoResponse<Prompt>> => {
  return disabled();
};

export const GetorCreatePrompt = async (
  promptId?: string
): Promise<HyperchoResponse<Prompt>> => {
  return disabled();
};

export const deletePromptService = async (
  promptId: string
): Promise<HyperchoResponse<void>> => {
  return disabled();
};
