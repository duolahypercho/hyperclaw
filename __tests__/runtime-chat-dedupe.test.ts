import { describe, expect, it } from "vitest";
import type { GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";
import {
  mergeRuntimeResponseMessages,
  selectRuntimeResponseMessages,
} from "@OS/AI/core/hook/runtime-chat-dedupe";

const msg = (
  id: string,
  role: GatewayChatMessage["role"],
  content: string
): GatewayChatMessage => ({
  id,
  role,
  content,
  timestamp: 1,
});

describe("runtime chat dedupe", () => {
  it("keeps only messages after the echoed current user message", () => {
    const selected = selectRuntimeResponseMessages(
      [
        msg("old-user", "user", "hello"),
        msg("old-assistant", "assistant", "old answer"),
        msg("current-user", "user", "Hey, who are you?"),
        msg("current-assistant", "assistant", "I'm Doraemon."),
      ],
      "Hey, who are you?"
    );

    expect(selected.map((message) => message.id)).toEqual([
      "current-assistant",
    ]);
  });

  it("does not append echoed user or duplicate streamed assistant content", () => {
    const merged = mergeRuntimeResponseMessages(
      [
        msg("local-user", "user", "Just checking on you. What can you do?"),
        msg("stream-active", "assistant", "Just keeping things running!"),
      ],
      [
        msg("server-user", "user", "Just checking on you. What can you do?"),
        msg("server-assistant", "assistant", "Just keeping things running!"),
      ],
      "Just checking on you. What can you do?",
      ["stream-active"]
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(merged.map((message) => message.content)).toEqual([
      "Just checking on you. What can you do?",
      "Just keeping things running!",
    ]);
  });

  it("drops user messages when the connector returns history without an echo match", () => {
    const selected = selectRuntimeResponseMessages(
      [
        msg("old-user", "user", "not this turn"),
        msg("assistant", "assistant", "Current answer"),
      ],
      "current question"
    );

    expect(selected.map((message) => message.id)).toEqual(["assistant"]);
  });

  it("does not re-append historical assistant messages when fallback IDs are unstable", () => {
    const merged = mergeRuntimeResponseMessages(
      [
        msg("local-old-user", "user", "old question"),
        msg("local-old-assistant", "assistant", "old answer"),
        msg("local-current-user", "user", "current question"),
      ],
      [
        msg("server-old-assistant-new-id", "assistant", "old answer"),
        msg("server-current-assistant", "assistant", "current answer"),
      ],
      "current question"
    );

    expect(merged.map((message) => message.content)).toEqual([
      "old question",
      "old answer",
      "current question",
      "current answer",
    ]);
  });

  it("allows a single assistant-only reply to repeat text from a prior turn", () => {
    const merged = mergeRuntimeResponseMessages(
      [
        msg("old-user", "user", "first question"),
        msg("old-assistant", "assistant", "same answer"),
        msg("current-user", "user", "second question"),
      ],
      [msg("new-assistant", "assistant", "same answer")],
      "second question"
    );

    expect(merged.map((message) => message.id)).toEqual([
      "old-user",
      "old-assistant",
      "current-user",
      "new-assistant",
    ]);
  });
});
