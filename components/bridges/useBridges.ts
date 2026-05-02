/**
 * Live bridges hook.
 *
 * Pulls credentials from the connector daemon (encrypted credentials store
 * at ~/.hyperclaw/credentials.enc, listed via `credentials:list`) and merges
 * them with the static catalog so each bridge has a `status` reflecting
 * whether the user has actually configured it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listCredentials,
  storeAndApply,
  deleteCredential,
  type MaskedCredential,
} from "$/lib/credential-client";
import { useSharedDevices } from "$/Providers/DevicesProv";
import { BRIDGES, type BridgeDef, type BridgeStatus } from "./bridges-catalog";

export interface LiveBridge extends BridgeDef {
  status: BridgeStatus;
  account: string;
  /** ISO timestamp the credential was added, when known. */
  addedAt?: string;
}

const ACCOUNT_NOT_CONFIGURED = "not configured";

function statusFor(cred: MaskedCredential | undefined): BridgeStatus {
  if (!cred) return "off";
  // The connector returns a masked credential; presence implies "connected".
  // Future work: add health pings + a "needs-auth" / "paused" state from the
  // connector's runtime adapter so we can show real signal here.
  return "connected";
}

function accountFor(b: BridgeDef, cred: MaskedCredential | undefined): string {
  if (!cred) return ACCOUNT_NOT_CONFIGURED;
  return cred.masked ? `${b.id} · ${cred.masked}` : b.id;
}

export interface UseBridgesResult {
  bridges: LiveBridge[];
  loading: boolean;
  error: string | null;
  deviceId: string | null;
  refetch: () => Promise<void>;
  saveBridge: (bridgeId: string, apiKey: string, type?: string) => Promise<{ success: boolean; error?: string }>;
  removeBridge: (bridgeId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useBridges(): UseBridgesResult {
  const { devices } = useSharedDevices();
  const deviceId = useMemo(() => {
    const online = devices.find((d) => d.status === "online");
    return online?.id ?? devices[0]?.id ?? null;
  }, [devices]);

  const [creds, setCreds] = useState<MaskedCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!deviceId) {
      setCreds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listCredentials(deviceId);
      setCreds(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load credentials");
      setCreds([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const credByProvider = useMemo(() => {
    const map = new Map<string, MaskedCredential>();
    creds.forEach((c) => {
      if (c.provider) map.set(c.provider, c);
    });
    return map;
  }, [creds]);

  const bridges: LiveBridge[] = useMemo(() => {
    return BRIDGES.map((b) => {
      const lookup = b.providerId ?? b.id;
      const cred = credByProvider.get(lookup);
      return {
        ...b,
        status: statusFor(cred),
        account: accountFor(b, cred),
        addedAt: cred?.added,
      };
    });
  }, [credByProvider]);

  const saveBridge = useCallback(
    async (bridgeId: string, apiKey: string, type = "api_key") => {
      if (!deviceId) {
        return { success: false, error: "No device connected. Start the connector to save credentials." };
      }
      const trimmed = apiKey.trim();
      if (!trimmed) {
        return { success: false, error: "API key is empty." };
      }
      const result = await storeAndApply(deviceId, bridgeId, type, trimmed);
      if (result.success) {
        await refetch();
      }
      return result;
    },
    [deviceId, refetch],
  );

  const removeBridge = useCallback(
    async (bridgeId: string) => {
      if (!deviceId) return { success: false, error: "No device connected." };
      const result = await deleteCredential(deviceId, bridgeId);
      if (result.success) await refetch();
      return result;
    },
    [deviceId, refetch],
  );

  return { bridges, loading, error, deviceId, refetch, saveBridge, removeBridge };
}
