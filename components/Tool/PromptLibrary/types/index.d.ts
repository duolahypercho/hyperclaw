import { Message } from "$/types";

export type lengthType =
  | "shorter"
  | "shortest"
  | "current"
  | "longer"
  | "longest";

export type ReadingLevelType =
  | "Kindergarten"
  | "Elementary School"
  | "Middle School"
  | "Current"
  | "High School"
  | "College"
  | "Graduate School";

export interface PromptVariable {
  _id: string;
  name: string;
  description: string;
  defaultValue: string;
  required: boolean;
}

export interface PromptProps {
  systemPrompt: string;
  relatedHistory: Message[];
}

export interface OptimizePrompt {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  status: "draft" | "published" | "archived";
}

export interface PromptVersion {
  id: string;
  prompt: string;
  version: number;
  createdAt: string;
  description: string; // e.g., "Original", "Optimized with clarity", "Enhanced with structure"
  type: "original" | "optimized" | "manual";
  optimizationStrategy?: string; // ID of the optimization strategy used
}

// New types for lazy loading version history
export interface PromptVersionSummary {
  id: string;
  version: number;
  createdAt: string;
  description: string;
  type: "original" | "optimized" | "manual";
  optimizationStrategy?: string;
  promptPreview?: string; // First 100 characters of the prompt
  hasFullContent?: boolean; // Whether the full prompt content is available
}

export interface PromptVersionDetails extends PromptVersionSummary {
  prompt: string; // Full prompt content
}

// UI State interface for prompt configuration
export interface PromptUIState {
  editingVariable: string | null;
  newVariableName: string;
  showAddVariableForm: boolean;
  newMessageRole: "user" | "assistant";
  newMessageContent: string;
  showAddMessageForm: boolean;
  editingMessage: string | null;
  editMessageContent: string;
  editMessageRole: "user" | "assistant";
}

export interface Prompt {
  author: string;
  createdAt: string;
  optimizedPrompt: string;
  optimizedTestResults: string;
  originalPrompt: string;
  originalTestResults: string;
  promptDescription: string;
  owner: string;
  promptCategory: string;
  promptName: string;
  promptImage: string;
  relatedHistory: Message[];
  status: "draft" | "active" | "archived" | "pending";
  templateId: string;
  _id: string;
  testPrompt: string;
  updatedAt: string;
  variables: PromptVariable[];
}

export interface PromptHistory {
  _id: string;
  promptName: string;
  promptCategory: string;
  promptDescription: string;
  updatedAt: string;
  owner: boolean;
  status: "draft" | "active" | "archived" | "pending";
}

export interface CategoryType {
  name: string;
  value: string;
}
