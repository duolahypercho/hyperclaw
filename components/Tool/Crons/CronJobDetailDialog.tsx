"use client";

import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { format } from "date-fns";
import { Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, CalendarClock, User, ToggleLeft, Play, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fetchAllCronRunsForJob, fetchCronRunDetail, formatDurationMs, formatScheduleExpr } from "./utils";
import { useCrons } from "./provider/cronsProvider";
import { EditCronDialog } from "./EditCronDialog";
import { DeleteCronDialog } from "./DeleteCronDialog";
import type { OpenClawCronJobJson } from "$/types/electron";
import type { CronRunRecord } from "$/types/electron";

const statusLabels: Record<string, string> = {
  ok: "Success",
  error: "Failed",
  idle: "Idle",
  running: "In progress",
};

export interface CronJobDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: OpenClawCronJobJson | null;
  className?: string;
}

export function CronJobDetailDialog({ open, onOpenChange, job, className }: CronJobDetailDialogProps) {
  const { cronRun, runningJobIds, jobsForList, handleToggleEnabled, togglingId, bridgeOnly } = useCrons();
  // Use the current job from the list so the dialog shows updated data after edit/optimistic update
  const displayJob = useMemo(
    () => (job?.id ? jobsForList.find((j) => j.id === job.id) ?? job : job),
    [job, jobsForList]
  );
  const [lastDisplayJob, setLastDisplayJob] = useState<OpenClawCronJobJson | null>(null);
  const [runs, setRuns] = useState<CronRunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedRunKey, setExpandedRunKey] = useState<string | null>(null);
  const [fullDetail, setFullDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const hasAutoExpandedRef = useRef(false);
  const currentJob = displayJob ?? lastDisplayJob;
  const isJobRunning = Boolean(currentJob?.id && runningJobIds.includes(currentJob.id));

  useEffect(() => {
    if (displayJob) setLastDisplayJob(displayJob);
  }, [displayJob]);

  const loadAllRuns = useCallback(async (jobId: string) => {
    setLoading(true);
    try {
      const allRuns = await fetchAllCronRunsForJob(jobId);
      setRuns(allRuns);
      return allRuns;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !displayJob?.id) {
      setRuns([]);
      setExpandedRunKey(null);
      setFullDetail(null);
      hasAutoExpandedRef.current = false;
      return;
    }
    setExpandedRunKey(null);
    setFullDetail(null);
    hasAutoExpandedRef.current = false;
    loadAllRuns(displayJob.id);
  }, [open, displayJob?.id, loadAllRuns]);

  useEffect(() => {
    if (!displayJob?.id || runs.length === 0 || hasAutoExpandedRef.current) return;
    const latest = runs[0];
    if (!latest) return;
    hasAutoExpandedRef.current = true;
    setExpandedRunKey(`${latest.runAtMs}-${latest.sessionId ?? latest.runAtMs}`);
    setDetailLoading(true);
    fetchCronRunDetail(displayJob.id, latest.runAtMs, latest.sessionId)
      .then((detail) => setFullDetail(detail ?? null))
      .catch(() => setFullDetail(null))
      .finally(() => setDetailLoading(false));
  }, [displayJob?.id, runs]);

  const handleShowMore = useCallback(
    async (run: CronRunRecord) => {
      if (!displayJob?.id) return;
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
        const detail = await fetchCronRunDetail(displayJob.id, run.runAtMs, run.sessionId);
        setFullDetail(detail ?? null);
      } catch {
        setFullDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [displayJob?.id, expandedRunKey]
  );

  if (!currentJob) return null;

  const status = (isJobRunning ? "running" : (currentJob.state?.lastStatus ?? "idle")) as string;
  const statusLabel = statusLabels[status] ?? status;
  const lastRunAtMs = currentJob.state?.lastRunAtMs;
  const lastRunStr = lastRunAtMs
    ? format(new Date(lastRunAtMs), "MMM d, yyyy · h:mm a")
    : "—";
  const nextRunAtMs = currentJob.state?.nextRunAtMs;
  const nextRunStr = nextRunAtMs
    ? format(new Date(nextRunAtMs), "MMM d, yyyy · h:mm a")
    : "—";
  const scheduleStr = formatScheduleExpr(currentJob.schedule?.expr, currentJob.schedule?.kind);
  const agentStr = currentJob.agentId ?? "main";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn("w-[420px] sm:w-[420px] flex flex-col gap-0 p-0", className)}
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3 pr-8">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                {status === "running" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : status === "ok" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : status === "error" ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : (
                  <CalendarClock className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 text-left">
                <SheetTitle className="truncate">{currentJob.name}</SheetTitle>
                <SheetDescription className="mt-0.5 truncate">
                  {statusLabel} · Last run: {lastRunStr}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 min-h-0 px-6 py-5">
            <div className="flex h-full min-h-0 flex-col gap-5">
              <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  <span>Schedule</span>
                  <span className="font-mono text-foreground ml-auto truncate max-w-[220px]" title={scheduleStr}>
                    {scheduleStr}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>Agent</span>
                  <span className="text-foreground ml-auto">{agentStr}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Next run</span>
                  <span className="text-foreground ml-auto truncate" title={nextRunStr}>
                    {nextRunStr}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ToggleLeft className="h-3.5 w-3.5 shrink-0" />
                  <span>Enabled</span>
                  <span className="ml-auto flex items-center gap-2">
                    {togglingId === currentJob.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={currentJob.enabled !== false}
                        onCheckedChange={() => handleToggleEnabled(currentJob)}
                        disabled={togglingId === currentJob.id || bridgeOnly}
                        className="shrink-0"
                        aria-label={currentJob.enabled !== false ? "Disable job" : "Enable job"}
                      />
                    )}
                  </span>
                </div>
                <p className="break-all pt-1 font-mono text-[10px] text-muted-foreground">
                  {currentJob.id}
                </p>
              </div>

              <div className="flex min-h-0 flex-1 flex-col space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Run history
                </div>
                <ScrollArea className="min-h-[260px] flex-1 w-full rounded-md border border-border/40">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                  const showMoreButton = true;
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
                          <span>Duration: {formatDurationMs(run.durationMs)}</span>
                        )}
                      </div>
                      <div className="mt-1.5 text-xs text-foreground/90 space-y-1">
                        {!isExpanded && run.summary && run.summary !== run.error && (
                          <p className="line-clamp-2 whitespace-pre-wrap break-words">{run.summary}</p>
                        )}
                        {!isExpanded && run.error && run.status === "error" && (
                          <p className="text-destructive line-clamp-2 whitespace-pre-wrap break-words">{run.error}</p>
                        )}
                        {isExpanded && (detailLoading ? (
                          <p className="text-muted-foreground">Loading…</p>
                        ) : detail ? (
                          <>
                            {detail.summary != null && (
                              <pre className="whitespace-pre-wrap break-words font-mono">{String(detail.summary)}</pre>
                            )}
                            {detail.error != null && (
                              <pre className="whitespace-pre-wrap break-words text-destructive font-mono">
                                {String(detail.error)}
                              </pre>
                            )}
                            {"log" in detail && detail.log != null && String(detail.log).trim() !== "" && (
                              <>
                                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-2">Log</p>
                                <pre className="whitespace-pre-wrap break-words text-foreground/80 font-mono mt-0.5">
                                  {String(detail.log)}
                                </pre>
                              </>
                            )}
                            {"output" in detail && detail.output != null && String(detail.output).trim() !== "" && (
                              <>
                                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mt-2">Output</p>
                                <pre className="whitespace-pre-wrap break-words text-foreground/80 font-mono mt-0.5">
                                  {String(detail.output)}
                                </pre>
                              </>
                            )}
                          </>
                        ) : (
                          <p className="text-muted-foreground">No additional details for this run.</p>
                        ))}
                      </div>
                      {showMoreButton && (
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleShowMore(run)}
                            disabled={detailLoading && expandedRunKey === runKey}
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
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border flex flex-row flex-wrap gap-2">
            <Button
              size="sm"
              variant={isJobRunning ? "outline" : "default"}
              className={`flex-1 gap-1.5 ${isJobRunning ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20 dark:border-amber-500/50" : ""}`}
              disabled={isRunning || isJobRunning}
              onClick={async () => {
                setRunError(null);
                setIsRunning(true);
                try {
                  const result = await cronRun(currentJob.id);
                  if (!result.success) {
                    setRunError(result.error ?? "Run failed");
                    setIsRunning(false);
                  } else {
                    setIsRunning(false);
                  }
                } catch (e: unknown) {
                  setRunError(e instanceof Error ? e.message : "Run failed");
                  setIsRunning(false);
                }
              }}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Sending
                </>
              ) : isJobRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Running
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  Run
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1 gap-1.5"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
            {runError && (
              <p className="basis-full text-xs text-destructive">{runError}</p>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <EditCronDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        job={currentJob}
        onSuccess={() => loadAllRuns(currentJob.id)}
      />
      <DeleteCronDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        job={currentJob}
        onSuccess={() => {
          onOpenChange(false);
        }}
      />
    </>
  );
}
