/**
 * Bridge actions as LLM tool definitions.
 *
 * Each tool maps to an orchestrator method. When the LLM calls a tool,
 * the chat engine executes the corresponding orchestrator action.
 */
import type { ToolDefinition } from './llm';

export const ORCHESTRATOR_TOOLS: ToolDefinition[] = [
  // ---------------------------------------------------------------------------
  // Devices
  // ---------------------------------------------------------------------------
  {
    name: 'list_devices',
    description: 'List all devices connected to the Hub with their status (online/offline).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_online_devices',
    description: 'List only online devices.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ---------------------------------------------------------------------------
  // Agent Registry
  // ---------------------------------------------------------------------------
  {
    name: 'list_registered_agents',
    description: 'List all agent definitions registered in the orchestrator.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'register_agent',
    description: 'Register a new agent definition in the orchestrator.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name' },
        title: { type: 'string', description: 'Agent title/role' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Skill names' },
        instructions: { type: 'string', description: 'Agent instructions (system prompt)' },
      },
      required: ['name', 'instructions'],
    },
  },
  {
    name: 'unregister_agent',
    description: 'Remove an agent definition and recall all its deployments.',
    input_schema: {
      type: 'object',
      properties: { agentId: { type: 'string' } },
      required: ['agentId'],
    },
  },

  // ---------------------------------------------------------------------------
  // Deployments
  // ---------------------------------------------------------------------------
  {
    name: 'deploy_agent',
    description: 'Deploy a registered agent to a target device. The device must be online.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Registered agent ID' },
        deviceId: { type: 'string', description: 'Target device ID' },
      },
      required: ['agentId', 'deviceId'],
    },
  },
  {
    name: 'recall_agent',
    description: 'Recall (remove) a deployed agent from its device.',
    input_schema: {
      type: 'object',
      properties: { deploymentId: { type: 'string' } },
      required: ['deploymentId'],
    },
  },
  {
    name: 'list_deployments',
    description: 'List agent deployments. Optionally filter by agentId, deviceId, or status.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        deviceId: { type: 'string' },
        status: { type: 'string', description: 'pending|deploying|running|stopped|failed|recalled' },
      },
      required: [],
    },
  },
  {
    name: 'wake_agent',
    description: 'Trigger a run on a deployed agent.',
    input_schema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string' },
        reason: { type: 'string', description: 'Why this run is being triggered' },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'list_runs',
    description: 'List run history. Optionally filter by deploymentId, agentId, or status.',
    input_schema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string' },
        agentId: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------
  {
    name: 'create_workflow',
    description: 'Create a multi-agent workflow with dependency-ordered steps.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow name' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              agentId: { type: 'string' },
              deviceId: { type: 'string' },
              action: { type: 'string', description: 'Bridge action to execute' },
              params: { type: 'object' },
              dependsOn: { type: 'array', items: { type: 'string' }, description: 'Step IDs that must complete first' },
            },
            required: ['id', 'agentId', 'deviceId', 'action', 'dependsOn'],
          },
        },
      },
      required: ['name', 'steps'],
    },
  },
  {
    name: 'execute_workflow',
    description: 'Run a workflow. Steps with satisfied dependencies execute in parallel.',
    input_schema: {
      type: 'object',
      properties: { workflowId: { type: 'string' } },
      required: ['workflowId'],
    },
  },
  {
    name: 'list_workflows',
    description: 'List all workflows.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ---------------------------------------------------------------------------
  // Approvals
  // ---------------------------------------------------------------------------
  {
    name: 'list_approvals',
    description: 'List pending approval requests from agents.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'resolve_approval',
    description: 'Approve or deny a pending approval request.',
    input_schema: {
      type: 'object',
      properties: {
        approvalId: { type: 'string' },
        decision: { type: 'string', description: 'approve or deny' },
      },
      required: ['approvalId', 'decision'],
    },
  },

  // ---------------------------------------------------------------------------
  // Bridge (ad-hoc commands to any device)
  // ---------------------------------------------------------------------------
  {
    name: 'bridge_command',
    description: 'Send a bridge action directly to a device. Use for ad-hoc operations like fetching logs, listing agents on a device, reading docs, querying intel, managing cron jobs, etc.',
    input_schema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'Target device ID' },
        action: {
          type: 'string',
          description: 'Bridge action: list-agents, get-tasks, get-crons, get-logs, get-config, list-models, list-openclaw-docs, get-openclaw-doc, intel-query, credentials:list, read-orgchart, get-layouts, get-app-state, etc.',
        },
        params: { type: 'object', description: 'Action-specific parameters' },
      },
      required: ['deviceId', 'action'],
    },
  },
];
