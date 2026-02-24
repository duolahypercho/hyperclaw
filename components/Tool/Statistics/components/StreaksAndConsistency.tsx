import React, { useMemo } from "react";
import { Flame, Calendar, TrendingUp, Award } from "lucide-react";
import { useStatistics } from "../provider/statisticsProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { DailyFocusData } from "$/services/statistics";

const StreaksAndConsistency: React.FC = () => {
  const { focusTimerData, isLoadingFocusTimer } = useStatistics();

  const stats = useMemo(() => {
    if (!focusTimerData || focusTimerData.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        consistencyScore: 0,
        totalDaysWithFocus: 0,
        totalDays: 0,
      };
    }

    // Sort data by date
    const sortedData = [...focusTimerData].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate current streak (from today backwards)
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = sortedData.length - 1; i >= 0; i--) {
      const dataDate = new Date(sortedData[i].date);
      dataDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor(
        (today.getTime() - dataDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === currentStreak && sortedData[i].totalMinutes > 0) {
        currentStreak++;
      } else if (daysDiff > currentStreak) {
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;
    const dateSet = new Set(
      sortedData
        .filter((d) => d.totalMinutes > 0)
        .map((d) => {
          const date = new Date(d.date);
          date.setHours(0, 0, 0, 0);
          return date.getTime();
        })
    );

    // Check consecutive days
    const allDates = Array.from(dateSet).sort((a, b) => a - b);
    for (let i = 0; i < allDates.length; i++) {
      if (i === 0 || allDates[i] - allDates[i - 1] === 86400000) {
        // 1 day in milliseconds
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Calculate consistency score
    const totalDaysWithFocus = sortedData.filter(
      (d) => d.totalMinutes > 0
    ).length;
    const totalDays = sortedData.length;
    const consistencyScore =
      totalDays > 0 ? Math.round((totalDaysWithFocus / totalDays) * 100) : 0;

    return {
      currentStreak,
      longestStreak,
      consistencyScore,
      totalDaysWithFocus,
      totalDays,
    };
  }, [focusTimerData]);

  if (isLoadingFocusTimer) {
    return (
      <div className="bg-card border border-border border-solid rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Streaks & Consistency</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border border-solid rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Streaks & Consistency</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">
              Current Streak
            </span>
          </div>
          <div className="text-2xl font-semibold">{stats.currentStreak}</div>
          <div className="text-xs text-muted-foreground mt-1">days</div>
        </motion.div>

        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Award className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">
              Longest Streak
            </span>
          </div>
          <div className="text-2xl font-semibold">{stats.longestStreak}</div>
          <div className="text-xs text-muted-foreground mt-1">days</div>
        </motion.div>

        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Consistency</span>
          </div>
          <div className="text-2xl font-semibold">
            {stats.consistencyScore}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.totalDaysWithFocus} of {stats.totalDays} days
          </div>
        </motion.div>

        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Active Days</span>
          </div>
          <div className="text-2xl font-semibold">
            {stats.totalDaysWithFocus}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Total days</div>
        </motion.div>
      </div>
    </div>
  );
};

export default StreaksAndConsistency;
