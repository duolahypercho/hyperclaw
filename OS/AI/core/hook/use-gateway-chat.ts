"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  connectGatewayWs,
  getGatewayConfig,
  getGatewayConnectionState,
  subscribeGatewayConnection,
  gatewayConnection,
  probeGatewayHealth,
  probeConnectorHealth,
} from "$/lib/openclaw-gateway-ws";
import { v4 as uuidv4 } from "uuid";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  extractAgentIdFromSessionKey,
  markAgentRunFinished,
  markAgentRunsFinishedForAgent,
  markAgentRunStarted,
} from "$/components/ensemble/hooks/useAgentStreamingState";
import {
  filterMessagesAfterClear,
  readChatClearMarker,
  writeChatClearMarker,
} from "./chat-clear-boundary";
import { getGatewayUnavailableMessage } from "$/lib/local-connector-routing";

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

const TRANSIENT_CHAT_STATE_TTL_MS = 5 * 60_000;
const INITIAL_HISTORY_LIMIT = 100;
const HISTORY_TIERS = [INITIAL_HISTORY_LIMIT, 200, 500, 1000] as const;
const FINALIZE_HISTORY_LIMIT = INITIAL_HISTORY_LIMIT;
const HERMES_POLL_HISTORY_LIMIT = 50;
const HERMES_POLL_INTERVAL_MS = 1_500;
const HERMES_LATEST_SESSION_CACHE_TTL_MS = 5_000;
const EMPTY_MODEL_RESPONSE_MESSAGE =
  "The model did not return a visible response. It may have refused, run out of tokens, or ended without final text.";

interface TransientGatewayChatState {
  messages: GatewayChatMessage[];
  isLoading: boolean;
  runId: string | null;
  updatedAt: number;
}

const transientGatewayChatState = new Map<string, TransientGatewayChatState>();
const latestHermesSessionCache = new Map<string, { sessionId: string | null; ts: number; inflight?: Promise<string | null> }>();

function getTransientChatStateKey(
  backend: GatewayChatBackend,
  sessionKey: string,
  agentId?: string,
  statusAgentId?: string,
): string {
  return `${backend}:${statusAgentId || agentId || "main"}:${sessionKey}`;
}

function readTransientChatState(
  backend: GatewayChatBackend,
  sessionKey: string,
  agentId?: string,
  statusAgentId?: string,
): TransientGatewayChatState | undefined {
  if (backend !== "openclaw") return undefined;
  const key = getTransientChatStateKey(backend, sessionKey, agentId, statusAgentId);
  const cached = transientGatewayChatState.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.updatedAt > TRANSIENT_CHAT_STATE_TTL_MS) {
    transientGatewayChatState.delete(key);
    return undefined;
  }
  return cached;
}

function writeTransientChatMessages(
  backend: GatewayChatBackend,
  sessionKey: string,
  messages: GatewayChatMessage[],
  isLoading = false,
  runId: string | null = null,
  agentId?: string,
  statusAgentId?: string,
): void {
  if (backend !== "openclaw") return;
  const key = getTransientChatStateKey(backend, sessionKey, agentId, statusAgentId);
  if (messages.length === 0) {
    transientGatewayChatState.delete(key);
    return;
  }
  transientGatewayChatState.set(key, {
    messages,
    isLoading,
    runId,
    updatedAt: Date.now(),
  });
}

function clearTransientChatMessages(
  backend: GatewayChatBackend,
  sessionKey: string,
  agentId?: string,
  statusAgentId?: string,
): void {
  if (backend !== "openclaw") return;
  transientGatewayChatState.delete(
    getTransientChatStateKey(backend, sessionKey, agentId, statusAgentId),
  );
}

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
  /** Base64 data URL. Not populated for generic file attachments from Claude Code
   *  (code files are already on disk; embedding them in React state causes ~10GB leaks). */
  dataUrl?: string;
}

export interface UseGatewayChatOptions {
  sessionKey?: string;
  autoConnect?: boolean;
  backend?: "openclaw" | "claude-code" | "codex" | "hermes";
  agentId?: string;
  /** UI agent id for status dots when backend-specific ids differ. */
  statusAgentId?: string;
}

type GatewayChatBackend = NonNullable<UseGatewayChatOptions["backend"]>;

function getOpenClawTransportSessionKey(
  sessionKey: string,
  backend: GatewayChatBackend,
  agentId?: string,
  statusAgentId?: string
): string {
  if (backend !== "openclaw") return sessionKey;
  if (sessionKey.startsWith("agent:")) return sessionKey;
  const scopedAgentId = statusAgentId || agentId || extractAgentIdFromSessionKey(sessionKey);
  return scopedAgentId ? `agent:${scopedAgentId}:${sessionKey}` : sessionKey;
}

function sessionKeysMatchForBackend(
  payloadSessionKey: string,
  currentSessionKey: string,
  backend: GatewayChatBackend,
  agentId?: string,
  statusAgentId?: string
): boolean {
  if (payloadSessionKey === currentSessionKey) return true;
  return payloadSessionKey === getOpenClawTransportSessionKey(
    currentSessionKey,
    backend,
    agentId,
    statusAgentId
  );
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

// Strip CLI chrome from Hermes output — box-drawing characters, ANSI escapes,
// and the decorative header line (e.g. "╭─ ⚕ Hermes ─────╮").
function stripHermesCLIChrome(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*[mGKHFJ]/g, "")                       // ANSI escape sequences
    .replace(/^[╭╰├┌└][─═┄┈]+.*[╮╯┤┐┘]?\s*$/gm, "")             // full border lines (top/bottom)
    .replace(/^[│║┃]\s*/gm, "")                                   // left border prefix
    .replace(/\s*[│║┃]\s*$/gm, "")                                // right border suffix
    .replace(/^.*?[╭╮╰╯│─]+\s*⚕\s*\w+\s*[╭╮╰╯│─]+.*$/gm, "")   // header line with agent symbol
    .replace(/\n{3,}/g, "\n\n")                                   // collapse excessive blank lines
    .trim();
}

// Normalize content for fuzzy comparison — the server sometimes returns the
// same message with slightly different whitespace (e.g. single vs double newline).
function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasNormalizedContainment(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
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

// toolCallSignaturesEqual returns true when two tool-call lists describe the
// same operations in the same order. Compares `name` plus normalized
// `arguments` — IDs intentionally ignored because the streaming and history
// versions of the same call carry different transport IDs.
function toolCallSignaturesEqual(
  a: GatewayChatMessage["toolCalls"],
  b: GatewayChatMessage["toolCalls"]
): boolean {
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen !== bLen) return false;
  if (aLen === 0) return true;
  for (let i = 0; i < aLen; i++) {
    const ai = a![i] as { name?: string; function?: { name?: string; arguments?: string }; arguments?: string };
    const bi = b![i] as { name?: string; function?: { name?: string; arguments?: string }; arguments?: string };
    const aName = ai.name || ai.function?.name || "";
    const bName = bi.name || bi.function?.name || "";
    if (aName !== bName) return false;
    const aArgs = normalizeForCompare(ai.function?.arguments ?? ai.arguments ?? "");
    const bArgs = normalizeForCompare(bi.function?.arguments ?? bi.arguments ?? "");
    if (aArgs !== bArgs) return false;
  }
  return true;
}

function presentationMetadataChanged(
  current: GatewayChatMessage,
  next: GatewayChatMessage
): boolean {
  if ((current.thinking || "") !== (next.thinking || "")) return true;
  const currentBlocks = current.contentBlocks ?? [];
  const nextBlocks = next.contentBlocks ?? [];
  if (currentBlocks.length !== nextBlocks.length) return true;
  for (let i = 0; i < currentBlocks.length; i++) {
    const currentBlock = currentBlocks[i] as Record<string, unknown>;
    const nextBlock = nextBlocks[i] as Record<string, unknown>;
    if (currentBlock.type !== nextBlock.type) return true;
    if (currentBlock.type === "thinking" && currentBlock.thinking !== nextBlock.thinking) return true;
    if (currentBlock.type === "text" && currentBlock.text !== nextBlock.text) return true;
  }
  return false;
}

