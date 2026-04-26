import type { Task } from "$/components/Tool/TodoList/types";
import type { Project as MockProject } from "./types";

export type ProjectIssueStatus = "pending" | "in_progress" | "blocked" | "completed";

export interface ProjectIssueColumn {
  id: ProjectIssueStatus;
  title: string;
  helper: string;
  tone: string;
}

export const PROJECT_ISSUE_COLUMNS: ProjectIssueColumn[] = [
  {
    id: "pending",
    title: "Open",
    helper: "New work waiting for a human or agent to pick up.",
    tone: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  {
    id: "in_progress",
    title: "In progress",
    helper: "Actively moving through the project crew.",
    tone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  {
    id: "blocked",
    title: "Blocked",
    helper: "Needs input, credentials, or a decision.",
    tone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    id: "completed",
    title: "Done",
    helper: "Completed work and closed loops.",
    tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
];

export const ACTIVE_PROJECT_ISSUE_STATUSES = new Set<ProjectIssueStatus>([
  "pending",
  "in_progress",
  "blocked",
  "completed",
]);

export function isProjectIssueStatus(status: string): status is ProjectIssueStatus {
  return ACTIVE_PROJECT_ISSUE_STATUSES.has(status as ProjectIssueStatus);
}

export function isProjectIssue(task: Task, projectId: string): boolean {
  return task.projectId === projectId && isProjectIssueStatus(task.status);
}

export function groupIssuesByStatus(tasks: Task[]): Record<ProjectIssueStatus, Task[]> {
  return PROJECT_ISSUE_COLUMNS.reduce((acc, column) => {
    acc[column.id] = tasks
      .filter((task) => task.status === column.id)
      .sort((a, b) => {
        const orderDelta = (a.order ?? 0) - (b.order ?? 0);
        if (orderDelta !== 0) return orderDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    return acc;
  }, {} as Record<ProjectIssueStatus, Task[]>);
}

export function getProjectIssuePrefix(project?: Pick<MockProject, "id" | "name"> | null): string {
  const source = project?.name || project?.id || "project";
  const words = source
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length >= 2 ? words.map((word) => word[0]).join("") : source.slice(0, 3);
  return letters.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "PRJ";
}

export function formatIssueKey(task: Task, index: number, prefix: string): string {
  const suffix = task._id?.slice(-4).replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `${prefix}-${suffix || index + 1}`;
}

export function formatIssueDate(value?: Date): string {
  if (!value) return "No date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function formatRelativeIssueTime(value?: Date): string {
  if (!value) return "just now";
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return "just now";
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatIssueDate(date);
}

export function getIssuePriority(task: Task): "Urgent" | "High" | "Medium" | "Low" {
  if (task.status === "blocked") return "Urgent";
  if (task.starred) return "High";
  if (task.dueDate && new Date(task.dueDate).getTime() < Date.now()) return "High";
  if (task.dueDate) return "Medium";
  return "Low";
}

export function getIssueLabels(task: Task): string[] {
  const labels = new Set<string>();
  if (task.listId) labels.add(task.listId);
  if (task.assignedAgent) labels.add("agent");
  if (task.linkedDocumentUrl) labels.add("doc");
  if (task.steps.completed + task.steps.uncompleted > 0) labels.add("checklist");
  return Array.from(labels).slice(0, 3);
}

export function getIssueAssignee(task: Task): string {
  return task.assignedAgent || task.assignedAgentId || "Unassigned";
}

export function getIssueProgress(task: Task): string {
  const total = task.steps.completed + task.steps.uncompleted;
  if (total === 0) return "No subtasks";
  return `${task.steps.completed}/${total} subtasks`;
}

export function matchesIssueQuery(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return [
    task.title,
    task.description,
    task.assignedAgent,
    task.assignedAgentId,
    task.listId,
    task.status,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}
