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

  // Claude Code CLI bridge — spawns `claude` subprocess in main process
  claudeCode: {
    status: () => ipcRenderer.invoke("claude-code:status"),
    send: (params) => ipcRenderer.invoke("claude-code:send", params),
    abort: (params) => ipcRenderer.invoke("claude-code:abort", params),
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
    spawnAgentForTask: (params) => ipcRenderer.invoke("hyperclaw:spawn-agent-for-task", params),

    // Gateway configuration
    setGatewayConfig: (host, port, token) => ipcRenderer.invoke("hyperclaw:set-gateway-config", { host, port, token }),
    getGatewayConfig: () => ipcRenderer.invoke("hyperclaw:get-gateway-config"),
    testGatewayConnection: (host, port) => ipcRenderer.invoke("hyperclaw:test-gateway-connection", { host, port }),

    // Hub configuration (thin client mode)
    getHubConfig: () => ipcRenderer.sendSync("hyperclaw:get-hub-config-sync"),
    setHubConfig: (config) => ipcRenderer.invoke("hyperclaw:set-hub-config", config),

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

  // Voice Overlay - persistent floating voice input
  voiceOverlay: {
    hide: () => ipcRenderer.invoke("hide-voice-overlay"),
    expand: () => ipcRenderer.invoke("voice-overlay-expand"),
    minimize: () => ipcRenderer.invoke("voice-overlay-minimize"),
    resize: (width, height) => ipcRenderer.invoke("voice-overlay-resize", { width, height }),
    setClickThrough: (ignore) => ipcRenderer.invoke("voice-overlay-set-clickthrough", ignore),
    isVisible: () => ipcRenderer.invoke("get-voice-overlay-visible"),
    getGlassConfig: () => ipcRenderer.invoke("voice-overlay-glass-config"),
    setRecordingState: (isRecording) => ipcRenderer.send("voice-overlay-recording-state", isRecording),
    // Listen for minimize events from main process
    onMinimize: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("voice-overlay-minimize", () => callback());
    },
    removeMinimizeListener: () => {
      ipcRenderer.removeAllListeners("voice-overlay-minimize");
    },
    // Insert text into the previously focused app's input field (clipboard + paste)
    insertText: (text) => ipcRenderer.invoke("voice-insert-text", text),
    // Push-to-talk events from main process (hold shortcut = start, release = stop)
    // Payload: { action: "start"|"stop", mode: "dictation"|"agent-chat" }
    onPushToTalk: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("voice-push-to-talk", (event, data) => {
        // Normalize: support both old string format and new object format
        if (typeof data === "string") {
          callback(data, "dictation", false);
        } else {
          callback(data.action, data.mode, !!data.toggle);
        }
      });
    },
    removePushToTalkListener: () => {
      ipcRenderer.removeAllListeners("voice-push-to-talk");
    },
    // Quick chat activation (Option+Space) — opens agent-chat with screenshot
    onQuickChat: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("voice-quick-chat", (event, data) => callback(data));
    },
    removeQuickChatListener: () => {
      ipcRenderer.removeAllListeners("voice-quick-chat");
    },
    onQuickChatScreenshot: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("voice-quick-chat-screenshot", (event, dataUrl) => callback(dataUrl));
    },
    removeQuickChatScreenshotListener: () => {
      ipcRenderer.removeAllListeners("voice-quick-chat-screenshot");
      ipcRenderer.removeAllListeners("voice-quick-chat-screenshot-error");
    },
    onQuickChatScreenshotError: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("voice-quick-chat-screenshot-error", (event, error) => callback(error));
    },
    captureScreen: () => ipcRenderer.invoke("capture-screenshot"),
    // Listen for voice transcript results
    onTranscript: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("voice-transcript", (event, data) => callback(data));
    },
    removeTranscriptListener: () => {
      ipcRenderer.removeAllListeners("voice-transcript");
    },
    // Listen for insert text events
    onInsertText: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("insert-text", (event, data) => callback(data));
    },
    removeInsertTextListener: () => {
      ipcRenderer.removeAllListeners("insert-text");
    },
    // Wake Word API
    wakeWord: {
      toggle: (enabled) => ipcRenderer.invoke("voice-overlay-wake-word-toggle", enabled),
      getStatus: () => ipcRenderer.invoke("voice-overlay-wake-word-status"),
      triggerDetected: () => ipcRenderer.invoke("voice-overlay-wake-word-triggered"),
    },
    // Listen for wake word activation event (main process → renderer)
    onWakeWordActivated: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("voice-overlay-wake-word-activated", () => callback());
    },
    removeWakeWordActivatedListener: () => {
      ipcRenderer.removeAllListeners("voice-overlay-wake-word-activated");
    },
    // Live-type into focused app (no clipboard)
    liveType: (text, isFinal) => ipcRenderer.invoke("voice-live-type", { text, isFinal }),
    liveTypeReset: () => ipcRenderer.invoke("voice-live-type-reset"),
    // Whisper transcription API
    whisper: {
      initialize: () => ipcRenderer.invoke("whisper-initialize"),
      transcribe: (audioData) => ipcRenderer.invoke("whisper-transcribe", audioData),
      getStatus: () => ipcRenderer.invoke("whisper-status"),
      // On-demand runtime management
      runtimeStatus: () => ipcRenderer.invoke("whisper-runtime-status"),
      runtimeInstall: () => ipcRenderer.invoke("whisper-runtime-install"),
      runtimeRemove: () => ipcRenderer.invoke("whisper-runtime-remove"),
      onInstallProgress: (callback) => {
        if (typeof callback !== "function") return;
        ipcRenderer.on("whisper-install-progress", (event, data) => callback(data));
      },
      removeInstallProgressListener: () => {
        ipcRenderer.removeAllListeners("whisper-install-progress");
      },
    },
    settings: {
      get: () => ipcRenderer.invoke("voice-settings-get"),
      set: (patch) => ipcRenderer.invoke("voice-settings-set", patch),
    },
    // Words Database API
    words: {
      getAll: () => ipcRenderer.invoke("get-words"),
      add: (word, definition) => ipcRenderer.invoke("add-word", { word, definition }),
      delete: (index) => ipcRenderer.invoke("delete-word", index),
    },
    // Insert Text API
    insertText: {
      save: (text) => ipcRenderer.send("save-insert-text", text),
      get: () => ipcRenderer.invoke("get-insert-text"),
    },
  },
});

// You can add more APIs here as needed for your Hypercho OS features
