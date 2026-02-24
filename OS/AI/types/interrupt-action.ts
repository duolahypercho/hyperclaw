import { AgentSession } from "../core/context/copanion-context";
import { LangGraphInterruptEvent as MetaLangGraphInterruptEvent } from "@OS/AI/runtime";

// Create a generic version of LangGraphInterruptEvent that matches the expected interface
export interface LangGraphInterruptEvent<TEventValue = any> {
  type: "MetaEvent";
  name: "LangGraphInterruptEvent";
  value: TEventValue;
  response?: string;
}

export interface LangGraphInterruptRenderHandlerProps<TEventValue = any> {
  event: LangGraphInterruptEvent<TEventValue>;
  resolve: (resolution: string) => void;
}

export interface LangGraphInterruptRenderProps<TEventValue = any> {
  result: unknown;
  event: LangGraphInterruptEvent<TEventValue>;
  resolve: (resolution: string) => void;
}

export interface LangGraphInterruptRender<TEventValue = any> {
  id: string;
  /**
   * The handler function to handle the event.
   */
  handler?: (
    props: LangGraphInterruptRenderHandlerProps<TEventValue>
  ) => any | Promise<any>;
  /**
   * The render function to handle the event.
   */
  render?: (
    props: LangGraphInterruptRenderProps<TEventValue>
  ) => string | React.ReactElement;
  /**
   * Method that returns a boolean, indicating if the interrupt action should run
   * Useful when using multiple interrupts
   */
  enabled?: (args: {
    eventValue: TEventValue;
    agentMetadata: AgentSession;
  }) => boolean;
}

export type LangGraphInterruptAction = LangGraphInterruptRender & {
  event?: LangGraphInterruptEvent;
};

export type LangGraphInterruptActionSetterArgs =
  | (Partial<LangGraphInterruptRender> & {
      event?: Partial<LangGraphInterruptEvent>;
    })
  | null;
export type LangGraphInterruptActionSetter = (
  action: LangGraphInterruptActionSetterArgs
) => void;

// Utility function to convert from meta event to interrupt event
export function convertMetaEventToInterruptEvent<TEventValue = any>(
  metaEvent: MetaLangGraphInterruptEvent
): LangGraphInterruptEvent<TEventValue> {
  return {
    type: metaEvent.type,
    name: metaEvent.name,
    value: metaEvent.value as TEventValue,
    response: metaEvent.response,
  };
}
