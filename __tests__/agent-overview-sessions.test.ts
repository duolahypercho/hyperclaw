import { beforeEach, describe, expect, it, vi } from "vitest";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import { loadAgentOverviewSessions } from "$/components/ensemble/views/agent-overview-sessions";

vi.mock("$/lib/hyperclaw-bridge-client", () => ({
  bridgeInvoke: vi.fn(),
}));

describe("loadAgentOverviewSessions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("loads OpenClaw recent chats from the gateway session list", async () => {
    const listSessions = vi.spyOn(gatewayConnection, "listSessions").mockResolvedValue({
      sessions: [
        {
          key: "agent:orin:older",
          label: "Older chat",
          updatedAt: 100,
        },
        {
          key: "agent:orin:newer",
          label: "Newer chat",
          updatedAt: 200,
        },
      ],
    });

    const sessions = await loadAgentOverviewSessions({
      agentId: "orin",
      runtime: "openclaw",
    });

    expect(listSessions).toHaveBeenCalledWith("orin", 50, { includeDefault: false });
    expect(bridgeInvoke).not.toHaveBeenCalled();
    expect(sessions).toEqual([
      {
        key: "agent:orin:newer",
        label: "Newer chat",
        updatedAt: 200,
        status: undefined,
        preview: undefined,
      },
      {
        key: "agent:orin:older",
        label: "Older chat",
        updatedAt: 100,
        status: undefined,
        preview: undefined,
      },
    ]);
  });

  it("does not show OpenClaw's synthetic main placeholder as a recent chat", async () => {
    vi.spyOn(gatewayConnection, "listSessions").mockImplementation(
      async (_agentId, _limit, options) =>
        options?.includeDefault === false
          ? { sessions: [] }
          : {
              sessions: [
                {
                  key: "agent:orin:main",
                  createdAt: 123,
                  updatedAt: 123,
                },
              ],
            }
    );

    const sessions = await loadAgentOverviewSessions({
      agentId: "orin",
      runtime: "openclaw",
    });

    expect(sessions).toEqual([]);
  });

  it("skips malformed Hermes sessions without a key or id", async () => {
    vi.mocked(bridgeInvoke).mockResolvedValue({
      sessions: [
        { updatedAt: 200 },
        { id: "session-9", updatedAt: 100 },
      ],
    });

    const sessions = await loadAgentOverviewSessions({
      agentId: "hermes:rell",
      runtime: "hermes",
    });

    expect(sessions).toEqual([
      {
        key: "hermes:session-9",
        label: "session-9",
        updatedAt: 100,
        status: undefined,
        preview: undefined,
      },
    ]);
  });
});
