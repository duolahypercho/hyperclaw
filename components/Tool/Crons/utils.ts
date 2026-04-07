import { addHours, addMinutes, isBefore, isAfter, startOfDay, endOfDay } from "date-fns";
import cronParser from "cron-parser";
import type { OpenClawCronJobJson, CronRunRecord } from "$/types/electron";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/**
 * Params for adding a cron job (maps to openclaw cron add flags).
 *
 * CLI equivalent (run in terminal):
 *   openclaw cron add --name "Job name" --session main --system-event "Reminder text" --at "20m"
 *   openclaw cron add --name "Job name" --session isolated --message "Prompt" --cron "0 7 * * *" --tz "America/Los_Angeles"
 *
 * Rules:
 *   - Main session: --system-event is REQUIRED (use System event field in UI).
 *   - Isolated session: use --message and/or --system-event.
 *   - Schedule: one of --at (ISO or relative e.g. 20m) or --cron (e.g. 0 7 * * *).
 */
export interface CronAddParams {
  name: string;
  at?: string;
  cron?: string;
  tz?: string;
  session?: string;
  message?: string;
  systemEvent?: string;
  deleteAfterRun?: boolean;
  announce?: boolean;
  channel?: string;
  to?: string;
  stagger?: string;
  model?: string;
  thinking?: string;
  agent?: string;
  /** When set, each cron trigger creates a new task instead of (or in addition to) running a prompt */
  spawnTask?: {
    templateTitle: string;
    templateDescription?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    listId?: string;
    autoAssignAgent?: string;
    concurrencyPolicy?: "skip_if_active" | "allow_parallel";
  };
}

/** Params for editing a cron job (patch). */
export interface CronEditParams {
  name?: string;
  message?: string;
  model?: string;
  thinking?: string;
  agent?: string;
  clearAgent?: boolean;
  exact?: boolean;
  announce?: boolean;
  channel?: string;
  to?: string;
}

export async function cronAdd(params: CronAddParams): Promise<{ success: boolean; error?: string }> {
  const data = (await bridgeInvoke("cron-add", { cronAddParams: params })) as { success?: boolean; error?: string };
  return { success: data?.success === true, error: data?.error };
}

