import type { OfficeLayout, FloorColor, PlacedFurniture, TileType as TileTypeVal } from "./office/types";
import { TileType, FurnitureType } from "./office/types";
import { MAX_ROWS } from "./constants";

const W = TileType.WALL;
const F1 = TileType.FLOOR_1;
const F2 = TileType.FLOOR_2;
const F3 = TileType.FLOOR_3;
const F4 = TileType.FLOOR_4;
const F5 = TileType.FLOOR_5;
const F6 = TileType.FLOOR_6;
const F7 = TileType.FLOOR_7;
const F8 = TileType.FLOOR_8;

/** Warm beige, brown, purple carpet, tan doorway, hallway */
const BEIGE: FloorColor = { h: 35, s: 30, b: 15, c: 0 };
const BROWN: FloorColor = { h: 25, s: 45, b: 5, c: 10 };
const CARPET: FloorColor = { h: 280, s: 40, b: -5, c: 0 };
const DOORWAY: FloorColor = { h: 35, s: 25, b: 10, c: 0 };
const HALLWAY: FloorColor = { h: 30, s: 20, b: 5, c: 5 };
const WALKWAY: FloorColor = { h: 28, s: 22, b: 0, c: 8 };
const TEAL: FloorColor = { h: 180, s: 35, b: 5, c: 5 };
const CREAM: FloorColor = { h: 45, s: 20, b: 25, c: 0 };

const ROOMS_PER_BLOCK = 10;
const COLS_PER_BLOCK = 6 * ROOMS_PER_BLOCK + 1; // 61
const ROWS_PER_BLOCK = 7;
const WALKWAY_ROWS = 2;
const MAX_BLOCKS = Math.min(
  5,
  Math.floor((MAX_ROWS - ROWS_PER_BLOCK) / (ROWS_PER_BLOCK + WALKWAY_ROWS)) + 1
);

/** 2D grid layout: room interior 5×4, 1-tile corridor between rooms. */
const GRID_ROOM_W = 5;
const GRID_ROOM_H = 4;
const GRID_SLOT_COLS = 7; // 5 room + 1 corridor + 1 wall
const GRID_SLOT_ROWS = 6; // 4 room + 1 corridor + 1 wall
const GRID_SLOTS_X = 5;
const GRID_SLOTS_Y = 4;
const GRID_TOTAL_SLOTS = GRID_SLOTS_X * GRID_SLOTS_Y; // 20

type RoomKind = "office" | "rest" | "dining" | "focus";

function getRoomKind(roomIndex: number): RoomKind {
  const kinds: RoomKind[] = ["office", "rest", "dining", "focus"];
  return kinds[(roomIndex * 7 + 3) % 4];
}

function addRoomFurniture(
  furniture: PlacedFurniture[],
  roomIndex: number,
  baseCol: number,
  baseRow: number,
  kind: RoomKind
): void {
  const prefix = `cozy-b${baseRow}-r${roomIndex}`;
  switch (kind) {
    case "office":
      furniture.push(
        { uid: `${prefix}-desk`, type: FurnitureType.DESK, col: baseCol, row: baseRow + 1 },
        { uid: `${prefix}-chair`, type: FurnitureType.CHAIR, col: baseCol + 1, row: baseRow + 3 },
        { uid: `${prefix}-lamp`, type: FurnitureType.LAMP, col: baseCol + 3, row: baseRow + 1 },
        { uid: `${prefix}-plant`, type: FurnitureType.PLANT, col: baseCol + 4, row: baseRow + 2 },
        { uid: `${prefix}-shelf`, type: FurnitureType.BOOKSHELF, col: baseCol, row: baseRow + 3 }
      );
      break;
    case "rest":
      furniture.push(
        { uid: `${prefix}-chair1`, type: FurnitureType.CHAIR, col: baseCol + 1, row: baseRow + 2 },
        { uid: `${prefix}-chair2`, type: FurnitureType.CHAIR, col: baseCol + 3, row: baseRow + 2 },
        { uid: `${prefix}-shelf`, type: FurnitureType.BOOKSHELF, col: baseCol, row: baseRow + 1 },
        { uid: `${prefix}-plant`, type: FurnitureType.PLANT, col: baseCol + 4, row: baseRow + 1 },
        { uid: `${prefix}-lamp`, type: FurnitureType.LAMP, col: baseCol + 2, row: baseRow + 3 }
      );
      break;
    case "dining":
      furniture.push(
        { uid: `${prefix}-desk`, type: FurnitureType.DESK, col: baseCol + 1, row: baseRow + 1 },
        { uid: `${prefix}-chair1`, type: FurnitureType.CHAIR, col: baseCol + 2, row: baseRow + 2 },
        { uid: `${prefix}-chair2`, type: FurnitureType.CHAIR, col: baseCol + 3, row: baseRow + 3 },
        { uid: `${prefix}-plant`, type: FurnitureType.PLANT, col: baseCol + 4, row: baseRow + 2 },
        { uid: `${prefix}-lamp`, type: FurnitureType.LAMP, col: baseCol, row: baseRow + 1 }
      );
      break;
    case "focus":
      furniture.push(
        { uid: `${prefix}-desk`, type: FurnitureType.DESK, col: baseCol, row: baseRow + 1 },
        { uid: `${prefix}-chair`, type: FurnitureType.CHAIR, col: baseCol + 1, row: baseRow + 3 },
        { uid: `${prefix}-pc`, type: FurnitureType.PC, col: baseCol + 2, row: baseRow + 1 },
        { uid: `${prefix}-lamp`, type: FurnitureType.LAMP, col: baseCol + 3, row: baseRow + 1 },
        { uid: `${prefix}-plant`, type: FurnitureType.PLANT, col: baseCol + 4, row: baseRow + 2 }
      );
      break;
  }
}

