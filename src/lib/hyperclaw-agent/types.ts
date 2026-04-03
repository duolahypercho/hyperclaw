/**
 * HyperClaw Agent — TypeScript types for Hub protocol, bridge actions, and config.
 */

// ---------------------------------------------------------------------------
// Hub WebSocket Protocol
// ---------------------------------------------------------------------------

export type HubMessageType =
  | 'req'
  | 'res'
  | 'ping'
  | 'pong'
  | 'event'
  | 'evt'
  | 'approval_request';

export type HubMessage = {
  type: HubMessageType;
  payload?: Record<string, unknown>;
  deviceId?: string;
  tenantId?: string;
  timestamp: number;
};

export type RequestPayload = {
  requestId: string;
  requestType: string; // 'bridge' for bridge actions, or 'chat.*', 'sessions.*', etc.
  params: Record<string, unknown>;
};

export type ResponsePayload = {
  requestId: string;
  status: 'ok' | 'error';
  data: unknown;
};

// ---------------------------------------------------------------------------
// Bridge Action Types
// ---------------------------------------------------------------------------

export type BridgeAction =
  // Agents
  | 'list-agents'
  | 'add-agent'
  | 'delete-agent'
  | 'update-agent-config'
  | 'get-team'
  // Todos
  | 'get-todo-data'
  | 'save-todo-data'
  | 'get-tasks'
  | 'add-task'
  | 'update-task'
  | 'delete-task'
  // Cron
  | 'get-crons'
  | 'cron-add'
  | 'cron-run'
  | 'cron-edit'
  | 'cron-delete'
  // Docs
  | 'list-openclaw-memory'
  | 'list-openclaw-docs'
  | 'get-openclaw-doc'
  | 'write-openclaw-doc'
  | 'delete-openclaw-doc'
  // Intel
  | 'intel-query'
  | 'intel-execute'
  | 'intel-insert'
  | 'intel-update'
  | 'intel-delete'
  // Credentials
  | 'credentials:store'
  | 'credentials:list'
  | 'credentials:delete'
  | 'credentials:apply'
  // Org Chart
  | 'read-orgchart'
  | 'write-orgchart'
  | 'assign-orgchart-task'
  | 'update-orgchart-task'
  // System
  | 'get-logs'
  | 'get-config'
  | 'list-models'
  | 'gateway-restart'
  | 'openclaw-doctor-fix'
  // Layout
  | 'save-layout'
  | 'get-layouts'
  | 'update-layout'
  | 'delete-layout'
  // State
  | 'save-app-state'
  | 'get-app-state';

export type BridgeRequest = {
  action: BridgeAction;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Device Types
// ---------------------------------------------------------------------------

export type DeviceStatus = 'online' | 'offline' | 'pairing';

export type Device = {
  id: string;
  _id?: string;
  name: string;
  platform?: string;
  arch?: string;
  hostname?: string;
  connectorVersion?: string;
  status: DeviceStatus;
  createdAt: string;
  updatedAt: string;
};

export type Approval = {
  id: string;
  deviceId: string;
  type: string;
  description: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  resolvedAt?: string;
};

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type AgentEvent = {
  type: 'agent_change' | 'agent_completed' | 'approval_request' | 'device_status';
  deviceId?: string;
  data: Record<string, unknown>;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type HyperClawAgentConfig = {
  hubUrl: string;
  jwtToken: string;
  deviceId?: string;
  reconnect?: boolean;
  timeout?: number;
};

// ---------------------------------------------------------------------------
// Internal — pending request tracking
// ---------------------------------------------------------------------------

export type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};
