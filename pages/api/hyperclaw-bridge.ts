import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, exec } from "child_process";
import { promisify } from "util";

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

/** Shape of a single job in ~/.openclaw/cron/jobs.json */
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
      return {
        id: job.id,
        name: job.name || job.id,
        schedule: scheduleStr,
        agentId: job.agentId,
        status: job.enabled !== false ? "active" : "disabled",
        nextRun: job.state?.nextRunAtMs,
        lastRunAtMs: job.state?.lastRunAtMs,
        lastStatus: job.state?.lastStatus,
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

function getCrons(): ParsedCronJob[] {
  const fromJson = getCronsFromJson();
  if (fromJson.length > 0) return fromJson;
  try {
    const env = openclawEnv();
    const output = execSync("openclaw cron list", { encoding: "utf-8", timeout: 10000, cwd: OPENCLAW_DIR, env });
    const lines = output.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    const jobs: ParsedCronJob[] = [];
    for (const line of lines.slice(1)) {
      const parsed = parseCronLine(line);
      if (parsed) jobs.push(parsed);
    }
    return jobs;
  } catch {
    return [];
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

  const { action, task, id, patch, command, date, lines, jobIds, relativePath, content: docContent, todoData, query } = req.body;

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
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}
