import React, { memo, useMemo, useCallback, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  Columns3,
  Inbox,
  PlayCircle,
  Eye,
  CheckCircle2,
  ArrowRight,
  ArrowRightLeft,
  Star,
  ExternalLink,
  Plus,
  FileText,
  Bot,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Activity,
  Users,
  X,
  Clock,
  Crown,
  Shield,
  Ban,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";
import { useIsTaskRunningCron } from "$/components/Tool/TodoList/hooks/useIsTaskRunningCron";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import { useOS } from "@OS/Provider/OSProv";
import { Task } from "$/components/Tool/TodoList/types";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  gatewayConnection,
  getGatewayConnectionState,
  subscribeGatewayConnection,
  type ChatEventPayload,
} from "$/lib/openclaw-gateway-ws";
import { useAgentIdentities, resolveAvatarUrl, isAvatarText } from "$/hooks/useAgentIdentity";
import { useFloatingChatOS } from "@OS/Provider/OSProv";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useFocusMode } from "./hooks/useFocusMode";
import { AddTaskDialog } from "./AddTaskDialog";
import { EditTaskDialog } from "./EditTaskDialog";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";
import { AgentDetailDialog } from "$/components/Tool/Agents/AgentDetailDialog";

/* ── Types for Agent & Log panels ────────────────────────── */

interface BridgeAgent {
  id: string;
  name: string;
  status: string;
  role?: string;
  lastActive?: string;
  workspaceFolder?: string;
}

/* ── Org Chart types (from OrgChartProvider) ──────────────── */

interface OrgNode {
  id: string;
  name: string;
  role: string;
  agentId: string;
  type: "orchestrator" | "lead" | "specialist";
  department?: string;
  status: "idle" | "working" | "offline";
  liveStatus?: string;
}

interface OrgDepartment {
  id: string;
  name: string;
  color: string;
}

interface OrgChartData {
  nodes: OrgNode[];
  edges: { from: string; to: string; label?: string }[];
  tasks: { id: string; title: string; assignedTo: string; status: string }[];
  departments: OrgDepartment[];
}

/* Domain event types — matches Mission Control's event model */
type EventType =
  | "task_created"
  | "task_status_changed"
  | "task_completed"
  | "task_deleted"
  | "agent_started"
  | "agent_completed"
  | "agent_error"
  | "system";

interface DomainEvent {
  id: string;
  type: EventType;
  agentId?: string;
  agentName?: string;
  taskId?: string;
  message: string;
  timestamp: number;
}

const EVENT_ICONS: Record<EventType, string> = {
  task_created: "📋",
  task_status_changed: "🔄",
  task_completed: "✅",
  task_deleted: "🗑️",
  agent_started: "🤖",
  agent_completed: "💬",
  agent_error: "❌",
  system: "⚙️",
};

const TASK_EVENT_TYPES: EventType[] = ["task_created", "task_status_changed", "task_completed", "task_deleted"];
const AGENT_EVENT_TYPES: EventType[] = ["agent_started", "agent_completed", "agent_error"];

let _eventSeq = 0;
function makeEventId() { return `evt-${Date.now()}-${++_eventSeq}`; }

type KanbanStatus = "pending" | "in_progress" | "blocked" | "completed" | "cancelled";

interface MiniColumnConfig {
  id: KanbanStatus;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  dotClass: string;
}

