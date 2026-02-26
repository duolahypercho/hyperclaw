const LAYOUT_STORAGE_KEY = "pixel-office-layout";
const HAS_USER_LAYOUT_KEY = "pixel-office-has-user-layout";

function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { electronAPI?: { hyperClawBridge?: { invoke?: unknown } } };
  return Boolean(w.electronAPI?.hyperClawBridge?.invoke);
}

/**
 * Stub for Hyperclaw: no VS Code API. saveLayout is persisted to localStorage,
 * or in Electron to ~/.hyperclaw/office/layout.json so others can edit with Claude Code.
 */
export const vscode = {
  postMessage: (msg: unknown) => {
    const m = msg as { type?: string; layout?: unknown; seats?: unknown };
    if (m?.type === "saveLayout" && m.layout) {
      if (isElectron()) {
        (window as unknown as { electronAPI: { hyperClawBridge: { invoke: (a: string, b: object) => Promise<unknown> } } })
          .electronAPI.hyperClawBridge.invoke("write-office-layout", { layout: m.layout })
          .catch(() => {});
        return;
      }
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(m.layout));
        localStorage.setItem(HAS_USER_LAYOUT_KEY, "1");
      } catch {
        // ignore
      }
    }
  },
};
