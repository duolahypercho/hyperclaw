import { AutosuggestionsConfig } from ".";
import { InsertionsApiConfig } from "./insertions-api-config";
import { SuggestionsApiConfig } from "./suggestions-api-config";
import { EnhanceTextApiConfig } from "./enhance-api-config";

// Mostly mirrors a partial SuggestionsApiConfig, but with some fields MANDATORY.
export interface SuggestionsApiConfigUserSpecified
  extends Partial<SuggestionsApiConfig> {}

// Mostly mirrors a partial InsertionsApiConfig, but with some fields MANDATORY.
export interface InsertionsApiConfigUserSpecified
  extends Partial<InsertionsApiConfig> {}

// Mostly mirrors a partial EnhanceTextApiConfig, but with some fields MANDATORY.
export interface EnhanceTextApiConfigUserSpecified
  extends Partial<EnhanceTextApiConfig> {}

// Mostly mirrors a partial AutosuggestionsConfig, but with some fields MANDATORY.
/**
 * Configuration options for the autosuggestions feature
 * @property textareaPurpose - Purpose/context of the textarea (required)
 * @property disabledAutosuggestionsWhenTyping - Whether to disable suggestions while typing
 * @property onClickEnhanced - Handler for when enhanced text is clicked
 * @property chatApiConfigs - API configurations for different suggestion types
 * @property chatApiConfigs.suggestionsApiConfig - Config for real-time suggestions
 * @property chatApiConfigs.insertionApiConfig - Config for text insertions
 * @property chatApiConfigs.enhanceTextApiConfig - Config for text enhancement
 */
export interface AutosuggestionsConfigUserSpecified
  extends Partial<
    Omit<AutosuggestionsConfig, "chatApiConfigs" | "textareaPurpose">
  > {
  textareaPurpose: string; // the user MUST specify textareaPurpose - it's not optional
  disabledAutosuggestionsWhenTyping?: boolean;
  onClickEnhanced?: (event: React.MouseEvent<HTMLDivElement>) => void;
  chatApiConfigs: {
    suggestionsApiConfig?: SuggestionsApiConfigUserSpecified;
    insertionApiConfig?: InsertionsApiConfigUserSpecified;
    enhanceTextApiConfig?: EnhanceTextApiConfigUserSpecified;
  };
}
