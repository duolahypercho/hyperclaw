import { describe, expect, it } from "vitest";
import { resolveAgentProfileDisplay } from "$/components/ensemble/views/agent-profile-display";

describe("resolveAgentProfileDisplay", () => {
  it("prefers the saved identity over the registry fallback", () => {
    const display = resolveAgentProfileDisplay(
      {
        name: "main",
        title: "OpenClaw",
        identity: "Runtime fallback description",
      },
      {
        name: "doraemon",
        role: "Pocket operator",
        description: "Helps the founder pull the right tool from the future.",
      },
    );

    expect(display).toEqual({
      name: "doraemon",
      role: "Pocket operator",
      description: "Helps the founder pull the right tool from the future.",
    });
  });

  it("falls back to the registry values while identity is still loading", () => {
    const display = resolveAgentProfileDisplay(
      {
        name: "OpenClaw Agent",
        title: "OpenClaw",
        identity: "Runtime fallback description",
      },
      null,
    );

    expect(display).toEqual({
      name: "OpenClaw Agent",
      role: "OpenClaw",
      description: "Runtime fallback description",
    });
  });
});
