const MAX_AGENT_ROW_PREVIEW_LENGTH = 120;
const ENSEMBLE_DM_SESSION_PREFIX = "ensemble:dm:";
const AGENT_MAIN_SESSION_PREFIX = "agent:";
const AGENT_MAIN_SESSION_SUFFIX = ":main";

function cleanPreviewText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > MAX_AGENT_ROW_PREVIEW_LENGTH
    ? `${cleaned.slice(0, MAX_AGENT_ROW_PREVIEW_LENGTH - 1)}…`
    : cleaned;
}

export function formatAgentRowDetail(
  runtimeLabel: string,
  latestMessage?: string
): string {
  return cleanPreviewText(latestMessage) ?? runtimeLabel;
}

export function extractChatEventPreview(message: unknown): string | undefined {
  const direct = cleanPreviewText(message);
  if (direct) return direct;
  if (!message || typeof message !== "object") return undefined;

  const msg = message as Record<string, unknown>;
  if (typeof msg.role === "string" && msg.role !== "assistant") {
    return undefined;
  }

  const content = msg.content;
  const contentText = cleanPreviewText(content);
  if (contentText) return contentText;

  if (Array.isArray(content)) {
    const text = content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const value = (block as Record<string, unknown>).text;
        return typeof value === "string" ? value : "";
      })
      .join(" ");
    return cleanPreviewText(text);
  }

  return cleanPreviewText(msg.text);
}

export function getAgentIdFromMainChatSessionKey(
  sessionKey: string | undefined
): string | undefined {
  if (!sessionKey) return undefined;
  if (sessionKey.startsWith(ENSEMBLE_DM_SESSION_PREFIX)) {
    const agentId = sessionKey.slice(ENSEMBLE_DM_SESSION_PREFIX.length);
    return agentId || undefined;
  }
  if (
    sessionKey.startsWith(AGENT_MAIN_SESSION_PREFIX) &&
    sessionKey.endsWith(AGENT_MAIN_SESSION_SUFFIX)
  ) {
    const agentId = sessionKey.slice(
      AGENT_MAIN_SESSION_PREFIX.length,
      -AGENT_MAIN_SESSION_SUFFIX.length
    );
    return agentId || undefined;
  }
  return undefined;
}
