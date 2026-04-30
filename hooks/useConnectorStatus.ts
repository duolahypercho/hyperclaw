import { useCallback, useEffect, useRef, useState } from "react";
import {
  getGatewayConnectionState,
  gatewayConnection,
  subscribeGatewayConnection,
  probeConnectorHealth,
  resetGatewayConnection,
  type ConnectorHealth,
} from "$/lib/openclaw-gateway-ws";
import { hubFetch, isAuthExpired } from "$/lib/hub-direct";

// Mirrors the status union in components/Tool/Devices/index.tsx STATUS_CONFIG.
export type DeviceStatus =
  | "provisioning"
  | "connecting"
  | "online"
  | "offline"
  | "revoked";

export type ConnectorState =
  // Not logged in or JWT expired.
  | { state: "unauthenticated" }
  // No devices registered on the account.
  | { state: "no-device" }
  // Device exists but dashboard→hub WS is not open yet.
  | { state: "connecting" }
  // WS dropped, reconnect loop exhausted all attempts.
  | { state: "permanently-failed" }
  // Hub WS is down but we haven't given up yet.
  | { state: "hub-disconnected" }
  // Hub WS open, but the device row reports non-online status.
  | { state: "connector-offline"; deviceName: string; deviceStatus: DeviceStatus }
  // Connector is online, but its local OpenClaw gateway socket is not ready.
  | { state: "gateway-unhealthy"; deviceName: string; gatewayState: string; lastProbeMs: number }
  // Device was revoked server-side.
  | { state: "revoked"; deviceName: string }
  // Hub WS open + probe round-trip succeeded.
  | { state: "connected"; deviceName: string; lastProbeMs: number };

interface HubDevice {
  id?: string;
  _id?: string;
  name?: string;
  status?: DeviceStatus;
  updatedAt?: string;
}

const DEVICE_POLL_MS = 30_000;
const PROBE_INTERVAL_MS = 45_000;
const PROBE_TIMEOUT_MS = 8_000;

async function fetchDevices(): Promise<HubDevice[] | null> {
  try {
    const res = await hubFetch("/api/devices");
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data as HubDevice[]) : [];
  } catch {
    return null;
  }
}

function pickActiveDevice(devices: HubDevice[]): HubDevice | null {
  if (devices.length === 0) return null;
  const online = devices.filter((d) => d.status === "online");
  if (online.length > 0) {
    return online.reduce((a, b) =>
      (a.updatedAt || "") > (b.updatedAt || "") ? a : b
    );
  }
  return devices[0];
}

interface UseConnectorStatusResult {
  status: ConnectorState;
  refresh: () => void;
  retry: () => void;
}

export function useConnectorStatus(): UseConnectorStatusResult {
  const [hubConnected, setHubConnected] = useState(
    () => getGatewayConnectionState().connected
  );
  const [permanentlyFailed, setPermanentlyFailed] = useState(false);
  const [devices, setDevices] = useState<HubDevice[] | null>(null);
  const [probe, setProbe] = useState<{
    healthy: boolean | null;
    health: ConnectorHealth | null;
    error: string | null;
    ms: number;
    at: number;
  }>({ healthy: null, health: null, error: null, ms: 0, at: 0 });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribe to WS connection state.
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      const s = getGatewayConnectionState();
      if (!mountedRef.current) return;
      setHubConnected(s.connected);
    });
  }, []);

  useEffect(() => {
    const handlePermanentlyFailed = () => {
      if (!mountedRef.current) return;
      setPermanentlyFailed(true);
    };
    window.addEventListener("gateway:permanently_failed", handlePermanentlyFailed);
    return () => {
      window.removeEventListener("gateway:permanently_failed", handlePermanentlyFailed);
    };
  }, []);

  // Poll device list.
  const refreshDevices = useCallback(async () => {
    const list = await fetchDevices();
    if (!mountedRef.current) return;
    setDevices(list);
  }, []);

  useEffect(() => {
    refreshDevices();
    const id = setInterval(refreshDevices, DEVICE_POLL_MS);
    return () => clearInterval(id);
  }, [refreshDevices]);

  // Periodically probe connector/gateway health when hub WS is up.
  useEffect(() => {
    if (!hubConnected) {
      setProbe((p) => ({ ...p, healthy: null, health: null, error: null }));
      return;
    }
    let cancelled = false;

    const runProbe = async () => {
      const started = Date.now();
      const result = await probeConnectorHealth(PROBE_TIMEOUT_MS);
      if (cancelled || !mountedRef.current) return;
      setProbe({
        healthy: result.healthy,
        health: result.health ?? null,
        error: result.error ?? null,
        ms: Date.now() - started,
        at: Date.now(),
      });
    };

    runProbe();
    const unsubscribeHealth = gatewayConnection.on("connector.health", () => {
      void runProbe();
    });
    const id = setInterval(runProbe, PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      unsubscribeHealth();
      clearInterval(id);
    };
  }, [hubConnected]);

  const retry = useCallback(() => {
    resetGatewayConnection();
    setPermanentlyFailed(false);
    refreshDevices();
  }, [refreshDevices]);

  const status = deriveStatus({
    hubConnected,
    permanentlyFailed,
    devices,
    probe,
  });

  return { status, refresh: refreshDevices, retry };
}

interface DeriveInput {
  hubConnected: boolean;
  permanentlyFailed: boolean;
  devices: HubDevice[] | null;
  probe: {
    healthy: boolean | null;
    health: ConnectorHealth | null;
    error: string | null;
    ms: number;
    at: number;
  };
}

function deriveStatus({
  hubConnected,
  permanentlyFailed,
  devices,
  probe,
}: DeriveInput): ConnectorState {
  if (isAuthExpired()) return { state: "unauthenticated" };
  if (permanentlyFailed) return { state: "permanently-failed" };

  // Devices haven't loaded yet — treat as connecting to avoid flash of red.
  if (devices === null) {
    return { state: "connecting" };
  }

  if (devices.length === 0) return { state: "no-device" };

  const active = pickActiveDevice(devices);
  if (!active) return { state: "no-device" };

  const deviceName = active.name || active.id || active._id || "device";
  const deviceStatus = active.status ?? "offline";

  if (deviceStatus === "revoked") return { state: "revoked", deviceName };

  if (!hubConnected) {
    return { state: "hub-disconnected" };
  }

  if (deviceStatus !== "online") {
    return {
      state: "connector-offline",
      deviceName,
      deviceStatus,
    };
  }

  // Hub WS up and device online — consult the cheap connector health action.
  if (probe.health?.connectorOnline === true && probe.health.gatewayConnected === false) {
    return {
      state: "gateway-unhealthy",
      deviceName,
      gatewayState: probe.health.gatewayState || "disconnected",
      lastProbeMs: probe.ms,
    };
  }

  if (probe.healthy === false) {
    return {
      state: "connector-offline",
      deviceName,
      deviceStatus: "offline",
    };
  }

  return {
    state: "connected",
    deviceName,
    lastProbeMs: probe.healthy === true ? probe.ms : 0,
  };
}
