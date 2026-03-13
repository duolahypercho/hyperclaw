import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, exec, spawn } from "child_process";
import { promisify } from "util";

// ── Session storage (JSON-file fallback; matches extension bridge) ──────────
const SESSIONS_DIR = path.join(os.homedir(), ".hyperclaw", "sessions");

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionMessagesFilePath(sessionKey: string): string {
  const safe = sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SESSIONS_DIR, `${safe}.jsonl`);
}

function readSessionMessages(sessionKey: string, opts?: { runId?: string; limit?: number; offset?: number }): Record<string, unknown>[] {
  // Try SQLite first
  try {
    const Database = require("better-sqlite3");
    const dbPath = path.join(os.homedir(), ".hyperclaw", "connector.db");
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true });
      let sql = "SELECT * FROM session_messages WHERE session_key = ?";
      const binds: unknown[] = [sessionKey];
      if (opts?.runId) { sql += " AND run_id = ?"; binds.push(opts.runId); }
      sql += " ORDER BY created_at_ms ASC, id ASC";
      if (opts?.limit) { sql += " LIMIT ?"; binds.push(opts.limit); if (opts?.offset) { sql += " OFFSET ?"; binds.push(opts.offset); } }
      const rows = db.prepare(sql).all(...binds) as Record<string, unknown>[];
      db.close();
      return rows;
    }
  } catch { /* SQLite not available */ }

  // JSON fallback
  const fpath = sessionMessagesFilePath(sessionKey);
  if (!fs.existsSync(fpath)) return [];
  try {
    const content = fs.readFileSync(fpath, "utf-8");
    let msgs = content.split("\n").filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    if (opts?.runId) msgs = msgs.filter((m: any) => m.run_id === opts.runId);
    const start = opts?.offset ?? 0;
    if (opts?.limit) msgs = msgs.slice(start, start + opts.limit);
    else if (start > 0) msgs = msgs.slice(start);
    return msgs;
  } catch { return []; }
}

const execAsync = promisify(exec);

const IGNORE_FILES = ["memory.md", "agents.md", "soul.md", "tools.md", "heartbeat.md", "boostrap.md", "identity.md", "user.md"];
const IGNORE_DIRS = ["browser", "node_modules", "skills", "memory"];

const DATA_DIR = path.join(os.homedir(), ".hyperclaw");
const DAILY_SUMMARIES_DIR = path.join(DATA_DIR, "daily-summaries");
const TODO_DATA_PATH = path.join(DATA_DIR, "todo.json");

// 24-char hex string compatible with MongoDB ObjectId format (used by TodoList backend).
function generateTaskId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");
  let random = "";
  for (let i = 0; i < 16; i++) {
    random += Math.floor(Math.random() * 16).toString(16);
  }
  return timestamp + random;
}
const EVENTS_PATH = path.join(DATA_DIR, "events.jsonl");
const COMMANDS_PATH = path.join(DATA_DIR, "commands.jsonl");
const USAGE_PATH = path.join(DATA_DIR, "usage.json");
const OPENCLAW_DIR = path.join(os.homedir(), ".openclaw");
const OPENCLAW_DIR_ALT = path.join(os.homedir(), "openclaw"); // ~/openclaw (no dot)
const CRON_JOBS_PATH = path.join(OPENCLAW_DIR, "cron", "jobs.json");
const CRON_RUNS_DIR = path.join(OPENCLAW_DIR, "cron", "runs");
const GATEWAY_LOG_PATH = path.join(OPENCLAW_DIR, "logs", "gateway.log");
const GATEWAY_LOG_PATH_ALT = path.join(OPENCLAW_DIR_ALT, "logs", "gateway.log");

/** Max runs per job to return (tail of file) to keep payload small. */
const MAX_RUNS_PER_JOB = 200;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

type TodoData = { tasks: Record<string, unknown>[]; lists: unknown[]; activeTaskId: string | null };

function readTodoData(): TodoData {
  try {
    if (!fs.existsSync(TODO_DATA_PATH)) return { tasks: [], lists: [], activeTaskId: null };
    const raw = JSON.parse(fs.readFileSync(TODO_DATA_PATH, "utf-8"));
    return {
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      lists: Array.isArray(raw.lists) ? raw.lists : [],
      activeTaskId: raw.activeTaskId ?? null,
    };
  } catch {
    return { tasks: [], lists: [], activeTaskId: null };
  }
}

function writeTodoData(data: TodoData) {
  fs.writeFileSync(TODO_DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function getLogPath(): string {
  if (fs.existsSync(GATEWAY_LOG_PATH)) return GATEWAY_LOG_PATH;
  if (fs.existsSync(GATEWAY_LOG_PATH_ALT)) return GATEWAY_LOG_PATH_ALT;
  return GATEWAY_LOG_PATH; // default for create/messages
}

function parseLogLine(line: string): { time: string; level: string; message: string } | null {
  if (!line || !line.trim()) return null;
  try {
    const obj = JSON.parse(line);
    return {
      time: obj.time || "",
      level: obj._meta?.logLevelName || "INFO",
      message: obj[0] ?? (typeof obj.message === "string" ? obj.message : "") ?? "",
    };
  } catch {
    // Fallback: timestamp [tag] message (e.g. "2026-02-22T23:22:22.682Z [ws] ⇄ res ✓ ...")
    const tagMatch = line.match(/^(\S+)\s+\[([^\]]+)\]\s+(.+)$/s);
    if (tagMatch) {
      return { time: tagMatch[1], level: tagMatch[2], message: tagMatch[3].trim() };
    }
    // Fallback: timestamp message (if timestamp parses as date)
    const simpleMatch = line.match(/^(\S+)\s+(.+)$/s);
    if (simpleMatch && !Number.isNaN(Date.parse(simpleMatch[1]))) {
      return { time: simpleMatch[1], level: "INFO", message: simpleMatch[2].trim() };
    }
    return { time: "", level: "INFO", message: line.trim() };
  }
}

function getLogs(lines = 100): { data?: { time: string; level: string; message: string }[]; error?: string } {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) {
    return {
      error: `Log file not found. Checked: ${GATEWAY_LOG_PATH} and ${GATEWAY_LOG_PATH_ALT}`,
    };
  }

  try {
    const content = fs.readFileSync(logPath, "utf-8");
    const allLines = content.split("\n").filter(Boolean);

    const parsed = allLines
      .map(parseLogLine)
      .filter((x): x is { time: string; level: string; message: string } => x != null)
      .filter((log) => {
        const msg = log.message || "";
        if (
          msg.includes("Gateway failed to start") ||
          msg.includes("gateway already running") ||
          msg.includes("Port 18789 is already in use") ||
          msg.includes("Gateway service appears loaded") ||
          msg.includes("lock timeout") ||
          msg.includes("launchctl bootout") ||
          msg.includes("openclaw gateway stop") ||
          msg.includes("pid 61402") ||
          msg.includes("gateway timeout") ||
          msg.includes("Chrome extension relay") ||
          msg.includes("browser failed")
        ) {
          return false;
        }
        return true;
      });

    return { data: parsed.slice(-lines) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Strip ANSI escape codes so CLI output can be parsed when colors are on. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\]8;[^;]*;[^\\]*\\/g, "");
}

