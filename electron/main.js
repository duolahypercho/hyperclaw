const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  MenuItem,
  nativeImage,
  shell,
  session,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const http = require("http");

const isDev = process.env.NODE_ENV === "development";
const { spawn } = require("child_process");

// ─── Connector Process Manager ──────────────────────────────────────────────
// The hyperclaw-connector binary is bundled inside the Electron app and managed
// automatically. Users never need to install or run it separately.

let connectorProcess = null;
let connectorStopped = false; // set true on app quit to prevent restart loops

/**
 * Return the path to the bundled connector binary for the current platform/arch.
 * In packaged builds: <app>/Contents/Resources/connector/<binary>
 * In dev: electron/resources/connector/<binary>
 */
function getConnectorBinaryPath() {
  const plat = process.platform; // darwin | linux | win32
  const arch = process.arch;     // arm64 | x64

  let name;
  if (plat === "darwin") {
    name = arch === "arm64"
      ? "hyperclaw-connector-darwin-arm64"
      : "hyperclaw-connector-darwin-x64";
  } else if (plat === "linux") {
    name = "hyperclaw-connector-linux";
  } else if (plat === "win32") {
    name = "hyperclaw-connector-win.exe";
  } else {
    return null;
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, "connector", name);
  }
  // Dev mode: binary lives next to this script in resources/connector/
  return path.join(__dirname, "resources", "connector", name);
}

/**
 * Start the connector daemon. Restarts automatically on crash (unless we quit).
 * The connector reads its config from ~/.hyperclaw/.env (or flags).
 * On first run with no DEVICE_TOKEN it will do auto-setup (login + create device).
 */
function startConnector(attempt = 0) {
  if (connectorStopped) return;

  const binPath = getConnectorBinaryPath();
  if (!binPath || !fs.existsSync(binPath)) {
    console.warn(`[connector] Binary not found at: ${binPath} — skipping auto-start`);
    return;
  }

  // Inherit env so the connector picks up PATH, HOME, etc.
  // The connector reads ~/.hyperclaw/.env for HUB_URL / DEVICE_TOKEN.
  connectorProcess = spawn(binPath, [], {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const pid = connectorProcess.pid;
  console.log(`[connector] Started (pid ${pid}, attempt ${attempt + 1})`);

  connectorProcess.stdout.on("data", (data) => {
    const lines = data.toString().trim().split("\n");
    lines.forEach((l) => console.log(`[connector] ${l}`));
  });
  connectorProcess.stderr.on("data", (data) => {
    const lines = data.toString().trim().split("\n");
    lines.forEach((l) => console.error(`[connector:err] ${l}`));
  });

  connectorProcess.on("exit", (code, signal) => {
    connectorProcess = null;
    if (connectorStopped) return;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(Math.pow(2, attempt) * 1000, 30000);
    console.warn(`[connector] Exited (code=${code} signal=${signal}), restarting in ${delay}ms...`);
    setTimeout(() => startConnector(attempt + 1), delay);
  });

  connectorProcess.on("error", (err) => {
    console.error(`[connector] Failed to start: ${err.message}`);
  });
}

/**
 * Gracefully stop the connector (called on app quit).
 */
function stopConnector() {
  connectorStopped = true;
  if (connectorProcess) {
    try {
      connectorProcess.kill("SIGTERM");
    } catch (_) {}
    connectorProcess = null;
  }
}

// Log crashes so we can debug "opens then closes" (run from Terminal to see output)
function logCrash(label, err) {
  const msg = `${label}: ${err && (err.stack || err.message || err)}\n`;
  console.error(msg);
  try {
    const os = require("os");
    const logPath = path.join(os.homedir(), ".openclaw", "hyperclaw-crash.log");
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}`, "utf-8");
  } catch (_) {}
}
process.on("uncaughtException", (err) => {
  logCrash("uncaughtException", err);
});
process.on("unhandledRejection", (reason, promise) => {
  logCrash("unhandledRejection", reason);
});

// Prevent app from being suspended when minimized/hidden
// These must be called before app.whenReady()
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

// Set app name and App User Model ID to "Hyperclaw" everywhere (notifications, taskbar, etc.)
app.setName("Hyperclaw");
app.setAppUserModelId("Hyperclaw");

// Conditionally require electron-updater only when needed (production builds)
let autoUpdater = null;
if (!isDev && app.isPackaged) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
  } catch (error) {
    console.warn("electron-updater not available:", error.message);
  }
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Configuration
let appConfig = {
  mode: "local",
  remoteUrl: "https://claw.hypercho.com",
  localUrl: "http://localhost:1000",
  gateway: {
    host: "127.0.0.1",
    port: 18789,
  },
};

try {
  const configPath = path.join(__dirname, "app-config.json");
  if (fs.existsSync(configPath)) {
    appConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (error) {
}

// Auto-load hub config from ~/.hyperclaw/hub-config.json if not in app-config.json
if (!appConfig.hub || !appConfig.hub.enabled) {
  try {
    const hubConfigPath = path.join(os.homedir(), ".hyperclaw", "hub-config.json");
    if (fs.existsSync(hubConfigPath)) {
      const hubCfg = JSON.parse(fs.readFileSync(hubConfigPath, "utf8"));
      if (hubCfg.enabled && hubCfg.url && hubCfg.deviceId) {
        appConfig.hub = {
          enabled: true,
          url: hubCfg.url,
          deviceId: hubCfg.deviceId,
          jwt: hubCfg.jwt || "",
        };
      }
    }
  } catch (_) {}
}

const isRemoteMode = appConfig.mode === "remote";
let remoteUrl = appConfig.remoteUrl;
const localUrl = appConfig.localUrl;

// Ensure remoteUrl has protocol
if (isRemoteMode && remoteUrl && !remoteUrl.startsWith("http://") && !remoteUrl.startsWith("https://")) {
  remoteUrl = `https://${remoteUrl}`;
}

let mainWindow = null;
let tray = null;
let appIsQuiting = false;

// ─── Hub Communication ──────────────────────────────────────────────────────
// All data flows through Hub → Connector — never directly from local files.

function getHubInfo() {
  const hubUrl = appConfig.hub?.url || "";
  const deviceId = appConfig.hub?.deviceId || "";
  const jwt = appConfig.hub?.jwt || "";
  const enabled = !!(appConfig.hub?.enabled && hubUrl);
  return { enabled, hubUrl, deviceId, jwt };
}

// ─── Dynamic device discovery (mirrors browser's getActiveDeviceId) ──────────
let _cachedDeviceId = null;
let _cachedDeviceAt = 0;
const DEVICE_CACHE_TTL = 30000; // 30s

function discoverActiveDevice(hubUrl, jwt) {
  if (_cachedDeviceId && Date.now() - _cachedDeviceAt < DEVICE_CACHE_TTL) {
    return Promise.resolve(_cachedDeviceId);
  }
  const fetchModule = hubUrl.startsWith("https") ? https : http;
  const devicesUrl = new URL("/api/devices", hubUrl);

  return new Promise((resolve) => {
    const req = fetchModule.request(devicesUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      timeout: 10000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const devices = JSON.parse(data);
          if (!Array.isArray(devices) || devices.length === 0) return resolve(null);
          const online = devices.filter((d) => d.status === "online");
          const device = online.length > 0
            ? online.reduce((a, b) => (a.updatedAt || "") > (b.updatedAt || "") ? a : b)
            : devices[0];
          const id = device.id || device._id;
          _cachedDeviceId = id;
          _cachedDeviceAt = Date.now();
          resolve(id);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function hubNotConfiguredError() {
  return { success: false, error: "No device registered. Please set up a device first.", needsSetup: true };
}

/**
 * Forward a command to the Hub, which relays it to the Connector via WebSocket.
 * The Connector executes it on the user's machine and returns the result.
 * Dynamically discovers the active device if the config device is stale.
 */
async function hubCommandFromElectron(body) {
  const { hubUrl, jwt } = getHubInfo();
  // Discover active device dynamically (like the browser does)
  const deviceId = await discoverActiveDevice(hubUrl, jwt) || appConfig.hub?.deviceId || "";
  if (!deviceId) return hubNotConfiguredError();
  const url = new URL(`/api/devices/${deviceId}/command`, hubUrl);
  const fetchModule = hubUrl.startsWith("https") ? https : http;
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = fetchModule.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 60000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(unwrapHubResponse(JSON.parse(data))); }
        catch { resolve({ success: false, error: "Invalid response from hub" }); }
      });
    });
    req.on("error", (err) => resolve({ success: false, error: err.message }));
    req.on("timeout", () => { req.destroy(); resolve({ success: false, error: "Hub request timed out" }); });
    req.write(payload);
    req.end();
  });
}

