import React, { useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  PlayCircle,
  Eye,
  CheckCircle2,
  GripVertical,
  Star,
  Calendar,
  MoreHorizontal,
  Trash2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Task } from "./types";
import { useTodoList } from "./provider/todolistProvider";
import { useIsTaskRunningCron } from "./hooks/useIsTaskRunningCron";

export type KanbanColumn = "pending" | "in_progress" | "blocked" | "completed";

interface ColumnConfig {
  id: KanbanColumn;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  dotClass: string;
  bgClass: string;
  borderClass: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: "pending",
    label: "Backlog",
    icon: <Inbox className="w-3.5 h-3.5" />,
    accentClass: "text-muted-foreground",
    dotClass: "bg-muted-foreground",
    bgClass: "bg-muted/20",
    borderClass: "border-muted-foreground/20",
  },
  {
    id: "in_progress",
    label: "In Progress",
    icon: <PlayCircle className="w-3.5 h-3.5" />,
    accentClass: "text-primary",
    dotClass: "bg-primary",
    bgClass: "bg-primary/5",
    borderClass: "border-primary/20",
  },
  {
    id: "blocked",
    label: "Review",
    icon: <Eye className="w-3.5 h-3.5" />,
    accentClass: "text-amber-500",
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-500/5",
    borderClass: "border-amber-500/20",
  },
  {
    id: "completed",
    label: "Done (today)",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    accentClass: "text-emerald-500",
    dotClass: "bg-emerald-500",
    bgClass: "bg-emerald-500/5",
    borderClass: "border-emerald-500/20",
  },
];

/** True if task was completed today (local date). Keeps Done column scannable. */
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

interface KanbanCardProps {
  task: Task;
  column: ColumnConfig;
  onStatusChange: (taskId: string, status: KanbanColumn) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
  compact?: boolean;
}

const KanbanCard = React.forwardRef<HTMLDivElement, KanbanCardProps>(
  (
    {
      task,
      column,
      onStatusChange,
      onSelect,
      onDelete,
      onToggleStar,
      compact = false,
    },
    ref
  ) => {
    const isAgentRunning = useIsTaskRunningCron(task._id);

    const nextStatus = useMemo(() => {
      const idx = COLUMNS.findIndex((c) => c.id === column.id);
      return idx < COLUMNS.length - 1 ? COLUMNS[idx + 1] : null;
    }, [column.id]);

    const stepsProgress = useMemo(() => {
      const total = task.steps.completed + task.steps.uncompleted;
      if (total === 0) return null;
      return { done: task.steps.completed, total };
    }, [task.steps]);

    return (
      <motion.div
        ref={ref}
        layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group relative rounded-lg border border-solid border-border bg-card/80 backdrop-blur-sm p-3 cursor-pointer transition-all duration-200",
        "hover:border-border hover:shadow-sm hover:bg-card",
        "active:scale-100 active:opacity-100",
        compact && "p-2"
      )}
      onClick={() => onSelect(task._id)}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs font-medium text-foreground leading-snug truncate",
              task.status === "completed" && "line-through text-muted-foreground"
            )}
          >
            {task.title}
          </p>

          {column.id === "in_progress" && isAgentRunning && (
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-primary">
              <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
              <span>In progress</span>
            </div>
          )}

          {!compact && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {task.starred && (
                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
              )}
              {task.dueDate && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 h-4 gap-0.5"
                >
                  <Calendar className="w-2.5 h-2.5" />
                  {new Date(task.dueDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Badge>
              )}
              {stepsProgress && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 h-4 gap-0.5"
                >
                  {stepsProgress.done}/{stepsProgress.total}
                </Badge>
              )}
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {COLUMNS.filter((c) => c.id !== column.id).map((col) => (
              <DropdownMenuItem
                key={col.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task._id, col.id);
                }}
                className="text-xs gap-2"
              >
                <span className={col.accentClass}>{col.icon}</span>
                Move to {col.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar(task._id);
              }}
              className="text-xs gap-2"
            >
              <Star
                className={cn(
                  "w-3.5 h-3.5",
                  task.starred
                    ? "text-amber-400 fill-amber-400"
                    : "text-muted-foreground"
                )}
              />
              {task.starred ? "Unstar" : "Star"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task._id);
              }}
              className="text-xs gap-2 text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {nextStatus && (
        <Button
          variant="ghost"
          size="iconSm"
          className="absolute bottom-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(task._id, nextStatus.id);
          }}
          title={`Move to ${nextStatus.label}`}
        >
          <ArrowRight className="w-3 h-3" />
        </Button>
      )}
    </motion.div>
    );
  }
);

