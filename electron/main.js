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
const { pipeline } = require("stream");
const { promisify } = require("util");

const isDev = process.env.NODE_ENV === "development";
const { execFile } = require("child_process");
const streamPipeline = promisify(pipeline);

// Gaming mode: disable hardware acceleration to avoid GPU conflicts
// Set HYPERCLAW_GAMING_MODE=1 or pass --gaming-mode flag
const gamingMode = process.env.HYPERCLAW_GAMING_MODE === "1" || process.argv.includes("--gaming-mode");
if (gamingMode) {
  app.disableHardwareAcceleration();
  console.log("[main] Gaming mode enabled - hardware acceleration disabled");
}

// ─── Connector Installer ───────────────────────────────────────────────────
// Local onboarding downloads and installs the connector as a standalone
// background service so it survives Electron restarts and reboots.

function getConnectorDownloadName() {
  const plat = process.platform;
  const arch = process.arch;

  if (plat === "darwin") {
    return arch === "arm64"
      ? "hyperclaw-connector-darwin-arm64"
      : "hyperclaw-connector-darwin-x64";
  }
  if (plat === "linux") {
    return arch === "arm64"
      ? "hyperclaw-connector-linux-arm64"
      : "hyperclaw-connector-linux";
  }
  if (plat === "win32") {
    return arch === "arm64"Captions by GetTranscribed.com
      ? "hyperclaw-connector-win-arm64.exe"
      : "hyperclaw-connector-win.exe";
  }
  return null;
}

function getConnectorPublicDownloadName() {
  const plat = process.platform;
  const arch = process.arch;

  if (plat === "darwin") {
    return arch === "arm64"
      ? "hyperclaw-connector-darwin-arm64"
      : "hyperclaw-connector-darwin-amd64";
  }
  if (plat === "linux") {
    return arch === "arm64"
      ? "hyperclaw-connector-linux-arm64"
      : "hyperclaw-connector-linux-amd64";
  }
  if (plat === "win32") {
    return arch === "arm64"
      ? "hyperclaw-connector-windows-arm64.exe"
      : "hyperclaw-connector-windows-amd64.exe";
  }
  return null;
}

function getConnectorInstallPaths() {
  const installDir = path.join(os.homedir(), ".hyperclaw");
  const binaryName = process.platform === "win32"
    ? "hyperclaw-connector.exe"
    : "hyperclaw-connector";
  return {
    installDir,
    binaryPath: path.join(installDir, binaryName),
    envPath: path.join(installDir, ".env"),
    credentialsDir: path.join(installDir, "credentials"),
  };
}

function getBundledConnectorCandidates(downloadName) {
  if (!downloadName) return [];
  const publicDownloadName = getConnectorPublicDownloadName();
  const names = [...new Set([downloadName, publicDownloadName].filter(Boolean))];
  return [
    ...names.map((name) => path.join(__dirname, "resources", "connector", name)),
    ...names.map((name) => path.join(__dirname, "..", "public", "downloads", name)),
    ...names.map((name) => path.join(process.resourcesPath || "", "resources", "connector", name)),
    ...names.map((name) => path.join(process.resourcesPath || "", "app", "resources", "connector", name)),
  ].filter(Boolean);
}

async function copyFirstExistingConnectorBinary(downloadName, destinationPath) {
  for (const candidate of getBundledConnectorCandidates(downloadName)) {
    try {
      await fs.promises.access(candidate, fs.constants.X_OK);
      await fs.promises.copyFile(candidate, destinationPath);
      await fs.promises.chmod(destinationPath, 0o755).catch(() => {});
      console.log("[connector] Using bundled connector:", candidate);
      return true;
    } catch {
      // Try the next packaging/dev path.
    }
  }
  return false;
}

function createLocalConnectorIdentity() {
  const host = os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32) || "machine";
  return {
    token: `local-${crypto.randomBytes(24).toString("hex")}`,
    deviceId: `local-${host}-${crypto.randomBytes(6).toString("hex")}`,
  };
}

// Hub URL normalization helpers. Empty input returns "" — callers must treat
// an empty hub URL as "local-only mode" and skip remote operations.
function normalizeHubWsUrl(hubUrl) {
  if (!hubUrl) return "";
  if (hubUrl.startsWith("ws://") || hubUrl.startsWith("wss://")) return hubUrl;
  if (hubUrl.startsWith("https://")) return `wss://${hubUrl.slice("https://".length)}`;
  if (hubUrl.startsWith("http://")) return `ws://${hubUrl.slice("http://".length)}`;
  return `wss://${hubUrl}`;
}

