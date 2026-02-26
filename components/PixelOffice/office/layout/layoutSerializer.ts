import { TileType, FurnitureType, DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE, Z_ROW_SCALE, Direction } from '../types'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Seat, FurnitureInstance, FloorColor } from '../types'
import { getCatalogEntry } from './furnitureCatalog'
import { getColorizedSprite } from '../colorize'

/** Effective footprint (width, height) for a placed item. When rotation is 90° or 270°, W and H are swapped so 3x1 becomes 1x3. */
export function getEffectiveFootprint(
  item: PlacedFurniture,
  entry: { footprintW: number; footprintH: number }
): { w: number; h: number } {
  const rot = Number(item.rotation) || 0
  const rotNorm = ((rot % 360) + 360) % 360
  if (rotNorm === 90 || rotNorm === 270) return { w: entry.footprintH, h: entry.footprintW }
  return { w: entry.footprintW, h: entry.footprintH }
}

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = []
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c])
    }
    map.push(row)
  }
  return map
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk zY per tile so surface items can sort in front of desks (skip cutouts). Use row-dominant scale so lower-on-screen draws in front.
  const deskZByTile = new Map<string, number>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    const { w: effW, h: effH } = getEffectiveFootprint(item, entry)
    const deskZY = item.row * Z_ROW_SCALE + entry.sprite.length
    const cutouts = entry.cutoutTiles
      ? new Set(entry.cutoutTiles.map(({ dc, dr }) => `${dc},${dr}`))
      : null
    for (let dr = 0; dr < effH; dr++) {
      for (let dc = 0; dc < effW; dc++) {
        if (cutouts?.has(`${dc},${dr}`)) continue
        const key = `${item.col + dc},${item.row + dr}`
        const prev = deskZByTile.get(key)
        if (prev === undefined || deskZY > prev) deskZByTile.set(key, deskZY)
      }
    }
  }

  const instances: FurnitureInstance[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue

    // Compute draw anchor so the rotated sprite's bbox starts at (col, row).
    // Layout stores (col, row) as top-left of the effective footprint.
    const rotDeg = item.rotation ?? 0
    const rotNorm = ((rotDeg % 360) + 360) % 360
    const { w: effW, h: effH } = getEffectiveFootprint(item, entry)
    let x: number, y: number
    if (rotNorm === 90) {
      x = (item.col + effW) * TILE_SIZE
      y = item.row * TILE_SIZE
    } else if (rotNorm === 180) {
      x = (item.col + effW) * TILE_SIZE
      y = (item.row + effH) * TILE_SIZE
    } else if (rotNorm === 270) {
      x = item.col * TILE_SIZE
      y = (item.row + effH) * TILE_SIZE
    } else {
      x = item.col * TILE_SIZE
      y = item.row * TILE_SIZE
    }

    const spriteH = entry.sprite.length
    // Row-dominant z-order: higher row (lower on screen) = higher zY = drawn in front. Prevents chairs below desks from appearing "inside" the desk.
    let zY = item.row * Z_ROW_SCALE + spriteH

    if (entry.category === 'chairs') {
      // Chairs draw in front of same-row furniture (e.g. desk surface); small offset breaks tie.
      if (entry.orientation === 'back') {
        zY = item.row * Z_ROW_SCALE + spriteH + 1
      } else {
        zY = item.row * Z_ROW_SCALE + spriteH + 0.5
      }
    }

    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < effH; dr++) {
        for (let dc = 0; dc < effW; dc++) {
          const deskZ = deskZByTile.get(`${item.col + dc},${item.row + dr}`)
          if (deskZ !== undefined && deskZ + 0.5 > zY) zY = deskZ + 0.5
        }
      }
    }

    // Wall-mounted items (awards, picture frames, etc.) must draw in front of all wall tiles they occupy.
    // Use the bottom row of the item so zY is in front of every wall in that range (placement uses top row but item spans item.row … item.row+effH-1).
    if (entry.canPlaceOnWalls) {
      const bottomRow = item.row + effH - 1
      const wallFrontZ = bottomRow * Z_ROW_SCALE + Z_ROW_SCALE - 1
      if (wallFrontZ > zY) zY = wallFrontZ
    }

    let sprite = entry.sprite
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color
      sprite = getColorizedSprite(`furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`, entry.sprite, item.color)
    }

    instances.push({
      sprite,
      x,
      y,
      zY,
      rotationDeg: rotNorm !== 0 ? rotNorm : undefined,
      uid: item.uid,
      ...(entry.hasChairBack ? { hasChairBack: true } : {}),
    })
  }
  return instances
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips backgroundTiles rows and cutoutTiles. Uses effective footprint (3x1 → 1x3 when rotated 90/270). */
export function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const { w: effW, h: effH } = getEffectiveFootprint(item, entry)
    const bgRows = entry.backgroundTiles || 0
    const cutouts = entry.cutoutTiles
      ? new Set(entry.cutoutTiles.map(({ dc, dr }) => `${dc},${dr}`))
      : null
    for (let dr = 0; dr < effH; dr++) {
      if (dr < bgRows) continue
      for (let dc = 0; dc < effW; dc++) {
        if (cutouts?.has(`${dc},${dr}`)) continue
        const key = `${item.col + dc},${item.row + dr}`
        if (excludeTiles && excludeTiles.has(key)) continue
        tiles.add(key)
      }
    }
  }
  return tiles
}