function fillTiles(
  cols: number,
  rows: number,
  fill: (c: number, r: number) => { tile: TileTypeVal; color: FloorColor | null }
): { tiles: TileTypeVal[]; tileColors: (FloorColor | null)[] } {
  const tiles: TileTypeVal[] = [];
  const tileColors: (FloorColor | null)[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { tile, color } = fill(c, r);
      tiles.push(tile);
      tileColors.push(color);
    }
  }
  return { tiles, tileColors };
}

/** Deterministic shuffle: which room index (0..N-1) is at slot index s. */
function slotToRoomIndex(s: number, N: number): number {
  if (N <= 1) return 0;
  const arr = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i >= 1; i--) {
    const j = (N * 7 + i * 31) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr[s % N];
}

/** Build one grid block: 2D rooms + corridors. Rooms get walkable corridors between them. */
function buildGridBlock(
  N: number,
  rowOffset: number,
  blockId: number,
  tiles: TileTypeVal[],
  tileColors: (FloorColor | null)[],
  furniture: PlacedFurniture[],
  cols: number
): void {
  const totalRows = GRID_SLOTS_Y * GRID_SLOT_ROWS + 1;
  for (let r = 0; r < totalRows; r++) {
    const slotRow = Math.floor(r / GRID_SLOT_ROWS);
    const rowInSlot = r % GRID_SLOT_ROWS;
    const isCorridorRow = rowInSlot === GRID_ROOM_H;
    for (let c = 0; c < cols; c++) {
      const slotCol = Math.floor(c / GRID_SLOT_COLS);
      const colInSlot = c % GRID_SLOT_COLS;
      const isCorridorCol = colInSlot === GRID_ROOM_W;
      if (slotCol >= GRID_SLOTS_X || slotRow >= GRID_SLOTS_Y) {
        tiles.push(W);
        tileColors.push(null);
        continue;
      }
      const slotIndex = slotRow * GRID_SLOTS_X + slotCol;
      const hasRoom = slotIndex < N;
      const inRoomInterior =
        hasRoom &&
        rowInSlot >= 1 &&
        rowInSlot <= GRID_ROOM_H &&
        colInSlot >= 1 &&
        colInSlot <= GRID_ROOM_W;
      const inCorridor = isCorridorRow || isCorridorCol;
      if (slotIndex >= N) {
        tiles.push(F4);
        tileColors.push(HALLWAY);
      } else if (inRoomInterior) {
        tiles.push(F1);
        tileColors.push(BEIGE);
      } else if (inCorridor) {
        tiles.push(F4);
        tileColors.push(HALLWAY);
      } else {
        tiles.push(W);
        tileColors.push(null);
      }
    }
  }
  for (let slot = 0; slot < N; slot++) {
    const sx = slot % GRID_SLOTS_X;
    const sy = Math.floor(slot / GRID_SLOTS_X);
    const baseCol = 1 + sx * GRID_SLOT_COLS;
    const baseRow = rowOffset + 1 + sy * GRID_SLOT_ROWS;
    const roomTypeIndex = slotToRoomIndex(slot, N);
    addRoomFurniture(
      furniture,
      blockId * GRID_TOTAL_SLOTS + slot,
      baseCol,
      baseRow,
      getRoomKind(roomTypeIndex)
    );
  }
  const restPrefix = `cozy-block${blockId}`;
  furniture.push(
    { uid: `${restPrefix}-cooler`, type: FurnitureType.COOLER, col: 6, row: rowOffset + 5 },
    { uid: `${restPrefix}-rest-chair1`, type: FurnitureType.CHAIR, col: 13, row: rowOffset + 5 },
    { uid: `${restPrefix}-rest-chair2`, type: FurnitureType.CHAIR, col: 20, row: rowOffset + 11 },
    { uid: `${restPrefix}-rest-plant1`, type: FurnitureType.PLANT, col: 27, row: rowOffset + 5 },
    { uid: `${restPrefix}-rest-plant2`, type: FurnitureType.PLANT, col: 6, row: rowOffset + 17 }
  );
}

