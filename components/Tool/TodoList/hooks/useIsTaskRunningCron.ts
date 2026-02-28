"use client";

import { useState, useEffect } from "react";
import {
  getPendingTaskCronRuns,
  subscribeToPendingTaskCronRuns,
} from "$/lib/task-cron-run-store";

/**
 * Returns true when the task is in progress and the agent is currently running it (cron run pending).
 * Subscribes to the store so the component re-renders when the run finishes.
 */
export function useIsTaskRunningCron(taskId: string): boolean {
  const [pending, setPending] = useState<Record<string, { jobId: string; startedAtMs: number }>>(
    () => getPendingTaskCronRuns()
  );
  useEffect(() => {
    return subscribeToPendingTaskCronRuns(setPending);
  }, []);
  return Boolean(taskId && pending[taskId]);
}
