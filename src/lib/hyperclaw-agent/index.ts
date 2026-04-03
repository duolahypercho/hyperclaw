/**
 * HyperClaw Agent — Orchestrator
 *
 * Deploys and manages AI agents across devices. All state lives in the
 * Intel SQLite KV on the user's home device.
 *
 * Usage:
 *   import { HyperClawOrchestrator } from '@/lib/hyperclaw-agent';
 *
 *   const orch = new HyperClawOrchestrator({
 *     hubUrl: 'wss://hub.hypercho.com',
 *     jwtToken: '<jwt>',
 *   });
 *   await orch.connect();
 *
 *   // Register an agent from markdown definitions
 *   const agent = await orch.registerAgent('./src/lib/hyperclaw-agent/agents/default');
 *
 *   // Deploy to a device
 *   const dep = await orch.deploy({ agentId: agent.id, deviceId: 'device-123' });
 *
 *   // Wake it
 *   await orch.wake({ deploymentId: dep.id });
 *
 *   // Multi-agent workflow
 *   const wf = await orch.createWorkflow('build-and-test', [
 *     { id: 'build', agentId: 'a1', deviceId: 'd1', action: 'cron-run', params: { cronId: 'build' }, dependsOn: [] },
 *     { id: 'test', agentId: 'a2', deviceId: 'd2', action: 'cron-run', params: { cronId: 'test' }, dependsOn: ['build'] },
 *   ]);
 *   await orch.executeWorkflow(wf.id);
 */

// Primary API — the orchestrator
export { HyperClawOrchestrator } from './orchestrator';
export type { DeployOptions, WakeOptions } from './orchestrator';

// Legacy direct-access agent (still useful for single-device scripts)
export { HyperClawAgent } from './agent';
export type { AppStateOperations } from './agent';

// Store — all orchestrator state
export { OrchestratorStore } from './store';
export type {
  AgentRecord,
  DeploymentRecord,
  RunRecord,
  WorkflowRecord,
  WorkflowStep,
} from './store';

// Core types
export type {
  HyperClawAgentConfig,
  HubMessage,
  HubMessageType,
  RequestPayload,
  ResponsePayload,
  BridgeAction,
  BridgeRequest,
  Device,
  DeviceStatus,
  Approval,
  AgentEvent,
} from './types';

// Bridge operations (for advanced use / targeting specific devices)
export type {
  AgentOperations,
  TodoOperations,
  CronOperations,
  DocOperations,
  IntelOperations,
  CredentialOperations,
  OrgChartOperations,
  SystemOperations,
  LayoutOperations,
} from './bridge';

// Internals (for custom setups)
export { HubConnection } from './connection';
export { HubApiClient } from './hub-api';
export { resolveConfig, buildDashboardWsUrl } from './config';

// Agent definition system
export {
  loadAgentDefinition,
  assembleContext,
  loadAndAssemble,
} from './definitions/loader';
export type {
  AgentDefinition,
  AgentFrontmatter,
  SkillDefinition,
  SkillFrontmatter,
} from './definitions/loader';
