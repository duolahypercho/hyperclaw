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
}

// Map HyperClaw session keys → Claude Code session IDs for resume
const sessionIdMap = new Map<string, string>();

export function useClaudeCodeChat(
  options: UseClaudeCodeChatOptions = {}
): UseGatewayChatReturn {
  const { sessionKey: initialSessionKey } = options;

  const [messages, setMessages] = useState<GatewayChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setIsLoading(false);
  }, []);

  const loadChatHistory = useCallback(async () => {
    // Claude Code sessions are local — no server-side history to load.
    // History is maintained in-memory via React state.
  }, []);

  const loadMoreHistory = useCallback(async () => {
    // Not applicable for Claude Code
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    // Remove session mapping so next message starts a fresh session
    sessionIdMap.delete(sessionKeyRef.current);
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
    connect,
    disconnect,
  };
}
