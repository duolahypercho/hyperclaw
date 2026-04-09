import { beforeEach, describe, expect, it, vi } from "vitest";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";

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
