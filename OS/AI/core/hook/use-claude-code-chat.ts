"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { getActiveSkillsContent } from "$/components/Home/widgets/AgentSkillsTab";
import {
  extractAgentIdFromSessionKey,
  markAgentRunFinished,
  markAgentRunStarted,
} from "$/components/ensemble/hooks/useAgentStreamingState";
import type {
  GatewayChatMessage,
  GatewayChatAttachment,
  UseGatewayChatReturn,
  ChatMessageRole,
} from "./use-gateway-chat";
import { mergeRuntimeResponseMessages } from "./runtime-chat-dedupe";
import {
  filterMessagesAfterClear,
  readChatClearMarker,
  writeChatClearMarker,
} from "./chat-clear-boundary";

/**
 * useClaudeCodeChat — drop-in replacement for useGatewayChat that routes
 * messages through the Hub → Connector relay to the Claude Code CLI.
 *
 * Streaming: The connector sends partial JSONL events as hub "event" messages
 * with type "claude-code-stream". This hook listens for those events on the
 * gateway WebSocket to render streaming text in real-time.
 *
 * Returns the same UseGatewayChatReturn interface so the GatewayChat UI
 * component can use either hook transparently.
 */

export interface UseClaudeCodeChatOptions {
  sessionKey?: string;
  autoConnect?: boolean;
  defaultModel?: string;
  agentId?: string;
  /** If set, new Claude Code sessions are spawned with this directory as cwd */
  projectPath?: string;
}

// Map HyperClaw session keys → Claude Code session IDs for resume
const SESSION_MAP_STORAGE_KEY = "claude-code-session-id-map";

function hydrateSessionIdMap(): Map<string, string> {
  try {
    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(SESSION_MAP_STORAGE_KEY)
        : null;
    return raw ? new Map(JSON.parse(raw)) : new Map();
  } catch {
    return new Map();
  }
}

function persistSessionIdMap(map: Map<string, string>): void {
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        SESSION_MAP_STORAGE_KEY,
        JSON.stringify([...map])
      );
    }
  } catch {
    /* storage full or unavailable */
  }
}

const sessionIdMap = hydrateSessionIdMap();

