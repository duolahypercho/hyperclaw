import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
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
  ArrowRightLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Activity,
  Users,
  Bot,
  Columns3,
  Clock,
  Crown,
  FileText,
  X,
  Plus,
  ExternalLink,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Task } from "./types";
import { useTodoList } from "./provider/todolistProvider";
import { useIsTaskRunningCron } from "./hooks/useIsTaskRunningCron";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useAgentIdentities, resolveAvatarUrl, isAvatarText } from "$/hooks/useAgentIdentity";
import { AddAgentDialog } from "$/components/Tool/Agents/AddAgentDialog";

/* ── Types for Agent & Log panels ────────────────────────── */

interface BridgeAgent {
  id: string;
  name: string;
  status: string;
  role?: string;
  lastActive?: string;
  workspaceFolder?: string;
}

/* ── Org Chart types ──────────────────────────────────────── */

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

type LogEntry = {
  time?: string;
  level?: string;
  message?: string;
  tags?: string[];
};

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

/** Dynamic column width — empty columns collapse, busy columns grow (from MissionQueue). */
function getDesktopColumnWidth(taskCount: number): string {
  if (taskCount === 0) return "fit-content";
  return `${Math.min(380, 250 + taskCount * 14)}px`;
}

/* ── Card ───────────────────────────────────────────────── */

interface KanbanCardProps {
  task: Task;
  column: ColumnConfig;
  onStatusChange: (taskId: string, status: KanbanColumn) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
  compact?: boolean;
  isDragging?: boolean;
  mobileMode?: boolean;
  onMoveStatus?: () => void;
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
      isDragging = false,
      mobileMode = false,
      onMoveStatus,
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
          compact && "p-2",
          isDragging && "opacity-50 scale-95"
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

        {/* Mobile: move-status button */}
        {mobileMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveStatus?.();
            }}
            className="w-full mt-2 py-1.5 rounded-md border border-border bg-background flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <ArrowRightLeft className="w-3 h-3" />
            Move Status
          </button>
        )}
      </motion.div>
    );
  }
);

KanbanCard.displayName = "KanbanCard";

/* ── Column ─────────────────────────────────────────────── */

interface KanbanColumnComponentProps {
  column: ColumnConfig;
  tasks: Task[];
  onStatusChange: (taskId: string, status: KanbanColumn) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleStar: (taskId: string) => void;
  compact?: boolean;
  // DnD props
  isDragOver: boolean;
  draggedTask: Task | null;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: KanbanColumn) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragEnd: () => void;
}

const KanbanColumnComponent: React.FC<KanbanColumnComponentProps> = ({
  column,
  tasks,
  onStatusChange,
  onSelect,
  onDelete,
  onToggleStar,
  compact = false,
  isDragOver,
  draggedTask,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
}) => {
  const hasTasks = tasks.length > 0;

  return (
    <div
      style={{ width: getDesktopColumnWidth(tasks.length) }}
      className={cn(
        "flex-none flex flex-col rounded-lg border border-solid border-border bg-background/40 transition-all duration-200",
        hasTasks ? "min-w-[240px]" : "min-w-[110px] max-w-[180px]",
        isDragOver && "ring-1 ring-primary/40 bg-primary/5"
      )}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, column.id)}
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
              <div
                key={task._id}
                draggable
                onDragStart={(e) => onDragStart(e, task)}
                onDragEnd={onDragEnd}
              >
                <KanbanCard
                  task={task}
                  column={column}
                  onStatusChange={onStatusChange}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onToggleStar={onToggleStar}
                  compact={compact}
                  isDragging={draggedTask?._id === task._id}
                />
              </div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ── Mobile Status Move Modal (from MissionQueue) ────────── */

