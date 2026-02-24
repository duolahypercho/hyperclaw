import { useState, useEffect, useMemo } from "react";
import { LucideIcon } from "lucide-react";

// Types
export type StatusType =
  | "draft"
  | "scheduled"
  | "inprogress"
  | "failed"
  | "active"
  | "deleted";

export interface StatusDisplayType {
  text: string;
  color: string;
  bgColor: string;
  status: StatusType;
  icon?: string;
}

interface StatusConfig {
  date?: Date | string | number;
  status: StatusType;
  scheduledDate?: Date | string | number;
}

// Status color configurations
const STATUS_COLORS = {
  draft: {
    color: "text-amber-400",
    bgColor: "bg-amber-400",
    icon: "pencil",
  },
  scheduled: {
    color: "text-blue-400",
    bgColor: "bg-blue-400",
    icon: "calendar",
  },
  inprogress: {
    color: "text-primary-foreground/50",
    bgColor: "bg-primary-foreground/50",
    icon: "check",
  },
  failed: {
    color: "text-red-500",
    bgColor: "bg-red-500",
    icon: "x",
  },
  active: {
    color: "text-green-500",
    bgColor: "bg-green-500",
    icon: "activity",
  },
  deleted: {
    color: "text-gray-500",
    bgColor: "bg-gray-500",
    icon: "trash",
  },
} as const;

// Helper function to determine update interval based on time difference
const getUpdateInterval = (date: Date | string | number): number | null => {
  const now = new Date().getTime();
  const time = new Date(date).getTime();
  const diffInMinutes = (now - time) / (1000 * 60);

  if (diffInMinutes < 60) {
    // Less than 1 hour old - update every minute
    return 60000;
  } else if (diffInMinutes < 1440) {
    // Less than 24 hours old - update every hour
    return 3600000;
  } else if (diffInMinutes < 10080) {
    // Less than 7 days old - update every 12 hours
    return 43200000;
  }
  // More than 7 days old - no updates needed
  return null;
};

// Helper function to format relative time
const getTimeAgo = (date: Date | string | number): string => {
  const now = new Date().getTime();
  const time = new Date(date).getTime();
  const diff = now - time;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return new Date(date).toLocaleDateString();
  }
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "now";
};

export const useStatusTimer = ({
  date,
  status,
  scheduledDate,
}: StatusConfig): StatusDisplayType => {
  const [timeDisplay, setTimeDisplay] = useState<string>("");

  // Memoize the base status colors and icon
  const statusConfig = useMemo(
    () => STATUS_COLORS[status] || STATUS_COLORS.draft,
    [status]
  );

  // Set up the timer effect
  useEffect(() => {
    if (status !== "inprogress" || !date) {
      return;
    }

    const updateTime = () => {
      setTimeDisplay(getTimeAgo(date));
    };

    // Initial update
    updateTime();

    // Get appropriate update interval
    const interval = getUpdateInterval(date);
    if (!interval) return;

    // Set up interval for updates
    const timer = setInterval(updateTime, interval);

    return () => clearInterval(timer);
  }, [date, status]);

  // Generate the display text based on status
  const displayText = useMemo(() => {
    switch (status) {
      case "draft":
        return "Draft";
      case "scheduled":
        return scheduledDate
          ? `Scheduled for ${new Date(scheduledDate).toLocaleString()}`
          : "Scheduled";
      case "inprogress":
        return "In Progress";
      case "failed":
        return "Failed to post";
      case "active":
        return timeDisplay || getTimeAgo(date || new Date());
      case "deleted":
        return "Deleted";
      default:
        return status;
    }
  }, [status, scheduledDate, timeDisplay, date]);

  return {
    text: displayText,
    color: statusConfig.color,
    bgColor: statusConfig.bgColor,
    status: status,
    icon: statusConfig.icon,
  };
};
