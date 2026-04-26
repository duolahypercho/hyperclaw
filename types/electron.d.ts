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
  backend?: "openclaw" | "hermes" | "claude-code" | "codex";
  runtime?: "openclaw" | "hermes" | "claude-code" | "codex";
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
  runtime?: "openclaw" | "hermes" | "claude-code" | "codex";
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

export interface LocalConnectorInstallParams {
  token: string;
  deviceId: string;
  hubUrl?: string;
  jwt?: string;
}

export interface LocalConnectorInstallResult {
  success: boolean;
  error?: string;
  installDir?: string;
  binaryPath?: string;
  hubUrl?: string;
}

/** Internal API surface for hub-routed OpenClaw operations (used by useOpenClaw hook). */
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

/** Electron IPC — only sign-connect-challenge needs the main process (Ed25519 key). */
export interface ElectronOpenClawAPI {
  signConnectChallenge: (params: unknown) => Promise<{ device: unknown; client: unknown; role: string; scopes: string[]; deviceToken?: string | null; error?: string }>;
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
  priority: "low" | "medium" | "high" | "urgent";
  status: "backlog" | "pending" | "in_progress" | "in_review" | "completed" | "blocked" | "cancelled";
  agent?: string;
  assigneeAgentId?: string;
  parentTaskId?: string;
  originKind?: "manual" | "routine" | "ceo_heartbeat";
  originId?: string;
  projectId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/** Structured mutations returned by CEO heartbeat runs */
export interface CEOHeartbeatResult {
  createTasks?: Array<{
    title: string;
    description?: string;
    priority?: HyperClawTask["priority"];
    assigneeAgentId?: string;
    projectId?: string;
  }>;
  updateTasks?: Array<{
    id: string;
    status?: HyperClawTask["status"];
    priority?: HyperClawTask["priority"];
    assigneeAgentId?: string;
  }>;
  notes?: string;
}

/** Configuration for the CEO heartbeat loop */
export interface CEOHeartbeatConfig {
  enabled: boolean;
  intervalMs: number;
  runtime: "openclaw" | "hermes" | "claw-code" | "codex";
  agentId: string;
  maxTasksPerBeat: number;
  goals: string[];
}

/** A cron job that spawns tasks on each trigger (paperclip "routine") */
export interface HyperClawRoutine {
  id: string;
  name: string;
  description?: string;
  assigneeAgentId: string;
  taskTemplate: {
    title: string;
    description?: string;
    priority: HyperClawTask["priority"];
    projectId?: string;
  };
  schedule: { kind: "cron" | "every"; expr?: string; tz?: string; everyMs?: number };
  concurrencyPolicy: "skip_if_active" | "allow_parallel";
  status: "active" | "inactive";
  lastFiredAt?: string;
  nextRunAt?: string;
}

/** Tracks an individual agent execution run (like paperclip heartbeatRuns) */
export interface HeartbeatRun {
  id: string;
  agentId: string;
  taskId?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
  invocationSource: "task_assignment" | "routine" | "ceo_heartbeat" | "manual";
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  resultJson?: Record<string, unknown>;
  errorCode?: string;
  logRef?: string;
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
  getHubConfig: () => HubConfig;
  setHubConfig: (config: Partial<HubConfig>) => Promise<{ success: boolean; error?: string }>;
  getGatewayConfig: () => Promise<{ host: string; port: number; token?: string }>;
  setGatewayConfig: (host: string, port: number, token?: string) => Promise<{ success: boolean; error?: string }>;
  testGatewayConnection: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
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
      runtimes: {
        detectLocal: () => Promise<Record<string, { installed: boolean; version: string | null; running: boolean }>>;
        detectProviderKeys: () => Promise<Array<{ providerId: string; source: string }>>;
        importProviderKey: (params: { providerId: string; source: string }) => Promise<{ apiKey: string | null }>;
        installLocalConnector: (params: LocalConnectorInstallParams) => Promise<LocalConnectorInstallResult>;
      };
      permissions: {
        checkAccessibility: () => Promise<boolean>;
        requestAccessibility: () => Promise<boolean>;
        checkMicrophone: () => Promise<boolean>;
        requestMicrophone: () => Promise<boolean>;
        checkScreen: () => Promise<boolean>;
        requestScreen: () => Promise<boolean>;
      };
      oauth: {
        startFlow: (providerId: "openai-codex" | "anthropic-claude") => Promise<{
          success: boolean;
          error?: string;
          tokens?: {
            accessToken: string;
            refreshToken: string;
            expiresIn?: number;
            idToken?: string;
            tokenType?: string;
          };
        }>;
      };
      openClaw: ElectronOpenClawAPI;
      hermes: {
        saveProfileModel: (profileId: string, model: string) => Promise<{ success: boolean }>;
      };
      hyperClawBridge: HyperClawBridgeAPI;
    };
  }
}

export {};
