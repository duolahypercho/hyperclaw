"use client";

import React, { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Bot,
  MessageSquare,
  ScrollText,
  Lightbulb,
  AlertTriangle,
  StickyNote,
  Sparkles,
  Activity,
  Ban,
  ChevronDown,
  Inbox,
  PlayCircle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TranscriptViewer } from "$/components/Home/widgets/TranscriptViewer";
import { updateTodoTaskAPI } from "$/services/tools/todo/local";

const statusLabels: Record<string, string> = {
  pending: "Backlog",
  in_progress: "In progress",
  blocked: "Review",
  completed: "Done",
  cancelled: "Cancelled",
};

interface TaskLog {
  id: number;
  task_id: string;
  agent_id: string | null;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: number;
}


const logTypeIcons: Record<string, React.ReactNode> = {
  progress: <Activity className="h-3 w-3 text-primary shrink-0" />,
  learning: <Lightbulb className="h-3 w-3 text-amber-500 shrink-0" />,
  error: <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />,
  note: <StickyNote className="h-3 w-3 text-blue-400 shrink-0" />,
  discovery: <Sparkles className="h-3 w-3 text-violet-400 shrink-0" />,
};

const LOG_MAX_HEIGHT = 100;

function CollapsibleLogContent({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (ref.current) {
      setOverflows(ref.current.scrollHeight > LOG_MAX_HEIGHT);
    }
  }, [content]);

  return (
    <div className="mt-1">
      <div
        ref={ref}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none text-foreground/90 break-words leading-relaxed text-xs",
          "[&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_pre]:my-0.5 [&_blockquote]:my-0.5",
          "[&_code]:text-[11px] [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
          !expanded && "[overflow:clip]"
        )}
        style={!expanded ? { maxHeight: LOG_MAX_HEIGHT } : undefined}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {content}
        </ReactMarkdown>
      </div>
      {overflows && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onVisible(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div ref={ref} className="flex items-center justify-center py-2">
      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
    </div>
  );
}

type KanbanStatus = "pending" | "in_progress" | "blocked" | "completed" | "cancelled";

const STATUS_OPTIONS: { id: KanbanStatus; label: string; icon: React.ReactNode; dotClass: string }[] = [
  { id: "pending", label: "Backlog", icon: <Inbox className="h-3 w-3" />, dotClass: "bg-muted-foreground" },
  { id: "in_progress", label: "In Progress", icon: <PlayCircle className="h-3 w-3" />, dotClass: "bg-primary" },
  { id: "blocked", label: "Review", icon: <Eye className="h-3 w-3" />, dotClass: "bg-amber-500" },
  { id: "completed", label: "Done", icon: <CheckCircle2 className="h-3 w-3" />, dotClass: "bg-emerald-500" },
  { id: "cancelled", label: "Cancelled", icon: <Ban className="h-3 w-3" />, dotClass: "bg-rose-500" },
];

export interface TaskDetailPanelTask {
  _id: string;
  title: string;
  description?: string;
  status: string;
  assignedAgent?: string;
  assignedAgentId?: string;
  linkedDocumentUrl?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  finishedAt?: string | number;
  starred?: boolean;
}

