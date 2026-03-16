import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/**
 * Stub for Hyperclaw: no VS Code API. saveLayout is persisted via
 * bridge → SQLite app_state table.
 */
export const vscode = {
  postMessage: (msg: unknown) => {
    const m = msg as { type?: string; layout?: unknown; seats?: unknown };
    if (m?.type === "saveLayout" && m.layout) {
      bridgeInvoke("write-office-layout", { layout: m.layout }).catch(() => {});
    }
  },
};
