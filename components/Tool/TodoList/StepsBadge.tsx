import { Badge } from "@/components/ui/badge";
import { cn } from "$/utils";
import { CheckCircle2, ListChecks } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StepsBadgeProps {
  completed: number;
  total: number;
  size?: "sm" | "md";
  className?: string;
  classNameText?: string;
}

const StepsBadge = ({
  completed,
  total,
  size = "sm",
  className,
  classNameText,
}: StepsBadgeProps) => {
  if (total === 0) return null;

  const percentage = Math.round((completed / total) * 100);
  const Icon = completed === total ? CheckCircle2 : ListChecks;

  // Get color classes based on completion percentage
  const getColorClasses = () => {
    if (percentage === 0) {
      return {
        bg: "bg-secondary/30",
        text: "text-muted-foreground",
        border: "border-primary/10",
        icon: "text-muted-foreground",
      };
    }
    if (percentage === 100) {
      return {
        bg: "bg-green-600/10 dark:bg-green-400/10",
        text: "text-green-700 dark:text-green-300",
        border: "border-green-500/20 dark:border-green-400/30",
        icon: "text-green-700 dark:text-green-300",
      };
    }
    if (percentage >= 76) {
      return {
        bg: "bg-green-500/10 dark:bg-green-400/10",
        text: "text-green-600 dark:text-green-400",
        border: "border-green-500/30 dark:border-green-400/40",
        icon: "text-green-600 dark:text-green-400",
      };
    }
    if (percentage >= 51) {
      return {
        bg: "bg-blue-500/10 dark:bg-blue-400/10",
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-500/30 dark:border-blue-400/40",
        icon: "text-blue-600 dark:text-blue-400",
      };
    }
    if (percentage >= 26) {
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
              {completed}/{total}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {completed === total
              ? "All steps completed"
              : `${completed} of ${total} steps completed (${percentage}%)`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default StepsBadge;