/**
 * Cozy Office: 2D grid of rooms with corridors so agents can walk around.
 * Room types (office, rest, dining, focus) are scattered across the grid.
 * - 1–20 agents: one grid (5×4 slots, 20 rooms max).
 * - 21+ agents: multiple grids with walkways between.
 */
export function createCozyOfficeLayout(agentCount: number): OfficeLayout {
  const N = Math.max(1, Math.min(MAX_BLOCKS * ROOMS_PER_BLOCK, Math.ceil(agentCount)));
  const blocks = N <= GRID_TOTAL_SLOTS ? 1 : Math.ceil(N / GRID_TOTAL_SLOTS);
  const cols = GRID_SLOTS_X * GRID_SLOT_COLS + 1;
  const rowsPerGrid = GRID_SLOTS_Y * GRID_SLOT_ROWS + 1;
  const rows =
    blocks * rowsPerGrid + (blocks > 1 ? (blocks - 1) * WALKWAY_ROWS : 0);

  const tiles: TileTypeVal[] = [];
  const tileColors: (FloorColor | null)[] = [];
  const furniture: PlacedFurniture[] = [];

  for (let block = 0; block < blocks; block++) {
    if (block > 0) {
      for (let w = 0; w < WALKWAY_ROWS; w++) {
        for (let c = 0; c < cols; c++) {
          if (c === 0 || c === cols - 1) {
            tiles.push(W);
            tileColors.push(null);
          } else {
            tiles.push(F4);
            tileColors.push(WALKWAY);
          }
        }
      }
    }
    const rowOffset = block * (rowsPerGrid + (block > 0 ? WALKWAY_ROWS : 0));
    const roomsInBlock =
      block < blocks - 1 ? GRID_TOTAL_SLOTS : N - block * GRID_TOTAL_SLOTS;
    buildGridBlock(
      roomsInBlock,
      rowOffset,
      block,
      tiles,
      tileColors,
      furniture,
      cols
    );
  }

  return { version: 1, cols, rows, tiles, tileColors, furniture };
}

/** Cell size per workstation: 3 cols x 3 rows (chair on top, desk 2x2 below, PC on desk — face user) */
const WORKSTATION_CELL_W = 3;
const WORKSTATION_CELL_H = 3;
const WORKSTATIONS_PER_ROW = 6;
const MAX_WORKSTATIONS = 24;
/** Extra row at bottom for shared utility (cooler, printer, trash, bulletin board) */
const WORKSTATION_UTILITY_ROW = 1;

// ── Cody Office: image-inspired — boss office, open-plan workspace, lounge, kitchenette, conference ──
const CODY_AGENTS = 20;
const CODY_COLS = 42;
const CODY_ROWS = 30;
const BOSS_C0 = 1;
const BOSS_C1 = 10;
const BOSS_R0 = 1;
const BOSS_R1 = 6;
const CORR_COL = 11;
const CORR_ROW_TOP = 7;
const CORR_ROW_BOTTOM = 8;
const OPEN_C0 = 1;
const OPEN_C1 = 18;
const OPEN_R0 = 9;
const OPEN_R1 = 20;
const RIGHT_C0 = 20;
const RIGHT_C1 = 40;
const LOUNGE_R0 = 1;
const LOUNGE_R1 = 10;
const KITCHEN_R0 = 12;
const KITCHEN_R1 = 18;
const CONF_R0 = 20;
const CONF_R1 = 29;
const CORR_COL_RIGHT = 19;

/**
 * Enhanced workstations: one desk per agent with lamp + plant per station,
 * shared utility row (cooler, printer, trash, bulletin board), and floor variety (main area cream, aisle wood, utility carpet).
 */
