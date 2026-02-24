import React, { memo, useMemo, useCallback, useState, useEffect } from "react";
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
  Star,
  ExternalLink,
  Plus,
  FileText,
  Bot,
  Calendar,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";
import { useOS } from "@OS/Provider/OSProv";
import { Task } from "$/components/Tool/TodoList/types";
import { useFocusMode } from "./hooks/useFocusMode";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { DocEntry } from "$/components/Tool/Docs/types";

interface TeamAgent {
  id: string;
  name: string;
  status: string;
  role?: string;
}

type KanbanStatus = "pending" | "in_progress" | "blocked" | "completed";

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

const KanbanCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  const { tasks, handleAddTask } = useTodoList();
  const { toolAbstracts } = useOS();
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskAssignedAgent, setNewTaskAssignedAgent] = useState("");
  const [newTaskLinkedDocumentUrl, setNewTaskLinkedDocumentUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [linkDocCustomMode, setLinkDocCustomMode] = useState(false);

  useEffect(() => {
    if (!addTaskOpen) return;
    setAgentsLoading(true);
    bridgeInvoke("get-team", {})
      .then((res) => {
        const list = Array.isArray(res) ? res as TeamAgent[] : [];
        setAgents(list);
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
  }, [addTaskOpen]);

  useEffect(() => {
    if (!addTaskOpen) return;
    setDocsLoading(true);
    bridgeInvoke("list-openclaw-docs", {})
      .then((res) => {
        const result = res as { success?: boolean; data?: { files?: DocEntry[] } | DocEntry[] };
        const data = result?.data;
        const files = Array.isArray(data) ? data : (data && "files" in data && Array.isArray(data.files) ? data.files : []);
        setDocs(files);
      })
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  }, [addTaskOpen]);

  const todoTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "todo-list"),
    [toolAbstracts]
  );

  const totalTasks = tasks.length;

  const onAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const agent =
        newTaskAssignedAgent
          ? agents.find((a) => a.id === newTaskAssignedAgent)
          : undefined;
      await handleAddTask({
        title,
        description: newTaskDescription.trim() || undefined,
        assignedAgent: agent?.name ?? undefined,
        linkedDocumentUrl: newTaskLinkedDocumentUrl.trim() || undefined,
      });
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskAssignedAgent("");
      setNewTaskLinkedDocumentUrl("");
      setLinkDocCustomMode(false);
      setAddTaskOpen(false);
    } finally {
      setAdding(false);
    }
  };

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
      </div>

      <div className="flex items-center gap-1.5">
        <Popover
          open={addTaskOpen}
          onOpenChange={(open) => {
            setAddTaskOpen(open);
            if (!open) setLinkDocCustomMode(false);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="h-6 w-6"
              title="Add task"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="flex flex-col gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-muted-foreground">
                  Title
                </Label>
                <Input
                  placeholder="Task title..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) onAddTask();
                  }}
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  placeholder="Add a description..."
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="min-h-[60px] text-sm resize-none shadow-none"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  Assigned agent
                </Label>
                <Select
                  value={newTaskAssignedAgent || "__none__"}
                  onValueChange={(v) =>
                    setNewTaskAssignedAgent(v === "__none__" ? "" : v)
                  }
                  disabled={agentsLoading}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue
                      placeholder={
                        agentsLoading ? "Loading agents..." : "Select agent"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {agents.map((agent) => {
                      const label = agent.name || agent.id || "Unnamed";
                      return (
<SelectItem
                        key={agent.id}
                        value={agent.id}
                        className="text-sm"
                      >
                          {label}
                          {agent.role && (
                            <span className="text-muted-foreground ml-1">
                              ({agent.role})
                            </span>
                          )}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Link document
                </Label>
                {(() => {
                  const docUrls = docs.map((d) =>
                    `/Tool/Docs?path=${encodeURIComponent(d.relativePath)}`
                  );
                  const isDocUrl =
                    newTaskLinkedDocumentUrl &&
                    docUrls.includes(newTaskLinkedDocumentUrl);
                  const selectValue = linkDocCustomMode
                    ? "__custom__"
                    : !newTaskLinkedDocumentUrl
                      ? "__none__"
                      : isDocUrl
                        ? newTaskLinkedDocumentUrl
                        : "__custom__";
                  return (
                    <div className="space-y-1.5">
                      <Select
                        value={selectValue}
                        onValueChange={(v) => {
                          if (v === "__custom__") {
                            setLinkDocCustomMode(true);
                          } else if (v === "__none__") {
                            setLinkDocCustomMode(false);
                            setNewTaskLinkedDocumentUrl("");
                          } else {
                            setLinkDocCustomMode(false);
                            setNewTaskLinkedDocumentUrl(v);
                          }
                        }}
                        disabled={docsLoading}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue
                            placeholder={
                              docsLoading
                                ? "Loading docs..."
                                : "Pick a doc or paste URL"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-sm">
                            None
                          </SelectItem>
                          {docs.map((doc) => {
                            const url = `/Tool/Docs?path=${encodeURIComponent(doc.relativePath)}`;
                            return (
                              <SelectItem
                                key={doc.relativePath}
                                value={url}
                                className="text-sm"
                              >
                                {doc.name}
                              </SelectItem>
                            );
                          })}
                          <SelectItem
                            value="__custom__"
                            className="text-sm"
                          >
                            Other (paste URL)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {(linkDocCustomMode || selectValue === "__custom__") && (
                        <Input
                          placeholder="https://... or /Tool/Docs?path=..."
                          value={newTaskLinkedDocumentUrl}
                          onChange={(e) =>
                            setNewTaskLinkedDocumentUrl(e.target.value)
                          }
                          className="h-8 text-sm"
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
              <Button
                size="sm"
                className="h-7 text-sm"
                onClick={onAddTask}
                disabled={!newTaskTitle.trim() || adding}
              >
                {adding ? "Adding..." : "Add task"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
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
};

interface MiniKanbanCardProps {
  task: Task;
  columnId: KanbanStatus;
  onStatusChange: (taskId: string, status: KanbanStatus) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

const MiniKanbanCard = React.forwardRef<HTMLDivElement, MiniKanbanCardProps>(
  ({ task, columnId, onStatusChange, onSelect, onDelete }, ref) => {
    const nextCol = useMemo(() => {
      const idx = COLUMNS.findIndex((c) => c.id === columnId);
      return idx < COLUMNS.length - 1 ? COLUMNS[idx + 1] : null;
    }, [columnId]);

    const hasMetaRow =
      task.createdAt || task.assignedAgent || task.linkedDocumentUrl;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      draggable
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        const ev = e as unknown as React.DragEvent;
        ev.dataTransfer?.setData("text/plain", task._id);
        ev.dataTransfer?.setData("application/kanban-status", task.status);
      }}
      className={cn(
        "group relative rounded-md border border-solid border-border/50 bg-card/60 px-2 py-1.5 cursor-grab active:cursor-grabbing transition-all hover:border-border hover:bg-card/90",
        task.status === "completed" && "opacity-60"
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
              task.status === "completed" && "line-through text-muted-foreground"
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
            <div className="flex flex-wrap items-center gap-1.5 gap-y-0.5 text-[11px] leading-none">
              {task.createdAt && (() => {
                const { text, tier } = getRelativeTaskDate(task.createdAt);
                return (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 shrink-0 rounded px-1.5 py-0.5 font-medium border border-transparent",
                      DATE_TIER_CLASSES[tier]
                    )}
                  >
                    <span className="leading-none">{text}</span>
                  </span>
                );
              })()}
              {task.assignedAgent && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 truncate max-w-[88px] rounded border px-1.5 py-0.5 font-medium",
                    getAgentTagColor(task.assignedAgent)
                  )}
                >
                  <Bot className="w-2.5 h-2.5 shrink-0 opacity-80" />
                  <span className="truncate">{task.assignedAgent}</span>
                </span>
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
        </div>
      </div>
    </motion.div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(task._id)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete task
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
  );
});

MiniKanbanCard.displayName = "MiniKanbanCard";

interface MiniKanbanColumnProps {
  column: MiniColumnConfig;
  tasks: Task[];
  onStatusChange: (taskId: string, status: KanbanStatus) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

const MiniKanbanColumn: React.FC<MiniKanbanColumnProps> = ({
  column,
  tasks,
  onStatusChange,
  onSelect,
  onDelete,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col min-w-0 flex-1 rounded-md border border-solid transition-all duration-150",
        isDragOver
          ? "border-1 border-primary bg-primary/5 shadow-sm"
          : "border-border bg-background/30"
      )}
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const taskId = e.dataTransfer.getData("text/plain");
        const from = e.dataTransfer.getData("application/kanban-status");
        if (taskId && from !== column.id) {
          onStatusChange(taskId, column.id);
        }
      }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-t-0 border-l-0 border-r-0 border-solid border-border">
        <span className={cn("shrink-0", column.accentClass)}>
          {column.icon}
        </span>
        <span className="text-xs font-semibold text-foreground truncate">
          {column.label}
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto font-normal">
          {tasks.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto customScrollbar2 p-1 space-y-1 min-h-[48px]">
        <AnimatePresence mode="popLayout">
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-10 text-xs text-muted-foreground/40 font-normal">
              Empty
            </div>
          ) : (
            tasks.map((task) => (
              <MiniKanbanCard
                key={task._id}
                task={task}
                columnId={column.id}
                onStatusChange={onStatusChange}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const KanbanWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const { tasks, handleStatusChange, handleSelectTask, handleDeleteTask } =
    useTodoList();

  const grouped = useMemo(() => {
    const g: Record<KanbanStatus, Task[]> = {
      pending: [],
      in_progress: [],
      blocked: [],
      completed: [],
    };
    tasks.forEach((task) => {
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
  }, [tasks]);

  const handleMove = useCallback(
    (taskId: string, newStatus: KanbanStatus) => {
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
        <KanbanCustomHeader {...props} />
        <div className="flex-1 flex gap-1.5 p-2 pt-0 overflow-hidden min-h-0">
          {COLUMNS.map((col) => (
            <MiniKanbanColumn
              key={col.id}
              column={col}
              tasks={grouped[col.id]}
              onStatusChange={handleMove}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </Card>
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
