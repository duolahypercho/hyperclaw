const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Tray,
  Menu,
  MenuItem,
  nativeImage,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const { exec, execSync, spawn } = require("child_process");
const crypto = require("crypto");
const { subtle } = require("node:crypto").webcrypto;

const isDev = process.env.NODE_ENV === "development";

// #region agent log
const DEBUG_LOG_DIR = path.join(__dirname, "..", ".cursor");
const DEBUG_LOG_PATH = path.join(DEBUG_LOG_DIR, "debug-d4447e.log");
function debugLog(location, message, data, hypothesisId) {
  const line =
    JSON.stringify({
      sessionId: "d4447e",
      location,
      message,
      data: data || {},
      hypothesisId,
      timestamp: Date.now(),
    }) + "\n";
  try {
    if (!fs.existsSync(DEBUG_LOG_DIR)) fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
    fs.appendFileSync(DEBUG_LOG_PATH, line, "utf8");
  } catch (e) {
    try {
      const fallback = path.join(app.getPath("userData"), "debug-d4447e.log");
      fs.appendFileSync(fallback, line, "utf8");
    } catch (_) {}
  }
}
// #endregion

// Log crashes so we can debug "opens then closes" (run from Terminal to see output)
function logCrash(label, err) {
  const msg = `${label}: ${err && (err.stack || err.message || err)}\n`;
  console.error(msg);
  try {
    const os = require("os");
    const logPath = path.join(os.homedir(), ".openclaw", "copanion-crash.log");
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

// Set app name and App User Model ID to "Copanion" everywhere (notifications, taskbar, etc.)
app.setName("Copanion");
app.setAppUserModelId("Copanion");

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
  remoteUrl: "https://app.claw.hypercho.com",
  localUrl: "http://localhost:1000",
};

try {
  const configPath = path.join(__dirname, "app-config.json");
  if (fs.existsSync(configPath)) {
    appConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (error) {
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

// Window and Tray Functions
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
  const remoteIconUrl = "https://app.claw.hypercho.com/tray.png";
  
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
        label: "Show Copanion",
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
        label: "Quit",
        click: () => {
          appIsQuiting = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip("Copanion");
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
  console.log("[Copanion] preload path:", preloadPath, "exists:", preloadExists);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: "Copanion",
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

  // Decide URL to load (respects app-config.json: local = localhost:1000, remote = app.claw.hypercho.com)
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
    // #region agent log
    debugLog("main.js:did-fail-load", "page failed to load -> will load errorHtml", {
      errorCode,
      errorDescription,
      validatedURL,
    }, "H2");
    // #endregion
    const errorHtml = `data:text/html,<html><body style="background:#000319;color:#BEC1DD;font-family:sans-serif;padding:40px;"><h1>Connection Error</h1><p>Failed to load: <b>${validatedURL}</b></p><p>Error: ${errorDescription} (Code: ${errorCode})</p><p>Attempted URL: <b>${urlToLoad}</b></p><p>Mode: ${isRemoteMode ? "Remote" : "Local"}</p></body></html>`;
    mainWindow.loadURL(errorHtml);
  });

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    // #region agent log
    debugLog("main.js:render-process-gone", "renderer process crashed or killed", {
      reason: details.reason,
      exitCode: details.exitCode,
    }, "H2");
    // #endregion
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

  // Handle external links - open in system browser instead of Electron window.
  // For internal URLs: Electron often loads about:blank when window.open() gets a relative URL
  // (e.g. "/Tool/OpenClaw"), so we create the child window ourselves with an absolute URL
  // and the same preload so the app and bridge work in the new window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url) return { action: "deny" };
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
        title: "Copanion",
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
      // #region agent log
      debugLog("main.js:setWindowOpenHandler child", "child.loadURL", { absoluteUrl }, "H2");
      // #endregion
      child.loadURL(absoluteUrl, { userAgent: mainWindow.webContents.getUserAgent() }).catch((err) => {
        console.error("Child window load failed:", err);
        child.close();
      });
      child.once("ready-to-show", () => child.show());
    });
    return { action: "deny" };
  });

  // Prevent navigation to external URLs within the Electron window
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const currentUrl = isRemoteMode ? remoteUrl : localUrl;
    const parsedCurrentUrl = new URL(currentUrl);

    // If navigating to an external URL, open in system browser and prevent navigation
    if (
      parsedUrl.origin !== parsedCurrentUrl.origin &&
      !navigationUrl.startsWith(localUrl) &&
      !navigationUrl.startsWith(remoteUrl)
    ) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // #region agent log
  debugLog("main.js:createWindow initial", "mainWindow.loadURL(urlToLoad)", { urlToLoad }, "H2");
  // #endregion
  mainWindow.loadURL(urlToLoad, {
    userAgent: mainWindow.webContents.getUserAgent(),
  }).catch((err) => {
    console.error("Load failed:", err);
    const errorHtml = `data:text/html,<html><body style="background:#000319;color:#BEC1DD;font-family:sans-serif;padding:40px;"><h1>Connection Error</h1><p>Error: ${err.message}</p><p>Attempted URL: <b>${urlToLoad}</b></p><p>Mode: ${isRemoteMode ? "Remote" : "Local"}</p><p>Please check your connection and ensure the server is accessible.</p></body></html>`;
    // #region agent log
    debugLog("main.js:createWindow load catch", "mainWindow.loadURL(errorHtml)", { url: errorHtml.slice(0, 80) }, "H2");
    // #endregion
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
    // For debugging remote mode issues, temporarily enable DevTools:
    // Uncomment the line below to debug remote loading issues
    // if (isRemoteMode) mainWindow.webContents.openDevTools();

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

// IPC Handlers for Window Controls — operate on the window that sent the IPC (main or child)
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
    title: title || "Copanion",
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

// ─── OpenClaw CLI Bridge ────────────────────────────────────────────────────
// All OpenClaw commands run in the main process (backend) and return results
// to the renderer via IPC. The renderer never spawns processes directly.

const os = require("os");
const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

const OPENCLAW_IDENTITY_PATH = path.join(OPENCLAW_HOME, "identity", "device.json");

// Read device identity
// Update getDeviceIdentity to also get device token from paired.json

const PAIRED_DEVICES_PATH = path.join(OPENCLAW_HOME, "devices", "paired.json");

function getDeviceIdentity() {
  try {
    if (!fs.existsSync(OPENCLAW_IDENTITY_PATH)) {
      return { error: "Device identity not found" };
    }
    const raw = fs.readFileSync(OPENCLAW_IDENTITY_PATH, "utf-8");
    const identity = JSON.parse(raw);
    
    // Also read paired devices to get device token
    let deviceToken = null;
    if (fs.existsSync(PAIRED_DEVICES_PATH)) {
      try {
        const pairedRaw = fs.readFileSync(PAIRED_DEVICES_PATH, "utf-8");
        const pairedDevices = JSON.parse(pairedRaw);
        const deviceEntry = pairedDevices[identity.deviceId];
        if (deviceEntry?.tokens?.operator?.token) {
          deviceToken = deviceEntry.tokens.operator.token;
        }
      } catch (e) {
        // Ignore errors reading paired devices
      }
    }
    
    return {
      deviceId: identity.deviceId,
      publicKeyPem: identity.publicKeyPem,
      privateKeyPem: identity.privateKeyPem,
      deviceToken: deviceToken,
      error: null
    };
  } catch (err) {
    return { error: err.message };
  }
}
function publicKeyPemToBase64Url(pem) {
  const base64Content = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');
  const der = Buffer.from(base64Content, 'base64');
  const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
  const raw = der.subarray(ED25519_SPKI_PREFIX.length);
  return raw.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

// Build payload
function buildDeviceAuthPayload(params) {
  const scopes = params.scopes ? params.scopes.join(",") : "";
  const token = params.token ?? "";
  return [
    "v2",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role || "operator",
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
  ].join("|");
}

// Sign payload
async function signDevicePayload(privateKeyPem, payload) {
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  const binaryDer = Buffer.from(pemContents, 'base64');
  const key = await subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  const encoder = new TextEncoder();
  const signature = await subtle.sign(
    'Ed25519',
    key,
    encoder.encode(payload)
  );
  return Buffer.from(signature).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

// When Electron is launched from Dock/GUI, PATH is often minimal and misses openclaw (pnpm/Homebrew/nvm).
// Prepend common install locations so spawn("openclaw", ...) finds the binary.
function openclawEnv() {
  const base = process.env.PATH || "";
  const candidates = [
    path.join(os.homedir(), "Library/pnpm"),
    path.join(os.homedir(), ".local/share/pnpm"),
    path.join(os.homedir(), ".local/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(os.homedir(), ".nvm/versions/node/current/bin"),
    path.join(os.homedir(), ".nvm/current/bin"),
  ];
  const extra = candidates.filter((p) => {
    if (!p) return false;
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  const joined = [...extra, base].filter(Boolean).join(path.delimiter);
  const env = { ...process.env, FORCE_COLOR: "0", PATH: joined };
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      env.OPENCLAW_CONFIG_PATH = OPENCLAW_CONFIG_PATH;
    }
  } catch (_) {}
  return env;
}
const CRON_JOBS_PATH = path.join(OPENCLAW_HOME, "cron", "jobs.json");
const CRON_RUNS_DIR = path.join(OPENCLAW_HOME, "cron", "runs");
const MAX_RUNS_PER_JOB = 200;
const ACTIVE_CRON_WINDOW_MS = 10 * 60 * 1000; // 10 mins — last run within this = "working", currentTask shows this task; else show previous (most recent) task
const OPENCLAW_IGNORE_FILES = ["memory.md", "agents.md", "soul.md", "tools.md", "heartbeat.md", "boostrap.md", "identity.md", "user.md"];
const OPENCLAW_IGNORE_DIRS = ["browser", "node_modules", "skills", "memory"];

function isOnlySessionHeader(content) {
  const trimmed = (content || "").trim();
  if (!trimmed) return true;
  const withoutHeader = trimmed.replace(
    /^\s*#\s*Session:[\s\S]*?\*\*Source\*\*:\s*.+$/m,
    ""
  ).trim();
  return withoutHeader.length === 0;
}

function readIdentityName(parentDir) {
  const candidates = [path.join(parentDir, "identity.md"), path.join(parentDir, "IDENTITY.md")];
  let identityPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      identityPath = p;
      break;
    }
  }
  if (!identityPath) return null;
  try {
    const content = fs.readFileSync(identityPath, "utf-8");
    // Match "Name:" with optional markdown bold (e.g. "Name: Doraemon", "- **Name:** Doraemon")
    const match = content.match(/\bName:\s*\**\s*:?\s*(.+?)\s*\**\s*$/im);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function listOpenClawMemorySources() {
  const sources = [];
  if (!fs.existsSync(OPENCLAW_HOME)) return sources;

  function collectMemoryFolders(dir, relativeFromRoot) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      const rel = relativeFromRoot ? `${relativeFromRoot}/${entry.name}` : entry.name;
      if (entry.name.toLowerCase() === "memory") {
        const parentRel = relativeFromRoot || ".";
        const tag = readIdentityName(dir) ?? (parentRel === "." ? "Main" : path.basename(dir));
        const basePath = relativeFromRoot ? `${relativeFromRoot}/memory` : "memory";
        const flatFiles = [];

        function walkMemory(curDir) {
          let list;
          try {
            list = fs.readdirSync(curDir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const e of list) {
            const fp = path.join(curDir, e.name);
            const subRel = path.relative(fullPath, fp).replace(/\\/g, "/");
            const fileRelativePath = basePath + (subRel ? `/${subRel}` : "");
            if (e.isDirectory()) {
              walkMemory(fp);
            } else if (e.isFile() && (e.name.toLowerCase().endsWith(".md") || e.name.toLowerCase().endsWith(".txt"))) {
              try {
                const stat = fs.statSync(fp);
                const raw = fs.readFileSync(fp, "utf-8");
                if (isOnlySessionHeader(raw)) continue;
                flatFiles.push({
                  name: e.name,
                  path: fileRelativePath,
                  updatedAt: stat.mtime.toISOString(),
                  sizeBytes: stat.size,
                });
              } catch {
                // skip unreadable
              }
            }
          }
        }
        walkMemory(fullPath);
        flatFiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        sources.push({ tag, basePath, files: flatFiles });
        continue;
      }
      collectMemoryFolders(fullPath, rel);
    }
  }

  collectMemoryFolders(OPENCLAW_HOME, "");
  return sources;
}

function listOpenClawMemoryFiles() {
  const sources = listOpenClawMemorySources();
  const flat = [];
  for (const s of sources) flat.push(...s.files);
  flat.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return flat;
}

function getOpenClawDocContent(relativePath) {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_HOME, relativePath);
  if (!resolved.startsWith(path.resolve(OPENCLAW_HOME))) {
    return { success: false, error: "Path escapes workspace" };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { success: false, error: "File not found" };
  }
  try {
    const content = fs.readFileSync(resolved, "utf-8");
    return { success: true, content };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

function writeOpenClawDocContent(relativePath, content) {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_HOME, relativePath);
  if (!resolved.startsWith(path.resolve(OPENCLAW_HOME))) {
    return { success: false, error: "Path escapes workspace" };
  }
  try {
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, typeof content === "string" ? content : "", "utf-8");
    return { success: true };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

function getOpenClawWorkspaceLabels() {
  const labels = {};
  if (!fs.existsSync(OPENCLAW_HOME)) return labels;
  try {
    const entries = fs.readdirSync(OPENCLAW_HOME, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(OPENCLAW_HOME, entry.name);
      const name = readIdentityName(fullPath);
      if (name) labels[entry.name] = name;
    }
  } catch {}
  return labels;
}

function listOpenClawAgentFiles() {
  const result = [];
  if (!fs.existsSync(OPENCLAW_HOME)) return result;
  function walk(dir, baseDir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (OPENCLAW_IGNORE_DIRS.includes(entry.name)) continue;
        walk(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if (!OPENCLAW_IGNORE_FILES.includes(entry.name.toLowerCase())) continue;
        try {
          const stat = fs.statSync(fullPath);
          result.push({
            relativePath,
            name: entry.name,
            updatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          });
        } catch {}
      }
    }
  }
  walk(OPENCLAW_HOME, OPENCLAW_HOME);
  result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return result;
}

/** List all .md files under ~/.openclaw except agent config files (memory.md, soul.md, etc.). Used by Docs widget. */
function listOpenClawMarkdownFiles() {
  const result = [];
  if (!fs.existsSync(OPENCLAW_HOME)) return result;
  function walk(dir, baseDir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (OPENCLAW_IGNORE_DIRS.includes(entry.name)) continue;
        walk(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if (OPENCLAW_IGNORE_FILES.includes(entry.name.toLowerCase())) continue;
        try {
          const stat = fs.statSync(fullPath);
          result.push({
            relativePath,
            name: entry.name,
            updatedAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          });
        } catch {}
      }
    }
  }
  walk(OPENCLAW_HOME, OPENCLAW_HOME);
  result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return result;
}

function deleteOpenClawPath(relativePath) {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_HOME, relativePath);
  const openclawResolved = path.resolve(OPENCLAW_HOME);
  if (!resolved.startsWith(openclawResolved)) {
    return { success: false, error: "Path escapes workspace" };
  }
  if (resolved === openclawResolved) {
    return { success: false, error: "Cannot delete workspace root" };
  }
  if (!fs.existsSync(resolved)) {
    return { success: false, error: "Not found" };
  }
  try {
    fs.rmSync(resolved, { recursive: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

function createOpenClawFolder(relativePath) {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return { success: false, error: "Invalid path" };
  }
  const resolved = path.resolve(OPENCLAW_HOME, relativePath);
  if (!resolved.startsWith(path.resolve(OPENCLAW_HOME))) {
    return { success: false, error: "Path escapes workspace" };
  }
  try {
    if (fs.existsSync(resolved)) {
      return { success: false, error: "Folder already exists" };
    }
    fs.mkdirSync(resolved, { recursive: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

function runOpenClawCommand(command, timeoutMs = 15000) {
  const env = openclawEnv();
  return new Promise((resolve, reject) => {
    const fullCommand = `openclaw ${command}`;
    const child = exec(fullCommand, {
      cwd: OPENCLAW_HOME,
      env,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject({ code: error.code, signal: error.signal, stderr: stderr.trim(), message: error.message });
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

function runOpenClawWithArgs(args, timeoutMs = 20000) {
  const env = openclawEnv();
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, { env, cwd: OPENCLAW_HOME });
    const chunks = [];
    const errChunks = [];
    child.stdout?.on("data", (chunk) => chunks.push(chunk));
    child.stderr?.on("data", (chunk) => errChunks.push(chunk));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject({ message: "Command timed out", stderr: Buffer.concat(errChunks).toString().trim() });
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks).toString().trim();
      const stderr = Buffer.concat(errChunks).toString().trim();
      if (code !== 0) {
        reject({ code, signal, stderr, message: stderr || `Exit ${code}` });
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject({ message: err.message, stderr: Buffer.concat(errChunks).toString().trim() });
    });
  });
}

ipcMain.handle("openclaw:check-installed", async () => {
  try {
    const result = await runOpenClawCommand("--version", 5000);
    return { installed: true, version: result.stdout };
  } catch {
    try {
      await runOpenClawCommand("cron list", 10000);
      return { installed: true, version: null };
    } catch {
      // Fallback: if gateway health succeeds, treat as installed (gateway is open = CLI can reach it)
      try {
        const healthResult = await runOpenClawCommand("health --json --timeout 4000", 6000);
        const data = JSON.parse(healthResult.stdout);
        if (data && data.ok === true) {
          return { installed: true, version: null };
        }
      } catch {
        // ignore
      }
      return { installed: false, version: null };
    }
  }
});

ipcMain.handle("openclaw:status", async () => {
  try {
    const result = await runOpenClawCommand("status");
    return { success: true, data: result.stdout };
  } catch (err) {
    return { success: false, error: err.message || err.stderr || "Failed to get status" };
  }
});

// Gateway is at ws://127.0.0.1:<port> (default 18789). We use the OpenClaw CLI to connect.
ipcMain.handle("openclaw:gateway-health", async () => {
  try {
    const result = await runOpenClawCommand("health --json --timeout 5000", 8000);
    const data = JSON.parse(result.stdout);
    return { healthy: Boolean(data && data.ok === true), error: data && data.ok !== true ? "Gateway health check did not return ok" : undefined };
  } catch (err) {
    return { healthy: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle("openclaw:get-gateway-connect-url", async () => {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return { gatewayUrl: "http://127.0.0.1:18789", token: null, error: "Config file not found" };
    }
    let raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf-8");
    let config;
    try {
      config = JSON.parse(raw);
    } catch {
      // OpenClaw config may be JSON5 (comments, trailing commas)
      raw = raw
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/,(\s*[}\]])/g, "$1");
      try {
        config = JSON.parse(raw);
      } catch {
        return { gatewayUrl: "http://127.0.0.1:18789", token: null, error: "Config is not valid JSON" };
      }
    }
    const port = config?.gateway?.port ?? 18789;
    // Token: config first, then env (OpenClaw uses OPENCLAW_GATEWAY_PASSWORD for token mode)
    const token =
      config?.gateway?.auth?.token ??
      process.env.OPENCLAW_GATEWAY_PASSWORD ??
      process.env.OPENCLAW_GATEWAY_TOKEN ??
      null;
    const gatewayUrl = `http://127.0.0.1:${port}`;
    return { gatewayUrl, token, error: null };
  } catch (err) {
    return {
      gatewayUrl: "http://127.0.0.1:18789",
      token: null,
      error: err && err.message ? err.message : String(err),
    };
  }
});


// IPC handlers for device identity
ipcMain.handle("openclaw:get-device-identity", async () => {
  return getDeviceIdentity();
});

ipcMain.handle("openclaw:sign-connect-challenge", async (event, params) => {
  try {
    const identity = getDeviceIdentity();
    if (identity.error) {
      return { error: identity.error };
    }
    
    const { deviceId, publicKeyPem, privateKeyPem, deviceToken } = identity;
    console.log("[DEBUG] Device token from identity:", deviceToken);
    const { clientId, clientMode, role, scopes, token, nonce } = params;
    
    const signedAtMs = Date.now();
    const payload = buildDeviceAuthPayload({
      deviceId,
      clientId: clientId || "gateway-client",
      clientMode: clientMode || "backend",
      role: role || "operator",
      scopes: scopes || ["operator.read", "operator.write"],
      signedAtMs: signedAtMs,
      token,
      nonce,
    });
    
    const signature = await signDevicePayload(privateKeyPem, payload);
    
    return {
      device: {
        id: deviceId,
        publicKey: publicKeyPemToBase64Url(publicKeyPem),
        signature: signature,
        signedAt: signedAtMs,
        nonce: nonce,
      },
      client: {
        id: clientId || "gateway-client",
        version: "1.0",
        platform: "darwin",
        mode: clientMode || "backend",
      },
      role: role || "operator",
      scopes: scopes || ["operator.read", "operator.write"],
      deviceToken: deviceToken,
      error: null,
    };
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("openclaw:message-send", async (event, p) => {
  if (!p || typeof p.target !== "string" || !p.target.trim()) {
    return { success: false, error: "target is required" };
  }
  const hasMessage = typeof p.message === "string" && p.message.trim().length > 0;
  const hasMedia = typeof p.media === "string" && p.media.trim().length > 0;
  if (!hasMessage && !hasMedia) {
    return { success: false, error: "message or media is required" };
  }
  const sendArgs = ["message", "send", "--target", p.target.trim()];
  if (typeof p.channel === "string" && p.channel.trim()) sendArgs.push("--channel", p.channel.trim());
  if (typeof p.account === "string" && p.account.trim()) sendArgs.push("--account", p.account.trim());
  if (hasMessage) sendArgs.push("--message", p.message.trim());
  if (hasMedia) sendArgs.push("--media", p.media.trim());
  if (typeof p.replyTo === "string" && p.replyTo.trim()) sendArgs.push("--reply-to", p.replyTo.trim());
  if (p.silent === true) sendArgs.push("--silent");
  try {
    await runOpenClawWithArgs(sendArgs, 30000);
    return { success: true, data: "Message sent." };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const stderr = err && err.stderr ? err.stderr : "";
    return { success: false, error: stderr || msg };
  }
});

ipcMain.handle("openclaw:cron-list", async () => {
  try {
    const result = await runOpenClawCommand("cron list");
    return { success: true, data: result.stdout };
  } catch (err) {
    return { success: false, error: err.message || err.stderr || "Failed to list cron jobs" };
  }
});

ipcMain.handle("openclaw:cron-list-json", async () => {
  try {
    const result = await runOpenClawCommand("cron list --json --all", 30000);
    const parsed = JSON.parse(result.stdout);
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err.message || err.stderr || "Failed to list cron jobs" };
  }
});

function sanitizeCronId(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  const s = id.trim();
  if (!/^[a-f0-9-]{36}$/i.test(s)) return null;
  return s;
}

ipcMain.handle("openclaw:cron-enable", async (event, id) => {
  const safeId = sanitizeCronId(id);
  if (!safeId) return { success: false, error: "Invalid job id" };
  try {
    await runOpenClawCommand(`cron enable ${safeId}`, 15000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || err.stderr || "Failed to enable cron job" };
  }
});

ipcMain.handle("openclaw:cron-disable", async (event, id) => {
  const safeId = sanitizeCronId(id);
  if (!safeId) return { success: false, error: "Invalid job id" };
  try {
    await runOpenClawCommand(`cron disable ${safeId}`, 15000);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || err.stderr || "Failed to disable cron job" };
  }
});

ipcMain.handle("openclaw:agent-list", async () => {
  try {
    const workspacePath = path.join(OPENCLAW_HOME, "workspace");
    if (!fs.existsSync(workspacePath)) {
      return { success: true, data: [] };
    }
    const dirs = fs.readdirSync(workspacePath, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    const agents = [];
    for (const dir of dirs) {
      const soulPath = path.join(workspacePath, dir.name, "SOUL.md");
      const memoryPath = path.join(workspacePath, dir.name, "MEMORY.md");
      const agent = {
        name: dir.name,
        hasSoul: fs.existsSync(soulPath),
        hasMemory: fs.existsSync(memoryPath),
        soulContent: null,
      };
      if (agent.hasSoul) {
        try {
          agent.soulContent = fs.readFileSync(soulPath, "utf-8").slice(0, 2000);
        } catch {}
      }
      agents.push(agent);
    }
    return { success: true, data: agents };
  } catch (err) {
    return { success: false, error: err.message || "Failed to list agents" };
  }
});

ipcMain.handle("openclaw:run-command", async (event, args) => {
  if (!args || typeof args !== "string") {
    return { success: false, error: "Invalid command arguments" };
  }
  const blocked = ["rm ", "sudo ", "eval ", "exec "];
  if (blocked.some((b) => args.toLowerCase().includes(b))) {
    return { success: false, error: "Command blocked for safety" };
  }
  try {
    const result = await runOpenClawCommand(args);
    return { success: true, data: result.stdout };
  } catch (err) {
    return { success: false, error: err.message || err.stderr || "Command failed" };
  }
});

// ─── HyperClaw Bridge (two-way relay with OpenClaw plugin) ──────────────────
// Watches ~/.hyperclaw/ for changes written by the OpenClaw plugin and pushes
// them to the renderer. Also lets the renderer write commands back.

const HYPERCLAW_DATA_DIR = path.join(require("os").homedir(), ".hyperclaw");
const HYPERCLAW_EVENTS_PATH = path.join(HYPERCLAW_DATA_DIR, "events.jsonl");
const HYPERCLAW_COMMANDS_PATH = path.join(HYPERCLAW_DATA_DIR, "commands.jsonl");
const HYPERCLAW_TODO_DATA_PATH = path.join(HYPERCLAW_DATA_DIR, "todo.json");
const HYPERCLAW_OFFICE_DIR = path.join(HYPERCLAW_DATA_DIR, "office");
const HYPERCLAW_OFFICE_LAYOUT_PATH = path.join(HYPERCLAW_OFFICE_DIR, "layout.json");
const HYPERCLAW_OFFICE_SEATS_PATH = path.join(HYPERCLAW_OFFICE_DIR, "seats.json");
const HYPERCLAW_CHANNELS_PATH = path.join(HYPERCLAW_DATA_DIR, "channels.json");

function getHyperClawChannels() {
  try {
    if (!fs.existsSync(HYPERCLAW_CHANNELS_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(HYPERCLAW_CHANNELS_PATH, "utf-8"));
    return Array.isArray(raw.channels) ? raw.channels : [];
  } catch {
    return [];
  }
}

function ensureHyperClawDir() {
  if (!fs.existsSync(HYPERCLAW_DATA_DIR)) {
    fs.mkdirSync(HYPERCLAW_DATA_DIR, { recursive: true });
  }
}

// Pixel Office: layout and seats in ~/.hyperclaw/office/ so Claude Code / others can edit
function ensureHyperClawOfficeDir() {
  if (!fs.existsSync(HYPERCLAW_OFFICE_DIR)) {
    fs.mkdirSync(HYPERCLAW_OFFICE_DIR, { recursive: true });
  }
}

function readOfficeLayout() {
  ensureHyperClawOfficeDir();
  try {
    if (!fs.existsSync(HYPERCLAW_OFFICE_LAYOUT_PATH)) return { success: true, layout: null };
    const raw = fs.readFileSync(HYPERCLAW_OFFICE_LAYOUT_PATH, "utf-8");
    const layout = JSON.parse(raw);
    return { success: true, layout };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

function writeOfficeLayout(layout) {
  ensureHyperClawOfficeDir();
  try {
    fs.writeFileSync(HYPERCLAW_OFFICE_LAYOUT_PATH, JSON.stringify(layout, null, 2), "utf-8");
    return { success: true };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

function readOfficeSeats() {
  ensureHyperClawOfficeDir();
  try {
    if (!fs.existsSync(HYPERCLAW_OFFICE_SEATS_PATH)) return { success: true, seats: null };
    const raw = fs.readFileSync(HYPERCLAW_OFFICE_SEATS_PATH, "utf-8");
    const seats = JSON.parse(raw);
    return { success: true, seats };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

function writeOfficeSeats(seats) {
  ensureHyperClawOfficeDir();
  try {
    fs.writeFileSync(HYPERCLAW_OFFICE_SEATS_PATH, JSON.stringify(seats, null, 2), "utf-8");
    return { success: true };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

let eventsWatcher = null;
let tasksWatcher = null;
let lastEventsSize = 0;

function startBridgeWatchers() {
  ensureHyperClawDir();

  // Initialize events file size tracking
  try {
    if (fs.existsSync(HYPERCLAW_EVENTS_PATH)) {
      lastEventsSize = fs.statSync(HYPERCLAW_EVENTS_PATH).size;
    }
  } catch {}

  // Watch events.jsonl for new lines (OpenClaw → HyperClaw)
  try {
    eventsWatcher = fs.watch(HYPERCLAW_EVENTS_PATH, { persistent: false }, () => {
      try {
        const stat = fs.statSync(HYPERCLAW_EVENTS_PATH);
        if (stat.size <= lastEventsSize) {
          lastEventsSize = stat.size;
          return;
        }
        const fd = fs.openSync(HYPERCLAW_EVENTS_PATH, "r");
        const buf = Buffer.alloc(stat.size - lastEventsSize);
        fs.readSync(fd, buf, 0, buf.length, lastEventsSize);
        fs.closeSync(fd);
        lastEventsSize = stat.size;

        const newLines = buf.toString("utf-8").split("\n").filter(Boolean);
        for (const line of newLines) {
          try {
            const event = JSON.parse(line);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("hyperclaw:event", event);
            }
          } catch {}
        }
      } catch {}
    });
  } catch {}

  // Watch todo.json for changes (any direction); send tasks array to renderer
  try {
    tasksWatcher = fs.watch(HYPERCLAW_TODO_DATA_PATH, { persistent: false }, () => {
      try {
        const raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
        const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("hyperclaw:tasks-changed", tasks);
        }
      } catch {}
    });
  } catch {}
}

function stopBridgeWatchers() {
  if (eventsWatcher) { eventsWatcher.close(); eventsWatcher = null; }
  if (tasksWatcher) { tasksWatcher.close(); tasksWatcher = null; }
}

// IPC: Read tasks from todo.json
ipcMain.handle("hyperclaw:get-tasks", () => {
  ensureHyperClawDir();
  try {
    if (!fs.existsSync(HYPERCLAW_TODO_DATA_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
    return Array.isArray(raw.tasks) ? raw.tasks : [];
  } catch {
    return [];
  }
});

// 24-char hex string compatible with MongoDB ObjectId format (used by TodoList backend).
function generateHyperClawTaskId() {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");
  let random = "";
  for (let i = 0; i < 16; i++) {
    random += Math.floor(Math.random() * 16).toString(16);
  }
  return timestamp + random;
}

// IPC: Write a task from the UI (optional task.id for existing ObjectId)
ipcMain.handle("hyperclaw:add-task", (event, task) => {
  ensureHyperClawDir();
  let raw = { tasks: [], lists: [], activeTaskId: null };
  try {
    if (fs.existsSync(HYPERCLAW_TODO_DATA_PATH)) {
      raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
      if (!Array.isArray(raw.tasks)) raw.tasks = [];
    }
  } catch {}
  const now = new Date().toISOString();
  const existingId = task && task.id && /^[0-9a-f]{24}$/i.test(String(task.id)) ? String(task.id) : null;
  const newTask = {
    ...task,
    id: existingId || generateHyperClawTaskId(),
    createdAt: now,
    updatedAt: now,
  };
  raw.tasks.push(newTask);
  fs.writeFileSync(HYPERCLAW_TODO_DATA_PATH, JSON.stringify(raw, null, 2), "utf-8");
  return newTask;
});

// IPC: Update a task from the UI
ipcMain.handle("hyperclaw:update-task", (event, { id, patch }) => {
  ensureHyperClawDir();
  try {
    const raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...patch, updatedAt: new Date().toISOString() };
    raw.tasks = tasks;
    fs.writeFileSync(HYPERCLAW_TODO_DATA_PATH, JSON.stringify(raw, null, 2), "utf-8");
    return tasks[idx];
  } catch {
    return null;
  }
});

// IPC: Delete a task (keeps ~/.hyperclaw/todo.json in sync when task is deleted in app)
ipcMain.handle("hyperclaw:delete-task", (event, id) => {
  ensureHyperClawDir();
  try {
    if (!fs.existsSync(HYPERCLAW_TODO_DATA_PATH)) return { success: true };
    const raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === tasks.length) return { success: false };
    raw.tasks = filtered;
    fs.writeFileSync(HYPERCLAW_TODO_DATA_PATH, JSON.stringify(raw, null, 2), "utf-8");
    return { success: true };
  } catch {
    return { success: false };
  }
});

// IPC: Send a command from HyperClaw → OpenClaw
function appendBridgeCommand(command) {
  ensureHyperClawDir();
  const entry = {
    type: command.type,
    timestamp: new Date().toISOString(),
    source: "hyperclaw",
    payload: command.payload || {},
  };
  fs.appendFileSync(HYPERCLAW_COMMANDS_PATH, JSON.stringify(entry) + "\n", "utf-8");
  return { success: true };
}

ipcMain.handle("hyperclaw:send-command", (event, command) => {
  return appendBridgeCommand(command);
});

// Trigger OpenClaw agent to read commands.jsonl and process generate_daily_summary (writes to ~/.hyperclaw/daily-summaries/).
const PROCESS_COMMANDS_MESSAGE =
  "Process the HyperClaw command queue: call hyperclaw_read_commands. " +
  "For each command of type 'generate_daily_summary', use the date in the payload, " +
  "call hyperclaw_generate_daily_summary for that date, summarize the memories with your LLM into a short TL;DR, " +
  "then call hyperclaw_write_daily_summary with that date and the summary content. Process all such commands.";

ipcMain.handle("hyperclaw:trigger-process-commands", async () => {
  const timeoutMs = 180000;
  const escaped = PROCESS_COMMANDS_MESSAGE.replace(/'/g, "'\"'\"'");
  const cmd = `agent --message '${escaped}'`;
  try {
    const result = await runOpenClawCommand(cmd, timeoutMs);
    return { success: true, stdout: result.stdout };
  } catch (err) {
    return { success: false, error: err.message || err.stderr || "OpenClaw agent failed" };
  }
});

// ─── HyperClaw Bridge API parity (for production: desktop app uses IPC instead of Vercel) ─
const LOG_DIR = path.join(require("os").homedir(), ".openclaw", "logs");

function getLogPath() {
  // Try gateway.log first (standard OpenClaw log)
  const p = path.join(LOG_DIR, "gateway.log");
  if (fs.existsSync(p)) return p;
  
  // Fallback to dated log (legacy/custom setup)
  const today = new Date().toISOString().split("T")[0];
  return path.join(LOG_DIR, `openclaw-${today}.log`);
}

function parseLogLine(line) {
  if (!line || !line.trim()) return null;
  try {
    const obj = JSON.parse(line);
    return {
      time: obj.time || "",
      level: (obj._meta && obj._meta.logLevelName) ? obj._meta.logLevelName : "INFO",
      message: obj[0] || "",
    };
  } catch {
    // 2026-02-22T23:22:22.682Z [ws] ⇄ res ✓ chat.send ...
    const match = line.match(/^(\S+) \[([^\]]+)\] (.+)$/);
    if (match) {
      return {
        time: match[1],
        level: match[2],
        message: match[3],
      };
    }
    // Fallback for lines without [] tag but with timestamp
    const matchSimple = line.match(/^(\S+) (.+)$/);
    if (matchSimple && !isNaN(Date.parse(matchSimple[1]))) {
       return {
         time: matchSimple[1],
         level: "INFO",
         message: matchSimple[2]
       };
    }
    return { time: "", level: "INFO", message: line };
  }
}

function getLogs(lines = 100) {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) return [];
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    const allLines = content.split("\n").filter(Boolean);
    const skip = (msg) =>
      /Gateway failed to start|gateway already running|Port 18789 is already in use|Gateway service appears loaded|lock timeout|launchctl bootout|openclaw gateway stop|gateway timeout|Chrome extension relay|browser failed/i.test(msg);
    const parsed = allLines
      .map(parseLogLine)
      .filter(Boolean)
      .filter((log) => !skip(log.message || ""));
    return parsed.slice(-lines);
  } catch {
    return [];
  }
}

function getTeam() {
  try {
    const env = openclawEnv();
    const output = execSync("openclaw agents list", { encoding: "utf-8", timeout: 10000, cwd: OPENCLAW_HOME, env });
    const lines = output.split("\n");
    const agents = [];
    let current = null;

    for (const line of lines) {
      const bullet = line.match(/^\s*-\s+([a-z0-9_-]+)(?:\s+\(([^)]+)\))?\s*$/i);
      if (bullet) {
        if (current) {
          agents.push(buildTeamAgent(current));
        }
        const id = bullet[1];
        const label = bullet[2];
        current = {
          id,
          name: label && label.toLowerCase() !== "default" ? label : null,
          isDefault: (label && label.toLowerCase() === "default") || id === "main",
          workspace: null,
          agentDir: null,
          model: null,
          routingRules: null,
          routing: null,
        };
        continue;
      }
      if (!current) continue;

      const identity = line.match(/^\s*Identity:\s+.+?\s+(\S+)\s+\(IDENTITY\.md\)/i);
      if (identity) {
        current.name = current.name || identity[1];
        continue;
      }
      const workspace = line.match(/^\s*Workspace:\s+(.+)$/);
      if (workspace) {
        current.workspace = workspace[1].trim();
        continue;
      }
      const agentDir = line.match(/^\s*Agent dir:\s+(.+)$/i);
      if (agentDir) {
        current.agentDir = agentDir[1].trim();
        continue;
      }
      const model = line.match(/^\s*Model:\s+(.+)$/);
      if (model) {
        current.model = model[1].trim();
        continue;
      }
      const routingRules = line.match(/^\s*Routing rules:\s+(.+)$/i);
      if (routingRules) {
        current.routingRules = routingRules[1].trim();
        continue;
      }
      const routing = line.match(/^\s*Routing:\s+(.+)$/i);
      if (routing) {
        current.routing = routing[1].trim();
        continue;
      }
    }
    if (current) {
      agents.push(buildTeamAgent(current));
    }
    return agents;
  } catch (err) {
    const msg = err && (err.message || err.stderr || String(err));
    writeToBridgeLog(`getTeam failed: ${msg}`);
    return [];
  }
}

function buildTeamAgent(current) {
  const name = current.name || current.id.charAt(0).toUpperCase() + current.id.slice(1);
  const workspace = current.workspace ?? undefined;
  const workspaceFolder = workspace ? path.basename(path.normalize(workspace)) : undefined;
  return {
    id: current.id,
    name,
    status: current.isDefault ? "active" : "idle",
    role: current.name || undefined,
    workspace,
    workspaceFolder,
    agentDir: current.agentDir ?? undefined,
    model: current.model ?? undefined,
    routingRules: current.routingRules ?? undefined,
    routing: current.routing ?? undefined,
  };
}

function parseCronLine(trimmed) {
  if (!trimmed || trimmed.startsWith("ID=")) return null;
  const possibleId = trimmed.substring(0, 36);
  if (!/^[a-f0-9-]{36}$/i.test(possibleId)) return null;
  const id = possibleId;
  const rest = trimmed.substring(36).trim();
  const scheduleKeyword = rest.match(/\s+(cron|every)\s+/i);
  if (!scheduleKeyword || scheduleKeyword.index == null) return null;
  const name = rest.substring(0, scheduleKeyword.index).trim();
  let scheduleRaw = rest.substring(scheduleKeyword.index).trim();
  const firstSegment = scheduleRaw.split(/\s{2,}/)[0] || scheduleRaw;
  const isCron = firstSegment.toLowerCase().startsWith("cron");
  const schedule = isCron
    ? (firstSegment.match(/cron\s+(.+?)(?:\s+@|$)/i) || [])[1] || firstSegment
    : (firstSegment.match(/every\s+(.+)/i) || [])[1] || firstSegment;
  const segments = scheduleRaw.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const lastSegment = segments.length > 1 ? segments[segments.length - 1] : undefined;
  const agentId =
    lastSegment &&
    lastSegment.length < 50 &&
    !/^\d{4}-\d{2}-\d{2}/.test(lastSegment) &&
    lastSegment !== "enabled" &&
    lastSegment !== "disabled"
      ? lastSegment
      : undefined;
  return { id, name: name || id, schedule, agentId };
}

function getCrons() {
  try {
    const env = openclawEnv();
    const output = execSync("openclaw cron list", { encoding: "utf-8", timeout: 10000, cwd: OPENCLAW_HOME, env });
    const lines = output.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    const jobs = [];
    for (let i = 1; i < lines.length; i++) {
      const parsed = parseCronLine(lines[i].trim());
      if (parsed) jobs.push(parsed);
    }
    return jobs;
  } catch (err) {
    const msg = err && (err.message || err.stderr || String(err));
    writeToBridgeLog(`getCrons failed: ${msg}`);
    return [];
  }
}

function getCronRuns(jobIds) {
  const runsByJobId = {};
  if (!Array.isArray(jobIds) || !fs.existsSync(CRON_RUNS_DIR)) return runsByJobId;
  for (const jobId of jobIds) {
    if (!jobId || typeof jobId !== "string") continue;
    const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      const runs = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.runAtMs != null) runs.push(obj);
        } catch {}
      }
      const tail = runs.slice(-MAX_RUNS_PER_JOB);
      if (tail.length) runsByJobId[jobId] = tail;
    } catch {}
  }
  return runsByJobId;
}

/** Get paginated runs for a single job (newest first). Returns { runs, hasMore }. */
function getCronRunsForJob(jobId, limit = 10, offset = 0) {
  if (!jobId || typeof jobId !== "string" || /\.\.|[\\/]/.test(jobId) || jobId.length > 64) {
    return { runs: [], hasMore: false };
  }
  if (!fs.existsSync(CRON_RUNS_DIR)) return { runs: [], hasMore: false };
  const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) return { runs: [], hasMore: false };
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    const all = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.runAtMs != null) all.push(obj);
      } catch {}
    }
    const newestFirst = all.slice().reverse();
    const total = newestFirst.length;
    const page = newestFirst.slice(offset, offset + limit);
    return { runs: page, hasMore: offset + limit < total };
  } catch {
    return { runs: [], hasMore: false };
  }
}

/** Get full run record for one cron run (entire JSON line) for "Show more" / full log. */
function getCronRunDetail(jobId, runAtMs) {
  if (!jobId || typeof jobId !== "string" || /\.\.|[\\/]/.test(jobId) || jobId.length > 64) return null;
  if (runAtMs == null || typeof runAtMs !== "number") return null;
  if (!fs.existsSync(CRON_RUNS_DIR)) return null;
  const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.runAtMs === runAtMs) return obj;
      } catch {}
    }
  } catch {}
  return null;
}