// Fire-and-forget cron run - triggers and returns immediately
export async function cronRun(jobId: string, options?: { due?: boolean }): Promise<{ success: boolean; error?: string }> {
  try {
    // Trigger the cron but don't wait for completion
    // Use timeout to avoid hanging - if it takes >5s, consider it started
    const data = await Promise.race([
      bridgeInvoke("cron-run", { cronRunJobId: jobId, cronRunDue: options?.due === true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
    ]) as { success?: boolean; error?: string };
    return { success: true, error: undefined }; // Assume success if triggered
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.message === "timeout") {
      return { success: true, error: undefined };
    }
    return { success: false, error: err.message };
  }
}

/** Run `openclaw cron runs --id <jobId> --limit 1` to fetch/sync the latest run info for a job. */
export async function syncCronRunsForJob(jobId: string): Promise<{ success: boolean; error?: string }> {
  if (!jobId?.trim()) return { success: false, error: "Job id is required" };
  try {
    const data = await bridgeInvoke("cron-runs-sync", { jobId: jobId.trim() }) as { success?: boolean; error?: string };
    return { success: data?.success === true, error: data?.error };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function cronEdit(jobId: string, params: CronEditParams): Promise<{ success: boolean; error?: string }> {
  const data = (await bridgeInvoke("cron-edit", { cronEditJobId: jobId, cronEditParams: params })) as { success?: boolean; error?: string };
  return { success: data?.success === true, error: data?.error };
}

export async function cronDelete(jobId: string): Promise<{ success: boolean; error?: string }> {
  const data = (await bridgeInvoke("cron-delete", { cronDeleteJobId: jobId })) as { success?: boolean; error?: string };
  return { success: data?.success === true, error: data?.error };
}

/** Assume each cron run lasts 10 minutes for calendar display. */
export const CRON_RUN_DURATION_MS = 10 * 60 * 1000;
export const CRON_RUN_DURATION_MINUTES = 10;

/** Bridge cron shape from bridgeInvoke("get-crons") (jobs.json or CLI). */
export interface BridgeCron {
  id: string;
  name: string;
  schedule: string;
  status?: string;
  nextRun?: number | string;
  nextRunAtMs?: number;
  agentId?: string;
  lastRunAtMs?: number;
  lastStatus?: string;
  enabled?: boolean;
}

/** Normalize "every 30 min" / "30m" / "30" to a string we can parse as interval. */
function normalizeEverySchedule(s: string): string {
  const t = s.trim().toLowerCase();
  const everyPrefix = t.replace(/^every\s+/, "").trim();
  return everyPrefix;
}

function inferScheduleKind(scheduleStr: string): "cron" | "every" {
  const s = scheduleStr.trim();
  const normalized = normalizeEverySchedule(s);
  if (/^\d+\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)?$/i.test(normalized))
    return "every";
  return "cron";
}

/** Parse "30m", "30 min", "every 30 min", "30" etc. into { stepMs }. Returns null if not an "every" pattern. */
function parseEveryStep(scheduleStr: string): number | null {
  const normalized = normalizeEverySchedule(scheduleStr.trim());
  const match = normalized.match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)?$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (Number.isNaN(num) || num < 1) return null;
  const unit = (match[2] || "m").toLowerCase();
  if (unit === "m" || unit === "min" || unit === "mins" || unit === "minute" || unit === "minutes")
    return num * 60 * 1000;
  if (unit === "h" || unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours")
    return num * 60 * 60 * 1000;
  if (unit === "d" || unit === "day" || unit === "days")
    return num * 24 * 60 * 60 * 1000;
  if (unit === "w" || unit === "week" || unit === "weeks")
    return num * 7 * 24 * 60 * 60 * 1000;
  return num * 60 * 1000;
}

export function mapBridgeCronsToJobs(bridgeCrons: BridgeCron[]): OpenClawCronJobJson[] {
  return bridgeCrons.map((c) => {
    const nextRunMs =
      c.nextRunAtMs ??
      (typeof c.nextRun === "number"
        ? c.nextRun
        : typeof c.nextRun === "string"
          ? new Date(c.nextRun).getTime()
          : undefined);
    return {
      id: c.id,
      name: c.name,
      enabled: c.enabled ?? (c.status !== "disabled"),
      agentId: c.agentId ?? "main",
      schedule: c.schedule
        ? { kind: inferScheduleKind(c.schedule), expr: c.schedule }
        : undefined,
      state: {
        nextRunAtMs: nextRunMs,
        lastRunAtMs: c.lastRunAtMs,
        lastStatus: c.lastStatus ?? (c.status === "active" ? "ok" : c.status === "disabled" ? "idle" : "idle"),
      },
    };
  });
}

export async function fetchCronsFromBridge(): Promise<OpenClawCronJobJson[]> {
  // Try unified store first (get-all-crons reads from SQLite)
  try {
    const unified = await bridgeInvoke("get-all-crons");
    if (Array.isArray(unified) && unified.length > 0) {
      const first = unified[0] as Record<string, unknown>;
      // If response has rawJson, it's from the unified store — parse each job's raw JSON
      if ("rawJson" in first && typeof first.rawJson === "string") {
        return unified.map((item: Record<string, unknown>) => {
          try {
            const raw = JSON.parse(item.rawJson as string) as OpenClawCronJobJson;
            return { ...raw, runtime: (item.runtime as OpenClawCronJobJson["runtime"]) ?? "openclaw" };
          } catch {
            return { id: item.id as string, name: item.name as string, enabled: Boolean(item.enabled), runtime: (item.runtime as OpenClawCronJobJson["runtime"]) ?? "openclaw" };
          }
        });
      }
      // Fallback: response is already in BridgeCron format (get-all-crons fell through to get-crons)
      return mapBridgeCronsToJobs(unified as BridgeCron[]);
    }
  } catch {
    // Fall through to legacy get-crons
  }

  const data = await bridgeInvoke("get-crons");
  if (!Array.isArray(data)) return [];
  return mapBridgeCronsToJobs(data as BridgeCron[]);
}

/** Fetch a single cron job by id with full info (payload.message, payload.model, etc.) for editing. */
export async function fetchCronById(jobId: string): Promise<OpenClawCronJobJson | null> {
  if (!jobId?.trim()) return null;
  const raw = await bridgeInvoke("get-cron-by-id", { jobId: jobId.trim() });
  if (raw && typeof raw === "object" && "id" in (raw as object)) return raw as OpenClawCronJobJson;
  if (raw && typeof raw === "object" && "error" in (raw as object)) return null;
  return null;
}

/** Fetch run history from ~/.openclaw/cron/runs/{jobId}.jsonl via bridge (bulk; used by calendar etc.). */
export async function fetchCronRunsFromBridge(
  jobIds: string[]
): Promise<Record<string, CronRunRecord[]>> {
  if (!jobIds.length) return {};
  const data = await bridgeInvoke("get-cron-runs", { jobIds });
  const out = data as { runsByJobId?: Record<string, CronRunRecord[]> };
  if (!out?.runsByJobId || typeof out.runsByJobId !== "object") return {};
  return out.runsByJobId;
}

/** Fetch paginated runs for a single job (newest first). Used when user opens job detail. */
export async function fetchCronRunsForJob(
  jobId: string,
  limit = 10,
  offset = 0
): Promise<{ runs: CronRunRecord[]; hasMore: boolean }> {
  if (!jobId) return { runs: [], hasMore: false };
  const data = await bridgeInvoke("get-cron-runs-for-job", { jobId, limit, offset });
  const out = data as { runs?: CronRunRecord[]; hasMore?: boolean };
  return {
    runs: Array.isArray(out?.runs) ? out.runs : [],
    hasMore: Boolean(out?.hasMore),
  };
}

const RUNS_FETCH_PAGE_SIZE = 100;

/** Fetch all runs for a job in one go (used when opening job detail so all messages load at once). */
export async function fetchAllCronRunsForJob(jobId: string): Promise<CronRunRecord[]> {
  if (!jobId) return [];
  const all: CronRunRecord[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { runs, hasMore: more } = await fetchCronRunsForJob(jobId, RUNS_FETCH_PAGE_SIZE, offset);
    all.push(...runs);
    hasMore = more;
    offset += runs.length;
    if (runs.length === 0) break;
  }
  return all;
}

/** Full run record (entire JSON line) for "Show more" / full session log. */
export type CronRunDetail = CronRunRecord & Record<string, unknown>;

/** Fetch full run detail for one cron run (full error, summary, and any log fields). */
export async function fetchCronRunDetail(
  jobId: string,
  runAtMs: number
): Promise<CronRunDetail | null> {
  if (!jobId || runAtMs == null) return null;
  const data = await bridgeInvoke("get-cron-run-detail", { jobId, runAtMs });
  // Backend returns { error: "Run not found" } when missing; a valid run record also has "error" for the run's message
  if (data && typeof data === "object" && "error" in data && !("runAtMs" in data)) return null;
  if (data && typeof data === "object" && (data as { error?: string }).error === "Run not found") return null;
  return data as CronRunDetail;
}

/** Match a run to a slot: runAtMs within ~2 min before slot start or before slot end. */
const SLOT_RUN_TOLERANCE_MS = 2 * 60 * 1000;

export function findRunForSlot(
  runs: CronRunRecord[] | undefined,
  slotStartMs: number,
  slotEndMs: number
): CronRunRecord | undefined {
  if (!runs?.length) return undefined;
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    const t = r.runAtMs;
    if (t >= slotStartMs - SLOT_RUN_TOLERANCE_MS && t <= slotEndMs + SLOT_RUN_TOLERANCE_MS)
      return r;
  }
  return undefined;
}

/** Format duration for display (e.g. "45s", "2m"). */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60 * 1000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

export interface CronJobParsed {
  id: string;
  name: string;
  schedule: string;
  scheduleType: "cron" | "every";
  nextRun: string;
  lastRun: string | null;
  status: "ok" | "error" | "idle";
  target: string;
  agent: string;
}

export function parseCronJobs(cronJobsText: string | null): CronJobParsed[] {
  if (!cronJobsText) return [];
  const lines = cronJobsText.trim().split("\n");
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  const dataLines = lines.slice(1);
  const idMatch = headerLine.match(/ID/);
  const nameMatch = headerLine.match(/Name/);
  const scheduleMatch = headerLine.match(/Schedule/);
  const nextMatch = headerLine.match(/Next/);
  const lastMatch = headerLine.match(/Last/);
  const statusMatch = headerLine.match(/Status/);
  const targetMatch = headerLine.match(/Target/);
  const agentMatch = headerLine.match(/Agent/);
  if (!idMatch || !nameMatch || !scheduleMatch) return [];
  const getIndex = (match: RegExpMatchArray | null, fallback = 200): number => match?.index ?? fallback;
  const results: CronJobParsed[] = [];
  for (const line of dataLines) {
    if (!line.trim()) continue;
    try {
      const id = line.substring(getIndex(idMatch), getIndex(nameMatch, nameMatch?.index ?? 200)).trim();
      const name = line.substring(getIndex(nameMatch), getIndex(scheduleMatch, scheduleMatch?.index ?? 200)).trim();
      const scheduleRaw = line.substring(getIndex(scheduleMatch), getIndex(nextMatch, nextMatch?.index ?? 300)).trim();
      const nextRun = line.substring(getIndex(nextMatch), getIndex(lastMatch, lastMatch?.index ?? 400)).trim();
      const lastRunRaw = line.substring(getIndex(lastMatch), getIndex(statusMatch, statusMatch?.index ?? 450)).trim();
      const statusRaw = line.substring(getIndex(statusMatch), getIndex(targetMatch, targetMatch?.index ?? 500)).trim();
      const target = line.substring(getIndex(targetMatch), getIndex(agentMatch, agentMatch?.index ?? 550)).trim();
      const agent = line.substring(getIndex(agentMatch)).trim();
      const isCron = scheduleRaw.startsWith("cron");
      const schedule = isCron ? scheduleRaw.replace("cron ", "").trim() : scheduleRaw.replace("every ", "").trim();
      results.push({
        id,
        name,
        schedule,
        scheduleType: isCron ? "cron" : "every",
        nextRun,
        lastRun: lastRunRaw || null,
        status: statusRaw.toLowerCase() as "ok" | "error" | "idle",
        target,
        agent,
      });
    } catch {
      // skip invalid line
    }
  }
  return results;
}

export function parseRelativeTime(relTime: string): Date {
  const now = new Date();
  const match = relTime.match(/in\s+(\d+)([hmhd])/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "m": return addHours(now, value / 60);
      case "h": return addHours(now, value);
      case "d": return addHours(now, value * 24);
    }
  }
  const agoMatch = relTime.match(/(\d+)([hmhd])\s+ago/);
  if (agoMatch) {
    const value = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2];
    switch (unit) {
      case "m": return addHours(now, -value / 60);
      case "h": return addHours(now, -value);
      case "d": return addHours(now, -value * 24);
    }
  }
  return now;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "ok": return "bg-emerald-500";
    case "error": return "bg-red-500";
    case "idle": return "bg-yellow-500";
    case "running": return "bg-primary";
    default: return "bg-gray-500";
  }
}

