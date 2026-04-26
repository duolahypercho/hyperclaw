import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendUniqueSuffix,
  gatewayConnection,
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
