import { describe, expect, it } from "vitest";
import { extractAgentIdFromSessionKey } from "$/components/ensemble/hooks/useAgentStreamingState";

describe("agent streaming status helpers", () => {
  it("maps chat session keys back to the visual agent id", () => {
    expect(extractAgentIdFromSessionKey("ensemble:dm:orin")).toBe("orin");
    expect(extractAgentIdFromSessionKey("ensemble:dm:hermes:rell")).toBe("hermes:rell");
    expect(extractAgentIdFromSessionKey("agent:orin:main")).toBe("orin");
    expect(extractAgentIdFromSessionKey("agent:hermes:rell:main")).toBe("hermes:rell");
    expect(extractAgentIdFromSessionKey("claude-code:orin:main")).toBe("orin");
    expect(extractAgentIdFromSessionKey("ensemble:room:alpha")).toBeUndefined();
  });
});
