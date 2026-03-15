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
];

const cache: Record<string, string> = {};
let hydrated = false;

export const dashboardState = {
  get(key: string): string | null {
    return cache[key] ?? null;
  },

  set(key: string, value: string) {
    cache[key] = value;
    bridgeInvoke("save-app-state", { entries: { [key]: value } }).catch(() => {});
  },

  /** Batch-set multiple keys in one SQLite transaction */
  setMany(entries: Record<string, string>) {
    Object.assign(cache, entries);
    bridgeInvoke("save-app-state", { entries }).catch(() => {});
  },

  remove(key: string) {
    delete cache[key];
    bridgeInvoke("save-app-state", { entries: { [key]: "" } }).catch(() => {});
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
