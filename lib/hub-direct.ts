/**
 * Client-side Hub API client.
 * Calls the Hub directly from the browser (no serverless proxy).
 * Auth: JWT from NextAuth session.
 * Device: fetched from Hub /api/devices and cached.
 */
import { getCachedToken } from "./auth-token-cache";
import { isLocalConnectorContext, shouldBlockRemoteHubFallback } from "./local-connector-routing";

// Hub API URL is set by the Cloud build at build time. In Community Edition it
// is intentionally empty — the dashboard will only use the local connector
// bridge fast path and skip remote hub calls entirely.
const HUB_API_URL = process.env.NEXT_PUBLIC_HUB_API_URL || "";
const LOCAL_BRIDGE_BASE_URL = "http://127.0.0.1:18790";

export type BridgeMode = "local" | "hub" | "unavailable";

export interface BridgeModeStatus {
  mode: BridgeMode;
  authenticated: boolean;
  localBridgeAvailable: boolean;
  needsLoginForRemote?: boolean;
  reason?: string;
}

// Bearer token used by the connector for /bridge auth. In Electron we
// read it via the preload IPC bridge. In browser-only mode there's no
// way to read the file, so the dashboard talks to the hub instead and
// never hits /bridge directly. Cached for the session — token is stable
// across connector restarts (rotation is explicit).
let _connectorTokenCache: string | null = null;
let _connectorTokenFetchedAt = 0;
const CONNECTOR_TOKEN_TTL_MS = 60_000;

async function getConnectorBearerToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  const api = window.electronAPI;
  if (!api?.getConnectorToken) return "";
  const now = Date.now();
  if (_connectorTokenCache !== null && now - _connectorTokenFetchedAt < CONNECTOR_TOKEN_TTL_MS) {
    return _connectorTokenCache;
  }
  try {
    const token = await api.getConnectorToken();
    _connectorTokenCache = token || "";
    _connectorTokenFetchedAt = now;
    return _connectorTokenCache;
  } catch {
    return "";
  }
}

export function clearConnectorTokenCache(): void {
  _connectorTokenCache = null;
  _connectorTokenFetchedAt = 0;
}
const LOCAL_BRIDGE_FAILURE_BACKOFF_MS = 2_000;
const DEFAULT_LOCAL_BRIDGE_TIMEOUT_MS = 5_000;
const HERMES_HEALTH_LOCAL_TIMEOUT_MS = 15_000;
const LOCAL_BRIDGE_HEALTH_TIMEOUT_MS = 500;
const DEFAULT_REST_TIMEOUT_MS = 30 * 1000;
const LONG_BRIDGE_TIMEOUT_MS = 15 * 60 * 1000;

// --- Auth-expired detection ---
// When the hub returns 401, the JWT may have expired — but a single 401 can
// also be a transient UserManager blip. Track consecutive 401s and only fire
// the auth-expired event after crossing the threshold, preventing false
// session-expired banners from momentary infrastructure hiccups.
let _authExpired = false;
let _authFailureCount = 0;
const AUTH_EXPIRED_THRESHOLD = 3;

export function isAuthExpired(): boolean {
  return _authExpired;
}

export function clearAuthExpired(): void {
  _authExpired = false;
  _authFailureCount = 0;
}

function handleAuthExpired(): void {
  _authFailureCount++;
  if (_authFailureCount < AUTH_EXPIRED_THRESHOLD) {
    console.warn(
      `[hub-direct] Hub returned 401 (${_authFailureCount}/${AUTH_EXPIRED_THRESHOLD}) — will flag expired after threshold.`
    );
    return;
  }
  if (_authExpired) return; // already fired
  _authExpired = true;
  console.warn("[hub-direct] JWT expired — hub returned 401 consecutively. Please re-login.");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hyperclaw:auth-expired"));
  }
}

/** Reset the auth failure counter on any successful hub response. */
function resetAuthFailureCount(): void {
  if (_authFailureCount > 0) {
    _authFailureCount = 0;
  }
}

