import React, { useEffect, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Timer,
  Coffee,
  CheckCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePomodoro } from "./pomoProvider";
import { useTimer } from "$/Providers/TimerProv";
import { isEqual } from "lodash";
import { useOS } from "@OS/Provider/OSProv";

import {
  FOCUS,
  SHORT_BREAK,
  LONG_BREAK,
  POMODORO_CYCLES,
  PomodoroSettings,
} from "./types";
import { SettingsPanel } from "./components/settings";
import { PomodoroAnimation } from "./components/animation";

const SESSION_ICONS = {
  [FOCUS]: Timer,
  [SHORT_BREAK]: Coffee,
  [LONG_BREAK]: Coffee,
};

const TIPS = [
  "Stay hydrated! 💧",
  "Stretch during breaks! 🧘‍♂️",
  "Focus on one task at a time.",
  "Breathe and relax.",
  "Take deep breaths during breaks.",
  "Stand up and move around! 🚶‍♂️",
  "Take a break! 🧘‍♂️",
];

interface PomodoroHeaderProps {
  session: string;
  cycle: number;
}

const PomodoroHeader = memo(({ session, cycle }: PomodoroHeaderProps) => {
  const SessionIcon = useMemo(
    () => SESSION_ICONS[session as keyof typeof SESSION_ICONS],
    [session]
  );

  return (
    <div className="flex items-center gap-2 mb-3">
      <SessionIcon className="w-4 h-4 text-primary" />
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {session}
      </div>
      <div className="text-xs text-muted-foreground">
        Cycle {cycle}/{POMODORO_CYCLES}
      </div>
    </div>
  );
});

const PomodoroTimerDisplay = () => {
  const { currentTimerId, currentTimer, isTimerExists } = usePomodoro();
  const { formatTime } = useTimer();

  if (!isTimerExists) {
    return null;
  }

  return (
    <motion.div
      key={currentTimerId}
      initial={{ scale: 1.1 }}
      animate={{ scale: 1 }}
      className="text-6xl font-bold text-primary mb-4 font-mono"
    >
      {formatTime(currentTimer.currentTime)}
    </motion.div>
  );
};

const PomodoroProgressBar = () => {
  const { progress } = usePomodoro();
  return (
    <div className="w-full max-w-xs mb-4">
      <div className="w-full bg-muted rounded-full h-2">
        <motion.div
          className="bg-primary h-2 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
};

interface PomodoroControlsProps {
  handleStartPause: () => void;
  handleReset: () => void;
  handleSkip: () => void;
  isTimerRunning: boolean;
  isTimerPaused: boolean;
}

function arePomodoroControlsPropsEqual(
  prevProps: PomodoroControlsProps,
  nextProps: PomodoroControlsProps
) {
  return isEqual(prevProps, nextProps);
}

const PomodoroControls = memo(
  ({
    handleStartPause,
    handleReset,
    handleSkip,
    isTimerRunning,
    isTimerPaused,
  }: PomodoroControlsProps) => {
    return (
      <div className="flex gap-3 items-center mb-4">
        <Button
          variant="outline"
          className="p-1.5 h-fit w-fit rounded-full transition-all duration-200"
          onClick={handleReset}
          aria-label="Reset"
        >
          <RotateCcw className="w-3 h-3" />
        </Button>
        <Button
          className={cn(
            "p-1.5 h-fit w-fit rounded-full transition-all duration-200",
            isTimerRunning && !isTimerPaused
              ? "bg-destructive hover:bg-destructive/80 text-white"
              : "bg-primary hover:bg-primary/80 text-primary-foreground"
          )}
          onClick={handleStartPause}
          aria-label={isTimerRunning && !isTimerPaused ? "Pause" : "Start"}
        >
          {isTimerRunning && !isTimerPaused ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5" />
          )}
        </Button>
        <Button
          variant="outline"
          className="p-1.5 h-fit w-fit rounded-full transition-all duration-200"
          onClick={handleSkip}
          aria-label="Skip"
        >
          <SkipForward className="w-3 h-3" />
        </Button>
      </div>
    );
  },
  arePomodoroControlsPropsEqual
);

const Pomodoro = () => {
  const {
    showTransition,
    tipIdx,
    settings,
    isInitializing,
    retryCount,
    currentTimer,
    isTimerExists,
    isTimerRunning,
    session,
    cycle,
    nextSession,
    handleStartPause,
    handleReset,
    handleSkip,
  } = usePomodoro();
  const { updateOSSettings } = useOS();


  if (!isTimerExists || isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-3"
        >
          <div className="text-lg font-medium text-muted-foreground">
            {isInitializing
              ? "Initializing Pomodoro..."
              : "Loading Pomodoro..."}
          </div>
          {isInitializing && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto"
            />
          )}
          <div className="text-xs text-muted-foreground">
            {isInitializing
              ? "Setting up your timer..."
              : "Preparing your focus session..."}
          </div>

          {/* Retry button for stuck loading state */}
          {!isInitializing && !currentTimer && retryCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-2"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Retry logic is handled in the provider
                  window.location.reload();
                }}
                className="text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry Loading
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-4 relative">
      {/* Header: Close + Settings side by side, same size */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 pointer-events-none [&>*]:pointer-events-auto">
        <SettingsPanel className="relative" />
        <button
          onClick={() => updateOSSettings({ pomodoro: false })}
          aria-label="Close Pomodoro"
          className="h-6 w-6 p-0 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors focus:outline-none group"
        >
          <motion.span
            whileTap={{ scale: 0.88, rotate: 90 }}
            whileHover={{ rotate: 90, scale: 1.1 }}
            className="flex"
          >
            <X className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
          </motion.span>
        </button>
      </div>
      <AnimatePresence mode="wait">
        {showTransition ? (
          <PomodoroAnimation session={session} nextSession={nextSession} />
        ) : (
          <motion.div
            key="timer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center w-full"
          >
            {/* Session Header */}
            <PomodoroHeader session={session} cycle={cycle} />

            {/* Timer Display */}
            <PomodoroTimerDisplay />

            {/* Progress Bar */}
            <PomodoroProgressBar />

            {/* Controls */}
            <PomodoroControls
              handleStartPause={handleStartPause}
              handleReset={handleReset}
              handleSkip={handleSkip}
              isTimerRunning={currentTimer.isRunning}
              isTimerPaused={currentTimer.isPaused}
            />

            {/* Cycle Indicators */}
            <div className="flex gap-1.5 mb-3">
              {[...Array(POMODORO_CYCLES)].map((_, i) => (
                <motion.div
                  key={i}
                  className={cn(
                    "w-3 h-3 rounded-full flex items-center justify-center",
                    i < cycle ? "bg-primary" : "bg-muted"
                  )}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                >
                  {i < cycle && (
                    <CheckCircle className="w-2 h-2 text-primary-foreground" />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Next Session Preview */}
            <div className="text-xs text-muted-foreground text-center font-medium">
              Next: {nextSession.name} ({nextSession.duration})
            </div>

            {/* Tips */}
            <motion.div
              key={tipIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-xs text-muted-foreground mt-2 text-center italic max-w-xs"
            >
              {TIPS[tipIdx]}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Pomodoro;
