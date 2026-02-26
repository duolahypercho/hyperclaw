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

  // OpenClaw CLI bridge — all commands execute in the main process
  openClaw: {
    checkInstalled: () => ipcRenderer.invoke("openclaw:check-installed"),
    getStatus: () => ipcRenderer.invoke("openclaw:status"),
    getGatewayHealth: () => ipcRenderer.invoke("openclaw:gateway-health"),
    sendMessage: (params) => ipcRenderer.invoke("openclaw:message-send", params),
    getGatewayConnectUrl: () => ipcRenderer.invoke("openclaw:get-gateway-connect-url"),
    getDeviceIdentity: () => ipcRenderer.invoke("openclaw:get-device-identity"),
    signConnectChallenge: (params) => ipcRenderer.invoke("openclaw:sign-connect-challenge", params),
    getCronList: () => ipcRenderer.invoke("openclaw:cron-list"),
    getCronListJson: () => ipcRenderer.invoke("openclaw:cron-list-json"),
    getAgentList: () => ipcRenderer.invoke("openclaw:agent-list"),
    runCommand: (args) => ipcRenderer.invoke("openclaw:run-command", args),
    cronEnable: (id) => ipcRenderer.invoke("openclaw:cron-enable", id),
    cronDisable: (id) => ipcRenderer.invoke("openclaw:cron-disable", id),
  },

  // HyperClaw Bridge — two-way relay with OpenClaw plugin via ~/.hyperclaw/
  // invoke(action, body): used by production desktop app so all bridge calls run locally (no Vercel).
  hyperClawBridge: {
    invoke: (action, body = {}) =>
      ipcRenderer.invoke("hyperclaw:bridge-invoke", { action, ...body }),

    getTasks: () => ipcRenderer.invoke("hyperclaw:get-tasks"),
    addTask: (task) => ipcRenderer.invoke("hyperclaw:add-task", task),
    updateTask: (id, patch) => ipcRenderer.invoke("hyperclaw:update-task", { id, patch }),
    deleteTask: (id) => ipcRenderer.invoke("hyperclaw:delete-task", id),
    sendCommand: (command) => ipcRenderer.invoke("hyperclaw:send-command", command),
    triggerProcessCommands: () => ipcRenderer.invoke("hyperclaw:trigger-process-commands"),

    onEvent: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("hyperclaw:event", (event, data) => callback(data));
    },
    onTasksChanged: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("hyperclaw:tasks-changed", (event, data) => callback(data));
    },
    removeAllBridgeListeners: () => {
      ipcRenderer.removeAllListeners("hyperclaw:event");
      ipcRenderer.removeAllListeners("hyperclaw:tasks-changed");
    },
  },

  // Note File System Storage — reads/writes notes from ~/.openclaw/workspace/memory
  noteFS: {
    fetchNote: () => ipcRenderer.invoke("notes:fetchNote"),
    fetchFolder: (folderId) => ipcRenderer.invoke("notes:fetchFolder", { folderId }),
    fetchSingleNote: (folderId, noteId) => ipcRenderer.invoke("notes:fetchSingleNote", { folderId, noteId }),
    createFolder: (_id, name) => ipcRenderer.invoke("notes:createFolder", { _id, name }),
    createNote: (noteId, folderId) => ipcRenderer.invoke("notes:createNote", { noteId, folderId }),
    updateNote: (folderId, noteId, content) => ipcRenderer.invoke("notes:updateNote", { folderId, noteId, content }),
    editFolderName: (folderId, name) => ipcRenderer.invoke("notes:editFolderName", { folderId, name }),
    deleteFolder: (folderId) => ipcRenderer.invoke("notes:deleteFolder", { folderId }),
    deleteNote: (folderId, noteId) => ipcRenderer.invoke("notes:deleteNote", { folderId, noteId }),
    searchNote: (searchQuery) => ipcRenderer.invoke("notes:searchNote", { searchQuery }),
    reorderFolder: (folderId, newIndex) => ipcRenderer.invoke("notes:reorderFolder", { folderId, newIndex }),
    uploadAttachment: (folderId, noteId, attachment) => ipcRenderer.invoke("notes:uploadAttachment", { folderId, noteId, attachment }),
  },
});

// You can add more APIs here as needed for your Hypercho OS features