export function createWorkstationsLayout(maxAgents: number): OfficeLayout {
  const N = Math.max(1, Math.min(MAX_WORKSTATIONS, Math.ceil(maxAgents)));
  const rowsOfStations = Math.ceil(N / WORKSTATIONS_PER_ROW);
  const cols = 1 + WORKSTATIONS_PER_ROW * WORKSTATION_CELL_W + 1;
  const rows =
    1 + rowsOfStations * WORKSTATION_CELL_H + 1 + WORKSTATION_UTILITY_ROW;

  const { tiles, tileColors } = fillTiles(cols, rows, (c, r) => {
    if (r === 0 || r === rows - 1) return { tile: W, color: null };
    if (c === 0 || c === cols - 1) return { tile: W, color: null };
    // Utility row at bottom: carpet (stripes) for clear pattern variety
    if (r === rows - 2) return { tile: F3, color: CARPET };
    // Center aisle (cols 9–11): checker pattern so floor variety is obvious
    if (c >= 9 && c <= 11) return { tile: F2, color: BROWN };
    return { tile: F1, color: CREAM };
  });

  const furniture: PlacedFurniture[] = [];

  for (let i = 0; i < N; i++) {
    const sx = i % WORKSTATIONS_PER_ROW;
    const sy = Math.floor(i / WORKSTATIONS_PER_ROW);
    const cx = 1 + sx * WORKSTATION_CELL_W;
    const cy = 1 + sy * WORKSTATION_CELL_H;
    const prefix = `ws-${i}`;
    const monitorType = i === 0 ? FurnitureType.MONITOR_APPS : i === 1 ? FurnitureType.MONITOR_LOBSTER : FurnitureType.MONITOR;
    furniture.push(
      { uid: `${prefix}-chair`, type: FurnitureType.CHAIR, col: cx, row: cy },
      { uid: `${prefix}-desk`, type: FurnitureType.DESK, col: cx, row: cy + 1 },
      { uid: `${prefix}-pc`, type: FurnitureType.PC, col: cx + 1, row: cy + 1 },
      { uid: `${prefix}-monitor`, type: monitorType, col: cx, row: cy + 1 },
      { uid: `${prefix}-keyboard`, type: FurnitureType.KEYBOARD, col: cx, row: cy + 2 },
      { uid: `${prefix}-mouse`, type: FurnitureType.MOUSE, col: cx + 1, row: cy + 2 },
      { uid: `${prefix}-coffee`, type: FurnitureType.COFFEE_CUP, col: cx + 1, row: cy + 1 },
      { uid: `${prefix}-lamp`, type: FurnitureType.LAMP, col: cx + 2, row: cy + 1 },
      { uid: `${prefix}-plant`, type: FurnitureType.PLANT, col: cx + 2, row: cy + 2 }
    );
  }

  // Shared utility row (above bottom wall): cooler, printer, trash bins, filing cabinet (1x2), bulletin board (2x1), MacBook Pro, Mac mini
  const utilRow = rows - 2;
  furniture.push(
    { uid: "ws-shared-cooler", type: FurnitureType.COOLER, col: 2, row: utilRow },
    { uid: "ws-shared-printer", type: FurnitureType.PRINTER, col: 5, row: utilRow },
    { uid: "ws-shared-trash-1", type: FurnitureType.TRASH_BIN, col: 8, row: utilRow },
    { uid: "ws-shared-trash-2", type: FurnitureType.TRASH_BIN, col: 11, row: utilRow },
    { uid: "ws-shared-filing", type: FurnitureType.FILING_CABINET, col: 14, row: utilRow - 1 },
    { uid: "ws-shared-bulletin", type: FurnitureType.BULLETIN_BOARD, col: 17, row: utilRow },
    { uid: "ws-shared-macbook", type: FurnitureType.MACBOOK_PRO, col: 15, row: utilRow },
    { uid: "ws-shared-macmini", type: FurnitureType.MAC_MINI, col: 16, row: utilRow }
  );

  return { version: 1, cols, rows, tiles, tileColors, furniture };
}

/** Open-plan desk positions: 6 desks row 1, 5 desks row 2 (11 total). */
const OPEN_DESK_POSITIONS: [number, number][] = [
  [2, 10], [5, 10], [8, 10], [11, 10], [14, 10], [17, 10],
  [3, 15], [6, 15], [9, 15], [12, 15], [15, 15],
];

/** Lounge armchair positions (2). */
const LOUNGE_CHAIR_POSITIONS: [number, number][] = [[22, 4], [28, 4]];

/** Conference table chair positions (6 around table): 3 top, 3 bottom. */
const CONF_CHAIR_POSITIONS: [number, number][] = [
  [28, 22], [30, 22], [32, 22],
  [28, 25], [30, 25], [32, 25],
];

