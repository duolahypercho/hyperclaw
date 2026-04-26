import { describe, expect, it } from "vitest";
import { resolveProjectAgentDisplay } from "$/components/ensemble/views/project-agent-display";

describe("resolveProjectAgentDisplay", () => {
  it("returns identity-hook-ready agent data instead of freezing stale avatar data", () => {
    const display = resolveProjectAgentDisplay({
      id: "agent-1",
      name: "Clio",
      runtime: "openclaw",
      emoji: "🦞",
      avatarData: "data:image/png;base64,avatar",
    });

    expect(display).toEqual({
      id: "agent-1",
      name: "Clio",
      emoji: "🦞",
      kind: "openclaw",
    });
  });

  it("falls back to the member id when the agent is not loaded yet", () => {
    const display = resolveProjectAgentDisplay(undefined, "agent-missing");

    expect(display).toEqual({
      id: "agent-missing",
      name: "agent-missing",
      emoji: "🤖",
      kind: undefined,
    });
  });
});
