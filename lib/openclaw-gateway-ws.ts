/**
 * Connect to the OpenClaw gateway WebSocket from the renderer (browser context).
 * Gateway is at ws://127.0.0.1:<port> (default 18789). Protocol: connect.challenge → connect request → hello-ok.
 * Uses device identity from Electron for signing.
 */
import {
  getGatewayUnavailableMessage,
  isLocalConnectorContext,
  shouldBlockRemoteHubFallback,
} from "./local-connector-routing";

// Heartbeat/silent reply detection — matches OpenClaw's server-chat.ts filtering.
// Heartbeat runs produce agent events that bypass server-side chat suppression;
// this client-side filter prevents transient "ghost" messages that disappear on refresh.
const _SILENT_TOKENS = ["NO_REPLY", "HEARTBEAT_OK"];
const _SILENT_EXACT_RE = new RegExp(`^\\s*(${_SILENT_TOKENS.join("|")})\\s*$`);
const _SILENT_TRAILING_RE = new RegExp(`\\s*(${_SILENT_TOKENS.join("|")})\\s*$`);
/** True when the full text is ONLY a silent token (nothing else worth showing). */
function _isSilentReplyText(text: string): boolean {
  return _SILENT_EXACT_RE.test(text);
}
/** True when the text is building toward a silent token (streaming prefix). */
function _isSilentReplyPrefix(text: string): boolean {
  const trimmed = text.trim().toUpperCase();
  if (!trimmed) return false;
  return _SILENT_TOKENS.some((token) => token.startsWith(trimmed));
}
/** Strip a trailing silent token, returning the remaining meaningful text. */
function _stripSilentToken(text: string): string {
  return text.replace(_SILENT_TRAILING_RE, "").trim();
}

export function appendUniqueSuffix(base: string, suffix: string): string {
  if (!suffix) return base;
  if (!base) return suffix;
  if (base.endsWith(suffix)) return base;
  const maxOverlap = Math.min(base.length, suffix.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (base.slice(-overlap) === suffix.slice(0, overlap)) {
      return base + suffix.slice(overlap);
    }
  }
  return base + suffix;
}

export function resolveMergedStreamText(params: {
  previousText: string;
  nextText?: string;
  nextDelta?: string;
}): string {
  const previousText = params.previousText || "";
  const nextText = params.nextText || "";
  const nextDelta = params.nextDelta || "";

  if (nextText && previousText) {
    if (nextText.startsWith(previousText)) {
      return nextText;
    }
    if (previousText.startsWith(nextText) && !nextDelta) {
      return previousText;
    }
  }
  if (nextDelta) {
    return appendUniqueSuffix(previousText, nextDelta);
  }
  if (nextText) {
    return nextText;
  }
  return previousText;
}

