/**
 * Running cron job IDs + one map: jobId → startedAtMs (when we triggered "Run now").
 * Poll matches latest run by runAtMs close to startedAtMs; remove when that run is finished.
 */

const IDS_KEY = "hyperclaw-crons-running";
const STARTED_AT_KEY = "hyperclaw-crons-running-started-at";
const EVENT_NAME = "hyperclaw-crons-running-changed";

const DEBUG = typeof window !== "undefined" && (window as unknown as { __CRONS_RUNNING_DEBUG?: boolean }).__CRONS_RUNNING_DEBUG !== false;
function debugLog(...args: unknown[]) {
  if (DEBUG) console.log("[crons-running-store]", ...args);
}

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(IDS_KEY, JSON.stringify([...new Set(ids)]));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: ids }));
  } catch {}
}

/** jobId -> startedAtMs when we triggered "Run now". */
function readStartedAt(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STARTED_AT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(parsed)) {
      if (typeof id === "string" && typeof n === "number" && n > 0) out[id] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStartedAt(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STARTED_AT_KEY, JSON.stringify(map));
  } catch {}
}

export function getRunningJobIds(): string[] {
  return readIds();
}

export function setRunningJobIds(ids: string[]): void {
  writeIds(ids);
}

export function addRunningJobId(jobId: string): void {
  const ids = readIds();
  if (ids.includes(jobId)) return;
  const startedAt = readStartedAt();
  startedAt[jobId] = Date.now();
  writeStartedAt(startedAt);
  writeIds([...ids, jobId]);
  debugLog("addRunningJobId", jobId, "startedAt", startedAt[jobId], "->", [...ids, jobId]);
}

export function removeRunningJobId(jobId: string): void {
  const ids = readIds().filter((id) => id !== jobId);
  const startedAt = readStartedAt();
  delete startedAt[jobId];
  writeStartedAt(startedAt);
  writeIds(ids);
}

export function removeRunningJobIds(jobIds: string[]): void {
  const set = new Set(jobIds);
  const ids = readIds().filter((id) => !set.has(id));
  const startedAt = readStartedAt();
  for (const id of jobIds) delete startedAt[id];
  writeStartedAt(startedAt);
  writeIds(ids);
  debugLog("removeRunningJobIds", jobIds, "->", ids);
}

/** When we triggered "Run now" for this job (ms). Used to match latest run by runAtMs. */
export function getRunningJobStartedAt(jobId: string): number | undefined {
  return readStartedAt()[jobId];
}

/**
 * Subscribe to id list changes.
 */
export function subscribeToRunningCrons(callback: (ids: string[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback(readIds());
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
