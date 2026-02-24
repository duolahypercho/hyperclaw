export type AgentStatus = "working" | "idle";

/** Optional labels for rooms and whiteboard; all dynamic. */
export interface RoomLabels {
  conference?: string;
  boss?: string;
  kitchen?: string;
  lounge?: string;
  whiteboard?: string;
  meetingRoom?: string;
  gym?: string;
  bathroom?: string;
}

export interface EmployeeStatus {
  id: string;
  name: string;
  status: AgentStatus;
  /** Current task label from bridge (e.g. cron job name, role, or "Idle"). */
  currentTask?: string;
}

export type DeskItemType = "globe" | "books" | "coffee" | "palette" | "camera" | "waveform" | "shield" | "fire" | "none";

export interface AgentConfig {
  id: string;
  name: string;
  shirtColor: string;
  hairColor: string;
  isBoss: boolean;
  deskIndex: number;
  deskItem: DeskItemType;
}

export interface AgentState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  status: AgentStatus;
  animFrame: number;
  facingRight: boolean;
  isSitting: boolean;
  waitUntil: number;
  /** When working: time (sec) when agent goes on a short break. */
  nextBreakAt?: number;
  /** When true, agent is walking to/from a break spot (working but not at desk). */
  onBreak?: boolean;
  /** When at break spot: time (sec) when they head back to desk. */
  breakEndsAt?: number;
}

export const CANVAS_W = 1600;
export const CANVAS_H_BASE = 1000;
export const CHAR_W = 20;
export const CHAR_H = 40;
export const TILE = 24;

/** Office grid — single source of truth for alignment */
export const MARGIN = 12;
export const GAP = 16;
export const ROW_TOP_H = 160;
export const MAIN_CORRIDOR_H = 16;
export const CONF_W = 180;
export const BOSS_W = 280;
export const KITCHEN_W = 260;
export const CUBICLE_W = 172;
export const CUBICLE_H = 128;
export const CUBICLE_GAP = 8;

/** Max 5 cubicles per row so workspace never crowds the lounge. */
export const CUBICLE_COLS = 5;
export const CUBICLE_ROW_HEIGHT = 140;

/** Derived: main corridor sits directly above cubicle area with no gap */
export const MAIN_CORRIDOR_Y = MARGIN + ROW_TOP_H;
export const CUBICLE_FIRST_ROW_Y = MAIN_CORRIDOR_Y + MAIN_CORRIDOR_H;

export const SHIRT_COLORS = [
  "#ec4899", "#3b82f6", "#a855f7", "#f97316", "#22c55e",
  "#06b6d4", "#8b5cf6", "#ef4444", "#eab308", "#f43f5e",
  "#14b8a6", "#a16207",
];
export const DESK_ITEMS: DeskItemType[] = [
  "globe", "books", "coffee", "palette", "camera", "waveform", "shield", "fire",
];

export interface OfficeLayout {
  cubicleRows: number;
  cubicleCols: number;
  cubicleRowYs: number[];
  canvasW: number;
  canvasH: number;
  cubicleW: number;
  cubicleH: number;
}

export function getOfficeLayout(cubicleCount: number): OfficeLayout {
  const cubicleCols = CUBICLE_COLS;
  const cubicleRows = Math.max(1, Math.ceil(cubicleCount / cubicleCols));
  const cubicleRowYs: number[] = [];
  for (let r = 0; r < cubicleRows; r++) {
    cubicleRowYs.push(CUBICLE_FIRST_ROW_Y + r * CUBICLE_ROW_HEIGHT);
  }
  const canvasH = cubicleRows <= 2
    ? CANVAS_H_BASE
    : CANVAS_H_BASE + (cubicleRows - 2) * CUBICLE_ROW_HEIGHT;
  return {
    cubicleRows,
    cubicleCols,
    cubicleRowYs,
    canvasW: CANVAS_W,
    canvasH,
    cubicleW: CUBICLE_W,
    cubicleH: CUBICLE_H,
  };
}

export function getCubicleCenterDynamic(layout: OfficeLayout, row: number, col: number): { x: number; y: number } {
  const baseX = CUBICLE_AREA_START_X + col * (layout.cubicleW + CUBICLE_GAP);
  const cx = baseX + layout.cubicleW / 2;
  const cy = layout.cubicleRowYs[row] + layout.cubicleH - 36;
  return { x: cx, y: cy };
}

