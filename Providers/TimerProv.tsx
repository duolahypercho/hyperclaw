import { useOS } from "@OS/Provider/OSProv";
import {
  createContext,
  useState,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";

// Timer types
export type TimerType = "countdown" | "stopwatch" | "alarm";

// Timer state interface
export interface TimerState {
  id: string;
  type: TimerType;
  name: string;
  duration: number; // in seconds
  currentTime: number; // current time in seconds
  isRunning: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  createdAt: number;
  lastUpdateTime: number;
  metadata?: Record<string, any>; // For additional data like pomodoro cycles, etc.
}

// Timer management interface
interface TimerContextType {
  // Timer management
  timers: TimerState[];
  activeTimers: TimerState[];

  // Timer operations
  createTimer: (
    type: TimerType,
    name: string,
    duration: number,
    metadata?: Record<string, any>
  ) => string;
  startTimer: (id: string) => void;
  pauseTimer: (id: string) => void;
  stopTimer: (id: string) => void;
  resetTimer: (id: string) => void;
  deleteTimer: (id: string) => void;
  updateTimer: (id: string, updates: Partial<TimerState>) => void;

  // Timer queries
  getTimer: (id: string) => TimerState | undefined;
  getTimersByType: (type: TimerType) => TimerState[];

  // Utility functions
  formatTime: (seconds: number) => string;
  calculateProgress: (timer: TimerState) => number;
  cleanupTimersByType: (type: TimerType) => void;
  cleanupAllTimers: () => void;
  cleanupCompletedTimers: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export const TimerProvider = ({ children }: { children: React.ReactNode }) => {
  const { getAppSettings, updateAppSettings } = useOS();
  const currentAppSettings = getAppSettings("timer");
  const [timers, setTimers] = useState<TimerState[]>(
    currentAppSettings?.meta?.timers || []
  );
  const timerRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Add refs to store latest values for the interval
  const timersRef = useRef(timers);
  const getAppSettingsRef = useRef(getAppSettings);
  const updateAppSettingsRef = useRef(updateAppSettings);

  // Update refs when values change
  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  useEffect(() => {
    getAppSettingsRef.current = getAppSettings;
  }, [getAppSettings]);

  useEffect(() => {
    updateAppSettingsRef.current = updateAppSettings;
  }, [updateAppSettings]);

  // Add cleanup function for completed timers - FIXED: Remove dependency on timers
  const cleanupCompletedTimers = useCallback(() => {
    setTimers((prev) => {
      const activeTimers = prev.filter((timer) => {
        // Keep running timers
        if (timer.isRunning) return true;

        // Keep paused timers for a reasonable time (e.g., 1 hour)
        if (timer.isPaused && Date.now() - timer.lastUpdateTime < 3600000)
          return true;

        // Keep completed timers for a short time (e.g., 5 minutes) for UI feedback
        if (timer.isCompleted && Date.now() - timer.lastUpdateTime < 300000)
          return true;

        // Remove old timers
        return false;
      });

      return activeTimers;
    });
  }, []);

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setTimers((prev) => {
        const activeTimers = prev.filter((timer) => {
          // Keep running timers
          if (timer.isRunning) return true;

          // Keep paused timers for a reasonable time (e.g., 1 hour)
          if (timer.isPaused && Date.now() - timer.lastUpdateTime < 3600000)
            return true;

          // Keep completed timers for a short time (e.g., 5 minutes) for UI feedback
          if (timer.isCompleted && Date.now() - timer.lastUpdateTime < 300000)
            return true;

          // Remove old timers
          return false;
        });

        return activeTimers;
      });
    }, 60000); // Every minute

    return () => clearInterval(cleanupInterval);
  }, []); // Empty dependency array

  // Load timers from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = localStorage.getItem("timers");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restoredTimers = parsed.map((timer: any) => {
          // Calculate elapsed time for running timers
          if (timer.isRunning && timer.lastUpdateTime) {
            const elapsed = Math.floor(
              (Date.now() - timer.lastUpdateTime) / 1000
            );
            const newCurrentTime = timer.type === "stopwatch"
              ? timer.currentTime + elapsed
              : Math.max(0, timer.currentTime - elapsed);

            // Check if timer completed while away
            if (newCurrentTime === 0 && timer.type === "countdown") {
              return {
                ...timer,
                currentTime: 0,
                isRunning: false,
                isCompleted: true,
                lastUpdateTime: Date.now(),
              };
            }

            return {
              ...timer,
              currentTime: newCurrentTime,
              lastUpdateTime: Date.now(),
            };
          }
          return timer;
        });

        setTimers(restoredTimers);
      } catch (error) {
        console.warn("Failed to parse saved timers:", error);
      }
    }
  }, []);

  // Track if timers have changed to avoid expensive JSON.stringify on every interval
  const timersChangedRef = useRef(false);
  const prevTimersJsonRef = useRef<string>("");

  // Mark timers as changed when they update
  useEffect(() => {
    const currentJson = JSON.stringify(timers);
    if (currentJson !== prevTimersJsonRef.current) {
      prevTimersJsonRef.current = currentJson;
      timersChangedRef.current = true;
    }
  }, [timers]);

  // Save timers to app settings every 15 seconds
  useEffect(() => {
    if (typeof window === "undefined") return;

    const intervalId = setInterval(() => {
      // Only serialize and save if timers have actually changed
      if (!timersChangedRef.current) {
        return;
      }

      // Get current timers state and fresh app settings using refs
      const currentTimers = timersRef.current;
      const freshAppSettings = getAppSettingsRef.current("timer");
      const storedTimers = freshAppSettings?.meta?.timers || [];

      // Quick length check first (fast)
      if (currentTimers.length !== storedTimers.length) {
        timersChangedRef.current = false;
        updateAppSettingsRef.current("timer", {
          meta: {
            timers: currentTimers,
          },
        });
        return;
      }

      // Only do JSON.stringify if lengths match (much less frequent)
      const hasChanges = JSON.stringify(currentTimers) !== JSON.stringify(storedTimers);

      if (!hasChanges) {
        timersChangedRef.current = false;
        return;
      }

      timersChangedRef.current = false;
      updateAppSettingsRef.current("timer", {
        meta: {
          timers: currentTimers,
        },
      });
    }, 15000); // 15 second interval

    return () => {
      clearInterval(intervalId);
    };
  }, []); // Keep empty dependency array

  // Timer tick function
  const tickTimer = useCallback(
    (id: string) => {
      setTimers((prev) =>
        prev.map((timer) => {
          if (timer.id !== id) return timer;

          if (timer.type === "countdown") {
            const newCurrentTime = Math.max(0, timer.currentTime - 1);
            const isCompleted = newCurrentTime === 0;

            return {
              ...timer,
              currentTime: newCurrentTime,
              isRunning: !isCompleted,
              isCompleted,
              lastUpdateTime: Date.now(),
            };
          } else if (timer.type === "stopwatch") {
            return {
              ...timer,
              currentTime: timer.currentTime + 1,
              lastUpdateTime: Date.now(),
            };
          }

          return timer;
        })
      );
    },
    [] // Removed timers dependency - using functional setState
  );

  // Start timer interval
  const startTimerInterval = useCallback(
    (id: string) => {
      if (timerRefs.current.has(id)) return;

      const interval = setInterval(() => tickTimer(id), 1000);
      timerRefs.current.set(id, interval);
    },
    [tickTimer] // Add tickTimer dependency
  );

  // Stop timer interval
  const stopTimerInterval = useCallback(
    (id: string) => {
      const interval = timerRefs.current.get(id);
      if (interval) {
        clearInterval(interval);
        timerRefs.current.delete(id);
      }
    },
    [] // timerRefs is a ref, doesn't need to be in dependencies
  );

  useEffect(() => {
    return () => {
      timerRefs.current.forEach((interval) => clearInterval(interval));
      timerRefs.current.clear();
    };
  }, []);

  // Update running timers
  useEffect(() => {
    timers.forEach((timer) => {
      if (timer.isRunning && !timer.isPaused) {
        startTimerInterval(timer.id);
      } else {
        stopTimerInterval(timer.id);
      }
    });
  }, [timers, startTimerInterval, stopTimerInterval]);

  const createTimer = useCallback(
    (
      type: TimerType,
      name: string,
      duration: number,
      metadata?: Record<string, any>
    ): string => {
      const id = `${type}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const newTimer: TimerState = {
        id,
        type,
        name,
        duration,
        currentTime: type === "stopwatch" ? 0 : duration,
        isRunning: false,
        isPaused: false,
        isCompleted: false,
        createdAt: Date.now(),
        lastUpdateTime: Date.now(),
        metadata,
      };

      setTimers((prev) => [...prev, newTimer]);
      return id;
    },
    [] // Removed dependencies - using functional setState
  );

  const startTimer = useCallback(
    (id: string) => {
      setTimers((prev) =>
        prev.map((timer) =>
          timer.id === id
            ? {
                ...timer,
                isRunning: true,
                isPaused: false,
                lastUpdateTime: Date.now(),
              }
            : timer
        )
      );
    },
    [] // Removed dependencies - using functional setState
  );

  const pauseTimer = useCallback(
    (id: string) => {
      setTimers((prev) =>
        prev.map((timer) =>
          timer.id === id
            ? { ...timer, isPaused: true, lastUpdateTime: Date.now() }
            : timer
        )
      );
    },
    [] // Removed dependencies - using functional setState
  );

  const stopTimer = useCallback(
    (id: string) => {
      setTimers((prev) =>
        prev.map((timer) =>
          timer.id === id
            ? {
                ...timer,
                isRunning: false,
                isPaused: false,
                isCompleted: true,
                lastUpdateTime: Date.now(),
              }
            : timer
        )
      );
    },
    [] // Removed dependencies - using functional setState
  );

  const resetTimer = useCallback(
    (id: string) => {
      setTimers((prev) =>
        prev.map((timer) =>
          timer.id === id
            ? {
                ...timer,
                currentTime: timer.type === "stopwatch" ? 0 : timer.duration,
                isRunning: false,
                isPaused: false,
                isCompleted: false,
                lastUpdateTime: Date.now(),
              }
            : timer
        )
      );
    },
    [] // Removed dependencies - using functional setState
  );

  // Enhanced deleteTimer with proper cleanup
  const deleteTimer = useCallback(
    (id: string) => {
      stopTimerInterval(id);
      setTimers((prev) => prev.filter((timer) => timer.id !== id));
    },
    [stopTimerInterval] // setTimers is stable, only keep stopTimerInterval
  );

  // Add function to cleanup timers by type - FIXED: Use current timers state
  const cleanupTimersByType = useCallback(
    (type: TimerType) => {
      setTimers((prev) => {
        const timersToDelete = prev.filter((timer) => timer.type === type);
        timersToDelete.forEach((timer) => {
          stopTimerInterval(timer.id);
        });
        return prev.filter((timer) => timer.type !== type);
      });
    },
    [stopTimerInterval] // Keep stopTimerInterval dependency
  );

  // Add function to cleanup all timers - FIXED: Use callback
  const cleanupAllTimers = useCallback(() => {
    timerRefs.current.forEach((interval) => clearInterval(interval));
    timerRefs.current.clear();
    setTimers([]);
  }, []); // Removed dependencies

  const updateTimer = useCallback(
    (id: string, updates: Partial<TimerState>) => {
      setTimers((prev) =>
        prev.map((timer) =>
          timer.id === id
            ? { ...timer, ...updates, lastUpdateTime: Date.now() }
            : timer
        )
      );
    },
    [] // Removed dependencies - using functional setState
  );

  const getTimer = useCallback(
    (id: string) => {
      return timers.find((timer) => timer.id === id);
    },
    [timers]
  );

  const getTimersByType = useCallback(
    (type: TimerType) => {
      return timers.filter((timer) => timer.type === type);
    },
    [timers]
  );

  const formatTime = useCallback((seconds: number): string => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, []);

  const calculateProgress = useCallback(
    (timer: TimerState): number => {
      if (timer.type === "stopwatch") {
        return 0; // Stopwatch doesn't have progress
      }
      return ((timer.duration - timer.currentTime) / timer.duration) * 100;
    },
    [] // Doesn't depend on timers state - uses parameter
  );

  const activeTimers = useMemo(
    () => timers.filter((timer) => timer.isRunning && !timer.isPaused),
    [timers]
  );

  // Enhanced context value - Memoized to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      timers,
      activeTimers,
      createTimer,
      startTimer,
      pauseTimer,
      stopTimer,
      resetTimer,
      deleteTimer,
      updateTimer,
      getTimer,
      getTimersByType,
      formatTime,
      calculateProgress,
      cleanupTimersByType,
      cleanupAllTimers,
      cleanupCompletedTimers,
    }),
    [
      timers,
      activeTimers,
      createTimer,
      startTimer,
      pauseTimer,
      stopTimer,
      resetTimer,
      deleteTimer,
      updateTimer,
      getTimer,
      getTimersByType,
      formatTime,
      calculateProgress,
      cleanupTimersByType,
      cleanupAllTimers,
      cleanupCompletedTimers,
    ]
  );

  return (
    <TimerContext.Provider value={contextValue}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error("useTimer must be used within a TimerProvider");
  }
  return context;
};
