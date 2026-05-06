---
name: hyperclaw
description: Use when the user asks an agent to manage Hyperclaw agents, projects, workflows, knowledge, todos, credentials, docs, runtime status, device setup, or cross-agent messaging through the local connector.
---

# Hyperclaw

Use the Hyperclaw connector tools before editing app data by hand. The dashboard,
OpenClaw plugin, Hermes fallback, and Codex MCP adapter all route through the
same connector dispatcher.

## Rules

- Treat the connector as the only process-spawning and state-changing boundary.
- Prefer MCP tools from the `hyperclaw` server when available.
- If MCP is unavailable, call `scripts/hermes-call.mjs <toolName> '<jsonArgs>'`.
- For connector-native actions that are not in the curated catalog, use
  `hyperclaw.bridge.dispatch` or `scripts/hermes-call.mjs bridge:<action> '{}'`.
- Use `hyperclaw-tools-list` or the MCP `tools/list` response as the live catalog.
- Destructive connector tools require explicit user confirmation and
  `confirmed: true`.
- Do not edit Hyperclaw store files directly when a connector tool exists.

## Tool Families

- Agents: list, get, create, delete, send messages across runtimes.
- Knowledge: list, read, write, create collections.
- Projects: list, get, create, update, add members, remove members.
- Workflows: list templates, create templates, start runs, inspect runs, cancel.
- Connector and runtime data: sessions, usage, skills, MCPs, health, events.

## Failure Handling

Read the returned envelope first. On success, trust `result`. On failure, surface
`humanSummary` and follow `failure.nextAction` exactly: `retry`,
`confirm_and_retry`, `fix_input_and_retry`, `give_up`, or `escalate`.
