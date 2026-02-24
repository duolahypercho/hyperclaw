import { useState, useMemo, useEffect, useRef } from "react";
import { useProactive } from "@OS/AI/core/hook/use-proactive";
import { Task } from "../types";
import { useMusicPlayer } from "$/components/Tool/Music/MusicPlayer/providers/musicProvider";
import { useTimer } from "$/Providers/TimerProv";

// Centralized throttle storage management
const THROTTLE_STORAGE_KEY = "todo_proactive_throttles";

interface OverdueTaskNotification {
  count: number; // How many times we've notified about this task (max 3)
  lastNotificationTime: number; // Last time we notified about this task
}

interface ThrottleStorage {
  completed: Record<string, number>; // taskId -> timestamp
  startedWorking: Record<string, number>; // taskId -> timestamp
  allCompleted: number | null; // timestamp
  overdue: number | null; // timestamp
  notifiedOverdueTaskIds: Record<string, OverdueTaskNotification>; // taskId -> notification info
}

function getThrottleStorage(): ThrottleStorage {
  try {
    const stored = sessionStorage.getItem(THROTTLE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // Ignore parse errors
  }
  return {
    completed: {},
    startedWorking: {},
    allCompleted: null,
    overdue: null,
    notifiedOverdueTaskIds: {}, // taskId -> { count: number, lastNotificationTime: number }
  };
}

function setThrottleStorage(storage: ThrottleStorage): void {
  try {
    sessionStorage.setItem(THROTTLE_STORAGE_KEY, JSON.stringify(storage));
  } catch (e) {
    // Ignore storage errors
  }
}

function checkThrottle(
  category: "completed" | "startedWorking" | "allCompleted" | "overdue",
  identifier: string | null,
  currentTimestamp: number,
  throttleMinutes: number
): boolean {
  const storage = getThrottleStorage();
  let lastNotificationTime: number | null = null;

  if (category === "completed" || category === "startedWorking") {
    if (!identifier) return false;
    lastNotificationTime = storage[category][identifier] || null;
  } else {
    lastNotificationTime = storage[category];
  }

  if (lastNotificationTime === null) {
    // No previous notification, allow it
    return true;
  }

  const timeSinceLastNotification =
    (currentTimestamp - lastNotificationTime) / (1000 * 60); // minutes

  return timeSinceLastNotification >= throttleMinutes;
}

function updateThrottle(
  category: "completed" | "startedWorking" | "allCompleted" | "overdue",
  identifier: string | null,
  timestamp: number
): void {
  const storage = getThrottleStorage();

  if (category === "completed" || category === "startedWorking") {
    if (!identifier) return;
    storage[category][identifier] = timestamp;
  } else {
    (storage[category] as number | null) = timestamp;
  }

  setThrottleStorage(storage);
}

interface UseTodoListProactiveProps {
  tasks: Task[];
  loading: boolean;
}

interface ProactiveSetters {
  setNewlyCompletedTask: (
    task: { taskId: string; timestamp: number } | null
  ) => void;
  setJustCompletedAllTasks: (
    task: { taskCount: number; timestamp: number } | null
  ) => void;
  setJustStartedWorking: (
    task: { taskId: string; timestamp: number } | null
  ) => void;
}

export function useTodoListProactive({
  tasks,
  loading,
}: UseTodoListProactiveProps): ProactiveSetters {
  // Cross-tool integrations (hooks must be called unconditionally)
  const timerState = useTimer();

  // State to track completion events triggered from handleStatusChange
  const [newlyCompletedTask, setNewlyCompletedTask] = useState<{
    taskId: string;
    timestamp: number;
  } | null>(null);
  const [justCompletedAllTasks, setJustCompletedAllTasks] = useState<{
    taskCount: number;
    timestamp: number;
  } | null>(null);
  const [justStartedWorking, setJustStartedWorking] = useState<{
    taskId: string;
    timestamp: number;
  } | null>(null);

  // Scenario 1: No tasks in todo list (once per day)
  // Track previous state value and condition to prevent toggling during loading
  const STORAGE_KEY_EMPTY = "todo_notified_empty";
  const previousEmptyStateValueRef = useRef<string | null>(null);
  const previousEmptyConditionRef = useRef<boolean>(false);
  const hasInitializedRef = useRef<boolean>(false);

  // Initialize from localStorage on mount (database sync happens in useProactive)
  // This is just for local state management during loading
  useEffect(() => {
    if (!hasInitializedRef.current) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_EMPTY);
        if (stored) {
          previousEmptyStateValueRef.current = stored;
        }
      } catch {
        // Ignore storage errors
      }
      hasInitializedRef.current = true;
    }
  }, []);

  const isEmptyTasks = useMemo(() => {
    if (loading) {
      // When loading, return previous condition to prevent toggling
      return previousEmptyConditionRef.current;
    }
    const isEmpty = tasks.length === 0;
    previousEmptyConditionRef.current = isEmpty;
    return isEmpty;
  }, [tasks.length, loading]);

  // Include current date in state value so each day is treated as new
  // Check sessionStorage first to prevent duplicate notifications on page reload
  const emptyTasksStateValue = useMemo(() => {
    if (loading) {
      // When loading, return previous state value to prevent toggling
      return previousEmptyStateValueRef.current;
    }

    if (tasks.length === 0) {
      const today = new Date().toDateString(); // e.g., "Mon Jan 15 2024"
      const stateValue = `empty_${today}`;

      // Check if we've already notified for today by checking localStorage
      // Database sync happens in useProactive hook, so we check localStorage first (fast path)
      // This prevents duplicate notifications when the page reloads or browser reopens
      try {
        const stored = localStorage.getItem(STORAGE_KEY_EMPTY);
        if (stored === stateValue) {
          // We've already notified for today, return the stored value
          // This ensures useProactive sees the same state value and doesn't notify again
          previousEmptyStateValueRef.current = stateValue;
          return stateValue;
        }
      } catch {
        // Ignore storage errors
      }

      // First time seeing empty tasks today, return new state value
      previousEmptyStateValueRef.current = stateValue;
      return stateValue;
    }

    // Tasks exist, clear the state value
    previousEmptyStateValueRef.current = null;
    return null;
  }, [tasks.length, loading]);

  // Memoize the message to prevent duplicate notifications
  const emptyTasksMessage = useMemo(() => {
    // Format today's date with time for more precision (e.g., "Mon Jan 15 2024, 10:30 AM")
    return `User doesn't have any goals at all. Help him to get his day stared by asking them what needs to be done today or create a new goal to get started?`;
  }, [emptyTasksStateValue]); // Only change when the date changes

  useProactive(
    isEmptyTasks,
    emptyTasksMessage,
    STORAGE_KEY_EMPTY,
    emptyTasksStateValue, // State value: "empty_Mon Jan 15 2024" (changes each day)
    [emptyTasksStateValue],
    true, // Use localStorage to persist across browser sessions (once per day)
    true // Use database storage for cross-device sync and reliability
  );

  // Scenario 2: Overdue tasks - only notify when tasks FIRST become overdue
  // Track previous overdue task IDs to detect when tasks cross the due date threshold
  const [shouldNotifyOverdue, setShouldNotifyOverdue] = useState(false);
  // Use ref instead of state to prevent infinite loops (we don't need re-renders when this changes)
  const previousOverdueTaskIdsRef = useRef<Set<string>>(new Set());

  const overdueTaskIds = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.dueDate &&
            new Date(t.dueDate) < new Date() &&
            t.status !== "completed"
        )
        .map((t) => t._id)
        .sort()
        .join(","),
    [tasks]
  );

  // Track when tasks actually become overdue (not just if they're currently overdue)
  // Allow up to 3 notifications per task with time gaps between them
  useEffect(() => {
    if (!overdueTaskIds || overdueTaskIds.length === 0) {
      setShouldNotifyOverdue(false);
      previousOverdueTaskIdsRef.current = new Set();
      return;
    }

    const storage = getThrottleStorage();
    const currentIds = new Set(overdueTaskIds.split(",").filter(Boolean));
    const now = Date.now();

    // Time gap between notifications for the same task (30 minutes)
    const TIME_GAP_MINUTES = 30;
    // Maximum number of notifications per task
    const MAX_NOTIFICATIONS = 3;
    // Global throttle between any overdue notifications (5 minutes)
    const GLOBAL_THROTTLE_MINUTES = 5;

    // Find tasks that need notification:
    // Only notify when a task FIRST becomes overdue (transitions from not-overdue to overdue)
    // This includes:
    // 1. Tasks that just became overdue (weren't overdue before)
    // 2. Tasks that were completed and then uncompleted (becoming overdue again)
    const tasksToNotify: string[] = [];

    for (const taskId of currentIds) {
      // Only check tasks that JUST became overdue (weren't in previous set)
      const isNewlyOverdue = !previousOverdueTaskIdsRef.current.has(taskId);

      if (!isNewlyOverdue) {
        // Task was already overdue, skip it (nothing changed)
        continue;
      }

      // Task just became overdue - check if we can notify
      const notificationInfo = storage.notifiedOverdueTaskIds[taskId];

      if (!notificationInfo) {
        // First time seeing this task as overdue - can notify
        tasksToNotify.push(taskId);
      } else {
        // Task was overdue before, user completed it, then uncompleted it (becoming overdue again)
        // Check if we haven't exceeded limit and enough time has passed
        const timeSinceLastNotification =
          (now - notificationInfo.lastNotificationTime) / (1000 * 60); // minutes

        if (
          notificationInfo.count < MAX_NOTIFICATIONS &&
          timeSinceLastNotification >= TIME_GAP_MINUTES
        ) {
          tasksToNotify.push(taskId);
        }
        // If count >= 3 or time gap not met, don't notify (user probably won't do it)
      }
    }

    // If no tasks need notification, don't notify
    if (tasksToNotify.length === 0) {
      setShouldNotifyOverdue(false);
      previousOverdueTaskIdsRef.current = currentIds;
      return;
    }

    // Check global throttle: only notify if enough time has passed since last notification
    if (!checkThrottle("overdue", null, now, GLOBAL_THROTTLE_MINUTES)) {
      // Still within global throttle window, don't notify
      setShouldNotifyOverdue(false);
      previousOverdueTaskIdsRef.current = currentIds;
      return;
    }

    // Update notification info for tasks we're about to notify about
    tasksToNotify.forEach((taskId) => {
      const notificationInfo = storage.notifiedOverdueTaskIds[taskId];

      if (notificationInfo) {
        // Increment count and update timestamp
        notificationInfo.count += 1;
        notificationInfo.lastNotificationTime = now;
      } else {
        // First notification for this task
        storage.notifiedOverdueTaskIds[taskId] = {
          count: 1,
          lastNotificationTime: now,
        };
      }
    });

    setThrottleStorage(storage);

    // Update global throttle timestamp and allow notification
    updateThrottle("overdue", null, now);
    previousOverdueTaskIdsRef.current = currentIds;
    setShouldNotifyOverdue(true);
  }, [overdueTaskIds]);

  // Track previous overdue state value and condition to prevent toggling during loading
  const previousOverdueStateValueRef = useRef<string | null>(null);
  const previousOverdueConditionRef = useRef<boolean>(false);

  const hasOverdue = useMemo(() => {
    if (loading) {
      // When loading, return previous condition to prevent toggling
      return previousOverdueConditionRef.current;
    }
    const hasOverdueTasks = overdueTaskIds.length > 0 && shouldNotifyOverdue;
    previousOverdueConditionRef.current = hasOverdueTasks;
    return hasOverdueTasks;
  }, [overdueTaskIds.length, shouldNotifyOverdue, loading, overdueTaskIds]);

  // Only use overdueTaskIds as state value when not loading to prevent toggling
  // Return previous state value when loading to maintain stability
  const overdueStateValue = useMemo(() => {
    if (loading) {
      // When loading, return previous state value to prevent toggling
      return previousOverdueStateValueRef.current;
    }
    const stateValue = overdueTaskIds.length > 0 ? overdueTaskIds : null;
    previousOverdueStateValueRef.current = stateValue;
    return stateValue;
  }, [overdueTaskIds, loading]);

  useProactive(
    hasOverdue,
    "User has overdue goals. Help him to prioritize and finish them?",
    "todo_notified_overdue",
    overdueStateValue, // State value: "id1,id2,id3" or null when loading
    [overdueStateValue]
  );

  // Scenario 4: User completed a task - celebrate their achievement!
  // Add time-based throttling to prevent repeated notifications when toggling
  const [shouldNotifyCompleted, setShouldNotifyCompleted] = useState(false);

  const completedTaskStateValue = useMemo(
    () =>
      newlyCompletedTask
        ? `${newlyCompletedTask.taskId}_${newlyCompletedTask.timestamp}`
        : null,
    [newlyCompletedTask]
  );

  // Throttling check: only allow notification if enough time has passed
  useEffect(() => {
    if (!newlyCompletedTask) {
      setShouldNotifyCompleted(false);
      return;
    }

    const taskId = newlyCompletedTask.taskId;
    const timestamp = newlyCompletedTask.timestamp;
    const THROTTLE_MINUTES = 5; // Don't notify again for same task within 5 minutes

    // Check if we should throttle this notification
    if (!checkThrottle("completed", taskId, timestamp, THROTTLE_MINUTES)) {
      // Still within throttle window, don't notify
      setShouldNotifyCompleted(false);
      return;
    }

    // Update throttle timestamp and allow notification
    updateThrottle("completed", taskId, timestamp);
    setShouldNotifyCompleted(true);
  }, [newlyCompletedTask]);

  const completedCondition = useMemo(
    () =>
      !!newlyCompletedTask &&
      !!completedTaskStateValue &&
      shouldNotifyCompleted &&
      !loading,
    [
      newlyCompletedTask,
      completedTaskStateValue,
      shouldNotifyCompleted,
      loading,
    ]
  );

  const completedMessage = useMemo(
    () =>
      `User just completed goal id of "${newlyCompletedTask?.taskId}". Celebrate their achievement, be sure to congratulate them! Also ask him for next goal to work on`,
    [newlyCompletedTask?.taskId]
  );

  useProactive(
    completedCondition,
    completedMessage,
    "todo_notified_completed",
    completedTaskStateValue,
    [completedTaskStateValue, loading]
  );

  // Clear the state after notification is sent
  useEffect(() => {
    if (completedTaskStateValue) {
      // Clear after a short delay to ensure notification is sent
      const timer = setTimeout(() => {
        setNewlyCompletedTask(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [completedTaskStateValue]);

  // Scenario 5: User has no active tasks (only completed tasks exist)
  // Add time-based throttling to prevent repeated notifications
  const [shouldNotifyAllCompleted, setShouldNotifyAllCompleted] =
    useState(false);

  const onlyCompletedTasksStateValue = useMemo(
    () =>
      justCompletedAllTasks
        ? `just_completed_all_${justCompletedAllTasks.taskCount}_${justCompletedAllTasks.timestamp}`
        : null,
    [justCompletedAllTasks]
  );

  // Throttling check: only allow notification if enough time has passed
  useEffect(() => {
    if (!justCompletedAllTasks) {
      setShouldNotifyAllCompleted(false);
      return;
    }

    const timestamp = justCompletedAllTasks.timestamp;
    const THROTTLE_MINUTES = 10; // Don't notify again within 10 minutes

    // Check if we should throttle this notification
    if (!checkThrottle("allCompleted", null, timestamp, THROTTLE_MINUTES)) {
      // Still within throttle window, don't notify
      setShouldNotifyAllCompleted(false);
      return;
    }

    // Update throttle timestamp and allow notification
    updateThrottle("allCompleted", null, timestamp);
    setShouldNotifyAllCompleted(true);
  }, [justCompletedAllTasks]);

  const allCompletedCondition = useMemo(
    () =>
      !!justCompletedAllTasks &&
      !!onlyCompletedTasksStateValue &&
      shouldNotifyAllCompleted &&
      !loading,
    [
      justCompletedAllTasks,
      onlyCompletedTasksStateValue,
      shouldNotifyAllCompleted,
      loading,
    ]
  );

  useProactive(
    allCompletedCondition,
    "User has completed all their goals! Be sure to congratulate them! Help them plan what to do next or create new goals to keep the momentum going.",
    "todo_notified_only_completed",
    onlyCompletedTasksStateValue,
    [onlyCompletedTasksStateValue, loading]
  );

  // Clear the state after notification is sent
  useEffect(() => {
    if (onlyCompletedTasksStateValue) {
      // Clear after a short delay to ensure notification is sent
      const timer = setTimeout(() => {
        setJustCompletedAllTasks(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [onlyCompletedTasksStateValue]);

  // Scenario 6: Tasks due soon (within 2-4 hours)
  const tasksDueSoon = useMemo(
    () =>
      tasks.filter((t) => {
        if (!t.dueDate || t.status === "completed") return false;
        const dueDate = new Date(t.dueDate);
        const now = new Date();
        const hoursUntilDue =
          (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        // Tasks due within 2-4 hours
        const isDueSoon = hoursUntilDue > 0 && hoursUntilDue <= 4;

        // Exclude tasks created within the last 5 minutes (user just added them)
        const createdAt = new Date(t.createdAt);
        const minutesSinceCreation =
          (now.getTime() - createdAt.getTime()) / (1000 * 60);
        const isRecentlyAdded = minutesSinceCreation < 5;

        return isDueSoon && !isRecentlyAdded;
      }),
    [tasks]
  );
  const tasksDueSoonIds = useMemo(
    () =>
      tasksDueSoon
        .map((t) => t._id)
        .sort()
        .join(","),
    [tasksDueSoon]
  );
  const hasTasksDueSoon = useMemo(
    () => tasksDueSoon.length > 0 && !loading,
    [tasksDueSoon.length, loading]
  );
  useProactive(
    hasTasksDueSoon,
    `User has ${tasksDueSoon.length} goal${tasksDueSoon.length > 1 ? "s" : ""
    } due within the next few hours. Remember to remind them to work on them and ask them what they need to do next.`,
    "todo_notified_due_soon",
    tasksDueSoonIds,
    [tasksDueSoonIds, loading]
  );

  // Scenario 7: Multiple tasks due today (3+ tasks)
  const dueTodayTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (!t.dueDate || t.status === "completed") return false;
        const due = new Date(t.dueDate);
        const isDueToday = due.toDateString() === new Date().toDateString();

        // Exclude tasks created within the last 5 minutes (user just added them)
        const now = new Date();
        const createdAt = new Date(t.createdAt);
        const minutesSinceCreation =
          (now.getTime() - createdAt.getTime()) / (1000 * 60);
        const isRecentlyAdded = minutesSinceCreation < 5;

        return isDueToday && !isRecentlyAdded;
      }),
    [tasks]
  );
  const hasManyDueToday = useMemo(
    () => dueTodayTasks.length >= 3 && !loading,
    [dueTodayTasks.length, loading]
  );
  const dueTodayTaskIds = useMemo(
    () =>
      dueTodayTasks
        .map((t) => t._id)
        .sort()
        .join(","),
    [dueTodayTasks]
  );
  useProactive(
    hasManyDueToday,
    `User has ${dueTodayTasks.length} goals due today. Remember to remind them to work on them and ask them what they need to do next.`,
    "todo_notified_many_due_today",
    dueTodayTaskIds,
    [dueTodayTaskIds, loading]
  );

  // Scenario 9: Combined "started working" message with pomodoro suggestions
  // Check if any timer is running (pomodoro or otherwise)
  const runningTimers = useMemo(
    () =>
      timerState?.timers?.filter((t: any) => t.isRunning && !t.isPaused) || [],
    [timerState?.timers]
  );
  const isPomodoroRunning = runningTimers.length > 0;

  // Build combined message with relevant suggestions
  const startedWorkingMessage = useMemo(() => {
    if (!justStartedWorking) return "";

    const taskId = justStartedWorking.taskId;
    const suggestions: string[] = [];

    // Base message
    suggestions.push(
      `User just started working on goal id of "${taskId}". Help them make progress and get a clear mind on this goal.`
    );
    return suggestions.join(" ");
  }, [justStartedWorking, timerState, isPomodoroRunning]);

  // Add time-based throttling to prevent repeated notifications when toggling
  const [shouldNotifyStartedWorking, setShouldNotifyStartedWorking] =
    useState(false);

  const startedWorkingStateValue = useMemo(
    () =>
      justStartedWorking
        ? `started_working_${justStartedWorking.taskId}_${justStartedWorking.timestamp}`
        : null,
    [justStartedWorking]
  );

  // Throttling check: only allow notification if enough time has passed
  useEffect(() => {
    if (!justStartedWorking) {
      setShouldNotifyStartedWorking(false);
      return;
    }

    const taskId = justStartedWorking.taskId;
    const timestamp = justStartedWorking.timestamp;
    const THROTTLE_MINUTES = 5; // Don't notify again for same task within 5 minutes

    // Check if we should throttle this notification
    if (!checkThrottle("startedWorking", taskId, timestamp, THROTTLE_MINUTES)) {
      // Still within throttle window, don't notify
      setShouldNotifyStartedWorking(false);
      return;
    }

    // Update throttle timestamp and allow notification
    updateThrottle("startedWorking", taskId, timestamp);
    setShouldNotifyStartedWorking(true);
  }, [justStartedWorking]);

  const startedWorkingCondition = useMemo(
    () =>
      Boolean(
        justStartedWorking &&
        !!startedWorkingStateValue &&
        shouldNotifyStartedWorking &&
        !loading
      ),
    [
      justStartedWorking,
      startedWorkingStateValue,
      shouldNotifyStartedWorking,
      loading,
    ]
  );

  useProactive(
    startedWorkingCondition,
    startedWorkingMessage,
    "todo_notified_started_working",
    startedWorkingStateValue,
    [startedWorkingStateValue, loading]
  );

  // Clear the state after notification is sent
  useEffect(() => {
    if (startedWorkingStateValue) {
      const timer = setTimeout(() => {
        setJustStartedWorking(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [startedWorkingStateValue]);

  // Return setters for use in handleStatusChange
  return {
    setNewlyCompletedTask,
    setJustCompletedAllTasks,
    setJustStartedWorking,
  };
}
