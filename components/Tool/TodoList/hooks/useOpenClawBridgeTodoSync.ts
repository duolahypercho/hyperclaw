"use client";

import { useEffect, useRef, useCallback } from "react";
import { useHyperClawBridge } from "$/hooks/useHyperClawBridge";
import type { HyperClawTask } from "$/types/electron";
import type { Task } from "../types";
import { useTodoList } from "../provider/todolistProvider";

const STORAGE_KEY = "hyperclaw_synced_task_ids";

/**
 * Converts a UUID (e.g. "13275574-1c5f-4490-84cd-057b5647fab6") into a
 * 24-char hex string compatible with MongoDB ObjectId. Deterministic so
 * the same UUID always maps to the same ObjectId for dedup.
 */
function toObjectIdHex(id: string): string {
  const hex = id.replace(/-/g, "");
  if (/^[0-9a-f]{24}$/i.test(id)) return id; // already valid
  if (/^[0-9a-f]{24,}$/i.test(hex)) return hex.slice(0, 24);
  // Fallback: pad or hash to 24 chars
  return hex.padEnd(24, "0").slice(0, 24);
}

const BRIDGE_STATUS_TO_TODO: Record<HyperClawTask["status"], Task["status"]> = {
  pending: "pending",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "completed",
};

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

function loadSyncedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      // Purge stale UUID-format entries so those bridge tasks get re-synced
      // with valid hex ObjectIds.
      const clean = ids.filter((id) => OBJECT_ID_RE.test(id));
      if (clean.length !== ids.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      }
      return new Set(clean);
    }
  } catch {}
  return new Set();
}

function persistSyncedIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

/**
 * Syncs OpenClaw bridge tasks (~/.hyperclaw) into the TodoList provider.
 *
 * Dedup strategy:
 *   - A localStorage Set tracks every bridge-task ID we've already pushed to
 *     the todo backend, so we never re-create the same task even if the current
 *     tab's `todoTasks` doesn't contain it.
 *   - For tasks that ARE visible in the current view, we still push title /
 *     description / status patches when they drift.
 */
export function useOpenClawBridgeTodoSync() {
  const { tasks: bridgeTasks, fetchTasks: fetchBridgeTasks } =
    useHyperClawBridge(15_000);

  const {
    tasks: todoTasks,
    lists,
    loading: todoLoading,
    handleAddTask,
    handleEditTask,
    handleStatusChange,
  } = useTodoList();

  const isSyncing = useRef(false);
  const syncedIds = useRef<Set<string>>(loadSyncedIds());

  // Stable ref so the effect can read todoTasks without depending on it.
  const todoTasksRef = useRef(todoTasks);
  todoTasksRef.current = todoTasks;

  const listsRef = useRef(lists);
  listsRef.current = lists;

  const markSynced = useCallback((id: string) => {
    syncedIds.current.add(id);
    persistSyncedIds(syncedIds.current);
  }, []);

  // ── Core sync: runs only when bridgeTasks or todoLoading change ──────
  useEffect(() => {
    if (todoLoading || isSyncing.current || bridgeTasks.length === 0) return;

    const sync = async () => {
      isSyncing.current = true;
      try {
        for (const bt of bridgeTasks) {
          const todoStatus = BRIDGE_STATUS_TO_TODO[bt.status];
          const safeId = toObjectIdHex(bt.id);

          if (syncedIds.current.has(safeId)) {
            // Already synced — only patch if the task is in the current view
            const existing = todoTasksRef.current.find(
              (t) => t._id === safeId
            );
            if (existing) {
              const needsFields =
                existing.title !== bt.title ||
                existing.description !== (bt.description ?? "");
              const needsStatus = existing.status !== todoStatus;

              if (needsFields) {
                handleEditTask(safeId, {
                  title: bt.title,
                  description: bt.description ?? "",
                });
              }
              if (needsStatus) {
                handleStatusChange(safeId, todoStatus);
              }
            }
            continue;
          }

          // New bridge task — create in the todo backend
          await handleAddTask({
            title: bt.title,
            description: bt.description ?? "",
            existingId: safeId,
            ignore: false,
          });
          markSynced(safeId);
        }
      } catch (e) {
        console.warn("[OpenClawBridgeTodoSync]", e);
      } finally {
        isSyncing.current = false;
      }
    };

    sync();
    // todoTasks is intentionally excluded — we read it via ref to avoid
    // the add→re-render→re-sync cascade that caused duplicate creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeTasks, todoLoading, handleAddTask, handleEditTask, handleStatusChange, markSynced]);

  // ── Kick off a bridge fetch once the todo provider is ready ──────────
  useEffect(() => {
    if (!todoLoading && listsRef.current.length > 0) {
      fetchBridgeTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoLoading, fetchBridgeTasks]);
}