const StatusMoveModal: React.FC<{
  task: Task;
  onMove: (taskId: string, status: KanbanColumn) => void;
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

/* ── Agent File Types & Constants ─────────────────────────── */

interface AgentFile {
  name: string;
  relativePath: string;
  isDirectory?: boolean;
}

const FILE_ICONS_MAP: Record<string, string> = {
  "SOUL.md": "🧠",
  "MEMORY.md": "💾",
  "IDENTITY.md": "🎭",
  "INSTRUCTIONS.md": "📋",
  "KNOWLEDGE.md": "📚",
  "TOOLS.md": "🔧",
  "GOALS.md": "🎯",
  "README.md": "📖",
};

const FILE_DESCRIPTIONS: Record<string, string> = {
  "SOUL.md": "Core personality & behavior",
  "MEMORY.md": "Persistent memory",
  "IDENTITY.md": "Name, role, avatar",
  "INSTRUCTIONS.md": "Operating instructions",
  "KNOWLEDGE.md": "Domain knowledge",
  "TOOLS.md": "Available tools",
  "GOALS.md": "Current objectives",
};

/* ── Agent Avatar ─────────────────────────────────────────── */

const BoardAgentAvatar: React.FC<{
  agentId: string;
  identities: Map<string, { avatar?: string; emoji?: string; name?: string }>;
  size?: "sm" | "md";
  className?: string;
}> = ({ agentId, identities, size = "md", className }) => {
  const identity = identities.get(agentId);
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const dim = size === "sm" ? "h-5 w-5" : "h-7 w-7";
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

/* ── Agent File Editor (inline config editor) ────────────── */

const BoardAgentFileEditor: React.FC<{
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  if (!selectedFile) {
    return (
      <div className="flex flex-col border-r border-border bg-background/60 w-[240px] shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-foreground truncate">{agentName}</span>
          <button onClick={onClose} className="p-1 hover:bg-card rounded transition-colors shrink-0">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto customScrollbar2 p-1.5 space-y-0.5">
          {loading && files.length === 0 && (
            <div className="p-1.5 space-y-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-2">
                  <Skeleton className="w-5 h-5 rounded shrink-0" />
                  <Skeleton className="h-3 w-24 rounded flex-1" />
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
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-left transition-colors hover:bg-card/80"
              >
                <span className="text-sm shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate">{file.name}</div>
                  {desc && <div className="text-[10px] text-muted-foreground truncate">{desc}</div>}
                </div>
              </button>
            );
          })}
          {!loading && files.length === 0 && (
            <div className="text-xs text-muted-foreground/50 text-center py-4">No files found</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-r border-border bg-background/60 w-[320px] shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => setSelectedFile(null)}
            className="p-0.5 hover:bg-card rounded transition-colors shrink-0"
            title="Back to files"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <span className="text-xs font-medium text-foreground truncate">
            {FILE_ICONS_MAP[selectedFile.name] || "📄"} {selectedFile.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="iconSm"
            className="h-6 w-6"
            onClick={handleSave}
            disabled={saving || content === null}
            title="Save (⌘S)"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-xs">💾</span>}
          </Button>
          <button onClick={onClose} className="p-1 hover:bg-card rounded transition-colors">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
      {saveError && (
        <div className="text-[10px] text-red-500 px-3 py-1 bg-red-500/5 border-b border-border">{saveError}</div>
      )}
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
            className="w-full h-full p-3 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none resize-none border-0"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
};

/* ── Team Panel (left sidebar — shows team agents, clickable to edit) ───── */

/** Get all agent names belonging to a department */
function getBoardDeptAgentNames(orgData: OrgChartData, deptId: string): string[] {
  return orgData.nodes
    .filter((n) => n.department === deptId)
    .map((n) => n.name);
}

const BoardTeamPanel: React.FC<{
  orgData: OrgChartData | null;
  agents: BridgeAgent[];
  selectedTeamId: string | null;
  onSelectTeam: (id: string | null) => void;
  taskCountByAgent: Record<string, number>;
  onEditAgent?: (agentId: string) => void;
  onAddAgent?: () => void;
}> = ({ orgData, agents, selectedTeamId, onSelectTeam, taskCountByAgent, onEditAgent, onAddAgent }) => {
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
      <div className="flex flex-col items-center border-r border-border bg-background/40 w-10 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 hover:bg-card rounded transition-colors mt-2"
          title="Show agents"
        >
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <Users className="w-3.5 h-3.5 text-muted-foreground mt-3" />
        <div className="flex flex-col items-center gap-2 mt-3">
          {teamNodes.slice(0, 8).map((node) => (
            <BoardAgentAvatar key={node.id} agentId={node.agentId} identities={identities} size="sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-r border-border bg-background/40 w-[220px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 min-w-0">
          {teamColor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />}
          {!teamColor && <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className="text-xs font-medium text-foreground uppercase tracking-wide truncate">{teamLabel}</span>
          <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 shrink-0">{teamNodes.length}</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="p-1 hover:bg-card rounded transition-colors shrink-0">
          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto customScrollbar2 p-1.5 space-y-0.5">
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
              className="group flex items-center gap-2 px-2 py-2 rounded hover:bg-card/60 cursor-pointer transition-colors"
              onClick={() => onEditAgent?.(node.agentId)}
              title={`${displayName} — click to edit config`}
            >
              <div className="relative shrink-0">
                <BoardAgentAvatar agentId={node.agentId} identities={identities} />
                {isOrchestrator && (
                  <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 border border-background">
                    <Crown className="w-2 h-2 text-white" />
                  </span>
                )}
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                    isActive ? "bg-emerald-500" : "bg-muted-foreground/40"
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn(
                  "text-xs font-medium truncate",
                  isOrchestrator ? "text-amber-500" : "text-foreground"
                )}>
                  {displayName}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {node.role || node.type.charAt(0).toUpperCase() + node.type.slice(1)}
                </div>
              </div>
              {taskCount > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 shrink-0">
                  {taskCount}
                </span>
              )}
            </div>
          );
        })}

        {!orgData && (
          <div className="text-xs text-muted-foreground/50 text-center py-4">Loading...</div>
        )}

        {orgData && teamNodes.length === 0 && (
          <div className="text-xs text-muted-foreground/50 text-center py-4">No agents</div>
        )}
      </div>

      {/* Footer — Add Agent + OrgChart link */}
      <div className="border-t border-border p-1.5 space-y-1">
        <button
          onClick={onAddAgent}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Agent
        </button>
        <a
          href="/Tool/OrgChart"
          className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Edit teams in Org Chart
        </a>
      </div>
    </div>
  );
};

/* ── Live Feed Panel (right sidebar — from MissionControl LiveFeed) ──── */

type FeedFilter = "all" | "tasks" | "agents";

const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: "text-red-500",
  WARN: "text-amber-500",
  WARNING: "text-amber-500",
  DEBUG: "text-muted-foreground/60",
  INFO: "text-foreground",
};