/** When Next.js runs the API, PATH may not include openclaw (pnpm/Homebrew/nvm). Extend it like Electron main.js. */
function openclawEnv(): NodeJS.ProcessEnv {
  const base = process.env.PATH ?? "";
  const candidates = [
    path.join(os.homedir(), "Library/pnpm"),
    path.join(os.homedir(), ".local/share/pnpm"),
    path.join(os.homedir(), ".local/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(os.homedir(), ".nvm/versions/node/current/bin"),
    path.join(os.homedir(), ".nvm/current/bin"),
  ];
  const extra = candidates.filter((p) => p && fs.existsSync(p));
  const newPath = [...extra, base].filter(Boolean).join(path.delimiter);
  const configPath = path.join(OPENCLAW_DIR, "openclaw.json");
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "0", PATH: newPath };
  if (fs.existsSync(configPath)) env.OPENCLAW_CONFIG_PATH = configPath;
  return env;
}

type TeamAgent = { id: string; name: string; status: string; role?: string; lastActive?: string };

/**
 * Get team from `openclaw agents list` so we use the real agent registry.
 * Tries --json first; then parses plain output (strips ANSI, allows a-z, A-Z, 0-9, _, ., - for ids).
 */
function getTeamFromCli(): TeamAgent[] {
  const env = openclawEnv();
  const execOpts = { encoding: "utf-8" as const, timeout: 10000, cwd: OPENCLAW_DIR, env };
  try {
    const jsonOutput = execSync("openclaw agents list --json", execOpts);
    const parsed = JSON.parse(jsonOutput) as { id: string; identity?: { name?: string }; default?: boolean }[] | unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((a) => ({
        id: typeof a === "object" && a && "id" in a ? String((a as { id: string }).id) : "unknown",
        name:
          (typeof a === "object" && a && "identity" in a && (a as { identity?: { name?: string } }).identity?.name) ??
          (typeof a === "object" && a && "id" in a
            ? String((a as { id: string }).id).charAt(0).toUpperCase() + String((a as { id: string }).id).slice(1)
            : "Agent"),
        status:
          (typeof a === "object" && a && "default" in a && (a as { default?: boolean }).default) || (typeof a === "object" && a && "id" in a && (a as { id: string }).id === "main")
            ? "active"
            : "idle",
        role: undefined,
      }));
    }
  } catch {
    // fall through to plain parsing
  }
  try {
    const output = execSync("openclaw agents list", execOpts);
    const raw = stripAnsi(output);
    const lines = raw.split("\n");
    const agents: TeamAgent[] = [];
    let current: { id: string; name: string | null; isDefault: boolean } | null = null;

    for (const line of lines) {
      const bullet = line.match(/^\s*[-*•]\s+([a-zA-Z0-9_.-]+)(?:\s+\(([^)]+)\))?\s*$/);
      if (bullet) {
        if (current) {
          agents.push({
            id: current.id,
            name: current.name ?? current.id.charAt(0).toUpperCase() + current.id.slice(1),
            status: current.isDefault ? "active" : "idle",
            role: current.name ?? undefined,
          });
        }
        const id = bullet[1];
        const label = bullet[2];
        current = {
          id,
          name: label && label.toLowerCase() !== "default" ? label : null,
          isDefault: label?.toLowerCase() === "default" || id === "main",
        };
        continue;
      }

      const identity = line.match(/^\s*Identity:\s+.+?\s+(\S+)\s+\(IDENTITY\.md\)/i);
      if (identity && current) {
        current.name = current.name ?? identity[1];
      }
    }

    if (current) {
      agents.push({
        id: current.id,
        name: current.name ?? current.id.charAt(0).toUpperCase() + current.id.slice(1),
        status: current.isDefault ? "active" : "idle",
        role: current.name ?? undefined,
      });
    }

    return agents;
  } catch {
    return [];
  }
}

/**
 * Get team from ~/.openclaw/openclaw.json agents.list (no CLI).
 */
function getTeamFromConfig(): TeamAgent[] {
  try {
    const configPath = path.join(OPENCLAW_DIR, "openclaw.json");
    if (!fs.existsSync(configPath)) return [];
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      agents?: { list?: { id: string; identity?: { name?: string } }[] };
    };
    const list = config?.agents?.list;
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.map((a, i) => ({
      id: a.id ?? `agent-${i}`,
      name: a.identity?.name ?? (a.id ? a.id.charAt(0).toUpperCase() + a.id.slice(1) : "Agent"),
      status: a.id === "main" ? "active" : "idle",
      role: a.identity?.name ?? undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Get team from workspace dirs under ~/.openclaw (identity name from IDENTITY.md).
 */
function getTeamFromWorkspaces(): TeamAgent[] {
  if (!fs.existsSync(OPENCLAW_DIR)) return [];
  try {
    const entries = fs.readdirSync(OPENCLAW_DIR, { withFileTypes: true });
    const agents: TeamAgent[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORE_DIRS.includes(entry.name)) continue;
      const fullPath = path.join(OPENCLAW_DIR, entry.name);
      const name = readIdentityName(fullPath) ?? entry.name;
      agents.push({
        id: entry.name,
        name,
        status: entry.name === "main" ? "active" : "idle",
        role: name !== entry.name ? name : undefined,
      });
    }
    return agents;
  } catch {
    return [];
  }
}

/**
 * Get team: try CLI first, then config file, then workspace dirs.
 */
function getTeam(): TeamAgent[] {
  const fromCli = getTeamFromCli();
  if (fromCli.length > 0) return fromCli;
  const fromConfig = getTeamFromConfig();
  if (fromConfig.length > 0) return fromConfig;
  return getTeamFromWorkspaces();
}

/** Parsed cron job returned by get-crons (from jobs.json or CLI fallback). */
interface ParsedCronJob {
  id: string;
  name: string;
  schedule: string;
  agentId?: string;
  status?: string;
  nextRun?: number;
  lastRunAtMs?: number;
  lastStatus?: string;
}

/** Shape of a single job in ~/.openclaw/cron/jobs.json (minimal; full file may include payload, delivery, etc.). */
interface OpenClawCronJobFile {
  id: string;
  agentId?: string;
  name: string;
  enabled?: boolean;
  schedule?: { kind?: string; expr?: string; everyMs?: number; anchorMs?: number; tz?: string };
  state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string; lastDurationMs?: number; consecutiveErrors?: number; lastError?: string };
}

function formatEverySchedule(everyMs: number): string {
  if (everyMs % (24 * 60 * 60 * 1000) === 0) return `${everyMs / (24 * 60 * 60 * 1000)}d`;
  if (everyMs % (60 * 60 * 1000) === 0) return `${everyMs / (60 * 60 * 1000)}h`;
  if (everyMs % (60 * 1000) === 0) return `${everyMs / (60 * 1000)}m`;
  return `${everyMs}m`;
}

/** Read crons from ~/.openclaw/cron/jobs.json for full names, ids, and state. */
function getCronsFromJson(): ParsedCronJob[] {
  try {
    if (!fs.existsSync(CRON_JOBS_PATH)) return [];
    const raw = fs.readFileSync(CRON_JOBS_PATH, "utf-8");
    const data = JSON.parse(raw) as { version?: number; jobs?: OpenClawCronJobFile[] };
    const list = data?.jobs;
    if (!Array.isArray(list)) return [];

    return list.map((job) => {
      const schedule = job.schedule;
      let scheduleStr = "";
      if (schedule?.kind === "cron" && schedule.expr) scheduleStr = schedule.expr;
      else if (schedule?.kind === "every" && schedule.everyMs != null) scheduleStr = formatEverySchedule(schedule.everyMs);
      // Prefer jobs.json state; fall back to most recent run from runs/{jobId}.jsonl
      let lastRunAtMs = job.state?.lastRunAtMs;
      let lastStatus = job.state?.lastStatus;
      if (lastRunAtMs == null && job.id) {
        const lastRun = getLastRunForJob(job.id);
        if (lastRun) {
          lastRunAtMs = lastRun.runAtMs;
          lastStatus = lastRun.status;
        }
      }
      return {
        id: job.id,
        name: job.name || job.id,
        schedule: scheduleStr,
        agentId: job.agentId,
        status: job.enabled !== false ? "active" : "disabled",
        nextRun: job.state?.nextRunAtMs,
        lastRunAtMs,
        lastStatus,
      };
    });
  } catch {
    return [];
  }
}

/** UUID v4 style id (36 chars). */
const UUID_REGEX = /^[a-f0-9-]{36}$/i;

/**
 * Parse a single cron list data line (CLI fallback) so we get full name and id.
 */
function parseCronLine(line: string): ParsedCronJob | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("ID=")) return null;
  const possibleId = trimmed.substring(0, 36);
  if (!UUID_REGEX.test(possibleId)) return null;
  const id = possibleId;
  const rest = trimmed.substring(36).trim();
  const scheduleKeyword = rest.match(/\s+(cron|every)\s+/i);
  if (!scheduleKeyword || scheduleKeyword.index == null) return null;
  const name = rest.substring(0, scheduleKeyword.index).trim();
  let scheduleRaw = rest.substring(scheduleKeyword.index).trim();
  const firstSegment = scheduleRaw.split(/\s{2,}/)[0] ?? scheduleRaw;
  const isCron = firstSegment.toLowerCase().startsWith("cron");
  const schedule = isCron
    ? (firstSegment.match(/cron\s+(.+?)(?:\s+@|$)/i)?.[1] ?? firstSegment).trim()
    : (firstSegment.match(/every\s+(.+)/i)?.[1] ?? firstSegment).trim();
  const segments = scheduleRaw.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const lastSegment = segments.length > 1 ? segments[segments.length - 1] : undefined;
  const agentId =
    lastSegment &&
    lastSegment.length < 50 &&
    !/^\d{4}-\d{2}-\d{2}/.test(lastSegment) &&
    lastSegment !== "enabled" &&
    lastSegment !== "disabled"
      ? lastSegment
      : undefined;
  return { id, name: name || id, schedule, agentId };
}