const COLUMNS: MiniColumnConfig[] = [
  {
    id: "pending",
    label: "Backlog",
    icon: <Inbox className="w-3 h-3" />,
    accentClass: "text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
  {
    id: "in_progress",
    label: "In Progress",
    icon: <PlayCircle className="w-3 h-3" />,
    accentClass: "text-primary",
    dotClass: "bg-primary",
  },
  {
    id: "blocked",
    label: "Review",
    icon: <Eye className="w-3 h-3" />,
    accentClass: "text-amber-500",
    dotClass: "bg-amber-500",
  },
  {
    id: "completed",
    label: "Done (today)",
    icon: <CheckCircle2 className="w-3 h-3" />,
    accentClass: "text-emerald-500",
    dotClass: "bg-emerald-500",
  },
  {
    id: "cancelled",
    label: "Cancelled",
    icon: <Ban className="w-3 h-3" />,
    accentClass: "text-rose-500",
    dotClass: "bg-rose-500",
  },
];

function isCompletedToday(task: Task): boolean {
  const at = task.finishedAt ?? task.updatedAt;
  if (!at) return false;
  const d = new Date(at);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

type RelativeDateTier =
  | "minutes"
  | "hours"
  | "1day"
  | "days"
  | "week"
  | "weeks"
  | "months"
  | "years";

function getRelativeTaskDate(
  date: Date | string | undefined
): { text: string; tier: RelativeDateTier } {
  if (!date) return { text: "", tier: "days" };
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMins < 1) return { text: "Just now", tier: "minutes" };
  if (diffMins < 60) return { text: `${diffMins}m ago`, tier: "minutes" };
  if (diffHours < 24) return { text: `${diffHours}h ago`, tier: "hours" };
  if (diffDays === 1) return { text: "1 day ago", tier: "1day" };
  if (diffDays < 7) return { text: `${diffDays} days ago`, tier: "days" };
  if (diffWeeks === 1) return { text: "1 week ago", tier: "week" };
  if (diffWeeks < 4) return { text: `${diffWeeks} weeks ago`, tier: "weeks" };
  if (diffYears < 1) return { text: `${diffMonths} mo ago`, tier: "months" };
  return { text: `${diffYears}y ago`, tier: "years" };
}

const DATE_TIER_CLASSES: Record<
  RelativeDateTier,
  string
> = {
  minutes: "bg-emerald-500/25 text-emerald-600 dark:text-emerald-400",
  hours: "bg-emerald-500/22 text-emerald-600 dark:text-emerald-400",
  "1day": "bg-sky-500/25 text-sky-600 dark:text-sky-400",
  days: "bg-violet-500/22 text-violet-600 dark:text-violet-400",
  week: "bg-amber-500/22 text-amber-600 dark:text-amber-400",
  weeks: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  months: "bg-rose-500/20 text-rose-600 dark:text-rose-400",
  years: "bg-muted/80 text-muted-foreground",
};

const AGENT_TAG_COLORS = [
  "bg-primary/15 text-primary border-primary/30",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
] as const;

function getAgentTagColor(agentName: string): string {
  let h = 0;
  for (let i = 0; i < agentName.length; i++)
    h = (h << 5) - h + agentName.charCodeAt(i);
  return AGENT_TAG_COLORS[Math.abs(h) % AGENT_TAG_COLORS.length];
}

/** Dynamic column width — empty columns collapse, busy columns grow (from MissionQueue). */
function getDesktopColumnWidth(taskCount: number): string {
  if (taskCount === 0) return "fit-content";
  return `${Math.min(380, 250 + taskCount * 14)}px`;
}

/* ── Custom Header ──────────────────────────────────────── */

const KanbanCustomHeader = memo<
  CustomProps & {
    onOpenAddTask?: () => void;
    orgData?: OrgChartData | null;
    selectedTeamId?: string | null;
    onSelectTeam?: (id: string | null) => void;
    taskCount?: number;
  }
>(({ widget, isMaximized, onMaximize, isEditMode, onOpenAddTask, orgData, selectedTeamId, onSelectTeam, taskCount = 0 }) => {
  const { toolAbstracts } = useOS();
  const [teamOpen, setTeamOpen] = useState(false);

  const todoTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "todo-list"),
    [toolAbstracts]
  );

  const totalTasks = taskCount;
  const departments = orgData?.departments ?? [];
  const unassigned = orgData?.nodes.filter((n) => !n.department) ?? [];

  const selectedLabel = useMemo(() => {
    if (!selectedTeamId) return "All teams";
    if (selectedTeamId === "__unassigned__") return "Unassigned";
    return departments.find((d) => d.id === selectedTeamId)?.name ?? "All teams";
  }, [selectedTeamId, departments]);

  const selectedColor = useMemo(() => {
    if (!selectedTeamId || selectedTeamId === "__unassigned__") return undefined;
    return departments.find((d) => d.id === selectedTeamId)?.color;
  }, [selectedTeamId, departments]);

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex items-center justify-center">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="text-primary">
          {todoTool?.icon || <Columns3 className="w-3.5 h-3.5" />}
        </div>
        <h3 className="text-xs font-normal text-foreground">{widget.title}</h3>
        {totalTasks > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4 font-normal"
          >
            {totalTasks} tasks
          </Badge>
        )}

        {/* Team selector */}
        {onSelectTeam && (
          <div className="relative">
            <button
              onClick={() => setTeamOpen((p) => !p)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] transition-colors",
                teamOpen
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-foreground/20"
              )}
            >
              {selectedColor && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedColor }} />
              )}
              {!selectedColor && <Users className="w-2.5 h-2.5 shrink-0" />}
              <span className="max-w-[80px] truncate">{selectedLabel}</span>
              <ChevronRight className={cn("w-2.5 h-2.5 transition-transform", teamOpen && "rotate-90")} />
            </button>

            {teamOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setTeamOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-[180px] rounded-lg border border-border bg-card shadow-lg py-1 max-h-[280px] overflow-y-auto customScrollbar2">
                  {/* All teams */}
                  <button
                    onClick={() => { onSelectTeam(null); setTeamOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors",
                      selectedTeamId === null ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-card hover:text-foreground"
                    )}
                  >
                    <Columns3 className="w-3 h-3 shrink-0" />
                    All teams
                  </button>

                  {/* Departments */}
                  {departments.length > 0 && (
                    <div className="border-t border-border/50 mt-0.5 pt-0.5">
                      {departments.map((dept) => {
                        const lead = orgData?.nodes.find((n) => n.department === dept.id && (n.type === "orchestrator" || n.type === "lead"));
                        const memberCount = orgData?.nodes.filter((n) => n.department === dept.id).length ?? 0;
                        const isSelected = selectedTeamId === dept.id;
                        return (
                          <button
                            key={dept.id}
                            onClick={() => { onSelectTeam(isSelected ? null : dept.id); setTeamOpen(false); }}
                            className={cn(
                              "w-full flex items-start gap-2 px-3 py-1.5 text-left transition-colors",
                              isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                            )}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: dept.color }} />
                            <div className="min-w-0 flex-1">
                              <div className={cn("text-[11px] truncate", isSelected ? "text-foreground font-medium" : "text-foreground")}>
                                {dept.name}
                              </div>
                              <div className="text-[9px] text-muted-foreground truncate">
                                {lead && <>{lead.type === "orchestrator" ? <Crown className="w-2 h-2 inline text-amber-500 mr-0.5" /> : <Shield className="w-2 h-2 inline text-violet-400 mr-0.5" />}{lead.name} · </>}
                                {memberCount} agent{memberCount !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Unassigned */}
                  {unassigned.length > 0 && (
                    <div className="border-t border-border/50 mt-0.5 pt-0.5">
                      <button
                        onClick={() => { onSelectTeam("__unassigned__"); setTeamOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors",
                          selectedTeamId === "__unassigned__" ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <Bot className="w-3 h-3 shrink-0" />
                        Unassigned ({unassigned.length})
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6 text-primary"
          onClick={onOpenAddTask}
          title="Add task"
        >
          <Plus className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => window.open("/Tool/TodoList", "_blank")}
          title="Open full Kanban"
        >
          <ExternalLink className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onMaximize}
          className="h-6 w-6"
        >
          {isMaximized ? (
            <Minimize2 className="w-3 h-3" />
          ) : (
            <Maximize2 className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
});

KanbanCustomHeader.displayName = "KanbanCustomHeader";

/* ── Mini Card ──────────────────────────────────────────── */

interface MiniKanbanCardProps {
  task: Task;
  columnId: KanbanStatus;
  onStatusChange: (taskId: string, status: KanbanStatus) => void;
  onSelect: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  isDragging?: boolean;
  disableLayout?: boolean;
  mobileMode?: boolean;
  onMoveStatus?: () => void;
}

const MiniKanbanCard = React.forwardRef<HTMLDivElement, MiniKanbanCardProps>(
  ({ task, columnId, onStatusChange, onSelect, onEdit, onDelete, isDragging = false, disableLayout = false, mobileMode = false, onMoveStatus }, ref) => {
    // Only allow: Backlog → In Progress, or Review → Done
    const nextCol = useMemo(() => {
      if (columnId === "pending") return COLUMNS[1]; // in_progress
      if (columnId === "blocked") return COLUMNS[3]; // completed
      return null;
    }, [columnId]);
    const isAgentRunning = useIsTaskRunningCron(task._id);

    const hasMetaRow =
      task.createdAt || task.assignedAgent || task.assignedAgentId || task.linkedDocumentUrl;

    const canDelete = columnId === "pending" || columnId === "blocked" || columnId === "cancelled";

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
        <motion.div
          ref={ref}
          layout={!disableLayout}
          initial={disableLayout ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={disableLayout ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.95 }}
          transition={{ duration: disableLayout ? 0 : 0.15 }}
          className={cn(
            "group relative rounded-md border border-solid border-border/50 bg-card/60 px-2 py-1.5 cursor-pointer transition-colors hover:border-border hover:bg-card/90",
            (task.status === "completed" || task.status === "cancelled") && "opacity-60",
            isDragging && "opacity-50 scale-95"
          )}
          onClick={() => onSelect(task._id)}
        >
          <div className="flex items-start gap-1.5">
            {task.starred && (
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p
                className={cn(
                  "text-xs font-normal text-foreground truncate",
                  (task.status === "completed" || task.status === "cancelled") && "line-through text-muted-foreground"
                )}
              >
                {task.title}
              </p>
              {task.description?.trim() && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
                  {task.description.trim()}
                </p>
              )}
              {hasMetaRow && (
                <div className="flex flex-wrap items-center gap-1.5 gap-y-0.5 text-[10px] leading-none">
                  {(task.assignedAgent || task.assignedAgentId) && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 truncate max-w-[88px] rounded border px-1.5 py-0.5 font-medium",
                        getAgentTagColor(task.assignedAgent || task.assignedAgentId || "agent")
                      )}
                    >
                      <Bot className="w-2.5 h-2.5 shrink-0 opacity-80" />
                      <span className="truncate">{task.assignedAgent || task.assignedAgentId}</span>
                    </span>
                  )}
                  {columnId === "in_progress" && isAgentRunning && (
                    <Badge
                      variant="outline"
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0 h-5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40"
                    >
                      <Loader2 className="w-2.5 h-2.5 shrink-0 animate-spin" />
                      In progress
                    </Badge>
                  )}
                  {task.linkedDocumentUrl && (
                    <a
                      href={task.linkedDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 truncate max-w-[70px]"
                      onClick={(e) => e.stopPropagation()}
                      title={task.linkedDocumentUrl}
                    >
                      <FileText className="w-2.5 h-2.5 shrink-0 opacity-80" />
                      <span className="truncate">Doc</span>
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
              {nextCol && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(task._id, nextCol.id);
                  }}
                >
                  <ArrowRight className="w-2.5 h-2.5" />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task._id);
                  }}
                  title="Delete task"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Mobile: move-status button */}
          {mobileMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveStatus?.();
              }}
              className="w-full mt-1.5 py-1 rounded-md border border-border bg-background flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
            >
              <ArrowRightLeft className="w-2.5 h-2.5" />
              Move Status
            </button>
          )}
        </motion.div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {columnId === "pending" && onEdit && (
            <ContextMenuItem
              onClick={() => onEdit(task._id)}
            >
              <Pencil className="w-3.5 h-3.5 mr-2" />
              Edit task
            </ContextMenuItem>
          )}
          {canDelete && (
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(task._id)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete task
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
  );
});

MiniKanbanCard.displayName = "MiniKanbanCard";

/* ── Mini Column ────────────────────────────────────────── */

interface MiniKanbanColumnProps {
  column: MiniColumnConfig;
  tasks: Task[];
  onStatusChange: (taskId: string, status: KanbanStatus) => void;
  onSelect: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  // DnD props (from MissionQueue)
  isDragOver?: boolean;
  draggedTask?: Task | null;
  onDragOver?: (e: React.DragEvent, columnId: KanbanStatus) => void;
  onDrop?: (e: React.DragEvent, status: KanbanStatus) => void;
  onDragStart?: (e: React.DragEvent, task: Task) => void;
  onDragEnd?: () => void;
  onDragLeave?: (e: React.DragEvent, columnId: KanbanStatus) => void;
}

const MiniKanbanColumn = memo<MiniKanbanColumnProps>(({
  column,
  tasks,
  onStatusChange,
  onSelect,
  onEdit,
  onDelete,
  isDragOver = false,
  draggedTask = null,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onDragLeave,
}) => {
  const hasTasks = tasks.length > 0;

  return (
    <div
      className={cn(
        "flex-1 flex flex-col rounded-md border border-solid border-border bg-background/30 transition-all duration-150 min-w-0",
        isDragOver && "ring-1 ring-primary/40 bg-primary/5"
      )}
      onDragOver={onDragOver ? (e) => onDragOver(e, column.id) : undefined}
      onDrop={onDrop ? (e) => onDrop(e, column.id) : undefined}
      onDragLeave={onDragLeave ? (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onDragLeave(e, column.id);
        }
      } : undefined}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-t-0 border-l-0 border-r-0 border-solid border-border">
        <span className={cn("shrink-0", column.accentClass)}>
          {column.icon}
        </span>
        <span className="text-xs font-medium text-foreground truncate">
          {column.label}
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto font-normal">
          {tasks.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto customScrollbar2 p-1 space-y-1 min-h-[48px]">
        <AnimatePresence>
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-10 text-xs text-muted-foreground/40 font-normal">
              Empty
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task._id}
                draggable={!!onDragStart}
                onDragStart={onDragStart ? (e) => {
                  // Clone to document.body so the drag ghost isn't clipped by overflow containers
                  const el = e.currentTarget as HTMLElement;
                  const clone = el.cloneNode(true) as HTMLElement;
                  clone.style.position = "fixed";
                  clone.style.top = "-10000px";
                  clone.style.left = "0";
                  clone.style.width = `${el.offsetWidth}px`;
                  clone.style.pointerEvents = "none";
                  document.body.appendChild(clone);
                  const rect = el.getBoundingClientRect();
                  e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
                  requestAnimationFrame(() => clone.remove());
                  onDragStart(e, task);
                } : undefined}
                onDragEnd={onDragEnd}
              >
                <MiniKanbanCard
                  task={task}
                  columnId={column.id}
                  onStatusChange={onStatusChange}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  isDragging={draggedTask?._id === task._id}
                  disableLayout={!!draggedTask}
                />
              </div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

MiniKanbanColumn.displayName = "MiniKanbanColumn";

/* ── Mobile Status Move Modal (from MissionQueue) ────────── */

const StatusMoveModal: React.FC<{
  task: Task;
  onMove: (taskId: string, status: KanbanStatus) => void;
  onClose: () => void;
}> = ({ task, onMove, onClose }) => (
  <div
    className="fixed inset-0 z-50 bg-black/60 p-4 flex items-end sm:items-center sm:justify-center"
    onClick={onClose}
  >
    <div
      className="w-full sm:max-w-md bg-card border border-border rounded-t-xl sm:rounded-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs text-muted-foreground mb-1.5">Move task</div>
      <div className="text-sm font-medium mb-3 line-clamp-2">{task.title}</div>
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
        {COLUMNS.map((col) => (
          <button
            key={col.id}
            onClick={() => {
              onMove(task._id, col.id);
              onClose();
            }}
            disabled={task.status === col.id}
            className={cn(
              "w-full py-2.5 px-3 rounded-lg border border-border bg-background text-left text-sm flex items-center gap-2 transition-colors hover:bg-card disabled:opacity-40",
              task.status === col.id && "cursor-not-allowed"
            )}
          >
            <span className={col.accentClass}>{col.icon}</span>
            {col.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);

/* ── Agent File Editor (inline — same bridge calls as Agents tool page) ── */

interface AgentFile {
  relativePath: string;
  name: string;
}

const WELL_KNOWN_FILES = ["SOUL.md", "MEMORY.md", "IDENTITY.md", "AGENTS.md", "USER.md", "TOOLS.md"];

const FILE_ICONS_MAP: Record<string, string> = {
  "SOUL.md": "✨",
  "MEMORY.md": "🧠",
  "IDENTITY.md": "👤",
  "AGENTS.md": "👥",
  "USER.md": "👤",
  "TOOLS.md": "🔧",
};

const FILE_DESCRIPTIONS: Record<string, string> = {
  "SOUL.md": "Personality & behavior",
  "MEMORY.md": "Persistent memory",
  "IDENTITY.md": "Name & role",
  "AGENTS.md": "Team knowledge",
  "USER.md": "User info",
  "TOOLS.md": "Tools & MCP servers",
};

const AgentFileEditor: React.FC<{
  agentId: string;
  agentName: string;
  workspaceFolder?: string;
  onClose: () => void;
}> = ({ agentId, agentName, workspaceFolder, onClose }) => {
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<AgentFile | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch agent files
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await bridgeInvoke("list-agent-files", {})) as {
          success?: boolean;
          data?: { files?: AgentFile[] } | AgentFile[];
        };
        if (cancelled) return;
        const allFiles = Array.isArray(res?.data)
          ? res.data
          : (res?.data as { files?: AgentFile[] })?.files ?? [];
        const folder = workspaceFolder ?? agentId;
        const prefixes = [folder, `workspace-${folder}`];
        if (folder === "main") prefixes.push("workspace");
        const agentFiles = allFiles.filter((f: AgentFile) =>
          prefixes.some((p) => f.relativePath === p || f.relativePath.startsWith(p + "/"))
        );
        if (!cancelled) setFiles(agentFiles);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, workspaceFolder]);

  // Load file content
  useEffect(() => {
    if (!selectedFile) { setContent(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = (await bridgeInvoke("get-openclaw-doc", { relativePath: selectedFile.relativePath })) as {
          success?: boolean;
          content?: string | null;
        };
        if (!cancelled) setContent(res?.success && typeof res.content === "string" ? res.content : "");
      } catch { if (!cancelled) setContent(""); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedFile?.relativePath]);

  const handleSave = useCallback(async () => {
    if (!selectedFile || content === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = (await bridgeInvoke("write-openclaw-doc", {
        relativePath: selectedFile.relativePath,
        content,
      })) as { success?: boolean; error?: string };
      if (!res?.success) setSaveError(res?.error ?? "Failed to save");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
    setSaving(false);
  }, [selectedFile, content]);

  // Cmd/Ctrl+S to save
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  // File list view
  if (!selectedFile) {
    return (
      <div className="flex flex-col border-r border-border bg-background/60 w-[220px] shrink-0">
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] font-medium text-foreground truncate">{agentName}</span>
          </div>
          <button onClick={onClose} className="p-0.5 hover:bg-card rounded transition-colors shrink-0">
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto customScrollbar2 p-1 space-y-0.5">
          {loading && files.length === 0 && (
            <div className="p-1 space-y-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-1.5 px-1.5 py-1.5">
                  <Skeleton className="w-4 h-4 rounded shrink-0" />
                  <Skeleton className="h-2.5 w-20 rounded flex-1" />
                </div>
              ))}
            </div>
          )}
          {files.map((file) => {
            const icon = FILE_ICONS_MAP[file.name] || "📄";
            const desc = FILE_DESCRIPTIONS[file.name];
            return (
              <button
                key={file.relativePath}
                onClick={() => setSelectedFile(file)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors hover:bg-card/80"
              >
                <span className="text-xs shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-medium text-foreground truncate">{file.name}</div>
                  {desc && <div className="text-[9px] text-muted-foreground truncate">{desc}</div>}
                </div>
              </button>
            );
          })}
          {!loading && files.length === 0 && (
            <div className="text-[10px] text-muted-foreground/50 text-center py-3">No files found</div>
          )}
        </div>
      </div>
    );
  }

  // Editor view
  return (
    <div className="flex flex-col border-r border-border bg-background/60 w-[280px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={() => setSelectedFile(null)}
            className="p-0.5 hover:bg-card rounded transition-colors shrink-0"
            title="Back to files"
          >
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          </button>
          <span className="text-[10px] font-medium text-foreground truncate">
            {FILE_ICONS_MAP[selectedFile.name] || "📄"} {selectedFile.name}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="iconSm"
            className="h-5 w-5 text-[10px]"
            onClick={handleSave}
            disabled={saving || content === null}
            title="Save (⌘S)"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-[10px]">💾</span>}
          </Button>
          <button onClick={onClose} className="p-0.5 hover:bg-card rounded transition-colors">
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>
      {saveError && (
        <div className="text-[9px] text-red-500 px-2 py-1 bg-red-500/5 border-b border-border">{saveError}</div>
      )}
      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <textarea
            value={content ?? ""}
            onChange={(e) => { setContent(e.target.value); setSaveError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Edit file content..."
            className="w-full h-full p-2 bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none resize-none border-0"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
};

/* ── Team Panel (left sidebar — org-chart-based team hierarchy) ───── */

/** Renders agent avatar — profile image URL, emoji/text, or fallback Bot icon */
const AgentAvatar: React.FC<{
  agentId: string;
  identities: Map<string, { avatar?: string; emoji?: string; name?: string }>;
  size?: "sm" | "md";
  className?: string;
}> = ({ agentId, identities, size = "md", className }) => {
  const identity = identities.get(agentId);
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const textSize = size === "sm" ? "text-[8px]" : "text-[10px]";
  const fallbackContent = avatarText || identity?.emoji;

  return (
    <Avatar className={cn(dim, "shrink-0", className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={identity?.name || agentId} />}
      <AvatarFallback className={cn(textSize, "bg-primary/10 text-primary")}>
        {fallbackContent
          ? <span className={textSize}>{fallbackContent}</span>
          : <Bot className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      </AvatarFallback>
    </Avatar>
  );
};

/** Get all agent names belonging to a department (for task filtering) */
function getDeptAgentNames(orgData: OrgChartData, deptId: string): string[] {
  return orgData.nodes
    .filter((n) => n.department === deptId)
    .map((n) => n.name);
}

/** Left sidebar — shows agents in the selected team, clickable to edit config */
const TeamAgentsPanel = memo<{
  orgData: OrgChartData | null;
  agents: BridgeAgent[];
  selectedTeamId: string | null;
  taskCountByAgent: Record<string, number>;
  loading?: boolean;
  onEditAgent?: (agentId: string) => void;
  onAddAgent?: () => void;
}>(({ orgData, agents, selectedTeamId, taskCountByAgent, loading = false, onEditAgent, onAddAgent }) => {
  const [collapsed, setCollapsed] = useState(false);

  // Agents from list-agents that aren't in the org chart yet
  const unlistedAgentNodes = useMemo((): OrgNode[] => {
    const orgAgentIds = new Set((orgData?.nodes ?? []).map((n) => n.agentId));
    return agents
      .filter((a) => !orgAgentIds.has(a.id) && !orgAgentIds.has(a.name))
      .map((a) => ({
        id: `unlisted-${a.id}`,
        name: a.name,
        role: a.role || "",
        agentId: a.id,
        type: "specialist" as const,
        status: (a.status === "active" || a.status === "working" ? "working" : "idle") as "idle" | "working" | "offline",
        liveStatus: a.status,
      }));
  }, [agents, orgData]);

  // Get nodes for current team — merges org chart nodes + unlisted agents
  const teamNodes = useMemo(() => {
    const orgNodes = orgData?.nodes ?? [];
    const allNodes = [...orgNodes, ...unlistedAgentNodes];
    if (!selectedTeamId) return allNodes;
    if (selectedTeamId === "__unassigned__") {
      return allNodes.filter((n) => !n.department);
    }
    return orgNodes.filter((n) => n.department === selectedTeamId);
  }, [orgData, selectedTeamId, unlistedAgentNodes]);

  const agentIds = useMemo(() => teamNodes.map((n) => n.agentId), [teamNodes]);
  const identities = useAgentIdentities(agentIds);

  // Team label
  const teamLabel = useMemo(() => {
    if (!selectedTeamId) return "All Agents";
    if (selectedTeamId === "__unassigned__") return "Unassigned";
    return orgData?.departments.find((d) => d.id === selectedTeamId)?.name ?? "Team";
  }, [selectedTeamId, orgData]);

  const teamColor = useMemo(() => {
    if (!selectedTeamId || selectedTeamId === "__unassigned__") return undefined;
    return orgData?.departments.find((d) => d.id === selectedTeamId)?.color;
  }, [selectedTeamId, orgData]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-r border-border bg-background/40 w-8 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 hover:bg-card rounded transition-colors mt-1"
          title="Show agents"
        >
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </button>
        <Users className="w-3 h-3 text-muted-foreground mt-2" />
        <div className="flex-1 flex flex-col items-center gap-1.5 mt-2 overflow-hidden">
          {teamNodes.slice(0, 6).map((node) => (
            <AgentAvatar key={node.id} agentId={node.agentId} identities={identities} size="sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-r border-border bg-background/40 w-[140px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <div className="flex items-center gap-1 min-w-0">
          {teamColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />}
          {!teamColor && <Users className="w-3 h-3 text-muted-foreground shrink-0" />}
          <span className="text-[10px] font-medium text-foreground uppercase tracking-wide truncate">{teamLabel}</span>
          <span className="text-[9px] text-muted-foreground bg-muted rounded px-1 shrink-0">{teamNodes.length}</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="p-0.5 hover:bg-card rounded transition-colors shrink-0">
          <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto customScrollbar2 p-1 space-y-0.5">
        {teamNodes.map((node) => {
          const identity = identities.get(node.agentId);
          const displayName = identity?.name || node.name;
          const status = node.liveStatus || node.status || "idle";
          const isActive = status === "working" || status === "active";
          const taskCount = taskCountByAgent[node.name] || 0;
          const isOrchestrator = node.type === "orchestrator";

          return (
            <div
              key={node.id}
              className="group flex items-center gap-1.5 px-1.5 py-1.5 rounded hover:bg-card/60 cursor-pointer transition-colors"
              onClick={() => onEditAgent?.(node.agentId)}
              title={`${displayName} — click to edit`}
            >
              <div className="relative shrink-0">
                <AgentAvatar agentId={node.agentId} identities={identities} />
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-background",
                    isActive ? "bg-emerald-500" : "bg-muted-foreground/40"
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn(
                  "text-[10px] font-medium truncate",
                  isOrchestrator ? "text-amber-500" : "text-foreground"
                )}>
                  {displayName}
                </div>
                <div className="text-[9px] text-muted-foreground truncate">
                  {node.role || node.type.charAt(0).toUpperCase() + node.type.slice(1)}
                </div>
              </div>
              {taskCount > 0 && (
                <span className="text-[9px] text-muted-foreground bg-muted rounded px-1 shrink-0">
                  {taskCount}
                </span>
              )}
            </div>
          );
        })}

        {loading && teamNodes.length === 0 && (
          <div className="p-1 space-y-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-1.5 px-1.5 py-1.5">
                <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-2.5 w-16 rounded" />
                  <Skeleton className="h-2 w-10 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && teamNodes.length === 0 && (
          <div className="text-[10px] text-muted-foreground/50 text-center py-3">No agents</div>
        )}
      </div>

      {/* Footer — Add Agent + OrgChart link */}
      <div className="border-t border-border p-1 space-y-0.5">
        <button
          onClick={onAddAgent}
          className="w-full flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Agent
        </button>
        <a
          href="/Tool/OrgChart"
          className="w-full flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          Edit teams in Org Chart
        </a>
      </div>
    </div>
  );
});

TeamAgentsPanel.displayName = "TeamAgentsPanel";

/* ── Live Feed Panel (right sidebar — real-time domain events like MissionControl) ──── */

type FeedFilter = "all" | "tasks" | "agents";

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const LiveFeedPanel = memo<{
  events: DomainEvent[];
  selectedTeamAgentNames: string[] | null;
}>(({ events, selectedTeamAgentNames }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const feedRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    // Scope to selected team's agents
    const scoped = selectedTeamAgentNames
      ? events.filter((e) => e.agentName && selectedTeamAgentNames.some(
          (name) => name.toLowerCase() === e.agentName!.toLowerCase()
        ))
      : events;

    if (filter === "all") return scoped;
    if (filter === "tasks") return scoped.filter((e) => TASK_EVENT_TYPES.includes(e.type));
    return scoped.filter((e) => AGENT_EVENT_TYPES.includes(e.type));
  }, [events, filter, selectedTeamAgentNames]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-l border-border bg-background/40 w-8 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 hover:bg-card rounded transition-colors mt-1"
          title="Show live feed"
        >
          <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        </button>
        <Activity className="w-3 h-3 text-muted-foreground mt-2" />
      </div>
    );
  }

  return (
    <div className="flex flex-col border-l border-border bg-background/40 w-[180px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-foreground uppercase tracking-wide">Live Feed</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="p-0.5 hover:bg-card rounded transition-colors">
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 px-1.5 py-1 border-b border-border">
        {(["all", "tasks", "agents"] as FeedFilter[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] capitalize transition-colors",
              filter === tab
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Events */}
      <div ref={feedRef} className="flex-1 overflow-y-auto customScrollbar2 p-1 space-y-0.5">
        {filtered.length === 0 && (
          <div className="text-[10px] text-muted-foreground/50 text-center py-3">No events yet</div>
        )}

        {filtered.slice(0, 50).map((event) => {
          const icon = EVENT_ICONS[event.type];
          const isTaskEvent = TASK_EVENT_TYPES.includes(event.type);
          const isHighlight = event.type === "task_created" || event.type === "task_completed";
          const isError = event.type === "agent_error";

          return (
            <div
              key={event.id}
              className={cn(
                "px-1.5 py-1 rounded text-[10px] leading-tight border-l-2 transition-colors animate-in fade-in slide-in-from-right-2 duration-200",
                isHighlight
                  ? "bg-primary/5 border-primary/40"
                  : isError
                    ? "bg-red-500/5 border-red-500/40"
                    : "bg-transparent border-transparent hover:bg-card/60"
              )}
            >
              <div className="flex items-start gap-1">
                <span className="text-[9px] shrink-0 mt-px">{icon}</span>
                <p className={cn(
                  "flex-1 min-w-0 break-words line-clamp-2",
                  isTaskEvent ? "text-primary" : isError ? "text-red-500" : "text-foreground"
                )}>
                  {event.message}
                </p>
              </div>
              <div className="flex items-center gap-0.5 mt-0.5 text-[8px] text-muted-foreground/60">
                <Clock className="w-2 h-2" />
                {formatTimeAgo(event.timestamp)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

LiveFeedPanel.displayName = "LiveFeedPanel";

/* ── Widget Content ─────────────────────────────────────── */

const KanbanWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const { tasks, handleStatusChange, handleSelectTask, handleDeleteTask } =
    useTodoList();
  const { agents: openClawAgents, fetchAgents } = useOpenClawContext();
  const { openChat } = useFloatingChatOS();

  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // HTML5 drag-and-drop state (from MissionQueue)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanStatus | null>(null);

  // Mobile tab view state (from MissionQueue)
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<KanbanStatus>("pending");
  const [statusMoveTask, setStatusMoveTask] = useState<Task | null>(null);

  // Agents from OpenClawProvider (already fetched on 30s interval)
  const agents = useMemo<BridgeAgent[]>(
    () => (openClawAgents ?? []).map((a) => ({ ...a, workspaceFolder: undefined })),
    [openClawAgents]
  );

  // Team panel state — org chart based
  const [orgData, setOrgData] = useState<OrgChartData | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  // Live feed — real-time domain events (like MissionControl)
  const [feedEvents, setFeedEvents] = useState<DomainEvent[]>([]);
  const prevTasksRef = useRef<Task[]>([]);
  const isInitialMount = useRef(true);

  const pushEvent = useCallback((evt: DomainEvent) => {
    setFeedEvents((prev) => [evt, ...prev].slice(0, 100));
  }, []);

  // Load historical events from events.jsonl on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = (await bridgeInvoke("get-events", {})) as Record<string, unknown>[];
        if (cancelled || !Array.isArray(raw)) return;
        const mapped: DomainEvent[] = raw
          .map((e): DomainEvent | null => {
            const type = String(e.type ?? "system");
            const ts = e.timestamp ? new Date(String(e.timestamp)).getTime() : Date.now();
            if (isNaN(ts)) return null;
            let eventType: EventType = "system";
            if (type.includes("task_created") || type === "task_added") eventType = "task_created";
            else if (type.includes("task_completed") || type === "task_done") eventType = "task_completed";
            else if (type.includes("task_status") || type === "task_updated") eventType = "task_status_changed";
            else if (type.includes("task_deleted") || type === "task_removed") eventType = "task_deleted";
            else if (type.includes("agent_start") || type === "agent_run") eventType = "agent_started";
            else if (type.includes("agent_complete") || type === "agent_done") eventType = "agent_completed";
            else if (type.includes("agent_error") || type === "error") eventType = "agent_error";
            const message =
              (typeof e.message === "string" ? e.message : null) ??
              (typeof e.title === "string" ? e.title : null) ??
              type;
            return {
              id: makeEventId(),
              type: eventType,
              agentId: typeof e.agentId === "string" ? e.agentId : undefined,
              agentName: typeof e.agentName === "string" ? e.agentName : (typeof e.agent === "string" ? e.agent : undefined),
              taskId: typeof e.taskId === "string" ? e.taskId : undefined,
              message,
              timestamp: ts,
            };
          })
          .filter((e): e is DomainEvent => e !== null)
          .reverse(); // newest first
        if (!cancelled && mapped.length > 0) {
          setFeedEvents((prev) => [...mapped, ...prev].slice(0, 100));
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch org chart data (teams, departments, agents hierarchy)
  const refreshOrgChart = useCallback(async () => {
    try {
      const res = (await bridgeInvoke("get-org-status", {})) as OrgChartData & { success?: boolean };
      if (res && (res as { success?: boolean }).success !== false) {
        setOrgData({
          nodes: res.nodes ?? [],
          edges: res.edges ?? [],
          tasks: res.tasks ?? [],
          departments: res.departments ?? [],
        });
      }
    } catch { /* ignore */ }
    setOrgLoading(false);
  }, []);

  useEffect(() => {
    refreshOrgChart();
    const interval = setInterval(refreshOrgChart, 30_000);
    return () => clearInterval(interval);
  }, [refreshOrgChart]);

  // Re-fetch org data when gateway (re)connects — handles race where widget
  // mounts before the hub WebSocket is established on a remote machine.
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      if (getGatewayConnectionState().connected) {
        (async () => {
          try {
            const res = (await bridgeInvoke("get-org-status", {})) as OrgChartData & { success?: boolean };
            if (res && (res as { success?: boolean }).success !== false) {
              setOrgData({
                nodes: res.nodes ?? [],
                edges: res.edges ?? [],
                tasks: res.tasks ?? [],
                departments: res.departments ?? [],
              });
            }
          } catch { /* ignore */ }
          setOrgLoading(false);
        })();
      }
    });
  }, []);

  // Real-time agent events via Gateway WebSocket (like StatusWidget)
  useEffect(() => {
    const activeRuns = new Map<string, { agentId: string; agentName: string }>();

    const unsub = gatewayConnection.onChatEvent((payload: ChatEventPayload) => {
      const { runId, sessionKey, state } = payload;
      if (!runId || !sessionKey) return;

      // Parse agentId from sessionKey (format: agent:xxx:...)
      const parts = sessionKey.split(":");
      const agentId = parts.length >= 2 ? parts[1] : undefined;
      if (!agentId) return;

      // Resolve agent name from agents list or org nodes
      const agentName =
        agents.find((a) => a.id === agentId)?.name ||
        orgData?.nodes.find((n) => n.agentId === agentId)?.name ||
        agentId;

      if (state === "delta" && !activeRuns.has(runId)) {
        activeRuns.set(runId, { agentId, agentName });
        pushEvent({
          id: makeEventId(),
          type: "agent_started",
          agentId,
          agentName,
          message: `${agentName} started working`,
          timestamp: Date.now(),
        });
      } else if (state === "final" || state === "aborted") {
        const run = activeRuns.get(runId);
        activeRuns.delete(runId);
        pushEvent({
          id: makeEventId(),
          type: "agent_completed",
          agentId: run?.agentId || agentId,
          agentName: run?.agentName || agentName,
          message: `${run?.agentName || agentName} finished`,
          timestamp: Date.now(),
        });
      } else if (state === "error") {
        const run = activeRuns.get(runId);
        activeRuns.delete(runId);
        pushEvent({
          id: makeEventId(),
          type: "agent_error",
          agentId: run?.agentId || agentId,
          agentName: run?.agentName || agentName,
          message: `${run?.agentName || agentName}: ${payload.errorMessage || "error"}`,
          timestamp: Date.now(),
        });
      }
    });

    return unsub;
  }, [agents, orgData, pushEvent]);

  // Track task changes → emit task domain events (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevTasksRef.current = tasks;
      return;
    }
    const prev = prevTasksRef.current;
    const prevMap = new Map(prev.map((t) => [t._id, t]));

    for (const task of tasks) {
      const old = prevMap.get(task._id);
      if (!old) {
        // New task
        pushEvent({
          id: makeEventId(),
          type: "task_created",
          taskId: task._id,
          agentName: task.assignedAgent || task.assignedAgentId || undefined,
          message: `Task created: ${task.title}`,
          timestamp: Date.now(),
        });
      } else if (old.status !== task.status) {
        // Status changed
        const isCompleted = task.status === "completed";
        pushEvent({
          id: makeEventId(),
          type: isCompleted ? "task_completed" : "task_status_changed",
          taskId: task._id,
          agentName: task.assignedAgent || task.assignedAgentId || undefined,
          message: isCompleted
            ? `Completed: ${task.title}`
            : `${task.title} → ${task.status.replace("_", " ")}`,
          timestamp: Date.now(),
        });
      }
    }

    // Detect deleted tasks
    for (const old of prev) {
      if (!tasks.find((t) => t._id === old._id)) {
        pushEvent({
          id: makeEventId(),
          type: "task_deleted",
          taskId: old._id,
          agentName: old.assignedAgent || old.assignedAgentId || undefined,
          message: `Deleted: ${old.title}`,
          timestamp: Date.now(),
        });
      }
    }

    prevTasksRef.current = tasks;
  }, [tasks, pushEvent]);

  // Detect mobile via matchMedia
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Count tasks per agent name (for TeamPanel badge)
  const taskCountByAgent = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      const key = t.assignedAgent || t.assignedAgentId;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  // Unlisted agent names (agents from list-agents not in org chart) — computed at parent scope
  const mainUnlistedNames = useMemo(() => {
    const orgAgentIds = new Set((orgData?.nodes ?? []).map((n) => n.agentId));
    return agents
      .filter((a) => !orgAgentIds.has(a.id) && !orgAgentIds.has(a.name))
      .map((a) => a.name);
  }, [agents, orgData]);

  // Get agent names for the selected team (for filtering tasks + live feed)
  const selectedTeamAgentNames = useMemo((): string[] | null => {
    if (!selectedTeamId) return null;
    if (selectedTeamId === "__unassigned__") {
      const orgUnassigned = (orgData?.nodes ?? []).filter((n) => !n.department).map((n) => n.name);
      return [...orgUnassigned, ...mainUnlistedNames];
    }
    if (!orgData) return null;
    return getDeptAgentNames(orgData, selectedTeamId);
  }, [selectedTeamId, orgData, mainUnlistedNames]);

  const selectedTeamAgentKeys = useMemo((): Set<string> | null => {
    if (!selectedTeamAgentNames) return null;
    const keys = new Set<string>();
    selectedTeamAgentNames.forEach((name) => {
      if (!name) return;
      keys.add(name);
      const match = agents.find((a) => a.name === name || a.id === name);
      if (match?.id) keys.add(match.id);
      if (match?.name) keys.add(match.name);
    });
    return keys;
  }, [selectedTeamAgentNames, agents]);

  const grouped = useMemo(() => {
    const g: Record<KanbanStatus, Task[]> = {
      pending: [],
      in_progress: [],
      blocked: [],
      completed: [],
      cancelled: [],
    };
    tasks.forEach((task) => {
      // Filter by selected team's agents
      if (selectedTeamAgentKeys) {
        const matchesAssignedAgent = task.assignedAgent && selectedTeamAgentKeys.has(task.assignedAgent);
        const matchesAssignedAgentId = task.assignedAgentId && selectedTeamAgentKeys.has(task.assignedAgentId);
        if (!matchesAssignedAgent && !matchesAssignedAgentId) return;
      }

      const s = task.status as KanbanStatus;
      if (s === "completed") {
        if (isCompletedToday(task)) g.completed.push(task);
      } else if (g[s]) {
        g[s].push(task);
      } else {
        g.pending.push(task);
      }
    });
    return g;
  }, [tasks, selectedTeamAgentKeys]);

  const handleMove = useCallback(
    (taskId: string, newStatus: KanbanStatus) => {
      handleStatusChange(taskId, newStatus);
    },
    [handleStatusChange]
  );

  const handleSelect = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t._id === taskId) ?? null;
      if (!task) return;
      const agentName = task.assignedAgent || task.assignedAgentId;
      const agent = agentName
        ? agents.find(
            (a) => a.name === agentName || a.id === agentName
          )
        : null;
      const agentId = agent?.id || agentName || "main";

      // Build task context for the floating chat detail panel
      const taskCtx = {
        _id: task._id,
        title: task.title,
        description: task.description,
        status: task.status,
        assignedAgent: task.assignedAgent,
        assignedAgentId: task.assignedAgentId,
        linkedDocumentUrl: task.linkedDocumentUrl,
        createdAt: task.createdAt?.toISOString(),
        updatedAt: task.updatedAt?.toISOString(),
        finishedAt: task.finishedAt?.toISOString(),
        starred: task.starred,
      };

      // Open chat immediately so the window appears instantly
      openChat(agentId, undefined, taskCtx);

      // Resolve session in the background — non-blocking.
      // Each task gets its own session key: `agent:{agentId}:task-{taskId}`.
      // This prevents cross-contamination from the agent's main/shared session.
      const taskSessionKey = `agent:${agentId}:task-${taskId}`;
      (async () => {
        try {
          // Check for existing linked session that's task-specific
          const sessions = await bridgeInvoke("get-task-sessions", { taskId, agentId }) as any[];
          if (Array.isArray(sessions) && sessions.length > 0) {
            // Only use linked session if it's task-specific (contains the taskId).
            // Otherwise it's a shared/reused agent session — ignore it.
            const linked = sessions.find((s: any) => s.session_key?.includes(taskId));
            if (linked) {
              openChat(agentId, linked.session_key, taskCtx);
              return;
            }
          }

          // No valid task-specific session — spawn a new one with the task key
          const logs = await bridgeInvoke("get-task-logs", { taskId, agentId }).catch(() => []) as any[];

          // Build the spawn prompt
          const lines: string[] = [`Continue task ${task._id}`, ``];

          // Task info
          lines.push(`## Task Info`);
          lines.push(`- **Title:** ${task.title}`);
          lines.push(`- **Status:** ${task.status.replace("_", " ")}`);
          if (task.createdAt) lines.push(`- **Created:** ${task.createdAt.toISOString().split("T")[0]}`);
          if (task.finishedAt) lines.push(`- **Finished:** ${task.finishedAt.toISOString().split("T")[0]}`);
          if (task.linkedDocumentUrl) lines.push(`- **Linked Doc:** ${task.linkedDocumentUrl}`);

          // Description
          if (task.description?.trim()) {
            lines.push(``, `## Description`, task.description.trim());
          }

          // Recent logs
          if (Array.isArray(logs) && logs.length > 0) {
            const recentLogs = logs.slice(0, 10);
            lines.push(``, `## Recent Logs (${Math.min(logs.length, 10)} entries)`);
            recentLogs.forEach((l: any, i: number) => {
              const typeLabel = (l.type || "note").charAt(0).toUpperCase() + (l.type || "note").slice(1);
              lines.push(`${i + 1}. **${typeLabel}** - ${l.content}`);
            });
          }

          // Placeholder for user's first message
          lines.push(``, `## User's Question/Request`, `[Awaiting user's first message]`);

          const spawnResult = await gatewayConnection.request<{ sessionKey?: string }>("sessions.spawn", {
            task: lines.join("\n"),
            agentId,
            label: `Task: ${task.title}`,
            runtime: "subagent",
            mode: "session",
            key: taskSessionKey, // Force unique session per task
          });

          const sessionKey = spawnResult?.sessionKey || taskSessionKey;
          bridgeInvoke("link-task-session", { taskId, sessionKey }).catch(() => {});
          openChat(agentId, sessionKey, taskCtx);
        } catch (e) {
          console.warn("[KanbanWidget] session resolve/spawn failed:", e);
          // Fallback: use the task-specific key directly
          openChat(agentId, taskSessionKey, taskCtx);
        }
      })();
    },
    [tasks, agents, openChat]
  );

  const handleEdit = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t._id === taskId) ?? null;
      if (task) setEditTask(task);
    },
    [tasks]
  );

  const handleDelete = useCallback(
    (taskId: string) => {
      handleDeleteTask(taskId);
    },
    [handleDeleteTask]
  );

  // HTML5 drag handlers (from MissionQueue)
  const handleDragStart = useCallback(
    (e: React.DragEvent, task: Task) => {
      if (isMobile) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", task._id);
      setDraggedTask(task);
    },
    [isMobile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, columnId: KanbanStatus) => {
      if (isMobile) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(columnId);
    },
    [isMobile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetStatus: KanbanStatus) => {
      if (isMobile) return;
      e.preventDefault();
      if (draggedTask && draggedTask.status !== targetStatus) {
        handleMove(draggedTask._id, targetStatus);
      }
      setDragOverColumn(null);
      // Delay clearing draggedTask by one frame so disableLayout stays true
      // during the re-render that moves the card to its new column
      requestAnimationFrame(() => setDraggedTask(null));
    },
    [isMobile, draggedTask, handleMove]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null);
    setDragOverColumn(null);
  }, []);

  const handleDragLeave = useCallback(
    (_e: React.DragEvent, columnId: KanbanStatus) => {
      setDragOverColumn((prev) => (prev === columnId ? null : prev));
    },
    []
  );

  // Stable callbacks for child components (prevents re-renders from new fn refs)
  const openAddTask = useCallback(() => setAddTaskOpen(true), []);
  const closeAddTask = useCallback(() => setAddTaskOpen(false), []);
  const openAddAgent = useCallback(() => setAddAgentOpen(true), []);
  const handleEditAgent = useCallback((agentId: string) => setEditingAgentId(agentId), []);
  const closeAgentDetail = useCallback((open: boolean) => { if (!open) setEditingAgentId(null); }, []);
  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all shadow-sm duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        <KanbanCustomHeader
          {...props}
          onOpenAddTask={openAddTask}
          orgData={orgData}
          selectedTeamId={selectedTeamId}
          onSelectTeam={setSelectedTeamId}
          taskCount={tasks.length}
        />

        {isMobile ? (
          /* ── Mobile tab view (from MissionQueue) ── */
          <div className="flex-1 flex flex-col overflow-hidden p-2 pt-0 min-h-0">
            <div className="flex gap-1 overflow-x-auto pb-1.5 shrink-0">
              {COLUMNS.map((col) => {
                const count = grouped[col.id].length;
                const selected = mobileTab === col.id;
                return (
                  <button
                    key={col.id}
                    onClick={() => setMobileTab(col.id)}
                    className={cn(
                      "px-2 py-1 rounded-full border whitespace-nowrap text-[10px] transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground border-primary font-medium"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {col.label} ({count})
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto customScrollbar2 space-y-1 pb-[env(safe-area-inset-bottom)]">
              <AnimatePresence>
                {grouped[mobileTab].length === 0 ? (
                  <div className="flex items-center justify-center h-10 text-xs text-muted-foreground/40 font-normal">
                    Empty
                  </div>
                ) : (
                  grouped[mobileTab].map((task) => (
                    <MiniKanbanCard
                      key={task._id}
                      task={task}
                      columnId={mobileTab}
                      onStatusChange={handleMove}
                      onSelect={handleSelect}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      mobileMode
                      onMoveStatus={() => setStatusMoveTask(task)}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* ── Desktop 3-panel: Agents | Kanban | Live Feed (team selector in header) ── */
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left: Team agents sidebar (always visible) */}
            <TeamAgentsPanel
              orgData={orgData}
              agents={agents}
              selectedTeamId={selectedTeamId}
              taskCountByAgent={taskCountByAgent}
              loading={orgLoading}
              onEditAgent={handleEditAgent}
              onAddAgent={openAddAgent}
            />

            {/* Agent detail dialog — only mount when actually editing */}
            {editingAgentId && (
              <AgentDetailDialog
                open
                onOpenChange={closeAgentDetail}
                agentId={editingAgentId}
                agentName={
                  orgData?.nodes.find((n) => n.agentId === editingAgentId)?.name ??
                  agents.find((a) => a.id === editingAgentId)?.name ??
                  editingAgentId
                }
                workspaceFolder={agents.find((a) => a.id === editingAgentId)?.workspaceFolder}
                onDeleted={() => { setEditingAgentId(null); fetchAgents(); refreshOrgChart(); }}
              />
            )}

            {/* Center: Kanban columns with DnD */}
            <div className="flex-1 flex gap-1.5 p-2 pt-1 overflow-x-auto overflow-y-hidden min-w-0">
              {COLUMNS.map((col) => (
                <MiniKanbanColumn
                  key={col.id}
                  column={col}
                  tasks={grouped[col.id]}
                  onStatusChange={handleMove}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isDragOver={dragOverColumn === col.id}
                  draggedTask={draggedTask}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragLeave={handleDragLeave}
                />
              ))}
            </div>

            {/* Right: Live Feed Panel */}
            <LiveFeedPanel events={feedEvents} selectedTeamAgentNames={selectedTeamAgentNames} />
          </div>
        )}

      </Card>

      {/* Dialogs — only mount when needed to avoid re-renders from context */}
      {addTaskOpen && (
        <AddTaskDialog
          open
          onOpenChange={setAddTaskOpen}
          onSuccess={closeAddTask}
          preloadedAgents={agents}
        />
      )}
      {editTask && (
        <EditTaskDialog
          open
          onOpenChange={(open) => { if (!open) setEditTask(null); }}
          task={editTask}
          preloadedAgents={agents}
        />
      )}
      {addAgentOpen && (
        <AddAgentDialog open onOpenChange={setAddAgentOpen} />
      )}

      {/* Mobile status move bottom sheet (from MissionQueue) */}
      {statusMoveTask && (
        <StatusMoveModal
          task={statusMoveTask}
          onMove={handleMove}
          onClose={() => setStatusMoveTask(null)}
        />
      )}
    </motion.div>
  );
});

KanbanWidgetContent.displayName = "KanbanWidgetContent";

const KanbanWidget = memo((props: CustomProps) => {
  return <KanbanWidgetContent {...props} />;
});

KanbanWidget.displayName = "KanbanWidget";

export { KanbanCustomHeader };
export default KanbanWidget;
