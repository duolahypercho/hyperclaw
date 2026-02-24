import React from "react";
import { Save, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "$/utils";
import { getTimeAgo } from "$/hooks/useFormPersistence";

interface FormPersistenceIndicatorProps {
  hasUnsavedChanges: boolean;
  lastSavedTime: number | null;
  isAutoSaving: boolean;
  persistenceStrategy: "auto" | "manual" | "smart";
  onManualSave?: () => void;
  className?: string;
  showSaveButton?: boolean;
  showTimestamp?: boolean;
}

const FormPersistenceIndicator: React.FC<FormPersistenceIndicatorProps> = ({
  hasUnsavedChanges,
  lastSavedTime,
  isAutoSaving,
  persistenceStrategy,
  onManualSave,
  className,
  showSaveButton = true,
  showTimestamp = true,
}) => {
  if (!hasUnsavedChanges && !lastSavedTime && !isAutoSaving) {
    return null;
  }

  const getStatusIcon = () => {
    if (isAutoSaving) {
      return <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />;
    }

    if (hasUnsavedChanges) {
      return <AlertCircle className="w-4 h-4 text-orange-500 dark:text-yellow-500" />;
    }

    if (lastSavedTime) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }

    return null;
  };

  const getStatusText = () => {
    if (isAutoSaving) {
      return "Auto-saving...";
    }

    if (hasUnsavedChanges) {
      return "You have unsaved changes";
    }

    if (lastSavedTime) {
      return getTimeAgo(lastSavedTime);
    }

    return "";
  };

  const getStatusColor = () => {
    if (isAutoSaving) return "text-blue-500";
    if (hasUnsavedChanges) return "text-orange-500 dark:text-yellow-500";
    if (lastSavedTime) return "text-green-500";
    return "text-muted-foreground";
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-all duration-200",
        hasUnsavedChanges
          ? "bg-yellow-500/10 border-yellow-500/20"
          : "bg-muted/20 border-border",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <div className="flex flex-col">
          <span className={cn("text-sm font-medium", getStatusColor())}>
            {getStatusText()}
          </span>
          {showTimestamp && lastSavedTime && !hasUnsavedChanges && (
            <span className="text-xs text-muted-foreground">
              Last saved: {new Date(lastSavedTime).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {showSaveButton &&
        persistenceStrategy === "smart" &&
        hasUnsavedChanges &&
        onManualSave && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onManualSave}
            disabled={isAutoSaving}
            className="text-xs"
          >
            <Save className="w-3 h-3 mr-1" />
            Save Progress
          </Button>
        )}

      {persistenceStrategy === "auto" && isAutoSaving && (
        <div className="flex items-center gap-1 text-xs text-blue-500">
          <Clock className="w-3 h-3" />
          Auto-saving...
        </div>
      )}
    </div>
  );
};

export default FormPersistenceIndicator;
