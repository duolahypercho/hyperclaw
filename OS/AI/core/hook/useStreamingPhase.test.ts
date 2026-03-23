// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStreamingPhase } from "./useStreamingPhase";
import { _testHelpers, type GatewayChatMessage } from "./use-gateway-chat";

// ── RAF stubs ────────────────────────────────────────────────────────
vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(Date.now()), 0) as unknown as number;
});
vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

// ── Shared helpers ───────────────────────────────────────────────────

function makeOptions(overrides: Partial<Parameters<typeof useStreamingPhase>[0]> = {}) {
  return {
    mergeHistory: vi.fn(),
    setIsLoading: vi.fn(),
    sessionKeyRef: { current: "session-1" },
    ...overrides,
  };
}

function makeMessage(partial: Partial<GatewayChatMessage> = {}): GatewayChatMessage {
  return {
    id: partial.id ?? `msg-${Math.random().toString(36).slice(2)}`,
    role: partial.role ?? "assistant",
    content: partial.content ?? "Hello world",
    timestamp: partial.timestamp ?? Date.now(),
    ...partial,
  };
}

// ── Test Suite ───────────────────────────────────────────────────────

describe("useStreamingPhase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ================================================================
  // 1. RAF render loop
  // ================================================================
  describe("RAF render loop (scheduleRender)", () => {
    it("should increment renderTick via requestAnimationFrame", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      expect(result.current.renderTick).toBe(0);

      // scheduleRender queues a RAF (stubbed as setTimeout(..., 0))
      act(() => {
        result.current.scheduleRender();
        vi.runAllTimers();
      });

      expect(result.current.renderTick).toBe(1);
    });

    it("should skip duplicate scheduleRender calls (coalesce into single RAF)", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.scheduleRender();
        result.current.scheduleRender(); // should be no-op — already scheduled
        result.current.scheduleRender(); // also no-op
        vi.runAllTimers();
      });

      // Only incremented once despite three calls
      expect(result.current.renderTick).toBe(1);
    });

    it("should allow a new RAF after the previous one completes", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      // First RAF cycle
      act(() => {
        result.current.scheduleRender();
        vi.runAllTimers();
      });
      expect(result.current.renderTick).toBe(1);

      // Second RAF cycle — should succeed because first completed
      act(() => {
        result.current.scheduleRender();
        vi.runAllTimers();
      });
      expect(result.current.renderTick).toBe(2);
    });

    it("should cancel pending RAF on cancelAllTimers()", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.scheduleRender();
      });

      // Cancel before the RAF fires
      act(() => {
        result.current.cancelAllTimers();
        vi.runAllTimers();
      });

      // renderTick should NOT have incremented
      expect(result.current.renderTick).toBe(0);
    });
  });

  // ================================================================
  // 2. State machine transitions
  // ================================================================
  describe("state machine transitions", () => {
    it("should start in IDLE phase", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      expect(result.current.phase).toBe("idle");
      expect(result.current.phaseRef.current).toBe("idle");
    });

    it("IDLE → WAITING via transitionToWaiting()", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });

      expect(result.current.phase).toBe("waiting");
      expect(result.current.phaseRef.current).toBe("waiting");
      expect(opts.setIsLoading).toHaveBeenCalledWith(true);
    });

    it("WAITING → STREAMING via transitionToStreaming()", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-123");
      });

      expect(result.current.phase).toBe("streaming");
      expect(result.current.phaseRef.current).toBe("streaming");
      expect(result.current.streamingRunIdRef.current).toBe("run-123");
    });

    it("STREAMING → FINALIZING via transitionToFinalizing()", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-123");
      });
      act(() => {
        result.current.transitionToFinalizing();
      });

      expect(result.current.phase).toBe("finalizing");
      expect(result.current.phaseRef.current).toBe("finalizing");
    });

    it("FINALIZING → IDLE (text-only, no tools seen)", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-123");
      });
      // toolsSeenRef remains false (text-only)
      act(() => {
        result.current.transitionToFinalizing();
      });

      // Advance past FINALIZE_DEBOUNCE_MS (3s)
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.phase).toBe("idle");
      expect(opts.setIsLoading).toHaveBeenCalledWith(false);
      // Smart merge: should NOT call mergeHistory for text-only
      const mergeCallsAfterFinalize = opts.mergeHistory.mock.calls.filter(
        (call: [boolean]) => call[0] === false
      );
      expect(mergeCallsAfterFinalize).toHaveLength(0);
    });

    it("FINALIZING → IDLE (with tools seen — merge + retry)", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-123");
      });
      // Mark tools as seen
      act(() => {
        result.current.toolsSeenRef.current = true;
      });
      act(() => {
        result.current.transitionToFinalizing();
      });

      // Advance past FINALIZE_DEBOUNCE_MS (3s) — triggers first merge
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.phase).toBe("finalizing");
      expect(opts.mergeHistory).toHaveBeenCalledWith(false);
      expect(opts.setIsLoading).toHaveBeenCalledWith(false);
      expect(result.current.streamingRunIdRef.current).toBeNull();

      // Advance past RETRY_DELAY_MS (5s) — triggers retry merge + idle
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.phase).toBe("idle");
      // mergeHistory called twice: once at 3s, once at 3+5=8s
      const falseMerges = opts.mergeHistory.mock.calls.filter(
        (call: [boolean]) => call[0] === false
      );
      expect(falseMerges).toHaveLength(2);
    });

    it("transitionToIdle() force-resets from any phase", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-123");
      });

      expect(result.current.phase).toBe("streaming");

      act(() => {
        result.current.transitionToIdle();
      });

      expect(result.current.phase).toBe("idle");
      expect(result.current.streamingRunIdRef.current).toBeNull();
      expect(result.current.streamingTextRef.current).toBe("");
      expect(result.current.toolsSeenRef.current).toBe(false);
      expect(opts.setIsLoading).toHaveBeenCalledWith(false);
    });

    it("resetForNewSession() resets all state", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-abc");
        result.current.streamingTextRef.current = "some content";
        result.current.toolsSeenRef.current = true;
      });

      act(() => {
        result.current.resetForNewSession();
      });

      expect(result.current.phase).toBe("idle");
      expect(result.current.streamingTextRef.current).toBe("");
      expect(result.current.streamingRunIdRef.current).toBeNull();
      expect(result.current.toolsSeenRef.current).toBe(false);
    });

    it("full lifecycle: IDLE → WAITING → STREAMING → FINALIZING → IDLE", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      expect(result.current.phase).toBe("idle");

      // User sends message
      act(() => {
        result.current.transitionToWaiting();
      });
      expect(result.current.phase).toBe("waiting");

      // First delta arrives
      act(() => {
        result.current.transitionToStreaming("run-lifecycle");
      });
      expect(result.current.phase).toBe("streaming");

      // Stream deltas
      act(() => {
        result.current.onDelta();
        result.current.onDelta();
      });
      expect(result.current.phase).toBe("streaming");

      // Stream ends
      act(() => {
        result.current.transitionToFinalizing();
      });
      expect(result.current.phase).toBe("finalizing");

      // Wait for finalize debounce (text-only — no tools)
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.phase).toBe("idle");
    });
  });

  // ================================================================
  // 3. Ref-based text deltas
  // ================================================================
  describe("ref-based text deltas", () => {
    it("streamingTextRef is mutable and starts empty", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      expect(result.current.streamingTextRef.current).toBe("");
    });

    it("streamingTextRef can accumulate delta text", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
        result.current.transitionToStreaming("run-1");
      });

      // Simulate appending deltas (as the consumer would)
      result.current.streamingTextRef.current += "Hello ";
      result.current.streamingTextRef.current += "world!";

      expect(result.current.streamingTextRef.current).toBe("Hello world!");
    });

    it("streamingRunIdRef is set during transitionToStreaming and cleared on finalize", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      expect(result.current.streamingRunIdRef.current).toBeNull();

      act(() => {
        result.current.transitionToWaiting();
      });
      // Cleared during waiting
      expect(result.current.streamingRunIdRef.current).toBeNull();

      act(() => {
        result.current.transitionToStreaming("run-ref-test");
      });
      expect(result.current.streamingRunIdRef.current).toBe("run-ref-test");

      act(() => {
        result.current.transitionToFinalizing();
      });
      // Still set until debounce fires
      expect(result.current.streamingRunIdRef.current).toBe("run-ref-test");

      // After debounce fires, runId is cleared
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.streamingRunIdRef.current).toBeNull();
    });

    it("transitionToWaiting resets text and runId refs", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
        result.current.transitionToStreaming("run-x");
      });
      result.current.streamingTextRef.current = "accumulated text";

      act(() => {
        result.current.transitionToWaiting();
      });

      expect(result.current.streamingTextRef.current).toBe("");
      expect(result.current.streamingRunIdRef.current).toBeNull();
    });

    it("toolsSeenRef is reset on transitionToWaiting", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      result.current.toolsSeenRef.current = true;

      act(() => {
        result.current.transitionToWaiting();
      });

      expect(result.current.toolsSeenRef.current).toBe(false);
    });
  });

  // ================================================================
  // 4. Timer management
  // ================================================================
  describe("timer management", () => {
    describe("WAITING phase — 15s no-response timer", () => {
      it("should call mergeHistory(true) after 15s with no events", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
        });

        // Before 15s — no merge
        await act(async () => {
          vi.advanceTimersByTime(14_999);
        });
        expect(opts.mergeHistory).not.toHaveBeenCalled();

        // At 15s — merge fires
        await act(async () => {
          vi.advanceTimersByTime(1);
        });
        expect(opts.mergeHistory).toHaveBeenCalledWith(true);
      });

      it("should NOT fire no-response timer if phase transitions to streaming", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
        });

        // Transition to streaming before the 15s no-response timer fires.
        // transitionToStreaming calls clearTimer(), cancelling the waiting timer.
        act(() => {
          result.current.transitionToStreaming("run-early");
        });

        // Advance only to the point where the no-response timer WOULD have fired
        // but stay under the 8s streaming idle timer.
        await act(async () => {
          vi.advanceTimersByTime(7_999);
        });

        // No mergeHistory calls should have happened —
        // the waiting no-response timer was cancelled by transitionToStreaming.
        expect(opts.mergeHistory).not.toHaveBeenCalled();
      });
    });

    describe("STREAMING phase — 8s idle timer", () => {
      it("should call mergeHistory(true) after 8s with no deltas", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
        });
        act(() => {
          result.current.transitionToStreaming("run-idle");
        });

        await act(async () => {
          vi.advanceTimersByTime(8_000);
        });

        expect(opts.mergeHistory).toHaveBeenCalledWith(true);
      });

      it("should reset the 8s idle timer on each onDelta()", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
        });
        act(() => {
          result.current.transitionToStreaming("run-delta");
        });

        // Advance 6s, then send a delta
        await act(async () => {
          vi.advanceTimersByTime(6_000);
        });
        expect(opts.mergeHistory).not.toHaveBeenCalled();

        act(() => {
          result.current.onDelta(); // resets idle timer
        });

        // Advance another 6s — still within new 8s window
        await act(async () => {
          vi.advanceTimersByTime(6_000);
        });
        expect(opts.mergeHistory).not.toHaveBeenCalled();

        // Advance final 2s — now 8s since last delta
        await act(async () => {
          vi.advanceTimersByTime(2_000);
        });
        expect(opts.mergeHistory).toHaveBeenCalledWith(true);
      });

      it("onDelta() should be a no-op if not in streaming phase", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        // In idle — onDelta should be ignored
        act(() => {
          result.current.onDelta();
        });

        await act(async () => {
          vi.advanceTimersByTime(10_000);
        });

        expect(opts.mergeHistory).not.toHaveBeenCalled();
      });
    });

    describe("STREAMING phase — 5min safety timeout", () => {
      it("should force-finalize to IDLE after 5 minutes", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
        });
        act(() => {
          result.current.transitionToStreaming("run-safety");
        });

        // Keep sending deltas every 7s to prevent idle timeout (8s).
        // We need to stay in streaming for 300,000ms total.
        // 42 iterations * 7000ms = 294,000ms
        for (let i = 0; i < 42; i++) {
          await act(async () => {
            vi.advanceTimersByTime(7_000);
          });
          act(() => {
            result.current.onDelta();
          });
        }

        // We're now at 294,000ms. Still streaming.
        expect(result.current.phase).toBe("streaming");

        // Advance remaining 6,000ms to cross the 300,000ms safety threshold.
        await act(async () => {
          vi.advanceTimersByTime(6_000);
        });

        expect(result.current.phase).toBe("idle");
        expect(opts.setIsLoading).toHaveBeenCalledWith(false);
        expect(opts.mergeHistory).toHaveBeenCalledWith(false);
        expect(result.current.streamingRunIdRef.current).toBeNull();
      });

      it("safety timer should NOT fire if phase changed before 5min", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
        });
        act(() => {
          result.current.transitionToStreaming("run-safe2");
        });

        // Finalize normally before safety fires
        act(() => {
          result.current.transitionToFinalizing();
        });

        // transitionToFinalizing clears the safety timer, so even at 5min, no double-fire
        await act(async () => {
          vi.advanceTimersByTime(300_000);
        });

        // mergeHistory should only be called by the finalize debounce, not safety
        // (text-only, so finalize goes straight to idle without merge)
        const falseMerges = opts.mergeHistory.mock.calls.filter(
          (call: [boolean]) => call[0] === false
        );
        expect(falseMerges).toHaveLength(0);
      });
    });

    describe("FINALIZING phase — 3s debounce + 5s retry", () => {
      it("should wait 3s debounce before processing", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
          result.current.transitionToStreaming("run-fin");
          result.current.toolsSeenRef.current = true;
        });
        act(() => {
          result.current.transitionToFinalizing();
        });

        // Before debounce — should still be finalizing, no merge yet
        await act(async () => {
          vi.advanceTimersByTime(2_999);
        });
        expect(result.current.phase).toBe("finalizing");
        expect(opts.mergeHistory).not.toHaveBeenCalledWith(false);

        // At exactly 3s — merge fires
        await act(async () => {
          vi.advanceTimersByTime(1);
        });
        expect(opts.mergeHistory).toHaveBeenCalledWith(false);
      });

      it("retry merge fires 5s after the initial merge", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
          result.current.transitionToStreaming("run-retry");
          result.current.toolsSeenRef.current = true;
        });
        act(() => {
          result.current.transitionToFinalizing();
        });

        // 3s debounce → first merge
        await act(async () => {
          vi.advanceTimersByTime(3_000);
        });
        expect(opts.mergeHistory).toHaveBeenCalledTimes(1);
        expect(result.current.phase).toBe("finalizing");

        // 5s later → retry merge + transition to idle
        await act(async () => {
          vi.advanceTimersByTime(5_000);
        });
        expect(opts.mergeHistory).toHaveBeenCalledTimes(2);
        expect(result.current.phase).toBe("idle");
      });

      it("should not fire retry if transitionToIdle() is called during debounce", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
          result.current.transitionToStreaming("run-abort");
          result.current.toolsSeenRef.current = true;
        });
        act(() => {
          result.current.transitionToFinalizing();
        });

        // Force idle before debounce fires
        act(() => {
          result.current.transitionToIdle();
        });

        await act(async () => {
          vi.advanceTimersByTime(10_000);
        });

        // mergeHistory should NOT have been called with false (finalize merge)
        const falseMerges = opts.mergeHistory.mock.calls.filter(
          (call: [boolean]) => call[0] === false
        );
        expect(falseMerges).toHaveLength(0);
        expect(result.current.phase).toBe("idle");
      });
    });

    describe("cancelAllTimers()", () => {
      it("should cancel all active timers", async () => {
        const opts = makeOptions();
        const { result } = renderHook(() => useStreamingPhase(opts));

        act(() => {
          result.current.transitionToWaiting();
        });

        act(() => {
          result.current.cancelAllTimers();
        });

        await act(async () => {
          vi.advanceTimersByTime(20_000);
        });

        // No-response timer should have been cancelled
        expect(opts.mergeHistory).not.toHaveBeenCalled();
      });
    });
  });

  // ================================================================
  // 5. Smart merge (toolsSeen controls FINALIZING behavior)
  // ================================================================
  describe("smart merge — toolsSeenRef", () => {
    it("text-only response (toolsSeen=false): skips mergeHistory, goes straight to idle", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-text");
      });
      // toolsSeenRef stays false
      act(() => {
        result.current.transitionToFinalizing();
      });

      // Wait for debounce
      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });

      expect(result.current.phase).toBe("idle");
      expect(opts.setIsLoading).toHaveBeenCalledWith(false);
      // mergeHistory should not have been called with autoFinalize=false
      const nonAutoMerges = opts.mergeHistory.mock.calls.filter(
        (call: [boolean]) => call[0] === false
      );
      expect(nonAutoMerges).toHaveLength(0);
    });

    it("tool response (toolsSeen=true): calls mergeHistory(false) twice (initial + retry)", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-tools");
        result.current.toolsSeenRef.current = true;
      });
      act(() => {
        result.current.transitionToFinalizing();
      });

      // Debounce (3s) → first merge
      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });
      expect(opts.mergeHistory).toHaveBeenCalledWith(false);
      expect(opts.mergeHistory).toHaveBeenCalledTimes(1);

      // Retry (5s more) → second merge
      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });
      expect(opts.mergeHistory).toHaveBeenCalledTimes(2);
      expect(result.current.phase).toBe("idle");
    });

    it("toolsSeen toggled mid-stream should be respected at finalize time", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-toggle");
      });

      // Initially no tools, then tools arrive mid-stream
      expect(result.current.toolsSeenRef.current).toBe(false);
      result.current.toolsSeenRef.current = true;

      act(() => {
        result.current.transitionToFinalizing();
      });

      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });

      // Should merge because tools were seen
      expect(opts.mergeHistory).toHaveBeenCalledWith(false);
    });
  });

  // ================================================================
  // 6. runIdOwners LRU cap
  // ================================================================
  describe("runIdOwners LRU cap", () => {
    const { registerRunId, runIdOwners } = _testHelpers;

    beforeEach(() => {
      runIdOwners.clear();
    });

    it("should register a runId → sessionKey mapping", () => {
      registerRunId("run-1", "session-A");
      expect(runIdOwners.get("run-1")).toBe("session-A");
    });

    it("should store up to 100 entries without eviction", () => {
      for (let i = 0; i < 100; i++) {
        registerRunId(`run-${i}`, `session-${i % 5}`);
      }
      expect(runIdOwners.size).toBe(100);
    });

    it("should evict oldest 20% when exceeding cap of 100", () => {
      // Fill to exactly 100
      for (let i = 0; i < 100; i++) {
        registerRunId(`run-${i}`, `session-${i % 5}`);
      }
      expect(runIdOwners.size).toBe(100);

      // Add one more → triggers eviction of 20 oldest entries
      registerRunId("run-trigger", "session-new");

      // 100 + 1 - 20 = 81
      expect(runIdOwners.size).toBe(81);

      // The oldest entries (run-0 through run-19) should be gone
      for (let i = 0; i < 20; i++) {
        expect(runIdOwners.has(`run-${i}`)).toBe(false);
      }

      // The newer entries should still exist
      for (let i = 20; i < 100; i++) {
        expect(runIdOwners.has(`run-${i}`)).toBe(true);
      }

      // The triggering entry should exist
      expect(runIdOwners.has("run-trigger")).toBe(true);
      expect(runIdOwners.get("run-trigger")).toBe("session-new");
    });

    it("should handle multiple eviction cycles", () => {
      // Fill to 100
      for (let i = 0; i < 100; i++) {
        registerRunId(`run-a-${i}`, "session-a");
      }

      // Add 21 more, triggering eviction once (at entry 101)
      for (let i = 0; i < 21; i++) {
        registerRunId(`run-b-${i}`, "session-b");
      }

      // After first eviction: 100 + 1 - 20 = 81, then +20 more = 101
      // This triggers a second eviction: 101 - 20 = 81
      expect(runIdOwners.size).toBe(81);
    });

    it("should overwrite existing key without increasing size", () => {
      registerRunId("run-same", "session-old");
      registerRunId("run-same", "session-new");

      expect(runIdOwners.size).toBe(1);
      expect(runIdOwners.get("run-same")).toBe("session-new");
    });

    it("eviction respects insertion order (Map is ordered)", () => {
      // Register entries in order
      for (let i = 0; i < 101; i++) {
        registerRunId(`run-${String(i).padStart(3, "0")}`, "s");
      }

      // First 20 entries should have been evicted
      expect(runIdOwners.has("run-000")).toBe(false);
      expect(runIdOwners.has("run-019")).toBe(false);
      expect(runIdOwners.has("run-020")).toBe(true);
      expect(runIdOwners.has("run-100")).toBe(true);
    });
  });

  // ================================================================
  // 7. WeakMap normalize cache (cachedNormalize)
  // ================================================================
  describe("cachedNormalize (WeakMap cache)", () => {
    const { cachedNormalize } = _testHelpers;

    it("should normalize whitespace in message content", () => {
      const msg = makeMessage({ content: "  hello   world  \n\n  foo  " });
      const result = cachedNormalize(msg);
      expect(result).toBe("hello world foo");
    });

    it("should return cached result for the same message object", () => {
      const msg = makeMessage({ content: "  hello   world  " });

      const first = cachedNormalize(msg);
      const second = cachedNormalize(msg);

      // Same reference means cache hit
      expect(first).toBe(second);
      expect(first).toBe("hello world");
    });

    it("should compute independently for different message objects with same content", () => {
      const msg1 = makeMessage({ content: "  hello   world  " });
      const msg2 = makeMessage({ content: "  hello   world  " });

      const r1 = cachedNormalize(msg1);
      const r2 = cachedNormalize(msg2);

      // Same value, but computed independently (different WeakMap keys)
      expect(r1).toBe("hello world");
      expect(r2).toBe("hello world");
      expect(r1).toBe(r2); // string equality
    });

    it("should handle empty content", () => {
      const msg = makeMessage({ content: "" });
      expect(cachedNormalize(msg)).toBe("");
    });

    it("should handle content with only whitespace", () => {
      const msg = makeMessage({ content: "   \n\t\n   " });
      expect(cachedNormalize(msg)).toBe("");
    });

    it("should handle content with special characters", () => {
      const msg = makeMessage({ content: "hello\tworld\nfoo   bar" });
      expect(cachedNormalize(msg)).toBe("hello world foo bar");
    });

    it("should handle content that is already normalized", () => {
      const msg = makeMessage({ content: "hello world" });
      expect(cachedNormalize(msg)).toBe("hello world");
    });

    it("should cache results per unique object even if content mutated (WeakMap keyed by identity)", () => {
      // WeakMap uses object identity, so mutating content after caching
      // still returns the cached value (stale but expected behavior)
      const msg = makeMessage({ content: "original content" });
      const first = cachedNormalize(msg);
      expect(first).toBe("original content");

      // Mutate the content (unusual but tests cache identity semantics)
      (msg as { content: string }).content = "mutated content";
      const second = cachedNormalize(msg);

      // Still returns the cached (stale) result — this is the expected behavior
      // because WeakMap key is the object reference, not its contents
      expect(second).toBe("original content");
    });
  });

  // ================================================================
  // Edge cases & cleanup
  // ================================================================
  describe("edge cases", () => {
    it("should clean up timers on unmount", async () => {
      const opts = makeOptions();
      const { result, unmount } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });

      // Unmount while timer is active
      unmount();

      // Advance past all timer durations — nothing should throw or fire
      await act(async () => {
        vi.advanceTimersByTime(300_000);
      });

      // mergeHistory should not have been called after unmount
      expect(opts.mergeHistory).not.toHaveBeenCalled();
    });

    it("transitionToWaiting clears any in-progress timers from prior phase", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      // Start streaming with active timers
      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-old");
      });

      // Go back to waiting without going through finalizing
      act(() => {
        result.current.transitionToWaiting();
      });

      // The old streaming idle timer (8s) should be cleared
      await act(async () => {
        vi.advanceTimersByTime(8_000);
      });

      // mergeHistory should not fire from the old streaming timer
      // Only the new waiting no-response timer should be active
      expect(opts.mergeHistory).not.toHaveBeenCalled();

      // But the new waiting timer should still fire at 15s
      await act(async () => {
        vi.advanceTimersByTime(7_000);
      });
      expect(opts.mergeHistory).toHaveBeenCalledWith(true);
    });

    it("rapid phase transitions should not cause timer leaks", async () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      // Rapid transitions
      act(() => {
        result.current.transitionToWaiting();
        result.current.transitionToStreaming("run-rapid-1");
        result.current.transitionToFinalizing();
        result.current.transitionToWaiting();
        result.current.transitionToStreaming("run-rapid-2");
        result.current.transitionToIdle();
      });

      expect(result.current.phase).toBe("idle");

      // No timers should fire after going idle
      await act(async () => {
        vi.advanceTimersByTime(300_000);
      });
      expect(opts.mergeHistory).not.toHaveBeenCalled();
    });

    it("phaseRef is always in sync with phase state", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      const phases: Array<{ state: string; ref: string }> = [];

      act(() => {
        result.current.transitionToWaiting();
      });
      phases.push({ state: result.current.phase, ref: result.current.phaseRef.current });

      act(() => {
        result.current.transitionToStreaming("run-sync");
      });
      phases.push({ state: result.current.phase, ref: result.current.phaseRef.current });

      act(() => {
        result.current.transitionToFinalizing();
      });
      phases.push({ state: result.current.phase, ref: result.current.phaseRef.current });

      act(() => {
        result.current.transitionToIdle();
      });
      phases.push({ state: result.current.phase, ref: result.current.phaseRef.current });

      for (const p of phases) {
        expect(p.state).toBe(p.ref);
      }
    });

    it("multiple transitionToStreaming calls overwrite runId", () => {
      const opts = makeOptions();
      const { result } = renderHook(() => useStreamingPhase(opts));

      act(() => {
        result.current.transitionToWaiting();
      });
      act(() => {
        result.current.transitionToStreaming("run-first");
      });
      expect(result.current.streamingRunIdRef.current).toBe("run-first");

      act(() => {
        result.current.transitionToStreaming("run-second");
      });
      expect(result.current.streamingRunIdRef.current).toBe("run-second");
    });
  });
});
