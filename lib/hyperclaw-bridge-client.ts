/**
 * Single entry point for all bridge calls.
 *
 * Priority: Electron IPC → Hub direct (browser).
 *
 * In Electron mode, uses IPC so the bridge runs on the user's machine.
 * In the browser, calls the Hub API directly (no serverless proxy).
 */
import { hubCommand } from "$/lib/hub-direct";

export type BridgeBody = Record<string, unknown>;

let _bridgeLogOnce = false;
function logBridgeMode(mode: "ipc" | "hub") {
  if (_bridgeLogOnce || typeof window === "undefined") return;
  _bridgeLogOnce = true;
  const labels = {
    ipc: "[Hyperclaw] Bridge: using IPC (Electron main.js)",
    hub: "[Hyperclaw] Bridge: using Hub direct (browser)",
  };
  console.info(labels[mode]);
}

export async function bridgeInvoke(action: string, body: BridgeBody = {}): Promise<unknown> {
  // Priority 1: Electron IPC
  const useIPC =
    typeof window !== "undefined" &&
    (window as unknown as { electronAPI?: { hyperClawBridge?: { invoke?: (a: string, b: BridgeBody) => Promise<unknown> } } })
      .electronAPI?.hyperClawBridge?.invoke;

  if (useIPC) {
    logBridgeMode("ipc");
    return (window as unknown as { electronAPI: { hyperClawBridge: { invoke: (a: string, b: BridgeBody) => Promise<unknown> } } }).electronAPI.hyperClawBridge.invoke(
      action,
      body
    );
  }

  // Priority 2: Direct Hub API call (no serverless proxy)
  logBridgeMode("hub");
  return hubCommand({ action, ...body });
}

// Local usage storage helpers
export interface LocalUsageData {
  daily: Record<string, {
    input: number;
    output: number;
    totalTokens: number;
    totalCost: number;
    inputCost: number;
    outputCost: number;
    cacheRead: number;
    cacheWrite: number;
    cacheReadCost: number;
    cacheWriteCost: number;
  }>;
  lastUpdated: string;
}

export async function saveLocalUsage(usageData: LocalUsageData): Promise<{ success: boolean; error?: string }> {
  return await bridgeInvoke("save-local-usage", { usageData }) as { success: boolean; error?: string };
}

export async function loadLocalUsage(): Promise<{ success: boolean; data: LocalUsageData | null; error?: string }> {
  return await bridgeInvoke("load-local-usage", {}) as { success: boolean; data: LocalUsageData | null; error?: string };
}
