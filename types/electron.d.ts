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

export interface OpenClawAgent {
  name: string;
  hasSoul: boolean;
  hasMemory: boolean;
  soulContent: string | null;
}

export interface OpenClawAgentListResult {
  success: boolean;
  data?: OpenClawAgent[];
  error?: string;
}

export interface OpenClawCronJobJson {
  id: string;
  name: string;
  enabled: boolean;
  agentId?: string;
  schedule?: { kind: string; expr?: string; tz?: string; everyMs?: number };
  state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string };
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

export interface HyperClawBridgeAPI {
  getTasks: () => Promise<HyperClawTask[]>;
  addTask: (task: (Omit<HyperClawTask, "id" | "createdAt" | "updatedAt">) & { id?: string }) => Promise<HyperClawTask>;
  updateTask: (id: string, patch: Partial<Omit<HyperClawTask, "id" | "createdAt">>) => Promise<HyperClawTask | null>;
  deleteTask: (id: string) => Promise<{ success: boolean }>;
  sendCommand: (command: BridgeCommand) => Promise<{ success: boolean }>;
  getDailySummary: (date: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  triggerProcessCommands: () => Promise<{ success: boolean; error?: string }>;
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
      openClaw: OpenClawAPI;
      hyperClawBridge: HyperClawBridgeAPI;
      noteFS: any;
      memoryFS: MemoryAPI;
    };
  }
}

export {};
