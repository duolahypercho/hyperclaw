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
// Cache previous merge results so unchanged messages keep the same reference,
// preventing unnecessary re-renders in memoized child components.
let prevInputRef: GatewayChatMessage[] | null = null;
let prevOutputRef: GatewayChatMessage[] | null = null;
const mergedCache = new Map<string, GatewayChatMessage>();

export function mergeToolCallsWithResults(
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

    // Skip tool result messages - they'll be merged
    if ((msg.role as string) === "toolResult" || msg.role === "tool") {
      continue;
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
        const toolId = tc.id || tc.function?.name || "";

        const toolResultMsg = messages.find((m) => {
          const role = m.role as string;
          if (role !== "tool" && role !== "toolResult") return false;
          const msgToolCallId =
            (m as any).toolCallId ||
            (m as any).toolResults?.[0]?.toolCallId;
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
        const toolId = block.id;
        const toolResultMsg = messages.find((m) => {
          const role = m.role as string;
          if (role !== "tool" && role !== "toolResult") return false;
          const msgToolCallId =
            (m as any).toolCallId ||
            (m as any).toolResults?.[0]?.toolCallId;
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
}
