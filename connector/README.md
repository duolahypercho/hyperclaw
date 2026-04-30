# Hyperclaw Connector

A Go daemon that bridges the Hyperclaw dashboard to AI runtime CLIs (Claude
Code, Codex, Hermes) and to the local OpenClaw gateway.

## Overview

The connector runs on the same machine as the dashboard (laptop, VPS, EC2,
…) and handles all CLI spawning and event streaming. It maintains two
connection types:

1. **Local** (always on): WebSocket / HTTP to the dashboard and to AI CLIs
2. **Cloud** (Cloud Edition only): Outbound-only WebSocket to a Hyperclaw Hub
   for multi-device sync. No inbound ports are ever exposed.

In **Community Edition** only the local connections are active; the connector
never reaches out to a hub unless you explicitly configure one.

## Quick Start

### Community Edition (local-only)

```bash
# Build from source (see Building from Source below)
./hyperclaw-connector
```

That’s it — no hub, no token. The dashboard auto-discovers the connector on
localhost.

### Cloud Edition (paired with a hub)

```bash
# Set environment variables for your hub
export HUB_URL="wss://your-hub.example.com"
export DEVICE_TOKEN="your-pairing-token"   # from dashboard → Devices → Add Device

./hyperclaw-connector
```

Or use the bundled install script (Linux/macOS), pointed at your own hub and
download base URL:

```bash
HUB_URL="wss://your-hub.example.com" \
DOWNLOAD_BASE_URL="https://your-cdn.example.com/connector" \
bash install.sh --token "your-pairing-token"
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HUB_URL` | Cloud only | *(empty)* | Hub WebSocket URL. Leave empty for Community Edition. |
| `DEVICE_TOKEN` | Cloud only | - | Pairing token from dashboard |
| `DEVICE_ID` | No | auto-generated | Device identifier |
| `GATEWAY_HOST` | No | `127.0.0.1` | OpenClaw gateway host |
| `GATEWAY_PORT` | No | auto-discover | OpenClaw gateway port |
| `GATEWAY_TOKEN` | No | from config | Gateway auth token |
| `DATA_DIR` | No | `~/.hyperclaw` | Local data directory |
| `DEBUG` | No | `false` | Enable debug logging |

*Required unless using `--enroll` mode.

### Command Line Flags

```bash
./hyperclaw-connector --help
```

## Service Management

```bash
# Install as a system service (launchd on macOS, systemd on Linux)
hyperclaw install

# Check service status
hyperclaw status

# Uninstall — stops the service and removes the binary
# Your data (~/.hyperclaw/) is kept so you can reinstall later without losing anything
hyperclaw uninstall

# Uninstall and delete all data (database, config, logs)
hyperclaw uninstall --purge

# Print version
hyperclaw version
```

### What's in `~/.hyperclaw/`?

| File | Description |
|------|-------------|
| `connector.db` | SQLite database (tasks, agents, events, actions) |
| `connector.log` | Service logs |
| `.env` | Device credentials (device ID, pairing token) |
| `todo.json` | Legacy task data (pre-SQLite) |
| `events.jsonl` | Legacy event log |

By default, `uninstall` preserves this directory so you can upgrade or reinstall without losing your data. Use `--purge` only if you want a clean slate.

## Building from Source

### Prerequisites

- Go 1.21+

### Build

The connector lives inside the [Hyperclaw monorepo](../README.md). From the
repo root:

```bash
cd connector
go build -o hyperclaw-connector ./cmd
```

### Run in development

```bash
go run ./cmd/main.go --debug
```

## Updating the Plugin

The connector bundles the HyperClaw OpenClaw plugin (embedded at build time) and supports over-the-air updates via the hub.

### After editing plugin source (`Hyperclaw_app/extensions/hyperclaw/`)

```bash
# In the Hyperclaw_app repo — packs tarball + syncs to connector embed
npm run plugin:pack

# Then rebuild the connector so new installs embed the latest plugin
cd ../hyperclaw-connector
go build -o hyperclaw-connector ./cmd
```

### Push update to running connectors

Send an `update-plugin` message from the hub to any connected device:

```json
{
  "type": "update-plugin",
  "payload": {
    "version": "0.3.0",
    "url": "https://your-cdn.example.com/hyperclaw-plugin.tgz"
  }
}
```

The connector will:
1. Compare `version` against the installed plugin — skip if already up to date
2. Download and extract the tarball to `~/.hyperclaw/plugin/`
3. Run `npm install` + `openclaw plugins install`
4. Report status back via `plugin.update` events (`downloading` → `extracting` → `installing` → `completed`)

No gateway restart needed — changes take effect on the next agent session.

## Architecture

```
┌─────────────────┐      WSS       ┌─────────────────┐
│  Hyperclaw      │◀──────────────▶│  Hub            │
│  Dashboard      │   (cloud-only) │  (proprietary)  │
└─────────────────┘                └────────┬────────┘
                                            │
                                            │ WSS (outbound, opt-in)
                                            ▼
┌─────────────────┐       WS        ┌─────────────────┐
│  OpenClaw       │◀───────────────▶│  Connector      │
│  Gateway        │   (localhost)   │  (this tool)    │
└─────────────────┘                 └─────────────────┘
```

In Community Edition, only the bottom row is active — the connector talks to
the gateway and the dashboard, never to a hub.

## Security

- **No inbound ports**: Connector only makes outbound connections
- **Gateway token stays local**: Never sent to the cloud Hub
- **Scoped operations**: Only allowlisted operations are proxied
- **Approval-gated writes**: Exec, file writes, config patches require approval from the Hub

## Supported Operations

### Read (allowed by default)
- List sessions
- List cron jobs
- List agents
- Read files (workspace-scoped)

### Write (requires approval)
- Execute commands
- Write files
- Patch config

## License

[MIT](../LICENSE) — same license as the rest of the Hyperclaw monorepo.
