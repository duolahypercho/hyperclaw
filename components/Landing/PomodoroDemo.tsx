"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw, Timer, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const DEMO_SESSION_DURATION = 2 * 60; // 2 minutes for demo

const PomodoroDemo = () => {
  const [timeLeft, setTimeLeft] = useState(DEMO_SESSION_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const progress =
    ((DEMO_SESSION_DURATION - timeLeft) / DEMO_SESSION_DURATION) * 100;

  useEffect(() => {
    if (isRunning && !isPaused && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleStartPause = () => {
    if (!isRunning && timeLeft === DEMO_SESSION_DURATION) {
      setIsRunning(true);
      setIsPaused(false);
    } else if (isRunning && !isPaused) {
      setIsPaused(true);
    } else if (isPaused) {
      setIsPaused(false);
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsPaused(false);
    setTimeLeft(DEMO_SESSION_DURATION);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-6">
      {/* Active Session Card */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md mb-6"
      >
        <div className="bg-card/90 p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Timer className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-foreground truncate">
                Focus Session
              </h3>
              <p className="text-sm text-muted-foreground">
                {isRunning && !isPaused
                  ? "Session in progress..."
                  : isPaused
                  ? "Session paused"
                  : "Ready to start"}
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-3 border-t border-border">
            <div className="flex items-center gap-3 text-sm">
              <div
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  isRunning && !isPaused
                    ? "bg-green-500 animate-pulse"
                    : "bg-muted"
                )}
              />
              <span className="text-foreground font-medium">
                {isRunning && !isPaused
                  ? "Session in progress"
                  : isPaused
                  ? "Session paused"
                  : "Session not started"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span>Commitment: 2 min session</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span>Demo Mode</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="pt-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Session Progress</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="bg-primary h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Timer Display */}
      <motion.div
        key={timeLeft}
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        className="text-5xl font-bold text-primary mb-4 font-mono"
      >
        {formatTime(timeLeft)}
      </motion.div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
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
            isRunning && !isPaused
              ? "bg-destructive hover:bg-destructive/80 text-white"
              : "bg-primary hover:bg-primary/80 text-primary-foreground"
          )}
          onClick={handleStartPause}
          aria-label={isRunning && !isPaused ? "Pause" : "Start"}
        >
          {isRunning && !isPaused ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5" />
          )}
        </Button>
      </div>
    </div>
  );
};

export default PomodoroDemo;