/** Build AgentConfig[] from bridge get-team response. First agent = boss. */
export function buildAgentsFromTeam(team: { id: string; name: string; status?: string }[]): AgentConfig[] {
  if (!team.length) return getDefaultAgents();
  return team.map((a, i) => {
    const isBoss = i === 0;
    const deskIndex = isBoss ? -1 : i - 1;
    const colorIndex = i % SHIRT_COLORS.length;
    const deskItemIndex = isBoss ? -1 : (i - 1) % DESK_ITEMS.length;
    return {
      id: a.id,
      name: (a.name || a.id).length > 12 ? (a.name || a.id).slice(0, 10) + "…" : (a.name || a.id),
      shirtColor: SHIRT_COLORS[colorIndex],
      hairColor: "#1f2937",
      isBoss,
      deskIndex,
      deskItem: isBoss ? "none" : DESK_ITEMS[deskItemIndex],
    };
  });
}

/** Fallback when no team data — use ids as display so no hardcoded names. */
function getDefaultAgents(): AgentConfig[] {
  return [
    { id: "main", name: "", shirtColor: "#ec4899", hairColor: "#1f2937", isBoss: true, deskIndex: -1, deskItem: "none" },
    { id: "agent-1", name: "", shirtColor: "#3b82f6", hairColor: "#1f2937", isBoss: false, deskIndex: 0, deskItem: "globe" },
    { id: "agent-2", name: "", shirtColor: "#a855f7", hairColor: "#1f2937", isBoss: false, deskIndex: 1, deskItem: "books" },
  ];
}

/** Room positions derived from grid constants */
export const ROOM = {
  conf: { x: MARGIN, y: MARGIN, w: CONF_W, h: ROW_TOP_H },
  boss: { x: MARGIN + CONF_W + GAP, y: MARGIN, w: BOSS_W, h: ROW_TOP_H },
  kitchen: { x: MARGIN + CONF_W + GAP + BOSS_W + GAP, y: MARGIN, w: KITCHEN_W, h: ROW_TOP_H },
  cubicleRow1Y: CUBICLE_FIRST_ROW_Y,
  cubicleRow2Y: CUBICLE_FIRST_ROW_Y + CUBICLE_ROW_HEIGHT,
  cubicleW: CUBICLE_W,
  cubicleH: CUBICLE_H,
  lounge: { x: 960, y: MARGIN, w: 420, h: CANVAS_H_BASE - 2 * MARGIN },
  /** Gym and Bathroom pods inside lounge area */
  gym: { x: 970, y: MARGIN + 20, w: 120, h: 100 },
  bathroom: { x: 1100, y: MARGIN + 20, w: 120, h: 100 },
};

/** Cubicle area: left edge and right edge (end of last cubicle + gap) for hallway alignment */
export const CUBICLE_AREA_START_X = MARGIN;
export const CUBICLE_AREA_END_X = MARGIN + CUBICLE_COLS * (CUBICLE_W + CUBICLE_GAP) - CUBICLE_GAP;

/** Boss desk centered in boss office */
export const BOSS_DESK = {
  x: ROOM.boss.x + ROOM.boss.w / 2 - 40,
  y: ROOM.boss.y + 60,
  w: 80,
  h: 48,
};
export const BOSS_SEAT = {
  x: ROOM.boss.x + ROOM.boss.w / 2,
  y: ROOM.boss.y + 96,
};

export function getCubicleCenter(row: number, col: number): { x: number; y: number } {
  const baseX = CUBICLE_AREA_START_X + col * (ROOM.cubicleW + CUBICLE_GAP);
  const cx = baseX + ROOM.cubicleW / 2;
  const cy = row === 0 ? ROOM.cubicleRow1Y + ROOM.cubicleH - 36 : ROOM.cubicleRow2Y + ROOM.cubicleH - 36;
  return { x: cx, y: cy };
}

export const WANDER_POINTS = [
  { x: 100, y: 90 },
  { x: 340, y: 90 },
  { x: 580, y: 90 },
  { x: 120, y: 260 },
  { x: 360, y: 260 },
  { x: 600, y: 260 },
  { x: 120, y: 400 },
  { x: 360, y: 400 },
  { x: 600, y: 400 },
  { x: 1000, y: 120 },
  { x: 1020, y: 280 },
  { x: 1100, y: 440 },
  { x: 1280, y: 360 },
  { x: 1350, y: 200 },
];
