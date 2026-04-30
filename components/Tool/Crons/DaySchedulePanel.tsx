"use client";

import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format, isToday } from "date-fns";
import { CheckCircle2, XCircle, Clock, ChevronRight, HelpCircle, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSlotsForDay, getJobPalette, findRunForSlot, formatDurationMs, fetchCronRunDetail } from "./utils";
import type { OpenClawCronJobJson } from "$/types/electron";
import type { CronRunRecord } from "$/types/electron";
import type { CronJobParsed } from "./utils";
import type { CronRunSlot } from "./utils";

export interface DaySchedulePanelProps {
  day: Date;
  jobsForList: OpenClawCronJobJson[];
  parsedCronJobs: CronJobParsed[];
  runsByJobId: Record<string, CronRunRecord[]>;
}

type SlotEntry = { job: OpenClawCronJobJson; slot: CronRunSlot };

const UPCOMING_MAX_H = 200;
const COMPLETED_MAX_H = 240;

function RunDetailDialog({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: { job: OpenClawCronJobJson; slot: CronRunSlot; run: CronRunRecord | null } | null;
}) {
  const [fullDetail, setFullDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFullDetail(null);
      setDetailLoading(false);
      return;
    }
    setFullDetail(null);
    if (entry?.job?.id && entry?.run) {
      setDetailLoading(true);
      fetchCronRunDetail(entry.job.id, entry.run.runAtMs)
        .then((detail) => setFullDetail(detail ?? null))
        .catch(() => setFullDetail(null))
        .finally(() => setDetailLoading(false));
    }
  }, [open, entry?.job?.id, entry?.run?.runAtMs]);

  if (!entry) return null;
  const { job, slot, run } = entry;
  const timeRange = `${format(slot.start, "h:mm a")} – ${format(slot.end, "h:mm a")}`;
  const slotIsPast = slot.start.getTime() < Date.now();
  const isUpcoming = !run && !slotIsPast;
  const noRunRecorded = !run && slotIsPast;
  const scheduleStr =
    job.schedule?.expr ||
    ((job.schedule as { everyMs?: number })?.everyMs != null
      ? `every ${Math.round((job.schedule as { everyMs: number }).everyMs / 60000)}m`
      : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 sm:rounded-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="text-base font-semibold pr-8 leading-snug">{job.name}</DialogTitle>
          <DialogDescription className="text-sm">
            {format(slot.start, "EEEE, MMM d")} · {timeRange}
            {scheduleStr ? (
              <span className="block mt-1.5 text-xs text-muted-foreground/90">
                Schedule: {scheduleStr}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2">
            {isUpcoming ? (
              <>
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Upcoming — not run yet</span>
              </>
            ) : noRunRecorded ? (
              <>
                <HelpCircle className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                <span className="text-muted-foreground">No run recorded — no log found for this time</span>
              </>
            ) : run!.status === "ok" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span className="font-medium text-green-600 dark:text-green-400">Completed</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                <span className="font-medium text-destructive">Failed</span>
              </>
            )}
          </div>

          {run && (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                <span>Run at</span>
                <span className="tabular-nums">
                  {format(new Date(run.runAtMs), "h:mm:ss a, MMM d")}
                </span>
                <span>Duration</span>
                <span className="tabular-nums">
                  {run.durationMs != null ? formatDurationMs(run.durationMs) : "—"}
                </span>
              </div>
              {run.summary && run.summary !== run.error && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    Summary
                  </p>
                  <div className="text-foreground rounded-md bg-muted/40 p-2.5 text-xs leading-relaxed prose prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0 max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {run.summary}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
              {run.status === "error" && run.error && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-destructive/80 mb-1">
                    Error
                  </p>
                  <div className="text-destructive/90 rounded-md bg-destructive/10 p-2.5 text-xs leading-relaxed prose prose-invert prose-p:my-1 max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.error}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DaySchedulePanel({
  day,
  jobsForList,
  parsedCronJobs,
  runsByJobId,
}: DaySchedulePanelProps) {
  const [selectedEntry, setSelectedEntry] = useState<{
    job: OpenClawCronJobJson;
    slot: CronRunSlot;
    run: CronRunRecord | null;
  } | null>(null);

  const slots = useMemo(
    () => getSlotsForDay(day, jobsForList, parsedCronJobs),
    [day, jobsForList, parsedCronJobs]
  );
  const now = Date.now();
  const isTodaySelected = isToday(day);

  const { pastSlots, upcomingSlots } = useMemo(() => {
    const past: SlotEntry[] = [];
    const upcoming: SlotEntry[] = [];
    for (const entry of slots) {
      if (entry.slot.start.getTime() < now) past.push(entry);
      else upcoming.push(entry);
    }
    return { pastSlots: past, upcomingSlots: upcoming };
  }, [slots, now]);

  const renderRow = (
    { job, slot }: SlotEntry,
    index: number,
    isUpcomingSection: boolean,
    rowKey: string
  ) => {
    const palette = getJobPalette(job.id);
    const run = findRunForSlot(
      runsByJobId[job.id],
      slot.start.getTime(),
      slot.end.getTime()
    );
    const isNext = isTodaySelected && isUpcomingSection && index === 0;
    const timeRange = `${format(slot.start, "h:mm a")} – ${format(slot.end, "h:mm a")}`;
    const slotIsPast = slot.start.getTime() < now;

    let statusLabel: React.ReactNode = null;
    let StatusIcon: React.ComponentType<{ className?: string }> | null = null;
    if (run) {
      if (run.status === "ok") {
        StatusIcon = CheckCircle2;
        statusLabel = (
          <span className="text-green-600 dark:text-green-400">
            Completed in {run.durationMs != null ? formatDurationMs(run.durationMs) : "—"}
          </span>
        );
      } else {
        StatusIcon = XCircle;
        statusLabel = <span className="text-destructive">Failed</span>;
      }
    } else if (slotIsPast) {
      StatusIcon = HelpCircle;
      statusLabel = <span className="text-muted-foreground">No run recorded</span>;
    } else {
      StatusIcon = Clock;
      statusLabel = <span className="text-muted-foreground">Upcoming</span>;
    }

    return (
      <button
        key={rowKey}
        type="button"
        onClick={() => setSelectedEntry({ job, slot, run: run ?? null })}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer border-0 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${palette.bg}`} />
        {StatusIcon && (
          <StatusIcon
            className={`h-4 w-4 shrink-0 ${
              run?.status === "ok"
                ? "text-green-500"
                : run?.status === "error"
                  ? "text-destructive"
                  : slotIsPast && !run
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground"
            }`}
          />
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-[7rem]">
          {timeRange}
        </span>
        <span className="text-xs font-normal flex-1 truncate min-w-0">{job.name}</span>
        <span className="text-[11px] shrink-0 max-w-[10rem] truncate">{statusLabel}</span>
        {isNext && (
          <span className="text-[10px] font-medium text-primary shrink-0 px-1.5 py-0.5 rounded bg-primary/15">
            Next
          </span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
      </button>
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mt-4 rounded-xl border border-border/60 overflow-hidden bg-card/50"
      >
        <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-3 bg-muted/10">
          <span
            className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold ${
              isTodaySelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {format(day, "d")}
          </span>
          <span className="text-sm font-medium text-foreground">{format(day, "EEEE, MMMM d")}</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {slots.length} run{slots.length !== 1 ? "s" : ""}
          </span>
        </div>
        {slots.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground/80">No runs scheduled</p>
            <p className="text-xs text-muted-foreground mt-1">No cron jobs are set to run on this day.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0 ">
            {/* 1. Upcoming container: soonest first, max height */}
            {isTodaySelected && upcomingSlots.length > 0 && (
              <div className="border-b border-l-0 border-r-0 border-t-0 border-solid border-border">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted/5">
                  Upcoming
                </div>
                <ScrollArea style={{ maxHeight: UPCOMING_MAX_H }} className="overflow-auto">
                  <div className="divide-y divide-border/10">
                    {upcomingSlots.map((entry, i) =>
                      renderRow(entry, i, true, `upcoming-${i}`)
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
            {/* 2. Completed container: click to see logs/details, max height */}
            {isTodaySelected && pastSlots.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted/5">
                  Completed
                </div>
                <ScrollArea style={{ maxHeight: COMPLETED_MAX_H }} className="overflow-auto">
                  <div className="divide-y divide-border/10">
                    {pastSlots.map((entry, i) =>
                      renderRow(entry, i, false, `completed-${i}`)
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
            {/* Non-today: single list with max height */}
            {!isTodaySelected && slots.length > 0 && (
              <ScrollArea style={{ maxHeight: COMPLETED_MAX_H + UPCOMING_MAX_H }} className="overflow-auto">
                <div className="divide-y divide-border/10">
                  {slots.map((entry, i) =>
                    renderRow(
                      entry,
                      i,
                      entry.slot.start.getTime() >= now,
                      `slot-${i}`
                    )
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </motion.div>
      <RunDetailDialog
        open={!!selectedEntry}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
        entry={selectedEntry}
      />
    </>
  );
}
