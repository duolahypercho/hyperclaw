import type { Direction, SpriteData, FloorColor } from '../types'
import { Direction as Dir } from '../types'
import { adjustSprite } from '../colorize'

// ── Color Palettes ──────────────────────────────────────────────
const _ = '' // transparent

// ── Furniture Sprites ───────────────────────────────────────────

/** Square desk: 32x32 pixels (2x2 tiles) — top-down wood surface */
export const DESK_SQUARE_SPRITE: SpriteData = (() => {
  const W = '#8B6914' // wood edge
  const L = '#A07828' // lighter wood
  const S = '#B8922E' // surface
  const D = '#6B4E0A' // dark edge
  const rows: string[][] = []
  // Row 0: empty
  rows.push(new Array(32).fill(_))
  // Row 1: top edge
  rows.push([_, ...new Array(30).fill(W), _])
  // Rows 2-5: top surface
  for (let r = 0; r < 4; r++) {
    rows.push([_, W, ...new Array(28).fill(r < 1 ? L : S), W, _])
  }
  // Row 6: horizontal divider
  rows.push([_, D, ...new Array(28).fill(W), D, _])
  // Rows 7-12: middle surface area
  for (let r = 0; r < 6; r++) {
    rows.push([_, W, ...new Array(28).fill(S), W, _])
  }
  // Row 13: center line
  rows.push([_, W, ...new Array(28).fill(L), W, _])
  // Rows 14-19: lower surface
  for (let r = 0; r < 6; r++) {
    rows.push([_, W, ...new Array(28).fill(S), W, _])
  }
  // Row 20: horizontal divider
  rows.push([_, D, ...new Array(28).fill(W), D, _])
  // Rows 21-24: bottom surface
  for (let r = 0; r < 4; r++) {
    rows.push([_, W, ...new Array(28).fill(r > 2 ? L : S), W, _])
  }
  // Row 25: bottom edge
  rows.push([_, ...new Array(30).fill(W), _])
  // Rows 26-31: legs/shadow
  for (let r = 0; r < 4; r++) {
    const row = new Array(32).fill(_) as string[]
    row[1] = D; row[2] = D; row[29] = D; row[30] = D
    rows.push(row)
  }
  rows.push(new Array(32).fill(_))
  rows.push(new Array(32).fill(_))
  return rows
})()