/** Read cron list from ~/.openclaw/cron/jobs.json only (no CLI). */
function getCrons(): ParsedCronJob[] {
  return getCronsFromJson();
}

/** Return a single cron job by id with full info (payload, schedule, delivery, etc.) from jobs.json. */
function getCronById(jobId: string): Record<string, unknown> | null {
  if (typeof jobId !== "string" || !jobId.trim()) return null;
  const id = jobId.trim();
  if (!UUID_REGEX.test(id)) return null;
  try {
    if (!fs.existsSync(CRON_JOBS_PATH)) return null;
    const raw = fs.readFileSync(CRON_JOBS_PATH, "utf-8");
    const data = JSON.parse(raw) as { version?: number; jobs?: Record<string, unknown>[] };
    const list = data?.jobs;
    if (!Array.isArray(list)) return null;
    const job = list.find((j) => j && typeof j === "object" && (j as { id?: string }).id === id);
    return job && typeof job === "object" ? (job as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Shape of one line in ~/.openclaw/cron/runs/{jobId}.jsonl */
interface CronRunLine {
  ts?: number;
  jobId?: string;
  action?: string;
  status?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
  summary?: string;
  error?: string;
  sessionId?: string;
}

/**
 * Read run history from ~/.openclaw/cron/runs/{jobId}.jsonl for each job.
 * Returns last MAX_RUNS_PER_JOB runs per job, oldest first (chronological).
 */
function getCronRuns(jobIds: string[]): Record<string, CronRunLine[]> {
  const runsByJobId: Record<string, CronRunLine[]> = {};
  if (!fs.existsSync(CRON_RUNS_DIR)) return runsByJobId;
  for (const jobId of jobIds) {
    if (!jobId || typeof jobId !== "string") continue;
    if (/\.\.|[\\/]/.test(jobId) || jobId.length > 64) continue;
    const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      const runs: CronRunLine[] = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line) as CronRunLine;
          if (obj.runAtMs != null) runs.push(obj);
        } catch {
          // skip invalid line
        }
      }
      const tail = runs.slice(-MAX_RUNS_PER_JOB);
      if (tail.length) runsByJobId[jobId] = tail;
    } catch {
      // skip unreadable file
    }
  }
  return runsByJobId;
}

/**
 * Get paginated runs for a single job (newest first). Returns { runs, hasMore }.
 */
function getCronRunsForJob(
  jobId: string,
  limit = 10,
  offset = 0
): { runs: CronRunLine[]; hasMore: boolean } {
  if (!jobId || typeof jobId !== "string" || /\.\.|[\\/]/.test(jobId) || jobId.length > 64) {
    return { runs: [], hasMore: false };
  }
  if (!fs.existsSync(CRON_RUNS_DIR)) return { runs: [], hasMore: false };
  const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) return { runs: [], hasMore: false };
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    const all: CronRunLine[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as CronRunLine;
        if (obj.runAtMs != null) all.push(obj);
      } catch {
        // skip invalid line
      }
    }
    const newestFirst = all.slice().reverse();
    const total = newestFirst.length;
    const page = newestFirst.slice(offset, offset + limit);
    return { runs: page, hasMore: offset + limit < total };
  } catch {
    return { runs: [], hasMore: false };
  }
}

/** Get the most recent run for a job (for lastRunAtMs/lastStatus when jobs.json has none). */
function getLastRunForJob(jobId: string): { runAtMs: number; status: string } | null {
  const result = getCronRunsForJob(jobId, 1, 0);
  const run = result.runs?.[0];
  if (!run || run.runAtMs == null) return null;
  return {
    runAtMs: run.runAtMs,
    status: (run.status && String(run.status).toLowerCase()) || "idle",
  };
}

/**
 * Get full run record for one cron run (entire JSON line) for "Show more" / full log.
 */
function getCronRunDetail(
  jobId: string,
  runAtMs: number
): CronRunLine & Record<string, unknown> | null {
  if (!jobId || typeof jobId !== "string" || /\.\.|[\\/]/.test(jobId) || jobId.length > 64) {
    return null;
  }
  if (runAtMs == null || typeof runAtMs !== "number") return null;
  if (!fs.existsSync(CRON_RUNS_DIR)) return null;
  const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as CronRunLine & Record<string, unknown>;
        if (obj.runAtMs === runAtMs) return obj;
      } catch {
        // skip invalid line
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getConfig() {
  try {
    const configPath = path.join(OPENCLAW_DIR, "openclaw.json");
    if (!fs.existsSync(configPath)) return {};
    
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    
    // Redact sensitive fields
    if (config.providers) {
      for (const [key, val] of Object.entries(config.providers)) {
        if (val && typeof val === "object" && "apiKey" in (val as Record<string, unknown>)) {
          (val as Record<string, unknown>).apiKey = "***";
        }
      }
    }
    
    return config;
  } catch {
    return {};
  }
}

/** Models from ~/.openclaw/openclaw.json agents.defaults.models: only model ids (keys), no alias or other attributes. */
function getDefaultModels(): { id: string; name: string }[] {
  try {
    const configPath = path.join(OPENCLAW_DIR, "openclaw.json");
    if (!fs.existsSync(configPath)) return [];
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
      agents?: { defaults?: { models?: Record<string, unknown> } };
    };
    const models = config?.agents?.defaults?.models;
    if (!models || typeof models !== "object") return [];
    return Object.keys(models).map((id) => ({ id, name: id }));
  } catch {
    return [];
  }
}

