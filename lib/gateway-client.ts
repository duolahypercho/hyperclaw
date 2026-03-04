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

  constructor() {
    super();
    this.lastPingPong = Date.now();
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Connect to gateway */
  connect(url: string, token?: string | null): void {
    if (this.state === "connected" || this.state === "connecting") {
      if (this.url === url && this.token === (token ?? null)) {
        return; // Already connecting to same endpoint
      }
      this.disconnect();
    }

    this.url = url;
    this.token = token ?? null;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.url) return;

    this.setState("connecting");
    console.log("[GatewayClient] Connecting to:", this.url);

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error("[GatewayClient] WebSocket creation failed:", e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("[GatewayClient] Connected");
      this.reconnectAttempt = 0;
      this.startPing();
      this.authenticate();
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

      console.log("[GatewayClient] Connection closed:", ev.code, ev.reason);
      this.scheduleReconnect();
    };
  }

  private authenticate(): void {
    // Wait for challenge from server
    const checkChallenge = () => {
      if (this.state !== "connected") return;

      // Request challenge by sending empty connect to trigger server challenge
      this.sendRaw({
        type: "req",
        id: randomId(),
        method: "connect",
        params: {},
      });
    };

    // Try to get signed credentials from Electron
    this.getSignedCredentials().then((creds) => {
      if (!creds) {
        checkChallenge();
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
    });
  }

  private async getSignedCredentials(): Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null } | null> {
    if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { openClaw?: { signConnectChallenge?: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI?.openClaw?.signConnectChallenge) {
      try {
        const result = await (window as unknown as { electronAPI: { openClaw: { signConnectChallenge: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI.openClaw.signConnectChallenge({
          clientId: "gateway-client",
          clientMode: "backend",
          role: "operator",
          scopes: ["operator.read", "operator.write"],
          token: this.token,
          nonce: randomId(),
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

    // Handle connect challenge
    if (msg.type === "event" && msg.event === "connect.challenge") {
      const payload = msg.payload as { nonce?: string };
      this.authenticateWithNonce(payload.nonce ?? "");
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
          pending.reject(new Error(msg.error || "Request failed"));
        }
      }
      return;
    }

    // Emit event for others to handle
    this.emit("message", msg);
  }

  private async authenticateWithNonce(nonce: string): Promise<void> {
    let tokenToUse = this.token;
    if ((tokenToUse == null || tokenToUse === "") && this.url) {
      try {
        const url = new URL(this.url);
        tokenToUse = url.searchParams.get("token") ?? null;
      } catch {
        /* ignore */
      }
    }

    const creds = await this.getSignedCredentials();
    if (!creds) {
      console.error("[GatewayClient] Failed to sign challenge");
      return;
    }

    const authToken =
      (tokenToUse && String(tokenToUse).trim()) ||
      (creds.deviceToken && String(creds.deviceToken).trim()) ||
      "";

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
        auth: authToken ? { token: authToken } : {},
        locale: "en-US",
        userAgent: "hyperclaw/1.0",
      },
    });
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
      this.sendRaw({ type: "req", id, method, params });

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
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach((item, index) => {
      setTimeout(() => {
        this.request(item.method, item.params)
          .then(item.resolve)
          .catch(item.reject);
      }, index * 50); // Stagger requests to avoid burst
    });

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

    console.log(`[GatewayClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
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
export function connectGatewayWs(url: string, options?: { token?: string | null }): void {
  getGatewayClient().connect(url, options?.token);
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

export async function getGatewayConfig(): Promise<{ gatewayUrl: string; token: string | null }> {
  let gatewayUrl = "http://127.0.0.1:18789";
  let token: string | null = null;

  if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { openClaw?: { getGatewayConnectUrl?: () => Promise<{ gatewayUrl: string; token: string }> } } }).electronAPI?.openClaw?.getGatewayConnectUrl) {
    try {
      const config = await (window as unknown as { electronAPI: { openClaw: { getGatewayConnectUrl: () => Promise<{ gatewayUrl: string; token: string }> } } }).electronAPI.openClaw.getGatewayConnectUrl();
      gatewayUrl = config.gatewayUrl || gatewayUrl;
      token = config.token;
    } catch (e) {
      console.warn("[GatewayClient] Failed to get config:", e);
    }
  }
  return { gatewayUrl, token };
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
