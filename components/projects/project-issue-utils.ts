import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  CircleSlash,
  type LucideIcon,
} from "lucide-react";
import type { Task } from "./task-types";
import type { Project as MockProject } from "./types";

export type ProjectIssueStatus = "pending" | "in_progress" | "blocked" | "completed";

export interface ProjectIssueColumn {
  id: ProjectIssueStatus;
  title: string;
  /** One-line column description, used in the empty-state subtitle. */
  helper: string;
  /** Lucide icon used to anchor the column header / list group / status badge. */
  icon: LucideIcon;
  /** Tailwind text colour for the icon (kept very subtle to match the
   *  monochromatic reference design). */
  iconClass: string;
}

/**
 * Status order: matches Linear / GitHub conventions and the reference
 * mocks (Open → In progress → Blocked → Done). The order doubles as the
 * sort key for the list view's grouped sections.
 */
export const PROJECT_ISSUE_COLUMNS: ProjectIssueColumn[] = [
  {
    id: "pending",
    title: "Open",
    helper: "Waiting to be picked up.",
    icon: Circle,
    iconClass: "text-muted-foreground/70",
  },
  {
    id: "in_progress",
    title: "In progress",
    helper: "Actively moving.",
    icon: CircleDashed,
    iconClass: "text-foreground/80",
  },
  {
    id: "blocked",
    title: "Blocked",
    helper: "Needs input or a decision.",
    icon: CircleSlash,
    iconClass: "text-amber-500 dark:text-amber-400",
  },
  {
    id: "completed",
    title: "Done",
    helper: "Closed and shipped.",
    icon: CheckCircle2,
    iconClass: "text-foreground",
  },
];

const ACTIVE_PROJECT_ISSUE_STATUSES = new Set<ProjectIssueStatus>([
  "pending",
  "in_progress",
  "blocked",
  "completed",
]);

export function isProjectIssueStatus(status: string): status is ProjectIssueStatus {
  return ACTIVE_PROJECT_ISSUE_STATUSES.has(status as ProjectIssueStatus);
}

export function getStatusMeta(status: string): ProjectIssueColumn {
  return (
    PROJECT_ISSUE_COLUMNS.find((column) => column.id === status) ??
    PROJECT_ISSUE_COLUMNS[0]
  );
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
  // Reference design uses short integer suffixes (EAR-1, EAR-2…). Falling
  // back to the index keeps things stable when tasks are added optimistically
  // and don't yet have a server id.
  return `${prefix}-${index + 1}`;
}

export function formatIssueDate(value?: Date): string {
  if (!value) return "No date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function formatIssueDateAbsolute(value?: Date): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

/**
 * Reference design uses Linear-style "in 2d", "tomorrow", "3d overdue".
 * We keep this distinct from `formatRelativeIssueTime` because that one is
 * always backwards-looking ("2h ago"), while this one is bi-directional and
 * only used for due dates.
 */
export function formatDueLabel(value?: Date): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0 && diffDays < 7) return `in ${diffDays}d`;
  if (diffDays < 0 && diffDays > -30) return `${Math.abs(diffDays)}d overdue`;
  return formatIssueDate(date);
}

export type PriorityRank = "P0" | "P1" | "P2" | "P3";

export interface PriorityMeta {
  rank: PriorityRank;
  /** Tailwind class for the leading dot. Reference design uses subtle
   *  monochrome dots; only urgent items pick up an accent. */
  dotClass: string;
  label: string;
}

export function getIssuePriorityMeta(task: Task): PriorityMeta {
  const rank = getIssuePriorityRank(task);
  const meta: Record<PriorityRank, PriorityMeta> = {
    P0: { rank: "P0", dotClass: "bg-red-500", label: "Urgent" },
    P1: { rank: "P1", dotClass: "bg-foreground", label: "High" },
    P2: { rank: "P2", dotClass: "bg-muted-foreground", label: "Medium" },
    P3: { rank: "P3", dotClass: "bg-muted-foreground/50", label: "Low" },
  };
  return meta[rank];
}

export function getIssuePriorityRank(task: Task): PriorityRank {
  if (task.status === "blocked") return "P0";
  if (task.starred) return "P1";
  if (task.dueDate && new Date(task.dueDate).getTime() < Date.now()) return "P1";
  if (task.dueDate) return "P2";
  return "P3";
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

export function getIssueAssigneeInitials(task: Task): string {
  const name = getIssueAssignee(task);
  if (!name || name === "Unassigned") return "?";
  const words = name.replace(/[^\w\s-]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function getIssueProgress(task: Task): { done: number; total: number; label: string } {
  const total = task.steps.completed + task.steps.uncompleted;
  if (total === 0) return { done: 0, total: 0, label: "" };
  return {
    done: task.steps.completed,
    total,
    label: `${task.steps.completed}/${total}`,
  };
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

/** Distinct assignees (canonical names) found across the issue list, used
 *  to populate the assignee filter dropdown. */
export function collectAssignees(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const task of tasks) {
    const name = task.assignedAgent || task.assignedAgentId;
    if (name) set.add(name);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Distinct labels across the issue list, used for the label filter dropdown. */
export function collectLabels(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const task of tasks) {
    for (const label of getIssueLabels(task)) set.add(label);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
