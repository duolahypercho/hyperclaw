/**
 * HyperClaw Orchestrator
 *
 * The central brain that manages agents across devices. It:
 *   1. Stores agent definitions in the Intel SQLite KV (home device)
 *   2. Deploys agents to target devices via bridge (add-agent)
 *   3. Monitors deployments and logs runs
 *   4. Coordinates multi-agent workflows
 *   5. Routes approvals
 *
 * The orchestrator does NOT execute work itself — it deploys agents to
 * devices where they run locally with full filesystem/tool access.
 */
import { EventEmitter } from 'events';
import { HubConnection } from './connection';
import { HubApiClient } from './hub-api';
import { resolveConfig } from './config';
import {
  OrchestratorStore,
  type AgentRecord,
  type DeploymentRecord,
  type RunRecord,
  type WorkflowRecord,
  type WorkflowStep,
} from './store';
import type { HyperClawAgentConfig, HubMessage, Device, Approval } from './types';
import {
  createAgentOps,
  createIntelOps,
  createDocOps,
  createSystemOps,
  createCredentialOps,
} from './bridge';
import { loadAgentDefinition, assembleContext } from './definitions/loader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployOptions = {
  agentId: string;
  deviceId: string;
  config?: Record<string, unknown>; // adapter config overrides
};