export interface AgentPalette {
  bg: string;
  bgSoft: string;
  border: string;
  text: string;
  dot: string;
}

const AGENT_PALETTES: Record<string, AgentPalette> = {
  clio:     { bg: "bg-violet-500",  bgSoft: "bg-violet-500/10", border: "border-l-violet-500",  text: "text-white",  dot: "bg-violet-400" },
  doraemon: { bg: "bg-sky-500",     bgSoft: "bg-sky-500/10",    border: "border-l-sky-500",     text: "text-white",  dot: "bg-sky-400" },
  vera:     { bg: "bg-emerald-500", bgSoft: "bg-emerald-500/10",border: "border-l-emerald-500", text: "text-white",  dot: "bg-emerald-400" },
  quill:    { bg: "bg-amber-500",   bgSoft: "bg-amber-500/10",  border: "border-l-amber-500",   text: "text-white",  dot: "bg-amber-400" },
  argus:    { bg: "bg-cyan-500",    bgSoft: "bg-cyan-500/10",   border: "border-l-cyan-500",    text: "text-white",  dot: "bg-cyan-400" },
  atlas:    { bg: "bg-pink-500",    bgSoft: "bg-pink-500/10",   border: "border-l-pink-500",    text: "text-white",  dot: "bg-pink-400" },
  echo:     { bg: "bg-teal-500",    bgSoft: "bg-teal-500/10",   border: "border-l-teal-500",    text: "text-white",  dot: "bg-teal-400" },
  aegis:    { bg: "bg-rose-500",    bgSoft: "bg-rose-500/10",   border: "border-l-rose-500",    text: "text-white",  dot: "bg-rose-400" },
  main:     { bg: "bg-indigo-500",  bgSoft: "bg-indigo-500/10", border: "border-l-indigo-500",  text: "text-white",  dot: "bg-indigo-400" },
};

