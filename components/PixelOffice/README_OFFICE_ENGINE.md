# Pixel Office Engine — Layout & Assets

The Pixel Office canvas is used by the main Hyperclaw app. Layout and assets are configurable via layout source, asset base path, and optional persistence callbacks.

---

## Electron app: how others can access or edit (e.g. with Claude Code)

When you **deploy as an Electron app**, layout and seat assignments are stored in a **known folder** so anyone (or their Claude Code / Openclaw scripts) can read and edit the same files the app uses.

### Where the app stores data

| Path | Purpose |
|------|--------|
| **`~/.hyperclaw/office/layout.json`** | Office layout (grid, tiles, furniture). Edit this to change the office; the app loads it on next launch (or after reload). |
| **`~/.hyperclaw/office/seats.json`** | Agent-to-seat assignments. Optional; the app writes this when you assign agents to desks. |

- **macOS:** `/Users/<you>/.hyperclaw/office/`
- **Windows:** `C:\Users\<you>\.hyperclaw\office\`
- **Linux:** `~/.hyperclaw/office/`

### How to edit with Claude Code (or any editor)

1. **Layout**  
   Open `~/.hyperclaw/office/layout.json` in your editor or have Claude Code read/edit it. The format is the same as the in-app editor’s JSON (e.g. `version: 1`, `cols`, `rows`, `tiles`, `furniture`, `tileColors`). Save the file; the next time you open the Pixel Office in the app (or refresh the app), it will load this layout.

2. **Seats**  
   Optional. If you have `seats.json`, you can adjust which agent (by id) is assigned to which seat (by `seatId`). The app overwrites this file when you change assignments in the UI.

### Summary

- **Access:** Read/write `~/.hyperclaw/office/layout.json` and optionally `seats.json`.
- **Edit:** Use any editor or Claude Code; the app uses these files when running as Electron.
- **Web (non-Electron):** The app uses `localStorage` and does not use these files.

---

## What lives where

| Layer | Role | Location |
|-------|------|----------|
| **Engine** | Canvas, state, editing, rendering | `office/*` |
| **Config** | Layout source, asset path, save callbacks | `officeEngineConfig.ts` |
| **Agents** | Who the “characters” are | `useHyperclawOffice()` → bridge |
| **Persistence** | Where layout/seats are stored | localStorage + Electron `~/.hyperclaw/office/` |

## Using the engine in your own app

1. **Create an `OfficeState`** (one per office instance, e.g. in a ref or context).

2. **Provide an `OfficeEngineConfig`** and call `useOfficeEngine`:

```ts
import { useOfficeEngine } from "./officeEngineConfig";
import type { OfficeEngineConfig } from "./officeEngineConfig";
import type { OfficeLayout } from "./office/types";

const config: OfficeEngineConfig = {
  assetBasePath: "https://your-cdn.com/office-assets", // or "/pixel-office"
  getInitialLayout: async () => {
    const res = await fetch("/api/office/layout");
    return res.ok ? res.json() : getPresetById("cozy") ?? createDefaultLayout();
  },
  onSaveLayout: (layout) => {
    fetch("/api/office/layout", { method: "POST", body: JSON.stringify(layout) });
  },
  onSaveAgentSeats: (seats) => {
    yourExtensionHost?.postMessage({ type: "saveAgentSeats", seats });
  },
};

const { layoutReady } = useOfficeEngine(getOfficeState, config, onLayoutLoaded);
```

3. **Sync your agents** into the same `OfficeState` (add/remove characters, set status) when `layoutReady` is true.

4. **Render** `OfficeCanvas` with that state and pass `onSaveAgentSeats` so seat assignments are persisted by your host.

## Asset layout

The engine expects assets under `assetBasePath`:

- `walls.png` — 64×128, 16 wall sprites (16×32 each)
- `floors.png` — 112×16, 7 floor sprites (16×16 each)
- `characters/char_0.png` … `char_5.png` — 112×96 character sheets (7×16px frames, 3 rows×32px)

You can ship the same pixel-art assets or replace them with your own in this format.

## Types

- **`OfficeLayout`** — `office/types`
- **`OfficeEngineConfig`**, **`useOfficeEngine`** — `officeEngineConfig.ts`
- **`OfficeCanvas`** — `office/components/OfficeCanvas.tsx` (optional prop `onSaveAgentSeats`)

Hyperclaw uses this same engine with a config that reads/writes layout from localStorage and loads assets from `/pixel-office`.
