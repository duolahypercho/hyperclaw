/**
 * HyperClaw Agent — Bridge action client.
 *
 * High-level typed methods for every bridge action. Each method sends a
 * WebSocket request to the target device via the Hub and awaits the response.
 */
import type { HubConnection } from './connection';
import type { BridgeAction } from './types';
import { isLongAction, DEFAULT_TIMEOUT, LONG_TIMEOUT, REPAIR_TIMEOUT } from './config';

// ---------------------------------------------------------------------------
// Core bridge invocation
// ---------------------------------------------------------------------------

function bridge(
  conn: HubConnection,
  deviceId: () => string,
  action: BridgeAction,
  params: Record<string, unknown> = {},
  timeoutMs?: number,
): Promise<unknown> {
  const timeout = timeoutMs ?? (isLongAction(action) ? LONG_TIMEOUT : DEFAULT_TIMEOUT);
  return conn.request('bridge', {
    ...params,
    deviceId: deviceId(),
    action,
  }, timeout);
}

/**
 * Unwrap the common hub/connector envelope:
 * `{result: [<actual>]}` -> `<actual>`, or `{result: <actual>}` -> `<actual>`.
 */
function unwrap(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  if ('result' in obj && Object.keys(obj).length === 1) {
    const inner = obj.result;
    return Array.isArray(inner) && inner.length === 1 ? inner[0] : inner;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Domain operation groups
// ---------------------------------------------------------------------------

export type AgentOperations = ReturnType<typeof createAgentOps>;
export type TodoOperations = ReturnType<typeof createTodoOps>;
export type CronOperations = ReturnType<typeof createCronOps>;
export type DocOperations = ReturnType<typeof createDocOps>;
export type IntelOperations = ReturnType<typeof createIntelOps>;
export type CredentialOperations = ReturnType<typeof createCredentialOps>;
export type SystemOperations = ReturnType<typeof createSystemOps>;
export type LayoutOperations = ReturnType<typeof createLayoutOps>;

// --- Agents ---

export function createAgentOps(conn: HubConnection, deviceId: () => string) {
  return {
    list: () => bridge(conn, deviceId, 'list-agents').then(unwrap),
    add: (agent: Record<string, unknown>) =>
      bridge(conn, deviceId, 'add-agent', { agent }).then(unwrap),
    delete: (agentId: string) =>
      bridge(conn, deviceId, 'delete-agent', { agentId }).then(unwrap),
    updateConfig: (agentId: string, config: Record<string, unknown>) =>
      bridge(conn, deviceId, 'update-agent-config', { agentId, config }).then(unwrap),
    getTeam: () => bridge(conn, deviceId, 'get-team').then(unwrap),
  };
}

// --- Todos ---

export function createTodoOps(conn: HubConnection, deviceId: () => string) {
  return {
    getAll: () => bridge(conn, deviceId, 'get-todo-data').then(unwrap),
    save: (data: unknown) =>
      bridge(conn, deviceId, 'save-todo-data', { data }).then(unwrap),
    getTasks: () => bridge(conn, deviceId, 'get-tasks').then(unwrap),
    addTask: (task: Record<string, unknown>) =>
      bridge(conn, deviceId, 'add-task', { task }).then(unwrap),
    updateTask: (id: string, patch: Record<string, unknown>) =>
      bridge(conn, deviceId, 'update-task', { id, patch }).then(unwrap),
    deleteTask: (id: string) =>
      bridge(conn, deviceId, 'delete-task', { id }).then(unwrap),
  };
}

// --- Cron ---

export function createCronOps(conn: HubConnection, deviceId: () => string) {
  return {
    list: () => bridge(conn, deviceId, 'get-crons').then(unwrap),
    add: (cron: Record<string, unknown>) =>
      bridge(conn, deviceId, 'cron-add', { cron }).then(unwrap),
    run: (cronId: string) =>
      bridge(conn, deviceId, 'cron-run', { cronId }, LONG_TIMEOUT).then(unwrap),
    edit: (cronId: string, patch: Record<string, unknown>) =>
      bridge(conn, deviceId, 'cron-edit', { cronId, ...patch }).then(unwrap),
    delete: (cronId: string) =>
      bridge(conn, deviceId, 'cron-delete', { cronId }).then(unwrap),
  };
}

// --- Docs ---

export function createDocOps(conn: HubConnection, deviceId: () => string) {
  return {
    listMemory: () => bridge(conn, deviceId, 'list-openclaw-memory').then(unwrap),
    listDocs: () => bridge(conn, deviceId, 'list-openclaw-docs').then(unwrap),
    getDoc: (path: string) =>
      bridge(conn, deviceId, 'get-openclaw-doc', { path }).then(unwrap),
    writeDoc: (path: string, content: string) =>
      bridge(conn, deviceId, 'write-openclaw-doc', { path, content }).then(unwrap),
    deleteDoc: (path: string) =>
      bridge(conn, deviceId, 'delete-openclaw-doc', { path }).then(unwrap),
  };
}

// --- Intel ---

export function createIntelOps(conn: HubConnection, deviceId: () => string) {
  return {
    query: (query: string, params?: Record<string, unknown>) =>
      bridge(conn, deviceId, 'intel-query', { query, ...params }).then(unwrap),
    execute: (query: string, params?: Record<string, unknown>) =>
      bridge(conn, deviceId, 'intel-execute', { query, ...params }, LONG_TIMEOUT).then(unwrap),
    insert: (table: string, data: Record<string, unknown>) =>
      bridge(conn, deviceId, 'intel-insert', { table, data }).then(unwrap),
    update: (table: string, id: string, data: Record<string, unknown>) =>
      bridge(conn, deviceId, 'intel-update', { table, id, data }).then(unwrap),
    delete: (table: string, id: string) =>
      bridge(conn, deviceId, 'intel-delete', { table, id }).then(unwrap),
  };
}

// --- Credentials ---

export function createCredentialOps(conn: HubConnection, deviceId: () => string) {
  return {
    store: (key: string, value: string, meta?: Record<string, unknown>) =>
      bridge(conn, deviceId, 'credentials:store', { key, value, ...meta }).then(unwrap),
    list: () => bridge(conn, deviceId, 'credentials:list').then(unwrap),
    delete: (key: string) =>
      bridge(conn, deviceId, 'credentials:delete', { key }).then(unwrap),
    apply: (key: string, target: Record<string, unknown>) =>
      bridge(conn, deviceId, 'credentials:apply', { key, ...target }).then(unwrap),
  };
}

// --- System ---

export function createSystemOps(conn: HubConnection, deviceId: () => string) {
  return {
    getLogs: (params?: Record<string, unknown>) =>
      bridge(conn, deviceId, 'get-logs', params).then(unwrap),
    getConfig: () => bridge(conn, deviceId, 'get-config').then(unwrap),
    listModels: () => bridge(conn, deviceId, 'list-models').then(unwrap),
    restartGateway: () =>
      bridge(conn, deviceId, 'gateway-restart', {}, LONG_TIMEOUT).then(unwrap),
    doctorFix: () =>
      bridge(conn, deviceId, 'openclaw-doctor-fix', {}, REPAIR_TIMEOUT).then(unwrap),
  };
}

// --- Layouts ---

export function createLayoutOps(conn: HubConnection, deviceId: () => string) {
  return {
    save: (layout: Record<string, unknown>) =>
      bridge(conn, deviceId, 'save-layout', { layout }).then(unwrap),
    list: () => bridge(conn, deviceId, 'get-layouts').then(unwrap),
    update: (layoutId: string, patch: Record<string, unknown>) =>
      bridge(conn, deviceId, 'update-layout', { layoutId, ...patch }).then(unwrap),
    delete: (layoutId: string) =>
      bridge(conn, deviceId, 'delete-layout', { layoutId }).then(unwrap),
  };
}

// --- App State ---

export function createAppStateOps(conn: HubConnection, deviceId: () => string) {
  return {
    save: (key: string, state: unknown) =>
      bridge(conn, deviceId, 'save-app-state', { key, state }).then(unwrap),
    get: (key: string) =>
      bridge(conn, deviceId, 'get-app-state', { key }).then(unwrap),
  };
}
