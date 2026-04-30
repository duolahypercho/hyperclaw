import { BaseAutosuggestionsConfig } from ".";
import { defaultCopanionContextCategories } from "@OS/AI/core/copanionkit";

// by default, command-k or ctrl-k toggles the hovering editor
const defaultShouldToggleHoveringEditorOnKeyPress = (
  event: React.KeyboardEvent<HTMLDivElement>,
  shortcut: string
) => {
  // if command-k or ctrl-k, toggle the hovering editor
  if (event.key === shortcut && (event.metaKey || event.ctrlKey)) {
    return true;
  }
  return false;
};

const defaultShouldAcceptAutosuggestionOnKeyPress = (
  event: React.KeyboardEvent<HTMLDivElement>
) => {
  // if tab, accept the autosuggestion
  if (event.key === "Tab") {
    return true;
  }
  return false;
};

const defaultShouldAcceptAutosuggestionOnTouch = () => false;

export const defaultBaseAutosuggestionsConfig: Omit<
  BaseAutosuggestionsConfig,
  "textareaPurpose" | "apiConfig"
> = {
  debounceTime: 250,
  contextCategories: defaultCopanionContextCategories,
  disableWhenEmpty: true,
  disabled: false,
  temporarilyDisableWhenMovingCursorWithoutChangingText: true,
  shouldToggleHoveringEditorOnKeyPress:
    defaultShouldToggleHoveringEditorOnKeyPress,
  shouldAcceptAutosuggestionOnKeyPress:
    defaultShouldAcceptAutosuggestionOnKeyPress,
  shouldAcceptAutosuggestionOnTouch: defaultShouldAcceptAutosuggestionOnTouch,
  disabledAutosuggestionsWhenTyping: false,
};
