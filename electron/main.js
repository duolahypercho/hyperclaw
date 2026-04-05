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

// ─── IPC Handlers: Claude Code CLI ────────────────────────────────────────────

// Track active Claude Code subprocess per session
const claudeCodeProcesses = new Map();

/**
 * Build an enriched env with extra PATH entries so Electron GUI launches
 * can find binaries installed in user-local directories.
 */
function getEnrichedEnv() {
  const home = process.env.HOME || "";
  const extraPaths = [
    path.join(home, ".local", "bin"),
    path.join(home, "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".cargo", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ].join(":");
  return { ...process.env, PATH: `${extraPaths}:${process.env.PATH || ""}` };
}

/**
 * Check if `claude` CLI is available on the system.
 */
ipcMain.handle("claude-code:status", async () => {
  try {
    const { execFileSync } = require("child_process");
    const version = execFileSync("claude", ["--version"], {
      timeout: 5000,
      encoding: "utf-8",
      env: getEnrichedEnv(),
    }).trim();
    return { available: true, version };
  } catch (err) {
    return { available: false, error: err.message || "claude CLI not found" };
  }
});

/**
 * Send a message to Claude Code via the CLI.
 * Spawns `claude -p <message> --output-format stream-json` and collects output.
 */
ipcMain.handle("claude-code:send", async (event, body) => {
  const { message, sessionId, sessionKey, model, allowedTools } = body || {};
  if (!message || typeof message !== "string") {
    return { success: false, error: "No message provided" };
  }

  try {
    const { spawn } = require("child_process");

    const args = ["-p", message, "--output-format", "stream-json", "--verbose"];

    // Resume existing session
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    // Model selection
    if (model) {
      args.push("--model", model);
    }

    // Allowed tools
    if (allowedTools && Array.isArray(allowedTools) && allowedTools.length > 0) {
      args.push("--allowedTools", allowedTools.join(","));
    }

    return new Promise((resolve) => {
      const proc = spawn("claude", args, {
        timeout: 300000, // 5 minute timeout
        env: getEnrichedEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Track the process for abort
      if (sessionKey) {
        claudeCodeProcesses.set(sessionKey, proc);
      }

      let stdout = "";
      let stderr = "";
      const collectedMessages = [];
      let resolvedSessionId = sessionId || null;
      let lastToolCallId = null;

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();

        // Process complete lines
        const lines = stdout.split("\n");
        stdout = lines.pop() || ""; // keep incomplete last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);

            // Extract session ID
            if (event.session_id) {
              resolvedSessionId = event.session_id;
            }

            // Process different event types
            if (event.type === "assistant" && event.message) {
              const blocks = event.message.content || [];
              let textContent = "";
              let thinking;
              const toolCalls = [];

              for (const block of blocks) {
                if (block.type === "text" && block.text) {
                  textContent += block.text;
                } else if (block.type === "thinking" && block.text) {
                  thinking = block.text;
                } else if (block.type === "tool_use" && block.id && block.name) {
                  lastToolCallId = block.id;
                  toolCalls.push({
                    id: block.id,
                    name: block.name,
                    arguments: JSON.stringify(block.input || {}),
                    function: {
                      name: block.name,
                      arguments: JSON.stringify(block.input || {}),
                    },
                  });
                }
              }

              if (toolCalls.length > 0) {
                collectedMessages.push({
                  id: toolCalls[0].id || `cc-tool-${Date.now()}`,
                  role: "assistant",
                  content: textContent,
                  timestamp: Date.now(),
                  toolCalls,
                  ...(thinking && { thinking }),
                });
              } else if (textContent.trim()) {
                // Update the last text message or add new one
                const lastTextIdx = collectedMessages.findLastIndex(
                  (m) => m.role === "assistant" && !m.toolCalls
                );
                if (lastTextIdx !== -1) {
                  collectedMessages[lastTextIdx].content = textContent;
                } else {
                  collectedMessages.push({
                    id: `cc-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    role: "assistant",
                    content: textContent,
                    timestamp: Date.now(),
                    ...(thinking && { thinking }),
                  });
                }
              }
            } else if (event.type === "tool_result") {
              const toolCallId = event.tool_use_id || lastToolCallId || "";
              collectedMessages.push({
                id: `result-${toolCallId || Date.now()}`,
                role: "toolResult",
                content: event.tool_result || "",
                timestamp: Date.now(),
                toolResults: [{
                  toolCallId,
                  toolName: event.tool_name || "unknown",
                  content: event.tool_result || "",
                  isError: event.is_error || false,
                }],
              });
            } else if (event.type === "result" && event.result) {
              // Final result — update last text message
              const lastTextIdx = collectedMessages.findLastIndex(
                (m) => m.role === "assistant" && !m.toolCalls
              );
              if (lastTextIdx !== -1) {
                collectedMessages[lastTextIdx].content = event.result;
              } else {
                collectedMessages.push({
                  id: `cc-final-${Date.now()}`,
                  role: "assistant",
                  content: event.result,
                  timestamp: Date.now(),
                });
              }
            } else if (event.type === "error") {
              collectedMessages.push({
                id: `cc-err-${Date.now()}`,
                role: "assistant",
                content: `Error: ${event.error?.message || "Unknown error"}`,
                timestamp: Date.now(),
              });
            }
          } catch (parseErr) {
            console.warn("[claude-code:send] Skipping unparseable JSONL line:", trimmed.slice(0, 200), parseErr.message);
          }
        }
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        if (sessionKey) {
          claudeCodeProcesses.delete(sessionKey);
        }

        if (code !== 0 && collectedMessages.length === 0) {
          resolve({
            success: false,
            error: stderr.trim() || `Claude Code exited with code ${code}`,
            sessionId: resolvedSessionId,
          });
          return;
        }

        resolve({
          success: true,
          sessionId: resolvedSessionId,
          messages: collectedMessages,
        });
      });

      proc.on("error", (err) => {
        if (sessionKey) {
          claudeCodeProcesses.delete(sessionKey);
        }
        resolve({
          success: false,
          error: err.message || "Failed to spawn claude process",
          sessionId: resolvedSessionId,
        });
      });
    });
  } catch (err) {
    return { success: false, error: err.message || "Claude Code send failed" };
  }
});

/**
 * Abort an in-flight Claude Code request.
 */
ipcMain.handle("claude-code:abort", async (event, body) => {
  const { sessionKey } = body || {};
  if (!sessionKey) return { success: false, error: "No session key" };

  const proc = claudeCodeProcesses.get(sessionKey);
  if (!proc) return { success: false, error: "No active process for session" };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      claudeCodeProcesses.delete(sessionKey);
      resolve({ success: true, forced: true });
    }, 3000);

    proc.once("close", () => {
      clearTimeout(timeout);
      claudeCodeProcesses.delete(sessionKey);
      resolve({ success: true });
    });

    proc.kill("SIGTERM");
  });
});

/**
 * List Claude Code sessions using ~/.claude/history.jsonl index.
 * Filters to sessions whose project matches the current working directory.
 * Returns { sessions: [{ id, label, updatedAt }] }
 */
ipcMain.handle("claude-code:list-sessions", async (event, body) => {
  try {
    const home = process.env.HOME || "";
    const historyPath = path.join(home, ".claude", "history.jsonl");
    if (!fs.existsSync(historyPath)) return { sessions: [] };

    const cwd = body?.projectPath || process.cwd();
    const content = fs.readFileSync(historyPath, "utf-8");
    // Collect unique sessions — last entry per sessionId wins (has latest timestamp)
    const sessionMap = new Map();

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const proj = entry.project || "";
        // Match project to cwd (exact match or case-insensitive match)
        if (proj === cwd || proj.toLowerCase() === cwd.toLowerCase()) {
          const sid = entry.sessionId;
          if (!sid) continue;
          // Keep last occurrence (latest timestamp)
          sessionMap.set(sid, {
            id: sid,
            key: `claude:${sid}`,
            label: entry.display ? entry.display.slice(0, 80) : sid.slice(0, 8),
            updatedAt: entry.timestamp || 0,
          });
        }
      } catch (parseErr) {
        console.warn("[claude-code:list-sessions] Skipping malformed history line:", line.slice(0, 200), parseErr.message);
      }
    }

    const sessions = Array.from(sessionMap.values());
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return {
      sessions: sessions.slice(0, 50),
      hasMore: sessions.length > 50,
      totalCount: sessions.length,
    };
  } catch (err) {
    return { sessions: [], error: err.message };
  }
});

/**
 * Resolve the Claude Code project directory for a given project path.
 * Claude Code normalizes the absolute path: strips leading /, replaces / with -.
 * Underscores may or may not be replaced depending on the Claude Code version.
 */
function resolveClaudeProjectDir(projectPath) {
  const home = process.env.HOME || "";
  const projectsDir = path.join(home, ".claude", "projects");
  if (!fs.existsSync(projectsDir)) return null;

  const cwd = projectPath || process.cwd();
  const stripped = cwd.startsWith("/") ? cwd.slice(1) : cwd;
  const variant1 = stripped.replace(/\//g, "-"); // underscores preserved
  const variant2 = stripped.replace(/\//g, "-").replace(/_/g, "-"); // underscores also replaced

  const dirs = fs.readdirSync(projectsDir);

  // Try exact matches only — no substring fallback (prevents wrong-project bugs)
  if (dirs.includes(variant1)) return path.join(projectsDir, variant1);
  if (dirs.includes(variant2)) return path.join(projectsDir, variant2);

  console.warn(
    "[claude-code] Could not resolve project dir for:", cwd,
    "| Tried:", variant1, variant2
  );
  return null;
}

/**
 * Load full chat history for a Claude Code session.
 * Reads the JSONL file and parses user/assistant/tool messages.
 *
 * Claude Code JSONL format:
 *   type: "user"      → message.content is string or [{type:"text",text:"..."}] or [{type:"tool_result",...}]
 *   type: "assistant"  → message.content is [{type:"text",...}, {type:"thinking",...}, {type:"tool_use",...}]
 *   type: "system"     → system messages (skip)
 *   type: "file-history-snapshot" → file state (skip)
 */
ipcMain.handle("claude-code:load-history", async (event, body) => {
  const { sessionId, projectPath } = body || {};
  if (!sessionId) return { messages: [], error: "No session ID" };

  try {
    const projectDir = resolveClaudeProjectDir(projectPath);
    if (!projectDir) return { messages: [], error: "Project dir not found" };

    const filePath = path.join(projectDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return { messages: [], error: "Session file not found" };

    const content = fs.readFileSync(filePath, "utf-8");
    const messages = [];
    let msgIndex = 0;

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        if (entry.type === "user" && entry.message) {
          const msgContent = entry.message.content;

          // User messages can be:
          // 1. Plain string (regular user message)
          // 2. Array with text blocks (user message with context)
          // 3. Array with tool_result blocks (tool results sent back)
          if (typeof msgContent === "string") {
            messages.push({
              id: entry.message.id || `user-${msgIndex++}`,
              role: "user",
              content: msgContent,
              timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
            });
          } else if (Array.isArray(msgContent)) {
            // Check if this is a tool_result array
            const toolResults = msgContent.filter((b) => b.type === "tool_result");
            if (toolResults.length > 0) {
              for (const tr of toolResults) {
                const resultContent = typeof tr.content === "string"
                  ? tr.content
                  : Array.isArray(tr.content)
                    ? tr.content.map((c) => c.text || JSON.stringify(c)).join("\n")
                    : JSON.stringify(tr.content || "");
                messages.push({
                  id: `tool-${msgIndex++}`,
                  role: "toolResult",
                  content: resultContent.slice(0, 2000), // Truncate large tool results
                  timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
                  toolResults: [{
                    toolCallId: tr.tool_use_id || "",
                    toolName: "",
                    content: resultContent.slice(0, 2000),
                    isError: tr.is_error || false,
                  }],
                });
              }
            } else {
              // Regular user message with text blocks
              const textParts = msgContent
                .filter((b) => b.type === "text" && b.text)
                .map((b) => b.text);
              if (textParts.length > 0) {
                messages.push({
                  id: entry.message.id || `user-${msgIndex++}`,
                  role: "user",
                  content: textParts.join("\n"),
                  timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
                });
              }
            }
          }
        } else if (entry.type === "assistant" && entry.message) {
          const blocks = entry.message.content || [];
          if (!Array.isArray(blocks)) continue;

          let textContent = "";
          let thinking;
          const toolCalls = [];

          for (const block of blocks) {
            if (block.type === "text" && block.text) {
              textContent += block.text;
            } else if (block.type === "thinking" && block.text) {
              thinking = block.text;
            } else if (block.type === "tool_use" && block.id && block.name) {
              toolCalls.push({
                id: block.id,
                name: block.name,
                arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input || {}),
              });
            }
          }

          if (textContent || toolCalls.length > 0 || thinking) {
            messages.push({
              id: entry.message.id || `asst-${msgIndex++}`,
              role: "assistant",
              content: textContent,
              timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
              ...(thinking && { thinking }),
              ...(toolCalls.length > 0 && { toolCalls }),
            });
          }
        }
        // Skip: file-history-snapshot, system, summary, etc.
      } catch (parseErr) {
        console.warn("[claude-code:load-history] Skipping malformed JSONL line:", line.slice(0, 200), parseErr.message);
      }
    }

    return { messages, sessionId };
  } catch (err) {
    return { messages: [], error: err.message };
  }
});

/**
 * List Codex sessions from ~/.codex/session_index.jsonl.
 * Returns { sessions: [{ id, label, updatedAt }] }
 */
ipcMain.handle("codex:list-sessions", async () => {
  try {
    const home = process.env.HOME || "";
    const indexPath = path.join(home, ".codex", "session_index.jsonl");
    if (!fs.existsSync(indexPath)) return { sessions: [] };

    const content = fs.readFileSync(indexPath, "utf-8");
    const sessions = [];

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        sessions.push({
          id: entry.id,
          key: `codex:${entry.id}`,
          label: entry.thread_name || entry.id?.slice(0, 8) || "Codex session",
          updatedAt: entry.updated_at ? new Date(entry.updated_at).getTime() : 0,
        });
      } catch { /* skip malformed line */ }
    }

    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { sessions: sessions.slice(0, 50) };
  } catch (err) {
    return { sessions: [], error: err.message };
  }
});

/**
 * Load full chat history for a Codex session.
 * Sessions are stored as date-nested JSONL files:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-*-<sessionId>.jsonl
 *
 * Codex JSONL format:
 *   type: "event_msg"     → payload.type: "user_message" | "agent_message"
 *   type: "response_item" → payload.role: "user" | "assistant" with content blocks
 *   type: "session_meta"  → session metadata (skip)
 */
ipcMain.handle("codex:load-history", async (event, body) => {
  const { sessionId } = body || {};
  if (!sessionId) return { messages: [], error: "No session ID" };

  try {
    const home = process.env.HOME || "";
    const sessionsDir = path.join(home, ".codex", "sessions");
    if (!fs.existsSync(sessionsDir)) return { messages: [], error: "No sessions dir" };

    // Find the JSONL file by searching date dirs for matching session ID
    let filePath = null;
    const findRecursive = (dir) => {
      if (filePath) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          findRecursive(full);
        } else if (e.name.endsWith(".jsonl") && e.name.includes(sessionId)) {
          filePath = full;
          return;
        }
      }
    };
    findRecursive(sessionsDir);

    if (!filePath) return { messages: [], error: "Session file not found" };

    const content = fs.readFileSync(filePath, "utf-8");
    const messages = [];
    let msgIndex = 0;

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const payload = entry.payload || {};
        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();

        if (entry.type === "event_msg") {
          if (payload.type === "user_message" && payload.message) {
            messages.push({
              id: `codex-user-${msgIndex++}`,
              role: "user",
              content: payload.message,
              timestamp: ts,
            });
          } else if (payload.type === "agent_message" && payload.message) {
            messages.push({
              id: `codex-asst-${msgIndex++}`,
              role: "assistant",
              content: payload.message,
              timestamp: ts,
            });
          } else if (payload.type === "exec_command" || payload.type === "command_execution") {
            const cmd = payload.command || payload.args?.join(" ") || "";
            messages.push({
              id: `codex-tool-${msgIndex++}`,
              role: "assistant",
              content: "",
              timestamp: ts,
              toolCalls: [{
                id: `cmd-${msgIndex}`,
                name: "command",
                arguments: JSON.stringify({ command: cmd }),
              }],
            });
          }
        } else if (entry.type === "response_item") {
          const role = payload.role;
          const contentBlocks = payload.content || [];
          if (role === "user" && Array.isArray(contentBlocks)) {
            const texts = contentBlocks
              .filter((b) => (b.type === "input_text" || b.type === "text") && b.text)
              .map((b) => b.text);
            // Skip system/environment context blocks
            const userText = texts.find((t) => !t.startsWith("<environment_context>") && !t.startsWith("<instructions>"));
            if (userText) {
              // Avoid duplicate if event_msg already added this user message
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== userText) {
                messages.push({
                  id: `codex-user-${msgIndex++}`,
                  role: "user",
                  content: userText,
                  timestamp: ts,
                });
              }
            }
          } else if (role === "assistant" && Array.isArray(contentBlocks)) {
            const texts = contentBlocks
              .filter((b) => (b.type === "output_text" || b.type === "text") && b.text)
              .map((b) => b.text);
            if (texts.length > 0) {
              // Avoid duplicate if event_msg already added this
              const lastMsg = messages[messages.length - 1];
              const combined = texts.join("\n");
              if (!lastMsg || lastMsg.role !== "assistant" || lastMsg.content !== combined) {
                messages.push({
                  id: `codex-asst-${msgIndex++}`,
                  role: "assistant",
                  content: combined,
                  timestamp: ts,
                });
              }
            }
          }
        }
      } catch { /* skip malformed line */ }
    }

    return { messages, sessionId };
  } catch (err) {
    return { messages: [], error: err.message };
  }
});

/**
 * List Hermes sessions from ~/.hermes/sessions/*.jsonl.
 * Returns { sessions: [{ id, label, updatedAt }] }
 */
ipcMain.handle("hermes:list-sessions", async () => {
  try {
    const home = process.env.HOME || "";
    const sessionsDir = path.join(home, ".hermes", "sessions");
    if (!fs.existsSync(sessionsDir)) return { sessions: [] };

    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl") && !f.startsWith("request_dump"));
    const sessions = [];

    for (const file of files) {
      const sessionId = file.replace(".jsonl", "");
      const filePath = path.join(sessionsDir, file);
      try {
        const stat = fs.statSync(filePath);
        // Read first user message as label
        const content = fs.readFileSync(filePath, "utf-8");
        let label = "";
        let platform = "";
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.role === "session_meta") {
              platform = entry.platform || "";
            } else if (entry.role === "user" && entry.content && !label) {
              label = entry.content.slice(0, 80);
              break;
            }
          } catch { /* skip */ }
        }
        sessions.push({
          id: sessionId,
          key: `hermes:${sessionId}`,
          label: (platform ? `[${platform}] ` : "") + (label || sessionId.slice(0, 16)),
          updatedAt: stat.mtimeMs,
        });
      } catch { /* skip unreadable files */ }
    }

    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { sessions: sessions.slice(0, 50) };
  } catch (err) {
    return { sessions: [], error: err.message };
  }
});

/**
 * Load full chat history for a Hermes session.
 * Hermes JSONL format:
 *   role: "session_meta" → metadata (skip)
 *   role: "user"         → content is plain string
 *   role: "assistant"    → content + optional reasoning, tool_calls
 *   role: "tool"         → tool execution results
 */
ipcMain.handle("hermes:load-history", async (event, body) => {
  const { sessionId } = body || {};
  if (!sessionId) return { messages: [], error: "No session ID" };

  try {
    const home = process.env.HOME || "";
    const filePath = path.join(home, ".hermes", "sessions", `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return { messages: [], error: "Session file not found" };

    const content = fs.readFileSync(filePath, "utf-8");
    const messages = [];
    let msgIndex = 0;

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();

        if (entry.role === "user" && entry.content) {
          messages.push({
            id: `hermes-user-${msgIndex++}`,
            role: "user",
            content: entry.content,
            timestamp: ts,
          });
        } else if (entry.role === "assistant") {
          const toolCalls = [];
          if (entry.tool_calls && Array.isArray(entry.tool_calls)) {
            for (const tc of entry.tool_calls) {
              toolCalls.push({
                id: tc.id || `tc-${msgIndex}`,
                name: tc.function?.name || tc.name || "",
                arguments: typeof tc.function?.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || tc.arguments || {}),
              });
            }
          }
          messages.push({
            id: `hermes-asst-${msgIndex++}`,
            role: "assistant",
            content: entry.content || "",
            timestamp: ts,
            ...(entry.reasoning && { thinking: entry.reasoning }),
            ...(toolCalls.length > 0 && { toolCalls }),
          });
        } else if (entry.role === "tool") {
          messages.push({
            id: `hermes-tool-${msgIndex++}`,
            role: "toolResult",
            content: (entry.content || "").slice(0, 2000),
            timestamp: ts,
            toolResults: [{
              toolCallId: entry.tool_call_id || "",
              toolName: entry.name || "",
              content: (entry.content || "").slice(0, 2000),
              isError: false,
            }],
          });
        }
        // Skip: session_meta, system
      } catch { /* skip malformed line */ }
    }

    return { messages, sessionId };
  } catch (err) {
    return { messages: [], error: err.message };
  }
});

// ─── IPC Handlers: OpenAI Codex CLI ───────────────────────────────────────────

// Track active Codex subprocess per session
const codexProcesses = new Map();

/**
 * Check if `codex` CLI is available on the system.
 */
ipcMain.handle("codex:status", async () => {
  try {
    const { execFileSync } = require("child_process");
    const version = execFileSync("codex", ["--version"], {
      timeout: 5000,
      encoding: "utf-8",
      env: getEnrichedEnv(),
    }).trim();
    return { available: true, version };
  } catch (err) {
    return { available: false, error: err.message || "codex CLI not found" };
  }
});

/**
 * Send a message to Codex via the CLI.
 * Spawns `codex exec <message> --json` (or `codex resume <id> <message> --json`)
 * and collects JSONL output.
 *
 * Codex JSONL event types:
 *   thread.started  → { thread_id }
 *   item.completed  → { item: { type: "agent_message", text } }
 *   item.completed  → { item: { type: "command_execution", command, aggregated_output, exit_code } }
 *   turn.completed  → { usage: { input_tokens, output_tokens } }
 */
ipcMain.handle("codex:send", async (event, body) => {
  const { message, sessionId, sessionKey, model } = body || {};
  if (!message || typeof message !== "string") {
    return { success: false, error: "No message provided" };
  }

  try {
    const { spawn } = require("child_process");

    let args;
    if (sessionId) {
      // Resume existing session
      args = ["resume", sessionId, message, "--color", "never"];
    } else {
      args = ["exec", message, "--json", "--color", "never", "-s", "read-only", "--skip-git-repo-check"];
    }

    if (model) {
      args.push("-m", model);
    }

    return new Promise((resolve) => {
      const proc = spawn("codex", args, {
        timeout: 300000, // 5 minute timeout
        env: getEnrichedEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (sessionKey) {
        codexProcesses.set(sessionKey, proc);
      }

      let stdout = "";
      let stderr = "";
      const collectedMessages = [];
      let resolvedSessionId = sessionId || null;

      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();

        const lines = stdout.split("\n");
        stdout = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);

            // Extract thread/session ID
            if (event.type === "thread.started" && event.thread_id) {
              resolvedSessionId = event.thread_id;
            }

            // Agent message
            if (event.type === "item.completed" && event.item) {
              const item = event.item;

              if (item.type === "agent_message" && item.text) {
                // Update last text message or create new one
                const lastTextIdx = collectedMessages.findLastIndex(
                  (m) => m.role === "assistant" && !m.toolCalls
                );
                if (lastTextIdx !== -1) {
                  collectedMessages[lastTextIdx].content = item.text;
                } else {
                  collectedMessages.push({
                    id: item.id || `cx-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    role: "assistant",
                    content: item.text,
                    timestamp: Date.now(),
                  });
                }
              }

              // Command execution (tool use)
              if (item.type === "command_execution") {
                // Tool call message
                collectedMessages.push({
                  id: item.id || `cx-tool-${Date.now()}`,
                  role: "assistant",
                  content: "",
                  timestamp: Date.now(),
                  toolCalls: [{
                    id: item.id || `cx-tool-${Date.now()}`,
                    name: "shell",
                    arguments: JSON.stringify({ command: item.command }),
                    function: {
                      name: "shell",
                      arguments: JSON.stringify({ command: item.command }),
                    },
                  }],
                });

                // Tool result message
                collectedMessages.push({
                  id: `result-${item.id || Date.now()}`,
                  role: "toolResult",
                  content: item.aggregated_output || "",
                  timestamp: Date.now(),
                  toolResults: [{
                    toolCallId: item.id || "",
                    toolName: "shell",
                    content: item.aggregated_output || "",
                    isError: item.exit_code !== 0,
                  }],
                });
              }
            }
          } catch {
            // Ignore unparseable lines
          }
        }
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("close", (code) => {
        if (sessionKey) {
          codexProcesses.delete(sessionKey);
        }

        if (code !== 0 && collectedMessages.length === 0) {
          resolve({
            success: false,
            error: stderr.trim() || `Codex exited with code ${code}`,
            sessionId: resolvedSessionId,
          });
          return;
        }

        resolve({
          success: true,
          sessionId: resolvedSessionId,
          messages: collectedMessages,
        });
      });

      proc.on("error", (err) => {
        if (sessionKey) {
          codexProcesses.delete(sessionKey);
        }
        resolve({
          success: false,
          error: err.message || "Failed to spawn codex process",
          sessionId: resolvedSessionId,
        });
      });
    });
  } catch (err) {
    return { success: false, error: err.message || "Codex send failed" };
  }
});

/**
 * Abort an in-flight Codex request.
 */
ipcMain.handle("codex:abort", async (event, body) => {
  const { sessionKey } = body || {};
  if (!sessionKey) return { success: false, error: "No session key" };

  const proc = codexProcesses.get(sessionKey);
  if (proc) {
    proc.kill("SIGTERM");
    codexProcesses.delete(sessionKey);
    return { success: true };
  }
  return { success: false, error: "No active process for session" };
});

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
  if (tray) tray.destroy();
  globalShortcut.unregisterAll(); // Unregister all global shortcuts including voice hotkey
});
