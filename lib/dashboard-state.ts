/**
 * In-memory cache for dashboard state, persisted to SQLite.
 * Replaces localStorage as the cross-component bridge + persistence layer.
 */
import { bridgeInvoke } from "./hyperclaw-bridge-client";

const ALL_KEYS = [
  "dashboard-layout",
  "dashboard-visible-widgets",
  "dashboard-widget-configs",
  "dashboard-widget-instances",
  "dashboard-active-layout-id",
  "dashboard-default-layout",
  "dashboard-default-visible-widgets",
  "dashboard-default-widget-configs",
  "dashboard-default-widget-instances",
];

const cache: Record<string, string> = {};
let hydrated = false;

/** Keys whose changes should notify the LayoutSwitcher for auto-save. */
const LAYOUT_KEYS = new Set([
  "dashboard-layout",
  "dashboard-visible-widgets",
  "dashboard-widget-configs",
  "dashboard-widget-instances",
]);

function notifyIfLayoutKey(key: string) {
  if (typeof window !== "undefined" && LAYOUT_KEYS.has(key)) {
    window.dispatchEvent(new CustomEvent("dashboard-state-changed", { detail: { key } }));
  }
}

export const dashboardState = {
  get(key: string): string | null {
    return cache[key] ?? null;
  },

  set(key: string, value: string) {
    cache[key] = value;
    bridgeInvoke("save-app-state", { entries: { [key]: value } }).catch(() => {});
    notifyIfLayoutKey(key);
  },

  /** Batch-set multiple keys in one SQLite transaction */
  setMany(entries: Record<string, string>) {
    Object.assign(cache, entries);
    bridgeInvoke("save-app-state", { entries }).catch(() => {});
    for (const key of Object.keys(entries)) {
      notifyIfLayoutKey(key);
    }
  },

  remove(key: string) {
    delete cache[key];
    bridgeInvoke("save-app-state", { entries: { [key]: "" } }).catch(() => {});
    notifyIfLayoutKey(key);
  },

  isHydrated() {
    return hydrated;
  },

  /** Load all dashboard keys from SQLite into memory. Call once at app startup. */
  async hydrate(): Promise<void> {
    if (hydrated) return;
    try {
      const res = (await bridgeInvoke("get-app-state", { keys: ALL_KEYS })) as {
        success?: boolean;
        data?: Record<string, string>;
      };
      if (res?.success && res.data) {
        for (const [k, v] of Object.entries(res.data)) {
          if (v) cache[k] = v;
        }
      }
    } catch {}
    hydrated = true;
  },
};
