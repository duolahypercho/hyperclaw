# Electron Setup for Hypercho Copanion

## How Electron Works with Your Next.js App

### Architecture Overview

```
┌─────────────────────────────────────────┐
│         Electron Application            │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │   Main Process (Node.js)          │  │
│  │   - Controls app lifecycle         │  │
│  │   - Creates BrowserWindow          │  │
│  │   - Handles native OS APIs         │  │
│  │   - Starts Next.js server          │  │
│  └───────────────────────────────────┘  │
│              │                           │
│              │ Creates & Controls         │
│              ▼                           │
│  ┌───────────────────────────────────┐  │
│  │   Renderer Process (Chromium)     │  │
│  │   ┌─────────────────────────────┐ │  │
│  │   │   Your Next.js App          │ │  │
│  │   │   Running on localhost:1000 │ │  │
│  │   │   - All your React components│ │  │
│  │   │   - Your OS features         │ │  │
│  │   │   - Your UI/UX               │ │  │
│  │   └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Key Concepts

1. **Main Process** (`electron/main.js`)

   - Single instance per app
   - Full Node.js access
   - Creates and manages windows
   - Can access file system, native APIs, etc.

2. **Renderer Process** (Your Next.js app)

   - Each window is a separate renderer
   - Runs in Chromium (like a browser)
   - Your React/Next.js code runs here
   - Limited Node.js access (for security)

3. **Preload Script** (`electron/preload.js`)
   - Bridge between main and renderer
   - Runs before your Next.js app loads
   - Safely exposes Electron APIs to your web app
   - Uses `contextBridge` for security

### How It Works Step-by-Step

1. **User launches Electron app**

   ```bash
   npm run electron
   ```

2. **Main process starts** (`main.js`)

   - Electron app initializes
   - Checks if Next.js server is running
   - If not, spawns Next.js server process

3. **Next.js server starts**

   - Development: `npm run dev` (port 1000)
   - Production: `npm run start` (port 1000)

4. **Main process creates window**

   - Creates BrowserWindow instance
   - Loads preload script
   - Points window to `http://localhost:1000`

5. **Your Next.js app loads**

   - Chromium renders your React app
   - All your components work normally
   - Can communicate with Electron via `window.electronAPI`

6. **User interacts with app**
   - All interactions happen in renderer (your Next.js app)
   - If native features needed, use `window.electronAPI`
   - Main process handles native operations

### Communication Flow

```
Next.js App (Renderer)          Preload Script          Main Process
     │                              │                        │
     │  window.electronAPI          │                        │
     │  .showNotification()         │                        │
     ├──────────────────────────────>│                        │
     │                              │  ipcRenderer.invoke()  │
     │                              ├────────────────────────>
     │                              │                        │
     │                              │                        │  Native API
     │                              │                        │  (OS Notification)
     │                              │                        │
     │                              │  Response              │
     │                              │<────────────────────────┤
     │  Promise resolves            │                        │
     │<──────────────────────────────┤                        │
```

### Running the hyperclaw-bridge on your local machine (no Vercel)

The `/api/hyperclaw-bridge` API uses the local filesystem (`~/.hyperclaw`, `~/.openclaw`) and local commands. To run it on your machine and avoid Vercel serverless usage:

1. **Use local mode** – In `electron/app-config.json` set `"mode": "local"` (this is the default).
2. **Start Next.js locally** so the bridge runs on your machine:
   ```bash
   # Terminal 1: Next.js (dev or production)
   npm run dev
   # or: npm run build && npm run start
   ```
3. **Start Electron** – it will load `http://localhost:1000` and all bridge requests stay local:
   ```bash
   # Terminal 2
   npm run electron:dev
   ```

Result: Every `fetch("/api/hyperclaw-bridge")` goes to your local Next.js server. No Vercel invocations, and the bridge has access to your real `~/.hyperclaw` and local processes.

