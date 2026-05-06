import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".hyperclaw");

// ── SQLite lazy-load (fallback to JSON if not available) ────────────────────
let BetterSqlite3: any = null;
try {
  BetterSqlite3 = require("better-sqlite3");
} catch {
  // better-sqlite3 not available — will use JSON fallback
}

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

type TodoData = { tasks: Record<string, unknown>[]; lists: unknown[]; activeTaskId: string | null };
// ── SQL blocklist for intel_execute (guarded write) ──────────────────────────
const INTEL_SQL_BLOCKLIST = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+INDEX\b/i,
  /\bDROP\s+VIEW\b/i,
  /\bDROP\s+TRIGGER\b/i,
  /\bATTACH\s+DATABASE\b/i,
  /\bDETACH\s+DATABASE\b/i,
  /\bPRAGMA\s+writable_schema\b/i,
  /\bVACUUM\s+INTO\b/i,
  /\bCREATE\s+TRIGGER\b/i,
  /\bload_extension\b/i,
];

const INTEL_DDL_PATTERN = /\b(CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX)\b/i;
const MAX_BACKUP_COUNT = 5;

interface TaskRow { id: string; list_id: string; data: string; created_at: number; updated_at: number }
interface TaskListRow { id: string; data: string; created_at: number; updated_at: number }
interface TaskLogRow { id: number; task_id: string; agent_id: string | null; type: string; content: string; metadata: string; created_at: number }

