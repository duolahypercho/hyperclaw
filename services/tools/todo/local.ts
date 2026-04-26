/**
 * Local-only todo service — reads/writes ~/.hyperclaw/todo.json via the bridge.
 * Replaces all backend API calls with local file operations.
 * All functions return { status: 200, data: ... } to match the enterprise API shape.
 */
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  AddTodoTaskRequest,
  AddTodoListRequest,
  AddTodoStepRequest,
  PromoteToTaskRequest,
  UpdateTodoTaskRequest,
  UpdateTodoListRequest,
  UpdateTodoTaskStepRequest,
  UpdateTodoTaskDetailsRequest,
  DeleteTodoTaskRequest,
  DeleteTodoListRequest,
  DeleteTodoStepRequest,
  ReorderListRequest,
  ReorderTaskRequest,
  ReorderStepRequest,
  TabType,
  SuggestStepRequest,
  GetTodoTaskQueryParams,
  ReorderCalendarRequest,
  SuggestDescriptionRequest,
} from "./type";

// ── Types ──────────────────────────────────────────────────────────────

interface StoredStep {
  _id: string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked" | "cancelled";
  finishedAt?: string | null;
}

interface StoredTask {
  _id: string;
  title: string;
  status: "pending" | "completed" | "in_progress" | "blocked" | "cancelled";
  starred: boolean;
  listId: string;
  order: number;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string | null;
  description: string;
  myDay: boolean;
  steps: StoredStep[];
  recurrence: any;
  statistics: { finishedCount: number; skippedCount: number; lastFinishedAt?: string; lastSkippedAt?: string };
  attachments: string[];
  /** Human-readable assignee label, e.g. "Elon". */
  assignedAgent?: string;
  /** Canonical assignee id, e.g. "elon". */
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
  /** Project-scoped task grouping used by the project issue workspace. */
  projectId?: string;
  /** Delivery channel for announcing result when task is run (e.g. by cron). */
  delivery?: { announce?: boolean; channel?: string; to?: string };
}

interface StoredList {
  _id: string;
  name: string;
  planned: boolean;
  order: number;
}

interface TodoData {
  tasks: StoredTask[];
  lists: StoredList[];
  activeTaskId: string | null;
}

const EMPTY: TodoData = { tasks: [], lists: [], activeTaskId: null };

// ── Core I/O ───────────────────────────────────────────────────────────

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function guessAgentId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const exact = trimmed.match(/^[a-z0-9_.-]+$/);
  if (exact) return trimmed;
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || undefined;
}

function extractAgentFromDescription(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const patterns = [
    /^\*\*Agent:\*\*\s*(.+)$/im,
    /^Agent:\s*(.+)$/im,
    /^Assigned(?:\s+to)?:\s*(.+)$/im,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    const raw = match?.[1]?.trim();
    if (raw) return raw;
  }
  return undefined;
}

function normalizeAgentAssignment(t: Record<string, unknown>): Pick<StoredTask, "assignedAgent" | "assignedAgentId"> {
  const nested = t.data && typeof t.data === "object" ? (t.data as Record<string, unknown>) : undefined;
  const description = asString(t.description) ?? asString(nested?.description);

  const assignedAgent =
    asString(t.assignedAgent) ??
    asString((t as Record<string, unknown>).assignedAgentName) ??
    asString(t.agent) ??
    asString(nested?.assignedAgent) ??
    asString(nested?.assignedAgentName) ??
    asString(nested?.agent) ??
    extractAgentFromDescription(description);

  const assignedAgentId =
    asString((t as Record<string, unknown>).assignedAgentId) ??
    asString((t as Record<string, unknown>).agentId) ??
    asString(nested?.assignedAgentId) ??
    asString(nested?.agentId) ??
    guessAgentId(assignedAgent);

  return {
    assignedAgent: assignedAgent ?? assignedAgentId,
    assignedAgentId,
  };
}

function extractProjectId(t: Record<string, unknown>): string | undefined {
  const nested = t.data && typeof t.data === "object" ? (t.data as Record<string, unknown>) : undefined;
  return (
    asString(t.projectId) ??
    asString((t as Record<string, unknown>).project_id) ??
    asString(nested?.projectId) ??
    asString(nested?.project_id)
  );
}