/** Get the most recent run for a job (for lastRunAtMs/lastStatus when jobs.json has none). */
function getLastRunForJob(jobId) {
  if (!jobId || typeof jobId !== "string" || !fs.existsSync(CRON_RUNS_DIR)) return null;
  const filePath = path.join(CRON_RUNS_DIR, `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return null;
    const lastLine = lines[lines.length - 1];
    const obj = JSON.parse(lastLine);
    const runAtMs = obj.runAtMs ?? obj.runAt;
    if (runAtMs == null) return null;
    return {
      runAtMs,
      status: (obj.status && String(obj.status).toLowerCase()) || "idle",
    };
  } catch {
    return null;
  }
}

/** Cron job with state for Crons tool/widget: lastRunAtMs, nextRunAtMs, lastStatus, enabled. */
function getCronsWithState() {
  try {
    if (fs.existsSync(CRON_JOBS_PATH)) {
      const raw = fs.readFileSync(CRON_JOBS_PATH, "utf-8");
      const data = JSON.parse(raw);
      const list = data?.jobs;
      if (Array.isArray(list) && list.length > 0) {
        return list.map((job) => {
          const s = job.state || {};
          let lastRunAtMs = s.lastRunAtMs;
          let lastStatus = (s.lastStatus || "idle").toLowerCase();
          if (lastRunAtMs == null && job.id) {
            const lastRun = getLastRunForJob(job.id);
            if (lastRun) {
              lastRunAtMs = lastRun.runAtMs;
              lastStatus = lastRun.status;
            }
          }
          const schedule = job.schedule;
          let scheduleStr = "";
          if (schedule?.kind === "cron" && schedule.expr) scheduleStr = schedule.expr;
          else if (schedule?.kind === "every" && schedule.everyMs != null) {
            const ms = schedule.everyMs;
            if (ms % (24 * 60 * 60 * 1000) === 0) scheduleStr = `${ms / (24 * 60 * 60 * 1000)}d`;
            else if (ms % (60 * 60 * 1000) === 0) scheduleStr = `${ms / (60 * 60 * 1000)}h`;
            else if (ms % (60 * 1000) === 0) scheduleStr = `${ms / (60 * 1000)}m`;
            else scheduleStr = `${ms}m`;
          }
          return {
            id: job.id,
            name: job.name || job.id,
            schedule: scheduleStr,
            agentId: job.agentId,
            enabled: job.enabled !== false,
            nextRunAtMs: s.nextRunAtMs,
            lastRunAtMs,
            lastStatus,
          };
        });
      }
    }
  } catch (err) {
    writeToBridgeLog(`getCronsWithState (jobs.json) failed: ${err && (err.message || String(err))}`);
  }
  const cliCrons = getCrons();
  const jobIds = cliCrons.map((c) => c.id).filter(Boolean);
  const runsByJobId = getCronRuns(jobIds);
  return cliCrons.map((c) => {
    const runs = runsByJobId[c.id];
    const lastRun = runs && runs.length > 0 ? runs[runs.length - 1] : null;
    const lastRunAtMs = lastRun && (lastRun.runAtMs != null || lastRun.runAt != null)
      ? (lastRun.runAtMs ?? lastRun.runAt)
      : undefined;
    return {
      id: c.id,
      name: c.name,
      schedule: c.schedule,
      agentId: c.agentId,
      enabled: true,
      nextRunAtMs: undefined,
      lastRunAtMs,
      lastStatus: lastRun?.status === "running" ? "running" : lastRun ? "ok" : "idle",
    };
  });
}

/** Return a single cron job by id with full info (payload, schedule object, delivery, etc.) from jobs.json. */
function getCronById(jobId) {
  if (typeof jobId !== "string" || !jobId.trim()) return null;
  const id = jobId.trim();
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  try {
    if (!fs.existsSync(CRON_JOBS_PATH)) return null;
    const raw = fs.readFileSync(CRON_JOBS_PATH, "utf-8");
    const data = JSON.parse(raw);
    const list = data?.jobs;
    if (!Array.isArray(list)) return null;
    const job = list.find((j) => j && j.id === id);
    return job ?? null;
  } catch (err) {
    writeToBridgeLog(`getCronById failed: ${err && (err.message || String(err))}`);
    return null;
  }
}

function getConfig() {
  try {
    const configPath = path.join(OPENCLAW_HOME, "openclaw.json");
    if (!fs.existsSync(configPath)) return {};
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.providers) {
      for (const key of Object.keys(config.providers)) {
        const val = config.providers[key];
        if (val && typeof val === "object" && "apiKey" in val) val.apiKey = "***";
      }
    }
    return config;
  } catch {
    return {};
  }
}

/** Models from agents.defaults.models in openclaw.json: only model ids (keys), no alias or other attributes. */
function getDefaultModels() {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return [];
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf-8"));
    const models = config?.agents?.defaults?.models;
    if (!models || typeof models !== "object") return [];
    return Object.keys(models).map((id) => ({ id, name: id }));
  } catch {
    return [];
  }
}

function getEvents() {
  try {
    if (!fs.existsSync(HYPERCLAW_EVENTS_PATH)) return [];
    const eventLines = fs.readFileSync(HYPERCLAW_EVENTS_PATH, "utf-8").split("\n").filter(Boolean);
    const events = eventLines.slice(-50).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return events;
  } catch {
    return [];
  }
}

function getEmployeeStatus() {
  writeToBridgeLog("get-employee-status (main.js)");
  const team = getTeam();
  if (team.length === 0) writeToBridgeLog("get-employee-status: getTeam returned 0 agents (check getTeam failed above)");
  const crons = getCronsWithState();
  const now = Date.now();

  const employees = team.map((a) => {
    const aId = a.id.toLowerCase();
    const aName = (a.name && a.name.toLowerCase()) || "";
    const assignedCrons = crons.filter((c) => {
      const aid = (c.agentId || "").toLowerCase();
      return aid && (aid === aId || aid === aName);
    });
    const currentWorkingJobs = assignedCrons.filter((c) => {
      if (c.lastStatus === "running") return true;
      if (c.lastRunAtMs != null && now - c.lastRunAtMs <= ACTIVE_CRON_WINDOW_MS) return true;
      return false;
    });
    const nextComingCrons = assignedCrons
      .filter((c) => c.nextRunAtMs != null && c.nextRunAtMs > now)
      .sort((x, y) => (x.nextRunAtMs || 0) - (y.nextRunAtMs || 0))
      .map((c) => ({ id: c.id, name: c.name, schedule: c.schedule, nextRunAtMs: c.nextRunAtMs, agentId: c.agentId }));
    const currentWorkingIds = new Set(currentWorkingJobs.map((c) => c.id));
    const previousTasks = assignedCrons
      .filter((c) => c.lastRunAtMs != null && !currentWorkingIds.has(c.id))
      .sort((x, y) => (y.lastRunAtMs || 0) - (x.lastRunAtMs || 0))
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.name, schedule: c.schedule, lastRunAtMs: c.lastRunAtMs, agentId: c.agentId }));
    const status = currentWorkingJobs.length > 0 ? "working" : "idle";
    let currentTask = "Idle";
    if (currentWorkingJobs.length > 0) {
      const byRecency = [...currentWorkingJobs].sort((x, y) => (y.lastRunAtMs || 0) - (x.lastRunAtMs || 0));
      currentTask = byRecency.map((c) => c.name).join(", ");
    } else {
      if (previousTasks.length > 0) currentTask = previousTasks[0].name || "Idle";
    }
    return {
      id: a.id,
      name: a.name,
      status,
      currentTask: currentTask || "Idle",
      currentWorkingJobs: currentWorkingJobs.map((c) => ({ id: c.id, name: c.name, schedule: c.schedule, agentId: c.agentId })),
      previousTasks,
      nextComingCrons,
    };
  });
  return { employees };
}

function readHyperClawTasks() {
  try {
    if (!fs.existsSync(HYPERCLAW_TODO_DATA_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
    return Array.isArray(raw.tasks) ? raw.tasks : [];
  } catch {
    return [];
  }
}

function getBridgeLogPath() {
  const os = require("os");
  return path.join(os.homedir(), ".openclaw", "copanion-bridge.log");
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

ipcMain.handle("hyperclaw:bridge-invoke", async (event, { action, task, id, patch, command, date, lines, startDate, endDate, jobIds, jobId, limit, offset, runAtMs, todoData, relativePath, content: docContent, layout: officeLayout, seats: officeSeats, agentId, agentName, cronAddParams, cronRunJobId, cronRunDue, cronEditJobId, cronEditParams, cronDeleteJobId }) => {
  logBridge(action);
  ensureHyperClawDir();
  switch (action) {
    case "list-agents": {
      return { success: true, data: getTeam() };
    }
    case "list-channels": {
      return { success: true, data: getHyperClawChannels() };
    }
    case "add-agent": {
      const name = typeof agentName === "string" ? agentName.trim() : "";
      if (!name) return { success: false, error: "Agent name is required" };
      if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return { success: false, error: "Agent name may only contain letters, numbers, underscores, hyphens, and dots" };
      if (name.length > 120) return { success: false, error: "Agent name too long" };
      const normalizedId = name.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (!normalizedId) return { success: false, error: "Agent name must contain at least one letter or number" };
      const workspacePath = path.join(OPENCLAW_HOME, "workspace-" + normalizedId);
      try {
        await runOpenClawWithArgs(["agents", "add", name, "--workspace", workspacePath, "--non-interactive"], 30000);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "Failed to add agent" };
      }
    }
    case "delete-agent": {
      const idOrName = typeof agentId === "string" ? agentId.trim() : "";
      if (!idOrName) return { success: false, error: "Agent id is required" };
      let normalizedId = idOrName.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (!normalizedId) return { success: false, error: "Invalid agent id" };
      // Strip "workspace-" prefix if present (workspace folders use this naming but agent ID is just the name)
      if (normalizedId.startsWith("workspace-")) {
        normalizedId = normalizedId.substring("workspace-".length);
      }
      if (!normalizedId) return { success: false, error: "Invalid agent id after stripping prefix" };
      if (normalizedId === "main") return { success: false, error: "Cannot delete the main agent" };
      try {
        await runOpenClawWithArgs(["agents", "delete", normalizedId, "--force"], 15000);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "Failed to delete agent" };
      }
    }
    case "list-openclaw-memory": {
      return { success: true, data: listOpenClawMemorySources() };
    }
    case "list-openclaw-agent-files": {
      const list = listOpenClawAgentFiles();
      const workspaceLabels = getOpenClawWorkspaceLabels();
      return { success: true, data: { files: list, workspaceLabels } };
    }
    case "list-openclaw-docs": {
      const docFiles = listOpenClawMarkdownFiles();
      const workspaceLabels = getOpenClawWorkspaceLabels();
      return { success: true, data: { files: docFiles, workspaceLabels } };
    }
    case "get-openclaw-doc": {
      return getOpenClawDocContent(relativePath || "");
    }
    case "write-openclaw-doc": {
      return writeOpenClawDocContent(relativePath || "", docContent ?? "");
    }
    case "delete-openclaw-doc": {
      return deleteOpenClawPath(relativePath || "");
    }
    case "create-openclaw-folder": {
      return createOpenClawFolder(relativePath || "");
    }
    case "trigger-process-commands": {
      try {
        const escaped = PROCESS_COMMANDS_MESSAGE.replace(/'/g, "'\"'\"'");
        const result = await runOpenClawCommand(`agent --message '${escaped}'`, 180000);
        return { success: true, stdout: result.stdout };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "OpenClaw agent failed" };
      }
    }
    case "get-todo-data": {
      ensureHyperClawDir();
      try {
        if (!fs.existsSync(HYPERCLAW_TODO_DATA_PATH)) return { tasks: [], lists: [], activeTaskId: null };
        return JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
      } catch { return { tasks: [], lists: [], activeTaskId: null }; }
    }
    case "save-todo-data": {
      ensureHyperClawDir();
      try {
        fs.writeFileSync(HYPERCLAW_TODO_DATA_PATH, JSON.stringify(todoData || { tasks: [], lists: [], activeTaskId: null }, null, 2), "utf-8");
        return { success: true };
      } catch (e) { return { success: false, error: e?.message || String(e) }; }
    }
    case "get-tasks":
      return readHyperClawTasks();
    case "add-task": {
      ensureHyperClawDir();
      let raw = { tasks: [], lists: [], activeTaskId: null };
      try {
        if (fs.existsSync(HYPERCLAW_TODO_DATA_PATH)) {
          raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
          if (!Array.isArray(raw.tasks)) raw.tasks = [];
        }
      } catch {}
      const now = new Date().toISOString();
      const newTask = { ...task, id: generateHyperClawTaskId(), createdAt: now, updatedAt: now };
      raw.tasks.push(newTask);
      fs.writeFileSync(HYPERCLAW_TODO_DATA_PATH, JSON.stringify(raw, null, 2), "utf-8");
      return newTask;
    }
    case "update-task": {
      ensureHyperClawDir();
      try {
        const raw = fs.existsSync(HYPERCLAW_TODO_DATA_PATH)
          ? JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"))
          : { tasks: [], lists: [], activeTaskId: null };
        const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
        const idx = tasks.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        tasks[idx] = { ...tasks[idx], ...patch, updatedAt: new Date().toISOString() };
        raw.tasks = tasks;
        fs.writeFileSync(HYPERCLAW_TODO_DATA_PATH, JSON.stringify(raw, null, 2), "utf-8");
        return tasks[idx];
      } catch {
        return null;
      }
    }
    case "delete-task": {
      try {
        if (!fs.existsSync(HYPERCLAW_TODO_DATA_PATH)) return { success: true };
        const raw = JSON.parse(fs.readFileSync(HYPERCLAW_TODO_DATA_PATH, "utf-8"));
        const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
        const filtered = tasks.filter((t) => t.id !== id);
        if (filtered.length === tasks.length) return { success: false };
        raw.tasks = filtered;
        fs.writeFileSync(HYPERCLAW_TODO_DATA_PATH, JSON.stringify(raw, null, 2), "utf-8");
        return { success: true };
      } catch {
        return { success: false };
      }
    }
    case "send-command": {
      return appendBridgeCommand(command);
    }
    case "get-events":
      return getEvents();
    case "get-logs":
      return getLogs(lines || 100);
    case "get-team":
      return getTeam();
    case "list-models":
      return { success: true, data: getDefaultModels() };
    case "get-crons":
      return getCronsWithState();
    case "get-cron-by-id": {
      const jid = typeof jobId === "string" ? jobId.trim() : "";
      const full = getCronById(jid);
      if (full == null) return { error: "Job not found" };
      return full;
    }
    case "get-cron-runs": {
      const ids = Array.isArray(jobIds) ? jobIds : getCrons().map((c) => c.id);
      return { runsByJobId: getCronRuns(ids) };
    }
    case "get-cron-runs-for-job": {
      const jid = jobId != null ? String(jobId) : "";
      const lim = typeof limit === "number" && limit > 0 ? Math.min(limit, 100) : 10;
      const off = typeof offset === "number" && offset >= 0 ? offset : 0;
      return getCronRunsForJob(jid, lim, off);
    }
    case "get-cron-run-detail": {
      const jid = jobId != null ? String(jobId) : "";
      const runAt = typeof runAtMs === "number" ? runAtMs : null;
      const detail = jid && runAt != null ? getCronRunDetail(jid, runAt) : null;
      if (detail == null) return { error: "Run not found" };
      return detail;
    }
    case "cron-add": {
      const p = cronAddParams && typeof cronAddParams === "object" ? cronAddParams : {};
      if (typeof p.name !== "string" || !p.name.trim()) {
        return { success: false, error: "name is required" };
      }
      const session = (p.session && String(p.session)) || "main";
      const hasAt = typeof p.at === "string" && p.at.trim().length > 0;
      const hasCron = typeof p.cron === "string" && p.cron.trim().length > 0;
      if (!hasAt && !hasCron) {
        return { success: false, error: "Either at (ISO or relative e.g. 20m) or cron expression is required" };
      }
      const args = ["cron", "add", "--name", p.name.trim(), "--session", session];
      if (hasAt) args.push("--at", p.at.trim());
      if (hasCron) args.push("--cron", p.cron.trim());
      if (typeof p.tz === "string" && p.tz.trim()) args.push("--tz", p.tz.trim());
      if (typeof p.message === "string" && p.message.trim()) args.push("--message", p.message.trim());
      if (typeof p.systemEvent === "string" && p.systemEvent.trim()) args.push("--system-event", p.systemEvent.trim());
      if (p.deleteAfterRun === true) args.push("--delete-after-run");
      if (p.announce === true) {
        args.push("--announce");
        if (typeof p.channel === "string" && p.channel.trim()) args.push("--channel", p.channel.trim());
        if (typeof p.to === "string" && p.to.trim()) args.push("--to", p.to.trim());
      }
      if (typeof p.stagger === "string" && p.stagger.trim()) args.push("--stagger", p.stagger.trim());
      if (typeof p.model === "string" && p.model.trim()) args.push("--model", p.model.trim());
      if (typeof p.thinking === "string" && p.thinking.trim()) args.push("--thinking", p.thinking.trim());
      if (typeof p.agent === "string" && p.agent.trim()) args.push("--agent", p.agent.trim());
      try {
        await runOpenClawWithArgs(args, 30000);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "Failed to add cron job" };
      }
    }
    case "cron-run": {
      const runJobId = typeof cronRunJobId === "string" ? cronRunJobId.trim() : "";
      if (!runJobId || !/^[a-f0-9-]{36}$/i.test(runJobId)) {
        return { success: false, error: "Valid job id is required" };
      }
      const args = ["cron", "run", runJobId];
      if (cronRunDue === true) args.push("--due");
      try {
        await runOpenClawWithArgs(args, 120000);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "Run failed" };
      }
    }
    case "cron-runs-sync": {
      const syncJobId = typeof jobId === "string" ? jobId.trim() : "";
      if (!syncJobId || !/^[a-f0-9-]{36}$/i.test(syncJobId)) {
        return { success: false, error: "Valid job id is required" };
      }
      try {
        await runOpenClawWithArgs(["cron", "runs", "--id", syncJobId, "--limit", "1"], 15000);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "Failed to sync cron runs" };
      }
    }
    case "cron-edit": {
      const editJobId = typeof cronEditJobId === "string" ? cronEditJobId.trim() : "";
      if (!editJobId || !/^[a-f0-9-]{36}$/i.test(editJobId)) {
        return { success: false, error: "Valid job id is required" };
      }
      const p = cronEditParams && typeof cronEditParams === "object" ? cronEditParams : {};
      const args = ["cron", "edit", editJobId];
      if (typeof p.name === "string" && p.name.trim()) args.push("--name", p.name.trim());
      if (typeof p.message === "string" && p.message.trim()) args.push("--message", p.message.trim());
      if (typeof p.model === "string" && p.model.trim()) args.push("--model", p.model.trim());
      if (typeof p.thinking === "string" && p.thinking.trim()) args.push("--thinking", p.thinking.trim());
      if (p.clearAgent === true) args.push("--clear-agent");
      else if (typeof p.agent === "string" && p.agent.trim()) args.push("--agent", p.agent.trim());
      if (p.exact === true) args.push("--exact");
      if (p.announce === true) {
        args.push("--announce");
        if (typeof p.channel === "string" && p.channel.trim()) args.push("--channel", p.channel.trim());
        if (typeof p.to === "string" && p.to.trim()) args.push("--to", p.to.trim());
      }
      if (args.length === 3) {
        return { success: false, error: "At least one field to update is required" };
      }
      try {
        await runOpenClawWithArgs(args, 15000);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "Failed to update job" };
      }
    }
    case "cron-delete": {
      const delJobId = typeof cronDeleteJobId === "string" ? cronDeleteJobId.trim() : "";
      if (!delJobId || !/^[a-f0-9-]{36}$/i.test(delJobId)) {
        return { success: false, error: "Valid job id is required" };
      }
      try {
        await runOpenClawWithArgs(["cron", "rm", delJobId], 15000);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || err.stderr || "Failed to delete cron job" };
      }
    }
    case "get-employee-status":
      return getEmployeeStatus();
    case "get-config":
      return getConfig();
    case "read-office-layout":
      return readOfficeLayout();
    case "write-office-layout": {
      if (!officeLayout || typeof officeLayout !== "object") return { success: false, error: "Missing layout" };
      return writeOfficeLayout(officeLayout);
    }
    case "read-office-seats":
      return readOfficeSeats();
    case "write-office-seats": {
      if (officeSeats == null || typeof officeSeats !== "object") return { success: false, error: "Missing seats" };
      return writeOfficeSeats(officeSeats);
    }
    case "get-running-crons": {
      try {
        const { stdout } = await runOpenClawWithArgs(["sessions"], 10000);
        const lines = (stdout || "").split("\n").filter((l) => l.includes(":cron:"));
        const running = lines
          .map((l) => {
            const match = l.match(/agent:([^:]+):cron:([^\s]+)/);
            return match ? { agentId: match[1], jobId: match[2] } : null;
          })
          .filter(Boolean);
        return running;
      } catch {
        return [];
      }
    }
    default:
      logBridge(action, `Unknown action: ${action}`);
      return { error: `Unknown action: ${action}` };
  }
});

// ─── Daily memory: ask OpenClaw to create a memory at end of day ─────────────
// Keeps ~/.openclaw/workspace/memory structured with one daily file per day.
const DAILY_MEMORY_END_OF_DAY_HOUR = 23; // 11 PM local
const DAILY_MEMORY_CHECK_MS = 15 * 60 * 1000; // check every 15 min
const LAST_DAILY_MEMORY_SENT_PATH = path.join(HYPERCLAW_DATA_DIR, "last-daily-memory-sent.txt");

function getTodayDateString() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function getLastDailyMemorySentDate() {
  try {
    if (fs.existsSync(LAST_DAILY_MEMORY_SENT_PATH)) {
      return fs.readFileSync(LAST_DAILY_MEMORY_SENT_PATH, "utf-8").trim();
    }
  } catch {}
  return null;
}

function trySendDailyMemoryCommand() {
  const now = new Date();
  const hour = now.getHours();
  const today = getTodayDateString();
  const lastSent = getLastDailyMemorySentDate();
  if (lastSent === today) return;
  if (hour < DAILY_MEMORY_END_OF_DAY_HOUR) return;
  appendBridgeCommand({ type: "create_daily_memory", payload: { date: today } });
  try {
    fs.writeFileSync(LAST_DAILY_MEMORY_SENT_PATH, today, "utf-8");
  } catch {}
}

let dailyMemoryInterval = null;

function startDailyMemoryScheduler() {
  if (dailyMemoryInterval) return;
  trySendDailyMemoryCommand();
  dailyMemoryInterval = setInterval(trySendDailyMemoryCommand, DAILY_MEMORY_CHECK_MS);
}

function stopDailyMemoryScheduler() {
  if (dailyMemoryInterval) {
    clearInterval(dailyMemoryInterval);
    dailyMemoryInterval = null;
  }
}

// macOS Dock icon click handler - show window when dock icon is clicked
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

// ─── Note File System Storage ─────────────────────────────────────────────────
// Store notes in ~/.openclaw/workspace/memory

const NOTES_BASE_DIR = path.join(require("os").homedir(), ".openclaw", "workspace", "memory");

function ensureNotesDir() {
  if (!fs.existsSync(NOTES_BASE_DIR)) {
    fs.mkdirSync(NOTES_BASE_DIR, { recursive: true });
  }
}

function getFolderPath(folderId) {
  return path.join(NOTES_BASE_DIR, folderId);
}

function getNotePath(folderId, noteId) {
  return path.join(NOTES_BASE_DIR, folderId, `${noteId}.md`);
}

function getFoldersIndexPath() {
  return path.join(NOTES_BASE_DIR, "folders.json");
}

// IPC: Get all folders and recent notes
ipcMain.handle("notes:fetchNote", async () => {
  ensureNotesDir();
  try {
    // Read all .md files directly from memory folder (flat structure)
    const files = fs.readdirSync(NOTES_BASE_DIR).filter(f => f.endsWith('.md') && !f.includes('heartbeat') && !f.includes('folders'));
    
    // Create a virtual "all notes" folder
    const notes = files.map(file => {
      const noteId = file.replace('.md', '');
      const noteContent = fs.readFileSync(path.join(NOTES_BASE_DIR, file), 'utf-8');
      const stat = fs.statSync(path.join(NOTES_BASE_DIR, file));
      return {
        _id: noteId,
        content: noteContent,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        pinned: false,
        folderId: "all",
      };
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    
    const folders = [{
      _id: "all",
      name: "All Notes",
      notesLength: notes.length,
      pinned: false,
    }];
    
    const recentNote = notes.length > 0 ? notes[0] : null;
    const currentFolder = {
      _id: "all",
      name: "All Notes",
      notes: notes,
    };
    
    return { folder: folders, recentNote, currentFolder };
  } catch (err) {
    console.error("notes:fetchNote error:", err);
    return { folder: [], recentNote: null, currentFolder: null };
  }
});

// IPC: Get folder contents
ipcMain.handle("notes:fetchFolder", async (event, { folderId }) => {
  ensureNotesDir();
  try {
    // Read all .md files directly from memory folder (flat structure)
    const files = fs.readdirSync(NOTES_BASE_DIR).filter(f => f.endsWith('.md') && !f.includes('heartbeat') && !f.includes('folders'));
    
    const notes = files.map(file => {
      const noteId = file.replace('.md', '');
      const noteContent = fs.readFileSync(path.join(NOTES_BASE_DIR, file), 'utf-8');
      const stat = fs.statSync(path.join(NOTES_BASE_DIR, file));
      return {
        _id: noteId,
        content: noteContent,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        pinned: false,
        folderId: folderId,
      };
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    
    return { 
      status: 200, 
      data: { 
        _id: folderId, 
        name: "All Notes", 
        notes: notes,
        pinned: false,
        notesLength: notes.length,
      } 
    };
  } catch (err) {
    console.error("notes:fetchFolder error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Get single note
ipcMain.handle("notes:fetchSingleNote", async (event, { folderId, noteId }) => {
  ensureNotesDir();
  try {
    // Try both with and without .md extension
    let notePath = path.join(NOTES_BASE_DIR, `${noteId}.md`);
    if (!fs.existsSync(notePath)) {
      notePath = path.join(NOTES_BASE_DIR, noteId);
    }
    if (!fs.existsSync(notePath)) {
      return { status: 404, data: { error: "Note not found" } };
    }
    const noteContent = fs.readFileSync(notePath, 'utf-8');
    const stat = fs.statSync(notePath);
    return { 
      status: 200, 
      data: { 
        _id: noteId,
        content: noteContent,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        pinned: false,
        folderId: "all",
      } 
    };
  } catch (err) {
    console.error("notes:fetchSingleNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Create folder - no-op since we use flat structure
ipcMain.handle("notes:createFolder", async (event, { _id, name }) => {
  return { status: 200, data: { _id, name, notesLength: 0, pinned: false } };
});

// IPC: Create note
ipcMain.handle("notes:createNote", async (event, { noteId, folderId }) => {
  ensureNotesDir();
  try {
    const notePath = path.join(NOTES_BASE_DIR, `${noteId}.md`);
    fs.writeFileSync(notePath, "", "utf-8");
    return { status: 200, data: { noteId, folderId: "all" } };
  } catch (err) {
    console.error("notes:createNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Update note
ipcMain.handle("notes:updateNote", async (event, { folderId, noteId, content }) => {
  ensureNotesDir();
  try {
    const notePath = path.join(NOTES_BASE_DIR, `${noteId}.md`);
    fs.writeFileSync(notePath, content, "utf-8");
    return { status: 200, data: { success: true } };
  } catch (err) {
    console.error("notes:updateNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Rename folder
ipcMain.handle("notes:editFolderName", async (event, { folderId, name }) => {
  ensureNotesDir();
  try {
    const indexPath = getFoldersIndexPath();
    if (fs.existsSync(indexPath)) {
      const folders = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      const folderIdx = folders.findIndex(f => f._id === folderId);
      if (folderIdx !== -1) {
        folders[folderIdx].name = name;
        fs.writeFileSync(indexPath, JSON.stringify(folders, null, 2), "utf-8");
      }
    }
    return { status: 200, data: { success: true } };
  } catch (err) {
    console.error("notes:editFolderName error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Delete folder
ipcMain.handle("notes:deleteFolder", async (event, { folderId }) => {
  ensureNotesDir();
  try {
    const folderPath = getFolderPath(folderId);
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
    }
    
    const indexPath = getFoldersIndexPath();
    if (fs.existsSync(indexPath)) {
      const folders = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      const filteredFolders = folders.filter(f => f._id !== folderId);
      fs.writeFileSync(indexPath, JSON.stringify(filteredFolders, null, 2), "utf-8");
    }
    
    return { status: 200, data: { success: true } };
  } catch (err) {
    console.error("notes:deleteFolder error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Delete note
ipcMain.handle("notes:deleteNote", async (event, { folderId, noteId }) => {
  ensureNotesDir();
  try {
    const notePath = getNotePath(folderId, noteId);
    if (fs.existsSync(notePath)) {
      fs.unlinkSync(notePath);
    }
    
    // Update folder notes count
    const indexPath = getFoldersIndexPath();
    if (fs.existsSync(indexPath)) {
      const folders = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      const folderIdx = folders.findIndex(f => f._id === folderId);
      if (folderIdx !== -1) {
        folders[folderIdx].notesLength = Math.max(0, (folders[folderIdx].notesLength || 1) - 1);
        fs.writeFileSync(indexPath, JSON.stringify(folders, null, 2), "utf-8");
      }
    }
    
    return { status: 200, data: { success: true } };
  } catch (err) {
    console.error("notes:deleteNote error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Search notes
ipcMain.handle("notes:searchNote", async (event, { searchQuery }) => {
  ensureNotesDir();
  try {
    const results = [];
    const query = searchQuery.toLowerCase();
    
    if (!fs.existsSync(NOTES_BASE_DIR)) {
      return { status: 200, data: results };
    }
    
    const folders = fs.readdirSync(NOTES_BASE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());
    
    for (const folder of folders) {
      const folderPath = path.join(NOTES_BASE_DIR, folder.name);
      const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
      
      for (const file of files) {
        const noteId = file.replace('.md', '');
        const noteContent = fs.readFileSync(path.join(folderPath, file), 'utf-8');
        
        if (noteContent.toLowerCase().includes(query)) {
          const lines = noteContent.split('\n').filter(l => l.trim());
          const title = lines[0]?.trim() || 'Untitled';
          results.push({
            _id: noteId,
            folderId: folder.name,
            title,
            content: noteContent,
            term: searchQuery,
          });
        }
      }
    }
    
    return { status: 200, data: results };
  } catch (err) {
    console.error("notes:searchNote error:", err);
    return { status: 500, data: [] };
  }
});

// IPC: Reorder folders
ipcMain.handle("notes:reorderFolder", async (event, { folderId, newIndex }) => {
  ensureNotesDir();
  try {
    const indexPath = getFoldersIndexPath();
    if (fs.existsSync(indexPath)) {
      const folders = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      const currentIdx = folders.findIndex(f => f._id === folderId);
      if (currentIdx !== -1) {
        const [folder] = folders.splice(currentIdx, 1);
        folders.splice(newIndex, 0, folder);
        fs.writeFileSync(indexPath, JSON.stringify(folders, null, 2), "utf-8");
      }
    }
    return { status: 200, data: { success: true } };
  } catch (err) {
    console.error("notes:reorderFolder error:", err);
    return { status: 500, data: { error: err.message } };
  }
});

// IPC: Upload attachment (placeholder - just return success for now)
ipcMain.handle("notes:uploadAttachment", async (event, { folderId, noteId, attachment }) => {
  return { status: 200, data: { success: true, url: attachment } };
});

// App Lifecycle
app.whenReady().then(() => {
  writeToBridgeLog("Copanion main process started");
  createTray();
  createWindow();
  startBridgeWatchers();
  startDailyMemoryScheduler();

  if (!isDev && app.isPackaged && isRemoteMode && autoUpdater) {
    setTimeout(
      () => autoUpdater.checkForUpdatesAndNotify().catch(console.error),
      5000
    );
  }
});

app.on("before-quit", () => {
  appIsQuiting = true;
  stopBridgeWatchers();
  stopDailyMemoryScheduler();
  if (tray) tray.destroy();
});
