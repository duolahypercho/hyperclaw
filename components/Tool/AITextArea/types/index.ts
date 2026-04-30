import { TextareaAutosize } from "@mui/material";
import { BaseEditor } from "slate";
import { ReactEditor } from "slate-react";
import { HistoryEditor } from "slate-history";
import { TextareaHTMLAttributes } from "react";
import { BasePoint } from "slate";
import {
  EnhanceTextBareFunction,
  Generator_InsertionOrEditingSuggestion,
} from "./autosuggestions-bare-function";
import { AutosuggestionsBareFunction } from "./autosuggestions-bare-function";
import { Descendant } from "slate";
import { FormattedMessage } from "../../../../types";
import { Point } from "slate";

export type { AutosuggestionsBareFunction } from "./autosuggestions-bare-function";

export interface HTMLCopanionTextAreaElement extends HTMLElement {
  /**
   * The current value of the textarea.
   */
  value: string;
  /**
   * focus on the textarea
   */
  focus: () => void;
  /**
   * unfocus the textarea.
   *
   * Called `blur` for syntactic compatibility with `HTMLTextAreaElement`.
   */
  blur: () => void;
  /**
   * Enhances the text content using provided parameters.
   * @param {EnhanceHandler} enhanceHandlerArgs - The enhancement configuration object
   * @param {string} [enhanceText] - Prompt for AI to enhance the text
   * @param {string} [systemPrompt] - Prompt for AI to enhance the text
   * @param {FormattedMessage[]} [history] - The conversation history to help AI understand the context
   */
  enhance: (enhanceHandlerArgs: EnhanceHandler) => void;

  insertText: (text: string, options?: { at?: Point }) => void;
}

export interface AITextAreaProps
  extends React.ComponentProps<typeof TextareaAutosize> {
  // Add any additional props if needed
}

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor;

export type SuggestionElement = {
  type: "suggestion";
  inline: boolean;
  content: string;
  children: CustomText[];
};

export type ToolBoxElement = {
  type:
    | "paragraph"
    | "block_quote"
    | "heading_one"
    | "heading_two"
    | "heading_three"
    | "horizontal_rule";
  children: CustomText[];
};

export type ToolBoxListElement = {
  type: "ul_list";
  children: Descendant[];
};

export type ToolBoxListItemElement = {
  type: "list_item";
  children: CustomText[];
};

export type ToolBoxImageElement = {
  type: "image";
  src: string;
  alt: string;
  loading: boolean;
  children: [{ text: "" }];
};

export type ToolBoxText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  underline?: boolean;
  animated?: boolean;
  link?: string;
};

export type CustomElement =
  | SuggestionElement
  | ToolBoxElement
  | ToolBoxListElement
  | ToolBoxListItemElement
  | ToolBoxImageElement;

export type CustomText = ToolBoxText;

declare module "slate" {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

export interface InsertionEditorApiConfig {
  insertionOrEditingFunction: Generator_InsertionOrEditingSuggestion;
}

export interface BaseTextareaApiConfig extends InsertionEditorApiConfig {
  autosuggestionsFunction: AutosuggestionsBareFunction;
  enhanceTextFunction: EnhanceTextBareFunction;
}

export interface BaseAutosuggestionsConfig {
  textareaPurpose: string;
  contextCategories: string[];
  debounceTime: number;
  apiConfig: BaseTextareaApiConfig;
  disabledAutosuggestionsWhenTyping: boolean;

  disableWhenEmpty: boolean;
  disabled: boolean;
  temporarilyDisableWhenMovingCursorWithoutChangingText: boolean;
  shouldAcceptAutosuggestionOnKeyPress: (
    event: React.KeyboardEvent<HTMLDivElement>
  ) => boolean;
  shouldAcceptAutosuggestionOnTouch: (
    event: React.TouchEvent<HTMLDivElement>
  ) => boolean;
  shouldToggleHoveringEditorOnKeyPress: (
    event: React.KeyboardEvent<HTMLDivElement>,
    shortcut: string
  ) => boolean;
}

export interface BaseTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLDivElement>, "onChange"> {
  /**
   * Specifies the CSS styles to apply to the placeholder text.
   */
  placeholderStyle?: React.CSSProperties;
  /**
   * Specifies the CSS styles to apply to the suggestions list.
   */
  suggestionsStyle?: React.CSSProperties;
  /**
   * A class name to apply to the editor popover window.
   */
  hoverMenuClassname?: string;
  /**
   * The initial value of the textarea. Can be controlled via `onValueChange`.
   */
  value?: string;
  /**
   * Callback invoked when the value of the textarea changes.
   */
  onValueChange?: (value: string) => void;
  /**
   * Callback invoked when a `change` event is triggered on the textarea element.
   */
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;

  /**
   * Callback invoked when the descendant of the Editor changes.
   */
  onDescendantChange?: (descendants: Descendant[]) => void;
  /**
   * The shortcut to use to open the editor popover window. Default is `"Cmd-k"`.
   */
  shortcut?: string;
  /**
   * Configuration settings for the autosuggestions feature.
   * Includes a mandatory `textareaPurpose` to guide the autosuggestions.
   */

  /**
   * Whether to show the toolbar.
   */
  showToolbar?: boolean;

  /**
   * The initial descendant of the Editor.
   */
  initialDescendant?: Descendant[];

  /**
   * Callback invoked when the immediate text changes.
   */
  onImmediateTextChange?: (text: string) => void;

  /**
   * Callback invoked when the generating state changes.
   */
  setgenerating?: React.Dispatch<React.SetStateAction<boolean>>;

  /**
   * Callback invoked when an image is uploaded.
   */
  handleImageUpload?: (file: File) => Promise<string | undefined>;

  /**
   * Whether to show the skeleton.
   */
  showSkeleton?: boolean;

  baseAutosuggestionsConfig: Partial<BaseAutosuggestionsConfig> & {
    textareaPurpose: string;
    apiConfig: BaseTextareaApiConfig;
  };
}
export interface AutosuggestionState {
  text: string;
  point: BasePoint;
}

export interface InsertionEditorState {
  textBeforeCursor: string;
  textAfterCursor: string;
}

export interface EditingEditorState extends InsertionEditorState {
  selectedText: string;
}

export interface MarkdownEditorState {
  descendantsBeforeCursor: Descendant[];
  selectedDescendants: Descendant[];
  descendantsAfterCursor: Descendant[];
}

export interface EnhanceHandler {
  enhanceText?: string;
  systemPrompt?: string;
  history?: FormattedMessage[];
}