/**
 * Unwrap Hub response envelope — mirrors browser's unwrapHubResponse in hub-direct.ts.
 * Hub returns: {data: <payload>, requestId: "...", status: "ok"|"error"}
 */
function unwrapHubResponse(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.status === "error") {
    const errMsg = raw.data?.error || raw.error || "Command failed";
    return { success: false, error: errMsg };
  }
  if ("success" in raw) return raw;
  let unwrapped = raw.data ?? raw;
  if (unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped) &&
      "result" in unwrapped && Object.keys(unwrapped).length === 1) {
    unwrapped = unwrapped.result;
  }
  return unwrapped;
}

// ─── Window and Tray Functions ──────────────────────────────────────────────

function createFallbackIcon() {
  const size = process.platform === "win32" ? 16 : 22;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="2" fill="#5B9BD5"/><text x="50%" y="50%" font-size="${
    size === 16 ? "11" : "14"
  }" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif">C</text></svg>`;
  return nativeImage.createFromBuffer(Buffer.from(svg));
}

// Function to fetch image from URL and convert to nativeImage
function fetchImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const buffer = Buffer.concat(chunks);
          const image = nativeImage.createFromBuffer(buffer);
          resolve(image);
        } catch (error) {
          reject(error);
        }
      });
      response.on("error", reject);
    }).on("error", reject);
  });
}

function createTray() {
  // Use remote URL for tray icon
  const remoteIconUrl = "https://claw.hypercho.com/tray.png";

  // Try to fetch icon from remote URL first
  const size = process.platform === "win32" ? 16 : 22;

  fetchImageFromUrl(remoteIconUrl)
    .then((loadedIcon) => {
      if (!loadedIcon || loadedIcon.isEmpty()) {
        const errorMsg = `Fetched image is empty or invalid from ${remoteIconUrl}`;
        console.error("Tray icon error:", errorMsg);
        throw new Error(errorMsg);
      }

      const originalSize = loadedIcon.getSize();
      // Resize to exact size needed for tray
      let resizedIcon;
      try {
        resizedIcon = loadedIcon.resize({
          width: size,
          height: size,
          quality: "best"
        });
      } catch (resizeError) {
        const errorMsg = `Failed to resize icon: ${resizeError.message}`;
        console.error("Tray icon resize error:", errorMsg);
        throw resizeError;
      }

      // On Windows, convert to PNG buffer for better compatibility
      let trayIcon;
      if (process.platform === "win32") {
        try {
          const pngBuffer = resizedIcon.toPNG();
          trayIcon = nativeImage.createFromBuffer(pngBuffer);

          if (!trayIcon || trayIcon.isEmpty()) {
            trayIcon = resizedIcon;
          }
        } catch (pngError) {
          trayIcon = resizedIcon;
        }
      } else {
        trayIcon = resizedIcon;
      }

      const finalSize = trayIcon.getSize();

      // Create the tray with the fetched icon
      createTrayWithIcon(trayIcon);
    })
    .catch((error) => {
      // Log error details
      console.error("Tray icon loading failed:", {
        error: error.message,
        url: remoteIconUrl,
        stack: error.stack,
      });
      // Use fallback icon
      const fallbackIcon = createFallbackIcon();
      if (process.platform === "win32") {
        try {
          const pngBuffer = fallbackIcon.toPNG();
          const convertedFallback = nativeImage.createFromBuffer(pngBuffer);
          createTrayWithIcon(convertedFallback);
        } catch {
          createTrayWithIcon(fallbackIcon);
        }
      } else {
        createTrayWithIcon(fallbackIcon);
      }
    });
}

function createTrayWithIcon(trayIcon) {
  try {
    // Create the tray (icon is already validated above)
    if (tray) {
      tray.destroy();
    }
    tray = new Tray(trayIcon);
    // On Windows, explicitly set the icon again to ensure it's visible
    // Sometimes Windows needs the icon to be set after tray creation
    if (process.platform === "win32") {
      try {
        tray.setImage(trayIcon);
      } catch (setError) {
        console.warn("Failed to set tray icon explicitly:", setError.message);
      }
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Hyperclaw",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: "Minimize to Tray",
        click: () => {
          if (mainWindow) mainWindow.hide();
        },
      },
      { type: "separator" },
      {
        label: "Voice Input",
        accelerator: process.platform === "darwin" ? "Control+Command" : "Ctrl+Super",
        click: () => {
          toggleVoiceOverlay();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          appIsQuiting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip("Hyperclaw");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
  } catch (error) {
    console.error("Error creating tray:", error);
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  const preloadExists = fs.existsSync(preloadPath);
  writeToBridgeLog(`main.js createWindow: preload=${preloadPath} exists=${preloadExists}`);
  console.log("[Hyperclaw] preload path:", preloadPath, "exists:", preloadExists);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: "Hyperclaw",
    frame: false, // Disable default window frame (title bar with controls)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false, // Prevent throttling when window is hidden/minimized
      spellcheck: true, // Enable spellchecker
    },
    autoHideMenuBar: true,
    show: false,
    // Ensure window doesn't start minimized
    minimizable: true,
    maximizable: true,
  });

  // Set window icon explicitly for Windows to ensure crisp display at all DPI levels
  if (process.platform === "win32") {
    let iconPath = path.join(__dirname, "../public/win.ico");
    if (!fs.existsSync(iconPath) && app.isPackaged) {
      // In production, try alternative paths
      iconPath = path.join(process.resourcesPath, "app", "public", "win.ico");
      if (!fs.existsSync(iconPath)) {
        // Fallback to PNG if ICO not found
        iconPath = path.join(process.resourcesPath, "app", "public", "logo-256.png");
        if (!fs.existsSync(iconPath)) {
          iconPath = path.join(process.resourcesPath, "app", "public", "Logopic.png");
        }
      }
    } else if (!fs.existsSync(iconPath)) {
      // Fallback in dev mode
      iconPath = path.join(__dirname, "../public/logo-256.png");
      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, "../public/Logopic.png");
      }
    }

    if (fs.existsSync(iconPath)) {
      try {
        mainWindow.setIcon(iconPath);
        console.log("Window icon set to:", iconPath);
      } catch (iconError) {
        console.warn("Failed to set window icon:", iconError.message);
      }
    } else {
      console.warn("Window icon file not found, using default");
    }
  }

  // Decide URL to load (respects app-config.json: local = localhost:1000, remote = claw.hypercho.com)
  let urlToLoad;
  if (isDev) {
    urlToLoad = `${localUrl}/dashboard`;
  } else {
    urlToLoad = isRemoteMode
      ? `${remoteUrl}/dashboard`
      : `${localUrl}/dashboard`;
  }

  // Add event listeners for debugging
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    console.error("Page failed to load:", {
      errorCode,
      errorDescription,
      validatedURL,
      urlToLoad,
    });
    const errorHtml = `data:text/html,<html><body style="background:#000319;color:#BEC1DD;font-family:sans-serif;padding:40px;"><h1>Connection Error</h1><p>Failed to load: <b>${validatedURL}</b></p><p>Error: ${errorDescription} (Code: ${errorCode})</p><p>Attempted URL: <b>${urlToLoad}</b></p><p>Mode: ${isRemoteMode ? "Remote" : "Local"}</p></body></html>`;
    mainWindow.loadURL(errorHtml);
  });

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    console.error("Renderer process gone:", details);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Page finished loading:", mainWindow.webContents.getURL());
  });

  mainWindow.webContents.on("dom-ready", () => {
    console.log("DOM ready for:", mainWindow.webContents.getURL());
  });

  mainWindow.webContents.on("console-message", (event, level, message) => {
    if (level >= 2) { // Only log warnings and errors
      console.log(`[Renderer ${level === 2 ? 'WARN' : 'ERROR'}]:`, message);
    }
  });

  // Allow OAuth provider origins to open in-app so the callback returns to the Electron window
  function isOAuthProviderUrl(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "accounts.google.com" || host.endsWith(".accounts.google.com");
    } catch {
      return false;
    }
  }

  function isAppOriginUrl(url) {
    try {
      return url.startsWith(localUrl) || url.startsWith(remoteUrl);
    } catch {
      return false;
    }
  }

  // Handle external links - open in system browser instead of Electron window.
  // OAuth URLs (e.g. Google sign-in) open in an in-app child window so the callback returns to the app.
  // For internal URLs: Electron often loads about:blank when window.open() gets a relative URL
  // (e.g. "/Tool/OpenClaw"), so we create the child window ourselves with an absolute URL
  // and the same preload so the app and bridge work in the new window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url) return { action: "deny" };
    // OAuth: open in child window so callback stays in Electron instead of system browser
    if (isOAuthProviderUrl(url)) {
      const preloadPath = path.join(__dirname, "preload.js");
      setImmediate(() => {
        const oauthChild = new BrowserWindow({
          width: 500,
          height: 650,
          title: "Sign in",
          frame: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            backgroundThrottling: false,
            // Use default session so callback cookies are shared with main window
          },
          show: false,
        });
        oauthChild.loadURL(url, { userAgent: mainWindow.webContents.getUserAgent() }).catch((err) => {
          console.error("OAuth window load failed:", err);
          oauthChild.close();
        });
        oauthChild.once("ready-to-show", () => oauthChild.show());
        // When OAuth redirects back to our app, load that URL in the main window and close the child.
        // Use did-navigate so the callback runs in the child first and sets the session cookie (shared session).
        oauthChild.webContents.on("did-navigate", (ev, navUrl) => {
          if (isAppOriginUrl(navUrl)) {
            mainWindow.loadURL(navUrl, { userAgent: mainWindow.webContents.getUserAgent() }).catch(() => {});
            mainWindow.show();
            mainWindow.focus();
            oauthChild.close();
          }
        });
      });
      return { action: "deny" };
    }
    if (!url.startsWith(localUrl) && !url.startsWith(remoteUrl)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    // If Chromium passed about:blank (e.g. failed to resolve relative URL), we can't know the target
    if (url === "about:blank" || url.trim() === "") return { action: "allow" };
    const baseUrl = isRemoteMode ? remoteUrl : localUrl;
    const absoluteUrl = url.startsWith("http://") || url.startsWith("https://")
      ? url
      : (baseUrl.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url));
    const preloadPath = path.join(__dirname, "preload.js");
    setImmediate(() => {
      const child = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: "Hyperclaw",
        frame: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: preloadPath,
          webSecurity: true,
          backgroundThrottling: false,
        },
        show: false,
      });
      child.loadURL(absoluteUrl, { userAgent: mainWindow.webContents.getUserAgent() }).catch((err) => {
        console.error("Child window load failed:", err);
        child.close();
      });
      child.once("ready-to-show", () => child.show());
    });
    return { action: "deny" };
  });

  // Prevent navigation to external URLs within the Electron window (except OAuth flows)
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const currentUrl = isRemoteMode ? remoteUrl : localUrl;
    const parsedCurrentUrl = new URL(currentUrl);

    // Allow our app origins
    if (navigationUrl.startsWith(localUrl) || navigationUrl.startsWith(remoteUrl)) {
      return;
    }
    // Allow OAuth providers in-window so callback returns to the app instead of system browser
    if (isOAuthProviderUrl(navigationUrl)) {
      return;
    }
    // External URL: open in system browser and prevent in-app navigation
    if (parsedUrl.origin !== parsedCurrentUrl.origin) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  mainWindow.loadURL(urlToLoad, {
    userAgent: mainWindow.webContents.getUserAgent(),
  }).catch((err) => {
    console.error("Load failed:", err);
    const errorHtml = `data:text/html,<html><body style="background:#000319;color:#BEC1DD;font-family:sans-serif;padding:40px;"><h1>Connection Error</h1><p>Error: ${err.message}</p><p>Attempted URL: <b>${urlToLoad}</b></p><p>Mode: ${isRemoteMode ? "Remote" : "Local"}</p><p>Please check your connection and ensure the server is accessible.</p></body></html>`;
    mainWindow.loadURL(errorHtml);
  });

  // Fallback: Show window after a delay if ready-to-show doesn't fire
  // This ensures the window is visible even if the page takes time to load
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }, 1000);

  mainWindow.once("ready-to-show", () => {
    // Ensure window is restored if it was minimized
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    // Show and focus the window
    mainWindow.show();
    mainWindow.focus();
    // Always open DevTools in local mode for debugging
    if (!isRemoteMode || isDev) {
      mainWindow.webContents.openDevTools();
    }

    // Set spellchecker languages (Windows and Linux only, macOS uses native detection)
    if (process.platform !== "darwin") {
      // Get available languages
      const availableLanguages = mainWindow.webContents.session.availableSpellCheckerLanguages;

      // Set default languages based on OS locale or use English as fallback
      const osLocale = app.getLocale();
      const defaultLanguages = ["en-US"];

      // Try to match OS locale with available languages
      if (availableLanguages.includes(osLocale)) {
        defaultLanguages.unshift(osLocale);
      } else {
        // Try to find a matching language code (e.g., "en" for "en-US")
        const langCode = osLocale.split("-")[0];
        const matchingLang = availableLanguages.find((lang) => lang.startsWith(langCode));
        if (matchingLang) {
          defaultLanguages.unshift(matchingLang);
        }
      }

      // Set the spellchecker languages
      mainWindow.webContents.session.setSpellCheckerLanguages(defaultLanguages);
    }
  });

  // Additional error handling for remote content
  mainWindow.webContents.on("did-frame-finish-load", (event, isMainFrame) => {
    if (isMainFrame) {
      console.log("Main frame finished loading:", mainWindow.webContents.getURL());
    }
  });

  mainWindow.webContents.on("page-title-updated", (event, title) => {
    console.log("Page title updated:", title);
  });

  // Context menu with spellchecker support
  mainWindow.webContents.on("context-menu", (event, params) => {
    const menu = new Menu();

    // Add spelling suggestions if available
    if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => {
              mainWindow.webContents.replaceMisspelling(suggestion);
            },
          })
        );
      }
      menu.append(new MenuItem({ type: "separator" }));
    }

    // Add "Add to dictionary" option if there's a misspelled word
    if (params.misspelledWord) {
      menu.append(
        new MenuItem({
          label: "Add to dictionary",
          click: () => {
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord
            );
          },
        })
      );
      menu.append(new MenuItem({ type: "separator" }));
    }

    // Add standard context menu items
    if (params.editFlags.canCut) {
      menu.append(
        new MenuItem({
          label: "Cut",
          role: "cut",
        })
      );
    }
    if (params.editFlags.canCopy) {
      menu.append(
        new MenuItem({
          label: "Copy",
          role: "copy",
        })
      );
    }
    if (params.editFlags.canPaste) {
      menu.append(
        new MenuItem({
          label: "Paste",
          role: "paste",
        })
      );
    }
    if (params.editFlags.canSelectAll) {
      menu.append(
        new MenuItem({
          label: "Select All",
          role: "selectAll",
        })
      );
    }

    // Show the context menu
    menu.popup();
  });

  // Remove menu bar completely to prevent Alt key from showing it
  // Setting menu to null completely removes it, preventing Alt from activating it
  mainWindow.setMenu(null);

  // Prevent renderer process from being throttled when hidden
  mainWindow.webContents.setBackgroundThrottling(false);

  // Keep the app running even when minimized/hidden
  mainWindow.on("hide", () => {
    // Ensure the window stays active in the background
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  });

  // Windows-specific Tray logic
  mainWindow.on("minimize", (event) => {
    if (process.platform === "win32") {
      event.preventDefault();
      mainWindow.hide();
      // Ensure background processes continue running
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  });

  mainWindow.on("close", (event) => {
    if (!appIsQuiting) {
      event.preventDefault();
      mainWindow.hide();
      // Keep background processes running
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  });
}

// ─── IPC Handlers: Window Controls ──────────────────────────────────────────

function getSenderWindow(event) {
  return event.sender && BrowserWindow.fromWebContents(event.sender);
}

ipcMain.handle("window-minimize", (event) => {
  const win = getSenderWindow(event);
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});

ipcMain.handle("window-maximize", (event) => {
  const win = getSenderWindow(event);
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.handle("window-close", (event) => {
  const win = getSenderWindow(event);
  if (!win || win.isDestroyed()) return;
  // Main window: hide on first close (tray behavior), close on second
  if (win === mainWindow) {
    if (!appIsQuiting) {
      appIsQuiting = true;
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  } else {
    // Child window: just close it
    win.close();
  }
});

ipcMain.handle("window-is-maximized", (event) => {
  const win = getSenderWindow(event);
  if (win && !win.isDestroyed()) {
    return win.isMaximized();
  }
  return false;
});

// Clear persisted auth (cookies + storage) for app origins so logout is effective in Electron.
// Fixes "auto login" after logout in dist-electron and packaged app.
// ─── Runtime Detection Handlers ───────────────────────────────────────────
ipcMain.handle("runtimes:detect-local", async () => {
  const { execSync } = require("child_process");
  const fs = require("fs");
  const path = require("path");
  const results = {};

  const home = process.env.HOME || "";
  // Extend PATH to include common user binary locations that Electron may miss
  const extraPaths = [
    path.join(home, ".local", "bin"),
    path.join(home, "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".cargo", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ].join(":");
  const shellEnv = { ...process.env, PATH: `${extraPaths}:${process.env.PATH || ""}` };

  const runtimes = [
    {
      id: "openclaw",
      commands: ["openclaw"],
      ports: [18789],
      paths: [
        path.join(home, ".hyperclaw", "node", "bin", "openclaw"),
        path.join(home, ".openclaw", "openclaw"),
        "/usr/local/bin/openclaw",
      ],
    },
    {
      id: "claude",
      commands: ["claude"],
      ports: [],
      paths: [
        path.join(home, ".claude", "local", "claude"),
        path.join(home, ".npm-global", "bin", "claude"),
        "/usr/local/bin/claude",
      ],
    },
    {
      id: "codex",
      commands: ["codex"],
      ports: [],
      paths: [
        path.join(home, ".npm-global", "bin", "codex"),
        "/usr/local/bin/codex",
      ],
    },
    {
      id: "hermes",
      commands: ["hermes-agent", "hermes"],
      ports: [],
      paths: [
        path.join(home, ".local", "bin", "hermes"),
        path.join(home, ".local", "bin", "hermes-agent"),
        path.join(home, ".hermes", "bin", "hermes-agent"),
        path.join(home, ".hermes", "bin", "hermes"),
        "/usr/local/bin/hermes-agent",
        "/usr/local/bin/hermes",
      ],
    },
  ];

  for (const rt of runtimes) {
    let found = false;
    let version = null;
    let running = false;
    let foundCmd = null;

    // Check if binary exists via PATH
    for (const cmd of rt.commands) {
      try {
        const whichResult = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf-8", timeout: 3000, env: shellEnv }).trim();
        if (whichResult) {
          found = true;
          foundCmd = cmd;
          break;
        }
      } catch { /* not found */ }
    }

    // Check common install paths if not found in PATH
    if (!found && rt.paths) {
      for (const p of rt.paths) {
        if (fs.existsSync(p)) {
          found = true;
          foundCmd = p;
          break;
        }
      }
    }

    // Try to get version from the found command
    if (found && foundCmd) {
      try {
        version = execSync(`"${foundCmd}" --version 2>/dev/null`, { encoding: "utf-8", timeout: 3000, env: shellEnv }).trim().slice(0, 50);
      } catch { /* no version flag */ }
    }

    // Check if running via port (for runtimes with known ports)
    for (const port of rt.ports) {
      try {
        const net = require("net");
        running = await new Promise((resolve) => {
          const sock = new net.Socket();
          sock.setTimeout(1000);
          sock.on("connect", () => { sock.destroy(); resolve(true); });
          sock.on("error", () => resolve(false));
          sock.on("timeout", () => { sock.destroy(); resolve(false); });
          sock.connect(port, "127.0.0.1");
        });
        if (running) break;
      } catch { /* ignore */ }
    }

    // Check if running via process list (for runtimes without known ports)
    if (!running && found) {
      try {
        const cmd = rt.commands[0];
        const ps = execSync(`pgrep -f "${cmd}" 2>/dev/null`, { encoding: "utf-8", timeout: 3000, env: shellEnv }).trim();
        if (ps) running = true;
      } catch { /* not running */ }
    }

    results[rt.id] = { installed: found, version, running };
  }

  console.log("[runtimes] detect-local:", JSON.stringify(results));
  return results;
});

// ─── Detect Existing Provider Keys ────────────────────────────────────────
// Returns only provider IDs + source — never exposes actual keys to the renderer.
ipcMain.handle("runtimes:detect-provider-keys", async () => {
  const fs = require("fs");
  const path = require("path");
  const home = process.env.HOME || "";
  const detected = []; // { providerId, source, model? }

  // Map from openclaw auth-profiles provider names → our provider IDs
  const openclawProviderMap = {
    "anthropic": "anthropic",
    "openai": "openai",
    "openai-codex": "openai",
    "google": "google",
    "minimax": "minimax",
    "minimax-portal": "minimax",
    "deepseek": "deepseek",
    "mistral": "mistral",
    "groq": "groq",
    "openrouter": "openrouter",
    "xai": "xai",
    "together": "together",
    "perplexity": "perplexity",
    "cerebras": "cerebras",
    "huggingface": "huggingface",
    "nvidia": "nvidia",
  };

  // 1. Read OpenClaw auth-profiles.json
  try {
    const authPath = path.join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
    if (fs.existsSync(authPath)) {
      const raw = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      const profiles = raw.profiles || {};
      const seen = new Set();
      for (const [profileKey, profile] of Object.entries(profiles)) {
        const ocProvider = (profile.provider || profileKey.split(":")[0]).toLowerCase();
        const mappedId = openclawProviderMap[ocProvider];
        if (mappedId && !seen.has(mappedId)) {
          // Verify the profile actually has credentials
          if (profile.access || profile.key) {
            seen.add(mappedId);
            detected.push({ providerId: mappedId, source: "openclaw" });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[provider-detect] OpenClaw auth-profiles read failed:", err.message);
  }

  // 2. Read Hermes .env
  try {
    const hermesEnv = path.join(home, ".hermes", ".env");
    if (fs.existsSync(hermesEnv)) {
      const lines = fs.readFileSync(hermesEnv, "utf-8").split("\n");
      const hermesKeyMap = {
        "OPENROUTER_API_KEY": "openrouter",
        "GLM_API_KEY": "google",
        "KIMI_API_KEY": "moonshot",
        "MINIMAX_API_KEY": "minimax",
        "MINIMAX_CN_API_KEY": "minimax",
      };
      for (const line of lines) {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (!match) continue;
        const [, key, value] = match;
        const mappedId = hermesKeyMap[key];
        if (mappedId && value.trim() && !detected.some((d) => d.providerId === mappedId)) {
          detected.push({ providerId: mappedId, source: "hermes" });
        }
      }
    }
  } catch (err) {
    console.warn("[provider-detect] Hermes .env read failed:", err.message);
  }

  console.log("[provider-detect]", detected.length, "providers found:", detected.map((d) => `${d.providerId}(${d.source})`).join(", "));
  return detected;
});

// Import a specific provider's key from a detected source.
// Only called when user explicitly opts in.
ipcMain.handle("runtimes:import-provider-key", async (_event, { providerId, source }) => {
  const fs = require("fs");
  const path = require("path");
  const home = process.env.HOME || "";

  const openclawProviderMap = {
    "anthropic": ["anthropic"],
    "openai": ["openai", "openai-codex"],
    "google": ["google"],
    "minimax": ["minimax", "minimax-portal"],
    "deepseek": ["deepseek"],
    "mistral": ["mistral"],
    "groq": ["groq"],
    "openrouter": ["openrouter"],
    "xai": ["xai"],
    "together": ["together"],
    "perplexity": ["perplexity"],
    "cerebras": ["cerebras"],
    "huggingface": ["huggingface"],
    "nvidia": ["nvidia"],
  };

  if (source === "openclaw") {
    try {
      const authPath = path.join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
      const raw = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      const profiles = raw.profiles || {};
      const candidates = openclawProviderMap[providerId] || [providerId];
      for (const [profileKey, profile] of Object.entries(profiles)) {
        const ocProvider = (profile.provider || profileKey.split(":")[0]).toLowerCase();
        if (candidates.includes(ocProvider)) {
          return { apiKey: profile.key || profile.access || null };
        }
      }
    } catch (err) {
      console.warn("[provider-import] OpenClaw import failed:", err.message);
    }
  }

  if (source === "hermes") {
    try {
      const hermesEnv = path.join(home, ".hermes", ".env");
      const lines = fs.readFileSync(hermesEnv, "utf-8").split("\n");
      const hermesKeyMap = {
        "openrouter": "OPENROUTER_API_KEY",
        "google": "GLM_API_KEY",
        "moonshot": "KIMI_API_KEY",
        "minimax": "MINIMAX_API_KEY",
      };
      const envKey = hermesKeyMap[providerId];
      if (envKey) {
        for (const line of lines) {
          const match = line.match(/^([A-Z_]+)=(.+)$/);
          if (match && match[1] === envKey && match[2].trim()) {
            return { apiKey: match[2].trim() };
          }
        }
      }
    } catch (err) {
      console.warn("[provider-import] Hermes import failed:", err.message);
    }
  }

  return { apiKey: null };
});

// ─── Permission Handlers ──────────────────────────────────────────────────
ipcMain.handle("check-accessibility", () => {
  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    // isTrustedAccessibilityClient(false) caches its result within the process,
    // so it misses when the user toggles the permission in System Settings.
    // Use AppleScript as a live probe — System Events requires Accessibility.
    try {
      const { execSync } = require("child_process");
      execSync(
        'osascript -e "tell application \\"System Events\\" to return 1" 2>/dev/null',
        { encoding: "utf-8", timeout: 2000 }
      );
      console.log("[permissions] check-accessibility: true");
      return true;
    } catch {
      console.log("[permissions] check-accessibility: false");
      return false;
    }
  }
  return true;
});

ipcMain.handle("request-accessibility", () => {
  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    const result = systemPreferences.isTrustedAccessibilityClient(true);
    console.log("[permissions] request-accessibility:", result);
    return result;
  }
  return true;
});

ipcMain.handle("check-microphone", async () => {
  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    const result = systemPreferences.getMediaAccessStatus("microphone") === "granted";
    console.log("[permissions] check-microphone:", result);
    return result;
  }
  return true;
});

ipcMain.handle("request-microphone", async () => {
  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    const result = await systemPreferences.askForMediaAccess("microphone");
    console.log("[permissions] request-microphone:", result);
    return result;
  }
  return true;
});

ipcMain.handle("check-screen", () => {
  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    const result = systemPreferences.getMediaAccessStatus("screen") === "granted";
    console.log("[permissions] check-screen:", result);
    return result;
  }
  return true;
});

ipcMain.handle("request-screen", async () => {
  if (process.platform === "darwin") {
    const { desktopCapturer, shell, systemPreferences } = require("electron");
    // Attempt a capture so macOS registers the app in the Screen Recording list.
    // Without this, HyperClaw won't appear in System Settings for the user to toggle.
    try {
      await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
    } catch { /* expected to fail if not yet granted */ }
    // Now open System Settings to the Screen Recording pane
    shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    const result = systemPreferences.getMediaAccessStatus("screen") === "granted";
    console.log("[permissions] request-screen:", result);
    return result;
  }
  return true;
});

ipcMain.handle("clear-auth-session", async () => {
  try {
    const ses = session.defaultSession;
    const origins = [];
    try {
      if (localUrl) origins.push(new URL(localUrl).origin);
    } catch (_) {}
    try {
      if (remoteUrl && remoteUrl !== localUrl) origins.push(new URL(remoteUrl).origin);
    } catch (_) {}
    for (const origin of origins) {
      await ses.clearStorageData({
        origin,
        storages: ["cookies", "localstorage", "sessionstorage"],
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("clear-auth-session failed:", err);
    return { ok: false, error: err && err.message };
  }
});

// Progress bar handler
ipcMain.handle("set-progress-bar", (event, progress) => {
  if (mainWindow) {
    // progress should be between 0 and 1, or -1 to remove
    // values > 1 will show indeterminate progress (Windows) or clamp to 100% (macOS/Linux)
    mainWindow.setProgressBar(progress);
  }
});

// Notification handler
ipcMain.handle("show-notification", async (event, { title, body }) => {
  const { Notification } = require("electron");

  // Check if notifications are supported
  if (!Notification.isSupported()) {
    console.warn("Notifications are not supported on this system");
    return;
  }

  // Resolve icon path - works in both dev and production
  let iconPath = path.join(__dirname, "../public/Logopic.png");
  if (!fs.existsSync(iconPath) && app.isPackaged) {
    // In production, try alternative path
    iconPath = path.join(process.resourcesPath, "app", "public", "Logopic.png");
  }
  // If still not found, iconPath will be undefined and Electron will use default

  // Create and show notification
  const notification = new Notification({
    title: title || "Hyperclaw",
    body: body || "",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    silent: false,
  });

  notification.show();

  // Auto-close after 5 seconds
  setTimeout(() => {
    notification.close();
  }, 5000);
});

// ─── IPC Handlers: OpenClaw (all routed through Hub → Connector) ────────────

ipcMain.handle("openclaw:check-installed", async () => {
  if (!getHubInfo().enabled) return { installed: false, version: null, needsSetup: true };
  // Device exists on hub → OpenClaw is available via the connector
  return { installed: true, version: "remote" };
});

ipcMain.handle("openclaw:status", async () => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "get-config" });
});

ipcMain.handle("openclaw:gateway-health", async () => {
  if (!getHubInfo().enabled) return { healthy: false, error: "No device registered", needsSetup: true };
  return { healthy: true };
});

ipcMain.handle("openclaw:get-gateway-connect-url", async () => {
  if (!getHubInfo().enabled) return { gatewayUrl: null, token: null, error: "No device registered", needsSetup: true };
  return { gatewayUrl: null, token: null, hubMode: true };
});

ipcMain.handle("openclaw:get-device-identity", async () => {
  if (!getHubInfo().enabled) return { error: "No device registered. Please set up a device first.", needsSetup: true };
  return hubCommandFromElectron({ action: "get-device-identity" });
});

ipcMain.handle("openclaw:sign-connect-challenge", async (event, params) => {
  if (!getHubInfo().enabled) return { error: "No device registered. Please set up a device first.", needsSetup: true };
  return hubCommandFromElectron({ action: "sign-connect-challenge", ...params });
});

ipcMain.handle("openclaw:message-send", async (event, p) => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "send-command", command: p });
});

ipcMain.handle("openclaw:cron-list", async () => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "get-crons" });
});

ipcMain.handle("openclaw:cron-list-json", async () => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "get-crons" });
});

function sanitizeCronId(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  const s = id.trim();
  if (!/^[a-f0-9-]{36}$/i.test(s)) return null;
  return s;
}

ipcMain.handle("openclaw:cron-enable", async (event, id) => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  const safeId = sanitizeCronId(id);
  if (!safeId) return { success: false, error: "Invalid job id" };
  return hubCommandFromElectron({ action: "cron-edit", cronEditJobId: safeId, cronEditParams: { enabled: true } });
});

ipcMain.handle("openclaw:cron-disable", async (event, id) => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  const safeId = sanitizeCronId(id);
  if (!safeId) return { success: false, error: "Invalid job id" };
  return hubCommandFromElectron({ action: "cron-edit", cronEditJobId: safeId, cronEditParams: { enabled: false } });
});

ipcMain.handle("openclaw:agent-list", async () => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "list-agents" });
});

ipcMain.handle("openclaw:run-command", async (event, args) => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  if (!args || typeof args !== "string") {
    return { success: false, error: "Invalid command arguments" };
  }
  const blocked = ["rm ", "sudo ", "eval ", "exec "];
  if (blocked.some((b) => args.toLowerCase().includes(b))) {
    return { success: false, error: "Command blocked for safety" };
  }
  return hubCommandFromElectron({ action: "send-command", command: args });
});

// ─── Claude Code & Codex: routed through Hub → Connector relay ──────────────
// All claude-code-* and codex-* actions are handled by the connector daemon.
// The app sends bridge requests via hub-direct.ts → Hub WS → Connector.
// Streaming events flow back: Connector → Hub → Dashboard WS → app.
// See hyperclaw-connector/internal/bridge/claude.go for implementation.

// ─── IPC Handlers: Gateway Config ───────────────────────────────────────────

ipcMain.handle("hyperclaw:set-gateway-config", async (event, { host, port, token }) => {
  try {
    if (!host || typeof host !== "string" || !host.trim()) {
      return { success: false, error: "Host is required" };
    }
    const trimmedHost = host.trim();
    const trimmedPort = port && typeof port === "number" ? port : 18789;
    const trimmedToken = token && typeof token === "string" ? token.trim() : "";

    if (!appConfig.gateway) {
      appConfig.gateway = {};
    }
    appConfig.gateway.host = trimmedHost;
    appConfig.gateway.port = trimmedPort;
    appConfig.gateway.token = trimmedToken;

    const configPath = path.join(__dirname, "app-config.json");
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), "utf-8");

    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle("hyperclaw:get-gateway-config", async () => {
  return {
    host: appConfig.gateway?.host ?? "127.0.0.1",
    port: appConfig.gateway?.port ?? 18789,
    token: appConfig.gateway?.token ?? "",
  };
});

ipcMain.handle("hyperclaw:test-gateway-connection", async (event, { host, port }) => {
  const testHost = (host && typeof host === "string") ? host.trim() : "127.0.0.1";
  const testPort = (port && typeof port === "number") ? port : 18789;
  const testUrl = `http://${testHost}:${testPort}`;

  return new Promise((resolve) => {
    try {
      const req = http.get(`${testUrl}/health`, { timeout: 5000 }, (res) => {
        resolve({ success: true, statusCode: res.statusCode, url: testUrl });
      });
      req.on("error", (err) => {
        resolve({ success: false, error: err.message, url: testUrl });
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ success: false, error: "Connection timed out", url: testUrl });
      });
    } catch (err) {
      resolve({ success: false, error: err.message, url: testUrl });
    }
  });
});

