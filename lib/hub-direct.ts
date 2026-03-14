/**
 * Client-side Hub API client.
 * Calls the Hub directly from the browser (no serverless proxy).
 * Auth: JWT from NextAuth session.
 * Device: fetched from Hub /api/devices and cached.
 */
import { getSession } from "next-auth/react";

const HUB_API_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL || "https://hub.hypercho.com";

// --- Token cache ---
let _tokenCache: { token: string; expiresAt: number } | null = null;
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function getUserToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }
  const session = await getSession();
  const token = (session?.user as any)?.token || "";
  if (token) {
    _tokenCache = { token, expiresAt: Date.now() + TOKEN_CACHE_TTL };
  }
  return token;
}

export function clearTokenCache() {
  _tokenCache = null;
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

// --- Hub command (bridge actions) ---
// Uses the dashboard WebSocket (gateway connection) when available,
// falls back to REST API.
export async function hubCommand(
  body: Record<string, unknown>
): Promise<unknown> {
  // Try gateway WebSocket first (it's already connected in hub mode)
  try {
    const { gatewayConnection } = await import("$/lib/openclaw-gateway-ws");
    if (gatewayConnection.connected && gatewayConnection.hubMode) {
      const res = await gatewayConnection.request("bridge", body);
      return unwrapHubResponse(res);
    }
  } catch {
    // Gateway not available, fall back to REST
  }

  // Fallback: REST API
  const token = await getUserToken();
  if (!token) return { success: false, error: "Not authenticated" };

  const deviceId = await getActiveDeviceId(token);
  if (!deviceId)
    return {
      success: false,
      error: "No device registered",
      needsSetup: true,
    };

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
