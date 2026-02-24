import type { AgentConfig, AgentState, OfficeLayout } from "./types";
import {
  CANVAS_W,
  CHAR_W,
  CHAR_H,
  TILE,
  ROOM,
  BOSS_DESK,
  BOSS_SEAT,
  MARGIN,
  GAP,
  MAIN_CORRIDOR_Y,
  MAIN_CORRIDOR_H,
  CUBICLE_AREA_START_X,
  CUBICLE_AREA_END_X,
  CUBICLE_GAP,
} from "./types";
import { drawCharacterPixel, areCharacterSpritesLoaded } from "./pixelArtSprites";

const FLOOR_A = "#0f172a";
const FLOOR_B = "#1e293b";
const FLOOR_BROWN_A = "#a16207";
const FLOOR_BROWN_B = "#92400e";
const FLOOR_BLUE_A = "#93c5fd";
const FLOOR_BLUE_B = "#bfdbfe";
const FLOOR_LIGHT_A = "#e2e8f0";
const FLOOR_LIGHT_B = "#f1f5f9";
const WALL = "#475569";
const WALL_BG = "rgba(30, 41, 59, 0.85)";
const GLASS_BG = "rgba(51, 65, 85, 0.6)";
const GLASS_EDGE = "#64748b";
const DESK = "#78350f";
const MONITOR_BG = "#1e3a5f";
const MONITOR_GLOW = "#3b82f6";
const SKIN = "#fcd5b8";
const PANTS = "#1f2937";
const SHOE = "#374151";
const BOOKSHELF = "#78350f";
const PLANT = "#15803d";
const VENDING = "#94a3b8";

export function drawFloor(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  for (let gy = 0; gy < canvasH; gy += TILE) {
    for (let gx = 0; gx < canvasW; gx += TILE) {
      const t = ((gy / TILE) + (gx / TILE)) % 2;
      ctx.fillStyle = t === 0 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(gx, gy, TILE, TILE);
    }
  }
}

function drawTiledRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colorA: string, colorB: string) {
  for (let gy = 0; gy < h; gy += TILE) {
    for (let gx = 0; gx < w; gx += TILE) {
      const t = ((gy / TILE) + (gx / TILE)) % 2;
      ctx.fillStyle = t === 0 ? colorA : colorB;
      ctx.fillRect(x + gx, y + gy, Math.min(TILE, w - gx), Math.min(TILE, h - gy));
    }
  }
}

/** Zone floors like reference: brown main, light blue meeting, light break room */
export function drawZoneFloors(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, layout: OfficeLayout) {
  const conf = ROOM.conf;
  const boss = ROOM.boss;
  const kitchen = ROOM.kitchen;
  const lounge = ROOM.lounge;
  const gym = ROOM.gym;
  const bathroom = ROOM.bathroom;
  drawTiledRect(ctx, conf.x, conf.y, conf.w, conf.h, FLOOR_BLUE_A, FLOOR_BLUE_B);
  drawTiledRect(ctx, boss.x, boss.y, boss.w, boss.h, FLOOR_BROWN_A, FLOOR_BROWN_B);
  drawTiledRect(ctx, kitchen.x, kitchen.y, kitchen.w, kitchen.h, FLOOR_LIGHT_A, FLOOR_LIGHT_B);
  drawTiledRect(ctx, lounge.x, lounge.y, lounge.w, lounge.h, FLOOR_LIGHT_A, FLOOR_LIGHT_B);
  drawTiledRect(ctx, gym.x, gym.y, gym.w, gym.h, FLOOR_LIGHT_A, FLOOR_LIGHT_B);
  drawTiledRect(ctx, bathroom.x, bathroom.y, bathroom.w, bathroom.h, FLOOR_LIGHT_A, FLOOR_LIGHT_B);
  const cubicleW = layout.cubicleW + CUBICLE_GAP;
  const cubicleAreaW = layout.cubicleCols * layout.cubicleW + (layout.cubicleCols - 1) * CUBICLE_GAP;
  for (let r = 0; r < layout.cubicleRows; r++) {
    const by = layout.cubicleRowYs[r];
    drawTiledRect(ctx, CUBICLE_AREA_START_X, by, cubicleAreaW, layout.cubicleH, FLOOR_BROWN_A, FLOOR_BROWN_B);
  }
}

