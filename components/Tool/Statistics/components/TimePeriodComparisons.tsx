import React, { useMemo } from "react";
import { ArrowUp, ArrowDown, Minus, Calendar, TrendingUp } from "lucide-react";
import { useStatistics } from "../provider/statisticsProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const TimePeriodComparisons: React.FC = () => {
  const { focusTimerData, isLoadingFocusTimer } = useStatistics();

  const stats = useMemo(() => {
    if (!focusTimerData || focusTimerData.length === 0) {
      return {
        thisWeek: 0,
        lastWeek: 0,
        weekChange: 0,
        weekChangePercent: 0,
        thisMonth: 0,
        lastMonth: 0,
        monthChange: 0,
        monthChangePercent: 0,
        bestWeek: 0,
        bestMonth: 0,
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate this week (last 7 days)
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - 6);
    const thisWeekData = focusTimerData.filter((d) => {
      const date = new Date(d.date);
      return date >= thisWeekStart && date <= today;
    });
    const thisWeek = thisWeekData.reduce((sum, d) => sum + d.totalMinutes, 0);

    // Calculate last week (7 days before this week)
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);
    const lastWeekData = focusTimerData.filter((d) => {
      const date = new Date(d.date);
      return date >= lastWeekStart && date <= lastWeekEnd;
    });
    const lastWeek = lastWeekData.reduce((sum, d) => sum + d.totalMinutes, 0);

    // Calculate this month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthData = focusTimerData.filter((d) => {
      const date = new Date(d.date);
      return date >= thisMonthStart && date <= today;
    });
    const thisMonth = thisMonthData.reduce((sum, d) => sum + d.totalMinutes, 0);

    // Calculate last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthData = focusTimerData.filter((d) => {
      const date = new Date(d.date);
      return date >= lastMonthStart && date <= lastMonthEnd;
    });
    const lastMonth = lastMonthData.reduce((sum, d) => sum + d.totalMinutes, 0);

    // Calculate changes
    const weekChange = thisWeek - lastWeek;
    const weekChangePercent =
      lastWeek > 0 ? Math.round((weekChange / lastWeek) * 100) : 0;
    const monthChange = thisMonth - lastMonth;
    const monthChangePercent =
      lastMonth > 0 ? Math.round((monthChange / lastMonth) * 100) : 0;

    // Find best week and month
    const weeklyTotals: { [key: string]: number } = {};
    const monthlyTotals: { [key: string]: number } = {};

    focusTimerData.forEach((d) => {
      const date = new Date(d.date);
      const weekKey = `${date.getFullYear()}-W${Math.ceil(
        (date.getDate() +
          new Date(date.getFullYear(), date.getMonth(), 0).getDay()) /
          7
      )}`;
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

      weeklyTotals[weekKey] = (weeklyTotals[weekKey] || 0) + d.totalMinutes;
      monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + d.totalMinutes;
    });

    const bestWeek = Math.max(...Object.values(weeklyTotals), 0);
    const bestMonth = Math.max(...Object.values(monthlyTotals), 0);

    return {
      thisWeek,
      lastWeek,
      weekChange,
      weekChangePercent,
      thisMonth,
      lastMonth,
      monthChange,
      monthChangePercent,
      bestWeek,
      bestMonth,
    };
  }, [focusTimerData]);

  const formatTime = (minutes: number) => {
    if (minutes >= 60) {
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  if (isLoadingFocusTimer) {
    return (
      <div className="bg-card border border-border border-solid rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Time Period Comparisons</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border border-solid rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Time Period Comparisons</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Week Comparison */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" />
              <span className="text-xs font-medium text-foreground">
                This Week vs Last Week
              </span>
            </div>
            {stats.weekChange !== 0 && (
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  stats.weekChange > 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {stats.weekChange > 0 ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {Math.abs(stats.weekChangePercent)}%
              </div>
            )}
            {stats.weekChange === 0 && (
              <Minus className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">This Week</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.thisWeek)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Last Week</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.lastWeek)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Best Week</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.bestWeek)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Month Comparison */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              <span className="text-xs font-medium text-foreground">
                This Month vs Last Month
              </span>
            </div>
            {stats.monthChange !== 0 && (
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  stats.monthChange > 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {stats.monthChange > 0 ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {Math.abs(stats.monthChangePercent)}%
              </div>
            )}
            {stats.monthChange === 0 && (
              <Minus className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">This Month</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.thisMonth)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Last Month</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.lastMonth)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Best Month</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.bestMonth)}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default TimePeriodComparisons;
