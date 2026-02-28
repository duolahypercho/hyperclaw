/**
 * Tracks task IDs that are waiting on a cron run (one-shot job created when task moved to In Progress).
 * When the run finishes, the poll in useCronTaskStatusPoll moves the task to Done (ok) or Review (error).
 */

const STORAGE_KEY = "hyperclaw-task-cron-run";
const EVENT_NAME = "hyperclaw-task-cron-run-changed";

export interface PendingTaskCronRun {
  jobId: string;
  startedAtMs: number;
}

function read(): Record<string, PendingTaskCronRun> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, PendingTaskCronRun> = {};
    for (const [taskId, v] of Object.entries(parsed)) {
      if (
        typeof taskId === "string" &&
        v &&
        typeof v === "object" &&
        typeof (v as PendingTaskCronRun).jobId === "string" &&
        typeof (v as PendingTaskCronRun).startedAtMs === "number"
      ) {
        out[taskId] = v as PendingTaskCronRun;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: Record<string, PendingTaskCronRun>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: map }));
  } catch {}
}

export function getPendingTaskCronRuns(): Record<string, PendingTaskCronRun> {
  return read();
}

export function addPendingTaskCronRun(
  taskId: string,
  jobId: string
): void {
  const map = read();
  map[taskId] = { jobId, startedAtMs: Date.now() };
  write(map);
}

export function removePendingTaskCronRun(taskId: string): void {
  const map = read();
  delete map[taskId];
  write(map);
}

export function subscribeToPendingTaskCronRuns(
  callback: (map: Record<string, PendingTaskCronRun>) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback(read());
  window.addEventListener(EVENT_NAME, handler);
  callback(read());
  return () => window.removeEventListener(EVENT_NAME, handler);
}