export function useClaudeCodeChat(
  options: UseClaudeCodeChatOptions = {}
): UseGatewayChatReturn {
  const { sessionKey: initialSessionKey, defaultModel, agentId, projectPath } = options;
  const projectPathRef = useRef(projectPath);
  useEffect(() => { projectPathRef.current = projectPath; }, [projectPath]);
  const agentIdRef = useRef(agentId);
  useEffect(() => { agentIdRef.current = agentId; }, [agentId]);

  const [messages, setMessages] = useState<GatewayChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(defaultModel || "");
  const modelRef = useRef<string>(defaultModel || "");

  const sessionKeyRef = useRef<string>(initialSessionKey || "default");
  const [sessionKeyState, setSessionKeyState] = useState<string>(
    initialSessionKey || "default"
  );
  // Track every session ID this hook instance has watched so we can clean them all up on unmount.
  const watchedSessionIdsRef = useRef<Set<string>>(new Set());

  // Sync session key from prop
  const prevPropKeyRef = useRef<string>(initialSessionKey || "default");
  if (initialSessionKey && initialSessionKey !== prevPropKeyRef.current) {
    prevPropKeyRef.current = initialSessionKey;
    if (initialSessionKey !== sessionKeyRef.current) {
      sessionKeyRef.current = initialSessionKey;
      setSessionKeyState(initialSessionKey);
      setMessages([]);
      setIsLoading(false);
      setError(null);
    }
  }

  const handleSetModel = useCallback((m: string) => {
    modelRef.current = m;
    setModel(m);
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const isLoadingRef = useRef(false);
  // Keep ref in sync with state for use in event listeners (avoid stale closures)
  isLoadingRef.current = isLoading;

  // Tracks whether this hook owns an in-flight request. Connector stream events
  // carry the hub relay request id, not a client-generated id, so sessionKey is
  // the stable correlation key for runtime streaming.
  const activeRequestIdRef = useRef<string | null>(null);

  // Listen for streaming events from the gateway WebSocket
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStreamEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      const { sessionKey: evtSessionKey, event } = detail;

      // Only process events for our active session. Runtime stream events without
      // a sessionKey cannot be correlated safely across multiple open hooks.
      if (!evtSessionKey || evtSessionKey !== sessionKeyRef.current) return;

      // Only process while we're actively loading (waiting for response)
      if (!isLoadingRef.current) return;

      if (!event) return;
      const eventType = event.type as string;

      // Handle assistant text streaming (complete message snapshots)
      if (eventType === "assistant") {
        const msg = event.message as Record<string, unknown> | undefined;
        if (!msg) return;
        const contentBlocks = msg.content as Array<Record<string, unknown>> | undefined;
        if (!contentBlocks) return;

        let textContent = "";
        let thinking = "";

        for (const block of contentBlocks) {
          const blockType = block.type as string;
          if (blockType === "text") {
            textContent += (block.text as string) || "";
          } else if (blockType === "thinking") {
            thinking = (block.thinking as string) || "";
          }
        }

        if (textContent.trim() || thinking.trim()) {
          setMessages((prev) => {
            const streamId = `stream-active`;
            const existingIdx = prev.findIndex((m) => m.id === streamId);
            if (existingIdx !== -1) {
              const updated = [...prev];
              updated[existingIdx] = {
                ...updated[existingIdx],
                content: textContent,
                ...(thinking && { thinking }),
              };
              return updated;
            }
            return [
              ...prev,
              {
                id: streamId,
                role: "assistant" as ChatMessageRole,
                content: textContent,
                timestamp: Date.now(),
                ...(thinking && { thinking }),
              },
            ];
          });
        }
      }

      // Handle incremental streaming deltas (from --include-partial-messages)
      if (eventType === "stream_event") {
        const inner = event.event as Record<string, unknown> | undefined;
        if (!inner) return;
        const innerType = inner.type as string;

        if (innerType === "content_block_delta") {
          const delta = inner.delta as Record<string, unknown> | undefined;
          if (!delta) return;
          const deltaType = delta.type as string;

          if (deltaType === "text_delta") {
            const text = (delta.text as string) || "";
            if (!text) return;
            setMessages((prev) => {
              const streamId = `stream-active`;
              const existingIdx = prev.findIndex((m) => m.id === streamId);
              if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  content: (updated[existingIdx].content || "") + text,
                };
                return updated;
              }
              return [
                ...prev,
                {
                  id: streamId,
                  role: "assistant" as ChatMessageRole,
                  content: text,
                  timestamp: Date.now(),
                },
              ];
            });
          } else if (deltaType === "thinking_delta") {
            const thinking = (delta.thinking as string) || "";
            if (!thinking) return;
            setMessages((prev) => {
              const streamId = `stream-active`;
              const existingIdx = prev.findIndex((m) => m.id === streamId);
              if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  thinking: (updated[existingIdx].thinking || "") + thinking,
                };
                return updated;
              }
              return [
                ...prev,
                {
                  id: streamId,
                  role: "assistant" as ChatMessageRole,
                  content: "",
                  timestamp: Date.now(),
                  thinking,
                },
              ];
            });
          }
        }
      }
    };

    window.addEventListener("claude-code-stream", handleStreamEvent);
    return () => {
      window.removeEventListener("claude-code-stream", handleStreamEvent);
    };
  }, []);

  // Listen for session file updates (two-way relay from interactive terminal)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSessionUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      const { sessionKey: evtSessionKey, message } = detail as {
        sessionId?: string;
        sessionKey?: string;
        message?: {
          id: string;
          role: string;
          content: string;
          timestamp: number;
          thinking?: string;
          toolCalls?: GatewayChatMessage["toolCalls"];
        };
      };

      // Only process updates for our current session
      if (evtSessionKey && evtSessionKey !== sessionKeyRef.current) return;
      if (!message || !message.id) return;
      const clearedAt = readChatClearMarker(evtSessionKey || sessionKeyRef.current);
      if (clearedAt && (message.timestamp || 0) <= clearedAt) return;

      // Skip while sending — the send flow (streaming events + final response)
      // handles everything. The file watcher is only for terminal → dashboard sync.
      if (isLoadingRef.current) return;

      // Add the message if we don't already have it.
      // Dedup by ID AND by content+role (the locally-added user message has
      // a different ID than the JSONL uuid, so also check content match).
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        // Content-based dedup for user messages (local add vs file watcher)
        if (
          message.role === "user" &&
          prev.some(
            (m) =>
              m.role === "user" &&
              m.content.trim() === (message.content || "").trim() &&
              Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 30000
          )
        ) {
          return prev;
        }
        // Skip toolResult messages from file watcher (they're grouped into tool calls)
        if (message.role === "toolResult" || message.role === "tool_result") {
          return prev;
        }
        return [
          ...prev,
          {
            id: message.id,
            role: message.role as ChatMessageRole,
            content: message.content || "",
            timestamp: message.timestamp || Date.now(),
            ...(message.thinking && { thinking: message.thinking }),
            ...(message.toolCalls && { toolCalls: message.toolCalls }),
          },
        ];
      });
    };

    window.addEventListener("claude-code-session-update", handleSessionUpdate);
    return () => {
      window.removeEventListener("claude-code-session-update", handleSessionUpdate);
    };
  }, []);

  // Check if Claude Code is reachable via hub/connector relay
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsConnected(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = (await bridgeInvoke("claude-code-status", {})) as {
          available?: boolean;
          error?: string;
        };
        if (cancelled) return;
        setIsConnected(result?.available ?? false);
        if (!result?.available && result?.error) {
          setError(result.error);
        }
      } catch {
        if (!cancelled) {
          // Connector might not support status yet — try session list as fallback
          try {
            await bridgeInvoke("claude-code-list-sessions", { limit: 1 });
            if (!cancelled) setIsConnected(true);
          } catch {
            if (!cancelled) setIsConnected(false);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSessionChange = useCallback((newSessionKey: string) => {
    if (newSessionKey !== sessionKeyRef.current) {
      sessionKeyRef.current = newSessionKey;
      setSessionKeyState(newSessionKey);
      setMessages([]);
      setIsLoading(false);
      setError(null);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string, attachments?: GatewayChatAttachment[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;
      if (activeRequestIdRef.current) return;

      const now = Date.now();
      const userMessage: GatewayChatMessage = {
        id: uuidv4(),
        role: "user",
        content: content.trim(),
        timestamp: now,
        attachments: attachments?.length ? attachments : undefined,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      // Synchronously update the ref so the stream event listener sees isLoading=true
      // immediately — before React has a chance to re-render.
      isLoadingRef.current = true;
      setError(null);

      const currentSessionKey = sessionKeyRef.current;
      const claudeSessionId = sessionIdMap.get(currentSessionKey);

      // Generate a unique requestId for streaming event correlation
      const requestId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const statusAgentId = agentId || extractAgentIdFromSessionKey(currentSessionKey);
      activeRequestIdRef.current = requestId;
      markAgentRunStarted(requestId, statusAgentId, currentSessionKey);

      try {
        const activeSkills = agentId ? getActiveSkillsContent(agentId) : "";

        const result = (await bridgeInvoke("claude-code-send", {
          message: content.trim(),
          sessionId: claudeSessionId || undefined,
          sessionKey: currentSessionKey,
          ...(modelRef.current && { model: modelRef.current }),
          ...(agentId && { agentId }),
          // Pass projectPath only for new sessions — resumed sessions already
          // know their directory from the session file location.
          ...(!claudeSessionId && projectPathRef.current && { projectPath: projectPathRef.current }),
          // Inject active skills as additional system context
          ...(activeSkills && { appendSystemPrompt: activeSkills }),
        })) as {
          success?: boolean;
          error?: string;
          sessionId?: string;
          messages?: Array<{
            id: string;
            role: string;
            content: string;
            timestamp?: number;
            thinking?: string;
            toolCalls?: GatewayChatMessage["toolCalls"];
            toolResults?: GatewayChatMessage["toolResults"];
            attachments?: Array<{ filename: string; mimeType: string; data: string; size: number }>;
          }>;
        };

        if (!result?.success) {
          throw new Error(result?.error || "Claude Code request failed");
        }

        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        // Store session ID for future resume
        if (result.sessionId) {
          sessionIdMap.set(currentSessionKey, result.sessionId);
          persistSessionIdMap(sessionIdMap);
        }

        // Replace streaming placeholder with final messages. Connector responses
        // may include the echoed user message or the full transcript.
        if (result.messages && result.messages.length > 0) {
          const newMessages: GatewayChatMessage[] = result.messages.map((m) => ({
            id: m.id || uuidv4(),
            role: m.role as ChatMessageRole,
            content: m.content || "",
            timestamp: m.timestamp || Date.now(),
            ...(m.thinking && { thinking: m.thinking }),
            ...(m.toolCalls && { toolCalls: m.toolCalls }),
            ...(m.toolResults && { toolResults: m.toolResults }),
            ...(m.attachments?.length && {
              attachments: m.attachments.map((a, i) => {
                const type = a.mimeType.startsWith("image/") ? "image" : a.mimeType.startsWith("video/") ? "video" : "file";
                return {
                  id: `${m.id}-att-${i}`,
                  type,
                  mimeType: a.mimeType,
                  name: a.filename,
                  // Only embed base64 for image/video. Code file attachments (Write/Edit results)
                  // are already on disk — embedding them in React state caused ~10GB memory leaks.
                  ...(type !== "file" && a.data && { dataUrl: `data:${a.mimeType};base64,${a.data}` }),
                };
              }),
            }),
          }));

          setMessages((prev) => {
            return mergeRuntimeResponseMessages(
              prev,
              newMessages,
              content.trim(),
              ["stream-active"]
            );
          });
        } else {
          // No final messages but streaming may have added content — keep it
        }
      } catch (err) {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send to Claude Code";
        console.error("[useClaudeCodeChat] Send error:", err);
        setError(errorMessage);

        setMessages((prev) => {
          // Remove streaming placeholder
          const filtered = prev.filter(
            (m) => m.id !== "stream-active"
          );
          return [
            ...filtered,
            {
              id: uuidv4(),
              role: "assistant" as ChatMessageRole,
              content: `Error: ${errorMessage}`,
              timestamp: Date.now(),
            },
          ];
        });
      } finally {
        markAgentRunFinished(requestId);
        if (activeRequestIdRef.current === requestId) {
          activeRequestIdRef.current = null;
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [agentId]
  );

  const stopGeneration = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    try {
      await bridgeInvoke("claude-code-abort", { sessionKey: sessionKeyRef.current });
    } catch {
      // Ignore abort errors
    }
    const requestId = activeRequestIdRef.current;
    if (requestId) markAgentRunFinished(requestId);
    activeRequestIdRef.current = null;
    isLoadingRef.current = false;
    setIsLoading(false);
  }, []);

  const loadChatHistory = useCallback(async () => {
    const key = sessionKeyRef.current;
    const requestAgentId = agentId;
    let sessionId = sessionIdMap.get(key);
    if (!sessionId) {
      if (key.startsWith("claude:")) {
        sessionId = key.slice(7);
      }
    }
    if (!sessionId || sessionId === "default") return;

    try {
      const result = (await bridgeInvoke("claude-code-load-history", {
        sessionId,
        ...(agentId && { agentId }),
        ...(projectPathRef.current && { projectPath: projectPathRef.current }),
      })) as {
        messages?: Array<{
          id: string;
          role: string;
          content: string;
          timestamp?: number;
          thinking?: string;
          toolCalls?: GatewayChatMessage["toolCalls"];
          toolResults?: GatewayChatMessage["toolResults"];
        }>;
        sessionId?: string;
        error?: string;
      };

      if (sessionKeyRef.current !== key || agentIdRef.current !== requestAgentId) {
        return;
      }

      if (result?.sessionId) {
        sessionIdMap.set(key, result.sessionId);
        persistSessionIdMap(sessionIdMap);
      }

      if (result?.messages && result.messages.length > 0) {
        const parsed: GatewayChatMessage[] = result.messages.map((m) => ({
          id: m.id || uuidv4(),
          role: m.role as ChatMessageRole,
          content: m.content || "",
          timestamp: typeof m.timestamp === "number" ? m.timestamp : 0,
          ...(m.thinking && { thinking: m.thinking }),
          ...(m.toolCalls && { toolCalls: m.toolCalls }),
          ...(m.toolResults && { toolResults: m.toolResults }),
        }));
        setMessages(filterMessagesAfterClear(parsed, readChatClearMarker(key)));
      }

      // Start watching the session file for live updates from terminal
      const watchSessionId = result?.sessionId || sessionId;
      if (watchSessionId) {
        watchedSessionIdsRef.current.add(watchSessionId);
        bridgeInvoke("claude-code-watch", {
          sessionId: watchSessionId,
          sessionKey: key,
          ...(agentId && { agentId }),
          ...(projectPathRef.current && { projectPath: projectPathRef.current }),
        }).catch(() => {});
      }
    } catch (err) {
      if (sessionKeyRef.current !== key || agentIdRef.current !== requestAgentId) {
        return;
      }
      console.error("[useClaudeCodeChat] Failed to load history:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load session history"
      );
    }
  }, [agentId]);

  const loadMoreHistory = useCallback(async () => {
    // Not applicable for Claude Code
  }, []);

  const clearChat = useCallback(() => {
    const key = sessionKeyRef.current;
    const mappedSessionId = sessionIdMap.get(key);
    const keySessionId = key.startsWith("claude:") ? key.slice(7) : undefined;
    const sessionIdToClear = mappedSessionId || keySessionId;
    const requestId = activeRequestIdRef.current;
    if (requestId) {
      markAgentRunFinished(requestId);
    }
    abortRef.current?.abort();
    abortRef.current = null;
    bridgeInvoke("claude-code-abort", { sessionKey: sessionKeyRef.current }).catch(() => {});
    activeRequestIdRef.current = null;
    isLoadingRef.current = false;
    writeChatClearMarker(key);
    if (sessionIdToClear) {
      writeChatClearMarker(`claude:${sessionIdToClear}`);
    }
    setMessages([]);
    setError(null);
    setIsLoading(false);
    sessionIdMap.delete(key);
    if (sessionIdToClear) {
      sessionIdMap.delete(`claude:${sessionIdToClear}`);
    }
    persistSessionIdMap(sessionIdMap);
  }, []);

  const connect = useCallback(async () => {
    try {
      const result = (await bridgeInvoke("claude-code-status", {})) as {
        available?: boolean;
      };
      setIsConnected(result?.available ?? false);
    } catch {
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  // Stop file watcher on unmount — but do NOT abort the Claude Code process.
  // The connector keeps running the CLI in the background; switching tabs
  // shouldn't kill work in progress. The user can reload history when they
  // come back. Only the explicit stop button (stopGeneration) aborts.
  useEffect(() => {
    return () => {
      // Unwatch ALL sessions this hook instance ever started, not just the current one.
      // Previously only the current session was unwatched, leaving goroutines running
      // in the connector for every session the user had switched away from.
      for (const sid of watchedSessionIdsRef.current) {
        bridgeInvoke("claude-code-unwatch", { sessionId: sid }).catch(() => {});
      }
      watchedSessionIdsRef.current.clear();
    };
  }, []);

  return {
    messages,
    isLoading,
    isConnected,
    error,
    sessionKey: sessionKeyState,
    hasMoreHistory: false,
    isLoadingMore: false,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    loadMoreHistory,
    clearChat,
    setSessionKey: handleSessionChange,
    model,
    setModel: handleSetModel,
    connect,
    disconnect,
  };
}
