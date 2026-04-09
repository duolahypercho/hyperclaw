# HyperClaw MCP Server

Exposes all 18 HyperClaw tools via the Model Context Protocol (stdio).
Compatible with Claude Code, Codex CLI, Hermes, and any MCP-capable runtime.

All tools share the same `~/.hyperclaw/connector.db` as the OpenClaw plugin.
Data created by any runtime is instantly visible in the HyperClaw dashboard.

## Setup

```bash
cd extensions/hyperclaw-mcp
npm install
npm run build      # compiles to dist/server.js
```

Or run directly with tsx (no build step):
```bash
npx tsx server.ts
```

---

## Claude Code

Add to `~/.claude/mcp.json` (or `~/Library/Application Support/Claude/mcp.json` on macOS):

```json
{
  "mcpServers": {
    "hyperclaw": {
      "command": "npx",
      "args": ["tsx", "/Users/ziwenxu/Code/Hyperclaw_app/extensions/hyperclaw-mcp/server.ts"],
      "env": {
        "HYPERCLAW_DATA_DIR": "/Users/ziwenxu/.hyperclaw"
      }
    }
  }
}
```

Or using the compiled build:
```json
{
  "mcpServers": {
    "hyperclaw": {
      "command": "node",
      "args": ["/Users/ziwenxu/Code/Hyperclaw_app/extensions/hyperclaw-mcp/dist/server.js"],
      "env": {
        "HYPERCLAW_DATA_DIR": "/Users/ziwenxu/.hyperclaw"
      }
    }
  }
}
```

---

## Codex CLI

Add to `~/.codex/config.toml`:

```toml
[[mcp_servers]]
name = "hyperclaw"
command = "npx"
args = ["tsx", "/Users/ziwenxu/Code/Hyperclaw_app/extensions/hyperclaw-mcp/server.ts"]

[mcp_servers.env]
HYPERCLAW_DATA_DIR = "/Users/ziwenxu/.hyperclaw"
```

---

## Hermes Agent

Add to your Hermes config (e.g. `~/.hermes/config.yaml`):

```yaml
mcp_servers:
  - name: hyperclaw
    command: npx
    args:
      - tsx
      - /Users/ziwenxu/Code/Hyperclaw_app/extensions/hyperclaw-mcp/server.ts
    env:
      HYPERCLAW_DATA_DIR: /Users/ziwenxu/.hyperclaw
```

Or pass via `hermes-agent --mcp-server "npx tsx /path/to/server.ts"` if the CLI supports it.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HYPERCLAW_DATA_DIR` | `~/.hyperclaw` | Path to the HyperClaw data directory |
