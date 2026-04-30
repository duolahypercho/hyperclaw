"use client";

import React, { useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format,
  isSameMonth,
  isSameDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
} from "date-fns";
import { useCrons } from "../provider/cronsProvider";
import { getJobRunTimesInRange, getJobPalette } from "../utils";
import { DaySchedulePanel } from "../DaySchedulePanel";
import type { OpenClawCronJobJson } from "$/types/electron";
import type { CronRunSlot } from "../utils";

const UPCOMING_MAX = 12;
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_PILLS = 3;

export function MonthlyView() {
  const {
    jobsForList,
    parsedCronJobs,
    runsByJobId,
    selectedDate,
    setSelectedDate,
    loading,
    bridgeLoading,
  } = useCrons();

  const [viewMonth, setViewMonth] = React.useState<Date>(
    () => selectedDate || new Date()
  );

  // When switching to month view or when selectedDate changes, show the month that contains it (or today)
  useEffect(() => {
    const target = selectedDate || new Date();
    if (!isSameMonth(viewMonth, target)) {
      setViewMonth(target);
    }
  }, [selectedDate?.getTime()]);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = monthStart.getDay();

  const paddedDays = useMemo(() => {
    const pad: (Date | null)[] = Array(startPad).fill(null);
    return [...pad, ...days];
  }, [startPad, days]);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, OpenClawCronJobJson[]>();
    for (const job of jobsForList) {
      const slots = getJobRunTimesInRange(job, parsedCronJobs, monthStart, monthEnd);
      const seen = new Set<string>();
      for (const slot of slots) {
        const key = format(slot.start, "yyyy-MM-dd");
        if (seen.has(key)) continue;
        seen.add(key);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(job);
      }
    }
    return map;
  }, [jobsForList, parsedCronJobs, monthStart, monthEnd]);

  /** Upcoming runs in this month (from now): flattened, sorted by start, deduped, capped */
  const upcomingRuns = useMemo(() => {
    const list: { job: OpenClawCronJobJson; slot: CronRunSlot }[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    for (const job of jobsForList) {
      const slots = getJobRunTimesInRange(job, parsedCronJobs, monthStart, monthEnd);
      for (const slot of slots) {
        if (slot.start.getTime() < now) continue;
        const key = `${job.id}-${slot.start.getTime()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ job, slot });
      }
    }
    list.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
    return list.slice(0, UPCOMING_MAX);
  }, [jobsForList, parsedCronJobs, monthStart, monthEnd]);

  const prevMonth = () =>
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  const nextMonth = () =>
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  const goToday = () => {
    const t = new Date();
    setViewMonth(t);
    setSelectedDate(t);
  };

  if ((loading || bridgeLoading) && jobsForList.length === 0) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-32 bg-muted/30 rounded animate-pulse" />
          <div className="flex gap-1 h-8 w-28 bg-muted/20 rounded-lg" />
        </div>
        <div className="animate-pulse grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-border/20">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-[1.2] bg-muted/30 min-h-[4rem]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-foreground tabular-nums">
            {format(viewMonth, "MMMM yyyy")}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevMonth}
              className="h-8 w-8 rounded-lg"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday} className="h-8 px-3 text-xs rounded-lg font-medium">
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              className="h-8 w-8 rounded-lg"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 border-t border-l border-border/20 rounded-lg overflow-hidden">
          {paddedDays.map((day, i) => {
            if (!day)
              return (
                <div
                  key={`pad-${i}`}
                  className="min-h-[5.5rem] bg-muted/5 border-r border-b border-l-0 border-r-0 border-t-0 border-solid border-border"
                />
              );

            const key = format(day, "yyyy-MM-dd");
            const dayJobs = jobsByDay.get(key) ?? [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, viewMonth);
            const today = isToday(day);

            return (
              <motion.button
                key={key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.006 }}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`
                  min-h-[5.5rem] flex flex-col p-1 text-left transition-colors
                  border-r border-b border-l-0 border-r-0 border-t-0 border-solid border-border
                  ${isCurrentMonth ? "hover:bg-muted/20" : "bg-muted/5"}
                  ${isSelected ? "bg-primary/5" : ""}
                `}
              >
                <span
                  className={`
                    inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-0.5
                    ${today ? "bg-red-500 text-white" : ""}
                    ${isSelected && !today ? "bg-accent/80 text-background" : ""}
                    ${!isCurrentMonth ? "text-muted-foreground/30" : "text-foreground/70"}
                  `}
                >
                  {format(day, "d")}
                </span>
                <div className="flex-1 min-h-0 flex flex-col gap-[2px] overflow-hidden">
                  <AnimatePresence>
                    {dayJobs.slice(0, MAX_PILLS).map((job) => {
                      const palette = getJobPalette(job.id);
                      return (
                        <motion.span
                          key={job.id}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`text-[9px] leading-tight px-1.5 py-[1px] rounded-[3px] truncate font-medium
                            ${palette.bg} ${palette.text} shadow-sm
                          `}
                          title={job.id ? `${job.name}\nID: ${job.id}` : job.name}
                        >
                          {job.name}
                        </motion.span>
                      );
                    })}
                  </AnimatePresence>
                  {dayJobs.length > MAX_PILLS && (
                    <span className="text-[9px] text-muted-foreground/60 pl-0.5 font-semibold">
                      +{dayJobs.length - MAX_PILLS} more
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {jobsForList.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 py-8 text-center rounded-xl border border-dashed border-border/50 bg-muted/10"
          >
            <p className="text-sm font-medium text-foreground">No cron jobs</p>
            <p className="text-xs text-muted-foreground mt-1">Create jobs with OpenClaw CLI to see them on the calendar.</p>
          </motion.div>
        )}

        {/* Day schedule for selected day or today — always show one when in this month */}
        {(() => {
          const day = selectedDate || new Date();
          if (!isSameMonth(day, viewMonth)) return null;
          return (
            <DaySchedulePanel
              day={day}
              jobsForList={jobsForList}
              parsedCronJobs={parsedCronJobs}
              runsByJobId={runsByJobId}
            />
          );
        })()}
      </div>
    </ScrollArea>
  );
}