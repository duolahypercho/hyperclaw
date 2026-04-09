"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  connectGatewayWs,
  getGatewayConfig,
  getGatewayConnectionState,
  subscribeGatewayConnection,
  gatewayConnection,
  probeGatewayHealth,
} from "$/lib/openclaw-gateway-ws";
import { v4 as uuidv4 } from "uuid";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

// Module-level registry: maps active runId → sessionKey.
// Prevents cross-chat event bleed when multiple useGatewayChat instances
// are streaming simultaneously and events arrive without sessionKey.
const RUN_ID_OWNERS_CAP = 100;
const runIdOwners = new Map<string, string>();

/** Register a runId → sessionKey mapping with LRU eviction. */
function registerRunId(runId: string, sessionKey: string) {
  runIdOwners.set(runId, sessionKey);
  if (runIdOwners.size > RUN_ID_OWNERS_CAP) {
    const iter = runIdOwners.keys();
    const toDelete = Math.floor(RUN_ID_OWNERS_CAP * 0.2);
    for (let i = 0; i < toDelete; i++) {
      const key = iter.next().value;
      if (key !== undefined) runIdOwners.delete(key);
    }
  }
}

/** Remove ALL runIdOwners entries belonging to a session (primary + sub-agent runIds). */
const clearRunIdOwnership = (sessionKey: string) => {
  runIdOwners.forEach((owner, runId) => {
    if (owner === sessionKey) runIdOwners.delete(runId);
  });
};

// Types for chat (matching OpenClaw's protocol)
export type ChatMessageRole = "user" | "assistant" | "system" | "tool" | "toolResult";

export interface ChatMessage {
  role: ChatMessageRole;
  content: unknown;
  timestamp?: number;
  id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export type ChatEventState = "delta" | "final" | "aborted" | "error";

export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: ChatEventState;
  message?: unknown;
  errorMessage?: string;
}

export interface GatewayChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: number;
  thinking?: string;
  // Support both flat format and OpenAI-style function format
  toolCalls?: Array<{
    id: string;
    name?: string;
    arguments?: string;
    function?: {
      name: string;
      arguments: string;
    };
  }>;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    content: string;
    isError?: boolean;
  }>;
  // Store raw content blocks for rich rendering
  contentBlocks?: Array<{
    type: "text" | "thinking" | "toolCall" | "toolResult";
    text?: string;
    thinking?: string;
    content?: string;
    id?: string;
    name?: string;
    arguments?: string;
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
  }>;
  // Attachments sent with user messages (images, files)
  attachments?: GatewayChatAttachment[];
}

export interface GatewayChatAttachment {
  id: string;
  type: string;
  mimeType: string;
  name: string;
  dataUrl: string;
}

export interface UseGatewayChatOptions {
  sessionKey?: string;
  autoConnect?: boolean;
  backend?: "openclaw" | "hermes";
}

export interface UseGatewayChatReturn {
  // State
  messages: GatewayChatMessage[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  sessionKey: string;
  hasMoreHistory: boolean;
  isLoadingMore: boolean;

  // Actions
  sendMessage: (content: string, attachments?: GatewayChatAttachment[]) => Promise<void>;
  stopGeneration: () => Promise<void>;
  loadChatHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  clearChat: () => void;
  setSessionKey: (key: string) => void;

  // Model selection
  model?: string;
  setModel?: (model: string) => void;

  // Connection
  connect: () => Promise<void>;
  disconnect: () => void;
}

// Helper to extract text from message content (matching OpenClaw's extractText)
function extractText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const msg = message as Record<string, unknown>;

  // Handle array content
  if (Array.isArray(msg.content)) {
    const texts = msg.content
      .map((block) => {
        if (typeof block === "object" && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") {
            return b.text;
          }
        }
        return null;
      })
      .filter((t): t is string => t !== null);

    return texts.join("");
  }

  // Handle string content
  if (typeof msg.content === "string") {
    return msg.content;
  }

  return null;
}

// Strip model protocol markers that leak into content (e.g. <final>, <thinking>, NO_REPLY)
function stripProtocolMarkers(s: string): string {
  return s.replace(/<\/?\s*(?:final|thinking|NO_REPLY)\s*\/?>/gi, "").trim();
}

// Normalize content for fuzzy comparison — the server sometimes returns the
// same message with slightly different whitespace (e.g. single vs double newline).
function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// WeakMap-cached normalizeForCompare — avoids redundant regex on same message objects
// across dedup passes and history merges.
const normCache = new WeakMap<GatewayChatMessage, string>();
function cachedNormalize(msg: GatewayChatMessage): string {
  let cached = normCache.get(msg);
  if (cached === undefined) {
    cached = normalizeForCompare(msg.content);
    normCache.set(msg, cached);
  }
  return cached;
}

// Helper to deduplicate messages by ID (keeps last occurrence) AND by
// consecutive content (the server sometimes returns the same assistant message
// multiple times with different UUIDs).
function deduplicateMessages(messages: GatewayChatMessage[]): GatewayChatMessage[] {
  // Pass 1: ID-based dedup (keep last occurrence)
  const seen = new Set<string>();
  const idDeduped: GatewayChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!seen.has(messages[i].id)) {
      seen.add(messages[i].id);
      idDeduped.push(messages[i]);
    }
  }
  idDeduped.reverse();

  // Pass 2: Collapse consecutive messages with the same role + content.
  // O(n) — only compares each message to its immediate predecessor.
  const result: GatewayChatMessage[] = [];
  let prevRole = "";
  let prevNorm = "";
  for (const msg of idDeduped) {
    const norm = msg.content.trim() ? cachedNormalize(msg) : "";
    if (
      prevRole === msg.role &&
      prevNorm !== "" &&
      !msg.toolCalls?.length &&
      prevNorm === norm
    ) {
      continue; // skip consecutive duplicate
    }
    prevRole = msg.role;
    prevNorm = norm;
    result.push(msg);
  }
  return result;
}

