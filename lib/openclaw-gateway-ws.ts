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
const gatewayConnection = {
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
          console.log("[Gateway WS] Response OK");
          pending.resolve(msg.payload);
        } else {
          console.log("[Gateway WS] Response Error:", msg.error);
          pending.reject(new Error((msg.error as string) || "Request failed"));
        }
        return;
      }
      // No pending request: may be connect response (hello-ok)
      if (msg.ok === true && (msg.payload as Record<string, unknown>)?.type === "hello-ok") {
        this.setState(true, null);
        console.log("[Gateway WS] Handshake complete - connected!");
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
        console.warn("[Gateway WS] No auth token (config gateway.auth.token or OPENCLAW_GATEWAY_PASSWORD). Signing may fail.");
      }

      // Sign the challenge using Electron API
      signConnectChallenge({
        clientId: "gateway-client",
        clientMode: "backend",
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        token: tokenToUse ?? undefined,
        nonce: nonce,
      }).then((signed) => {
        if (signed && !signed.error && signed.device && signed.client) {
          console.log("[Gateway WS] Sending signed connect request");
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
    // Log other events
    console.log("[Gateway WS] Event:", msg.event, msg);
  },

  connect(wsUrl: string, options: GatewayConnectOptions = {}) {
    const sameUrl = this.wsUrl === wsUrl;
    const sameToken = this.token === (options.token ?? null);
    if (sameUrl && sameToken && this.ws != null && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const token = options.token ?? null;
    this.disconnect();
    this.wsUrl = wsUrl;
    this.token = token;
    console.log("[Gateway WS] Connecting to:", wsUrl, "token:", !!token);
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this.setState(false, e instanceof Error ? e.message : "WebSocket failed");
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      console.log("[Gateway WS] Socket opened, waiting for challenge...");
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
      console.log("[Gateway WS] Got config:", { gatewayUrl, hasToken: !!token });
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
  console.log("[Gateway WS] Sending chat.send:", { sessionKey, message, idempotencyKey });
  return gatewayConnection.request("chat.send", {
    sessionKey,
    message,
    idempotencyKey,
  });
}
