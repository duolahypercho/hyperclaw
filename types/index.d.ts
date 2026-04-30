export type FetchState = "loading" | "idle" | "error" | "notFound";
export {
  homeStateTypes,
  exploreStateTypes,
  homeFetchStepTypes,
} from "./provider";

export interface L_popups {
  Msg?: string;
  show: Booleanish;
  noNav?: boolean;
  setValue?: boolean | string;
}

export type editTypes = "styles" | "info";

export interface popups extends L_popups {
  setShow: Dispatch<SetStateAction<string>>;
}

export type MessageContent =
  | MessageTypeContent
  | ImageMessageContent
  | AudioMessageContent;

export type MessageTypeContent = {
  type: "text";
  text: string;
};

export type ImageMessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AudioMessageContent = {
  type: "input_audio";
  audio_data: {
    base64: string;
    mime_type: string;
  };
};

export interface Message {
  id: string;
  content: string | MessageContent[];
  role: "system" | "user" | "assistant" | "tool";
  display?: boolean;
  timestamp?: number;
}

export interface PromptMessage extends Message {
  animation?: boolean;
}

export interface FormattedMessage extends Omit<Message, "display"> {}

// Re-export PromptVariable from PromptLibrary types
export type { PromptVariable } from "$/components/Tool/PromptLibrary/types";
