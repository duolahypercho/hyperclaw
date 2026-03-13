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

export class HyperClawBridge {
  private dataDir: string;
  private todoPath: string;
  private eventsPath: string;
  private commandsPath: string;
  private channelsPath: string;
  private sessionsDir: string;
  private _db: any = null;
  private _dbFailed = false;

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

  private readTodoData(): TodoData {
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

  private writeTodoData(data: TodoData): void {
    this.ensureDir();
    fs.writeFileSync(this.todoPath, JSON.stringify(data, null, 2), "utf-8");
  }

  addTask(task: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    agent?: string;
    metadata?: Record<string, unknown>;
  }): Record<string, unknown> {
    const todo = this.readTodoData();
    const now = new Date().toISOString();
    const newTask = {
      ...task,
      id: generateTaskId(),
      createdAt: now,
      updatedAt: now,
    };
    todo.tasks.push(newTask);
    this.writeTodoData(todo);
    return newTask;
  }

  getTasks(): Record<string, unknown>[] {
    return this.readTodoData().tasks;
  }

  updateTask(id: string, patch: Record<string, unknown>): Record<string, unknown> | undefined {
    const todo = this.readTodoData();
    const idx = todo.tasks.findIndex((t) => (t as { id?: string }).id === id);
    if (idx === -1) return undefined;
    const task = todo.tasks[idx] as Record<string, unknown>;
    task.updatedAt = new Date().toISOString();
    Object.assign(task, patch);
    this.writeTodoData(todo);
    return task;
  }

  deleteTask(id: string): boolean {
    const todo = this.readTodoData();
    const filtered = todo.tasks.filter((t) => (t as { id?: string }).id !== id);
    if (filtered.length === todo.tasks.length) return false;
    todo.tasks = filtered;
    this.writeTodoData(todo);
    return true;
  }

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
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
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

