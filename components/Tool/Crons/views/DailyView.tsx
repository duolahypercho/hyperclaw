"use client";

import React, { useMemo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  format,
  getHours,
  getMinutes,
  addDays,
  startOfDay,
  endOfDay,
  isToday,
} from "date-fns";
import { useCrons } from "../provider/cronsProvider";
import { getJobRunTimesInRange, getJobPalette } from "../utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROW_HEIGHT = 60;
/** 10-minute slots per hour so events align to a grid */
const SLOTS_PER_HOUR = 6;
const SLOT_HEIGHT = ROW_HEIGHT / SLOTS_PER_HOUR;
const MIN_BLOCK_HEIGHT = 10;
const MAX_LANES = 4;
/** Horizontal inset so blocks don't touch lane edges */
const LANE_INSET_PX = 4;

type SlotEntry = {
  job: ReturnType<typeof useCrons>["jobsForList"][0];
  slot: ReturnType<typeof getJobRunTimesInRange>[0];
};

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function assignLanes(entries: SlotEntry[]): { placed: ({ lane: number } & SlotEntry)[]; overflow: number } {
  if (entries.length === 0) return { placed: [], overflow: 0 };
  const byStart = [...entries].sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  const lanes: { end: number }[] = [];
  const placed: ({ lane: number } & SlotEntry)[] = [];

  for (const entry of byStart) {
    const start = entry.slot.start.getTime();
    const end = entry.slot.end.getTime();
    let lane = 0;
    while (lane < lanes.length && lanes[lane].end > start) lane++;
    if (lane < MAX_LANES) {
      if (lanes[lane] == null) lanes[lane] = { end: 0 };
      lanes[lane].end = Math.max(lanes[lane].end, end);
      placed.push({ ...entry, lane });
    }
  }
  return { placed, overflow: byStart.length - placed.length };
}

