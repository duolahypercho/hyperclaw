"use client";

import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { format } from "date-fns";
import { Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, CalendarClock, User, ToggleLeft, Play, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { fetchAllCronRunsForJob, fetchCronRunDetail, formatDurationMs, syncCronRunsForJob } from "./utils";
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

/** Heuristic: content would exceed 2 lines (so we show "View logs" when collapsed). */
function wouldExceedTwoLines(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const lines = text.split("\n").length;
  if (lines > 2) return true;
  return text.length > 140;
}

export interface CronJobDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: OpenClawCronJobJson | null;
}

export function CronJobDetailDialog({ open, onOpenChange, job }: CronJobDetailDialogProps) {
  const { cronRun, runningJobIds, jobsForList, refresh, handleToggleEnabled, togglingId, bridgeOnly } = useCrons();
  // Use the current job from the list so the dialog shows updated data after edit/optimistic update
  const displayJob = useMemo(
    () => (job?.id ? jobsForList.find((j) => j.id === job.id) ?? job : job),
    [job, jobsForList]
  );
  const isJobRunning = Boolean(displayJob?.id && runningJobIds.includes(displayJob.id));
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
    loadAllRuns(displayJob.id);
  }, [open, displayJob?.id, loadAllRuns]);

  useEffect(() => {
    if (!displayJob?.id || runs.length === 0 || hasAutoExpandedRef.current || detailLoading) return;
    const latest = runs[0];
    if (!latest) return;
    hasAutoExpandedRef.current = true;
    setDetailLoading(true);
    fetchCronRunDetail(displayJob.id, latest.runAtMs)
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
        const detail = await fetchCronRunDetail(displayJob.id, run.runAtMs);
        setFullDetail(detail ?? null);
      } catch {
        setFullDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [displayJob?.id, expandedRunKey]
  );

  if (!displayJob) return null;

  const status = (isJobRunning ? "running" : (displayJob.state?.lastStatus ?? "idle")) as string;
  const statusLabel = statusLabels[status] ?? status;
  const lastRunAtMs = displayJob.state?.lastRunAtMs;
  const lastRunStr = lastRunAtMs
    ? format(new Date(lastRunAtMs), "MMM d, yyyy · h:mm a")
    : "—";
  const nextRunAtMs = displayJob.state?.nextRunAtMs;
  const nextRunStr = nextRunAtMs
    ? format(new Date(nextRunAtMs), "MMM d, yyyy · h:mm a")
    : "—";
  const scheduleStr = displayJob.schedule?.expr ?? "—";
  const agentStr = displayJob.agentId ?? "main";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2 space-y-1.5 shrink-0">
          <DialogTitle className="text-base font-semibold pr-8 leading-snug">
            {displayJob.name}
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-muted-foreground break-all">
            {displayJob.id}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
            <span className="flex items-center gap-1.5">
              {status === "running" ? (
                <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
              ) : status === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : status === "error" ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="font-medium">{statusLabel}</span>
            </span>
            <span className="text-muted-foreground">Last run: {lastRunStr}</span>
          </div>
          <div className="pt-3 space-y-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span>Schedule</span>
              <span className="font-mono text-foreground ml-auto truncate max-w-[200px]" title={scheduleStr}>
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
              <div className="flex items-center gap-2 w-full">
                <ToggleLeft className="h-3.5 w-3.5 shrink-0" />
                <span>Enabled</span>
                <span className="ml-auto flex items-center gap-2">
                  {togglingId === displayJob.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={displayJob.enabled !== false}
                      onCheckedChange={() => handleToggleEnabled(displayJob)}
                      disabled={togglingId === displayJob.id || bridgeOnly}
                      className="shrink-0"
                      aria-label={displayJob.enabled !== false ? "Disable job" : "Enable job"}
                    />
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="py-3 flex flex-wrap items-center gap-2 border-t border-border/40">
            <Button
              size="sm"
              variant={isJobRunning ? "outline" : "default"}
              className={`gap-1.5 h-8 text-xs ${isJobRunning ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20 dark:border-amber-500/50" : ""}`}
              disabled={isRunning || isJobRunning}
              onClick={async () => {
                setRunError(null);
                setIsRunning(true);
                try {
                  const result = await cronRun(displayJob.id);
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
                  Sending to Claw
                </>
              ) : isJobRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  In progress
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  Run now
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
            {runError && (
              <p className="text-xs text-destructive w-full mt-1">{runError}</p>
            )}
          </div>
        </DialogHeader>

        <div className="px-6 pb-2 pt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
          Run history
        </div>
        <div className="px-6 pb-6 min-h-0">
          <ScrollArea className="w-full rounded-md border border-border/40" style={{ height: "min(50vh, 400px)" }}>
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
      </DialogContent>
      <EditCronDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        job={displayJob}
        onSuccess={() => loadAllRuns(displayJob.id)}
      />
      <DeleteCronDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        job={displayJob}
        onSuccess={() => {
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