/** Normalize a task from bridge (id, no steps) or app (_id, steps) into StoredTask shape. */
function normalizeTask(t: Record<string, unknown>): StoredTask {
  const _id = (t._id ?? t.id) as string;
  const steps = Array.isArray(t.steps) ? (t.steps as StoredStep[]) : [];
  const statistics = t.statistics && typeof t.statistics === "object" ? (t.statistics as StoredTask["statistics"]) : { finishedCount: 0, skippedCount: 0 };
  const assignment = normalizeAgentAssignment(t);
  return {
    _id: String(_id ?? generateId()),
    title: String(t.title ?? ""),
    status: (t.status as StoredTask["status"]) ?? "pending",
    starred: Boolean(t.starred),
    listId: String(t.listId ?? ""),
    order: typeof t.order === "number" ? t.order : 0,
    dueDate: (t.dueDate as string | null) ?? null,
    createdAt: String(t.createdAt ?? new Date().toISOString()),
    updatedAt: String(t.updatedAt ?? new Date().toISOString()),
    finishedAt: (t.finishedAt as string | null) ?? null,
    description: String(t.description ?? ""),
    myDay: Boolean(t.myDay),
    steps,
    recurrence: t.recurrence ?? { type: "none" },
    statistics,
    attachments: Array.isArray(t.attachments) ? (t.attachments as string[]) : [],
    assignedAgent: assignment.assignedAgent,
    assignedAgentId: assignment.assignedAgentId,
    linkedDocumentUrl: t.linkedDocumentUrl as string | undefined,
    projectId: extractProjectId(t),
    delivery:
      t.delivery && typeof t.delivery === "object"
        ? {
            announce: Boolean((t.delivery as Record<string, unknown>).announce),
            channel: typeof (t.delivery as Record<string, unknown>).channel === "string" ? (t.delivery as Record<string, unknown>).channel as string : undefined,
            to: typeof (t.delivery as Record<string, unknown>).to === "string" ? (t.delivery as Record<string, unknown>).to as string : undefined,
          }
        : undefined,
  };
}

async function load(): Promise<TodoData> {
  try {
    const raw = (await bridgeInvoke("get-todo-data")) as TodoData;
    const tasks = Array.isArray(raw?.tasks) ? raw.tasks.map((t) => normalizeTask(t as unknown as Record<string, unknown>)) : [];
    return {
      tasks,
      lists: Array.isArray(raw?.lists) ? raw.lists : [],
      activeTaskId: raw?.activeTaskId ?? null,
    };
  } catch {
    return { ...EMPTY };
  }
}

async function save(data: TodoData): Promise<void> {
  await bridgeInvoke("save-todo-data", { todoData: data });
}

function generateId(): string {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  let r = "";
  for (let i = 0; i < 16; i++) r += Math.floor(Math.random() * 16).toString(16);
  return ts + r;
}

function now(): string {
  return new Date().toISOString();
}

function ok<T>(data: T) {
  return { status: 200 as const, data };
}

function toDate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  return new Date(v);
}

function statsToDate(s: StoredTask["statistics"] | undefined) {
  if (!s || typeof s !== "object") return { finishedCount: 0, skippedCount: 0, lastFinishedAt: undefined, lastSkippedAt: undefined };
  return {
    finishedCount: s.finishedCount ?? 0,
    skippedCount: s.skippedCount ?? 0,
    lastFinishedAt: toDate(s.lastFinishedAt),
    lastSkippedAt: toDate(s.lastSkippedAt),
  };
}

function stepToDate(s: StoredStep) {
  return { _id: s._id, title: s.title, status: s.status, finishedAt: toDate(s.finishedAt) };
}