/** Get tiles blocked for placement purposes — skips backgroundTiles rows and cutoutTiles. Uses effective footprint for rotation. */
export function getPlacementBlockedTiles(furniture: PlacedFurniture[], excludeUid?: string): Set<string> {
  const tiles = new Set<string>()
  const cutoutSet = (entry: { cutoutTiles?: Array<{ dc: number; dr: number }> }) => {
    if (!entry.cutoutTiles?.length) return null
    return new Set(entry.cutoutTiles.map(({ dc, dr }) => `${dc},${dr}`))
  }
  for (const item of furniture) {
    if (item.uid === excludeUid) continue
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    if (entry.doesNotBlockPlacement) continue
    const { w: effW, h: effH } = getEffectiveFootprint(item, entry)
    const bgRows = entry.backgroundTiles || 0
    const cutouts = cutoutSet(entry)
    for (let dr = 0; dr < effH; dr++) {
      if (dr < bgRows) continue
      for (let dc = 0; dc < effW; dc++) {
        if (cutouts?.has(`${dc},${dr}`)) continue
        tiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }
  return tiles
}

/** Map chair orientation (catalog) to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front': return Direction.DOWN
    case 'back': return Direction.UP
    case 'left': return Direction.LEFT
    case 'right': return Direction.RIGHT
    default: return Direction.DOWN
  }
}

/** Map numeric chair rotation (degrees) to character facing direction */
function rotationToFacing(rotation: number): Direction {
  switch (rotation) {
    case 90: return Direction.RIGHT
    case 180: return Direction.UP
    case 270: return Direction.LEFT
    case 0:
    default: return Direction.DOWN
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>()

  // Build set of all desk tiles (exclude cutouts so chair in U-table gap is adjacent, not on desk). Use effective footprint for rotation.
  const deskTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    const { w: effW, h: effH } = getEffectiveFootprint(item, entry)
    const cutouts = entry.cutoutTiles
      ? new Set(entry.cutoutTiles.map(({ dc, dr }) => `${dc},${dr}`))
      : null
    for (let dr = 0; dr < effH; dr++) {
      for (let dc = 0; dc < effW; dc++) {
        if (cutouts?.has(`${dc},${dr}`)) continue
        deskTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP },    // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN },   // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT },   // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT },   // desk is right of chair → face RIGHT
  ]

  // For each chair, every footprint tile becomes a seat. Use effective footprint for rotated chairs.
  // Multi-tile chairs (e.g. 2-tile couches) produce multiple seats.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || entry.category !== 'chairs') continue

    const { w: effW, h: effH } = getEffectiveFootprint(item, entry)
    let seatCount = 0
    for (let dr = 0; dr < effH; dr++) {
      for (let dc = 0; dc < effW; dc++) {
        const tileCol = item.col + dc
        const tileRow = item.row + dr

        // Determine facing direction:
        // 1) Catalog orientation (rotation-group chairs)
        // 2) Placed furniture numeric rotation (user-rotated chairs)
        // 3) Adjacent desk direction
        // 4) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN
        if (entry.orientation) {
          facingDir = orientationToFacing(entry.orientation)
        } else if (item.rotation !== undefined && item.rotation !== null) {
          facingDir = rotationToFacing(item.rotation)
        } else {
          for (const d of dirs) {
            if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
              facingDir = d.facing
              break
            }
          }
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          assigned: false,
        })
        seatCount++
      }
    }
  }

  return seats
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles) */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    tiles.add(`${seat.seatCol},${seat.seatRow}`)
  }
  return tiles
}

/** Default floor colors for the two rooms */
const DEFAULT_LEFT_ROOM_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 }  // warm beige
const DEFAULT_RIGHT_ROOM_COLOR: FloorColor = { h: 25, s: 45, b: 5, c: 10 }  // warm brown
const DEFAULT_CARPET_COLOR: FloorColor = { h: 280, s: 40, b: -5, c: 0 }     // purple
const DEFAULT_DOORWAY_COLOR: FloorColor = { h: 35, s: 25, b: 10, c: 0 }     // tan

