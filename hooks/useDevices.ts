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
 */
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hubFetch("/api/devices");
      if (!res.ok) {
        setDevices([]);
        return;
      }
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const neverConnected = new Set(["provisioning", "connecting"]);
  const needsSetup = !loading && (devices.length === 0 || devices.every((d) => neverConnected.has(d.status)));
  const hasOnlineDevice = devices.some((d) => d.status === "online");

  return { devices, loading, error, needsSetup, hasOnlineDevice, refetch: fetchDevices };
}
