import React, { createContext, useContext, useEffect, useRef } from "react";
import { useDevices } from "$/hooks/useDevices";

type DevicesContextValue = ReturnType<typeof useDevices>;

const DevicesContext = createContext<DevicesContextValue | null>(null);

const POLL_INTERVAL = 30_000; // 30s

interface DevicesProviderProps {
  authReady: boolean;
  children: React.ReactNode;
}

/**
 * Shares a single useDevices instance across the component tree.
 * Polls every 30s and refetches on gateway/device events so
 * the connector status dot stays current.
 */
export function DevicesProvider({ authReady, children }: DevicesProviderProps) {
  const devices = useDevices(authReady);
  const refetchRef = useRef(devices.refetch);
  refetchRef.current = devices.refetch;

  // Poll every 30s while authenticated
  useEffect(() => {
    if (!authReady) return;
    const id = setInterval(() => refetchRef.current(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [authReady]);

  // Refetch on connector/gateway lifecycle events
  useEffect(() => {
    const handler = () => refetchRef.current();
    const events = [
      "openclaw-doctor-done",
      "gateway-connected",
      "hyperclaw:device-status-changed",
      "hyperclaw:device-reachable",
    ];
    events.forEach((e) => window.addEventListener(e, handler));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, []);

  return (
    <DevicesContext.Provider value={devices}>
      {children}
    </DevicesContext.Provider>
  );
}

/**
 * Consume the shared devices state. Must be rendered inside DevicesProvider.
 * Falls back to a standalone useDevices() if no provider is found (safety net).
 */
export function useSharedDevices(): DevicesContextValue {
  const ctx = useContext(DevicesContext);
  if (!ctx) {
    throw new Error("useSharedDevices must be used within DevicesProvider");
  }
  return ctx;
}
