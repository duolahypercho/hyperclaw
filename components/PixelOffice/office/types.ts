export {
  TILE_SIZE,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MAX_COLS,
  MAX_ROWS,
  MATRIX_EFFECT_DURATION_SEC as MATRIX_EFFECT_DURATION,
} from '../constants'

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  FLOOR_8: 8,
  FLOOR_9: 9,
  FLOOR_10: 10,
  FLOOR_11: 11,
  FLOOR_12: 12,
  VOID: 13,
} as const
export type TileType = (typeof TileType)[keyof typeof TileType]

/** Per-tile color settings for floor pattern colorization */
export interface FloorColor {
  /** Hue: 0-360 in colorize mode, -180 to +180 in adjust mode */
  h: number
  /** Saturation: 0-100 in colorize mode, -100 to +100 in adjust mode */
  s: number
  /** Brightness -100 to 100 */
  b: number
  /** Contrast -100 to 100 */
  c: number
  /** When true, use Photoshop-style Colorize (grayscale → fixed HSL). Default: adjust mode. */
  colorize?: boolean
}

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
} as const
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState]

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const
export type Direction = (typeof Direction)[keyof typeof Direction]

/** 2D array of hex color strings (or '' for transparent). [row][col] */
export type SpriteData = string[][]

export interface Seat {
  /** Chair furniture uid */
  uid: string
  /** Tile col where agent sits */
  seatCol: number
  /** Tile row where agent sits */
  seatRow: number
  /** Direction character faces when sitting (toward adjacent desk) */
  facingDir: Direction
  assigned: boolean
}

export interface FurnitureInstance {
  sprite: SpriteData
  /** Pixel x (top-left) */
  x: number
  /** Pixel y (top-left) */
  y: number
  /** Y value used for depth sorting (typically bottom edge) */
  zY: number
  /** Rotation in degrees (0, 90, 180, 270) for drawing. */
  rotationDeg?: number
}

export interface SubagentCharacter {
  id: number
  parentAgentId: number
  parentToolId: string
  label: string
}

export interface ToolActivity {
  toolId: string
  status: string
  done: boolean
  permissionWait?: boolean
}

export const FurnitureType = {
  // Desks
  DESK: 'desk',
  STANDING_DESK: 'standing_desk',
  L_DESK: 'l_desk',
  DESK_SLEEK: 'desk_sleek',
  DESK_GLASS: 'desk_glass',
  DESK_CURVED: 'desk_curved',
  // U-shape table (chair inside U), L-shape table (chair in L gap), 3x2 tables
  U_TABLE: 'u_table',
  U_TABLE_SLEEK: 'u_table_sleek',
  L_TABLE: 'l_table',
  L_TABLE_SLEEK: 'l_table_sleek',
  TABLE_3X2: 'table_3x2',
  TABLE_3X2_SLEEK: 'table_3x2_sleek',
  // Single (1x1) desks
  DESK_SINGLE: 'desk_single',
  DESK_SINGLE_SLEEK: 'desk_single_sleek',
  DESK_SINGLE_GLASS: 'desk_single_glass',
  // Chairs
  CHAIR: 'chair',
  ARMCHAIR: 'armchair',
  STOOL: 'stool',
  CHAIR_MODERN: 'chair_modern',
  LOUNGE_CHAIR: 'lounge_chair',
  SOFA: 'sofa',
  // Chairs for single desks
  CHAIR_SINGLE: 'chair_single',
  CHAIR_SLEEK: 'chair_sleek',
  CHAIR_GLASS: 'chair_glass',
  // Storage
  BOOKSHELF: 'bookshelf',
  FILING_CABINET: 'filing_cabinet',
  CABINET: 'cabinet',
  SHELF: 'shelf',
  // Tech / electronics
  PC: 'pc',
  LAMP: 'lamp',
  MONITOR: 'monitor',
  MONITOR_APPS: 'monitor_apps',
  MONITOR_LOBSTER: 'monitor_lobster',
  KEYBOARD: 'keyboard',
  MOUSE: 'mouse',
  COFFEE_CUP: 'coffee_cup',
  LAPTOP: 'laptop',
  MACBOOK_PRO: 'macbook_pro',
  MAC_MINI: 'mac_mini',
  PHONE: 'phone',
  HEADSET: 'headset',
  PRINTER: 'printer',
  TABLET: 'tablet',
  // Decor
  PLANT: 'plant',
  COOLER: 'cooler',
  WHITEBOARD: 'whiteboard',
  CLOCK: 'clock',
  PICTURE_FRAME: 'picture_frame',
  BULLETIN_BOARD: 'bulletin_board',
  RUG: 'rug',
  // Wall
  CLOCK_WALL: 'clock_wall',
  POSTER: 'poster',
  SHELF_WALL: 'shelf_wall',
  // Misc
  TRASH_BIN: 'trash_bin',
  COAT_STAND: 'coat_stand',
} as const
export type FurnitureType = (typeof FurnitureType)[keyof typeof FurnitureType]

