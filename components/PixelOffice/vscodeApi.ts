import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

const LAYOUT_STORAGE_KEY = "pixel-office-layout";
const HAS_USER_LAYOUT_KEY = "pixel-office-has-user-layout";

/**
 * Stub for Hyperclaw: no VS Code API. saveLayout is persisted via
 * Hub → Connector so it works cross-device, with localStorage fallback.
 */
export const vscode = {
  postMessage: (msg: unknown) => {
    const m = msg as { type?: string; layout?: unknown; seats?: unknown };
    if (m?.type === "saveLayout" && m.layout) {
      bridgeInvoke("write-office-layout", { layout: m.layout }).catch(() => {});
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(m.layout));
        localStorage.setItem(HAS_USER_LAYOUT_KEY, "1");
      } catch {
        // ignore
      }
    }
  },
};
