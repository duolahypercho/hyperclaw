import { GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";

export function mergeToolCallsWithResults(
  messages: GatewayChatMessage[]
): GatewayChatMessage[] {
  const merged: GatewayChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Skip tool result messages - they'll be merged
    if ((msg.role as string) === "toolResult" || msg.role === "tool") {
      continue;
    }

    // Check if this is an assistant message with tool calls
    const hasToolCalls = (msg.toolCalls?.length || 0) > 0 || (msg.contentBlocks?.some((b: any) => b.type === "toolCall") || false);

    if (msg.role === "assistant" && hasToolCalls) {
      // Find tool results for this message's tool calls
      const toolCalls = msg.toolCalls || [];
      const contentBlocks = msg.contentBlocks?.filter((b: any) => b.type === "toolCall") || [];

      // Merge tool results from subsequent messages
      const mergedToolCalls = toolCalls.map((tc) => {
        const toolId = tc.id || tc.function?.name || "";

        // Find matching tool result message - check both "tool" and "toolResult" roles
        // Also check both top-level toolCallId and toolResults[0].toolCallId
        const toolResultMsg = messages.find((m) => {
          const role = m.role as string;
          if (role !== "tool" && role !== "toolResult") return false;
          const msgToolCallId = (m as any).toolCallId || (m as any).toolResults?.[0]?.toolCallId;
          return msgToolCallId === toolId;
        });

        // Extract content from both "tool" and "toolResult" roles
        // For toolResult: content is in toolResults[0].content
        // For tool: content is in top-level content
        const resultContent = toolResultMsg
          ? ((toolResultMsg as any).toolResults?.[0]?.content || (toolResultMsg as any).content)
          : undefined;
        const resultIsError = toolResultMsg
          ? ((toolResultMsg as any).toolResults?.[0]?.isError || (toolResultMsg as any).isError || false)
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
          const msgToolCallId = (m as any).toolCallId || (m as any).toolResults?.[0]?.toolCallId;
          return msgToolCallId === toolId;
        });

        return {
          ...block,
          result: toolResultMsg
            ? ((toolResultMsg as any).toolResults?.[0]?.content || (toolResultMsg as any).content)
            : undefined,
          isError: toolResultMsg
            ? ((toolResultMsg as any).toolResults?.[0]?.isError || (toolResultMsg as any).isError || false)
            : false,
        };
      });

      merged.push({
        ...msg,
        toolCalls: mergedToolCalls as any,
        contentBlocks: [
          ...(msg.contentBlocks?.filter((b: any) => b.type !== "toolCall") || []),
          ...mergedContentBlocks,
        ],
      } as GatewayChatMessage);
    } else {
      merged.push(msg);
    }
  }

  return merged;
}