/** True if file content is only a session header block (Session, Session Key, Session ID, Source) with no other content. */
function isOnlySessionHeader(content: string): boolean {
  const trimmed = (content || "").trim();
  if (!trimmed) return true;
  const withoutHeader = trimmed.replace(
    /^\s*#\s*Session:[\s\S]*?\*\*Source\*\*:\s*.+$/m,
    ""
  ).trim();
  return withoutHeader.length === 0;
}

/**
 * Read agent Name from identity.md (or IDENTITY.md) in parentDir.
 * Supports formats: "Name: Doraemon", "- **Name:** Doraemon", "**Name:** Doraemon".
 * Returns null if not found.
 */
function readIdentityName(parentDir: string): string | null {
  const candidates = [path.join(parentDir, "identity.md"), path.join(parentDir, "IDENTITY.md")];
  let identityPath: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      identityPath = p;
      break;
    }
  }
  if (!identityPath) return null;
  try {
    const content = fs.readFileSync(identityPath, "utf-8");
    // Match "Name:" with optional markdown bold and colon (e.g. "- **Name:** Doraemon")
    const match = content.match(/\bName:\s*\**\s*:?\s*(.+?)\s*\**\s*$/im);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/** One memory source: a folder that contains a "memory" subfolder, with optional tag from identity.md. */
export interface MemorySource {
  tag: string;
  basePath: string;
  files: { name: string; path: string; updatedAt: string; sizeBytes: number }[];
}

/** Find all dirs under ~/.openclaw that have a "memory" subfolder; list files in each and read identity.md Name for tag. */
function listOpenClawMemorySources(): MemorySource[] {
  const sources: MemorySource[] = [];
  if (!fs.existsSync(OPENCLAW_DIR)) return sources;

  function collectMemoryFolders(dir: string, relativeFromRoot: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      const rel = relativeFromRoot ? `${relativeFromRoot}/${entry.name}` : entry.name;
      if (entry.name.toLowerCase() === "memory") {
        const parentDir = dir;
        const parentRel = relativeFromRoot || ".";
        const tag = readIdentityName(parentDir) ?? (parentRel === "." ? "Main" : path.basename(parentDir));
        const basePath = relativeFromRoot ? `${relativeFromRoot}/memory` : "memory";
        const flatFiles: { name: string; path: string; updatedAt: string; sizeBytes: number }[] = [];

        function walkMemory(curDir: string) {
          let list: fs.Dirent[];
          try {
            list = fs.readdirSync(curDir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const e of list) {
            const fp = path.join(curDir, e.name);
            const subRel = path.relative(fullPath, fp).replace(/\\/g, "/");
            const fileRelativePath = basePath + (subRel ? `/${subRel}` : "");
            if (e.isDirectory()) {
              walkMemory(fp);
            } else if (e.isFile() && (e.name.toLowerCase().endsWith(".md") || e.name.toLowerCase().endsWith(".txt"))) {
              try {
                const stat = fs.statSync(fp);
                const raw = fs.readFileSync(fp, "utf-8");
                if (isOnlySessionHeader(raw)) continue;
                flatFiles.push({
                  name: e.name,
                  path: fileRelativePath,
                  updatedAt: stat.mtime.toISOString(),
                  sizeBytes: stat.size,
                });
              } catch {
                // skip unreadable
              }
            }
          }
        }
        walkMemory(fullPath);
        flatFiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        sources.push({ tag, basePath, files: flatFiles });
        continue;
      }
      collectMemoryFolders(fullPath, rel);
    }
  }

  collectMemoryFolders(OPENCLAW_DIR, "");
  return sources;
}

/** List all files under ~/.openclaw/memory (recursive). Returns relative paths from OPENCLAW_DIR (e.g. memory/2025-02-22.md). Kept for backward compatibility. */
function listOpenClawMemoryFiles(): { name: string; path: string; updatedAt: string; sizeBytes: number }[] {
  const sources = listOpenClawMemorySources();
  const flat: { name: string; path: string; updatedAt: string; sizeBytes: number }[] = [];
  for (const s of sources) {
    flat.push(...s.files);
  }
  flat.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return flat;
}

/** Search memory file contents for a query (case-insensitive). Returns relative paths that match. */
function searchOpenClawMemoryContent(query: string): string[] {
  if (!query || typeof query !== "string") return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const sources = listOpenClawMemorySources();
  const matchingPaths: string[] = [];
  for (const source of sources) {
    for (const file of source.files) {
      const fullPath = path.join(OPENCLAW_DIR, file.path);
      try {
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.toLowerCase().includes(q)) matchingPaths.push(file.path);
      } catch {
        // skip unreadable
      }
    }
  }
  return matchingPaths;
}

/**
 * Build a map of workspace folder name (first path segment) -> agent name from identity.md.
 * Only includes dirs that contain identity.md; others are omitted (UI can fall back to folder name).
 */
function getOpenClawWorkspaceLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!fs.existsSync(OPENCLAW_DIR)) return labels;
  try {
    const entries = fs.readdirSync(OPENCLAW_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(OPENCLAW_DIR, entry.name);
      const name = readIdentityName(fullPath);
      if (name) labels[entry.name] = name;
    }
  } catch {
    // ignore
  }
  return labels;
}

/** Token usage record from a session (flexible field names). OpenClaw uses object keyed by session id with updatedAt, inputTokens, outputTokens, totalTokens. */
interface SessionTokenRecord {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; input_tokens?: number; output_tokens?: number; total_tokens?: number };
  createdAt?: string;
  timestamp?: number | string;
  date?: string;
  updatedAt?: number | string;
}

/** Aggregated usage returned by get-openclaw-usage. */
export interface OpenClawUsageResult {
  byDay: { date: string; inputTokens: number; outputTokens: number; totalTokens: number }[];
  totals: { inputTokens: number; outputTokens: number; totalTokens: number };
  byAgent: { agentId: string; inputTokens: number; outputTokens: number; totalTokens: number }[];
  hint?: string;
  debug?: { files: { path: string; agentId: string; records: number; totalTokens: number }[] };
}

function toNum(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") return Math.max(0, Math.floor(parseInt(v, 10)) || 0);
  return 0;
}

/** Read token counts from a record; supports camelCase, snake_case, and nested usage. */
function getTokenCounts(r: SessionTokenRecord): { input: number; output: number; total: number } {
  const u = r.usage && typeof r.usage === "object" ? r.usage : (r as Record<string, unknown>);
  const input = toNum((u as SessionTokenRecord).inputTokens ?? (u as SessionTokenRecord).input_tokens ?? r.inputTokens ?? r.input_tokens);
  const output = toNum((u as SessionTokenRecord).outputTokens ?? (u as SessionTokenRecord).output_tokens ?? r.outputTokens ?? r.output_tokens);
  const totalRaw = toNum((u as SessionTokenRecord).totalTokens ?? (u as SessionTokenRecord).total_tokens ?? r.totalTokens ?? r.total_tokens);
  return { input, output, total: totalRaw || input + output };
}

function toDateKey(record: SessionTokenRecord): string | null {
  const raw = record.updatedAt ?? record.createdAt ?? record.date ?? record.timestamp;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof raw === "number" && raw > 0) {
    return new Date(raw).toISOString().slice(0, 10);
  }
  return null;
}

function hasSessionTokenFields(r: unknown): r is SessionTokenRecord {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    o.inputTokens !== undefined ||
    o.outputTokens !== undefined ||
    o.totalTokens !== undefined ||
    o.input_tokens !== undefined ||
    o.output_tokens !== undefined ||
    o.total_tokens !== undefined ||
    Boolean(o.usage && typeof o.usage === "object")
  );
}