/** Create the default office layout matching the current hardcoded office */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F2 = TileType.FLOOR_2
  const F3 = TileType.FLOOR_3
  const F4 = TileType.FLOOR_4

  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  for (let r = 0; r < DEFAULT_ROWS; r++) {
    for (let c = 0; c < DEFAULT_COLS; c++) {
      if (r === 0 || r === DEFAULT_ROWS - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 0 || c === DEFAULT_COLS - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 10) {
        if (r >= 4 && r <= 6) {
          tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR)
        } else {
          tiles.push(W); tileColors.push(null)
        }
        continue
      }
      if (c >= 15 && c <= 18 && r >= 7 && r <= 9) {
        tiles.push(F3); tileColors.push(DEFAULT_CARPET_COLOR); continue
      }
      if (c < 10) {
        tiles.push(F1); tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
      } else {
        tiles.push(F2); tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
      }
    }
  }

  const furniture: PlacedFurniture[] = [
    { uid: 'desk-left', type: FurnitureType.DESK, col: 4, row: 3 },
    { uid: 'desk-right', type: FurnitureType.DESK, col: 13, row: 3 },
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
    { uid: 'plant-left', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 17, row: 7 },
    { uid: 'plant-right', type: FurnitureType.PLANT, col: 18, row: 1 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 15, row: 0 },
    // Left desk chairs
    { uid: 'chair-l-top', type: FurnitureType.CHAIR, col: 4, row: 2 },
    { uid: 'chair-l-bottom', type: FurnitureType.CHAIR, col: 5, row: 5 },
    { uid: 'chair-l-left', type: FurnitureType.CHAIR, col: 3, row: 4 },
    { uid: 'chair-l-right', type: FurnitureType.CHAIR, col: 6, row: 3 },
    // Right desk chairs
    { uid: 'chair-r-top', type: FurnitureType.CHAIR, col: 13, row: 2 },
    { uid: 'chair-r-bottom', type: FurnitureType.CHAIR, col: 14, row: 5 },
    { uid: 'chair-r-left', type: FurnitureType.CHAIR, col: 12, row: 4 },
    { uid: 'chair-r-right', type: FurnitureType.CHAIR, col: 15, row: 3 },
  ]

  return { version: 1, cols: DEFAULT_COLS, rows: DEFAULT_ROWS, tiles, tileColors, furniture }
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout)
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json)
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout)
    }
  } catch { /* ignore parse errors */ }
  return null
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout)
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. If tileColors is already present, no migration needed.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  if (layout.tileColors && layout.tileColors.length === layout.tiles.length) {
    return ensureFloorVariety(layout)
  }

  // Check if any tiles use old values (1-4) — these map directly to FLOOR_1-4
  // but need color assignments
  const tileColors: Array<FloorColor | null> = []
  for (const tile of layout.tiles) {
    switch (tile) {
      case 0: // WALL
        tileColors.push(null)
        break
      case 1: // was TILE_FLOOR → FLOOR_1 beige
        tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
        break
      case 2: // was WOOD_FLOOR → FLOOR_2 brown
        tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
        break
      case 3: // was CARPET → FLOOR_3 purple
        tileColors.push(DEFAULT_CARPET_COLOR)
        break
      case 4: // was DOORWAY → FLOOR_4 tan
        tileColors.push(DEFAULT_DOORWAY_COLOR)
        break
      case 13: // VOID (transparent)
        tileColors.push(null)
        break
      default:
        // Floor patterns (5-12) — use neutral gray
        tileColors.push(tile > 0 && tile < 13 ? { h: 0, s: 0, b: 0, c: 0 } : null)
    }
  }

  return ensureFloorVariety({ ...layout, tileColors })
}

/**
 * If the layout has only FLOOR_1 (solid) for every floor tile, replace with a variety pattern
 * (1,2,3,4) so checker, stripes, dots etc. are visible. Fixes "all solid floor" for old saves.
 */
function ensureFloorVariety(layout: OfficeLayout): OfficeLayout {
  const { tiles, tileColors, cols } = layout
  const colors = tileColors ?? []
  let allSolid = true
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    if (t > 0 && t !== 13 && t !== 1) {
      allSolid = false
      break
    }
  }
  if (!allSolid) return layout

  const newTiles = [...tiles]
  const newColors = colors.length === tiles.length ? [...colors] : tiles.map(() => null as FloorColor | null)
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const t = tiles[i]
      if (t > 0 && t !== 13) {
        const pattern = ((r + c) % 4) + 1
        newTiles[i] = pattern as TileTypeVal
        if (pattern === 1) newColors[i] = DEFAULT_LEFT_ROOM_COLOR
        else if (pattern === 2) newColors[i] = DEFAULT_RIGHT_ROOM_COLOR
        else if (pattern === 3) newColors[i] = DEFAULT_CARPET_COLOR
        else newColors[i] = DEFAULT_DOORWAY_COLOR
      }
    }
  }
  return { ...layout, tiles: newTiles, tileColors: newColors }
}