// Helper to merge history into current messages.
// Uses the server's history order as canonical (correct conversation sequence).
// Preserves existing object references when content is unchanged to prevent
// React re-renders (avoids the "flash" on final reconciliation).
// Streaming-only messages (not yet in history) are appended at the end.
function mergeHistoryIntoMessages(
  current: GatewayChatMessage[],
  history: GatewayChatMessage[]
): GatewayChatMessage[] | null {
  const currentMap = new Map<string, GatewayChatMessage>();
  for (const msg of current) {
    currentMap.set(msg.id, msg);
  }

  // Track which current messages have been "claimed" by a history match.
  // A current message can only be claimed once (prevents double-matching
  // when the same content appears legitimately in multiple messages).
  const claimedCurrentIds = new Set<string>();
  let hasChanges = false;

  // Pre-build a content lookup map: "role:normalizedContent" → array of messages.
  // This turns the O(n²) inner loop into O(n) total lookups.
  const contentIndex = new Map<string, GatewayChatMessage[]>();
  for (const cm of current) {
    if (cm.content.trim()) {
      const key = `${cm.role}:${normalizeForCompare(cm.content)}`;
      const arr = contentIndex.get(key);
      if (arr) arr.push(cm);
      else contentIndex.set(key, [cm]);
    }
  }

  // Build merged list using history order (server's canonical ordering).
  // Use existing current references when possible to prevent re-renders.
  const merged: GatewayChatMessage[] = [];

  for (const histMsg of history) {
    // 1. Try exact ID match (tool calls have stable IDs via toolCallId)
    const currentVersion = currentMap.get(histMsg.id);
    if (currentVersion && !claimedCurrentIds.has(histMsg.id)) {
      claimedCurrentIds.add(histMsg.id);
      const contentChanged = currentVersion.content !== histMsg.content;
      // Compare tool results by count + first entry (avoids JSON.stringify on every message)
      const ctr = currentVersion.toolResults;
      const htr = histMsg.toolResults;
      const toolResultsChanged = ctr?.length !== htr?.length ||
        (ctr?.[0]?.content !== htr?.[0]?.content) ||
        (ctr?.[0]?.isError !== htr?.[0]?.isError);
      if (contentChanged || toolResultsChanged) {
        merged.push(histMsg);
        hasChanges = true;
      } else {
        merged.push(currentVersion); // preserve reference
      }
      continue;
    }

    // 2. Content-based dedup for ALL roles.
    // The server returns DIFFERENT UUIDs for text messages on every history
    // call, so ID matching never works for them. Content match is the only
    // reliable bridge between streaming and history.
    // Uses pre-built content index for O(1) lookup per history message.
    let contentMatch: GatewayChatMessage | undefined;
    if (histMsg.content.trim()) {
      const key = `${histMsg.role}:${normalizeForCompare(histMsg.content)}`;
      const candidates = contentIndex.get(key);
      if (candidates) {
        contentMatch = candidates.find(cm => !claimedCurrentIds.has(cm.id));
      }
    }

    if (contentMatch) {
      claimedCurrentIds.add(contentMatch.id);
      merged.push(contentMatch); // preserve reference
    } else {
      merged.push(histMsg);
      hasChanges = true;
    }
  }

  // Append ONLY current-only messages that come AFTER the last matched message.
  // History is a sliding window (e.g. last 200 messages). Older current messages
  // that fell off the window would otherwise accumulate as "unclaimed" on every
  // merge, causing the message list to grow unboundedly (200 → 202 → 204 → ...).
  // Messages after the last match are genuinely new (in-flight streaming events).
  let lastMatchedIdx = -1;
  for (let i = current.length - 1; i >= 0; i--) {
    if (claimedCurrentIds.has(current[i].id)) {
      lastMatchedIdx = i;
      break;
    }
  }
  for (let i = lastMatchedIdx + 1; i < current.length; i++) {
    if (!claimedCurrentIds.has(current[i].id)) {
      merged.push(current[i]);
    }
  }

  if (!hasChanges && merged.length === current.length) return null;

  return merged;
}

// Helper to normalize message to our format
function normalizeMessage(message: unknown): GatewayChatMessage | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const msg = message as Record<string, unknown>;
  const role = typeof msg.role === "string" ? msg.role : null;

  if (!role) {
    return null;
  }

  const id = typeof msg.id === "string" ? msg.id : uuidv4();
  const timestamp = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();

  // Handle content as array (new format from gateway)
  let content = "";
  let thinking: string | undefined;
  let toolCalls: GatewayChatMessage["toolCalls"] = undefined;
  let toolResults: GatewayChatMessage["toolResults"] = undefined;
  let contentBlocks: GatewayChatMessage["contentBlocks"] = [];

  // First, check for top-level thinking field (common in gateway messages)
  if (typeof msg.thinking === "string" && msg.thinking.trim()) {
    thinking = msg.thinking;
  }

  // Process contentBlocks array if present (contains thinking, toolCall, toolResult, text)
  if (Array.isArray(msg.contentBlocks)) {
    for (const block of msg.contentBlocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;

      // Extract text blocks
      if (b.type === "text" && typeof b.text === "string") {
        content += b.text;
        contentBlocks.push({ type: "text", text: b.text });
      }

      // Extract thinking blocks
      if (b.type === "thinking" && typeof b.thinking === "string") {
        thinking = b.thinking;
        contentBlocks.push({ type: "thinking", thinking: b.thinking });
      }

      // Extract toolCall blocks
      if (b.type === "toolCall" && typeof b.id === "string" && typeof b.name === "string") {
        const argsRaw = b.arguments;
        const args = typeof argsRaw === "object" ? JSON.stringify(argsRaw) : String(argsRaw || "{}");
        toolCalls = toolCalls || [];
        // Include both formats: flat for our use, and nested for useUnifiedToolState compatibility
        toolCalls.push({
          id: b.id,
          function: { name: b.name, arguments: args },
          name: b.name,
          arguments: args,
        } as any);
        contentBlocks.push({
          type: "toolCall",
          id: b.id,
          name: b.name,
          arguments: args,
        });
      }

      // Extract toolResult blocks from contentBlocks
      if (b.type === "toolResult" && typeof b.toolCallId === "string") {
        const toolContent = typeof b.content === "string" ? b.content : "";
        const toolResultEntry = {
          toolCallId: b.toolCallId,
          toolName: typeof b.name === "string" ? b.name : (typeof b.toolName === "string" ? b.toolName : "unknown"),
          content: toolContent,
          isError: Boolean(b.isError),
        };
        toolResults = toolResults || [];
        toolResults.push(toolResultEntry);
        contentBlocks.push({
          type: "toolResult",
          toolCallId: b.toolCallId,
          toolName: toolResultEntry.toolName,
          content: toolContent,
          isError: toolResultEntry.isError,
        });
      }
    }
  }

  // Also process legacy msg.content array if present — but only if
  // contentBlocks didn't already provide text (otherwise the same text
  // gets concatenated twice, causing duplicated responses like
  // "Hey! ...Hey! ...").
  if (Array.isArray(msg.content) && !content) {
    for (const block of msg.content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;

      // Extract text blocks
      if (b.type === "text" && typeof b.text === "string") {
        content += b.text;
        contentBlocks.push({ type: "text", text: b.text });
      }

      // Extract thinking blocks
      if (b.type === "thinking" && typeof b.thinking === "string") {
        thinking = b.thinking;
        contentBlocks.push({ type: "thinking", thinking: b.thinking });
      }

      // Extract toolCall blocks
      if (b.type === "toolCall" && typeof b.id === "string" && typeof b.name === "string") {
        const args = typeof b.arguments === "object" ? JSON.stringify(b.arguments) : String(b.arguments || "{}");
        toolCalls = toolCalls || [];
        toolCalls.push({
          id: b.id,
          function: { name: b.name, arguments: args },
          name: b.name,
          arguments: args,
        } as any);
        contentBlocks.push({
          type: "toolCall",
          id: b.id,
          name: b.name,
          arguments: args,
        });
      }
    }
  } else if (typeof msg.content === "string") {
    // Handle legacy string content — only if contentBlocks didn't already
    // provide text (otherwise the same text gets pushed twice, doubling
    // the rendered output when EnhancedMessageBubble iterates contentBlocks).
    if (!content) {
      content = msg.content;
      contentBlocks.push({ type: "text", text: msg.content });
    }
  }

  // Handle top-level toolCalls / tool_calls on assistant messages.
  // History messages and some gateway formats put tool calls here rather than
  // inside contentBlocks. Without this, history tool-call messages lose their
  // toolCalls and become invisible empty assistant messages.
  if (role === "assistant" && !toolCalls) {
    const rawToolCalls = msg.tool_calls || msg.toolCalls;
    if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
      const stringifyArgs = (v: unknown): string =>
        typeof v === "string" ? v : JSON.stringify(v || {});
      toolCalls = (rawToolCalls as any[]).map((tc: any) => ({
        id: tc.id || uuidv4(),
        function: tc.function || { name: tc.name || "", arguments: stringifyArgs(tc.arguments) },
        name: tc.function?.name || tc.name || "",
        arguments: tc.function?.arguments || stringifyArgs(tc.arguments),
      }));
      // Also add to contentBlocks for consistent rendering
      for (const tc of toolCalls) {
        contentBlocks.push({
          type: "toolCall",
          id: tc.id,
          name: (tc as any).name || tc.function?.name,
          arguments: tc.function?.arguments || (tc as any).arguments,
        });
      }
    }
  }

  // Handle tool_results (for tool result messages) - check top-level toolResults array
  // This handles the format: { role: "toolResult", toolResults: [{ toolCallId, toolName, content, isError }] }
  if (role === "toolResult" && Array.isArray(msg.toolResults) && msg.toolResults.length > 0) {
    toolResults = msg.toolResults.map((tr: any) => ({
      toolCallId: String(tr.toolCallId || ""),
      toolName: String(tr.toolName || "unknown"),
      content: String(tr.content || ""),
      isError: Boolean(tr.isError),
    }));
    // Set content to the first tool result's content
    content = toolResults[0].content;
  }

  // Also handle legacy toolCallId format at top level
  if (role === "toolResult" && msg.toolCallId && !toolResults) {
    const toolContent = Array.isArray(msg.content)
      ? msg.content.map((c: any) => c?.text || "").join("")
      : String(msg.content || "");
    toolResults = [{
      toolCallId: String(msg.toolCallId),
      toolName: String(msg.toolName || "unknown"),
      content: toolContent,
      isError: Boolean(msg.isError),
    }];
    content = toolContent;
  }

  // Use tool call ID as stable message ID — ensures streaming and history
  // versions of the same tool call share the same React key / dedup ID.
  let stableId = id;
  if (role === "assistant" && toolCalls && toolCalls.length > 0 && toolCalls[0].id) {
    stableId = toolCalls[0].id;
  }
  if ((role === "toolResult" || role === "tool") && toolResults && toolResults.length > 0 && toolResults[0].toolCallId) {
    stableId = `result-${toolResults[0].toolCallId}`;
  }

  // Strip model protocol markers (e.g. <final>, <thinking>) that leak into content
  const cleanContent = stripProtocolMarkers(content || "");

  return {
    id: stableId,
    role: role as ChatMessageRole,
    content: cleanContent,
    timestamp,
    ...(thinking && { thinking }),
    ...(toolCalls && toolCalls.length > 0 && { toolCalls }),
    ...(toolResults && toolResults.length > 0 && { toolResults }),
    ...(contentBlocks.length > 0 && { contentBlocks }),
  };
}