const TAG_ICONS: Record<string, string> = {
  cron: "⏱",
  agents: "🤖",
  gateway: "🌐",
  ws: "🔌",
  error: "❌",
  warn: "⚠️",
  reload: "🔄",
  hooks: "🪝",
};

const BoardLiveFeedPanel: React.FC<{
  logs: LogEntry[];
  loading: boolean;
  selectedTeamAgentNames: string[] | null;
}> = ({ logs, loading, selectedTeamAgentNames }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const feedRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    // Scope to selected team's agents (match any agent name in message or tags)
    const scoped = selectedTeamAgentNames
      ? logs.filter((l) => {
          return selectedTeamAgentNames.some((name) => {
            const lower = name.toLowerCase();
            const msgMatch = l.message?.toLowerCase().includes(lower);
            const tagMatch = l.tags?.some((t) => t.toLowerCase().includes(lower));
            return msgMatch || tagMatch;
          });
        })
      : logs;

    if (filter === "all") return scoped;
    if (filter === "tasks")
      return scoped.filter((l) => l.tags?.some((t) => t.includes("cron") || t.includes("todo") || t.includes("task")));
    return scoped.filter((l) => l.tags?.some((t) => t.includes("agent") || t.includes("gateway") || t.includes("ws")));
  }, [logs, filter, selectedTeamAgentNames]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-l border-border bg-background/40 w-10 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 hover:bg-card rounded transition-colors mt-2"
          title="Show live feed"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <Activity className="w-3.5 h-3.5 text-muted-foreground mt-3" />
      </div>
    );
  }

  return (
    <div className="flex flex-col border-l border-border bg-background/40 w-[260px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground uppercase tracking-wide">Live Feed</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="p-1 hover:bg-card rounded transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-border">
        {(["all", "tasks", "agents"] as FeedFilter[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] capitalize transition-colors",
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
      <div ref={feedRef} className="flex-1 overflow-y-auto customScrollbar2 p-1.5 space-y-0.5">
        {loading && logs.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {filtered.slice(0, 80).map((entry, i) => {
          const tagIcon = entry.tags
            ?.map((t) => {
              const key = Object.keys(TAG_ICONS).find((k) => t.includes(k));
              return key ? TAG_ICONS[key] : null;
            })
            .find(Boolean);
          const levelColor = LOG_LEVEL_COLORS[entry.level?.toUpperCase() || ""] || "text-foreground";
          const isError = entry.level?.toUpperCase() === "ERROR";

          return (
            <div
              key={`${entry.time}-${i}`}
              className={cn(
                "px-2 py-1.5 rounded text-xs leading-tight border-l-2 transition-colors",
                isError
                  ? "bg-red-500/5 border-red-500/40"
                  : "bg-transparent border-transparent hover:bg-card/60"
              )}
            >
              <div className="flex items-start gap-1.5">
                {tagIcon && <span className="text-[10px] shrink-0 mt-px">{tagIcon}</span>}
                <p className={cn("flex-1 min-w-0 break-words line-clamp-2", levelColor)}>
                  {entry.message || "—"}
                </p>
              </div>
              {entry.time && (
                <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-muted-foreground/60">
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(entry.time).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div className="text-xs text-muted-foreground/50 text-center py-4">No events</div>
        )}
      </div>
    </div>
  );
};

/* ── Board ──────────────────────────────────────────────── */

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

  // HTML5 drag-and-drop state (from MissionQueue)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanColumn | null>(null);

  // Add agent dialog
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  // Mobile tab view state (from MissionQueue)
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<KanbanColumn>("pending");
  const [statusMoveTask, setStatusMoveTask] = useState<Task | null>(null);

  // Team panel state — org chart based
  const [orgData, setOrgData] = useState<OrgChartData | null>(null);
  const [agents, setAgents] = useState<BridgeAgent[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  // Live feed state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // Fetch org chart + agents
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = (await bridgeInvoke("get-org-status", {})) as OrgChartData & { success?: boolean };
        if (!cancelled && res && (res as { success?: boolean }).success !== false) {
          setOrgData({
            nodes: res.nodes ?? [],
            edges: res.edges ?? [],
            tasks: res.tasks ?? [],
            departments: res.departments ?? [],
          });
        }
      } catch { /* ignore */ }
      try {
        const agentRes = (await bridgeInvoke("list-agents", {})) as {
          success?: boolean;
          data?: BridgeAgent[];
        };
        if (!cancelled && agentRes?.success && Array.isArray(agentRes.data)) {
          setAgents(agentRes.data);
        }
      } catch { /* ignore */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Fetch logs
  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const json = await bridgeInvoke("get-logs", { lines: 100 });
        if (cancelled) return;
        const data = Array.isArray(json) ? json : ((json as { data?: LogEntry[] })?.data ?? []);
        if (Array.isArray(data)) setLogs(data as LogEntry[]);
      } catch { /* ignore */ }
      setLogsLoading(false);
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Detect mobile via matchMedia
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Count tasks per agent name
  const taskCountByAgent = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => {
      const key = t.assignedAgent || t.assignedAgentId;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  // Agents from list-agents not yet in org chart (for task/feed filtering)
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
    return getBoardDeptAgentNames(orgData, selectedTeamId);
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

  // Resolve editing agent info for the file editor
  const editingAgentNode = useMemo(() => {
    if (!editingAgentId || !orgData) return null;
    return orgData.nodes.find((n) => n.agentId === editingAgentId) ?? null;
  }, [editingAgentId, orgData]);

  const editingAgentBridge = useMemo(() => {
    if (!editingAgentId) return null;
    return agents.find((a) => a.id === editingAgentId || a.name === editingAgentNode?.name) ?? null;
  }, [editingAgentId, editingAgentNode, agents]);

  const columns = useMemo(() => {
    const grouped: Record<KanbanColumn, Task[]> = {
      pending: [],
      in_progress: [],
      blocked: [],
      completed: [],
    };
    tasks.forEach((task) => {
      // Filter by selected team's agents
      if (selectedTeamAgentKeys) {
        const matchesAssignedAgent = task.assignedAgent && selectedTeamAgentKeys.has(task.assignedAgent);
        const matchesAssignedAgentId = task.assignedAgentId && selectedTeamAgentKeys.has(task.assignedAgentId);
        if (!matchesAssignedAgent && !matchesAssignedAgentId) return;
      }

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
  }, [tasks, selectedTeamAgentKeys]);

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

  // HTML5 drag handlers (from MissionQueue)
  const handleDragStart = useCallback(
    (e: React.DragEvent, task: Task) => {
      if (isMobile) return;
      setDraggedTask(task);
      e.dataTransfer.effectAllowed = "move";
    },
    [isMobile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, columnId: KanbanColumn) => {
      if (isMobile) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(columnId);
    },
    [isMobile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetStatus: KanbanColumn) => {
      if (isMobile) return;
      e.preventDefault();
      if (draggedTask && draggedTask.status !== targetStatus) {
        handleMoveTask(draggedTask._id, targetStatus);
      }
      setDraggedTask(null);
      setDragOverColumn(null);
    },
    [isMobile, draggedTask, handleMoveTask]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null);
    setDragOverColumn(null);
  }, []);

  // ── Mobile tab view (from MissionQueue) ──
  if (isMobile) {
    const mobileTasks = columns[mobileTab];

    return (
      <div
        className={cn(
          "flex flex-col h-full w-full overflow-hidden",
          compact ? "p-2" : "p-3",
          className
        )}
      >
        {/* Tab selector pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-2.5 shrink-0">
          {COLUMNS.map((col) => {
            const count = columns[col.id].length;
            const selected = mobileTab === col.id;
            return (
              <button
                key={col.id}
                onClick={() => setMobileTab(col.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full border whitespace-nowrap text-xs transition-colors",
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

        {/* Vertical task list */}
        <div className="flex-1 overflow-y-auto customScrollbar2 space-y-2 pb-[env(safe-area-inset-bottom)]">
          <AnimatePresence mode="popLayout">
            {mobileTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground bg-card border border-border rounded-lg p-4 text-center">
                No tasks in this status.
              </div>
            ) : (
              mobileTasks.map((task) => (
                <KanbanCard
                  key={task._id}
                  task={task}
                  column={COLUMNS.find((c) => c.id === mobileTab)!}
                  onStatusChange={handleMoveTask}
                  onSelect={handleSelect}
                  onDelete={handleDelete}
                  onToggleStar={handleStar}
                  compact={compact}
                  mobileMode
                  onMoveStatus={() => setStatusMoveTask(task)}
                />
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Bottom-sheet status move modal */}
        {statusMoveTask && (
          <StatusMoveModal
            task={statusMoveTask}
            onMove={handleMoveTask}
            onClose={() => setStatusMoveTask(null)}
          />
        )}
      </div>
    );
  }

  // ── Desktop 3-panel: Agents | Kanban | Live Feed ──
  return (
    <div
      className={cn(
        "flex h-full w-full overflow-hidden",
        className
      )}
    >
      {/* Left: Team Panel or Agent File Editor */}
      {editingAgentId && editingAgentNode ? (
        <BoardAgentFileEditor
          agentId={editingAgentId}
          agentName={editingAgentNode.name}
          workspaceFolder={editingAgentBridge?.workspaceFolder}
          onClose={() => setEditingAgentId(null)}
        />
      ) : (
        <BoardTeamPanel
          orgData={orgData}
          agents={agents}
          selectedTeamId={selectedTeamId}
          onSelectTeam={setSelectedTeamId}
          taskCountByAgent={taskCountByAgent}
          onEditAgent={setEditingAgentId}
          onAddAgent={() => setAddAgentOpen(true)}
        />
      )}

      {/* Center: Kanban columns with DnD + dynamic widths */}
      <div
        className={cn(
          "flex-1 flex gap-2 overflow-x-auto overflow-y-hidden customScrollbar2 min-w-0",
          compact ? "p-2" : "p-3",
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
            isDragOver={dragOverColumn === column.id}
            draggedTask={draggedTask}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* Right: Live Feed Panel */}
      <BoardLiveFeedPanel logs={logs} loading={logsLoading} selectedTeamAgentNames={selectedTeamAgentNames} />

      <AddAgentDialog open={addAgentOpen} onOpenChange={setAddAgentOpen} />
    </div>
  );
};

export default KanbanBoard;
