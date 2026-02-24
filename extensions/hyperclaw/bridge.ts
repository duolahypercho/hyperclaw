import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

export class HyperClawBridge {
  private dataDir: string;
  private todoPath: string;
  private eventsPath: string;
  private commandsPath: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.todoPath = path.join(this.dataDir, "todo.json");
    this.eventsPath = path.join(this.dataDir, "events.jsonl");
    this.commandsPath = path.join(this.dataDir, "commands.jsonl");
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
}
