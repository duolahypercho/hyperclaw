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
  /**
   * Project path (agent's configured project). When set, it is forwarded to
   * the connector so the persisted session row gets tagged with cwd, enabling
   * the session picker to scope by current project.
   */
  projectPath?: string;
}

// Map HyperClaw session keys → Codex thread IDs for resume
const sessionIdMap = new Map<string, string>();

type CodexStreamTextUpdate = {
  text: string;
  mode: "append" | "replace";
};

function extractCodexItemText(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const value = item as Record<string, unknown>;

  if (typeof value.text === "string") {
    return value.text;
  }

  const content = value.content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string") return b.text;
        if (typeof b.output_text === "string") return b.output_text;
        return "";
      })
      .join("");
  }

  return "";
}

function extractCodexStreamText(event: unknown): CodexStreamTextUpdate | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  const eventType = typeof e.type === "string" ? e.type : "";

  const delta =
    typeof e.delta === "string" ? e.delta :
    typeof e.text_delta === "string" ? e.text_delta :
    typeof e.output_text_delta === "string" ? e.output_text_delta :
    null;
  if (delta) {
    return { text: delta, mode: "append" };
  }

  const nestedDelta = e.delta && typeof e.delta === "object"
    ? (e.delta as Record<string, unknown>)
    : null;
  if (nestedDelta) {
    const text =
      typeof nestedDelta.text === "string" ? nestedDelta.text :
      typeof nestedDelta.output_text === "string" ? nestedDelta.output_text :
      null;
    if (text) return { text, mode: "append" };
  }

  const itemText = extractCodexItemText(e.item);
  if (itemText) {
    return {
      text: itemText,
      mode: eventType.includes("delta") ? "append" : "replace",
    };
  }

  return null;
}

