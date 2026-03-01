"use client";

import { useEffect, useRef, useCallback } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  getPendingTaskCronRuns,
  removePendingTaskCronRun,
  subscribeToPendingTaskCronRuns,
} from "$/lib/task-cron-run-store";
import { removeRunningJobIds } from "$/lib/crons-running-store";
import type { CronRunRecord } from "$/types/electron";

const POLL_MS = 10_000;
const WINDOW_BEFORE_MS = 10_000;
const WINDOW_AFTER_MS = 300_000;

export type CronTaskRunStatus = "ok" | "error";

/**
 * Polls for pending task cron runs (one-shot jobs created when moving a task to In Progress).
 * When a run finishes: calls onRunFinished(taskId, status); moves task to Done (ok) or Review (error) via that callback.
 */
export function useCronTaskStatusPoll(
  onRunFinished: (taskId: string, status: CronTaskRunStatus) => void
) {
  const onRunFinishedRef = useRef(onRunFinished);
  onRunFinishedRef.current = onRunFinished;

  const checkPending = useCallback(async () => {
    const pending = getPendingTaskCronRuns();
    const entries = Object.entries(pending);
    if (entries.length === 0) return;

    for (const [taskId, { jobId, startedAtMs }] of entries) {
      try {
        const result = (await bridgeInvoke("get-cron-runs-for-job", {
          jobId,
          limit: 5,
          offset: 0,
        })) as { runs?: CronRunRecord[] };
        const runs = Array.isArray(result?.runs) ? result.runs : [];
        const latest = runs[0];
        if (!latest) continue;

        const runAtMs = latest.runAtMs ?? 0;
        const isOurs =
          runAtMs >= startedAtMs - WINDOW_BEFORE_MS &&
          runAtMs <= startedAtMs + WINDOW_AFTER_MS;

        if (isOurs && String(latest.action) === "finished") {
          const status: CronTaskRunStatus =
            latest.status === "error" ? "error" : "ok";
          onRunFinishedRef.current(taskId, status);
          removePendingTaskCronRun(taskId);
          removeRunningJobIds([jobId]);
        }
      } catch {
        // ignore per-job errors, will retry next poll
      }
    }
  }, []);

  useEffect(() => {
    const intervalId = setInterval(checkPending, POLL_MS);
    checkPending();
    return () => clearInterval(intervalId);
  }, [checkPending]);

  // Re-run check when pending map changes (new task added)
  useEffect(() => {
    return subscribeToPendingTaskCronRuns(() => {
      checkPending();
    });
  }, [checkPending]);
}
