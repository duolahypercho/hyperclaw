"use client";

import { OfficeState } from "./office/engine/officeState";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";

/**
 * Single source of truth for the Pixel Office layout and engine state.
 * Both the full page (Tool/PixelOffice) and the dashboard widget use this
 * same singleton. Layout is loaded from:
 * 1. Bridge "read-office-layout" → SQLite app_state
 * 2. Templates (presets) when no saved layout
 */

/** App-state keys for SQLite persistence */
export const DEFAULT_LAYOUT_STORAGE_KEY = "office-default-layout";
export const LAYOUT_HISTORY_KEY = "office-layout-history";
export const HAS_USER_LAYOUT_KEY = "office-has-user-layout";

const LAYOUT_HISTORY_MAX = 5;

/** Push a serialized layout snapshot to the history stored in SQLite. Fire-and-forget. */
export function pushLayoutToHistory(serialized: string): void {
  bridgeInvoke("get-app-state", { keys: [LAYOUT_HISTORY_KEY] })
    .then((res: any) => {
      const raw = res?.data?.[LAYOUT_HISTORY_KEY];
      const list: string[] = raw ? JSON.parse(raw) : [];
      list.unshift(serialized);
      return bridgeInvoke("save-app-state", {
        entries: { [LAYOUT_HISTORY_KEY]: JSON.stringify(list.slice(0, LAYOUT_HISTORY_MAX)) },
      });
    })
    .catch(() => {});
}

/** Read layout history from SQLite. */
export async function getLayoutHistory(): Promise<string[]> {
  try {
    const res = (await bridgeInvoke("get-app-state", { keys: [LAYOUT_HISTORY_KEY] })) as {
      success?: boolean;
      data?: Record<string, string>;
    };
    const raw = res?.data?.[LAYOUT_HISTORY_KEY];
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const officeStateRef = { current: null as OfficeState | null };

export function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}
