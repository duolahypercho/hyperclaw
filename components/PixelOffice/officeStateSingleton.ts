"use client";

import { OfficeState } from "./office/engine/officeState";

/**
 * Single source of truth for the Pixel Office layout and engine state.
 * Both the full page (Tool/PixelOffice) and the dashboard widget use this
 * same singleton. Layout is loaded from:
 * 1. Bridge "read-office-layout" (if available)
 * 2. localStorage under LAYOUT_STORAGE_KEY (current / auto-saved)
 * 3. Templates (presets) when no saved layout
 */
export const LAYOUT_STORAGE_KEY = "pixel-office-layout";
/** User-defined default layout; used when no session layout is saved. */
export const DEFAULT_LAYOUT_STORAGE_KEY = "pixel-office-default-layout";
/** Last N layouts (serialized), most recent first. Used for "Restore previous". */
export const LAYOUT_HISTORY_KEY = "pixel-office-layout-history";
const LAYOUT_HISTORY_MAX = 5;
/** Set when user has saved or chosen a layout (so we don't show template picker again). */
export const HAS_USER_LAYOUT_KEY = "pixel-office-has-user-layout";

export function pushLayoutToHistory(serialized: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(LAYOUT_HISTORY_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    list.unshift(serialized);
    localStorage.setItem(LAYOUT_HISTORY_KEY, JSON.stringify(list.slice(0, LAYOUT_HISTORY_MAX)));
  } catch {}
}

export function getLayoutHistory(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LAYOUT_HISTORY_KEY);
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
