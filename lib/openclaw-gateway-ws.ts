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
  listeners: new Set<() => void>(),
  pendingRequests: new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>(),
  deviceIdentity: null as { deviceId: string; publicKeyPem: string } | null,
  // Chat event handlers
  chatEventListeners: new Set<(payload: ChatEventPayload) => void>(),
  // Buffer for accumulating delta text from agent events
  agentDeltaBuffer: null as Map<string, string> | null,

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
      if (stream === "assistant" && sessionKey && runId) {
        // Extract text from data - can be in delta, text, or content fields
        const delta = data?.delta as string | undefined;
        const text = data?.text as string | undefined;
        const content = data?.content as string | undefined;
        const assistantText = delta || text || content;

        if (assistantText !== undefined && assistantText !== "") {
          // Get existing buffered text for this run and accumulate
          const existingBuffer = this.agentDeltaBuffer.get(runId) || "";
          const newBuffer = existingBuffer + assistantText;
          this.agentDeltaBuffer.set(runId, newBuffer);
          this._agentDeltaTimestamps?.set(runId, Date.now());

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
      if (stream === "lifecycle" && sessionKey && runId) {
        const phase = data?.phase as string;
        if (phase === "end") {
          // Get buffered text for this run
          const bufferedText = this.agentDeltaBuffer.get(runId) || "";
          this.agentDeltaBuffer.delete(runId);
          this._agentDeltaTimestamps?.delete(runId);
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
      if (stream === "tool" && sessionKey && runId) {
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

  },

  /** Subscribe to chat events */
  onChatEvent(callback: (payload: ChatEventPayload) => void): () => void {
    this.chatEventListeners.add(callback);
    return () => this.chatEventListeners.delete(callback);
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

  /** Abort an in-progress chat run */
  abortChat(params: { sessionKey: string; runId?: string }): Promise<unknown> {
    return this.request("chat.abort", {
      sessionKey: params.sessionKey,
      ...(params.runId && { runId: params.runId }),
    });
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

  /** Get list of sessions for an agent */
  async listSessions(agentId: string, limit: number = 50): Promise<{ sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; model?: string; modelProvider?: string; thinkingLevel?: string }> }> {
    // Filter sessions by agent prefix
    const prefix = `agent:${agentId}:`;
    const result = await this.request<{ sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; model?: string; modelProvider?: string; thinkingLevel?: string }> }>("sessions.list", { limit: 200 });
    if (!result?.sessions) {
      return { sessions: [] };
    }
    // Filter to only sessions for this agent
    const agentSessions = result.sessions.filter(s => s.key.startsWith(prefix));
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

  connect(wsUrl: string, options: GatewayConnectOptions = {}) {
    const sameUrl = this.wsUrl === wsUrl;
    const sameToken = this.token === (options.token ?? null);
    if (sameUrl && sameToken && this.ws != null && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const token = options.token ?? null;
    this.disconnect();
    this.wsUrl = wsUrl;
    this.token = token;
    this.hubMode = !!options.hubMode;
    this.hubDeviceId = options.hubDeviceId ?? null;
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.setState(false, e instanceof Error ? e.message : "WebSocket failed");
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // In hub mode, the hub authenticates via JWT and doesn't use the
      // gateway's challenge-response handshake. Mark connected immediately.
      if (this.hubMode) {
        this.setState(true, null);
      }
    };
    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
        if (!msg) return;
        this.handleMessage(msg);
      } catch {
        /* ignore parse errors */
      }
    };
    this.ws.onerror = () => {
      this.setState(false, this.error ?? "Connection failed");
    };
    this.ws.onclose = (ev: CloseEvent) => {
      const { code, reason } = ev;
      this.ws = null;
      const connectionRefused = code === 1006 || (reason && /refused|ECONNREFUSED/i.test(String(reason)));
      const isNormalClose = code === 1000;
      const err = connectionRefused
        ? "Gateway not running. Start the OpenClaw app or run: openclaw gateway run"
        : isNormalClose ? null : reason && String(reason).trim() ? String(reason) : `Closed (${code})`;
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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (url) this.connect(url, { token, hubMode: hubMode || undefined, hubDeviceId: hubDeviceId || undefined });
    }, delay);
  },

  disconnect() {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    if (this.ws != null) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.wsUrl = null;
    this.token = null;
    this.hubMode = false;
    this.hubDeviceId = null;
    this.agentDeltaBuffer?.clear();
    this.agentDeltaBuffer = null;
    this.setState(false, null);
  },

  /** Prune stale entries from agentDeltaBuffer (entries older than maxAgeMs) */
  _agentDeltaTimestamps: null as Map<string, number> | null,
  pruneAgentDeltaBuffer(maxAgeMs = 300_000) {
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
};

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

export function getGatewayConnectionState(): GatewayConnectionState {
  return gatewayConnection.getState();
}

export function subscribeGatewayConnection(cb: () => void): () => void {
  return gatewayConnection.subscribe(cb);
}

/** Get gateway config — always returns hub connection info (no direct local gateway). */
export async function getGatewayConfig(): Promise<{ gatewayUrl: string; token: string | null; hubMode?: boolean; hubDeviceId?: string }> {
  // Priority 1: Hub config from window cache or Electron preload
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      electronAPI?: { hyperClawBridge?: { getHubConfig?: () => { enabled: boolean; url: string; deviceId: string; jwt?: string } | null } };
      __hubConfig?: { enabled: boolean; url: string; deviceId: string; jwt?: string };
    };
    const hubCfg = w.__hubConfig?.enabled ? w.__hubConfig : w.electronAPI?.hyperClawBridge?.getHubConfig?.();
    if (hubCfg?.enabled && hubCfg.url && hubCfg.deviceId) {
      return { gatewayUrl: hubCfg.url, token: hubCfg.jwt ?? null, hubMode: true, hubDeviceId: hubCfg.deviceId };
    }
  }

  // Priority 2: Hub direct — use env var + session
  try {
    const { getHubApiUrl, getUserToken, getActiveDeviceId } = await import("$/lib/hub-direct");
    const hubUrl = getHubApiUrl();
    const token = await getUserToken();
    if (hubUrl && token) {
      const deviceId = await getActiveDeviceId(token);
      if (deviceId) {
        return { gatewayUrl: hubUrl, token, hubMode: true, hubDeviceId: deviceId };
      }
    }
  } catch {
    /* hub not available */
  }

  // No hub configured — gateway not available
  return { gatewayUrl: "", token: null };
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

    // Wait for connection (max 5s)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
      const unsub = subscribeGatewayConnection(() => {
        const state = getGatewayConnectionState();
        if (state.connected) {
          clearTimeout(timeout);
          unsub();
          resolve(true);
        } else if (state.error) {
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

/** Fetch usage cost from the gateway via WebSocket (usage.cost).
 * Same design as OpenClaw: pass startDate/endDate and optional timeZone for date interpretation.
 * If startDate/endDate omitted, gateway uses default range (e.g. last 30 days).
 * When includeDateInterpretation is false (e.g. legacy gateway), mode/utcOffset are omitted.
 */
export async function getUsageCostWs(params?: {
  startDate?: string;
  endDate?: string;
  timeZone?: "local" | "utc";
  detail?: "off" | "tokens" | "full";
  includeDateInterpretation?: boolean;
}): Promise<UsageCostPayload> {
  const { connected } = getGatewayConnectionState();
  if (!connected) {
    return { error: "Gateway not connected" } as UsageCostPayload;
  }

  const requestParams: Record<string, unknown> = {};
  if (params?.detail) requestParams.detail = params.detail;
  if (params?.startDate) requestParams.startDate = params.startDate;
  if (params?.endDate) requestParams.endDate = params.endDate;
  const tz = params?.timeZone ?? "local";
  const includeDateInterpretation = params?.includeDateInterpretation !== false;
  const dateInterpretation = buildDateInterpretationParams(tz, includeDateInterpretation);
  if (dateInterpretation) {
    requestParams.mode = dateInterpretation.mode;
    if (dateInterpretation.utcOffset) requestParams.utcOffset = dateInterpretation.utcOffset;
  }

  const payload = await gatewayConnection.request<UsageCostPayload>("usage.cost", requestParams);
  return payload ?? {};
}

/** Tracks whether the current gateway supports sessions.usage.
 * After a timeout/failure, skip future calls until reconnection. */
let _sessionsUsageSupported: boolean | null = null;

// Reset the flag when the gateway reconnects (new gateway may support it)
subscribeGatewayConnection(() => {
  const state = getGatewayConnectionState();
  if (state.connected) {
    _sessionsUsageSupported = null; // re-probe on next call
  }
});

/** Fetch sessions usage from the gateway via WebSocket (sessions.usage).
 * Same design as OpenClaw: startDate, endDate, timeZone, limit, includeContextWeight.
 * When includeDateInterpretation is false (e.g. legacy gateway), mode/utcOffset are omitted.
 */
export async function getSessionsUsageWs(params: {
  startDate: string;
  endDate: string;
  timeZone?: "local" | "utc";
  limit?: number;
  includeContextWeight?: boolean;
  includeDateInterpretation?: boolean;
}): Promise<SessionsUsageResult | null> {
  const { connected } = getGatewayConnectionState();
  if (!connected) {
    console.warn("[Gateway WS] sessions.usage skipped: not connected");
    return null;
  }

  // Skip if we already know the gateway doesn't support this
  if (_sessionsUsageSupported === false) {
    console.warn("[Gateway WS] sessions.usage skipped: permanently disabled (_sessionsUsageSupported=false)");
    return null;
  }

  const includeDateInterpretation = params.includeDateInterpretation !== false;
  const dateInterpretation = buildDateInterpretationParams(
    params.timeZone ?? "local",
    includeDateInterpretation
  );
  const requestParams: Record<string, unknown> = {
    startDate: params.startDate,
    endDate: params.endDate,
    limit: params.limit ?? 1000,
    includeContextWeight: params.includeContextWeight ?? true,
  };
  if (dateInterpretation) {
    requestParams.mode = dateInterpretation.mode;
    if (dateInterpretation.utcOffset) requestParams.utcOffset = dateInterpretation.utcOffset;
  }

  console.log("[Gateway WS] sessions.usage requesting:", { ...requestParams, includeDateInterpretation });

  try {
    const payload = await gatewayConnection.request<SessionsUsageResult>("sessions.usage", requestParams, 60000);
    _sessionsUsageSupported = true;
    console.log("[Gateway WS] sessions.usage success:",
      payload?.totals ? `${payload.totals.totalTokens} tokens / $${payload.totals.totalCost}` : "no totals",
      `(${payload?.sessions?.length ?? 0} sessions)`
    );
    return payload ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Only mark as permanently unsupported if the gateway explicitly rejects the method.
    // Transient errors (timeouts, disconnects) should not disable future calls.
    if (msg.includes("unknown method")) {
      _sessionsUsageSupported = false;
      console.warn("[Gateway WS] sessions.usage not supported by this gateway, skipping future calls");
    } else {
      console.warn("[Gateway WS] sessions.usage error:", msg, { includeDateInterpretation, params: requestParams });
    }
    return null;
  }
}

/** Load both usage.cost and sessions.usage in parallel (same design as OpenClaw control UI).
 * Uses legacy fallback: if gateway rejects mode/utcOffset, retries without and remembers per gateway.
 * Returns cost payload and sessions result; sessions may be null if gateway does not support sessions.usage.
 */
export async function loadUsageWs(params: UsageFetchParams): Promise<{
  usageCost: UsageCostPayload;
  sessionsUsage: SessionsUsageResult | null;
}> {
  const { startDate, endDate, timeZone = "local", limit = 1000 } = params;

  let gatewayKey = LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY;
  try {
    const config = await getGatewayConfig();
    gatewayKey = normalizeGatewayCompatibilityKey(config.gatewayUrl);
  } catch {
    /* use default key */
  }

  const runRequests = (includeDateInterpretation: boolean) =>
    Promise.all([
      getUsageCostWs({
        startDate,
        endDate,
        timeZone,
        includeDateInterpretation,
      }),
      getSessionsUsageWs({
        startDate,
        endDate,
        timeZone,
        limit,
        includeContextWeight: true,
        includeDateInterpretation,
      }),
    ]);

  const { connected } = getGatewayConnectionState();
  if (!connected) {
    return {
      usageCost: { error: "Gateway not connected" } as UsageCostPayload,
      sessionsUsage: null,
    };
  }

  const includeDateInterpretation = shouldSendLegacyDateInterpretation(gatewayKey);
  try {
    const [usageCost, sessionsUsage] = await runRequests(includeDateInterpretation);

    // If sessions.usage failed but usage.cost succeeded, the legacy retry above
    // never fires (sessions catches its own errors). Retry sessions independently
    // without date interpretation params in case mode/utcOffset caused the failure.
    if (!sessionsUsage && includeDateInterpretation) {
      const retriedSessions = await getSessionsUsageWs({
        startDate,
        endDate,
        timeZone,
        limit,
        includeContextWeight: true,
        includeDateInterpretation: false,
      });
      if (retriedSessions) {
        return { usageCost: usageCost ?? {}, sessionsUsage: retriedSessions };
      }
    }

    return { usageCost: usageCost ?? {}, sessionsUsage };
  } catch (err) {
    if (
      includeDateInterpretation &&
      isLegacyDateInterpretationUnsupportedError(err)
    ) {
      rememberLegacyDateInterpretation(gatewayKey);
      const [usageCost, sessionsUsage] = await runRequests(false);
      return { usageCost: usageCost ?? {}, sessionsUsage };
    }
    throw err;
  }
}