export function stripCommittedPrefix(text: string, committedPrefix?: string): string {
  if (!text || !committedPrefix) return text;
  if (text.startsWith(committedPrefix)) {
    return text.slice(committedPrefix.length);
  }
  return text;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function extractOpenClawAgentId(sessionKey?: string): string | undefined {
  if (!sessionKey?.startsWith("agent:")) return undefined;
  const [, agentId] = sessionKey.split(":");
  return agentId || undefined;
}

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

export interface ConnectorHealth {
  ok?: boolean;
  connectorOnline?: boolean;
  gatewayConnected?: boolean;
  gatewayState?: "connected" | "disconnected" | "unknown" | string;
  bridge?: string;
  version?: string;
  uptime?: string;
  ts?: number;
}

// Chat event types
export type ChatEventState = "delta" | "final" | "aborted" | "error";

export interface ChatEventPayload {
  runId: string;
  sessionKey?: string;
  agentId?: string;
  state: ChatEventState;
  message?: unknown;
  errorMessage?: string;
}

// Notification event types (pushed when a long-running agent task completes)
export interface NotificationPayload {
  kind: string;       // e.g. "agent_completed"
  sessionKey: string;
  agentId: string;
  summary: string;
  runId?: string;
  duration?: number;   // ms
  timestamp: number;
}

export interface GatewaySessionListItem {
  key: string;
  label?: string;
  createdAt?: number;
  updatedAt?: number;
  status?: string;
  preview?: string;
  model?: string;
  modelProvider?: string;
  thinkingLevel?: string;
}

type OpenClawSessionListOptions = {
  includeDefault?: boolean;
  cronJobId?: string;
  cronJobIds?: string[];
};

export type GatewayConnectOptions = { token?: string | null; hubMode?: boolean; hubDeviceId?: string };

const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;
const GATEWAY_UNAVAILABLE_COOLDOWN_MS = 15_000;
const DEFAULT_MODELS_TIMEOUT_MS = 25_000;
const DEFAULT_SESSIONS_LIST_TIMEOUT_MS = 25_000;
const DEFAULT_CONNECTOR_HEALTH_TIMEOUT_MS = 5_000;
const GATEWAY_CLIENT_CAPS = ["tool-events"] as const;

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function isGatewayMethod(method: string): boolean {
  return (
    method.startsWith("chat.") ||
    method.startsWith("sessions.") ||
    method.startsWith("models.") ||
    method.startsWith("agents.") ||
    method.startsWith("agent.") ||
    method.startsWith("usage.") ||
    method.startsWith("skills.")
  );
}

export function isGatewayUnavailableErrorMessage(message: string): boolean {
  return /gateway not connected|pairing required|not paired|failed to communicate with device|device not connected|connector is offline|start the local connector|no hub configured/i.test(
    message
  );
}

async function requestGatewayViaLocalConnector<T>(
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> {
  const { bridgeInvoke } = await import("$/lib/hyperclaw-bridge-client");
  const result = await bridgeInvoke("gateway-request", {
    requestType: method,
    params,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  const wrapped = result as { success?: boolean; data?: unknown; error?: unknown };
  if (wrapped && typeof wrapped === "object" && "success" in wrapped && wrapped.success === false) {
    const message = typeof wrapped.error === "string" ? wrapped.error : `Gateway request ${method} failed`;
    throw new Error(message);
  }
  return (wrapped && "data" in wrapped ? wrapped.data : result) as T;
}

async function requestOpenClawLocalHistory(
  sessionKey: string,
  limit: number,
  maxChars?: number,
): Promise<{ messages?: unknown[] } | undefined> {
  const localOnly = shouldBlockRemoteHubFallback();
  if (!localOnly) return undefined;
  if (!sessionKey.startsWith("agent:")) {
    throw new Error("Local OpenClaw history requires an agent session key");
  }
  const { bridgeInvoke } = await import("$/lib/hyperclaw-bridge-client");
  const result = await bridgeInvoke("openclaw-local-history", {
    sessionKey,
    limit,
    ...(typeof maxChars === "number" ? { maxChars } : {}),
  }) as { success?: boolean; error?: string; messages?: unknown[]; source?: string; sessionKey?: string };
  if (result?.success === false) {
    throw new Error(result.error || "openclaw-local-history failed");
  }
  return result;
}

async function requestOpenClawLocalSessions(
  agentId: string,
  limit: number,
  options: OpenClawSessionListOptions = {},
): Promise<{ sessions?: GatewaySessionListItem[]; source?: string } | undefined> {
  if (!shouldBlockRemoteHubFallback()) return undefined;
  const { bridgeInvoke } = await import("$/lib/hyperclaw-bridge-client");
  const result = await bridgeInvoke("openclaw-local-sessions", {
    agentId,
    limit,
    ...(options.cronJobId ? { cronJobId: options.cronJobId } : {}),
    ...(options.cronJobIds?.length ? { cronJobIds: options.cronJobIds } : {}),
  }) as { success?: boolean; error?: string; sessions?: GatewaySessionListItem[]; source?: string };
  if (result?.success === false) {
    throw new Error(result.error || "openclaw-local-sessions failed");
  }
  return result;
}

type OpenClawLocalSessionArchiveMode = "archive" | "delete";

async function requestOpenClawLocalArchiveSession(
  sessionKey: string,
  mode: OpenClawLocalSessionArchiveMode = "archive",
): Promise<{ sessionKey?: string; agentId?: string; action?: string; source?: string }> {
  if (!shouldBlockRemoteHubFallback()) {
    throw new Error("Local OpenClaw archive requires local connector context");
  }
  if (!sessionKey.startsWith("agent:")) {
    throw new Error("Local OpenClaw archive requires an agent session key");
  }
  const { bridgeInvoke } = await import("$/lib/hyperclaw-bridge-client");
  const result = await bridgeInvoke("openclaw-local-archive-session", {
    sessionKey,
    mode,
  }) as { success?: boolean; error?: string; sessionKey?: string; agentId?: string; action?: string; source?: string };
  if (result?.success === false) {
    throw new Error(result.error || "openclaw-local-archive-session failed");
  }
  return result;
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
      const signed = await (window as unknown as { electronAPI: { openClaw: { signConnectChallenge: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }> } } }).electronAPI.openClaw.signConnectChallenge(params);
      if (signed && !signed.error && signed.device && signed.client) {
        return signed;
      }
    } catch (e) {
      console.error("[Gateway WS] Sign challenge error:", e);
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
  permanentlyFailed: false,
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  /** Monotonically increasing counter — incremented every time a new WebSocket
   *  is created. Stale onclose/onerror handlers compare their captured
   *  generation to the current value and bail out if they differ. */
  _connectionGeneration: 0,
  listeners: new Set<() => void>(),
  pendingRequests: new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; method: string }>(),
  pendingRequestTimeouts: new Map<string, ReturnType<typeof setTimeout>>(),
  deviceIdentity: null as { deviceId: string; publicKeyPem: string } | null,
  // Chat event handlers
  chatEventListeners: new Set<(payload: ChatEventPayload) => void>(),
  // Notification event handlers (agent task completion, etc.)
  notificationListeners: new Set<(payload: NotificationPayload) => void>(),
  // Generic event handlers keyed by event name (e.g. "device_connected")
  eventHandlers: new Map<string, Set<(msg: Record<string, unknown>) => void>>(),
  // Buffer for accumulating delta text from agent events
  agentDeltaBuffer: null as Map<string, string> | null,
  // Track which event source ("chat" or "agent") owns each runId's buffer.
  // The gateway may send the same delta through both chat.* and agent.* events;
  // only the first source to claim a runId is allowed to accumulate text.
  _deltaSourceOwner: null as Map<string, "chat" | "agent"> | null,
  // Turn-level text stream lock: the first event source ("chat" or "agent") to
  // emit a text delta claims the turn. The other source is suppressed entirely.
  // This handles the case where chat.* and agent.* events carry DIFFERENT runIds
  // for the same logical stream (so per-runId _deltaSourceOwner can't correlate).
  // Cleared with a 5s delay after terminal events so late-arriving events from
  // the suppressed path don't slip through the gap.
  _activeTextSource: null as "chat" | "agent" | null,
  _activeTextSourceTimer: null as ReturnType<typeof setTimeout> | null,
  // Track committed text segments per runId — when a tool "start" event arrives,
  // the current text buffer is committed here so the hook can create separate
  // text messages interleaved between tool groups.
  _committedSegments: null as Map<string, string> | null,
  // Agent stream events can omit sessionKey on assistant/tool frames. Cache the
  // lifecycle metadata by runId so every converted chat event remains scoped.
  _agentRunMetadata: null as Map<string, { sessionKey?: string; agentId?: string }> | null,

  // Local gateway liveness: OpenClaw emits tick/health events, but does not
  // accept browser-level ping frames. Treat any inbound frame as activity.
  _watchdogTimer: null as ReturnType<typeof setInterval> | null,
  _lastGatewayActivity: 0 as number,
  _WATCHDOG_INTERVAL: 30_000,
  _INACTIVITY_TIMEOUT: 60_000,
  _gatewayUnavailableUntil: 0 as number,

  notify() {
    this.listeners.forEach((cb) => cb());
  },

  /** Schedule delayed clearing of the turn-level text source lock.
   *  Late-arriving events from the suppressed path can arrive after lifecycle
   *  "end" / chat.final — the 2s delay ensures they're still blocked while
   *  keeping the window short enough that new turns aren't suppressed. */
  _scheduleTextSourceClear() {
    if (this._activeTextSourceTimer) clearTimeout(this._activeTextSourceTimer);
    this._activeTextSourceTimer = setTimeout(() => {
      this._activeTextSource = null;
      this._activeTextSourceTimer = null;
    }, 2000);
  },

  setState(connected: boolean, error: string | null) {
    if (this.connected === connected && this.error === error) return;
    this.connected = connected;
    this.error = error;
    this.notify();
  },

  /** Send a request over WebSocket and wait for response */
  request<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    if (
      (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.hubMode) &&
      shouldBlockRemoteHubFallback() &&
      isGatewayMethod(method)
    ) {
      return requestGatewayViaLocalConnector<T>(method, params, timeoutMs);
    }

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      if (this.hubMode && isGatewayMethod(method) && Date.now() < this._gatewayUnavailableUntil) {
        reject(new Error("Gateway not ready yet"));
        return;
      }
      const id = randomId();
      this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject, method });
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
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.pendingRequestTimeouts.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, timeout);
      this.pendingRequestTimeouts.set(id, timer);
    });
  },

  /** Handle incoming WebSocket messages */
  handleMessage(msg: Record<string, unknown>) {
    const msgType = msg.type as string;

    // Extract event name from top-level or nested payload (connector protocol)
    let event = msg.event as string | undefined;
    const payload = msg.payload as Record<string, unknown> | undefined;
    if (!event && payload && typeof payload.event === "string") {
      event = payload.event;
      msg.event = event;
    }

    // Normalize "evt" → "event" (hub may forward connector events with either type)
    if (msgType === "evt") {
      msg.type = "event";
    }

    // Handle streaming events from connector (claude-code-stream, codex-stream,
    // claude-code-session-update, runtime.uninstalled). Dispatch as DOM CustomEvent for React hooks.
    if (
      (msgType === "event" || msgType === "evt") &&
      event &&
      (event === "claude-code-stream" ||
       event === "codex-stream" ||
       event === "hermes-stream" ||
       event === "room-agent-stream" ||
       event === "claude-code-session-update" ||
       event === "token.usage.updated" ||
       event === "runtime.uninstalled" ||
       event === "onboarding-progress" ||
       event === "onboarding-action-completed")
    ) {
      const data = (payload?.data ?? msg.data ?? payload ?? msg) as Record<string, unknown> | undefined;
      if (data && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(event, { detail: data })
        );
      }
    }

    if (msg.type === "res") {
      const id = msg.id as string;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        const timer = this.pendingRequestTimeouts.get(id);
        if (timer) {
          clearTimeout(timer);
          this.pendingRequestTimeouts.delete(id);
        }
        if (msg.ok) {
          if (this.hubMode && isGatewayMethod(pending.method)) {
            this._gatewayUnavailableUntil = 0;
          }
          pending.resolve(msg.payload);
        } else {
          // Error can be a string or object { code, message }
          const errorObj = msg.error as { code?: string; message?: string } | undefined;
          if (typeof msg.error === "string") {
            if (this.hubMode && isGatewayMethod(pending.method) && isGatewayUnavailableErrorMessage(msg.error || "")) {
              this._gatewayUnavailableUntil = Date.now() + GATEWAY_UNAVAILABLE_COOLDOWN_MS;
            }
            pending.reject(new Error(msg.error || "Request failed"));
          } else {
            const errorMessage = errorObj?.message || errorObj?.code || "Request failed";
            if (this.hubMode && isGatewayMethod(pending.method) && isGatewayUnavailableErrorMessage(errorMessage)) {
              this._gatewayUnavailableUntil = Date.now() + GATEWAY_UNAVAILABLE_COOLDOWN_MS;
            }
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
              caps: [...GATEWAY_CLIENT_CAPS],
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
      }).catch((error) => {
        const errMsg = error instanceof Error ? error.message : "Challenge signing failed";
        console.warn("[Gateway WS] Sign challenge failed:", errMsg);
        this.setState(false, errMsg);
      });
      return;
    }

    // Handle chat events (event type "chat" or "chat.delta", "chat.final", etc.)
    if (msg.type === "event" && typeof msg.event === "string" && (msg.event === "chat" || msg.event.startsWith("chat."))) {
      const rawPayload = msg.payload as ChatEventPayload | undefined;
      const runMetadata = rawPayload?.runId ? this._agentRunMetadata?.get(rawPayload.runId) : undefined;
      const resolvedSessionKey = rawPayload?.sessionKey || runMetadata?.sessionKey;
      const resolvedAgentId = rawPayload?.agentId || runMetadata?.agentId || extractOpenClawAgentId(resolvedSessionKey);
      const payload = rawPayload
        ? {
          ...rawPayload,
          ...(resolvedSessionKey ? { sessionKey: resolvedSessionKey } : {}),
          ...(resolvedAgentId ? { agentId: resolvedAgentId } : {}),
        }
        : undefined;
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
              // Turn-level lock: if the agent path already claimed this turn's
              // text stream (possibly under a different runId), suppress chat path.
              if (this._activeTextSource === "agent") {
                return;
              }
              if (!this._activeTextSource) this._activeTextSource = "chat";

              if (!this.agentDeltaBuffer) {
                this.agentDeltaBuffer = new Map();
                this._agentDeltaTimestamps = new Map();
              }
              if (!this._deltaSourceOwner) this._deltaSourceOwner = new Map();
              // Also skip if the "agent" path already owns this specific runId.
              const owner = this._deltaSourceOwner.get(payload.runId);
              if (owner === "agent") {
                return;
              }
              if (!owner) this._deltaSourceOwner.set(payload.runId, "chat");
              const existing = this.agentDeltaBuffer.get(payload.runId) || "";
              const committedPrefix = this._committedSegments?.get(payload.runId) || "";
              const nextText = stripCommittedPrefix(deltaText, committedPrefix);
              let newBuffer = resolveMergedStreamText({
                previousText: existing,
                nextText,
              });
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
        } else if ((payload.state === "final" || payload.state === "aborted" || payload.state === "error") && payload.runId) {
          this.agentDeltaBuffer?.delete(payload.runId);
          this._agentDeltaTimestamps?.delete(payload.runId);
          this._deltaSourceOwner?.delete(payload.runId);
          this._committedSegments?.delete(payload.runId);
          this._agentRunMetadata?.delete(payload.runId);
          // Delay-release turn-level lock — late chat deltas can arrive after this
          this._scheduleTextSourceClear();
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
      const runId = (payload?.runId as string) || eventParts[1];
      const data = payload?.data ? (payload.data as Record<string, unknown>) : payload;
      const directSessionKey = asNonEmptyString(payload?.sessionKey) || asNonEmptyString(data?.sessionKey);
      const directAgentId = asNonEmptyString(payload?.agentId) || asNonEmptyString(data?.agentId);

      if (!this._agentRunMetadata) this._agentRunMetadata = new Map();
      const existingRunMetadata = runId ? this._agentRunMetadata.get(runId) : undefined;
      const sessionKey = directSessionKey || existingRunMetadata?.sessionKey;
      const agentId = directAgentId || existingRunMetadata?.agentId || extractOpenClawAgentId(sessionKey);
      if (runId && (sessionKey || agentId)) {
        this._agentRunMetadata.set(runId, { sessionKey, agentId });
      }

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
        const committedPrefix = this._committedSegments?.get(runId) || "";
        const nextText = stripCommittedPrefix(text || content || "", committedPrefix);
        const nextDelta = stripCommittedPrefix(delta || "", committedPrefix);
        if (nextText !== "" || nextDelta !== "") {
          // Turn-level lock: if the chat path already claimed this turn's
          // text stream (possibly under a different runId), suppress agent path.
          if (this._activeTextSource === "chat") {
            return;
          }
          if (!this._activeTextSource) this._activeTextSource = "agent";

          if (!this._deltaSourceOwner) this._deltaSourceOwner = new Map();
          // Also skip if the "chat" path already owns this specific runId
          const owner = this._deltaSourceOwner.get(runId);
          if (owner === "chat") {
            return;
          }
          if (!owner) this._deltaSourceOwner.set(runId, "agent");
          const existingBuffer = this.agentDeltaBuffer.get(runId) || "";
          const newBuffer = resolveMergedStreamText({
            previousText: existingBuffer,
            nextText,
            nextDelta,
          });
          // Cap individual buffer at 512KB to prevent OOM
          const cappedBuffer = newBuffer.length > 524_288 ? newBuffer.slice(-524_288) : newBuffer;
          this.agentDeltaBuffer.set(runId, cappedBuffer);
          this._agentDeltaTimestamps?.set(runId, Date.now());
          // Periodically prune stale entries (every 50 runs)
          if (this.agentDeltaBuffer.size > 50) this.pruneAgentDeltaBuffer();

          // Suppress heartbeat/silent-reply text that bypassed server-side filtering.
          // During streaming the text builds up token-by-token; suppress if the
          // accumulated text is purely a silent token or a prefix leading to one.
          if (_isSilentReplyText(cappedBuffer) || _isSilentReplyPrefix(cappedBuffer)) {
            return;
          }

          // Send accumulated text (not just delta) so the hook can replace content correctly
          const chatPayload: ChatEventPayload = {
            runId,
            ...(sessionKey ? { sessionKey } : {}),
            ...(agentId ? { agentId } : {}),
            state: "delta",
            message: { role: "assistant", content: [{ type: "text", text: cappedBuffer }] },
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
          this._committedSegments?.delete(runId);
          // Delay-release turn-level lock — late deltas from the other path can arrive
          this._scheduleTextSourceClear();
          // Prune stale entries (agents that crashed without lifecycle end)
          this.pruneAgentDeltaBuffer();

          // Suppress heartbeat/silent-reply finals that bypassed server-side filtering.
          // The heartbeat runner prunes these from the transcript after evaluation,
          // so showing them creates "ghost" messages that disappear on refresh.
          const strippedText = bufferedText ? _stripSilentToken(bufferedText) : "";
          const isSilent = bufferedText ? _isSilentReplyText(bufferedText) : false;

          // If the entire text was a silent token, suppress the final entirely.
          // If there's meaningful text after stripping the token, use that.
          if (isSilent) {
            return;
          }

          const finalText = strippedText || bufferedText;
          const chatPayload: ChatEventPayload = {
            runId,
            ...(sessionKey ? { sessionKey } : {}),
            ...(agentId ? { agentId } : {}),
            state: "final",
            message: finalText
              ? { role: "assistant", content: [{ type: "text", text: finalText }], timestamp: Date.now() }
              : undefined,
          };
          this.chatEventListeners.forEach((handler) => handler(chatPayload));
          this._agentRunMetadata?.delete(runId);
        } else if (phase === "error") {
          this.agentDeltaBuffer.delete(runId);
          this._agentDeltaTimestamps?.delete(runId);
          this._deltaSourceOwner?.delete(runId);
          this._committedSegments?.delete(runId);
          this._scheduleTextSourceClear();
          const errorMsg = (data?.error || data?.errorMessage) as string | undefined;
          const chatPayload: ChatEventPayload = {
            runId,
            ...(sessionKey ? { sessionKey } : {}),
            ...(agentId ? { agentId } : {}),
            state: "error",
            errorMessage: errorMsg || "Agent error",
          };
          this.chatEventListeners.forEach((handler) => handler(chatPayload));
          this._agentRunMetadata?.delete(runId);
        }
      }

      // Handle tool events — real-time display matching OpenClaw's 3-phase protocol:
      //   phase "start"  → show tool card with spinner (executing)
      //   phase "update" → ignored (partial output with empty content causes premature completion)
      //   phase "result" → show completed result
      if ((stream === "tool" || stream === "item" || stream === "command_output") && runId) {
        const phase = (data?.phase as string) || "";
        const toolName = (data?.name || data?.toolName || data?.tool_name) as string | undefined;
        const toolCallId = (data?.callId || data?.id || data?.toolCallId || data?.tool_call_id) as string | undefined;
        const rawInput = data?.input !== undefined ? data.input : (data?.args !== undefined ? data.args : data?.arguments);
        // "result" phase uses data.result, "update" phase uses data.partialResult
        const rawOutput = data?.output !== undefined ? data.output
          : (data?.result !== undefined ? data.result
          : (data?.partialResult !== undefined ? data.partialResult
          : (data?.summary !== undefined ? data.summary : data?.error)));
        const toolError = (data?.error || data?.errorMessage) as string | undefined;
        const isError = data?.isError === true || !!toolError;
        const toolInput = rawInput !== undefined ? (typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput)) : undefined;
        const toolOutput = rawOutput !== undefined ? (typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput)) : undefined;
        const normalizedPhase =
          phase === "start"
            ? "start"
            : phase === "result" || phase === "end"
              ? "result"
              : phase;

        if (toolCallId && toolName) {
          if (normalizedPhase === "start") {
            // Commit current text buffer as a completed segment before starting
            // the tool. This lets the hook create separate text messages between
            // tool groups (matching OpenClaw's chatStreamSegments approach).
            // Without this, all text accumulates in one buffer and the hook sees
            // one giant message — tool groups never get interleaved with text.
            const hadBuffer = this.agentDeltaBuffer?.has(runId);
            const bufferContent = this.agentDeltaBuffer?.get(runId) || "";
            if (hadBuffer) {
              if (bufferContent) {
                // Track committed text so we can offset future segments
                if (!this._committedSegments) this._committedSegments = new Map();
                this._committedSegments.set(runId, bufferContent);
              }
              this.agentDeltaBuffer.delete(runId);
            }

            // Tool execution started — show card with spinner
            const chatPayload: ChatEventPayload = {
              runId,
              ...(sessionKey ? { sessionKey } : {}),
              ...(agentId ? { agentId } : {}),
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
          } else if (normalizedPhase === "result") {
            // Tool completed — show final result.
            // Skipping phase:"update" events: they carry partial/empty output that would
            // prematurely mark the tool as "completed" in useUnifiedToolState.
            const chatPayload: ChatEventPayload = {
              runId,
              ...(sessionKey ? { sessionKey } : {}),
              ...(agentId ? { agentId } : {}),
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

    // Handle notification events (pushed by connector when long-running agent tasks complete)
    if (msg.type === "event" && event === "notification") {
      const payload = msg.payload as NotificationPayload;
      if (payload && payload.kind) {
        this.notificationListeners.forEach((handler) => handler(payload));
      }
      // Also emit to generic event handlers below
    }

    // Emit to generic event handlers (each handler is isolated via try/catch
    // to prevent one handler's exception from breaking dispatch to others)
    if (msg.type === "event" && typeof event === "string") {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(msg);
          } catch (err) {
            console.error(`[Gateway WS] Event handler error for "${event}":`, err);
          }
        });
      }

      // Also dispatch critical device lifecycle events as DOM CustomEvents so
      // non-subscriber modules (e.g., hub-direct's circuit breaker) can react
      // without taking a runtime dependency on this singleton.
      if (typeof window !== "undefined" && (event === "device_connected" || event === "device_disconnected")) {
        try {
          const detail = { deviceId: (msg as { deviceId?: string }).deviceId };
          window.dispatchEvent(new CustomEvent(`hyperclaw:${event}`, { detail }));
        } catch (err) {
          console.error(`[Gateway WS] Failed to dispatch DOM event for "${event}":`, err);
        }
      }

      if (event === "connector.health") {
        const health = normalizeConnectorHealth(
          (msg.payload as Record<string, unknown> | undefined)?.data ??
            (msg.data as Record<string, unknown> | undefined)
        );
        connectorHealthCache = { data: health, ts: Date.now() };
      }

      // Dispatch agent file change events so identity caches auto-invalidate
      // (useAgentIdentity listens for "openclaw-gateway-event").
      if (typeof window !== "undefined" && event === "agent.file.changed") {
        try {
          const data = (msg as Record<string, unknown>).data ?? {};
          window.dispatchEvent(new CustomEvent("openclaw-gateway-event", { detail: { event, data } }));
        } catch (err) {
          console.error(`[Gateway WS] Failed to dispatch DOM event for "${event}":`, err);
        }
      }
    }
  },

  /** Subscribe to chat events */
  onChatEvent(callback: (payload: ChatEventPayload) => void): () => void {
    this.chatEventListeners.add(callback);
    return () => this.chatEventListeners.delete(callback);
  },

  /** Subscribe to notification events (agent task completion, etc.) */
  onNotification(callback: (payload: NotificationPayload) => void): () => void {
    this.notificationListeners.add(callback);
    return () => this.notificationListeners.delete(callback);
  },

  /** Unsubscribe from notification events */
  offNotification(callback: (payload: NotificationPayload) => void): void {
    this.notificationListeners.delete(callback);
  },

  /** Subscribe to a named event (e.g. "device_connected", "device_disconnected") */
  on(event: string, callback: (msg: Record<string, unknown>) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
    return () => this.eventHandlers.get(event)?.delete(callback);
  },

  /** Manually emit an event to all registered handlers */
  emit(event: string, payload: Record<string, unknown> = {}): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[gateway] emit handler error for ${event}:`, err);
        }
      });
    }
  },

  /** Subscribe to ALL session events (broad — receives session.message for every session) */
  subscribeAllSessionEvents(): Promise<unknown> {
    return this.request("sessions.subscribe", {});
  },

  /** Unsubscribe from all session events */
  unsubscribeAllSessionEvents(): Promise<unknown> {
    return this.request("sessions.unsubscribe", {});
  },

  /** Subscribe to session messages for a specific session key */
  subscribeSessionMessages(key: string): Promise<unknown> {
    return this.request("sessions.messages.subscribe", { key });
  },

  /** Unsubscribe from session messages for a specific session key */
  unsubscribeSessionMessages(key: string): Promise<unknown> {
    return this.request("sessions.messages.unsubscribe", { key });
  },

  /** List all sessions (unfiltered — for session discovery) */
  listAllSessions(limit: number = 200): Promise<{ sessions?: Array<{ key: string; label?: string; status?: string; startedAt?: string; endedAt?: string; kind?: string }> }> {
    return this.request("sessions.list", { limit });
  },

  /** Send a chat message */
  sendChatMessage(params: { sessionKey: string; message: string; deliver?: boolean; idempotencyKey?: string; attachments?: unknown[] }): Promise<unknown> {
    // Reset turn-level locks so the new turn's events aren't suppressed
    // by the previous turn's source claim (the 5s delay holdover).
    this._activeTextSource = null;
    if (this._activeTextSourceTimer) {
      clearTimeout(this._activeTextSourceTimer);
      this._activeTextSourceTimer = null;
    }
    this._deltaSourceOwner?.clear();
    this._committedSegments?.clear();
    const runId = asNonEmptyString(params.idempotencyKey);
    if (runId) {
      if (!this._agentRunMetadata) this._agentRunMetadata = new Map();
      this._agentRunMetadata.set(runId, {
        sessionKey: params.sessionKey,
        agentId: extractOpenClawAgentId(params.sessionKey),
      });
    }
    this.invalidateChatHistoryCache(params.sessionKey);

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
  _chatHistoryInflight: new Map<string, Promise<{ messages?: unknown[] }>>(),
  _chatHistoryCache: new Map<string, { data: { messages?: unknown[] }; ts: number }>(),
  _chatHistoryCacheGeneration: new Map<string, number>(),
  _chatHistoryCacheTTL: 30000, // 30s TTL — chat history is mostly append-only
  isHostedHubConnection(): boolean {
    if (!this.hubMode || !this.wsUrl) return false;
    try {
      return new URL(this.wsUrl).hostname === "hub.hypercho.com";
    } catch {
      return this.wsUrl.includes("hub.hypercho.com");
    }
  },
  shouldCacheChatHistory(): boolean {
    return this.isHostedHubConnection();
  },
  invalidateChatHistoryCache(sessionKey: string): void {
    for (const key of this._chatHistoryCache.keys()) {
      if (key.startsWith(`${sessionKey}::`)) {
        this._chatHistoryCache.delete(key);
        this._chatHistoryCacheGeneration.set(key, (this._chatHistoryCacheGeneration.get(key) || 0) + 1);
      }
    }
    for (const key of this._chatHistoryInflight.keys()) {
      if (key.startsWith(`${sessionKey}::`)) {
        this._chatHistoryInflight.delete(key);
        this._chatHistoryCacheGeneration.set(key, (this._chatHistoryCacheGeneration.get(key) || 0) + 1);
      }
    }
  },
  clearChatHistory(params: { sessionKey: string; confirmDestructive?: boolean }): Promise<unknown> {
    if (params.confirmDestructive !== true) {
      return Promise.reject(new Error("Refusing to clear persisted OpenClaw chat history without explicit confirmation"));
    }
    this.invalidateChatHistoryCache(params.sessionKey);
    return this.request("chat.clear", { sessionKey: params.sessionKey }, 30_000);
  },
  getChatHistory(
    sessionKey: string,
    limit: number = 200,
    options?: { maxChars?: number; cache?: boolean },
  ): Promise<{ messages?: unknown[] }> {
    const cacheKey = `${sessionKey}::${limit}::${options?.maxChars ?? "default"}`;
    const useCache = options?.cache ?? this.shouldCacheChatHistory();
    const cached = useCache ? this._chatHistoryCache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.ts < this._chatHistoryCacheTTL) {
      return Promise.resolve(cached.data);
    }

    const inflight = this._chatHistoryInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const generation = this._chatHistoryCacheGeneration.get(cacheKey) || 0;
    const req = (requestOpenClawLocalHistory(sessionKey, limit, options?.maxChars)
      .then((localResult) => localResult ?? this.request<{ messages?: unknown[] }>(
        "chat.history",
        {
          sessionKey,
          limit,
          ...(typeof options?.maxChars === "number" ? { maxChars: options.maxChars } : {}),
        },
        60_000,
      )))
      .then((result) => {
        if (!useCache) {
          return result;
        }
        const now = Date.now();
        if ((this._chatHistoryCacheGeneration.get(cacheKey) || 0) !== generation) {
          return result;
        }
        this._chatHistoryCache.set(cacheKey, { data: result, ts: now });
        // Prune stale entries on every write to prevent unbounded Map growth.
        // Without this, every unique sessionKey::limit combo seen in the session
        // stays in the Map forever (only TTL-checked on read, never evicted).
        for (const [k, v] of this._chatHistoryCache) {
          if (now - v.ts > this._chatHistoryCacheTTL) {
            this._chatHistoryCache.delete(k);
            this._chatHistoryCacheGeneration.delete(k);
          }
        }
        return result;
      })
      .finally(() => {
        if (this._chatHistoryInflight.get(cacheKey) === req) {
          this._chatHistoryInflight.delete(cacheKey);
        }
      });
    this._chatHistoryInflight.set(cacheKey, req);
    return req;
  },

  /** List available models (deduped + cached) */
  _modelsInflight: null as Promise<{ models: Array<{ id: string; provider: string; displayName?: string }> }> | null,
  _modelsCache: null as { data: { models: Array<{ id: string; provider: string; displayName?: string }> }; ts: number } | null,
  _modelsCacheTTL: 15_000, // 15s — models change rarely
  listModels(timeoutMs?: number): Promise<{ models: Array<{ id: string; provider: string; displayName?: string }> }> {
    if (this._modelsCache && Date.now() - this._modelsCache.ts < this._modelsCacheTTL) {
      return Promise.resolve(this._modelsCache.data);
    }
    if (this._modelsInflight) {
      return this._modelsInflight;
    }
    const req = this.request<{ models: Array<{ id: string; provider: string; displayName?: string }> }>(
      "models.list",
      {},
      timeoutMs ?? DEFAULT_MODELS_TIMEOUT_MS
    )
      .then((result) => {
        this._modelsCache = { data: result, ts: Date.now() };
        return result;
      })
      .finally(() => {
        this._modelsInflight = null;
      });
    this._modelsInflight = req;
    return req;
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

  /** Archive a local OpenClaw session so it no longer appears in lists. */
  async archiveOpenClawLocalSession(
    sessionKey: string,
    mode: OpenClawLocalSessionArchiveMode = "archive",
  ): Promise<{ sessionKey?: string; agentId?: string; action?: string; source?: string }> {
    const result = await requestOpenClawLocalArchiveSession(sessionKey, mode);
    this._sessionsListCache = null;
    this._sessionsListInflight = null;
    return result;
  },

  /** In-flight + short-lived cache for `sessions.list` — every caller sends
   * the same `{ limit: 200 }` request and filters client-side, so a single
   * WS round-trip can satisfy many concurrent callers. */
  _sessionsListInflight: null as Promise<{ sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; status?: string; preview?: string; model?: string; modelProvider?: string; thinkingLevel?: string }> }> | null,
  _sessionsListCache: null as { data: { sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; status?: string; preview?: string; model?: string; modelProvider?: string; thinkingLevel?: string }> }; ts: number } | null,
  _sessionsListCacheTTL: 30000, // 30s TTL — sessions don't change that often

  /** Read local OpenClaw sessions directly from connector-managed session indexes. */
  async listOpenClawLocalSessions(
    agentId: string = "",
    limit: number = 50,
    options: OpenClawSessionListOptions = {},
  ): Promise<{ sessions?: GatewaySessionListItem[]; source?: string } | undefined> {
    const localSessions = await requestOpenClawLocalSessions(agentId, limit, options);
    if (!localSessions?.sessions) return localSessions;
    return {
      ...localSessions,
      sessions: localSessions.sessions
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, limit),
    };
  },

  /** Get list of sessions for an agent */
  async listSessions(
    agentId: string,
    limit: number = 50,
    options: OpenClawSessionListOptions = {}
  ): Promise<{ sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; status?: string; preview?: string; model?: string; modelProvider?: string; thinkingLevel?: string }> }> {
    const cronJobIds = [
      ...(options.cronJobId ? [options.cronJobId] : []),
      ...(options.cronJobIds ?? []),
    ].map((id) => id.trim()).filter(Boolean);
    const hasCronFilter = cronJobIds.length > 0;
    const localSessions = await requestOpenClawLocalSessions(agentId, limit, {
      ...options,
      cronJobIds,
    });
    if (localSessions?.sessions) {
      if (agentId && localSessions.sessions.length === 0 && options.includeDefault !== false && !hasCronFilter) {
        return { sessions: [{ key: `agent:${agentId}:hyperclaw`, createdAt: Date.now(), updatedAt: Date.now() }] };
      }
      return {
        sessions: localSessions.sessions
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .slice(0, limit),
      };
    }

    // Deduplicate: reuse in-flight request or short-lived cache
    let allSessions: { sessions?: Array<{ key: string; label?: string; createdAt?: number; updatedAt?: number; status?: string; preview?: string; model?: string; modelProvider?: string; thinkingLevel?: string }> };
    const cached = this._sessionsListCache;
    if (cached && Date.now() - cached.ts < this._sessionsListCacheTTL) {
      allSessions = cached.data;
    } else if (this._sessionsListInflight) {
      allSessions = await this._sessionsListInflight;
    } else {
      const req = this.request<typeof allSessions>(
        "sessions.list",
        { limit: 200 },
        DEFAULT_SESSIONS_LIST_TIMEOUT_MS
      )
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
    let agentSessions = allSessions.sessions.filter(s => s.key.startsWith(prefix));
    if (hasCronFilter) {
      const cronJobSet = new Set(cronJobIds);
      agentSessions = agentSessions.filter((session) => {
        const parts = session.key.split(":");
        return parts.length >= 4 && parts[2] === "cron" && cronJobSet.has(parts[3]);
      });
    }
    if (agentSessions.length === 0) {
      if (options.includeDefault === false || hasCronFilter) {
        return { sessions: [] };
      }
      // No sessions for this agent yet — return the stable Hyperclaw primary
      // session so callers have something to work with.
      console.debug(`[Gateway WS] No sessions found for agent "${agentId}", returning default Hyperclaw session`);
      return { sessions: [{ key: `agent:${agentId}:hyperclaw`, createdAt: Date.now(), updatedAt: Date.now() }] };
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

  startActivityWatchdog() {
    this.stopActivityWatchdog();
    // The Hub dashboard socket is a relay, not the OpenClaw gateway protocol.
    // It does not guarantee application-level ping/pong, and forcing a close
    // here interrupts long remote-device streams.
    if (this.hubMode) {
      this._lastGatewayActivity = 0;
      return;
    }
    this._lastGatewayActivity = Date.now();
    this._watchdogTimer = setInterval(() => {
      if (Date.now() - this._lastGatewayActivity > this._INACTIVITY_TIMEOUT) {
        console.warn("[Gateway WS] No gateway activity in", this._INACTIVITY_TIMEOUT, "ms — forcing reconnect");
        this.stopActivityWatchdog();
        if (this.ws) {
          try { this.ws.close(); } catch { /* ignore */ }
        }
        return;
      }
    }, this._WATCHDOG_INTERVAL);
  },

  stopActivityWatchdog() {
    if (this._watchdogTimer != null) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
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
        const nextHubMode = !!options.hubMode;
        if (nextHubMode !== this.hubMode) {
          this.hubMode = nextHubMode;
          if (nextHubMode) {
            this.stopActivityWatchdog();
            this._lastGatewayActivity = 0;
          } else if (this.ws.readyState === WebSocket.OPEN) {
            this.startActivityWatchdog();
          }
        }
      }
      return;
    }
    const token = options.token ?? null;

    // Clean up existing connection. IMPORTANT: detach handlers from the old WS
    // BEFORE closing it. Otherwise the old WS's onclose fires asynchronously
    // after the new WS is created and clobbers this.ws with null.
    this.stopActivityWatchdog();
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
    this._agentDeltaTimestamps?.clear();
    this._agentDeltaTimestamps = null;
    this._activeTextSource = null;
    if (this._activeTextSourceTimer) { clearTimeout(this._activeTextSourceTimer); this._activeTextSourceTimer = null; }
    this._deltaSourceOwner?.clear();
    this._committedSegments?.clear();
    this._agentRunMetadata?.clear();

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
      this.startActivityWatchdog();
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
        if (!this.hubMode) {
          this._lastGatewayActivity = Date.now();
        }
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
      this.stopActivityWatchdog();
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
          const timer = this.pendingRequestTimeouts.get(id);
          if (timer) clearTimeout(timer);
          pending.reject(closeError);
        }
        this.pendingRequests.clear();
        this.pendingRequestTimeouts.clear();
      }
      this.setState(false, err);
      this.scheduleReconnect();
    };
  },

  scheduleReconnect() {
    if (this.permanentlyFailed) return;
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.permanentlyFailed = true;
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("gateway:permanently_failed"));
      console.warn("[gateway-ws] Permanent failure after max reconnect attempts. Call reset() to try again.");
      return;
    }
    if (!this.wsUrl || this.reconnectTimer != null) return;
    const delay = RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, MAX_RECONNECT_ATTEMPTS);
    const url = this.wsUrl;
    const token = this.token;
    const hubMode = this.hubMode;
    const hubDeviceId = this.hubDeviceId;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      // Stop reconnecting when the JWT has expired — retries would just
      // spam 401s. The user needs to re-login to get a fresh token.
      try {
        const { isAuthExpired: _authCheck } = await import("$/lib/hub-direct");
        if (_authCheck()) {
          console.warn("[GatewayWS] Auth expired — stopping reconnect loop");
          return;
        }
      } catch { /* hub-direct not available */ }
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
          if (shouldBlockRemoteHubFallback()) {
            this.wsUrl = null;
            this.hubMode = false;
            this.hubDeviceId = null;
            this.setState(false, null);
            return;
          }
        } catch {
          /* fall through to reconnect with captured values */
        }
      }
      if (shouldBlockRemoteHubFallback()) {
        this.wsUrl = null;
        this.hubMode = false;
        this.hubDeviceId = null;
        this.setState(false, null);
        return;
      }
      if (url) this.connect(url, { token, hubMode: hubMode || undefined, hubDeviceId: hubDeviceId || undefined });
    }, delay);
  },

  disconnect() {
    this.stopActivityWatchdog();
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
    this._agentDeltaTimestamps?.clear();
    this._agentDeltaTimestamps = null;
    this._activeTextSource = null;
    if (this._activeTextSourceTimer) { clearTimeout(this._activeTextSourceTimer); this._activeTextSourceTimer = null; }
    this._sessionsListInflight = null;
    this._sessionsListCache = null;
    this._deltaSourceOwner?.clear();
    this._deltaSourceOwner = null;
    this._committedSegments?.clear();
    this._committedSegments = null;
    this._agentRunMetadata?.clear();
    this._agentRunMetadata = null;
    this.setState(false, null);
  },

  reset(): void {
    this.permanentlyFailed = false;
    this.reconnectAttempt = 0;
    if (this.wsUrl) {
      this.connect(this.wsUrl);
    }
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
        // Also prune sibling maps — runs that die without a terminal event leave
        // stale entries in _deltaSourceOwner and _committedSegments forever.
        this._deltaSourceOwner?.delete(runId);
        this._committedSegments?.delete(runId);
        this._agentRunMetadata?.delete(runId);
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
        if (shouldBlockRemoteHubFallback()) {
          this.wsUrl = null;
          this.hubMode = false;
          this.hubDeviceId = null;
          this.setState(false, null);
          return;
        }
      } catch { /* fall through */ }
    }
    if (shouldBlockRemoteHubFallback()) {
      this.wsUrl = null;
      this.hubMode = false;
      this.hubDeviceId = null;
      this.setState(false, null);
      return;
    }
    if (!this.wsUrl) return;
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
  if (options?.hubMode && shouldBlockRemoteHubFallback()) {
    if (gatewayConnection.hubMode) {
      gatewayConnection.disconnect();
    }
    return;
  }

  let finalUrl = wsUrl;
  if (options?.hubMode && wsUrl) {
    // Convert hub HTTP URL to WebSocket dashboard URL
    finalUrl = wsUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/ws/dashboard";
    if (options.token) {
      const sep = finalUrl.includes("?") ? "&" : "?";
      finalUrl = `${finalUrl}${sep}token=${encodeURIComponent(options.token)}`;
    }
  } else if (wsUrl) {
    finalUrl = buildGatewayWsUrl(wsUrl, options?.token);
  }
  gatewayConnection.connect(finalUrl, options ?? {});
}

export function disconnectGatewayWs(): void {
  gatewayConnection.disconnect();
}

/** Reset the gateway singleton after onboarding or permanent failure.
 *  Clears the permanentlyFailed flag and reconnect counter so a fresh
 *  connection attempt can succeed. */
export function resetGatewayConnection(): void {
  gatewayConnection.disconnect();
  gatewayConnection.permanentlyFailed = false;
  gatewayConnection.reconnectAttempt = 0;
}

let connectorHealthInflight: Promise<ConnectorHealth> | null = null;
let connectorHealthCache: { data: ConnectorHealth; ts: number } | null = null;
const CONNECTOR_HEALTH_CACHE_TTL_MS = 3_000;

function normalizeConnectorHealth(value: unknown): ConnectorHealth {
  if (!value || typeof value !== "object") {
    return { ok: false, connectorOnline: false, gatewayConnected: false, gatewayState: "unknown" };
  }
  const envelope = value as Record<string, unknown>;
  const data =
    envelope.data && typeof envelope.data === "object"
      ? (envelope.data as Record<string, unknown>)
      : envelope;
  return {
    ok: data.ok === true || data.connectorOnline === true,
    connectorOnline: data.connectorOnline === true || data.ok === true,
    gatewayConnected:
      typeof data.gatewayConnected === "boolean" ? data.gatewayConnected : undefined,
    gatewayState: typeof data.gatewayState === "string" ? data.gatewayState : "unknown",
    bridge: typeof data.bridge === "string" ? data.bridge : undefined,
    version: typeof data.version === "string" ? data.version : undefined,
    uptime: typeof data.uptime === "string" ? data.uptime : undefined,
    ts: typeof data.ts === "number" ? data.ts : undefined,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  promise.catch(() => {
    // The race may have already timed out. Keep the original request from
    // surfacing as an unhandled rejection when it eventually completes.
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Direct, unauthenticated probe of the local connector's /bridge/health
// endpoint. The hub has no authoritative knowledge of the local connector's
// state — when this endpoint answers, that IS the answer, and we should never
// pay the cost of routing the same question through the hub WS round-trip.
const LOCAL_CONNECTOR_HEALTH_URL = "http://127.0.0.1:18790/bridge/health";
const LOCAL_CONNECTOR_HEALTH_FAST_TIMEOUT_MS = 800;

async function probeLocalConnectorHealthDirect(): Promise<ConnectorHealth | null> {
  if (!isLocalConnectorContext()) {
    return null;
  }
  try {
    const res = await fetch(LOCAL_CONNECTOR_HEALTH_URL, {
      signal: AbortSignal.timeout(LOCAL_CONNECTOR_HEALTH_FAST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as unknown;
    return normalizeConnectorHealth(json);
  } catch {
    // Local connector not reachable — caller falls back to the hub-routed path.
    return null;
  }
}

export async function probeConnectorHealth(
  timeoutMs = DEFAULT_CONNECTOR_HEALTH_TIMEOUT_MS
): Promise<{ healthy: boolean; error?: string; health?: ConnectorHealth }> {
  const cached = connectorHealthCache;
  if (cached && Date.now() - cached.ts < CONNECTOR_HEALTH_CACHE_TTL_MS) {
    const health = cached.data;
    return {
      healthy: health.connectorOnline === true,
      health,
      error: health.connectorOnline ? undefined : "connector is offline",
    };
  }

  if (!connectorHealthInflight) {
    connectorHealthInflight = (async () => {
      // Local-first: skip bridgeInvoke entirely when the connector's HTTP
      // health endpoint is reachable on this machine. This bypasses the hub
      // relay, the local-bridge backoff, and the WS round-trip — which is
      // what was producing "connector health timed out" when the dashboard
      // was healthy locally but the hub WS path was slow.
      const direct = await probeLocalConnectorHealthDirect();
      if (direct) return direct;

      // Fallback: route through bridgeInvoke for genuine remote-control
      // scenarios (cross-machine dashboard relayed via the hub).
      const { bridgeInvoke } = await import("$/lib/hyperclaw-bridge-client");
      const raw = await bridgeInvoke("connector-health");
      return normalizeConnectorHealth(raw);
    })()
      .then((health) => {
        connectorHealthCache = { data: health, ts: Date.now() };
        return health;
      })
      .finally(() => {
        connectorHealthInflight = null;
      });
  }

  try {
    const health = await withTimeout(
      connectorHealthInflight,
      timeoutMs,
      "connector health timed out"
    );
    return {
      healthy: health.connectorOnline === true,
      health,
      error: health.connectorOnline ? undefined : "connector is offline",
    };
  } catch (e) {
    return {
      healthy: false,
      error: e instanceof Error ? e.message : "connector health failed",
    };
  }
}

/**
 * Verify connector reachability through the full relay chain
 * (dashboard → hub → connector) and ask the connector whether its local
 * OpenClaw gateway socket is open.
 * The hub WS being connected only means the dashboard can talk to the cloud —
 * this probe avoids expensive models.list calls while still checking the
 * connector-owned gateway state.
 */
export async function probeGatewayHealth(timeoutMs = 25000): Promise<{ healthy: boolean; error?: string }> {
  if (!gatewayConnection.connected) {
    return { healthy: false, error: "WebSocket not connected" };
  }
  const connector = await probeConnectorHealth(Math.min(timeoutMs, DEFAULT_CONNECTOR_HEALTH_TIMEOUT_MS));
  if (!connector.healthy) {
    return { healthy: false, error: connector.error ?? "connector is offline" };
  }
  if (connector.health?.gatewayConnected === false) {
    return { healthy: false, error: "gateway not connected" };
  }
  return { healthy: true };
}

export function getGatewayConnectionState(): GatewayConnectionState {
  return gatewayConnection.getState();
}

export function subscribeGatewayConnection(cb: () => void): () => void {
  return gatewayConnection.subscribe(cb);
}

async function getLocalGatewayConfig(): Promise<{ gatewayUrl: string; token: string | null } | null> {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    electronAPI?: {
      hyperClawBridge?: {
        getGatewayConfig?: () => Promise<{ host?: string; port?: number; token?: string | null } | null>;
      };
    };
  };

  try {
    const config = await w.electronAPI?.hyperClawBridge?.getGatewayConfig?.();
    if (config?.host && config.port) {
      return {
        gatewayUrl: `http://${config.host}:${config.port}`,
        token: config.token ?? null,
      };
    }
  } catch {
    // Fall back to the default local OpenClaw gateway below.
  }

  const host = window.location.hostname;
  const isLocalHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost");

  if (isLocalHost || w.electronAPI?.hyperClawBridge) {
    return { gatewayUrl: "http://127.0.0.1:18789", token: null };
  }

  return null;
}

