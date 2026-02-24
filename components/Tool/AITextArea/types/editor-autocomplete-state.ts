import { BasePoint } from "slate";
import { arraysAreEqual } from "../utils";
import { FormattedMessage } from "../../../../types";

export interface EditorAutocompleteState {
  cursorPoint: BasePoint;
  textBeforeCursor: string;
  textAfterCursor: string;
}

export function areEqual_autocompleteState(
  prev: EditorAutocompleteState,
  next: EditorAutocompleteState
) {
  return (
    prev.cursorPoint.offset === next.cursorPoint.offset &&
    arraysAreEqual(prev.cursorPoint.path, next.cursorPoint.path) &&
    prev.textBeforeCursor === next.textBeforeCursor &&
    prev.textAfterCursor === next.textAfterCursor
  );
}

export interface EditorEnhancedState {
  entireText: string;
  enhancedText?: string;
  systemPrompt?: string;
  history?: FormattedMessage[];
}

export function areEqual_enhancedState(
  prev: EditorEnhancedState,
  next: EditorEnhancedState
) {
  return (
    prev.entireText === next.entireText &&
    prev.enhancedText === next.enhancedText
  );
}
