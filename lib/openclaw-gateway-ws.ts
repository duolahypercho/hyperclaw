/**
 * Connect to the OpenClaw gateway WebSocket from the renderer (browser context).
 * Gateway is at ws://127.0.0.1:<port> (default 18789). Protocol: connect.challenge → connect request → hello-ok.
 * Uses device identity from Electron for signing.
 */

export function gatewayHttpToWs(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/** Build WebSocket URL with optional auth token */
export function buildGatewayWsUrl(gatewayUrl: string, token?: string | null): string {
  const base = gatewayHttpToWs(gatewayUrl);
  if (token && typeof token === "string" && token.trim()) {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(token.trim())}`;
  }
  return base;
}

export type GatewayConnectionState = { connected: boolean; error: string | null };

// Chat event types
export type ChatEventState = "delta" | "final" | "aborted" | "error";

export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: ChatEventState;
  message?: unknown;
  errorMessage?: string;
}

export type GatewayConnectOptions = { token?: string | null; hubMode?: boolean; hubDeviceId?: string };

const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Sign a connect challenge using Electron API or server-side API fallback */
async function signConnectChallenge(params: {
  clientId: string;
  clientMode: string;
  role?: string;
  scopes?: string[];
  token?: string | null;
  nonce: string;
}): Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string } | null> {
  // Priority 1: Electron IPC (desktop app)
  if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { openClaw?: { signConnectChallenge?: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI?.openClaw?.signConnectChallenge) {
    try {
      return await (window as unknown as { electronAPI: { openClaw: { signConnectChallenge: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI.openClaw.signConnectChallenge(params);
    } catch (e) {
      console.error("[Gateway WS] Sign challenge error:", e);
      return null;
    }
  }
  // Priority 2: Hub direct (browser mode — sign challenge via hub command)
  try {
    const { hubCommand } = await import("$/lib/hub-direct");
    const data = await hubCommand({ action: "sign-connect-challenge", ...params }) as any;
    if (data && !data.error && data.device && data.client) {
      return data;
    }
    if (data?.error) {
      return { device: null, client: null, role: "", scopes: [], error: data.error };
    }
  } catch (e) {
    console.warn("[Gateway WS] Hub direct sign challenge failed:", e);
  }
  return null;
}

/** Singleton: one persistent gateway WebSocket */
export const gatewayConnection = {
  ws: null as WebSocket | null,
  wsUrl: null as string | null,
  token: null as string | null,
  hubMode: false,
  hubDeviceId: null as string | null,
  connected: false,
  error: null as string | null,
  reconnectAttempt: 0,
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  /** Monotonically increasing counter — incremented every time a new WebSocket
   *  is created. Stale onclose/onerror handlers compare their captured
   *  generation to the current value and bail out if they differ. */
  _connectionGeneration: 0,
  listeners: new Set<() => void>(),
  pendingRequests: new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>(),
  deviceIdentity: null as { deviceId: string; publicKeyPem: string } | null,
  // Chat event handlers
  chatEventListeners: new Set<(payload: ChatEventPayload) => void>(),
  // Generic event handlers keyed by event name (e.g. "device_connected")
  eventHandlers: new Map<string, Set<(msg: Record<string, unknown>) => void>>(),
  // Buffer for accumulating delta text from agent events
  agentDeltaBuffer: null as Map<string, string> | null,
  // Track which event source ("chat" or "agent") owns each runId's buffer.
  // The gateway may send the same delta through both chat.* and agent.* events;
  // only the first source to claim a runId is allowed to accumulate text.
  _deltaSourceOwner: null as Map<string, "chat" | "agent"> | null,

  // Keepalive: application-level ping/pong
  _pingTimer: null as ReturnType<typeof setInterval> | null,
  _lastPong: 0 as number,
  _PING_INTERVAL: 30_000,
  _PONG_TIMEOUT: 60_000,

  notify() {
    this.listeners.forEach((cb) => cb());
  },

  setState(connected: boolean, error: string | null) {
    if (this.connected === connected && this.error === error) return;
    this.connected = connected;
    this.error = error;
    this.notify();
  },

  /** Send a request over WebSocket and wait for response */
  request<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const id = randomId();
      this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
      // In hub mode, include routing fields inside params — the hub extracts
      // deviceId + requestType from params (lines 529-530 of hub.go) then
      // deletes them before forwarding clean params to the connector/gateway.
      if (this.hubMode && this.hubDeviceId) {
        const req = {
          type: "req",
          id,
          method,
          params: {
            ...params,
            deviceId: this.hubDeviceId,
            requestType: method,
          },
        };
        this.ws.send(JSON.stringify(req));
      } else {
        const req = { type: "req", id, method, params };
        this.ws.send(JSON.stringify(req));
      }
      // Default 30s, allow override for large responses (e.g. sessions.usage)
      const timeout = timeoutMs ?? 30000;
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, timeout);
    });
  },

  /** Handle incoming WebSocket messages */
  handleMessage(msg: Record<string, unknown>) {
    const msgType = msg.type as string;

    const event = msg.event as string | undefined;

    // Normalize "evt" → "event" (hub may forward connector events with either type)
    if (msgType === "evt") {
      msg.type = "event";
    }

    // Handle pong (keepalive response from hub or gateway)
    if (msgType === "pong" || (msg.type === "event" && event === "pong")) {
      this._lastPong = Date.now();
      return;
    }

    if (msg.type === "res") {
      const id = msg.id as string;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        if (msg.ok) {
          pending.resolve(msg.payload);
        } else {
          // Error can be a string or object { code, message }
          const errorObj = msg.error as { code?: string; message?: string } | undefined;
          if (typeof msg.error === "string") {
            pending.reject(new Error(msg.error || "Request failed"));
          } else {
            const errorMessage = errorObj?.message || errorObj?.code || "Request failed";
            pending.reject(new Error(errorMessage));
          }
        }
        return;
      }
      // No pending request: may be connect response (hello-ok)
      if (msg.ok === true && (msg.payload as Record<string, unknown>)?.type === "hello-ok") {
        this.setState(true, null);
        return;
      }
      return;
    }
    // Server sent connect.challenge → sign and reply
    if (msg.type === "event" && msg.event === "connect.challenge" && msg.payload) {
      // In hub mode, the hub handles challenge signing server-side. Ignore client-side challenges.
      if (this.hubMode) {
        return;
      }

      const payload = msg.payload as { nonce?: string; ts?: number };
      const nonce = payload.nonce ?? "";
      // Use stored token, or parse from WS URL (e.g. ?token=...) if connect was called with URL-only
      let tokenToUse = this.token;
      if ((tokenToUse == null || tokenToUse === "") && this.wsUrl) {
        try {
          const url = new URL(this.wsUrl);
          tokenToUse = url.searchParams.get("token") ?? null;
        } catch {
          /* ignore */
        }
      }

      // Capture current WS instance — if the connection is replaced (e.g. hub replaces local),
      // the stale callback must not act on the new connection.
      const challengeWs = this.ws;

      // Sign the challenge using Electron API
      signConnectChallenge({
        clientId: "gateway-client",
        clientMode: "backend",
        role: "operator",
        scopes: ["operator.read", "operator.write", "operator.admin"],
        token: tokenToUse ?? undefined,
        nonce: nonce,
      }).then((signed) => {
        // Guard: if the WS was replaced since this challenge was received, bail out
        if (this.ws !== challengeWs) {
          return;
        }

        if (signed && !signed.error && signed.device && signed.client) {
          // Protocol: connect.params.auth.token must match gateway token or socket is closed
          const authToken =
            (tokenToUse && String(tokenToUse).trim()) ||
            (signed.deviceToken && String(signed.deviceToken).trim()) ||
            "";
          const req = {
            type: "req",
            id: randomId(),
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: signed.client,
              device: signed.device,
              role: signed.role,
              scopes: signed.scopes,
              auth: authToken ? { token: authToken } : {},
              locale: "en-US",
              userAgent: "hypercho/1.0",
            },
          };
          this.ws?.send(JSON.stringify(req));
        } else if (signed === null) {
          // Browser mode: signConnectChallenge is not available (no Electron API).
          // Gateway requires device key signing which is only available in Electron.
          // Stop reconnecting — the WS gateway cannot be used from the browser directly.
          console.info("[Gateway WS] Browser mode: gateway requires device identity (Electron only). Using REST fallback.");
          this.wsUrl = null; // Prevent further reconnect attempts
          if (this.reconnectTimer != null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
          this.reconnectAttempt = 0;
          try { this.ws?.close(); } catch { /* ignore */ }
          this.ws = null;
          this.setState(false, null); // No error — just not available in browser
        } else {
          // Electron mode but signing failed (transient error) — let reconnect handle it
          const errMsg = signed?.error || "Device signing failed";
          console.warn("[Gateway WS] Sign challenge failed:", errMsg);
          this.setState(false, errMsg);
          // Don't null out wsUrl — allow reconnection to retry
        }
      });
      return;
    }

    // Handle chat events (event type "chat" or "chat.delta", "chat.final", etc.)
    if (msg.type === "event" && typeof msg.event === "string" && (msg.event === "chat" || msg.event.startsWith("chat."))) {
      const payload = msg.payload as ChatEventPayload;
      if (payload) {
        // Accumulate delta text for chat events — the hook expects full accumulated
        // text (it replaces, not appends), so raw token deltas must be buffered here.
        if (payload.state === "delta" && payload.runId) {
          const chatMsg = payload.message as Record<string, unknown> | undefined;
          if (chatMsg?.role === "assistant" && !chatMsg.tool_calls && !chatMsg.toolCalls) {
            let deltaText = "";
            if (Array.isArray(chatMsg.content)) {
              deltaText = (chatMsg.content as any[])
                .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
                .map((b: any) => b.text)
                .join("");
            } else if (typeof chatMsg.content === "string") {
              deltaText = chatMsg.content;
            }
            if (deltaText) {
              if (!this.agentDeltaBuffer) {
                this.agentDeltaBuffer = new Map();
                this._agentDeltaTimestamps = new Map();
              }
              if (!this._deltaSourceOwner) this._deltaSourceOwner = new Map();
              // Skip if the "agent" path already owns this runId's buffer
              const owner = this._deltaSourceOwner.get(payload.runId);
              if (owner === "agent") {
                // Don't double-accumulate — pass through as non-accumulating event
                this.chatEventListeners.forEach((handler) => handler(payload));
                return;
              }
              if (!owner) this._deltaSourceOwner.set(payload.runId, "chat");
              const existing = this.agentDeltaBuffer.get(payload.runId) || "";
              let newBuffer = existing + deltaText;
              if (newBuffer.length > 524_288) newBuffer = newBuffer.slice(-524_288);
              this.agentDeltaBuffer.set(payload.runId, newBuffer);
              this._agentDeltaTimestamps?.set(payload.runId, Date.now());

              const accumulated: ChatEventPayload = {
                ...payload,
                message: { ...chatMsg, content: [{ type: "text", text: newBuffer }] },
              };
              this.chatEventListeners.forEach((handler) => handler(accumulated));
              return;
            }
          }
        } else if ((payload.state === "final" || payload.state === "aborted") && payload.runId) {
          this.agentDeltaBuffer?.delete(payload.runId);
          this._agentDeltaTimestamps?.delete(payload.runId);
          this._deltaSourceOwner?.delete(payload.runId);
        }
        this.chatEventListeners.forEach((handler) => handler(payload));
      }
      return;
    }

    // Handle agent stream events (assistant delta, final, etc.)
    // Format: agent.{runId}.{stream}.{seq} -> payload contains runId, sessionKey, stream (lifecycle/assistant/tool), data
    if (msg.type === "event" && typeof msg.event === "string" && (msg.event === "agent" || msg.event.startsWith("agent."))) {
      const payload = msg.payload as Record<string, unknown>;
      // Parse stream/runId from event name as fallback (format: agent.{runId}.{stream}.{seq})
      const eventParts = (msg.event as string).split(".");
      const stream = (payload?.stream as string) || eventParts[2];
      const sessionKey = payload?.sessionKey as string;
      const runId = (payload?.runId as string) || eventParts[1];
      const data = payload?.data ? (payload.data as Record<string, unknown>) : payload;

      // Buffer for accumulating delta text
      if (!this.agentDeltaBuffer) {
        this.agentDeltaBuffer = new Map();
        this._agentDeltaTimestamps = new Map();
      }

      // Convert agent stream events to chat events
      // sessionKey may be absent from some gateway payloads — allow events through
      // and let the hook filter by its own session key
      if (stream === "assistant" && runId) {
        // Extract text from data - can be in delta, text, or content fields
        const delta = data?.delta as string | undefined;
        const text = data?.text as string | undefined;
        const content = data?.content as string | undefined;
        const assistantText = delta || text || content;

        if (assistantText !== undefined && assistantText !== "") {
          if (!this._deltaSourceOwner) this._deltaSourceOwner = new Map();
          // Skip if the "chat" path already owns this runId's buffer
          const owner = this._deltaSourceOwner.get(runId);
          if (owner === "chat") {
            // Don't double-accumulate — the chat path already handles this runId
            return;
          }
          if (!owner) this._deltaSourceOwner.set(runId, "agent");
          // Get existing buffered text for this run and accumulate
          const existingBuffer = this.agentDeltaBuffer.get(runId) || "";
          let newBuffer = existingBuffer + assistantText;
          // Cap individual buffer at 512KB to prevent OOM
          if (newBuffer.length > 524_288) newBuffer = newBuffer.slice(-524_288);
          this.agentDeltaBuffer.set(runId, newBuffer);
          this._agentDeltaTimestamps?.set(runId, Date.now());
          // Periodically prune stale entries (every 50 runs)
          if (this.agentDeltaBuffer.size > 50) this.pruneAgentDeltaBuffer();

          // Send accumulated text (not just delta) so the hook can replace content correctly
          const chatPayload: ChatEventPayload = {
            runId,
            sessionKey,
            state: "delta",
            message: { role: "assistant", content: [{ type: "text", text: newBuffer }] },
          };
          this.chatEventListeners.forEach((handler) => handler(chatPayload));
        }
      }

      // Handle lifecycle end/error - convert to final/error chat event.
      // Every lifecycle "end" emits state:"final". The chat hook uses a
      // debounce to avoid premature finalization — new delta events from
      // still-active agents cancel the debounce.
      if (stream === "lifecycle" && runId) {
        const phase = data?.phase as string;
        if (phase === "end") {
          // Get buffered text for this run
          const bufferedText = this.agentDeltaBuffer.get(runId) || "";
          this.agentDeltaBuffer.delete(runId);
          this._agentDeltaTimestamps?.delete(runId);
          this._deltaSourceOwner?.delete(runId);
          // Prune stale entries (agents that crashed without lifecycle end)
          this.pruneAgentDeltaBuffer();

          const chatPayload: ChatEventPayload = {
            runId,
            sessionKey,
            state: "final",
            message: bufferedText
              ? { role: "assistant", content: [{ type: "text", text: bufferedText }], timestamp: Date.now() }
              : undefined,
          };
          this.chatEventListeners.forEach((handler) => handler(chatPayload));
        } else if (phase === "error") {
          this.agentDeltaBuffer.delete(runId);
          this._agentDeltaTimestamps?.delete(runId);
          this._deltaSourceOwner?.delete(runId);
          const errorMsg = (data?.error || data?.errorMessage) as string | undefined;
          const chatPayload: ChatEventPayload = {
            runId,
            sessionKey,
            state: "error",
            errorMessage: errorMsg || "Agent error",
          };
          this.chatEventListeners.forEach((handler) => handler(chatPayload));
        }
      }

      // Handle tool events — real-time display matching OpenClaw's 3-phase protocol:
      //   phase "start"  → show tool card with spinner (executing)
      //   phase "update" → ignored (partial output with empty content causes premature completion)
      //   phase "result" → show completed result
      if (stream === "tool" && runId) {
        const phase = (data?.phase as string) || "";
        const toolName = (data?.name || data?.toolName || data?.tool_name) as string | undefined;
        const toolCallId = (data?.callId || data?.id || data?.toolCallId || data?.tool_call_id) as string | undefined;
        const rawInput = data?.input !== undefined ? data.input : (data?.args !== undefined ? data.args : data?.arguments);
        // "result" phase uses data.result, "update" phase uses data.partialResult
        const rawOutput = data?.output !== undefined ? data.output
          : (data?.result !== undefined ? data.result
          : data?.partialResult);
        const toolError = (data?.error || data?.errorMessage) as string | undefined;
        const isError = data?.isError === true || !!toolError;
        const toolInput = rawInput !== undefined ? (typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput)) : undefined;
        const toolOutput = rawOutput !== undefined ? (typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput)) : undefined;

        if (toolCallId && toolName) {
          if (phase === "start") {
            // Tool execution started — show card with spinner
            const chatPayload: ChatEventPayload = {
              runId,
              sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                tool_calls: [{
                  id: toolCallId,
                  type: "function",
                  function: { name: toolName, arguments: toolInput || "{}" },
                }],
              },
            };
            this.chatEventListeners.forEach((handler) => handler(chatPayload));
          } else if (phase === "result") {
            // Tool completed — show final result.
            // Skipping phase:"update" events: they carry partial/empty output that would
            // prematurely mark the tool as "completed" in useUnifiedToolState.
            const chatPayload: ChatEventPayload = {
              runId,
              sessionKey,
              state: "delta",
              message: {
                role: "toolResult",
                toolCallId,
                toolName,
                content: toolOutput || "",
                isError,
              },
            };
            this.chatEventListeners.forEach((handler) => handler(chatPayload));
          }
        }
      }
      return;
    }

    // Emit to generic event handlers
    if (msg.type === "event" && typeof event === "string") {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.forEach((handler) => handler(msg));
      }
    }
  },

  /** Subscribe to chat events */
  onChatEvent(callback: (payload: ChatEventPayload) => void): () => void {
    this.chatEventListeners.add(callback);
    return () => this.chatEventListeners.delete(callback);
  },

  /** Subscribe to a named event (e.g. "device_connected", "device_disconnected") */
  on(event: string, callback: (msg: Record<string, unknown>) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
    return () => this.eventHandlers.get(event)?.delete(callback);
  },

  /** Send a chat message */
  sendChatMessage(params: { sessionKey: string; message: string; deliver?: boolean; idempotencyKey?: string; attachments?: unknown[] }): Promise<unknown> {
    return this.request("chat.send", {
      sessionKey: params.sessionKey,
      message: params.message,
      deliver: params.deliver ?? false,
      idempotencyKey: params.idempotencyKey || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      attachments: params.attachments,
    });
  },

  /** Abort an in-progress chat run (longer timeout: hub relay can be slow) */
  abortChat(params: { sessionKey: string; runId?: string }): Promise<unknown> {
    return this.request(
      "chat.abort",
      {
        sessionKey: params.sessionKey,
        ...(params.runId && { runId: params.runId }),
      },
      60_000
    );
  },

  /** Get chat history */
  getChatHistory(sessionKey: string, limit: number = 200): Promise<{ messages?: unknown[] }> {
    return this.request("chat.history", { sessionKey, limit });
  },

  /** List available models */
  listModels(): Promise<{ models: Array<{ id: string; provider: string; displayName?: string }> }> {
    return this.request("models.list", {});
  },

  /** Get session details (including model) */
  getSession(key: string): Promise<unknown> {
    return this.request("sessions.get", { key });
  },

  /** Patch session properties (including model) */
  patchSession(key: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.request("sessions.patch", { key, ...patch });
  },

  /** Get agent identity (avatar, name, emoji) from OpenClaw.
   *  Accepts agentId, sessionKey, or both (matches gateway handler). */
  async getAgentIdentity(params: { agentId?: string; sessionKey?: string }): Promise<{ agentId: string; name?: string; avatar?: string; emoji?: string } | null> {
    try {
      return await this.request<{ agentId: string; name?: string; avatar?: string; emoji?: string }>("agent.identity.get", params);
    } catch {
      return null;
    }
  },

  /** Reset session — archives old transcript and creates a fresh session */
  resetSession(key: string): Promise<unknown> {
    return this.request("sessions.reset", { key, reason: "new" });
  },

  /** In-flight + short-lived cache for `sessions.list` — every caller sends
   * the same `{ limit: 200 }` request and filters client-side, so a single
   * WS round-trip can satisfy many concurrent callers. */
  _sessionsListInflight: null as Promise<{ sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; model?: string; modelProvider?: string; thinkingLevel?: string }> }> | null,
  _sessionsListCache: null as { data: { sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; model?: string; modelProvider?: string; thinkingLevel?: string }> }; ts: number } | null,
  _sessionsListCacheTTL: 2000, // 2s TTL

  /** Get list of sessions for an agent */
  async listSessions(agentId: string, limit: number = 50): Promise<{ sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; model?: string; modelProvider?: string; thinkingLevel?: string }> }> {
    // Deduplicate: reuse in-flight request or short-lived cache
    let allSessions: { sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; model?: string; modelProvider?: string; thinkingLevel?: string }> };
    const cached = this._sessionsListCache;
    if (cached && Date.now() - cached.ts < this._sessionsListCacheTTL) {
      allSessions = cached.data;
    } else if (this._sessionsListInflight) {
      allSessions = await this._sessionsListInflight;
    } else {
      const req = this.request<typeof allSessions>("sessions.list", { limit: 200 })
        .finally(() => { this._sessionsListInflight = null; });
      this._sessionsListInflight = req;
      allSessions = await req;
      this._sessionsListCache = { data: allSessions, ts: Date.now() };
    }

    if (!allSessions?.sessions) {
      console.warn("[Gateway WS] sessions.list returned no sessions array. Raw response:", allSessions);
      return { sessions: [] };
    }
    // Filter to only sessions for this agent
    const prefix = `agent:${agentId}:`;
    const agentSessions = allSessions.sessions.filter(s => s.key.startsWith(prefix));
    if (allSessions.sessions.length > 0 && agentSessions.length === 0) {
      console.warn(`[Gateway WS] sessions.list returned ${allSessions.sessions.length} sessions but none matched prefix "${prefix}". Keys:`, allSessions.sessions.map(s => s.key));
    }
    // Sort by updatedAt descending (most recent first)
    agentSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    // Return top N
    return { sessions: agentSessions.slice(0, limit) };
  },

  /** Get session info including model by session key */
  _sessionModelUnsupported: false,
  async getSessionModel(sessionKey: string): Promise<string | null> {
    // Skip if previous calls timed out (hub relay may not support sessions.list)
    if (this._sessionModelUnsupported) return null;
    try {
      // Parse agentId from session key (format: agent:xxx:...)
      const parts = sessionKey.split(':');
      if (parts.length < 2) return null;
      const agentId = parts[1];

      const result = await this.listSessions(agentId, 200);
      const session = result.sessions?.find(s => s.key === sessionKey);
      return session?.model || null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("timed out")) {
        this._sessionModelUnsupported = true;
      }
      return null;
    }
  },

  startPing() {
    this.stopPing();
    this._lastPong = Date.now();
    this._pingTimer = setInterval(() => {
      if (Date.now() - this._lastPong > this._PONG_TIMEOUT) {
        console.warn("[Gateway WS] No pong received in", this._PONG_TIMEOUT, "ms — forcing reconnect");
        this.stopPing();
        if (this.ws) {
          try { this.ws.close(); } catch { /* ignore */ }
        }
        return;
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping", payload: { clientTime: Date.now() } }));
        } catch { /* ignore send errors */ }
      }
    }, this._PING_INTERVAL);
  },

  stopPing() {
    if (this._pingTimer != null) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  },

  connect(wsUrl: string, options: GatewayConnectOptions = {}) {
    const sameUrl = this.wsUrl === wsUrl;
    const sameToken = this.token === (options.token ?? null);
    if (sameUrl && sameToken && this.ws != null && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      // Update device routing even when reusing the connection — the active
      // device may have changed (e.g. user switched to a different machine).
      if (options.hubDeviceId !== undefined) {
        this.hubDeviceId = options.hubDeviceId ?? null;
      }
      if (options.hubMode !== undefined) {
        this.hubMode = !!options.hubMode;
      }
      return;
    }
    const token = options.token ?? null;

    // Clean up existing connection. IMPORTANT: detach handlers from the old WS
    // BEFORE closing it. Otherwise the old WS's onclose fires asynchronously
    // after the new WS is created and clobbers this.ws with null.
    this.stopPing();
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws != null) {
      const oldWs = this.ws;
      oldWs.onopen = null;
      oldWs.onmessage = null;
      oldWs.onerror = null;
      oldWs.onclose = null;
      this.ws = null;
      try { oldWs.close(); } catch { /* ignore */ }
    }
    this.agentDeltaBuffer?.clear();
    this.agentDeltaBuffer = null;

    this.wsUrl = wsUrl;
    this.token = token;
    this.hubMode = !!options.hubMode;
    this.hubDeviceId = options.hubDeviceId ?? null;
    // Increment generation BEFORE creating the new WebSocket. Stale handlers
    // from any previous connection will see a mismatched generation and bail.
    this._connectionGeneration++;
    const gen = this._connectionGeneration;
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.setState(false, e instanceof Error ? e.message : "WebSocket failed");
      this.scheduleReconnect();
      return;
    }

    // Capture the WS instance so handlers can guard against stale callbacks.
    // The generation counter (`gen`) is the primary guard — it catches async
    // onclose/onerror events that fire after a new connection has been created,
    // even if `this.ws` was briefly set to the same value.
    const currentWs = this.ws;

    this.ws.onopen = () => {
      if (gen !== this._connectionGeneration) return; // stale
      this.reconnectAttempt = 0;
      this.startPing();
      // In hub mode, the hub authenticates via JWT and doesn't use the
      // gateway's challenge-response handshake. Mark connected immediately.
      if (this.hubMode) {
        this.setState(true, null);
      }
    };
    this.ws.onmessage = (ev: MessageEvent) => {
      if (gen !== this._connectionGeneration) return; // stale
      try {
        const msg = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (!msg) return;
        this.handleMessage(msg);
      } catch {
        /* ignore parse errors */
      }
    };
    this.ws.onerror = () => {
      if (gen !== this._connectionGeneration) return; // stale
      this.setState(false, this.error ?? "Connection failed");
    };
    this.ws.onclose = (ev: CloseEvent) => {
      if (gen !== this._connectionGeneration) return; // stale
      this.stopPing();
      const { code, reason } = ev;
      this.ws = null;
      const connectionRefused = code === 1006 || (reason && /refused|ECONNREFUSED/i.test(String(reason)));
      const isNormalClose = code === 1000;
      const err = connectionRefused
        ? "Gateway not running. Start the OpenClaw app or run: openclaw gateway run"
        : isNormalClose ? null : reason && String(reason).trim() ? String(reason) : `Closed (${code})`;
      // Reject all pending requests so callers fail fast instead of waiting 30s
      if (this.pendingRequests.size > 0) {
        const closeError = new Error(err || "WebSocket closed");
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(closeError);
        }
        this.pendingRequests.clear();
      }
      this.setState(false, err);
      this.scheduleReconnect();
    };
  },

  scheduleReconnect() {
    if (!this.wsUrl || this.reconnectTimer != null) return;
    const delay = RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, MAX_RECONNECT_ATTEMPTS);
    const url = this.wsUrl;
    const token = this.token;
    const hubMode = this.hubMode;
    const hubDeviceId = this.hubDeviceId;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      // In hub mode, re-fetch the active device before reconnecting — the
      // device may have changed while we were disconnected.
      if (hubMode) {
        try {
          const config = await getGatewayConfig();
          if (config.gatewayUrl && config.hubMode) {
            connectGatewayWs(config.gatewayUrl, {
              token: config.token,
              hubMode: true,
              hubDeviceId: config.hubDeviceId,
            });
            return;
          }
        } catch {
          /* fall through to reconnect with captured values */
        }
      }
      if (url) this.connect(url, { token, hubMode: hubMode || undefined, hubDeviceId: hubDeviceId || undefined });
    }, delay);
  },

  disconnect() {
    this.stopPing();
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    if (this.ws != null) {
      const oldWs = this.ws;
      oldWs.onopen = null;
      oldWs.onmessage = null;
      oldWs.onerror = null;
      oldWs.onclose = null;
      this.ws = null;
      try { oldWs.close(); } catch { /* ignore */ }
    }
    this.wsUrl = null;
    this.token = null;
    this.hubMode = false;
    this.hubDeviceId = null;
    this.agentDeltaBuffer?.clear();
    this.agentDeltaBuffer = null;
    this._sessionsListInflight = null;
    this._sessionsListCache = null;
    this.setState(false, null);
  },

  /** Prune stale entries from agentDeltaBuffer (entries older than maxAgeMs) */
  _agentDeltaTimestamps: null as Map<string, number> | null,
  pruneAgentDeltaBuffer(maxAgeMs = 120_000) {
    if (!this.agentDeltaBuffer || !this._agentDeltaTimestamps) return;
    const now = Date.now();
    for (const [runId, ts] of this._agentDeltaTimestamps) {
      if (now - ts > maxAgeMs) {
        this.agentDeltaBuffer.delete(runId);
        this._agentDeltaTimestamps.delete(runId);
      }
    }
  },

  getState(): GatewayConnectionState {
    return { connected: this.connected, error: this.error };
  },

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  },

  /** Check if connected */
  isConnected(): boolean {
    return this.connected;
  },

  /** Immediately attempt to reconnect (resets backoff). Used on tab focus. */
  async reconnectNow() {
    if (this.connected || !this.wsUrl) return;
    // Cancel any pending backoff timer
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    // In hub mode, fetch fresh config (device/token may have changed)
    if (this.hubMode) {
      try {
        const config = await getGatewayConfig();
        if (config.gatewayUrl && config.hubMode) {
          connectGatewayWs(config.gatewayUrl, {
            token: config.token,
            hubMode: true,
            hubDeviceId: config.hubDeviceId,
          });
          return;
        }
      } catch { /* fall through */ }
    }
    this.connect(this.wsUrl, {
      token: this.token,
      hubMode: this.hubMode || undefined,
      hubDeviceId: this.hubDeviceId || undefined,
    });
  },
};

// Auto-reconnect when the browser tab regains focus.
// NOTE: This listener is intentionally never removed. `gatewayConnection` is a
// module-level singleton that lives for the entire page lifetime, so the
// listener's lifetime matches the singleton's. Removing it would require an
// explicit teardown API that no consumer currently needs.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !gatewayConnection.connected && gatewayConnection.wsUrl) {
      gatewayConnection.reconnectNow();
    }
  });
}

export function connectGatewayWs(wsUrl: string, options?: GatewayConnectOptions): void {
  let finalUrl = wsUrl;
  if (options?.hubMode && wsUrl) {
    // Convert hub HTTP URL to WebSocket dashboard URL
    finalUrl = wsUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/ws/dashboard";
    if (options.token) {
      const sep = finalUrl.includes("?") ? "&" : "?";
      finalUrl = `${finalUrl}${sep}token=${encodeURIComponent(options.token)}`;
    }
  }
  gatewayConnection.connect(finalUrl, options ?? {});
}

export function disconnectGatewayWs(): void {
  gatewayConnection.disconnect();
}

/**
 * Verify end-to-end connectivity through the full relay chain
 * (dashboard → hub → connector → OpenClaw gateway).
 * The hub WS being connected only means the dashboard can talk to the cloud —
 * this probe verifies OpenClaw is actually running and reachable on the device.
 */
export async function probeGatewayHealth(timeoutMs = 5000): Promise<{ healthy: boolean; error?: string }> {
  if (!gatewayConnection.connected) {
    return { healthy: false, error: "WebSocket not connected" };
  }
  try {
    await gatewayConnection.request("models.list", {}, timeoutMs);
    return { healthy: true };
  } catch (e) {
    return { healthy: false, error: e instanceof Error ? e.message : "Gateway not reachable" };
  }
}

export function getGatewayConnectionState(): GatewayConnectionState {
  return gatewayConnection.getState();
}

export function subscribeGatewayConnection(cb: () => void): () => void {
  return gatewayConnection.subscribe(cb);
}

/** Get gateway config — always returns hub connection info (no direct local gateway). */
export async function getGatewayConfig(): Promise<{ gatewayUrl: string; token: string | null; hubMode?: boolean; hubDeviceId?: string }> {
  let hubUrl: string | null = null;
  let token: string | null = null;

  // Step 1: Get hub URL and token from Electron preload or window cache
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      electronAPI?: { hyperClawBridge?: { getHubConfig?: () => { enabled: boolean; url: string; deviceId: string; jwt?: string } | null } };
      __hubConfig?: { enabled: boolean; url: string; deviceId: string; jwt?: string };
    };
    const hubCfg = w.__hubConfig?.enabled ? w.__hubConfig : w.electronAPI?.hyperClawBridge?.getHubConfig?.();
    if (hubCfg?.enabled && hubCfg.url) {
      hubUrl = hubCfg.url;
      token = hubCfg.jwt ?? null;
    }
  }

  // Step 2: Fall back to env var + session for URL/token
  if (!hubUrl) {
    try {
      const { getHubApiUrl, getUserToken } = await import("$/lib/hub-direct");
      hubUrl = getHubApiUrl();
      token = await getUserToken();
    } catch {
      /* hub not available */
    }
  }

  if (!hubUrl) return { gatewayUrl: "", token: null };

  // Step 3: Always resolve device ID dynamically to pick the active online device
  try {
    const { getActiveDeviceId, getUserToken } = await import("$/lib/hub-direct");
    const jwt = token || (await getUserToken());
    if (jwt) {
      const deviceId = await getActiveDeviceId(jwt);
      if (deviceId) {
        return { gatewayUrl: hubUrl, token, hubMode: true, hubDeviceId: deviceId };
      }
    }
  } catch {
    /* device resolution failed */
  }

  // Hub available but no device found
  return { gatewayUrl: hubUrl, token, hubMode: true };
}

/** Send a chat message via WebSocket */
export async function sendChatMessageWs(sessionKey: string, message: string): Promise<unknown> {
  const { connected } = getGatewayConnectionState();
  if (!connected) {
    const config = await getGatewayConfig();
    if (!config.gatewayUrl) throw new Error("No hub configured");
    connectGatewayWs(config.gatewayUrl, {
      token: config.token,
      hubMode: config.hubMode,
      hubDeviceId: config.hubDeviceId,
    });

    // Wait for connection (max 5s).
    // Only reject on errors when the connection is truly terminal (not
    // reconnecting). Transient errors during reconnection should be ignored —
    // the reconnect backoff will keep trying until the timeout fires.
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error("Connection timeout"));
      }, 5000);
      const unsub = subscribeGatewayConnection(() => {
        const state = getGatewayConnectionState();
        if (state.connected) {
          clearTimeout(timeout);
          unsub();
          resolve(true);
        } else if (state.error && !gatewayConnection.wsUrl) {
          // Only reject if the connection URL has been cleared — that means
          // the connection is truly dead (e.g. browser mode, no gateway).
          // If wsUrl is still set, reconnection is in progress and we should
          // keep waiting for the timeout.
          clearTimeout(timeout);
          unsub();
          reject(new Error(state.error));
        }
      });
    });
  }

  const idempotencyKey = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return gatewayConnection.request("chat.send", {
    sessionKey,
    message,
    idempotencyKey,
  });
}

/** Single day from gateway usage.cost response. */
export interface GatewayUsageDaily {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
}

/** Totals from gateway usage.cost response. */
export interface GatewayUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
}

/** Result shape from gateway usage.cost (daily + totals). */
export interface UsageCostPayload {
  updatedAt?: number;
  days?: number;
  daily?: GatewayUsageDaily[];
  totals?: GatewayUsageTotals;
  [key: string]: unknown;
}

/** Date interpretation for gateway (matches OpenClaw usage API). */
export type UsageDateMode = "utc" | "gateway" | "specific";

const LEGACY_USAGE_DATE_PARAMS_STORAGE_KEY = "openclaw.control.usage.date-params.v1";
const LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY = "__default__";
const LEGACY_MODE_RE = /unexpected property ['"]mode['"]/i;
const LEGACY_OFFSET_RE = /unexpected property ['"]utcoffset['"]/i;
const LEGACY_INVALID_RE = /invalid sessions\.usage params/i;

let legacyUsageDateParamsCache: Set<string> | null = null;

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

function loadLegacyUsageDateParamsCache(): Set<string> {
  const storage = getLocalStorage();
  if (!storage) return new Set<string>();
  try {
    const raw = storage.getItem(LEGACY_USAGE_DATE_PARAMS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as { unsupportedGatewayKeys?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.unsupportedGatewayKeys)) return new Set<string>();
    return new Set(
      (parsed.unsupportedGatewayKeys as string[])
        .filter((entry) => typeof entry === "string")
        .map((e) => e.trim())
        .filter(Boolean)
    );
  } catch {
    return new Set<string>();
  }
}

function getLegacyUsageDateParamsCache(): Set<string> {
  if (!legacyUsageDateParamsCache) {
    legacyUsageDateParamsCache = loadLegacyUsageDateParamsCache();
  }
  return legacyUsageDateParamsCache;
}

function persistLegacyUsageDateParamsCache(cache: Set<string>) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(
      LEGACY_USAGE_DATE_PARAMS_STORAGE_KEY,
      JSON.stringify({ unsupportedGatewayKeys: Array.from(cache) })
    );
  } catch {
    /* ignore */
  }
}

function normalizeGatewayCompatibilityKey(gatewayUrl?: string | null): string {
  const trimmed = gatewayUrl?.trim();
  if (!trimmed) return LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY;
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${pathname}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function shouldSendLegacyDateInterpretation(gatewayKey: string): boolean {
  return !getLegacyUsageDateParamsCache().has(gatewayKey);
}

function rememberLegacyDateInterpretation(gatewayKey: string) {
  const cache = getLegacyUsageDateParamsCache();
  cache.add(gatewayKey);
  persistLegacyUsageDateParamsCache(cache);
}

function toErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && typeof err.message === "string" && err.message.trim()) return err.message;
  if (err && typeof err === "object") {
    try {
      const s = JSON.stringify(err);
      if (s) return s;
    } catch {
      /* ignore */
    }
  }
  return "request failed";
}

function isLegacyDateInterpretationUnsupportedError(err: unknown): boolean {
  const message = toErrorMessage(err);
  return (
    LEGACY_INVALID_RE.test(message) &&
    (LEGACY_MODE_RE.test(message) || LEGACY_OFFSET_RE.test(message))
  );
}

function formatUtcOffset(timezoneOffsetMinutes: number): string {
  const offsetFromUtcMinutes = -timezoneOffsetMinutes;
  const sign = offsetFromUtcMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetFromUtcMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${minutes.toString().padStart(2, "0")}`;
}

export interface UsageDateRangeParams {
  startDate: string;
  endDate: string;
  timeZone?: "local" | "utc";
}

function buildDateInterpretationParams(
  timeZone: "local" | "utc",
  includeDateInterpretation = true
): { mode: UsageDateMode; utcOffset?: string } | undefined {
  if (!includeDateInterpretation) return undefined;
  if (timeZone === "utc") {
    return { mode: "utc" };
  }
  return {
    mode: "specific",
    utcOffset: formatUtcOffset(new Date().getTimezoneOffset()),
  };
}

/** Params for usage.cost and sessions.usage (same date-range design as OpenClaw control UI). */
export interface UsageFetchParams extends UsageDateRangeParams {
  timeZone?: "local" | "utc";
  /** Max sessions to return (sessions.usage only). Default 1000. */
  limit?: number;
}

/** Session usage entry (minimal shape from gateway sessions.usage). */
export interface SessionsUsageEntry {
  key: string;
  label?: string;
  sessionId?: string;
  updatedAt?: number;
  agentId?: string;
  channel?: string;
  model?: string;
  modelProvider?: string;
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    inputCost?: number;
    outputCost?: number;
    cacheReadCost?: number;
    cacheWriteCost?: number;
    missingCostEntries: number;
    firstActivity?: number;
    lastActivity?: number;
    activityDates?: string[];
  };
  [key: string]: unknown;
}