// Exported for unit testing only — not part of the public API.
export const _testHelpers = {
  extractText,
  stripProtocolMarkers,
  normalizeForCompare,
  normalizeMessage,
  deduplicateMessages,
  mergeHistoryIntoMessages,
  cachedNormalize,
  registerRunId,
  runIdOwners,
};

// Tracks hermes session state per chat session key for multi-turn conversations.
// API mode: stores conversation name (stable). CLI mode: stores hermes session ID.
const hermesSessionState = new Map<string, { sessionId?: string; conversation?: string }>();

async function sendMessageViaHermes(
  messages: Array<{ role: string; content: string }>,
  _signal: AbortSignal,
  onDelta: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  chatSessionKey?: string,
): Promise<void> {
  try {
    const state = chatSessionKey ? hermesSessionState.get(chatSessionKey) : undefined;

    // Use the chat session key as conversation name for API mode
    const conversation = chatSessionKey || undefined;

    const result = await bridgeInvoke("hermes-chat", {
      messages,
      sessionId: state?.sessionId || undefined,
      conversation,
    }) as {
      content?: string;
      sessionId?: string;
      responseId?: string;
      mode?: "api" | "cli";
      success?: boolean;
      error?: string;
    } | null;

    if (!result) {
      onError("No response from Hermes");
      return;
    }
    if (result.error) {
      onError(result.error);
      return;
    }

    // Store session state for next turn
    if (chatSessionKey) {
      hermesSessionState.set(chatSessionKey, {
        sessionId: result.sessionId || state?.sessionId,
        conversation,
      });
    }

    if (result.content) {
      onDelta(result.content);
    }
    onDone();
  } catch (err: any) {
    onError(err?.message || "Hermes bridge request failed");
  }
}

