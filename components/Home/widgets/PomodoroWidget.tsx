import React, { memo, useMemo, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Rocket,
  Target,
  Coffee,
  Sparkles,
  CheckCircle2,
  Zap,
} from "lucide-react";
import {
  usePomodoro,
  PomodoroProvider,
} from "$/components/Tool/Pomodoro/pomoProvider";
import { useTimer } from "$/Providers/TimerProv";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  FOCUS,
  SHORT_BREAK,
  LONG_BREAK,
  POMODORO_CYCLES,
} from "$/components/Tool/Pomodoro/types";
import { useOS } from "@OS/Provider/OSProv";
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";
import { useNotifications } from "@OS/Provider/NotificationProv";
import { SettingsPanel } from "$/components/Tool/Pomodoro/components/settings";

// === FOCUS MODE EVENT SYSTEM ===
// Custom events for cross-widget communication
export const FOCUS_MODE_EVENTS = {
  FOCUS_STARTED: "focusModeStarted",
  FOCUS_PAUSED: "focusModePaused",
  FOCUS_ENDED: "focusModeEnded",
  BREAK_STARTED: "breakModeStarted",
  BREAK_ENDED: "breakModeEnded",
  SESSION_COMPLETED: "sessionCompleted",
  CHECKPOINT_CREATED: "checkpointCreated",
} as const;

// Event dispatchers
export const dispatchFocusEvent = (
  eventType: keyof typeof FOCUS_MODE_EVENTS,
  detail?: Record<string, any>
) => {
  window.dispatchEvent(
    new CustomEvent(FOCUS_MODE_EVENTS[eventType], { detail })
  );
};

