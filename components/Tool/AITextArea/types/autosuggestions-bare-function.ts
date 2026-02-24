import { DocumentPointer } from "$/OS/AI/core/copanionkit";
import { FormattedMessage } from "../../../../types";

export interface InsertionEditorState {
  textBeforeCursor: string;
  textAfterCursor: string;
}

export interface EnhancedEditorState {
  entireText: string;
  enhancedText?: string;
  systemPrompt?: string;
  history?: FormattedMessage[];
}

export interface EditingEditorState extends InsertionEditorState {
  selectedText: string;
  selection?: any;
}

export type AutosuggestionsBareFunction = (
  editorState: InsertionEditorState,
  abortSignal: AbortSignal
) => Promise<string>;

export type EnhanceTextBareFunction = (
  editorState: EnhancedEditorState,
  abortSignal: AbortSignal,
  systemPrompt?: string
) => Promise<ReadableStream<string>>;

export type Generator_InsertionOrEditingSuggestion = (
  editorState: EditingEditorState,
  prompt: string,
  documents: DocumentPointer[],
  abortSignal: AbortSignal,
  markdownMode?: boolean
) => Promise<ReadableStream<string>>;

export interface InsertionEditorApiConfig {
  insertionOrEditingFunction: Generator_InsertionOrEditingSuggestion;
}

export interface BaseCopilotTextareaApiConfig extends InsertionEditorApiConfig {
  autosuggestionsFunction: AutosuggestionsBareFunction;
}