// ─── IPC Handlers: Hub Config (thin client mode) ────────────────────────────

ipcMain.handle("hyperclaw:get-hub-config", async () => {
  return {
    enabled: appConfig.hub?.enabled ?? false,
    url: appConfig.hub?.url ?? "",
    deviceId: appConfig.hub?.deviceId ?? "",
    jwt: appConfig.hub?.jwt ?? "",
  };
});

// Synchronous version for bridge client (needs config before first fetch)
ipcMain.on("hyperclaw:get-hub-config-sync", (event) => {
  event.returnValue = {
    enabled: appConfig.hub?.enabled ?? false,
    url: appConfig.hub?.url ?? "",
    deviceId: appConfig.hub?.deviceId ?? "",
    jwt: appConfig.hub?.jwt ?? "",
  };
});

ipcMain.handle("hyperclaw:set-hub-config", async (event, { enabled, url, deviceId, jwt }) => {
  try {
    if (!appConfig.hub) {
      appConfig.hub = {};
    }
    appConfig.hub.enabled = !!enabled;
    appConfig.hub.url = (url && typeof url === "string") ? url.trim() : "";
    appConfig.hub.deviceId = (deviceId && typeof deviceId === "string") ? deviceId.trim() : "";
    appConfig.hub.jwt = (jwt && typeof jwt === "string") ? jwt.trim() : "";

    // Persist to app-config.json
    const configPath = path.join(__dirname, "app-config.json");
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), "utf-8");

    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

// ─── IPC Handlers: Tasks (routed through Hub → Connector) ──────────────────

ipcMain.handle("hyperclaw:get-tasks", async () => {
  if (!getHubInfo().enabled) return [];
  try {
    const result = await hubCommandFromElectron({ action: "get-tasks" });
    return Array.isArray(result) ? result : (result?.tasks ?? []);
  } catch {
    return [];
  }
});

ipcMain.handle("hyperclaw:add-task", async (event, task) => {
  if (!getHubInfo().enabled) return null;
  return hubCommandFromElectron({ action: "add-task", task });
});

ipcMain.handle("hyperclaw:update-task", async (event, { id, patch }) => {
  if (!getHubInfo().enabled) return null;
  return hubCommandFromElectron({ action: "update-task", id, patch });
});

ipcMain.handle("hyperclaw:delete-task", async (event, id) => {
  if (!getHubInfo().enabled) return { success: false };
  return hubCommandFromElectron({ action: "delete-task", id });
});

// ─── IPC Handlers: Commands (routed through Hub → Connector) ────────────────

ipcMain.handle("hyperclaw:send-command", async (event, command) => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "send-command", command });
});