/** Campus title at top center — e.g. "Doraemon Office" */
export function drawCampusTitle(ctx: CanvasRenderingContext2D, title?: string, canvasW?: number) {
  const t = (title || "").trim();
  if (!t) return;
  const w = canvasW ?? CANVAS_W;
  ctx.save();
  ctx.font = "14px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  const text = t.length > 28 ? t.slice(0, 26) + "…" : t;
  ctx.fillText(text, w / 2, 22);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Rectangle boundary and label only (zone floor shows through) */
export function drawRoom(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label?: string) {
  const r = 8;
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = GLASS_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (label && label.trim()) {
    ctx.fillStyle = "#1e293b";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    const text = label.trim().length > 20 ? label.trim().slice(0, 18) + "…" : label.trim();
    ctx.fillText(text, x + 8, y + 14);
  }
}

/** Meeting room: large central table, bookshelves, plants, picture, printer */
export function drawConferenceRoom(ctx: CanvasRenderingContext2D, label?: string) {
  const { x, y, w, h } = ROOM.conf;
  drawRoom(ctx, x, y, w, h, label);
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.fillStyle = DESK;
  ctx.fillRect(cx - 55, cy - 22, 110, 44);
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 55, cy - 22, 110, 44);
  drawBookshelf(ctx, x + 8, y + 36, 24, 90);
  drawBookshelf(ctx, x + w - 34, y + 36, 24, 90);
  ctx.fillStyle = PLANT;
  ctx.fillRect(x + 40, y + h - 32, 12, 16);
  ctx.beginPath();
  ctx.arc(x + 46, y + h - 38, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PLANT;
  ctx.fillRect(x + w - 52, y + h - 32, 12, 16);
  ctx.beginPath();
  ctx.arc(x + w - 46, y + h - 38, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fef3c7";
  ctx.fillRect(x + w - 50, y + 50, 28, 22);
  ctx.strokeStyle = "#d97706";
  ctx.strokeRect(x + w - 50, y + 50, 28, 22);
  ctx.fillStyle = "#475569";
  ctx.fillRect(x + 36, y + h - 48, 20, 24);
  ctx.fillRect(x + 38, y + h - 46, 16, 20);
}

function drawBookshelf(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number) {
  ctx.fillStyle = BOOKSHELF;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const colors = ["#7c3aed", "#06b6d4", "#22c55e", "#ef4444", "#eab308"];
      ctx.fillStyle = colors[(row + col) % colors.length];
      ctx.fillRect(bx + 4 + col * 6, by + 6 + row * 20, 5, 14);
    }
  }
}

