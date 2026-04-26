/**
 * HyperClaw Agent — main orchestrator class.
 *
 * Ties together the WebSocket connection, Hub REST API, and bridge
 * operations into a single agent instance.
 *
 * Usage:
 *   const agent = new HyperClawAgent({ hubUrl: 'wss://hub.hypercho.com', jwtToken: '...' });
 *   await agent.connect();
 *   const agents = await agent.agents.list();
 *   const tasks = await agent.todos.getTasks();
 *   agent.disconnect();
 */
import { EventEmitter } from 'events';
import { HubConnection } from './connection';
import { HubApiClient } from './hub-api';
import { resolveConfig } from './config';
import type { HyperClawAgentConfig, HubMessage, Device, Approval } from './types';
import {
  createAgentOps,
  createTodoOps,
  createCronOps,
  createDocOps,
  createIntelOps,
  createCredentialOps,
  createSystemOps,
  createLayoutOps,
  createAppStateOps,
  type AgentOperations,
  type TodoOperations,
  type CronOperations,
  type DocOperations,
  type IntelOperations,
  type CredentialOperations,
  type SystemOperations,
  type LayoutOperations,
} from './bridge';

export type AppStateOperations = ReturnType<typeof createAppStateOps>;

export class HyperClawAgent extends EventEmitter {
  private config: Required<HyperClawAgentConfig>;
  private connection: HubConnection;
  private hubApi: HubApiClient;
  private activeDeviceId: string | null;

  // Bridge operation groups
  readonly agents: AgentOperations;
  readonly todos: TodoOperations;
  readonly cron: CronOperations;
  readonly docs: DocOperations;
  readonly intel: IntelOperations;
  readonly credentials: CredentialOperations;
  readonly system: SystemOperations;
  readonly layouts: LayoutOperations;
  readonly appState: AppStateOperations;

  constructor(config: HyperClawAgentConfig) {
    super();
    this.config = resolveConfig(config);
    this.activeDeviceId = this.config.deviceId || null;

    // HTTP base URL for REST API (convert ws(s) back to http(s) if needed)
    const httpUrl = this.config.hubUrl.replace(/^ws/, 'http');

    this.connection = new HubConnection(
      this.config.hubUrl,
      this.config.jwtToken,
      this.config.reconnect,
    );
    this.hubApi = new HubApiClient(httpUrl, this.config.jwtToken);

    // Device ID getter — used by bridge ops to resolve current target device
    const getDeviceId = () => {
      if (!this.activeDeviceId) {
        throw new Error(
          'No active device. Call setActiveDevice(id) or connect() with auto-discovery.',
        );
      }
      return this.activeDeviceId;
    };

    // Initialize bridge operation groups
    this.agents = createAgentOps(this.connection, getDeviceId);
    this.todos = createTodoOps(this.connection, getDeviceId);
    this.cron = createCronOps(this.connection, getDeviceId);
    this.docs = createDocOps(this.connection, getDeviceId);
    this.intel = createIntelOps(this.connection, getDeviceId);
    this.credentials = createCredentialOps(this.connection, getDeviceId);
    this.system = createSystemOps(this.connection, getDeviceId);
    this.layouts = createLayoutOps(this.connection, getDeviceId);
    this.appState = createAppStateOps(this.connection, getDeviceId);

    // Forward connection events
    this.connection.on('connected', () => this.emit('connected'));
    this.connection.on('disconnected', (info) => this.emit('disconnected', info));
    this.connection.on('reconnecting', (info) => this.emit('reconnecting', info));
    this.connection.on('reconnect_failed', () => this.emit('reconnect_failed'));
    this.connection.on('error', (err) => this.emit('error', err));
    this.connection.on('hub_event', (msg: HubMessage) => {
      this.emit('hub_event', msg);
      // Also emit specific event types for convenience
      if (msg.type === 'approval_request') {
        this.emit('approval_request', msg.payload);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  /**
   * Connect to the Hub. If no deviceId was configured, auto-discovers the
   * first online device via the REST API.
   */
  async connect(): Promise<void> {
    await this.connection.connect();

    // Auto-discover device if none set
    if (!this.activeDeviceId) {
      const id = await this.hubApi.getActiveDeviceId();
      if (id) {
        this.activeDeviceId = id;
      }
    }
  }

  disconnect(): void {
    this.connection.disconnect();
  }

  get connected(): boolean {
    return this.connection.connected;
  }

  // ---------------------------------------------------------------------------
  // Device selection
  // ---------------------------------------------------------------------------

  setActiveDevice(deviceId: string): void {
    this.activeDeviceId = deviceId;
  }

  getActiveDevice(): string | null {
    return this.activeDeviceId;
  }

  // ---------------------------------------------------------------------------
  // Hub REST operations (device management + approvals)
  // ---------------------------------------------------------------------------

  readonly devices = {
    list: (): Promise<Device[]> => this.hubApi.listDevices(),
    get: (id: string): Promise<Device> => this.hubApi.getDevice(id),
    create: (body: Parameters<HubApiClient['createDevice']>[0]): Promise<Device> =>
      this.hubApi.createDevice(body),
    delete: (id: string): Promise<void> => this.hubApi.deleteDevice(id),
    revoke: (id: string): Promise<void> => this.hubApi.revokeDevice(id),
    pairingToken: (id: string): Promise<{ token: string }> =>
      this.hubApi.generatePairingToken(id),
    sendCommand: (id: string, body: Record<string, unknown>): Promise<unknown> =>
      this.hubApi.sendCommand(id, body),
    getActive: (): Promise<string | null> => this.hubApi.getActiveDeviceId(),
  };

  readonly approvals = {
    list: (): Promise<Approval[]> => this.hubApi.listApprovals(),
    approve: (id: string): Promise<void> =>
      this.hubApi.resolveApproval(id, 'approved'),
    deny: (id: string): Promise<void> =>
      this.hubApi.resolveApproval(id, 'denied'),
  };
}
