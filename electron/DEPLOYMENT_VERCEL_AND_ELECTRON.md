# Host on Vercel + Users Use Electron App

Yes. You host the product on Vercel; users run the Electron app, which **loads your domain** inside the window. Local data and OpenClaw stay on the user’s machine.

## How does the app use main.js?

**main.js (and preload.js) are bundled inside the Electron app** that the user installs. They run on the **user’s computer**, not on Vercel.

When the user opens the Copanion app:

1. **Electron starts** on the user’s PC and runs **main.js** (the `"main"` entry in `electron/package.json`). So **main.js is always running locally** as the “main process”.

2. **main.js** creates a window and tells Electron to use **preload.js** for that window (`webPreferences.preload`). preload.js is also bundled in the app; it runs in the “renderer” process for that window **before** any web page loads.

3. **main.js** then loads a URL in that window. In remote mode that URL is your Vercel domain (e.g. `https://copanion.hypercho.com/dashboard`). So the **content** (HTML, JS, CSS) comes from Vercel, but the **window** still belongs to Electron and already has preload run.

4. **preload.js** has exposed `window.electronAPI` (and `hyperClawBridge.invoke`) in that window. The script that Vercel sends runs in the **same** window, so it sees `window.electronAPI` and can call it.

5. When the Vercel page runs `bridgeInvoke("list-openclaw-docs", {})` it calls `window.electronAPI.hyperClawBridge.invoke(...)`. That goes through **preload** → `ipcRenderer.invoke("hyperclaw:bridge-invoke", ...)` → **main process**, i.e. **main.js** on the user’s machine. main.js handles it in `ipcMain.handle("hyperclaw:bridge-invoke", ...)` and does the real work (read `~/.openclaw`, run CLI, etc.).

So: **Vercel only serves the UI**. The process that owns the app and runs **main.js** is always the user’s installed Electron app. The window “shows” your site, but **IPC connects that page to the local main.js**.

```
User's PC
├── Electron main process  ← main.js (bundled in app, runs on their machine)
│   └── ipcMain.handle("hyperclaw:bridge-invoke", ...)
│
└── Window (renderer)
    ├── preload.js        ← runs first, exposes window.electronAPI (bundled in app)
    └── Page from Vercel  ← your UI; calls electronAPI → IPC → main.js
```

## How it works (deployment flow)

```
┌─────────────────────────────────────────────────────────────────┐
│  You                                                             │
│  1. Deploy Next.js app to Vercel  →  https://copanion.hypercho.com
│  2. Build Electron app in "remote" mode  →  Copanion-Setup-Remote.exe / .app
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  User                                                            │
│  1. Installs and opens the Electron app                          │
│  2. The app window loads: https://copanion.hypercho.com/dashboard │
│     (same UI they’d see in Chrome, but inside the app)            │
│  3. When they use Docs, Pixel Office, OpenClaw, etc.:            │
│     - The page (from your domain) runs bridgeInvoke(...)         │
│     - Preload (bundled in the app) exposes electronAPI           │
│     - IPC sends the action to the Electron main process          │
│     - main.js runs on the user’s PC (reads ~/.openclaw, CLI…)    │
└─────────────────────────────────────────────────────────────────┘
```

So:

- **Vercel** serves the frontend (and API routes only when someone uses the site in a **browser**).
- **Electron** loads that frontend from your URL but runs the **bridge** (Docs, OpenClaw, files, etc.) **locally** on the user’s machine. Your server never sees `~/.openclaw` or the OpenClaw CLI.

## Two modes

| Mode    | Who uses it        | Where the window loads              | Bridge runs where      |
|---------|--------------------|-------------------------------------|------------------------|
| **remote** | End users (your build) | Your domain (e.g. Vercel)           | User’s PC (main.js)    |
| **local**  | You / dev / self‑host | http://localhost:1000                | Same PC (main.js)      |

- **Remote**: User doesn’t run Next.js. They only need the Electron app and the internet. Your app runs on Vercel; the app just points the window at it.
- **Local**: You (or the user) run `npm run dev` or `npm run start`; the Electron window points at localhost.

## Setup (Vercel + Electron for users)

1. **Deploy to Vercel**  
   Connect your repo and deploy the Next.js app. Note the URL (e.g. `https://copanion.hypercho.com`).

2. **Point Electron at that URL**  
   In `electron/app-config.json` (or whatever sets config for the build), set:
   - `mode`: `"remote"`
   - `remoteUrl`: your Vercel URL (e.g. `"https://copanion.hypercho.com"`)

3. **Build the Electron app in remote mode**  
   From the repo root (or as in your scripts):
   - Mac: `npm run electron:build:mac:remote`
   - Windows: `npm run electron:build:win:remote`  
   This uses `scripts/set-config.js` to set `mode: "remote"` and then builds. The built app will open `remoteUrl/dashboard` (e.g. your Vercel app).

4. **Ship the built app**  
   Distribute the generated installer (.app, .dmg, .exe, etc.). Users install and open it; the window will load your Vercel site and the bridge will run on their machine.

## Summary

- You host the product on **Vercel**.
- Users use the **Electron app** to “connect” to your domain = the app’s window loads your Vercel URL.
- All bridge/OpenClaw/file operations run **on the user’s computer** via the bundled main process; Vercel only serves the UI (and API when the site is used in a normal browser).