export const EditTool = {
  TILE_PAINT: 'tile_paint',
  WALL_PAINT: 'wall_paint',
  FURNITURE_PLACE: 'furniture_place',
  FURNITURE_PICK: 'furniture_pick',
  SELECT: 'select',
  EYEDROPPER: 'eyedropper',
  ERASE: 'erase',
} as const
export type EditTool = (typeof EditTool)[keyof typeof EditTool]

export interface FurnitureCatalogEntry {
  type: string // FurnitureType enum or asset ID
  label: string
  footprintW: number
  footprintH: number
  sprite: SpriteData
  isDesk: boolean
  category?: string
  /** Orientation from rotation group: 'front' | 'back' | 'left' | 'right' */
  orientation?: string
  /** Whether this item can be placed on top of desk/table surfaces */
  canPlaceOnSurfaces?: boolean
  /** Number of tile rows from the top of the footprint that are "background" (allow placement, still block walking). Default 0. */
  backgroundTiles?: number
  /** Whether this item can be placed on wall tiles */
  canPlaceOnWalls?: boolean
  /** Tiles (dc, dr) relative to top-left that are NOT blocked — e.g. U-table gap for chair. */
  cutoutTiles?: Array<{ dc: number; dr: number }>
}

export interface PlacedFurniture {
  uid: string
  type: string // FurnitureType enum or asset ID
  col: number
  row: number
  /** Optional color override for furniture */
  color?: FloorColor
  /** Rotation in degrees (0, 90, 180, 270). Used when type has no rotation-group variant. */
  rotation?: number
}

export interface OfficeLayout {
  version: 1
  cols: number
  rows: number
  tiles: TileType[]
  furniture: PlacedFurniture[]
  /** Per-tile color settings, parallel to tiles array. null = wall/no color */
  tileColors?: Array<FloorColor | null>
}

export interface Character {
  id: number
  state: CharacterState
  dir: Direction
  /** Pixel position */
  x: number
  y: number
  /** Current tile column */
  tileCol: number
  /** Current tile row */
  tileRow: number
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null
  /** Palette index (0-5) */
  palette: number
  /** Hue shift in degrees (0 = no shift, ≥45 for repeated palettes) */
  hueShift: number
  /** Animation frame index */
  frame: number
  /** Time accumulator for animation */
  frameTimer: number
  /** Timer for idle wander decisions */
  wanderTimer: number
  /** Number of wander moves completed in current roaming cycle */
  wanderCount: number
  /** Max wander moves before returning to seat for rest */
  wanderLimit: number
  /** Whether the agent is actively working */
  isActive: boolean
  /** Assigned seat uid, or null if no seat */
  seatId: string | null
  /** Active speech bubble type, or null if none showing */
  bubbleType: 'permission' | 'waiting' | null
  /** Countdown timer for bubble (waiting: 2→0, permission: unused) */
  bubbleTimer: number
  /** Timer to stay seated while inactive after seat reassignment (counts down to 0) */
  seatTimer: number
  /** Whether this character represents a sub-agent (spawned by Task tool) */
  isSubagent: boolean
  /** Parent agent ID if this is a sub-agent, null otherwise */
  parentAgentId: number | null
  /** Active matrix spawn/despawn effect, or null */
  matrixEffect: 'spawn' | 'despawn' | null
  /** Timer counting up from 0 to MATRIX_EFFECT_DURATION */
  matrixEffectTimer: number
  /** Per-column random seeds (16 values) for staggered rain timing */
  matrixEffectSeeds: number[]
}
