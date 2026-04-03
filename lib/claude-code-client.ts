/**
 * Claude Code CLI client for HyperClaw.
 *
 * Spawns `claude` as a subprocess with `--output-format stream-json`
 * and translates the streaming JSON output into GatewayChatMessage format.
 *
 * This module is consumed by Electron main process (Node.js) and should
 * NOT import any browser/React code.
 */

import type { GatewayChatMessage, ChatMessageRole } from "$/OS/AI/core/hook/use-gateway-chat";

// ── Types ────────────────────────────────────────────────────────────────────

/** A single line from `claude --output-format stream-json` */
export interface ClaudeStreamEvent {
  type: string;
  // "assistant" events
  message?: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  session_id?: string;
  // "result" events
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  // "tool_use" / "tool_result" events
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  is_error?: boolean;
  // "content_block_delta" events
  index?: number;
  delta?: { type: string; text?: string; partial_json?: string };
  // "error" events
  error?: { type: string; message: string };
  // "system" init events
  subtype?: string;
}

export interface ClaudeCodeSession {
  sessionId: string;
  sessionKey: string; // HyperClaw session key mapping
  createdAt: number;
}

export interface ClaudeCodeStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export interface ClaudeCodeSendParams {
  message: string;
  sessionId?: string;        // Resume existing Claude Code session
  sessionKey: string;         // HyperClaw session key
  workingDirectory?: string;
  model?: string;
  allowedTools?: string[];
}

// ── Stream JSON → GatewayChatMessage translation ─────────────────────────────

