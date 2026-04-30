import type { GatewayChatMessage } from "./use-gateway-chat";

type RuntimeMessage = Pick<GatewayChatMessage, "id" | "role" | "content">;

function normalizeMessageContent(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function findLastUserMessageIndex(
  messages: RuntimeMessage[],
  currentUserContent: string
): number {
  const normalizedUserContent = normalizeMessageContent(currentUserContent);
  if (!normalizedUserContent) return -1;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.role === "user" &&
      normalizeMessageContent(message.content) === normalizedUserContent
    ) {
      return i;
    }
  }

  return -1;
}

function findCurrentTurnStart(messages: RuntimeMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i + 1;
  }
  return messages.length;
}

export function selectRuntimeResponseMessages<T extends RuntimeMessage>(
  messages: T[],
  currentUserContent: string
): T[] {
  const currentUserIndex = findLastUserMessageIndex(messages, currentUserContent);
  if (currentUserIndex >= 0) {
    return messages.slice(currentUserIndex + 1);
  }

  // Some connectors return only assistant/tool messages. If the user echo is
  // missing, never append user messages from the result on top of the local echo.
  return messages.filter((message) => message.role !== "user");
}

export function mergeRuntimeResponseMessages(
  previous: GatewayChatMessage[],
  incoming: GatewayChatMessage[],
  currentUserContent: string,
  transientIds: string[] = []
): GatewayChatMessage[] {
  const transientIdSet = new Set(transientIds);
  const base = previous.filter((message) => !transientIdSet.has(message.id));
  const hasCurrentUserEcho =
    findLastUserMessageIndex(incoming, currentUserContent) >= 0;
  const responseMessages = selectRuntimeResponseMessages(
    incoming,
    currentUserContent
  );
  const currentTurnStart = findCurrentTurnStart(base);
  const looksLikeHistoryPayload =
    !hasCurrentUserEcho && responseMessages.length > 1;
  const duplicateSearchStart = looksLikeHistoryPayload ? 0 : currentTurnStart;
  let next = base;

  for (const message of responseMessages) {
    const sameIdIndex = next.findIndex((existing) => existing.id === message.id);
    if (sameIdIndex >= 0) {
      if (next[sameIdIndex] === message) continue;
      next = [
        ...next.slice(0, sameIdIndex),
        { ...next[sameIdIndex], ...message },
        ...next.slice(sameIdIndex + 1),
      ];
      continue;
    }

    const normalizedContent = normalizeMessageContent(message.content);
    const duplicateInSearchWindow = next
      .slice(duplicateSearchStart)
      .some(
        (existing) =>
          existing.role === message.role &&
          normalizeMessageContent(existing.content) === normalizedContent &&
          normalizedContent.length > 0
      );

    if (duplicateInSearchWindow) continue;
    next = [...next, message];
  }

  return next;
}
