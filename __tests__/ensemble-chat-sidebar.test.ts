import { describe, expect, it } from "vitest";
import {
  extractChatEventPreview,
  formatAgentRowDetail,
  getAgentIdFromMainChatSessionKey,
} from "$/components/ensemble/views/ensemble-chat-sidebar";

describe("ensemble chat sidebar helpers", () => {
  it("shows latest message text before falling back to runtime", () => {
    expect(formatAgentRowDetail("Claude Code", "  Finished the onboarding flow.  ")).toBe(
      "Finished the onboarding flow."
    );
    expect(formatAgentRowDetail("OpenClaw", "")).toBe("OpenClaw");
    expect(formatAgentRowDetail("Hermes")).toBe("Hermes");
  });

  it("extracts readable assistant text from final chat event messages", () => {
    expect(
      extractChatEventPreview({
        role: "assistant",
        content: [{ type: "text", text: "I can take this next." }],
      })
    ).toBe("I can take this next.");

    expect(
      extractChatEventPreview({
        role: "assistant",
        content: "Plain response",
      })
    ).toBe("Plain response");

    expect(
      extractChatEventPreview({
        role: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "world" },
        ],
      })
    ).toBe("Hello world");

    expect(extractChatEventPreview("Direct string response")).toBe("Direct string response");
    expect(
      extractChatEventPreview({
        role: "assistant",
        text: "Fallback text",
      })
    ).toBe("Fallback text");

    expect(
      extractChatEventPreview({
        role: "toolResult",
        content: "Tool output",
      })
    ).toBeUndefined();
  });

  it("maps main 1:1 session keys back to agent ids", () => {
    expect(getAgentIdFromMainChatSessionKey("ensemble:dm:orin")).toBe("orin");
    expect(getAgentIdFromMainChatSessionKey("ensemble:dm:hermes:rell")).toBe("hermes:rell");
    expect(getAgentIdFromMainChatSessionKey("agent:orin:main")).toBe("orin");
    expect(getAgentIdFromMainChatSessionKey("agent:hermes:rell:main")).toBe("hermes:rell");
    expect(getAgentIdFromMainChatSessionKey("ensemble:room:alpha")).toBeUndefined();
  });
});
