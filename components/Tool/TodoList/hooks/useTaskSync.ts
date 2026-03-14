"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  gatewayConnection,
  getGatewayConnectionState,
  subscribeGatewayConnection,
  type ChatEventPayload,
} from "$/lib/openclaw-gateway-ws";

/* ── Constants ─────────────────────────────────────────── */

const NORMAL_POLL_MS = 30_000;
const BURST_POLL_MS = 5_000;
const BURST_DURATION_MS = 30_000;
const DEBOUNCE_MS = 1_000;

/** Tool names that modify tasks — a result from any of these triggers a refetch. */
const TASK_TOOL_NAMES = new Set([
  "hyperclaw_add_task",
  "hyperclaw_update_task",
  "hyperclaw_delete_task",
]);

/**
 * Orchestrates real-time task sync from multiple trigger sources:
 *
 * 1. **Gateway tool events** — when an AI agent calls a task-mutating tool,
 *    the gateway emits a toolResult chat event. We detect the tool name and
 *    trigger a refetch.
 *
 * 2. **Smart polling** — 30 s normally, 5 s for 30 s after a tool event
 *    ("burst mode") to catch follow-up mutations.
 *
 * 3. **Visibility / focus** — immediate refetch when the tab becomes visible
 *    or the window regains focus. Polling pauses while hidden.
 *
 * 4. **Gateway reconnect** — refetch when the WebSocket reconnects after a
 *    disconnect (the agent may have mutated tasks while we were offline).
 */
export function useTaskSync(refetchTasks: () => Promise<void>) {
  // Stable ref so effects never depend on refetchTasks identity
  const refetchRef = useRef(refetchTasks);
  refetchRef.current = refetchTasks;

  /* ── Debounced refetch ─────────────────────────────── */

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefetching = useRef(false);

  const debouncedRefetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      debounceTimer.current = null;
      if (isRefetching.current) return;
      isRefetching.current = true;
      try {
        await refetchRef.current();
      } catch {
        /* refetchTasks handles its own errors */
      } finally {
        isRefetching.current = false;
      }
    }, DEBOUNCE_MS);
  }, []);

  /* ── Polling helpers ───────────────────────────────── */

  const burstUntil = useRef(0);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  }, []);

  const startPoll = useCallback(() => {
    stopPoll();
    if (document.visibilityState !== "visible") return;

    const rate =
      Date.now() < burstUntil.current ? BURST_POLL_MS : NORMAL_POLL_MS;

    pollInterval.current = setInterval(() => {
      // Transition out of burst mode
      if (rate === BURST_POLL_MS && Date.now() >= burstUntil.current) {
        startPoll(); // restart at normal rate
        return;
      }
      if (document.visibilityState === "visible") {
        debouncedRefetch();
      }
    }, rate);
  }, [debouncedRefetch, stopPoll]);

  const enterBurstMode = useCallback(() => {
    burstUntil.current = Date.now() + BURST_DURATION_MS;
    startPoll();
  }, [startPoll]);

  /* ── Trigger 1: Gateway tool events ────────────────── */

  useEffect(() => {
    const unsub = gatewayConnection.onChatEvent(
      (payload: ChatEventPayload) => {
        const msg = payload.message as Record<string, unknown> | undefined;
        if (!msg) return;

        const role = msg.role as string | undefined;
        const toolName = msg.toolName as string | undefined;

        // Tool result for a task-mutating tool → refetch + burst
        if (
          role === "toolResult" &&
          toolName &&
          TASK_TOOL_NAMES.has(toolName)
        ) {
          debouncedRefetch();
          enterBurstMode();
        }
      }
    );

    return unsub;
  }, [debouncedRefetch, enterBurstMode]);

  /* ── Trigger 2: Smart polling ──────────────────────── */

  useEffect(() => {
    startPoll();
    return stopPoll;
  }, [startPoll, stopPoll]);

  /* ── Trigger 3: Visibility / focus ─────────────────── */

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        debouncedRefetch();
        startPoll();
      } else {
        stopPoll();
      }
    };

    const onFocus = () => {
      debouncedRefetch();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [debouncedRefetch, startPoll, stopPoll]);

  /* ── Trigger 4: Gateway reconnect ──────────────────── */

  useEffect(() => {
    let wasConnected = getGatewayConnectionState().connected;

    return subscribeGatewayConnection(() => {
      const isConnected = getGatewayConnectionState().connected;
      if (isConnected && !wasConnected) {
        // Short delay for WS to stabilize after reconnect
        setTimeout(() => debouncedRefetch(), 500);
      }
      wasConnected = isConnected;
    });
  }, [debouncedRefetch]);

  /* ── Cleanup debounce on unmount ───────────────────── */

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);
}