function currentTurnHasVisibleAssistantOutput(messages: GatewayChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user") break;
    if (message.role === "assistant") {
      if (message.content?.trim()) return true;
      if (message.toolCalls?.length || message.toolResults?.length || message.contentBlocks?.length) return true;
    }
    if (message.role === "tool" || message.role === "toolResult") {
      if (message.content?.trim() || message.toolResults?.length) return true;
    }
  }
  return false;
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
  // Pass 3: Collapse adjacent duplicate turns:
  // [same user, same assistant] [same user, same assistant].
  // OpenClaw history can persist the same turn twice even when the UI only sent
  // one chat.send. Keep the later pair because it usually has richer metadata
  // (thinking/contentBlocks) after history finalization.
  //
  // Tool calls: collapse only when both assistants have IDENTICAL tool-call
  // signatures (name + normalized arguments, in order). Without this guard,
  // back-to-back legitimately-different tool runs would merge. With it, a
  // duplicated turn that called the same tool with the same args (the
  // common OpenClaw history-replay case) collapses correctly.
  const turnDeduped: GatewayChatMessage[] = [];
  for (const msg of result) {
    turnDeduped.push(msg);
    while (turnDeduped.length >= 4) {
      const a = turnDeduped[turnDeduped.length - 4];
      const b = turnDeduped[turnDeduped.length - 3];
      const c = turnDeduped[turnDeduped.length - 2];
      const d = turnDeduped[turnDeduped.length - 1];
      const toolCallsMatch =
        (!b.toolCalls?.length && !d.toolCalls?.length) ||
        toolCallSignaturesEqual(b.toolCalls, d.toolCalls);
      const duplicateTurn =
        a.role === "user" &&
        b.role === "assistant" &&
        c.role === "user" &&
        d.role === "assistant" &&
        toolCallsMatch &&
        cachedNormalize(a) === cachedNormalize(c) &&
        cachedNormalize(b) === cachedNormalize(d);
      if (!duplicateTurn) break;
      turnDeduped.splice(turnDeduped.length - 4, 2);
    }
  }

  return turnDeduped;
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
      const presentationChanged = presentationMetadataChanged(currentVersion, histMsg);
      // Compare tool results by count + first entry (avoids JSON.stringify on every message)
      const ctr = currentVersion.toolResults;
      const htr = histMsg.toolResults;
      const toolResultsChanged = ctr?.length !== htr?.length ||
        (ctr?.[0]?.content !== htr?.[0]?.content) ||
        (ctr?.[0]?.isError !== htr?.[0]?.isError);
      if (contentChanged || presentationChanged || toolResultsChanged) {
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
      if (presentationMetadataChanged(contentMatch, histMsg)) {
        merged.push(histMsg);
        hasChanges = true;
      } else {
        merged.push(contentMatch); // preserve reference
      }
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

function findCurrentTurnStart(messages: GatewayChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i + 1;
  }
  return 0;
}

function isFinalTextAlreadyRepresented(
  messages: GatewayChatMessage[],
  finalText: string
): boolean {
  const searchStart = findCurrentTurnStart(messages);
  const textSegments = messages
    .slice(searchStart)
    .filter((m) => m.role === "assistant" && !m.toolCalls?.length && m.content.trim())
    .map((m) => m.content);

  if (textSegments.length < 2) return false;

  return normalizeForCompare(textSegments.join("\n")) === normalizeForCompare(finalText);
}

function pruneContainedAssistantTextMessages(
  messages: GatewayChatMessage[],
  finalText: string,
  keepId?: string
): GatewayChatMessage[] {
  if (isFinalTextAlreadyRepresented(messages, finalText)) {
    return messages;
  }

  const finalNorm = normalizeForCompare(finalText);
  const searchStart = findCurrentTurnStart(messages);
  let changed = false;

  const next = messages.filter((msg, index) => {
    if (index < searchStart) return true;
    if (msg.role !== "assistant" || msg.toolCalls?.length || !msg.content.trim()) return true;
    if (msg.id === keepId) return true;

    const norm = normalizeForCompare(msg.content);
    if (!norm || norm === finalNorm) return true;

    if (finalNorm.includes(norm)) {
      changed = true;
      return false;
    }

    return true;
  });

  return changed ? next : messages;
}

function applyFinalAssistantText(
  messages: GatewayChatMessage[],
  finalText: string,
  runId?: string
): GatewayChatMessage[] {
  if (isFinalTextAlreadyRepresented(messages, finalText)) {
    return messages;
  }

  const normalizedFinal = normalizeForCompare(finalText);
  const searchStart = findCurrentTurnStart(messages);

  for (let i = messages.length - 1; i >= searchStart; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.content.trim()) continue;
    const normExisting = normalizeForCompare(m.content);
    if (normExisting === normalizedFinal) {
      return pruneContainedAssistantTextMessages(messages, finalText, m.id);
    }
    if (finalText.startsWith(m.content) || m.content.startsWith(finalText)) {
      const longer = finalText.length >= m.content.length ? finalText : m.content;
      if (m.content === longer) {
        return pruneContainedAssistantTextMessages(messages, longer, m.id);
      }
      const updated = [...messages];
      updated[i] = { ...m, content: longer };
      return pruneContainedAssistantTextMessages(updated, longer, m.id);
    }
  }

  const appended = [...messages, {
    id: `final-${runId || uuidv4()}`,
    role: "assistant" as ChatMessageRole,
    content: finalText,
    timestamp: Date.now(),
  }];
  return pruneContainedAssistantTextMessages(appended, finalText, appended[appended.length - 1].id);
}

function parseMessageTimestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// Helper to normalize message to our format
function normalizeMessage(
  message: unknown,
  missingTimestampFallback = Date.now(),
  depth = 0
): GatewayChatMessage | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const msg = message as Record<string, unknown>;
  if (msg.type === "message" && msg.message && typeof msg.message === "object") {
    if (depth >= 3) return null;
    const wrappedMessage = msg.message as Record<string, unknown>;
    return normalizeMessage(
      {
        ...wrappedMessage,
        id: typeof wrappedMessage.id === "string" ? wrappedMessage.id : msg.id,
        timestamp: wrappedMessage.timestamp ?? msg.timestamp,
      },
      parseMessageTimestamp(msg.timestamp, missingTimestampFallback),
      depth + 1
    );
  }

  const role = typeof msg.role === "string" ? msg.role : null;

  if (!role) {
    return null;
  }

  const id = typeof msg.id === "string" ? msg.id : uuidv4();
  const timestamp = parseMessageTimestamp(msg.timestamp, missingTimestampFallback);

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
  hasNormalizedContainment,
  normalizeMessage,
  parseMessageTimestamp,
  deduplicateMessages,
  toolCallSignaturesEqual,
  mergeHistoryIntoMessages,
  getOpenClawTransportSessionKey,
  sessionKeysMatchForBackend,
  findCurrentTurnStart,
  isFinalTextAlreadyRepresented,
  pruneContainedAssistantTextMessages,
  applyFinalAssistantText,
  cachedNormalize,
  registerRunId,
  runIdOwners,
  getRuntimeHistorySessionId,
  seedHermesSession,
  usesGatewayHealthProbe,
  isTransientGatewayStartupError,
  getGatewayStartupErrorMessage,
};

function getRuntimeHistorySessionId(backend: GatewayChatBackend, sessionKey: string): string | null {
  const trimmedKey = sessionKey.trim();
  if (!trimmedKey) return null;

  switch (backend) {
    case "claude-code": {
      const sessionId = trimmedKey.startsWith("claude:") ? trimmedKey.slice(7) : trimmedKey;
      return sessionId && sessionId !== "default" ? sessionId : null;
    }
    case "codex": {
      const sessionId = trimmedKey.replace(/^codex:/, "");
      return sessionId && sessionId !== "default" ? sessionId : null;
    }
    case "hermes": {
      return getHermesHistorySessionId(trimmedKey);
    }
    default:
      return trimmedKey;
  }
}

function isPlaceholderHermesSessionId(sessionId: string): boolean {
  return (
    !sessionId ||
    sessionId === "main" ||
    sessionId === "default" ||
    /^chat-\d+$/.test(sessionId) ||
    sessionId.endsWith(":main") ||
    /:chat-\d+$/.test(sessionId)
  );
}

function getHermesHistorySessionId(sessionKey: string): string | null {
  const trimmedKey = sessionKey.trim();
  if (!trimmedKey) return null;

  if (trimmedKey.startsWith("hermes:")) {
    const sessionId = trimmedKey.slice("hermes:".length);
    return isPlaceholderHermesSessionId(sessionId) ? null : sessionId;
  }

  // Historical Hermes keys can arrive embedded in agent session keys, for
  // example "agent:ceo:hermes:session-9". UI placeholders such as
  // "agent:hermes:rell:main" are intentionally rejected below.
  const marker = ":hermes:";
  const markerIndex = trimmedKey.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const sessionId = trimmedKey.slice(markerIndex + marker.length);
    return isPlaceholderHermesSessionId(sessionId) ? null : sessionId;
  }

  return null;
}

// Seed the hermesSessionState map when switching to a historical session,
// so sendMessageViaHermes can resume it instead of starting a new one.
function seedHermesSession(chatSessionKey: string, hermesSessionId: string): void {
  hermesSessionState.set(chatSessionKey, {
    sessionId: hermesSessionId,
    conversation: chatSessionKey,
  });
}

