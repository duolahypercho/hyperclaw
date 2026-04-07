import { Descendant } from "slate";
import { RecurrenceRule } from "@/components/recurrence_filter";

export interface Task {
  _id: string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked" | "cancelled";
  starred: boolean;
  listId?: string;
  order: number;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
  description: string;
  myDay: boolean;
  steps: {
    completed: number;
    uncompleted: number;
  };
  recurrence: RecurrenceRule;
  statistics: TaskStatistics;
  /** Optional display name of the agent (e.g. Elon) assigned to this task */
  assignedAgent?: string;
  /** Optional canonical agent id (e.g. elon) assigned to this task */
  assignedAgentId?: string;
  /** Optional URL to a linked document */
  linkedDocumentUrl?: string;
  /** How this task was created */
  originKind?: "manual" | "routine" | "ceo_heartbeat";
  /** ID of the routine or heartbeat run that created this task */
  originId?: string;
  /** Group tasks by project/goal */
  projectId?: string;
}

export interface TaskStatistics {
  finishedCount: number;
  skippedCount: number;
  lastFinishedAt?: Date;
  lastSkippedAt?: Date;
}

export interface Step {
  _id: string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked" | "cancelled";
  finishedAt?: Date;
}

export interface details {
  description: string;
  attachments: string[];
  descendants: Descendant[];
  steps: Step[];
}

export interface TaskDetails {
  _id: string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked" | "cancelled";
  starred: boolean;
  listId: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
  myDay: boolean;
  details: details;
  statistics: TaskStatistics;
  dueDate?: Date;
  recurrence: RecurrenceRule;
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
  originKind?: "manual" | "routine" | "ceo_heartbeat";
  originId?: string;
  projectId?: string;
}

export interface List {
  _id: string;
  name: string;
  planned: boolean;
}