/**
 * Seat (col, row) for agent i.
 * 0 = boss, 1–11 = open plan desks, 12–13 = lounge armchairs, 14–19 = conference chairs.
 */
function codySeatPosition(i: number): [number, number] {
  if (i === 0) return [BOSS_C0 + Math.floor((BOSS_C1 - BOSS_C0 - 2) / 2), BOSS_R0 + Math.floor((BOSS_R1 - BOSS_R0 - 2) / 2)];
  if (i >= 1 && i <= 11) return OPEN_DESK_POSITIONS[i - 1];
  if (i >= 12 && i <= 13) return LOUNGE_CHAIR_POSITIONS[i - 12];
  if (i >= 14 && i <= 19) return CONF_CHAIR_POSITIONS[i - 14];
  return OPEN_DESK_POSITIONS[0];
}

/**
 * Cody Office — image-inspired: boss office, open-plan workspace (monitor/keyboard/mouse, printer),
 * lounge (fireplace vibe: bookshelf, clock, armchairs, coffee table, plants, lamps), kitchenette
 * (coolers, shelves, vending), conference room (large table, rug, 6 chairs). Walls and doorways throughout.
 */
export function createCodyOfficeLayout(): OfficeLayout {
  const N = CODY_AGENTS;
  const cols = CODY_COLS;
  const rows = CODY_ROWS;

  const { tiles, tileColors } = fillTiles(cols, rows, (c, r) => {
    if (r === 0 || r === rows - 1) return { tile: W, color: null };
    if (c === 0 || c === cols - 1) return { tile: W, color: null };
    if (c === CORR_COL && r >= CORR_ROW_TOP) return { tile: F4, color: HALLWAY };
    if (c === CORR_COL_RIGHT) return { tile: F4, color: HALLWAY };
    if (r >= CORR_ROW_TOP && r <= CORR_ROW_BOTTOM) {
      if (c >= BOSS_C0 && c <= BOSS_C1) return c >= 5 && c <= 6 ? { tile: F4, color: DOORWAY } : { tile: W, color: null };
      if (c >= CORR_COL && c <= OPEN_C1) return { tile: F4, color: HALLWAY };
      if (c >= RIGHT_C0) return { tile: F4, color: HALLWAY };
    }
    if (r === OPEN_R1 + 1 && c >= OPEN_C0 && c <= OPEN_C1) return c >= 9 && c <= 10 ? { tile: F4, color: DOORWAY } : { tile: W, color: null };
    if (r === KITCHEN_R0 - 1 && c >= RIGHT_C0 && c <= RIGHT_C1) return c >= 25 && c <= 26 ? { tile: F4, color: DOORWAY } : { tile: W, color: null };
    if (r === CONF_R0 - 1 && c >= RIGHT_C0 && c <= RIGHT_C1) return c >= 29 && c <= 30 ? { tile: F4, color: DOORWAY } : { tile: W, color: null };
    if (c >= BOSS_C0 && c <= BOSS_C1 && r >= BOSS_R0 && r <= BOSS_R1) return { tile: F2, color: BROWN };
    if (c >= OPEN_C0 && c <= OPEN_C1 && r >= OPEN_R0 && r <= OPEN_R1) return { tile: F1, color: CREAM };
    if (c >= RIGHT_C0 && c <= RIGHT_C1 && r >= LOUNGE_R0 && r <= LOUNGE_R1) return { tile: F3, color: CARPET };
    if (c >= RIGHT_C0 && c <= RIGHT_C1 && r >= KITCHEN_R0 && r <= KITCHEN_R1) return { tile: F5, color: BEIGE };
    if (c >= RIGHT_C0 && c <= RIGHT_C1 && r >= CONF_R0 && r <= CONF_R1) return { tile: F2, color: BROWN };
    return { tile: F1, color: CREAM };
  });

  const furniture: PlacedFurniture[] = [];

  for (let i = 0; i < N; i++) {
    const [cx, cy] = codySeatPosition(i);
    const prefix = `cody-${i}`;
    const isBoss = i === 0;
    const isLounge = i >= 12 && i <= 13;
    const isConference = i >= 14 && i <= 19;

    if (isLounge) {
      furniture.push({ uid: `${prefix}-chair`, type: FurnitureType.ARMCHAIR, col: cx, row: cy });
      continue;
    }
    if (isConference) {
      furniture.push({ uid: `${prefix}-chair`, type: FurnitureType.CHAIR, col: cx, row: cy });
      continue;
    }
    const monitorType = i === 0 ? FurnitureType.MONITOR_APPS : i === 1 ? FurnitureType.MONITOR_LOBSTER : FurnitureType.MONITOR;
    furniture.push(
      { uid: `${prefix}-chair`, type: FurnitureType.CHAIR, col: cx, row: cy },
      { uid: `${prefix}-desk`, type: FurnitureType.DESK, col: cx, row: cy + 1 },
      { uid: `${prefix}-monitor`, type: monitorType, col: cx, row: cy + 1 },
      { uid: `${prefix}-keyboard`, type: FurnitureType.KEYBOARD, col: cx + 1, row: cy + 1 },
      { uid: `${prefix}-pc`, type: FurnitureType.PC, col: cx, row: cy + 2 },
      { uid: `${prefix}-mouse`, type: FurnitureType.MOUSE, col: cx + 1, row: cy + 2 },
      { uid: `${prefix}-coffee`, type: FurnitureType.COFFEE_CUP, col: cx + 1, row: cy + 1 },
      { uid: `${prefix}-lamp`, type: FurnitureType.LAMP, col: cx + 2, row: cy + 1 },
      { uid: `${prefix}-plant`, type: FurnitureType.PLANT, col: cx + 2, row: cy + 2 }
    );
  }

  const mid = (a: number, b: number) => Math.floor((a + b) / 2);

  furniture.push(
    { uid: "cody-boss-shelf-1", type: FurnitureType.BOOKSHELF, col: BOSS_C0, row: BOSS_R0 },
    { uid: "cody-boss-shelf-2", type: FurnitureType.BOOKSHELF, col: BOSS_C1 - 1, row: BOSS_R0 },
    { uid: "cody-boss-plant-1", type: FurnitureType.PLANT, col: BOSS_C0, row: BOSS_R1 - 1 },
    { uid: "cody-boss-plant-2", type: FurnitureType.PLANT, col: BOSS_C1 - 1, row: BOSS_R1 - 1 },
    { uid: "cody-boss-lamp", type: FurnitureType.LAMP, col: mid(BOSS_C0, BOSS_C1), row: BOSS_R0 }
  );

  furniture.push(
    { uid: "cody-open-printer", type: FurnitureType.PRINTER, col: mid(OPEN_C0, OPEN_C1) - 1, row: OPEN_R0 + 2 },
    { uid: "cody-open-lamp-1", type: FurnitureType.LAMP, col: OPEN_C0, row: OPEN_R0 },
    { uid: "cody-open-lamp-2", type: FurnitureType.LAMP, col: OPEN_C1 - 1, row: OPEN_R0 },
    { uid: "cody-open-plant-1", type: FurnitureType.PLANT, col: OPEN_C0, row: OPEN_R1 - 1 },
    { uid: "cody-open-plant-2", type: FurnitureType.PLANT, col: OPEN_C1 - 1, row: OPEN_R1 - 1 }
  );

  furniture.push(
    { uid: "cody-lounge-shelf", type: FurnitureType.BOOKSHELF, col: RIGHT_C0, row: LOUNGE_R0 },
    { uid: "cody-lounge-clock", type: FurnitureType.CLOCK, col: mid(RIGHT_C0, RIGHT_C1), row: LOUNGE_R0 },
    { uid: "cody-lounge-table", type: FurnitureType.TABLE_3X2, col: mid(RIGHT_C0, RIGHT_C1) - 1, row: LOUNGE_R1 - 3 },
    { uid: "cody-lounge-plant-1", type: FurnitureType.PLANT, col: RIGHT_C1 - 1, row: LOUNGE_R0 + 2 },
    { uid: "cody-lounge-plant-2", type: FurnitureType.PLANT, col: RIGHT_C0 + 2, row: LOUNGE_R1 - 1 },
    { uid: "cody-lounge-lamp-1", type: FurnitureType.LAMP, col: RIGHT_C0, row: LOUNGE_R0 + 3 },
    { uid: "cody-lounge-lamp-2", type: FurnitureType.LAMP, col: RIGHT_C1 - 1, row: LOUNGE_R0 + 3 }
  );

  furniture.push(
    { uid: "cody-kitchen-cooler-1", type: FurnitureType.COOLER, col: RIGHT_C0 + 1, row: KITCHEN_R0 },
    { uid: "cody-kitchen-cooler-2", type: FurnitureType.COOLER, col: RIGHT_C0 + 4, row: KITCHEN_R0 },
    { uid: "cody-kitchen-shelf-1", type: FurnitureType.SHELF, col: RIGHT_C0 + 2, row: KITCHEN_R0 },
    { uid: "cody-kitchen-shelf-2", type: FurnitureType.SHELF, col: RIGHT_C1 - 2, row: KITCHEN_R0 },
    { uid: "cody-kitchen-plant", type: FurnitureType.PLANT, col: RIGHT_C1 - 1, row: KITCHEN_R1 - 1 },
    { uid: "cody-kitchen-clock", type: FurnitureType.CLOCK, col: mid(RIGHT_C0, RIGHT_C1), row: KITCHEN_R0 }
  );

  const confTableC = 29;
  const confTableR = 23;
  furniture.push(
    { uid: "cody-conf-table", type: FurnitureType.TABLE_3X2, col: confTableC, row: confTableR },
    { uid: "cody-conf-rug", type: FurnitureType.RUG, col: confTableC + 1, row: confTableR },
    { uid: "cody-conf-plant", type: FurnitureType.PLANT, col: RIGHT_C1 - 1, row: CONF_R1 - 1 },
    { uid: "cody-conf-trash", type: FurnitureType.TRASH_BIN, col: RIGHT_C0, row: CONF_R1 - 1 }
  );

  return { version: 1, cols, rows, tiles, tileColors, furniture };
}

