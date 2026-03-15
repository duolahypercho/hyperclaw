/**
 * Single entry point for all bridge calls.
 *
 * Always routes through Hub API → Connector (cross-device compatible).
 */
import { hubCommand } from "$/lib/hub-direct";

export type BridgeBody = Record<string, unknown>;

export async function bridgeInvoke(action: string, body: BridgeBody = {}): Promise<unknown> {
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
