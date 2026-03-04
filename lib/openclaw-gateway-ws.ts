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
  const base = gatewayHttpToWs(gatewayUrl || "http://127.0.0.1:18789");
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

export type GatewayConnectOptions = { token?: string | null };

const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Sign a connect challenge using Electron API */
async function signConnectChallenge(params: {
  clientId: string;
  clientMode: string;
  role?: string;
  scopes?: string[];
  token?: string | null;
  nonce: string;
}): Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string } | null> {
  if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { openClaw?: { signConnectChallenge?: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI?.openClaw?.signConnectChallenge) {
    try {
      return await (window as unknown as { electronAPI: { openClaw: { signConnectChallenge: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI.openClaw.signConnectChallenge(params);
    } catch (e) {
      console.error("[Gateway WS] Sign challenge error:", e);
      return null;
    }
  }
  console.error("[Gateway WS] signConnectChallenge not available");
  return null;
}

/** Singleton: one persistent gateway WebSocket */
export const gatewayConnection = {
  ws: null as WebSocket | null,
  wsUrl: null as string | null,
  token: null as string | null,
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
  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const id = randomId();
      this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const req = { type: "req", id, method, params };
      this.ws.send(JSON.stringify(req));
      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  },

  /** Handle incoming WebSocket messages */
  handleMessage(msg: Record<string, unknown>) {
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
      if (tokenToUse == null || tokenToUse === "") {
      }

      // Sign the challenge using Electron API
      signConnectChallenge({
        clientId: "gateway-client",
        clientMode: "backend",
        role: "operator",
        scopes: ["operator.read", "operator.write", "operator.admin"],
        token: tokenToUse ?? undefined,
        nonce: nonce,
      }).then((signed) => {
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
        } else {
          console.error("[Gateway WS] Failed to sign:", signed?.error);
          this.setState(false, signed?.error || "Failed to sign challenge");
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
    if (msg.type === "event" && typeof msg.event === "string" && msg.event.startsWith("agent.")) {
      const payload = msg.payload as Record<string, unknown>;
      const stream = payload?.stream as string;
      const sessionKey = payload?.sessionKey as string;
      const runId = payload?.runId as string;
      const data = payload?.data as Record<string, unknown>;

      // Buffer for accumulating delta text
      if (!this.agentDeltaBuffer) {
        this.agentDeltaBuffer = new Map();
      }

      // Convert agent stream events to chat events
      if (stream === "assistant" && sessionKey && runId) {
        // Extract text from data - can be in delta, text, or content fields
        const delta = data?.delta as string | undefined;
        const text = data?.text as string | undefined;
        const content = data?.content as string | undefined;
        const assistantText = delta || text || content;

        if (assistantText !== undefined && assistantText !== "") {
          // Get existing buffered text for this run
          const existingBuffer = this.agentDeltaBuffer.get(runId) || "";
          const newBuffer = existingBuffer + assistantText;
          this.agentDeltaBuffer.set(runId, newBuffer);

          // This is a delta event from agent stream
          const chatPayload: ChatEventPayload = {
            runId,
            sessionKey,
            state: "delta",
            message: { role: "assistant", content: [{ type: "text", text: assistantText }] },
          };
          this.chatEventListeners.forEach((handler) => handler(chatPayload));
        }
      }

      // Handle lifecycle end - convert to final with buffered content
      if (stream === "lifecycle" && sessionKey && runId) {
        const phase = data?.phase as string;
        if (phase === "end") {
          // Get buffered text for this run
          const bufferedText = this.agentDeltaBuffer.get(runId) || "";
          this.agentDeltaBuffer.delete(runId);

          const chatPayload: ChatEventPayload = {
            runId,
            sessionKey,
            state: "final",
            message: bufferedText
              ? { role: "assistant", content: [{ type: "text", text: bufferedText }], timestamp: Date.now() }
              : undefined,
          };
          this.chatEventListeners.forEach((handler) => handler(chatPayload));
        }
      }

      // Handle tool events - convert to toolResult messages for real-time display
      if (stream === "tool" && sessionKey && runId) {
        const toolName = data?.name as string | undefined;
        const toolCallId = data?.callId as string | undefined;
        const toolInput = data?.input as string | undefined;
        const toolOutput = data?.output as string | undefined;
        const toolError = data?.error as string | undefined;

        if (toolCallId && toolName) {
          // If we have output, show tool result
          if (toolOutput !== undefined) {
            const chatPayload: ChatEventPayload = {
              runId,
              sessionKey,
              state: "delta", // Use delta to show in real-time
              message: {
                role: "toolResult",
                toolCallId,
                toolName,
                content: toolOutput,
                isError: !!toolError,
              },
            };
            this.chatEventListeners.forEach((handler) => handler(chatPayload));
          } else if (toolInput !== undefined) {
            // Show tool call
            const chatPayload: ChatEventPayload = {
              runId,
              sessionKey,
              state: "delta",
              message: {
                role: "assistant",
                tool_calls: [{
                  id: toolCallId,
                  type: "function",
                  function: { name: toolName, arguments: toolInput },
                }],
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
  async getSessionModel(sessionKey: string): Promise<string | null> {
    try {
      // Parse agentId from session key (format: agent:xxx:...)
      const parts = sessionKey.split(':');
      if (parts.length < 2) return null;
      const agentId = parts[1];

      const result = await this.listSessions(agentId, 200);
      const session = result.sessions?.find(s => s.key === sessionKey);
      return session?.model || null;
    } catch (error) {
      console.warn("[GatewayWS] Failed to get session model:", error);
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
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.setState(false, e instanceof Error ? e.message : "WebSocket failed");
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (url) this.connect(url, { token });
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
    this.setState(false, null);
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
  gatewayConnection.connect(wsUrl, options ?? {});
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

/** Get gateway URL and token from Electron API */
export async function getGatewayConfig(): Promise<{ gatewayUrl: string; token: string | null }> {
  let gatewayUrl = "http://127.0.0.1:18789";
  let token: string | null = null;
  
  if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { openClaw?: { getGatewayConnectUrl?: () => Promise<{ gatewayUrl: string; token: string }> } } }).electronAPI?.openClaw?.getGatewayConnectUrl) {
    try {
      const config = await (window as unknown as { electronAPI: { openClaw: { getGatewayConnectUrl: () => Promise<{ gatewayUrl: string; token: string }> } } }).electronAPI.openClaw.getGatewayConnectUrl();
      gatewayUrl = config.gatewayUrl || gatewayUrl;
      token = config.token;
    } catch (e) {
      console.warn("[Gateway WS] Failed to get config:", e);
    }
  }
  return { gatewayUrl, token };
}

/** Send a chat message via WebSocket */
export async function sendChatMessageWs(sessionKey: string, message: string): Promise<unknown> {
  const { connected } = getGatewayConnectionState();
  if (!connected) {
    const { gatewayUrl, token } = await getGatewayConfig();
    const wsUrl = buildGatewayWsUrl(gatewayUrl, token);
    connectGatewayWs(wsUrl, { token });
    
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

  try {
    const payload = await gatewayConnection.request<SessionsUsageResult>("sessions.usage", requestParams);
    return payload ?? null;
  } catch (err) {
    console.warn("[Gateway WS] sessions.usage failed (older gateway?):", err);
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
