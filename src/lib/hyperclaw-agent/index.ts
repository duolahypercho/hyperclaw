/**
 * HyperClaw Agent — Orchestrator + Chat
 *
 * Usage:
 *   import { HyperClawOrchestrator, OrchestratorChat } from '@/lib/hyperclaw-agent';
 *
 *   const orch = new HyperClawOrchestrator({
 *     hubUrl: 'wss://hub.hypercho.com',
 *     jwtToken: '<jwt>',
 *   });
 *   await orch.connect();
 *
 *   const chat = new OrchestratorChat(orch, {
 *     llm: { provider: 'anthropic', apiKey: '<user-key>', model: 'claude-sonnet-4-6' },
 *   });
 *
 *   const session = await chat.createSession();
 *   const result = await chat.send(session.id, 'list my devices');
 *   console.log(result.reply);
 */

// Primary API — orchestrator + chat
export { HyperClawOrchestrator } from './orchestrator';
export type { DeployOptions, WakeOptions } from './orchestrator';

export { OrchestratorChat } from './chat';
export type { ChatSession, ChatConfig, ChatResult, ToolCallRecord } from './chat';

// LLM client (provider-agnostic, user's keys)
export { LLMClient } from './llm';
export type { LLMConfig, LLMProvider, ToolDefinition, Message, ContentBlock, ToolCall, LLMResponse } from './llm';

// Tool schemas
export { ORCHESTRATOR_TOOLS } from './tools-schema';

// Legacy direct-access agent (single-device scripts)
export { HyperClawAgent } from './agent';
export type { AppStateOperations } from './agent';

// Store — all state in Intel SQLite KV
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

// Bridge operations (for targeting specific devices)
export type {
  AgentOperations,
  TodoOperations,
  CronOperations,
  DocOperations,
  IntelOperations,
  CredentialOperations,
  SystemOperations,
  LayoutOperations,
} from './bridge';

// Internals
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