ipcMain.handle("hyperclaw:trigger-process-commands", async () => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "trigger-process-commands" });
});

ipcMain.handle("hyperclaw:spawn-agent-for-task", async (event, params) => {
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron({ action: "spawn-agent-for-task", ...params });
});

// ─── IPC Handlers: Notes (routed through Hub → Connector doc ops) ───────────

ipcMain.handle("notes:fetchNote", async () => {
  if (!getHubInfo().enabled) return { folder: [], recentNote: null, currentFolder: null };
  try {
    const result = await hubCommandFromElectron({ action: "list-openclaw-memory" });
    const sources = Array.isArray(result) ? result : (result?.sources ?? []);

    // Flatten all memory files from all sources
    const allFiles = [];
    for (const source of sources) {
      if (Array.isArray(source.files)) allFiles.push(...source.files);
    }
    allFiles.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    const notes = allFiles.map((f) => ({
      _id: f.name?.replace(/\.md$/i, "") || f.path,
      content: "",
      createdAt: f.updatedAt || new Date().toISOString(),
      updatedAt: f.updatedAt || new Date().toISOString(),
      pinned: false,
      folderId: "all",
    }));

    // Load content of the most recent note
    let recentNote = notes.length > 0 ? { ...notes[0] } : null;
    if (recentNote && allFiles[0]?.path) {
      try {
        const doc = await hubCommandFromElectron({ action: "get-openclaw-doc", path: allFiles[0].path });
        if (doc?.content != null) recentNote.content = doc.content;
      } catch {}
    }

    return {
      folder: [{ _id: "all", name: "All Notes", notesLength: notes.length, pinned: false }],
      recentNote,
      currentFolder: { _id: "all", name: "All Notes", notes },
    };
  } catch (err) {
    console.error("notes:fetchNote error:", err);
    return { folder: [], recentNote: null, currentFolder: null };
  }
});