const FALLBACK_PALETTES: AgentPalette[] = [
  { bg: "bg-fuchsia-500", bgSoft: "bg-fuchsia-500/10", border: "border-l-fuchsia-500", text: "text-white", dot: "bg-fuchsia-400" },
  { bg: "bg-lime-500",    bgSoft: "bg-lime-500/10",    border: "border-l-lime-500",    text: "text-white", dot: "bg-lime-400" },
  { bg: "bg-orange-500",  bgSoft: "bg-orange-500/10",  border: "border-l-orange-500",  text: "text-white", dot: "bg-orange-400" },
  { bg: "bg-blue-500",    bgSoft: "bg-blue-500/10",    border: "border-l-blue-500",    text: "text-white", dot: "bg-blue-400" },
];

export function getAgentPalette(agent: string): AgentPalette {
  const key = agent.toLowerCase();
  if (AGENT_PALETTES[key]) return AGENT_PALETTES[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_PALETTES[Math.abs(hash) % FALLBACK_PALETTES.length];
}

export function getAgentColor(agent: string): string {
  return getAgentPalette(agent).bg;
}

/** Stable color index for a job based on its id (for varied event colors). */
export function getJobColorIndex(jobId: string): number {
  let hash = 0;
  for (let i = 0; i < jobId.length; i++) hash = jobId.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

const JOB_COLOR_PALETTES: AgentPalette[] = [
  { bg: "bg-violet-500",  bgSoft: "bg-violet-500/10",  border: "border-l-violet-500",  text: "text-white", dot: "bg-violet-400" },
  { bg: "bg-sky-500",     bgSoft: "bg-sky-500/10",     border: "border-l-sky-500",     text: "text-white", dot: "bg-sky-400" },
  { bg: "bg-emerald-500", bgSoft: "bg-emerald-500/10", border: "border-l-emerald-500", text: "text-white", dot: "bg-emerald-400" },
  { bg: "bg-amber-500",   bgSoft: "bg-amber-500/10",   border: "border-l-amber-500",   text: "text-white", dot: "bg-amber-400" },
  { bg: "bg-pink-500",    bgSoft: "bg-pink-500/10",    border: "border-l-pink-500",    text: "text-white", dot: "bg-pink-400" },
  { bg: "bg-cyan-500",    bgSoft: "bg-cyan-500/10",    border: "border-l-cyan-500",    text: "text-white", dot: "bg-cyan-400" },
  { bg: "bg-rose-500",    bgSoft: "bg-rose-500/10",    border: "border-l-rose-500",    text: "text-white", dot: "bg-rose-400" },
  { bg: "bg-indigo-500",  bgSoft: "bg-indigo-500/10",  border: "border-l-indigo-500",  text: "text-white", dot: "bg-indigo-400" },
  { bg: "bg-fuchsia-500", bgSoft: "bg-fuchsia-500/10", border: "border-l-fuchsia-500", text: "text-white", dot: "bg-fuchsia-400" },
  { bg: "bg-teal-500",    bgSoft: "bg-teal-500/10",    border: "border-l-teal-500",    text: "text-white", dot: "bg-teal-400" },
];

export function getJobPalette(jobId: string): AgentPalette {
  return JOB_COLOR_PALETTES[getJobColorIndex(jobId) % JOB_COLOR_PALETTES.length];
}

/** Get the next run Date for a job (from state.nextRunAtMs or parsed nextRun string). */
export function getJobNextRunDate(
  job: OpenClawCronJobJson,
  parsedCronJobs: CronJobParsed[]
): Date | null {
  if (job.state?.nextRunAtMs) return new Date(job.state.nextRunAtMs);
  const parsed = parsedCronJobs.find((p) => p.id === job.id);
  if (parsed?.nextRun) return parseRelativeTime(parsed.nextRun);
  return null;
}

export interface CronRunSlot {
  start: Date;
  end: Date;
}

const MAX_SLOTS_PER_JOB = 500;

/**
 * Get all execution times for a job in a date range. Each run is assumed to last CRON_RUN_DURATION_MINUTES (10) minutes.
 * Uses cron expression from job.schedule?.expr or parsedCronJobs, and "every" patterns (e.g. 1h, 30m, 1d).
 */
export function getJobRunTimesInRange(
  job: OpenClawCronJobJson,
  parsedCronJobs: CronJobParsed[],
  rangeStart: Date,
  rangeEnd: Date
): CronRunSlot[] {
  const parsed = parsedCronJobs.find((p) => p.id === job.id);
  const scheduleStr = (job.schedule?.expr ?? parsed?.schedule ?? "").trim();
  const scheduleType = (job.schedule?.kind ?? parsed?.scheduleType) as "cron" | "every" | undefined;
  if (!scheduleStr) return [];

  const endMs = rangeEnd.getTime();
  const slots: CronRunSlot[] = [];

  if (scheduleType === "every") {
    let stepMs: number | null = parseEveryStep(scheduleStr);
    if (stepMs == null && (job.schedule as { everyMs?: number } | undefined)?.everyMs != null) {
      stepMs = (job.schedule as { everyMs: number }).everyMs;
    }
    if (stepMs != null && stepMs > 0) {
      let t = rangeStart.getTime();
      while (t <= endMs && slots.length < MAX_SLOTS_PER_JOB) {
        const start = new Date(t);
        slots.push({ start, end: addMinutes(start, CRON_RUN_DURATION_MINUTES) });
        t += stepMs;
      }
    }
    return slots;
  }

  try {
    const exprStr = scheduleStr.trim().split(/\s+/).length === 5 ? `0 ${scheduleStr}` : scheduleStr;
    const expr = cronParser.parse(exprStr, {
      currentDate: rangeStart,
      endDate: rangeEnd,
    });
    let next = expr.next();
    while (slots.length < MAX_SLOTS_PER_JOB) {
      const start = next.toDate();
      if (start.getTime() > endMs) break;
      slots.push({ start, end: addMinutes(start, CRON_RUN_DURATION_MINUTES) });
      next = expr.next();
    }
  } catch {
    // Fallback: if we have a single nextRunAtMs in range, use it
    if (job.state?.nextRunAtMs) {
      const start = new Date(job.state.nextRunAtMs);
      if (!isBefore(start, rangeStart) && !isAfter(start, rangeEnd)) {
        slots.push({ start, end: addMinutes(start, CRON_RUN_DURATION_MINUTES) });
      }
    } else if (parsed?.nextRun) {
      const start = parseRelativeTime(parsed.nextRun);
      if (!isBefore(start, rangeStart) && !isAfter(start, rangeEnd)) {
        slots.push({ start, end: addMinutes(start, CRON_RUN_DURATION_MINUTES) });
      }
    }
  }
  return slots;
}

export type DayScheduleEntry = { job: OpenClawCronJobJson; slot: CronRunSlot };

/**
 * All cron run slots for a single day, sorted by start time.
 * Used by the day schedule panel below the calendar.
 */
export function getSlotsForDay(
  day: Date,
  jobsForList: OpenClawCronJobJson[],
  parsedCronJobs: CronJobParsed[]
): DayScheduleEntry[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const seen = new Set<string>();
  const list: DayScheduleEntry[] = [];
  for (const job of jobsForList) {
    const slots = getJobRunTimesInRange(job, parsedCronJobs, dayStart, dayEnd);
    for (const slot of slots) {
      const key = `${job.id}-${slot.start.getTime()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ job, slot });
    }
  }
  return list.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
}
