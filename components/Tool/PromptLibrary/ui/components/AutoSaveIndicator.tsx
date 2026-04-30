import React from "react";
import { Save, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoSaveIndicatorProps {
  hasUnsavedChanges: boolean;
  isAutoSaving: boolean;
  isManualSaving: boolean;
  lastSavedTime?: number;
  className?: string;
}

export const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  hasUnsavedChanges,
  isAutoSaving,
  isManualSaving,
  lastSavedTime,
  className,
}) => {
  const getStatusInfo = () => {
    if (isManualSaving) {
      return {
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        text: "Saving...",
        color: "text-blue-500",
      };
    }

    if (isAutoSaving) {
      return {
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        text: "Auto-saving...",
        color: "text-blue-500",
      };
    }

    if (hasUnsavedChanges) {
      return {
        icon: <Save className="w-3 h-3" />,
        text: "Unsaved changes",
        color: "text-orange-500 dark:text-yellow-500",
      };
    }

    if (lastSavedTime) {
      return {
        icon: <CheckCircle className="w-3 h-3" />,
        text: `Saved ${getTimeAgo(lastSavedTime)}`,
        color: "text-green-500",
      };
    }

    return {
      icon: <CheckCircle className="w-3 h-3" />,
      text: "All changes saved",
      color: "text-green-500",
    };
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const statusInfo = getStatusInfo();

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs font-medium transition-all duration-200",
        statusInfo.color,
        className
      )}
    >
      {statusInfo.icon}
      <span
        className={cn("transition-opacity duration-200", {
          "opacity-100": hasUnsavedChanges || isAutoSaving || isManualSaving,
          "opacity-70": !hasUnsavedChanges && !isAutoSaving && !isManualSaving,
        })}
      >
        {statusInfo.text}
      </span>
    </div>
  );
};
