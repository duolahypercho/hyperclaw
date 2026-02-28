"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { format } from "date-fns";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Bot,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  fetchAllCronRunsForJob,
  fetchCronRunDetail,
  formatDurationMs,
  fetchCronsFromBridge,
} from "$/components/Tool/Crons/utils";
import { getPendingTaskCronRuns } from "$/lib/task-cron-run-store";
import type { Task } from "$/components/Tool/TodoList/types";
import type { CronRunRecord } from "$/types/electron";

const statusLabels: Record<string, string> = {
  pending: "Backlog",
  in_progress: "In progress",
  blocked: "Review",
  completed: "Done",
};

/** Heuristic: content would exceed 2 lines (so we show "View logs" when collapsed). */
function wouldExceedTwoLines(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const lines = text.split("\n").length;
  if (lines > 2) return true;
  return text.length > 140;
}

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
  const [runs, setRuns] = useState<CronRunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [expandedRunKey, setExpandedRunKey] = useState<string | null>(null);
  const [fullDetail, setFullDetail] = useState<Record<string, unknown> | null>(
    null
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const hasAutoExpandedRef = useRef(false);

  const resolveJobId = useCallback(async (taskId: string): Promise<string | null> => {
    const pending = getPendingTaskCronRuns();
    const entry = pending[taskId];
    if (entry?.jobId) return entry.jobId;
    try {
      const jobs = await fetchCronsFromBridge();
      const found = jobs.find(
        (j) => j.name?.includes(taskId) || j.name?.includes(`Task [${taskId}]`)
      );
      return found?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const loadRuns = useCallback(async (jid: string | null) => {
    if (!jid) {
      setRuns([]);
      return;
    }
    setLoading(true);
    try {
      const allRuns = await fetchAllCronRunsForJob(jid);
      setRuns(allRuns);
      return allRuns;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !task?._id) {
      setRuns([]);
      setJobId(null);
      setExpandedRunKey(null);
      setFullDetail(null);
      hasAutoExpandedRef.current = false;
      return;
    }
    let cancelled = false;
    resolveJobId(task._id).then((jid) => {
      if (cancelled) return;
      setJobId(jid);
      if (jid) loadRuns(jid);
    });
    return () => {
      cancelled = true;
    };
  }, [open, task?._id, resolveJobId, loadRuns]);

  useEffect(() => {
    if (!task?._id || !jobId || runs.length === 0 || hasAutoExpandedRef.current || detailLoading) return;
    const latest = runs[0];
    if (!latest) return;
    hasAutoExpandedRef.current = true;
    setDetailLoading(true);
    fetchCronRunDetail(jobId, latest.runAtMs)
      .then((detail) => setFullDetail(detail ?? null))
      .catch(() => setFullDetail(null))
      .finally(() => setDetailLoading(false));
  }, [task?._id, jobId, runs]);

  const handleShowMore = useCallback(
    async (run: CronRunRecord) => {
      if (!jobId) return;
      const key = `${run.runAtMs}-${run.sessionId ?? run.runAtMs}`;
      if (expandedRunKey === key) {
        setExpandedRunKey(null);
        setFullDetail(null);
        return;
      }
      setExpandedRunKey(key);
      setFullDetail(null);
      setDetailLoading(true);
      try {
        const detail = await fetchCronRunDetail(jobId, run.runAtMs);
        setFullDetail(detail ?? null);
      } catch {
        setFullDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [jobId, expandedRunKey]
  );

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
      <DialogContent className="max-w-md gap-0 sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden p-0">
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
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              {statusLabel}
            </span>
            <span className="text-muted-foreground">Updated: {updatedStr}</span>
          </div>
          {task.description?.trim() ? (
            <p className="pt-2 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
              {task.description.trim()}
            </p>
          ) : null}
          <div className="pt-3 space-y-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 text-xs">
            {task.assignedAgent && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bot className="h-3.5 w-3.5 shrink-0" />
                <span>Assigned</span>
                <span className="text-foreground ml-auto">{task.assignedAgent}</span>
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

        <div className="px-6 pb-2 pt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
          Run history
        </div>
        <div className="px-6 pb-6 min-h-0">
          <ScrollArea
            className="w-full rounded-md border border-border/40"
            style={{ height: "min(50vh, 400px)" }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !jobId ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No cron run linked. Move task to In Progress to run with an agent.
              </div>
            ) : runs.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No run history yet.
              </div>
            ) : (
              <ul className="space-y-2 pr-2">
                {runs.map((run: CronRunRecord) => {
                  const runKey = `${run.runAtMs}-${run.sessionId ?? run.runAtMs}`;
                  const isExpanded = expandedRunKey === runKey;
                  const detail = isExpanded ? fullDetail : null;
                  const showMoreButton =
                    isExpanded ||
                    wouldExceedTwoLines(run.summary) ||
                    wouldExceedTwoLines(run.error);
                  return (
                    <li
                      key={runKey}
                      className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="tabular-nums text-muted-foreground">
                          {format(new Date(run.runAtMs), "MMM d, h:mm a")}
                        </span>
                        {run.status === "ok" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {run.durationMs != null && (
                          <span>
                            Duration: {formatDurationMs(run.durationMs)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-xs text-foreground/90 space-y-1">
                        {!isExpanded &&
                          run.summary &&
                          run.summary !== run.error && (
                            <p className="line-clamp-2 whitespace-pre-wrap break-words">
                              {run.summary}
                            </p>
                          )}
                        {!isExpanded &&
                          run.error &&
                          run.status === "error" && (
                            <p className="text-destructive line-clamp-2 whitespace-pre-wrap break-words">
                              {run.error}
                            </p>
                          )}
                        {isExpanded &&
                          (detailLoading ? (
                            <p className="text-muted-foreground">Loading…</p>
                          ) : detail ? (
                            <>
                              {detail.summary != null && (
                                <pre className="whitespace-pre-wrap break-words font-mono">
                                  {String(detail.summary)}
                                </pre>
                              )}
                              {detail.error != null && (
                                <pre className="whitespace-pre-wrap break-words text-destructive font-mono">
                                  {String(detail.error)}
                                </pre>
                              )}
                              {"log" in detail &&
                                detail.log != null &&
                                String(detail.log).trim() !== "" && (
                                  <>
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-2">
                                      Log
                                    </p>
                                    <pre className="whitespace-pre-wrap break-words text-foreground/80 font-mono mt-0.5">
                                      {String(detail.log)}
                                    </pre>
                                  </>
                                )}
                              {"output" in detail &&
                                detail.output != null &&
                                String(detail.output).trim() !== "" && (
                                  <>
                                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-2">
                                      Output
                                    </p>
                                    <pre className="whitespace-pre-wrap break-words text-foreground/80 font-mono mt-0.5">
                                      {String(detail.output)}
                                    </pre>
                                  </>
                                )}
                            </>
                          ) : (
                            <p className="text-muted-foreground">
                              No additional details for this run.
                            </p>
                          ))}
                      </div>
                      {showMoreButton && (
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleShowMore(run)}
                            disabled={
                              detailLoading && expandedRunKey === runKey
                            }
                          >
                            {detailLoading && expandedRunKey === runKey ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isExpanded ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5 mr-1" />
                                Show less
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5 mr-1" />
                                View logs
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
