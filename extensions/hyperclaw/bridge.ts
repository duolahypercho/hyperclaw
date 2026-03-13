import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".hyperclaw");

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

export class HyperClawBridge {
  private dataDir: string;
  private todoPath: string;
  private eventsPath: string;
  private commandsPath: string;
  private channelsPath: string;
  private db: InstanceType<typeof Database> | null = null;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.todoPath = path.join(this.dataDir, "todo.json");
    this.eventsPath = path.join(this.dataDir, "events.jsonl");
    this.commandsPath = path.join(this.dataDir, "commands.jsonl");
    this.channelsPath = path.join(this.dataDir, "channels.json");
    this.initDB();
  }

  // ── SQLite initialization ──────────────────────────────────────────────────

  private initDB(): void {
    try {
      const dbPath = path.join(this.dataDir, "connector.db");
      if (!fs.existsSync(dbPath)) {
        // DB doesn't exist yet — connector hasn't run. Use JSON fallback.
        return;
      }
      this.db = new Database(dbPath, { readonly: false });
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("busy_timeout = 5000");
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("foreign_keys = ON");
    } catch (err) {
      console.error("[HyperClaw] SQLite init failed, falling back to JSON:", err);
      this.db = null;
    }
  }

  private get useSQLite(): boolean {
    return this.db !== null;
  }

  // ── Directory helpers ──────────────────────────────────────────────────────

  private ensureDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // ── Task operations ────────────────────────────────────────────────────────

  addTask(task: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    agent?: string;
    metadata?: Record<string, unknown>;
  }): Record<string, unknown> {
    const now = Date.now();
    const id = generateTaskId();
    const newTask: Record<string, unknown> = {
      ...task,
      id,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    if (this.useSQLite) {
      try {
        const { id: _id, createdAt: _ca, updatedAt: _ua, listId: _li, ...data } = newTask;
        this.db!.prepare(
          `INSERT INTO tasks (id, list_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
        ).run(id, null, JSON.stringify(data), now, now);
        return newTask;
      } catch (err) {
        console.error("[HyperClaw] SQLite addTask error, falling back:", err);
      }
    }

    // JSON fallback
    const todo = this.readTodoDataJSON();
    todo.tasks.push(newTask);
    this.writeTodoDataJSON(todo);
    return newTask;
  }

  getTasks(): Record<string, unknown>[] {
    if (this.useSQLite) {
      try {
        const rows = this.db!.prepare(
          `SELECT id, list_id, data, created_at, updated_at FROM tasks ORDER BY created_at ASC`
        ).all() as { id: string; list_id: string | null; data: string; created_at: number; updated_at: number }[];

        return rows.map((row) => {
          const data = JSON.parse(row.data || "{}") as Record<string, unknown>;
          data.id = row.id;
          if (row.list_id) data.listId = row.list_id;
          data.createdAt = new Date(row.created_at).toISOString();
          data.updatedAt = new Date(row.updated_at).toISOString();
          return data;
        });
      } catch (err) {
        console.error("[HyperClaw] SQLite getTasks error, falling back:", err);
      }
    }

    return this.readTodoDataJSON().tasks;
  }

  updateTask(id: string, patch: Record<string, unknown>): Record<string, unknown> | undefined {
    if (this.useSQLite) {
      try {
        const resolvedId = this.resolveTaskId(id) ?? id;
        const row = this.db!.prepare(
          `SELECT list_id, data, created_at FROM tasks WHERE id = ?`
        ).get(resolvedId) as { list_id: string | null; data: string; created_at: number } | undefined;

        if (!row) return undefined;

        const current = JSON.parse(row.data || "{}") as Record<string, unknown>;
        let listId = row.list_id;

        for (const [k, v] of Object.entries(patch)) {
          if (k === "id" || k === "createdAt" || k === "updatedAt") continue;
          if (k === "listId") {
            listId = (v as string) || null;
            continue;
          }
          current[k] = v;
        }

        const now = Date.now();
        this.db!.prepare(
          `UPDATE tasks SET list_id = ?, data = ?, updated_at = ? WHERE id = ?`
        ).run(listId, JSON.stringify(current), now, resolvedId);

        const result: Record<string, unknown> = { ...current, id: resolvedId };
        if (listId) result.listId = listId;
        result.createdAt = new Date(row.created_at).toISOString();
        result.updatedAt = new Date(now).toISOString();
        return result;
      } catch (err) {
        console.error("[HyperClaw] SQLite updateTask error, falling back:", err);
      }
    }

    // JSON fallback
    const todo = this.readTodoDataJSON();
    const idx = todo.tasks.findIndex((t) => (t as { id?: string }).id === id);
    if (idx === -1) return undefined;
    const task = todo.tasks[idx] as Record<string, unknown>;
    task.updatedAt = new Date().toISOString();
    Object.assign(task, patch);
    this.writeTodoDataJSON(todo);
    return task;
  }

  /** Resolve a task ID — callers may pass the SQLite `id` or the MongoDB `_id` stored inside `data`. */
  private resolveTaskId(id: string): string | undefined {
    if (!this.db) return undefined;
    // Try primary key first
    const direct = this.db.prepare(`SELECT id FROM tasks WHERE id = ?`).get(id) as { id: string } | undefined;
    if (direct) return direct.id;
    // Fall back to MongoDB _id inside the data JSON
    const byMongoId = this.db.prepare(
      `SELECT id FROM tasks WHERE json_extract(data, '$._id') = ?`
    ).get(id) as { id: string } | undefined;
    return byMongoId?.id;
  }

  deleteTask(id: string): boolean {
    if (this.useSQLite) {
      try {
        const resolvedId = this.resolveTaskId(id);
        if (!resolvedId) return false;
        const result = this.db!.prepare(`DELETE FROM tasks WHERE id = ?`).run(resolvedId);
        return result.changes > 0;
      } catch (err) {
        console.error("[HyperClaw] SQLite deleteTask error, falling back:", err);
      }
    }

    const todo = this.readTodoDataJSON();
    const filtered = todo.tasks.filter((t) => (t as { id?: string }).id !== id);
    if (filtered.length === todo.tasks.length) return false;
    todo.tasks = filtered;
    this.writeTodoDataJSON(todo);
    return true;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  emitEvent(type: string, data: Record<string, unknown>): void {
    const now = Date.now();

    if (this.useSQLite) {
      try {
        const entry = { type, source: "openclaw", ...data };
        this.db!.prepare(
          `INSERT INTO events (type, data, created_at) VALUES (?, ?, ?)`
        ).run(type, JSON.stringify(entry), now);
        return;
      } catch (err) {
        console.error("[HyperClaw] SQLite emitEvent error, falling back:", err);
      }
    }

    // JSON fallback
    this.ensureDir();
    const entry = {
      type,
      timestamp: new Date(now).toISOString(),
      source: "openclaw",
      ...data,
    };
    fs.appendFileSync(this.eventsPath, JSON.stringify(entry) + "\n", "utf-8");
  }

  readCommands(): Record<string, unknown>[] {
    if (this.useSQLite) {
      try {
        const rows = this.db!.prepare(
          `SELECT id, COALESCE(type, '') as type, data, created_at
           FROM commands WHERE processed = 0 ORDER BY created_at ASC LIMIT 50`
        ).all() as { id: number; type: string; data: string; created_at: number }[];

        // Mark as processed
        const markStmt = this.db!.prepare(`UPDATE commands SET processed = 1 WHERE id = ?`);
        for (const row of rows) {
          markStmt.run(row.id);
        }

        return rows.map((row) => {
          const data = JSON.parse(row.data || "{}") as Record<string, unknown>;
          return {
            id: row.id,
            type: row.type,
            timestamp: new Date(row.created_at).toISOString(),
            ...data,
          };
        });
      } catch (err) {
        console.error("[HyperClaw] SQLite readCommands error, falling back:", err);
      }
    }

    // JSON fallback
    try {
      if (!fs.existsSync(this.commandsPath)) return [];
      const content = fs.readFileSync(this.commandsPath, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      const commands = lines
        .map((line) => {
          try { return JSON.parse(line) as Record<string, unknown>; }
          catch { return null; }
        })
        .filter((c): c is Record<string, unknown> => c != null);
      fs.writeFileSync(this.commandsPath, "", "utf-8");
      return commands;
    } catch {
      return [];
    }
  }

  // ── Channel Management ─────────────────────────────────────────────────────

  addChannel(channel: {
    id: string;
    name: string;
    type: string;
    kind: string;
  }): Record<string, unknown> {
    const channels = this.getChannels();
    const exists = channels.find((c) => c.id === channel.id);
    if (exists) return { ...exists, error: "Channel already exists" };

    const newChannel = { ...channel, createdAt: new Date().toISOString() };
    channels.push(newChannel);
    this.writeChannels(channels);
    return newChannel;
  }

  getChannels(): Record<string, unknown>[] {
    if (this.useSQLite) {
      try {
        const val = this.kvGet("channels");
        if (val) {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [];
        }
        return [];
      } catch { /* fall through */ }
    }

    return this.readChannelDataJSON().channels;
  }

  getChannel(id: string): Record<string, unknown> | undefined {
    return this.getChannels().find((c) => c.id === id);
  }

  updateChannel(id: string, patch: Record<string, unknown>): Record<string, unknown> | undefined {
    const channels = this.getChannels();
    const idx = channels.findIndex((c) => c.id === id);
    if (idx === -1) return undefined;
    Object.assign(channels[idx], patch);
    this.writeChannels(channels);
    return channels[idx];
  }

  deleteChannel(id: string): boolean {
    const channels = this.getChannels();
    const filtered = channels.filter((c) => c.id !== id);
    if (filtered.length === channels.length) return false;
    this.writeChannels(filtered);
    return true;
  }

  private writeChannels(channels: Record<string, unknown>[]): void {
    if (this.useSQLite) {
      try {
        this.kvSet("channels", JSON.stringify(channels));
        return;
      } catch { /* fall through */ }
    }

    this.ensureDir();
    fs.writeFileSync(this.channelsPath, JSON.stringify({ channels }, null, 2), "utf-8");
  }

  // ── Agents (SQLite-only) ───────────────────────────────────────────────────

  getAgents(): Record<string, unknown>[] {
    if (!this.useSQLite) return [];
    try {
      return this.db!.prepare(
        `SELECT id, name, role, status, department, config, created_at, updated_at
         FROM agents ORDER BY name ASC`
      ).all() as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  getAgent(id: string): Record<string, unknown> | undefined {
    if (!this.useSQLite) return undefined;
    try {
      return this.db!.prepare(
        `SELECT id, name, role, status, department, config, created_at, updated_at
         FROM agents WHERE id = ?`
      ).get(id) as Record<string, unknown> | undefined;
    } catch {
      return undefined;
    }
  }

  // ── Actions (SQLite-only) ──────────────────────────────────────────────────

  getRecentActions(limit = 50): Record<string, unknown>[] {
    if (!this.useSQLite) return [];
    try {
      return this.db!.prepare(
        `SELECT id, action_type, COALESCE(agent_id, '') as agent_id, status,
                COALESCE(duration_ms, 0) as duration_ms, created_at
         FROM actions ORDER BY created_at DESC LIMIT ?`
      ).all(limit) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  getAgentActivity(): Record<string, unknown>[] {
    if (!this.useSQLite) return [];
    try {
      return this.db!.prepare(
        `SELECT * FROM v_agent_activity`
      ).all() as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  // ── Schema discovery (SQLite-only) ─────────────────────────────────────────

  getSchema(): Record<string, unknown>[] {
    if (!this.useSQLite) return [];
    try {
      return this.db!.prepare(
        `SELECT table_name, column_name, description FROM _schema_doc ORDER BY table_name, sort_order`
      ).all() as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  // ── KV helpers ─────────────────────────────────────────────────────────────

  private kvGet(key: string): string | undefined {
    if (!this.db) return undefined;
    const row = this.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value;
  }

  private kvSet(key: string, value: string): void {
    if (!this.db) return;
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value, now);
  }

  // ── JSON fallbacks ─────────────────────────────────────────────────────────

  private readTodoDataJSON(): TodoData {
    try {
      if (!fs.existsSync(this.todoPath)) {
        return { tasks: [], lists: [], activeTaskId: null };
      }
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

  private writeTodoDataJSON(data: TodoData): void {
    this.ensureDir();
    fs.writeFileSync(this.todoPath, JSON.stringify(data, null, 2), "utf-8");
  }

  private readChannelDataJSON(): ChannelData {
    try {
      if (!fs.existsSync(this.channelsPath)) {
        return { channels: [] };
      }
      const raw = JSON.parse(fs.readFileSync(this.channelsPath, "utf-8"));
      return {
        channels: Array.isArray(raw.channels) ? raw.channels : [],
      };
    } catch {
      return { channels: [] };
    }
  }
}
