import React, { useMemo } from "react";
import { Sunrise, Sun, Moon, Calendar } from "lucide-react";
import { useStatistics } from "../provider/statisticsProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const TimeDistribution: React.FC = () => {
  const { focusTimerData, isLoadingFocusTimer } = useStatistics();

  const stats = useMemo(() => {
    if (!focusTimerData || focusTimerData.length === 0) {
      return {
        morning: 0,
        afternoon: 0,
        evening: 0,
        weekday: 0,
        weekend: 0,
        dayOfWeek: {
          Monday: 0,
          Tuesday: 0,
          Wednesday: 0,
          Thursday: 0,
          Friday: 0,
          Saturday: 0,
          Sunday: 0,
        },
      };
    }

    let morning = 0; // 5 AM - 12 PM
    let afternoon = 0; // 12 PM - 5 PM
    let evening = 0; // 5 PM - 12 AM
    let weekday = 0;
    let weekend = 0;
    const dayOfWeek: { [key: string]: number } = {
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
      Sunday: 0,
    };

    focusTimerData.forEach((day) => {
      const date = new Date(day.date);
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      const dayOfWeekNum = date.getDay();

      // Count by day of week
      dayOfWeek[dayName] = (dayOfWeek[dayName] || 0) + day.totalMinutes;

      // Count weekday vs weekend
      if (dayOfWeekNum >= 1 && dayOfWeekNum <= 5) {
        weekday += day.totalMinutes;
      } else {
        weekend += day.totalMinutes;
      }

      // Count by time of day
      day.hourlyData.forEach((hour) => {
        if (hour.hour >= 5 && hour.hour < 12) {
          morning += hour.minutes;
        } else if (hour.hour >= 12 && hour.hour < 17) {
          afternoon += hour.minutes;
        } else if (hour.hour >= 17 || hour.hour < 5) {
          evening += hour.minutes;
        }
      });
    });

    return {
      morning,
      afternoon,
      evening,
      weekday,
      weekend,
      dayOfWeek,
    };
  }, [focusTimerData]);

  const formatTime = (minutes: number) => {
    if (minutes >= 60) {
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  const totalTimeOfDay = stats.morning + stats.afternoon + stats.evening;
  const totalWeekTime = stats.weekday + stats.weekend;

  if (isLoadingFocusTimer) {
    return (
      <div className="bg-card border border-border border-solid rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Time Distribution</h3>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border border-solid rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Time Distribution</h3>
      <div className="space-y-4">
        {/* Time of Day */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-foreground">
              Time of Day
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sunrise className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">Morning</span>
                <span className="text-xs text-muted-foreground">
                  (5 AM - 12 PM)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {formatTime(stats.morning)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getPercentage(stats.morning, totalTimeOfDay)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">Afternoon</span>
                <span className="text-xs text-muted-foreground">
                  (12 PM - 5 PM)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {formatTime(stats.afternoon)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getPercentage(stats.afternoon, totalTimeOfDay)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-accent" />
                <span className="text-xs text-muted-foreground">Evening</span>
                <span className="text-xs text-muted-foreground">
                  (5 PM - 12 AM)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {formatTime(stats.evening)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getPercentage(stats.evening, totalTimeOfDay)}%
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Weekday vs Weekend */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-foreground">
              Weekday vs Weekend
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Weekday</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {formatTime(stats.weekday)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getPercentage(stats.weekday, totalWeekTime)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Weekend</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {formatTime(stats.weekend)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getPercentage(stats.weekend, totalWeekTime)}%
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default TimeDistribution;