/** Get gateway config — prefers direct local gateway when the connector is available. */
export async function getGatewayConfig(): Promise<{ gatewayUrl: string; token: string | null; hubMode?: boolean; hubDeviceId?: string }> {
  let authExpired = false;
  const localOnly = shouldBlockRemoteHubFallback();
  try {
    const { isAuthExpired } = await import("$/lib/hub-direct");
    authExpired = isAuthExpired();
  } catch { /* ok */ }

  try {
    const { getBridgeMode } = await import("$/lib/hub-direct");
    const mode = await getBridgeMode();
    if (mode.mode === "local") {
      const localConfig = await getLocalGatewayConfig();
      if (localConfig?.gatewayUrl) {
        return {
          gatewayUrl: localConfig.gatewayUrl,
          token: localConfig.token,
          hubMode: false,
        };
      }
    }
  } catch {
    /* local mode unavailable */
  }

  if (localOnly) {
    return { gatewayUrl: "", token: null };
  }

  // Short-circuit hub mode when auth is expired — avoid spamming 401 requests.
  if (authExpired) {
    return { gatewayUrl: "", token: null };
  }

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
  } else if (!token) {
    // Hub URL found (e.g. from Electron hub-config) but JWT is empty — get it from the session cache
    try {
      const { getUserToken } = await import("$/lib/hub-direct");
      token = await getUserToken() || null;
    } catch { /* ok */ }
  }

  if (!hubUrl) {
    return { gatewayUrl: "", token: null };
  }

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
    if (!config.gatewayUrl) throw new Error(getGatewayUnavailableMessage());
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
  return gatewayConnection.sendChatMessage({
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
