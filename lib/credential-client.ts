/**
 * Credential management client.
 *
 * All operations are device-scoped (explicit deviceId, never auto-selected)
 * and use E2E encryption — the Hub never sees plaintext API keys.
 */
import { encryptForDevice, isValidPubkey } from "./e2e-crypto";
import { hubFetch, getUserToken } from "./hub-direct";

const HUB_API_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL || "https://hub.hypercho.com";

// --- Types ---

export interface DeviceInfo {
  id: string;
  name: string;
  status: string;
  connectorPubkey?: string;
}

export interface MaskedCredential {
  provider: string;
  type: string;
  masked: string;
  added: string;
}

export interface StoreCredentialResult {
  success: boolean;
  provider?: string;
  error?: string;
}

// --- Device pubkey ---

/**
 * Fetch a specific device's info including its X25519 public key.
 * Returns null if the device doesn't exist or has no pubkey.
 */
export async function getDevicePubkey(
  deviceId: string
): Promise<string | null> {
  const token = await getUserToken();
  if (!token) return null;

  try {
    const res = await hubFetch(`/api/devices`);
    if (!res.ok) return null;

    const devices: DeviceInfo[] = await res.json();
    const device = devices.find(
      (d) => (d.id || (d as any)._id) === deviceId
    );

    if (!device?.connectorPubkey) return null;
    if (!isValidPubkey(device.connectorPubkey)) return null;

    return device.connectorPubkey;
  } catch {
    return null;
  }
}

/**
 * Check if a device has E2E encryption ready (pubkey registered).
 */
export async function isDeviceE2EReady(deviceId: string): Promise<boolean> {
  const pubkey = await getDevicePubkey(deviceId);
  return pubkey !== null;
}

// --- Credential operations ---

/**
 * Send a bridge command to a specific device.
 * Unlike hubCommand() which auto-selects a device, this explicitly
 * targets a deviceId to prevent credential routing bugs.
 */
async function deviceBridgeCommand(
  deviceId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const token = await getUserToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `${HUB_API_URL}/api/devices/${deviceId}/command`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Device command failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Store a credential on a specific device using E2E encryption.
 *
 * 1. Fetches the device's X25519 public key
 * 2. Encrypts the API key with NaCl sealed box
 * 3. Sends the encrypted blob to the connector via bridge action
 *
 * The Hub never sees the plaintext API key.
 */
export async function storeCredential(
  deviceId: string,
  provider: string,
  type: string,
  apiKey: string
): Promise<StoreCredentialResult> {
  // 1. Get device pubkey
  const pubkey = await getDevicePubkey(deviceId);
  if (!pubkey) {
    return {
      success: false,
      error: "Device has no encryption key. Is the connector running?",
    };
  }

  // 2. Encrypt with sealed box
  const encryptedPayload = encryptForDevice(apiKey, pubkey);

  // 3. Send to connector via device-specific command
  const result = (await deviceBridgeCommand(deviceId, {
    action: "credentials:store",
    provider,
    type,
    encryptedPayload,
  })) as StoreCredentialResult;

  return result;
}

/**
 * List credentials stored on a device (masked, never full keys).
 */
export async function listCredentials(
  deviceId: string
): Promise<MaskedCredential[]> {
  try {
    const result = (await deviceBridgeCommand(deviceId, {
      action: "credentials:list",
    })) as any;

    // The connector returns {credentials: [...]} or the array directly
    const creds = result?.credentials || result?.result?.credentials || [];
    return Array.isArray(creds) ? creds : [];
  } catch {
    return [];
  }
}

/**
 * Delete a credential from a device.
 */
export async function deleteCredential(
  deviceId: string,
  provider: string
): Promise<{ success: boolean; error?: string }> {
  const result = (await deviceBridgeCommand(deviceId, {
    action: "credentials:delete",
    provider,
  })) as any;

  return {
    success: result?.success ?? false,
    error: result?.error,
  };
}

/**
 * Apply credentials to runtimes on a device (signal restart/reload).
 */
export async function applyCredentials(
  deviceId: string,
  provider?: string
): Promise<{ success: boolean; applied?: string[] }> {
  const result = (await deviceBridgeCommand(deviceId, {
    action: "credentials:apply",
    ...(provider ? { provider } : {}),
  })) as any;

  return {
    success: result?.success ?? false,
    applied: result?.applied,
  };
}

/**
 * Store a credential and immediately apply it to runtimes.
 * Convenience function for the onboarding flow.
 */
export async function storeAndApply(
  deviceId: string,
  provider: string,
  type: string,
  apiKey: string
): Promise<StoreCredentialResult> {
  const storeResult = await storeCredential(deviceId, provider, type, apiKey);
  if (!storeResult.success) return storeResult;

  // Fire-and-forget apply — don't block on runtime restart
  applyCredentials(deviceId, provider).catch(() => {});

  return storeResult;
}
