/**
 * Preload script - runs in renderer process before your Next.js app loads
 * This is a secure bridge between Electron's main process and your web app
 * 
 * SECURITY: This script uses contextBridge to safely expose IPC methods
 * without exposing the entire electron object or Node.js APIs to the renderer.
 * This prevents remote code execution vulnerabilities.
 */

const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
// SECURITY: Only expose specific, whitelisted methods - never expose require('electron')
contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getVersion: () => ipcRenderer.invoke("get-version"),
  getPlatform: () => process.platform,

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),

  // Clear persisted auth (cookies + storage) so logout works in Electron (no "remembered" Google login).
  clearAuthSession: () => ipcRenderer.invoke("clear-auth-session"),


  // Runtime detection
  runtimes: {
    detectLocal: () => ipcRenderer.invoke("runtimes:detect-local"),
    detectProviderKeys: () => ipcRenderer.invoke("runtimes:detect-provider-keys"),
    importProviderKey: (params) => ipcRenderer.invoke("runtimes:import-provider-key", params),
    installLocalConnector: (params) => ipcRenderer.invoke("runtimes:install-local-connector", params),
  },

  // Permissions
  permissions: {
    checkAccessibility: () => ipcRenderer.invoke("check-accessibility"),
    requestAccessibility: () => ipcRenderer.invoke("request-accessibility"),
    checkMicrophone: () => ipcRenderer.invoke("check-microphone"),
    requestMicrophone: () => ipcRenderer.invoke("request-microphone"),
    checkScreen: () => ipcRenderer.invoke("check-screen"),
    requestScreen: () => ipcRenderer.invoke("request-screen"),
  },

  // Notifications
  showNotification: (title, body) =>
    ipcRenderer.invoke("show-notification", { title, body }),

  // Auto-updater APIs
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  // Listen for update status (secure event listener)
  onUpdateStatus: (callback) => {
    // Validate callback is a function
    if (typeof callback !== "function") {
      console.error("onUpdateStatus: callback must be a function");
      return;
    }
    ipcRenderer.on("update-status", (event, data) => callback(data));
  },

  // Remove update status listener
  removeUpdateStatusListener: () => {
    ipcRenderer.removeAllListeners("update-status");
  },

  // Progress bar
  setProgressBar: (progress) =>
    ipcRenderer.invoke("set-progress-bar", progress),

  // OpenClaw — only sign-connect-challenge needs Electron IPC (Ed25519 key access).
  // All other OpenClaw commands route through Hub → Connector via bridgeInvoke().
  openClaw: {
    signConnectChallenge: (params) => ipcRenderer.invoke("openclaw:sign-connect-challenge", params),
  },

  // Hermes — only save-profile-model needs Electron IPC (local YAML write).
  // All other Hermes commands route through Hub → Connector via bridgeInvoke().
  hermes: {
    saveProfileModel: (profileId, model) => ipcRenderer.invoke("hermes:save-profile-model", { profileId, model }),
  },

  // OAuth — PKCE flow for AI runtime providers (Codex, Claude Code)
  oauth: {
    startFlow: (providerId) => ipcRenderer.invoke("oauth:start-flow", { providerId }),
  },

  // HyperClaw Bridge — config-only surface.
  // All bridge actions route through Hub → Connector via bridgeInvoke() in
  // the renderer (see lib/hyperclaw-bridge-client.ts). We deliberately do NOT
  // expose an IPC invoke() here — that path skipped the local-connector
  // fastpath + gateway WS streaming and broke cross-machine support.
  hyperClawBridge: {
    // Gateway configuration (Electron-local config for direct OpenClaw connection)
    setGatewayConfig: (host, port, token) => ipcRenderer.invoke("hyperclaw:set-gateway-config", { host, port, token }),
    getGatewayConfig: () => ipcRenderer.invoke("hyperclaw:get-gateway-config"),
    testGatewayConnection: (host, port) => ipcRenderer.invoke("hyperclaw:test-gateway-connection", { host, port }),

    // Hub configuration (thin client mode)
    getHubConfig: () => ipcRenderer.sendSync("hyperclaw:get-hub-config-sync"),
    setHubConfig: (config) => ipcRenderer.invoke("hyperclaw:set-hub-config", config),
  },

});

// You can add more APIs here as needed for your Hypercho OS features