function taskToSummary(t: StoredTask) {
  const steps = Array.isArray(t.steps) ? t.steps : [];
  return {
    _id: t._id,
    title: t.title,
    status: t.status,
    starred: t.starred ?? false,
    listId: t.listId ?? "",
    order: typeof t.order === "number" ? t.order : 0,
    dueDate: toDate(t.dueDate),
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
    finishedAt: toDate(t.finishedAt),
    description: t.description ?? "",
    myDay: t.myDay ?? false,
    steps: {
      completed: steps.filter((s) => s.status === "completed").length,
      uncompleted: steps.filter((s) => s.status !== "completed").length,
    },
    recurrence: t.recurrence ?? { type: "none" },
    statistics: statsToDate(t.statistics),
    assignedAgent: t.assignedAgent,
    assignedAgentId: t.assignedAgentId,
    linkedDocumentUrl: t.linkedDocumentUrl,
    projectId: t.projectId,
    delivery: t.delivery,
  };
}

function taskToDetails(t: StoredTask) {
  const steps = Array.isArray(t.steps) ? t.steps : [];
  const attachments = Array.isArray(t.attachments) ? t.attachments : [];
  return {
    _id: t._id,
    title: t.title,
    status: t.status,
    starred: t.starred ?? false,
    listId: t.listId ?? "",
    order: typeof t.order === "number" ? t.order : 0,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
    finishedAt: toDate(t.finishedAt),
    myDay: t.myDay ?? false,
    dueDate: toDate(t.dueDate),
    recurrence: t.recurrence ?? { type: "none" },
    statistics: statsToDate(t.statistics),
    description: t.description ?? "",
    steps: steps.map(stepToDate),
    details: {
      description: t.description ?? "",
      steps: steps.map(stepToDate),
      attachments,
    },
    assignedAgent: t.assignedAgent,
    assignedAgentId: t.assignedAgentId,
    linkedDocumentUrl: t.linkedDocumentUrl,
    projectId: t.projectId,
    delivery: t.delivery,
  };
}

// ── Filtering ──────────────────────────────────────────────────────────

function filterByTab(
  tasks: StoredTask[],
  tab: TabType,
  query?: GetTodoTaskQueryParams
): StoredTask[] {
  let result: StoredTask[];
  switch (tab) {
    case "myday":
      result = tasks.filter((t) => t.myDay && t.status !== "completed");
      break;
    case "starred":
      result = tasks.filter((t) => t.starred && t.status !== "completed");
      break;
    case "finished":
      result = tasks.filter((t) => t.status === "completed");
      break;
    case "task":
      result = tasks.filter((t) => t.status !== "completed");
      break;
    case "kanban":
      result = tasks;
      break;
    case "list":
      result = query?.planned != null
        ? tasks.filter((t) => {
            const list = t.listId && t.listId.length > 0;
            return query.planned ? list : !list;
          })
        : tasks;
      break;
    case "calendar": {
      const start = query?.startDate ? new Date(query.startDate).getTime() : -Infinity;
      const end = query?.endDate ? new Date(query.endDate).getTime() : Infinity;
      result = tasks.filter((t) => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate).getTime();
        return d >= start && d <= end && t.status !== "completed";
      });
      break;
    }
    default:
      result = tasks;
  }
  result.sort((a, b) => a.order - b.order);
  if (query?.limit) result = result.slice(0, query.limit);
  return result;
}

// ── API replacements ───────────────────────────────────────────────────

export const getTodoAPI = async () => {
  const data = await load();
  return ok({ TodoList: data.lists });
};

export const getTodoTaskAPI = async (tab: TabType, queryParams?: GetTodoTaskQueryParams) => {
  const data = await load();
  const filtered = filterByTab(data.tasks, tab, queryParams);
  return ok(filtered.map(taskToSummary));
};

export const getTodoTaskByListAPI = async (listId: string) => {
  const data = await load();
  const filtered = data.tasks.filter((t) => t.listId === listId).sort((a, b) => a.order - b.order);
  return ok(filtered.map(taskToSummary));
};

export const getTodoTaskByIdAPI = async (taskId: string) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === taskId);
  if (!task) return { status: 404, data: null };
  return ok(taskToDetails(task));
};