/** Flatten an array to token records: each element is either a record (if it has token fields) or recursed into (e.g. session with nested turns[].usage). */
function flattenToTokenRecords(arr: unknown[]): SessionTokenRecord[] {
  const out: SessionTokenRecord[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    if (hasSessionTokenFields(x)) out.push(x as SessionTokenRecord);
    else out.push(...extractRecords(x));
  }
  return out;
}

/** Extract session records. Supports: array of records, { sessions: [] }, { data: [] }, single record, and OpenClaw format: root object keyed by session id (e.g. "agent:aegis:cron:...") with values like { inputTokens, outputTokens, totalTokens, updatedAt }. Nested session/turn structures (e.g. sessions[].turns[].usage) are flattened so every token-bearing record is counted. */
function extractRecords(data: unknown): SessionTokenRecord[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (Array.isArray(data)) return flattenToTokenRecords(data);
  if (Array.isArray(obj.sessions)) return flattenToTokenRecords(obj.sessions as unknown[]);
  if (Array.isArray(obj.data)) return flattenToTokenRecords(obj.data as unknown[]);
  if (hasSessionTokenFields(obj)) return [obj as SessionTokenRecord];
  const values = Object.values(obj).filter((x) => x != null && typeof x === "object") as SessionTokenRecord[];
  if (values.length === 1 && Array.isArray(values[0])) return flattenToTokenRecords(values[0] as unknown[]);
  // OpenClaw sessions.json: root is { "sessionKey1": { inputTokens, outputTokens, totalTokens, updatedAt }, ... } — take every value that has token fields
  const out: SessionTokenRecord[] = [];
  for (const v of values) {
    if (!v || typeof v !== "object") continue;
    if (hasSessionTokenFields(v)) {
      out.push(v as SessionTokenRecord);
    } else {
      const nested = extractRecords(v);
      if (nested.length) out.push(...nested);
    }
  }
  return out.length ? out : values;
}

/** Add all .json files in a sessions directory so we don't miss date-partitioned or rotated session files. */
function addAllSessionFilesInDir(
  out: { path: string; agentId: string }[],
  sessionsDir: string,
  agentId: string
): void {
  if (!fs.existsSync(sessionsDir) || !fs.statSync(sessionsDir).isDirectory()) return;
  try {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith(".json")) continue;
      const fullPath = path.join(sessionsDir, e.name);
      out.push({ path: fullPath, agentId });
    }
  } catch {
    // ignore
  }
}

/** Recursively find every sessions dir under baseDir and add all *.json from it. agentId = path relative to baseDir (e.g. "folder" or "folder/sub"). */
function walkAndCollectSessions(
  out: { path: string; agentId: string }[],
  baseDir: string,
  relativePath: string
): void {
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return;
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const sessionsDir = path.join(baseDir, "sessions");
    if (fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory()) {
      const agentId = relativePath || path.basename(baseDir) || "agent";
      addAllSessionFilesInDir(out, sessionsDir, agentId);
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === "sessions") continue;
      const childPath = path.join(baseDir, e.name);
      const nextRelative = relativePath ? `${relativePath}/${e.name}` : e.name;
      walkAndCollectSessions(out, childPath, nextRelative);
    }
  } catch {
    // ignore
  }
}

/** Collect session file paths from a given openclaw root. Recursively scans agents and workspace so every sessions dir (sessions.json and other .json) at any depth is included. */
function collectSessionsPaths(openclawRoot: string): { path: string; agentId: string }[] {
  const out: { path: string; agentId: string }[] = [];
  const globalSessionsDir = path.join(openclawRoot, "sessions");
  addAllSessionFilesInDir(out, globalSessionsDir, "_global");

  const agentsDir = path.join(openclawRoot, "agents");
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    try {
      const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const folderPath = path.join(agentsDir, d.name);
        walkAndCollectSessions(out, folderPath, d.name);
      }
    } catch {
      // ignore
    }
  }
  const workspaceDir = path.join(openclawRoot, "workspace");
  if (fs.existsSync(workspaceDir) && fs.statSync(workspaceDir).isDirectory()) {
    try {
      const dirs = fs.readdirSync(workspaceDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const folderPath = path.join(workspaceDir, d.name);
        walkAndCollectSessions(out, folderPath, d.name);
      }
    } catch {
      // ignore
    }
  }
  return out;
}

/** Scan ~/.openclaw (and ~/openclaw) for sessions/sessions.json and agents/workspace subdirs, aggregate token usage. */
function getOpenClawUsage(): OpenClawUsageResult {
  const byDayMap = new Map<string, { inputTokens: number; outputTokens: number; totalTokens: number }>();
  const byAgentMap = new Map<string, { inputTokens: number; outputTokens: number; totalTokens: number }>();
  const debugFiles: { path: string; agentId: string; records: number; totalTokens: number }[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalTotal = 0;

  const sessionsPaths: { path: string; agentId: string }[] = [];
  if (fs.existsSync(OPENCLAW_DIR)) {
    sessionsPaths.push(...collectSessionsPaths(OPENCLAW_DIR));
  }
  if (fs.existsSync(OPENCLAW_DIR_ALT)) {
    const altPaths = collectSessionsPaths(OPENCLAW_DIR_ALT);
    for (const p of altPaths) {
      if (!sessionsPaths.some((s) => s.path === p.path)) sessionsPaths.push(p);
    }
  }

  if (sessionsPaths.length === 0) {
    return {
      byDay: [],
      totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      byAgent: [],
      hint: `No session files found at ${OPENCLAW_DIR} or ${OPENCLAW_DIR_ALT}. In the browser, usage is read from the server's filesystem—use the desktop app (Electron) or run locally (npm run dev) so the app can read ~/.openclaw.`,
    };
  }

  for (const { path: filePath, agentId } of sessionsPaths) {
    let raw: unknown;
    let fileDateKey: string | null = null;
    try {
      const stat = fs.statSync(filePath);
      fileDateKey = stat.mtime.toISOString().slice(0, 10);
      raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      continue;
    }
    const records = extractRecords(raw);
    const agentTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    for (const r of records) {
      const { input, output, total } = getTokenCounts(r);
      const dateKey = toDateKey(r) ?? fileDateKey;
      agentTotals.inputTokens += input;
      agentTotals.outputTokens += output;
      agentTotals.totalTokens += total;
      totalInput += input;
      totalOutput += output;
      totalTotal += total;
      if (dateKey) {
        const existing = byDayMap.get(dateKey) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
        existing.inputTokens += input;
        existing.outputTokens += output;
        existing.totalTokens += total;
        byDayMap.set(dateKey, existing);
      }
    }
    if (agentTotals.inputTokens > 0 || agentTotals.outputTokens > 0 || agentTotals.totalTokens > 0) {
      const existing = byAgentMap.get(agentId) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      existing.inputTokens += agentTotals.inputTokens;
      existing.outputTokens += agentTotals.outputTokens;
      existing.totalTokens += agentTotals.totalTokens;
      byAgentMap.set(agentId, existing);
    }
    debugFiles.push({
      path: filePath,
      agentId,
      records: records.length,
      totalTokens: agentTotals.totalTokens,
    });
  }

  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byAgent = Array.from(byAgentMap.entries()).map(([agentId, v]) => ({ agentId, ...v }));

  const result: OpenClawUsageResult = {
    byDay,
    totals: { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalTotal },
    byAgent,
    debug: { files: debugFiles },
  };
  if (totalTotal === 0 && sessionsPaths.length > 0) {
    result.hint = "Session files were found but contained no token records. Ensure each file is a JSON array of objects with inputTokens, outputTokens, totalTokens, and optional createdAt or timestamp.";
  }
  return result;
}

/** Recursively list all .md files under ~/.openclaw. Returns relative paths from OPENCLAW_DIR. */
function listOpenClawMarkdownFiles(): {
  relativePath: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
}[] {
  const result: { relativePath: string; name: string; updatedAt: string; sizeBytes: number }[] = [];
  if (!fs.existsSync(OPENCLAW_DIR)) return result;

  function walk(dir: string, baseDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.includes(entry.name)) continue;
        walk(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if (IGNORE_FILES.includes(entry.name.toLowerCase())) continue; // ignore Memory.md in all workspace
        try {
          const stat = fs.statSync(fullPath);
          result.push({
            relativePath: relativePath.replace(/\\/g, "/"),
            name: entry.name,
            updatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          });
        } catch {
          // skip unreadable
        }
      }
    }
  }

  walk(OPENCLAW_DIR, OPENCLAW_DIR);
  result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return result;
}

