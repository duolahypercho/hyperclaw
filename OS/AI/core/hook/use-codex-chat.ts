"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { getActiveSkillsContent } from "$/components/Home/widgets/AgentSkillsTab";
import type {
  GatewayChatMessage,
  GatewayChatAttachment,
  UseGatewayChatReturn,
  ChatMessageRole,
} from "./use-gateway-chat";

/**
 * useCodexChat — drop-in replacement for useGatewayChat that routes
 * messages through the OpenAI Codex CLI instead of the OpenClaw gateway.
 *
 * Uses `codex exec <prompt> --json` for JSONL streaming output.
 * Returns the same UseGatewayChatReturn interface.
 */

export interface UseCodexChatOptions {
  sessionKey?: string;
  autoConnect?: boolean;
  defaultModel?: string;
  agentId?: string;
}

// Map HyperClaw session keys → Codex thread IDs for resume
const sessionIdMap = new Map<string, string>();

export function useCodexChat(
  options: UseCodexChatOptions = {}
): UseGatewayChatReturn {
  const { sessionKey: initialSessionKey, defaultModel, agentId } = options;

  const [messages, setMessages] = useState<GatewayChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(defaultModel || "");

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

  // Check if Codex is available via hub/connector relay
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsConnected(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = (await bridgeInvoke("codex-status", {})) as {
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
      const codexThreadId = sessionIdMap.get(currentSessionKey);

      try {
        const activeSkills = agentId ? getActiveSkillsContent(agentId) : "";

        const result = (await bridgeInvoke("codex-send", {
          message: content.trim(),
          sessionId: codexThreadId || undefined,
          sessionKey: currentSessionKey,
          ...(model && { model }),
          ...(agentId && { agentId }),
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
            toolCalls?: GatewayChatMessage["toolCalls"];
            toolResults?: GatewayChatMessage["toolResults"];
          }>;
        };

        if (!result?.success) {
          throw new Error(result?.error || "Codex request failed");
        }

        // Store thread ID for future resume
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
            ...(m.toolCalls && { toolCalls: m.toolCalls }),
            ...(m.toolResults && { toolResults: m.toolResults }),
          }));

          setMessages((prev) => [...prev, ...newMessages]);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send to Codex";
        console.error("[useCodexChat] Send error:", err);
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
    try {
      await bridgeInvoke("codex-abort", { sessionKey: sessionKeyRef.current });
    } catch {
      // Ignore abort errors
    }
    setIsLoading(false);
  }, []);

  const loadChatHistory = useCallback(async () => {
    const key = sessionKeyRef.current;
    const sessionId = sessionIdMap.get(key) || key.replace(/^codex:/, "");
    if (!sessionId || sessionId === "default") return;

    try {
      const result = (await bridgeInvoke("codex-load-history", { sessionId })) as {
        messages?: Array<{
          id: string;
          role: string;
          content: string;
          timestamp?: number;
          toolCalls?: GatewayChatMessage["toolCalls"];
          toolResults?: GatewayChatMessage["toolResults"];
        }>;
        sessionId?: string;
        error?: string;
      };

      if (result?.sessionId) {
        sessionIdMap.set(key, result.sessionId);
      }

      if (result?.messages && result.messages.length > 0) {
        const parsed: GatewayChatMessage[] = result.messages.map((m) => ({
          id: m.id || uuidv4(),
          role: m.role as ChatMessageRole,
          content: m.content || "",
          timestamp: m.timestamp || Date.now(),
          ...(m.toolCalls && { toolCalls: m.toolCalls }),
          ...(m.toolResults && { toolResults: m.toolResults }),
        }));
        setMessages(parsed);
      }
    } catch {
      // Ignore load errors — session may not exist yet
    }
  }, []);
  const loadMoreHistory = useCallback(async () => {}, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdMap.delete(sessionKeyRef.current);
  }, []);

  const connect = useCallback(async () => {
    try {
      const result = (await bridgeInvoke("codex-status", {})) as {
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
    model,
    setModel,
    connect,
    disconnect,
  };
}