export const addTodoTaskAPI = async (req: AddTodoTaskRequest) => {
  const data = await load();
  const newTask: StoredTask = {
    _id: req._id || generateId(),
    title: req.title,
    status: (req.status as StoredTask["status"]) ?? "pending",
    starred: req.starred ?? false,
    listId: req.listId || "",
    order: req.order ?? data.tasks.length,
    dueDate: req.dueDate ? new Date(req.dueDate).toISOString() : null,
    createdAt: now(),
    updatedAt: now(),
    finishedAt: null,
    description: req.description || "",
    myDay: req.myDay ?? false,
    steps: [],
    recurrence: req.recurrence ?? { type: "none" },
    statistics: { finishedCount: 0, skippedCount: 0 },
    attachments: [],
    assignedAgent: req.assignedAgent,
    assignedAgentId: req.assignedAgentId,
    linkedDocumentUrl: req.linkedDocumentUrl,
    projectId: req.projectId,
    delivery: req.delivery,
  };
  data.tasks.push(newTask);
  await save(data);
  return ok(taskToDetails(newTask));
};

export const updateTodoTaskAPI = async (req: UpdateTodoTaskRequest) => {
  const data = await load();
  const idx = data.tasks.findIndex((t) => t._id === req.id);
  if (idx === -1) return { status: 404, data: null };
  const { id, ...patch } = req;
  const task = data.tasks[idx];
  if (patch.status === "completed" && task.status !== "completed") {
    (task as any).finishedAt = now();
  }
  Object.assign(task, patch, { updatedAt: now() });
  if (patch.dueDate !== undefined) {
    task.dueDate = patch.dueDate ? new Date(patch.dueDate).toISOString() : null;
  }
  if (patch.assignedAgent !== undefined) {
    task.assignedAgent = patch.assignedAgent ?? undefined;
  }
  if (patch.assignedAgentId !== undefined) {
    task.assignedAgentId = patch.assignedAgentId ?? undefined;
  }
  if (patch.projectId !== undefined) {
    task.projectId = patch.projectId ?? undefined;
  }
  await save(data);
  return ok(taskToSummary(task));
};

export const deleteTodoTaskAPI = async (req: DeleteTodoTaskRequest) => {
  const data = await load();
  data.tasks = data.tasks.filter((t) => t._id !== req.id);
  if (data.activeTaskId === req.id) data.activeTaskId = null;
  await save(data);
  return ok({ success: true });
};

export const editTodoTaskDetailsAPI = async (req: UpdateTodoTaskDetailsRequest) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === req.id);
  if (!task) return { status: 404, data: null };
  if (req.description !== undefined) task.description = req.description;
  if (req.attachments) task.attachments = [...task.attachments, ...req.attachments];
  task.updatedAt = now();
  await save(data);
  return ok(taskToDetails(task));
};

export const editTodoTaskStepAPI = async (req: UpdateTodoTaskStepRequest) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === req.id);
  if (!task) return { status: 404, data: null };
  const step = task.steps.find((s) => s._id === req.stepId);
  if (!step) return { status: 404, data: null };
  if (req.title !== undefined) step.title = req.title;
  if (req.status !== undefined) {
    const wasCompleted = step.status === "completed";
    step.status = req.status;
    if (req.status === "completed" && !wasCompleted) step.finishedAt = now();
    if (req.status !== "completed" && wasCompleted) step.finishedAt = null;
  }
  task.updatedAt = now();
  await save(data);
  return ok({ success: true });
};

export const addTodoStepAPI = async (req: AddTodoStepRequest) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === req.taskId);
  if (!task) return { status: 404, data: null };
  task.steps.push({ _id: req._id || generateId(), title: req.title, status: "pending" });
  task.updatedAt = now();
  await save(data);
  return ok({ success: true });
};

export const deleteTodoStepAPI = async (req: DeleteTodoStepRequest) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === req.id);
  if (!task) return { status: 404, data: null };
  task.steps = task.steps.filter((s) => s._id !== req.stepId);
  task.updatedAt = now();
  await save(data);
  return ok({ success: true });
};

