import { ActionInput } from "./action.input";

export interface FrontendInput {
  toDeprecate_fullContext?: string;
  actions: ActionInput[];
  url?: string;
}
