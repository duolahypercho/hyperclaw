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
  "hyperclaw-ceo-id",
  "guided-setup-state",
  "hyperclaw-company",
];

const cache: Record<string, string> = {};
let hydrated = false;
/** true when hydrate() actually got data from the backend */
let hydratedWithData = false;
let pendingEntries: Record<string, string> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<boolean> | null = null;

type PersistOptions = {
  flush?: boolean;
};

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

/** Persist a key to localStorage as a secondary backup. */
function backupToLocal(key: string, value: string) {
  try {
    localStorage.setItem(`ds:${key}`, value);
  } catch { /* quota exceeded or unavailable */ }
}

/** Read a key from localStorage backup. */
function readLocalBackup(key: string): string | null {
  try {
    return localStorage.getItem(`ds:${key}`);
  } catch {
    return null;
  }
}

/** Save to backend with retry (1 retry after 2s). */
async function persistToBackend(entries: Record<string, string>): Promise<boolean> {
  const keys = Object.keys(entries);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = (await bridgeInvoke("save-app-state", { entries })) as {
        success?: boolean;
        error?: string;
      };
      if (res?.success) {
        // saved successfully
        return true;
      }
      console.warn("[dashboard-state] save-app-state returned:", res?.error || "no success flag", "keys:", keys);
    } catch (err) {
      console.warn(`[dashboard-state] save attempt ${attempt + 1} failed for ${keys.join(", ")}:`, err);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function schedulePersist(entries: Record<string, string>, options: PersistOptions = {}) {
  pendingEntries = { ...pendingEntries, ...entries };
  if (options.flush) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushPendingEntries();
    return;
  }
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPendingEntries();
  }, 400);
}

async function flushPendingEntries(): Promise<boolean> {
  if (flushInFlight) return flushInFlight;
  const entries = pendingEntries;
  if (Object.keys(entries).length === 0) return true;
  pendingEntries = {};
  flushInFlight = persistToBackend(entries).then((success) => {
    if (!success) {
      pendingEntries = { ...entries, ...pendingEntries };
    } else if (Object.keys(pendingEntries).length > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushPendingEntries();
      }, 0);
    }
    return success;
  }).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

export const dashboardState = {
  get(key: string): string | null {
    return cache[key] ?? null;
  },

  set(key: string, value: string, options: PersistOptions = {}) {
    cache[key] = value;
    backupToLocal(key, value);
    schedulePersist({ [key]: value }, options);
    notifyIfLayoutKey(key);
  },

  /** Batch-set multiple keys in one SQLite transaction */
  setMany(entries: Record<string, string>, options: PersistOptions = {}) {
    Object.assign(cache, entries);
    for (const [k, v] of Object.entries(entries)) backupToLocal(k, v);
    schedulePersist(entries, options);
    for (const key of Object.keys(entries)) {
      notifyIfLayoutKey(key);
    }
  },

  remove(key: string, options: PersistOptions = {}) {
    delete cache[key];
    try { localStorage.removeItem(`ds:${key}`); } catch {}
    schedulePersist({ [key]: "" }, options);
    notifyIfLayoutKey(key);
  },

  flush(): Promise<boolean> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    return flushPendingEntries();
  },

  isHydrated() {
    return hydrated;
  },

  /** Whether hydrate() successfully loaded data from the backend. */
  isHydratedWithData() {
    return hydratedWithData;
  },

  /** Load all dashboard keys from SQLite into memory. Call once at app startup. */
  async hydrate(): Promise<void> {
    if (hydrated) return;

    // Try loading from backend
    try {
      const res = (await bridgeInvoke("get-app-state", { keys: ALL_KEYS })) as {
        success?: boolean;
        data?: Record<string, string>;
        error?: string;
      };
      if (res?.success && res.data) {
        let count = 0;
        for (const [k, v] of Object.entries(res.data)) {
          if (v) {
            cache[k] = v;
            backupToLocal(k, v); // keep local backup in sync
            count++;
          }
        }
        if (count > 0) hydratedWithData = true;
        // hydrated from backend
      } else {
        console.warn("[dashboard-state] hydrate backend returned:", res?.error || "empty/no success");
      }
    } catch (err) {
      console.warn("[dashboard-state] hydrate from backend failed:", err);
    }

    // If backend returned nothing, try localStorage backup
    if (!hydratedWithData) {
      console.warn("[dashboard-state] backend had no data, trying localStorage backup");
      let count = 0;
      for (const key of ALL_KEYS) {
        const val = readLocalBackup(key);
        if (val) {
          cache[key] = val;
          count++;
        }
      }
      if (count > 0) {
        hydratedWithData = true;
        console.log("[dashboard-state] restored", count, "keys from localStorage backup");
      }
    }

    hydrated = true;
  },

  /**
   * Re-attempt loading from backend (used when gateway connects after initial hydration failed).
   * Returns true if new data was loaded.
   */
  async rehydrate(): Promise<boolean> {
    try {
      const res = (await bridgeInvoke("get-app-state", { keys: ALL_KEYS })) as {
        success?: boolean;
        data?: Record<string, string>;
      };
      if (res?.success && res.data) {
        let count = 0;
        for (const [k, v] of Object.entries(res.data)) {
          if (v) {
            cache[k] = v;
            backupToLocal(k, v);
            count++;
          }
        }
        if (count > 0) {
          hydratedWithData = true;
          console.log("[dashboard-state] rehydrated", count, "keys from backend");
          return true;
        }
      }
    } catch (err) {
      console.warn("[dashboard-state] rehydrate failed:", err);
    }
    return false;
  },
};
