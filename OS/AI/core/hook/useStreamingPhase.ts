"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Streaming Phase State Machine ────────────────────────────────────
//
// Replaces the 4 independent timer refs (loadingTimeout, finalDebounce,
// idleReload, noResponse) with a single phase + single timer pattern.
// Eliminates overlapping timer cascades that caused re-render storms.
//
//   ┌──────────┐
//   │   IDLE   │◄────────────────────────────────────────────┐
//   └────┬─────┘                                             │
//        │ sendMessage                                       │
//   ┌────▼─────┐                                             │
//   │ WAITING  │── 15s no response → merge history ──────────┤
//   └────┬─────┘                                             │
//        │ first delta                                       │
//   ┌────▼──────┐                                            │
//   │ STREAMING │── 8s idle → merge history                  │
//   │           │── 5min safety → force finalize             │
//   │           │── late delta resets idle timer              │
//   └────┬──────┘                                            │
//        │ final / aborted / idle-timeout                    │
//   ┌────▼───────┐                                           │
//   │ FINALIZING │── merge once, retry if changed (max 2) ───┘
//   └────────────┘

export type StreamingPhase = "idle" | "waiting" | "streaming" | "finalizing";

export interface UseStreamingPhaseOptions {
  /** Callback to merge history and optionally finalize. */
  mergeHistory: (autoFinalize: boolean) => void;
  /** Callback to set the loading state. */
  setIsLoading: (loading: boolean) => void;
  /** Session key ref — read for runId ownership. */
  sessionKeyRef: React.RefObject<string>;
}

export interface UseStreamingPhaseReturn {
  // Phase state
  phase: StreamingPhase;
  phaseRef: React.MutableRefObject<StreamingPhase>;

  // RAF-based render throttle
  renderTick: number;
  scheduleRender: () => void;

  // Streaming text ref (no React state — perf critical)
  streamingTextRef: React.MutableRefObject<string>;
  streamingRunIdRef: React.MutableRefObject<string | null>;

  // Tool tracking (for smart merge — skip merge on text-only responses)
  toolsSeenRef: React.MutableRefObject<boolean>;

  // Phase transitions
  transitionToWaiting: () => void;
  transitionToStreaming: (runId: string) => void;
  onDelta: () => void;
  transitionToFinalizing: () => void;
  transitionToIdle: () => void;
  resetForNewSession: () => void;

  // Cleanup
  cancelAllTimers: () => void;
}

// ── Timer durations (ms) ─────────────────────────────────────────────
const NO_RESPONSE_MS = 15_000;    // WAITING → merge if no events arrive
const IDLE_CHECK_MS = 8_000;      // STREAMING → merge if no deltas for 8s
const SAFETY_TIMEOUT_MS = 300_000; // STREAMING → force finalize after 5min
const FINALIZE_DEBOUNCE_MS = 3_000; // FINALIZING → wait 3s before merge
const RETRY_DELAY_MS = 5_000;     // FINALIZING → retry merge after 5s

