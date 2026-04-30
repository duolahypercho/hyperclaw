import { MessageOutput } from "./copilot-response.type";

export enum MetaEventName {
  LangGraphInterruptEvent = "LangGraphInterruptEvent",
  CopanionKitLangGraphInterruptEvent = "CopanionKitLangGraphInterruptEvent",
}

// Base interface for all meta events
export interface BaseMetaEvent {
  type: "MetaEvent";
  name: MetaEventName;
}

// Data structure for CopilotKit LangGraph interrupt events
export interface CopanionKitLangGraphInterruptEventData {
  value: string;
  messages: MessageOutput[];
}

// LangGraph interrupt event
export interface LangGraphInterruptEvent extends BaseMetaEvent {
  name: MetaEventName.LangGraphInterruptEvent;
  value: string;
  response?: string;
}

// CopilotKit LangGraph interrupt event
export interface CopanionKitLangGraphInterruptEvent extends BaseMetaEvent {
  name: MetaEventName.CopanionKitLangGraphInterruptEvent;
  data: CopanionKitLangGraphInterruptEventData;
  response?: string;
}

// Union type for all meta events
export type MetaEvent =
  | LangGraphInterruptEvent
  | CopanionKitLangGraphInterruptEvent;

// Type guards for meta event discrimination
export function isLangGraphInterruptEvent(
  event: MetaEvent
): event is LangGraphInterruptEvent {
  return event.name === MetaEventName.LangGraphInterruptEvent;
}

export function isCopanionKitLangGraphInterruptEvent(
  event: MetaEvent
): event is CopanionKitLangGraphInterruptEvent {
  return event.name === MetaEventName.CopanionKitLangGraphInterruptEvent;
}
