"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import type {
  GatewayChatMessage,
  GatewayChatAttachment,
  UseGatewayChatReturn,
  ChatMessageRole,
} from "./use-gateway-chat";

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
  const { sessionKey: initialSessionKey, defaultModel } = options;

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

  // Track the current requestId for streaming event correlation
  const activeRequestIdRef = useRef<string | null>(null);

  // Listen for streaming events from the gateway WebSocket
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStreamEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      const { sessionKey: evtSessionKey, event } = detail;

      // Only process events for our active session
      if (evtSessionKey && evtSessionKey !== sessionKeyRef.current) return;

      // Only process while we're actively loading (waiting for response)
      if (!isLoadingRef.current) return;

      if (!event) return;
      const eventType = event.type as string;

      // Handle assistant text streaming
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

        if (textContent.trim()) {
          // Update or create streaming assistant message
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
      setError(null);

      const currentSessionKey = sessionKeyRef.current;
      const claudeSessionId = sessionIdMap.get(currentSessionKey);

      // Generate a unique requestId for streaming event correlation
      const requestId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeRequestIdRef.current = requestId;

      try {
        const result = (await bridgeInvoke("claude-code-send", {
          message: content.trim(),
          sessionId: claudeSessionId || undefined,
          sessionKey: currentSessionKey,
          ...(modelRef.current && { model: modelRef.current }),
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
          }>;
        };

        if (!result?.success) {
          throw new Error(result?.error || "Claude Code request failed");
        }

        // Store session ID for future resume
        if (result.sessionId) {
          sessionIdMap.set(currentSessionKey, result.sessionId);
          persistSessionIdMap(sessionIdMap);
        }

        // Replace streaming placeholder with final messages
        if (result.messages && result.messages.length > 0) {
          const newMessages: GatewayChatMessage[] = result.messages.map((m) => ({
            id: m.id || uuidv4(),
            role: m.role as ChatMessageRole,
            content: m.content || "",
            timestamp: m.timestamp || Date.now(),
            ...(m.thinking && { thinking: m.thinking }),
            ...(m.toolCalls && { toolCalls: m.toolCalls }),
            ...(m.toolResults && { toolResults: m.toolResults }),
          }));

          setMessages((prev) => {
            // Remove streaming placeholder
            const filtered = prev.filter(
              (m) => m.id !== "stream-active"
            );
            return [...filtered, ...newMessages];
          });
        } else {
          // No final messages but streaming may have added content — keep it
        }
      } catch (err) {
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
        activeRequestIdRef.current = null;
        setIsLoading(false);
      }
    },
    []
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
    activeRequestIdRef.current = null;
    setIsLoading(false);
  }, []);

  const loadChatHistory = useCallback(async () => {
    const key = sessionKeyRef.current;
    let sessionId = sessionIdMap.get(key);
    if (!sessionId) {
      if (key.startsWith("claude:")) {
        sessionId = key.slice(7);
      }
    }
    if (!sessionId || sessionId === "default") return;

    try {
      const result = (await bridgeInvoke("claude-code-load-history", { sessionId })) as {
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

      if (result?.sessionId) {
        sessionIdMap.set(key, result.sessionId);
        persistSessionIdMap(sessionIdMap);
      }

      if (result?.messages && result.messages.length > 0) {
        const parsed: GatewayChatMessage[] = result.messages.map((m) => ({
          id: m.id || uuidv4(),
          role: m.role as ChatMessageRole,
          content: m.content || "",
          timestamp: m.timestamp || Date.now(),
          ...(m.thinking && { thinking: m.thinking }),
          ...(m.toolCalls && { toolCalls: m.toolCalls }),
          ...(m.toolResults && { toolResults: m.toolResults }),
        }));
        setMessages(parsed);
      }

      // Start watching the session file for live updates from terminal
      const watchSessionId = result?.sessionId || sessionId;
      if (watchSessionId) {
        bridgeInvoke("claude-code-watch", {
          sessionId: watchSessionId,
          sessionKey: key,
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[useClaudeCodeChat] Failed to load history:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load session history"
      );
    }
  }, []);

  const loadMoreHistory = useCallback(async () => {
    // Not applicable for Claude Code
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdMap.delete(sessionKeyRef.current);
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
      const sid = sessionIdMap.get(sessionKeyRef.current);
      if (sid) {
        bridgeInvoke("claude-code-unwatch", { sessionId: sid }).catch(() => {});
      }
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
