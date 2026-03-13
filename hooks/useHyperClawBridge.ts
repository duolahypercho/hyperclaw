import { useState, useEffect, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type { HyperClawTask, BridgeEvent, BridgeCommand } from "$/types/electron";

export type BridgeDebug = {
  bridgeType: "electron" | "hub";
  lastError: string | null;
  lastFetchAt: string | null;
  taskCount: number;
  rawTasksCheck: string; // "array" | "empty" | "not-array" | "fetch-failed"
};

async function apiFetch(action: string, body?: Record<string, unknown>) {
  return bridgeInvoke(action, body);
}

function getElectronBridge() {
  if (typeof window !== "undefined") return window.electronAPI?.hyperClawBridge ?? null;
  return null;
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
  const bridgeType: "electron" | "hub" = typeof window !== "undefined" && getElectronBridge() ? "electron" : "hub";

  const fetchTasks = useCallback(async () => {
    setLastError(null);
    const bridge = getElectronBridge();
    try {
      if (bridge) {
        const t = await bridge.getTasks();
        const list = Array.isArray(t) ? t : [];
        setTasks(list);
        setLastFetchAt(nowIso());
      } else {
        const raw = await apiFetch("get-tasks");
        if (!Array.isArray(raw)) {
          setLastError(`API returned non-array: ${typeof raw} ${JSON.stringify(raw).slice(0, 200)}`);
          setTasks([]);
        } else {
          setTasks(raw);
        }
        setLastFetchAt(nowIso());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      setTasks([]);
      setLastFetchAt(nowIso());
    }
  }, []);

  const addTask = useCallback(async (task: (Omit<HyperClawTask, "id" | "createdAt" | "updatedAt">) & { id?: string }) => {
    setLastError(null);
    const bridge = getElectronBridge();
    try {
      let newTask: HyperClawTask;
      if (bridge) {
        newTask = await bridge.addTask(task);
      } else {
        newTask = (await apiFetch("add-task", { task })) as HyperClawTask;
      }
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
    const bridge = getElectronBridge();
    try {
      let result: { success: boolean };
      if (bridge) {
        result = await bridge.deleteTask(id);
      } else {
        result = (await apiFetch("delete-task", { id })) as { success: boolean };
      }
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
    const bridge = getElectronBridge();
    let updated: HyperClawTask | null;
    if (bridge) {
      updated = await bridge.updateTask(id, patch);
    } else {
      updated = (await apiFetch("update-task", { id, patch })) as HyperClawTask;
    }
    if (updated) {
      setTasks((prev) => prev.map((t) => (t.id === id ? updated! : t)));
    }
    return updated;
  }, []);

  const sendCommand = useCallback(async (command: BridgeCommand) => {
    const bridge = getElectronBridge();
    if (bridge) {
      return bridge.sendCommand(command);
    }
    return apiFetch("send-command", { command });
  }, []);

  // Real-time events from Electron, or polling in dev
  useEffect(() => {
    const bridge = getElectronBridge();

    if (bridge) {
      bridge.onTasksChanged((t) => setTasks(Array.isArray(t) ? t : []));
      bridge.onEvent((evt) => setEvents((prev) => [...prev.slice(-99), evt]));
      return () => { bridge.removeAllBridgeListeners(); };
    }

    // Dev fallback: poll for events
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
    bridgeType,
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
