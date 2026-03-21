/**
 * Client-side Hub API client.
 * Calls the Hub directly from the browser (no serverless proxy).
 * Auth: JWT from NextAuth session.
 * Device: fetched from Hub /api/devices and cached.
 */
import { getCachedToken } from "./auth-token-cache";

const HUB_API_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL || "https://hub.hypercho.com";

/**
 * Returns the cached JWT. Never calls getSession() to avoid flooding
 * /api/auth/session — the token is populated by UserProvider from the
 * SessionProvider context.
 */
export async function getUserToken(): Promise<string> {
  return getCachedToken() || "";
}

export function clearTokenCache() {
  // no-op — token lifecycle is managed by auth-token-cache
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
  const jwt = token || (await getUserToken());
  if (!jwt) return null;

  try {
    const res = await fetch(`${HUB_API_URL}/api/devices`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
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
export async function hubCommand(
  body: Record<string, unknown>
): Promise<unknown> {
  // Try gateway WebSocket first (it's already connected in hub mode)
  try {
    const { gatewayConnection } = await import("$/lib/openclaw-gateway-ws");

    // Already connected — use WS immediately
    if (gatewayConnection.connected && gatewayConnection.hubMode) {
      const res = await gatewayConnection.request("bridge", body);
      return unwrapHubResponse(res);
    }

    // Not connected — wait for pending connection or initiate one
    const ready = await ensureGatewayConnected();
    if (ready && gatewayConnection.connected && gatewayConnection.hubMode) {
      const res = await gatewayConnection.request("bridge", body);
      return unwrapHubResponse(res);
    }
  } catch {
    // Gateway not available, fall back to REST
  }

  // Fallback: REST API
  const token = await getUserToken();
  if (!token) {
    return { success: false, error: "Not authenticated" };
  }

  const deviceId = await getActiveDeviceId(token);
  if (!deviceId) {
    return {
      success: false,
      error: "No device registered",
      needsSetup: true,
    };
  }

  const res = await fetch(
    `${HUB_API_URL}/api/devices/${deviceId}/command`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

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
  const token = await getUserToken();
  return fetch(`${HUB_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}

export function getHubApiUrl(): string {
  return HUB_API_URL;
}
