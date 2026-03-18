/**
 * Optimized Gateway WebSocket Client
 * Focus: Zero lag user experience
 *
 * Key optimizations:
 * - Heartbeat for fast dead connection detection
 * - Message buffering during disconnects
 * - Fast exponential backoff starting at 500ms
 * - Optimistic request handling
 */

// Lightweight EventEmitter - no external dependency
type EventCallback = (...args: unknown[]) => void;

class EventEmitter {
  private events: Map<string, Set<EventCallback>> = new Map();

  on(event: string, cb: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(cb);
  }

  off(event: string, cb: EventCallback): void {
    this.events.get(event)?.delete(cb);
  }

  emit(event: string, ...args: unknown[]): void {
    this.events.get(event)?.forEach((cb) => cb(...args));
  }

  once(event: string, cb: EventCallback): void {
    const wrapper = ((...args: unknown[]) => {
      cb(...args);
      this.off(event, wrapper);
    }) as EventCallback;
    this.on(event, wrapper);
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface GatewayMessage {
  type: "req" | "res" | "event";
  id?: string;
  method?: string;
  event?: string;
  params?: Record<string, unknown>;
  payload?: unknown;
  ok?: boolean;
  error?: string;
}

export interface QueuedMessage {
  method: string;
  params: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

// ============================================
// Chat-specific types (defined before GatewayClient class)
// ============================================

export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessageContentBlock {
  type: "text" | "image";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
  mimeType?: string;
  content?: string;
}

export interface ChatMessage {
  role: ChatMessageRole;
  content: ChatMessageContentBlock[] | string;
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

export interface ChatHistoryResponse {
  messages?: ChatMessage[];
  thinkingLevel?: string;
}

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  deliver?: boolean;
  idempotencyKey?: string;
  attachments?: Array<{
    type: "image";
    mimeType: string;
    content: string;
  }>;
}

export interface ChatAbortParams {
  sessionKey: string;
  runId?: string;
}

export type ChatEventState = "delta" | "final" | "aborted" | "error";

export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: ChatEventState;
  message?: unknown;
  errorMessage?: string;
}

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15000];
const MAX_QUEUE_SIZE = 100;
const PING_INTERVAL_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string = "";
  private token: string | null = null;
  private state: ConnectionState = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private messageQueue: QueuedMessage[] = [];
  private lastPingPong = 0;
  private signedCredentials: { device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null } | null = null;
  private connectNonce: string | null = null;

  // Hub mode: route through hub dashboard WebSocket instead of direct gateway
  private hubMode = false;
  private hubDeviceId: string | null = null;

  /** Guard to prevent concurrent flushMessageQueue calls */
  private _flushing = false;