function usesGatewayHealthProbe(backend: GatewayChatBackend): boolean {
  return backend === "openclaw";
}

function getErrorMessage(err: unknown, fallback = "Gateway not reachable"): string {
  return err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
}

function isTransientGatewayStartupError(err: unknown): boolean {
  const msg = getErrorMessage(err, "").toLowerCase();
  return (
    msg.includes("gateway not connected") ||
    msg.includes("gateway not ready yet") ||
    msg.includes("failed to communicate with device") ||
    msg.includes("device not connected") ||
    msg.includes("connector is offline") ||
    msg.includes("chat.history unavailable during gateway startup") ||
    msg.includes("closed (1005)")
  );
}

function getGatewayStartupErrorMessage(err: unknown): string {
  const msg = getErrorMessage(err, "").toLowerCase();
  if (
    msg.includes("failed to communicate with device") ||
    msg.includes("device not connected") ||
    msg.includes("connector is offline")
  ) {
    return "Device unreachable — connector is offline or paired to another workspace.";
  }
  return "OpenClaw is still starting. Check connector status and retry.";
}

// Tracks hermes session state per chat session key for multi-turn conversations.
// API mode: stores conversation name (stable). CLI mode: stores hermes session ID.
const hermesSessionState = new Map<string, { sessionId?: string; conversation?: string }>();
const getHermesSessionStorageKey = (chatSessionKey: string) => `hermes-chat-session:${chatSessionKey}`;
const getHermesAgentSessionStorageKey = (agentId?: string) =>
  `hermes-chat-primary-session:${normalizeHermesAgentIdForStorage(agentId)}`;

function resetGatewayChatRuntimeStateForTests(): void {
  runIdOwners.clear();
  hermesSessionState.clear();
  transientGatewayChatState.clear();
}

function normalizeHermesAgentIdForStorage(agentId?: string): string {
  const trimmed = agentId?.trim();
  if (!trimmed) return "main";
  return trimmed.startsWith("hermes:") ? trimmed.slice("hermes:".length) || "main" : trimmed;
}

function isDefaultHermesChatSessionKey(sessionKey: string): boolean {
  const trimmed = sessionKey.trim();
  return (
    trimmed === "main" ||
    trimmed === "default" ||
    (trimmed.startsWith("agent:") && trimmed.endsWith(":main")) ||
    trimmed.startsWith("ensemble:dm:")
  );
}

function readStoredHermesSessionId(chatSessionKey: string, agentId?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const exactSessionId = localStorage.getItem(getHermesSessionStorageKey(chatSessionKey));
    if (exactSessionId) return exactSessionId;

    if (isDefaultHermesChatSessionKey(chatSessionKey)) {
      return localStorage.getItem(getHermesAgentSessionStorageKey(agentId));
    }
  } catch {
    // Ignore storage errors; Hermes can still create a new runtime session.
  }
  return null;
}

function rememberHermesSessionId(chatSessionKey: string, sessionId: string, agentId?: string): void {
  if (!sessionId || typeof window === "undefined") return;
  latestHermesSessionCache.set(agentId || "main", { sessionId, ts: Date.now() });
  try {
    localStorage.setItem(getHermesSessionStorageKey(chatSessionKey), sessionId);
    if (isDefaultHermesChatSessionKey(chatSessionKey)) {
      localStorage.setItem(getHermesAgentSessionStorageKey(agentId), sessionId);
    }
  } catch {
    // Ignore storage errors; in-memory state still covers this page lifetime.
  }
}

async function loadLatestHermesSessionId(agentId?: string): Promise<string | null> {
  const cacheKey = agentId || "main";
  const cached = latestHermesSessionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HERMES_LATEST_SESSION_CACHE_TTL_MS) {
    if (cached.inflight) return cached.inflight;
    return cached.sessionId;
  }

  const inflight = (async () => {
    try {
      const result = await bridgeInvoke("hermes-sessions", {
        limit: 1,
        ...(agentId ? { agentId } : {}),
      }) as { sessions?: Array<{ key?: string; id?: string }> } | null;
      const latest = result?.sessions?.[0];
      return latest?.key || latest?.id || null;
    } catch {
      return null;
    }
  })();
  latestHermesSessionCache.set(cacheKey, { sessionId: cached?.sessionId ?? null, ts: Date.now(), inflight });
  const sessionId = await inflight;
  latestHermesSessionCache.set(cacheKey, { sessionId, ts: Date.now() });
  return sessionId;
}

async function resolveHermesSessionId(chatSessionKey: string, agentId?: string): Promise<string | undefined> {
  const state = hermesSessionState.get(chatSessionKey);
  const storedSessionId = readStoredHermesSessionId(chatSessionKey, agentId);
  const keySessionId = getHermesHistorySessionId(chatSessionKey);
  const effectiveSessionId = state?.sessionId || storedSessionId || keySessionId;
  const defaultKey = isDefaultHermesChatSessionKey(chatSessionKey);
  if (effectiveSessionId) return effectiveSessionId;

  if (!defaultKey || readChatClearMarker(chatSessionKey)) return undefined;

  const latestSessionId = await loadLatestHermesSessionId(agentId);
  if (!latestSessionId) return undefined;

  hermesSessionState.set(chatSessionKey, {
    sessionId: latestSessionId,
    conversation: chatSessionKey,
  });
  rememberHermesSessionId(chatSessionKey, latestSessionId, agentId);
  return latestSessionId;
}

async function loadHermesHistoryMessages(
  sessionId: string,
  agentId?: string,
  limit = 200,
): Promise<GatewayChatMessage[]> {
  const result = await bridgeInvoke("hermes-load-history", {
    sessionId,
    limit,
    ...(agentId ? { agentId } : {}),
  }) as { messages?: unknown[] } | null;

  const rawMessages = Array.isArray(result?.messages) ? result.messages : [];
  return rawMessages
    .map((msg) => normalizeMessage(msg, 0))
    .filter((msg): msg is GatewayChatMessage => msg !== null);
}