/** Result shape from gateway sessions.usage (sessions + totals + aggregates). */
export interface SessionsUsageResult {
  updatedAt: number;
  startDate: string;
  endDate: string;
  sessions: SessionsUsageEntry[];
  totals: GatewayUsageTotals;
  aggregates: {
    messages?: { total: number; user: number; assistant: number; toolCalls: number; toolResults: number; errors: number };
    tools?: { totalCalls: number; uniqueTools: number; tools: Array<{ name: string; count: number }> };
    byModel?: Array<{ provider?: string; model?: string; count: number; totals: GatewayUsageTotals }>;
    byProvider?: Array<{ provider?: string; model?: string; count: number; totals: GatewayUsageTotals }>;
    byAgent?: Array<{ agentId: string; totals: GatewayUsageTotals }>;
    byChannel?: Array<{ channel: string; totals: GatewayUsageTotals }>;
    [key: string]: unknown;
  };
}

/** Tracks whether the current gateway supports sessions.usage.
 * After an "unknown method" error, skip future calls until reconnection. */
let _sessionsUsageSupported: boolean | null = null;

// Reset the flag when the gateway reconnects (new gateway may support it)
subscribeGatewayConnection(() => {
  const state = getGatewayConnectionState();
  if (state.connected) {
    _sessionsUsageSupported = null; // re-probe on next call
  }
});

