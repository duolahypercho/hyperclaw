import React, { useMemo } from "react";
import { PlayCircle, Clock, BarChart3, Target } from "lucide-react";
import { useStatistics } from "../provider/statisticsProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

const SessionAnalytics: React.FC = () => {
  const { focusTimerData, isLoadingFocusTimer } = useStatistics();

  const stats = useMemo(() => {
    if (!focusTimerData || focusTimerData.length === 0) {
      return {
        totalSessions: 0,
        averageSessionLength: 0,
        longestSession: 0,
        sessionsPerDay: 0,
      };
    }

    // Estimate sessions from focus time
    // Assuming average session is 25 minutes (standard Pomodoro)
    const AVERAGE_SESSION_MINUTES = 25;
    const totalMinutes = focusTimerData.reduce(
      (sum, day) => sum + day.totalMinutes,
      0
    );
    const totalSessions = Math.round(totalMinutes / AVERAGE_SESSION_MINUTES);
    const averageSessionLength =
      totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
    const longestSession = Math.max(
      ...focusTimerData.map((d) => d.totalMinutes),
      0
    );
    const totalDays = focusTimerData.length;
    const sessionsPerDay =
      totalDays > 0 ? (totalSessions / totalDays).toFixed(1) : 0;

    return {
      totalSessions,
      averageSessionLength,
      longestSession,
      sessionsPerDay: parseFloat(sessionsPerDay.toString()),
    };
  }, [focusTimerData]);

  if (isLoadingFocusTimer) {
    return (
      <div className="bg-card border border-border border-solid rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Session Analytics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border border-solid rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Session Analytics</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <PlayCircle className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">
              Total Sessions
            </span>
          </div>
          <div className="text-2xl font-semibold">{stats.totalSessions}</div>
          <div className="text-xs text-muted-foreground mt-1">Estimated</div>
        </motion.div>

        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Avg Session</span>
          </div>
          <div className="text-2xl font-semibold">
            {stats.averageSessionLength}m
          </div>
          <div className="text-xs text-muted-foreground mt-1">Per session</div>
        </motion.div>

        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">
              Longest Session
            </span>
          </div>
          <div className="text-2xl font-semibold">
            {stats.longestSession >= 60
              ? `${Math.floor(stats.longestSession / 60)}h ${
                  stats.longestSession % 60
                }m`
              : `${stats.longestSession}m`}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Single session
          </div>
        </motion.div>

        <motion.div
          className="bg-card border border-border border-solid rounded-lg p-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Sessions/Day</span>
          </div>
          <div className="text-2xl font-semibold">{stats.sessionsPerDay}</div>
          <div className="text-xs text-muted-foreground mt-1">Average</div>
        </motion.div>
      </div>
    </div>
  );
};

export default SessionAnalytics;
