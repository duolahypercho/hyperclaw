/**
 * Single entry point for all bridge calls.
 *
 * All commands route through Hub API → Connector (cross-device compatible).
 */
import { hubCommand } from "$/lib/hub-direct";

export type BridgeBody = Record<string, unknown>;

export async function bridgeInvoke(action: string, body: BridgeBody = {}): Promise<unknown> {
  // Route Claude Code actions through dedicated Electron IPC when available
  if (
    typeof window !== "undefined" &&
    window.electronAPI?.claudeCode &&
    action.startsWith("claude-code-")
  ) {
    const cc = window.electronAPI.claudeCode;
    switch (action) {
      case "claude-code-status":
        return cc.status();
      case "claude-code-send":
        return cc.send(body as Parameters<typeof cc.send>[0]);
      case "claude-code-abort":
        return cc.abort(body as Parameters<typeof cc.abort>[0]);
      default:
        break;
    }
  }

  if (
    typeof window !== "undefined" &&
    window.electronAPI?.hyperClawBridge?.invoke
  ) {
    return window.electronAPI.hyperClawBridge.invoke(action, body);
  }
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
