// Like the base autosuggestions config, with 2 additional fields:
// 1. contextCategories: string[] | undefined;
// 2. instead of apiConfigs, we have chatApiConfigs: a higher-level abstraction that uses a ChatGPT-like API endpoint.

import { defaultCopanionContextCategories } from "@OS/AI/core/copanionkit";
import { BaseAutosuggestionsConfig } from "..";
import { defaultBaseAutosuggestionsConfig } from "../base-autosuggestions-config";
import {
  SuggestionsApiConfig,
  defaultSuggestionsApiConfig,
} from "./suggestions-api-config";
import {
  InsertionsApiConfig,
  defaultInsertionsApiConfig,
} from "./insertions-api-config";
import {
  EditingApiConfig,
  defaultEditingApiConfig,
} from "./editing-api-config";
import {
  EnhanceTextApiConfig,
  defaultEnhanceTextApiConfig,
} from "./enhance-api-config";

export type MakeSystemPrompt = (
  textareaPurpose: string,
  contextString: string
) => string;

export interface AutosuggestionsConfig
  extends Omit<BaseAutosuggestionsConfig, "apiConfig"> {
  contextCategories: string[];
  chatApiConfigs: {
    suggestionsApiConfig: SuggestionsApiConfig;
    insertionApiConfig: InsertionsApiConfig;
    editingApiConfig: EditingApiConfig;
    enhanceTextApiConfig: EnhanceTextApiConfig;
  };
}

export const defaultAutosuggestionsConfig: Omit<
  AutosuggestionsConfig,
  "textareaPurpose" | "apiEndpoint"
> = {
  ...defaultBaseAutosuggestionsConfig,
  contextCategories: defaultCopanionContextCategories,
  chatApiConfigs: {
    suggestionsApiConfig: defaultSuggestionsApiConfig,
    insertionApiConfig: defaultInsertionsApiConfig,
    editingApiConfig: defaultEditingApiConfig,
    enhanceTextApiConfig: defaultEnhanceTextApiConfig,
  },
};