// --- Device-unreachable detection ---
// When the hub returns 503 on /api/devices/:id/command, the device is
// registered but has no live WS relay (typical after connector restart without
// credentials, or a stale device record). Track consecutive 503s per device;
// after a small threshold, trip a flag, clear the device cache, and dispatch
// `hyperclaw:device-unreachable` so polling loops back off and guided setup
// can take over. A short per-device cooldown starts on the first 503 to collapse
// dashboard mount bursts without treating a one-off connector restart as a
// permanent offline state. Symmetric to handleAuthExpired().
let _deviceUnreachable = false;
let _unreachableDeviceId: string | null = null;
const _deviceFailureCounts = new Map<string, number>();
const DEVICE_UNREACHABLE_THRESHOLD = 4;
const DEVICE_COMMAND_503_COOLDOWN_MS = 5_000;
const _deviceCommandReachabilityProbes = new Map<string, Promise<boolean>>();
const _deviceCommand503CooldownUntil = new Map<string, number>();

function getDeviceUnreachableResponse() {
  return {
    success: false,
    error: "Device unreachable — connector is offline",
    needsSetup: true,
    deviceUnreachable: true,
  };
}

function shouldGateRestReachability(action?: string): boolean {
  return (
    !isStreamingBridgeAction(action) &&
    !isLongRunningBridgeAction(action)
  );
}

export function isDeviceUnreachable(): boolean {
  return _deviceUnreachable;
}

export function getUnreachableDeviceId(): string | null {
  return _unreachableDeviceId;
}

export function clearDeviceUnreachable(): void {
  _deviceUnreachable = false;
  _unreachableDeviceId = null;
  _deviceFailureCounts.clear();
  _deviceCommandReachabilityProbes.clear();
  _deviceCommand503CooldownUntil.clear();
}

function handleDeviceUnreachable(deviceId: string): void {
  const count = (_deviceFailureCounts.get(deviceId) ?? 0) + 1;
  _deviceFailureCounts.set(deviceId, count);
  if (count < DEVICE_UNREACHABLE_THRESHOLD) return;
  if (_deviceUnreachable && _unreachableDeviceId === deviceId) return;
  _deviceUnreachable = true;
  _unreachableDeviceId = deviceId;
  clearDeviceCache();
  console.warn(
    `[hub-direct] Device ${deviceId} unreachable — hub returned 503 ${count}x. Pausing retry loops.`
  );
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("hyperclaw:device-unreachable", { detail: { deviceId } })
    );
  }
}

function resetDeviceFailureCount(deviceId: string): void {
  if (_deviceFailureCounts.has(deviceId)) {
    _deviceFailureCounts.delete(deviceId);
  }
  if (_deviceCommand503CooldownUntil.has(deviceId)) {
    _deviceCommand503CooldownUntil.delete(deviceId);
  }
}

// Auto-clear the unreachable flag when the gateway WS reports the device back
// online. Without this, a transient offline window (e.g., a connector self-
// update restart of ~6 seconds) latches the circuit breaker until the user
// reloads the page, which is exactly the Device unreachable onboarding error
// we are trying to fix. Guarded for SSR.
if (typeof window !== "undefined") {
  window.addEventListener("hyperclaw:device_connected", (ev: Event) => {
    const detail = (ev as CustomEvent<{ deviceId?: string }>).detail;
    const deviceId = detail?.deviceId;
    if (deviceId) {
      resetDeviceFailureCount(deviceId);
    }
    if (_deviceUnreachable && (!deviceId || deviceId === _unreachableDeviceId)) {
      console.info(
        `[hub-direct] Device ${deviceId ?? "(any)"} reported online via gateway — clearing unreachable flag.`
      );
      clearDeviceUnreachable();
      window.dispatchEvent(new CustomEvent("hyperclaw:device-reachable", { detail: { deviceId } }));
    }
  });
}

function getHubUrl(path: string): string {
  return `${HUB_API_URL}${path}`;
}

export function isHubConfigured(): boolean {
  return HUB_API_URL !== "";
}

function makeHubUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Hub not configured (Community Edition)" }),
    {
      status: 503,
      statusText: "Hub Not Configured",
      headers: { "Content-Type": "application/json" },
    }
  );
}

function buildHubHeaders(
  token: string,
  headers?: HeadersInit,
  includeJsonContentType = true
): Headers {
  const merged = new Headers(headers);
  merged.set("Authorization", `Bearer ${token}`);
  if (includeJsonContentType && !merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }
  return merged;
}