function normalizeHubHttpUrl(hubUrl) {
  if (!hubUrl) return "";
  if (hubUrl.startsWith("https://") || hubUrl.startsWith("http://")) return hubUrl;
  if (hubUrl.startsWith("wss://")) return `https://${hubUrl.slice("wss://".length)}`;
  if (hubUrl.startsWith("ws://")) return `http://${hubUrl.slice("ws://".length)}`;
  return `https://${hubUrl}`;
}

async function downloadFile(downloadUrl, destinationPath, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error("Too many redirects while downloading connector");
  }

  const client = downloadUrl.startsWith("https://") ? https : http;

  await new Promise((resolve, reject) => {
    const request = client.get(downloadUrl, (response) => {
      const statusCode = response.statusCode || 0;
      if ([301, 302, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, downloadUrl).toString();
        resolve(downloadFile(nextUrl, destinationPath, redirectCount + 1));
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`Connector download failed with HTTP ${statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(destinationPath, { mode: 0o755 });
      streamPipeline(response, fileStream).then(resolve).catch(reject);
    });

    request.on("error", reject);
  });
}

function runExecFile(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function installLocalConnectorService({ token, deviceId, hubUrl, jwt, localOnly } = {}) {
  const isLocalOnly = Boolean(localOnly) || (!token && !deviceId);
  const localIdentity = isLocalOnly ? createLocalConnectorIdentity() : null;
  const resolvedToken = token || localIdentity?.token || "";
  const resolvedDeviceId = deviceId || localIdentity?.deviceId || "";

  if (!isLocalOnly && (!resolvedToken || !resolvedDeviceId)) {
    throw new Error("Missing device token or device ID for connector install");
  }

  const downloadName = getConnectorDownloadName();
  if (!downloadName) {
    throw new Error(`Connector install is not supported on ${process.platform}/${process.arch}`);
  }

  const { installDir, binaryPath, envPath, credentialsDir } = getConnectorInstallPaths();
  const normalizedHubUrl = normalizeHubWsUrl(hubUrl);
  const downloadBase = normalizeHubHttpUrl(appConfig.hub?.url || hubUrl);
  if (!downloadBase) {
    throw new Error(
      "Cannot install connector: no hub URL configured. " +
      "Set appConfig.hub.url (Cloud build) or pass hubUrl explicitly."
    );
  }
  const downloadUrl = new URL(`/downloads/${downloadName}`, downloadBase).toString();

  await fs.promises.mkdir(installDir, { recursive: true });
  await fs.promises.mkdir(credentialsDir, { recursive: true });

  // Skip entire install only when the connector is already running AND already
  // paired to the same device we are onboarding. The short-circuit has to check
  // the device.id on disk — otherwise we leave a stale daemon running with
  // credentials from a previous onboarding, which causes the hub to never flip
  // the new device to "online" and the UI to hang on
  // "Waiting for connector to connect...".
  try {
    await fs.promises.access(binaryPath, fs.constants.X_OK);
    let existingDeviceId = "";
    try {
      existingDeviceId = (await fs.promises.readFile(
        path.join(installDir, "device.id"),
        "utf8"
      )).trim();
    } catch { /* no device.id on disk — proceed with install */ }

    if (existingDeviceId && existingDeviceId === resolvedDeviceId) {
      const probe = await fetch("http://127.0.0.1:18790/bridge/health", {
        signal: AbortSignal.timeout(2000),
      });
      if (probe.ok) {
        return { success: true, installDir, binaryPath, hubUrl: normalizedHubUrl, deviceId: resolvedDeviceId, localOnly: isLocalOnly };
      }
    }
  } catch { /* not running or binary missing — proceed with install */ }

  // Prefer the bundled connector shipped with the Electron app. This is the
  // local-first/open-source path and avoids depending on hub downloads.
  let usedLocalBuild = await copyFirstExistingConnectorBinary(downloadName, binaryPath);

  // In development, allow an explicit local connector build as a fallback.
  const localDevBuild = path.join(os.homedir(), "Code", "hyperclaw-connector", "hyperclaw-connector");
  if (!usedLocalBuild) {
    try {
      await fs.promises.access(localDevBuild, fs.constants.X_OK);
      await fs.promises.copyFile(localDevBuild, binaryPath);
      await fs.promises.chmod(binaryPath, 0o755).catch(() => {});
      usedLocalBuild = true;
      console.log("[connector] Using local dev build:", localDevBuild);
    } catch { /* no local build, download from hub */ }
  }

  if (!usedLocalBuild) {
    if (isLocalOnly) {
      throw new Error("Bundled connector binary was not found. Run npm run connector:build before local-only onboarding.");
    }
    await downloadFile(downloadUrl, binaryPath);
    await fs.promises.chmod(binaryPath, 0o755).catch(() => {});
  }

  const envContent = [
    `DEVICE_TOKEN=${resolvedToken}`,
    `DEVICE_ID=${resolvedDeviceId}`,
    ...(isLocalOnly ? ["HYPERCLAW_LOCAL_ONLY=1"] : []),
    ...(normalizedHubUrl ? [`HUB_URL=${normalizedHubUrl}`] : []),
    "",
  ].join("\n");

  await fs.promises.writeFile(path.join(installDir, "device.token"), `${resolvedToken}\n`, "utf8");
  await fs.promises.writeFile(path.join(installDir, "device.id"), `${resolvedDeviceId}\n`, "utf8");
  await fs.promises.writeFile(path.join(credentialsDir, "device.token"), `${resolvedToken}\n`, "utf8");
  await fs.promises.writeFile(path.join(credentialsDir, "device.id"), `${resolvedDeviceId}\n`, "utf8");
  await fs.promises.writeFile(envPath, envContent, "utf8");

  await runExecFile(binaryPath, ["install"], {
    env: {
      ...process.env,
      DEVICE_TOKEN: resolvedToken,
      DEVICE_ID: resolvedDeviceId,
      ...(isLocalOnly ? { HYPERCLAW_LOCAL_ONLY: "1" } : {}),
      ...(normalizedHubUrl ? { HUB_URL: normalizedHubUrl } : {}),
    },
    windowsHide: true,
  });

  // Write hub-config.json so subsequent Electron restarts auto-load it.
  // Use the HTTP URL — getHubInfo() feeds hubCommandFromElectron which makes
  // HTTP requests. In local-only mode the URL stays empty.
  const hubConfigPath = path.join(os.homedir(), ".hyperclaw", "hub-config.json");
  const httpHubUrl = normalizeHubHttpUrl(hubUrl);
  const hubConfigData = {
    enabled: !isLocalOnly && !!httpHubUrl,
    url: httpHubUrl,
    deviceId: resolvedDeviceId,
    jwt: jwt || appConfig.hub?.jwt || "",
    localOnly: isLocalOnly,
  };
  await fs.promises.writeFile(hubConfigPath, JSON.stringify(hubConfigData, null, 2), "utf8");

  // Update in-memory appConfig so getHubInfo().enabled is true for the rest of this session
  appConfig.hub = { ...hubConfigData };

  return {
    success: true,
    installDir,
    binaryPath,
    hubUrl: normalizedHubUrl,
    deviceId: resolvedDeviceId,
    localOnly: isLocalOnly,
  };
}

// Log crashes so we can debug "opens then closes" (run from Terminal to see output)
function logCrash(label, err) {
  const msg = `${label}: ${err && (err.stack || err.message || err)}\n`;
  console.error(msg);
  try {
    const os = require("os");
    const logPath = path.join(os.homedir(), ".hyperclaw", "hyperclaw-crash.log");
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

// Allow OS to throttle the app when minimized/hidden (better for gaming, battery)
// WebSocket connections stay alive for notifications even when throttled

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
//
// Defaults are local-only so a fresh checkout of the open-source repo runs
// against http://localhost:1000 without contacting any remote service. The
// official Hyperclaw Cloud build overrides `mode` and `remoteUrl` via
// electron/app-config.json or BUILD_FLAVOR=cloud before packaging.
let appConfig = {
  mode: "local",
  remoteUrl: "",
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

const buildFlavor = String(process.env.BUILD_FLAVOR || process.env.HYPERCLAW_BUILD_FLAVOR || "").toLowerCase();
if (["community", "oss", "local"].includes(buildFlavor)) {
  appConfig.mode = "local";
}
if (["cloud", "commercial", "remote"].includes(buildFlavor)) {
  appConfig.mode = "remote";
  appConfig.remoteUrl = process.env.HYPERCLAW_REMOTE_URL || appConfig.remoteUrl || "";
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
          if (online.length === 0) return resolve(null);
          const device = online.reduce((a, b) => (a.updatedAt || "") > (b.updatedAt || "") ? a : b);
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

/**
 * Forward a command to the Hub, which relays it to the Connector via WebSocket.
 * The Connector executes it on the user's machine and returns the result.
 * Dynamically discovers the active device if the config device is stale.
 *
 * Only used by the Ed25519-signed `sign-connect-challenge` action (which must
 * run in the Electron main process because it needs local key material). All
 * other bridge calls go through the renderer's hubCommand() stack.
 */
async function hubCommandFromElectron(body) {
  const { hubUrl, jwt } = getHubInfo();
  // Always discover an online device through Hub before command routing.
  const deviceId = await discoverActiveDevice(hubUrl, jwt) || "";
  if (!deviceId) return { success: false, error: "No online device connected" };
  const url = new URL(`/api/devices/${deviceId}/command`, hubUrl);
  const fetchModule = hubUrl.startsWith("https") ? https : http;
  const payload = JSON.stringify(body);

  const httpTimeout = 60000;

  return new Promise((resolve, reject) => {
    const req = fetchModule.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: httpTimeout,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const text = data.trim();
        try {
          resolve(unwrapHubResponse(JSON.parse(text)));
          return;
        } catch {}

        if (res.statusCode && res.statusCode >= 400) {
          resolve({
            success: false,
            error: text || `Hub returned ${res.statusCode}`,
          });
          return;
        }

        resolve({
          success: false,
          error: text || "Invalid response from hub",
        });
      });
    });
    req.on("error", (err) => resolve({ success: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: `Hub request timed out (${action || "unknown"})` });
    });
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
  // Tray icon is fetched from the configured remote URL when available, or
  // falls back to the bundled local PNG. In Community Edition `remoteUrl` is
  // empty so we go straight to the bundled icon.
  const size = process.platform === "win32" ? 16 : 22;
  const remoteIconUrl = appConfig.remoteUrl
    ? `${appConfig.remoteUrl.replace(/\/$/, "")}/tray.png`
    : "";

  if (!remoteIconUrl) {
    // No remote URL configured (Community Edition default). Use the
    // bundled fallback icon directly without a network round-trip.
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
    return;
  }

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
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: true, // Prevent throttling when window is hidden/minimized
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
      return (
        host === "accounts.google.com" ||
        host.endsWith(".accounts.google.com") ||
        host === "auth.openai.com" ||
        host === "claude.ai"
      );
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
            backgroundThrottling: true,
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
          backgroundThrottling: true,
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

  // Allow throttling when minimized/hidden (better for gaming, battery life)
  // WebSocket connections remain active for notifications

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

// ─── IPC Handlers: Local connector bearer token ─────────────────────────────

// Reads ~/.hyperclaw/connector.token. The connector creates this file at
// startup with mode 0600. Renderer uses it to authenticate /bridge calls.
// Returns "" when the file isn't present yet (rollout window).
ipcMain.handle("connector:get-token", async () => {
  const tokenPath = path.join(os.homedir(), ".hyperclaw", "connector.token");
  try {
    const data = await fs.promises.readFile(tokenPath, "utf8");
    return data.trim();
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.warn("[connector-token] read failed:", err.message);
    }
    return "";
  }
});

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

ipcMain.handle("runtimes:install-local-connector", async (_event, params = {}) => {
  try {
    return await installLocalConnectorService(params);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to install connector",
    };
  }
});

// ─── OAuth PKCE Flow ──────────────────────────────────────────────────────
// Handles Authorization Code + PKCE for Codex (OpenAI) and Claude (Anthropic).
// The Electron main process runs the full flow: generate PKCE verifier,
// open an OAuth popup, intercept the redirect, exchange code for tokens.

const crypto = require("crypto");

const OAUTH_PROVIDERS = {
  "openai-codex": {
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    redirectUri: "http://localhost:1455/auth/callback",
    scopes: "openid profile email offline_access",
    extraParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
    },
  },
  "anthropic-claude": {
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://platform.claude.com/v1/oauth/token",
    redirectUri: "http://localhost:53692/callback",
    scopes:
      "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",
    extraParams: {},
    jsonBody: true,
  },
};

function generatePkceVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generatePkceChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function buildOAuthAuthorizeUrl(providerId) {
  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown OAuth provider: ${providerId}`);

  const verifier = generatePkceVerifier();
  const challenge = generatePkceChallenge(verifier);

  // Both providers require a state parameter for CSRF protection.
  // Anthropic uses the verifier as state; OpenAI requires at least 8 chars.
  const state = crypto.randomBytes(32).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    scope: provider.scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...provider.extraParams,
  });

  return {
    url: `${provider.authorizeUrl}?${params.toString()}`,
    verifier,
    redirectUri: provider.redirectUri,
  };
}

async function exchangeOAuthCode(providerId, code, verifier) {
  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown OAuth provider: ${providerId}`);

  const tokenParams = {
    grant_type: "authorization_code",
    client_id: provider.clientId,
    code,
    redirect_uri: provider.redirectUri,
    code_verifier: verifier,
  };

  const isJson = !!provider.jsonBody;
  const body = isJson
    ? JSON.stringify(tokenParams)
    : new URLSearchParams(tokenParams).toString();

  const mod = provider.tokenUrl.startsWith("https") ? https : http;

  return new Promise((resolve, reject) => {
    const tokenUrl = new URL(provider.tokenUrl);
    const req = mod.request(
      {
        hostname: tokenUrl.hostname,
        port: tokenUrl.port || (tokenUrl.protocol === "https:" ? 443 : 80),
        path: tokenUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": isJson
            ? "application/json"
            : "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              const errorMsg =
                parsed.error_description ||
                (typeof parsed.error === "string"
                  ? parsed.error
                  : parsed.error?.message) ||
                `Token exchange failed (${res.statusCode})`;
              reject(new Error(errorMsg));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error(`Invalid token response: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body.toString());
    req.end();
  });
}