/** List only agent config files (memory.md, agents.md, soul.md, etc.) under ~/.openclaw. */
function listOpenClawAgentFiles(): {
  relativePath: string;
  name: string;
  updatedAt: string;
  sizeBytes: number;
}[] {
  const result: { relativePath: string; name: string; updatedAt: string; sizeBytes: number }[] = [];
  if (!fs.existsSync(OPENCLAW_DIR)) return result;

  function walk(dir: string, baseDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.includes(entry.name)) continue;
        walk(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if (!IGNORE_FILES.includes(entry.name.toLowerCase())) continue;
        try {
          const stat = fs.statSync(fullPath);
          result.push({
            relativePath: relativePath.replace(/\\/g, "/"),
            name: entry.name,
            updatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          });
        } catch {
          // skip unreadable
        }
      }
    }
  }

  walk(OPENCLAW_DIR, OPENCLAW_DIR);
  result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return result;
}

/** Read a single .md file from ~/.openclaw by relative path. Path must not contain "..". */
function getOpenClawDocContent(
  relativePath: string
): { success: boolean; content?: string; error?: string } {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_DIR, relativePath);
  if (!resolved.startsWith(path.resolve(OPENCLAW_DIR))) {
    return { success: false, error: "Path escapes workspace" };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { success: false, error: "File not found" };
  }
  try {
    const content = fs.readFileSync(resolved, "utf-8");
    return { success: true, content };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Write content to a .md file in ~/.openclaw by relative path. Path must not contain "..". */
function writeOpenClawDocContent(
  relativePath: string,
  content: string
): { success: boolean; error?: string } {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_DIR, relativePath);
  if (!resolved.startsWith(path.resolve(OPENCLAW_DIR))) {
    return { success: false, error: "Path escapes workspace" };
  }
  try {
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, typeof content === "string" ? content : "", "utf-8");
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Create a directory under ~/.openclaw by relative path. Path must not contain "..". */
function createOpenClawFolder(relativePath: string): { success: boolean; error?: string } {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_DIR, relativePath);
  if (!resolved.startsWith(path.resolve(OPENCLAW_DIR))) {
    return { success: false, error: "Path escapes workspace" };
  }
  try {
    if (fs.existsSync(resolved)) {
      return { success: false, error: "Folder already exists" };
    }
    fs.mkdirSync(resolved, { recursive: true });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Delete a file or folder under ~/.openclaw by relative path. Path must not contain "..". */
function deleteOpenClawPath(relativePath: string): { success: boolean; error?: string } {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_DIR, relativePath);
  const openclawResolved = path.resolve(OPENCLAW_DIR);
  if (!resolved.startsWith(openclawResolved)) {
    return { success: false, error: "Path escapes workspace" };
  }
  if (resolved === openclawResolved) {
    return { success: false, error: "Cannot delete workspace root" };
  }
  if (!fs.existsSync(resolved)) {
    return { success: false, error: "Not found" };
  }
  try {
    fs.rmSync(resolved, { recursive: true });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Prompt for OpenClaw agent to read and process HyperClaw command queue (e.g. generate_daily_summary). */
const PROCESS_COMMANDS_MESSAGE =
  "Process the HyperClaw command queue: call hyperclaw_read_commands. " +
  "For each command of type 'generate_daily_summary', use the date in the payload, " +
  "call hyperclaw_generate_daily_summary for that date, summarize the memories with your LLM into a short TL;DR, " +
  "then call hyperclaw_write_daily_summary with that date and the summary content. Process all such commands.";

const OPENCLAW_AGENT_TIMEOUT_MS = 180000; // 3 min for multiple days

/** Run openclaw with an args array (safe for user input). */
function runOpenClawArgs(args: string[], timeoutMs = 20000): Promise<{ stdout: string; stderr: string }> {
  const cwd = fs.existsSync(OPENCLAW_DIR) ? OPENCLAW_DIR : os.homedir();
  const env = { ...process.env, FORCE_COLOR: "0" };
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, { env, cwd });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => errChunks.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Command timed out"));
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks as unknown as Uint8Array[]).toString().trim();
      const stderr = Buffer.concat(errChunks as unknown as Uint8Array[]).toString().trim();
      if (code !== 0) reject(new Error(stderr || `Exit ${code}`));
      else resolve({ stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Run OpenClaw agent once so it reads commands.jsonl and processes generate_daily_summary.
 * Writes to ~/.hyperclaw/daily-summaries/ per day.
 */
async function triggerOpenClawProcessCommands(): Promise<{ success: boolean; error?: string }> {
  const cwd = fs.existsSync(OPENCLAW_DIR) ? OPENCLAW_DIR : os.homedir();
  const escaped = PROCESS_COMMANDS_MESSAGE.replace(/'/g, "'\"'\"'");
  const cmd = `openclaw agent --message '${escaped}'`;
  try {
    await execAsync(cmd, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      timeout: OPENCLAW_AGENT_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { success: true };
  } catch (e: unknown) {
    const err = e as { message?: string; stderr?: string; killed?: boolean };
    const msg = err?.message || err?.stderr || String(e);
    return { success: false, error: msg };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  ensureDir();

  const { action, task, id, patch, command, date, lines, jobIds, jobId: singleJobId, runAtMs, limit: runsLimit, offset: runsOffset, relativePath, content: docContent, todoData, query, cronAddParams, cronRunJobId, cronRunDue, cronEditJobId, cronEditParams, cronDeleteJobId, agentName, agentId, usageData } = req.body;

  switch (action) {
    case "trigger-process-commands": {
      const result = await triggerOpenClawProcessCommands();
      return res.json(result);
    }
    case "get-todo-data": {
      try {
        if (!fs.existsSync(TODO_DATA_PATH)) return res.json({ tasks: [], lists: [], activeTaskId: null });
        const raw = JSON.parse(fs.readFileSync(TODO_DATA_PATH, "utf-8"));
        return res.json(raw);
      } catch { return res.json({ tasks: [], lists: [], activeTaskId: null }); }
    }
    case "save-todo-data": {
      try {
        fs.writeFileSync(TODO_DATA_PATH, JSON.stringify(todoData ?? { tasks: [], lists: [], activeTaskId: null }, null, 2), "utf-8");
        return res.json({ success: true });
      } catch (e: any) {
        return res.json({ success: false, error: e?.message || String(e) });
      }
    }
    case "get-tasks": {
      return res.json(readTodoData().tasks);
    }
    case "add-task": {
      const todo = readTodoData();
      const now = new Date().toISOString();
      const existingId = task?.id && /^[0-9a-f]{24}$/i.test(String(task.id)) ? String(task.id) : null;
      const newTask = {
        ...task,
        id: existingId ?? generateTaskId(),
        createdAt: now,
        updatedAt: now,
      };
      todo.tasks.push(newTask);
      writeTodoData(todo);
      return res.json(newTask);
    }
    case "update-task": {
      const todo = readTodoData();
      const idx = todo.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return res.json(null);
      todo.tasks[idx].updatedAt = new Date().toISOString();
      Object.assign(todo.tasks[idx], patch);
      writeTodoData(todo);
      return res.json(todo.tasks[idx]);
    }
    case "delete-task": {
      const todo = readTodoData();
      const filtered = todo.tasks.filter((t) => t.id !== id);
      if (filtered.length === todo.tasks.length) return res.json({ success: false });
      todo.tasks = filtered;
      writeTodoData(todo);
      return res.json({ success: true });
    }
    case "send-command": {
      const entry = {
        type: command.type,
        timestamp: new Date().toISOString(),
        source: "hyperclaw",
        payload: command.payload || {},
      };
      fs.appendFileSync(COMMANDS_PATH, JSON.stringify(entry) + "\n", "utf-8");
      return res.json({ success: true });
    }
    case "get-events": {
      try {
        if (!fs.existsSync(EVENTS_PATH)) return res.json([]);
        const eventLines = fs.readFileSync(EVENTS_PATH, "utf-8").split("\n").filter(Boolean);
        const events = eventLines.slice(-50).map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        return res.json(events);
      } catch { return res.json([]); }
    }
    case "get-logs": {
      const result = getLogs(lines || 100);
      if (result.error && !result.data) return res.json({ error: result.error });
      return res.json(result.data ?? []);
    }
    case "get-team":
      
      return res.json(getTeam());
    case "get-crons":
      return res.json(getCrons());
    case "get-cron-runs": {
      const ids = Array.isArray(jobIds) ? (jobIds as string[]) : getCrons().map((c) => c.id);
      return res.json({ runsByJobId: getCronRuns(ids) });
    }
    case "get-cron-runs-for-job": {
      const jid = singleJobId as string | undefined;
      const lim = typeof runsLimit === "number" && runsLimit > 0 ? Math.min(runsLimit, 100) : 10;
      const off = typeof runsOffset === "number" && runsOffset >= 0 ? runsOffset : 0;
      return res.json(getCronRunsForJob(jid ?? "", lim, off));
    }
    case "get-cron-run-detail": {
      const jid = singleJobId as string | undefined;
      const runAt = typeof runAtMs === "number" ? runAtMs : undefined;
      const detail = jid != null && runAt != null ? getCronRunDetail(jid, runAt) : null;
      if (detail == null) return res.status(404).json({ error: "Run not found" });
      return res.json(detail);
    }
    case "get-cron-by-id": {
      const jid = (singleJobId as string | undefined) ?? (req.body?.jobId as string | undefined);
      const full = typeof jid === "string" ? getCronById(jid) : null;
      if (full == null) return res.status(404).json({ error: "Job not found" });
      return res.json(full);
    }
    case "cron-add": {
      const p = cronAddParams as Record<string, unknown> | undefined;
      if (!p || typeof p.name !== "string" || !p.name.trim()) {
        return res.status(400).json({ success: false, error: "name is required" });
      }
      const session = (p.session as string) || "main";
      const hasAt = typeof p.at === "string" && p.at.trim().length > 0;
      const hasCron = typeof p.cron === "string" && p.cron.trim().length > 0;
      if (!hasAt && !hasCron) {
        return res.status(400).json({ success: false, error: "Either at (ISO or relative e.g. 20m) or cron expression is required" });
      }
      const args = ["cron", "add", "--name", p.name.trim(), "--session", session];
      if (hasAt) args.push("--at", (p.at as string).trim());
      if (hasCron) args.push("--cron", (p.cron as string).trim());
      if (typeof p.tz === "string" && p.tz.trim()) args.push("--tz", p.tz.trim());
      if (typeof p.message === "string" && p.message.trim()) args.push("--message", p.message.trim());
      if (typeof p.systemEvent === "string" && p.systemEvent.trim()) args.push("--system-event", p.systemEvent.trim());
      if (p.deleteAfterRun === true) args.push("--delete-after-run");
      if (p.announce === true) {
        args.push("--announce");
        if (typeof p.channel === "string" && p.channel.trim()) args.push("--channel", p.channel.trim());
        if (typeof p.to === "string" && p.to.trim()) args.push("--to", p.to.trim());
      }
      if (typeof p.stagger === "string" && p.stagger.trim()) args.push("--stagger", p.stagger.trim());
      if (typeof p.model === "string" && p.model.trim()) args.push("--model", p.model.trim());
      if (typeof p.thinking === "string" && p.thinking.trim()) args.push("--thinking", p.thinking.trim());
      if (typeof p.agent === "string" && p.agent.trim()) args.push("--agent", p.agent.trim());
      try {
        await runOpenClawArgs(args, 30000);
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ success: false, error: msg });
      }
    }
    case "cron-run": {
      const jobId = typeof cronRunJobId === "string" ? cronRunJobId.trim() : "";
      if (!jobId || !/^[a-f0-9-]{36}$/i.test(jobId)) {
        return res.status(400).json({ success: false, error: "Valid job id is required" });
      }
      const args = ["cron", "run", jobId];
      if (cronRunDue === true) args.push("--due");
      try {
        await runOpenClawArgs(args, 60000);
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ success: false, error: msg });
      }
    }
    case "cron-runs-sync": {
      const syncJobId = typeof singleJobId === "string" ? singleJobId.trim() : "";
      if (!syncJobId || !/^[a-f0-9-]{36}$/i.test(syncJobId)) {
        return res.status(400).json({ success: false, error: "Valid job id is required" });
      }
      try {
        await runOpenClawArgs(["cron", "runs", "--id", syncJobId, "--limit", "1"], 15000);
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ success: false, error: msg });
      }
    }
    case "cron-edit": {
      const jobId = typeof cronEditJobId === "string" ? cronEditJobId.trim() : "";
      if (!jobId || !/^[a-f0-9-]{36}$/i.test(jobId)) {
        return res.status(400).json({ success: false, error: "Valid job id is required" });
      }
      const p = cronEditParams as Record<string, unknown> | undefined;
      const args = ["cron", "edit", jobId];
      if (typeof p?.name === "string" && p.name.trim()) args.push("--name", p.name.trim());
      if (typeof p?.message === "string" && p.message.trim()) args.push("--message", p.message.trim());
      if (typeof p?.model === "string" && p.model.trim()) args.push("--model", p.model.trim());
      if (typeof p?.thinking === "string" && p.thinking.trim()) args.push("--thinking", p.thinking.trim());
      if (p?.clearAgent === true) args.push("--clear-agent");
      else if (typeof p?.agent === "string" && p.agent.trim()) args.push("--agent", p.agent.trim());
      if (p?.exact === true) args.push("--exact");
      if (args.length === 3) {
        return res.status(400).json({ success: false, error: "At least one field to update is required" });
      }
      try {
        await runOpenClawArgs(args, 15000);
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ success: false, error: msg });
      }
    }
    case "cron-delete": {
      const jobIdToDelete = typeof cronDeleteJobId === "string" ? cronDeleteJobId.trim() : "";
      if (!jobIdToDelete || !/^[a-f0-9-]{36}$/i.test(jobIdToDelete)) {
        return res.status(400).json({ success: false, error: "Valid job id is required" });
      }
      try {
        await runOpenClawArgs(["cron", "rm", jobIdToDelete], 15000);
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ success: false, error: msg });
      }
    }
    case "get-employee-status": {
      const ACTIVE_CRON_WINDOW_MS = 10 * 60 * 1000;
      const team = getTeam() as { id: string; name: string; status: string; role?: string }[];
      const crons = getCrons() as ParsedCronJob[];
      const now = Date.now();
      const employees = team.map((a) => {
        const aId = a.id.toLowerCase();
        const aName = (a.name && a.name.toLowerCase()) || "";
        const assignedCrons = crons.filter((c) => {
          const aid = (c.agentId ?? "").toLowerCase();
          return aid && (aid === aId || aid === aName);
        });
        const currentWorkingJobs = assignedCrons.filter((c) => {
          const lastStatus = (c.lastStatus || "idle").toLowerCase();
          if (lastStatus === "running") return true;
          if (c.lastRunAtMs != null && now - c.lastRunAtMs <= ACTIVE_CRON_WINDOW_MS) return true;
          return false;
        });
        const nextComingCrons = assignedCrons
          .filter((c) => c.nextRun != null && c.nextRun > now)
          .sort((x, y) => (x.nextRun ?? 0) - (y.nextRun ?? 0))
          .map((c) => ({ id: c.id, name: c.name, schedule: c.schedule, nextRunAtMs: c.nextRun, agentId: c.agentId }));
        const currentWorkingIds = new Set(currentWorkingJobs.map((c) => c.id));
        const previousTasks = assignedCrons
          .filter((c) => c.lastRunAtMs != null && !currentWorkingIds.has(c.id))
          .sort((x, y) => (y.lastRunAtMs ?? 0) - (x.lastRunAtMs ?? 0))
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name, schedule: c.schedule, lastRunAtMs: c.lastRunAtMs!, agentId: c.agentId }));
        const status = currentWorkingJobs.length > 0 ? "working" : "idle";
        let currentTask = "Idle";
        if (currentWorkingJobs.length > 0) {
          const byRecency = [...currentWorkingJobs].sort((x, y) => (y.lastRunAtMs ?? 0) - (x.lastRunAtMs ?? 0));
          currentTask = byRecency.map((c) => c.name).join(", ");
        } else {
          if (previousTasks.length > 0) currentTask = previousTasks[0].name || "Idle";
        }
        return {
          id: a.id,
          name: a.name,
          status,
          currentTask: currentTask || "Idle",
          currentWorkingJobs: currentWorkingJobs.map((c) => ({ id: c.id, name: c.name, schedule: c.schedule, agentId: c.agentId })),
          previousTasks,
          nextComingCrons,
        };
      });
      return res.json({ employees });
    }
    case "get-config": {
      return res.json(getConfig());
    }
    case "list-agents": {
      const agents = getTeam();
      return res.json({ success: true, data: agents });
    }
    case "list-models": {
      const models = getDefaultModels();
      return res.json({ success: true, data: models });
    }
    case "list-openclaw-docs": {
      const files = listOpenClawMarkdownFiles();
      const workspaceLabels = getOpenClawWorkspaceLabels();
      return res.json({ success: true, data: { files, workspaceLabels } });
    }
    case "list-openclaw-agent-files": {
      const list = listOpenClawAgentFiles();
      const workspaceLabels = getOpenClawWorkspaceLabels();
      return res.json({ success: true, data: { files: list, workspaceLabels } });
    }
    case "list-openclaw-memory": {
      const sources = listOpenClawMemorySources();
      return res.json({ success: true, data: sources });
    }
    case "get-openclaw-usage": {
      const usage = getOpenClawUsage();
      return res.json({ success: true, data: usage });
    }
    case "search-openclaw-memory-content": {
      const paths = searchOpenClawMemoryContent(query ?? "");
      return res.json({ success: true, paths });
    }
    case "get-openclaw-doc": {
      const docResult = getOpenClawDocContent(relativePath ?? "");
      return res.json(docResult);
    }
    case "write-openclaw-doc": {
      const writeResult = writeOpenClawDocContent(
        relativePath ?? "",
        docContent ?? ""
      );
      return res.json(writeResult);
    }
    case "delete-openclaw-doc": {
      const deleteResult = deleteOpenClawPath(relativePath ?? "");
      return res.json(deleteResult);
    }
    case "create-openclaw-folder": {
      const createFolderResult = createOpenClawFolder(relativePath ?? "");
      return res.json(createFolderResult);
    }
    case "save-local-usage": {
      try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(USAGE_PATH, JSON.stringify(usageData, null, 2), "utf-8");
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.json({ success: false, error: msg });
      }
    }
    case "load-local-usage": {
      try {
        if (!fs.existsSync(USAGE_PATH)) {
          return res.json({ success: true, data: null });
        }
        const raw = fs.readFileSync(USAGE_PATH, "utf-8");
        const data = JSON.parse(raw);
        return res.json({ success: true, data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.json({ success: false, error: msg, data: null });
      }
    }
    case "add-agent": {
      const name = typeof agentName === "string" ? agentName.trim() : "";
      if (!name) return res.status(400).json({ success: false, error: "Agent name is required" });
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return res.status(400).json({ success: false, error: "Agent name may only contain letters, numbers, underscores, hyphens, and dots" });
      if (name.length > 120) return res.status(400).json({ success: false, error: "Agent name too long" });
      const normalizedId = name.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (!normalizedId) return res.status(400).json({ success: false, error: "Agent name must contain at least one letter or number" });
      const workspacePath = path.join(OPENCLAW_DIR, "workspace-" + normalizedId);
      try {
        await runOpenClawArgs(["agents", "add", name, "--workspace", workspacePath, "--non-interactive"], 30000);
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ success: false, error: msg });
      }
    }
    case "delete-agent": {
      const idOrName = typeof agentId === "string" ? agentId.trim() : "";
      if (!idOrName) return res.status(400).json({ success: false, error: "Agent id is required" });
      const normalizedId = idOrName.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (!normalizedId) return res.status(400).json({ success: false, error: "Invalid agent id" });
      if (normalizedId === "main") return res.status(400).json({ success: false, error: "Cannot delete the main agent" });
      try {
        await runOpenClawArgs(["agents", "delete", normalizedId, "--force"], 15000);
        return res.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ success: false, error: msg });
      }
    }
    // Get running cron jobs by parsing CLI output
    case "get-running-crons": {
      try {
        const { stdout } = await execAsync("openclaw sessions", { cwd: OPENCLAW_DIR, env: openclawEnv(), timeout: 10000 });
        const lines = stdout.split("\n").filter((l: string) => l.includes(":cron:"));
        const running = lines.map((l: string) => {
          const match = l.match(/agent:([^:]+):cron:([^\s]+)/);
          return match ? { agentId: match[1], jobId: match[2] } : null;
        }).filter(Boolean);
        return res.json(running);
      } catch {
        return res.json([]);
      }
    }
    // ── Task OS: session transcript API ────────────────────────────────────
    case "get-session-messages": {
      const { sessionKey, runId: sRunId, limit: sLimit, offset: sOffset } = req.body;
      if (!sessionKey) return res.status(400).json({ error: "sessionKey required" });
      const msgs = readSessionMessages(sessionKey, { runId: sRunId, limit: sLimit, offset: sOffset });
      return res.json({ messages: msgs });
    }

    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}
