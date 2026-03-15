import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { HyperClawTask, BridgeEvent, BridgeCommand } from "$/types/electron";

export type BridgeDebug = {
  bridgeType: "hub";
  lastError: string | null;
  lastFetchAt: string | null;
  taskCount: number;
  rawTasksCheck: string; // "array" | "empty" | "not-array" | "fetch-failed"
};

async function apiFetch(action: string, body?: Record<string, unknown>) {
  return bridgeInvoke(action, body);
}

function nowIso() {
  return new Date().toISOString();
}

export function useHyperClawBridge(pollIntervalMs = 15_000) {
  const [tasks, setTasks] = useState<HyperClawTask[]>([]);
  const [events, setEvents] = useState<BridgeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    setLastError(null);
    try {
      const raw = await apiFetch("get-tasks");
      if (!Array.isArray(raw)) {
        setLastError(`API returned non-array: ${typeof raw} ${JSON.stringify(raw).slice(0, 200)}`);
        setTasks([]);
      } else {
        setTasks(raw);
      }
      setLastFetchAt(nowIso());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      setTasks([]);
      setLastFetchAt(nowIso());
    }
  }, []);

  const addTask = useCallback(async (task: (Omit<HyperClawTask, "id" | "createdAt" | "updatedAt">) & { id?: string }) => {
    setLastError(null);
    try {
      const newTask = (await apiFetch("add-task", { task })) as HyperClawTask;
      setTasks((prev) => [...prev, newTask]);
      return newTask;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      throw e;
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    setLastError(null);
    try {
      const result = (await apiFetch("delete-task", { id })) as { success: boolean };
      if (result?.success) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      return { success: false };
    }
  }, []);

  const updateTask = useCallback(async (id: string, patch: Partial<Omit<HyperClawTask, "id" | "createdAt">>) => {
    const updated = (await apiFetch("update-task", { id, patch })) as HyperClawTask;
    if (updated) {
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
    return updated;
  }, []);

  const sendCommand = useCallback(async (command: BridgeCommand) => {
    return apiFetch("send-command", { command });
  }, []);

  // Poll for events
  useEffect(() => {
    const poll = async () => {
      try {
        const evts = (await apiFetch("get-events")) as BridgeEvent[];
        setEvents(evts);
      } catch {}
    };
    pollRef.current = setInterval(poll, pollIntervalMs);
    poll();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollIntervalMs]);

  // Initial load
  useEffect(() => {
    fetchTasks().finally(() => setLoading(false));
  }, [fetchTasks]);

  const debug: BridgeDebug = {
    bridgeType: "hub",
    lastError,
    lastFetchAt,
    taskCount: tasks.length,
    rawTasksCheck:
      lastError ? "fetch-failed" : Array.isArray(tasks) ? (tasks.length ? "array" : "empty") : "not-array",
  };

  return {
    tasks,
    events,
    loading,
    fetchTasks,
    addTask,
    updateTask,
    deleteTask,
    sendCommand,
    debug,
  };
}