// Start an OAuth flow: open popup, wait for redirect, exchange code.
ipcMain.handle("oauth:start-flow", async (_event, { providerId }) => {
  if (!OAUTH_PROVIDERS[providerId]) {
    return { success: false, error: `Unknown OAuth provider: ${providerId}` };
  }

  try {
    const { url, verifier, redirectUri } = buildOAuthAuthorizeUrl(providerId);
    const redirectHost = new URL(redirectUri);

    return new Promise((resolve) => {
      let resolved = false;
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      // Spin up a temporary local HTTP server to catch the redirect
      const server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url, `http://localhost`);

        // Only handle the callback path
        if (!req.url.startsWith(new URL(redirectUri).pathname)) {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = reqUrl.searchParams.get("code");
        const error = reqUrl.searchParams.get("error");

        if (error) {
          const desc = reqUrl.searchParams.get("error_description") || error;
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Authentication failed</h2><p>" +
              desc +
              "</p><p>You can close this window.</p></body></html>"
          );
          server.close();
          if (oauthWin && !oauthWin.isDestroyed()) oauthWin.close();
          finish({ success: false, error: desc });
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Missing authorization code</h2><p>You can close this window.</p></body></html>"
          );
          server.close();
          if (oauthWin && !oauthWin.isDestroyed()) oauthWin.close();
          finish({ success: false, error: "No authorization code received" });
          return;
        }

        // Exchange the code for tokens
        try {
          const tokens = await exchangeOAuthCode(providerId, code, verifier);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Authenticated!</h2><p>You can close this window.</p><script>window.close()</script></body></html>"
          );
          server.close();
          if (oauthWin && !oauthWin.isDestroyed()) oauthWin.close();
          finish({
            success: true,
            tokens: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresIn: tokens.expires_in,
              idToken: tokens.id_token,
              tokenType: tokens.token_type,
            },
          });
        } catch (exchangeErr) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Token exchange failed</h2><p>" +
              exchangeErr.message +
              "</p></body></html>"
          );
          server.close();
          if (oauthWin && !oauthWin.isDestroyed()) oauthWin.close();
          finish({ success: false, error: exchangeErr.message });
        }
      });

      const port = parseInt(redirectHost.port) || (providerId === "openai-codex" ? 1455 : 53692);

      server.listen(port, "127.0.0.1", () => {
        console.log(`[oauth] Listening for ${providerId} callback on port ${port}`);
      });

      server.on("error", (err) => {
        console.error(`[oauth] Server error for ${providerId}:`, err.message);
        finish({
          success: false,
          error: `Could not start OAuth callback server on port ${port}: ${err.message}`,
        });
      });

      // Open the OAuth popup
      const oauthWin = new BrowserWindow({
        width: 520,
        height: 700,
        title: providerId === "openai-codex" ? "Sign in to OpenAI" : "Sign in to Anthropic",
        frame: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
        },
        show: false,
      });

      oauthWin.loadURL(url).catch((err) => {
        console.error("[oauth] Window load failed:", err);
        server.close();
        finish({ success: false, error: "Failed to open authentication page" });
      });

      oauthWin.once("ready-to-show", () => oauthWin.show());

      // If user closes the window before completing
      oauthWin.on("closed", () => {
        setTimeout(() => {
          server.close();
          finish({ success: false, error: "Authentication window was closed" });
        }, 1000); // Small delay to allow redirect to complete
      });

      // Safety timeout (5 minutes)
      setTimeout(() => {
        server.close();
        if (oauthWin && !oauthWin.isDestroyed()) oauthWin.close();
        finish({ success: false, error: "Authentication timed out" });
      }, 5 * 60 * 1000);
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "OAuth flow failed",
    };
  }
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

