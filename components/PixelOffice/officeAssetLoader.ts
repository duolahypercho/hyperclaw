/**
 * Load PNG assets in the browser and convert to SpriteData (2D hex arrays).
 * Used for walls, floors, and character sprites in Hyperclaw (no extension).
 */

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

/** Load floors.png (112×16), return 7 sprites of 16×16 each. */
export async function loadFloorSprites(basePath: string): Promise<SpriteData[]> {
  try {
    const img = await loadImage(`${basePath}/floors.png`)
    const sprites: SpriteData[] = []
    for (let i = 0; i < 7; i++) {
      sprites.push(imageToSpriteData(img, i * 16, 0, 16, 16))
    }
    return sprites
  } catch {
    return []
  }
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
