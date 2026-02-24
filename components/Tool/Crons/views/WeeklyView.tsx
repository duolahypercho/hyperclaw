"use client";

import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isToday,
} from "date-fns";
import { useCrons } from "../provider/cronsProvider";
import { getJobRunTimesInRange, getJobPalette } from "../utils";
import { DaySchedulePanel } from "../DaySchedulePanel";
import type { OpenClawCronJobJson } from "$/types/electron";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Same as month view: max event pills per day cell */
const MAX_PILLS = 3;

export function WeeklyView() {
  const {
    jobsForList,
    parsedCronJobs,
    runsByJobId,
    selectedDate,
    setSelectedDate,
    loading,
    bridgeLoading,
  } = useCrons();

  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = selectedDate || new Date();
    return startOfWeek(d, { weekStartsOn: 0 });
  });

  // When switching to week view or when selectedDate changes, show the week that contains it (or today)
  useEffect(() => {
    const target = selectedDate || new Date();
    const currentWeekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
    if (target < weekStart || target > currentWeekEnd) {
      setWeekStart(startOfWeek(target, { weekStartsOn: 0 }));
    }
  }, [selectedDate?.getTime()]);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    let d = weekStart;
    while (d <= weekEnd) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [weekStart, weekEnd]);

  /** Same logic as month view: one job per day (dedupe by date), key = yyyy-MM-dd */
  const jobsByDay = useMemo(() => {
    const map = new Map<string, OpenClawCronJobJson[]>();
    for (const job of jobsForList) {
      const slots = getJobRunTimesInRange(job, parsedCronJobs, weekStart, weekEnd);
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
  }, [jobsForList, parsedCronJobs, weekStart, weekEnd]);

  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => {
    const t = new Date();
    setWeekStart(startOfWeek(t, { weekStartsOn: 0 }));
    setSelectedDate(t);
  };

  if (loading || bridgeLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="animate-pulse w-full max-w-4xl grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted/30 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Navigation — same as month */}
      <div className="flex items-center justify-end gap-1 px-4 py-2 shrink-0 border-b border-border/20">
        <Button variant="ghost" size="icon" onClick={prevWeek} className="h-7 w-7 rounded-full">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={goToday} className="h-7 px-2.5 text-xs rounded-full">
          Today
        </Button>
        <Button variant="ghost" size="icon" onClick={nextWeek} className="h-7 w-7 rounded-full">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* 7 day columns — same layout as month view day cells */}
          <div className="grid grid-cols-7 border-t border-l border-border/20 rounded-lg overflow-hidden">
            {weekDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayJobs = jobsByDay.get(key) ?? [];
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const today = isToday(day);

              return (
                <motion.button
                  key={key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={`
                    min-h-[5.5rem] flex flex-col p-1.5 text-left transition-colors
                    border-r border-b border-border/20
                    hover:bg-muted/60
                    ${isSelected ? "bg-primary/5" : ""}
                  `}
                >
                  {/* Day name — same style as month header */}
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-0.5">
                    {format(day, "EEE")}
                  </span>
                  {/* Date number — same as month (circle for today) */}
                  <span
                    className={`
                      inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1
                      ${today ? "bg-red-500 text-white" : ""}
                      ${isSelected && !today ? "bg-accent/80 text-background" : ""}
                      ${!today && !isSelected ? "text-accent-foreground/70" : "text-foreground/70"}
                    `}
                  >
                    {format(day, "d")}
                  </span>
                  {/* Event pills — same as month view */}
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

          {/* Day schedule for selected day or today — always show one when in this week */}
          {(() => {
            const day = selectedDate || new Date();
            if (!weekDays.some((d) => isSameDay(d, day))) return null;
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
    </div>
  );
}
