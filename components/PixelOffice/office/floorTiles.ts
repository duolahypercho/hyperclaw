/**
 * Floor tile pattern storage and caching.
 *
 * Supports two modes:
 * 1. Legacy: 7 grayscale floor patterns loaded from floors.png (16x16 tiles)
 * 2. MV: 432 floor tiles from Modern_Office_MV_Floors_TILESET_A2.png (32x32 tiles)
 *
 * Uses shared colorize module for HSL tinting (Photoshop-style Colorize).
 * Caches colorized SpriteData by (pattern, h, s, b, c) key.
 */

import type { SpriteData, FloorColor } from './types'
import { getColorizedSprite, clearColorizeCache } from './colorize'
import { TILE_SIZE, FALLBACK_FLOOR_COLOR } from '../constants'

/** Default solid gray 16×16 tile used when floors.png is not loaded */
const DEFAULT_FLOOR_SPRITE_16: SpriteData = Array.from(
  { length: 16 },
  () => Array(16).fill(FALLBACK_FLOOR_COLOR) as string[],
)

/** Default solid gray 32×32 tile (for MV tilesets) */
const DEFAULT_FLOOR_SPRITE_32: SpriteData = Array.from(
  { length: TILE_SIZE },
  () => Array(TILE_SIZE).fill(FALLBACK_FLOOR_COLOR) as string[],
)

/** Module-level storage for floor tile sprites (set once on load) */
let floorSprites: SpriteData[] = []

/** Whether we're using MV tiles (32x32 instead of 16x16) */
let isMVTiles = false

/** Maximum number of floor patterns to expose in the editor (top 25 distinct styles) */
const MAX_FLOOR_PATTERNS = 25

/** Wall color constant */
export const WALL_COLOR = '#3A3A5C'

/** Set floor tile sprites (called once when extension sends floorTilesLoaded) */
export function setFloorSprites(sprites: SpriteData[]): void {
  floorSprites = sprites
  isMVTiles = false
  clearColorizeCache()
}

/** Set MV floor tile sprites (32x32 tiles) */
export function setMVFloorSprites(sprites: SpriteData[]): void {
  floorSprites = sprites
  isMVTiles = sprites.length > 0 && sprites[0]?.length === TILE_SIZE
  clearColorizeCache()
}

/** Check if using MV tiles (32x32) */
export function isMVMode(): boolean {
  return isMVTiles
}

/** Get the raw (grayscale) floor sprite for a pattern index (1-based).
 *  Falls back to the default solid gray tile when floors.png is not loaded.
 *  Only returns tiles from the first 10 patterns (limited for editor). */
export function getFloorSprite(patternIndex: number): SpriteData | null {
  const idx = patternIndex - 1
  if (idx < 0) return null
  // Limit to first MAX_FLOOR_PATTERNS tiles
  if (idx >= MAX_FLOOR_PATTERNS) return null
  if (idx < floorSprites.length) return floorSprites[idx]
  // No PNG sprites loaded — return default solid tile for any valid pattern index
  if (floorSprites.length === 0 && patternIndex >= 1) {
    return isMVTiles ? DEFAULT_FLOOR_SPRITE_32 : DEFAULT_FLOOR_SPRITE_16
  }
  return null
}

/** Get floor sprite by MV tile index (0-based for direct tile access).
 *  Only returns tiles from the first 10 indices (limited for editor). */
export function getMVFloorSprite(tileIndex: number): SpriteData | null {
  if (!isMVTiles) return null
  // Limit to first MAX_FLOOR_PATTERNS tiles
  if (tileIndex >= MAX_FLOOR_PATTERNS) return null
  if (tileIndex < 0 || tileIndex >= floorSprites.length) {
    return null
  }
  return floorSprites[tileIndex]
}

/** Check if floor sprites are available (always true — falls back to default solid tile) */
export function hasFloorSprites(): boolean {
  return true
}

/** Get count of available floor patterns (limited to top 10 distinct styles) */
export function getFloorPatternCount(): number {
  const total = floorSprites.length > 0 ? floorSprites.length : 1
  return Math.min(total, MAX_FLOOR_PATTERNS)
}

/** Display name for a floor pattern index (1-based). Used in editor toolbar.
 *  Provides friendly names for the top 25 floor styles. */
export function getFloorPatternName(patternIndex: number): string {
  // Limit to MAX_FLOOR_PATTERNS
  if (patternIndex > MAX_FLOOR_PATTERNS) return `Floor ${patternIndex}`

  // For MV tilesets, generate names based on tile position
  if (isMVTiles && floorSprites.length > 0) {
    const cols = 24 // MV tileset has 24 columns
    const idx = patternIndex - 1
    const row = Math.floor(idx / cols)
    const col = idx % cols
    return `Fl${row + 1}-${col + 1}`
  }

  const names: Record<number, string> = {
    1: 'Solid',
    2: 'Wood',
    3: 'Dots',
    4: 'Dots2',
    5: 'Dots3',
    6: 'Stone1',
    7: 'Stone2',
    8: 'Stone3'
  }
  return names[patternIndex] ?? `Pattern ${patternIndex}`
}

/** Get all floor sprites (for preview rendering, limited to top 10) */
export function getAllFloorSprites(): SpriteData[] {
  if (floorSprites.length > 0) return floorSprites.slice(0, MAX_FLOOR_PATTERNS)
  return isMVTiles ? [DEFAULT_FLOOR_SPRITE_32] : [DEFAULT_FLOOR_SPRITE_16]
}

/**
 * Get a colorized version of a floor sprite.
 * Uses Photoshop-style Colorize: grayscale -> HSL with given hue/saturation,
 * then brightness/contrast adjustment.
 */
export function getColorizedFloorSprite(patternIndex: number, color: FloorColor): SpriteData {
  const key = `floor-${patternIndex}-${color.h}-${color.s}-${color.b}-${color.c}`

  const base = getFloorSprite(patternIndex)
  if (!base) {
    // Return a magenta error tile
    const size = isMVTiles ? TILE_SIZE : 16
    const err: SpriteData = Array.from({ length: size }, () => Array(size).fill('#FF00FF'))
    return err
  }

  // Floor tiles are always colorized (grayscale patterns need Photoshop-style Colorize)
  return getColorizedSprite(key, base, { ...color, colorize: true })
}

/**
 * Get a colorized MV floor sprite by tile index.
 */
export function getColorizedMVFloorSprite(tileIndex: number, color: FloorColor): SpriteData {
  const key = `mvfloor-${tileIndex}-${color.h}-${color.s}-${color.b}-${color.c}`

  const base = getMVFloorSprite(tileIndex)
  if (!base) {
    const err: SpriteData = Array.from({ length: TILE_SIZE }, () => Array(TILE_SIZE).fill('#FF00FF'))
    return err
  }

  return getColorizedSprite(key, base, { ...color, colorize: true })
}
