import { GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";

/**
 * Generate a markdown string from a list of chat messages and trigger
 * a file download in the browser.
 */
export function exportChatAsMarkdown(
  messages: GatewayChatMessage[],
  agentName?: string
): void {
  const name = agentName || "Assistant";
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const dateTimeStr = now.toLocaleString();

  const lines: string[] = [];

  // Header
  lines.push(`# Chat with ${name}`);
  lines.push("");
  lines.push(`*Exported on ${dateTimeStr}*`);
  lines.push("");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Skip system/tool role messages (they are merged into assistant messages)
    if (
      msg.role === "system" ||
      msg.role === "tool" ||
      (msg.role as string) === "toolResult"
    ) {
      continue;
    }

    // Separator between messages
    if (lines[lines.length - 1] !== "") {
      lines.push("---");
      lines.push("");
    }

    // Role header
    const roleLabel = msg.role === "user" ? "User" : "Assistant";
    lines.push(`### ${roleLabel}`);
    lines.push("");

    // Message content
    if (msg.content?.trim()) {
      lines.push(msg.content.trim());
      lines.push("");
    }

    // Tool calls
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        const toolName =
          tc.name || tc.function?.name || "unknown_tool";
        const toolArgs =
          tc.arguments || tc.function?.arguments || "";

        lines.push(`**Tool call: \`${toolName}\`**`);
        lines.push("");
        lines.push("```json");
        // Try to pretty-print the arguments
        try {
          const parsed = JSON.parse(toolArgs);
          lines.push(JSON.stringify(parsed, null, 2));
        } catch {
          lines.push(toolArgs);
        }
        lines.push("```");
        lines.push("");

        // Tool result (merged by mergeToolCallsWithResults)
        const result = (tc as any).result;
        const isError = (tc as any).isError;
        if (result) {
          if (isError) {
            lines.push(`> **Error:**`);
          } else {
            lines.push(`> **Result:**`);
          }
          // Render each line as a blockquote
          const resultLines = String(result).split("\n");
          for (const rl of resultLines) {
            lines.push(`> ${rl}`);
          }
          lines.push("");
        }
      }
    }
  }

  const markdown = lines.join("\n");

  // Trigger download via Blob + URL.createObjectURL
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-${name.replace(/\s+/g, "-").toLowerCase()}-${dateStr}.md`;
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
