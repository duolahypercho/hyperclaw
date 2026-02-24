import React, { useMemo, useState, useEffect } from "react";
import {
  Clock,
  TrendingUp,
  Target,
  Zap,
  AlertCircle,
  RefreshCw,
  Timer,
} from "lucide-react";
import { useStatistics } from "../provider/statisticsProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import HyperchoChartTooltip from "@/components/ui/chart-Tooltip";

const FocusTimerGraph: React.FC = () => {
  const {
    focusTimerData,
    isLoadingFocusTimer,
    focusTimerError,
    refetchFocusTimer,
  } = useStatistics();

  const [isMounted, setIsMounted] = useState(false);

  // Use real data from provider, ensuring we have hourly data for all 24 hours
  const data = useMemo(() => {
    if (!focusTimerData || focusTimerData.length === 0) {
      return [];
    }

    // Ensure each day has all 24 hours of data
    return focusTimerData.map((day) => {
      const hourlyMap = new Map(day.hourlyData.map((h) => [h.hour, h.minutes]));
      const completeHourlyData = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        minutes: hourlyMap.get(hour) || 0,
      }));

      return {
        ...day,
        hourlyData: completeHourlyData,
      };
    });
  }, [focusTimerData]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (data.length === 0) {
      return {
        totalHours: 0,
        remainingMinutes: 0,
        averageDaily: 0,
        peakHour: 0,
        peakHourMinutes: 0,
        bestDay: null,
        weeklyAverage: 0,
      };
    }

    const totalMinutes = data.reduce((sum, day) => sum + day.totalMinutes, 0);
    const averageDaily = totalMinutes / data.length;
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    // Find peak focus hour
    const hourlyTotals = new Array(24).fill(0);
    data.forEach((day) => {
      day.hourlyData.forEach((hour) => {
        hourlyTotals[hour.hour] += hour.minutes;
      });
    });
    const peakHour = hourlyTotals.indexOf(Math.max(...hourlyTotals));
    const peakHourMinutes = Math.max(...hourlyTotals);

    // Find best day
    const bestDay = data.reduce(
      (best, day) => (day.totalMinutes > best.totalMinutes ? day : best),
      data[0]
    );

    // Weekly average (last 7 days)
    const last7Days = data.slice(-7);
    const weeklyAverage =
      last7Days.length > 0
        ? last7Days.reduce((sum, day) => sum + day.totalMinutes, 0) /
          last7Days.length
        : 0;

    return {
      totalHours,
      remainingMinutes,
      averageDaily: Math.round(averageDaily),
      peakHour,
      peakHourMinutes: Math.round(peakHourMinutes),
      bestDay,
      weeklyAverage: Math.round(weeklyAverage),
    };
  }, [data]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Format hour for display
  const formatHour = (hour: number): string => {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
  };

  // Get last 7 days for weekly view
  const last7Days = useMemo(() => data.slice(-7), [data]);

  // Prepare data for 24-hour chart
  const hourlyChartData = useMemo(() => {
    if (data.length === 0) return [];

    return Array.from({ length: 24 }, (_, hour) => {
      const avgMinutes =
        data.reduce(
          (sum, day) => sum + (day.hourlyData[hour]?.minutes || 0),
          0
        ) / data.length;

      return {
        hour: formatHour(hour),
        hourValue: hour,
        minutes: Math.round(avgMinutes),
      };
    });
  }, [data]);

  // Prepare data for weekly chart
  const weeklyChartData = useMemo(() => {
    return last7Days.map((day) => {
      const [year, month, dayNum] = day.date.split("-").map(Number);
      const date = new Date(year, month - 1, dayNum);
      const dayName = date.toLocaleDateString("en-US", {
        weekday: "short",
      });
      const dayNumber = date.getDate();

      return {
        date: day.date,
        label: `${dayName} ${dayNumber}`,
        minutes: day.totalMinutes,
        hours: Math.floor(day.totalMinutes / 60),
        remainingMinutes: day.totalMinutes % 60,
      };
    });
  }, [last7Days]);

  // Chart configurations
  const hourlyChartConfig = {
    minutes: {
      label: "Focus Minutes",
      color: "hsl(var(--accent))",
    },
  };

  const weeklyChartConfig = {
    minutes: {
      label: "Focus Minutes",
      color: "hsl(var(--accent))",
    },
  };

  // Show loading state
  if (isLoadingFocusTimer || !isMounted) {
    return (
      <div className="w-full space-y-6 overflow-hidden">
        {/* Statistics Cards Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="bg-card border border-border border-solid rounded-lg p-4"
            >
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Daily Focus Pattern Skeleton */}
        <div className="bg-card border border-border border-solid rounded-lg p-4 overflow-hidden">
          <Skeleton className="h-5 w-40 mb-4" />
          <div className="flex items-end gap-1 h-48 w-full overflow-hidden">
            {Array.from({ length: 24 }, (_, i) => (
              <Skeleton
                key={i}
                className="flex-1 min-w-0 rounded-t"
                style={{
                  height: `${Math.random() * 60 + 20}%`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Weekly Summary Skeleton */}
        <div className="bg-card border border-border border-solid rounded-lg p-4 overflow-hidden">
          <Skeleton className="h-5 w-32 mb-4" />
          <div className="space-y-2 w-full">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 w-full min-w-0">
                <Skeleton className="h-4 w-20 shrink-0" />
                <Skeleton className="flex-1 h-6 rounded-full min-w-0" />
                <Skeleton className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (focusTimerError) {
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
              <h3 className="text-sm font-semibold">
                Failed to load focus timer
              </h3>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {focusTimerError.message ||
                "We couldn't fetch your focus time data. Please try again."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchFocusTimer()}
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
              <Timer className="w-5 h-5" />
              <h3 className="text-sm font-semibold">No focus time data yet</h3>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              Complete Pomodoro sessions to see your focus time patterns and
              statistics here.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border border-solid rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Total Focus</span>
          </div>
          <div className="text-2xl font-semibold">
            {stats.totalHours}h {stats.remainingMinutes}m
          </div>
          <div className="text-xs text-muted-foreground mt-1">Last 30 days</div>
        </div>

        <div className="bg-card border border-border border-solid rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Daily Average</span>
          </div>
          <div className="text-2xl font-semibold">{stats.averageDaily}m</div>
          <div className="text-xs text-muted-foreground mt-1">Per day</div>
        </div>

        <div className="bg-card border border-border border-solid rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Peak Hour</span>
          </div>
          <div className="text-2xl font-semibold">
            {formatHour(stats.peakHour)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.peakHourMinutes}m avg
          </div>
        </div>

        <div className="bg-card border border-border border-solid rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground">Weekly Avg</span>
          </div>
          <div className="text-2xl font-semibold">{stats.weeklyAverage}m</div>
          <div className="text-xs text-muted-foreground mt-1">Last 7 days</div>
        </div>
      </div>

      {/* Daily Focus Pattern (24-hour view) */}
      <div className="bg-card border border-border border-solid rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Daily Focus Pattern</h3>
        <ChartContainer
          config={hourlyChartConfig}
          className="h-[300px] min-h-[300px] w-full"
        >
          <BarChart data={hourlyChartData}>
            {/* @ts-ignore - Recharts components have incompatible types with React 18+ */}
            {
              (
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              ) as any
            }
            {
              (
                // @ts-ignore - Recharts XAxis has incompatible types with React 18+
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={{ stroke: "hsl(var(--border))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  interval={2}
                />
              ) as any
            }
            {
              (
                // @ts-ignore - Recharts YAxis has incompatible types with React 18+
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={{ stroke: "hsl(var(--border))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  label={{
                    value: "Minutes",
                    angle: -90,
                    position: "insideLeft",
                    style: {
                      textAnchor: "middle",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    },
                  }}
                />
              ) as any
            }
            <ChartTooltip
              content={
                (
                  <HyperchoChartTooltip
                    labelFormatter={(label) => String(label)}
                    valueLabel="Average Focus Time"
                    valueFormatter={(value) =>
                      typeof value === "number"
                        ? value >= 60
                          ? `${Math.floor(value / 60)}h ${value % 60}m`
                          : `${value}m`
                        : value
                    }
                  />
                ) as any
              }
            />
            <Bar
              dataKey="minutes"
              fill="hsl(var(--accent))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>

      {/* Weekly Focus Summary */}
      <div className="bg-card border border-border border-solid rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">
          Last {last7Days.length} {last7Days.length === 1 ? "Day" : "Days"}
        </h3>
        <ChartContainer
          config={weeklyChartConfig}
          className="h-[300px] min-h-[300px] w-full"
        >
          <BarChart data={weeklyChartData} layout="vertical">
            {/* @ts-ignore - Recharts components have incompatible types with React 18+ */}
            {
              (
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              ) as any
            }
            {/* @ts-ignore - Recharts XAxis has incompatible types with React 18+ */}
            {
              (
                // @ts-ignore - Recharts XAxis has incompatible types with React 18+
                <XAxis
                  type="number"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={{ stroke: "hsl(var(--border))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  label={{
                    value: "Minutes",
                    position: "insideBottom",
                    offset: -5,
                    style: {
                      textAnchor: "middle",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    },
                  }}
                />
              ) as any
            }
            {/* @ts-ignore - Recharts YAxis has incompatible types with React 18+ */}
            {
              (
                // @ts-ignore - Recharts YAxis has incompatible types with React 18+
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={{ stroke: "hsl(var(--border))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  width={80}
                />
              ) as any
            }
            <ChartTooltip
              content={
                (
                  <HyperchoChartTooltip
                    labelFormatter={(label, payload) => {
                      if (payload?.date) {
                        const [year, month, day] = String(payload.date)
                          .split("-")
                          .map(Number);
                        const date = new Date(year, month - 1, day);
                        const dayName = date.toLocaleDateString("en-US", {
                          weekday: "short",
                        });
                        const monthName = date.toLocaleDateString("en-US", {
                          month: "short",
                        });
                        return `${dayName}, ${monthName} ${day}`;
                      }
                      return String(label);
                    }}
                    valueLabel="Daily Focus Time"
                    valueFormatter={(value) =>
                      typeof value === "number"
                        ? value >= 60
                          ? `${Math.floor(value / 60)}h ${value % 60}m`
                          : `${value}m`
                        : value
                    }
                  />
                ) as any
              }
            />
            <Bar
              dataKey="minutes"
              fill="hsl(var(--accent))"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
};

export default FocusTimerGraph;
