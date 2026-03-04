"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  connectGatewayWs,
  disconnectGatewayWs,
  getGatewayConfig,
  buildGatewayWsUrl,
  getGatewayConnectionState,
  subscribeGatewayConnection,
  gatewayConnection,
} from "$/lib/openclaw-gateway-ws";
import { v4 as uuidv4 } from "uuid";

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
}

export interface UseGatewayChatReturn {
  // State
  messages: GatewayChatMessage[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  sessionKey: string;

  // Actions
  sendMessage: (content: string, attachments?: GatewayChatAttachment[]) => Promise<void>;
  stopGeneration: () => Promise<void>;
  loadChatHistory: () => Promise<void>;
  clearChat: () => void;
  setSessionKey: (key: string) => void;

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

  // Also process legacy msg.content array if present
  if (Array.isArray(msg.content)) {
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
    // Handle legacy string content
    content = msg.content;
    contentBlocks.push({ type: "text", text: msg.content });
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

  return {
    id,
    role: role as ChatMessageRole,
    content: content || "",
    timestamp,
    ...(thinking && { thinking }),
    ...(toolCalls && toolCalls.length > 0 && { toolCalls }),
    ...(toolResults && toolResults.length > 0 && { toolResults }),
    ...(contentBlocks.length > 0 && { contentBlocks }),
  };
}

export function useGatewayChat(options: UseGatewayChatOptions = {}): UseGatewayChatReturn {
  const { sessionKey: initialSessionKey, autoConnect = true } = options;

  // State
  const [messages, setMessages] = useState<GatewayChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a REF to store the session key - this prevents unwanted resets when parent re-renders
  // The key insight: we only update this ref when the user explicitly changes agents/sessions
  const sessionKeyRef = useRef<string>(initialSessionKey || "default");
  const sessionKeyFromPropRef = useRef<string>(initialSessionKey || "default");

  // Track if we've already processed an event (for deduplication)
  const processedEventSeqRef = useRef<Set<string>>(new Set());

  // Update the ref when prop changes, but only clear state on explicit user changes
  const effectiveSessionKey = sessionKeyRef.current;

  // Check if session key changed (from user action, not from parent re-render)
  useEffect(() => {
    sessionKeyFromPropRef.current = initialSessionKey || "default";
  }, [initialSessionKey]);

  // Only clear state when the session key actually changes (user action)
  const handleSessionChange = useCallback((newSessionKey: string) => {
    const oldKey = sessionKeyRef.current;
    if (oldKey !== newSessionKey) {
      sessionKeyRef.current = newSessionKey;
      // Clear state for new session
      setMessages([]);
      setIsLoading(false);
      setError(null);
      currentRunIdRef.current = null;
      streamContentRef.current = "";
      processedEventSeqRef.current.clear();
    }
  }, []);

  // Refs
  const currentRunIdRef = useRef<string | null>(null);
  const streamContentRef = useRef<string>("");
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Handle incoming chat events (matching OpenClaw's handleChatEvent)
  const handleChatEvent = useCallback((payload: ChatEventPayload) => {

    // Deduplicate events using runId + state as key
    const eventKey = `${payload.runId}:${payload.state}`;
    if (processedEventSeqRef.current.has(eventKey)) {
      return;
    }
    processedEventSeqRef.current.add(eventKey);

    if (payload.sessionKey !== effectiveSessionKey) {
      return;
    }

    if (payload.state === "delta") {

      // Check if this is a tool event
      const msg = payload.message as Record<string, unknown> | undefined;
      const role = msg?.role as string | undefined;

      if (role === "toolResult") {
        // Handle tool result - add as separate message
        const toolCallId = msg?.toolCallId as string | undefined;
        const toolName = msg?.toolName as string | undefined;
        const content = typeof msg?.content === "string" ? msg.content : "";
        const isError = msg?.isError as boolean | undefined;

        const toolResultMsg: GatewayChatMessage = {
          id: toolCallId || uuidv4(),
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
        setMessages((prev) => [...prev, toolResultMsg]);
        return;
      }

      if (role === "assistant" && msg?.tool_calls) {
        // Handle tool call - update last assistant message with tool calls
        const toolCalls = msg.tool_calls as Array<{
          id: string;
          type?: string;
          function?: { name: string; arguments: string };
          name?: string;
          arguments?: string;
        }>;

        const normalizedToolCalls = toolCalls?.map((tc) => ({
          id: tc.id,
          type: tc.type || "function",
          function: tc.function || { name: tc.name || "", arguments: tc.arguments || "{}" },
          name: tc.function?.name || tc.name || "",
          arguments: tc.function?.arguments || tc.arguments || "{}",
        }));

        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            return [...prev.slice(0, -1), { ...lastMsg, toolCalls: normalizedToolCalls }];
          }
          // Create new assistant message with tool calls
          return [...prev, {
            id: payload.runId || uuidv4(),
            role: "assistant" as ChatMessageRole,
            content: "",
            timestamp: Date.now(),
            toolCalls: normalizedToolCalls,
          }];
        });
        return;
      }

      // Regular text delta - streaming content update
      const text = extractText(payload.message);
      if (typeof text === "string") {
        streamContentRef.current = text;

        setMessages((prev) => {
          // Update the last assistant message or create a new one
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { ...lastMsg, content: text },
            ];
          }
          // Create new assistant message
          return [
            ...prev,
            {
              id: payload.runId || uuidv4(),
              role: "assistant" as ChatMessageRole,
              content: text,
              timestamp: Date.now(),
            },
          ];
        });
      }
    } else if (payload.state === "final") {

      // If final has no message, reload history from server (matching OpenClaw's behavior)
      // This handles cases where the agent response comes through a different channel
      if (!payload.message || typeof payload.message !== "object") {
        // Reload history in background
        gatewayConnection.getChatHistory(effectiveSessionKey).then((response) => {
          if (response.messages && response.messages.length > 0) {
            const loadedMessages: GatewayChatMessage[] = [];
            for (const msg of response.messages) {
              const normalized = normalizeMessage(msg);
              if (normalized) {
                loadedMessages.push(normalized);
              }
            }
            setMessages(loadedMessages);
            setIsLoading(false);
          }
        }).catch((err) => {
          console.error("[GatewayChat] Failed to reload history:", err);
          setIsLoading(false);
        });
      }

      // Final message - try to normalize it
      let normalized = normalizeMessage(payload.message);

      // If final message is empty/undefined but we have streaming content, use that
      if (!normalized || !normalized.content) {
        const streamedText = streamContentRef.current;
        if (streamedText && streamedText.trim()) {
          normalized = {
            id: payload.runId || uuidv4(),
            role: "assistant" as ChatMessageRole,
            content: streamedText,
            timestamp: Date.now(),
          };
        }
      }

      if (normalized && normalized.content) {
        setMessages((prev) => {
          // Replace the streaming message with final one
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === payload.runId) {
            return [...prev.slice(0, -1), normalized!];
          }
          return [...prev, normalized!];
        });
      } else {
        // Final message is truly empty - still clean up the streaming message if exists
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && lastMsg.id === payload.runId) {
            // Keep the streaming content if no final content
            const existingContent = lastMsg.content || streamContentRef.current;
            if (existingContent) {
              return [...prev.slice(0, -1), { ...lastMsg, content: existingContent }];
            }
          }
          return prev;
        });
      }
      streamContentRef.current = "";
      currentRunIdRef.current = null;
      setIsLoading(false);
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
      // Error state
      setError(payload.errorMessage || "Chat error");
      streamContentRef.current = "";
      currentRunIdRef.current = null;
      setIsLoading(false);
    }
  }, [effectiveSessionKey]);

  // Subscribe to gateway connection state
  useEffect(() => {
    let previousConnected = false;

    const handleStateChange = () => {
      const state = getGatewayConnectionState();
      setIsConnected(state.connected);

      // Load chat history when connection is established
      if (state.connected && !previousConnected) {
        // Load history after a short delay to ensure connection is fully established
        setTimeout(async () => {
          if (gatewayConnection.isConnected()) {
            try {
              const response = await gatewayConnection.getChatHistory(effectiveSessionKey);
              const loadedMessages: GatewayChatMessage[] = [];

              if (response.messages) {
                for (let i = 0; i < response.messages.length; i++) {
                  const msg = response.messages[i] as any;
                  // Log raw message structure for first few messages
                  if (i < 10) {
                  }
                  const normalized = normalizeMessage(msg);
                  if (normalized) {
                    loadedMessages.push(normalized);
                  }
                }
              }

              setMessages(loadedMessages);
            } catch (err) {
              console.error("[GatewayChat] Failed to load history:", err);
            }
          }
        }, 500);
      }

      if (!state.connected) {
        setIsLoading(false);
      }
      previousConnected = state.connected;
    };

    const unsubscribe = subscribeGatewayConnection(handleStateChange);

    return () => {
      unsubscribe();
    };
  }, [effectiveSessionKey]);

  // Subscribe to chat events
  useEffect(() => {
    unsubscribeRef.current = gatewayConnection.onChatEvent(handleChatEvent);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [handleChatEvent]);

  // Connect to gateway
  const connect = useCallback(async () => {
    try {
      const { gatewayUrl, token } = await getGatewayConfig();
      const wsUrl = buildGatewayWsUrl(gatewayUrl, token);
      connectGatewayWs(wsUrl, { token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, []);

  // Disconnect from gateway
  const disconnect = useCallback(() => {
    disconnectGatewayWs();
    setIsConnected(false);
  }, []);

  // Load chat history
  const loadChatHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await gatewayConnection.getChatHistory(effectiveSessionKey);

      const loadedMessages: GatewayChatMessage[] = [];

      if (response.messages) {
        for (let i = 0; i < response.messages.length; i++) {
          const msg = response.messages[i];
          const normalized = normalizeMessage(msg);
          if (normalized) {
            loadedMessages.push(normalized);
          }
        }
      } else {
      }

      setMessages(loadedMessages);
    } catch (err) {
      console.error("[GatewayChat] loadChatHistory: Error:", err);
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSessionKey]);

  // Send a message
  const sendMessage = useCallback(async (content: string, attachments?: GatewayChatAttachment[]) => {
    if (!content.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    if (!gatewayConnection.isConnected()) {
      try {
        const { gatewayUrl, token } = await getGatewayConfig();
        const wsUrl = buildGatewayWsUrl(gatewayUrl, token);
        connectGatewayWs(wsUrl, { token });
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (e) {
        console.error("[GatewayChat] Auto-connect failed:", e);
      }
    }

    const now = Date.now();
    const userMessage: GatewayChatMessage = {
      id: uuidv4(),
      role: "user",
      content: content.trim(),
      timestamp: now,
    };

    // Optimistically add user message
    setMessages((prev) => [...prev, userMessage]);

    // Generate runId for this conversation
    const runId = uuidv4();

    // Add empty assistant message to show thinking animation
    const thinkingMessage: GatewayChatMessage = {
      id: runId,
      role: "assistant",
      content: "",
      timestamp: now,
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    setIsLoading(true);
    setError(null);

    currentRunIdRef.current = runId;
    streamContentRef.current = "";

    try {
      // Convert attachments to API format
      const apiAttachments = attachments?.map((att) => ({
        type: "image" as const,
        mimeType: att.mimeType,
        content: att.dataUrl.split(",")[1] || att.dataUrl, // Remove data: prefix
      }));

      await gatewayConnection.sendChatMessage({
        sessionKey: effectiveSessionKey,
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
  }, [effectiveSessionKey]);

  // Stop generation
  const stopGeneration = useCallback(async () => {
    if (!gatewayConnection.isConnected()) {
      return;
    }

    try {
      await gatewayConnection.abortChat({
        sessionKey: effectiveSessionKey,
        runId: currentRunIdRef.current || undefined,
      });
    } catch (err) {
      console.error("Failed to abort chat:", err);
    }
  }, [effectiveSessionKey]);

  // Clear chat
  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    streamContentRef.current = "";
    currentRunIdRef.current = null;
  }, []);

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
    sessionKey: effectiveSessionKey,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    clearChat,
    setSessionKey: handleSessionChange,
    connect,
    disconnect,
  }), [
    messages,
    isLoading,
    isConnected,
    error,
    effectiveSessionKey,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    clearChat,
    handleSessionChange,
    connect,
    disconnect,
  ]);
}
