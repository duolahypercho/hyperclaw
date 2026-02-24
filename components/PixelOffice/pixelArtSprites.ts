/**
 * Pixel-art character sprites from pixel-agents codebase.
 * Each character PNG is 112×96: 7 frames × 16px wide, 3 rows × 32px tall.
 * Row 0 = down, 1 = up, 2 = right. Left = right flipped.
 * Frames: 0=walk1, 1=walk2, 2=walk3, 3=type1, 4=type2, 5=read1, 6=read2.
 */

import type { AgentConfig, AgentState } from "./types";

const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 32;
const CHAR_FRAMES_PER_ROW = 7;
const CHAR_COUNT = 6;

const BASE_PATH = "/pixel-office/characters";

let characterImages: HTMLImageElement[] | null = null;
let loadPromise: Promise<HTMLImageElement[]> | null = null;

export function loadCharacterSprites(): Promise<HTMLImageElement[]> {
  if (characterImages) return Promise.resolve(characterImages);
  if (loadPromise) return loadPromise;

  loadPromise = Promise.all(
    Array.from({ length: CHAR_COUNT }, (_, i) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${BASE_PATH}/char_${i}.png`));
        img.src = `${BASE_PATH}/char_${i}.png`;
      });
    })
  ).then((imgs) => {
    characterImages = imgs;
    return imgs;
  });

  return loadPromise;
}

export function areCharacterSpritesLoaded(): boolean {
  return characterImages != null && characterImages.length === CHAR_COUNT;
}

/** Draw scale: 2 = 32×64 on canvas (pixel-art crisp). */
const DRAW_SCALE = 2;

/**
 * Draw one character using pixel-agents sprite sheet.
 * Uses right/left row for facing; walk frames 0,1,2,1 or type frames 3,4 based on state.
 */
export function drawCharacterPixel(
  ctx: CanvasRenderingContext2D,
  _agent: AgentConfig,
  state: AgentState,
  paletteIndex: number
): void {
  const imgs = characterImages;
  if (!imgs || imgs.length === 0) return;

  const img = imgs[paletteIndex % imgs.length];
  if (!img.complete || img.naturalWidth === 0) return;

  const row = state.facingRight ? 2 : 2;
  const flip = !state.facingRight;

  let frame: number;
  if (state.isSitting) {
    frame = 3 + (state.animFrame % 2);
  } else {
    const walkFrame = state.animFrame % 4;
    frame = walkFrame === 3 ? 1 : walkFrame;
  }

  const sx = frame * CHAR_FRAME_W;
  const sy = row * CHAR_FRAME_H;

  const w = CHAR_FRAME_W * DRAW_SCALE;
  const h = CHAR_FRAME_H * DRAW_SCALE;
  const x = state.x - w / 2;
  const y = state.y - h;

  ctx.save();
  if (flip) {
    ctx.translate(state.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-state.x, 0);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, CHAR_FRAME_W, CHAR_FRAME_H, x, y, w, h);
  ctx.restore();
}