let _messageIdCounter = 0;
function nextMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_messageIdCounter}`;
}

/**
 * Parse a single stream-json line from Claude Code into a partial
 * GatewayChatMessage update. Returns null for non-renderable events.
 */
export function parseClaudeStreamEvent(
  event: ClaudeStreamEvent,
  existingContent: string = ""
): {
  type: "delta" | "final" | "tool_call" | "tool_result" | "error" | "init" | "skip";
  message?: Partial<GatewayChatMessage>;
  sessionId?: string;
  cost?: number;
} {
  // System/init events
  if (event.type === "system" || event.subtype === "init") {
    return {
      type: "init",
      sessionId: event.session_id,
    };
  }

  // Error events
  if (event.type === "error") {
    return {
      type: "error",
      message: {
        role: "assistant" as ChatMessageRole,
        content: `Error: ${event.error?.message || "Unknown error"}`,
      },
    };
  }

  // Assistant message events (contains full accumulated content)
  if (event.type === "assistant" && event.message) {
    const blocks = event.message.content || [];
    let textContent = "";
    let thinking: string | undefined;
    const toolCalls: GatewayChatMessage["toolCalls"] = [];

    for (const block of blocks) {
      if (block.type === "text" && block.text) {
        textContent += block.text;
      } else if (block.type === "thinking" && block.text) {
        thinking = block.text;
      } else if (block.type === "tool_use" && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        });
      }
    }

    if (toolCalls.length > 0) {
      return {
        type: "tool_call",
        message: {
          role: "assistant" as ChatMessageRole,
          content: textContent,
          toolCalls,
          ...(thinking && { thinking }),
        },
        sessionId: event.session_id,
      };
    }

    return {
      type: "delta",
      message: {
        role: "assistant" as ChatMessageRole,
        content: textContent,
        ...(thinking && { thinking }),
      },
      sessionId: event.session_id,
    };
  }

  // Content block delta events (streaming text chunks)
  if (event.type === "content_block_delta" && event.delta) {
    if (event.delta.type === "text_delta" && event.delta.text) {
      return {
        type: "delta",
        message: {
          role: "assistant" as ChatMessageRole,
          content: existingContent + event.delta.text,
        },
      };
    }
    return { type: "skip" };
  }

  // Tool result events
  if (event.type === "tool_result") {
    return {
      type: "tool_result",
      message: {
        role: "toolResult" as ChatMessageRole,
        content: event.tool_result || "",
        toolResults: [{
          toolCallId: event.tool_use_id || "",
          toolName: event.tool_name || "unknown",
          content: event.tool_result || "",
          isError: event.is_error || false,
        }],
      },
    };
  }

  // Result event (final summary)
  if (event.type === "result") {
    return {
      type: "final",
      message: {
        role: "assistant" as ChatMessageRole,
        content: event.result || "",
      },
      sessionId: event.session_id,
      cost: event.cost_usd,
    };
  }

  return { type: "skip" };
}

/**
 * Build the CLI arguments for spawning `claude`.
 */
export function buildClaudeArgs(params: ClaudeCodeSendParams): string[] {
  const args: string[] = [];

  // Use print mode with prompt for non-interactive usage
  args.push("-p", params.message);

  // Streaming JSON output
  args.push("--output-format", "stream-json");

  // Session management
  if (params.sessionId) {
    args.push("--resume", params.sessionId);
  }

  // Model selection
  if (params.model) {
    args.push("--model", params.model);
  }

  // Allowed tools
  if (params.allowedTools && params.allowedTools.length > 0) {
    args.push("--allowedTools", params.allowedTools.join(","));
  }

  return args;
}

/**
 * Accumulator that processes streaming events and maintains message state.
 * Used by both Electron IPC handler and the browser-side hook.
 */
export class ClaudeCodeStreamAccumulator {
  private content = "";
  private sessionId: string | null = null;
  private messages: GatewayChatMessage[] = [];
  private currentTextMsgId: string | null = null;

  reset() {
    this.content = "";
    this.sessionId = null;
    this.messages = [];
    this.currentTextMsgId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getMessages(): GatewayChatMessage[] {
    return [...this.messages];
  }

  /**
   * Process a single stream event line. Returns the updated message list
   * or null if no visible change occurred.
   */
  processEvent(event: ClaudeStreamEvent): GatewayChatMessage[] | null {
    const parsed = parseClaudeStreamEvent(event, this.content);

    if (parsed.sessionId) {
      this.sessionId = parsed.sessionId;
    }

    switch (parsed.type) {
      case "init":
      case "skip":
        return null;

      case "delta": {
        const newContent = parsed.message?.content || "";
        this.content = newContent;

        if (!this.currentTextMsgId) {
          this.currentTextMsgId = nextMessageId("cc-text");
        }

        const existingIdx = this.messages.findIndex(m => m.id === this.currentTextMsgId);
        const textMsg: GatewayChatMessage = {
          id: this.currentTextMsgId,
          role: "assistant",
          content: newContent,
          timestamp: Date.now(),
          ...(parsed.message?.thinking && { thinking: parsed.message.thinking }),
        };

        if (existingIdx !== -1) {
          this.messages[existingIdx] = textMsg;
        } else {
          this.messages.push(textMsg);
        }
        return this.getMessages();
      }

      case "tool_call": {
        // Close current text message and start fresh after the tool
        this.currentTextMsgId = null;
        this.content = "";

        const toolCalls = parsed.message?.toolCalls;
        if (toolCalls && toolCalls.length > 0) {
          const toolMsg: GatewayChatMessage = {
            id: toolCalls[0].id || nextMessageId("cc-tool"),
            role: "assistant",
            content: parsed.message?.content || "",
            timestamp: Date.now(),
            toolCalls,
          };
          this.messages.push(toolMsg);
        }
        return this.getMessages();
      }

      case "tool_result": {
        const toolResults = parsed.message?.toolResults;
        if (toolResults && toolResults.length > 0) {
          const resultMsg: GatewayChatMessage = {
            id: `result-${toolResults[0].toolCallId || nextMessageId("cc-res")}`,
            role: "toolResult",
            content: parsed.message?.content || "",
            timestamp: Date.now(),
            toolResults,
          };
          this.messages.push(resultMsg);
        }
        return this.getMessages();
      }

      case "final": {
        // Final result — update the last text message or create one
        const finalContent = parsed.message?.content || this.content;
        if (finalContent.trim()) {
          if (this.currentTextMsgId) {
            const idx = this.messages.findIndex(m => m.id === this.currentTextMsgId);
            if (idx !== -1) {
              this.messages[idx] = {
                ...this.messages[idx],
                content: finalContent,
              };
            }
          } else {
            this.messages.push({
              id: nextMessageId("cc-final"),
              role: "assistant",
              content: finalContent,
              timestamp: Date.now(),
            });
          }
        }
        return this.getMessages();
      }

      case "error": {
        this.messages.push({
          id: nextMessageId("cc-err"),
          role: "assistant",
          content: parsed.message?.content || "Unknown error",
          timestamp: Date.now(),
        });
        return this.getMessages();
      }

      default:
        return null;
    }
  }
}