  private writeChannelData(data: ChannelData): void {
    this.ensureDir();
    fs.writeFileSync(this.channelsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  addChannel(channel: {
    id: string;
    name: string;
    type: string;
    kind: string;
  }): Record<string, unknown> {
    const data = this.readChannelData();
    const now = new Date().toISOString();
    const newChannel = {
      ...channel,
      createdAt: now,
    };
    const exists = data.channels.find((c: Record<string, unknown>) => c.id === channel.id);
    if (exists) return { ...exists, error: "Channel already exists" };
    data.channels.push(newChannel);
    this.writeChannelData(data);
    return newChannel;
  }

  getChannels(): Record<string, unknown>[] {
    return this.readChannelData().channels;
  }

  getChannel(id: string): Record<string, unknown> | undefined {
    const channels = this.readChannelData().channels;
    return channels.find((c) => c.id === id) as Record<string, unknown> | undefined;
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

  // ── Task OS: query / upsert / claim ─────────────────────────────────────

  queryTasks(filters: {
    agentId?: string;
    agent?: string;
    status?: string;
    kind?: string;
    limit?: number;
    sort?: string;
  }): Record<string, unknown>[] {
    let tasks = this.readTodoData().tasks;
    const agentFilter = filters.agentId || filters.agent;
    if (agentFilter) {
      tasks = tasks.filter(
        (t) => t.agent === agentFilter || (t as any).agentId === agentFilter
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
      tasks.sort((a, b) =>
        String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))
      );
    } else {
      tasks.sort((a, b) =>
        String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
      );
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
    const todo = this.readTodoData();
    const now = new Date().toISOString();

    const idx = todo.tasks.findIndex((t) => {
      const d = t.data as Record<string, unknown> | undefined;
      return d?.external_id === params.externalId;
    });

    const incomingData =
      (params.data.data as Record<string, unknown>) || {};
    const mergedData = { ...incomingData, external_id: params.externalId };
    const { data: _d, ...topFields } = params.data;

    if (idx !== -1) {
      const task = todo.tasks[idx] as Record<string, unknown>;
      const existingData =
        (task.data as Record<string, unknown>) || {};
      Object.assign(task, topFields);
      task.data = { ...existingData, ...mergedData };
      task.updatedAt = now;
      this.writeTodoData(todo);
      return task;
    }

    const newTask: Record<string, unknown> = {
      ...topFields,
      id: generateTaskId(),
      data: mergedData,
      status: topFields.status || "pending",
      priority: topFields.priority || "medium",
      createdAt: now,
      updatedAt: now,
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
    const todo = this.readTodoData();
    let idx = -1;

    if (params.id) {
      idx = todo.tasks.findIndex(
        (t) => (t as { id?: string }).id === params.id
      );
    } else if (params.externalId) {
      idx = todo.tasks.findIndex((t) => {
        const d = t.data as Record<string, unknown> | undefined;
        return d?.external_id === params.externalId;
      });
    }

    if (idx === -1) {
      return { success: false, reason: "Task not found" };
    }

    const task = todo.tasks[idx] as Record<string, unknown>;
    const data = ((task.data as Record<string, unknown>) || {}) as Record<
      string,
      unknown
    >;
    const lease = data.lease as
      | { claimedBy?: string; expiresAtMs?: number }
      | undefined;
    const now = Date.now();

    if (lease && lease.expiresAtMs && lease.expiresAtMs > now) {
      return {
        success: false,
        reason: `Already claimed by ${lease.claimedBy} until ${new Date(lease.expiresAtMs).toISOString()}`,
        task,
      };
    }

    data.lease = {
      claimedBy: params.claimant,
      expiresAtMs: now + params.leaseSeconds * 1000,
    };
    task.data = data;
    task.updatedAt = new Date().toISOString();
    this.writeTodoData(todo);
    return { success: true, task };
  }

  // ── Sessions + Transcript Storage ───────────────────────────────────────

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
      this._db.exec(`
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
      `);
      return this._db;
    } catch {
      this._dbFailed = true;
      return null;
    }
  }

  // ── JSON fallback helpers for sessions ──────────────────────────────────

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private sessionIndexPath(): string {
    return path.join(this.sessionsDir, "index.json");
  }

  private readSessionIndex(): Record<string, unknown>[] {
    try {
      const p = this.sessionIndexPath();
      if (!fs.existsSync(p)) return [];
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      return Array.isArray(raw.sessions) ? raw.sessions : [];
    } catch {
      return [];
    }
  }

  private writeSessionIndex(sessions: Record<string, unknown>[]): void {
    this.ensureSessionsDir();
    fs.writeFileSync(
      this.sessionIndexPath(),
      JSON.stringify({ sessions }, null, 2),
      "utf-8"
    );
  }

  private sessionMessagesPath(sessionKey: string): string {
    const safe = sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.sessionsDir, `${safe}.jsonl`);
  }

  // ── Public session methods ──────────────────────────────────────────────

  sessionUpsert(params: {
    sessionKey: string;
    agentId?: string;
    label?: string;
  }): Record<string, unknown> {
    const now = Date.now();
    const db = this.getDb();

    if (db) {
      const existing = db
        .prepare("SELECT * FROM sessions WHERE session_key = ?")
        .get(params.sessionKey);
      if (existing) {
        db.prepare(
          "UPDATE sessions SET agent_id = COALESCE(?, agent_id), label = COALESCE(?, label), updated_at_ms = ? WHERE session_key = ?"
        ).run(
          params.agentId ?? null,
          params.label ?? null,
          now,
          params.sessionKey
        );
      } else {
        db.prepare(
          "INSERT INTO sessions (session_key, agent_id, label, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)"
        ).run(
          params.sessionKey,
          params.agentId ?? null,
          params.label ?? null,
          now,
          now
        );
      }
      return db
        .prepare("SELECT * FROM sessions WHERE session_key = ?")
        .get(params.sessionKey) as Record<string, unknown>;
    }

    // JSON fallback
    const sessions = this.readSessionIndex();
    const idx = sessions.findIndex(
      (s) => s.session_key === params.sessionKey
    );
    if (idx !== -1) {
      if (params.agentId !== undefined) sessions[idx].agent_id = params.agentId;
      if (params.label !== undefined) sessions[idx].label = params.label;
      sessions[idx].updated_at_ms = now;
      this.writeSessionIndex(sessions);
      return sessions[idx];
    }
    const newSession: Record<string, unknown> = {
      session_key: params.sessionKey,
      agent_id: params.agentId ?? null,
      label: params.label ?? null,
      created_at_ms: now,
      updated_at_ms: now,
    };
    sessions.push(newSession);
    this.writeSessionIndex(sessions);
    return newSession;
  }

  sessionAppendMessages(
    sessionKey: string,
    messages: {
      runId?: string;
      stream?: string;
      role?: string;
      content: unknown;
    }[]
  ): { count: number } {
    const now = Date.now();
    const db = this.getDb();

    if (db) {
      const insert = db.prepare(
        "INSERT INTO session_messages (session_key, run_id, stream, role, content_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const tx = db.transaction(() => {
        for (const msg of messages) {
          insert.run(
            sessionKey,
            msg.runId ?? null,
            msg.stream ?? null,
            msg.role ?? null,
            JSON.stringify(msg.content),
            now
          );
        }
      });
      tx();
      // Touch session updated_at_ms
      db.prepare(
        "UPDATE sessions SET updated_at_ms = ? WHERE session_key = ?"
      ).run(now, sessionKey);
      return { count: messages.length };
    }

    // JSON fallback
    this.ensureSessionsDir();
    const fpath = this.sessionMessagesPath(sessionKey);
    const lines = messages.map((msg) =>
      JSON.stringify({
        session_key: sessionKey,
        run_id: msg.runId ?? null,
        stream: msg.stream ?? null,
        role: msg.role ?? null,
        content: msg.content,
        created_at_ms: now,
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
      let sql =
        "SELECT * FROM session_messages WHERE session_key = ?";
      const binds: unknown[] = [sessionKey];
      if (opts?.runId) {
        sql += " AND run_id = ?";
        binds.push(opts.runId);
      }
      sql += " ORDER BY created_at_ms ASC, id ASC";
      if (opts?.limit) {
        sql += " LIMIT ?";
        binds.push(opts.limit);
        if (opts?.offset) {
          sql += " OFFSET ?";
          binds.push(opts.offset);
        }
      }
      return db.prepare(sql).all(...binds) as Record<string, unknown>[];
    }

    // JSON fallback
    const fpath = this.sessionMessagesPath(sessionKey);
    if (!fs.existsSync(fpath)) return [];
    try {
      const content = fs.readFileSync(fpath, "utf-8");
      let msgs = content
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((m): m is Record<string, unknown> => m != null);
      if (opts?.runId) {
        msgs = msgs.filter((m) => m.run_id === opts.runId);
      }
      const start = opts?.offset ?? 0;
      if (opts?.limit) {
        msgs = msgs.slice(start, start + opts.limit);
      } else if (start > 0) {
        msgs = msgs.slice(start);
      }
      return msgs;
    } catch {
      return [];
    }
  }
}
