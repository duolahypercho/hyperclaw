import React from "react";
import { useMakeStandardAutosuggestionFunction } from "./hooks/make-autosuggestions-function/use-make-standard-autosuggestions-function";
import { HTMLCopanionTextAreaElement } from "./types";
import {
  AutosuggestionsConfig,
  defaultAutosuggestionsConfig,
} from "./types/autosuggestions-config";
import { BaseTextarea } from "./baseTextArea";
import { useMakeStandardInsertionOrEditingFunction } from "./hooks/make-autosuggestions-function/use-make-standard-insertion-function";
import merge from "lodash.merge";
import { AutosuggestionsConfigUserSpecified } from "./types/autosuggestions-config/autosuggestions-config-user-specified";
import { BaseTextareaProps } from "./types";
import { useMakeStandardEnhanceTextFunction } from "./hooks/make-autosuggestions-function/use-make-standard-enhanceText-function";

// but with baseAutosuggestionsConfig replaced with autosuggestionsConfig.
export interface CopanionTextareaProps
  extends Omit<BaseTextareaProps, "baseAutosuggestionsConfig"> {
  autosuggestionsConfig: AutosuggestionsConfigUserSpecified;
  setgenerating?: React.Dispatch<React.SetStateAction<boolean>>;
  showToolbar?: boolean;
  handleImageUpload?: (file: File) => Promise<string | undefined>;
  showSkeleton?: boolean;
}

/**
 * A copilot textarea that uses the standard autosuggestions function.
 */
export const CopilotTextarea = React.forwardRef(
  (
    props: CopanionTextareaProps,
    ref: React.Ref<HTMLCopanionTextAreaElement>
  ) => {
    // separate the AutosuggestionsConfigUserSpecified from the rest of the props
    const {
      autosuggestionsConfig: autosuggestionsConfigUserSpecified,
      setgenerating,
      suggestionsStyle,
      showToolbar = false,
      onDescendantChange,
      initialDescendant,
      handleImageUpload,
      showSkeleton,
      ...forwardedProps
    } = props;

    const autosuggestionsConfig: AutosuggestionsConfig = merge(
      defaultAutosuggestionsConfig,
      autosuggestionsConfigUserSpecified
    );

    const autosuggestionsFunction = useMakeStandardAutosuggestionFunction(
      autosuggestionsConfig.textareaPurpose,
      autosuggestionsConfig.contextCategories,
      autosuggestionsConfig.chatApiConfigs.suggestionsApiConfig
    );

    const enhanceTextFunction = useMakeStandardEnhanceTextFunction(
      autosuggestionsConfig.textareaPurpose,
      autosuggestionsConfig.contextCategories,
      autosuggestionsConfig.chatApiConfigs.enhanceTextApiConfig,
    );

    
    const insertionOrEditingFunction =
      useMakeStandardInsertionOrEditingFunction(
        autosuggestionsConfig.textareaPurpose,
        autosuggestionsConfig.contextCategories,
        autosuggestionsConfig.chatApiConfigs.insertionApiConfig,
        autosuggestionsConfig.chatApiConfigs.editingApiConfig
      );
    return (
      <>
        <BaseTextarea
          {...forwardedProps}
          ref={ref}
          suggestionsStyle={suggestionsStyle}
          showToolbar={showToolbar}
          onDescendantChange={onDescendantChange}
          initialDescendant={initialDescendant}
          setgenerating={setgenerating}
          handleImageUpload={handleImageUpload}
          showSkeleton={showSkeleton}
          baseAutosuggestionsConfig={{
            ...autosuggestionsConfig,
            apiConfig: {
              insertionOrEditingFunction: insertionOrEditingFunction,
              autosuggestionsFunction: autosuggestionsFunction,
              enhanceTextFunction: enhanceTextFunction,
            },
          }}
        />
      </>
    );
  }
);
