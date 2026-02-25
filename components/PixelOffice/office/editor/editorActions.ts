import { TileType, MAX_COLS, MAX_ROWS } from '../types'
import { DEFAULT_NEUTRAL_COLOR } from '../../constants'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, FloorColor } from '../types'
import { getCatalogEntry, getRotatedType, getToggledType } from '../layout/furnitureCatalog'
import { getPlacementBlockedTiles, getEffectiveFootprint } from '../layout/layoutSerializer'

/** Paint a single tile with pattern and color. Returns new layout (immutable). */
export function paintTile(layout: OfficeLayout, col: number, row: number, tileType: TileTypeVal, color?: FloorColor): OfficeLayout {
  const idx = row * layout.cols + col
  if (idx < 0 || idx >= layout.tiles.length) return layout

  const existingColors = layout.tileColors || new Array(layout.tiles.length).fill(null)
  const newColor = color ?? (tileType === TileType.WALL || tileType === TileType.VOID ? null : { ...DEFAULT_NEUTRAL_COLOR })

  // Check if anything actually changed
  if (layout.tiles[idx] === tileType) {
    const existingColor = existingColors[idx]
    if (newColor === null && existingColor === null) return layout
    if (newColor && existingColor &&
      newColor.h === existingColor.h && newColor.s === existingColor.s &&
      newColor.b === existingColor.b && newColor.c === existingColor.c &&
      !!newColor.colorize === !!existingColor.colorize) return layout
  }

  const tiles = [...layout.tiles]
  tiles[idx] = tileType
  const tileColors = [...existingColors]
  tileColors[idx] = newColor
  return { ...layout, tiles, tileColors }
}

/** Place furniture. Returns new layout (immutable). */
export function placeFurniture(layout: OfficeLayout, item: PlacedFurniture): OfficeLayout {
  if (!canPlaceFurniture(layout, item.type, item.col, item.row, undefined, item.rotation)) return layout
  return { ...layout, furniture: [...layout.furniture, item] }
}

/** Remove furniture by uid. Returns new layout (immutable). */
export function removeFurniture(layout: OfficeLayout, uid: string): OfficeLayout {
  const filtered = layout.furniture.filter((f) => f.uid !== uid)
  if (filtered.length === layout.furniture.length) return layout
  return { ...layout, furniture: filtered }
}

/** Move furniture to new position. Returns new layout (immutable). */
export function moveFurniture(layout: OfficeLayout, uid: string, newCol: number, newRow: number): OfficeLayout {
  const item = layout.furniture.find((f) => f.uid === uid)
  if (!item) return layout
  if (!canPlaceFurniture(layout, item.type, newCol, newRow, uid, item.rotation)) return layout
  return {
    ...layout,
    furniture: layout.furniture.map((f) => (f.uid === uid ? { ...f, col: newCol, row: newRow } : f)),
  }
}

/** Clamp (col, row) so a footprint (w, h) stays fully inside the grid. */
function clampPositionToGrid(
  col: number,
  row: number,
  w: number,
  h: number,
  cols: number,
  rows: number
): { col: number; row: number } {
  const newCol = Math.max(0, Math.min(cols - w, col))
  const newRow = Math.max(0, Math.min(rows - h, row))
  return { col: newCol, row: newRow }
}

/** Rotate furniture to the next orientation. Returns new layout (immutable). Clamps position so item stays inside grid. */
export function rotateFurniture(layout: OfficeLayout, uid: string, direction: 'cw' | 'ccw'): OfficeLayout {
  const item = layout.furniture.find((f) => f.uid === uid)
  if (!item) return layout
  const newType = getRotatedType(item.type, direction)
  // Use type-based rotation only when we get a different, valid catalog type (handles replaced/custom furniture)
  const useTypeRotation = newType && newType !== item.type && getCatalogEntry(newType)
  let updated: PlacedFurniture
  if (useTypeRotation) {
    updated = { ...item, type: newType }
  } else {
    const step = direction === 'cw' ? 90 : -90
    const next = ((item.rotation ?? 0) + step + 360) % 360
    updated = { ...item, rotation: next as 0 | 90 | 180 | 270 }
  }
  // Clamp position so item stays inside grid (only when we have catalog entry for effective footprint)
  const entry = getCatalogEntry(updated.type)
  if (entry) {
    const { w: effW, h: effH } = getEffectiveFootprint(updated, entry)
    const { col: clampedCol, row: clampedRow } = clampPositionToGrid(
      updated.col,
      updated.row,
      effW,
      effH,
      layout.cols,
      layout.rows
    )
    if (clampedCol !== updated.col || clampedRow !== updated.row) {
      updated = { ...updated, col: clampedCol, row: clampedRow }
    }
  }
  return {
    ...layout,
    furniture: layout.furniture.map((f) => (f.uid === uid ? updated : f)),
  }
}

/** Toggle furniture state (on/off). Returns new layout (immutable). */
export function toggleFurnitureState(layout: OfficeLayout, uid: string): OfficeLayout {
  const item = layout.furniture.find((f) => f.uid === uid)
  if (!item) return layout
  const newType = getToggledType(item.type)
  if (!newType) return layout
  return {
    ...layout,
    furniture: layout.furniture.map((f) => (f.uid === uid ? { ...f, type: newType } : f)),
  }
}

