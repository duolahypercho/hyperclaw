import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Timer,
  Coffee,
  Settings,
} from "lucide-react";
import { useOS } from "@OS/Provider/OSProv";
import { useSoundEffect } from "@OS/hooks/useSoundEffect";
import { useTimer } from "$/Providers/TimerProv";
import { AppSchema } from "@OS/Layout/types";
import { isElectron } from "$/hooks/useIsElectron";
import {
  FOCUS,
  SHORT_BREAK,
  LONG_BREAK,
  POMODORO_CYCLES,
  DEFAULT_SESSION_LENGTHS,
  PomodoroSettings,
  SessionInfo,
  NextSessionInfo,
} from "./types";
import {
  createSession,
  pauseResumeSession,
  endSession,
  getActiveSession,
} from "$/services/tools/pomodoro";
import { useToast } from "@/components/ui/use-toast";

const TIPS = [
  "Stay hydrated! 💧",
  "Stretch during breaks! 🧘‍♂️",
  "Focus on one task at a time.",
  "Breathe and relax.",
  "Take deep breaths during breaks.",
  "Stand up and move around! 🚶‍♂️",
  "Take a break! 🧘‍♂️",
];

interface PomodoroContextValue {
  // State
  showTransition: boolean;
  tipIdx: number;
  settings: PomodoroSettings;
  currentTimerId: string | null;
  isInitializing: boolean;
  retryCount: number;
  currentTimer: any;
  isTimerRunning: boolean;
  isTimerExists: boolean;
  session: string;
  cycle: number;
  progress: number;
  nextSession: { name: string; duration: string };

  // Actions
  handleStartPause: () => void;
  handleReset: () => void;
  handleSkip: () => void;
  handleSessionLengthChange: (sessionType: string, minutes: number) => void;
  handleResetSettings: () => void;
  updateSettings: (newSettings: Partial<PomodoroSettings>) => void;
  showNotification: (title: string, body: string) => void;
  openNotificationSettings: () => void;

  // App Schema
  appSchema: AppSchema;
}

const PomodoroContext = createContext<PomodoroContextValue | undefined>(
  undefined
);

interface PomodoroProviderProps {
  children: ReactNode;
  isWidget?: boolean;
}