/** Main office: desk, monitor, bookshelves, plants, couch */
export function drawBossOffice(ctx: CanvasRenderingContext2D, bossLabel?: string) {
  const { x, y, w, h } = ROOM.boss;
  drawRoom(ctx, x, y, w, h, bossLabel);
  ctx.fillStyle = DESK;
  ctx.fillRect(BOSS_DESK.x, BOSS_DESK.y, BOSS_DESK.w, BOSS_DESK.h);
  ctx.fillStyle = MONITOR_BG;
  ctx.fillRect(BOSS_DESK.x + 8, BOSS_DESK.y - 20, 56, 22);
  ctx.fillStyle = MONITOR_GLOW;
  ctx.fillRect(BOSS_DESK.x + 12, BOSS_DESK.y - 16, 48, 14);
  drawBookshelf(ctx, x + w - 72, y + 50, 20, 88);
  ctx.fillStyle = PLANT;
  ctx.fillRect(x + 24, y + h - 42, 10, 14);
  ctx.beginPath();
  ctx.arc(x + 29, y + h - 48, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#64748b";
  ctx.fillRect(x + 30, y + h - 50, 70, 24);
  ctx.fillRect(x + 32, y + h - 48, 66, 20);
}

/** Break room: vending machine, water cooler, trash can, wall clock */
export function drawKitchen(ctx: CanvasRenderingContext2D, label?: string) {
  const { x, y, w, h } = ROOM.kitchen;
  drawRoom(ctx, x, y, w, h, label);
  ctx.fillStyle = VENDING;
  ctx.fillRect(x + 20, y + 30, 44, 70);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 20, y + 30, 44, 70);
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x + 24, y + 36, 36, 24);
  ctx.fillStyle = "#0ea5e9";
  ctx.fillRect(x + w - 54, y + 36, 24, 52);
  ctx.fillRect(x + w - 50, y + 40, 16, 44);
  ctx.fillStyle = "#64748b";
  ctx.fillRect(x + 80, y + h - 36, 16, 20);
  ctx.strokeRect(x + 80, y + h - 36, 16, 20);
  ctx.fillStyle = "#fef3c7";
  ctx.beginPath();
  ctx.arc(x + 100, y + 28, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x + 97, y + 26, 6, 4);
}

