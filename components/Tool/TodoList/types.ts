import { Descendant } from "slate";
import { RecurrenceRule } from "@/components/recurrence_filter";

export interface Task {
  _id: string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked";
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
  /** Optional agent (e.g. tool or AI) assigned to this task */
  assignedAgent?: string;
  /** Optional URL to a linked document */
  linkedDocumentUrl?: string;
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
  status: "pending" | "completed" | "in_progress" | "blocked";
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
  status: "pending" | "completed" | "in_progress" | "blocked";
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
}

export interface List {
  _id: string;
  name: string;
  planned: boolean;
}