// ─── IPC Handlers: Hermes (only save-profile-model needs local YAML access) ──

ipcMain.handle("hermes:save-profile-model", async (event, { profileId, model } = {}) => {
  if (!profileId || !model) return { success: false };
  const fs = require("fs");
  const path = require("path");
  const home = process.env.HOME || "";
  try {
    const yaml = require("js-yaml");
    const configPath = path.join(home, ".hermes", "profiles", profileId, "config.yaml");
    if (!fs.existsSync(configPath)) return { success: false };

    const config = yaml.load(fs.readFileSync(configPath, "utf-8")) || {};
    if (!config.model) config.model = {};

    // If model is "provider/modelId", split and update both fields
    if (model.includes("/")) {
      const slashIdx = model.indexOf("/");
      config.model.provider = model.slice(0, slashIdx);
      config.model.default = model.slice(slashIdx + 1);
      delete config.model.base_url; // remove provider-specific base_url when switching
    } else {
      config.model.default = model;
    }

    fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: 120 }), "utf-8");
    return { success: true };
  } catch {
    return { success: false };
  }
});

// ─── IPC Handlers: OpenClaw (only sign-connect-challenge needs Electron IPC) ─

ipcMain.handle("openclaw:sign-connect-challenge", async (event, params) => {
  if (!getHubInfo().enabled) return { error: "No device registered. Please set up a device first.", needsSetup: true };
  return hubCommandFromElectron({ action: "sign-connect-challenge", ...params });
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
    // Invalidate device discovery cache — caller may have just installed a new connector
    _cachedDeviceId = null;
    _cachedDeviceAt = 0;

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

    // Also persist to hub-config.json so the config survives Electron restarts
    const hubConfigPath = path.join(os.homedir(), ".hyperclaw", "hub-config.json");
    try {
      await fs.promises.mkdir(path.join(os.homedir(), ".hyperclaw"), { recursive: true });
      await fs.promises.writeFile(hubConfigPath, JSON.stringify({
        enabled: appConfig.hub.enabled,
        url: appConfig.hub.url,
        deviceId: appConfig.hub.deviceId,
        jwt: appConfig.hub.jwt,
      }, null, 2), "utf8");
    } catch { /* best-effort */ }

    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

// ─── Bridge logging (for main-process diagnostics) ──────────────────────────
// All bridge actions route through Hub → Connector via the renderer's
// bridgeInvoke() → hubCommand() stack (see lib/hub-direct.ts). The Electron
// main process no longer proxies bridge calls — it only writes diagnostic
// logs for startup events.

function getBridgeLogPath() {
  const os = require("os");
  return path.join(os.homedir(), ".hyperclaw", "hyperclaw-bridge.log");
}

function writeToBridgeLog(message) {
  try {
    const logPath = getBridgeLogPath();
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf-8");
  } catch (_) {}
}

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
