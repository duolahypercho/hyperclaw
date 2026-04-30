import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendUniqueSuffix,
  gatewayConnection,
  isGatewayUnavailableErrorMessage,
  resolveMergedStreamText,
  stripCommittedPrefix,
} from "$/lib/openclaw-gateway-ws";

describe("gatewayConnection.getChatHistory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    gatewayConnection._chatHistoryInflight.clear();
    gatewayConnection._chatHistoryCache.clear();
    gatewayConnection.pendingRequests.clear();
    gatewayConnection.pendingRequestTimeouts.forEach((timer) => clearTimeout(timer));
    gatewayConnection.pendingRequestTimeouts.clear();
  });

  it("deduplicates concurrent requests for the same session and limit", async () => {
    let resolveRequest: ((value: { messages?: unknown[] }) => void) | null = null;
    const requestSpy = vi
      .spyOn(gatewayConnection, "request")
      .mockImplementation(
        () =>
          new Promise<{ messages?: unknown[] }>((resolve) => {
            resolveRequest = resolve;
          }) as Promise<never>
      );

    const first = gatewayConnection.getChatHistory("agent:test:main", 50);
    const second = gatewayConnection.getChatHistory("agent:test:main", 50);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    resolveRequest!({ messages: [{ id: "m1" }] });
    await expect(first).resolves.toEqual({ messages: [{ id: "m1" }] });
    await expect(second).resolves.toEqual({ messages: [{ id: "m1" }] });
  });

  it("serves a short-lived cached response without re-requesting", async () => {
    const requestSpy = vi
      .spyOn(gatewayConnection, "request")
      .mockResolvedValue({ messages: [{ id: "cached" }] } as never);

    const first = gatewayConnection.getChatHistory("agent:test:main", 50);
    await expect(first).resolves.toEqual({
      messages: [{ id: "cached" }],
    });
    await Promise.resolve();

    await expect(gatewayConnection.getChatHistory("agent:test:main", 50)).resolves.toEqual({
      messages: [{ id: "cached" }],
    });

    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

});

describe("gateway streaming merge helpers", () => {
  it("prefers accumulated text over fragment delta when both are present", () => {
    expect(
      resolveMergedStreamText({
        previousText: "Checking immediately.\n\n",
        nextText: "Checking immediately.\n\nGood news: Nothing is actually gone.",
        nextDelta: "Good news: Nothing is actually gone.",
      })
    ).toBe("Checking immediately.\n\nGood news: Nothing is actually gone.");
  });

  it("merges fragment deltas without duplicating overlap", () => {
    expect(
      resolveMergedStreamText({
        previousText: "Current status:\n\nGateway: running",
        nextDelta: "running\nAgents loaded",
      })
    ).toBe("Current status:\n\nGateway: running\nAgents loaded");
  });

  it("strips a committed pre-tool prefix from later accumulated text", () => {
    expect(
      stripCommittedPrefix(
        "Before tool call\nAfter tool call",
        "Before tool call"
      )
    ).toBe("\nAfter tool call");
  });

  it("avoids duplicating an already-present suffix", () => {
    expect(
      appendUniqueSuffix(
        "What clips were these? If you fill me in, I can help.",
        "If you fill me in, I can help."
      )
    ).toBe("What clips were these? If you fill me in, I can help.");
  });
});

describe("gateway availability classification", () => {
  it("treats hub offline-device errors as gateway unavailable", () => {
    expect(isGatewayUnavailableErrorMessage("device not connected or not in your tenant")).toBe(true);
    expect(isGatewayUnavailableErrorMessage("failed to communicate with device")).toBe(true);
    expect(isGatewayUnavailableErrorMessage("connector is offline")).toBe(true);
  });

  it("does not classify unrelated request failures as gateway unavailable", () => {
    expect(isGatewayUnavailableErrorMessage("model provider rejected the request")).toBe(false);
    expect(isGatewayUnavailableErrorMessage("feature not available in your tenant")).toBe(false);
  });

  it("updates the keepalive timestamp on pong messages", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(12345);
    gatewayConnection._lastPong = 1;

    gatewayConnection.handleMessage({ type: "pong" });

    expect(gatewayConnection._lastPong).toBe(12345);
    nowSpy.mockRestore();
  });
});

describe("gateway direct connect handshake", () => {
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;

    static instances: MockWebSocket[] = [];

    readyState = MockWebSocket.CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    sent: string[] = [];

    constructor(public readonly url: string) {
      MockWebSocket.instances.push(this);
    }

    send(data: string) {
      this.sent.push(data);
    }

    close() {
      this.readyState = 3;
    }

    emitMessage(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) });
    }
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
    gatewayConnection.disconnect();
    gatewayConnection.permanentlyFailed = false;
    gatewayConnection.reconnectAttempt = 0;
    gatewayConnection.listeners.clear();
    gatewayConnection.chatEventListeners.clear();
    gatewayConnection.notificationListeners.clear();
    gatewayConnection.eventHandlers.clear();
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    gatewayConnection.disconnect();
    vi.unstubAllGlobals();
  });

  it("advertises tool-events capability during the OpenClaw connect handshake", async () => {
    const signConnectChallenge = vi.fn().mockResolvedValue({
      device: { id: "device-1" },
      client: { id: "gateway-client" },
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.admin"],
    });

    vi.stubGlobal("window", {
      electronAPI: {
        openClaw: {
          signConnectChallenge,
        },
      },
    });

    gatewayConnection.connect("ws://127.0.0.1:18789/gateway", { token: "gateway-token" });

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    ws.emitMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "nonce-1", ts: 1 },
    });

    // The signing mock resolves in one microtask; the connect-response .then()
    // sends the WebSocket request in the next one.
    await Promise.resolve();
    await Promise.resolve();

    expect(signConnectChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "gateway-client",
        token: "gateway-token",
        nonce: "nonce-1",
      })
    );

    const connectRequest = ws.sent
      .map((raw) => JSON.parse(raw))
      .find((msg) => msg.method === "connect");
    expect(connectRequest).toBeDefined();
    expect(connectRequest.params).toMatchObject({
      role: "operator",
      auth: { token: "gateway-token" },
      caps: ["tool-events"],
    });
  });

  it("ignores gateway connect challenges when the dashboard is connected through the hub", () => {
    gatewayConnection.connect("ws://hub.example/ws/dashboard", { hubMode: true });

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    ws.emitMessage({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "nonce-1", ts: 1 },
    });

    expect(ws.sent).toHaveLength(0);
  });

  it("clears stale stream ownership state when opening a fresh gateway connection", () => {
    gatewayConnection._deltaSourceOwner = new Map([["stale-run", "agent"]]);
    gatewayConnection._committedSegments = new Map([["stale-run", "partial text"]]);

    gatewayConnection.connect("ws://127.0.0.1:18789/gateway", { token: "gateway-token" });

    expect(gatewayConnection._deltaSourceOwner?.size).toBe(0);
    expect(gatewayConnection._committedSegments?.size).toBe(0);
  });

  it("clears stale stream ownership state on disconnect", () => {
    gatewayConnection._deltaSourceOwner = new Map([["stale-run", "agent"]]);
    gatewayConnection._committedSegments = new Map([["stale-run", "partial text"]]);

    gatewayConnection.disconnect();

    expect(gatewayConnection._deltaSourceOwner).toBeNull();
    expect(gatewayConnection._committedSegments).toBeNull();
  });
});