  constructor() {
    super();
    this.lastPingPong = Date.now();
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Connect to gateway (or hub dashboard WebSocket in hub mode) */
  connect(url: string, token?: string | null, options?: { hubMode?: boolean; hubDeviceId?: string }): void {
    if (this.state === "connected" || this.state === "connecting") {
      if (this.url === url && this.token === (token ?? null)) {
        return; // Already connecting to same endpoint
      }
      this.disconnect();
    }

    this.url = url;
    this.token = token ?? null;
    this.hubMode = options?.hubMode ?? false;
    this.hubDeviceId = options?.hubDeviceId ?? null;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.url) return;

    this.setState("connecting");

    // In hub mode, connect to the hub's dashboard WebSocket
    const wsUrl = this.hubMode
      ? this.buildHubWsUrl()
      : this.url;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error("[GatewayClient] WebSocket creation failed:", e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.startPing();
      if (this.hubMode) {
        // Hub mode: JWT is in query param, no local auth needed
        this.setState("connected");
        this.flushMessageQueue();
        this.emit("connected");
      } else {
        this.authenticate();
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
      console.warn("[GatewayClient] WebSocket error");
    };

    this.ws.onclose = (ev: CloseEvent) => {
      this.stopPing();
      this.ws = null;

      if (ev.code === 1000) {
        this.setState("disconnected");
        return;
      }

      this.scheduleReconnect();
    };
  }

  private authenticate(): void {
    // Follow OpenClaw's pattern:
    // 1. Send initial connect with client info (but no device) to trigger challenge
    // 2. Wait for connect.challenge event
    // 3. Sign with nonce and re-send with device

    // Clear any previous nonce
    this.connectNonce = null;
    this.signedCredentials = null;

    // Send initial connect request with client info (no device yet - this triggers challenge)
    this.sendRaw({
      type: "req",
      id: randomId(),
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "gateway-client",
          version: "1.0.0",
          platform: typeof navigator !== "undefined" ? navigator.platform : "web",
          mode: "backend",
          instanceId: randomId(),
        },
        locale: "en-US",
        userAgent: "hyperclaw/1.0",
      },
    });
  }

  private async authenticateWithSignedCredentials(): Promise<void> {
    if (!this.connectNonce) {
      console.error("[GatewayClient] No nonce available for signing");
      return;
    }

    const creds = await this.getSignedCredentials(this.connectNonce);
    if (!creds) {
      console.error("[GatewayClient] Failed to get signed credentials");
      return;
    }

    this.signedCredentials = creds;
    this.sendRaw({
      type: "req",
      id: randomId(),
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: creds.client,
        device: creds.device,
        role: creds.role,
        scopes: creds.scopes,
        auth: creds.deviceToken ? { token: creds.deviceToken } : {},
        locale: "en-US",
        userAgent: "hyperclaw/1.0",
      },
    });
  }

  private async getSignedCredentials(nonce?: string): Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null } | null> {
    if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { openClaw?: { signConnectChallenge?: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI?.openClaw?.signConnectChallenge) {
      try {
        const result = await (window as unknown as { electronAPI: { openClaw: { signConnectChallenge: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI.openClaw.signConnectChallenge({
          clientId: "gateway-client",
          clientMode: "backend",
          role: "operator",
          scopes: ["operator.read", "operator.write", "operator.admin"],
          token: this.token,
          nonce: nonce || randomId(),
        });
        if (result && !result.error && result.device && result.client) {
          return result;
        }
      } catch (e) {
        console.error("[GatewayClient] Sign challenge error:", e);
      }
    }
    return null;
  }

  private handleMessage(msg: GatewayMessage): void {
    // Handle ping/pong
    if (msg.type === "event" && msg.event === "ping") {
      this.lastPingPong = Date.now();
      this.sendRaw({ type: "event", event: "pong", payload: {} });
      return;
    }

    // Handle connect challenge - store nonce and sign credentials
    if (msg.type === "event" && msg.event === "connect.challenge") {
      const payload = msg.payload as { nonce?: string };
      this.connectNonce = payload.nonce ?? null;
      // Now sign with the nonce and re-send connect
      void this.authenticateWithSignedCredentials();
      return;
    }

    // Handle hello-ok (connection confirmed)
    if (msg.ok === true && (msg.payload as Record<string, unknown>)?.type === "hello-ok") {
      this.setState("connected");
      this.flushMessageQueue();
      this.emit("connected");
      return;
    }

    // Handle response
    if (msg.type === "res" && msg.id) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.ok) {
          pending.resolve(msg.payload);
        } else {
          // Error can be a string or object { code, message }
          const errorObj = msg.error as { code?: string; message?: string } | undefined;
          if (typeof msg.error === "string") {
            pending.reject(new Error(msg.error || "Request failed"));
          } else {
            // Object format: { code, message }
            const errorMessage = errorObj?.message || errorObj?.code || "Request failed";
            pending.reject(new Error(errorMessage));
          }
        }
      }
      return;
    }

    // Emit event for others to handle
    this.emit("message", msg);
  }

  /** Send a request, queued if disconnected */
  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.state === "disconnected" || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // Queue the message for when we reconnect
        this.queueMessage(method, params, resolve as (v: unknown) => void, reject);
        return;
      }

      const id = randomId();
      // Store with unknown type cast - we'll cast back when calling
      this.pendingRequests.set(id, {
        resolve: (v: unknown) => resolve(v as T),
        reject
      });

      // In hub mode, wrap with deviceId and requestType for hub routing
      if (this.hubMode && this.hubDeviceId) {
        this.sendRaw({
          type: "req",
          id,
          method,
          params: {
            ...params,
            deviceId: this.hubDeviceId,
            requestType: method,
          },
        });
      } else {
        this.sendRaw({ type: "req", id, method, params });
      }

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private queueMessage(method: string, params: Record<string, unknown>, resolve: (v: unknown) => void, reject: (e: Error) => void): void {
    if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
      reject(new Error("Message queue full"));
      return;
    }
    this.messageQueue.push({ method, params, resolve, reject, timestamp: Date.now() });
    this.emit("queued", this.messageQueue.length);
  }

  private flushMessageQueue(): void {
    // Prevent concurrent flushes — if a flush is already in progress (e.g.
    // rapid reconnect cycles), skip. The in-progress flush already took
    // ownership of the queue.
    if (this._flushing) return;
    this._flushing = true;

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    let remaining = queue.length;
    const onDone = () => {
      remaining--;
      if (remaining <= 0) {
        this._flushing = false;
      }
    };

    queue.forEach((item, index) => {
      setTimeout(() => {
        this.request(item.method, item.params)
          .then((v) => { item.resolve(v); onDone(); })
          .catch((e) => { item.reject(e); onDone(); });
      }, index * 50); // Stagger requests to avoid burst
    });

    if (queue.length === 0) {
      this._flushing = false;
    }

    if (queue.length > 0) {
      this.emit("flushed", queue.length);
    }
  }

  private sendRaw(msg: GatewayMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit("stateChange", state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.setState("disconnected");
      this.emit("maxReconnectAttempts");
      return;
    }

    this.setState("reconnecting");
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;

    this.emit("reconnecting", this.reconnectAttempt, delay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    this.lastPingPong = Date.now();

    this.pingTimer = setInterval(() => {
      // Check if we've received pong recently
      if (Date.now() - this.lastPingPong > PING_INTERVAL_MS * 2) {
        console.warn("[GatewayClient] No pong received, forcing reconnect");
        this.ws?.close();
        return;
      }

      this.sendRaw({ type: "event", event: "ping", payload: {} });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** Build WebSocket URL for hub dashboard mode */
  private buildHubWsUrl(): string {
    // Convert HTTP(S) hub URL to WS(S) + dashboard path
    const base = this.url.replace(/^http/, "ws");
    const wsBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const tokenParam = this.token ? `token=${encodeURIComponent(this.token)}` : "";
    return `${wsBase}/ws/dashboard${tokenParam ? `?${tokenParam}` : ""}`;
  }

  /** Disconnect cleanly */
  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.setState("disconnected");
    this.messageQueue = [];
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.state === "connected" && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Get queue size (for UI indicators) */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  // ============================================
  // Chat-specific methods
  // ============================================

  /** Subscribe to chat events */
  private chatEventHandlers: Set<(payload: ChatEventPayload) => void> = new Set();

  /** Handle incoming chat events */
  private handleChatEventMessage(msg: GatewayMessage): void {
    if (msg.type === "event" && msg.event?.startsWith("chat.")) {
      const payload = msg.payload as ChatEventPayload;
      if (payload) {
        this.chatEventHandlers.forEach((handler) => handler(payload));
      }
    }
  }

  /** Subscribe to chat events - returns unsubscribe function */
  onChatEvent(callback: (payload: ChatEventPayload) => void): () => void {
    this.chatEventHandlers.add(callback);
    // Register message handler if first subscriber
    if (this.chatEventHandlers.size === 1) {
      this.on("message", this.handleChatEventMessage as EventCallback);
    }
    return () => {
      this.chatEventHandlers.delete(callback);
      if (this.chatEventHandlers.size === 0) {
        this.off("message", this.handleChatEventMessage as EventCallback);
      }
    };
  }

  /** Send a chat message */
  sendChatMessage(params: ChatSendParams): Promise<unknown> {
    return this.request("chat.send", {
      sessionKey: params.sessionKey,
      message: params.message,
      deliver: params.deliver ?? false,
      idempotencyKey: params.idempotencyKey,
      attachments: params.attachments,
    });
  }

  /** Abort an in-progress chat run */
  abortChat(params: ChatAbortParams): Promise<unknown> {
    return this.request("chat.abort", {
      sessionKey: params.sessionKey,
      ...(params.runId && { runId: params.runId }),
    });
  }

  /** Get chat history */
  getChatHistory(sessionKey: string, limit: number = 200): Promise<ChatHistoryResponse> {
    return this.request<ChatHistoryResponse>("chat.history", {
      sessionKey,
      limit,
    });
  }

  // ============================================
  // Session/Model methods
  // ============================================

  /** Get session details (including model) */
  getSession(key: string): Promise<unknown> {
    return this.request("sessions.get", { key });
  }

  /** Get session model by session key (via sessions.list) */
  async getSessionModel(sessionKey: string): Promise<string | null> {
    try {
      // Parse agentId from session key (format: agent:xxx:...)
      const parts = sessionKey.split(':');
      if (parts.length < 2) return null;
      const agentId = parts[1];

      const result = await this.request<{ sessions?: Array<{ key: string; model?: string }> }>("sessions.list", { agentId, limit: 200 });
      const session = result?.sessions?.find(s => s.key === sessionKey);
      return session?.model || null;
    } catch (error) {
      console.warn("[GatewayClient] Failed to get session model:", error);
      return null;
    }
  }

  /** Patch session properties (including model) */
  patchSession(key: string, patch: Record<string, unknown>): Promise<unknown> {
    return this.request("sessions.patch", { key, ...patch });
  }

  /** List available models */
  listModels(): Promise<{ models: Array<{ id: string; provider: string; displayName?: string }> }> {
    return this.request("models.list", {});
  }
}

// Singleton instance
let instance: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!instance) {
    instance = new GatewayClient();
  }
  return instance;
}

// Convenience functions matching previous API
export function connectGatewayWs(url: string, options?: { token?: string | null; hubMode?: boolean; hubDeviceId?: string }): void {
  getGatewayClient().connect(url, options?.token, {
    hubMode: options?.hubMode,
    hubDeviceId: options?.hubDeviceId,
  });
}

export function disconnectGatewayWs(): void {
  getGatewayClient().disconnect();
}

export function getGatewayConnectionState(): { connected: boolean; error: string | null } {
  const client = getGatewayClient();
  return {
    connected: client.isConnected(),
    error: null,
  };
}

export function subscribeGatewayConnection(cb: () => void): () => void {
  const client = getGatewayClient();
  client.on("stateChange", cb);
  return () => client.off("stateChange", cb);
}

export async function getGatewayConfig(): Promise<{ gatewayUrl: string; token: string | null; hubMode?: boolean; hubDeviceId?: string }> {
  // Use Hub direct — session token + env var (works cross-device)
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

export function buildGatewayWsUrl(gatewayUrl: string, token?: string | null): string {
  const base = gatewayUrl.replace(/^http/, "ws");
  if (token && typeof token === "string" && token.trim()) {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(token.trim())}`;
  }
  return base;
}

export async function sendChatMessageWs(sessionKey: string, message: string): Promise<unknown> {
  const client = getGatewayClient();
  const idempotencyKey = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return client.request("chat.send", { sessionKey, message, idempotencyKey });
}

// Re-export types for compatibility
export type { GatewayConnectionState } from "./openclaw-gateway-ws";
export type { UsageCostPayload, SessionsUsageResult, UsageFetchParams } from "./openclaw-gateway-ws";