/** Desk/table label and status dynamic; brown floor shows through, small plant */
export function drawCubicle(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  row: number,
  col: number,
  name: string,
  status: string,
  deskItem: AgentConfig["deskItem"]
) {
  const baseX = CUBICLE_AREA_START_X + col * (layout.cubicleW + CUBICLE_GAP);
  const baseY = layout.cubicleRowYs[row];
  const r = 6;
  roundRect(ctx, baseX, baseY, layout.cubicleW, layout.cubicleH, r);
  ctx.strokeStyle = GLASS_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  const displayName = (name || "").trim();
  if (displayName) {
    ctx.fillStyle = "#1e293b";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(displayName.length > 14 ? displayName.slice(0, 12) + "…" : displayName, baseX + 8, baseY + 14);
  }
  const dotColor = status === "working" ? "#22c55e" : "#ef4444";
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(baseX + layout.cubicleW - 14, baseY + 12, 4, 0, Math.PI * 2);
  ctx.fill();
  const deskY = baseY + layout.cubicleH - 52;
  ctx.fillStyle = DESK;
  ctx.fillRect(baseX + 10, deskY, layout.cubicleW - 20, 24);
  ctx.fillStyle = MONITOR_BG;
  ctx.fillRect(baseX + layout.cubicleW / 2 - 24, deskY - 22, 48, 20);
  ctx.fillStyle = MONITOR_GLOW;
  ctx.fillRect(baseX + layout.cubicleW / 2 - 20, deskY - 18, 40, 14);
  drawDeskItem(ctx, baseX + layout.cubicleW / 2 + 20, deskY + 6, deskItem);
  if ((row + col) % 2 === 0) {
    ctx.fillStyle = PLANT;
    ctx.fillRect(baseX + layout.cubicleW - 28, baseY + layout.cubicleH - 28, 8, 10);
    ctx.beginPath();
    ctx.arc(baseX + layout.cubicleW - 24, baseY + layout.cubicleH - 32, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDeskItem(ctx: CanvasRenderingContext2D, px: number, py: number, item: AgentConfig["deskItem"]) {
  switch (item) {
    case "globe":
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1e40af";
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    case "books":
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(px - 6, py - 4, 6, 10);
      ctx.fillStyle = "#06b6d4";
      ctx.fillRect(px - 2, py - 2, 6, 10);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(px + 2, py, 6, 10);
      break;
    case "coffee":
      ctx.fillStyle = "#78350f";
      ctx.fillRect(px - 4, py - 2, 8, 10);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(px - 2, py - 4, 4, 4);
      break;
    case "palette":
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(px + 3, py - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(px + 2, py + 3, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(px - 3, py + 2, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "camera":
      ctx.fillStyle = "#475569";
      ctx.fillRect(px - 6, py - 4, 12, 10);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(px - 4, py - 2, 8, 6);
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(px + 4, py - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "waveform":
      for (let i = 0; i < 5; i++) {
        const h = 4 + (i % 3) * 4;
        ctx.fillStyle = "#8b5cf6";
        ctx.fillRect(px - 10 + i * 5, py + 6 - h, 3, h);
      }
      break;
    case "shield":
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(px, py - 8);
      ctx.lineTo(px + 8, py);
      ctx.lineTo(px, py + 8);
      ctx.lineTo(px - 8, py);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#b91c1c";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "8px monospace";
      ctx.fillText("✓", px - 3, py + 4);
      break;
    case "fire":
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(px, py - 6);
      ctx.lineTo(px + 4, py + 4);
      ctx.lineTo(px, py + 2);
      ctx.lineTo(px - 4, py + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#eab308";
      ctx.fillRect(px - 2, py + 2, 4, 4);
      break;
    default:
      break;
  }
}

export function drawLounge(ctx: CanvasRenderingContext2D, loungeLabel?: string, whiteboardLabel?: string) {
  const { x, y, w, h } = ROOM.lounge;
  drawRoom(ctx, x, y, w, h, loungeLabel);

  // Back of room first (so foreground elements don’t get covered)
  // IDEAS whiteboard (wall) — placed right so it doesn’t overlap bean bags
  const boardLeft = x + 170;
  const boardTop = y + 420;
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(boardLeft, boardTop, 100, 50);
  ctx.strokeStyle = "#166534";
  ctx.lineWidth = 2;
  ctx.strokeRect(boardLeft, boardTop, 100, 50);
  ctx.fillStyle = "#fff";
  ctx.fillRect(boardLeft + 10, boardTop + 10, 80, 24);
  if (whiteboardLabel && whiteboardLabel.trim()) {
    ctx.fillStyle = "#0f172a";
    ctx.font = "11px 'JetBrains Mono', monospace";
    const text = whiteboardLabel.trim().length > 8 ? whiteboardLabel.trim().slice(0, 6) + "…" : whiteboardLabel.trim();
    ctx.fillText(text, boardLeft + 16, boardTop + 26);
  }
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(boardLeft + 15, boardTop + 18, 16, 2);
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(boardLeft + 38, boardTop + 18, 16, 2);
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(boardLeft + 61, boardTop + 18, 16, 2);

  // Couch
  ctx.fillStyle = "#64748b";
  ctx.fillRect(x + 20, y + 80, 100, 30);
  ctx.fillRect(x + 22, y + 82, 96, 26);
  // Coffee table
  ctx.fillStyle = DESK;
  ctx.fillRect(x + 40, y + 200, 80, 12);
  // Water cooler
  ctx.fillStyle = "#0ea5e9";
  ctx.fillRect(x + w - 70, y + 100, 24, 50);
  ctx.fillRect(x + w - 68, y + 104, 20, 42);

  // Bean bags in front (drawn last so they sit on top)
  ctx.fillStyle = "#a855f7";
  ctx.beginPath();
  ctx.arc(x + 80, y + 320, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(x + 140, y + 340, 18, 0, Math.PI * 2);
  ctx.fill();
}

/** Gym and Bathroom pods — rectangle boundaries, labels dynamic */
export function drawGymAndBathroom(ctx: CanvasRenderingContext2D, gymLabel?: string, bathroomLabel?: string) {
  const gym = ROOM.gym;
  const bath = ROOM.bathroom;
  drawRoom(ctx, gym.x, gym.y, gym.w, gym.h, gymLabel);
  drawRoom(ctx, bath.x, bath.y, bath.w, bath.h, bathroomLabel);
}

/** Hallway/walkway color — slightly lighter than floor so paths are visible */
const HALLWAY_FILL = "#1e293b";
const HALLWAY_EDGE = "#334155";

export function drawHallways(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  layout?: OfficeLayout
) {
  ctx.fillStyle = HALLWAY_FILL;
  ctx.strokeStyle = HALLWAY_EDGE;
  ctx.lineWidth = 1;

  // Main horizontal corridor: aligned with grid, runs below top rooms to above cubicles
  ctx.fillRect(MARGIN, MAIN_CORRIDOR_Y, canvasW - 2 * MARGIN, MAIN_CORRIDOR_H);
  ctx.strokeRect(MARGIN, MAIN_CORRIDOR_Y, canvasW - 2 * MARGIN, MAIN_CORRIDOR_H);

  // Vertical corridors in gaps between rooms (conf|boss|kitchen) — same width as GAP
  const topCorridorEnd = MAIN_CORRIDOR_Y + MAIN_CORRIDOR_H;
  ctx.fillRect(ROOM.conf.x + ROOM.conf.w, MARGIN, GAP, topCorridorEnd - MARGIN);
  ctx.strokeRect(ROOM.conf.x + ROOM.conf.w, MARGIN, GAP, topCorridorEnd - MARGIN);
  ctx.fillRect(ROOM.boss.x + ROOM.boss.w, MARGIN, GAP, topCorridorEnd - MARGIN);
  ctx.strokeRect(ROOM.boss.x + ROOM.boss.w, MARGIN, GAP, topCorridorEnd - MARGIN);
  ctx.fillRect(ROOM.kitchen.x + ROOM.kitchen.w, MARGIN, GAP, topCorridorEnd - MARGIN);
  ctx.strokeRect(ROOM.kitchen.x + ROOM.kitchen.w, MARGIN, GAP, topCorridorEnd - MARGIN);

  // Left edge walkway (along wall)
  ctx.fillRect(0, MAIN_CORRIDOR_Y, MARGIN, canvasH - MAIN_CORRIDOR_Y);
  ctx.strokeRect(0, MAIN_CORRIDOR_Y, MARGIN, canvasH - MAIN_CORRIDOR_Y);

  // Right walkway: cubicle area end → lounge start (one continuous strip)
  const rightWalkwayW = ROOM.lounge.x - CUBICLE_AREA_END_X;
  if (rightWalkwayW > 0) {
    ctx.fillRect(CUBICLE_AREA_END_X, MAIN_CORRIDOR_Y, rightWalkwayW, canvasH - MAIN_CORRIDOR_Y);
    ctx.strokeRect(CUBICLE_AREA_END_X, MAIN_CORRIDOR_Y, rightWalkwayW, canvasH - MAIN_CORRIDOR_Y);
  }

  // Cubicle aisles (align with cubicle grid)
  if (layout && layout.cubicleRows >= 1) {
    const belowMain = topCorridorEnd;
    const aisleW = CUBICLE_AREA_END_X - CUBICLE_AREA_START_X;

    // Horizontal aisles between cubicle rows
    for (let r = 0; r < layout.cubicleRows - 1; r++) {
      const top = layout.cubicleRowYs[r] + layout.cubicleH;
      const bottom = layout.cubicleRowYs[r + 1];
      const aisleH = Math.max(CUBICLE_GAP, bottom - top);
      ctx.fillRect(CUBICLE_AREA_START_X, top, aisleW, aisleH);
      ctx.strokeRect(CUBICLE_AREA_START_X, top, aisleW, aisleH);
    }

    // Vertical aisles between cubicle columns (in the gap after each column)
    for (let c = 0; c < layout.cubicleCols - 1; c++) {
      const x = CUBICLE_AREA_START_X + (c + 1) * layout.cubicleW + c * CUBICLE_GAP;
      ctx.fillRect(x, belowMain, CUBICLE_GAP, canvasH - belowMain);
      ctx.strokeRect(x, belowMain, CUBICLE_GAP, canvasH - belowMain);
    }
  }
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  agent: AgentConfig,
  state: AgentState,
  paletteIndex?: number
) {
  if (areCharacterSpritesLoaded() && paletteIndex !== undefined) {
    drawCharacterPixel(ctx, agent, state, paletteIndex);
    return;
  }

  const scale = 2;
  const w = (CHAR_W / 2) * scale;
  const h = (CHAR_H / 2) * scale;
  const x = state.x - w / 2;
  const y = state.y - h;
  ctx.save();
  if (!state.facingRight) {
    ctx.translate(state.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-state.x, 0);
  }

  if (state.isSitting) {
    ctx.fillStyle = agent.hairColor;
    ctx.fillRect(x + 4, y, 12, 6);
    ctx.fillStyle = SKIN;
    ctx.fillRect(x + 4, y + 6, 12, 8);
    ctx.fillStyle = agent.shirtColor;
    ctx.fillRect(x + 2, y + 14, 16, 12);
    ctx.fillRect(x, y + 18, 8, 8);
    ctx.fillRect(x + 12, y + 18, 8, 8);
    ctx.fillStyle = PANTS;
    ctx.fillRect(x + 4, y + 26, 8, 6);
    ctx.fillRect(x + 8, y + 26, 8, 6);
  } else {
    const frame = state.animFrame % 2;
    ctx.fillStyle = agent.hairColor;
    ctx.fillRect(x + 4, y, 12, 6);
    ctx.fillStyle = SKIN;
    ctx.fillRect(x + 4, y + 6, 12, 8);
    ctx.fillStyle = agent.shirtColor;
    ctx.fillRect(x + 2, y + 14, 16, 12);
    if (frame === 0) {
      ctx.fillRect(x - 2, y + 16, 6, 10);
      ctx.fillRect(x + 16, y + 18, 6, 8);
    } else {
      ctx.fillRect(x - 2, y + 18, 6, 8);
      ctx.fillRect(x + 16, y + 16, 6, 10);
    }
    ctx.fillStyle = PANTS;
    ctx.fillRect(x + 2, y + 26, 6, 10);
    ctx.fillRect(x + 12, y + 26, 6, 10);
    if (frame === 0) {
      ctx.fillStyle = SHOE;
      ctx.fillRect(x + 2, y + 36, 6, 4);
      ctx.fillRect(x + 12, y + 34, 6, 4);
    } else {
      ctx.fillStyle = SHOE;
      ctx.fillRect(x + 2, y + 34, 6, 4);
      ctx.fillRect(x + 12, y + 36, 6, 4);
    }
  }
  ctx.restore();
}

export function drawStatusBar(
  ctx: CanvasRenderingContext2D,
  agents: { config: AgentConfig; state: AgentState }[],
  canvasW: number,
  canvasH: number,
  currentTasks?: Record<string, string>
) {
  const barY = canvasH - 32;
  ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
  ctx.fillRect(0, barY, canvasW, 32);
  ctx.strokeStyle = WALL;
  ctx.lineWidth = 1;
  ctx.strokeRect(0, barY, canvasW, 32);
  ctx.font = "11px 'JetBrains Mono', monospace";
  let bx = 12;
  agents.forEach(({ config, state }) => {
    const task = currentTasks?.[config.id];
    const statusText = state.status === "working" ? "Working" : "Idle";
    const label = task ? `${config.name}: ${task.length > 18 ? task.slice(0, 15) + "…" : task}` : `${config.name} ${statusText}`;
    const dotColor = state.status === "working" ? "#22c55e" : config.shirtColor;
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(bx + 6, barY + 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(label, bx + 16, barY + 20);
    bx += ctx.measureText(label).width + 24;
  });
}