export const promoteToTaskAPI = async (req: PromoteToTaskRequest) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === req.taskId);
  if (!task) return { status: 404, data: null };
  const step = task.steps.find((s) => s._id === req.stepId);
  if (!step) return { status: 404, data: null };
  task.steps = task.steps.filter((s) => s._id !== req.stepId);
  task.updatedAt = now();
  await save(data);
  return ok({ success: true });
};

// ── Lists ──────────────────────────────────────────────────────────────

export const addTodoListAPI = async (req: AddTodoListRequest) => {
  const data = await load();
  const newList: StoredList = {
    _id: generateId(),
    name: req.name || "New Goal",
    planned: req.planned ?? false,
    order: data.lists.length,
  };
  data.lists.push(newList);
  await save(data);
  return ok(newList);
};

export const deleteTodoListAPI = async (req: DeleteTodoListRequest) => {
  const data = await load();
  data.lists = data.lists.filter((l) => l._id !== req.id);
  data.tasks = data.tasks.map((t) => (t.listId === req.id ? { ...t, listId: "" } : t));
  await save(data);
  return ok({ success: true });
};

export const updateTodoListAPI = async (req: UpdateTodoListRequest) => {
  const data = await load();
  const list = data.lists.find((l) => l._id === req.id);
  if (!list) return { status: 404, data: null };
  if (req.name !== undefined) list.name = req.name;
  if (req.planned !== undefined) list.planned = req.planned;
  await save(data);
  return ok(list);
};

// ── Reordering ─────────────────────────────────────────────────────────

export const reorderTasksAPI = async (req: ReorderTaskRequest) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === req.id);
  if (task) {
    task.order = req.newIndex;
    task.updatedAt = now();
  }
  await save(data);
  return ok({ success: true });
};

export const reorderListsAPI = async (req: ReorderListRequest) => {
  const data = await load();
  const list = data.lists.find((l) => l._id === req.id);
  if (list) list.order = req.newIndex;
  await save(data);
  return ok({ success: true });
};

export const reorderStepsAPI = async (req: ReorderStepRequest) => {
  const data = await load();
  const task = data.tasks.find((t) => t._id === req.id);
  if (task) {
    const stepIdx = task.steps.findIndex((s) => s._id === req.stepId);
    if (stepIdx !== -1) {
      const [moved] = task.steps.splice(stepIdx, 1);
      task.steps.splice(req.newIndex, 0, moved);
    }
    task.updatedAt = now();
  }
  await save(data);
  return ok({ success: true });
};

export const reorderCalanderAPI = async (req: ReorderCalendarRequest) => {
  const data = await load();
  for (const [key, taskIds] of Object.entries(req.buckets)) {
    const isDate = !isNaN(new Date(key).getTime()) && key.length === 10;
    taskIds.forEach((taskId, index) => {
      const task = data.tasks.find((t) => t._id === taskId);
      if (!task) return;
      task.order = index;
      task.updatedAt = now();
      if (isDate) {
        task.dueDate = key + "T23:59:59.999Z";
        task.listId = "";
      } else {
        task.dueDate = null;
        task.listId = key;
      }
    });
  }
  await save(data);
  return ok({ success: true });
};

// ── Active task ────────────────────────────────────────────────────────

export const toggleActiveTaskAPI = async (taskId: string) => {
  const data = await load();
  data.activeTaskId = taskId;
  const task = data.tasks.find((t) => t._id === taskId);
  if (task && task.status === "pending") {
    task.status = "in_progress";
    task.updatedAt = now();
  }
  await save(data);
  return ok({ success: true });
};

export const fetchActiveTasksAPI = async () => {
  const data = await load();
  return ok({ data: data.activeTaskId } as { data: string | null });
};

// ── AI features (stubs — return empty, can be connected to AI later) ──

export const suggestStepAPI = async (_req: SuggestStepRequest) => {
  return ok({ steps: [] });
};

export const suggestDescriptionAPI = async (_req: SuggestDescriptionRequest) => {
  return ok({ description: "" });
};

export const searchTaskAPI = async (req: { searchQuery: string }) => {
  const data = await load();
  const q = req.searchQuery.toLowerCase();
  const results = data.tasks
    .filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    .map(taskToSummary);
  return ok(results);
};