/** Load both usage.cost and sessions.usage in parallel.
 * Matches OpenClaw's exact pattern (controllers/usage.ts):
 *   - Both requests via client.request() — errors propagate from both
 *   - Legacy fallback: if gateway rejects mode/utcOffset, retry both without
 *   - sessions.usage is primary (totals), usage.cost is secondary (daily chart)
 */
export async function loadUsageWs(params: UsageFetchParams): Promise<{
  usageCost: UsageCostPayload;
  sessionsUsage: SessionsUsageResult | null;
}> {
  const { startDate, endDate, timeZone = "local", limit = 1000 } = params;

  const { connected } = getGatewayConnectionState();
  if (!connected) {
    return {
      usageCost: { error: "Gateway not connected" } as UsageCostPayload,
      sessionsUsage: null,
    };
  }

  let gatewayKey = LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY;
  try {
    const config = await getGatewayConfig();
    gatewayKey = normalizeGatewayCompatibilityKey(config.gatewayUrl);
  } catch {
    /* use default key */
  }

  // Mirrors OpenClaw: both requests in Promise.all, errors propagate from both
  const runUsageRequests = async (includeDateInterpretation: boolean) => {
    const dateInterpretation = buildDateInterpretationParams(timeZone, includeDateInterpretation);
    return await Promise.all([
      gatewayConnection.request<SessionsUsageResult>("sessions.usage", {
        startDate,
        endDate,
        ...dateInterpretation,
        limit,
        includeContextWeight: true,
      }, 60000),
      gatewayConnection.request<UsageCostPayload>("usage.cost", {
        startDate,
        endDate,
        ...dateInterpretation,
      }),
    ]);
  };

  // If we already know sessions.usage isn't supported, only fetch usage.cost
  if (_sessionsUsageSupported === false) {
    try {
      const dateInterpretation = buildDateInterpretationParams(
        timeZone,
        shouldSendLegacyDateInterpretation(gatewayKey),
      );
      const usageCost = await gatewayConnection.request<UsageCostPayload>("usage.cost", {
        startDate,
        endDate,
        ...dateInterpretation,
      });
      return { usageCost: usageCost ?? ({} as UsageCostPayload), sessionsUsage: null };
    } catch {
      return { usageCost: {} as UsageCostPayload, sessionsUsage: null };
    }
  }

  const includeDateInterpretation = shouldSendLegacyDateInterpretation(gatewayKey);
  try {
    const [sessionsResult, costResult] = await runUsageRequests(includeDateInterpretation);
    _sessionsUsageSupported = true;
    return {
      usageCost: costResult ?? ({} as UsageCostPayload),
      sessionsUsage: sessionsResult ?? null,
    };
  } catch (err) {
    // Legacy fallback: if gateway rejects mode/utcOffset, retry both without
    if (includeDateInterpretation && isLegacyDateInterpretationUnsupportedError(err)) {
      rememberLegacyDateInterpretation(gatewayKey);
      try {
        const [sessionsResult, costResult] = await runUsageRequests(false);
        _sessionsUsageSupported = true;
        return {
          usageCost: costResult ?? ({} as UsageCostPayload),
          sessionsUsage: sessionsResult ?? null,
        };
      } catch (retryErr) {
        // If retry also fails, check if sessions.usage is unsupported
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (retryMsg.includes("unknown method")) {
          _sessionsUsageSupported = false;
        }
        throw retryErr;
      }
    }

    // Check if sessions.usage specifically is unsupported
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unknown method")) {
      _sessionsUsageSupported = false;
      // sessions.usage not supported — fall back to usage.cost only
      try {
        const dateInterpretation = buildDateInterpretationParams(timeZone, includeDateInterpretation);
        const usageCost = await gatewayConnection.request<UsageCostPayload>("usage.cost", {
          startDate,
          endDate,
          ...dateInterpretation,
        });
        return { usageCost: usageCost ?? ({} as UsageCostPayload), sessionsUsage: null };
      } catch {
        return { usageCost: {} as UsageCostPayload, sessionsUsage: null };
      }
    }

    throw err;
  }
}