KanbanCard.displayName = "KanbanCard";

interface KanbanColumnComponentProps {
  column: ColumnConfig;
  tasks: Task[];
  onStatusChange: (taskId: string, status: KanbanColumn) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
  compact?: boolean;
}

const KanbanColumnComponent: React.FC<KanbanColumnComponentProps> = ({
  column,
  tasks,
  onStatusChange,
  onSelect,
  onDelete,
  onToggleStar,
  compact = false,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col min-w-0 flex-1 rounded-lg border border-solid border-border bg-background/40 transition-all duration-200"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-t-0 border-l-0 border-r-0 border-solid border-border">
        <span className={cn("shrink-0", column.accentClass)}>
          {column.icon}
        </span>
        <span className="text-xs font-medium text-foreground">
          {column.label}
        </span>
        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-4 ml-auto font-medium"
        >
          {tasks.length}
        </Badge>
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto customScrollbar2 p-2 space-y-1.5 min-h-[80px]",
          compact && "p-1.5 space-y-1"
        )}
      >
        <AnimatePresence mode="popLayout">
          {tasks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center h-16 text-xs text-muted-foreground/50 font-medium"
            >
              No tasks
            </motion.div>
          ) : (
            tasks.map((task) => (
              <KanbanCard
                key={task._id}
                task={task}
                column={column}
                onStatusChange={onStatusChange}
                onSelect={onSelect}
                onDelete={onDelete}
                onToggleStar={onToggleStar}
                compact={compact}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

interface KanbanBoardProps {
  compact?: boolean;
  className?: string;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  compact = false,
  className,
}) => {
  const {
    tasks,
    handleStatusChange,
    handleSelectTask,
    handleDeleteTask,
    handleToggleStar,
  } = useTodoList();

  const columns = useMemo(() => {
    const grouped: Record<KanbanColumn, Task[]> = {
      pending: [],
      in_progress: [],
      blocked: [],
      completed: [],
    };
    tasks.forEach((task) => {
      const status = task.status as KanbanColumn;
      if (status === "completed") {
        if (isCompletedToday(task)) grouped.completed.push(task);
      } else if (grouped[status]) {
        grouped[status].push(task);
      } else {
        grouped.pending.push(task);
      }
    });
    return grouped;
  }, [tasks]);

  const handleMoveTask = useCallback(
    (taskId: string, newStatus: KanbanColumn) => {
      handleStatusChange(taskId, newStatus);
    },
    [handleStatusChange]
  );

  const handleSelect = useCallback(
    (taskId: string) => {
      handleSelectTask(taskId);
    },
    [handleSelectTask]
  );

  const handleDelete = useCallback(
    (taskId: string) => {
      handleDeleteTask(taskId);
    },
    [handleDeleteTask]
  );

  const handleStar = useCallback(
    (taskId: string) => {
      handleToggleStar(taskId);
    },
    [handleToggleStar]
  );

  return (
    <div
      className={cn(
        "flex gap-2 h-full w-full overflow-x-auto customScrollbar2",
        compact ? "p-2" : "p-3",
        className
      )}
    >
      {COLUMNS.map((column) => (
        <KanbanColumnComponent
          key={column.id}
          column={column}
          tasks={columns[column.id]}
          onStatusChange={handleMoveTask}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onToggleStar={handleStar}
          compact={compact}
        />
      ))}
    </div>
  );
};

export default KanbanBoard;
