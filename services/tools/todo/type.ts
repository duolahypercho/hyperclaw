import { RecurrenceRule } from "@/components/recurrence_filter";

export type TabType =
  | "task"
  | "starred"
  | "finished"
  | "myday"
  | "list"
  | "calendar"
  | "kanban";

export interface AddTodoTaskRequest {
  _id: string;
  title: string;
  description: string;
  listId: string;
  order: number;
  starred?: boolean;
  myDay?: boolean;
  dueDate?: Date;
  recurrence?: RecurrenceRule;
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
  /** Optional delivery channel for announcing task result (e.g. when run by cron) */
  delivery?: {
    announce?: boolean;
    channel?: string;
    to?: string;
  };
}

export interface AddTodoListRequest {
  name: string;
  planned?: boolean;
}

export interface AddTodoStepRequest {
  taskId: string;
  title: string;
  _id: string;
}

export interface PromoteToTaskRequest {
  taskId: string;
  stepId: string;
}

export interface UpdateTodoTaskRequest {
  id: string;
  title?: string;
  status?: "pending" | "completed" | "in_progress" | "blocked" | "cancelled";
  order?: number;
  listId?: string;
  description?: string;
  dueDate?: Date;
  starred?: boolean;
  myDay?: boolean;
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
}

export interface UpdateTodoTaskDetailsRequest {
  id: string;
  description?: string;
  attachments?: string[];
  steps?: string;
}

export interface UpdateTodoListRequest {
  id: string;
  planned?: boolean;
  name?: string;
}

export interface UpdateTodoTaskStepRequest {
  id: string;
  stepId?: string;
  title?: string;
  status?: "pending" | "completed" | "in_progress" | "blocked" | "cancelled";
}

export interface DeleteTodoTaskRequest {
  id: string;
}

export interface DeleteTodoListRequest {
  id: string;
}

export interface DeleteTodoStepRequest {
  id: string;
  stepId: string;
}

export interface ReorderListRequest {
  id: string;
  newIndex: number;
}

export interface ReorderTaskRequest {
  id: string;
  newIndex: number;
  view?: TabType;
  listId?: string;
  startDate?: string;
  endDate?: string;
}

export interface ReorderStepRequest {
  id: string;
  stepId: string;
  newIndex: number;
}

export interface SuggestStepRequest {
  taskId: string;
}

export interface SuggestDescriptionRequest {
  taskId: string;
}

export interface ReorderCalendarRequest {
  buckets: Record<string, string[]>;
}

export interface GetTodoTaskQueryParams {
  limit?: number;
  skip?: number;
  startDate?: string;
  endDate?: string;
  planned?: boolean;
}

export interface SearchTaskRequest {
  searchQuery: string;
}