/** For wall items, offset the row so the bottom row aligns with the hovered tile. */
export function getWallPlacementRow(type: string, row: number): number {
  const entry = getCatalogEntry(type)
  if (!entry?.canPlaceOnWalls) return row
  return row - (entry.footprintH - 1)
}

/** Check if furniture can be placed at (col, row) without overlapping. */
export function canPlaceFurniture(
  layout: OfficeLayout,
  type: string,
  col: number,
  row: number,
  excludeUid?: string,
  rotation?: number,
): boolean {
  const entry = getCatalogEntry(type)
  if (!entry) return false

  const rotNorm = rotation != null ? ((rotation % 360) + 360) % 360 : 0
  const fpW = (rotNorm === 90 || rotNorm === 270) ? entry.footprintH : entry.footprintW
  const fpH = (rotNorm === 90 || rotNorm === 270) ? entry.footprintW : entry.footprintH

  if (entry.canPlaceOnWalls) {
    const bottomRow = row + fpH - 1
    if (col < 0 || col + fpW > layout.cols || bottomRow < 0 || bottomRow >= layout.rows) {
      return false
    }
  } else {
    if (col < 0 || row < 0 || col + fpW > layout.cols || row + fpH > layout.rows) {
      return false
    }
  }

  const bgRows = entry.backgroundTiles || 0
  for (let dr = 0; dr < fpH; dr++) {
    if (dr < bgRows) continue
    if (row + dr < 0) continue
    if (entry.canPlaceOnWalls && dr < fpH - 1) continue
    for (let dc = 0; dc < fpW; dc++) {
      const idx = (row + dr) * layout.cols + (col + dc)
      const tileVal = layout.tiles[idx]
      if (entry.canPlaceOnWalls) {
        if (tileVal !== TileType.WALL) return false
      } else {
        if (tileVal === TileType.VOID) return false
        if (tileVal === TileType.WALL) return false
      }
    }
  }

  // Build occupied set excluding the item being moved, skipping background tile rows
  const occupied = getPlacementBlockedTiles(layout.furniture, excludeUid)

  // If this item can be placed on surfaces, build set of desk tiles to exclude from collision (use effective footprint for rotated desks)
  let deskTiles: Set<string> | null = null
  if (entry.canPlaceOnSurfaces) {
    deskTiles = new Set<string>()
    for (const item of layout.furniture) {
      if (item.uid === excludeUid) continue
      const itemEntry = getCatalogEntry(item.type)
      if (!itemEntry || !itemEntry.isDesk) continue
      const { w: effW, h: effH } = getEffectiveFootprint(item, itemEntry)
      for (let dr = 0; dr < effH; dr++) {
        for (let dc = 0; dc < effW; dc++) {
          deskTiles.add(`${item.col + dc},${item.row + dr}`)
        }
      }
    }
  }

  const newBgRows = entry.backgroundTiles || 0
  for (let dr = 0; dr < fpH; dr++) {
    if (dr < newBgRows) continue
    if (row + dr < 0) continue
    for (let dc = 0; dc < fpW; dc++) {
      const key = `${col + dc},${row + dr}`
      if (occupied.has(key) && !(deskTiles?.has(key))) return false
    }
  }

  return true
}

export type ExpandDirection = 'left' | 'right' | 'up' | 'down'

/**
 * Expand layout by 1 tile in the given direction. New tiles are VOID.
 * Furniture and tile indices are shifted when expanding left or up.
 * Returns { layout, shift } or null if exceeding MAX_COLS/MAX_ROWS.
 */
export function expandLayout(
  layout: OfficeLayout,
  direction: ExpandDirection,
): { layout: OfficeLayout; shift: { col: number; row: number } } | null {
  const { cols, rows, tiles, furniture, tileColors } = layout
  const existingColors = tileColors || new Array(tiles.length).fill(null)

  let newCols = cols
  let newRows = rows
  let shiftCol = 0
  let shiftRow = 0

  if (direction === 'right') {
    newCols = cols + 1
  } else if (direction === 'left') {
    newCols = cols + 1
    shiftCol = 1
  } else if (direction === 'down') {
    newRows = rows + 1
  } else if (direction === 'up') {
    newRows = rows + 1
    shiftRow = 1
  }

  if (newCols > MAX_COLS || newRows > MAX_ROWS) return null

  // Build new tile array
  const newTiles: TileTypeVal[] = new Array(newCols * newRows).fill(TileType.VOID as TileTypeVal)
  const newColors: Array<FloorColor | null> = new Array(newCols * newRows).fill(null)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const oldIdx = r * cols + c
      const newIdx = (r + shiftRow) * newCols + (c + shiftCol)
      newTiles[newIdx] = tiles[oldIdx]
      newColors[newIdx] = existingColors[oldIdx]
    }
  }

  // Shift furniture positions
  const newFurniture: PlacedFurniture[] = furniture.map((f) => ({
    ...f,
    col: f.col + shiftCol,
    row: f.row + shiftRow,
  }))

  return {
    layout: { ...layout, cols: newCols, rows: newRows, tiles: newTiles, tileColors: newColors, furniture: newFurniture },
    shift: { col: shiftCol, row: shiftRow },
  }
}