/** Plant in pot: 16x24 */
export const PLANT_SPRITE: SpriteData = (() => {
  const G = '#3D8B37'
  const D = '#2D6B27'
  const T = '#6B4E0A'
  const P = '#B85C3A'
  const R = '#8B4422'
  return [
    [_, _, _, _, _, _, G, G, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, G, G, G, G, _, _, _, _, _, _, _],
    [_, _, _, _, G, G, D, G, G, G, _, _, _, _, _, _],
    [_, _, _, G, G, D, G, G, D, G, G, _, _, _, _, _],
    [_, _, G, G, G, G, G, G, G, G, G, G, _, _, _, _],
    [_, G, G, D, G, G, G, G, G, G, D, G, G, _, _, _],
    [_, G, G, G, G, D, G, G, D, G, G, G, G, _, _, _],
    [_, _, G, G, G, G, G, G, G, G, G, G, _, _, _, _],
    [_, _, _, G, G, G, D, G, G, G, G, _, _, _, _, _],
    [_, _, _, _, G, G, G, G, G, G, _, _, _, _, _, _],
    [_, _, _, _, _, G, G, G, G, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, R, R, R, R, R, _, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, R, P, P, P, P, P, R, _, _, _, _, _],
    [_, _, _, _, _, R, P, P, P, R, _, _, _, _, _, _],
    [_, _, _, _, _, _, R, R, R, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Bookshelf: 16x32 (1 tile wide, 2 tiles tall) */
export const BOOKSHELF_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const R = '#CC4444'
  const B = '#4477AA'
  const G = '#44AA66'
  const Y = '#CCAA33'
  const P = '#9955AA'
  return [
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, R, R, B, B, G, G, Y, Y, R, R, B, B, D, W],
    [W, D, R, R, B, B, G, G, Y, Y, R, R, B, B, D, W],
    [W, D, R, R, B, B, G, G, Y, Y, R, R, B, B, D, W],
    [W, D, R, R, B, B, G, G, Y, Y, R, R, B, B, D, W],
    [W, D, R, R, B, B, G, G, Y, Y, R, R, B, B, D, W],
    [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, P, P, Y, Y, B, B, G, G, P, P, R, R, D, W],
    [W, D, P, P, Y, Y, B, B, G, G, P, P, R, R, D, W],
    [W, D, P, P, Y, Y, B, B, G, G, P, P, R, R, D, W],
    [W, D, P, P, Y, Y, B, B, G, G, P, P, R, R, D, W],
    [W, D, P, P, Y, Y, B, B, G, G, P, P, R, R, D, W],
    [W, D, P, P, Y, Y, B, B, G, G, P, P, R, R, D, W],
    [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, G, G, R, R, P, P, B, B, Y, Y, G, G, D, W],
    [W, D, G, G, R, R, P, P, B, B, Y, Y, G, G, D, W],
    [W, D, G, G, R, R, P, P, B, B, Y, Y, G, G, D, W],
    [W, D, G, G, R, R, P, P, B, B, Y, Y, G, G, D, W],
    [W, D, G, G, R, R, P, P, B, B, Y, Y, G, G, D, W],
    [W, D, G, G, R, R, P, P, B, B, Y, Y, G, G, D, W],
    [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
  ]
})()

/** Water cooler: 16x24 */
export const COOLER_SPRITE: SpriteData = (() => {
  const W = '#CCDDEE'
  const L = '#88BBDD'
  const D = '#999999'
  const B = '#666666'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, D, D, W, W, W, W, D, D, _, _, _, _],
    [_, _, _, _, D, W, W, W, W, W, W, D, _, _, _, _],
    [_, _, _, _, D, W, W, W, W, W, W, D, _, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, D, B, B, B, B, D, _, _, _, _, _],
    [_, _, _, _, _, D, B, B, B, B, D, _, _, _, _, _],
    [_, _, _, _, _, D, B, B, B, B, D, _, _, _, _, _],
    [_, _, _, _, D, D, B, B, B, B, D, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Whiteboard: 32x16 (2 tiles wide, 1 tile tall) — hangs on wall */
export const WHITEBOARD_SPRITE: SpriteData = (() => {
  const F = '#AAAAAA'
  const W = '#EEEEFF'
  const M = '#CC4444'
  const B = '#4477AA'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, _],
    [_, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, F, _],
    [_, F, W, W, M, M, M, W, W, W, W, W, B, B, B, B, W, W, W, W, W, W, W, M, W, W, W, W, W, W, F, _],
    [_, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, B, B, W, W, M, W, W, W, W, W, W, F, _],
    [_, F, W, W, W, W, M, M, M, M, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, B, B, W, W, F, _],
    [_, F, W, W, W, W, W, W, W, W, W, W, W, B, B, B, W, W, W, W, W, W, W, W, W, W, W, W, W, W, F, _],
    [_, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, M, M, M, W, W, W, W, W, W, W, F, _],
    [_, F, W, M, M, W, W, W, W, W, W, W, W, W, W, W, B, B, W, W, W, W, W, W, W, W, W, W, W, W, F, _],
    [_, F, W, W, W, W, W, W, B, B, B, W, W, W, W, W, W, W, W, W, W, W, W, W, M, M, M, M, W, W, F, _],
    [_, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, F, _],
    [_, F, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, F, _],
    [_, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Chair: 16x16 — top-down desk chair */
export const CHAIR_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const B = '#5C3D0A'
  const S = '#A07828'
  return [
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, D, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
  ]
})()

/** PC monitor: 16x16 — top-down monitor on stand */
export const PC_SPRITE: SpriteData = (() => {
  const F = '#555555'
  const S = '#3A3A5C'
  const B = '#6688CC'
  const D = '#444444'
  return [
    [_, _, _, F, F, F, F, F, F, F, F, F, F, _, _, _],
    [_, _, _, F, S, S, S, S, S, S, S, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, B, B, B, B, B, B, S, F, _, _, _],
    [_, _, _, F, S, S, S, S, S, S, S, S, F, _, _, _],
    [_, _, _, F, F, F, F, F, F, F, F, F, F, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Desk lamp: 16x16 — top-down lamp with light cone */
export const LAMP_SPRITE: SpriteData = (() => {
  const Y = '#FFDD55'
  const L = '#FFEE88'
  const D = '#888888'
  const B = '#555555'
  const G = '#FFFFCC'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, G, G, G, G, _, _, _, _, _, _],
    [_, _, _, _, _, G, Y, Y, Y, Y, G, _, _, _, _, _],
    [_, _, _, _, G, Y, Y, L, L, Y, Y, G, _, _, _, _],
    [_, _, _, _, Y, Y, L, L, L, L, Y, Y, _, _, _, _],
    [_, _, _, _, Y, Y, L, L, L, L, Y, Y, _, _, _, _],
    [_, _, _, _, _, Y, Y, Y, Y, Y, Y, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, B, B, B, B, B, B, _, _, _, _, _],
    [_, _, _, _, _, B, B, B, B, B, B, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Monitor: 16x16 — Apple-style display (thin aluminum bezel, large screen, minimal stand) */
export const MONITOR_SPRITE: SpriteData = (() => {
  const B = '#B8B8C0'   // aluminum bezel light
  const D = '#9090A0'   // aluminum bezel mid
  const E = '#787888'   // aluminum edge
  const S = '#6A7A8E'   // screen blue-gray
  const L = '#7E8FA6'   // screen highlight
  const Stand = '#888898' // stand
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, E, B, B, B, B, B, B, B, B, E, _, _, _],
    [_, _, _, B, S, S, L, S, S, L, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, E, D, D, D, D, D, D, D, D, E, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Laptop: 16x16 — Apple-style laptop (screen + keyboard base, top-down) */
export const LAPTOP_SPRITE: SpriteData = (() => {
  const B = '#C0C0C8'   // aluminum body
  const D = '#9898A8'   // body shadow
  const S = '#6A7A8E'   // screen
  const L = '#7E8FA6'   // screen highlight
  const K = '#2C2C34'   // keyboard area
  const W = '#505060'   // key
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, D, B, S, S, L, S, S, S, B, D, _, _, _],
    [_, _, _, B, B, S, S, S, S, S, S, B, B, _, _, _],
    [_, _, _, B, B, S, S, S, S, S, S, B, B, _, _, _],
    [_, _, _, B, B, S, S, S, S, S, S, B, B, _, _, _],
    [_, _, _, D, B, B, B, B, B, B, B, B, D, _, _, _],
    [_, _, _, _, D, K, W, K, W, K, W, K, D, _, _, _],
    [_, _, _, _, D, K, W, K, W, K, W, K, D, _, _, _],
    [_, _, _, _, D, K, K, K, K, K, K, K, D, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Keyboard: 16x16 — top-down QWERTY-style (key rows, spacebar, slight taper) */
export const KEYBOARD_SPRITE: SpriteData = (() => {
  const K = '#2C2C34'   // key cap
  const W = '#E8E8EC'   // light key
  const D = '#4A4A58'   // base/frame
  const S = '#1A1A22'   // gap between keys
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, D, D, D, D, D, D, D, D, D, D, D, _, _],
    [_, _, D, S, K, K, K, S, K, K, K, S, K, K, D, _],
    [_, _, D, K, W, K, W, K, W, K, W, K, W, K, D, _],
    [_, _, D, K, K, K, K, K, K, K, K, K, K, K, D, _],
    [_, _, D, D, K, K, K, K, K, K, K, K, K, D, D, _],
    [_, _, _, D, D, D, D, K, K, K, D, D, D, D, _, _],
    [_, _, _, _, _, _, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Mouse: 16x16 — top-down ergonomic mouse (body + scroll wheel) */
export const MOUSE_SPRITE: SpriteData = (() => {
  const M = '#3A3A48'   // body
  const L = '#505062'   // highlight
  const W = '#8888A0'   // scroll wheel
  const D = '#2A2A35'   // edge
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, M, L, M, D, _, _, _, _, _],
    [_, _, _, _, _, D, M, M, W, M, M, D, _, _, _, _],
    [_, _, _, _, _, D, M, M, W, M, M, D, _, _, _, _],
    [_, _, _, _, _, D, M, M, L, M, M, D, _, _, _, _],
    [_, _, _, _, _, _, D, M, M, M, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Monitor with apps: 16x16 — same as Apple monitor, screen shows app windows (browser, code, terminal) */
export const MONITOR_APPS_SPRITE: SpriteData = (() => {
  const B = '#B8B8C0'
  const D = '#9090A0'
  const E = '#787888'
  const Stand = '#888898'
  const BG = '#1a2234'      // dark app bg
  const WIN = '#2d3a5a'     // window
  const BAR = '#3b82f6'     // title bar blue
  const TXT = '#94a3b8'     // text/code
  const GREEN = '#22c55e'   // terminal prompt
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, E, B, B, B, B, B, B, B, B, E, _, _, _],
    [_, _, _, B, BAR, BAR, BAR, BAR, BAR, BAR, BAR, BAR, B, _, _, _],
    [_, _, _, B, WIN, TXT, TXT, TXT, TXT, TXT, TXT, WIN, B, _, _, _],
    [_, _, _, B, WIN, TXT, TXT, TXT, TXT, TXT, TXT, WIN, B, _, _, _],
    [_, _, _, B, BG, BG, GREEN, TXT, TXT, TXT, BG, BG, B, _, _, _],
    [_, _, _, B, BG, BG, BG, BG, BG, BG, BG, BG, B, _, _, _],
    [_, _, _, B, WIN, WIN, WIN, WIN, WIN, WIN, WIN, WIN, B, _, _, _],
    [_, _, _, B, BAR, BAR, BAR, BAR, BAR, BAR, BAR, BAR, B, _, _, _],
    [_, _, _, E, D, D, D, D, D, D, D, D, E, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Small lobster pixel art (used inside monitor lobster screen) */
const LOBSTER_PIXELS = [
  [_, _, _, _, '#CC4444', '#CC4444', _, _],
  [_, _, '#CC4444', '#CC4444', '#EE6666', '#CC4444', '#CC4444', _],
  [_, '#CC4444', '#EE6666', '#EE6666', '#CC4444', '#AA3333', '#CC4444', _],
  ['#CC4444', '#EE6666', '#CC4444', '#CC4444', '#AA3333', '#CC4444', '#EE6666', '#CC4444'],
  [_, '#CC4444', '#CC4444', '#AA3333', '#CC4444', '#EE6666', '#CC4444', _],
  [_, _, '#CC4444', '#CC4444', '#EE6666', '#CC4444', _, _],
  [_, _, _, '#CC4444', '#CC4444', _, _, _, _],
]

/** Monitor with lobster on screen: 16x16 — Apple monitor displaying lobster */
export const MONITOR_LOBSTER_SPRITE: SpriteData = (() => {
  const B = '#B8B8C0'
  const D = '#9090A0'
  const E = '#787888'
  const S = '#6A7A8E'
  const Stand = '#888898'
  const rows = [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, E, B, B, B, B, B, B, B, B, E, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, B, S, S, S, S, S, S, S, S, B, _, _, _],
    [_, _, _, E, D, D, D, D, D, D, D, D, E, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, Stand, Stand, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
  // Embed lobster in screen (rows 2-8, cols 4-11). LOBSTER_PIXELS is 8x7
  const lr0 = 2
  const lc0 = 4
  for (let r = 0; r < LOBSTER_PIXELS.length; r++) {
    for (let c = 0; c < LOBSTER_PIXELS[r].length; c++) {
      const cell = LOBSTER_PIXELS[r][c]
      if (cell !== _) rows[lr0 + r][lc0 + c] = cell
    }
  }
  return rows
})()

/** MacBook Pro: 16x16 — top-down, thin unibody, notch hint, minimal base */
export const MACBOOK_PRO_SPRITE: SpriteData = (() => {
  const B = '#C8C8D0'   // silver body
  const D = '#9898A8'   // shadow
  const S = '#5A6A82'   // screen
  const L = '#6E7E96'   // highlight
  const K = '#2C2C34'   // keyboard
  const N = '#404050'   // notch
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, N, N, _, _, _, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, B, D, _, _, _],
    [_, _, _, D, B, S, L, S, S, L, S, S, B, D, _, _],
    [_, _, _, B, B, S, S, S, S, S, S, S, B, B, _, _],
    [_, _, _, B, B, S, S, S, S, S, S, S, B, B, _, _],
    [_, _, _, D, B, B, B, B, B, B, B, B, B, D, _, _],
    [_, _, _, _, D, K, K, K, K, K, K, K, D, _, _, _],
    [_, _, _, _, D, K, K, K, K, K, K, K, D, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Mac mini: 16x16 — top-down, small square box, aluminum */
export const MAC_MINI_SPRITE: SpriteData = (() => {
  const B = '#A8A8B8'   // aluminum
  const D = '#787888'   // edge
  const L = '#C0C0D0'   // top highlight
  const V = '#6080C0'   // LED (blue)
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, B, L, B, B, L, B, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, V, B, B, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Coffee cup: 16x16 — top-down mug (desk surface) */
export const COFFEE_CUP_SPRITE: SpriteData = (() => {
  const C = '#8B4513'
  const W = '#F5DEB3'
  const D = '#654321'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, W, W, W, W, _, _, _, _, _, _],
    [_, _, _, _, _, W, W, W, W, W, W, _, _, _, _, _],
    [_, _, _, _, _, W, W, W, W, W, W, _, _, _, _, _],
    [_, _, _, _, C, W, W, W, W, W, W, C, _, _, _, _],
    [_, _, _, _, C, W, W, W, W, W, W, C, _, _, _, _],
    [_, _, _, _, C, W, W, W, W, W, W, C, _, _, _, _],
    [_, _, _, _, C, W, W, W, W, W, W, C, _, _, _, _],
    [_, _, _, _, _, C, C, C, C, C, C, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

// ── Additional furniture (desks, chairs, storage, tech, decor, wall, misc) ──

/** Standing desk: 32x32 — tall desk, 2x2 */
export const STANDING_DESK_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const L = '#A07828'
  const D = '#6B4E0A'
  const rows: string[][] = []
  for (let r = 0; r < 12; r++) rows.push(new Array(32).fill(_))
  for (let r = 12; r < 28; r++) {
    const row = [_, W, ...new Array(28).fill(r < 14 ? L : '#B8922E'), W, _] as string[]
    rows.push(row)
  }
  for (let r = 28; r < 32; r++) {
    const row = new Array(32).fill(_) as string[]
    row[6] = row[7] = row[24] = row[25] = D
    rows.push(row)
  }
  return rows
})()

/** L-shaped desk: 32x32 — corner desk 2x2 */
export const L_DESK_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const S = '#B8922E'
  const D = '#6B4E0A'
  const rows: string[][] = []
  for (let r = 0; r < 4; r++) rows.push(new Array(32).fill(_))
  for (let r = 4; r < 26; r++) {
    const row = new Array(32).fill(_) as string[]
    for (let c = 0; c < 20; c++) {
      if (c < 2 || c >= 18) row[c] = W
      else if (r >= 6 && r < 24) row[c] = S
      else row[c] = W
    }
    if (r >= 6) for (let c = 18; c < 30; c++) row[c] = c < 20 || c >= 28 ? W : S
    rows.push(row)
  }
  for (let r = 26; r < 32; r++) {
    const row = new Array(32).fill(_) as string[]
    row[2] = row[3] = row[18] = row[19] = row[28] = row[29] = D
    rows.push(row)
  }
  return rows
})()

/** Sleek modern desk: 32x32 — minimal white/gray surface, thin metal legs (2x2) */
export const DESK_SLEEK_SPRITE: SpriteData = (() => {
  const T = '#E8ECF0'   // top surface light
  const S = '#D0D6DE'   // surface mid
  const E = '#A0A8B8'   // edge
  const L = '#606878'   // metal legs
  const rows: string[][] = []
  for (let r = 0; r < 2; r++) rows.push(new Array(32).fill(_))
  rows.push([_, _, E, ...new Array(26).fill(T), E, _, _])
  for (let r = 0; r < 6; r++) {
    rows.push([_, E, S, ...new Array(26).fill(S), S, E, _])
  }
  rows.push([_, E, S, ...new Array(26).fill(T), S, E, _])
  for (let r = 0; r < 8; r++) {
    rows.push([_, E, S, ...new Array(26).fill(S), S, E, _])
  }
  rows.push([_, E, S, ...new Array(26).fill(T), S, E, _])
  for (let r = 0; r < 6; r++) {
    rows.push([_, E, S, ...new Array(26).fill(S), S, E, _])
  }
  rows.push([_, _, E, ...new Array(26).fill(E), E, _, _])
  for (let r = 0; r < 6; r++) {
    const row = new Array(32).fill(_) as string[]
    row[4] = row[5] = row[26] = row[27] = L
    rows.push(row)
  }
  rows.push(new Array(32).fill(_))
  rows.push(new Array(32).fill(_))
  return rows
})()

/** Glass desk: 32x32 — glass top with subtle tint, minimal frame (2x2) */
export const DESK_GLASS_SPRITE: SpriteData = (() => {
  const G = '#B8C8D8'   // glass tint
  const H = '#D8E4F0'   // highlight
  const F = '#708090'   // frame
  const rows: string[][] = []
  for (let r = 0; r < 2; r++) rows.push(new Array(32).fill(_))
  rows.push([_, _, F, ...new Array(26).fill(G), F, _, _])
  for (let r = 0; r < 4; r++) {
    const row = [_, F, G, ...new Array(26).fill(r === 1 ? H : G), G, F, _] as string[]
    rows.push(row)
  }
  for (let r = 0; r < 16; r++) {
    rows.push([_, F, G, ...new Array(26).fill(G), G, F, _])
  }
  for (let r = 0; r < 4; r++) {
    rows.push([_, F, G, ...new Array(26).fill(G), G, F, _])
  }
  rows.push([_, _, F, ...new Array(26).fill(F), F, _, _])
  for (let r = 0; r < 4; r++) {
    const row = new Array(32).fill(_) as string[]
    row[6] = row[7] = row[24] = row[25] = F
    rows.push(row)
  }
  rows.push(new Array(32).fill(_))
  rows.push(new Array(32).fill(_))
  return rows
})()

/** Curved modern desk: 32x32 — curved front edge, dark surface (2x2) */
export const DESK_CURVED_SPRITE: SpriteData = (() => {
  const S = '#3A4050'   // surface dark
  const L = '#4A5268'   // lighter
  const E = '#2A3040'   // edge
  const rows: string[][] = []
  for (let r = 0; r < 2; r++) rows.push(new Array(32).fill(_))
  // Curved front: rows 2-4 bulge out slightly
  rows.push([_, _, E, E, ...new Array(24).fill(S), E, E, _, _])
  rows.push([_, E, S, S, S, ...new Array(22).fill(S), S, S, S, E, _])
  rows.push([_, E, S, S, S, S, ...new Array(20).fill(S), S, S, S, S, E, _])
  rows.push([_, E, S, S, S, S, S, ...new Array(18).fill(S), S, S, S, S, S, E, _])
  for (let r = 0; r < 18; r++) {
    rows.push([_, E, S, ...new Array(28).fill(r % 4 === 0 ? L : S), S, E, _])
  }
  rows.push([_, _, E, ...new Array(28).fill(E), E, _, _])
  for (let r = 0; r < 6; r++) {
    const row = new Array(32).fill(_) as string[]
    row[5] = row[6] = row[25] = row[26] = E
    rows.push(row)
  }
  rows.push(new Array(32).fill(_))
  rows.push(new Array(32).fill(_))
  return rows
})()

// ── U-shape table (3x3), L-shape table (2x3), 3x2 table ─────────
// Tile size 16px: 3x3 = 48x48, 2x3 = 32x48, 3x2 = 48x32

/** U-shape table: 48x48 (3x3 tiles) — wood, opening at bottom center for chair */
export const U_TABLE_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const S = '#B8922E'
  const D = '#6B4E0A'
  const rows: string[][] = []
  const fillRow = (left: number, right: number, fill: string) => {
    const row = new Array(48).fill(_) as string[]
    for (let c = left; c < right; c++) row[c] = fill
    return row
  }
  for (let r = 0; r < 8; r++) rows.push(new Array(48).fill(_))
  for (let r = 0; r < 6; r++) rows.push(fillRow(2, 46, r < 2 ? W : S))
  for (let r = 0; r < 18; r++) rows.push(fillRow(2, 46, S))
  for (let r = 0; r < 8; r++) {
    const row = new Array(48).fill(_) as string[]
    for (let c = 2; c < 14; c++) row[c] = S
    for (let c = 34; c < 46; c++) row[c] = S
    if (r >= 5) row[4] = row[5] = row[12] = row[13] = row[34] = row[35] = row[42] = row[43] = D
    rows.push(row)
  }
  for (let r = 0; r < 8; r++) rows.push(new Array(48).fill(_))
  return rows
})()

/** U-shape table sleek: 48x48 — modern light gray */
export const U_TABLE_SLEEK_SPRITE: SpriteData = (() => {
  const T = '#E8ECF0'
  const S = '#D0D6DE'
  const E = '#A0A8B8'
  const L = '#606878'
  const rows: string[][] = []
  const fillRow = (left: number, right: number, fill: string) => {
    const row = new Array(48).fill(_) as string[]
    for (let c = left; c < right; c++) row[c] = fill
    return row
  }
  for (let r = 0; r < 8; r++) rows.push(new Array(48).fill(_))
  for (let r = 0; r < 6; r++) rows.push(fillRow(2, 46, r < 2 ? E : S))
  for (let r = 0; r < 18; r++) rows.push(fillRow(2, 46, S))
  for (let r = 0; r < 8; r++) {
    const row = new Array(48).fill(_) as string[]
    for (let c = 2; c < 14; c++) row[c] = S
    for (let c = 34; c < 46; c++) row[c] = S
    if (r >= 5) row[4] = row[5] = row[12] = row[13] = row[34] = row[35] = row[42] = row[43] = L
    rows.push(row)
  }
  for (let r = 0; r < 8; r++) rows.push(new Array(48).fill(_))
  return rows
})()

/** 3x2 table wood: 48x32 — rectangular conference style */
export const TABLE_3X2_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const S = '#B8922E'
  const L = '#A07828'
  const D = '#6B4E0A'
  const rows: string[][] = []
  for (let r = 0; r < 4; r++) rows.push(new Array(48).fill(_))
  for (let r = 4; r < 26; r++) {
    const row = [_, W, ...new Array(44).fill(r < 6 ? L : S), W, _] as string[]
    rows.push(row)
  }
  for (let r = 26; r < 32; r++) {
    const row = new Array(48).fill(_) as string[]
    row[4] = row[5] = row[42] = row[43] = D
    rows.push(row)
  }
  return rows
})()

/** 3x2 table sleek: 48x32 — modern */
export const TABLE_3X2_SLEEK_SPRITE: SpriteData = (() => {
  const T = '#E8ECF0'
  const S = '#D0D6DE'
  const E = '#A0A8B8'
  const L = '#606878'
  const rows: string[][] = []
  for (let r = 0; r < 4; r++) rows.push(new Array(48).fill(_))
  for (let r = 4; r < 26; r++) {
    const row = [_, E, ...new Array(44).fill(r < 6 ? E : S), E, _] as string[]
    rows.push(row)
  }
  for (let r = 26; r < 32; r++) {
    const row = new Array(48).fill(_) as string[]
    row[4] = row[5] = row[42] = row[43] = L
    rows.push(row)
  }
  return rows
})()

// ── Single (1x1) desks ──────────────────────────────────────────

/** Single desk: 16x16 — compact wood desk, 1 tile */
export const DESK_SINGLE_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const L = '#A07828'
  const S = '#B8922E'
  const D = '#6B4E0A'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, W, W, W, W, W, W, _, _, _, _, _],
    [_, _, _, _, W, L, S, S, S, S, L, W, _, _, _, _],
    [_, _, _, _, W, S, S, S, S, S, S, W, _, _, _, _],
    [_, _, _, _, W, S, S, S, S, S, S, W, _, _, _, _],
    [_, _, _, _, W, S, S, S, S, S, S, W, _, _, _, _],
    [_, _, _, _, W, S, S, S, S, S, S, W, _, _, _, _],
    [_, _, _, _, W, L, S, S, S, S, L, W, _, _, _, _],
    [_, _, _, _, _, W, W, W, W, W, W, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Single sleek desk: 16x16 — minimal white/gray, 1 tile */
export const DESK_SINGLE_SLEEK_SPRITE: SpriteData = (() => {
  const T = '#E8ECF0'
  const S = '#D0D6DE'
  const E = '#A0A8B8'
  const L = '#606878'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, E, E, E, E, _, _, _, _, _, _],
    [_, _, _, _, _, E, T, S, S, T, E, _, _, _, _, _],
    [_, _, _, _, _, E, S, S, S, S, E, _, _, _, _, _],
    [_, _, _, _, _, E, S, S, S, S, E, _, _, _, _, _],
    [_, _, _, _, _, E, S, S, S, S, E, _, _, _, _, _],
    [_, _, _, _, _, E, S, S, S, S, E, _, _, _, _, _],
    [_, _, _, _, _, E, T, S, S, T, E, _, _, _, _, _],
    [_, _, _, _, _, _, E, E, E, E, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, L, L, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, L, L, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Single glass desk: 16x16 — glass top, thin frame, 1 tile */
export const DESK_SINGLE_GLASS_SPRITE: SpriteData = (() => {
  const G = '#B8C8D8'
  const H = '#D8E4F0'
  const F = '#708090'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, F, G, H, H, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, F, F, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, F, F, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Armchair: 16x16 */
export const ARMCHAIR_SPRITE: SpriteData = (() => {
  const B = '#5C3D0A'
  const S = '#A07828'
  const D = '#6B4E0A'
  return [
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, D, D, S, S, S, S, S, S, D, D, _, _, _],
    [_, _, D, S, S, S, S, S, S, S, S, S, S, D, _, _],
    [_, D, S, S, S, S, S, S, S, S, S, S, S, S, D, _],
    [_, D, S, S, S, S, S, S, S, S, S, S, S, S, D, _],
    [D, S, S, S, S, S, S, S, S, S, S, S, S, S, S, D],
    [D, S, S, S, S, S, S, S, S, S, S, S, S, S, S, D],
    [D, S, S, S, S, S, S, S, S, S, S, S, S, S, S, D],
    [D, D, S, S, S, S, S, S, S, S, S, S, S, S, D, D],
    [_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, _, _, _, _, D, B, B, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, B, B, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Stool: 16x16 */
export const STOOL_SPRITE: SpriteData = (() => {
  const S = '#A07828'
  const D = '#6B4E0A'
  const B = '#5C3D0A'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, S, S, S, S, S, S, D, _, _, _, _],
    [_, _, _, _, D, S, S, S, S, S, S, D, _, _, _, _],
    [_, _, _, _, D, S, S, S, S, S, S, D, _, _, _, _],
    [_, _, _, _, D, S, S, S, S, S, S, D, _, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, B, B, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, B, B, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, B, B, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Modern office chair: 16x16 — sleek mesh back, minimal frame, casters */
export const CHAIR_MODERN_SPRITE: SpriteData = (() => {
  const M = '#4A5058'   // mesh back
  const F = '#2C3038'   // frame
  const S = '#E0E4E8'   // seat
  const C = '#606870'   // casters
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, F, M, M, M, M, F, _, _, _, _, _],
    [_, _, _, _, F, M, M, M, M, M, M, F, _, _, _, _],
    [_, _, _, _, F, M, M, M, M, M, M, F, _, _, _, _],
    [_, _, _, F, M, M, M, M, M, M, M, M, F, _, _, _],
    [_, _, _, F, M, M, M, M, M, M, M, M, F, _, _, _],
    [_, _, _, F, S, S, S, S, S, S, S, S, F, _, _, _],
    [_, _, _, F, S, S, S, S, S, S, S, S, F, _, _, _],
    [_, _, _, F, S, S, S, S, S, S, S, S, F, _, _, _],
    [_, _, _, _, F, F, F, F, F, F, F, F, _, _, _, _],
    [_, _, _, _, _, F, F, F, F, F, F, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, _, C, _, _, C, _, _, _, _, _, _],
    [_, _, _, _, _, C, C, _, _, C, C, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Lounge chair: 16x16 — modern curved accent chair */
export const LOUNGE_CHAIR_SPRITE: SpriteData = (() => {
  const U = '#5A6A8A'   // upholstery
  const D = '#3A4558'   // dark
  const F = '#4A5568'   // frame
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, U, U, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, U, U, U, U, D, _, _, _, _, _],
    [_, _, _, _, D, U, U, U, U, U, U, D, _, _, _, _],
    [_, _, _, _, U, U, U, U, U, U, U, U, _, _, _, _],
    [_, _, _, D, U, U, U, U, U, U, U, U, D, _, _, _],
    [_, _, _, U, U, U, U, U, U, U, U, U, U, _, _, _],
    [_, _, D, U, U, U, U, U, U, U, U, U, U, D, _, _],
    [_, _, U, U, U, U, U, U, U, U, U, U, U, U, _, _],
    [_, _, D, U, U, U, U, U, U, U, U, U, U, D, _, _],
    [_, _, _, F, F, F, F, F, F, F, F, F, F, _, _, _],
    [_, _, _, _, F, F, _, _, _, _, F, F, _, _, _, _],
    [_, _, _, _, _, F, _, _, _, _, F, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

// ── Chairs for single desks ──────────────────────────────────────

/** Single desk chair: 16x16 — compact wood chair, matches single wood desk */
export const CHAIR_SINGLE_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const B = '#5C3D0A'
  const S = '#A07828'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, B, B, B, B, B, D, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, D, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, W, W, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
    [_, _, _, _, _, D, _, _, _, _, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Sleek chair: 16x16 — minimal gray/white, matches single sleek desk */
export const CHAIR_SLEEK_SPRITE: SpriteData = (() => {
  const S = '#E0E4E8'   // seat light
  const B = '#C8CED8'   // back
  const F = '#9098A8'   // frame
  const C = '#606878'   // casters
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, F, B, B, B, B, F, _, _, _, _, _],
    [_, _, _, _, F, B, B, B, B, B, B, F, _, _, _, _],
    [_, _, _, _, F, B, B, B, B, B, B, F, _, _, _, _],
    [_, _, _, _, F, S, S, S, S, S, S, F, _, _, _, _],
    [_, _, _, _, F, S, S, S, S, S, S, F, _, _, _, _],
    [_, _, _, _, _, F, F, F, F, F, F, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, F, F, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, C, _, _, C, _, _, _, _, _, _],
    [_, _, _, _, _, C, C, _, _, C, C, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Glass desk chair: 16x16 — light frame + seat, matches single glass desk */
export const CHAIR_GLASS_SPRITE: SpriteData = (() => {
  const G = '#B8C8D8'   // seat tint
  const H = '#D0DCE8'   // highlight
  const F = '#708090'   // frame
  const C = '#607080'   // base
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, F, G, H, H, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, F, G, G, G, G, F, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, F, F, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, F, F, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, F, F, F, F, _, _, _, _, _, _],
    [_, _, _, _, _, _, F, C, C, F, _, _, _, _, _, _],
    [_, _, _, _, _, _, F, C, C, F, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Sofa: 32x16 — 2x1 two-seater couch */
export const SOFA_SPRITE: SpriteData = (() => {
  const U = '#6B7A9A'   // upholstery
  const D = '#4A5570'   // darker
  const A = '#5A6680'   // arm
  const rows: string[][] = []
  rows.push(new Array(32).fill(_))
  rows.push([_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _])
  rows.push([_, _, _, _, D, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, D, _, _, _, _])
  rows.push([_, _, _, D, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, D, _, _, _])
  rows.push([_, _, A, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, A, _, _])
  rows.push([_, _, A, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, A, _, _])
  rows.push([_, _, A, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, A, _, _])
  rows.push([_, _, A, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, A, _, _])
  rows.push([_, _, _, D, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, U, D, _, _, _, _])
  rows.push([_, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _])
  for (let r = 0; r < 5; r++) rows.push(new Array(32).fill(_))
  return rows
})()

/** Filing cabinet: 16x32 — 1x2 */
export const FILING_CABINET_SPRITE: SpriteData = (() => {
  const M = '#556677'
  const D = '#3A4555'
  const H = '#778899'
  const rows: string[][] = []
  rows.push([_, M, M, M, M, M, M, M, M, M, M, M, M, M, M, _])
  for (let r = 0; r < 6; r++) {
    rows.push([M, D, H, H, D, D, H, H, D, D, H, H, D, D, D, M])
    rows.push([M, D, D, D, D, D, D, D, D, D, D, D, D, D, D, M])
  }
  rows.push([M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M])
  for (let r = 0; r < 5; r++) {
    rows.push([M, D, H, H, D, D, H, H, D, D, H, H, D, D, D, M])
    rows.push([M, D, D, D, D, D, D, D, D, D, D, D, D, D, D, M])
  }
  rows.push([_, M, M, M, M, M, M, M, M, M, M, M, M, M, M, _])
  return rows
})()

/** Cabinet: 16x32 — 1x2 storage */
export const CABINET_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const rows: string[][] = []
  for (let r = 0; r < 2; r++) rows.push([_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _])
  for (let r = 0; r < 14; r++) {
    rows.push([W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W])
    rows.push([W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W])
  }
  rows.push([_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _])
  return rows
})()

/** Small shelf: 16x16 */
export const SHELF_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const B = '#4477AA'
  return [
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, B, B, B, B, B, B, B, B, B, B, B, B, D, W],
    [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, B, B, B, B, B, B, B, B, B, B, B, B, D, W],
    [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
    [W, D, D, D, D, D, D, D, D, D, D, D, D, D, D, W],
    [W, D, B, B, B, B, B, B, B, B, B, B, B, B, D, W],
    [_, W, W, W, W, W, W, W, W, W, W, W, W, W, W, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Phone: 16x16 — desk accessory */
export const PHONE_SPRITE: SpriteData = (() => {
  const B = '#333344'
  const S = '#6688AA'
  const D = '#222233'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, S, S, S, S, D, _, _, _, _, _],
    [_, _, _, _, _, D, S, S, S, S, D, _, _, _, _, _],
    [_, _, _, _, _, D, S, S, S, S, D, _, _, _, _, _],
    [_, _, _, _, _, D, B, B, B, B, D, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Headset: 16x16 — desk accessory */
export const HEADSET_SPRITE: SpriteData = (() => {
  const B = '#444455'
  const D = '#333344'
  const M = '#888899'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, M, M, M, M, _, _, _, _, _, _],
    [_, _, _, _, _, M, B, B, B, B, M, _, _, _, _, _],
    [_, _, _, _, M, B, B, B, B, B, B, M, M, _, _, _],
    [_, _, _, M, B, B, B, B, B, B, B, B, B, M, _, _],
    [_, _, _, M, B, B, B, B, B, B, B, B, B, M, _, _],
    [_, _, _, _, M, B, B, B, B, B, B, B, M, _, _, _],
    [_, _, _, _, _, M, D, D, D, D, M, M, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Printer: 16x16 */
export const PRINTER_SPRITE: SpriteData = (() => {
  const W = '#E8E8E8'
  const D = '#555566'
  const B = '#333344'
  const G = '#44AA44'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, D, D, D, D, D, D, D, D, D, D, _, _, _],
    [_, _, _, D, W, W, W, W, W, W, W, W, D, _, _, _],
    [_, _, _, D, W, W, W, W, W, W, W, W, D, _, _, _],
    [_, _, _, D, W, W, G, G, W, W, W, W, D, _, _, _],
    [_, _, _, D, D, D, D, D, D, D, D, D, D, _, _, _],
    [_, _, _, D, B, B, B, B, B, B, B, B, D, _, _, _],
    [_, _, _, D, B, B, B, B, B, B, B, B, D, _, _, _],
    [_, _, _, D, D, D, D, D, D, D, D, D, D, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Tablet: 16x16 — desk accessory */
export const TABLET_SPRITE: SpriteData = (() => {
  const B = '#333344'
  const S = '#6688AA'
  const D = '#222233'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, B, S, S, S, S, B, D, _, _, _, _],
    [_, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Desk clock: 16x16 */
export const CLOCK_SPRITE: SpriteData = (() => {
  const W = '#E8E8E8'
  const D = '#555566'
  const B = '#222233'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, D, W, W, W, W, W, W, D, _, _, _, _],
    [_, _, _, _, D, W, W, B, B, W, W, D, _, _, _, _],
    [_, _, _, _, D, W, W, B, B, W, W, D, _, _, _, _],
    [_, _, _, _, D, W, W, W, W, W, W, D, _, _, _, _],
    [_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _],
    [_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Picture frame: 16x16 — wall or floor */
export const PICTURE_FRAME_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const I = '#4477AA'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, D, W, W, W, W, W, W, W, W, W, W, D, _, _],
    [_, _, W, I, I, I, I, I, I, I, I, I, I, W, _, _],
    [_, _, W, I, I, I, I, I, I, I, I, I, I, W, _, _],
    [_, _, W, I, I, I, I, I, I, I, I, I, I, W, _, _],
    [_, _, W, W, W, W, W, W, W, W, W, W, W, W, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Bulletin board: 32x16 — 2x1 */
export const BULLETIN_BOARD_SPRITE: SpriteData = (() => {
  const C = '#8B6914'
  const D = '#6B4E0A'
  const P = '#CC4444'
  const Y = '#CCAA33'
  const B = '#4477AA'
  const row = (arr: string[]) => (arr.length === 32 ? arr : [...arr, ...new Array(32 - arr.length).fill(_)].slice(0, 32)) as string[]
  return [
    row([_, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _]),
    row([_, D, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, D, _, _]),
    row([D, C, C, P, P, Y, Y, C, C, B, B, C, C, C, P, P, C, C, Y, Y, B, B, C, C, C, C, P, P, C, C, D, _]),
    row([D, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, D, _]),
    row([D, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, D, _]),
    row([_, D, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, C, D, _, _]),
    row([_, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _]),
    ...Array.from({ length: 9 }, () => new Array(32).fill(_)),
  ]
})()

/** Rug: 16x16 — 1x1 floor decor */
export const RUG_SPRITE: SpriteData = (() => {
  const R = '#8B4513'
  const D = '#6B3410'
  const E = '#A0522D'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, R, R, R, R, R, R, R, R, R, R, _, _, _],
    [_, _, R, E, E, E, E, E, E, E, E, E, E, R, _, _],
    [_, _, R, E, D, D, E, E, D, D, E, E, E, R, _, _],
    [_, _, R, E, D, E, E, E, E, D, E, E, E, R, _, _],
    [_, _, R, E, E, E, E, D, E, E, E, D, E, R, _, _],
    [_, _, R, E, E, E, E, E, E, E, E, E, E, R, _, _],
    [_, _, R, E, D, E, E, E, E, E, D, E, E, R, _, _],
    [_, _, R, E, E, E, D, E, E, E, E, E, E, R, _, _],
    [_, _, R, E, E, E, E, E, E, D, E, E, E, R, _, _],
    [_, _, _, R, R, R, R, R, R, R, R, R, R, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Wall clock: 16x32 — 1x2, wall-mounted */
export const CLOCK_WALL_SPRITE: SpriteData = (() => {
  const W = '#E8E8E8'
  const D = '#555566'
  const B = '#222233'
  const rows: string[][] = []
  for (let r = 0; r < 4; r++) rows.push(new Array(16).fill(_))
  rows.push([_, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _])
  rows.push([_, _, _, _, D, W, W, W, W, D, _, _, _, _, _, _])
  rows.push([_, _, _, _, D, W, W, B, B, W, D, _, _, _, _, _])
  rows.push([_, _, _, _, D, W, W, B, B, W, D, _, _, _, _, _])
  rows.push([_, _, _, _, D, W, W, W, W, W, D, _, _, _, _, _])
  for (let r = 0; r < 2; r++) rows.push([_, _, _, _, _, D, W, W, W, W, D, _, _, _, _, _])
  rows.push([_, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _])
  for (let r = 0; r < 16; r++) rows.push(new Array(16).fill(_))
  return rows
})()

/** Poster: 16x32 — 1x2, wall-mounted */
export const POSTER_SPRITE: SpriteData = (() => {
  const F = '#4477AA'
  const D = '#2A4A77'
  const W = '#EEEEFF'
  const rows: string[][] = []
  for (let r = 0; r < 2; r++) rows.push(new Array(16).fill(_))
  rows.push([_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _])
  for (let r = 0; r < 10; r++) {
    rows.push([D, F, W, W, W, W, W, W, W, W, W, W, W, W, F, D])
    rows.push([D, F, W, W, W, W, W, W, W, W, W, W, W, W, F, D])
  }
  rows.push([_, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _])
  for (let r = 0; r < 8; r++) rows.push(new Array(16).fill(_))
  return rows
})()

/** Wall shelf: 16x16 — wall-mounted */
export const SHELF_WALL_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const B = '#4477AA'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, W, W, W, W, W, W, W, W, W, W, W, W, _, _],
    [_, _, W, D, D, D, D, D, D, D, D, D, D, W, _, _],
    [_, _, W, D, B, B, B, B, B, B, B, B, D, W, _, _],
    [_, _, W, W, W, W, W, W, W, W, W, W, W, W, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Trash bin: 16x16 */
export const TRASH_BIN_SPRITE: SpriteData = (() => {
  const G = '#556666'
  const D = '#334444'
  const L = '#778888'
  return [
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, D, L, G, G, G, G, L, D, _, _, _, _],
    [_, _, _, _, D, L, G, G, G, G, L, D, _, _, _, _],
    [_, _, _, _, D, L, G, G, G, G, L, D, _, _, _, _],
    [_, _, _, _, D, L, G, G, G, G, L, D, _, _, _, _],
    [_, _, _, _, D, L, L, L, L, L, L, D, _, _, _, _],
    [_, _, _, _, _, D, D, D, D, D, D, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Coat stand: 16x32 — 1x2 */
export const COAT_STAND_SPRITE: SpriteData = (() => {
  const W = '#8B6914'
  const D = '#6B4E0A'
  const C = '#4477AA'
  const empty = () => new Array(16).fill(_) as string[]
  const rows: string[][] = []
  rows.push(empty(), empty())
  rows.push([_, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _])
  rows.push([_, _, _, _, _, D, W, W, D, _, _, _, _, _, _, _])
  rows.push([_, _, _, _, _, D, W, W, D, _, _, _, _, _, _, _])
  for (let r = 0; r < 6; r++) rows.push([_, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _])
  rows.push([_, _, _, _, _, _, D, D, _, _, _, C, C, _, _, _, _])
  rows.push([_, _, _, _, _, _, D, D, _, _, C, C, C, C, _, _, _])
  rows.push([_, _, _, _, _, _, D, D, _, _, _, D, D, _, _, _, _])
  for (let r = 0; r < 16; r++) rows.push([_, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _])
  while (rows.length < 32) rows.push(empty())
  return rows.slice(0, 32)
})()

// ── Speech Bubble Sprites ───────────────────────────────────────

/** Permission bubble: white square with "..." in amber, and a tail pointer (11x13) */
export const BUBBLE_PERMISSION_SPRITE: SpriteData = (() => {
  const B = '#555566' // border
  const F = '#EEEEFF' // fill
  const A = '#CCA700' // amber dots
  return [
    [B, B, B, B, B, B, B, B, B, B, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, A, F, A, F, A, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, B, B, B, B, B, B, B, B, B, B],
    [_, _, _, _, B, B, B, _, _, _, _],
    [_, _, _, _, _, B, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _],
  ]
})()

/** Waiting bubble: white square with green checkmark, and a tail pointer (11x13) */
export const BUBBLE_WAITING_SPRITE: SpriteData = (() => {
  const B = '#555566' // border
  const F = '#EEEEFF' // fill
  const G = '#44BB66' // green check
  return [
    [_, B, B, B, B, B, B, B, B, B, _],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, G, F, B],
    [B, F, F, F, F, F, F, G, F, F, B],
    [B, F, F, G, F, F, G, F, F, F, B],
    [B, F, F, F, G, G, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [B, F, F, F, F, F, F, F, F, F, B],
    [_, B, B, B, B, B, B, B, B, B, _],
    [_, _, _, _, B, B, B, _, _, _, _],
    [_, _, _, _, _, B, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _],
  ]
})()

// ── Character Sprites ───────────────────────────────────────────
// 16x24 characters with palette substitution

/** Palette colors for 6 distinct agent characters */
export const CHARACTER_PALETTES = [
  { skin: '#FFCC99', shirt: '#4488CC', pants: '#334466', hair: '#553322', shoes: '#222222' },
  { skin: '#FFCC99', shirt: '#CC4444', pants: '#333333', hair: '#FFD700', shoes: '#222222' },
  { skin: '#DEB887', shirt: '#44AA66', pants: '#334444', hair: '#222222', shoes: '#333333' },
  { skin: '#FFCC99', shirt: '#AA55CC', pants: '#443355', hair: '#AA4422', shoes: '#222222' },
  { skin: '#DEB887', shirt: '#CCAA33', pants: '#444433', hair: '#553322', shoes: '#333333' },
  { skin: '#FFCC99', shirt: '#FF8844', pants: '#443322', hair: '#111111', shoes: '#222222' },
] as const

interface CharPalette {
  skin: string
  shirt: string
  pants: string
  hair: string
  shoes: string
}

// Template keys for character pixel data
const H = 'hair'
const K = 'skin'
const S = 'shirt'
const P = 'pants'
const O = 'shoes'
const E = '#FFFFFF' // eyes

type TemplateCell = typeof H | typeof K | typeof S | typeof P | typeof O | typeof E | typeof _

/** Resolve a template to SpriteData using a palette */
function resolveTemplate(template: TemplateCell[][], palette: CharPalette): SpriteData {
  return template.map((row) =>
    row.map((cell) => {
      if (cell === _) return ''
      if (cell === E) return E
      if (cell === H) return palette.hair
      if (cell === K) return palette.skin
      if (cell === S) return palette.shirt
      if (cell === P) return palette.pants
      if (cell === O) return palette.shoes
      return cell
    }),
  )
}

/** Flip a template horizontally (for generating left sprites from right) */
function flipHorizontal(template: TemplateCell[][]): TemplateCell[][] {
  return template.map((row) => [...row].reverse())
}

// ════════════════════════════════════════════════════════════════
// DOWN-FACING SPRITES
// ════════════════════════════════════════════════════════════════

// Walk down: 4 frames (1, 2=standing, 3=mirror legs, 2 again)
const CHAR_WALK_DOWN_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, O, O, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, O, O, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_DOWN_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_DOWN_3: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Down typing: front-facing sitting, arms on keyboard
const CHAR_DOWN_TYPE_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, K, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_DOWN_TYPE_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, _, K, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Down reading: front-facing sitting, arms at sides, looking at screen
const CHAR_DOWN_READ_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_DOWN_READ_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, E, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// ════════════════════════════════════════════════════════════════
// UP-FACING SPRITES (back of head, no face)
// ════════════════════════════════════════════════════════════════

// Walk up: back view, legs alternate
const CHAR_WALK_UP_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, P, P, _, _, _, _, P, P, _, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_UP_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_UP_3: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, O, O, _, _, _, _, _, _, P, P, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, O, O, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Up typing: back view, arms out to keyboard
const CHAR_UP_TYPE_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, K, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_UP_TYPE_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, K, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, _, K, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Up reading: back view, arms at sides
const CHAR_UP_READ_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_UP_READ_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, _, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, H, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, K, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, S, S, S, S, S, S, S, S, _, _, _, _],
  [_, _, _, _, K, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, P, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// ════════════════════════════════════════════════════════════════
// RIGHT-FACING SPRITES (side profile, one eye visible)
// Left sprites are generated by flipHorizontal()
// ════════════════════════════════════════════════════════════════

// Right walk: side view, legs step
const CHAR_WALK_RIGHT_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, _, P, P, _, _, _, P, P, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, O, O, _, _, _, _, O, O, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_RIGHT_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_WALK_RIGHT_3: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, P, P, P, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, O, O, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Right typing: side profile sitting, one arm on keyboard
const CHAR_RIGHT_TYPE_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, K, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_RIGHT_TYPE_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, K, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, _, _, K, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// Right reading: side sitting, arms at side
const CHAR_RIGHT_READ_1: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

const CHAR_RIGHT_READ_2: TemplateCell[][] = [
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, H, H, H, H, H, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, E, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, K, _, _, _, _, _],
  [_, _, _, _, _, _, K, K, K, K, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, S, S, S, S, S, S, _, _, _, _, _],
  [_, _, _, _, _, K, S, S, S, S, K, _, _, _, _, _],
  [_, _, _, _, _, _, S, S, S, S, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, P, P, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, P, P, _, _, _, _, _, _],
  [_, _, _, _, _, _, P, P, _, P, P, _, _, _, _, _],
  [_, _, _, _, _, _, O, O, _, O, O, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
]

// ════════════════════════════════════════════════════════════════
// Template export (for export-characters script)
// ════════════════════════════════════════════════════════════════

/** All character templates grouped by direction, for use by the export script.
 *  Frame order per direction: walk1, walk2, walk3, type1, type2, read1, read2 */
export const CHARACTER_TEMPLATES = {
  down: [
    CHAR_WALK_DOWN_1, CHAR_WALK_DOWN_2, CHAR_WALK_DOWN_3,
    CHAR_DOWN_TYPE_1, CHAR_DOWN_TYPE_2,
    CHAR_DOWN_READ_1, CHAR_DOWN_READ_2,
  ],
  up: [
    CHAR_WALK_UP_1, CHAR_WALK_UP_2, CHAR_WALK_UP_3,
    CHAR_UP_TYPE_1, CHAR_UP_TYPE_2,
    CHAR_UP_READ_1, CHAR_UP_READ_2,
  ],
  right: [
    CHAR_WALK_RIGHT_1, CHAR_WALK_RIGHT_2, CHAR_WALK_RIGHT_3,
    CHAR_RIGHT_TYPE_1, CHAR_RIGHT_TYPE_2,
    CHAR_RIGHT_READ_1, CHAR_RIGHT_READ_2,
  ],
} as const

// ════════════════════════════════════════════════════════════════
// Loaded character sprites (from PNG assets)
// ════════════════════════════════════════════════════════════════

interface LoadedCharacterData {
  down: SpriteData[]
  up: SpriteData[]
  right: SpriteData[]
}

let loadedCharacters: LoadedCharacterData[] | null = null

/** Set pre-colored character sprites loaded from PNG assets. Call this when characterSpritesLoaded message arrives. */
export function setCharacterTemplates(data: LoadedCharacterData[]): void {
  loadedCharacters = data
  // Clear cache so sprites are rebuilt from loaded data
  spriteCache.clear()
}

/** Flip a SpriteData horizontally (for generating left sprites from right) */
function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse())
}

// ════════════════════════════════════════════════════════════════
// Sprite resolution + caching
// ════════════════════════════════════════════════════════════════

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>
  typing: Record<Direction, [SpriteData, SpriteData]>
  reading: Record<Direction, [SpriteData, SpriteData]>
}

const spriteCache = new Map<string, CharacterSprites>()

/** Apply hue shift to every sprite in a CharacterSprites set */
function hueShiftSprites(sprites: CharacterSprites, hueShift: number): CharacterSprites {
  const color: FloorColor = { h: hueShift, s: 0, b: 0, c: 0 }
  const shift = (s: SpriteData) => adjustSprite(s, color)
  const shiftWalk = (arr: [SpriteData, SpriteData, SpriteData, SpriteData]): [SpriteData, SpriteData, SpriteData, SpriteData] =>
    [shift(arr[0]), shift(arr[1]), shift(arr[2]), shift(arr[3])]
  const shiftPair = (arr: [SpriteData, SpriteData]): [SpriteData, SpriteData] =>
    [shift(arr[0]), shift(arr[1])]
  return {
    walk: {
      [Dir.DOWN]: shiftWalk(sprites.walk[Dir.DOWN]),
      [Dir.UP]: shiftWalk(sprites.walk[Dir.UP]),
      [Dir.RIGHT]: shiftWalk(sprites.walk[Dir.RIGHT]),
      [Dir.LEFT]: shiftWalk(sprites.walk[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>,
    typing: {
      [Dir.DOWN]: shiftPair(sprites.typing[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.typing[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.typing[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.typing[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
    reading: {
      [Dir.DOWN]: shiftPair(sprites.reading[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.reading[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.reading[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.reading[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
  }
}

export function getCharacterSprites(paletteIndex: number, hueShift = 0): CharacterSprites {
  const cacheKey = `${paletteIndex}:${hueShift}`
  const cached = spriteCache.get(cacheKey)
  if (cached) return cached

  let sprites: CharacterSprites

  if (loadedCharacters) {
    // Use pre-colored character sprites directly (no palette swapping)
    const char = loadedCharacters[paletteIndex % loadedCharacters.length]
    const d = char.down
    const u = char.up
    const rt = char.right
    const flip = flipSpriteHorizontal

    sprites = {
      walk: {
        [Dir.DOWN]: [d[0], d[1], d[2], d[1]],
        [Dir.UP]: [u[0], u[1], u[2], u[1]],
        [Dir.RIGHT]: [rt[0], rt[1], rt[2], rt[1]],
        [Dir.LEFT]: [flip(rt[0]), flip(rt[1]), flip(rt[2]), flip(rt[1])],
      },
      typing: {
        [Dir.DOWN]: [d[3], d[4]],
        [Dir.UP]: [u[3], u[4]],
        [Dir.RIGHT]: [rt[3], rt[4]],
        [Dir.LEFT]: [flip(rt[3]), flip(rt[4])],
      },
      reading: {
        [Dir.DOWN]: [d[5], d[6]],
        [Dir.UP]: [u[5], u[6]],
        [Dir.RIGHT]: [rt[5], rt[6]],
        [Dir.LEFT]: [flip(rt[5]), flip(rt[6])],
      },
    }
  } else {
    // Fallback: use hardcoded templates with palette swapping
    const pal = CHARACTER_PALETTES[paletteIndex % CHARACTER_PALETTES.length]
    const r = (t: TemplateCell[][]) => resolveTemplate(t, pal)
    const rf = (t: TemplateCell[][]) => resolveTemplate(flipHorizontal(t), pal)

    sprites = {
      walk: {
        [Dir.DOWN]: [r(CHAR_WALK_DOWN_1), r(CHAR_WALK_DOWN_2), r(CHAR_WALK_DOWN_3), r(CHAR_WALK_DOWN_2)],
        [Dir.UP]: [r(CHAR_WALK_UP_1), r(CHAR_WALK_UP_2), r(CHAR_WALK_UP_3), r(CHAR_WALK_UP_2)],
        [Dir.RIGHT]: [r(CHAR_WALK_RIGHT_1), r(CHAR_WALK_RIGHT_2), r(CHAR_WALK_RIGHT_3), r(CHAR_WALK_RIGHT_2)],
        [Dir.LEFT]: [rf(CHAR_WALK_RIGHT_1), rf(CHAR_WALK_RIGHT_2), rf(CHAR_WALK_RIGHT_3), rf(CHAR_WALK_RIGHT_2)],
      },
      typing: {
        [Dir.DOWN]: [r(CHAR_DOWN_TYPE_1), r(CHAR_DOWN_TYPE_2)],
        [Dir.UP]: [r(CHAR_UP_TYPE_1), r(CHAR_UP_TYPE_2)],
        [Dir.RIGHT]: [r(CHAR_RIGHT_TYPE_1), r(CHAR_RIGHT_TYPE_2)],
        [Dir.LEFT]: [rf(CHAR_RIGHT_TYPE_1), rf(CHAR_RIGHT_TYPE_2)],
      },
      reading: {
        [Dir.DOWN]: [r(CHAR_DOWN_READ_1), r(CHAR_DOWN_READ_2)],
        [Dir.UP]: [r(CHAR_UP_READ_1), r(CHAR_UP_READ_2)],
        [Dir.RIGHT]: [r(CHAR_RIGHT_READ_1), r(CHAR_RIGHT_READ_2)],
        [Dir.LEFT]: [rf(CHAR_RIGHT_READ_1), rf(CHAR_RIGHT_READ_2)],
      },
    }
  }

  // Apply hue shift if non-zero
  if (hueShift !== 0) {
    sprites = hueShiftSprites(sprites, hueShift)
  }

  spriteCache.set(cacheKey, sprites)
  return sprites
}