/**
 * Returns the cached JWT. Never calls getSession() to avoid flooding
 * /api/auth/session — the token is populated by UserProvider from the
 * SessionProvider context.
 */
export async function getUserToken(): Promise<string> {
  return getCachedToken() || "";
}

export function clearTokenCache() {
  clearConnectorTokenCache();
}

// --- Device cache ---
let _deviceCache: { id: string; checkedAt: number } | null = null;
const DEVICE_CACHE_TTL = 30_000; // 30s

export async function getActiveDeviceId(
  token?: string
): Promise<string | null> {
  if (_deviceCache && Date.now() - _deviceCache.checkedAt < DEVICE_CACHE_TTL) {
    return _deviceCache.id;
  }
  if (!isHubConfigured()) return null;
  const jwt = token || (await getUserToken());
  if (!jwt) return null;

  try {
    const res = await fetch(getHubUrl("/api/devices"), {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      // 503 = UserManager unavailable, not an auth failure — reset the auth
      // counter so transient 503s don't let the next 401 trip the threshold.
      if (res.status === 503) {
        resetAuthFailureCount();
      } else if (res.status === 401 || res.status === 403) {
        handleAuthExpired();
      }
      return null;
    }
    resetAuthFailureCount();
    const devices = await res.json();
    if (!Array.isArray(devices) || devices.length === 0) return null;

    const online = devices.filter(
      (d: { status?: string }) => d.status === "online"
    );
    const device =
      online.length > 0
        ? online.reduce((a: any, b: any) =>
            (a.updatedAt || "") > (b.updatedAt || "") ? a : b
          )
        : devices[0];

    const deviceId = device.id || device._id;
    _deviceCache = { id: deviceId, checkedAt: Date.now() };
    return deviceId;
  } catch {
    return null;
  }
}

export function clearDeviceCache() {
  _deviceCache = null;
}

export function isLongRunningBridgeAction(action?: string): boolean {
  return (
    action === "onboarding-provision-workspace" ||
    action === "onboarding-install-runtime" ||
    action === "onboarding-configure-workspace" ||
    action === "onboarding-provision-agent" ||
    action === "openclaw-doctor-fix" ||
    action === "openclaw-security-audit-deep" ||
    action === "openclaw-status-all"
  );
}

export function isStreamingBridgeAction(action?: string): boolean {
  return (
    action === "claude-code-send" ||
    action === "codex-send" ||
    action === "hermes-chat" ||
    action === "room-send"
  );
}

function isLocalAgentStateMutation(action?: string): boolean {
  return (
    action === "onboarding-provision-workspace" ||
    action === "onboarding-configure-workspace" ||
    action === "onboarding-provision-agent" ||
    action === "update-agent-config" ||
    action === "update-agent-identity" ||
    action === "write-agent-identity-doc" ||
    action === "write-openclaw-doc" ||
    action === "write-openclaw-binary"
  );
}

export function getLocalBridgeTimeoutMs(action?: string): number {
  if (isLongRunningBridgeAction(action) || isStreamingBridgeAction(action)) return LONG_BRIDGE_TIMEOUT_MS;
  // hermes-health can enable/check the Hermes API and waits up to ~10s in the
  // connector before falling back to CLI mode. Keep margin for local CPU load.
  if (action === "hermes-health") return HERMES_HEALTH_LOCAL_TIMEOUT_MS;
  return DEFAULT_LOCAL_BRIDGE_TIMEOUT_MS;
}

export function isLocalBridgeTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

export async function probeLocalBridgeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_BRIDGE_BASE_URL}/bridge/health`, {
      signal: AbortSignal.timeout(LOCAL_BRIDGE_HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBridgeMode(): Promise<BridgeModeStatus> {
  const authenticated = Boolean(await getUserToken());
  let localBridgeAvailable = false;
  const localOnly = shouldBlockRemoteHubFallback();

  if (canAttemptLocalBridge()) {
    localBridgeAvailable = await probeLocalBridgeHealth();
    if (localBridgeAvailable) {
      markLocalBridgeAvailable();
      return { mode: "local", authenticated, localBridgeAvailable };
    }
    markLocalBridgeUnavailable();
  }

  if (localOnly) {
    return {
      mode: "unavailable",
      authenticated,
      localBridgeAvailable: false,
      needsLoginForRemote: false,
      reason: "Start the local connector on this machine.",
    };
  }

  if (authenticated) {
    return { mode: "hub", authenticated, localBridgeAvailable: false };
  }

  return {
    mode: "unavailable",
    authenticated: false,
    localBridgeAvailable: false,
    needsLoginForRemote: true,
    reason: "Sign in to use remote devices, or start the local connector on this machine.",
  };
}

// --- Response unwrapping ---
function unwrapHubResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;

  const hubRes = raw as Record<string, unknown>;

  // Hub-level error envelope (has status: "error")
  if (hubRes.status === "error") {
    const errMsg =
      (hubRes.data as { error?: string } | undefined)?.error ||
      (hubRes.error as string) ||
      "Command failed";
    return { success: false, error: errMsg };
  }

  // Bridge response — has "success" field → pass through as-is
  if ("success" in hubRes) {
    return raw;
  }

  // Hub envelope wrapping (e.g. {result: <value>}) — unwrap
  let unwrapped: unknown = hubRes.data ?? raw;
  if (
    unwrapped &&
    typeof unwrapped === "object" &&
    !Array.isArray(unwrapped) &&
    "result" in unwrapped &&
    Object.keys(unwrapped as object).length === 1
  ) {
    unwrapped = (unwrapped as { result: unknown }).result;
  }

  return unwrapped;
}

// --- Gateway connection helper ---
// Shares a single connection-wait promise across concurrent callers.
// Once settled, the promise is cleared so the next caller gets a fresh attempt.
let _gwReadyPromise: Promise<boolean> | null = null;
let _gwReadySettled = false;

/**
 * Ensure the gateway WebSocket is connected in hub mode.
 * If already connected -> returns true immediately.
 * If connecting -> waits up to 5s for connection.
 * If not connecting -> initiates connection with cached credentials, then waits.
 *
 * The shared promise is only reused while it is still pending. Once it settles
 * (whether success or failure), it is cleared so the next caller retries from
 * scratch — preventing a stale rejected/false promise from blocking all
 * subsequent callers indefinitely.
 */
async function ensureGatewayConnected(): Promise<boolean> {
  // Reuse in-flight promise only while it is still pending
  if (_gwReadyPromise && !_gwReadySettled) return _gwReadyPromise;

  // Clear any settled promise from a previous attempt
  _gwReadyPromise = null;
  _gwReadySettled = false;

  _gwReadyPromise = (async () => {
    try {
      if (typeof WebSocket === "undefined") return false; // SSR / Node.js

      const {
        gatewayConnection,
        connectGatewayWs,
        subscribeGatewayConnection,
      } = await import("$/lib/openclaw-gateway-ws");

      if (gatewayConnection.connected && gatewayConnection.hubMode) return true;

      // Initiate connection if not already connecting
      if (!gatewayConnection.wsUrl) {
        const token = await getUserToken();
        if (!token) return false;
        const deviceId = await getActiveDeviceId(token);
        if (!deviceId) return false;
        connectGatewayWs(HUB_API_URL, {
          token,
          hubMode: true,
          hubDeviceId: deviceId,
        });
      }

      // Check again after possible connect call
      if (!gatewayConnection.wsUrl) return false;
      if (gatewayConnection.connected && gatewayConnection.hubMode) return true;

      // Wait for connection (max 5s)
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          unsub();
          resolve(false);
        }, 5000);
        const unsub = subscribeGatewayConnection(() => {
          if (gatewayConnection.connected && gatewayConnection.hubMode) {
            clearTimeout(timeout);
            unsub();
            resolve(true);
          } else if (!gatewayConnection.ws && !gatewayConnection.wsUrl) {
            // Connection attempt ended without success
            clearTimeout(timeout);
            unsub();
            resolve(false);
          }
        });
      });
    } catch {
      return false;
    } finally {
      _gwReadySettled = true;
    }
  })();

  return _gwReadyPromise;
}

// --- Hub command (bridge actions) ---
// Uses the dashboard WebSocket (gateway connection) when available,
// falls back to REST API.
function shouldUseLocalBridgeFastPath(): boolean {
  return isLocalConnectorContext();
}

let _localBridgeDisabledUntil = 0;

function markLocalBridgeUnavailable(): void {
  _localBridgeDisabledUntil = Date.now() + LOCAL_BRIDGE_FAILURE_BACKOFF_MS;
}

function markLocalBridgeAvailable(): void {
  _localBridgeDisabledUntil = 0;
}

export function resetLocalBridgeAvailabilityForTests(): void {
  markLocalBridgeAvailable();
}

function canAttemptLocalBridge(): boolean {
  if (!shouldUseLocalBridgeFastPath()) return false;

  const now = Date.now();
  if (now < _localBridgeDisabledUntil) return false;
  return true;
}

export async function hubCommand(
  body: Record<string, unknown>
): Promise<unknown> {
  const action = body.action as string | undefined;
  const isStreaming = isStreamingBridgeAction(action);
  const isLongRunning = isLongRunningBridgeAction(action);
  const localBridgeAllowed = canAttemptLocalBridge();

  // Try local connector bridge first for same-machine dev/Electron. In
  // local-first mode this is also the logged-out runtime path; streaming
  // actions use the long timeout and may still emit events through the local
  // gateway while the final /bridge request resolves.
  if (localBridgeAllowed) {
    try {
      // Long-running mutations wait on the same local connector instead of
      // retrying through REST, which could duplicate installs/provisioning.
      const localTimeout = getLocalBridgeTimeoutMs(action);
      const bearerToken = await getConnectorBearerToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
      }
      const localRes = await fetch(`${LOCAL_BRIDGE_BASE_URL}/bridge`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(localTimeout),
      });
      if (localRes.ok) {
        markLocalBridgeAvailable();
        const json = await localRes.json();
        return json;
      }
      if (localRes.status === 404 || localRes.status >= 500) {
        markLocalBridgeUnavailable();
      }
    } catch (error) {
      const bridgeAlive = isLocalBridgeTimeoutError(error)
        ? await probeLocalBridgeHealth().catch(() => false)
        : false;
      if (bridgeAlive) {
        markLocalBridgeAvailable();
        if (
          isStreaming ||
          isLongRunning ||
          action === "hermes-health" ||
          shouldBlockRemoteHubFallback()
        ) {
          return {
            success: false,
            error: `Local connector timed out while handling ${action}`,
            localBridgeTimedOut: true,
          };
        }
        // The connector is alive, so do not disable local bridge for unrelated
        // callers. Preserve this action's existing WS/REST fallback behavior.
      } else {
        markLocalBridgeUnavailable();
      }
      // Local bridge not available, try gateway WS
    }
  }

  if (shouldBlockRemoteHubFallback()) {
    return {
      success: false,
      error: "Start the local connector on this machine.",
      needsSetup: true,
      localBridgeUnavailable: true,
    };
  }

  if (isLocalConnectorContext() && isLocalAgentStateMutation(action)) {
    return {
      success: false,
      error: "Start the local connector on this machine before changing local agent state.",
      needsSetup: true,
      localBridgeUnavailable: true,
    };
  }

  const token = await getUserToken();
  if (!token) {
    return {
      success: false,
      error: "Sign in to use remote devices, or start the local connector on this machine.",
      needsLoginForRemote: true,
      needsSetup: true,
    };
  }

  // Try gateway WebSocket (routes through Hub relay). Streaming actions can run
  // for minutes; long-running onboarding actions skip WS entirely below.
  const wsTimeout =
    isStreaming
      ? LONG_BRIDGE_TIMEOUT_MS
      : action === "connector-health"
      ? 5_000
      : undefined;

  // Long-running onboarding actions skip WS and go straight to REST. The WS
  // connection can drop/reconnect during multi-minute installs, which causes
  // the response to be routed to a dead old connection. REST holds the HTTP
  // connection open and is more reliable for long waits.
  if (!isLongRunning) {
    try {
      const { gatewayConnection } = await import("$/lib/openclaw-gateway-ws");

      // Already connected — use WS immediately
      if (gatewayConnection.connected && gatewayConnection.hubMode) {

        const res = await gatewayConnection.request("bridge", body, wsTimeout);
        return unwrapHubResponse(res);
      }

      // Not connected — wait for pending connection or initiate one
      const ready = await ensureGatewayConnected();
      if (ready && gatewayConnection.connected && gatewayConnection.hubMode) {

        const res = await gatewayConnection.request("bridge", body, wsTimeout);
        return unwrapHubResponse(res);
      }
    } catch {
      // Gateway not available, fall back to REST
    }
  }

  // Fallback: Hub REST API

  const deviceId = await getActiveDeviceId(token);
  if (!deviceId) {
    return {
      success: false,
      error: "No device registered",
      needsSetup: true,
    };
  }

  // Short-circuit if we've already determined this device is unreachable.
  if (_deviceUnreachable && _unreachableDeviceId === deviceId) {
    return getDeviceUnreachableResponse();
  }

  const useReachabilityGate = shouldGateRestReachability(action);
  const commandCooldownUntil = _deviceCommand503CooldownUntil.get(deviceId) ?? 0;
  if (useReachabilityGate && Date.now() < commandCooldownUntil) {
    return getDeviceUnreachableResponse();
  }

  const existingReachabilityProbe = useReachabilityGate
    ? _deviceCommandReachabilityProbes.get(deviceId)
    : undefined;
  let waitedForReachabilityProbe = false;
  if (existingReachabilityProbe) {
    waitedForReachabilityProbe = true;
    const reachable = await existingReachabilityProbe;
    if (!reachable || (_deviceUnreachable && _unreachableDeviceId === deviceId)) {
      return getDeviceUnreachableResponse();
    }
  }

  let reachabilityProbe: Promise<boolean> | null = null;
  let resolveReachabilityProbe: ((reachable: boolean) => void) | null = null;
  if (useReachabilityGate && !waitedForReachabilityProbe) {
    reachabilityProbe = new Promise<boolean>((resolve) => {
      resolveReachabilityProbe = resolve;
    });
    _deviceCommandReachabilityProbes.set(deviceId, reachabilityProbe);
  }

  const finishReachabilityProbe = (reachable: boolean) => {
    if (!resolveReachabilityProbe) return;
    resolveReachabilityProbe(reachable);
    resolveReachabilityProbe = null;
    if (reachabilityProbe && _deviceCommandReachabilityProbes.get(deviceId) === reachabilityProbe) {
      _deviceCommandReachabilityProbes.delete(deviceId);
    }
    reachabilityProbe = null;
  };

  // Streaming actions (claude-code-send, codex-send, hermes-chat) can take
  // minutes to complete. The 30s default REST timeout would abort them
  // prematurely with "signal timed out" if the WS path failed and we fell
  // through to REST. Use the long timeout for both long-running and streaming
  // actions so the REST fallback matches the WS expectations.
  const restSignal = AbortSignal.timeout(
    isLongRunning || isStreaming ? LONG_BRIDGE_TIMEOUT_MS : DEFAULT_REST_TIMEOUT_MS
  );
  let res: Response;
  try {
    res = await fetch(getHubUrl(`/api/devices/${deviceId}/command`), {
      method: "POST",
      headers: buildHubHeaders(token),
      body: JSON.stringify(body),
      signal: restSignal,
    });
  } catch (error) {
    finishReachabilityProbe(true);
    throw error;
  }

  if (res.status === 401 || res.status === 403) {
    finishReachabilityProbe(true);
    handleAuthExpired();
    return { success: false, error: "Session expired — please re-login" };
  }

  if (res.status === 503) {
    // Device offline is not an auth problem — reset the auth failure counter
    // so rapid 503→retry cycles don't accidentally trip the session-expired banner.
    resetAuthFailureCount();
    _deviceCommand503CooldownUntil.set(deviceId, Date.now() + DEVICE_COMMAND_503_COOLDOWN_MS);
    handleDeviceUnreachable(deviceId);
    finishReachabilityProbe(false);
    return getDeviceUnreachableResponse();
  }

  if (res.ok) {
    resetDeviceFailureCount(deviceId);
    resetAuthFailureCount();
  }
  finishReachabilityProbe(true);

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { success: false, error: text || `Hub returned ${res.status}` };
  }

  return unwrapHubResponse(parsed);
}

// --- Generic authenticated Hub fetch ---
export async function hubFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!isHubConfigured()) return makeHubUnavailableResponse();
  const token = await getUserToken();
  const method = (options.method || "GET").toUpperCase();

  return fetch(getHubUrl(path), {
    ...options,
    method,
    headers: buildHubHeaders(token, options.headers, method !== "GET"),
  });
}

export function getHubApiUrl(): string {
  return HUB_API_URL;
}
