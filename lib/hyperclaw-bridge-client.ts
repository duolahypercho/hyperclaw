/**
 * Single entry point for all /api/hyperclaw-bridge calls.
 * In Electron (production desktop app), uses IPC so the bridge runs on the user's
 * machine and never hits Vercel. In the browser, uses fetch to the same origin.
 */
export type BridgeBody = Record<string, unknown>;

let _bridgeLogOnce = false;
function logBridgeMode(useIPC: boolean) {
  if (_bridgeLogOnce || typeof window === "undefined") return;
  _bridgeLogOnce = true;
  if (useIPC) {
    console.info("[Hyperclaw] Bridge: using IPC (Electron main.js)");
  } else {
    console.info("[Hyperclaw] Bridge: using fetch (browser / no electronAPI)");
  }
}

export async function bridgeInvoke(action: string, body: BridgeBody = {}): Promise<unknown> {
  const useIPC =
    typeof window !== "undefined" &&
    (window as unknown as { electronAPI?: { hyperClawBridge?: { invoke?: (a: string, b: BridgeBody) => Promise<unknown> } } })
      .electronAPI?.hyperClawBridge?.invoke;

  logBridgeMode(!!useIPC);

  if (useIPC) {
    // Electron: bridge runs in main process (electron/main.js). Next.js API is never called.
    return (window as unknown as { electronAPI: { hyperClawBridge: { invoke: (a: string, b: BridgeBody) => Promise<unknown> } } }).electronAPI.hyperClawBridge.invoke(
      action,
      body
    );
  }

  // Browser: call Next.js API route pages/api/hyperclaw-bridge.ts
  const res = await fetch("/api/hyperclaw-bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  return res.json();
}