export type WakeOptions = {
  deploymentId: string;
  trigger?: 'manual' | 'cron' | 'event' | 'workflow';
  reason?: string;
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class HyperClawOrchestrator extends EventEmitter {
  private cfg: Required<HyperClawAgentConfig>;
  private conn: HubConnection;
  private hubApi: HubApiClient;
  private homeDeviceId: string | null; // where Intel KV lives
  readonly store: OrchestratorStore;

  constructor(config: HyperClawAgentConfig) {
    super();
    this.cfg = resolveConfig(config);
    this.homeDeviceId = this.cfg.deviceId || null;

    const httpUrl = this.cfg.hubUrl.replace(/^ws/, 'http');
    this.conn = new HubConnection(this.cfg.hubUrl, this.cfg.jwtToken, this.cfg.reconnect);
    this.hubApi = new HubApiClient(httpUrl, this.cfg.jwtToken);

    // Intel ops target the home device (where the KV store lives)
    const getHomeDevice = () => {
      if (!this.homeDeviceId) throw new Error('No home device set.');
      return this.homeDeviceId;
    };

    const intelOps = createIntelOps(this.conn, getHomeDevice);
    this.store = new OrchestratorStore(intelOps);

    // Forward events
    this.conn.on('connected', () => this.emit('connected'));
    this.conn.on('disconnected', (info: unknown) => this.emit('disconnected', info));
    this.conn.on('reconnecting', (info: unknown) => this.emit('reconnecting', info));
    this.conn.on('reconnect_failed', () => this.emit('reconnect_failed'));
    this.conn.on('error', (err: unknown) => this.emit('error', err));
    this.conn.on('hub_event', (msg: HubMessage) => {
      this.emit('hub_event', msg);
      if (msg.type === 'approval_request') {
        this.emit('approval_request', msg.payload);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    await this.conn.connect();

    if (!this.homeDeviceId) {
      const id = await this.hubApi.getActiveDeviceId();
      if (id) this.homeDeviceId = id;
    }

    // Initialize the KV store schema
    await this.store.init();
  }

  disconnect(): void {
    this.conn.disconnect();
  }

  get connected(): boolean {
    return this.conn.connected;
  }

  get homeDevice(): string | null {
    return this.homeDeviceId;
  }

  // ---------------------------------------------------------------------------
  // Device Management (Hub REST)
  // ---------------------------------------------------------------------------

  async listDevices(): Promise<Device[]> {
    return this.hubApi.listDevices();
  }

  async getOnlineDevices(): Promise<Device[]> {
    const all = await this.hubApi.listDevices();
    return all.filter((d) => d.status === 'online');
  }

  // ---------------------------------------------------------------------------
  // Agent Registry — CRUD in Intel KV
  // ---------------------------------------------------------------------------

  /**
   * Register an agent definition. Can be created from a markdown directory
   * (AGENTS.md + skills) or from raw fields.
   */
  async registerAgent(
    source: string | Omit<AgentRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AgentRecord> {
    let record: AgentRecord;

    if (typeof source === 'string') {
      // Load from markdown directory
      const def = await loadAgentDefinition(source);
      record = {
        id: crypto.randomUUID(),
        name: def.frontmatter.name,
        title: def.frontmatter.title ?? '',
        skills: def.frontmatter.skills ?? [],
        instructions: assembleContext(def),
        soul: def.soul,
        heartbeat: def.heartbeat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      record = {
        ...source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    await this.store.saveAgent(record);
    this.emit('agent:registered', record);
    return record;
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    return this.store.getAgent(id);
  }

  async listAgents(): Promise<AgentRecord[]> {
    return this.store.listAgents();
  }

  async unregisterAgent(id: string): Promise<void> {
    // Recall all active deployments first
    const deps = await this.store.listDeployments({ agentId: id, status: 'running' });
    for (const dep of deps) {
      await this.recall(dep.id);
    }
    await this.store.deleteAgent(id);
    this.emit('agent:unregistered', { id });
  }

  // ---------------------------------------------------------------------------
  // Deploy — push an agent to a device
  // ---------------------------------------------------------------------------

  /**
   * Deploy a registered agent to a target device. Sends the agent definition
   * to the device via bridge `add-agent` and tracks the deployment.
   */
  async deploy(opts: DeployOptions): Promise<DeploymentRecord> {
    const agent = await this.store.getAgent(opts.agentId);
    if (!agent) throw new Error(`Agent ${opts.agentId} not found in registry.`);

    // Verify device is online
    const devices = await this.hubApi.listDevices();
    const device = devices.find((d) => (d.id || d._id) === opts.deviceId);
    if (!device) throw new Error(`Device ${opts.deviceId} not found.`);
    if (device.status !== 'online') throw new Error(`Device ${device.name} is ${device.status}, not online.`);

    const deployment: DeploymentRecord = {
      id: crypto.randomUUID(),
      agentId: opts.agentId,
      deviceId: opts.deviceId,
      deviceName: device.name,
      status: 'deploying',
      remoteAgentId: null,
      config: opts.config ?? {},
      deployedAt: new Date().toISOString(),
      lastHeartbeat: null,
      error: null,
    };

    await this.store.saveDeployment(deployment);
    this.emit('deploy:start', deployment);

    // Send agent definition to device
    const agentOps = createAgentOps(this.conn, () => opts.deviceId);
    try {
      const result = await agentOps.add({
        name: agent.name,
        title: agent.title,
        instructions: agent.instructions,
        skills: agent.skills,
        ...opts.config,
      }) as Record<string, unknown>;

      deployment.status = 'running';
      deployment.remoteAgentId = (result?.id ?? result?.agentId ?? null) as string | null;
      deployment.lastHeartbeat = new Date().toISOString();
    } catch (err) {
      deployment.status = 'failed';
      deployment.error = err instanceof Error ? err.message : String(err);
    }

    await this.store.saveDeployment(deployment);
    this.emit('deploy:complete', deployment);
    return deployment;
  }

  // ---------------------------------------------------------------------------
  // Recall — pull an agent back from a device
  // ---------------------------------------------------------------------------

  async recall(deploymentId: string): Promise<DeploymentRecord> {
    const dep = await this.store.getDeployment(deploymentId);
    if (!dep) throw new Error(`Deployment ${deploymentId} not found.`);

    if (dep.remoteAgentId && dep.status === 'running') {
      const agentOps = createAgentOps(this.conn, () => dep.deviceId);
      try {
        await agentOps.delete(dep.remoteAgentId);
      } catch {
        // Device may be offline — mark recalled anyway
      }
    }

    dep.status = 'recalled';
    await this.store.saveDeployment(dep);
    this.emit('deploy:recalled', dep);
    return dep;
  }

  // ---------------------------------------------------------------------------
  // Wake — trigger an agent run on a device
  // ---------------------------------------------------------------------------

  async wake(opts: WakeOptions): Promise<RunRecord> {
    const dep = await this.store.getDeployment(opts.deploymentId);
    if (!dep) throw new Error(`Deployment ${opts.deploymentId} not found.`);
    if (dep.status !== 'running') throw new Error(`Deployment is ${dep.status}, cannot wake.`);

    const run: RunRecord = {
      id: crypto.randomUUID(),
      deploymentId: dep.id,
      agentId: dep.agentId,
      deviceId: dep.deviceId,
      status: 'running',
      trigger: opts.trigger ?? 'manual',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
      durationMs: null,
    };

    await this.store.saveRun(run);
    this.emit('run:start', run);

    // Send a bridge command to wake the agent on the device
    const started = Date.now();
    try {
      const result = await this.conn.request('bridge', {
        deviceId: dep.deviceId,
        action: 'send-command',
        command: `wake ${dep.remoteAgentId}`,
        reason: opts.reason,
      }, 180_000);

      run.status = 'completed';
      run.result = JSON.stringify(result);
    } catch (err) {
      run.status = 'failed';
      run.error = err instanceof Error ? err.message : String(err);
    }

    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - started;
    await this.store.saveRun(run);

    // Update deployment heartbeat
    dep.lastHeartbeat = new Date().toISOString();
    await this.store.saveDeployment(dep);

    this.emit('run:complete', run);
    return run;
  }

  // ---------------------------------------------------------------------------
  // Workflows — multi-agent coordination
  // ---------------------------------------------------------------------------

  async createWorkflow(name: string, steps: Omit<WorkflowStep, 'status' | 'result' | 'error'>[]): Promise<WorkflowRecord> {
    const wf: WorkflowRecord = {
      id: crypto.randomUUID(),
      name,
      status: 'pending',
      steps: steps.map((s) => ({
        ...s,
        status: 'pending' as const,
        result: null,
        error: null,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.store.saveWorkflow(wf);
    this.emit('workflow:created', wf);
    return wf;
  }

  /**
   * Execute a workflow. Runs steps in dependency order — steps with no
   * unfinished dependencies run in parallel.
   */
  async executeWorkflow(workflowId: string): Promise<WorkflowRecord> {
    const wf = await this.store.getWorkflow(workflowId);
    if (!wf) throw new Error(`Workflow ${workflowId} not found.`);

    wf.status = 'running';
    await this.store.saveWorkflow(wf);
    this.emit('workflow:start', wf);

    const completed = new Set<string>();
    const failed = new Set<string>();

    while (true) {
      // Find steps ready to run
      const ready = wf.steps.filter((s) =>
        s.status === 'pending' &&
        s.dependsOn.every((depId) => completed.has(depId)),
      );

      // Skip steps whose dependencies failed
      const blocked = wf.steps.filter((s) =>
        s.status === 'pending' &&
        s.dependsOn.some((depId) => failed.has(depId)),
      );
      for (const s of blocked) {
        s.status = 'skipped';
        s.error = 'Dependency failed';
      }

      if (ready.length === 0) break; // nothing left to run

      // Execute ready steps in parallel
      await Promise.all(ready.map(async (step) => {
        step.status = 'running';
        await this.store.saveWorkflow(wf);

        try {
          const result = await this.conn.request('bridge', {
            deviceId: step.deviceId,
            action: step.action,
            ...step.params,
          }, 180_000);

          step.status = 'completed';
          step.result = result;
          completed.add(step.id);
        } catch (err) {
          step.status = 'failed';
          step.error = err instanceof Error ? err.message : String(err);
          failed.add(step.id);
        }
      }));

      await this.store.saveWorkflow(wf);
    }

    wf.status = failed.size > 0 ? 'failed' : 'completed';
    await this.store.saveWorkflow(wf);
    this.emit('workflow:complete', wf);
    return wf;
  }

  // ---------------------------------------------------------------------------
  // Approvals (Hub REST)
  // ---------------------------------------------------------------------------

  async listApprovals(): Promise<Approval[]> {
    return this.hubApi.listApprovals();
  }

  async approve(approvalId: string): Promise<void> {
    await this.hubApi.resolveApproval(approvalId, 'approved');
  }

  async deny(approvalId: string): Promise<void> {
    await this.hubApi.resolveApproval(approvalId, 'denied');
  }

  // ---------------------------------------------------------------------------
  // Convenience — bridge to any device (for ad-hoc commands)
  // ---------------------------------------------------------------------------

  /**
   * Send a raw bridge command to a specific device. For one-off operations
   * that don't fit the deploy/wake model.
   */
  async bridgeTo(deviceId: string, action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.conn.request('bridge', { deviceId, action, ...params });
  }

  /**
   * Read documents from a device (useful for pulling agent output).
   */
  docsOn(deviceId: string) {
    return createDocOps(this.conn, () => deviceId);
  }

  /**
   * System ops on a device.
   */
  systemOn(deviceId: string) {
    return createSystemOps(this.conn, () => deviceId);
  }

  /**
   * Credential ops on a device.
   */
  credentialsOn(deviceId: string) {
    return createCredentialOps(this.conn, () => deviceId);
  }
}
