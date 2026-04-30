import * as React from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { Task, TaskStatus } from "./task-types";

interface StoredStep {
  _id: string;
  title: string;
  status: TaskStatus;
  finishedAt?: string | null;
  assignedAgent?: string;
  assignedAgentId?: string;
}

interface StoredTask {
  _id?: string;
  id?: string;
  title?: string;
  status?: TaskStatus;
  starred?: boolean;
  listId?: string;
  order?: number;
  dueDate?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  finishedAt?: string | Date | null;
  description?: string;
  myDay?: boolean;
  steps?: StoredStep[];
  recurrence?: unknown;
  statistics?: {
    finishedCount?: number;
    skippedCount?: number;
    lastFinishedAt?: string | Date;
    lastSkippedAt?: string | Date;
  };
  attachments?: string[];
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
  projectId?: string;
  originKind?: "manual" | "routine" | "ceo_heartbeat";
  originId?: string;
  delivery?: unknown;
}

interface TodoData {
  tasks: StoredTask[];
  lists?: unknown[];
  activeTaskId?: string | null;
}

type AddTaskInput = {
  title: string;
  description?: string;
  projectId?: string;
  status?: TaskStatus;
  starred?: boolean;
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
};

type EditTaskInput = Partial<
  Pick<
    Task,
    | "title"
    | "description"
    | "status"
    | "starred"
    | "assignedAgent"
    | "assignedAgentId"
    | "linkedDocumentUrl"
    | "projectId"
  >
>;

function generateId(): string {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  let random = "";
  for (let i = 0; i < 16; i += 1) random += Math.floor(Math.random() * 16).toString(16);
  return ts + random;
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeTask(raw: StoredTask): Task {
  const id = String(raw._id ?? raw.id ?? generateId());
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const completed = steps.filter((step) => step.status === "completed").length;
  const uncompleted = Math.max(steps.length - completed, 0);

  return {
    _id: id,
    title: String(raw.title ?? ""),
    status: raw.status ?? "pending",
    starred: Boolean(raw.starred),
    listId: raw.listId,
    order: typeof raw.order === "number" ? raw.order : 0,
    dueDate: toDate(raw.dueDate),
    createdAt: toDate(raw.createdAt) ?? new Date(),
    updatedAt: toDate(raw.updatedAt) ?? new Date(),
    finishedAt: toDate(raw.finishedAt),
    description: String(raw.description ?? ""),
    myDay: Boolean(raw.myDay),
    steps: { completed, uncompleted },
    recurrence: raw.recurrence,
    statistics: {
      finishedCount: raw.statistics?.finishedCount ?? 0,
      skippedCount: raw.statistics?.skippedCount ?? 0,
      lastFinishedAt: toDate(raw.statistics?.lastFinishedAt),
      lastSkippedAt: toDate(raw.statistics?.lastSkippedAt),
    },
    assignedAgent: raw.assignedAgent,
    assignedAgentId: raw.assignedAgentId,
    linkedDocumentUrl: raw.linkedDocumentUrl,
    originKind: raw.originKind,
    originId: raw.originId,
    projectId: raw.projectId,
  };
}

function taskId(raw: StoredTask): string {
  return String(raw._id ?? raw.id ?? "");
}

export function useProjectTasks() {
  const [todoData, setTodoData] = React.useState<TodoData>({ tasks: [], lists: [], activeTaskId: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await bridgeInvoke("get-todo-data")) as TodoData | null;
      setTodoData({
        tasks: Array.isArray(data?.tasks) ? data.tasks : [],
        lists: Array.isArray(data?.lists) ? data?.lists : [],
        activeTaskId: data?.activeTaskId ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project issues.");
      setTodoData({ tasks: [], lists: [], activeTaskId: null });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = React.useCallback(async (updater: (current: TodoData) => TodoData) => {
    const next = updater(todoData);
    setTodoData(next);
    await bridgeInvoke("save-todo-data", { todoData: next });
    return next;
  }, [todoData]);

  const tasks = React.useMemo(() => todoData.tasks.map(normalizeTask), [todoData.tasks]);

  const handleAddTask = React.useCallback(async (input: AddTaskInput): Promise<Task> => {
    const now = new Date().toISOString();
    const raw: StoredTask = {
      _id: generateId(),
      title: input.title,
      status: input.status ?? "pending",
      starred: Boolean(input.starred),
      listId: "project-issues",
      order: todoData.tasks.length,
      createdAt: now,
      updatedAt: now,
      finishedAt: input.status === "completed" ? now : null,
      description: input.description ?? "",
      myDay: false,
      steps: [],
      recurrence: { type: "none" },
      statistics: { finishedCount: 0, skippedCount: 0 },
      assignedAgent: input.assignedAgent,
      assignedAgentId: input.assignedAgentId,
      linkedDocumentUrl: input.linkedDocumentUrl,
      projectId: input.projectId,
    };

    await persist((current) => ({
      ...current,
      tasks: [...current.tasks, raw],
    }));

    return normalizeTask(raw);
  }, [persist, todoData.tasks.length]);

  const handleEditTask = React.useCallback(async (id: string, fields: EditTaskInput) => {
    const now = new Date().toISOString();
    await persist((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (taskId(task) !== id) return task;
        const finishedAt =
          fields.status === undefined
            ? task.finishedAt
            : fields.status === "completed"
              ? task.finishedAt ?? now
              : null;
        return {
          ...task,
          ...fields,
          updatedAt: now,
          finishedAt,
        };
      }),
    }));
  }, [persist]);

  const handleStatusChange = React.useCallback(async (id: string, status: TaskStatus) => {
    await handleEditTask(id, { status });
  }, [handleEditTask]);

  const handleAddNextStep = React.useCallback(
    async (
      id: string,
      title: string,
      _ignore?: unknown,
      assignment?: { assignedAgent?: string; assignedAgentId?: string }
    ) => {
      const now = new Date().toISOString();
      await persist((current) => ({
        ...current,
        tasks: current.tasks.map((task) => {
          if (taskId(task) !== id) return task;
          const steps = Array.isArray(task.steps) ? task.steps : [];
          return {
            ...task,
            updatedAt: now,
            steps: [
              ...steps,
              {
                _id: generateId(),
                title,
                status: "pending",
                ...assignment,
              },
            ],
          };
        }),
      }));
    },
    [persist]
  );

  return {
    tasks,
    loading,
    error,
    refresh,
    handleAddTask,
    handleEditTask,
    handleStatusChange,
    handleAddNextStep,
  };
}
