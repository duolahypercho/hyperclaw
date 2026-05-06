import { GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";

// ── Detect error from result content JSON ─────────────────────────────
export function isResultContentError(content: string | undefined): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return parsed?.status === "error" || parsed?.status === "failed";
  } catch {
    return false;
  }
}

// ── Merge tool calls with their results ───────────────────────────────
// Factory function: each caller gets its own closure-scoped cache.
// Prevents cross-widget cache thrashing when multiple chat instances
// are mounted simultaneously (e.g. GatewayChatWidget + FloatingChatViewer).

/** Create a per-instance merge function with its own cache. */
export function createMergeToolCalls() {
  let prevInputRef: GatewayChatMessage[] | null = null;
  let prevOutputRef: GatewayChatMessage[] | null = null;
  const mergedCache = new Map<string, GatewayChatMessage>();

  const getToolResultCallId = (msg: GatewayChatMessage): string | undefined =>
    (msg as any).toolCallId ||
    (msg as any).toolResults?.[0]?.toolCallId;

  const messageHasToolCallId = (msg: GatewayChatMessage, toolCallId: string): boolean => {
    if (msg.role !== "assistant") return false;
    if (msg.toolCalls?.some((tc) => tc.id === toolCallId)) {
      return true;
    }
    return !!msg.contentBlocks?.some((block: any) => block.type === "toolCall" && block.id === toolCallId);
  };

  return function mergeToolCallsWithResults(
    messages: GatewayChatMessage[]
  ): GatewayChatMessage[] {
    // Fast path: exact same input array → exact same output
    if (messages === prevInputRef && prevOutputRef) {
      return prevOutputRef;
    }

    const merged: GatewayChatMessage[] = [];
    const nextCache = new Map<string, GatewayChatMessage>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Skip tool result messages only once their matching tool call exists.
      // OpenClaw can stream result/end events before the call/start event reaches
      // React; keeping orphan results visible prevents a blank gap in live UI.
      if ((msg.role as string) === "toolResult" || msg.role === "tool") {
        const toolCallId = getToolResultCallId(msg);
        if (toolCallId && messages.some((m) => messageHasToolCallId(m, toolCallId))) {
          continue;
        }
      }

      // Check if this is an assistant message with tool calls
      const hasToolCalls =
        (msg.toolCalls?.length || 0) > 0 ||
        (msg.contentBlocks?.some((b: any) => b.type === "toolCall") || false);

      if (msg.role === "assistant" && hasToolCalls) {
        // Find tool results for this message's tool calls
        const toolCalls = msg.toolCalls || [];
        const contentBlocks =
          msg.contentBlocks?.filter((b: any) => b.type === "toolCall") || [];

        // Merge tool results from subsequent messages
        const mergedToolCalls = toolCalls.map((tc) => {
          const toolId = tc.id || "";

          const toolResultMsg = messages.find((m) => {
            const role = m.role as string;
            if (role !== "tool" && role !== "toolResult") return false;
            const msgToolCallId = getToolResultCallId(m);
            return msgToolCallId === toolId;
          });

          const resultContent = toolResultMsg
            ? (toolResultMsg as any).toolResults?.[0]?.content ||
              (toolResultMsg as any).content
            : undefined;
          const resultIsError = toolResultMsg
            ? (toolResultMsg as any).toolResults?.[0]?.isError ||
              (toolResultMsg as any).isError ||
              isResultContentError(resultContent) ||
              false
            : false;

          return {
            ...tc,
            result: resultContent,
            isError: resultIsError,
          };
        });

        // Merge content blocks with results
        const mergedContentBlocks = contentBlocks.map((block: any) => {
          const toolId = block.id || "";
          const toolResultMsg = messages.find((m) => {
            const role = m.role as string;
            if (role !== "tool" && role !== "toolResult") return false;
            const msgToolCallId = getToolResultCallId(m);
            return msgToolCallId === toolId;
          });

          const blockResultContent = toolResultMsg
            ? (toolResultMsg as any).toolResults?.[0]?.content ||
              (toolResultMsg as any).content
            : undefined;

          return {
            ...block,
            result: blockResultContent,
            isError: toolResultMsg
              ? (toolResultMsg as any).toolResults?.[0]?.isError ||
                (toolResultMsg as any).isError ||
                isResultContentError(blockResultContent) ||
                false
              : false,
          };
        });

        const newMsg = {
          ...msg,
          toolCalls: mergedToolCalls as any,
          contentBlocks: [
            ...(msg.contentBlocks?.filter((b: any) => b.type !== "toolCall") ||
              []),
            ...mergedContentBlocks,
          ],
        } as GatewayChatMessage;

        // Reuse cached object if content is identical (prevents child re-renders)
        const cacheKey = msg.id || `idx-${i}`;
        const cached = mergedCache.get(cacheKey);
        if (
          cached &&
          cached.content === newMsg.content &&
          JSON.stringify(cached.toolCalls) === JSON.stringify(newMsg.toolCalls)
        ) {
          merged.push(cached);
          nextCache.set(cacheKey, cached);
        } else {
          merged.push(newMsg);
          nextCache.set(cacheKey, newMsg);
        }
      } else {
        merged.push(msg);
        // Cache non-tool messages too so reference stays stable
        const cacheKey = msg.id || `idx-${i}`;
        nextCache.set(cacheKey, msg);
      }
    }

    // Update caches
    mergedCache.clear();
    nextCache.forEach((v, k) => mergedCache.set(k, v));
    prevInputRef = messages;
    prevOutputRef = merged;

    return merged;
  };
}

// Default instance for backwards compatibility (single-widget usage).
// New code should use createMergeToolCalls() for per-instance isolation.
export const mergeToolCallsWithResults = createMergeToolCalls();