export function PomodoroProvider({
  children,
  isWidget = false,
}: PomodoroProviderProps) {
  const { getAppSettings, updateAppSettings } = useOS();
  const { toast } = useToast();
  const {
    timers,
    createTimer,
    startTimer,
    pauseTimer,
    stopTimer,
    resetTimer,
    updateTimer,
    formatTime,
    calculateProgress,
    getTimer,
  } = useTimer();

  const currentAppSettings = getAppSettings("pomodoro");
  const isInitializedRef = useRef(false);
  const handledCompletionTimerIdRef = useRef<string | null>(null);
  const currentTimerRef = useRef<any>(null);
  const isHandlingStartPauseRef = useRef<boolean>(false);
  const lastStartPauseCallRef = useRef<number>(0);

  // Backend session state
  const [backendSessionId, setBackendSessionId] = useState<string | null>(null);
  const [backendCycleId, setBackendCycleId] = useState<string | null>(null);
  const [isLoadingActiveSession, setIsLoadingActiveSession] = useState(false);
  const backendSessionIdRef = useRef<string | null>(null);
  const backendCycleIdRef = useRef<string | null>(null);

  // Update refs when state changes
  useEffect(() => {
    backendSessionIdRef.current = backendSessionId;
    backendCycleIdRef.current = backendCycleId;
  }, [backendSessionId, backendCycleId]);

  // Get settings from app meta or use defaults
  const getSettingsFromMeta = useCallback(() => {
    const meta = currentAppSettings?.meta || {};
    return {
      sessionLengths: meta.sessionLengths || DEFAULT_SESSION_LENGTHS,
      autoStartBreaks: meta.autoStartBreaks || false,
      autoStartPomodoros: meta.autoStartPomodoros || false,
      soundEnabled: meta.soundEnabled !== undefined ? meta.soundEnabled : true,
      showNotifications:
        meta.showNotifications !== undefined ? meta.showNotifications : true,
      musicWhileFocusing: meta.musicWhileFocusing || false,
      alarmVolume: meta.alarmVolume !== undefined ? meta.alarmVolume : 0.7,
      currentTimerId: meta.currentTimerId || null,
      currentSession: meta.currentSession || FOCUS,
      currentCycle: meta.currentCycle || 1,
    };
  }, [currentAppSettings?.meta]);

  const initialSettings = getSettingsFromMeta();

  // Refs for stable callbacks
  const sessionRef = useRef<string>(initialSettings.currentSession || FOCUS);
  const cycleRef = useRef<number>(initialSettings.currentCycle || 1);
  const settingsRef = useRef<PomodoroSettings>(initialSettings);
  const handleSessionEndRef = useRef<(isSkipped?: boolean) => void>(() => { });
  const isInitializingRef = useRef(false);

  // Local state for UI
  const [showTransition, setShowTransition] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  const [settings, setSettings] = useState(initialSettings);
  const [currentTimerId, setCurrentTimerId] = useState<string | null>(
    initialSettings.currentTimerId
  );
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationTimeout, setInitializationTimeout] =
    useState<NodeJS.Timeout | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Get current pomodoro timer
  const currentTimer = useMemo(() => {
    if (!currentTimerId) return null;
    return getTimer(currentTimerId);
  }, [currentTimerId, getTimer]);

  // Update ref whenever currentTimer changes
  useEffect(() => {
    currentTimerRef.current = currentTimer;
  }, [currentTimer]);

  // Extract isRunning separately to prevent unnecessary re-renders
  const isTimerRunning = useMemo(
    () => currentTimer?.isRunning ?? false,
    [currentTimer?.isRunning]
  );

  const isTimerExists = useMemo(() => {
    return !!(currentTimerId && currentTimer);
  }, [currentTimerId, currentTimer]);

  // Initialize pomodoro timer if none exists
  useEffect(() => {
    isInitializedRef.current = false;

    const initializeTimer = async () => {
      if (isInitializing) return;

      const needsTimer = !currentTimerId || (currentTimerId && !currentTimer);

      if (needsTimer) {
        setIsInitializing(true);

        const timeout = setTimeout(() => {
          console.warn("Pomodoro initialization timeout, forcing completion");
          setIsInitializing(false);
          setRetryCount((prev) => prev + 1);
          isInitializedRef.current = true;
        }, 5000);

        setInitializationTimeout(timeout);

        try {
          const timerId = createTimer(
            "countdown",
            "Pomodoro",
            initialSettings.sessionLengths[
            initialSettings.currentSession || FOCUS
            ],
            {
              session: initialSettings.currentSession || FOCUS,
              cycle: initialSettings.currentCycle || 1,
              ...initialSettings,
            }
          );

          setCurrentTimerId(timerId);

          updateAppSettings("pomodoro", {
            meta: {
              ...currentAppSettings?.meta,
              currentTimerId: timerId,
              currentSession: initialSettings.currentSession || FOCUS,
              currentCycle: initialSettings.currentCycle || 1,
            },
          });

          await new Promise((resolve) => setTimeout(resolve, 150));

          clearTimeout(timeout);
          setInitializationTimeout(null);
          setIsInitializing(false);
          isInitializedRef.current = true;
        } catch (error) {
          console.error("Failed to initialize Pomodoro timer:", error);
          clearTimeout(timeout);
          setInitializationTimeout(null);
          setIsInitializing(false);
          setRetryCount((prev) => prev + 1);
          isInitializedRef.current = true;
        }
      } else if (currentTimerId && currentTimer) {
        isInitializedRef.current = true;
      } else if (currentTimerId && !currentTimer && retryCount > 2) {
        console.warn("Stale timer ID detected, clearing and retrying");
        setCurrentTimerId(null);
        updateAppSettings("pomodoro", {
          meta: {
            ...currentAppSettings?.meta,
            currentTimerId: null,
          },
        });
      }
    };

    initializeTimer();
  }, [
    currentTimerId,
    currentTimer,
    createTimer,
    initialSettings,
    updateAppSettings,
    currentAppSettings?.meta,
    isInitializing,
    retryCount,
  ]);

  // Get current session info from timer metadata
  const getCurrentSessionInfo = (): SessionInfo => {
    if (!currentTimer?.metadata) return { session: FOCUS, cycle: 1 };
    return {
      session: currentTimer.metadata.session || FOCUS,
      cycle: currentTimer.metadata.cycle || 1,
    };
  };

  const { session, cycle } = getCurrentSessionInfo();
  const progress = currentTimer ? calculateProgress(currentTimer) : 0;

  // Update refs when values change
  useEffect(() => {
    sessionRef.current = session;
    cycleRef.current = cycle;
    settingsRef.current = settings;
  }, [session, cycle, settings]);

  // Update isInitializing ref
  useEffect(() => {
    isInitializingRef.current = isInitializing;
  }, [isInitializing]);

  // Initialize sound effect with current volume setting
  const playAlarmSound = useSoundEffect(
    "/sounds/alarm.mp3",
    settings.alarmVolume
  );

  // Stable playAlarm wrapper that uses the latest sound effect
  const playAlarmSoundRef = useRef(playAlarmSound);
  useEffect(() => {
    playAlarmSoundRef.current = playAlarmSound;
  }, [playAlarmSound]);

  const playAlarm = useCallback(() => {
    playAlarmSoundRef.current();
  }, []);

  // Unified settings update function
  const updateSettings = useCallback(
    (newSettings: Partial<PomodoroSettings>) => {
      const currentSettings = settingsRef.current;
      const updatedSettings = { ...currentSettings, ...newSettings };
      setSettings(updatedSettings);
      updateAppSettings("pomodoro", {
        meta: {
          ...getAppSettings("pomodoro")?.meta,
          ...updatedSettings,
        },
      });
    },
    [updateAppSettings, getAppSettings]
  );

  const updateTimerState = useCallback(
    (timerId: string, session: string, cycle: number) => {
      setCurrentTimerId(timerId);
      updateAppSettings("pomodoro", {
        meta: {
          ...getAppSettings("pomodoro")?.meta,
          currentTimerId: timerId,
          currentSession: session,
          currentCycle: cycle,
        },
      });
    },
    [updateAppSettings, getAppSettings]
  );

  // Request notification permission on component mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch((error) =>
        console.warn("Failed to request notification permission:", error)
      );
    }
  }, []);

  // Cleanup effect for component unmounting
  useEffect(() => {
    return () => {
      isInitializedRef.current = false;
      if (initializationTimeout) {
        clearTimeout(initializationTimeout);
      }
    };
  }, [initializationTimeout]);

  // Unified notification function - stable reference
  const showNotificationRef = useRef<(title: string, body: string) => void>();

  const showNotification = useCallback((title: string, body: string) => {
    const currentSettings = settingsRef.current;

    if (!currentSettings.showNotifications) {
      return;
    }

    // Use Electron's native notification API if available
    if (isElectron() && window.electronAPI?.showNotification) {
      try {
        window.electronAPI.showNotification(title, body);
        return;
      } catch (error) {
        console.error("Failed to show Electron notification:", error);
        // Fall through to browser notification
      }
    }

    // Fallback to browser Notification API
    if (!("Notification" in window)) {
      return;
    }

    try {
      if (Notification.permission === "granted") {
        const notification = new Notification(title, {
          body,
          icon: "/Logopic.png",
          badge: "/Logopic.png",
          tag: "pomodoro-notification",
          requireInteraction: false,
          silent: !currentSettings.soundEnabled,
        });
        setTimeout(() => notification.close(), 5000);
      } else if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted" && showNotificationRef.current) {
            showNotificationRef.current(title, body);
          }
        });
      } else {
        console.log("Notification permission:", Notification.permission);
      }
    } catch (error) {
      console.error("Failed to show notification:", error);
    }
  }, []);

  // Store the stable reference
  useEffect(() => {
    showNotificationRef.current = showNotification;
  }, [showNotification]);

  // Enhanced session end with cleanup
  const handleSessionEnd = useCallback(
    async (isSkipped: boolean = false) => {
      if (!currentTimerRef.current) return;

      // Use refs for values that change frequently
      const currentSession = sessionRef.current;
      const currentCycle = cycleRef.current;
      const currentSettings = settingsRef.current;

      // End session in backend if not already ended (skip already handles this)
      if (!isSkipped && backendSessionIdRef.current) {
        try {
          await endSession({
            sessionId: backendSessionIdRef.current,
          });
          setBackendSessionId(null);
        } catch (error: any) {
          console.error("Failed to end session in backend:", error);
          // Don't show toast here as session is completing naturally
        }
      }

      const sessionName =
        currentSession === FOCUS ? "Focus Session" : currentSession;
      const message =
        currentSession === FOCUS
          ? "Great work! Time for a break!"
          : "Break time is over! Time to focus!";

      // Show transition immediately for instant visual feedback
      setShowTransition(true);
      setTipIdx((prev) => (prev + 1) % TIPS.length);

      // Play sound and show notification (non-blocking)
      if (currentSettings.soundEnabled) {
        playAlarm();
      }

      showNotification(
        "Pomodoro Timer",
        `${sessionName} completed! ${message}`
      );

      // Shorter delay for skip (800ms) vs natural completion (1200ms)
      const transitionDelay = isSkipped ? 200 : 1200;

      setTimeout(() => {
        // Determine next session and cycle
        let nextSession: typeof FOCUS | typeof SHORT_BREAK | typeof LONG_BREAK;
        let nextCycle: number;

        if (currentSession === FOCUS) {
          // After focus session, go to break
          if (currentCycle < POMODORO_CYCLES) {
            nextSession = SHORT_BREAK;
            nextCycle = currentCycle; // Keep same cycle for short break
          } else {
            nextSession = LONG_BREAK;
            nextCycle = currentCycle; // Keep same cycle for long break
          }
        } else if (currentSession === SHORT_BREAK) {
          // After short break, go to next focus session
          nextSession = FOCUS;
          nextCycle = currentCycle + 1; // Increment cycle
        } else {
          // After long break, start new cycle with focus session
          nextSession = FOCUS;
          nextCycle = 1; // Reset to cycle 1 for new pomodoro cycle
        }

        const nextDuration = currentSettings.sessionLengths[nextSession as keyof typeof DEFAULT_SESSION_LENGTHS];
        const autoStart =
          currentSession === FOCUS
            ? currentSettings.autoStartBreaks
            : currentSettings.autoStartPomodoros;

        const newTimerId = createTimer("countdown", "Pomodoro", nextDuration, {
          session: nextSession,
          cycle: nextCycle,
          ...currentSettings,
        });

        updateTimerState(newTimerId, nextSession, nextCycle);

        // Clear backend session ID for new session (will be created on start)
        setBackendSessionId(null);

        if (autoStart) {
          setTimeout(() => {
            startTimer(newTimerId);
          }, 100);
        }

        setShowTransition(false);
      }, transitionDelay);
    },
    [
      // Removed: session, cycle, settings (now using refs)
      createTimer,
      updateTimerState,
      startTimer,
      playAlarm,
      showNotification,
      endSession,
    ]
  );

  // Update the handleSessionEnd ref whenever it changes
  useEffect(() => {
    handleSessionEndRef.current = handleSessionEnd;
  }, [handleSessionEnd]);

  // Handle session end when timer completes
  useEffect(() => {
    if (currentTimer?.isCompleted && !isInitializing) {
      if (handledCompletionTimerIdRef.current !== currentTimer.id) {
        handledCompletionTimerIdRef.current = currentTimer.id;
        handleSessionEndRef.current(false); // Natural completion, not skipped
      }
    }
  }, [currentTimer?.isCompleted, currentTimer?.id, isInitializing]);

  // Load active session from backend on mount
  const loadActiveSession = useCallback(async () => {
    if (isLoadingActiveSession) return;

    try {
      setIsLoadingActiveSession(true);
      const response = await getActiveSession();

      if (response.data.success && response.data.data) {
        const activeSession = response.data.data;
        setBackendSessionId(activeSession._id || activeSession.sessionId);
        setBackendCycleId(activeSession.cycleId);

        // Sync local timer with backend session if needed
        if (
          activeSession.status === "active" &&
          !currentTimerRef.current?.isRunning
        ) {
          // Resume the timer if backend says it's active
          if (currentTimerRef.current) {
            startTimer(currentTimerRef.current.id);
          }
        } else if (
          activeSession.status === "paused" &&
          currentTimerRef.current?.isRunning
        ) {
          // Pause the timer if backend says it's paused
          if (currentTimerRef.current) {
            pauseTimer(currentTimerRef.current.id);
          }
        }
      }
    } catch (error: any) {
      // Silently fail - user might not have an active session
      console.log(
        "No active session found or error loading session:",
        error?.message
      );
    } finally {
      setIsLoadingActiveSession(false);
    }
  }, [getActiveSession, startTimer, pauseTimer, isLoadingActiveSession]);

  // Load active session on mount
  useEffect(() => {
    loadActiveSession();
  }, []);

  const handleStartPause = useCallback(async () => {
    if (!currentTimerRef.current || isInitializingRef.current) return;

    // Debounce: Prevent rapid successive calls
    const now = Date.now();
    const timeSinceLastCall = now - lastStartPauseCallRef.current;
    const DEBOUNCE_DELAY = 300; // 300ms debounce delay

    // If called too soon after last call, ignore
    if (timeSinceLastCall < DEBOUNCE_DELAY) {
      return;
    }

    // If already handling a start/pause, ignore
    if (isHandlingStartPauseRef.current) {
      return;
    }

    // Update last call time
    lastStartPauseCallRef.current = now;
    isHandlingStartPauseRef.current = true;

    const isCurrentlyRunning =
      currentTimerRef.current.isRunning && !currentTimerRef.current.isPaused;
    const currentSession = sessionRef.current;
    const currentCycle = cycleRef.current;
    const currentSettings = settingsRef.current;

    try {
      if (isCurrentlyRunning) {
        // Optimistic UI: Pause immediately
        pauseTimer(currentTimerRef.current.id);

        // Then sync with backend
        if (backendSessionIdRef.current) {
          try {
            await pauseResumeSession({
              sessionId: backendSessionIdRef.current,
              action: "pause",
            });
          } catch (error: any) {
            console.error("Failed to pause session in backend:", error);
            // Rollback optimistic update
            startTimer(currentTimerRef.current.id);
            toast({
              title: "Warning",
              description:
                "Timer paused locally, but failed to sync with server. Reverted to running state.",
              variant: "destructive",
            });
          }
        }
      } else {
        // Optimistic UI: Start timer immediately
        startTimer(currentTimerRef.current.id);

        // Then sync with backend
        if (!backendSessionIdRef.current) {
          // Create new session
          const sessionType = currentSession === FOCUS ? "work" : "break";
          const plannedDuration =
            currentSettings.sessionLengths[
            currentSession as keyof typeof DEFAULT_SESSION_LENGTHS
            ];

          // Calculate pomoNumber based on cycle
          const pomoNumber = currentSession === FOCUS ? currentCycle : 1;

          try {
            const response = await createSession({
              cycleId: backendCycleIdRef.current || undefined,
              pomoNumber,
              type: sessionType as "work" | "break",
              plannedDuration: Math.floor(plannedDuration / 60), // Convert to minutes
              metadata: {
                session: currentSession,
                cycle: currentCycle,
              },
            });

            if (response.data.success && response.data.data) {
              const newSession = response.data.data;
              setBackendSessionId(newSession._id || newSession.sessionId);
              if (newSession.cycleId) {
                setBackendCycleId(newSession.cycleId);
              }
            }
          } catch (error: any) {
            console.error("Failed to create session in backend:", error);
            // Rollback optimistic update
            pauseTimer(currentTimerRef.current.id);
            toast({
              title: "Warning",
              description:
                "Timer started locally, but failed to sync with server. Reverted to paused state.",
              variant: "destructive",
            });
          }
        } else {
          // Resume existing session
          try {
            await pauseResumeSession({
              sessionId: backendSessionIdRef.current,
              action: "resume",
            });
          } catch (error: any) {
            console.error("Failed to resume session in backend:", error);
            // Rollback optimistic update
            pauseTimer(currentTimerRef.current.id);
            toast({
              title: "Warning",
              description:
                "Timer resumed locally, but failed to sync with server. Reverted to paused state.",
              variant: "destructive",
            });
          }
        }
      }
    } catch (error: any) {
      console.error("Error in handleStartPause:", error);
      // Rollback based on current state
      const shouldBeRunning = !isCurrentlyRunning;
      if (shouldBeRunning) {
        pauseTimer(currentTimerRef.current.id);
      } else {
        startTimer(currentTimerRef.current.id);
      }
      toast({
        title: "Error",
        description: "Failed to start/pause timer. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Always clear the execution flag
      isHandlingStartPauseRef.current = false;
    }
  }, [startTimer, pauseTimer, createSession, pauseResumeSession, toast]);

  const handleReset = useCallback(() => {
    if (!currentTimerRef.current || isInitializingRef.current) return;
    resetTimer(currentTimerRef.current.id);
  }, [resetTimer]);

  const handleResetSettings = useCallback(() => {
    const defaultSettings = {
      sessionLengths: DEFAULT_SESSION_LENGTHS,
      autoStartBreaks: false,
      autoStartPomodoros: false,
      soundEnabled: true,
      showNotifications: true,
      musicWhileFocusing: false,
      alarmVolume: 0.7,
      currentTimerId: null,
      currentSession: FOCUS,
      currentCycle: 1,
    };

    setSettings(defaultSettings);
    updateSettings(defaultSettings);

    if (currentTimerRef.current) {
      updateTimer(currentTimerRef.current.id, {
        duration: DEFAULT_SESSION_LENGTHS[FOCUS],
        currentTime: DEFAULT_SESSION_LENGTHS[FOCUS],
        metadata: {
          session: FOCUS,
          cycle: 1,
          ...defaultSettings,
        },
      });
    }

    setCurrentTimerId(null);
  }, [updateSettings, updateTimer]);

  const handleSkip = useCallback(async () => {
    if (!currentTimerRef.current || isInitializingRef.current) return;

    // End session in backend
    if (backendSessionIdRef.current) {
      try {
        await endSession({
          sessionId: backendSessionIdRef.current,
        });
        // Clear backend session ID after ending
        setBackendSessionId(null);
      } catch (error: any) {
        console.error("Failed to end session in backend:", error);
        toast({
          title: "Warning",
          description:
            "Session skipped locally, but failed to sync with server",
          variant: "destructive",
        });
      }
    }

    stopTimer(currentTimerRef.current.id);
    // Pass true to indicate this is a skip for faster transition
    handleSessionEndRef.current(true);
  }, [stopTimer, endSession, toast]);

  const handleSessionLengthChange = useCallback(
    (sessionType: string, minutes: number) => {
      if (isInitializingRef.current) return;

      const currentSettings = settingsRef.current;
      const currentSession = sessionRef.current;

      const newLengths = {
        ...currentSettings.sessionLengths,
        [sessionType]: minutes * 60,
      };
      const newSettings = { ...currentSettings, sessionLengths: newLengths };

      setSettings(newSettings);
      updateSettings(newSettings);

      if (currentTimerRef.current && currentSession === sessionType) {
        updateTimer(currentTimerRef.current.id, {
          duration: minutes * 60,
          currentTime: minutes * 60,
          metadata: {
            ...currentTimerRef.current.metadata,
            sessionLengths: newLengths,
          },
        });
      }
    },
    [updateTimer, updateSettings]
  );

  const getNextSessionInfo = useCallback((): NextSessionInfo => {
    if (session === FOCUS) {
      const nextSession = cycle < POMODORO_CYCLES ? SHORT_BREAK : LONG_BREAK;
      return {
        name: nextSession,
        duration: `${Math.floor(
          settings.sessionLengths[nextSession] / 60
        )} min`,
      };
    }
    return {
      name: FOCUS,
      duration: `${Math.floor(settings.sessionLengths[FOCUS] / 60)} min`,
    };
  }, [session, cycle, settings.sessionLengths]);

  const nextSession = getNextSessionInfo();

  const openNotificationSettings = useCallback(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "notifications" });
    }
    alert(
      "To enable notifications:\n\n" +
      "1. Click the lock/info icon in your browser's address bar\n" +
      '2. Find "Notifications" or "Site permissions"\n' +
      '3. Change from "Block" to "Allow"\n' +
      "4. Refresh this page\n\n" +
      "Or try opening this site in a regular (non-incognito) window."
    );
  }, []);

  // App Schema for InteractApp
  const appSchema: AppSchema = useMemo(() => {
    return {
      id: "hypercho-pomodoro",
      name: "Pomodoro Timer",
      sidebar: {
        sections: [
          {
            id: "timer-controls",
            items: [
              {
                id: "focus-session",
                title: "Focus Session",
                icon: Timer,
                isActive: session === FOCUS,
                onClick: () => {
                  // Switch to focus session
                  if (currentTimerRef.current) {
                    const newTimerId = createTimer(
                      "countdown",
                      "Pomodoro",
                      settings.sessionLengths[FOCUS],
                      {
                        session: FOCUS,
                        cycle: cycle,
                        ...settings,
                      }
                    );
                    updateTimerState(newTimerId, FOCUS, cycle);
                  }
                },
              },
              {
                id: "short-break",
                title: "Short Break",
                icon: Coffee,
                isActive: session === SHORT_BREAK,
                onClick: () => {
                  if (currentTimerRef.current) {
                    const newTimerId = createTimer(
                      "countdown",
                      "Pomodoro",
                      settings.sessionLengths[SHORT_BREAK],
                      {
                        session: SHORT_BREAK,
                        cycle: cycle,
                        ...settings,
                      }
                    );
                    updateTimerState(newTimerId, SHORT_BREAK, cycle);
                  }
                },
              },
              {
                id: "long-break",
                title: "Long Break",
                icon: Coffee,
                isActive: session === LONG_BREAK,
                onClick: () => {
                  if (currentTimerRef.current) {
                    const newTimerId = createTimer(
                      "countdown",
                      "Pomodoro",
                      settings.sessionLengths[LONG_BREAK],
                      {
                        session: LONG_BREAK,
                        cycle: cycle,
                        ...settings,
                      }
                    );
                    updateTimerState(newTimerId, LONG_BREAK, cycle);
                  }
                },
              },
            ],
          },
          {
            id: "quick-actions",
            title: "Quick Actions",
            items: [
              {
                id: "start-pause",
                title:
                  isTimerRunning && !currentTimerRef.current?.isPaused
                    ? "Pause"
                    : "Start",
                icon:
                  isTimerRunning && !currentTimerRef.current?.isPaused
                    ? Pause
                    : Play,
                onClick: handleStartPause,
              },
              {
                id: "reset",
                title: "Reset",
                icon: RotateCcw,
                onClick: handleReset,
              },
              {
                id: "skip",
                title: "Skip",
                icon: SkipForward,
                onClick: handleSkip,
              },
            ],
          },
        ],
        footer: [
          {
            id: "pomodoro-footer",
            items: [
              {
                id: "settings",
                title: "Settings",
                icon: Settings,
                onClick: () => {
                  // Settings will be handled in the main component
                },
              },
            ],
          },
        ],
      },
    };
  }, [
    session,
    cycle,
    isTimerRunning,
    settings,
    createTimer,
    updateTimerState,
    handleStartPause,
    handleReset,
    handleSkip,
  ]);

  const value: PomodoroContextValue = useMemo(
    () => ({
      // State
      showTransition,
      tipIdx,
      settings,
      currentTimerId,
      isInitializing,
      retryCount,
      currentTimer,
      isTimerRunning,
      isTimerExists,
      session,
      cycle,
      progress,
      nextSession,

      // Actions
      handleStartPause,
      handleReset,
      handleSkip,
      handleSessionLengthChange,
      handleResetSettings,
      updateSettings,
      showNotification,
      openNotificationSettings,

      // App Schema
      appSchema,
    }),
    [
      showTransition,
      tipIdx,
      settings,
      currentTimerId,
      isInitializing,
      retryCount,
      currentTimer,
      isTimerRunning,
      session,
      cycle,
      progress,
      nextSession,
      isTimerExists,
      handleStartPause,
      handleReset,
      handleSkip,
      handleSessionLengthChange,
      handleResetSettings,
      updateSettings,
      showNotification,
      openNotificationSettings,
      appSchema,
    ]
  );

  return (
    <PomodoroContext.Provider value={value}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const context = useContext(PomodoroContext);
  if (context === undefined) {
    throw new Error("usePomodoro must be used within a PomodoroProvider");
  }
  return context;
}
