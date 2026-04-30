export type TaskStatus = "pending" | "completed" | "in_progress" | "blocked" | "cancelled";

export interface TaskStatistics {
  finishedCount: number;
  skippedCount: number;
  lastFinishedAt?: Date;
  lastSkippedAt?: Date;
}

export interface Task {
  _id: string;
  title: string;
  status: TaskStatus;
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
  recurrence?: unknown;
  statistics: TaskStatistics;
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
  originKind?: "manual" | "routine" | "ceo_heartbeat";
  originId?: string;
  projectId?: string;
}
