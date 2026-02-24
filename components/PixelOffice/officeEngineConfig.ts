"use client";

import { useState, useEffect, useRef } from "react";
import type { OfficeState } from "./office/engine/officeState";
import type { OfficeLayout } from "./office/types";
import { setFloorSprites } from "./office/floorTiles";
import { clearColorizeCache } from "./office/colorize";
import { setWallSprites } from "./office/wallTiles";
import { setCharacterTemplates } from "./office/sprites/spriteData";
import { loadWallSprites, loadFloorSprites, loadCharacterSheets } from "./officeAssetLoader";

/**
 * Host-agnostic config for the Pixel Office engine.
 * Use this so Openclaw, Claude Code, or any other host can plug in their own
 * layout source, asset paths, and persistence without depending on Hyperclaw.
 */
export interface OfficeEngineConfig {
  /** Base URL or path for assets (e.g. "/pixel-office" or "https://cdn.example/office"). */
  assetBasePath: string;
  /**
   * Provide the initial layout (sync or async).
   * Can read from localStorage, an API, a preset, or a file.
   */
  getInitialLayout: () => OfficeLayout | Promise<OfficeLayout>;
  /** Called when layout is applied (e.g. to persist or sync to backend). */
  onSaveLayout?: (layout: OfficeLayout) => void;
  /** Called when user assigns agents to seats (e.g. persist or send to extension). */
  onSaveAgentSeats?: (seats: Record<number, { palette?: number; seatId: string | null }>) => void;
}

export interface UseOfficeEngineResult {
  layoutReady: boolean;
}

/**
 * Generic office engine hook: loads layout and assets from config.
 * Does not sync agents — the host (Hyperclaw, Openclaw, Claude Code) is responsible
 * for feeding agents into OfficeState via addAgent/removeAgent.
 */
export function useOfficeEngine(
  getOfficeState: () => OfficeState,
  config: OfficeEngineConfig,
  onLayoutLoaded?: (layout: OfficeLayout) => void
): UseOfficeEngineResult {
  const [layoutReady, setLayoutReady] = useState(false);
  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const os = getOfficeState();
    const run = async () => {
      clearColorizeCache();
      const layout = await Promise.resolve(config.getInitialLayout());
      os.rebuildFromLayout(layout);
      onLayoutLoaded?.(layout);

      // Load each asset set independently so missing walls.png doesn't block characters/floors
      try {
        const [wallSprites, floorSprites, charSheets] = await Promise.all([
          loadWallSprites(config.assetBasePath).catch((e) => {
            console.warn("[PixelOffice] Walls load failed:", e);
            return [];
          }),
          loadFloorSprites(config.assetBasePath).catch(() => []),
          loadCharacterSheets(config.assetBasePath).catch((e) => {
            console.warn("[PixelOffice] Character sheets load failed:", e);
            return [];
          }),
        ]);
        if (wallSprites.length > 0) setWallSprites(wallSprites);
        if (floorSprites.length > 0) setFloorSprites(floorSprites);
        if (charSheets.length > 0) setCharacterTemplates(charSheets);
      } catch (e) {
        console.warn("[PixelOffice] Asset load failed:", e);
      }
      setLayoutReady(true);
    };
    run();
  }, [getOfficeState, config.assetBasePath, onLayoutLoaded]);

  return { layoutReady };
}
