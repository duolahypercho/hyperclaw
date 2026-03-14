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
type ChannelData = { channels: Record<string, unknown>[] };

interface TaskRow { id: string; list_id: string; data: string; created_at: number; updated_at: number }
interface TaskListRow { id: string; data: string; created_at: number; updated_at: number }
interface TaskLogRow { id: number; task_id: string; agent_id: string | null; type: string; content: string; metadata: string; created_at: number }

export class HyperClawBridge {
  private dataDir: string;
  private todoPath: string;
  private eventsPath: string;
  private commandsPath: string;
  private channelsPath: string;
  private sessionsDir: string;
  private _db: any = null;
  private _dbFailed = false;
  private _migrated = false;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.todoPath = path.join(this.dataDir, "todo.json");
    this.eventsPath = path.join(this.dataDir, "events.jsonl");
    this.commandsPath = path.join(this.dataDir, "commands.jsonl");
    this.channelsPath = path.join(this.dataDir, "channels.json");
    this.sessionsDir = path.join(this.dataDir, "sessions");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
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
        -- KV store for flags
        CREATE TABLE IF NOT EXISTS kv (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
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
    return this.normalizeTaskAssignment({
      ...data,
      id: row.id,
      _id: row.id,
      listId: row.list_id || "",
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
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
    metadata?: Record<string, unknown>;
  }): Record<string, unknown> {
    const now = new Date().toISOString();
    const { agent, ...rest } = task;
    const id = generateTaskId();
    const newTask: Record<string, unknown> = {
      ...rest,
      ...(agent ? { assignedAgent: agent } : {}),
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
      const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
      if (!row) return undefined;
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
        updated.list_id, updated.data, now, id
      );
      return this.rowToTask({ ...updated, id, created_at: row.created_at, updated_at: now });
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
      const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      if (result.changes > 0) {
        db.prepare("DELETE FROM task_logs WHERE task_id = ?").run(id);
        db.prepare("DELETE FROM task_sessions WHERE task_id = ?").run(id);
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
    limit?: number;
    sort?: string;
  }): Record<string, unknown>[] {
    let tasks: Record<string, unknown>[];
    const db = this.getDb();
    if (db) {
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

      if (lease && lease.expiresAtMs && lease.expiresAtMs > now) {
        return {
          success: false,
          reason: `Already claimed by ${lease.claimedBy} until ${new Date(lease.expiresAtMs).toISOString()}`,
          task,
        };
      }

      data.lease = { claimedBy: params.claimant, expiresAtMs: now + params.leaseSeconds * 1000 };
      task.data = data;
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
    if (lease && lease.expiresAtMs && lease.expiresAtMs > now) {
      return {
        success: false,
        reason: `Already claimed by ${lease.claimedBy} until ${new Date(lease.expiresAtMs).toISOString()}`,
        task,
      };
    }
    data.lease = { claimedBy: params.claimant, expiresAtMs: now + params.leaseSeconds * 1000 };
    task.data = data;
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

  // ── Channel Management ─────────────────────────────────────────────────

  private readChannelData(): ChannelData {
    try {
      if (!fs.existsSync(this.channelsPath)) return { channels: [] };
      const raw = JSON.parse(fs.readFileSync(this.channelsPath, "utf-8"));
      return { channels: Array.isArray(raw.channels) ? raw.channels : [] };
    } catch {
      return { channels: [] };
    }
  }

  private writeChannelData(data: ChannelData): void {
    this.ensureDir();
    fs.writeFileSync(this.channelsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  addChannel(channel: { id: string; name: string; type: string; kind: string }): Record<string, unknown> {
    const data = this.readChannelData();
    const now = new Date().toISOString();
    const newChannel = { ...channel, createdAt: now };
    const exists = data.channels.find((c: Record<string, unknown>) => c.id === channel.id);
    if (exists) return { ...exists, error: "Channel already exists" };
    data.channels.push(newChannel);
    this.writeChannelData(data);
    return newChannel;
  }

  getChannels(): Record<string, unknown>[] { return this.readChannelData().channels; }

  getChannel(id: string): Record<string, unknown> | undefined {
    return this.readChannelData().channels.find((c) => c.id === id) as Record<string, unknown> | undefined;
  }

  updateChannel(id: string, patch: Record<string, unknown>): Record<string, unknown> | undefined {
    const data = this.readChannelData();
    const idx = data.channels.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;
    Object.assign(data.channels[idx], patch);
    this.writeChannelData(data);
    return data.channels[idx];
  }

  deleteChannel(id: string): boolean {
    const data = this.readChannelData();
    const initialLength = data.channels.length;
    data.channels = data.channels.filter((c) => c.id !== id);
    if (data.channels.length === initialLength) return false;
    this.writeChannelData(data);
    return true;
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
}
