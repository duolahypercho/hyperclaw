import { ActionInputAvailability } from "@OS/AI/runtime";

export interface ActionInput {
  name: string;
  description: string;
  jsonSchema: string;
  available?: ActionInputAvailability;
}
