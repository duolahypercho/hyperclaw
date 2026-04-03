---
name: system-ops
description: System operations — fetch logs, config, models, restart gateway, run diagnostics.
---

# System Operations

Low-level system operations on the active device.

## When to use

- Debugging issues (fetch logs, check config)
- Checking what AI models are available
- Restarting the OpenClaw gateway after config changes
- Running diagnostics to fix common problems

## Workflows

### Fetch Logs
1. Call `system.getLogs({ lines, level, source, ... })` with optional filters
2. Present recent log entries with timestamps
3. Highlight errors and warnings

### Check Config
1. Call `system.getConfig()`
2. Present key configuration values (redact secrets)

### List Available Models
1. Call `system.listModels()`
2. Present: model name, provider, availability

### Restart Gateway
1. Warn the user: this interrupts active sessions — **180s timeout**
2. Call `system.restartGateway()`
3. Wait for confirmation that the gateway is back up

### Run Diagnostics
1. Call `system.doctorFix()` — **180s timeout**
2. Reports problems found and auto-fixes applied
3. Present a summary of what was fixed

## Important

- `restartGateway()` and `doctorFix()` have 180s timeouts — they're slow operations
- Restarting the gateway disconnects the connector's local WebSocket temporarily
- Logs may contain sensitive information — don't persist or share them carelessly
- The doctor fix is idempotent — safe to run multiple times
