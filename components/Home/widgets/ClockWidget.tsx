import React, { memo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "$/utils";
import DueDateDropdown from "$/components/Tool/TodoList/DueDateDropdown";
import { RecurrenceFilter } from "@/components/recurrence_filter";
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";
import { useFocusMode } from "./hooks/useFocusMode";

// Shared badge-like button styles for dropdowns
const BADGE_BUTTON_STYLES =
  "h-auto text-xs px-1.5 py-0.5 font-medium rounded-md border border-solid";

// Read-only badge for when no task is selected
const ReadOnlyBadge: React.FC<{ text: string }> = ({ text }) => (
  <Badge
    variant="outline"
    className="text-xs px-1.5 py-0.5 font-medium text-muted-foreground border-muted"
  >
    {text}
  </Badge>
);

// Clock Widget Custom Header with due date and recurrence display
export const ClockCustomHeader: React.FC<CustomProps> = ({
  widget,
  isEditMode,
}) => {
  const { selectedTask, handleEditTask } = useTodoList();

  // Extract task data
  const taskId = selectedTask?._id;
  const dueDate = selectedTask?.dueDate
    ? new Date(selectedTask.dueDate)
    : undefined;
  const recurrence = selectedTask?.recurrence;
  const completed = selectedTask?.status === "completed";
  const finishedAt = selectedTask?.finishedAt
    ? new Date(selectedTask.finishedAt)
    : undefined;

  const hasActiveTask = Boolean(taskId);

  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex items-center justify-center flex-shrink-0">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="text-primary flex-shrink-0">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-row gap-2 items-center flex-1 min-w-0">
          <h3 className="text-xs font-medium text-foreground truncate">
            {widget.title}
          </h3>
        </div>
      </div>
    </div>
  );
};

// Clock Widget Content Component
const ClockWidgetContent = memo((props: CustomProps) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { isFocusModeActive } = useFocusMode();

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  const formatDate = (date: Date) =>
    date.toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border-1 border-solid transition-all shadow-sm duration-300 rounded-md",
          isFocusModeActive
            ? "border-transparent grayscale-[30%]"
            : "border-border"
        )}
      >
        {/* Custom Header */}
        <ClockCustomHeader {...props} />

        {/* Widget Content */}
        <div className="flex-1 overflow-auto customScrollbar2 p-4">
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            {/* Main Time Display */}
            <div className="text-center space-y-2">
              <div
                className={cn(
                  "text-4xl font-mono font-bold transition-colors duration-300",
                  isFocusModeActive
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {formatTime(currentTime)}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDate(currentTime)}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
});

const ClockWidget = memo((props: CustomProps) => {
  return <ClockWidgetContent {...props} />;
});

ClockWidget.displayName = "ClockWidget";

export default ClockWidget;
