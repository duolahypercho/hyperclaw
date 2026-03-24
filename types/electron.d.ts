/**
 * TypeScript definitions for Electron APIs exposed via preload script
 * This allows type-safe access to Electron features in your Next.js app
 */

export interface UpdateStatus {
  status:
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error"
    | "dev-mode";
  message: string;
  version?: string;
  releaseDate?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

export interface OpenClawCommandResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface OpenClawInstallCheck {
  installed: boolean;
  version: string | null;
}

/** Workspace-folder agent (from ~/.openclaw/workspace subdirs). Used by getAgentList() fallback. */
export interface OpenClawAgent {
  name: string;
  hasSoul: boolean;
  hasMemory: boolean;
  soulContent: string | null;
}

/** Registry agent (from openclaw agents list / openclaw.json). Same as list-agents in hyperclaw-bridge. */
export interface OpenClawRegistryAgent {
  id: string;
  name: string;
  status: string;
  role?: string;
  lastActive?: string;
}

export interface OpenClawAgentListResult {
  success: boolean;
  data?: OpenClawAgent[];
  error?: string;
}

/** Job shape from `openclaw cron list --json --all` (top-level array or data.jobs). */
export interface OpenClawCronJobJson {
  id: string;
  name: string;
  enabled: boolean;
  agentId?: string;
  schedule?: {
    kind: string;
    expr?: string;
    tz?: string;
    everyMs?: number;
    staggerMs?: number;
  };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastRunStatus?: string;
    lastDurationMs?: number;
    lastError?: string;
    consecutiveErrors?: number;
  };
  /** Optional; CLI may include createdAtMs, updatedAtMs, payload, delivery, etc. */
  [key: string]: unknown;
}

/** One line from ~/.openclaw/cron/runs/{jobId}.jsonl */
export interface CronRunRecord {
  ts: number;
  jobId: string;
  action: string;
  status: "ok" | "error";
  runAtMs: number;
  durationMs?: number;
  nextRunAtMs?: number;
  summary?: string;
  error?: string;
  sessionId?: string;
}

/** Token usage aggregated from ~/.openclaw session files. */
export interface OpenClawUsageResult {
  byDay: { date: string; inputTokens: number; outputTokens: number; totalTokens: number }[];
  totals: { inputTokens: number; outputTokens: number; totalTokens: number };
  byAgent: { agentId: string; inputTokens: number; outputTokens: number; totalTokens: number }[];
  /** Shown when no data (e.g. no session files found, or wrong runtime). */
  hint?: string;
  /** Debug: files scanned and records/tokens per file (for verifying aggregation). */
  debug?: {
    files: { path: string; agentId: string; records: number; totalTokens: number }[];
  };
}

export interface OpenClawCronListJsonResult {
  success: boolean;
  data?: { jobs: OpenClawCronJobJson[] };
  error?: string;
}

export interface OpenClawGatewayHealthResult {
  healthy: boolean;
  error?: string;
}

export interface OpenClawMessageSendParams {
  channel?: string;
  account?: string;
  target: string;
  message?: string;
  media?: string;
  replyTo?: string;
  silent?: boolean;
}

export interface OpenClawMessageSendResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface OpenClawGatewayConnectUrlResult {
  gatewayUrl: string;
  /** Port from ~/.openclaw/openclaw.json gateway.port (default 18789) */
  port: number;
  token: string | null;
  error: string | null;
}

