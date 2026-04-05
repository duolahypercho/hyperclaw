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
 * messages through Claude Code CLI instead of the OpenClaw gateway.
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
// Persisted to sessionStorage so sessions survive page reloads
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

  // Stable model setter that also updates the ref (avoids stale closure in sendMessage)
  const handleSetModel = useCallback((m: string) => {
    modelRef.current = m;
    setModel(m);
  }, []);

  // Abort controller for in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // Check if Claude Code is available on mount (Electron only)
  useEffect(() => {
    // Skip in browser mode — no Electron IPC available
    if (typeof window === "undefined" || !window.electronAPI?.claudeCode) {
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
          setIsConnected(false);
          setError("Claude Code not available");
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

        // Add assistant messages from the response
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

          setMessages((prev) => [...prev, ...newMessages]);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send to Claude Code";
        console.error("[useClaudeCodeChat] Send error:", err);
        setError(errorMessage);

        setMessages((prev) => [
          ...prev,
          {
            id: uuidv4(),
            role: "assistant" as ChatMessageRole,
            content: `Error: ${errorMessage}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
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
    // Tell Electron to kill the Claude Code subprocess
    try {
      await bridgeInvoke("claude-code-abort", { sessionKey: sessionKeyRef.current });
    } catch {
      // Ignore abort errors
    }
    setIsLoading(false);
  }, []);

  const loadChatHistory = useCallback(async () => {
    const key = sessionKeyRef.current;
    // Extract session ID: keys are "claude:<sessionId>" or raw session IDs
    const sessionId = sessionIdMap.get(key) || key.replace(/^claude:/, "");
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
    // Remove session mapping so next message starts a fresh session
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

  // Kill any in-flight Claude Code process when the hook unmounts
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.electronAPI?.claudeCode) {
        bridgeInvoke("claude-code-abort", {
          sessionKey: sessionKeyRef.current,
        }).catch(() => {});
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
