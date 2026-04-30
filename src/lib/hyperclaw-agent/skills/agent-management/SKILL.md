---
name: agent-management
description: Manage AI agents on a device — list, create, delete, update config, and view team structure.
---

# Agent Management

Manage the AI agents running on the active device via OpenClaw.

## When to use

- User wants to see what agents are deployed
- Creating or removing agents
- Updating agent configuration (model, instructions, etc.)
- Viewing team/org structure of agents

## Workflows

### List Agents
1. Call `agents.list()`
2. Present: name, status, model, last active
3. Note any agents that appear stuck or misconfigured

### Create an Agent
1. Gather requirements: name, role/instructions, model preference
2. Call `agents.add({ name, ...config })`
3. Verify creation by listing agents again
4. Report the new agent's ID and status

### Update Agent Config
1. Call `agents.list()` to find the agent ID
2. Call `agents.updateConfig(agentId, { ...changes })`
3. Verify the update took effect

### Delete an Agent
1. Confirm with the user — this removes the agent and its state
2. Call `agents.delete(agentId)`
3. Verify deletion

### View Team
1. Call `agents.getTeam()`
2. Present the org structure: who reports to whom, roles, responsibilities

## Important

- Agent creation spawns a CLI process on the device — it may take a few seconds
- Agent names must be unique on the device
- Deleting an agent removes its files and configuration permanently
- The team structure is defined by the agents' `reportsTo` relationships
