import type { OfficeLayout, FloorColor, PlacedFurniture, TileType as TileTypeVal } from "./office/types";
import { TileType, FurnitureType } from "./office/types";
import { DEFAULT_COLS, DEFAULT_ROWS, MAX_COLS, MAX_ROWS } from "./constants";

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
  {
    id: "open-plan",
    name: "Open Plan",
    layout: (() => {
      const cols = 22;
      const rows = 12;
      const { tiles, tileColors } = fillTiles(cols, rows, (c, r) => {
        if (r === 0 || r === rows - 1) return { tile: W, color: null };
        if (c === 0 || c === cols - 1) return { tile: W, color: null };
        if (c === 11 && r >= 5 && r <= 7) return { tile: F4, color: DOORWAY };
        if (c === 11) return { tile: W, color: null };
        if (c >= 2 && c <= 9 && r >= 2 && r <= 9) return { tile: F2, color: BROWN };
        if (c >= 13 && c <= 20 && r >= 2 && r <= 9) return { tile: F1, color: TEAL };
        return { tile: F5, color: CREAM };
      });
      const furniture: PlacedFurniture[] = [
        { uid: "desk-1", type: FurnitureType.DESK, col: 3, row: 3 },
        { uid: "desk-2", type: FurnitureType.DESK, col: 6, row: 3 },
        { uid: "desk-3", type: FurnitureType.DESK, col: 14, row: 3 },
        { uid: "desk-4", type: FurnitureType.DESK, col: 17, row: 3 },
        { uid: "bookshelf-1", type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
        { uid: "bookshelf-2", type: FurnitureType.BOOKSHELF, col: 20, row: 5 },
        { uid: "plant-1", type: FurnitureType.PLANT, col: 1, row: 1 },
        { uid: "plant-2", type: FurnitureType.PLANT, col: 20, row: 1 },
        { uid: "plant-3", type: FurnitureType.PLANT, col: 10, row: 2 },
        { uid: "cooler", type: FurnitureType.COOLER, col: 19, row: 7 },
        { uid: "whiteboard", type: FurnitureType.WHITEBOARD, col: 14, row: 0 },
        { uid: "lamp-1", type: FurnitureType.LAMP, col: 2, row: 3 },
        { uid: "lamp-2", type: FurnitureType.LAMP, col: 5, row: 4 },
        { uid: "lamp-3", type: FurnitureType.LAMP, col: 13, row: 3 },
        { uid: "lamp-4", type: FurnitureType.LAMP, col: 18, row: 4 },
        { uid: "pc-1", type: FurnitureType.PC, col: 4, row: 2 },
        { uid: "pc-2", type: FurnitureType.PC, col: 15, row: 2 },
        { uid: "chair-1", type: FurnitureType.CHAIR, col: 3, row: 2 },
        { uid: "chair-2", type: FurnitureType.CHAIR, col: 4, row: 5 },
        { uid: "chair-3", type: FurnitureType.CHAIR, col: 6, row: 2 },
        { uid: "chair-4", type: FurnitureType.CHAIR, col: 7, row: 5 },
        { uid: "chair-5", type: FurnitureType.CHAIR, col: 14, row: 2 },
        { uid: "chair-6", type: FurnitureType.CHAIR, col: 15, row: 5 },
        { uid: "chair-7", type: FurnitureType.CHAIR, col: 17, row: 2 },
        { uid: "chair-8", type: FurnitureType.CHAIR, col: 18, row: 5 },
      ];
      return { version: 1, cols, rows, tiles, tileColors, furniture };
    })(),
  },
  {
    id: "minimal",
    name: "Minimal",
    layout: (() => {
      const cols = DEFAULT_COLS;
      const rows = DEFAULT_ROWS;
      const { tiles, tileColors } = fillTiles(cols, rows, (c, r) => {
        if (r === 0 || r === rows - 1) return { tile: W, color: null };
        if (c === 0 || c === cols - 1) return { tile: W, color: null };
        if (c === 10 && r >= 4 && r <= 6) return { tile: F4, color: DOORWAY };
        if (c === 10) return { tile: W, color: null };
        return { tile: F1, color: CREAM };
      });
      const furniture: PlacedFurniture[] = [
        { uid: "desk-1", type: FurnitureType.DESK, col: 5, row: 4 },
        { uid: "desk-2", type: FurnitureType.DESK, col: 13, row: 4 },
        { uid: "plant-1", type: FurnitureType.PLANT, col: 2, row: 2 },
        { uid: "plant-2", type: FurnitureType.PLANT, col: 17, row: 2 },
        { uid: "plant-3", type: FurnitureType.PLANT, col: 9, row: 5 },
        { uid: "whiteboard", type: FurnitureType.WHITEBOARD, col: 14, row: 0 },
        { uid: "lamp-1", type: FurnitureType.LAMP, col: 4, row: 3 },
        { uid: "lamp-2", type: FurnitureType.LAMP, col: 14, row: 5 },
        { uid: "bookshelf-1", type: FurnitureType.BOOKSHELF, col: 1, row: 6 },
        { uid: "chair-1", type: FurnitureType.CHAIR, col: 5, row: 3 },
        { uid: "chair-2", type: FurnitureType.CHAIR, col: 6, row: 6 },
        { uid: "chair-3", type: FurnitureType.CHAIR, col: 13, row: 3 },
        { uid: "chair-4", type: FurnitureType.CHAIR, col: 14, row: 6 },
      ];
      return { version: 1, cols, rows, tiles, tileColors, furniture };
    })(),
  },
  {
    id: "playground",
    name: "Playground Office",
    layout: (() => {
      const cols = 24;
      const rows = 16;
      const { tiles, tileColors } = fillTiles(cols, rows, (c, r) => {
        if (r === 0 || r === rows - 1) return { tile: W, color: null };
        if (c === 0 || c === cols - 1) return { tile: W, color: null };
        // Vertical divider between left and right (with doorways)
        if (c === 11) {
          if ((r >= 3 && r <= 4) || (r >= 9 && r <= 10)) return { tile: F4, color: DOORWAY };
          return { tile: W, color: null };
        }
        // Horizontal divider between break and meeting (with doorway)
        if (r === 7) {
          if (c >= 16 && c <= 18) return { tile: F4, color: DOORWAY };
          if (c >= 12 && c <= 22) return { tile: W, color: null };
        }
        // Left room: main workspace (playground) — brown floor
        if (c >= 1 && c <= 10 && r >= 1 && r <= 14) return { tile: F2, color: BROWN };
        // Top-right: break room — cream
        if (c >= 12 && c <= 22 && r >= 1 && r <= 6) return { tile: F1, color: CREAM };
        // Bottom-right: meeting room — teal
        if (c >= 12 && c <= 22 && r >= 8 && r <= 14) return { tile: F2, color: TEAL };
        return { tile: W, color: null };
      });
      const furniture: PlacedFurniture[] = [
        // —— Main workspace: chair above desk per person, face user; PC on desk in front ——
        { uid: "pw-desk-1", type: FurnitureType.DESK, col: 2, row: 3 },
        { uid: "pw-desk-2", type: FurnitureType.DESK, col: 5, row: 3 },
        { uid: "pw-desk-3", type: FurnitureType.DESK, col: 2, row: 7 },
        { uid: "pw-desk-4", type: FurnitureType.DESK, col: 5, row: 7 },
        { uid: "pw-chair-1", type: FurnitureType.CHAIR, col: 3, row: 2 },
        { uid: "pw-chair-2", type: FurnitureType.CHAIR, col: 6, row: 2 },
        { uid: "pw-chair-3", type: FurnitureType.CHAIR, col: 3, row: 6 },
        { uid: "pw-chair-4", type: FurnitureType.CHAIR, col: 6, row: 6 },
        { uid: "pw-shelf-1", type: FurnitureType.BOOKSHELF, col: 1, row: 1 },
        { uid: "pw-shelf-2", type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
        { uid: "pw-plant-1", type: FurnitureType.PLANT, col: 8, row: 3 },
        { uid: "pw-plant-2", type: FurnitureType.PLANT, col: 8, row: 7 },
        { uid: "pw-lamp-1", type: FurnitureType.LAMP, col: 2, row: 2 },
        { uid: "pw-lamp-2", type: FurnitureType.LAMP, col: 5, row: 2 },
        { uid: "pw-pc-1", type: FurnitureType.PC, col: 3, row: 3 },
        { uid: "pw-pc-2", type: FurnitureType.PC, col: 6, row: 3 },
        { uid: "pw-pc-3", type: FurnitureType.PC, col: 3, row: 7 },
        { uid: "pw-pc-4", type: FurnitureType.PC, col: 6, row: 7 },
        { uid: "pw-monitor-1", type: FurnitureType.MONITOR, col: 2, row: 3 },
        { uid: "pw-monitor-2", type: FurnitureType.MONITOR, col: 5, row: 3 },
        { uid: "pw-monitor-3", type: FurnitureType.MONITOR, col: 2, row: 7 },
        { uid: "pw-monitor-4", type: FurnitureType.MONITOR, col: 5, row: 7 },
        { uid: "pw-keyboard-1", type: FurnitureType.KEYBOARD, col: 2, row: 4 },
        { uid: "pw-keyboard-2", type: FurnitureType.KEYBOARD, col: 5, row: 4 },
        { uid: "pw-keyboard-3", type: FurnitureType.KEYBOARD, col: 2, row: 8 },
        { uid: "pw-keyboard-4", type: FurnitureType.KEYBOARD, col: 5, row: 8 },
        { uid: "pw-mouse-1", type: FurnitureType.MOUSE, col: 3, row: 4 },
        { uid: "pw-mouse-2", type: FurnitureType.MOUSE, col: 6, row: 4 },
        { uid: "pw-mouse-3", type: FurnitureType.MOUSE, col: 3, row: 8 },
        { uid: "pw-mouse-4", type: FurnitureType.MOUSE, col: 6, row: 8 },
        { uid: "pw-coffee-1", type: FurnitureType.COFFEE_CUP, col: 3, row: 3 },
        { uid: "pw-coffee-2", type: FurnitureType.COFFEE_CUP, col: 6, row: 3 },
        { uid: "pw-coffee-3", type: FurnitureType.COFFEE_CUP, col: 3, row: 7 },
        { uid: "pw-coffee-4", type: FurnitureType.COFFEE_CUP, col: 6, row: 7 },
        // —— Break room (top-right) ——
        { uid: "br-cooler", type: FurnitureType.COOLER, col: 13, row: 2 },
        { uid: "br-chair-1", type: FurnitureType.CHAIR, col: 16, row: 3 },
        { uid: "br-chair-2", type: FurnitureType.CHAIR, col: 19, row: 3 },
        { uid: "br-plant", type: FurnitureType.PLANT, col: 21, row: 2 },
        // —— Meeting room: table with chairs above so both face user; laptop/PC per seat on table ——
        { uid: "mt-table", type: FurnitureType.DESK, col: 15, row: 10 },
        { uid: "mt-chair-1", type: FurnitureType.CHAIR, col: 15, row: 9 },
        { uid: "mt-chair-2", type: FurnitureType.CHAIR, col: 16, row: 9 },
        { uid: "mt-pc-1", type: FurnitureType.PC, col: 16, row: 10 },
        { uid: "mt-pc-2", type: FurnitureType.PC, col: 16, row: 11 },
        { uid: "mt-monitor-1", type: FurnitureType.MONITOR, col: 15, row: 10 },
        { uid: "mt-monitor-2", type: FurnitureType.MONITOR, col: 16, row: 10 },
        { uid: "mt-keyboard-1", type: FurnitureType.KEYBOARD, col: 15, row: 11 },
        { uid: "mt-keyboard-2", type: FurnitureType.KEYBOARD, col: 15, row: 11 },
        { uid: "mt-mouse-1", type: FurnitureType.MOUSE, col: 16, row: 11 },
        { uid: "mt-mouse-2", type: FurnitureType.MOUSE, col: 16, row: 11 },
        { uid: "mt-coffee-1", type: FurnitureType.COFFEE_CUP, col: 16, row: 10 },
        { uid: "mt-coffee-2", type: FurnitureType.COFFEE_CUP, col: 15, row: 11 },
        { uid: "mt-shelf", type: FurnitureType.BOOKSHELF, col: 12, row: 10 },
        { uid: "mt-plant-1", type: FurnitureType.PLANT, col: 20, row: 9 },
        { uid: "mt-plant-2", type: FurnitureType.PLANT, col: 20, row: 11 },
        { uid: "mt-whiteboard", type: FurnitureType.WHITEBOARD, col: 18, row: 8 },
      ];
      return { version: 1, cols, rows, tiles, tileColors, furniture };
    })(),
  },
];

export function getPresetById(id: string): OfficeLayout | null {
  const preset = LAYOUT_PRESETS.find((p) => p.id === id);
  return preset ? preset.layout : null;
}
