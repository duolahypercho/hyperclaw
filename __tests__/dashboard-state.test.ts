// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridgeInvoke = vi.fn();

vi.mock("$/lib/hyperclaw-bridge-client", () => ({
  bridgeInvoke,
}));

describe("dashboardState persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    bridgeInvoke.mockReset();
    bridgeInvoke.mockResolvedValue({ success: true });
    const store = new Map<string, string>();
    const localStorageMock = {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(() => {
        store.clear();
      }),
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("batches rapid updates into a single save-app-state call", async () => {
    vi.resetModules();
    const { dashboardState } = await import("$/lib/dashboard-state");

    dashboardState.set("dashboard-layout", '{"lg":[]}');
    dashboardState.set("dashboard-visible-widgets", '["chat"]');
    dashboardState.setMany({
      "dashboard-widget-configs": '{"chat":{"agent":"a1"}}',
      "dashboard-widget-instances": '[{"id":"chat-1"}]',
    });

    expect(bridgeInvoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();

    expect(bridgeInvoke).toHaveBeenCalledTimes(1);
    expect(bridgeInvoke).toHaveBeenCalledWith("save-app-state", {
      entries: {
        "dashboard-layout": '{"lg":[]}',
        "dashboard-visible-widgets": '["chat"]',
        "dashboard-widget-configs": '{"chat":{"agent":"a1"}}',
        "dashboard-widget-instances": '[{"id":"chat-1"}]',
      },
    });
  });

  it("flushes immediately when requested", async () => {
    vi.resetModules();
    const { dashboardState } = await import("$/lib/dashboard-state");

    dashboardState.set("dashboard-widget-configs", '{"channel-dashboard":{"customTitle":"Alerts"}}', { flush: true });

    await Promise.resolve();

    expect(bridgeInvoke).toHaveBeenCalledTimes(1);
    expect(bridgeInvoke).toHaveBeenCalledWith("save-app-state", {
      entries: {
        "dashboard-widget-configs": '{"channel-dashboard":{"customTitle":"Alerts"}}',
      },
    });
  });
});
