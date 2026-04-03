---
name: orchestration
description: Deploy agents to devices, coordinate multi-agent workflows, monitor runs, and manage the agent fleet.
---

# Orchestration

Core skill for managing the agent fleet. Covers the full lifecycle: register,
deploy, wake, monitor, recall.

## When to use

- User wants to deploy an agent to a device
- Running a multi-agent workflow (battle mode)
- Checking deployment status or run history
- Recalling agents from devices
- Coordinating work across multiple devices

## Agent Lifecycle

```
Define → Register → Deploy → Wake → Monitor → Recall
```

### 1. Register an Agent

Create the agent definition in the KV store. Two methods:

**From markdown directory:**
```
orch.registerAgent('./path/to/agents/my-agent')
```
Reads AGENTS.md + TOOLS.md + SOUL.md + HEARTBEAT.md + skills, assembles into
a single instruction blob, stores in `agent:*` namespace.

**From raw fields:**
```
orch.registerAgent({
  id: crypto.randomUUID(),
  name: 'backend-dev',
  title: 'Backend Developer',
  skills: ['agent-management', 'system-ops'],
  instructions: '...',
  soul: null,
  heartbeat: null,
})
```

### 2. Deploy to a Device

```
orch.deploy({ agentId: 'abc', deviceId: 'xyz' })
```

What happens:
1. Orchestrator verifies agent exists in KV
2. Verifies target device is online via Hub REST
3. Creates a `deploy:*` record with status `deploying`
4. Sends `add-agent` bridge command to the device
5. On success: status → `running`, stores `remoteAgentId`
6. On failure: status → `failed`, stores error

### 3. Wake an Agent

```
orch.wake({ deploymentId: 'dep-1', trigger: 'manual', reason: 'user request' })
```

What happens:
1. Verifies deployment is in `running` state
2. Creates a `run:*` record
3. Sends `send-command` bridge to wake the remote agent
4. Records result/error and duration

### 4. Monitor

```
orch.store.listDeployments({ status: 'running' })
orch.store.listRuns({ agentId: 'abc' }, 20)
```

All state is queryable from the KV store. Deployments track:
- Current status (pending/deploying/running/stopped/failed/recalled)
- Last heartbeat timestamp
- Remote agent ID on the device
- Error message if failed

### 5. Recall

```
orch.recall('dep-1')
```

Sends `delete-agent` to the device, marks deployment as `recalled`.
Safe to call even if device is offline — the deployment record updates locally.

## Multi-Agent Workflows (Battle Mode)

Create a workflow with steps that have dependency ordering:

```
const wf = await orch.createWorkflow('full-stack-feature', [
  { id: 'design', agentId: designerId, deviceId: 'd1',
    action: 'write-openclaw-doc', params: { path: 'spec.md', content: '...' },
    dependsOn: [] },
  { id: 'backend', agentId: backendId, deviceId: 'd2',
    action: 'cron-run', params: { cronId: 'implement-api' },
    dependsOn: ['design'] },
  { id: 'frontend', agentId: frontendId, deviceId: 'd3',
    action: 'cron-run', params: { cronId: 'implement-ui' },
    dependsOn: ['design'] },
  { id: 'test', agentId: qaId, deviceId: 'd2',
    action: 'cron-run', params: { cronId: 'run-tests' },
    dependsOn: ['backend', 'frontend'] },
]);

await orch.executeWorkflow(wf.id);
```

**Execution model:**
- Steps with no unfinished dependencies run in parallel
- If a step fails, dependents are skipped
- Workflow status is `completed` if all steps pass, `failed` if any fail
- All step results are stored in the `workflow:*` KV record

## Ad-hoc Bridge Commands

For one-off operations that don't need the deploy/wake model:

```
// Read docs from any device
const docs = orch.docsOn('device-xyz');
const content = await docs.getDoc('agents/report.md');

// System check on any device
const sys = orch.systemOn('device-xyz');
const logs = await sys.getLogs({ lines: 100 });

// Raw bridge
await orch.bridgeTo('device-xyz', 'get-config');
```

## Important

- The home device must be online for the orchestrator to work (KV store lives there)
- Deploying an agent does NOT guarantee it's running — check deployment status
- Workflow execution is synchronous from the orchestrator's perspective — it blocks until all steps complete or fail
- Agent definitions in KV are snapshots — updating the markdown files doesn't auto-update deployed agents. Re-register and re-deploy.
