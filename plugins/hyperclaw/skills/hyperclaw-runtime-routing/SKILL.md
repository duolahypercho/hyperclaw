---
name: hyperclaw-runtime-routing
description: Use when wiring Hyperclaw into Codex, Hermes, OpenClaw, Claude Code, or another agent runtime.
---

# Hyperclaw Runtime Routing

Hyperclaw runtime communication is connector-first.

## Codex

Install this plugin and use the `hyperclaw` MCP server from `.mcp.json`. The
stdio adapter reads `~/.hyperclaw/connector.token` and proxies calls to the live
connector.

## OpenClaw

Use `extensions/hyperclaw` for the OpenClaw-native plugin. The connector embeds
the same plugin source under `connector/internal/plugin/embed` for bundled
installs and update pushes.

## Hermes

Hermes can use the plain HTTP fallback:

```bash
node plugins/hyperclaw/scripts/hermes-call.mjs hyperclaw.projects.list '{}'
```

```bash
node plugins/hyperclaw/scripts/hermes-call.mjs bridge:connector-health '{}'
```

The script POSTs `{ name, arguments, confirmed }` to `/mcp/call`, so it reaches
the same connector dispatcher as MCP callers.

## MCP Hosts

Point any MCP-capable host at the connector's Streamable HTTP endpoint:
`http://127.0.0.1:18790/mcp`.

If the host only supports stdio MCP, use `scripts/hyperclaw-mcp-stdio.mjs`.