export function useGatewayChat(options: UseGatewayChatOptions = {}): UseGatewayChatReturn {
  const { sessionKey: initialSessionKey, autoConnect = true, backend = "openclaw" } = options;

  // State
  const [messages, setMessages] = useState<GatewayChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a REF to store the session key — callbacks always read the latest value
  // without needing to be recreated. A parallel state variable drives re-renders
  // for the returned sessionKey value.
  const sessionKeyRef = useRef<string>(initialSessionKey || "default");
  const [sessionKeyState, setSessionKeyState] = useState<string>(initialSessionKey || "default");

  // Sync ref + state when the prop changes (e.g. after async session resolution).
  // This must run before other effects so they read the correct key.
  const prevPropKeyRef = useRef<string>(initialSessionKey || "default");
  if (initialSessionKey && initialSessionKey !== prevPropKeyRef.current) {
    prevPropKeyRef.current = initialSessionKey;
    // Delegate to handleSessionChange so messages are cleared for the new session
    if (initialSessionKey !== sessionKeyRef.current) {
      sessionKeyRef.current = initialSessionKey;
      // We can't call handleSessionChange here (it's not defined yet), so
      // inline the same reset logic. setSessionKeyState will trigger re-render.
      // Ref cleanup (currentRunIdRef, runIdOwners, noResponseRef, etc.) is
      // handled by handleSessionChange which runs via the setSessionKey effect.
      setSessionKeyState(initialSessionKey);
      setMessages([]);
      setIsLoading(false);
      setError(null);
    }
  }

  // Track if we've already processed an event (for deduplication)
  const processedEventSeqRef = useRef<Set<string>>(new Set());

  // Read session key from ref — always current, no stale closures.
  const getSessionKey = useCallback(() => sessionKeyRef.current, []);

  // Only clear state when the session key actually changes (user action)
  const handleSessionChange = useCallback((newSessionKey: string) => {
    const oldKey = sessionKeyRef.current;
    if (oldKey !== newSessionKey) {
      sessionKeyRef.current = newSessionKey;
      setSessionKeyState(newSessionKey);
      // Clear state for new session
      setMessages([]);
      setIsLoading(false);
      setError(null);
      clearRunIdOwnership(oldKey);
      currentRunIdRef.current = null;
      streamContentRef.current = "";
      receivedEventRef.current = false;
      processedEventSeqRef.current.clear();
      if (finalDebounceRef.current) {
        clearTimeout(finalDebounceRef.current);
        finalDebounceRef.current = null;
      }
      if (noResponseRef.current) {
        clearTimeout(noResponseRef.current);
        noResponseRef.current = null;
      }
      if (disconnectGraceRef.current) {
        clearTimeout(disconnectGraceRef.current);
        disconnectGraceRef.current = null;
      }
      // Reset history pagination state for new session
      historyTierRef.current = 0;
      setHasMoreHistory(false);
    }
  }, []);

  // Refs
  const currentRunIdRef = useRef<string | null>(null);
  const streamContentRef = useRef<string>("");
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noResponseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receivedEventRef = useRef(false);
  const isMergingRef = useRef(false);
  const disconnectGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hermesAbortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<GatewayChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Shared helper: fetch history and merge into current messages.
  // Optionally auto-finalizes if the last message is a completed assistant text.
  // Guarded to prevent concurrent merges from racing.
  // Merges history into current messages even during streaming — the server stores
  // tool calls WITH their associated text content, which enables the chain breaker
  // logic to interleave text between tool groups. Without this, streaming tool calls
  // arrive with empty content and all group together until finalization.
  const mergeHistoryAndMaybeFinalize = useCallback((autoFinalize: boolean) => {
    if (isMergingRef.current) return; // skip if a merge is already in progress
    isMergingRef.current = true;
    gatewayConnection.getChatHistory(sessionKeyRef.current, 50).then((response) => {
      if (!response.messages?.length) return;
      const loaded: GatewayChatMessage[] = [];
      for (const m of response.messages) {
        const norm = normalizeMessage(m);
        if (norm) loaded.push(norm);
      }
      const deduped = deduplicateMessages(loaded);
      // Merge history into state — even during streaming. The server stores tool
      // call messages with their text content (chain breaker data), so merging
      // mid-stream provides the interleaved text+tools view.
      setMessages((prev) => {
        const merged = mergeHistoryIntoMessages(prev, deduped);
        return merged ?? prev;
      });
      if (autoFinalize) {
        const lastMsg = deduped[deduped.length - 1];
        if (lastMsg?.role === "assistant" && !lastMsg.toolCalls?.length && lastMsg.content?.trim()) {
          currentRunIdRef.current = null;
          setIsLoading(false);
        }
      }
    }).catch(() => {}).finally(() => {
      isMergingRef.current = false;
    });
  }, []);

  // Shared helper: start (or restart) the 3s finalization debounce.
  // 3s allows enough headroom for multi-tool agent runs where there can be
  // >1s gaps between consecutive lifecycle "end" events.
  // After the first history merge, schedules a re-check — the parent agent's
  // final text may not be committed to history by the time the sub-agent's
  // lifecycle "end" fires (text and tools use different runIds).
  const startFinalizeDebounce = useCallback(() => {
    if (finalDebounceRef.current) clearTimeout(finalDebounceRef.current);
    finalDebounceRef.current = setTimeout(() => {
      currentRunIdRef.current = null;
      setIsLoading(false);
      mergeHistoryAndMaybeFinalize(false);
      // Re-check history after 3s — parent agent's response may be committed late
      setTimeout(() => mergeHistoryAndMaybeFinalize(false), 3000);
      // Final re-check after 8s for slow server commits
      setTimeout(() => mergeHistoryAndMaybeFinalize(false), 8000);
    }, 3000);
  }, [mergeHistoryAndMaybeFinalize]);

  // Handle incoming chat events
  const handleChatEvent = useCallback((payload: ChatEventPayload) => {
    // Deduplicate terminal events (final/aborted/error) to prevent double-processing.
    if (payload.state !== "delta") {
      const eventKey = `${payload.runId}:${payload.state}`;
      if (processedEventSeqRef.current.has(eventKey)) return;
      processedEventSeqRef.current.add(eventKey);
      // Cap the set to prevent unbounded growth in long-lived sessions
      if (processedEventSeqRef.current.size > 500) {
        const iter = processedEventSeqRef.current.values();
        // Delete the oldest 250 entries (Sets iterate in insertion order)
        for (let i = 0; i < 250; i++) iter.next();
        const keep = new Set<string>();
        for (const v of iter) keep.add(v);
        processedEventSeqRef.current = keep;
      }
    }

    // Session key filter — prevent cross-session bleed.
    // Events WITH a sessionKey must match ours exactly.
    // Events WITHOUT a sessionKey: during an active conversation, accept events
    // from ANY runId — tool events (agent path) and text events (chat path) often
    // carry different runIds, and sub-agents have their own runIds. This matches
    // OpenClaw's approach of filtering by sessionKey only, never by runId.
    // When idle (no active run), use runId to decide whether to re-activate.
    if (payload.sessionKey) {
      if (payload.sessionKey !== sessionKeyRef.current) return;
    } else if (currentRunIdRef.current !== null) {
      // Active conversation — check the runId registry to prevent cross-chat bleed.
      // If the event's runId is registered to a DIFFERENT session, reject it.
      // Unknown runIds (sub-agents) are claimed by the first instance to process
      // them — since JS is single-threaded, this prevents other instances from
      // also accepting events from the same sub-agent.
      if (payload.runId) {
        const ownerSession = runIdOwners.get(payload.runId);
        if (ownerSession && ownerSession !== sessionKeyRef.current) return;
        if (!ownerSession) {
          registerRunId(payload.runId, sessionKeyRef.current);
        }
      }
      // Adopt the first runId for text message association.
      if (!receivedEventRef.current && payload.runId) {
        // Replace client-side runId registration with the server-side runId
        const oldRunId = currentRunIdRef.current;
        if (oldRunId) runIdOwners.delete(oldRunId);
        currentRunIdRef.current = payload.runId;
        registerRunId(payload.runId, sessionKeyRef.current);
      }
    } else {
      // No active conversation and no sessionKey — only accept if this is a
      // late-arriving delta that should re-activate the conversation.
      if (!payload.runId) return;
      if (payload.state !== "delta") return;
      // Don't re-activate if this runId is already owned by another session
      const ownerSession = runIdOwners.get(payload.runId);
      if (ownerSession && ownerSession !== sessionKeyRef.current) return;
      // Re-activate handled below in the delta handler
    }

    // Mark that we received at least one event — cancels the no-response timer.
    receivedEventRef.current = true;
    if (noResponseRef.current) {
      clearTimeout(noResponseRef.current);
      noResponseRef.current = null;
    }

    if (payload.state === "delta") {
      // Late-arriving deltas re-activate the conversation after premature finalization.
      if (currentRunIdRef.current === null && payload.runId) {
        currentRunIdRef.current = payload.runId;
        registerRunId(payload.runId, sessionKeyRef.current);
        setIsLoading(true);
      }

      // Manage timers when conversation is active (including just-reactivated).
      if (currentRunIdRef.current !== null) {
        // Reset idle reload — after 8s of silence, check history for completion.
        if (idleReloadRef.current) clearTimeout(idleReloadRef.current);
        idleReloadRef.current = setTimeout(() => {
          if (currentRunIdRef.current === null) return;
          mergeHistoryAndMaybeFinalize(true);
        }, 8000);

        // If a finalize debounce is running, restart it — late deltas extend
        // the window but finalization still fires 3s after the last event.
        if (finalDebounceRef.current) {
          startFinalizeDebounce();
        }
      }

      // Check if this is a tool event
      const msg = payload.message as Record<string, unknown> | undefined;
      const role = msg?.role as string | undefined;

      if (role === "toolResult" || role === "tool") {
        // Handle tool result - add as separate message
        // Support multiple field name conventions
        const toolResultEntry = Array.isArray(msg?.toolResults) ? (msg.toolResults as any[])[0] : undefined;
        const toolCallId = (msg?.toolCallId || msg?.tool_call_id || toolResultEntry?.toolCallId) as string | undefined;
        const toolName = (msg?.toolName || msg?.tool_name || msg?.name || toolResultEntry?.toolName) as string | undefined;
        const rawContent = toolResultEntry?.content !== undefined ? toolResultEntry.content : msg?.content;
        const content = typeof rawContent === "string" ? rawContent : "";
        const isError = (msg?.isError || toolResultEntry?.isError) as boolean | undefined;

        const resultMsgId = `result-${toolCallId || uuidv4()}`;
        const toolResultMsg: GatewayChatMessage = {
          id: resultMsgId,
          role: "toolResult",
          content,
          timestamp: Date.now(),
          toolResults: [{
            toolCallId: toolCallId || "",
            toolName: toolName || "unknown",
            content,
            isError: isError || false,
          }],
        };
        setMessages((prev) => {
          // Avoid duplicates — update if already exists
          const existingIdx = prev.findIndex((m) => m.id === resultMsgId);
          if (existingIdx !== -1) {
            const existing = prev[existingIdx] as any;
            // Skip update if content hasn't changed to prevent infinite render loops
            if (existing.content === content && existing.toolResults?.[0]?.isError === (isError || false)) {
              return prev;
            }
            const updated = [...prev];
            updated[existingIdx] = toolResultMsg;
            return updated;
          }
          // Append at end — tool results arrive in chronological order
          // alongside tool calls. The gateway splits text at tool boundaries,
          // so inserting before trailing text would break segment ordering.
          return [...prev, toolResultMsg];
        });

        return;
      }

      // Handle tool calls in any format:
      // - OpenAI: msg.tool_calls
      // - camelCase: msg.toolCalls
      // - contentBlocks: msg.contentBlocks with type "toolCall"
      // - Anthropic: msg.content array with type "tool_use"
      if (role === "assistant") {
        const rawToolCalls = msg?.tool_calls || msg?.toolCalls;
        const contentBlockToolCalls = Array.isArray(msg?.contentBlocks)
          ? (msg.contentBlocks as any[]).filter((b: any) => b?.type === "toolCall" && b?.id && b?.name)
          : [];
        const contentToolUse = Array.isArray(msg?.content)
          ? (msg.content as any[]).filter((b: any) => b?.type === "tool_use" && b?.id && b?.name)
          : [];

        const hasToolCalls = rawToolCalls || contentBlockToolCalls.length > 0 || contentToolUse.length > 0;

        if (hasToolCalls) {
          let normalizedToolCalls: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
            name: string;
            arguments: string;
          }> = [];

          const stringifyArgs = (v: unknown): string =>
            typeof v === "string" ? v : JSON.stringify(v || {});

          if (rawToolCalls) {
            normalizedToolCalls = (rawToolCalls as any[]).map((tc: any) => ({
              id: tc.id || uuidv4(),
              type: tc.type || "function",
              function: tc.function || { name: tc.name || "", arguments: stringifyArgs(tc.arguments) },
              name: tc.function?.name || tc.name || "",
              arguments: tc.function?.arguments || stringifyArgs(tc.arguments),
            }));
          } else if (contentBlockToolCalls.length > 0) {
            normalizedToolCalls = contentBlockToolCalls.map((b: any) => ({
              id: b.id,
              type: "function",
              function: { name: b.name, arguments: stringifyArgs(b.arguments) },
              name: b.name,
              arguments: stringifyArgs(b.arguments),
            }));
          } else if (contentToolUse.length > 0) {
            normalizedToolCalls = contentToolUse.map((b: any) => ({
              id: b.id,
              type: "function",
              function: { name: b.name, arguments: stringifyArgs(b.input) },
              name: b.name,
              arguments: stringifyArgs(b.input),
            }));
          }

          if (normalizedToolCalls.length > 0) {
            // Use first toolCallId as the message id so it's stable and unique per tool call
            const toolCallMsgId = normalizedToolCalls[0].id || payload.runId || uuidv4();

            setMessages((prev) => {
              // Check if we already have a message for this exact tool call
              const existingIdx = prev.findIndex((m) => m.id === toolCallMsgId);
              if (existingIdx !== -1) {
                // Skip update if tool calls haven't changed to prevent unnecessary re-renders
                const existingCalls = (prev[existingIdx] as any).toolCalls;
                if (existingCalls && JSON.stringify(existingCalls) === JSON.stringify(normalizedToolCalls)) {
                  return prev;
                }
                const updated = [...prev];
                updated[existingIdx] = { ...updated[existingIdx], toolCalls: normalizedToolCalls };
                return updated;
              }
              // Append at end — the gateway splits text at tool boundaries, so
              // text segments and tool calls arrive in the correct chronological
              // order. Inserting before trailing text would undo the segment split
              // by pushing tool calls before intermediate text messages.
              return [...prev, {
                id: toolCallMsgId,
                role: "assistant" as ChatMessageRole,
                content: "",
                timestamp: Date.now(),
                toolCalls: normalizedToolCalls,
              }];
            });
            return;
          }
        }
      }

      // Regular text delta - streaming content update.
      // The gateway splits text at tool boundaries — when a tool starts, it commits
      // the current text buffer and resets it. So each delta here contains only the
      // text for the CURRENT segment (after the last tool group).
      // If no split occurred, the delta contains the full accumulated text as before.
      const rawText = extractText(payload.message);
      // Strip protocol markers that models sometimes emit (e.g. <final>, <thinking>)
      const text = typeof rawText === "string" ? stripProtocolMarkers(rawText) : null;
      if (typeof text === "string" && text) {
        // Cap stream buffer at 512KB to prevent OOM if "final" event never arrives
        streamContentRef.current = text.length > 524_288 ? text.slice(-524_288) : text;

        setMessages((prev) => {
          const runId = payload.runId || "";

          // Find the LAST text message from this run in the CURRENT turn only.
          // The gateway may reuse runIds across conversation turns, so searching
          // the entire history would update an OLD message from a previous turn
          // instead of creating a new one for the current response.
          // Limit search to messages after the last user message.
          let lastUserIdx = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === "user") { lastUserIdx = i; break; }
          }
          const searchStart = Math.max(lastUserIdx + 1, 0);

          let ownIdx = -1;
          for (let i = prev.length - 1; i >= searchStart; i--) {
            const m = prev[i];
            if (m.role === "assistant" && !m.toolCalls?.length &&
              (m.id === runId || m.id?.startsWith(runId + "-cont"))) {
              ownIdx = i;
              break;
            }
          }

          if (ownIdx !== -1) {
            const existingContent = prev[ownIdx].content;
            const extends_ = text.startsWith(existingContent) || existingContent.startsWith(text) || existingContent === text;

            // If the new text extends or matches the existing content, this is
            // a normal streaming update for the same segment — update in place.
            if (extends_) {
              if (prev[ownIdx].content === text) return prev; // no change
              const updated = [...prev];
              updated[ownIdx] = { ...prev[ownIdx], content: text };
              return updated;
            }

            // The new text does NOT extend the existing content — this is a NEW
            // segment (the gateway cleared its buffer when a tool started).
            // Check if there are tool call messages after the existing text message;
            // if so, create a new text message to break up the tool groups.
            let hasToolCallsAfter = false;
            for (let i = ownIdx + 1; i < prev.length; i++) {
              if (prev[i].role === "assistant" && prev[i].toolCalls?.length) {
                hasToolCallsAfter = true;
                break;
              }
            }

            if (hasToolCallsAfter) {
              // New segment — create a new text message after the tool group
              const baseId = runId || uuidv4();
              let msgId = baseId;
              let suffix = 0;
              while (prev.some((m) => m.id === msgId)) {
                suffix++;
                msgId = `${baseId}-cont${suffix}`;
              }
              return [
                ...prev,
                {
                  id: msgId,
                  role: "assistant" as ChatMessageRole,
                  content: text,
                  timestamp: Date.now(),
                },
              ];
            }

            // No tool calls after — fall back to update in place
            const updated = [...prev];
            updated[ownIdx] = { ...prev[ownIdx], content: text };
            return updated;
          }

          // No existing message for this runId — check for content overlap.
          // The gateway may emit the same logical response via different event
          // paths (chat.* vs agent.*) with different runIds. Without this, each
          // path creates its own message, causing duplicate streaming text.
          // First, look for an assistant text message in the current turn whose
          // content is a prefix of (or equal to) the incoming text, or vice versa.
          let overlapIdx = -1;
          for (let i = prev.length - 1; i >= searchStart; i--) {
            const m = prev[i];
            if (m.role === "assistant" && !m.toolCalls?.length && m.content.trim()) {
              if (text.startsWith(m.content) || m.content.startsWith(text) || m.content === text) {
                overlapIdx = i;
                break;
              }
            }
          }

          if (overlapIdx !== -1) {
            // Update the existing message with the longer (more complete) text
            const longer = text.length >= prev[overlapIdx].content.length ? text : prev[overlapIdx].content;
            if (prev[overlapIdx].content === longer) return prev; // no change
            const updated = [...prev];
            updated[overlapIdx] = { ...prev[overlapIdx], content: longer };
            return updated;
          }

          // Exact-content guard (handles the case where content matches but
          // neither is a prefix of the other due to whitespace differences).
          if (text.trim() && prev.some(
            (m) => m.role === "assistant" && !m.toolCalls?.length && m.content === text
          )) {
            return prev;
          }

          // Use a unique ID — the same runId may already be used for an earlier
          // text segment (before tool calls), so suffix to avoid key collisions.
          const baseId = runId || uuidv4();
          let msgId = baseId;
          let suffix = 0;
          while (prev.some((m) => m.id === msgId)) {
            suffix++;
            msgId = `${baseId}-cont${suffix}`;
          }
          return [
            ...prev,
            {
              id: msgId,
              role: "assistant" as ChatMessageRole,
              content: text,
              timestamp: Date.now(),
            },
          ];
        });
      }
    } else if (payload.state === "final") {
      // If the final event carries a message and no text was streamed via deltas
      // (e.g. tool events were the only deltas, or deltas were lost), add the
      // final text to messages as a fallback. This prevents the "missing final
      // message" bug where the response only appears after history refresh.
      const finalText = extractText(payload.message);
      const cleanFinalText = typeof finalText === "string" ? stripProtocolMarkers(finalText) : null;
      if (cleanFinalText && cleanFinalText.trim()) {
        setMessages((prev) => {
          // Check if this text already exists (from streaming deltas) —
          // either an exact normalized match OR a prefix/overlap relationship
          // (streaming may still be slightly behind the final text).
          const normalizedFinal = normalizeForCompare(cleanFinalText);

          // Find last user message to scope the search to the current turn
          let lastUserIdx = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === "user") { lastUserIdx = i; break; }
          }
          const searchStart = Math.max(lastUserIdx + 1, 0);

          for (let i = prev.length - 1; i >= searchStart; i--) {
            const m = prev[i];
            if (m.role !== "assistant" || m.toolCalls?.length || !m.content.trim()) continue;
            const normExisting = normalizeForCompare(m.content);
            // Exact match — already have the full text
            if (normExisting === normalizedFinal) return prev;
            // Streaming message is a prefix of the final — upgrade it in place
            if (cleanFinalText.startsWith(m.content) || m.content.startsWith(cleanFinalText)) {
              const longer = cleanFinalText.length >= m.content.length ? cleanFinalText : m.content;
              if (m.content === longer) return prev;
              const updated = [...prev];
              updated[i] = { ...m, content: longer };
              return updated;
            }
          }

          // Add as new message — use a unique ID to avoid collision with
          // streaming text messages that may share the same runId.
          // History merge uses content-based matching, so ID doesn't need to match.
          return [...prev, {
            id: `final-${payload.runId || uuidv4()}`,
            role: "assistant" as ChatMessageRole,
            content: cleanFinalText,
            timestamp: Date.now(),
          }];
        });
      }
      streamContentRef.current = "";

      // Every lifecycle "end" (from any agent) restarts the 3s debounce.
      // If another agent is still active, its next delta will extend it.
      startFinalizeDebounce();
    } else if (payload.state === "aborted") {
      // User stopped generation - keep partial content
      const streamedText = streamContentRef.current;
      if (streamedText.trim()) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: streamedText },
            ];
          }
          return [
            ...prev,
            {
              id: uuidv4(),
              role: "assistant" as ChatMessageRole,
              content: streamedText,
              timestamp: Date.now(),
            },
          ];
        });
      }
      streamContentRef.current = "";
      currentRunIdRef.current = null;
      setIsLoading(false);
    } else if (payload.state === "error") {
      setError(payload.errorMessage || "Chat error");
      streamContentRef.current = "";
      mergeHistoryAndMaybeFinalize(false);
      currentRunIdRef.current = null;
      setIsLoading(false);
      if (idleReloadRef.current) {
        clearTimeout(idleReloadRef.current);
        idleReloadRef.current = null;
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    }
  }, [mergeHistoryAndMaybeFinalize, startFinalizeDebounce]);

  // Track current fetch limit and whether more history may exist.
  // Start with 100 so the user sees a meaningful history on first load.
  const HISTORY_TIERS = [100, 200, 500, 1000] as const;
  const historyTierRef = useRef(0); // index into HISTORY_TIERS
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Shared: fetch history and merge into current messages (used on connect + reconnect).
  // Loads the most recent N messages (default 10 — tier 0). If the returned count
  // equals the limit, there may be older messages — hasMoreHistory will be set to true.
  // Uses merge when there are existing messages (e.g. optimistic user messages from
  // sendMessage) to prevent them from being wiped by a concurrent history fetch.
  const fetchAndSetHistory = useCallback(async (limit?: number) => {
    if (!gatewayConnection.isConnected()) return;
    const fetchLimit = limit ?? HISTORY_TIERS[historyTierRef.current];
    try {
      const response = await gatewayConnection.getChatHistory(getSessionKey(), fetchLimit);
      const loaded: GatewayChatMessage[] = [];
      if (response.messages) {
        for (const msg of response.messages) {
          const normalized = normalizeMessage(msg);
          if (normalized) loaded.push(normalized);
        }
      }
      // If we got exactly the limit back, there may be more history
      setHasMoreHistory(loaded.length >= fetchLimit && fetchLimit < 1000);
      const deduped = deduplicateMessages(loaded);
      setMessages((prev) => {
        if (prev.length === 0) return deduped;
        // Merge to preserve optimistic/streaming messages not yet in history
        const merged = mergeHistoryIntoMessages(prev, deduped);
        return merged ?? prev;
      });
    } catch (err) {
      console.error("[GatewayChat] Failed to load history:", err);
    }
  }, [getSessionKey]);

  // Subscribe to gateway connection state
  useEffect(() => {
    let previousConnected = false;

    const handleStateChange = () => {
      const state = getGatewayConnectionState();
      setIsConnected(state.connected);

      if (state.connected && !previousConnected) {
        // Cancel disconnect grace timer — we reconnected in time.
        if (disconnectGraceRef.current) {
          clearTimeout(disconnectGraceRef.current);
          disconnectGraceRef.current = null;
        }
        // If we were mid-stream, the agent is still running on the server and
        // events will resume on the new WS automatically (same singleton listener).
        // DON'T clear currentRunIdRef or isLoading — let streaming continue.
        // Only fetch history if we were idle (no active stream to resume).
        // Probe end-to-end health first — "hub WS connected" only means we can
        // talk to the hub, not that the connector/OpenClaw is reachable. Without
        // this check, chat.history gets relayed into a dead end and times out.
        if (currentRunIdRef.current === null) {
          probeGatewayHealth().then((probe) => {
            if (probe.healthy) fetchAndSetHistory();
          });
        }
      }

      if (!state.connected) {
        // DON'T immediately kill isLoading — the WS will auto-reconnect
        // (exponential backoff: 1s, 2s, 4s...) and streaming resumes.
        // Use a 10s grace period: if we don't reconnect by then, reset state.
        if (currentRunIdRef.current !== null && !disconnectGraceRef.current) {
          disconnectGraceRef.current = setTimeout(() => {
            disconnectGraceRef.current = null;
            // Still disconnected after grace period — agent response is lost.
            // Reset so the UI doesn't show a forever-spinner.
            if (!getGatewayConnectionState().connected) {
              currentRunIdRef.current = null;
              setIsLoading(false);
            }
          }, 10_000);
        } else if (currentRunIdRef.current === null) {
          // Not streaming — safe to reset immediately
          setIsLoading(false);
        }
      }
      previousConnected = state.connected;
    };

    const unsubscribe = subscribeGatewayConnection(handleStateChange);

    // Check current state immediately — if WS is already connected (e.g. by useOpenClaw),
    // the subscription won't fire since there's no state change.
    const currentState = getGatewayConnectionState();
    if (currentState.connected) {
      setIsConnected(true);
      if (!previousConnected) {
        previousConnected = true;
        probeGatewayHealth().then((probe) => {
          if (probe.healthy) fetchAndSetHistory();
        });
      }
    }

    return () => {
      unsubscribe();
    };
  }, [fetchAndSetHistory]);

  // Keep a stable ref to the latest handleChatEvent so the subscription
  // never tears down/re-subscribes (which caused a gap where events were lost).
  const handleChatEventRef = useRef(handleChatEvent);
  handleChatEventRef.current = handleChatEvent;

  // Subscribe to chat events — stable, runs only once
  useEffect(() => {
    const stableHandler = (payload: ChatEventPayload) => handleChatEventRef.current(payload);
    unsubscribeRef.current = gatewayConnection.onChatEvent(stableHandler);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      // Clean up ALL timer refs on unmount to prevent stale callbacks firing
      // after the component is gone (setState on unmounted component).
      if (idleReloadRef.current) {
        clearTimeout(idleReloadRef.current);
        idleReloadRef.current = null;
      }
      if (noResponseRef.current) {
        clearTimeout(noResponseRef.current);
        noResponseRef.current = null;
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (finalDebounceRef.current) {
        clearTimeout(finalDebounceRef.current);
        finalDebounceRef.current = null;
      }
      if (disconnectGraceRef.current) {
        clearTimeout(disconnectGraceRef.current);
        disconnectGraceRef.current = null;
      }
      // Clean up runId registry to prevent stale entries (primary + sub-agent runIds)
      clearRunIdOwnership(sessionKeyRef.current);
    };
  }, []);

  // No polling during generation — real-time streaming events (text deltas +
  // tool events via caps: ["tool-events"]) handle live updates. The debounced
  // final handler reloads full history once the agent finishes.

  // Connect to gateway — piggyback on existing singleton connection if available.
  // The singleton is typically established by useOpenClaw (hub-aware, Electron-aware).
  // Only attempt our own connection if the singleton is not connected.
  const connect = useCallback(async () => {
    if (backend === "hermes") {
      try {
        const result = await bridgeInvoke("hermes-health") as { available?: boolean } | null;
        setIsConnected(result?.available === true);
      } catch {
        setIsConnected(false);
      }
      return;
    }
    // If singleton is already connected (by useOpenClaw or prior call), just sync state
    if (gatewayConnection.isConnected()) {
      setIsConnected(true);
      return;
    }
    try {
      const config = await getGatewayConfig();
      if (!config.gatewayUrl) {
        setError("No hub configured");
        return;
      }
      connectGatewayWs(config.gatewayUrl, {
        token: config.token,
        hubMode: config.hubMode,
        hubDeviceId: config.hubDeviceId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, [backend]);

  // Disconnect — do NOT kill the singleton WS, just unsubscribe from state.
  // The singleton is shared with useOpenClaw and other consumers.
  const disconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  // Load chat history
  // Guard isLoading so a history reload during active streaming doesn't kill the
  // "AI is generating" state (currentRunIdRef.current !== null while streaming).
  const loadChatHistory = useCallback(async () => {
    if (backend === "hermes") {
      // Load hermes history via hub/connector relay
      const key = sessionKeyRef.current;
      const hermesSessionId = key.replace(/^hermes:/, "").replace(/^agent:[^:]+:/, "");
      if (hermesSessionId && hermesSessionId !== "main" && hermesSessionId !== "default") {
        try {
          const { bridgeInvoke: invoke } = await import("$/lib/hyperclaw-bridge-client");
          const result = await invoke("hermes-load-history", { sessionId: hermesSessionId }) as {
            messages?: Array<{
              id: string; role: string; content: string; timestamp?: number;
              thinking?: string; toolCalls?: GatewayChatMessage["toolCalls"]; toolResults?: GatewayChatMessage["toolResults"];
            }>;
          };
          if (result?.messages && result.messages.length > 0) {
            const parsed: GatewayChatMessage[] = result.messages.map((m) => ({
              id: m.id,
              role: m.role as ChatMessageRole,
              content: m.content || "",
              timestamp: m.timestamp || Date.now(),
              ...(m.thinking && { thinking: m.thinking }),
              ...(m.toolCalls && { toolCalls: m.toolCalls }),
              ...(m.toolResults && { toolResults: m.toolResults }),
            }));
            setMessages(parsed);
            return;
          }
        } catch { /* fall through to localStorage */ }
      }
      // Fallback: localStorage
      try {
        const stored = localStorage.getItem(`hermes-chat:${key}`);
        if (stored) {
          const parsed = JSON.parse(stored) as GatewayChatMessage[];
          setMessages(parsed);
        }
      } catch { /* ignore parse errors */ }
      return;
    }
    if (currentRunIdRef.current === null) setIsLoading(true);
    setError(null);
    try {
      await fetchAndSetHistory();
    } catch (err) {
      console.error("[GatewayChat] loadChatHistory error:", err);
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      if (currentRunIdRef.current === null) setIsLoading(false);
    }
  }, [backend, fetchAndSetHistory]);

  // Load more (older) history — steps through tiers: 10 → 50 → 200 → 1000.
  // Re-fetches the full tail with a larger window; the gateway returns the last N
  // messages so increasing the limit surfaces older messages.
  const loadMoreHistory = useCallback(async () => {
    if (!hasMoreHistory || isLoadingMore) return;
    const nextTier = Math.min(historyTierRef.current + 1, HISTORY_TIERS.length - 1);
    if (nextTier === historyTierRef.current) return; // already at max
    historyTierRef.current = nextTier;
    setIsLoadingMore(true);
    try {
      await fetchAndSetHistory(HISTORY_TIERS[nextTier]);
    } catch (err) {
      console.error("[GatewayChat] loadMoreHistory error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreHistory, isLoadingMore, fetchAndSetHistory]);

  // Send a message
  const sendMessage = useCallback(async (content: string, attachments?: GatewayChatAttachment[]) => {
    if (!content.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    const now = Date.now();
    const userMessage: GatewayChatMessage = {
      id: uuidv4(),
      role: "user",
      content: content.trim(),
      timestamp: now,
      attachments: attachments?.length ? attachments : undefined,
    };

    // Optimistically add user message
    setMessages((prev) => [...prev, userMessage]);

    // Generate runId for this conversation
    const runId = uuidv4();

    setIsLoading(true);
    setError(null);

    currentRunIdRef.current = runId;
    registerRunId(runId, sessionKeyRef.current);
    streamContentRef.current = "";

    if (backend === "hermes") {
      // Build conversation history for Hermes (stateless API needs full history)
      // Include the just-added user message since setMessages hasn't flushed yet
      const hermesMessages = [...messagesRef.current, userMessage]
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role, content: m.content }));

      hermesAbortRef.current = new AbortController();

      // Create streaming assistant message
      const assistantMsgId = uuidv4();
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: "assistant" as ChatMessageRole,
        content: "",
        timestamp: Date.now(),
      }]);

      try {
        await sendMessageViaHermes(
          hermesMessages,
          hermesAbortRef.current.signal,
          (delta) => {
            streamContentRef.current += delta;
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: streamContentRef.current }
                : m
            ));
          },
          () => {
            // Persist to localStorage
            setMessages(prev => {
              try {
                localStorage.setItem(
                  `hermes-chat:${sessionKeyRef.current}`,
                  JSON.stringify(prev)
                );
              } catch { /* ignore storage errors */ }
              return prev;
            });
            currentRunIdRef.current = null;
            setIsLoading(false);
            hermesAbortRef.current = null;
          },
          (error) => {
            setError(error);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: `Error: ${error}` }
                : m
            ));
            currentRunIdRef.current = null;
            setIsLoading(false);
            hermesAbortRef.current = null;
          },
          sessionKeyRef.current,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const msg = err instanceof Error ? err.message : "Failed to send";
          setError(msg);
        }
        currentRunIdRef.current = null;
        setIsLoading(false);
        hermesAbortRef.current = null;
      }
      return;
    }

    // --- Existing OpenClaw WebSocket path ---

    if (!gatewayConnection.isConnected()) {
      try {
        const config = await getGatewayConfig();
        if (!config.gatewayUrl) {
          setError("No hub configured");
          setIsLoading(false);
          currentRunIdRef.current = null;
          return;
        }
        connectGatewayWs(config.gatewayUrl, {
          token: config.token,
          hubMode: config.hubMode,
          hubDeviceId: config.hubDeviceId,
        });
        // Wait for connection (max 5s) using state subscription
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { unsub(); reject(new Error("Connection timeout")); }, 5000);
          const unsub = subscribeGatewayConnection(() => {
            const s = getGatewayConnectionState();
            if (s.connected) { clearTimeout(timeout); unsub(); resolve(); }
            else if (s.error) { clearTimeout(timeout); unsub(); reject(new Error(s.error)); }
          });
          // Check immediately in case already connected
          if (gatewayConnection.isConnected()) { clearTimeout(timeout); unsub(); resolve(); }
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auto-connect failed");
        currentRunIdRef.current = null;
        setIsLoading(false);
        return;
      }
    }

    // Don't add an empty assistant "thinking" placeholder — it would get an
    // early timestamp and sort before tool actions. The GatewayChatWidget's
    // thinking indicator handles the "AI is thinking" state via isLoading.
    // Text content is appended when it actually arrives (after tools).

    // Clear any idle reload timer from previous conversation
    if (idleReloadRef.current) {
      clearTimeout(idleReloadRef.current);
      idleReloadRef.current = null;
    }

    // Safety timeout: reset isLoading if no terminal event arrives within 5 min
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => {
      currentRunIdRef.current = null;
      setIsLoading(false);
      mergeHistoryAndMaybeFinalize(false);
    }, 300_000);

    receivedEventRef.current = false;

    // No-response check: if no streaming events arrive within 15s after send,
    // check history — the agent may have completed while events were filtered
    // (e.g. session key changed mid-flight) or never relayed (hub issue).
    if (noResponseRef.current) clearTimeout(noResponseRef.current);
    noResponseRef.current = setTimeout(() => {
      noResponseRef.current = null;
      if (!receivedEventRef.current && currentRunIdRef.current !== null) {
        mergeHistoryAndMaybeFinalize(true);
      }
    }, 15_000);

    try {
      // Convert attachments to API format
      const apiAttachments = attachments?.map((att) => ({
        type: "image" as const,
        mimeType: att.mimeType,
        content: att.dataUrl.split(",")[1] || att.dataUrl, // Remove data: prefix
      }));

      await gatewayConnection.sendChatMessage({
        sessionKey: getSessionKey(),
        message: content.trim(),
        deliver: false,
        idempotencyKey: runId,
        attachments: apiAttachments,
      });

      // Response will come through chat events
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      console.error("[GatewayChat] Send message error:", err);
      setError(errorMessage);

      // Add error message to chat
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: "assistant",
          content: `Error: ${errorMessage}`,
          timestamp: Date.now(),
        },
      ]);

      currentRunIdRef.current = null;
      setIsLoading(false);
    }
  }, [backend, getSessionKey, mergeHistoryAndMaybeFinalize]);

  // Stop generation
  const stopGeneration = useCallback(async () => {
    if (backend === "hermes" && hermesAbortRef.current) {
      hermesAbortRef.current.abort();
      hermesAbortRef.current = null;
      currentRunIdRef.current = null;
      setIsLoading(false);
      return;
    }
    // Immediately stop loading — don't wait for the gateway's "aborted" event
    // which may be slow or never arrive (e.g. disconnected, hub relay delay).
    const runIdToAbort = currentRunIdRef.current;
    const streamedText = streamContentRef.current;
    if (streamedText.trim()) {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, content: streamedText },
          ];
        }
        return [
          ...prev,
          {
            id: uuidv4(),
            role: "assistant" as ChatMessageRole,
            content: streamedText,
            timestamp: Date.now(),
          },
        ];
      });
    }
    streamContentRef.current = "";
    currentRunIdRef.current = null;
    setIsLoading(false);

    // Best-effort: tell the gateway to abort (fire-and-forget)
    if (gatewayConnection.isConnected() && runIdToAbort) {
      gatewayConnection
        .abortChat({
          sessionKey: getSessionKey(),
          runId: runIdToAbort,
        })
        .catch(() => {
          /* abort is best-effort; hub/device timeouts are expected */
        });
    }
  }, [backend, getSessionKey]);

  // Clear chat
  const clearChat = useCallback(() => {
    if (backend === "hermes") {
      localStorage.removeItem(`hermes-chat:${sessionKeyRef.current}`);
    }
    setMessages([]);
    setError(null);
    streamContentRef.current = "";
    currentRunIdRef.current = null;
    if (finalDebounceRef.current) {
      clearTimeout(finalDebounceRef.current);
      finalDebounceRef.current = null;
    }
    if (noResponseRef.current) {
      clearTimeout(noResponseRef.current);
      noResponseRef.current = null;
    }
  }, [backend]);

  // Clear loading/finalize timeouts when isLoading becomes false
  useEffect(() => {
    if (!isLoading) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (finalDebounceRef.current) {
        clearTimeout(finalDebounceRef.current);
        finalDebounceRef.current = null;
      }
      if (noResponseRef.current) {
        clearTimeout(noResponseRef.current);
        noResponseRef.current = null;
      }
    }
  }, [isLoading]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return useMemo(() => ({
    messages,
    isLoading,
    isConnected,
    error,
    sessionKey: sessionKeyState,
    hasMoreHistory,
    isLoadingMore,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    loadMoreHistory,
    clearChat,
    setSessionKey: handleSessionChange,
    connect,
    disconnect,
  }), [
    messages,
    isLoading,
    isConnected,
    error,
    sessionKeyState,
    hasMoreHistory,
    isLoadingMore,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    loadMoreHistory,
    clearChat,
    handleSessionChange,
    connect,
    disconnect,
  ]);
}