export function useCodexChat(
  options: UseCodexChatOptions = {}
): UseGatewayChatReturn {
  const { sessionKey: initialSessionKey, defaultModel, agentId, projectPath } = options;
  const agentIdRef = useRef(agentId);
  useEffect(() => { agentIdRef.current = agentId; }, [agentId]);

  const [messages, setMessages] = useState<GatewayChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(defaultModel || "");

  const sessionKeyRef = useRef<string>(initialSessionKey || "default");
  const [sessionKeyState, setSessionKeyState] = useState<string>(
    initialSessionKey || "default"
  );
  const pendingSendRef = useRef(false);
  const activeStatusRunIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStreamEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        sessionKey?: string;
        event?: unknown;
      } | undefined;
      if (!detail?.event) return;
      if (!detail.sessionKey || detail.sessionKey !== sessionKeyRef.current) return;
      if (!isLoadingRef.current) return;

      const update = extractCodexStreamText(detail.event);
      if (!update?.text) return;

      setMessages((prev) => {
        const streamId = "stream-active";
        const existingIdx = prev.findIndex((m) => m.id === streamId);
        if (existingIdx !== -1) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            content: update.mode === "append"
              ? `${next[existingIdx].content || ""}${update.text}`
              : update.text,
          };
          return next;
        }
        return [
          ...prev,
          {
            id: streamId,
            role: "assistant" as ChatMessageRole,
            content: update.text,
            timestamp: Date.now(),
          },
        ];
      });
    };

    window.addEventListener("codex-stream", handleStreamEvent);
    // Current connector versions forward Codex JSONL through the shared runtime
    // stream event. Keep this until all deployed connectors emit codex-stream.
    window.addEventListener("claude-code-stream", handleStreamEvent);
    return () => {
      window.removeEventListener("codex-stream", handleStreamEvent);
      window.removeEventListener("claude-code-stream", handleStreamEvent);
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
      if (pendingSendRef.current) return;
      pendingSendRef.current = true;

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
      isLoadingRef.current = true;
      setError(null);

      const currentSessionKey = sessionKeyRef.current;
      const codexThreadId = sessionIdMap.get(currentSessionKey);
      const statusRunId = `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const statusAgentId = agentId || extractAgentIdFromSessionKey(currentSessionKey);
      activeStatusRunIdRef.current = statusRunId;
      markAgentRunStarted(statusRunId, statusAgentId, currentSessionKey);

      try {
        const activeSkills = agentId ? getActiveSkillsContent(agentId) : "";

        const result = (await bridgeInvoke("codex-send", {
          message: content.trim(),
          sessionId: codexThreadId || undefined,
          sessionKey: currentSessionKey,
          ...(model && { model }),
          ...(agentId && { agentId }),
          ...(projectPath && { projectPath }),
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

        if (activeStatusRunIdRef.current !== statusRunId) {
          return;
        }

        // Store thread ID for future resume
        if (result.sessionId) {
          sessionIdMap.set(currentSessionKey, result.sessionId);
        }

        // Add assistant messages from the response. The connector may return the
        // echoed user message or full transcript, so keep only this turn's reply.
        if (result.messages && result.messages.length > 0) {
          const newMessages: GatewayChatMessage[] = result.messages.map((m) => ({
            id: m.id || uuidv4(),
            role: m.role as ChatMessageRole,
            content: m.content || "",
            timestamp: m.timestamp || Date.now(),
            ...(m.toolCalls && { toolCalls: m.toolCalls }),
            ...(m.toolResults && { toolResults: m.toolResults }),
          }));

          setMessages((prev) =>
            mergeRuntimeResponseMessages(prev, newMessages, content.trim(), [
              "stream-active",
            ])
          );
        }
      } catch (err) {
        if (activeStatusRunIdRef.current !== statusRunId) {
          return;
        }
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send to Codex";
        console.error("[useCodexChat] Send error:", err);
        setError(errorMessage);

        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== "stream-active");
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
        markAgentRunFinished(statusRunId);
        if (activeStatusRunIdRef.current === statusRunId) {
          activeStatusRunIdRef.current = null;
          pendingSendRef.current = false;
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    },
    [agentId, model, projectPath]
  );

  const stopGeneration = useCallback(async () => {
    try {
      await bridgeInvoke("codex-abort", { sessionKey: sessionKeyRef.current });
    } catch {
      // Ignore abort errors
    }
    if (activeStatusRunIdRef.current) {
      markAgentRunFinished(activeStatusRunIdRef.current);
      activeStatusRunIdRef.current = null;
    }
    pendingSendRef.current = false;
    isLoadingRef.current = false;
    setIsLoading(false);
  }, []);

  const loadChatHistory = useCallback(async () => {
    const key = sessionKeyRef.current;
    const requestAgentId = agentId;
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

      if (sessionKeyRef.current !== key || agentIdRef.current !== requestAgentId) {
        return;
      }

      if (result?.sessionId) {
        sessionIdMap.set(key, result.sessionId);
      }

      if (result?.messages && result.messages.length > 0) {
        const parsed: GatewayChatMessage[] = result.messages.map((m) => ({
          id: m.id || uuidv4(),
          role: m.role as ChatMessageRole,
          content: m.content || "",
          timestamp: typeof m.timestamp === "number" ? m.timestamp : 0,
          ...(m.toolCalls && { toolCalls: m.toolCalls }),
          ...(m.toolResults && { toolResults: m.toolResults }),
        }));
        setMessages(filterMessagesAfterClear(parsed, readChatClearMarker(key)));
      }
    } catch {
      // Ignore load errors — session may not exist yet
    }
  }, [agentId]);
  const loadMoreHistory = useCallback(async () => {}, []);

  const clearChat = useCallback(() => {
    const key = sessionKeyRef.current;
    const mappedSessionId = sessionIdMap.get(key);
    const keySessionId = key.startsWith("codex:") ? key.slice(6) : undefined;
    const sessionIdToClear = mappedSessionId || keySessionId;
    const statusRunId = activeStatusRunIdRef.current;
    if (statusRunId) {
      markAgentRunFinished(statusRunId);
    }
    bridgeInvoke("codex-abort", { sessionKey: sessionKeyRef.current }).catch(() => {});
    activeStatusRunIdRef.current = null;
    pendingSendRef.current = false;
    isLoadingRef.current = false;
    writeChatClearMarker(key);
    if (sessionIdToClear) {
      writeChatClearMarker(`codex:${sessionIdToClear}`);
    }
    setMessages([]);
    setError(null);
    setIsLoading(false);
    sessionIdMap.delete(key);
    if (sessionIdToClear) {
      sessionIdMap.delete(`codex:${sessionIdToClear}`);
    }
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
