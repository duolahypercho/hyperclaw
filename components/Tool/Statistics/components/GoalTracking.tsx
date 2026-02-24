import React, { useMemo } from "react";
import { Target, TrendingUp, Award, CheckCircle2 } from "lucide-react";
import { useStatistics } from "../provider/statisticsProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

// Template component - Goals would need to be stored in backend/database
const GoalTracking: React.FC = () => {
  const { focusTimerData, isLoadingFocusTimer } = useStatistics();

  // Template: These would come from user settings/goals API
  const userGoals = useMemo(() => {
    // TODO: Fetch from API - getGoals() endpoint
    return {
      dailyGoal: 120, // minutes per day
      weeklyGoal: 600, // minutes per week
      monthlyGoal: 2400, // minutes per month
    };
  }, []);

  const stats = useMemo(() => {
    if (!focusTimerData || focusTimerData.length === 0) {
      return {
        todayProgress: 0,
        todayGoal: userGoals.dailyGoal,
        todayPercentage: 0,
        weekProgress: 0,
        weekGoal: userGoals.weeklyGoal,
        weekPercentage: 0,
        monthProgress: 0,
        monthGoal: userGoals.monthlyGoal,
        monthPercentage: 0,
        goalCompletionRate: 0,
        goalStreak: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Today's progress
    const todayData = focusTimerData.find(
      (d) => new Date(d.date).toDateString() === today.toDateString()
    );
    const todayProgress = todayData?.totalMinutes || 0;
    const todayPercentage = Math.min(
      Math.round((todayProgress / userGoals.dailyGoal) * 100),
      100
    );

    // This week's progress
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    const weekData = focusTimerData.filter((d) => {
      const date = new Date(d.date);
      return date >= weekStart && date <= today;
    });
    const weekProgress = weekData.reduce((sum, d) => sum + d.totalMinutes, 0);
    const weekPercentage = Math.min(
      Math.round((weekProgress / userGoals.weeklyGoal) * 100),
      100
    );

    // This month's progress
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthData = focusTimerData.filter((d) => {
      const date = new Date(d.date);
      return date >= monthStart && date <= today;
    });
    const monthProgress = monthData.reduce((sum, d) => sum + d.totalMinutes, 0);
    const monthPercentage = Math.min(
      Math.round((monthProgress / userGoals.monthlyGoal) * 100),
      100
    );

    // Goal completion rate (days that met daily goal)
    const daysWithData = focusTimerData.filter((d) => d.totalMinutes > 0);
    const daysMetGoal = daysWithData.filter(
      (d) => d.totalMinutes >= userGoals.dailyGoal
    ).length;
    const goalCompletionRate =
      daysWithData.length > 0
        ? Math.round((daysMetGoal / daysWithData.length) * 100)
        : 0;

    // Goal streak (consecutive days meeting goal)
    const sortedData = [...focusTimerData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    let goalStreak = 0;
    for (const day of sortedData) {
      if (day.totalMinutes >= userGoals.dailyGoal) {
        goalStreak++;
      } else {
        break;
      }
    }

    return {
      todayProgress,
      todayGoal: userGoals.dailyGoal,
      todayPercentage,
      weekProgress,
      weekGoal: userGoals.weeklyGoal,
      weekPercentage,
      monthProgress,
      monthGoal: userGoals.monthlyGoal,
      monthPercentage,
      goalCompletionRate,
      goalStreak,
    };
  }, [focusTimerData, userGoals]);

  const formatTime = (minutes: number) => {
    if (minutes >= 60) {
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  if (isLoadingFocusTimer) {
    return (
      <div className="bg-card border border-border border-solid rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Goal Tracking</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border border-solid rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Goal Tracking</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily Goal */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-foreground">
              Daily Goal
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.todayProgress)} /{" "}
                {formatTime(stats.todayGoal)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <motion.div
                className="bg-accent h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${stats.todayPercentage}%` }}
                transition={{ duration: 0.5, delay: 0.2 }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {stats.todayPercentage}% complete
            </div>
          </div>
        </motion.div>

        {/* Weekly Goal */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-foreground">
              Weekly Goal
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.weekProgress)} / {formatTime(stats.weekGoal)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <motion.div
                className="bg-accent h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${stats.weekPercentage}%` }}
                transition={{ duration: 0.5, delay: 0.3 }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {stats.weekPercentage}% complete
            </div>
          </div>
        </motion.div>

        {/* Monthly Goal */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-foreground">
              Monthly Goal
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-sm font-semibold">
                {formatTime(stats.monthProgress)} /{" "}
                {formatTime(stats.monthGoal)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <motion.div
                className="bg-accent h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${stats.monthPercentage}%` }}
                transition={{ duration: 0.5, delay: 0.4 }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {stats.monthPercentage}% complete
            </div>
          </div>
        </motion.div>

        {/* Goal Stats */}
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-foreground">
              Goal Stats
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Completion Rate
              </span>
              <span className="text-sm font-semibold">
                {stats.goalCompletionRate}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Goal Streak</span>
              <span className="text-sm font-semibold">
                {stats.goalStreak} days
              </span>
            </div>
          </div>
        </motion.div>
      </div>
      <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border border-dashed">
        <p className="text-xs text-muted-foreground">
          💡 <strong>Note:</strong> Goals are currently using default values. To
          set custom goals, implement the goals API endpoint and user settings.
        </p>
      </div>
    </div>
  );
};

export default GoalTracking;
