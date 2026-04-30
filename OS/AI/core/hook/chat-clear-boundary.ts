import type { GatewayChatMessage } from "./use-gateway-chat";

const CHAT_CLEAR_MARKER_PREFIX = "hyperclaw:chat-clear-marker:v1:";

export function resolveClearedChatSessionKey(
  currentSessionKey: string | undefined,
  agentId: string
): string {
  return currentSessionKey || `agent:${agentId}:main`;
}

function getMarkerStorageKey(sessionKey: string): string {
  return `${CHAT_CLEAR_MARKER_PREFIX}${sessionKey}`;
}

export function readChatClearMarker(sessionKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getMarkerStorageKey(sessionKey));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeChatClearMarker(
  sessionKey: string,
  clearedAt: number = Date.now()
): number {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(getMarkerStorageKey(sessionKey), String(clearedAt));
    } catch {
      // Treat storage failures as non-fatal; the visible chat can still clear.
    }
  }
  return clearedAt;
}

export function filterMessagesAfterClear<T extends Pick<GatewayChatMessage, "timestamp">>(
  messages: T[],
  clearedAt: number | null
): T[] {
  if (!clearedAt) return messages;
  return messages.filter((message) => message.timestamp > clearedAt);
}
