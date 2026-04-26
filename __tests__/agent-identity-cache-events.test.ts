import { afterEach, describe, expect, it, vi } from "vitest";

const bridgeInvokeMock = vi.fn();

vi.mock("$/lib/hyperclaw-bridge-client", () => ({
  bridgeInvoke: bridgeInvokeMock,
}));

vi.mock("$/lib/openclaw-gateway-ws", () => ({
  getGatewayConnectionState: () => ({ connected: false }),
  subscribeGatewayConnection: vi.fn(() => vi.fn()),
}));

class TestCustomEvent<T = unknown> extends Event {
  detail: T;

  constructor(type: string, eventInitDict?: CustomEventInit<T>) {
    super(type, eventInitDict);
    this.detail = eventInitDict?.detail as T;
  }
}

function flushAsyncWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("agent identity cache events", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("broadcasts fresh identity data after an IDENTITY.md file change", async () => {
    const windowTarget = new EventTarget();
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("CustomEvent", TestCustomEvent);

    bridgeInvokeMock.mockResolvedValue({
      success: true,
      data: {
        name: "Ada",
        emoji: "A",
        role: "Research",
        description: "Finds the sharp edge.",
        runtime: "openclaw",
      },
    });

    const { AGENT_IDENTITY_CACHE_PATCHED_EVENT } = await import("$/hooks/useAgentIdentity");
    const seen: Array<{ agentId?: string; identity?: { name?: string } }> = [];

    window.addEventListener(AGENT_IDENTITY_CACHE_PATCHED_EVENT, (event) => {
      seen.push((event as CustomEvent).detail);
    });

    window.dispatchEvent(
      new CustomEvent("openclaw-gateway-event", {
        detail: {
          event: "agent.file.changed",
          data: { fileKey: "IDENTITY", agentId: "main" },
        },
      }),
    );

    await flushAsyncWork();

    expect(seen).toEqual([
      {
        agentId: "main",
        identity: expect.objectContaining({ name: "Ada" }),
      },
    ]);
  });

  it("broadcasts manually patched identity data for immediate-save flows", async () => {
    const windowTarget = new EventTarget();
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("CustomEvent", TestCustomEvent);

    const { AGENT_IDENTITY_CACHE_PATCHED_EVENT, patchIdentityCache } = await import("$/hooks/useAgentIdentity");
    const seen: Array<{ agentId?: string; identity?: { name?: string } }> = [];

    window.addEventListener(AGENT_IDENTITY_CACHE_PATCHED_EVENT, (event) => {
      seen.push((event as CustomEvent).detail);
    });

    patchIdentityCache("main", { name: "Ada" });

    expect(seen).toEqual([
      {
        agentId: "main",
        identity: expect.objectContaining({ name: "Ada" }),
      },
    ]);
  });
});