ipcMain.handle("notes:fetchFolder", async (event, { folderId }) => {
  if (!getHubInfo().enabled) return { status: 500, data: { error: "Not configured" } };
  try {
    const result = await hubCommandFromElectron({ action: "list-openclaw-memory" });
    const sources = Array.isArray(result) ? result : (result?.sources ?? []);

    const allFiles = [];
    for (const source of sources) {
      if (Array.isArray(source.files)) allFiles.push(...source.files);
    }
    allFiles.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    const notes = allFiles.map((f) => ({
      _id: f.name?.replace(/\.md$/i, "") || f.path,
      content: "",
      createdAt: f.updatedAt || new Date().toISOString(),
      updatedAt: f.updatedAt || new Date().toISOString(),
      pinned: false,
      folderId: folderId,
    }));

    return {
      status: 200,
      data: {
        _id: folderId,
        name: "All Notes",
        notes: notes,
        pinned: false,
        notesLength: notes.length,
      },
    };
  } catch (err) {
    console.error("notes:fetchFolder error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

ipcMain.handle("notes:fetchSingleNote", async (event, { folderId, noteId }) => {
  if (!getHubInfo().enabled) return { status: 500, data: { error: "Not configured" } };
  try {
    const result = await hubCommandFromElectron({ action: "get-openclaw-doc", path: `workspace/memory/${noteId}.md` });
    if (result?.success === false) return { status: 404, data: { error: result.error || "Note not found" } };
    return {
      status: 200,
      data: {
        _id: noteId,
        content: result?.content || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pinned: false,
        folderId: "all",
      },
    };
  } catch (err) {
    console.error("notes:fetchSingleNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

ipcMain.handle("notes:createFolder", async (event, { _id, name }) => {
  return { status: 200, data: { _id, name, notesLength: 0, pinned: false } };
});

ipcMain.handle("notes:createNote", async (event, { noteId, folderId }) => {
  if (!getHubInfo().enabled) return { status: 500, data: { error: "Not configured" } };
  try {
    await hubCommandFromElectron({ action: "write-openclaw-doc", path: `workspace/memory/${noteId}.md`, content: "" });
    return { status: 200, data: { noteId, folderId: "all" } };
  } catch (err) {
    console.error("notes:createNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

ipcMain.handle("notes:updateNote", async (event, { folderId, noteId, content }) => {
  if (!getHubInfo().enabled) return { status: 500, data: { error: "Not configured" } };
  try {
    await hubCommandFromElectron({ action: "write-openclaw-doc", path: `workspace/memory/${noteId}.md`, content });
    return { status: 200, data: { success: true } };
  } catch (err) {
    console.error("notes:updateNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

ipcMain.handle("notes:editFolderName", async () => {
  return { status: 200, data: { success: true } };
});

ipcMain.handle("notes:deleteFolder", async () => {
  return { status: 200, data: { success: true } };
});

ipcMain.handle("notes:deleteNote", async (event, { folderId, noteId }) => {
  if (!getHubInfo().enabled) return { status: 500, data: { error: "Not configured" } };
  try {
    await hubCommandFromElectron({ action: "delete-openclaw-doc", path: `workspace/memory/${noteId}.md` });
    return { status: 200, data: { success: true } };
  } catch (err) {
    console.error("notes:deleteNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

ipcMain.handle("notes:searchNote", async (event, { searchQuery }) => {
  if (!getHubInfo().enabled) return { status: 200, data: [] };
  try {
    const result = await hubCommandFromElectron({ action: "search-openclaw-memory-content", query: searchQuery });
    return { status: 200, data: Array.isArray(result) ? result : (result?.results ?? []) };
  } catch (err) {
    console.error("notes:searchNote error:", err);
    return { status: 500, data: [] };
  }
});

ipcMain.handle("notes:reorderFolder", async () => {
  return { status: 200, data: { success: true } };
});

ipcMain.handle("notes:uploadAttachment", async (event, { folderId, noteId, attachment }) => {
  return { status: 200, data: { success: true, url: attachment } };
});

// ─── Bridge Invoke (catch-all: routes any action to Hub → Connector) ────────

function getBridgeLogPath() {
  const os = require("os");
  return path.join(os.homedir(), ".openclaw", "hyperclaw-bridge.log");
}

function writeToBridgeLog(message) {
  try {
    const logPath = getBridgeLogPath();
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf-8");
  } catch (_) {}
}

function logBridge(action, err) {
  try {
    const logPath = getBridgeLogPath();
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const line = err
      ? `bridge-invoke error action=${action} ${err}`
      : `bridge-invoke action=${action}`;
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, "utf-8");
  } catch (_) {}
}

ipcMain.handle("hyperclaw:bridge-invoke", async (event, body) => {
  const { action } = body || {};
  logBridge(action);

  // All bridge calls (including intel-*) route through the Hub → Connector
  if (!getHubInfo().enabled) return hubNotConfiguredError();
  return hubCommandFromElectron(body);
});

// ─── macOS Dock icon handler ────────────────────────────────────────────────

if (process.platform === "darwin") {
  app.on("activate", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  writeToBridgeLog("Hyperclaw main process started");

  // Grant microphone permission for voice input (audio only, deny camera/geolocation/etc.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "media") {
      // Allow audio (microphone) access from our own app
      callback(true);
      return;
    }
    // Deny all other permissions by default
    callback(false);
  });

  // Also set permission check handler — Electron 20+ checks permissions before requesting them.
  // Without this, getUserMedia can be silently denied before setPermissionRequestHandler fires.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === "media") return true;
    return false;
  });

  // Enable getDisplayMedia() with native macOS screen picker.
  // This lets the renderer capture a screen/window via the system picker
  // WITHOUT needing the app-level Screen Recording permission (no restart required).
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ video: true });
  }, { useSystemPicker: true });

  // Permissions are now handled in the onboarding wizard (GuidedStepPermissions)

  // Start the bundled connector daemon (manages itself, restarts on crash)
  startConnector();

  createTray();
  createWindow();

  if (!isDev && app.isPackaged && isRemoteMode && autoUpdater) {
    setTimeout(
      () => autoUpdater.checkForUpdatesAndNotify().catch(console.error),
      5000
    );
  }
});

app.on("before-quit", () => {
  appIsQuiting = true;
  stopConnector();
  if (tray) tray.destroy();
  globalShortcut.unregisterAll(); // Unregister all global shortcuts including voice hotkey
});