export interface OpenClawAPI {
  checkInstalled: () => Promise<OpenClawInstallCheck>;
  getStatus: () => Promise<OpenClawCommandResult>;
  getGatewayHealth: () => Promise<OpenClawGatewayHealthResult>;
  getGatewayConnectUrl?: () => Promise<OpenClawGatewayConnectUrlResult>;
  sendMessage: (params: OpenClawMessageSendParams) => Promise<OpenClawMessageSendResult>;
  getCronList: () => Promise<OpenClawCommandResult>;
  getCronListJson: () => Promise<OpenClawCronListJsonResult>;
  getAgentList: () => Promise<OpenClawAgentListResult>;
  runCommand: (args: string) => Promise<OpenClawCommandResult>;
  cronEnable: (id: string) => Promise<OpenClawCommandResult>;
  cronDisable: (id: string) => Promise<OpenClawCommandResult>;
  getMemoryFiles?: () => Promise<{ success: boolean; data?: MemoryFile[]; error?: string }>;
  readMemoryFile?: (relativePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
}

export interface MemoryFile {
  name: string;
  path: string;
  /** ISO date string; present when listing from API */
  updatedAt?: string;
  /** File size in bytes; present when listing from API */
  sizeBytes?: number;
  content: string;
}

export interface MemoryAPI {
  getMemoryFiles: () => Promise<{ success: boolean; data?: MemoryFile[]; error?: string }>;
  readMemoryFile: (relativePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
}

export interface HyperClawTask {
  id: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  agent?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface BridgeEvent {
  type: string;
  timestamp: string;
  source: "openclaw" | "hyperclaw";
  payload: Record<string, unknown>;
}

export interface BridgeCommand {
  type: string;
  payload?: Record<string, unknown>;
}

export interface HubConfig {
  enabled: boolean;
  url: string;
  deviceId: string;
  jwt: string;
}

export interface HyperClawBridgeAPI {
  invoke: (action: string, body?: Record<string, unknown>) => Promise<unknown>;
  getTasks: () => Promise<HyperClawTask[]>;
  addTask: (task: (Omit<HyperClawTask, "id" | "createdAt" | "updatedAt">) & { id?: string }) => Promise<HyperClawTask>;
  updateTask: (id: string, patch: Partial<Omit<HyperClawTask, "id" | "createdAt">>) => Promise<HyperClawTask | null>;
  deleteTask: (id: string) => Promise<{ success: boolean }>;
  sendCommand: (command: BridgeCommand) => Promise<{ success: boolean }>;
  getDailySummary: (date: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  triggerProcessCommands: () => Promise<{ success: boolean; error?: string }>;
  spawnAgentForTask: (params: {
    taskId: string;
    agentId: string;
    taskTitle: string;
    taskDescription?: string;
    document?: string;
    context?: Record<string, unknown>;
  }) => Promise<{ success: boolean; error?: string; stdout?: string; taskId: string; agentId: string }>;
  getHubConfig: () => HubConfig;
  setHubConfig: (config: Partial<HubConfig>) => Promise<{ success: boolean; error?: string }>;
  getGatewayConfig: () => Promise<{ host: string; port: number; token?: string }>;
  setGatewayConfig: (host: string, port: number, token?: string) => Promise<{ success: boolean; error?: string }>;
  testGatewayConnection: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
  onEvent: (callback: (event: BridgeEvent) => void) => void;
  onTasksChanged: (callback: (tasks: HyperClawTask[]) => void) => void;
  removeAllBridgeListeners: () => void;
}

declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      getPlatform: () => string;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      showNotification: (title: string, body: string) => Promise<void>;
      checkForUpdates: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      onUpdateStatus: (callback: (data: UpdateStatus) => void) => void;
      removeUpdateStatusListener: () => void;
      setProgressBar: (progress: number) => Promise<void>;
      clearAuthSession: () => Promise<{ ok: boolean; error?: string }>;
      openClaw: OpenClawAPI;
      hyperClawBridge: HyperClawBridgeAPI;
      noteFS: any;
      memoryFS: MemoryAPI;
      // Voice Overlay - global voice input (Alt+Space)
      voiceOverlay?: {
        hide: () => Promise<void>;
        expand: () => Promise<void>;
        minimize: () => Promise<void>;
        isVisible: () => Promise<boolean>;
        /** useNativeWindowBlur: macOS + Windows 11+ (native blur). Linux / Win10 use CSS frosted glass in-page. */
        getGlassConfig: () => Promise<{ useNativeWindowBlur?: boolean }>;
        resize: (width: number, height: number) => Promise<void>;
        setClickThrough: (ignore: boolean) => Promise<void>;
        insertText: (text: string) => Promise<{ success: boolean; error?: string }>;
        onPushToTalk: (callback: (action: "start" | "stop", mode: "dictation" | "agent-chat") => void) => void;
        removePushToTalkListener: () => void;
        onQuickChat: (callback: (data: { screenshot?: string | null }) => void) => void;
        removeQuickChatListener: () => void;
        onQuickChatScreenshot: (callback: (dataUrl: string) => void) => void;
        onQuickChatScreenshotError?: (callback: (error: string) => void) => void;
        removeQuickChatScreenshotListener: () => void;
        captureScreen?: () => Promise<{ dataUrl?: string; error?: string }>;
        onMinimize: (callback: () => void) => void;
        removeMinimizeListener: () => void;
        onTranscript: (callback: (data: { text: string; agentId?: string; sessionKey?: string }) => void) => void;
        removeTranscriptListener: () => void;
        wakeWord?: {
          toggle: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
          getStatus: () => Promise<{ enabled: boolean }>;
          triggerDetected: () => Promise<{ success: boolean }>;
        };
        onWakeWordActivated?: (callback: () => void) => void;
        removeWakeWordActivatedListener?: () => void;
        whisper?: {
          initialize: () => Promise<{ success: boolean; info?: any; error?: string }>;
          transcribe: (audioData: number[]) => Promise<{ success: boolean; text?: string; error?: string }>;
          getStatus: () => Promise<{ ready: boolean; info?: any }>;
        };
      };
    };
  }
}

export {};
