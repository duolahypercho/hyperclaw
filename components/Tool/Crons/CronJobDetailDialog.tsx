"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { format } from "date-fns";
import { Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, CalendarClock, User, ToggleLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { fetchCronRunsForJob, fetchCronRunDetail, formatDurationMs } from "./utils";
import type { OpenClawCronJobJson } from "$/types/electron";
import type { CronRunRecord } from "$/types/electron";

const RUNS_PAGE_SIZE = 10;
/** Approximate chars that fit in 2 lines at text-xs; below this we don't show "Show more". */
const TRUNCATE_THRESHOLD = 100;

const statusLabels: Record<string, string> = {
  ok: "Success",
  error: "Failed",
  idle: "Idle",
};

export interface CronJobDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: OpenClawCronJobJson | null;
}

export function CronJobDetailDialog({ open, onOpenChange, job }: CronJobDetailDialogProps) {
  const [runs, setRuns] = useState<CronRunRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLLIElement>(null);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const [expandedRunKey, setExpandedRunKey] = useState<string | null>(null);
  const [fullDetail, setFullDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadPage = useCallback(async (jobId: string, offset: number, append: boolean) => {
    if (offset === 0) setLoading(true);
    else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      const { runs: page, hasMore: more } = await fetchCronRunsForJob(
        jobId,
        RUNS_PAGE_SIZE,
        offset
      );
      setRuns((prev) => (append ? [...prev, ...page] : page));
      setHasMore(more);
      offsetRef.current = offset + page.length;
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !job?.id) {
      setRuns([]);
      setHasMore(false);
      offsetRef.current = 0;
      setExpandedRunKey(null);
      setFullDetail(null);
      return;
    }
    loadPage(job.id, 0, false);
  }, [open, job?.id, loadPage]);

  // Auto-load more when user scrolls to the bottom
  useEffect(() => {
    if (!open || !job?.id || !hasMore || loading || loadingMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingMoreRef.current) return;
        loadPage(job.id, offsetRef.current, true);
      },
      { root: null, rootMargin: "120px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, job?.id, hasMore, loading, loadingMore, loadPage]);

  const handleShowMore = useCallback(
    async (run: CronRunRecord) => {
      if (!job?.id) return;
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
        const detail = await fetchCronRunDetail(job.id, run.runAtMs);
        setFullDetail(detail ?? null);
      } catch {
        setFullDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [job?.id, expandedRunKey]
  );

  if (!job) return null;

  const status = (job.state?.lastStatus ?? "idle") as string;
  const statusLabel = statusLabels[status] ?? status;
  const lastRunAtMs = job.state?.lastRunAtMs;
  const lastRunStr = lastRunAtMs
    ? format(new Date(lastRunAtMs), "MMM d, yyyy · h:mm a")
    : "—";
  const nextRunAtMs = job.state?.nextRunAtMs;
  const nextRunStr = nextRunAtMs
    ? format(new Date(nextRunAtMs), "MMM d, yyyy · h:mm a")
    : "—";
  const scheduleStr = job.schedule?.expr ?? "—";
  const agentStr = job.agentId ?? "main";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2 space-y-1.5 shrink-0">
          <DialogTitle className="text-base font-semibold pr-8 leading-snug">
            {job.name}
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-muted-foreground break-all">
            {job.id}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
            <span className="flex items-center gap-1.5">
              {status === "ok" ? (
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
              <ToggleLeft className="h-3.5 w-3.5 shrink-0" />
              <span>Enabled</span>
              <span className="text-foreground ml-auto">{job.enabled !== false ? "Yes" : "No"}</span>
            </div>
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
                {runs.map((run) => {
                  const runKey = `${run.runAtMs}-${run.sessionId ?? run.runAtMs}`;
                  const isExpanded = expandedRunKey === runKey;
                  const detail = isExpanded ? fullDetail : null;
                  const hasLongSummary = run.summary && run.summary.length > TRUNCATE_THRESHOLD;
                  const hasLongError = run.error && run.status === "error" && run.error.length > TRUNCATE_THRESHOLD;
                  const hasMoreToShow = hasLongSummary || hasLongError;
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
                        {!isExpanded && run.summary && run.status !== "error" && (
                          <p className="line-clamp-2">{run.summary}</p>
                        )}
                        {!isExpanded && run.error && run.status === "error" && (
                          <p className="text-destructive line-clamp-2">{run.error}</p>
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
                              <pre className="whitespace-pre-wrap break-words text-foreground/80 font-mono">
                                {String(detail.log)}
                              </pre>
                            )}
                            {"output" in detail && detail.output != null && String(detail.output).trim() !== "" && (
                              <pre className="whitespace-pre-wrap break-words text-foreground/80 font-mono">
                                {String(detail.output)}
                              </pre>
                            )}
                          </>
                        ) : (
                          <p className="text-muted-foreground">No additional details for this run.</p>
                        ))}
                      </div>
                      {(isExpanded || hasMoreToShow) && (
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
                                Show more
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
                {hasMore && (
                  <li ref={loadMoreRef} className="flex justify-center py-4 min-h-8">
                    {loadingMore && (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </li>
                )}
              </ul>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
