"use client";

import { OfficeState } from "./office/engine/officeState";

/**
 * Single source of truth for the Pixel Office layout and engine state.
 * Both the full page (Tool/PixelOffice) and the dashboard widget use this
 * same singleton, so the layout you set on the full page is always the same
 * in the widget (and vice versa). Layout is loaded from:
 * 1. Bridge "read-office-layout" (if available)
 * 2. localStorage under LAYOUT_STORAGE_KEY
 * 3. Preset "cody-office" or default
 */
export const LAYOUT_STORAGE_KEY = "pixel-office-layout";

const officeStateRef = { current: null as OfficeState | null };

export function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}
