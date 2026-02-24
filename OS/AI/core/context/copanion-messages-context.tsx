/**
 * An internal context to separate the messages state (which is constantly changing) from the rest of CopilotKit context
 */

import { Message } from "@OS/AI/runtime-client";
import React from "react";
import { SuggestionItem } from "../utils/suggestions";

export interface CopanionMessagesContextParams {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>; // suggestions state
  suggestions: SuggestionItem[];
  setSuggestions: React.Dispatch<React.SetStateAction<SuggestionItem[]>>;
}

const emptyCopanionContext: CopanionMessagesContextParams = {
  messages: [],
  setMessages: () => [],
  // suggestions state
  suggestions: [],
  setSuggestions: () => [],
};

export const CopanionMessagesContext =
  React.createContext<CopanionMessagesContextParams>(emptyCopanionContext);

export function useCopanionMessagesContext(): CopanionMessagesContextParams {
  const context = React.useContext(CopanionMessagesContext);
  if (context === emptyCopanionContext) {
    throw new Error(
      "A messages consuming component was not wrapped with `<CopanionMessages> {...} </CopanionMessages>`"
    );
  }
  return context;
}
