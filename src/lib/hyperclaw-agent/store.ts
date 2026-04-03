/**
 * Orchestrator State Store — Intel SQLite KV
 *
 * All orchestrator state lives in the user's Intel SQLite database on the
 * home device. This is the single source of truth for:
 *   - Agent definitions (what agents exist, their config)
 *   - Deployments (which agent is running on which device)
 *   - Run history (heartbeat logs, results, errors)
 *   - Workflows (multi-agent coordination state)
 *
 * Uses a simple KV pattern: one table, key-prefixed namespaces.
 */
import type { IntelOperations } from './bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentRecord = {
  id: string;
  name: string;
  title: string;
  skills: string[];
  instructions: string; // AGENTS.md body content
  soul: string | null;
  heartbeat: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeploymentRecord = {
  id: string;
  agentId: string;
  deviceId: string;
  deviceName: string;
  status: 'pending' | 'deploying' | 'running' | 'stopped' | 'failed' | 'recalled';
  remoteAgentId: string | null; // ID on the device after add-agent
  config: Record<string, unknown>; // adapter config sent to device
  deployedAt: string;
  lastHeartbeat: string | null;
  error: string | null;
};

export type RunRecord = {
  id: string;
  deploymentId: string;
  agentId: string;
  deviceId: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  trigger: 'manual' | 'cron' | 'event' | 'workflow';
  startedAt: string;
  finishedAt: string | null;
  result: string | null;   // JSON string of run output
  error: string | null;
  durationMs: number | null;
};

export type WorkflowRecord = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowStep = {
  id: string;
  agentId: string;
  deviceId: string;
  action: string;
  params: Record<string, unknown>;
  dependsOn: string[]; // step IDs that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result: unknown;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hc_kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  ns    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hc_kv_ns ON hc_kv(ns);
`;

// Namespace prefixes
const NS = {
  AGENT: 'agent',
  DEPLOYMENT: 'deploy',
  RUN: 'run',
  WORKFLOW: 'workflow',
  META: 'meta',
} as const;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class OrchestratorStore {
  private intel: IntelOperations;
  private initialized = false;

  constructor(intel: IntelOperations) {
    this.intel = intel;
  }

  /** Create the KV table if it doesn't exist. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.intel.execute(SCHEMA_SQL);
    this.initialized = true;
  }

  // ---------------------------------------------------------------------------
  // Low-level KV
  // ---------------------------------------------------------------------------

  private async put(ns: string, key: string, value: unknown): Promise<void> {
    const k = `${ns}:${key}`;
    const v = JSON.stringify(value);
    await this.intel.execute(
      `INSERT INTO hc_kv (key, value, ns, updated_at) VALUES ('${k}', '${escape(v)}', '${ns}', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = '${escape(v)}', updated_at = datetime('now')`,
    );
  }

  private async get<T>(ns: string, key: string): Promise<T | null> {
    const k = `${ns}:${key}`;
    const rows = await this.intel.query(
      `SELECT value FROM hc_kv WHERE key = '${k}'`,
    ) as Array<{ value: string }>;
    if (!rows || rows.length === 0) return null;
    return JSON.parse(rows[0].value) as T;
  }

  private async del(ns: string, key: string): Promise<void> {
    const k = `${ns}:${key}`;
    await this.intel.execute(`DELETE FROM hc_kv WHERE key = '${k}'`);
  }

  private async list<T>(ns: string): Promise<T[]> {
    const rows = await this.intel.query(
      `SELECT value FROM hc_kv WHERE ns = '${ns}' ORDER BY updated_at DESC`,
    ) as Array<{ value: string }>;
    if (!rows) return [];
    return rows.map((r) => JSON.parse(r.value) as T);
  }

  // ---------------------------------------------------------------------------
  // Agent Definitions
  // ---------------------------------------------------------------------------

  async saveAgent(agent: AgentRecord): Promise<void> {
    await this.init();
    agent.updatedAt = new Date().toISOString();
    await this.put(NS.AGENT, agent.id, agent);
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    await this.init();
    return this.get<AgentRecord>(NS.AGENT, id);
  }

  async listAgents(): Promise<AgentRecord[]> {
    await this.init();
    return this.list<AgentRecord>(NS.AGENT);
  }

  async deleteAgent(id: string): Promise<void> {
    await this.init();
    await this.del(NS.AGENT, id);
  }

  // ---------------------------------------------------------------------------
  // Deployments
  // ---------------------------------------------------------------------------

  async saveDeployment(dep: DeploymentRecord): Promise<void> {
    await this.init();
    await this.put(NS.DEPLOYMENT, dep.id, dep);
  }

  async getDeployment(id: string): Promise<DeploymentRecord | null> {
    await this.init();
    return this.get<DeploymentRecord>(NS.DEPLOYMENT, id);
  }

  async listDeployments(filter?: { agentId?: string; deviceId?: string; status?: string }): Promise<DeploymentRecord[]> {
    await this.init();
    const all = await this.list<DeploymentRecord>(NS.DEPLOYMENT);
    if (!filter) return all;
    return all.filter((d) => {
      if (filter.agentId && d.agentId !== filter.agentId) return false;
      if (filter.deviceId && d.deviceId !== filter.deviceId) return false;
      if (filter.status && d.status !== filter.status) return false;
      return true;
    });
  }

  async deleteDeployment(id: string): Promise<void> {
    await this.init();
    await this.del(NS.DEPLOYMENT, id);
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  async saveRun(run: RunRecord): Promise<void> {
    await this.init();
    await this.put(NS.RUN, run.id, run);
  }

  async getRun(id: string): Promise<RunRecord | null> {
    await this.init();
    return this.get<RunRecord>(NS.RUN, id);
  }

  async listRuns(filter?: { deploymentId?: string; agentId?: string; status?: string }, limit = 50): Promise<RunRecord[]> {
    await this.init();
    const all = await this.list<RunRecord>(NS.RUN);
    let filtered = all;
    if (filter) {
      filtered = all.filter((r) => {
        if (filter.deploymentId && r.deploymentId !== filter.deploymentId) return false;
        if (filter.agentId && r.agentId !== filter.agentId) return false;
        if (filter.status && r.status !== filter.status) return false;
        return true;
      });
    }
    return filtered.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------

  async saveWorkflow(wf: WorkflowRecord): Promise<void> {
    await this.init();
    wf.updatedAt = new Date().toISOString();
    await this.put(NS.WORKFLOW, wf.id, wf);
  }

  async getWorkflow(id: string): Promise<WorkflowRecord | null> {
    await this.init();
    return this.get<WorkflowRecord>(NS.WORKFLOW, id);
  }

  async listWorkflows(): Promise<WorkflowRecord[]> {
    await this.init();
    return this.list<WorkflowRecord>(NS.WORKFLOW);
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.init();
    await this.del(NS.WORKFLOW, id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape single quotes for SQL string literals. */
function escape(s: string): string {
  return s.replace(/'/g, "''");
}
