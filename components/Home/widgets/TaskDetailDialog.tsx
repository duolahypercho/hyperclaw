"use client";

import React, { useEffect, useCallback, useState, useMemo } from "react";
import { format } from "date-fns";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Bot,
  MessageSquare,
  ScrollText,
  Link2,
  Lightbulb,
  AlertTriangle,
  StickyNote,
  Sparkles,
  Activity,
  Ban,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TranscriptViewer } from "./TranscriptViewer";
import type { Task } from "$/components/Tool/TodoList/types";
import { cn } from "@/lib/utils";

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

interface TaskSession {
  session_key: string;
  linked_at: number;
  agent_id?: string | null;
  label?: string | null;
  created_at_ms?: number | null;
  updated_at_ms?: number | null;
}

type TabId = "logs" | "sessions";

const logTypeIcons: Record<string, React.ReactNode> = {
  progress: <Activity className="h-3 w-3 text-primary shrink-0" />,
  learning: <Lightbulb className="h-3 w-3 text-amber-500 shrink-0" />,
  error: <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />,
  note: <StickyNote className="h-3 w-3 text-blue-400 shrink-0" />,
  discovery: <Sparkles className="h-3 w-3 text-violet-400 shrink-0" />,
};

export interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
}: TaskDetailDialogProps) {
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // New: task logs & linked sessions
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [taskSessions, setTaskSessions] = useState<TaskSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("logs");
  const [viewingSessionKey, setViewingSessionKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !task?._id) {
      setSessionKey(null);
      setTaskLogs([]);
      setTaskSessions([]);
      setActiveTab("logs");
      setViewingSessionKey(null);
      return;
    }
    let cancelled = false;
    const taskId = task._id;

    // Look up bridge task for sessionKey
    fetch("/api/hyperclaw-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get-tasks" }),
    })
      .then((r) => r.json())
      .then((tasks: any[]) => {
        if (cancelled) return;
        const bt = tasks.find(
          (t: any) => t.id === taskId || t.id?.slice(0, 24) === taskId
        );
        const sk = bt?.data?.sessionKey ?? bt?.metadata?.sessionKey ?? null;
        setSessionKey(sk);
      })
      .catch(() => {});

    // Fetch task logs (with agent fallback for orphaned logs)
    const agentId = task.assignedAgentId || task.assignedAgent || undefined;
    setLogsLoading(true);
    fetch("/api/hyperclaw-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get-task-logs", taskId, agentId }),
    })
      .then((r) => r.json())
      .then((logs: TaskLog[]) => {
        if (cancelled) return;
        setTaskLogs(Array.isArray(logs) ? logs : []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLogsLoading(false); });

    // Fetch linked sessions (with agent fallback for orphaned sessions)
    setSessionsLoading(true);
    fetch("/api/hyperclaw-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get-task-sessions", taskId, agentId }),
    })
      .then((r) => r.json())
      .then((sessions: TaskSession[]) => {
        if (cancelled) return;
        setTaskSessions(Array.isArray(sessions) ? sessions : []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSessionsLoading(false); });

    return () => {
      cancelled = true;
    };
  }, [open, task?._id]);

  // Pick the best default tab based on available data
  useEffect(() => {
    if (!open) return;
    if (taskLogs.length > 0) { setActiveTab("logs"); return; }
    if (taskSessions.length > 0) { setActiveTab("sessions"); return; }
  }, [open, taskLogs.length, taskSessions.length]);

  const tabCounts = useMemo(() => ({
    logs: taskLogs.length,
    sessions: taskSessions.length,
  }), [taskLogs.length, taskSessions.length]);

  if (!task) return null;

  const statusLabel = statusLabels[task.status] ?? task.status;
  const createdStr = task.createdAt
    ? format(new Date(task.createdAt), "MMM d, yyyy · h:mm a")
    : "—";
  const updatedStr = task.updatedAt
    ? format(new Date(task.updatedAt), "MMM d, yyyy · h:mm a")
    : "—";
  const finishedStr =
    task.finishedAt &&
    typeof task.finishedAt !== "undefined"
      ? format(new Date(task.finishedAt), "MMM d, yyyy · h:mm a")
      : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2 space-y-1.5 shrink-0">
          <DialogTitle className="text-base font-semibold pr-8 leading-snug">
            {task.title}
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-muted-foreground break-all">
            {task._id}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              {task.status === "in_progress" ? (
                <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
              ) : task.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : task.status === "blocked" ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : task.status === "cancelled" ? (
                <Ban className="h-4 w-4 text-rose-500 shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              {statusLabel}
            </span>
            <span className="text-muted-foreground text-xs">Updated: {updatedStr}</span>
          </div>
          {task.description?.trim() ? (
            <p className="pt-2 text-xs text-muted-foreground whitespace-pre-wrap">
              {task.description.trim()}
            </p>
          ) : null}
          <div className="pt-3 space-y-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 text-xs">
            {(task.assignedAgent || task.assignedAgentId) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bot className="h-3.5 w-3.5 shrink-0" />
                <span>Assigned</span>
                <span className="text-foreground ml-auto">{task.assignedAgent || task.assignedAgentId}</span>
              </div>
            )}
            {task.linkedDocumentUrl && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>Linked doc</span>
                <a
                  href={task.linkedDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary ml-auto truncate max-w-[200px] hover:underline"
                  title={task.linkedDocumentUrl}
                >
                  Open
                </a>
              </div>
            )}
            {sessionKey && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span>Session</span>
                <button
                  onClick={() => setTranscriptOpen(true)}
                  className="text-primary ml-auto truncate max-w-[200px] hover:underline text-xs"
                  title={sessionKey}
                >
                  View transcript
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>Created</span>
              <span className="text-foreground ml-auto truncate" title={createdStr}>
                {createdStr}
              </span>
            </div>
            {task.finishedAt && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Finished</span>
                <span className="text-foreground ml-auto truncate" title={finishedStr}>
                  {finishedStr}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Tab bar */}
        <div className="px-6 pt-3 pb-1 flex items-center gap-1 shrink-0 border-b border-border/30">
          {([
            { id: "logs" as TabId, label: "Logs", icon: <ScrollText className="h-3.5 w-3.5" /> },
            { id: "sessions" as TabId, label: "Sessions", icon: <Link2 className="h-3.5 w-3.5" /> },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              {tab.icon}
              {tab.label}
              {tabCounts[tab.id] > 0 && (
                <span className={cn(
                  "text-[10px] min-w-[18px] text-center px-1 py-0.5 rounded-full",
                  activeTab === tab.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-6 pb-6 pt-2 min-h-0 flex-1">
          <ScrollArea
            className="w-full rounded-md border border-border/40"
            style={{ height: "min(45vh, 360px)" }}
          >
            {activeTab === "logs" && (
              <div className="p-2">
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : taskLogs.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No logs recorded yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {taskLogs.map((log) => (
                      <li
                        key={log.id}
                        className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {logTypeIcons[log.type] ?? <Activity className="h-3 w-3 text-muted-foreground shrink-0" />}
                          <span className="font-medium capitalize text-foreground">
                            {log.type}
                          </span>
                          {log.agent_id && (
                            <span className="text-muted-foreground flex items-center gap-1 ml-auto">
                              <Bot className="h-3 w-3" />
                              {log.agent_id}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                          {log.content}
                        </p>
                        <div className="mt-1.5 text-[10px] text-muted-foreground">
                          {format(new Date(log.created_at), "MMM d, h:mm a")}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === "sessions" && (
              <div className="p-2 overflow-hidden">
                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : taskSessions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No linked sessions.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {taskSessions.map((session) => (
                      <li
                        key={session.session_key}
                        className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-mono text-foreground truncate flex-1" title={session.session_key}>
                            {session.label || session.session_key}
                          </span>
                          <button
                            onClick={() => setViewingSessionKey(session.session_key)}
                            className="text-primary text-[11px] hover:underline shrink-0"
                          >
                            View
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                          {session.agent_id && (
                            <span className="flex items-center gap-1">
                              <Bot className="h-3 w-3" />
                              {session.agent_id}
                            </span>
                          )}
                          <span>
                            Linked {format(new Date(session.linked_at), "MMM d, h:mm a")}
                          </span>
                          {session.created_at_ms && (
                            <span>
                              Created {format(new Date(session.created_at_ms), "MMM d, h:mm a")}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
      <TranscriptViewer
        open={transcriptOpen}
        onOpenChange={setTranscriptOpen}
        sessionKey={sessionKey}
        label={task?.title}
      />
      {viewingSessionKey && (
        <TranscriptViewer
          open
          onOpenChange={(o) => { if (!o) setViewingSessionKey(null); }}
          sessionKey={viewingSessionKey}
          label={task?.title}
        />
      )}
    </Dialog>
  );
}
