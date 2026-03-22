import { useState, useEffect, useCallback } from "react";
import { hubFetch } from "$/lib/hub-direct";

export interface Device {
  id: string;
  name: string;
  type: string;
  status: "provisioning" | "connecting" | "online" | "offline" | "revoked";
  lastSeenAt: string | null;
  platform: string;
  hostname: string;
  tags: string[];
  env: string;
}

/**
 * Fetches user's devices from the hub directly (no serverless proxy).
 * @param authReady - pass true once the user is authenticated so the
 *   fetch only fires when a valid JWT is available. This prevents a
 *   premature 401 from being misinterpreted as "no devices".
 */
export function useDevices(authReady = true) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track whether we got a real successful response from the hub.
  // Without this, a failed API call (401, network error) sets devices=[]
  // which looks identical to "user has no devices" and wrongly triggers
  // the onboarding/setup screen.
  const [fetched, setFetched] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hubFetch("/api/devices");
      if (!res.ok) {
        setDevices([]);
        setFetched(false);
        return;
      }
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
      setFetched(true);
    } catch {
      setDevices([]);
      setFetched(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Only fetch when auth is ready — avoids a premature 401 that would
  // silently produce an empty device list and show the setup screen.
  useEffect(() => {
    if (authReady) fetchDevices();
  }, [fetchDevices, authReady]);

  const neverConnected = new Set(["provisioning", "connecting"]);
  const needsSetup = fetched && !loading && (devices.length === 0 || devices.every((d) => neverConnected.has(d.status)));
  const hasOnlineDevice = devices.some((d) => d.status === "online");

  return { devices, loading, error, needsSetup, hasOnlineDevice, refetch: fetchDevices };
}
