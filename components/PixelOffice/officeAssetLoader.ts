/**
 * Load PNG assets in the browser and convert to SpriteData (2D hex arrays).
 * Used for walls, floors, and character sprites in Hyperclaw (no extension).
 */

import { FLOOR_MV_FIRST_ROW_ONLY, FLOOR_MV_MAX_TILES, FLOOR_MV_TILE_SIZE, FLOOR_MV_PATTERN_PER_TILE } from './constants'

const ALPHA_THRESHOLD = 128

export type SpriteData = string[][]

function imageToSpriteData(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  w: number,
  h: number
): SpriteData {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  const rows: string[][] = []
  for (let r = 0; r < h; r++) {
    const row: string[] = []
    for (let c = 0; c < w; c++) {
      const i = (r * w + c) * 4
      const a = data[i + 3]
      if (a < ALPHA_THRESHOLD) {
        row.push('')
      } else {
        const hex = `#${data[i].toString(16).padStart(2, '0')}${data[i + 1].toString(16).padStart(2, '0')}${data[i + 2].toString(16).padStart(2, '0')}`.toUpperCase()
        row.push(hex)
      }
    }
    rows.push(row)
  }
  return rows
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${url}`))
    img.src = url
  })
}

/** Load legacy floors.png (112×16), return 7 floor sprites of 16×16 each. */
export async function loadFloorSprites(basePath: string): Promise<SpriteData[]> {
  const img = await loadImage(`${basePath}/floors.png`)
  const sprites: SpriteData[] = []
  const tileW = 16
  const tileH = 16
  const count = Math.floor(img.width / tileW)
  for (let i = 0; i < count; i++) {
    sprites.push(imageToSpriteData(img, i * tileW, 0, tileW, tileH))
  }
  return sprites
}

/** Load walls.png (64×128), return 16 sprites of 16×32 each (4×4 grid). */
export async function loadWallSprites(basePath: string): Promise<SpriteData[]> {
  const img = await loadImage(`${basePath}/walls.png`)
  const sprites: SpriteData[] = []
  for (let mask = 0; mask < 16; mask++) {
    const col = mask % 4
    const row = Math.floor(mask / 4)
    const sx = col * 16
    const sy = row * 32
    sprites.push(imageToSpriteData(img, sx, sy, 16, 32))
  }
  return sprites
}

/** Character sheet: 112×96, 7 frames × 16px, 3 rows × 32px. Row 0=down, 1=up, 2=right. */
export interface CharacterSheetData {
  down: SpriteData[]
  up: SpriteData[]
  right: SpriteData[]
}

export async function loadCharacterSheets(basePath: string): Promise<CharacterSheetData[]> {
  const out: CharacterSheetData[] = []
  for (let i = 0; i < 6; i++) {
    const img = await loadImage(`${basePath}/characters/char_${i}.png`)
    const down: SpriteData[] = []
    const up: SpriteData[] = []
    const right: SpriteData[] = []
    for (let f = 0; f < 7; f++) {
      down.push(imageToSpriteData(img, f * 16, 0, 16, 32))
      up.push(imageToSpriteData(img, f * 16, 32, 16, 32))
      right.push(imageToSpriteData(img, f * 16, 64, 16, 32))
    }
    out.push({ down, up, right })
  }
  return out
}

// ── Modern Office Furniture Loader ─────────────────────────────────────

/** Catalog entry for a furniture asset */
export interface FurnitureAsset {
  id: string
  label: string
  category: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  groupId?: string
  orientation?: string
  state?: string
  canPlaceOnSurfaces?: boolean
  canOverlapDesks?: boolean
  backgroundTiles?: number
  canPlaceOnWalls?: boolean
  hasChairBack?: boolean
  /** If true, does not block placement (e.g. glass enclosures). */
  doesNotBlockPlacement?: boolean
}

/** Asset data for dynamic catalog building */
export interface ModernOfficeAssetData {
  catalog: FurnitureAsset[]
  sprites: Record<string, SpriteData>
}

/** Single listing from catalog.json (root is an array of these). imagePath is relative to modern-office folder. */
export interface CatalogJsonEntry {
  id: string
  title: string
  imagePath: string
  width: number
  height: number
  startX: number
  startY: number
  category: string
  /** Optional grid footprint width in tiles; default derived from width/16 */
  footprintW?: number
  /** Optional grid footprint height in tiles; default derived from height/16 */
  footprintH?: number
  /** Optional; if true, can be placed on desk/table tiles (overlap). Default true for category "chairs". */
  canOverlapDesks?: boolean
  /** Optional; number of tile rows from top that are "background" (can overlap wall/void; only base row must be floor). E.g. 2 for a 3-tile-tall tree. */
  backgroundTiles?: number
  /** Optional; if true, can be placed on wall tiles (e.g. awards, picture frames). Default true for category "awards". */
  canPlaceOnWalls?: boolean
  /** Optional; if true, chair has a visible back that should render on top of the character when seated. */
  hasChairBack?: boolean
  /** Optional; if true, this item does not block placement (e.g. glass frames/enclosures); tables etc. can be placed on the same tiles. */
  doesNotBlockPlacement?: boolean
}

function getCategoryForIndex(index: number): string {
  const storage = [96, 97]
  const decor = [98, 99, 100, 113, 114, 115, 116]
  const electronics = [177,178, 308, 309, 310, 311, 312, 313, 314, 323, 324, 325, 326, 327, 328]
  for (let i = 117; i <= 140; i++) {
    electronics.push(i)
  }
  for (let i = 147; i <= 152; i++) {
    electronics.push(i)
  }
  for (let i = 225; i <= 244; i++) {
    electronics.push(i)
  }
  for (let i = 272; i <= 278; i++) {
    electronics.push(i)
  }
  const desks = []
  for (let i = 179; i <= 195; i++) {
    desks.push(i)
  }
  for (let i = 245; i <= 269; i++) {
    desks.push(i)
  }
  for (let i = 210; i <= 224; i++) {
    desks.push(i)
  }
  for (let i = 281; i <= 305; i++) {
    desks.push(i)
  }
  const chairs: number[] = [167, 270, 271, 306, 307]
  for (let i = 101; i <= 112; i++) {
    chairs.push(i)
  }
  for (let i = 196; i <= 206; i++) {
    chairs.push(i)
  }
  const misc = [141, 142, 153, 154, 155, 156, 157, 168, 169, 170, 207, 208, 209, 279, 280]
  for (let i = 168; i<= 176; i++) {
    misc.push(i)
  }
  for (let i = 158; i <= 164; i++) {
    misc.push(i)
  }
  for (let i = 315; i <= 322; i++) {
    misc.push(i)
  }
  for (let i = 329; i <= 339; i++) {
    misc.push(i)
  }
  if (storage.includes(index)) return 'storage'
  if (decor.includes(index)) return 'decor'
  if (electronics.includes(index)) return 'electronics'
  if (desks.includes(index)) return 'desks'
  if (chairs.includes(index)) return 'chairs'
  if (misc.includes(index)) return 'misc'
  return 'misc'
}

function getAttributeForIndex(index: number): { width: number; height: number; startX: number; startY: number } {
  const desksSize = [96,97,179,180,181]
  const locker = [96,97]
  if (desksSize.includes(index)) {
    return {
      width: 1,
      height: 2,
      startX: 0,
      startY: 16,
    }
  }
  if (locker.includes(index)) {
    return {
      width: 1,
      height: 2,
      startX: 0,
      startY: 16,
    }
  }
  return {
    width: 2,
    height: 2,
    startX: 0,
    startY: 0,
  }
}

/**
 * Load from catalog.json (root array of listings with id, imagePath, width, height, startX, startY, category).
 */
async function loadFromCatalogList(
  listings: CatalogJsonEntry[],
  modernOfficePath: string,
): Promise<ModernOfficeAssetData | null> {
  if (!Array.isArray(listings) || listings.length === 0) return null
  const catalog: FurnitureAsset[] = []
  const sprites: Record<string, SpriteData> = {}

  for (const entry of listings) {
    const { id: entryId, title, imagePath, width, height, startX, startY, category, footprintW: fpW, footprintH: fpH } = entry
    const id = `modern_office_${entryId}`
    const imageUrl = `${modernOfficePath}/${imagePath}`

    try {
      const img = await loadImage(imageUrl)
      const sprite = imageToSpriteData(img, startX, startY, width, height)
      if (sprite.length === 0) continue

      sprites[id] = sprite
      const footprintW = fpW ?? Math.round(width / 16)
      const footprintH = fpH ?? Math.round(height / 16)
      const isDesk = category === 'desks'
      const canPlaceOnSurfaces =
        !isDesk && (category === 'electronics' || (category === 'decor' && footprintW === 1 && footprintH === 1))
      const canOverlapDesks = entry.canOverlapDesks ?? category === 'chairs'
      // Tall items (3+ rows): allow top rows to overlap wall so they can be placed in corners; only base row must be floor
      const backgroundTiles =
        entry.backgroundTiles ?? (footprintH >= 3 ? footprintH - 1 : 0)
      const canPlaceOnWalls = entry.canPlaceOnWalls ?? category === 'awards'

      catalog.push({
        id,
        label: title,
        category,
        width,
        height,
        footprintW,
        footprintH,
        isDesk,
        ...(canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
        ...(canOverlapDesks ? { canOverlapDesks: true } : {}),
        ...(backgroundTiles > 0 ? { backgroundTiles } : {}),
        ...(canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
        ...(entry.hasChairBack ? { hasChairBack: true } : {}),
        ...(entry.doesNotBlockPlacement ? { doesNotBlockPlacement: true } : {}),
      })
    } catch (err) {
      console.warn(`Failed to load sprite from catalog entry ${entryId} (${imagePath}):`, err)
    }
  }

  if (catalog.length === 0) return null
  return { catalog, sprites }
}

/** In-memory cache by basePath to avoid re-fetching on remount / Fast Refresh. */
const modernOfficeFurnitureCache: Record<string, Promise<ModernOfficeAssetData>> = {}

/**
 * Load all Modern Office PNG sprites and return as asset data.
 * Tries catalog.json (root array of listings); if missing or empty, falls back to index-based loading (96–339).
 * Result is cached by basePath so repeated calls (e.g. after remount) return the same data without re-fetching.
 */
export async function loadModernOfficeFurniture(basePath: string): Promise<ModernOfficeAssetData> {
  const cached = modernOfficeFurnitureCache[basePath]
  if (cached) return cached

  const promise = (async (): Promise<ModernOfficeAssetData> => {
    const modernOfficePath = `${basePath}/modern-office`
    const catalogUrl = `${modernOfficePath}/catalog.json`

    let listings: CatalogJsonEntry[] | null = null
    try {
      const res = await fetch(catalogUrl)
      if (res.ok) {
        const json = await res.json()
        if (Array.isArray(json)) listings = json as CatalogJsonEntry[]
      }
    } catch {
      // ignore
    }

    if (listings?.length) {
      const fromCatalog = await loadFromCatalogList(listings, modernOfficePath)
      if (fromCatalog) return fromCatalog
    }

    // Fallback: code-based index loading (no catalog.json or load failed)
    const catalog: FurnitureAsset[] = []
    const sprites: Record<string, SpriteData> = {}
    const maxSprites = 339

    for (let i = 96; i <= maxSprites; i++) {
      const id = `modern_office_${i}`
      const url = `${modernOfficePath}/Modern_Office_Singles_${i}.png`

      try {
        const exists = await fetch(url, { method: 'HEAD' }).then(r => r.ok).catch(() => false)
        if (!exists) continue

        const img = await loadImage(url)
        const { width, height, startX, startY } = getAttributeForIndex(i)
        const sprite = imageToSpriteData(img, startX, startY, width * 16, height * 16)
        if (sprite.length > 0) {
          sprites[id] = sprite
          const category = getCategoryForIndex(i)
          const isDesk = category === 'desks'
          const canPlaceOnSurfaces =
            !isDesk && (category === 'electronics' || (category === 'decor' && width === 1 && height === 1))

          catalog.push({
            id,
            label: `Modern Office ${i}`,
            category,
            width: width * 16,
            height: height * 16,
            footprintW: width,
            footprintH: height,
            isDesk,
            ...(canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
          })
        }
      } catch (err) {
        console.warn(`Failed to load modern office sprite ${i}:`, err)
      }
    }

    return { catalog, sprites }
  })()

  modernOfficeFurnitureCache[basePath] = promise
  return promise
}

// ── RPG Maker MV Tileset Loaders ─────────────────────────────────────

/**
 * Tile size for MV floors. When using first row + fixed tile count, we split the
 * first row into that many tiles so any image (45×45, 48×48, etc.) fits and we
 * capture the full pattern. Otherwise use constant or infer 16/32/45/48.
 */
function getMVFloorTileSize(img: HTMLImageElement, numTilesInFirstRow: number): number {
  if (FLOOR_MV_TILE_SIZE > 0) return FLOOR_MV_TILE_SIZE
  // "Whatever fits our stuff": first row ÷ N tiles so we capture full pattern
  if (FLOOR_MV_FIRST_ROW_ONLY && numTilesInFirstRow > 0) {
    const size = Math.floor(img.width / numTilesInFirstRow)
    if (size > 0) return size
  }
  const h = img.height
  const w = img.width
  if (h <= 16) return 16
  if (h === 45 || (h >= 45 && h % 45 === 0 && w % 45 === 0)) return 45
  if (h === 48 || (h >= 48 && h % 48 === 0 && w % 48 === 0)) return 48
  return 32
}

/**
 * Load RPG Maker MV floor tileset (Modern_Office_MV_Floors_TILESET_A2.png).
 * Tile size fits the app (first row ÷ N tiles). If the image has 4 blocks per
 * tile (2×2), we extract 1 block per tile so each grid cell shows one pattern.
 */
export async function loadMVFloorSprites(basePath: string): Promise<SpriteData[]> {
  try {
    const img = await loadImage(`${basePath}/Modern_Office_MV_Floors_TILESET_A2.png`)
    const numTilesInFirstRow = FLOOR_MV_MAX_TILES > 0 ? FLOOR_MV_MAX_TILES : Math.max(1, Math.floor(img.width / (img.height <= 16 ? 16 : 32)))
    const tileSize = getMVFloorTileSize(img, numTilesInFirstRow)
    const cols = Math.floor(img.width / tileSize)
    const rows = Math.floor(img.height / tileSize)
    const patternDiv = Math.max(1, FLOOR_MV_PATTERN_PER_TILE)
    const extractSize = Math.floor(tileSize / patternDiv)

    const sprites: SpriteData[] = []
    const rowsToLoad = FLOOR_MV_FIRST_ROW_ONLY ? 1 : rows
    for (let row = 0; row < rowsToLoad; row++) {
      for (let col = 0; col < cols; col++) {
        const sx = col * tileSize
        const sy = row * tileSize
        sprites.push(imageToSpriteData(img, sx, sy, extractSize, extractSize))
      }
    }

    const result = FLOOR_MV_MAX_TILES > 0 ? sprites.slice(0, FLOOR_MV_MAX_TILES) : sprites
    return result
  } catch (err) {
    console.warn('Failed to load MV floor sprites:', err)
    return []
  }
}
