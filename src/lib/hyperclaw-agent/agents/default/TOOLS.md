# Orchestrator Tools Reference

## 1. Intel KV Store (Home Device)

All orchestrator state. Single table `hc_kv` with key-prefixed namespaces.

| Namespace | Key Format | Record Type |
|-----------|-----------|-------------|
| `agent:*` | `agent:{uuid}` | Agent definitions — name, skills, assembled instructions |
| `deploy:*` | `deploy:{uuid}` | Deployments — agent→device mapping, status, remote ID |
| `run:*` | `run:{uuid}` | Run history — trigger, duration, result, errors |
| `workflow:*` | `workflow:{uuid}` | Workflows — steps, dependencies, execution state |

### Store Operations

| Method | Description |
|--------|-------------|
| `store.saveAgent(record)` | Upsert an agent definition |
| `store.getAgent(id)` | Get agent by ID |
| `store.listAgents()` | List all registered agents |
| `store.deleteAgent(id)` | Remove an agent definition |
| `store.saveDeployment(record)` | Upsert a deployment |
| `store.getDeployment(id)` | Get deployment by ID |
| `store.listDeployments(filter?)` | Filter by agentId, deviceId, status |
| `store.saveRun(record)` | Upsert a run record |
| `store.listRuns(filter?, limit?)` | Filter by deploymentId, agentId, status |
| `store.saveWorkflow(record)` | Upsert a workflow |
| `store.getWorkflow(id)` | Get workflow by ID |
| `store.listWorkflows()` | List all workflows |

## 2. Hub REST API

Direct operations on the Hub (not routed through any device).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `listDevices()` | `GET /api/devices` | All devices with status |
| `getOnlineDevices()` | `GET /api/devices` | Filtered to online only |
| `listApprovals()` | `GET /api/approvals` | Pending approval requests |
| `approve(id)` | `POST /api/approvals/{id}/resolve` | Approve a request |
| `deny(id)` | `POST /api/approvals/{id}/resolve` | Deny a request |

## 3. Bridge Commands (To Any Device)

Send actions to a specific device through the Hub relay.

### Orchestrator Methods

| Method | What it does |
|--------|-------------|
| `deploy({ agentId, deviceId })` | Push agent to device via `add-agent` |
| `recall(deploymentId)` | Pull agent back via `delete-agent` |
| `wake({ deploymentId })` | Trigger a run via `send-command` |
| `bridgeTo(deviceId, action, params)` | Raw bridge command to any device |
| `docsOn(deviceId)` | Doc operations scoped to a device |
| `systemOn(deviceId)` | System operations scoped to a device |
| `credentialsOn(deviceId)` | Credential operations scoped to a device |

### Available Bridge Actions (on target devices)

**Agent Management**: `list-agents`, `add-agent`, `delete-agent`, `update-agent-config`, `get-team`
**Tasks**: `get-tasks`, `add-task`, `update-task`, `delete-task`
**Cron**: `get-crons`, `cron-add`, `cron-run` (180s), `cron-edit`, `cron-delete`
**Docs**: `list-openclaw-docs`, `get-openclaw-doc`, `write-openclaw-doc`, `delete-openclaw-doc`
**Intel**: `intel-query`, `intel-execute` (180s), `intel-insert`, `intel-update`, `intel-delete`
**Credentials**: `credentials:store`, `credentials:list`, `credentials:delete`, `credentials:apply`
**System**: `get-logs`, `get-config`, `list-models`, `gateway-restart` (180s), `openclaw-doctor-fix` (180s)

## 4. Events (WebSocket)

Incoming events from the Hub:

| Event | When |
|-------|------|
| `approval_request` | An agent on a device needs user approval |
| `evt` (agents.changed) | Agent list changed on a device |
| `event` (device_status) | Device came online or went offline |

Listen via `orch.on('approval_request', handler)` or `orch.on('hub_event', handler)`.
