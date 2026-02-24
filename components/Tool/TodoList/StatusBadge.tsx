import { Badge } from "@/components/ui/badge";
import { cn } from "../../../utils";
import { Task } from "./types";
import { PlayCircle, CheckCircle2, Circle } from "lucide-react";

interface StatusBadgeProps {
  status: Task["status"];
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
  inProgressTaskId?: string;
  taskId?: string;
}

const StatusBadge = ({
  status,
  size = "sm",
  showIcon = true,
  className,
  inProgressTaskId,
  taskId,
}: StatusBadgeProps) => {
  // Don't show badge for pending status (default state)
  if (status === "pending") {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case "in_progress":
        // Show "Doing" only if this task is the active in-progress task
        // Otherwise show "On Hold"
        const isActiveInProgress = inProgressTaskId === taskId;
        return {
          label: isActiveInProgress ? "Doing" : "On Hold",
          icon: PlayCircle,
          className: isActiveInProgress
            ? "bg-primary text-primary-foreground border-primary/30 hover:bg-primary/80"
            : "bg-muted/50 text-muted-foreground border-muted-foreground/30 hover:bg-muted/80",
          iconClassName: isActiveInProgress ? "animate-pulse" : "",
        };
      case "completed":
        return {
          label: "Done",
          icon: CheckCircle2,
          className:
            "bg-muted/50 text-muted-foreground border-muted-foreground/30 hover:bg-muted/80",
          iconClassName: "",
        };
      case "blocked":
        return {
          label: "On Hold",
          icon: Circle,
          className:
            "bg-muted/50 text-muted-foreground border-muted-foreground/30 hover:bg-muted/80",
          iconClassName: "",
        };
      default:
        return {
          label: status,
          icon: Circle,
          className:
            "bg-muted/30 text-muted-foreground border-muted-foreground/30 hover:bg-muted/80",
          iconClassName: "",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 border",
        size === "sm" && "text-[10px] px-1.5 py-0.5 h-5",
        size === "md" && "text-xs px-2 py-0.5 h-6",
        config.className,
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5",
            config.iconClassName
          )}
        />
      )}
      <span>{config.label}</span>
    </Badge>
  );
};

export default StatusBadge;
