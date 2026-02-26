"use client";

import { useState, useEffect, useRef } from "react";
import type { OfficeState } from "./office/engine/officeState";
import type { OfficeLayout } from "./office/types";
import { setFloorSprites, setMVFloorSprites } from "./office/floorTiles";
import { clearColorizeCache } from "./office/colorize";
import { setWallSprites } from "./office/wallTiles";
import { setCharacterTemplates } from "./office/sprites/spriteData";
import { loadWallSprites, loadFloorSprites, loadCharacterSheets, loadMVFloorSprites } from "./officeAssetLoader";

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
        // First try to load MV tilesets (new RPG Maker format)
        const [mvFloorSprites, charSheets] = await Promise.all([
          loadMVFloorSprites(config.assetBasePath).catch(() => []),
          loadCharacterSheets(config.assetBasePath).catch((e) => {
            console.warn("[PixelOffice] Character sheets load failed:", e);
            return [];
          }),
        ]);

        // Use MV tilesets if available, otherwise fall back to legacy
        if (mvFloorSprites.length > 0) {
          setMVFloorSprites(mvFloorSprites);
        } else {
          // Fall back to legacy floors.png
          const floorSprites = await loadFloorSprites(config.assetBasePath).catch(() => []);
          if (floorSprites.length > 0) setFloorSprites(floorSprites);
        }

        const wallSprites = await loadWallSprites(config.assetBasePath).catch(() => []);
        if (wallSprites.length > 0) setWallSprites(wallSprites);

        if (charSheets && charSheets.length > 0) setCharacterTemplates(charSheets);
      } catch (e) {
        console.warn("[PixelOffice] Asset load failed:", e);
      }
      setLayoutReady(true);
    };
    run();
  }, [getOfficeState, config.assetBasePath, onLayoutLoaded]);

  return { layoutReady };
}