export function DailyView() {
  const {
    jobsForList,
    parsedCronJobs,
    selectedDate,
    setSelectedDate,
    loading,
    bridgeLoading,
  } = useCrons();

  const displayDate = selectedDate || new Date();
  const dayStart = startOfDay(displayDate);
  const dayEnd = endOfDay(displayDate);
  const today = isToday(displayDate);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);

  const slotsOnDay = useMemo(() => {
    const list: SlotEntry[] = [];
    for (const job of jobsForList) {
      const slots = getJobRunTimesInRange(job, parsedCronJobs, dayStart, dayEnd);
      for (const slot of slots) list.push({ job, slot });
    }
    return list.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  }, [jobsForList, parsedCronJobs, dayStart, dayEnd]);

  const hourData = useMemo(() => {
    const byHour = new Map<number, SlotEntry[]>();
    for (const entry of slotsOnDay) {
      const h = getHours(entry.slot.start);
      if (!byHour.has(h)) byHour.set(h, []);
      byHour.get(h)!.push(entry);
    }
    return HOURS.map((hour) => {
      const list = byHour.get(hour) ?? [];
      const { placed, overflow } = assignLanes(list);
      return { hour, list: placed, overflow };
    });
  }, [slotsOnDay]);

  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return getHours(n) * 60 + getMinutes(n);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      setNowMinutes(getHours(n) * 60 + getMinutes(n));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (nowLineRef.current) {
      nowLineRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  const prevDay = () => setSelectedDate(addDays(displayDate, -1));
  const nextDay = () => setSelectedDate(addDays(displayDate, 1));
  const goToday = () => setSelectedDate(new Date());

  const nowTop = (nowMinutes / 60) * ROW_HEIGHT;

  if (loading || bridgeLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="animate-pulse w-full max-w-2xl space-y-2">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-64 bg-muted/30 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header — Apple style: date prominent, day below */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border/20">
        <div>
          <h1 className="text-lg font-semibold text-foreground tabular-nums">
            {format(displayDate, "MMMM d, yyyy")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(displayDate, "EEEE")} · {slotsOnDay.length} event{slotsOnDay.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" onClick={prevDay} className="h-8 w-8 rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="h-8 px-3 text-xs rounded-full">
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={nextDay} className="h-8 w-8 rounded-full">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* All-day row — Apple Calendar style (empty for crons) */}
      <div className="grid grid-cols-[4.5rem_1fr] border-b border-border/20 shrink-0 bg-muted/5">
        <div className="py-2 pr-3 text-right text-[11px] text-muted-foreground/60 font-medium">
          all-day
        </div>
        <div className="py-2 min-h-[2rem]" />
      </div>

      {/* Hour grid — time column + 4 fixed lane columns for strict alignment */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="relative min-w-0">
          {hourData.map(({ hour, list, overflow }) => (
            <div
              key={hour}
              className="grid grid-cols-[4.5rem_1fr] border-b border-border/10"
              style={{ minHeight: ROW_HEIGHT }}
            >
              {/* Time label — right-aligned, clear */}
              <div className="pr-3 pt-0.5 text-right text-[11px] text-muted-foreground font-medium tabular-nums select-none">
                {formatHour(hour)}
              </div>

              {/* Event area: 4 equal lane columns (Apple style), then +N more on its own row */}
              <div
                className="grid gap-x-[3px] pr-2"
                style={{
                  gridTemplateColumns: `repeat(${MAX_LANES}, minmax(0, 1fr))`,
                  gridTemplateRows: overflow > 0 ? `${ROW_HEIGHT}px auto` : `${ROW_HEIGHT}px`,
                  minHeight: ROW_HEIGHT,
                }}
              >
                {[0, 1, 2, 3].map((laneIndex) => (
                  <div
                    key={laneIndex}
                    className="relative min-w-0 overflow-visible"
                    style={{ minHeight: ROW_HEIGHT }}
                  >
                    {list
                      .filter((e) => e.lane === laneIndex)
                      .map(({ job, slot }) => {
                        const palette = getJobPalette(job.id);
                        const minutes = getMinutes(slot.start);
                        const slotIndex = Math.floor(minutes / 10);
                        const topPx = slotIndex * SLOT_HEIGHT;
                        return (
                          <motion.div
                            key={`${job.id}-${slot.start.getTime()}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`absolute rounded-[4px] flex items-center gap-1.5 cursor-default overflow-hidden
                              ${palette.bg} ${palette.text} text-[9px] leading-tight font-medium
                              border-l-[3px] border-white/30
                            `}
                            style={{
                              top: topPx,
                              left: LANE_INSET_PX,
                              right: LANE_INSET_PX,
                              height: SLOT_HEIGHT - 1,
                              minHeight: MIN_BLOCK_HEIGHT,
                            }}
                            title={`${job.name} · ${format(slot.start, "h:mm a")} – ${format(slot.end, "h:mm a")}`}
                          >
                            <span className="truncate flex-1 min-w-0 pl-1.5 py-[2px]">{job.name}</span>
                            <span className="text-white/80 tabular-nums shrink-0 w-[2.25rem] text-right text-[8px] pr-1">
                              {format(slot.start, "h:mm")}
                            </span>
                          </motion.div>
                        );
                      })}
                  </div>
                ))}
                {overflow > 0 && (
                  <div
                    className="flex items-center pl-0.5 pb-0.5"
                    style={{ gridColumn: "1 / -1", gridRow: 2 }}
                  >
                    <span className="text-[9px] text-muted-foreground/60 font-semibold">
                      +{overflow} more
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Current time line */}
          {today && (
            <div
              ref={nowLineRef}
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: nowTop }}
            >
              <div className="grid grid-cols-[4.5rem_1fr]">
                <div className="flex items-center justify-end pr-2">
                  <span className="text-[10px] font-semibold text-red-500 tabular-nums bg-background px-1 rounded">
                    {format(new Date(), "h:mm a")}
                  </span>
                </div>
                <div className="relative pr-2">
                  <div className="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-background" />
                  <div className="absolute left-0 right-0 h-0.5 bg-red-500" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
