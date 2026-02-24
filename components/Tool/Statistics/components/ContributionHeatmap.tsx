import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { useStatistics } from "../provider/statisticsProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { AlertCircle, RefreshCw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

const ContributionHeatmap: React.FC = () => {
  const { heatmapData, isLoadingHeatmap, error, refetchHeatmap } =
    useStatistics();

  // Get current year for organizing data
  const currentYear = new Date().getFullYear();

  // Ensure we have data for all days of the year, filling in missing dates with 0
  const data = useMemo(() => {
    if (!heatmapData || heatmapData.length === 0) {
      return [];
    }

    const dataMap = new Map(heatmapData.map((d) => [d.date, d.count]));
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);
    const completeData: { date: string; count: number }[] = [];

    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split("T")[0];
      completeData.push({
        date: dateStr,
        count: dataMap.get(dateStr) || 0,
      });
    }

    return completeData;
  }, [heatmapData, currentYear]);

  // Organize data by weeks (Sunday to Saturday), starting from January 1 of current year
  const weeks = useMemo(() => {
    if (data.length === 0) return [];

    const weeksData: { date: string; count: number }[][] = [];
    const dataMap = new Map(data.map((d) => [d.date, d]));

    // Start exactly from January 1 of current year
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);

    // Find what day of the week January 1st is (0 = Sunday, 1 = Monday, etc.)
    const firstDayOfWeek = startDate.getDay();

    // Start from the Sunday before January 1st to maintain week structure
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() - firstDayOfWeek);

    // Generate all weeks from weekStart to endDate
    let currentDate = new Date(weekStart);

    while (currentDate <= endDate) {
      const week: { date: string; count: number }[] = [];

      // Add all 7 days of the week
      for (let i = 0; i < 7; i++) {
        const dateStr = currentDate.toISOString().split("T")[0];

        // Only include dates from current year
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31`;
        if (dateStr >= yearStart && dateStr <= yearEnd) {
          week.push(
            dataMap.get(dateStr) || {
              date: dateStr,
              count: 0,
            }
          );
        } else {
          // For dates outside current year, add empty placeholder but don't render them
          week.push({
            date: dateStr,
            count: -1, // Use -1 as a marker for dates to skip
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Only add week if it has at least one valid date from current year
      if (week.some((day) => day.count !== -1)) {
        weeksData.push(week);
      }
    }

    return weeksData;
  }, [data, currentYear]);

  // Get color based on absolute count value
  // 1 pomodoro = first color, 2 = second, 3 = third, 4+ = fourth
  const getColor = (count: number): string => {
    if (count === 0) return "bg-muted/70 border border-solid border-border/50";

    if (count === 1) return "bg-accent/30";
    if (count === 2) return "bg-accent/50";
    if (count === 3) return "bg-accent/70";
    return "bg-accent"; // 4 or more
  };

  // Get month labels - show first week of each month (only for current year)
  const monthLabels = useMemo(() => {
    const labels: { weekIndex: number; label: string }[] = [];
    const monthSet = new Set<string>();
    const yearStart = new Date(currentYear, 0, 1);

    weeks.forEach((week, weekIdx) => {
      // Check the first valid day of the week (skip dates before current year)
      const firstValidDay = week.find((day) => day.count !== -1);
      if (firstValidDay) {
        const date = new Date(firstValidDay.date);

        // Only show labels for current year dates
        if (date >= yearStart) {
          const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

          // If this is the first week of a new month, add label
          if (!monthSet.has(monthKey)) {
            monthSet.add(monthKey);
            labels.push({
              weekIndex: weekIdx,
              label: date.toLocaleDateString("en-US", { month: "short" }),
            });
          }
        }
      }
    });

    return labels;
  }, [weeks, currentYear]);

  // Day labels - only show Mon, Wed, Fri
  const dayLabels = ["Mon", "Wed", "Fri"];

  // Generate skeleton weeks for loading state (approximately 53 weeks in a year)
  const skeletonWeeks = Array.from({ length: 53 }, (_, i) => i);

  // Show loading state with skeleton
  if (isLoadingHeatmap) {
    return (
      <div className="w-full">
        <div className="bg-card border border-solid border-border rounded-lg p-3">
          <div className="flex items-start gap-2">
            {/* Day labels skeleton */}
            <div className="flex flex-col gap-0.5 pt-4">
              {dayLabels.map((day, idx) => (
                <div
                  key={day}
                  className="text-[10px] text-muted-foreground h-[10px] flex items-center"
                  style={{ marginTop: idx === 0 ? 0 : "20px" }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Heatmap grid skeleton */}
            <div className="flex-1 overflow-x-auto">
              {/* Month labels skeleton */}
              <div className="flex gap-0.5 mb-1 min-w-max">
                {skeletonWeeks.map((weekIdx) => (
                  <Skeleton
                    key={weekIdx}
                    className="h-3 w-[10px]"
                    style={{ minWidth: "10px", width: "10px" }}
                  />
                ))}
              </div>

              {/* Grid skeleton */}
              <div className="flex gap-0.5 min-w-max">
                {skeletonWeeks.map((weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-0.5">
                    {Array.from({ length: 7 }, (_, dayIdx) => (
                      <Skeleton
                        key={dayIdx}
                        className="w-[10px] h-[10px] rounded-none"
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Legend skeleton */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-solid border-border border-b-0 border-l-0 border-r-0">
                <Skeleton className="h-3 w-40" />
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-8" />
                  <div className="flex gap-0.5">
                    {Array.from({ length: 4 }, (_, i) => (
                      <Skeleton
                        key={i}
                        className="w-[10px] h-[10px] rounded-none"
                      />
                    ))}
                  </div>
                  <Skeleton className="h-3 w-8" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state with retry option
  if (error) {
    return (
      <div className="w-full">
        <div className="bg-card border border-solid border-border rounded-lg p-6">
          <motion.div
            className="flex flex-col items-center justify-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-semibold">Failed to load heatmap</h3>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {error.message ||
                "We couldn't fetch your contribution data. Please try again."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchHeatmap()}
              className="mt-2"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Show empty state if no data
  if (data.length === 0) {
    return (
      <div className="w-full">
        <div className="bg-card border border-solid border-border rounded-lg p-6">
          <motion.div
            className="flex flex-col items-center justify-center gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-5 h-5" />
              <h3 className="text-sm font-semibold">No contributions yet</h3>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              Start completing Pomodoro sessions to see your contribution
              activity here.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-card border border-solid border-border rounded-lg p-3">
        <div className="flex items-start gap-2">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 pt-4">
            {dayLabels.map((day, idx) => (
              <div
                key={day}
                className="text-[10px] text-muted-foreground h-[10px] flex items-center"
                style={{ marginTop: idx === 0 ? 0 : "20px" }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex-1 overflow-x-auto">
            {/* Month labels */}
            <div className="flex gap-0.5 mb-1 min-w-max">
              {weeks.map((week, weekIdx) => {
                const monthLabel = monthLabels.find(
                  (label) => label.weekIndex === weekIdx
                );
                return (
                  <div
                    key={weekIdx}
                    className="text-[10px] text-muted-foreground"
                    style={{ minWidth: "10px", width: "10px" }}
                  >
                    {monthLabel ? monthLabel.label : ""}
                  </div>
                );
              })}
            </div>

            {/* Grid */}
            <div className="flex gap-0.5 min-w-max">
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-0.5">
                  {week.map((day, dayIdx) => {
                    const date = new Date(day.date);
                    const dayOfWeek = date.getDay();

                    // Skip dates before 2026 (marked with count: -1)
                    if (day.count === -1) {
                      return (
                        <div key={day.date} className="w-[10px] h-[10px]" />
                      );
                    }

                    // Show all days, but only label Mon, Wed, Fri
                    const tooltipText = `${day.date}: ${
                      day.count
                    } contribution${day.count !== 1 ? "s" : ""}`;

                    return (
                      <HyperchoTooltip
                        key={day.date}
                        value={tooltipText}
                        side="top"
                      >
                        <div
                          className={cn(
                            "w-[10px] h-[10px] rounded-none transition-transform duration-150 ease-out cursor-pointer hover:scale-125 hover:z-10",
                            getColor(day.count)
                          )}
                        />
                      </HyperchoTooltip>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-solid border-border border-b-0 border-l-0 border-r-0">
              <div className="text-[10px] text-muted-foreground">
                Learn how we count contributions
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Less</span>
                <div className="flex gap-0.5">
                  <div className="w-[10px] h-[10px] rounded-none bg-accent/30" />
                  <div className="w-[10px] h-[10px] rounded-none bg-accent/50" />
                  <div className="w-[10px] h-[10px] rounded-none bg-accent/70" />
                  <div className="w-[10px] h-[10px] rounded-none bg-accent" />
                </div>
                <span className="text-[10px] text-muted-foreground">More</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContributionHeatmap;
