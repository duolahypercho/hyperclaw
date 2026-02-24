import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Debouncer } from "../lib/debouncer";
import { nullableCompatibleEqualityCheck } from "../utils";
import { AutosuggestionsBareFunction } from "../types";
import { AutosuggestionState } from "../types";
import {
  EditorAutocompleteState,
  EditorEnhancedState,
  areEqual_autocompleteState,
  areEqual_enhancedState,
} from "../types/editor-autocomplete-state";
import { EnhanceTextBareFunction } from "../types/autosuggestions-bare-function";

export interface UseAutosuggestionsResult {
  currentAutocompleteSuggestion: AutosuggestionState | null;
  onChangeHandler: (newEditorState: EditorAutocompleteState | null) => void;
  onKeyDownHandler: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onTouchStartHandler: (event: React.TouchEvent<HTMLDivElement>) => void;
  onClickEnhancedHandler: (newEditorState: EditorEnhancedState | null) => void;
}

export function useAutosuggestions(
  debounceTime: number,
  shouldAcceptAutosuggestionOnKeyPress: (
    event: React.KeyboardEvent<HTMLDivElement>
  ) => boolean,
  shouldAcceptAutosuggestionOnTouch: (
    event: React.TouchEvent<HTMLDivElement>
  ) => boolean,
  autosuggestionFunction: AutosuggestionsBareFunction,
  insertAutocompleteSuggestion: (suggestion: AutosuggestionState) => void,
  replaceEnhancedSuggestion: (suggestion: ReadableStream<string>) => void,
  disableWhenEmpty: boolean,
  disabled: boolean,
  disabledAutosuggestionsWhenTyping: boolean,
  enhanceTextFunction: EnhanceTextBareFunction
): UseAutosuggestionsResult {
  const [previousAutocompleteState, setPreviousAutocompleteState] =
    useState<EditorAutocompleteState | null>(null);

  const [previousEnhancedState, setPreviousEnhancedState] =
    useState<EditorEnhancedState | null>(null);

  const [currentAutocompleteSuggestion, setCurrentAutocompleteSuggestion] =
    useState<AutosuggestionState | null>(null);

  const awaitForAndAppendSuggestion: (
    editorAutocompleteState: EditorAutocompleteState,
    abortSignal: AbortSignal
  ) => Promise<void> = useCallback(
    async (
      editorAutocompleteState: EditorAutocompleteState,
      abortSignal: AbortSignal
    ) => {
      // early return if disabled
      if (disabled) {
        return;
      }

      if (
        disableWhenEmpty &&
        editorAutocompleteState.textBeforeCursor === "" &&
        editorAutocompleteState.textAfterCursor === ""
      ) {
        return;
      }

      // fetch the suggestion
      const suggestion = await autosuggestionFunction(
        editorAutocompleteState,
        abortSignal
      );

      // We'll assume for now that the autocomplete function might or might not respect the abort signal.
      if (!suggestion || abortSignal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      setCurrentAutocompleteSuggestion({
        text: suggestion,
        point: editorAutocompleteState.cursorPoint,
      });
    },
    [
      autosuggestionFunction,
      setCurrentAutocompleteSuggestion,
      disableWhenEmpty,
      disabled,
    ]
  );

  const debouncedFunction = useMemo(
    () =>
      new Debouncer<[editorAutocompleteState: EditorAutocompleteState]>(
        debounceTime
      ),
    [debounceTime]
  );

  const debouncedEnhancedFunction = useMemo(
    () =>
      new Debouncer<[editorEnhancedState: EditorEnhancedState]>(debounceTime),
    [debounceTime]
  );

  // clean current state when unmounting or disabling
  useEffect(() => {
    return () => {
      debouncedFunction.cancel();
      setCurrentAutocompleteSuggestion(null);
    };
  }, [debouncedFunction, disabled]);

  const onChange = useCallback(
    (newEditorState: EditorAutocompleteState | null) => {
      const editorStateHasChanged = !nullableCompatibleEqualityCheck(
        areEqual_autocompleteState,
        previousAutocompleteState,
        newEditorState
      );
      setPreviousAutocompleteState(newEditorState);

      // if no change, do nothing
      if (!editorStateHasChanged) {
        return;
      }

      // if change, then first null out the current suggestion
      setCurrentAutocompleteSuggestion(null);

      // then try to get a new suggestion, debouncing to avoid too many requests while typing
      if (newEditorState) {
        if (!disabledAutosuggestionsWhenTyping) {
          debouncedFunction.debounce(
            awaitForAndAppendSuggestion,
            newEditorState
          );
        }
      } else {
        debouncedFunction.cancel();
      }
    },
    [
      previousAutocompleteState,
      setPreviousAutocompleteState,
      debouncedFunction,
      awaitForAndAppendSuggestion,
      setCurrentAutocompleteSuggestion,
    ]
  );

  const awaitForAndEnhanceText: (
    editorEnhancedState: EditorEnhancedState,
    abortSignal: AbortSignal
  ) => Promise<void> = useCallback(
    async (
      editorEnhancedState: EditorEnhancedState,
      abortSignal: AbortSignal
    ) => {
      // fetch the suggestion
      const suggestion = await enhanceTextFunction(
        editorEnhancedState,
        abortSignal
      );

      // We'll assume for now that the autocomplete function might or might not respect the abort signal.
      if (!suggestion || abortSignal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      replaceEnhancedSuggestion(suggestion);
    },
    [
      enhanceTextFunction,
      setCurrentAutocompleteSuggestion,
      disableWhenEmpty,
      disabled,
    ]
  );

  const onClickEnhanced = useCallback(
    (newEditorState: EditorEnhancedState | null) => {
      const editorStateHasChanged = !nullableCompatibleEqualityCheck(
        areEqual_enhancedState,
        previousEnhancedState,
        newEditorState
      );
      setPreviousEnhancedState(newEditorState);

      // if no change, do nothing
      if (!editorStateHasChanged) {
        return;
      }

      // if change, then first null out the current suggestion
      setCurrentAutocompleteSuggestion(null);

      // then try to get a new suggestion, debouncing to avoid too many requests while typing
      if (newEditorState) {
        debouncedEnhancedFunction.debounce(
          awaitForAndEnhanceText,
          newEditorState
        );
      } else {
        debouncedEnhancedFunction.cancel();
      }
    },
    [
      previousAutocompleteState,
      setPreviousAutocompleteState,
      debouncedFunction,
      awaitForAndEnhanceText,
      setCurrentAutocompleteSuggestion,
    ]
  );

  const keyDownOrTouchHandler = useCallback(
    (
      event:
        | React.KeyboardEvent<HTMLDivElement>
        | React.TouchEvent<HTMLDivElement>
    ) => {
      if (currentAutocompleteSuggestion) {
        const shouldAcceptSuggestion =
          event.type === "touchstart"
            ? shouldAcceptAutosuggestionOnTouch(
                event as React.TouchEvent<HTMLDivElement>
              )
            : shouldAcceptAutosuggestionOnKeyPress(
                event as React.KeyboardEvent<HTMLDivElement>
              );

        if (shouldAcceptSuggestion) {
          event.preventDefault();
          insertAutocompleteSuggestion(currentAutocompleteSuggestion);
          setCurrentAutocompleteSuggestion(null);
        }
      }
    },
    [
      currentAutocompleteSuggestion,
      setCurrentAutocompleteSuggestion,
      insertAutocompleteSuggestion,
      shouldAcceptAutosuggestionOnKeyPress,
    ]
  );

  return {
    currentAutocompleteSuggestion,
    onChangeHandler: onChange,
    onClickEnhancedHandler: onClickEnhanced,
    onKeyDownHandler: keyDownOrTouchHandler,
    onTouchStartHandler: keyDownOrTouchHandler,
  };
}