async function sendMessageViaHermes(
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
  onDelta: (content: string) => void,
  onFinal: (content: string) => void,
  onDone: (attachments?: GatewayChatAttachment[]) => void,
  onError: (error: string) => void,
  chatSessionKey?: string,
  agentId?: string,
  onSessionId?: (sessionId: string) => void,
): Promise<void> {
  let sawStreamDelta = false;
  let streamedVisibleText = "";
  const clientRequestId = uuidv4();
  const activeSessionKey = chatSessionKey || "default";

  // When the caller aborts, tell the connector to kill the in-flight CLI/HTTP
  // request. Fire-and-forget — the abort action has its own 5s timeout on the
  // connector side, and the in-flight bridgeInvoke promise will settle once
  // the connector sends its final (error) response.
  const handleAbort = () => {
    bridgeInvoke("hermes-abort", { sessionKey: activeSessionKey }).catch(() => {
      // Best-effort: if abort fails, nothing we can do beyond UI cleanup.
    });
  };
  if (signal.aborted) {
    handleAbort();
  } else {
    signal.addEventListener("abort", handleAbort, { once: true });
  }

  const handleHermesStream = (evt: Event) => {
    const detail = (evt as CustomEvent).detail as {
      requestId?: string;
      sessionKey?: string;
      event?: {
        type?: string;
        delta?: string;
        error?: string;
        sessionId?: string;
        clientRequestId?: string;
      };
    };

    const streamEvent = detail?.event;
    if (!streamEvent) return;
    if (streamEvent.clientRequestId && streamEvent.clientRequestId !== clientRequestId) return;
    if (!streamEvent.clientRequestId && detail?.sessionKey && detail.sessionKey !== activeSessionKey) return;

    if (streamEvent.type === "session" && streamEvent.sessionId) {
      hermesSessionState.set(activeSessionKey, {
        sessionId: streamEvent.sessionId,
        conversation: activeSessionKey,
      });
      rememberHermesSessionId(activeSessionKey, streamEvent.sessionId, agentId);
      onSessionId?.(streamEvent.sessionId);
      return;
    }

    if (streamEvent.type === "delta" && typeof streamEvent.delta === "string") {
      const cleanedDelta = stripHermesCLIChrome(streamEvent.delta);
      if (!cleanedDelta) return;
      sawStreamDelta = true;
      streamedVisibleText += cleanedDelta;
      onDelta(cleanedDelta);
      return;
    }

    if (streamEvent.type === "error" && streamEvent.error) {
      onError(streamEvent.error);
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("hermes-stream", handleHermesStream as EventListener);
  }

  try {
    const effectiveSessionId = await resolveHermesSessionId(activeSessionKey, agentId);

    // Use the chat session key as conversation name for API mode
    const conversation = chatSessionKey || undefined;

    const result = await bridgeInvoke("hermes-chat", {
      messages,
      sessionId: effectiveSessionId,
      conversation,
      sessionKey: activeSessionKey,
      clientRequestId,
      ...(agentId ? { agentId } : {}),
    }) as {
      content?: string;
      sessionId?: string;
      responseId?: string;
      mode?: "api" | "cli";
      success?: boolean;
      error?: string;
      attachments?: Array<{ filename: string; mimeType: string; data: string; size: number }>;
    } | null;

    if (!result) {
      onError("No response from Hermes");
      return;
    }
    if (result.success === false && !result.error) {
      onError("Hermes returned an error without details.");
      return;
    }
    if (result.error) {
      onError(result.error);
      return;
    }

    // Store session state for next turn
    if (chatSessionKey) {
      hermesSessionState.set(chatSessionKey, {
        sessionId: result.sessionId || effectiveSessionId,
        conversation,
      });
      if (result.sessionId) {
        rememberHermesSessionId(chatSessionKey, result.sessionId, agentId);
      }
    }
    if (result.sessionId) {
      onSessionId?.(result.sessionId);
    }

    let emittedFinalText = false;
    if (result.content) {
      const cleanedFinal = stripProtocolMarkers(stripHermesCLIChrome(result.content));
      if (
        cleanedFinal &&
        (!sawStreamDelta || normalizeForCompare(streamedVisibleText) !== normalizeForCompare(cleanedFinal))
      ) {
        emittedFinalText = true;
        onFinal(cleanedFinal);
      }
    }
    const attachments: GatewayChatAttachment[] | undefined = result.attachments?.length
      ? result.attachments.map((a, i) => {
          const type = a.mimeType.startsWith("image/") ? "image" : a.mimeType.startsWith("video/") ? "video" : "file";
          return {
            id: `hermes-att-${Date.now()}-${i}`,
            type,
            mimeType: a.mimeType,
            name: a.filename,
            // Only embed base64 for image/video. File attachments are on the connector
            // machine already — storing them in React state causes multi-GB accumulation.
            ...(type !== "file" && a.data && { dataUrl: `data:${a.mimeType};base64,${a.data}` }),
          };
        })
      : undefined;
    if (!sawStreamDelta && !emittedFinalText && !attachments?.length) {
      onError(EMPTY_MODEL_RESPONSE_MESSAGE);
      return;
    }
    onDone(attachments);
  } catch (err: any) {
    onError(err?.message || "Hermes bridge request failed");
  } finally {
    if (typeof window !== "undefined") {
      window.removeEventListener("hermes-stream", handleHermesStream as EventListener);
    }
    signal.removeEventListener("abort", handleAbort);
  }
}

export { seedHermesSession, resetGatewayChatRuntimeStateForTests };

export function useGatewayChat(options: UseGatewayChatOptions = {}): UseGatewayChatReturn {
  const { sessionKey: initialSessionKey, autoConnect = true, backend = "openclaw", agentId, statusAgentId } = options;
  const initialResolvedSessionKey = initialSessionKey || "default";
  const initialTransientState = readTransientChatState(
    backend,
    initialResolvedSessionKey,
    agentId,
    statusAgentId,
  );

  // State
  const [messages, setMessages] = useState<GatewayChatMessage[]>(() => initialTransientState?.messages ?? []);
  const [isLoading, setIsLoading] = useState(() => initialTransientState?.isLoading ?? false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a REF to store the session key — callbacks always read the latest value
  // without needing to be recreated. A parallel state variable drives re-renders
  // for the returned sessionKey value.
  const sessionKeyRef = useRef<string>(initialResolvedSessionKey);
  const [sessionKeyState, setSessionKeyState] = useState<string>(initialResolvedSessionKey);

  // Sync ref + state when the prop changes (e.g. after async session resolution).
  // This must run before other effects so they read the correct key.
  const prevPropKeyRef = useRef<string>(initialResolvedSessionKey);

  // Track if we've already processed an event (for deduplication)
  const processedEventSeqRef = useRef<Set<string>>(new Set());

  // Read session key from ref — always current, no stale closures.
  const getSessionKey = useCallback(() => sessionKeyRef.current, []);
  const getTransportSessionKey = useCallback(
    () => getOpenClawTransportSessionKey(sessionKeyRef.current, backend, agentId, statusAgentId),
    [agentId, backend, statusAgentId]
  );

  // Only clear state when the session key actually changes (user action)
  const handleSessionChange = useCallback((newSessionKey: string) => {
    const oldKey = sessionKeyRef.current;
    if (oldKey !== newSessionKey) {
      const oldRunId = currentRunIdRef.current;
      if (oldRunId) {
        markAgentRunFinished(oldRunId);
      }
      const cached = readTransientChatState(backend, newSessionKey, agentId, statusAgentId);
      sessionKeyRef.current = newSessionKey;
      setSessionKeyState(newSessionKey);
      // Clear state for new session
      setMessages(cached?.messages ?? []);
      setIsLoading(cached?.isLoading ?? false);
      setError(null);
      clearRunIdOwnership(oldKey);
      currentRunIdRef.current = cached?.runId ?? null;
      currentStatusAgentIdRef.current = undefined;
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
  }, [agentId, backend, getTransportSessionKey, statusAgentId]);

  useEffect(() => {
    if (!initialSessionKey || initialSessionKey === prevPropKeyRef.current) return;
    prevPropKeyRef.current = initialSessionKey;
    handleSessionChange(initialSessionKey);
  }, [handleSessionChange, initialSessionKey]);

  // Refs
  const currentRunIdRef = useRef<string | null>(initialTransientState?.runId ?? null);
  const currentStatusAgentIdRef = useRef<string | undefined>(undefined);
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
  const latestBackendRef = useRef(backend);
  const latestAgentIdRef = useRef(agentId);
  const gatewayStartupRetryRef = useRef<number>(0);
  const gatewayStartupRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadChatHistoryRef = useRef<(() => Promise<void>) | null>(null);
  const loadChatHistoryInFlightRef = useRef<string | null>(null);
  const historyLoadInflightRef = useRef<Map<string, Promise<{ messages?: unknown[] }>>>(new Map());
  const clearedRunIdsRef = useRef<Set<string>>(new Set());
  const successfulFinalRunIdsRef = useRef<Set<string>>(new Set());
  latestBackendRef.current = backend;
  latestAgentIdRef.current = agentId;
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    writeTransientChatMessages(
      backend,
      sessionKeyState,
      messages,
      isLoading,
      currentRunIdRef.current,
      agentId,
      statusAgentId,
    );
  }, [agentId, backend, isLoading, messages, sessionKeyState, statusAgentId]);

  const clearGatewayStartupRetry = useCallback(() => {
    if (gatewayStartupRetryTimerRef.current) {
      clearTimeout(gatewayStartupRetryTimerRef.current);
      gatewayStartupRetryTimerRef.current = null;
    }
    gatewayStartupRetryRef.current = 0;
  }, []);

  const loadHistoryForBackend = useCallback(async (limit?: number): Promise<{ messages?: unknown[] }> => {
    const sessionKey = sessionKeyRef.current;
    const effectiveLimit = limit ?? INITIAL_HISTORY_LIMIT;
    const cacheKey = `${backend}:${agentId || ""}:${sessionKey}:${effectiveLimit}`;
    const inflight = historyLoadInflightRef.current.get(cacheKey);
    if (inflight) return inflight;

    const request = (async (): Promise<{ messages?: unknown[] }> => {
      if (backend === "openclaw") {
        return gatewayConnection.getChatHistory(getTransportSessionKey(), effectiveLimit);
      }

      const sessionId = getRuntimeHistorySessionId(backend, sessionKey);
      if (!sessionId) {
        return { messages: [] };
      }

      if (backend === "claude-code") {
        return await bridgeInvoke("claude-code-load-history", {
          sessionId,
          ...(agentId ? { agentId } : {}),
        }) as { messages?: unknown[] };
      }

      if (backend === "codex") {
        return await bridgeInvoke("codex-load-history", { sessionId }) as { messages?: unknown[] };
      }

      if (backend === "hermes") {
        return await bridgeInvoke("hermes-load-history", {
          sessionId,
          limit: effectiveLimit,
          ...(agentId ? { agentId } : {}),
        }) as { messages?: unknown[] };
      }

      return { messages: [] };
    })().finally(() => {
      historyLoadInflightRef.current.delete(cacheKey);
    });
    historyLoadInflightRef.current.set(cacheKey, request);
    return request;
  }, [agentId, backend, getTransportSessionKey]);

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
    if (backend === "openclaw") {
      gatewayConnection.invalidateChatHistoryCache(getTransportSessionKey());
    }
    loadHistoryForBackend(FINALIZE_HISTORY_LIMIT).then((response) => {
      if (!response.messages?.length) return;
      const loaded: GatewayChatMessage[] = [];
      for (const m of response.messages) {
        const norm = normalizeMessage(m, 0);
        if (norm) loaded.push(norm);
      }
      const deduped = filterMessagesAfterClear(
        deduplicateMessages(loaded),
        backend === "openclaw" ? null : readChatClearMarker(sessionKeyRef.current)
      );
      const lastHistoryMessage = deduped[deduped.length - 1];
      if (
        autoFinalize &&
        currentRunIdRef.current !== null &&
        lastHistoryMessage &&
        lastHistoryMessage.role === "user"
      ) {
        return;
      }
      // Merge history into state — even during streaming. The server stores tool
      // call messages with their text content (chain breaker data), so merging
      // mid-stream provides the interleaved text+tools view.
      setMessages((prev) => {
        if (
          autoFinalize &&
          currentRunIdRef.current !== null &&
          lastHistoryMessage?.role !== "assistant" &&
          deduped.length < prev.length
        ) {
          return prev;
        }
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
  }, [backend, getTransportSessionKey, loadHistoryForBackend]);

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
    if (payload.runId && clearedRunIdsRef.current.has(payload.runId)) {
      return;
    }
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
      const matchesCurrentSession = sessionKeysMatchForBackend(payload.sessionKey, sessionKeyRef.current, backend, agentId, statusAgentId);
      if (!matchesCurrentSession) {
        return;
      }
    } else if (currentRunIdRef.current !== null) {
      // Active conversation — check the runId registry to prevent cross-chat bleed.
      // If the event's runId is registered to a DIFFERENT session, reject it.
      // Unknown runIds (sub-agents) are claimed by the first instance to process
      // them — since JS is single-threaded, this prevents other instances from
      // also accepting events from the same sub-agent.
      if (payload.runId) {
        const ownerSession = runIdOwners.get(payload.runId);
        if (ownerSession && ownerSession !== sessionKeyRef.current) {
          return;
        }
        if (!ownerSession) {
          registerRunId(payload.runId, sessionKeyRef.current);
        }
      }
      // Adopt the first runId for text message association.
      if (!receivedEventRef.current && payload.runId) {
        // Replace client-side runId registration with the server-side runId.
        // Finish the optimistic client run so the status dot transfers cleanly
        // to the server run tracked by ensureSubscribed; without this the
        // clientRunId lingers in activeRuns for the full OPTIMISTIC_RUN_TTL_MS.
        const oldRunId = currentRunIdRef.current;
        if (oldRunId) {
          runIdOwners.delete(oldRunId);
          markAgentRunFinished(oldRunId);
        }
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
        setError(null);
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
            const contains_ = hasNormalizedContainment(text, existingContent);

            // If the new text extends or matches the existing content, this is
            // a normal streaming update for the same segment — update in place.
            if (extends_) {
              if (prev[ownIdx].content === text) return prev; // no change
              const updated = [...prev];
                updated[ownIdx] = { ...prev[ownIdx], content: text };
              return updated;
            }

            // Some streaming transports emit a later snapshot that is only a
            // suffix/subset of text we've already rendered. Treat that as the
            // same stream instead of appending a duplicate tail message.
            if (contains_) {
              const longer = text.length >= existingContent.length ? text : existingContent;
              if (prev[ownIdx].content === longer) return prev;
              const updated = [...prev];
              updated[ownIdx] = { ...prev[ownIdx], content: longer };
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
              if (
                text.startsWith(m.content) ||
                m.content.startsWith(text) ||
                m.content === text ||
                hasNormalizedContainment(text, m.content)
              ) {
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
        if (payload.runId) successfulFinalRunIdsRef.current.add(payload.runId);
        setError(null);
        setMessages((prev) => applyFinalAssistantText(prev, cleanFinalText, payload.runId));
      } else if (
        payload.runId &&
        payload.runId === currentRunIdRef.current &&
        !streamContentRef.current.trim() &&
        !currentTurnHasVisibleAssistantOutput(messagesRef.current)
      ) {
        const emptyRunId = currentRunIdRef.current;
        setError(EMPTY_MODEL_RESPONSE_MESSAGE);
        currentRunIdRef.current = null;
        if (emptyRunId) markAgentRunFinished(emptyRunId);
        setIsLoading(false);
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
      const errorMessage = payload.errorMessage || "Chat error";
      const hasSuccessfulFinal = !!payload.runId && successfulFinalRunIdsRef.current.has(payload.runId);
      const hasVisibleOutput = currentTurnHasVisibleAssistantOutput(messagesRef.current) || !!streamContentRef.current.trim();
      // Some OpenClaw runs emit a successful final message and then a late error
      // for the same runId. Do not let that stale terminal event erase visible text.
      if (hasSuccessfulFinal || hasVisibleOutput) {
        if (payload.runId && payload.runId === currentRunIdRef.current) {
          currentRunIdRef.current = null;
          markAgentRunFinished(payload.runId);
          setIsLoading(false);
        }
        return;
      }
      setError(errorMessage);
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
  }, [agentId, backend, getTransportSessionKey, mergeHistoryAndMaybeFinalize, startFinalizeDebounce, statusAgentId]);

  // Track current fetch limit and whether more history may exist.
  // Start with 100 so the user sees a meaningful history on first load.
  const historyTierRef = useRef(0); // index into HISTORY_TIERS
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Shared: fetch history and merge into current messages (used on connect + reconnect).
  // Loads the most recent N messages (default 10 — tier 0). If the returned count
  // equals the limit, there may be older messages — hasMoreHistory will be set to true.
  // Uses merge when there are existing messages (e.g. optimistic user messages from
  // sendMessage) to prevent them from being wiped by a concurrent history fetch.
  const fetchAndSetHistory = useCallback(async (limit?: number) => {
    const requestSessionKey = sessionKeyRef.current;
    const requestBackend = backend;
    const requestAgentId = agentId;
    if (backend === "openclaw" && !gatewayConnection.isConnected()) return;
    const fetchLimit = limit ?? HISTORY_TIERS[historyTierRef.current];
    try {
      const response = await loadHistoryForBackend(fetchLimit);
      if (
        sessionKeyRef.current !== requestSessionKey ||
        latestBackendRef.current !== requestBackend ||
        latestAgentIdRef.current !== requestAgentId
      ) {
        return;
      }
      const loaded: GatewayChatMessage[] = [];
      if (response.messages) {
        for (const msg of response.messages) {
          const normalized = normalizeMessage(msg, 0);
          if (normalized) loaded.push(normalized);
        }
      }
      // Only OpenClaw supports paginated history windows via chat.history.
      setHasMoreHistory(backend === "openclaw" && loaded.length >= fetchLimit && fetchLimit < 1000);
      const deduped = filterMessagesAfterClear(
        deduplicateMessages(loaded),
        backend === "openclaw" ? null : readChatClearMarker(requestSessionKey)
      );
      const lastHistoryMessage = deduped[deduped.length - 1];
      if (currentRunIdRef.current !== null && lastHistoryMessage?.role === "assistant") {
        const finishedRunId = currentRunIdRef.current;
        currentRunIdRef.current = null;
        markAgentRunFinished(finishedRunId);
        setIsLoading(false);
      }
      setMessages((prev) => {
        if (prev.length === 0) return deduped;
        // Merge to preserve optimistic/streaming messages not yet in history
        const merged = mergeHistoryIntoMessages(prev, deduped);
        return merged ?? prev;
      });
    } catch (err) {
      if (
        sessionKeyRef.current !== requestSessionKey ||
        latestBackendRef.current !== requestBackend ||
        latestAgentIdRef.current !== requestAgentId
      ) {
        return;
      }
      if (usesGatewayHealthProbe(backend) && isTransientGatewayStartupError(err)) {
        throw err;
      }
      console.error("[GatewayChat] Failed to load history:", err);
      throw err; // propagate so loadChatHistory can set the error state
    }
  }, [agentId, backend, loadHistoryForBackend]);

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
        const reconnectLoadKey = `${backend}:${agentId || ""}:${sessionKeyRef.current}`;
        if (currentRunIdRef.current === null && loadChatHistoryInFlightRef.current !== reconnectLoadKey) {
          // Belt-and-suspenders: clear any stale banner immediately on reconnect.
          // If the relay is still unhealthy, a fresh error will replace it. The
          // old banner was almost certainly from a prior disconnect window, and
          // waiting for the probe to resolve leaves it visible for 1-8s.
          setError(null);
          clearGatewayStartupRetry();
          if (usesGatewayHealthProbe(backend)) {
            probeGatewayHealth().then((probe) => {
              if (probe.healthy && currentRunIdRef.current === null) {
                fetchAndSetHistory().catch(() => {});
              }
            });
          } else {
            fetchAndSetHistory().catch(() => {});
          }
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
        const reconnectLoadKey = `${backend}:${agentId || ""}:${sessionKeyRef.current}`;
        if (currentRunIdRef.current === null && loadChatHistoryInFlightRef.current !== reconnectLoadKey) {
          // Same belt-and-suspenders: clear stale banners immediately.
          setError(null);
          clearGatewayStartupRetry();
          if (usesGatewayHealthProbe(backend)) {
            probeGatewayHealth().then((probe) => {
              if (probe.healthy && currentRunIdRef.current === null) {
                fetchAndSetHistory().catch(() => {});
              }
            });
          } else {
            fetchAndSetHistory().catch(() => {});
          }
        }
      }
    }

    return () => {
      unsubscribe();
    };
  }, [agentId, backend, clearGatewayStartupRetry, fetchAndSetHistory]);

  // Self-heal transient "gateway not connected" / "not reachable" banners.
  // The underlying connector may flip to healthy moments after the banner
  // appeared, but nothing re-probes — so the user was forced to hit Retry.
  // Poll every 3s while a transient error is showing; clear on success.
  useEffect(() => {
    if (!error) return;
    if (!usesGatewayHealthProbe(backend)) return;
    const msg = error.toLowerCase();
    // Broad match: any connectivity / reachability / timeout / probe-related
    // phrasing counts as transient. Keeps the self-heal engaged for variants
    // like "Gateway not reachable", "Request timed out", "Probe failed", etc.
    const isTransient =
      msg.includes("gateway") ||
      msg.includes("reach") ||
      msg.includes("time") ||
      msg.includes("connect") ||
      msg.includes("probe") ||
      msg.includes("history");
    if (!isTransient) return;

    let cancelled = false;
    const runProbe = async () => {
      if (cancelled) return;
      if (!gatewayConnection.isConnected()) {
        const connector = await probeConnectorHealth(1000);
        if (cancelled) return;
        if (connector.healthy) {
          setError(null);
          clearGatewayStartupRetry();
        }
        return;
      }
      const probe = await probeGatewayHealth(8000);
      if (cancelled) return;
      if (probe.healthy) {
        setError(null);
        clearGatewayStartupRetry();
        if (currentRunIdRef.current === null) {
          fetchAndSetHistory().catch(() => {});
        }
      }
    };
    // Fire the first probe immediately so the banner doesn't linger for 3s
    // before the first heal attempt.
    runProbe();
    const interval = setInterval(runProbe, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [error, backend, clearGatewayStartupRetry, fetchAndSetHistory]);

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
      if (gatewayStartupRetryTimerRef.current) {
        clearTimeout(gatewayStartupRetryTimerRef.current);
        gatewayStartupRetryTimerRef.current = null;
      }
      if (latestBackendRef.current === "openclaw" && currentRunIdRef.current) {
        markAgentRunFinished(currentRunIdRef.current);
        currentRunIdRef.current = null;
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
        const connector = await probeConnectorHealth(1000);
        if (connector.healthy || backend === "openclaw") {
          setError(null);
          // Connector is reachable — attempt direct WS to the default local gateway.
          // getGatewayConfig() returned no URL (bridge-mode detection edge case),
          // but the gateway runs alongside the connector on :18789 in local mode.
          // If the connector health probe is in a transient backoff, the WS itself
          // is the authoritative readiness check and will report a concrete error.
          connectGatewayWs("http://127.0.0.1:18789", { hubMode: false });
          return;
        }
        setError(getGatewayUnavailableMessage());
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
  }, [backend, getTransportSessionKey]);

  // Disconnect — do NOT kill the singleton WS, just unsubscribe from state.
  // The singleton is shared with useOpenClaw and other consumers.
  const disconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  // Load chat history
  // Guard isLoading so a history reload during active streaming doesn't kill the
  // "AI is generating" state (currentRunIdRef.current !== null while streaming).
  const loadChatHistory = useCallback(async () => {
    const loadKey = `${backend}:${agentId || ""}:${sessionKeyRef.current}`;
    if (loadChatHistoryInFlightRef.current === loadKey) return;
    loadChatHistoryInFlightRef.current = loadKey;
    try {
    if (backend === "hermes") {
      // Load hermes history via hub/connector relay
      const key = sessionKeyRef.current;
      const requestAgentId = agentId;
      const hermesSessionId = await resolveHermesSessionId(key, agentId);
      const isCurrentHermesRequest = () =>
        sessionKeyRef.current === key &&
        latestBackendRef.current === "hermes" &&
        latestAgentIdRef.current === requestAgentId;
      if (!isCurrentHermesRequest()) return;
      if (hermesSessionId && hermesSessionId !== "main" && hermesSessionId !== "default") {
        try {
          const parsed = await loadHermesHistoryMessages(hermesSessionId, agentId);
          if (!isCurrentHermesRequest()) return;
          const visible = filterMessagesAfterClear(
            parsed,
            readChatClearMarker(key)
          );
          if (visible.length > 0) {
            hermesSessionState.set(key, {
              sessionId: hermesSessionId,
              conversation: key,
            });
            setMessages(visible);
            return;
          }
        } catch { /* fall through to localStorage */ }
      }
      // Fallback: localStorage
      try {
        const stored = localStorage.getItem(`hermes-chat:${key}`);
        if (!isCurrentHermesRequest()) return;
        if (stored) {
          const parsed = JSON.parse(stored) as GatewayChatMessage[];
          setMessages(filterMessagesAfterClear(parsed, readChatClearMarker(key)));
        }
      } catch { /* ignore parse errors */ }
      return;
    }
    if (currentRunIdRef.current === null) setIsLoading(true);
    setError(null);
    const scheduleGatewayStartupRetry = () => {
      if (gatewayStartupRetryRef.current >= 5) return false;
      if (gatewayStartupRetryTimerRef.current) return true;

      gatewayStartupRetryRef.current += 1;
      const delay = Math.min(2000 * gatewayStartupRetryRef.current, 8000);
      gatewayStartupRetryTimerRef.current = setTimeout(() => {
        gatewayStartupRetryTimerRef.current = null;
        void loadChatHistoryRef.current?.();
      }, delay);
      return true;
    };

    try {
      // For OpenClaw, probe gateway health first to avoid a 60s timeout on a
      // dead relay chain (dashboard → hub → connector → gateway). The probe
      // uses a shorter 12s timeout with one retry and fails fast.
      // If the WS isn't connected yet (initial mount race), skip silently —
      // the reconnect subscription handler will load history when WS is ready.
      if (usesGatewayHealthProbe(backend)) {
        if (!gatewayConnection.isConnected()) {
          // Not connected yet — don't error, just stop loading.
          // The subscription at line ~1386 handles post-connect loading.
          if (currentRunIdRef.current === null) setIsLoading(false);
          return;
        }
        const probe = await probeGatewayHealth();
        if (!probe.healthy) {
          // Startup/cooldown states are expected while the connector is still
          // bringing up the local OpenClaw WS. Defer quietly instead of showing
          // a red history-load error or stacking duplicate retry timers.
          if (isTransientGatewayStartupError(probe.error)) {
            if (scheduleGatewayStartupRetry()) {
              return;
            }
            setError(getGatewayStartupErrorMessage(probe.error));
            return;
          }
          throw new Error(probe.error || "Gateway not reachable");
        }
        // Gateway healthy — reset startup retry counter.
        clearGatewayStartupRetry();
      }
      await fetchAndSetHistory();
    } catch (err) {
      if (usesGatewayHealthProbe(backend) && isTransientGatewayStartupError(err)) {
        if (scheduleGatewayStartupRetry()) {
          return;
        }
        setError(getGatewayStartupErrorMessage(err));
        return;
      }
      console.error("[GatewayChat] loadChatHistory error:", err);
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      if (currentRunIdRef.current === null) setIsLoading(false);
    }
    } finally {
      if (loadChatHistoryInFlightRef.current === loadKey) {
        loadChatHistoryInFlightRef.current = null;
      }
    }
  }, [agentId, backend, clearGatewayStartupRetry, fetchAndSetHistory]);
  loadChatHistoryRef.current = loadChatHistory;

  // Backend-change reset: when the consumer flips `backend` (e.g. Hermes ↔ OpenClaw
  // on the same agent/session in AgentChatPanel), clear messages and reload history
  // so stale bubbles from the previous runtime don't bleed into the new tab.
  const prevBackendRef = useRef(backend);
  useEffect(() => {
    if (prevBackendRef.current === backend) return;
    prevBackendRef.current = backend;
    clearGatewayStartupRetry();
    setMessages([]);
    setError(null);
    streamContentRef.current = "";
    currentRunIdRef.current = null;
    currentStatusAgentIdRef.current = undefined;
    processedEventSeqRef.current.clear();
    void loadChatHistory();
  }, [backend, clearGatewayStartupRetry, loadChatHistory]);

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

    // Pending-send guard: if a run is already in flight for this hook, drop the
    // second submission. Prevents double-appending the user bubble when Enter
    // and click fire together, or when the input isn't disabled fast enough.
    if (currentRunIdRef.current !== null) {
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

    // Optimistically add user message. The transient-cache effect persists this
    // after render so /Tool/Chat can switch agents before history is committed.
    setMessages((prev) => [...prev, userMessage]);

    // Generate runId for this conversation
    const runId = uuidv4();
    const resolvedStatusAgentId = statusAgentId || agentId || extractAgentIdFromSessionKey(sessionKeyRef.current);

    setIsLoading(true);
    setError(null);

    currentRunIdRef.current = runId;
    currentStatusAgentIdRef.current = backend === "hermes" ? resolvedStatusAgentId : undefined;
    registerRunId(runId, sessionKeyRef.current);
    markAgentRunStarted(runId, resolvedStatusAgentId);
    streamContentRef.current = "";

    if (backend === "hermes") {
      const runSessionKey = sessionKeyRef.current;
      const runAgentId = agentId;
      let hermesStreamContent = "";

      const isCurrentHermesRun = () =>
        latestBackendRef.current === "hermes" &&
        latestAgentIdRef.current === runAgentId &&
        sessionKeyRef.current === runSessionKey &&
        currentRunIdRef.current === runId;

      // Build conversation history for Hermes (stateless API needs full history)
      // Include the just-added user message since setMessages hasn't flushed yet
      const hermesMessages = [...messagesRef.current, userMessage]
        .filter(m => m.role === "user" || (m.role === "assistant" && m.content.trim()))
        .map(m => ({ role: m.role, content: m.content }));

      const hermesController = new AbortController();
      hermesAbortRef.current = hermesController;
      let historyPollTimer: ReturnType<typeof setInterval> | null = null;
      let historyPollInFlight = false;
      let hermesRunMessages = [...messagesRef.current, userMessage];

      const finishHermesRun = () => {
        const isCurrentRun = isCurrentHermesRun();
        if (currentRunIdRef.current === runId) {
          currentRunIdRef.current = null;
        }
        markAgentRunFinished(runId);
        // Hermes uses an optimistic sidebar status because its stream arrives as
        // runtime-specific DOM events, not gateway chat lifecycle events. Clear
        // any stale optimistic runs for this visual agent when the request settles.
        markAgentRunsFinishedForAgent(resolvedStatusAgentId);
        if (isCurrentRun) {
          setIsLoading(false);
          currentStatusAgentIdRef.current = undefined;
        }
        if (hermesAbortRef.current === hermesController) {
          hermesAbortRef.current = null;
        }
      };

      const stopHermesHistoryPolling = () => {
        if (historyPollTimer) {
          clearInterval(historyPollTimer);
          historyPollTimer = null;
        }
      };

      const startHermesHistoryPolling = (sessionId: string) => {
        if (!sessionId || historyPollTimer) return;
        const poll = async () => {
          if (historyPollInFlight) return;
          historyPollInFlight = true;
          try {
            const historyMessages = await loadHermesHistoryMessages(sessionId, runAgentId, HERMES_POLL_HISTORY_LIMIT);
            if (historyMessages.length === 0) return;
            const mergedRunMessages = mergeHistoryIntoMessages(hermesRunMessages, historyMessages);
            if (mergedRunMessages) {
              hermesRunMessages = mergedRunMessages;
              persistHermesMessagesNow(hermesRunMessages);
            }
            if (isCurrentHermesRun()) {
              setMessages(prev => {
                const merged = mergeHistoryIntoMessages(prev, historyMessages);
                const next = merged ?? prev;
                hermesRunMessages = next;
                persistHermesMessagesNow(next);
                return next;
              });
            }
          } catch {
            // Ignore transient polling failures during active streaming.
          } finally {
            historyPollInFlight = false;
          }
        };
        void poll();
        historyPollTimer = setInterval(() => { void poll(); }, HERMES_POLL_INTERVAL_MS);
      };

      const assistantMsgId = uuidv4();

      const upsertHermesAssistantMessage = (
        prev: GatewayChatMessage[],
        updater: (existing?: GatewayChatMessage) => GatewayChatMessage,
      ): GatewayChatMessage[] => {
        const existingIdx = prev.findIndex((m) => m.id === assistantMsgId);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = updater(next[existingIdx]);
          return next;
        }
        return [...prev, updater()];
      };

      // Persist the messages array to localStorage immediately so partial
      // turns survive timeouts, aborts, agent switches, and reloads. The
      // SQLite-backed Hermes history only saves on a successful run
      // completion, so without this fallback the user's question disappears
      // the moment they switch agents while a turn is still mid-flight.
      const persistHermesMessagesNow = (messages: GatewayChatMessage[]) => {
        if (typeof window === "undefined") return;
        try {
          localStorage.setItem(
            `hermes-chat:${runSessionKey}`,
            JSON.stringify(messages)
          );
        } catch {
          // Storage quota or serialization issues — non-fatal.
        }
      };

      // Persist the optimistic user message right away so the question stays
      // visible even if the agent switches before any assistant content arrives.
      // messagesRef lags one render behind setMessages, so include userMessage
      // explicitly here to capture the just-added optimistic entry.
      persistHermesMessagesNow(hermesRunMessages);

      try {
        await sendMessageViaHermes(
          hermesMessages,
          hermesController.signal,
          (delta) => {
            hermesStreamContent += delta;
            if (isCurrentHermesRun()) {
              streamContentRef.current = hermesStreamContent;
            }
            hermesRunMessages = upsertHermesAssistantMessage(hermesRunMessages, (existing) => ({
              id: assistantMsgId,
              role: "assistant" as ChatMessageRole,
              content: hermesStreamContent,
              timestamp: existing?.timestamp || Date.now(),
              ...(existing?.attachments ? { attachments: existing.attachments } : {}),
            }));
            persistHermesMessagesNow(hermesRunMessages);
            if (isCurrentHermesRun()) {
              setMessages(prev => {
                const next = upsertHermesAssistantMessage(prev, (existing) => ({
                  id: assistantMsgId,
                  role: "assistant" as ChatMessageRole,
                  content: hermesStreamContent,
                  timestamp: existing?.timestamp || Date.now(),
                  ...(existing?.attachments ? { attachments: existing.attachments } : {}),
                }));
                hermesRunMessages = next;
                persistHermesMessagesNow(next);
                return next;
              });
            }
          },
          (finalText) => {
            hermesStreamContent = finalText;
            if (isCurrentHermesRun()) {
              streamContentRef.current = finalText;
            }
            hermesRunMessages = upsertHermesAssistantMessage(hermesRunMessages, (existing) => ({
              id: assistantMsgId,
              role: "assistant" as ChatMessageRole,
              content: finalText,
              timestamp: existing?.timestamp || Date.now(),
              ...(existing?.attachments ? { attachments: existing.attachments } : {}),
            }));
            persistHermesMessagesNow(hermesRunMessages);
            if (isCurrentHermesRun()) {
              setMessages(prev => {
                const next = upsertHermesAssistantMessage(prev, (existing) => ({
                  id: assistantMsgId,
                  role: "assistant" as ChatMessageRole,
                  content: finalText,
                  timestamp: existing?.timestamp || Date.now(),
                  ...(existing?.attachments ? { attachments: existing.attachments } : {}),
                }));
                hermesRunMessages = next;
                persistHermesMessagesNow(next);
                return next;
              });
            }
          },
          (attachments) => {
            stopHermesHistoryPolling();
            if (attachments?.length) {
              hermesRunMessages = upsertHermesAssistantMessage(hermesRunMessages, (existing) => ({
                id: assistantMsgId,
                role: "assistant" as ChatMessageRole,
                content: existing?.content || hermesStreamContent,
                timestamp: existing?.timestamp || Date.now(),
                attachments,
              }));
              persistHermesMessagesNow(hermesRunMessages);
            }
            if (isCurrentHermesRun()) {
              setMessages(prev => {
                const updated = attachments?.length
                  ? upsertHermesAssistantMessage(prev, (existing) => ({
                      id: assistantMsgId,
                      role: "assistant" as ChatMessageRole,
                      content: existing?.content || hermesStreamContent,
                      timestamp: existing?.timestamp || Date.now(),
                      attachments,
                    }))
                  : prev;
                hermesRunMessages = updated;
                persistHermesMessagesNow(updated);
                return updated;
              });
            }
            const state = hermesSessionState.get(runSessionKey);
            if (state?.sessionId) {
              void loadHermesHistoryMessages(state.sessionId, runAgentId)
                .then((historyMessages) => {
                  if (historyMessages.length === 0) return;
                  const mergedRunMessages = mergeHistoryIntoMessages(hermesRunMessages, historyMessages);
                  if (mergedRunMessages) {
                    hermesRunMessages = mergedRunMessages;
                    persistHermesMessagesNow(hermesRunMessages);
                  }
                  if (isCurrentHermesRun()) {
                    setMessages(prev => {
                      const next = mergeHistoryIntoMessages(prev, historyMessages) ?? prev;
                      hermesRunMessages = next;
                      persistHermesMessagesNow(next);
                      return next;
                    });
                  }
                })
                .catch(() => {});
            }
            finishHermesRun();
          },
          (error) => {
            stopHermesHistoryPolling();
            const shouldPersistError = error !== EMPTY_MODEL_RESPONSE_MESSAGE;
            if (shouldPersistError) {
              hermesRunMessages = upsertHermesAssistantMessage(hermesRunMessages, (existing) => ({
                id: assistantMsgId,
                role: "assistant" as ChatMessageRole,
                content: `Error: ${error}`,
                timestamp: existing?.timestamp || Date.now(),
                ...(existing?.attachments ? { attachments: existing.attachments } : {}),
              }));
              persistHermesMessagesNow(hermesRunMessages);
            }
            if (isCurrentHermesRun()) {
              setError(error);
              if (shouldPersistError) {
                setMessages(prev => {
                  const next = upsertHermesAssistantMessage(prev, (existing) => ({
                    id: assistantMsgId,
                    role: "assistant" as ChatMessageRole,
                    content: `Error: ${error}`,
                    timestamp: existing?.timestamp || Date.now(),
                    ...(existing?.attachments ? { attachments: existing.attachments } : {}),
                  }));
                  hermesRunMessages = next;
                  persistHermesMessagesNow(next);
                  return next;
                });
              }
            }
            finishHermesRun();
          },
          runSessionKey,
          runAgentId,
          (sessionId) => {
            startHermesHistoryPolling(sessionId);
          },
        );
      } catch (err) {
        stopHermesHistoryPolling();
        if ((err as Error).name !== "AbortError") {
          const msg = err instanceof Error ? err.message : "Failed to send";
          const shouldPersistError = msg !== EMPTY_MODEL_RESPONSE_MESSAGE;
          if (shouldPersistError) {
            hermesRunMessages = upsertHermesAssistantMessage(hermesRunMessages, (existing) => ({
              id: assistantMsgId,
              role: "assistant" as ChatMessageRole,
              content: `Error: ${msg}`,
              timestamp: existing?.timestamp || Date.now(),
              ...(existing?.attachments ? { attachments: existing.attachments } : {}),
            }));
            persistHermesMessagesNow(hermesRunMessages);
          }
          if (isCurrentHermesRun()) {
            setError(msg);
            if (shouldPersistError) {
              setMessages(prev => {
                const next = upsertHermesAssistantMessage(prev, (existing) => ({
                  id: assistantMsgId,
                  role: "assistant" as ChatMessageRole,
                  content: `Error: ${msg}`,
                  timestamp: existing?.timestamp || Date.now(),
                  ...(existing?.attachments ? { attachments: existing.attachments } : {}),
                }));
                hermesRunMessages = next;
                persistHermesMessagesNow(next);
                return next;
              });
            }
          }
        }
        finishHermesRun();
      }
      return;
    }

    // --- Existing OpenClaw WebSocket path ---

    if (!gatewayConnection.isConnected()) {
      try {
        const config = await getGatewayConfig();
        if (!config.gatewayUrl) {
          const connector = await probeConnectorHealth(1000);
          if (!connector.healthy) {
            setError(getGatewayUnavailableMessage());
            setIsLoading(false);
            currentRunIdRef.current = null;
            markAgentRunFinished(runId);
            return;
          }
          setError(null);
          // Connector is reachable — fall through to WS connect on default local gateway.
          // Assigns config.gatewayUrl equivalent so the block below runs.
          connectGatewayWs("http://127.0.0.1:18789", { hubMode: false });
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { unsub(); reject(new Error("Connection timeout")); }, 5000);
            const unsub = subscribeGatewayConnection(() => {
              const s = getGatewayConnectionState();
              if (s.connected) { clearTimeout(timeout); unsub(); resolve(); }
              else if (s.error) { clearTimeout(timeout); unsub(); reject(new Error(s.error)); }
            });
            if (gatewayConnection.isConnected()) { clearTimeout(timeout); unsub(); resolve(); }
          });
        } else {
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
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auto-connect failed");
        currentRunIdRef.current = null;
        markAgentRunFinished(runId);
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
      const timedOutRunId = currentRunIdRef.current;
      currentRunIdRef.current = null;
      if (timedOutRunId) markAgentRunFinished(timedOutRunId);
      setIsLoading(false);
      mergeHistoryAndMaybeFinalize(false);
    }, 300_000);

    receivedEventRef.current = false;

    // No-response check: if no visible chat events arrive within 15s after send,
    // check history. Do not mark the run empty here: OpenClaw can spend >15s in
    // thinking/tool execution before the first visible assistant token arrives.
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
        content: att.dataUrl ? (att.dataUrl.split(",")[1] || att.dataUrl) : "", // Remove data: prefix
      }));
      const transportSessionKey = getTransportSessionKey();

      await gatewayConnection.sendChatMessage({
        sessionKey: transportSessionKey,
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
      markAgentRunFinished(runId);
      setIsLoading(false);
    }
  }, [agentId, backend, getSessionKey, getTransportSessionKey, mergeHistoryAndMaybeFinalize, statusAgentId]);

  // Stop generation
  const stopGeneration = useCallback(async () => {
    if (backend === "hermes" && hermesAbortRef.current) {
      const runIdToAbort = currentRunIdRef.current;
      const statusAgentIdToAbort = currentStatusAgentIdRef.current;
      hermesAbortRef.current.abort();
      hermesAbortRef.current = null;
      currentRunIdRef.current = null;
      currentStatusAgentIdRef.current = undefined;
      if (runIdToAbort) markAgentRunFinished(runIdToAbort);
      markAgentRunsFinishedForAgent(statusAgentIdToAbort);
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
    if (runIdToAbort) markAgentRunFinished(runIdToAbort);
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
    const key = sessionKeyRef.current;
    const hermesSessionIdToClear = backend === "hermes"
      ? hermesSessionState.get(key)?.sessionId
        || readStoredHermesSessionId(key, agentId)
        || getHermesHistorySessionId(key)
      : null;
    const runIdToClear = currentRunIdRef.current;
    if (runIdToClear) {
      clearedRunIdsRef.current.add(runIdToClear);
      if (clearedRunIdsRef.current.size > RUN_ID_OWNERS_CAP) {
        const oldest = clearedRunIdsRef.current.values().next().value;
        if (oldest) clearedRunIdsRef.current.delete(oldest);
      }
      markAgentRunFinished(runIdToClear);
    }
    if (backend !== "openclaw") {
      writeChatClearMarker(key);
      if (hermesSessionIdToClear) {
        writeChatClearMarker(`hermes:${hermesSessionIdToClear}`);
      }
    }
    if (backend === "hermes") {
      hermesAbortRef.current?.abort();
      hermesAbortRef.current = null;
      localStorage.removeItem(`hermes-chat:${key}`);
      localStorage.removeItem(getHermesSessionStorageKey(key));
      if (isDefaultHermesChatSessionKey(key)) {
        localStorage.removeItem(getHermesAgentSessionStorageKey(agentId));
      }
      hermesSessionState.delete(key);
    } else if (backend === "openclaw") {
      gatewayConnection.invalidateChatHistoryCache(getTransportSessionKey());
      if (gatewayConnection.isConnected() && runIdToClear) {
        gatewayConnection
          .abortChat({ sessionKey: getTransportSessionKey(), runId: runIdToClear })
          .catch(() => {});
      }
    }
    setMessages([]);
    clearTransientChatMessages(backend, key, agentId, statusAgentId);
    setError(null);
    setIsLoading(false);
    streamContentRef.current = "";
    loadChatHistoryInFlightRef.current = null;
    clearRunIdOwnership(key);
    currentRunIdRef.current = null;
    currentStatusAgentIdRef.current = undefined;
    if (finalDebounceRef.current) {
      clearTimeout(finalDebounceRef.current);
      finalDebounceRef.current = null;
    }
    if (noResponseRef.current) {
      clearTimeout(noResponseRef.current);
      noResponseRef.current = null;
    }
  }, [agentId, backend, getTransportSessionKey, statusAgentId]);

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