export function TaskDetailPanel({ task, onStatusChange }: { task: TaskDetailPanelTask; onStatusChange?: (taskId: string, newStatus: KanbanStatus) => void | Promise<any> }) {
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [visibleLogCount, setVisibleLogCount] = useState(10);
  const [statusOpen, setStatusOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState(task.status);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  // Sync local status when task prop changes
  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [statusOpen]);

  const handleChangeStatus = useCallback(async (newStatus: KanbanStatus) => {
    if (newStatus === localStatus) {
      setStatusOpen(false);
      return;
    }
    setStatusUpdating(true);
    setLocalStatus(newStatus);
    setStatusOpen(false);
    try {
      if (onStatusChange) {
        // Delegate to parent (e.g. TodoList provider) which handles API + local state
        await onStatusChange(task._id, newStatus);
      } else {
        await updateTodoTaskAPI({ id: task._id, status: newStatus });
      }
    } catch (e) {
      console.error("[TaskDetailPanel] status update failed:", e);
      setLocalStatus(task.status); // revert on error
    } finally {
      setStatusUpdating(false);
    }
  }, [localStatus, task._id, task.status, onStatusChange]);

  useEffect(() => {
    if (!task?._id) {
      setSessionKey(null);
      setTaskLogs([]);
      setVisibleLogCount(10);
      return;
    }
    let cancelled = false;
    const taskId = task._id;

    const agentId = task.assignedAgentId || task.assignedAgent || undefined;
    console.log("[TaskDetailPanel] fetching data for task:", taskId, "agent:", agentId);

    (bridgeInvoke("get-tasks") as Promise<any[]>)
      .then((tasks: any[]) => {
        if (cancelled) return;
        const bt = tasks.find(
          (t: any) => t.id === taskId || t.id?.slice(0, 24) === taskId
        );
        const sk = bt?.data?.sessionKey ?? bt?.metadata?.sessionKey ?? null;
        console.log("[TaskDetailPanel] bridge task match:", bt?.id, "sessionKey:", sk);
        setSessionKey(sk);
      })
      .catch((e) => console.warn("[TaskDetailPanel] get-tasks error:", e));

    setLogsLoading(true);
    (bridgeInvoke("get-task-logs", { taskId, agentId }) as Promise<TaskLog[]>)
      .then((logs: TaskLog[]) => {
        if (cancelled) return;
        console.log("[TaskDetailPanel] logs:", Array.isArray(logs) ? logs.length : logs);
        setTaskLogs(Array.isArray(logs) ? logs : []);
      })
      .catch((e) => console.warn("[TaskDetailPanel] get-task-logs error:", e))
      .finally(() => { if (!cancelled) setLogsLoading(false); });

    return () => { cancelled = true; };
  }, [task?._id]);


  const statusLabel = statusLabels[localStatus] ?? localStatus;
  const createdStr = task.createdAt
    ? format(new Date(task.createdAt), "MMM d, yyyy · h:mm a")
    : "—";
  const updatedStr = task.updatedAt
    ? format(new Date(task.updatedAt), "MMM d, yyyy · h:mm a")
    : "—";
  const finishedStr =
    task.finishedAt
      ? format(new Date(task.finishedAt), "MMM d, yyyy · h:mm a")
      : "—";

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden select-text">
      {/* Task header info */}
      <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
        <h3 className="text-sm font-semibold text-foreground leading-snug">
          {task.title}
        </h3>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div ref={statusRef} className="relative">
            <button
              onClick={() => setStatusOpen((p) => !p)}
              className={cn(
                "flex items-center gap-1.5 font-medium rounded-md border border-border/50 px-2 py-1 hover:bg-muted/40 transition-colors",
                statusUpdating && "opacity-60 pointer-events-none"
              )}
            >
              {statusUpdating ? (
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              ) : (
                (() => {
                  const opt = STATUS_OPTIONS.find((o) => o.id === localStatus);
                  return opt ? (
                    <>
                      <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dotClass)} />
                      {opt.label}
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                      {statusLabel}
                    </>
                  );
                })()
              )}
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", statusOpen && "rotate-180")} />
            </button>
            {statusOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-md border border-border bg-popover shadow-md py-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleChangeStatus(opt.id)}
                    className={cn(
                      "flex items-center gap-2 w-full px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors",
                      localStatus === opt.id && "bg-muted/30 font-medium"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dotClass)} />
                    {opt.label}
                    {localStatus === opt.id && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-muted-foreground text-xs">{updatedStr}</span>
        </div>

        {task.description?.trim() && (
          <div className="text-xs text-muted-foreground max-h-[120px] overflow-y-auto customScrollbar2 rounded-md border border-border/30 bg-muted/10 px-2.5 py-1.5">
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 break-words leading-relaxed text-xs [&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {task.description.trim()}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 text-xs">
          {(task.assignedAgent || task.assignedAgentId) && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Bot className="h-3 w-3 shrink-0" />
              <span>Agent</span>
              <span className="text-foreground ml-auto truncate max-w-[120px]">{task.assignedAgent || task.assignedAgentId}</span>
            </div>
          )}
          {task.linkedDocumentUrl && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" />
              <span>Doc</span>
              <a
                href={task.linkedDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary ml-auto truncate max-w-[120px] hover:underline text-xs"
              >
                Open
              </a>
            </div>
          )}
          {sessionKey && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span>Session</span>
              <button
                onClick={() => setTranscriptOpen(true)}
                className="text-primary ml-auto hover:underline text-xs"
              >
                View transcript
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>Created</span>
            <span className="text-foreground ml-auto truncate max-w-[120px] text-xs">{createdStr}</span>
          </div>
          {task.finishedAt && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Finished</span>
              <span className="text-foreground ml-auto truncate max-w-[120px] text-xs">{finishedStr}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ScrollText className="h-3 w-3 shrink-0" />
            <span>Task ID</span>
            <span className="text-foreground ml-auto truncate max-w-[140px] text-xs font-mono">{task._id}</span>
          </div>
        </div>
      </div>

      {/* Logs header */}
      <div className="px-3 py-1 flex items-center gap-1 shrink-0 border-y border-border/30">
        <ScrollText className="h-3 w-3 text-primary" />
        <span className="text-xs font-medium text-primary">Logs</span>
        {taskLogs.length > 0 && (
          <span className="text-[10px] min-w-[14px] text-center px-0.5 py-0 rounded-full bg-primary/20 text-primary">
            {taskLogs.length > 99 ? "99+" : taskLogs.length}
          </span>
        )}
      </div>

      {/* Logs content */}
      <div className="flex-1 min-h-0 overflow-y-auto customScrollbar2 px-3 py-2">
        {logsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : taskLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No logs recorded yet.
          </div>
        ) : (
          <>
            <ul className="space-y-1.5">
              {taskLogs.slice(0, visibleLogCount).map((log) => (
                <li
                  key={log.id}
                  className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    {logTypeIcons[log.type] ?? <Activity className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className="font-medium capitalize text-foreground text-xs">
                      {log.type}
                    </span>
                    {log.agent_id && (
                      <span className="text-muted-foreground flex items-center gap-0.5 ml-auto text-xs">
                        <Bot className="h-2.5 w-2.5" />
                        {log.agent_id}
                      </span>
                    )}
                  </div>
                  <CollapsibleLogContent content={log.content} />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "MMM d, h:mm a")}
                  </div>
                </li>
              ))}
            </ul>
            {taskLogs.length > visibleLogCount && (
              <LoadMoreSentinel onVisible={() => setVisibleLogCount((v) => v + 10)} />
            )}
          </>
        )}
      </div>

      {/* Transcript viewer modals */}
      {transcriptOpen && (
        <TranscriptViewer
          open={transcriptOpen}
          onOpenChange={setTranscriptOpen}
          sessionKey={sessionKey}
          label={task?.title}
        />
      )}
    </div>
  );
}