// === CIRCULAR PROGRESS RING COMPONENT ===
export interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  isRunning?: boolean;
  session: string;
  className?: string;
  variant?: "default" | "white";
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size = 140,
  strokeWidth = 6,
  isRunning = false,
  session,
  className,
  variant = "default",
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Calculate thumb position
  const progressAngle = (progress / 100) * 360 - 90; // -90 to start from top
  const thumbRadius = strokeWidth / 2 + 4; // Position thumb slightly outside the ring
  const thumbX = size / 2 + radius * Math.cos((progressAngle * Math.PI) / 180);
  const thumbY = size / 2 + radius * Math.sin((progressAngle * Math.PI) / 180);

  const isWhite = variant === "white";

  const getSessionColor = () => {
    if (isWhite) return "white";
    if (session === FOCUS) return "hsl(var(--primary))";
    if (session === SHORT_BREAK) return "hsl(142, 76%, 46%)"; // green
    return "hsl(262, 83%, 58%)"; // purple for long break
  };

  const getGlowColor = () => {
    if (isWhite) return "rgba(255, 255, 255, 0.4)";
    if (session === FOCUS) return "rgba(var(--primary-rgb), 0.4)";
    if (session === SHORT_BREAK) return "rgba(34, 197, 94, 0.4)";
    return "rgba(139, 92, 246, 0.4)";
  };

  return (
    <div
      className={cn("relative", className)}
      style={{ width: size, height: size }}
    >
      {/* Background glow when running */}
      <AnimatePresence>
        {isRunning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.05, 1],
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${getGlowColor()} 0%, transparent 70%)`,
            }}
          />
        )}
      </AnimatePresence>

      <svg
        className={cn("transform -rotate-90", className)}
        width={size}
        height={size}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          className="opacity-30"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getSessionColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            filter: isRunning
              ? `drop-shadow(0 0 8px ${getGlowColor()})`
              : "none",
          }}
        />
      </svg>
      {/* Progress thumb indicator */}
      <motion.div
        className="absolute rounded-full bg-accent border-1 border-border/50 border-solid shadow-sm"
        style={{
          width: strokeWidth + 6,
          height: strokeWidth + 6,
          left: thumbX - (strokeWidth + 6) / 2,
          top: thumbY - (strokeWidth + 6) / 2,
          boxShadow: isRunning
            ? "0 0 12px hsl(var(--accent) / 0.6), 0 0 20px hsl(var(--accent) / 0.4)"
            : "0 0 8px rgba(0, 0, 0, 0.3)",
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
};

// === MISSION CONTEXT DISPLAY ===
interface MissionContextProps {
  missionTitle?: string;
  missionDescription?: string;
  isRunning: boolean;
}

const MissionContext: React.FC<MissionContextProps> = ({
  missionTitle,
  missionDescription,
  isRunning,
}) => {
  if (!missionTitle && !isRunning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/20"
    >
      <Target className="w-3 h-3 text-primary" />
      <span className="text-[10px] font-medium text-primary max-w-[150px] truncate">
        {missionTitle || "Ready to focus"}
      </span>
    </motion.div>
  );
};

// === CYCLE INDICATORS ===
export interface CycleIndicatorsProps {
  currentCycle: number;
  totalCycles: number;
}

export const CycleIndicators: React.FC<CycleIndicatorsProps> = ({
  currentCycle,
  totalCycles,
}) => {
  return (
    <div className="flex gap-1.5">
      {[...Array(totalCycles)].map((_, i) => (
        <motion.div
          key={i}
          className={cn(
            "w-2 h-2 rounded-full transition-colors",
            i < currentCycle ? "bg-primary" : "bg-muted-foreground/30"
          )}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.05 }}
        >
          {i < currentCycle && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-full h-full rounded-full bg-primary flex items-center justify-center"
            >
              <CheckCircle2 className="w-1.5 h-1.5 text-primary-foreground" />
            </motion.div>
          )}
        </motion.div>
      ))}
    </div>
  );
};

// === MAIN HEADER COMPONENT ===
export const PomodoroCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  const { currentTimer, session, handleStartPause, isInitializing } =
    usePomodoro();
  const { formatTime } = useTimer();
  const { toolAbstracts } = useOS();
  const { selectedTask } = useTodoList();

  const pomodoroTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "pomodoro"),
    [toolAbstracts]
  );

  const timeLeft = currentTimer?.currentTime || 0;
  const isRunning = currentTimer?.isRunning && !currentTimer?.isPaused;

  const sessionLabel = useMemo(() => {
    if (session === FOCUS) return "Focus";
    if (session === SHORT_BREAK) return "Short Break";
    return "Long Break";
  }, [session]);

  const sessionIcon = useMemo(() => {
    if (session === FOCUS) return <Zap className="w-3.5 h-3.5" />;
    return <Coffee className="w-3.5 h-3.5" />;
  }, [session]);

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex items-center justify-center">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div
          className={cn(
            "text-foreground transition-colors",
            isRunning && session === FOCUS && "text-primary"
          )}
        >
          {pomodoroTool?.icon || sessionIcon}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">
              {widget.title}
            </span>
            <Badge
              variant={session === FOCUS ? "default" : "secondary"}
              className="text-[10px] px-1.5 py-0.5 h-fit"
            >
              {sessionLabel}
            </Badge>
          </div>
          {selectedTask && session === FOCUS && (
            <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">
              {selectedTask.title}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isRunning && (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400"
          />
        )}
        <SettingsPanel className="relative top-0 right-0" />
      </div>
    </div>
  );
};

// === ENHANCED POMODORO WIDGET CONTENT ===
const EnhancedPomodoroContent = memo((props: CustomProps) => {
  const {
    currentTimer,
    session,
    cycle,
    progress,
    nextSession,
    handleStartPause,
    handleReset,
    handleSkip,
    isInitializing,
  } = usePomodoro();
  const { formatTime } = useTimer();
  const { selectedTask } = useTodoList();
  const { info } = useNotifications();

  const [wasRunning, setWasRunning] = useState(false);

  const isRunning = currentTimer?.isRunning && !currentTimer?.isPaused;
  const timeLeft = currentTimer?.currentTime || 0;
  const isFocusMode = isRunning && session === FOCUS;

  // Handle focus mode start
  const handleCommenceMission = useCallback(() => {
    handleStartPause();

    if (!isRunning && session === FOCUS) {
      // Dispatch focus started event for cross-widget communication
      dispatchFocusEvent("FOCUS_STARTED", {
        taskId: selectedTask?._id,
        taskTitle: selectedTask?.title,
        timestamp: Date.now(),
      });

      // Show AI briefing
      const taskName = selectedTask?.title || "your objectives";

      // Trigger notification
      info("Focus Mode Activated", `Starting focus session for ${taskName}`, {
        category: "ai",
        priority: "normal",
      });
    } else if (isRunning) {
      dispatchFocusEvent("FOCUS_PAUSED", {
        taskId: selectedTask?._id,
        timeRemaining: timeLeft,
      });
    }
  }, [handleStartPause, isRunning, session, selectedTask, timeLeft, info]);

  // Handle session transitions
  useEffect(() => {
    if (wasRunning && !isRunning && currentTimer?.isCompleted) {
      // Session completed
      dispatchFocusEvent("SESSION_COMPLETED", {
        session,
        cycle,
        taskId: selectedTask?._id,
      });

      // Create checkpoint for note content
      dispatchFocusEvent("CHECKPOINT_CREATED", {
        session,
        cycle,
        timestamp: Date.now(),
        taskId: selectedTask?._id,
      });

      // Show break-time reflection message
      if (session === FOCUS) {
        dispatchFocusEvent("BREAK_STARTED", { cycle });
      } else {
        dispatchFocusEvent("BREAK_ENDED", { cycle });
      }
    }
    setWasRunning(isRunning || false);
  }, [
    isRunning,
    currentTimer?.isCompleted,
    wasRunning,
    session,
    cycle,
    selectedTask,
  ]);

  // Get dynamic button text
  const getButtonConfig = useMemo(() => {
    if (isRunning) {
      return {
        text: "Pause",
        icon: <Pause className="w-3.5 h-3.5" />,
        variant: "destructive" as const,
      };
    }
    if (session === FOCUS) {
      return {
        text:
          currentTimer?.currentTime === currentTimer?.duration
            ? "Start Focus"
            : "Resume Focus",
        icon: <Rocket className="w-3.5 h-3.5" />,
        variant: "default" as const,
      };
    }
    return {
      text: "Start Break",
      icon: <Coffee className="w-3.5 h-3.5" />,
      variant: "secondary" as const,
    };
  }, [isRunning, session, currentTimer]);

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Flow Border Glow Effect */}
      <AnimatePresence>
        {isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0.3, 0.6, 0.3],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 rounded-md pointer-events-none"
            style={{
              boxShadow:
                session === FOCUS
                  ? "inset 0 0 30px rgba(var(--primary-rgb), 0.15), 0 0 20px rgba(var(--primary-rgb), 0.1)"
                  : "inset 0 0 30px rgba(34, 197, 94, 0.15), 0 0 20px rgba(34, 197, 94, 0.1)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <PomodoroCustomHeader {...props} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 gap-3 relative">
        {/* Circular Progress with Timer */}
        <div className="relative flex items-center justify-center">
          <CircularProgress
            progress={progress}
            size={120}
            strokeWidth={5}
            isRunning={isRunning || false}
            session={session}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              key={timeLeft}
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              className={cn(
                "text-2xl font-bold font-mono",
                isRunning ? "text-primary" : "text-foreground"
              )}
            >
              {formatTime(timeLeft)}
            </motion.span>
            <span className="text-xs text-muted-foreground">
              Cycle {cycle}/{POMODORO_CYCLES}
            </span>
          </div>
        </div>

        {/* Cycle Indicators */}
        <CycleIndicators currentCycle={cycle} totalCycles={POMODORO_CYCLES} />

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={handleReset}
            className="h-7 w-7 rounded-full"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>

          <Button
            variant={getButtonConfig.variant}
            size="sm"
            onClick={handleCommenceMission}
            disabled={!currentTimer}
            className={cn(
              "h-8 px-4 gap-1.5 text-xs font-medium rounded-full transition-all",
              isRunning && "animate-pulse"
            )}
          >
            {getButtonConfig.icon}
            {getButtonConfig.text}
          </Button>

          <Button
            variant="ghost"
            size="iconSm"
            onClick={handleSkip}
            className="h-7 w-7 rounded-full"
          >
            <SkipForward className="w-3 h-3" />
          </Button>
        </div>

        {/* Next Session Preview */}
        <div className="text-xs text-muted-foreground font-medium text-center">
          Next: {nextSession.name} ({nextSession.duration})
        </div>
      </div>
    </div>
  );
});

EnhancedPomodoroContent.displayName = "EnhancedPomodoroContent";

// === WIDGET WRAPPER ===
const PomodoroWidgetContent = memo((props: CustomProps) => {
  const { currentTimer, session } = usePomodoro();
  const isRunning = currentTimer?.isRunning && !currentTimer?.isPaused;

  return (
    <Card
      className={cn(
        "h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-solid transition-all duration-500 rounded-md relative",
        isRunning && session === FOCUS
          ? "border-primary/40 shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]"
          : isRunning
            ? "border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.15)]"
            : "border-border shadow-sm"
      )}
    >
      <EnhancedPomodoroContent {...props} />
    </Card>
  );
});

PomodoroWidgetContent.displayName = "PomodoroWidgetContent";

// === MAIN EXPORT ===
const PomodoroWidget = memo((props: CustomProps) => {
  return (
    <PomodoroProvider>
      <PomodoroWidgetContent {...props} />
    </PomodoroProvider>
  );
});

PomodoroWidget.displayName = "PomodoroWidget";

export default PomodoroWidget;