export function useStreamingPhase(options: UseStreamingPhaseOptions): UseStreamingPhaseReturn {
  const { mergeHistory, setIsLoading, sessionKeyRef } = options;

  // ── Core state ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<StreamingPhase>("idle");
  const phaseRef = useRef<StreamingPhase>("idle");

  // RAF-based render throttle: increment to trigger re-render, max 60fps
  const [renderTick, setRenderTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Streaming content stored in refs (NOT React state) during streaming.
  // Only committed to React state on finalization.
  const streamingTextRef = useRef<string>("");
  const streamingRunIdRef = useRef<string | null>(null);

  // Track whether tool calls were seen during this streaming turn.
  // Used to skip unnecessary history merge for text-only responses.
  const toolsSeenRef = useRef(false);

  // Single consolidated timer ref — only one timer active at a time per phase.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Safety timer runs independently (long timeout, shouldn't block other timers)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Merge retry tracking for FINALIZING phase
  const mergeRetryCountRef = useRef(0);

  // Keep stable references to callbacks
  const mergeHistoryRef = useRef(mergeHistory);
  mergeHistoryRef.current = mergeHistory;
  const setIsLoadingRef = useRef(setIsLoading);
  setIsLoadingRef.current = setIsLoading;

  // ── Timer management ───────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const cancelAllTimers = useCallback(() => {
    clearTimer();
    clearSafetyTimer();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [clearTimer, clearSafetyTimer]);

  // ── RAF render scheduling ──────────────────────────────────────────
  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setRenderTick((t) => t + 1);
    });
  }, []);

  // ── Phase transitions ──────────────────────────────────────────────

  const setPhaseSync = useCallback((p: StreamingPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  /** IDLE → WAITING: called when user sends a message. */
  const transitionToWaiting = useCallback(() => {
    clearTimer();
    clearSafetyTimer();
    setPhaseSync("waiting");
    setIsLoadingRef.current(true);
    streamingTextRef.current = "";
    streamingRunIdRef.current = null;
    toolsSeenRef.current = false;
    mergeRetryCountRef.current = 0;

    // Start no-response timer: if no events arrive within 15s, check history
    timerRef.current = setTimeout(() => {
      if (phaseRef.current !== "waiting") return;
      mergeHistoryRef.current(true);
    }, NO_RESPONSE_MS);
  }, [clearTimer, clearSafetyTimer, setPhaseSync]);

  /** WAITING/IDLE → STREAMING: called on first delta event. */
  const transitionToStreaming = useCallback((runId: string) => {
    clearTimer();
    setPhaseSync("streaming");
    streamingRunIdRef.current = runId;

    // Start idle check timer (resets on each delta)
    timerRef.current = setTimeout(() => {
      if (phaseRef.current !== "streaming") return;
      mergeHistoryRef.current(true);
    }, IDLE_CHECK_MS);

    // Start safety timeout (5min — force finalize if nothing terminates)
    clearSafetyTimer();
    safetyTimerRef.current = setTimeout(() => {
      if (phaseRef.current !== "streaming") return;
      streamingRunIdRef.current = null;
      setIsLoadingRef.current(false);
      mergeHistoryRef.current(false);
      setPhaseSync("idle");
    }, SAFETY_TIMEOUT_MS);
  }, [clearTimer, clearSafetyTimer, setPhaseSync]);

  /** Called on each streaming delta — resets idle timer. */
  const onDelta = useCallback(() => {
    if (phaseRef.current !== "streaming") return;
    // Reset idle check timer
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (phaseRef.current !== "streaming") return;
      mergeHistoryRef.current(true);
    }, IDLE_CHECK_MS);
  }, [clearTimer]);

  /** STREAMING → FINALIZING: called on final/aborted/error events. */
  const transitionToFinalizing = useCallback(() => {
    clearTimer();
    clearSafetyTimer();
    setPhaseSync("finalizing");
    mergeRetryCountRef.current = 0;

    // Debounce: wait 3s before merging history (allows late events to arrive)
    timerRef.current = setTimeout(() => {
      if (phaseRef.current !== "finalizing") return;

      streamingRunIdRef.current = null;
      setIsLoadingRef.current(false);

      // Smart merge: skip if text-only (no tools seen) — streaming ref
      // already has the complete text, no need to fetch from server.
      if (!toolsSeenRef.current) {
        setPhaseSync("idle");
        return;
      }

      // Merge history once
      mergeHistoryRef.current(false);
      mergeRetryCountRef.current = 1;

      // Schedule conditional retry after 5s
      timerRef.current = setTimeout(() => {
        if (phaseRef.current !== "finalizing") return;
        mergeHistoryRef.current(false);
        setPhaseSync("idle");
      }, RETRY_DELAY_MS);
    }, FINALIZE_DEBOUNCE_MS);
  }, [clearTimer, clearSafetyTimer, setPhaseSync]);

  /** Force transition to IDLE (disconnect, clear, etc.). */
  const transitionToIdle = useCallback(() => {
    cancelAllTimers();
    streamingRunIdRef.current = null;
    streamingTextRef.current = "";
    toolsSeenRef.current = false;
    mergeRetryCountRef.current = 0;
    setPhaseSync("idle");
    setIsLoadingRef.current(false);
  }, [cancelAllTimers, setPhaseSync]);

  /** Reset all state for a new session. */
  const resetForNewSession = useCallback(() => {
    cancelAllTimers();
    streamingTextRef.current = "";
    streamingRunIdRef.current = null;
    toolsSeenRef.current = false;
    mergeRetryCountRef.current = 0;
    setPhaseSync("idle");
  }, [cancelAllTimers, setPhaseSync]);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAllTimers();
    };
  }, [cancelAllTimers]);

  return {
    phase,
    phaseRef,
    renderTick,
    scheduleRender,
    streamingTextRef,
    streamingRunIdRef,
    toolsSeenRef,
    transitionToWaiting,
    transitionToStreaming,
    onDelta,
    transitionToFinalizing,
    transitionToIdle,
    resetForNewSession,
    cancelAllTimers,
  };
}
