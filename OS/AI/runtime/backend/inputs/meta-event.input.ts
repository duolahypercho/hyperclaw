import { MetaEventName } from "../types/meta-events.type";
import type { MessageInput } from "./message.input";

export interface MetaEventInput {
  name: MetaEventName;
  value?: string;
  response?: string;
  messages?: MessageInput[];
}
