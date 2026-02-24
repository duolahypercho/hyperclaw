import { Badge } from "@/components/ui/badge";
import { cn } from "$/utils";
import { TaskStatistics } from "./types";
import { CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";

interface RecurrenceStatisticsBadgeProps {
  statistics: TaskStatistics;
  size?: "sm" | "md";
  className?: string;
  classNameText?: string;
}

const RecurrenceStatisticsBadge = ({
  statistics,
  size = "sm",
  className,
  classNameText,
}: RecurrenceStatisticsBadgeProps) => {
  const { finishedCount, skippedCount, lastFinishedAt, lastSkippedAt } =
    statistics;

  const totalOccurrences = finishedCount + skippedCount;
  const completionRate =
    totalOccurrences > 0
      ? Math.round((finishedCount / totalOccurrences) * 100)
      : 0;

  // Determine which icon to show based on stats
  const getIcon = () => {
    if (finishedCount > 0 && skippedCount === 0) return CheckCircle2;
    if (skippedCount > 0 && finishedCount === 0) return XCircle;
    return TrendingUp;
  };

  const Icon = getIcon();

  // Get color classes based on completion rate
  const getColorClasses = () => {
    if (completionRate === 0 || totalOccurrences === 0) {
      return {
        bg: "bg-transparent",
        text: "text-muted-foreground",
        border: "border-primary/10",
        icon: "text-muted-foreground",
      };
    }
    if (completionRate === 100) {
      return {
        bg: "bg-green-600/10 dark:bg-green-400/10",
        text: "text-green-700 dark:text-green-300",
        border: "border-green-500/20 dark:border-green-400/30",
        icon: "text-green-700 dark:text-green-300",
      };
    }
    if (completionRate >= 76) {
      return {
        bg: "bg-green-500/10 dark:bg-green-400/10",
        text: "text-green-600 dark:text-green-400",
        border: "border-green-500/30 dark:border-green-400/40",
        icon: "text-green-600 dark:text-green-400",
      };
    }
    if (completionRate >= 51) {
      return {
        bg: "bg-blue-500/10 dark:bg-blue-400/10",
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-500/30 dark:border-blue-400/40",
        icon: "text-blue-600 dark:text-blue-400",
      };
    }
    if (completionRate >= 26) {
      return {
        bg: "bg-yellow-500/10 dark:bg-yellow-400/10",
        text: "text-yellow-600 dark:text-yellow-400",
        border: "border-yellow-500/30 dark:border-yellow-400/40",
        icon: "text-yellow-600 dark:text-yellow-400",
      };
    }
    // 1-25%
    return {
      bg: "bg-orange-500/10 dark:bg-orange-400/10",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-500/30 dark:border-orange-400/40",
      icon: "text-orange-600 dark:text-orange-400",
    };
  };

  const colors = getColorClasses();

  // Format last activity date
  const getLastActivity = () => {
    if (lastFinishedAt && lastSkippedAt) {
      const finished = new Date(lastFinishedAt);
      const skipped = new Date(lastSkippedAt);
      return finished > skipped
        ? `Last finished: ${format(finished, "MMM d")}`
        : `Last skipped: ${format(skipped, "MMM d")}`;
    }
    if (lastFinishedAt) {
      return `Last finished: ${format(new Date(lastFinishedAt), "MMM d")}`;
    }
    if (lastSkippedAt) {
      return `Last skipped: ${format(new Date(lastSkippedAt), "MMM d")}`;
    }
    return "No activity yet";
  };

  const tooltipContent = (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3 h-3 text-primary" />
        <span>Finished: {finishedCount}</span>
      </div>
      {skippedCount > 0 && (
        <div className="flex items-center gap-2">
          <XCircle className="w-3 h-3 text-muted-foreground" />
          <span>Skipped: {skippedCount}</span>
        </div>
      )}
      {totalOccurrences > 0 && (
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3 h-3 text-primary" />
          <span>Completion rate: {completionRate}%</span>
        </div>
      )}
      <div className="pt-1 border-t border-primary/10 mt-1">
        <span className="text-muted-foreground">{getLastActivity()}</span>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "inline-flex items-center gap-1 border cursor-help transition-colors",
              size === "sm" && "text-[10px] px-1.5 py-0.5 h-fit",
              size === "md" && "text-xs px-3 py-1.5 h-fit",
              colors.bg,
              colors.text,
              colors.border,
              className
            )}
          >
            <Icon
              className={cn(
                size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5",
                colors.icon
              )}
            />
            <span className={cn("font-medium", classNameText)}>
              {finishedCount}
              {totalOccurrences > 0 && `/${totalOccurrences}`}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default RecurrenceStatisticsBadge;