/**
 * Main workspace (4 workstations) + lounge area with one central table and chairs
 * around it so agents can sit around the table facing each other (like the reference image).
 */
export function createOfficeWithLoungeLayout(): OfficeLayout {
  const cols = 24;
  const rows = 16;
  const { tiles, tileColors } = fillTiles(cols, rows, (c, r) => {
    if (r === 0 || r === rows - 1) return { tile: W, color: null };
    if (c === 0 || c === cols - 1) return { tile: W, color: null };
    if (c === 11) {
      if ((r >= 3 && r <= 4) || (r >= 9 && r <= 10)) return { tile: F4, color: DOORWAY };
      return { tile: W, color: null };
    }
    if (r === 7 && c >= 12 && c <= 22) {
      if (c >= 16 && c <= 18) return { tile: F4, color: DOORWAY };
      return { tile: W, color: null };
    }
    if (c >= 1 && c <= 10 && r >= 1 && r <= 14) return { tile: F2, color: BROWN };
    if (c >= 12 && c <= 22 && r >= 1 && r <= 6) return { tile: F1, color: CREAM };
    if (c >= 12 && c <= 22 && r >= 8 && r <= 14) return { tile: F2, color: TEAL };
    return { tile: W, color: null };
  });
  const furniture: PlacedFurniture[] = [
    // Main workspace: 4 workstations — chair above desk so each faces user, PC on desk in front
    { uid: "ws-desk-1", type: FurnitureType.DESK, col: 2, row: 3 },
    { uid: "ws-desk-2", type: FurnitureType.DESK, col: 5, row: 3 },
    { uid: "ws-desk-3", type: FurnitureType.DESK, col: 2, row: 7 },
    { uid: "ws-desk-4", type: FurnitureType.DESK, col: 5, row: 7 },
    { uid: "ws-chair-1", type: FurnitureType.CHAIR, col: 3, row: 2 },
    { uid: "ws-chair-2", type: FurnitureType.CHAIR, col: 6, row: 2 },
    { uid: "ws-chair-3", type: FurnitureType.CHAIR, col: 3, row: 6 },
    { uid: "ws-chair-4", type: FurnitureType.CHAIR, col: 6, row: 6 },
    { uid: "ws-pc-1", type: FurnitureType.PC, col: 3, row: 3 },
    { uid: "ws-pc-2", type: FurnitureType.PC, col: 6, row: 3 },
    { uid: "ws-pc-3", type: FurnitureType.PC, col: 3, row: 7 },
    { uid: "ws-pc-4", type: FurnitureType.PC, col: 6, row: 7 },
    { uid: "ws-monitor-1", type: FurnitureType.MONITOR_APPS, col: 2, row: 3 },
    { uid: "ws-monitor-2", type: FurnitureType.MONITOR, col: 5, row: 3 },
    { uid: "ws-monitor-3", type: FurnitureType.MONITOR, col: 2, row: 7 },
    { uid: "ws-monitor-4", type: FurnitureType.MONITOR_LOBSTER, col: 5, row: 7 },
    { uid: "ws-keyboard-1", type: FurnitureType.KEYBOARD, col: 2, row: 4 },
    { uid: "ws-keyboard-2", type: FurnitureType.KEYBOARD, col: 5, row: 4 },
    { uid: "ws-keyboard-3", type: FurnitureType.KEYBOARD, col: 2, row: 8 },
    { uid: "ws-keyboard-4", type: FurnitureType.KEYBOARD, col: 5, row: 8 },
    { uid: "ws-mouse-1", type: FurnitureType.MOUSE, col: 3, row: 4 },
    { uid: "ws-mouse-2", type: FurnitureType.MOUSE, col: 6, row: 4 },
    { uid: "ws-mouse-3", type: FurnitureType.MOUSE, col: 3, row: 8 },
    { uid: "ws-mouse-4", type: FurnitureType.MOUSE, col: 6, row: 8 },
    { uid: "ws-coffee-1", type: FurnitureType.COFFEE_CUP, col: 3, row: 3 },
    { uid: "ws-coffee-2", type: FurnitureType.COFFEE_CUP, col: 6, row: 3 },
    { uid: "ws-coffee-3", type: FurnitureType.COFFEE_CUP, col: 3, row: 7 },
    { uid: "ws-coffee-4", type: FurnitureType.COFFEE_CUP, col: 6, row: 7 },
    { uid: "ws-shelf-1", type: FurnitureType.BOOKSHELF, col: 1, row: 1 },
    { uid: "ws-shelf-2", type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
    { uid: "ws-plant-1", type: FurnitureType.PLANT, col: 8, row: 3 },
    { uid: "ws-plant-2", type: FurnitureType.PLANT, col: 8, row: 7 },
    // Break/lounge area (top-right): cooler, chairs
    { uid: "lounge-cooler", type: FurnitureType.COOLER, col: 13, row: 2 },
    { uid: "lounge-plant", type: FurnitureType.PLANT, col: 21, row: 2 },
    // Lounge (bottom-right): table with chairs above it so both face user; PC/laptop per seat on table
    { uid: "lounge-table", type: FurnitureType.DESK, col: 15, row: 10 },
    { uid: "lounge-chair-1", type: FurnitureType.CHAIR, col: 15, row: 9 },
    { uid: "lounge-chair-2", type: FurnitureType.CHAIR, col: 16, row: 9 },
    { uid: "lounge-pc-1", type: FurnitureType.PC, col: 16, row: 10 },
    { uid: "lounge-pc-2", type: FurnitureType.PC, col: 16, row: 11 },
    { uid: "lounge-monitor-1", type: FurnitureType.MONITOR_APPS, col: 15, row: 10 },
    { uid: "lounge-monitor-2", type: FurnitureType.MONITOR_LOBSTER, col: 16, row: 10 },
    { uid: "lounge-macbook", type: FurnitureType.MACBOOK_PRO, col: 17, row: 10 },
    { uid: "lounge-macmini", type: FurnitureType.MAC_MINI, col: 17, row: 11 },
    { uid: "lounge-keyboard-1", type: FurnitureType.KEYBOARD, col: 15, row: 11 },
    { uid: "lounge-keyboard-2", type: FurnitureType.KEYBOARD, col: 16, row: 11 },
    { uid: "lounge-mouse-1", type: FurnitureType.MOUSE, col: 15, row: 12 },
    { uid: "lounge-mouse-2", type: FurnitureType.MOUSE, col: 16, row: 12 },
    { uid: "lounge-coffee-1", type: FurnitureType.COFFEE_CUP, col: 16, row: 10 },
    { uid: "lounge-coffee-2", type: FurnitureType.COFFEE_CUP, col: 15, row: 11 },
    { uid: "lounge-shelf", type: FurnitureType.BOOKSHELF, col: 12, row: 10 },
    { uid: "lounge-plant-1", type: FurnitureType.PLANT, col: 20, row: 9 },
    { uid: "lounge-plant-2", type: FurnitureType.PLANT, col: 20, row: 11 },
    { uid: "lounge-whiteboard", type: FurnitureType.WHITEBOARD, col: 18, row: 8 },
  ];
  return { version: 1, cols, rows, tiles, tileColors, furniture };
}

export interface LayoutPreset {
  id: string;
  name: string;
  layout: OfficeLayout;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "cody-office",
    name: "Cody Office (20 agents)",
    layout: createCodyOfficeLayout(),
  },
  {
    id: "workstations",
    name: "Workstations (one desk per agent)",
    layout: createWorkstationsLayout(MAX_WORKSTATIONS),
  },
  {
    id: "office-with-lounge",
    name: "Office with lounge (sit around table)",
    layout: createOfficeWithLoungeLayout(),
  },
  {
    id: "cozy",
    name: "Cozy Office",
    layout: createCozyOfficeLayout(2),
  },
];

export function getPresetById(id: string): OfficeLayout | null {
  const preset = LAYOUT_PRESETS.find((p) => p.id === id);
  return preset ? preset.layout : null;
}
