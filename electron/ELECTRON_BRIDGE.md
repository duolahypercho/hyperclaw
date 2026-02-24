# Electron ↔ Renderer bridge

## How it connects

1. **main.js** creates a `BrowserWindow` with `webPreferences.preload: path.join(__dirname, "preload.js")`.
2. **preload.js** runs in the renderer before the page loads and exposes `window.electronAPI` via `contextBridge.exposeInMainWorld("electronAPI", { ... })`.
3. The **page** (localhost or remote) loads. Its JS (e.g. `bridgeInvoke` in `lib/hyperclaw-bridge-client.ts`) checks `window.electronAPI?.hyperClawBridge?.invoke`.
4. If present, **bridgeInvoke** calls `electronAPI.hyperClawBridge.invoke(action, body)` → preload forwards to **main process** via `ipcRenderer.invoke("hyperclaw:bridge-invoke", { action, ...body })`.
5. **main.js** handles it in `ipcMain.handle("hyperclaw:bridge-invoke", ...)` and runs the switch cases (e.g. `get-employee-status`, `list-openclaw-docs`).

So: **renderer** → preload (IPC) → **main.js** bridge handler. The Next.js API route `pages/api/hyperclaw-bridge.ts` is **not** used when running in Electron; it is only used when the app runs in a normal browser (no Electron).

## Why bridge might “not run”

- **Preload not loaded**  
  If the window was created without the preload, or the preload path is wrong (e.g. wrong `__dirname` when packaged), `window.electronAPI` is undefined. Then `bridgeInvoke` falls back to `fetch("/api/hyperclaw-bridge")`. So you’d see network requests to the API instead of IPC.

- **Wrong URL / no server**  
  If the window loads `http://localhost:1000/dashboard` but Next.js isn’t running on port 1000, the page may not load or may be cached. If it loads a **remote** URL (e.g. `https://copanion.hypercho.com`), the JS is from that server; preload still runs in that window, so `electronAPI` should still be there.

- **Packaged app using old main**  
  If you run a built app (e.g. .app or .exe), it uses the main/preload that were bundled at build time. Edit `electron/main.js` and run from source (e.g. `npm run electron:dev`) to test changes without rebuilding.

## Debugging: why main.js logs aren't running

**1. Bridge log file**  
Open `~/.openclaw/copanion-bridge.log`. On startup, main.js now writes:
- `Copanion main process started`
- `main.js createWindow: preload=/path/to/preload.js exists=true|false`
Every bridge-invoke is then logged as `bridge-invoke action=...`. Unknown actions are logged with the error.
- **File missing or empty** → You're likely not running the Electron app (e.g. only opening the site in Chrome).
- **Startup lines present but no bridge-invoke** → Renderer is using fetch, not IPC: preload didn't expose `electronAPI`. In the Electron window open DevTools → Console; you should see either `[Copanion] Bridge: using IPC` or `[Copanion] Bridge: using fetch`. If "using fetch", preload path may be wrong (check log for `exists=false`).

- **Main process stdout**  
  `console.log` in main.js only appears if Electron was started from a terminal (e.g. `npm run electron:dev`). If you launch the app from the Dock/Spotlight, there is no terminal and you won’t see those logs.

- **Renderer**  
  In DevTools (e.g. when `openDevTools()` is used), check for JS errors and confirm `window.electronAPI` and `window.electronAPI.hyperClawBridge` exist.

## Parity with API route

`electron/main.js` bridge-invoke handler should support the same actions as `pages/api/hyperclaw-bridge.ts` so that Docs, Pixel Office, OpenClaw, etc. work the same in Electron and in the browser. When adding a new action to the API route, add the same case and logic to main.js.
