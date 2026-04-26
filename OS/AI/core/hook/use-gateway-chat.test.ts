import { describe, it, expect } from "vitest";
import {
  _testHelpers,
  type GatewayChatMessage,
} from "./use-gateway-chat";

const {
  extractText,
  stripProtocolMarkers,
  normalizeForCompare,
  hasNormalizedContainment,
  normalizeMessage,
  deduplicateMessages,
  mergeHistoryIntoMessages,
  isFinalTextAlreadyRepresented,
  pruneContainedAssistantTextMessages,
  applyFinalAssistantText,
  getRuntimeHistorySessionId,
  usesGatewayHealthProbe,
  isTransientGatewayStartupError,
} = _testHelpers;

// isSilentReply is handled inline in the hook — not exported as a standalone function.
// These tests verify the pattern matching behavior via normalizeMessage/stripProtocolMarkers.
const SILENT_REPLY_PATTERN = /^\s*NO_REPLY\s*$/;
const isSilentReply = (text: string): boolean => SILENT_REPLY_PATTERN.test(text);

// ---------------------------------------------------------------------------
// extractText
// ---------------------------------------------------------------------------
describe("extractText", () => {
  it("returns null for null/undefined input", () => {
    expect(extractText(null)).toBeNull();
    expect(extractText(undefined)).toBeNull();
  });

  it("extracts string content directly", () => {
    expect(extractText({ content: "hello world" })).toBe("hello world");
  });

  it("extracts text blocks from array content", () => {
    expect(
      extractText({
        content: [
          { type: "text", text: "Hello " },
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "world" },
        ],
      })
    ).toBe("Hello world");
  });

  it("returns empty string when array has no text blocks", () => {
    expect(
      extractText({ content: [{ type: "thinking", thinking: "hmm" }] })
    ).toBe("");
  });

  it("returns null when content field is missing", () => {
    expect(extractText({ role: "assistant" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stripProtocolMarkers
// ---------------------------------------------------------------------------
describe("stripProtocolMarkers", () => {
  it("strips <final> tags", () => {
    expect(stripProtocolMarkers("hello <final> world")).toBe("hello  world");
  });

  it("strips <thinking> tags", () => {
    expect(stripProtocolMarkers("<thinking>deep thought</thinking>")).toBe(
      "deep thought"
    );
  });

  it("strips <NO_REPLY> tags", () => {
    expect(stripProtocolMarkers("<NO_REPLY/>")).toBe("");
  });

  it("preserves normal text", () => {
    expect(stripProtocolMarkers("just normal text")).toBe("just normal text");
  });
});

// ---------------------------------------------------------------------------
// isSilentReply
// ---------------------------------------------------------------------------
describe("isSilentReply", () => {
  it("detects bare NO_REPLY", () => {
    expect(isSilentReply("NO_REPLY")).toBe(true);
  });

  it("detects NO_REPLY with whitespace", () => {
    expect(isSilentReply("  NO_REPLY  ")).toBe(true);
  });

  it("rejects text containing NO_REPLY", () => {
    expect(isSilentReply("The system said NO_REPLY")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSilentReply("")).toBe(false);
  });

  it("rejects normal text", () => {
    expect(isSilentReply("Hello world")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeForCompare
// ---------------------------------------------------------------------------
describe("normalizeForCompare", () => {
  it("collapses whitespace", () => {
    expect(normalizeForCompare("hello   world")).toBe("hello world");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeForCompare("  hello  ")).toBe("hello");
  });

  it("normalizes newlines", () => {
    expect(normalizeForCompare("hello\n\nworld")).toBe("hello world");
  });
});

describe("hasNormalizedContainment", () => {
  it("detects when a later streaming snapshot is only a tail subset", () => {
    expect(
      hasNormalizedContainment(
        "I genuinely don't know. What clips were these? If you fill me in, I can help.",
        "What clips were these? If you fill me in, I can help."
      )
    ).toBe(true);
  });

  it("does not treat distinct segmented text as containment", () => {
    expect(hasNormalizedContainment("Before tool call", "After tool call")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runtime history helpers
// ---------------------------------------------------------------------------
describe("runtime history helpers", () => {
  it("extracts Claude session ids from prefixed keys", () => {
    expect(getRuntimeHistorySessionId("claude-code", "claude:abc123")).toBe("abc123");
  });

  it("extracts Codex session ids from prefixed keys", () => {
    expect(getRuntimeHistorySessionId("codex", "codex:rollout-42")).toBe("rollout-42");
  });

  it("strips Hermes agent/session prefixes", () => {
    expect(getRuntimeHistorySessionId("hermes", "agent:ceo:hermes:session-9")).toBe("session-9");
    expect(getRuntimeHistorySessionId("hermes", "hermes:session-10")).toBe("session-10");
  });

  it("rejects placeholder runtime session keys", () => {
    expect(getRuntimeHistorySessionId("codex", "default")).toBeNull();
    expect(getRuntimeHistorySessionId("hermes", "main")).toBeNull();
    expect(getRuntimeHistorySessionId("hermes", "agent:hermes:rell:main")).toBeNull();
    expect(getRuntimeHistorySessionId("hermes", "agent:hermes:rell:chat-123")).toBeNull();
  });

  it("only probes gateway health for OpenClaw", () => {
    expect(usesGatewayHealthProbe("openclaw")).toBe(true);
    expect(usesGatewayHealthProbe("codex")).toBe(false);
    expect(usesGatewayHealthProbe("claude-code")).toBe(false);
    expect(usesGatewayHealthProbe("hermes")).toBe(false);
  });

  it("treats OpenClaw startup and cooldown errors as transient", () => {
    expect(isTransientGatewayStartupError("gateway not connected")).toBe(true);
    expect(isTransientGatewayStartupError(new Error("Gateway not ready yet"))).toBe(true);
  });

  it("does not hide setup or unrelated gateway failures as startup", () => {
    expect(isTransientGatewayStartupError("pairing required")).toBe(false);
    expect(isTransientGatewayStartupError("WebSocket not connected")).toBe(false);
    expect(isTransientGatewayStartupError("Request chat.history timed out")).toBe(false);
    expect(isTransientGatewayStartupError(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeMessage — core of announcement handling
// ---------------------------------------------------------------------------
describe("normalizeMessage", () => {
  it("returns null for null/undefined", () => {
    expect(normalizeMessage(null)).toBeNull();
    expect(normalizeMessage(undefined)).toBeNull();
  });

  it("returns null for messages without role", () => {
    expect(normalizeMessage({ content: "hello" })).toBeNull();
  });

  it("normalizes simple string content", () => {
    const msg = normalizeMessage({
      role: "assistant",
      content: "Hello world",
      timestamp: 1000,
    });
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe("assistant");
    expect(msg!.content).toBe("Hello world");
    expect(msg!.timestamp).toBe(1000);
  });

  it("normalizes array content with text blocks", () => {
    const msg = normalizeMessage({
      role: "assistant",
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ],
    });
    expect(msg).not.toBeNull();
    expect(msg!.content).toBe("Hello world");
  });

  it("extracts thinking from contentBlocks", () => {
    const msg = normalizeMessage({
      role: "assistant",
      contentBlocks: [
        { type: "thinking", thinking: "Let me think..." },
        { type: "text", text: "The answer is 42" },
      ],
    });
    expect(msg).not.toBeNull();
    expect(msg!.thinking).toBe("Let me think...");
    expect(msg!.content).toBe("The answer is 42");
  });

  it("extracts tool calls from contentBlocks", () => {
    const msg = normalizeMessage({
      role: "assistant",
      contentBlocks: [
        {
          type: "toolCall",
          id: "tc1",
          name: "search",
          arguments: '{"q":"test"}',
        },
        { type: "text", text: "Searching..." },
      ],
    });
    expect(msg).not.toBeNull();
    expect(msg!.toolCalls).toHaveLength(1);
    expect(msg!.toolCalls![0].id).toBe("tc1");
    expect(msg!.content).toBe("Searching...");
  });

  it("extracts tool results from contentBlocks", () => {
    const msg = normalizeMessage({
      role: "assistant",
      contentBlocks: [
        {
          type: "toolResult",
          toolCallId: "tc1",
          toolName: "search",
          content: "Found 3 results",
          isError: false,
        },
      ],
    });
    expect(msg).not.toBeNull();
    expect(msg!.toolResults).toHaveLength(1);
    expect(msg!.toolResults![0].toolCallId).toBe("tc1");
  });

  it("handles announcement payload format (role + content array)", () => {
    // This is the actual format an announcement final sends
    const msg = normalizeMessage({
      role: "assistant",
      content: [{ type: "text", text: "Task completed successfully" }],
      timestamp: Date.now(),
    });
    expect(msg).not.toBeNull();
    expect(msg!.content).toBe("Task completed successfully");
    expect(msg!.role).toBe("assistant");
  });

  it("handles announcement with empty text (tool-only result)", () => {
    const msg = normalizeMessage({
      role: "assistant",
      content: [{ type: "tool_use", id: "tc1", name: "exec" }],
    });
    expect(msg).not.toBeNull();
    // Content should be empty since there are no text blocks
    expect(msg!.content).toBe("");
  });
});

// ---------------------------------------------------------------------------
// deduplicateMessages
// ---------------------------------------------------------------------------
describe("deduplicateMessages", () => {
  const msg = (id: string, role: string, content: string): GatewayChatMessage => ({
    id,
    role: role as GatewayChatMessage["role"],
    content,
    timestamp: Date.now(),
  });

  it("removes duplicate IDs (keeps last occurrence)", () => {
    const result = deduplicateMessages([
      msg("1", "user", "hello"),
      msg("1", "user", "hello updated"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("hello updated");
  });

  it("removes consecutive duplicate content", () => {
    const result = deduplicateMessages([
      msg("1", "assistant", "hello"),
      msg("2", "assistant", "hello"),
    ]);
    expect(result).toHaveLength(1);
  });

  it("preserves non-consecutive duplicates", () => {
    const result = deduplicateMessages([
      msg("1", "assistant", "hello"),
      msg("2", "user", "question"),
      msg("3", "assistant", "hello"),
    ]);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// mergeHistoryIntoMessages
// ---------------------------------------------------------------------------
describe("mergeHistoryIntoMessages", () => {
  const msg = (id: string, role: string, content: string): GatewayChatMessage => ({
    id,
    role: role as GatewayChatMessage["role"],
    content,
    timestamp: Date.now(),
  });

  it("returns null when no changes needed", () => {
    const msgs = [msg("1", "user", "hello"), msg("2", "assistant", "hi")];
    const result = mergeHistoryIntoMessages(msgs, msgs);
    expect(result).toBeNull();
  });

  it("adds new history messages", () => {
    const current = [msg("1", "user", "hello")];
    const history = [
      msg("1", "user", "hello"),
      msg("2", "assistant", "hi"),
    ];
    const result = mergeHistoryIntoMessages(current, history);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
  });

  it("preserves streaming messages not yet in history (returns null = keep current)", () => {
    // When streaming messages exist in current but not in history, and all
    // history messages match current, merge returns null (no changes needed).
    // The caller keeps the original current array, which includes the streaming msg.
    const current = [
      msg("1", "user", "hello"),
      msg("2", "assistant", "hi"),
      msg("streaming-1", "assistant", "partial response that is unique..."),
    ];
    const history = [
      msg("1", "user", "hello"),
      msg("2", "assistant", "hi"),
    ];
    const result = mergeHistoryIntoMessages(current, history);
    // null means "no changes" — current already contains the right messages
    expect(result).toBeNull();
    // Verify the streaming message is still in current (would be used by caller)
    expect(current[2].id).toBe("streaming-1");
  });

  it("includes streaming messages when history adds new messages", () => {
    const current = [
      msg("1", "user", "hello"),
      msg("streaming-1", "assistant", "partial response..."),
    ];
    const history = [
      msg("1", "user", "hello"),
      msg("new-from-server", "assistant", "server-side message"),
    ];
    const result = mergeHistoryIntoMessages(current, history);
    expect(result).not.toBeNull();
    // History message + streaming message (after last matched)
    expect(result!.length).toBeGreaterThanOrEqual(2);
  });

  it("content-matches messages with different IDs", () => {
    const current = [msg("client-id", "assistant", "hello world")];
    const history = [msg("server-id", "assistant", "hello world")];
    // Should use client reference (preserve reference)
    const result = mergeHistoryIntoMessages(current, history);
    expect(result).toBeNull(); // no changes — content matched, same length
  });
});

// ---------------------------------------------------------------------------
// final text reconciliation
// ---------------------------------------------------------------------------
describe("applyFinalAssistantText", () => {
  const msg = (id: string, role: string, content: string): GatewayChatMessage => ({
    id,
    role: role as GatewayChatMessage["role"],
    content,
    timestamp: Date.now(),
  });

  it("detects when segmented assistant text already matches the final text", () => {
    const messages: GatewayChatMessage[] = [
      msg("user-1", "user", "hello"),
      msg("seg-1", "assistant", "Before tool call"),
      {
        id: "tool-1",
        role: "assistant" as GatewayChatMessage["role"],
        content: "",
        timestamp: Date.now(),
        toolCalls: [{
          id: "tool-1",
          name: "search",
          arguments: "{}",
          function: { name: "search", arguments: "{}" },
        }],
      },
      msg("seg-2", "assistant", "After tool call"),
    ];

    expect(
      isFinalTextAlreadyRepresented(messages, "Before tool call\nAfter tool call")
    ).toBe(true);
  });

  it("does not duplicate a segmented reply when final text matches the combined stream", () => {
    const messages: GatewayChatMessage[] = [
      msg("user-1", "user", "hello"),
      msg("seg-1", "assistant", "Before tool call"),
      {
        id: "tool-1",
        role: "assistant" as GatewayChatMessage["role"],
        content: "",
        timestamp: Date.now(),
        toolCalls: [{
          id: "tool-1",
          name: "search",
          arguments: "{}",
          function: { name: "search", arguments: "{}" },
        }],
      },
      msg("seg-2", "assistant", "After tool call"),
    ];

    const result = applyFinalAssistantText(
      messages,
      "Before tool call\nAfter tool call",
      "run-1"
    );

    expect(result).toBe(messages);
    expect(result.filter((m) => m.role === "assistant" && m.content.trim())).toHaveLength(2);
  });

  it("still upgrades a single streamed assistant message to the final text", () => {
    const messages: GatewayChatMessage[] = [
      msg("user-1", "user", "hello"),
      msg("run-1", "assistant", "Hello"),
    ];

    const result = applyFinalAssistantText(messages, "Hello world", "run-1");

    expect(result).not.toBe(messages);
    expect(result[1].content).toBe("Hello world");
  });

  it("prunes duplicate tail fragments once the full final text is present", () => {
    const messages: GatewayChatMessage[] = [
      msg("user-1", "user", "hello"),
      msg("full-1", "assistant", "I genuinely don't know.\n\nWhat clips were these?"),
      msg("tail-1", "assistant", "What clips were these?"),
    ];

    const result = applyFinalAssistantText(
      messages,
      "I genuinely don't know.\n\nWhat clips were these?",
      "run-1"
    );

    expect(result.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(result[1].content).toBe("I genuinely don't know.\n\nWhat clips were these?");
  });
});

describe("pruneContainedAssistantTextMessages", () => {
  const msg = (id: string, role: string, content: string): GatewayChatMessage => ({
    id,
    role: role as GatewayChatMessage["role"],
    content,
    timestamp: Date.now(),
  });

  it("keeps tool-separated segmented text intact", () => {
    const messages = [
      msg("user-1", "user", "hello"),
      msg("seg-1", "assistant", "Before tool call"),
      {
        id: "tool-1",
        role: "assistant" as GatewayChatMessage["role"],
        content: "",
        timestamp: Date.now(),
        toolCalls: [{
          id: "tool-1",
          name: "search",
          arguments: "{}",
          function: { name: "search", arguments: "{}" },
        }],
      },
      msg("seg-2", "assistant", "After tool call"),
    ];

    const result = pruneContainedAssistantTextMessages(
      messages,
      "Before tool call\nAfter tool call",
      "seg-1"
    );

    expect(result).toBe(messages);
  });
});

// ---------------------------------------------------------------------------
// Announcement detection logic (integration-style)
// ---------------------------------------------------------------------------
describe("announcement detection logic", () => {
  // Simulate the announcement check from handleChatEvent
  function simulateAnnouncementCheck(
    payloadRunId: string | undefined,
    currentRunId: string | null,
    payloadState: string,
    payloadMessage: unknown
  ): { isAnnouncement: boolean; message: GatewayChatMessage | null } {
    // Mirrors the logic at line 741
    if (
      payloadRunId &&
      currentRunId &&
      payloadRunId !== currentRunId &&
      payloadState === "final"
    ) {
      const normalized = normalizeMessage(payloadMessage);
      if (normalized && normalized.content.trim() && !isSilentReply(normalized.content)) {
        return { isAnnouncement: true, message: normalized };
      }
      return { isAnnouncement: true, message: null };
    }
    return { isAnnouncement: false, message: null };
  }

  it("detects announcement: different runId + final state", () => {
    const result = simulateAnnouncementCheck(
      "sub-agent-run-1",
      "main-run-1",
      "final",
      { role: "assistant", content: [{ type: "text", text: "Task done!" }] }
    );
    expect(result.isAnnouncement).toBe(true);
    expect(result.message).not.toBeNull();
    expect(result.message!.content).toBe("Task done!");
  });

  it("ignores same runId finals (not an announcement)", () => {
    const result = simulateAnnouncementCheck(
      "main-run-1",
      "main-run-1",
      "final",
      { role: "assistant", content: "done" }
    );
    expect(result.isAnnouncement).toBe(false);
  });

  it("ignores deltas from different runId (not final)", () => {
    const result = simulateAnnouncementCheck(
      "sub-agent-run-1",
      "main-run-1",
      "delta",
      { role: "assistant", content: "streaming..." }
    );
    expect(result.isAnnouncement).toBe(false);
  });

  it("filters out NO_REPLY announcements", () => {
    const result = simulateAnnouncementCheck(
      "sub-agent-run-1",
      "main-run-1",
      "final",
      { role: "assistant", content: "NO_REPLY" }
    );
    expect(result.isAnnouncement).toBe(true);
    expect(result.message).toBeNull(); // filtered
  });

  it("filters out empty content announcements", () => {
    const result = simulateAnnouncementCheck(
      "sub-agent-run-1",
      "main-run-1",
      "final",
      { role: "assistant", content: "   " }
    );
    expect(result.isAnnouncement).toBe(true);
    expect(result.message).toBeNull(); // filtered
  });

  it("handles announcement with undefined message", () => {
    const result = simulateAnnouncementCheck(
      "sub-agent-run-1",
      "main-run-1",
      "final",
      undefined
    );
    expect(result.isAnnouncement).toBe(true);
    expect(result.message).toBeNull();
  });

  it("handles announcement when currentRunId is null (idle)", () => {
    const result = simulateAnnouncementCheck(
      "sub-agent-run-1",
      null,
      "final",
      { role: "assistant", content: "done" }
    );
    // Not treated as announcement when idle — different handler path
    expect(result.isAnnouncement).toBe(false);
  });

  // Idle state filter logic
  function simulateIdleFilter(payloadState: string, payloadRunId: string | undefined): boolean {
    // Mirrors line 717
    if (!payloadRunId) return false;
    if (payloadState !== "delta" && payloadState !== "final") return false;
    return true;
  }

  it("idle state: accepts delta events", () => {
    expect(simulateIdleFilter("delta", "run-1")).toBe(true);
  });

  it("idle state: accepts final events (announcements)", () => {
    expect(simulateIdleFilter("final", "run-1")).toBe(true);
  });

  it("idle state: rejects aborted events", () => {
    expect(simulateIdleFilter("aborted", "run-1")).toBe(false);
  });

  it("idle state: rejects error events", () => {
    expect(simulateIdleFilter("error", "run-1")).toBe(false);
  });

  it("idle state: rejects events without runId", () => {
    expect(simulateIdleFilter("final", undefined)).toBe(false);
  });
});
