# Hyperclaw Plugin

This plugin makes the local Hyperclaw connector available to Codex and other
agent runtimes as one shared control plane.

The plugin does not spawn AI runtimes directly. It talks to the connector on
`127.0.0.1:18790`, and the connector remains the only process boundary for
Claude Code, Codex, OpenClaw, Hermes, runtime sessions, credentials, projects,
workflows, knowledge, todos, docs, intelligence data, and dashboard events.

## Runtime Surfaces

- Codex: `.mcp.json` starts `scripts/hyperclaw-mcp-stdio.mjs`, a stdio MCP
  adapter that mirrors the connector's live tool catalog.
- OpenClaw: use the existing `extensions/hyperclaw` plugin or the embedded
  copy in `connector/internal/plugin/embed`.
- Hermes: call the connector fallback endpoint with
  `scripts/hermes-call.mjs` or direct POST JSON to `/mcp/call`.
- Claude Code and future agents: attach any MCP-capable host to the connector
  MCP endpoint or this plugin's stdio adapter.

## Requirements

1. Build or run the connector from `connector/`.
2. Keep the connector listening on `http://127.0.0.1:18790`.
3. Let the connector create `~/.hyperclaw/connector.token`, or set
   `HYPERCLAW_CONNECTOR_TOKEN` before starting the agent runtime.

## Useful Commands

```bash
cd connector
go build -o hyperclaw-connector ./cmd
./hyperclaw-connector
```

```bash
node plugins/hyperclaw/scripts/hermes-call.mjs hyperclaw.projects.list '{}'
```

```bash
node plugins/hyperclaw/scripts/hermes-call.mjs bridge:connector-health '{}'
```

## Source Of Truth

The connector owns the feature catalog. When new agent-facing connector tools
are added to `connector/internal/bridge/hyperclaw_tools.go`, Codex and other
MCP callers pick them up from `hyperclaw-tools-list` on the next connector
restart. Connector-native actions that are not yet promoted into the curated
MCP catalog are still reachable through `hyperclaw.bridge.dispatch` or the
Hermes `bridge:<action>` form.
