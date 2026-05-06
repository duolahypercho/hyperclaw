import { useState, useEffect, useCallback, useRef } from "react";
import { getBridgeMode, hubFetch } from "$/lib/hub-direct";

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
  // Populated once the guided setup wizard has fully finished for this device
  // (runtimes installed, agents provisioned). Used by MainLayout together with
  // status==="online" to decide whether to skip GuidedSetup on a fresh browser.
  onboardingCompletedAt?: string | null;
}

function localConnectorDevice(): Device {
  return {
    id: "local",
    name: "Local connector",
    type: "local",
    status: "online",
    lastSeenAt: new Date().toISOString(),
    platform: "local",
    hostname: "localhost",
    tags: ["community", "local"],
    env: "local",
    onboardingCompletedAt: new Date().toISOString(),
  };
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

  // AbortController ref prevents stale responses from overwriting fresh data
  const abortRef = useRef<AbortController | null>(null);

  const fetchDevices = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const bridgeMode = await getBridgeMode();
      if (controller.signal.aborted) return;
      if (bridgeMode.mode === "local" && bridgeMode.localBridgeAvailable) {
        const localDevice = localConnectorDevice();
        setDevices([localDevice]);
        setFetched(true);
        return;
      }
      const res = await hubFetch("/api/devices", { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setDevices([]);
        setFetched(false);
        return;
      }
      const data = await res.json();
      if (controller.signal.aborted) return;
      setDevices(Array.isArray(data) ? data : []);
      setFetched(true);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setDevices([]);
      setFetched(false);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Only fetch when auth is ready — avoids a premature 401 that would
  // silently produce an empty device list and show the setup screen.
  useEffect(() => {
    if (authReady) fetchDevices();
    return () => abortRef.current?.abort();
  }, [fetchDevices, authReady]);

  const neverConnected = new Set(["provisioning", "connecting"]);
  const needsSetup = fetched && !loading && (devices.length === 0 || devices.every((d) => neverConnected.has(d.status)));
  const hasOnlineDevice = devices.some((d) => d.status === "online");
  // True only when at least one device is BOTH online AND has had its
  // onboarding-complete flag stamped by the hub. This is the signal the
  // dashboard uses to skip GuidedSetup: an online connector alone is not
  // enough, because the wizard may still be mid-install of OpenClaw, Hermes,
  // or the chosen agents.
  const hasOnboardedDevice = devices.some(
    (d) => d.status === "online" && !!d.onboardingCompletedAt
  );

  return { devices, loading, error, needsSetup, hasOnlineDevice, hasOnboardedDevice, refetch: fetchDevices };
}