export class HyperClawBridge {
  private dataDir: string;
  private todoPath: string;
  private eventsPath: string;
  private commandsPath: string;
  private sessionsDir: string;
  private _db: any = null;
  private _dbFailed = false;
  private _migrated = false;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.todoPath = path.join(this.dataDir, "todo.json");
    this.eventsPath = path.join(this.dataDir, "events.jsonl");
    this.commandsPath = path.join(this.dataDir, "commands.jsonl");
    this.sessionsDir = path.join(this.dataDir, "sessions");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private addColumnIfMissing(db: any, table: string, columnSql: string): void {
    const columnName = columnSql.trim().split(/\s+/)[0];
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === columnName)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
    }
  }

  // ── SQLite DB ────────────────────────────────────────────────────────────

  private getDb(): any {
    if (this._db) return this._db;
    if (this._dbFailed || !BetterSqlite3) {
      this._dbFailed = true;
      return null;
    }
    try {
      const dbPath = path.join(this.dataDir, "connector.db");
      this.ensureDir();
      this._db = new BetterSqlite3(dbPath);
      this._db.pragma("journal_mode = WAL");
      this._db.pragma("busy_timeout = 5000");
      this._db.exec(`
        -- Tasks (matches connector schema)
        CREATE TABLE IF NOT EXISTS tasks (
          id         TEXT PRIMARY KEY,
          list_id    TEXT,
          data       TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        -- Task lists
        CREATE TABLE IF NOT EXISTS task_lists (
          id         TEXT PRIMARY KEY,
          data       TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        -- Task logs: agent progress entries / learnings (many per task)
        CREATE TABLE IF NOT EXISTS task_logs (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id    TEXT NOT NULL,
          agent_id   TEXT,
          type       TEXT NOT NULL DEFAULT 'progress',
          content    TEXT NOT NULL,
          metadata   TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_logs_created ON task_logs(created_at);
        -- Task-session links (many sessions per task, many tasks per session)
        CREATE TABLE IF NOT EXISTS task_sessions (
          task_id     TEXT NOT NULL,
          session_key TEXT NOT NULL,
          linked_at   INTEGER NOT NULL,
          PRIMARY KEY (task_id, session_key)
        );
        CREATE INDEX IF NOT EXISTS idx_task_sessions_session ON task_sessions(session_key);
        -- Sessions
        CREATE TABLE IF NOT EXISTS sessions (
          session_key TEXT PRIMARY KEY,
          agent_id TEXT,
          label TEXT,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS session_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_key TEXT NOT NULL,
          run_id TEXT,
          stream TEXT,
          role TEXT,
          content_json TEXT,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sm_session_created
          ON session_messages(session_key, created_at_ms);
        -- Agents registry
        CREATE TABLE IF NOT EXISTS agents (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          type       TEXT,
          emoji      TEXT,
          avatar_data TEXT,
          status     TEXT NOT NULL DEFAULT 'active',
          config     TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        -- Projects
        CREATE TABLE IF NOT EXISTS projects (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          description TEXT,
          kind        TEXT NOT NULL DEFAULT 'project',
          emoji       TEXT,
          lead_agent_id TEXT,
          team_mode_enabled INTEGER NOT NULL DEFAULT 1,
          default_workflow_template_id TEXT,
          status      TEXT NOT NULL DEFAULT 'active',
          created_by  TEXT,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        -- Goals
        CREATE TABLE IF NOT EXISTS goals (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT,
          kpis        TEXT NOT NULL DEFAULT '[]',
          status      TEXT NOT NULL DEFAULT 'active',
          project_id  TEXT,
          created_by  TEXT,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        -- Issues
        CREATE TABLE IF NOT EXISTS issues (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT,
          severity    TEXT NOT NULL DEFAULT 'medium',
          status      TEXT NOT NULL DEFAULT 'open',
          agent_id    TEXT,
          assigned_by TEXT,
          source_file TEXT,
          linear_id   TEXT,
          project_id  TEXT,
          created_by  TEXT,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
        CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);
        -- KV store for flags
        CREATE TABLE IF NOT EXISTS kv (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      this.addColumnIfMissing(this._db, "projects", "kind TEXT NOT NULL DEFAULT 'project'");
      this.addColumnIfMissing(this._db, "projects", "emoji TEXT");
      this.addColumnIfMissing(this._db, "projects", "lead_agent_id TEXT");
      this.addColumnIfMissing(this._db, "projects", "team_mode_enabled INTEGER NOT NULL DEFAULT 1");
      this.addColumnIfMissing(this._db, "projects", "default_workflow_template_id TEXT");
      this.addColumnIfMissing(this._db, "issues", "assigned_by TEXT");
      this.addColumnIfMissing(this._db, "issues", "source_file TEXT");
      this.addColumnIfMissing(this._db, "issues", "linear_id TEXT");
      this.addColumnIfMissing(this._db, "agents", "avatar_data TEXT");
      this.migrateJsonToSqlite();
      return this._db;
    } catch {
      this._dbFailed = true;
      return null;
    }
  }

  // ── One-time JSON -> SQLite migration ────────────────────────────────────

  private migrateJsonToSqlite(): void {
    if (this._migrated || !this._db) return;
    this._migrated = true;

    const flag = this._db.prepare("SELECT value FROM kv WHERE key = ?").get("migrated:todo_json_bridge");
    if (flag) return;

    if (!fs.existsSync(this.todoPath)) {
      this._db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run("migrated:todo_json_bridge", "1", Date.now());
      return;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.todoPath, "utf-8"));
      const tasks: Record<string, unknown>[] = Array.isArray(raw.tasks) ? raw.tasks : [];
      const lists: Record<string, unknown>[] = Array.isArray(raw.lists) ? raw.lists : [];
      const activeTaskId = raw.activeTaskId ?? null;

      const count = (this._db.prepare("SELECT count(*) as c FROM tasks").get() as { c: number }).c;
      if (count === 0 && tasks.length > 0) {
        const insertTask = this._db.prepare(
          "INSERT OR IGNORE INTO tasks (id, list_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        );
        const insertList = this._db.prepare(
          "INSERT OR IGNORE INTO task_lists (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)"
        );
        const tx = this._db.transaction(() => {
          for (const t of tasks) {
            const row = this.taskToRow(t);
            insertTask.run(row.id, row.list_id, row.data, row.created_at, row.updated_at);
          }
          for (const l of lists) {
            const row = this.listToRow(l);
            insertList.run(row.id, row.data, row.created_at, row.updated_at);
          }
          if (activeTaskId) {
            this._db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run("activeTaskId", activeTaskId, Date.now());
          }
        });
        tx();
      }

      this._db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run("migrated:todo_json_bridge", "1", Date.now());
    } catch {
      // Migration failed — will retry next time
    }
  }

  // ── Row <-> Task conversion helpers ──────────────────────────────────────

  private taskToRow(task: Record<string, unknown>): TaskRow {
    const id = String(task._id ?? task.id ?? generateTaskId());
    const list_id = String(task.listId ?? task.list_id ?? "");
    const created_at = task.createdAt ? new Date(String(task.createdAt)).getTime() : Date.now();
    const updated_at = task.updatedAt ? new Date(String(task.updatedAt)).getTime() : Date.now();
    // Strip columns stored separately — everything else goes into data blob
    const {
      _id: _a, id: _b, listId: _c, list_id: _d,
      createdAt: _e, updatedAt: _f, created_at: _g, updated_at: _h,
      ...rest
    } = task;
    return { id, list_id, data: JSON.stringify(rest), created_at, updated_at };
  }

  private rowToTask(row: TaskRow): Record<string, unknown> {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(row.data || "{}"); } catch { /* ignore */ }
    // Prefer the original _id from the data blob (agent-assigned ID) over the
    // SQLite row ID so that task IDs stay consistent across bridge/dashboard/agents.
    const canonicalId = String(data._id || row.id);
    const { _id: _, ...rest } = data;
    return this.normalizeTaskAssignment({
      ...rest,
      id: canonicalId,
      listId: row.list_id || "",
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  }

  /** Find a task row by row ID or by _id inside the data blob */
  private findTaskRow(db: any, id: string): TaskRow | undefined {
    // Try direct row ID first
    let row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    if (row) return row;
    // Fall back to searching by _id in the JSON data blob
    row = db.prepare("SELECT * FROM tasks WHERE json_extract(data, '$._id') = ?").get(id) as TaskRow | undefined;
    return row;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private guessAgentId(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const exact = value.match(/^[a-z0-9_.-]+$/);
    if (exact) return value;
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || undefined;
  }

  private extractAgentFromDescription(description: string | undefined): string | undefined {
    if (!description) return undefined;
    const patterns = [
      /^\*\*Agent:\*\*\s*(.+)$/im,
      /^Agent:\s*(.+)$/im,
      /^Assigned(?:\s+to)?:\s*(.+)$/im,
    ];
    for (const pattern of patterns) {
      const match = description.match(pattern);
      const raw = match?.[1]?.trim();
      if (raw) return raw;
    }
    return undefined;
  }

  private normalizeTaskAssignment(task: Record<string, unknown>): Record<string, unknown> {
    const description = this.asString(task.description);
    const assignedAgent =
      this.asString(task.assignedAgent) ??
      this.asString(task.assignedAgentName) ??
      this.asString(task.agent) ??
      this.extractAgentFromDescription(description);
    const assignedAgentId =
      this.asString(task.assignedAgentId) ??
      this.asString(task.agentId) ??
      this.guessAgentId(assignedAgent);

    return {
      ...task,
      ...(assignedAgent ? { assignedAgent } : {}),
      ...(assignedAgentId ? { assignedAgentId } : {}),
    };
  }

  private listToRow(list: Record<string, unknown>): TaskListRow {
    const id = String(list._id ?? list.id ?? generateTaskId());
    const now = Date.now();
    const { _id: _a, id: _b, ...rest } = list;
    return { id, data: JSON.stringify(rest), created_at: now, updated_at: now };
  }

  private rowToList(row: TaskListRow): Record<string, unknown> {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(row.data || "{}"); } catch { /* ignore */ }
    return { ...data, _id: row.id, id: row.id };
  }

  // ── JSON fallback helpers (kept for when SQLite unavailable) ──────────────

  private readTodoData(): TodoData {
    try {
      if (!fs.existsSync(this.todoPath)) return { tasks: [], lists: [], activeTaskId: null };
      const raw = JSON.parse(fs.readFileSync(this.todoPath, "utf-8"));
      return {
        tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
        lists: Array.isArray(raw.lists) ? raw.lists : [],
        activeTaskId: raw.activeTaskId ?? null,
      };
    } catch {
      return { tasks: [], lists: [], activeTaskId: null };
    }
  }

  private writeTodoData(data: TodoData): void {
    this.ensureDir();
    fs.writeFileSync(this.todoPath, JSON.stringify(data, null, 2), "utf-8");
  }

  // ── Task CRUD (SQLite-first, JSON fallback) ──────────────────────────────

  addTask(task: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    agent?: string;
    kind?: string;
    projectId?: string;
    goalId?: string;
    dueAt?: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
  }): Record<string, unknown> {
    // If externalId provided, upsert by external ID
    if (task.externalId) {
      const { externalId, agent, ...fields } = task;
      return this.upsertTask({
        externalId,
        data: { ...fields, ...(agent ? { assignedAgent: agent } : {}) },
      });
    }

    const now = new Date().toISOString();
    const { agent, kind, projectId, goalId, dueAt, ...rest } = task;
    const id = generateTaskId();
    const newTask: Record<string, unknown> = {
      ...rest,
      ...(agent ? { assignedAgent: agent } : {}),
      ...(kind ? { kind } : {}),
      ...(projectId ? { projectId } : {}),
      ...(goalId ? { goalId } : {}),
      ...(dueAt ? { dueAt } : {}),
      id,
      _id: id,
      listId: "",
      status: task.status || "pending",
      createdAt: now,
      updatedAt: now,
    };

    const db = this.getDb();
    if (db) {
      const row = this.taskToRow(newTask);
      db.prepare("INSERT INTO tasks (id, list_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        row.id, row.list_id, row.data, row.created_at, row.updated_at
      );
      return newTask;
    }

    const todo = this.readTodoData();
    todo.tasks.push(newTask);
    this.writeTodoData(todo);
    return newTask;
  }

  getTasks(): Record<string, unknown>[] {
    const db = this.getDb();
    if (db) {
      return (db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as TaskRow[]).map((r) => this.rowToTask(r));
    }
    return this.readTodoData().tasks;
  }

  updateTask(id: string, patch: Record<string, unknown>): Record<string, unknown> | undefined {
    const db = this.getDb();
    if (db) {
      const row = this.findTaskRow(db, id);
      if (!row) return undefined;
      const rowId = row.id; // actual SQLite row ID
      const task = this.rowToTask(row);
      const now = Date.now();

      if (patch.status === "completed" && task.status !== "completed") {
        patch.finishedAt = new Date(now).toISOString();
      } else if (patch.status && patch.status !== "completed" && task.status === "completed") {
        patch.finishedAt = null;
      }

      Object.assign(task, patch);
      const updated = this.taskToRow(task);
      db.prepare("UPDATE tasks SET list_id = ?, data = ?, updated_at = ? WHERE id = ?").run(
        updated.list_id, updated.data, now, rowId
      );
      return this.rowToTask({ ...updated, id: rowId, created_at: row.created_at, updated_at: now });
    }

    // JSON fallback
    const todo = this.readTodoData();
    const idx = todo.tasks.findIndex((t) => {
      const rec = t as Record<string, unknown>;
      return rec.id === id || rec._id === id;
    });
    if (idx === -1) return undefined;
    const task = todo.tasks[idx] as Record<string, unknown>;
    const nowIso = new Date().toISOString();
    task.updatedAt = nowIso;
    if (patch.status === "completed" && task.status !== "completed") {
      task.finishedAt = nowIso;
    } else if (patch.status && patch.status !== "completed" && task.status === "completed") {
      task.finishedAt = null;
    }
    Object.assign(task, patch);
    this.writeTodoData(todo);
    return task;
  }

  deleteTask(id: string): boolean {
    const db = this.getDb();
    if (db) {
      const row = this.findTaskRow(db, id);
      if (!row) return false;
      const rowId = row.id;
      const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(rowId);
      if (result.changes > 0) {
        // Clean up logs/sessions by both row ID and canonical ID
        db.prepare("DELETE FROM task_logs WHERE task_id = ? OR task_id = ?").run(rowId, id);
        db.prepare("DELETE FROM task_sessions WHERE task_id = ? OR task_id = ?").run(rowId, id);
        return true;
      }
      return false;
    }

    const todo = this.readTodoData();
    const filtered = todo.tasks.filter((t) => {
      const rec = t as Record<string, unknown>;
      return rec.id !== id && rec._id !== id;
    });
    if (filtered.length === todo.tasks.length) return false;
    todo.tasks = filtered;
    this.writeTodoData(todo);
    return true;
  }

  // ── Full TodoData read/write (dashboard compat) ──────────────────────────

  getTodoData(): TodoData {
    const db = this.getDb();
    if (db) {
      const taskRows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as TaskRow[];
      const listRows = db.prepare("SELECT * FROM task_lists ORDER BY created_at ASC").all() as TaskListRow[];
      const activeRow = db.prepare("SELECT value FROM kv WHERE key = ?").get("activeTaskId") as { value: string } | undefined;
      return {
        tasks: taskRows.map((r) => this.rowToTask(r)),
        lists: listRows.map((r) => this.rowToList(r)),
        activeTaskId: activeRow?.value || null,
      };
    }
    return this.readTodoData();
  }

  saveTodoData(data: TodoData): void {
    const db = this.getDb();
    if (db) {
      const tx = db.transaction(() => {
        // Upsert tasks instead of DELETE + reinsert to avoid wiping task_logs/task_sessions references
        const incomingIds = new Set<string>();
        const upsert = db.prepare(
          "INSERT OR REPLACE INTO tasks (id, list_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        );
        for (const t of data.tasks) {
          const row = this.taskToRow(t);
          incomingIds.add(row.id);
          upsert.run(row.id, row.list_id, row.data, row.created_at, row.updated_at);
        }
        const existing = db.prepare("SELECT id FROM tasks").all() as { id: string }[];
        const del = db.prepare("DELETE FROM tasks WHERE id = ?");
        for (const row of existing) {
          if (!incomingIds.has(row.id)) del.run(row.id);
        }
        // Lists
        const incomingListIds = new Set<string>();
        const upsertL = db.prepare(
          "INSERT OR REPLACE INTO task_lists (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)"
        );
        for (const l of data.lists as Record<string, unknown>[]) {
          const row = this.listToRow(l);
          incomingListIds.add(row.id);
          upsertL.run(row.id, row.data, row.created_at, row.updated_at);
        }
        const existingLists = db.prepare("SELECT id FROM task_lists").all() as { id: string }[];
        const delL = db.prepare("DELETE FROM task_lists WHERE id = ?");
        for (const row of existingLists) {
          if (!incomingListIds.has(row.id)) delL.run(row.id);
        }
        db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run(
          "activeTaskId", data.activeTaskId ?? "", Date.now()
        );
      });
      tx();
      return;
    }
    this.writeTodoData(data);
  }

  // ── Task OS: query / upsert / claim ──────────────────────────────────────

  queryTasks(filters: {
    agentId?: string;
    agent?: string;
    status?: string;
    kind?: string;
    projectId?: string;
    goalId?: string;
    limit?: number;
    sort?: string;
  }): Record<string, unknown>[] {
    let tasks: Record<string, unknown>[];
    const db = this.getDb();
    if (db) {
      // Auto-release expired leases before returning
      const now = Date.now();
      const expiredRows = (db.prepare("SELECT * FROM tasks").all() as TaskRow[]).filter((r) => {
        try {
          const d = JSON.parse(r.data || "{}");
          const lease = d.lease as { expiresAtMs?: number } | undefined;
          return d.status === "in_progress" && lease?.expiresAtMs && lease.expiresAtMs < now;
        } catch { return false; }
      });
      for (const row of expiredRows) {
        try {
          const d = JSON.parse(row.data || "{}");
          delete d.lease;
          d.status = "pending";
          db.prepare("UPDATE tasks SET data = ?, updated_at = ? WHERE id = ?")
            .run(JSON.stringify(d), now, row.id);
        } catch { /* ignore */ }
      }
      tasks = (db.prepare("SELECT * FROM tasks").all() as TaskRow[]).map((r) => this.rowToTask(r));
    } else {
      tasks = this.readTodoData().tasks;
    }

    const agentFilter = filters.agentId || filters.agent;
    if (agentFilter) {
      tasks = tasks.filter(
        (t) => t.assignedAgent === agentFilter || t.agent === agentFilter || (t as any).agentId === agentFilter
      );
    }
    if (filters.status) {
      tasks = tasks.filter((t) => t.status === filters.status);
    }
    if (filters.kind) {
      tasks = tasks.filter((t) => {
        const d = t.data as Record<string, unknown> | undefined;
        return (t as any).kind === filters.kind || d?.kind === filters.kind;
      });
    }
    if (filters.projectId) {
      tasks = tasks.filter((t) => (t as any).projectId === filters.projectId);
    }
    if (filters.goalId) {
      tasks = tasks.filter((t) => (t as any).goalId === filters.goalId);
    }
    if (filters.sort === "oldest") {
      tasks.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
    } else {
      tasks.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    }
    if (filters.limit && filters.limit > 0) {
      tasks = tasks.slice(0, filters.limit);
    }
    return tasks;
  }

  upsertTask(params: {
    externalId: string;
    data: Record<string, unknown>;
  }): Record<string, unknown> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const incomingData = (params.data.data as Record<string, unknown>) || {};
    const mergedData = { ...incomingData, external_id: params.externalId };
    const { data: _d, ...topFields } = params.data;

    const db = this.getDb();
    if (db) {
      // Find existing by external_id in data blob
      const allRows = db.prepare("SELECT * FROM tasks").all() as TaskRow[];
      const existing = allRows.find((r) => {
        try {
          const d = JSON.parse(r.data || "{}");
          const nested = d.data as Record<string, unknown> | undefined;
          return nested?.external_id === params.externalId || d.external_id === params.externalId;
        } catch { return false; }
      });

      if (existing) {
        const task = this.rowToTask(existing);
        const existingNestedData = (task.data as Record<string, unknown>) || {};
        Object.assign(task, topFields);
        task.data = { ...existingNestedData, ...mergedData };
        task.updatedAt = nowIso;
        const updated = this.taskToRow(task);
        db.prepare("UPDATE tasks SET list_id = ?, data = ?, updated_at = ? WHERE id = ?").run(
          updated.list_id, updated.data, now, existing.id
        );
        return this.rowToTask({ ...updated, id: existing.id, created_at: existing.created_at, updated_at: now });
      }

      const id = generateTaskId();
      const newTask: Record<string, unknown> = {
        ...topFields,
        id,
        _id: id,
        data: mergedData,
        status: topFields.status || "pending",
        priority: topFields.priority || "medium",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const row = this.taskToRow(newTask);
      db.prepare("INSERT INTO tasks (id, list_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
        id, row.list_id, row.data, now, now
      );
      return newTask;
    }

    // JSON fallback
    const todo = this.readTodoData();
    const idx = todo.tasks.findIndex((t) => {
      const d = t.data as Record<string, unknown> | undefined;
      return d?.external_id === params.externalId;
    });

    if (idx !== -1) {
      const task = todo.tasks[idx] as Record<string, unknown>;
      const existingData = (task.data as Record<string, unknown>) || {};
      Object.assign(task, topFields);
      task.data = { ...existingData, ...mergedData };
      task.updatedAt = nowIso;
      this.writeTodoData(todo);
      return task;
    }

    const newTask: Record<string, unknown> = {
      ...topFields,
      id: generateTaskId(),
      data: mergedData,
      status: topFields.status || "pending",
      priority: topFields.priority || "medium",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    todo.tasks.push(newTask);
    this.writeTodoData(todo);
    return newTask;
  }

  claimTask(params: {
    id?: string;
    externalId?: string;
    claimant: string;
    leaseSeconds: number;
  }): { success: boolean; task?: Record<string, unknown>; reason?: string } {
    const db = this.getDb();
    if (db) {
      let row: TaskRow | undefined;
      if (params.id) {
        row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(params.id) as TaskRow | undefined;
      } else if (params.externalId) {
        const allRows = db.prepare("SELECT * FROM tasks").all() as TaskRow[];
        row = allRows.find((r) => {
          try {
            const d = JSON.parse(r.data || "{}");
            const nested = d.data as Record<string, unknown> | undefined;
            return nested?.external_id === params.externalId;
          } catch { return false; }
        });
      }
      if (!row) return { success: false, reason: "Task not found" };

      const task = this.rowToTask(row);
      const data = ((task.data as Record<string, unknown>) || {}) as Record<string, unknown>;
      const lease = data.lease as { claimedBy?: string; expiresAtMs?: number } | undefined;
      const now = Date.now();
      const status = String(task.status || "pending");

      if (status !== "pending") {
        return {
          success: false,
          reason: `Task not claimable while status=${status}`,
          task,
        };
      }

      if (lease && lease.expiresAtMs && lease.expiresAtMs > now) {
        return {
          success: false,
          reason: `Already claimed by ${lease.claimedBy} until ${new Date(lease.expiresAtMs).toISOString()}`,
          task,
        };
      }

      data.lease = { claimedBy: params.claimant, expiresAtMs: now + params.leaseSeconds * 1000 };
      task.data = data;
      task.status = "in_progress";
      task.updatedAt = new Date().toISOString();
      const updated = this.taskToRow(task);
      db.prepare("UPDATE tasks SET data = ?, updated_at = ? WHERE id = ?").run(updated.data, now, row.id);
      return { success: true, task: this.rowToTask({ ...updated, id: row.id, created_at: row.created_at, updated_at: now }) };
    }

    // JSON fallback
    const todo = this.readTodoData();
    let idx = -1;
    if (params.id) {
      idx = todo.tasks.findIndex((t) => (t as any).id === params.id || (t as any)._id === params.id);
    } else if (params.externalId) {
      idx = todo.tasks.findIndex((t) => {
        const d = t.data as Record<string, unknown> | undefined;
        return d?.external_id === params.externalId;
      });
    }
    if (idx === -1) return { success: false, reason: "Task not found" };

    const task = todo.tasks[idx] as Record<string, unknown>;
    const data = ((task.data as Record<string, unknown>) || {}) as Record<string, unknown>;
    const lease = data.lease as { claimedBy?: string; expiresAtMs?: number } | undefined;
    const now = Date.now();
    const status = String(task.status || "pending");
    if (status !== "pending") {
      return {
        success: false,
        reason: `Task not claimable while status=${status}`,
        task,
      };
    }
    if (lease && lease.expiresAtMs && lease.expiresAtMs > now) {
      return {
        success: false,
        reason: `Already claimed by ${lease.claimedBy} until ${new Date(lease.expiresAtMs).toISOString()}`,
        task,
      };
    }
    data.lease = { claimedBy: params.claimant, expiresAtMs: now + params.leaseSeconds * 1000 };
    task.data = data;
    task.status = "in_progress";
    task.updatedAt = new Date().toISOString();
    this.writeTodoData(todo);
    return { success: true, task };
  }

  // ── Task Logs (multiple per task) ────────────────────────────────────────

  appendTaskLog(params: {
    taskId: string;
    agentId?: string;
    type?: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Record<string, unknown> {
    const db = this.getDb();
    const now = Date.now();
    if (!db) return { error: "SQLite not available for task logs" };

    const result = db.prepare(
      "INSERT INTO task_logs (task_id, agent_id, type, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      params.taskId, params.agentId ?? null, params.type ?? "progress",
      params.content, JSON.stringify(params.metadata ?? {}), now
    );
    return {
      id: Number(result.lastInsertRowid),
      task_id: params.taskId,
      agent_id: params.agentId ?? null,
      type: params.type ?? "progress",
      content: params.content,
      metadata: params.metadata ?? {},
      created_at: now,
    };
  }

  getTaskLogs(taskId: string, opts?: { type?: string; limit?: number; offset?: number }): Record<string, unknown>[] {
    const db = this.getDb();
    if (!db) return [];

    let sql = "SELECT * FROM task_logs WHERE task_id = ?";
    const binds: unknown[] = [taskId];
    if (opts?.type) { sql += " AND type = ?"; binds.push(opts.type); }
    sql += " ORDER BY created_at DESC";
    if (opts?.limit) {
      sql += " LIMIT ?"; binds.push(opts.limit);
      if (opts?.offset) { sql += " OFFSET ?"; binds.push(opts.offset); }
    }

    return (db.prepare(sql).all(...binds) as TaskLogRow[]).map((r) => ({
      id: r.id,
      task_id: r.task_id,
      agent_id: r.agent_id,
      type: r.type,
      content: r.content,
      metadata: (() => { try { return JSON.parse(r.metadata || "{}"); } catch { return {}; } })(),
      created_at: r.created_at,
    }));
  }

  // ── Task-Session Links (many-to-many) ────────────────────────────────────

  linkTaskSession(taskId: string, sessionKey: string): { success: boolean } {
    const db = this.getDb();
    if (!db) return { success: false };
    db.prepare(
      "INSERT OR IGNORE INTO task_sessions (task_id, session_key, linked_at) VALUES (?, ?, ?)"
    ).run(taskId, sessionKey, Date.now());
    return { success: true };
  }

  unlinkTaskSession(taskId: string, sessionKey: string): { success: boolean } {
    const db = this.getDb();
    if (!db) return { success: false };
    const result = db.prepare("DELETE FROM task_sessions WHERE task_id = ? AND session_key = ?").run(taskId, sessionKey);
    return { success: result.changes > 0 };
  }

  getTaskSessions(taskId: string): Record<string, unknown>[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      `SELECT ts.session_key, ts.linked_at, s.agent_id, s.label, s.created_at_ms, s.updated_at_ms
       FROM task_sessions ts
       LEFT JOIN sessions s ON s.session_key = ts.session_key
       WHERE ts.task_id = ?
       ORDER BY ts.linked_at DESC`
    ).all(taskId) as Record<string, unknown>[];
  }

  getSessionTasks(sessionKey: string): Record<string, unknown>[] {
    const db = this.getDb();
    if (!db) return [];
    const rows = db.prepare(
      `SELECT t.*, ts.linked_at
       FROM task_sessions ts
       JOIN tasks t ON t.id = ts.task_id
       WHERE ts.session_key = ?
       ORDER BY ts.linked_at DESC`
    ).all(sessionKey) as (TaskRow & { linked_at: number })[];
    return rows.map((r) => ({ ...this.rowToTask(r), linked_at: r.linked_at }));
  }

  // ── Intel DB (separate intel.db) ──────────────────────────────────────────

  private _intelDb: any = null;
  private _intelDbFailed = false;

  getIntelDb(): any {
    if (this._intelDb) return this._intelDb;
    if (this._intelDbFailed || !BetterSqlite3) {
      this._intelDbFailed = true;
      return null;
    }
    try {
      const dbPath = path.join(this.dataDir, "intel.db");
      this.ensureDir();
      this._intelDb = new BetterSqlite3(dbPath);
      this._intelDb.pragma("journal_mode = WAL");
      this._intelDb.pragma("busy_timeout = 5000");
      this._intelDb.pragma("foreign_keys = ON");

      // Seeded schema — contacts as the starting table;
      // agents can CREATE TABLE for anything else they need.
      this._intelDb.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          role        TEXT,
          company     TEXT,
          channel     TEXT,
          handle      TEXT,
          status      TEXT DEFAULT 'lead',
          notes       TEXT,
          created_by  TEXT,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
      `);

      return this._intelDb;
    } catch {
      this._intelDbFailed = true;
      return null;
    }
  }

  // ── Intel: Schema introspection ────────────────────────────────────────────

  intelSchema(): Record<string, unknown> {
    const db = this.getIntelDb();
    if (!db) return { error: "Intel DB not available" };

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name"
    ).all() as { name: string }[];

    const result: Record<string, unknown> = {};
    for (const { name } of tables) {
      const columns = db.prepare(`PRAGMA table_info("${name}")`).all() as {
        name: string; type: string; notnull: number; dflt_value: string | null; pk: number;
      }[];
      const count = (db.prepare(`SELECT count(*) as c FROM "${name}"`).get() as { c: number }).c;

      // Freshness stats
      let freshness: Record<string, unknown> | null = null;
      const hasUpdatedAt = columns.some((c) => c.name === "updated_at");
      const hasCreatedAt = columns.some((c) => c.name === "created_at");
      const timeCol = hasUpdatedAt ? "updated_at" : hasCreatedAt ? "created_at" : null;
      if (timeCol && count > 0) {
        const stats = db.prepare(
          `SELECT MIN("${timeCol}") as oldest, MAX("${timeCol}") as newest FROM "${name}"`
        ).get() as { oldest: number; newest: number };
        freshness = { oldest: stats.oldest, newest: stats.newest, column: timeCol };
      }

      // Indexes
      const indexes = db.prepare(`PRAGMA index_list("${name}")`).all() as { name: string; unique: number }[];

      result[name] = {
        columns: columns.map((c) => ({
          name: c.name, type: c.type, notnull: !!c.notnull, default: c.dflt_value, pk: !!c.pk,
        })),
        row_count: count,
        freshness,
        indexes: indexes.map((i) => ({ name: i.name, unique: !!i.unique })),
      };
    }
    return { tables: result };
  }

  // ── Intel: Read-only query (stmt.reader enforcement) ───────────────────────

  intelQuery(sql: string): Record<string, unknown> {
    const db = this.getIntelDb();
    if (!db) return { error: "Intel DB not available" };

    try {
      // Auto-inject LIMIT if not present
      const hasLimit = /\bLIMIT\b/i.test(sql);
      const execSql = hasLimit ? sql : `${sql.replace(/;?\s*$/, "")} LIMIT 1000`;

      const stmt = db.prepare(execSql);
      if (!stmt.reader) {
        return { error: "Blocked: only read-only queries allowed" };
      }

      const rows = stmt.all();
      const result: Record<string, unknown> = { rows, count: rows.length };

      // Check if we hit the auto-limit
      if (!hasLimit && rows.length >= 1000) {
        const countStmt = db.prepare(`SELECT count(*) as total FROM (${sql.replace(/;?\s*$/, "")})`);
        if (countStmt.reader) {
          const { total } = countStmt.get() as { total: number };
          result.total_count = total;
          result.truncated = true;
          result.warning = `Results truncated to 1000 rows (total: ${total}). Use LIMIT/OFFSET for pagination.`;
        }
      }
      return result;
    } catch (err: any) {
      return { error: `SQL error: ${err.message}` };
    }
  }

  // ── Intel: Guarded write (DDL + complex writes) ────────────────────────────

  intelExecute(sql: string, agentId?: string): Record<string, unknown> {
    const db = this.getIntelDb();
    if (!db) return { error: "Intel DB not available" };

    // Check blocklist
    for (const pattern of INTEL_SQL_BLOCKLIST) {
      if (pattern.test(sql)) {
        return { error: `Blocked: ${sql.match(pattern)?.[0]} not allowed` };
      }
    }

    // Check DELETE without WHERE
    if (/\bDELETE\s+FROM\b/i.test(sql) && !/\bWHERE\b/i.test(sql)) {
      return { error: "Blocked: DELETE requires WHERE clause" };
    }

    try {
      const isDDL = INTEL_DDL_PATTERN.test(sql);

      // Auto-backup before DDL
      if (isDDL) {
        this.intelBackup();
      }

      const stmt = db.prepare(sql);
      if (stmt.reader) {
        // It's actually a read — just run it
        return { rows: stmt.all(), count: stmt.all().length };
      }

      const result = stmt.run();
      return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid), ddl: isDDL };
    } catch (err: any) {
      return { error: `SQL error: ${err.message}` };
    }
  }

  // ── Intel: Parameterized insert ────────────────────────────────────────────

  intelInsert(
    table: string,
    data: Record<string, unknown>,
    agentId?: string
  ): Record<string, unknown> {
    const db = this.getIntelDb();
    if (!db) return { error: "Intel DB not available" };

    // Validate table exists
    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(table);
    if (!tableInfo) return { error: `Table '${table}' does not exist` };

    // Validate columns
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
    const validCols = new Set(columns.map((c) => c.name));
    for (const key of Object.keys(data)) {
      if (!validCols.has(key)) {
        return { error: `Column '${key}' not found in ${table}` };
      }
    }

    // Auto-inject created_by if available
    if (agentId && validCols.has("created_by") && !data.created_by) {
      data.created_by = agentId;
    }
    // Auto-inject timestamps
    const now = Date.now();
    if (validCols.has("created_at") && !data.created_at) data.created_at = now;
    if (validCols.has("updated_at") && !data.updated_at) data.updated_at = now;


    try {
      const cols = Object.keys(data);
      const placeholders = cols.map(() => "?").join(", ");
      const values = cols.map((c) => data[c]);
      const stmt = db.prepare(
        `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`
      );
      const result = stmt.run(...values);
      return {
        inserted: true,
        id: result.lastInsertRowid ? Number(result.lastInsertRowid) : data.id,
        changes: result.changes,
      };
    } catch (err: any) {
      if (err.message.includes("UNIQUE constraint")) {
        return { error: `Duplicate: ${err.message}` };
      }
      if (err.message.includes("FOREIGN KEY constraint")) {
        return { error: `Foreign key constraint failed: ${err.message}` };
      }
      return { error: `Insert error: ${err.message}` };
    }
  }

  // ── Intel: Parameterized update ────────────────────────────────────────────

  intelUpdate(
    table: string,
    data: Record<string, unknown>,
    where: Record<string, unknown>
  ): Record<string, unknown> {
    const db = this.getIntelDb();
    if (!db) return { error: "Intel DB not available" };

    // Validate table
    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(table);
    if (!tableInfo) return { error: `Table '${table}' does not exist` };

    // Validate columns
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
    const validCols = new Set(columns.map((c) => c.name));
    for (const key of [...Object.keys(data), ...Object.keys(where)]) {
      if (!validCols.has(key)) {
        return { error: `Column '${key}' not found in ${table}` };
      }
    }

    // Auto-inject updated_at
    if (validCols.has("updated_at") && !data.updated_at) data.updated_at = Date.now();

    try {
      const setCols = Object.keys(data);
      const whereCols = Object.keys(where);
      const setClause = setCols.map((c) => `"${c}" = ?`).join(", ");
      const whereClause = whereCols.map((c) => `"${c}" = ?`).join(" AND ");
      const values = [...setCols.map((c) => data[c]), ...whereCols.map((c) => where[c])];

      const result = db.prepare(
        `UPDATE "${table}" SET ${setClause} WHERE ${whereClause}`
      ).run(...values);
      return { updated: true, changes: result.changes };
    } catch (err: any) {
      return { error: `Update error: ${err.message}` };
    }
  }

  // ── Intel: Parameterized delete ────────────────────────────────────────────

  intelDelete(
    table: string,
    where: Record<string, unknown>
  ): Record<string, unknown> {
    const db = this.getIntelDb();
    if (!db) return { error: "Intel DB not available" };

    if (!where || Object.keys(where).length === 0) {
      return { error: "Delete requires a where clause" };
    }

    // Validate table
    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(table);
    if (!tableInfo) return { error: `Table '${table}' does not exist` };

    // Validate columns
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
    const validCols = new Set(columns.map((c) => c.name));
    for (const key of Object.keys(where)) {
      if (!validCols.has(key)) {
        return { error: `Column '${key}' not found in ${table}` };
      }
    }

    try {
      const whereCols = Object.keys(where);
      const whereClause = whereCols.map((c) => `"${c}" = ?`).join(" AND ");
      const values = whereCols.map((c) => where[c]);

      const result = db.prepare(`DELETE FROM "${table}" WHERE ${whereClause}`).run(...values);
      if (result.changes === 0) {
        return { deleted: false, changes: 0, warning: "No rows matched the condition" };
      }
      return { deleted: true, changes: result.changes };
    } catch (err: any) {
      return { error: `Delete error: ${err.message}` };
    }
  }

  // ── Intel: Agent status update ─────────────────────────────────────────────

  // ── Intel: Auto-backup (rotate last N) ─────────────────────────────────────

  private intelBackup(): void {
    try {
      const dbPath = path.join(this.dataDir, "intel.db");
      if (!fs.existsSync(dbPath)) return;

      const backupDir = path.join(this.dataDir, "intel_backups");
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const timestamp = Date.now();
      const backupPath = path.join(backupDir, `intel_${timestamp}.db`);
      fs.copyFileSync(dbPath, backupPath);

      // Rotate: keep only last N backups
      const backups = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith("intel_") && f.endsWith(".db"))
        .sort()
        .reverse();

      for (const old of backups.slice(MAX_BACKUP_COUNT)) {
        fs.unlinkSync(path.join(backupDir, old));
      }
    } catch {
      // Backup failed — log but don't block
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────

  emitEvent(type: string, data: Record<string, unknown>): void {
    this.ensureDir();
    const entry = {
      type,
      timestamp: new Date().toISOString(),
      source: "openclaw",
      ...data,
    };
    fs.appendFileSync(this.eventsPath, JSON.stringify(entry) + "\n", "utf-8");
  }

  readCommands(): Record<string, unknown>[] {
    try {
      if (!fs.existsSync(this.commandsPath)) return [];
      const content = fs.readFileSync(this.commandsPath, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      const commands = lines
        .map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } })
        .filter((c): c is Record<string, unknown> => c != null);
      fs.writeFileSync(this.commandsPath, "", "utf-8");
      return commands;
    } catch {
      return [];
    }
  }

  // ── Sessions + Transcript Storage ───────────────────────────────────────

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  private sessionIndexPath(): string { return path.join(this.sessionsDir, "index.json"); }

  private readSessionIndex(): Record<string, unknown>[] {
    try {
      const p = this.sessionIndexPath();
      if (!fs.existsSync(p)) return [];
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      return Array.isArray(raw.sessions) ? raw.sessions : [];
    } catch { return []; }
  }

  private writeSessionIndex(sessions: Record<string, unknown>[]): void {
    this.ensureSessionsDir();
    fs.writeFileSync(this.sessionIndexPath(), JSON.stringify({ sessions }, null, 2), "utf-8");
  }

  private sessionMessagesPath(sessionKey: string): string {
    const safe = sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.sessionsDir, `${safe}.jsonl`);
  }

  sessionUpsert(params: { sessionKey: string; agentId?: string; label?: string }): Record<string, unknown> {
    const now = Date.now();
    const db = this.getDb();
    if (db) {
      const existing = db.prepare("SELECT * FROM sessions WHERE session_key = ?").get(params.sessionKey);
      if (existing) {
        db.prepare(
          "UPDATE sessions SET agent_id = COALESCE(?, agent_id), label = COALESCE(?, label), updated_at_ms = ? WHERE session_key = ?"
        ).run(params.agentId ?? null, params.label ?? null, now, params.sessionKey);
      } else {
        db.prepare(
          "INSERT INTO sessions (session_key, agent_id, label, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)"
        ).run(params.sessionKey, params.agentId ?? null, params.label ?? null, now, now);
      }
      return db.prepare("SELECT * FROM sessions WHERE session_key = ?").get(params.sessionKey) as Record<string, unknown>;
    }

    const sessions = this.readSessionIndex();
    const idx = sessions.findIndex((s) => s.session_key === params.sessionKey);
    if (idx !== -1) {
      if (params.agentId !== undefined) sessions[idx].agent_id = params.agentId;
      if (params.label !== undefined) sessions[idx].label = params.label;
      sessions[idx].updated_at_ms = now;
      this.writeSessionIndex(sessions);
      return sessions[idx];
    }
    const newSession: Record<string, unknown> = {
      session_key: params.sessionKey, agent_id: params.agentId ?? null,
      label: params.label ?? null, created_at_ms: now, updated_at_ms: now,
    };
    sessions.push(newSession);
    this.writeSessionIndex(sessions);
    return newSession;
  }

  sessionAppendMessages(
    sessionKey: string,
    messages: { runId?: string; stream?: string; role?: string; content: unknown }[]
  ): { count: number } {
    const now = Date.now();
    const db = this.getDb();
    if (db) {
      const insert = db.prepare(
        "INSERT INTO session_messages (session_key, run_id, stream, role, content_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const tx = db.transaction(() => {
        for (const msg of messages) {
          insert.run(sessionKey, msg.runId ?? null, msg.stream ?? null, msg.role ?? null, JSON.stringify(msg.content), now);
        }
      });
      tx();
      db.prepare("UPDATE sessions SET updated_at_ms = ? WHERE session_key = ?").run(now, sessionKey);
      return { count: messages.length };
    }

    this.ensureSessionsDir();
    const fpath = this.sessionMessagesPath(sessionKey);
    const lines = messages.map((msg) =>
      JSON.stringify({
        session_key: sessionKey, run_id: msg.runId ?? null,
        stream: msg.stream ?? null, role: msg.role ?? null,
        content: msg.content, created_at_ms: now,
      })
    );
    fs.appendFileSync(fpath, lines.join("\n") + "\n", "utf-8");
    return { count: messages.length };
  }

  sessionGetMessages(
    sessionKey: string,
    opts?: { runId?: string; limit?: number; offset?: number }
  ): Record<string, unknown>[] {
    const db = this.getDb();
    if (db) {
      let sql = "SELECT * FROM session_messages WHERE session_key = ?";
      const binds: unknown[] = [sessionKey];
      if (opts?.runId) { sql += " AND run_id = ?"; binds.push(opts.runId); }
      sql += " ORDER BY created_at_ms ASC, id ASC";
      if (opts?.limit) {
        sql += " LIMIT ?"; binds.push(opts.limit);
        if (opts?.offset) { sql += " OFFSET ?"; binds.push(opts.offset); }
      }
      return db.prepare(sql).all(...binds) as Record<string, unknown>[];
    }

    const fpath = this.sessionMessagesPath(sessionKey);
    if (!fs.existsSync(fpath)) return [];
    try {
      const content = fs.readFileSync(fpath, "utf-8");
      let msgs = content.split("\n").filter(Boolean)
        .map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } })
        .filter((m): m is Record<string, unknown> => m != null);
      if (opts?.runId) msgs = msgs.filter((m) => m.run_id === opts.runId);
      const start = opts?.offset ?? 0;
      if (opts?.limit) { msgs = msgs.slice(start, start + opts.limit); }
      else if (start > 0) { msgs = msgs.slice(start); }
      return msgs;
    } catch { return []; }
  }

  // ── Agents registry ───────────────────────────────────────────────────────

  addAgent(params: {
    name: string;
    type?: string;
    emoji?: string;
    avatarData?: string;
    config?: Record<string, unknown>;
    createdBy?: string;
  }): Record<string, unknown> {
    const now = Date.now();
    const id = generateTaskId();
    const agent: Record<string, unknown> = {
      id,
      name: params.name,
      type: params.type ?? null,
      emoji: params.emoji ?? null,
      avatarData: params.avatarData ?? null,
      status: "active",
      config: params.config ?? {},
      created_at: now,
      updated_at: now,
    };
    const db = this.getDb();
    if (db) {
      db.prepare(
        "INSERT INTO agents (id, name, type, emoji, avatar_data, status, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(id, params.name, params.type ?? null, params.emoji ?? null, params.avatarData ?? null, "active", JSON.stringify(params.config ?? {}), now, now);
    }
    this.emitEvent("agent_added", { agentId: id, name: params.name, type: params.type });
    return agent;
  }

  listAgents(): Record<string, unknown>[] {
    const db = this.getDb();
    if (!db) return [];
    return (db.prepare("SELECT * FROM agents ORDER BY created_at DESC").all() as any[]).map((r) => {
      const { avatar_data: avatarData, ...agent } = r;
      return {
        ...agent,
        avatarData: avatarData ?? null,
        config: (() => { try { return JSON.parse(r.config || "{}"); } catch { return {}; } })(),
      };
    });
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  createProject(params: {
    name: string;
    description?: string;
    kind?: "project" | "workflow";
    emoji?: string;
    leadAgentId?: string;
    createdBy?: string;
  }): Record<string, unknown> {
    const now = Date.now();
    const id = generateTaskId();
    const kind = params.kind === "workflow" ? "workflow" : "project";
    const project: Record<string, unknown> = {
      id,
      name: params.name,
      description: params.description ?? null,
      kind,
      emoji: params.emoji ?? null,
      lead_agent_id: params.leadAgentId ?? null,
      team_mode_enabled: 1,
      default_workflow_template_id: null,
      status: "active",
      created_by: params.createdBy ?? null,
      created_at: now,
      updated_at: now,
    };
    const db = this.getDb();
    if (db) {
      db.prepare(
        "INSERT INTO projects (id, name, description, kind, emoji, lead_agent_id, team_mode_enabled, default_workflow_template_id, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(id, params.name, params.description ?? null, kind, params.emoji ?? null, params.leadAgentId ?? null, 1, null, "active", params.createdBy ?? null, now, now);
    }
    this.emitEvent("project_created", { projectId: id, name: params.name, kind });
    return project;
  }

  listProjects(filters?: { kind?: "project" | "workflow" }): Record<string, unknown>[] {
    const db = this.getDb();
    if (!db) return [];
    if (filters?.kind) {
      return db.prepare("SELECT * FROM projects WHERE kind = ? ORDER BY created_at DESC").all(filters.kind) as Record<string, unknown>[];
    }
    return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Record<string, unknown>[];
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  createGoal(params: {
    title: string;
    description?: string;
    kpis?: string[];
    projectId?: string;
    createdBy?: string;
  }): Record<string, unknown> {
    const now = Date.now();
    const id = generateTaskId();
    const goal: Record<string, unknown> = {
      id,
      title: params.title,
      description: params.description ?? null,
      kpis: params.kpis ?? [],
      status: "active",
      project_id: params.projectId ?? null,
      created_by: params.createdBy ?? null,
      created_at: now,
      updated_at: now,
    };
    const db = this.getDb();
    if (db) {
      db.prepare(
        "INSERT INTO goals (id, title, description, kpis, status, project_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(id, params.title, params.description ?? null, JSON.stringify(params.kpis ?? []), "active", params.projectId ?? null, params.createdBy ?? null, now, now);
    }
    this.emitEvent("goal_created", { goalId: id, title: params.title, projectId: params.projectId });
    return goal;
  }

  listGoals(projectId?: string): Record<string, unknown>[] {
    const db = this.getDb();
    if (!db) return [];
    const rows = projectId
      ? (db.prepare("SELECT * FROM goals WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as any[])
      : (db.prepare("SELECT * FROM goals ORDER BY created_at DESC").all() as any[]);
    return rows.map((r) => ({ ...r, kpis: (() => { try { return JSON.parse(r.kpis || "[]"); } catch { return []; } })() }));
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  createIssue(params: {
    title: string;
    description?: string;
    severity?: string;
    agentId?: string;
    projectId?: string;
    assignedBy?: string;
    sourceFile?: string;
    linearId?: string;
    createdBy?: string;
  }): Record<string, unknown> {
    const now = Date.now();
    const id = generateTaskId();
    const issue: Record<string, unknown> = {
      id,
      title: params.title,
      description: params.description ?? null,
      severity: params.severity ?? "medium",
      status: "open",
      agent_id: params.agentId ?? null,
      assigned_by: params.assignedBy ?? null,
      source_file: params.sourceFile ?? null,
      linear_id: params.linearId ?? null,
      project_id: params.projectId ?? null,
      created_by: params.createdBy ?? null,
      created_at: now,
      updated_at: now,
    };
    const db = this.getDb();
    if (db) {
      db.prepare(
        "INSERT INTO issues (id, title, description, severity, status, agent_id, assigned_by, source_file, linear_id, project_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(id, params.title, params.description ?? null, params.severity ?? "medium", "open", params.agentId ?? null, params.assignedBy ?? null, params.sourceFile ?? null, params.linearId ?? null, params.projectId ?? null, params.createdBy ?? null, now, now);
    }
    this.emitEvent("issue_created", {
      issueId: id,
      title: params.title,
      severity: params.severity ?? "medium",
      projectId: params.projectId,
      assignedAgentId: params.agentId,
      sourceFile: params.sourceFile,
    });
    return issue;
  }

  listIssues(filters?: { status?: string; projectId?: string; agentId?: string }): Record<string, unknown>[] {
    const db = this.getDb();
    if (!db) return [];
    let sql = "SELECT * FROM issues WHERE 1=1";
    const binds: unknown[] = [];
    if (filters?.status) { sql += " AND status = ?"; binds.push(filters.status); }
    if (filters?.projectId) { sql += " AND project_id = ?"; binds.push(filters.projectId); }
    if (filters?.agentId) { sql += " AND agent_id = ?"; binds.push(filters.agentId); }
    sql += " ORDER BY created_at DESC";
    return db.prepare(sql).all(...binds) as Record<string, unknown>[];
  }
}