**Production downloads (remote mode):** If you ship the app in **remote** mode (e.g. `npm run electron:build:mac:remote`), the UI loads from Vercel but **all** bridge calls (Crons, Memory, Logs, Pixel Office, OpenClaw, tasks, daily summaries) go through Electron IPC and run on the user's Mac. Nothing hits `/api/hyperclaw-bridge` on Vercel, so there is no serverless cost and the bridge has access to the user's `~/.hyperclaw` and local OpenClaw. The frontend uses `lib/hyperclaw-bridge-client.ts`, which calls `hyperClawBridge.invoke(action, body)` in Electron and `fetch("/api/hyperclaw-bridge")` only in the browser.

### Setup Instructions

1. **Install Electron dependencies:**

   ```bash
   cd electron
   npm install electron electron-builder cross-env --save-dev
   ```

2. **Install in root (if needed):**

   ```bash
   npm install --save-dev electron electron-builder cross-env
   ```

3. **Run in development:**

   ```bash
   # Terminal 1: Start Next.js dev server (required for local mode / bridge)
   npm run dev

   # Terminal 2: Start Electron
   npm run electron:dev
   ```

4. **Build for production:**

   ```bash
   # Build Next.js app first
   npm run build

   # Then build Electron app
   npm run electron:build:win  # For Windows
   ```

### Advantages for Your Hypercho OS

1. **Native Feel**

   - App appears in taskbar
   - System notifications
   - File system access
   - Native menus

2. **Offline Capability**

   - Can work offline (with proper setup)
   - Local data storage
   - No browser address bar

3. **Better Performance**

   - No browser overhead
   - Direct OS integration
   - Faster startup (after first load)

4. **Distribution**
   - Single executable file
   - Installer packages (.exe, .dmg)
   - Auto-updates possible

### Using Electron APIs in Your Next.js App

In any React component:

```typescript
// Check if running in Electron
const isElectron = typeof window !== "undefined" && window.electronAPI;

// Use Electron APIs
if (isElectron) {
  // Show native notification
  window.electronAPI.showNotification("Title", "Message");

  // Get platform
  const platform = window.electronAPI.getPlatform();

  // Window controls
  window.electronAPI.minimizeWindow();
}
```

### TypeScript Support

Add to your `types/electron.d.ts`:

```typescript
interface Window {
  electronAPI?: {
    getVersion: () => Promise<string>;
    getPlatform: () => string;
    minimizeWindow: () => Promise<void>;
    maximizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
    showNotification: (title: string, body: string) => Promise<void>;
  };
}
```

### Production Build Process

1. **Next.js builds** → Creates `.next` folder
2. **Electron Builder packages:**
   - Copies `.next` folder
   - Includes Node.js runtime
   - Includes Chromium
   - Creates installer
3. **Result:** Single `.exe` file (Windows) or `.dmg` (Mac)

### Opening the Mac app after unzip (local build)

macOS quarantines unsigned apps. If the unzipped **Copanion.app** won’t open:

**Option 1 – Terminal (recommended):**
```bash
xattr -cr /path/to/Copanion.app
open /path/to/Copanion.app
```

**Option 2 – Helper script (from repo root):**
```bash
chmod +x electron/scripts/open-mac-app.sh
./electron/scripts/open-mac-app.sh /path/to/Copanion.app
```

**Option 3 – Finder:** Right‑click **Copanion.app** → **Open** → confirm “Open” in the dialog (one-time).

### App opens then closes immediately

- **Packaged app now loads the remote site** by default, so it no longer expects a local server. Rebuild the app and try again.
- If it still exits: run from Terminal to see the error:
  ```bash
  /path/to/Copanion.app/Contents/MacOS/Copanion
  ```
  Or check `~/.openclaw/copanion-crash.log` for uncaught errors.
- If you had Copanion open before (e.g. in the tray), only one instance is allowed; the second launch will quit immediately. Quit the first instance fully, then open again.

### File Size

- **Development:** ~200MB (includes dev tools)
- **Production:** ~100-150MB (optimized)
- **Installer:** ~80-120MB (compressed)

### Security

- `nodeIntegration: false` - Prevents Node.js access in renderer
- `contextIsolation: true` - Isolates contexts for security
- Preload script uses `contextBridge` - Safe API exposure

### Next Steps

1. Customize window appearance (frameless, custom title bar)
2. Add native menus
3. Implement auto-updater
4. Add system tray icon
5. Handle deep links
6. Add keyboard shortcuts
