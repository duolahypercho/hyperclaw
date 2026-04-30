# Hyperclaw Architecture

Hyperclaw is a local-first dashboard for controlling AI runtimes and messaging
gateways. The open-source repo includes the dashboard, Electron wrapper, and Go
connector daemon. The hosted hub and billing system are intentionally outside
the repo.

## System Shape

```text
┌────────────────────────┐
│ Hyperclaw Dashboard    │
│ Next.js / Electron     │
└───────────┬────────────┘
            │ localhost HTTP / WS
            ▼
┌────────────────────────┐
│ Hyperclaw Connector    │
│ Go daemon + SQLite     │
└───────────┬────────────┘
            │ local process / config files
            ▼
┌────────────────────────┐
│ AI Runtimes            │
│ Claude Code, Codex,    │
│ OpenClaw, Hermes       │
└────────────────────────┘
```

Cloud builds add one optional hop:

```text
Dashboard ⇄ hosted Hub ⇄ customer Connector ⇄ local AI runtimes
```

The hub enables multi-device sync, teams, approvals, hosted agents, and other
commercial features. Community Edition does not require it.

## Local-First Contract

A fresh checkout should not call Hyperclaw Cloud by default.

- `BUILD_FLAVOR=community` maps to Electron `mode: "local"`.
- `NEXT_PUBLIC_HUB_URL` and `NEXT_PUBLIC_HUB_API_URL` are blank by default.
- Gateway discovery prefers the local connector at `127.0.0.1:18789`.
- Connector release links are hidden unless `NEXT_PUBLIC_CONNECTOR_RELEASES_URL`
  is configured.

This makes the repository usable without a hosted account and avoids leaking
production hostnames into the open-source distribution.

## Build Flavors

Electron recognizes two modes:

| Build flavor | Electron mode | Behavior |
| --- | --- | --- |
| `community`, `oss`, `local` | `local` | Load `http://localhost:1000`; prefer local connector |
| `cloud`, `commercial`, `remote` | `remote` | Load `HYPERCLAW_REMOTE_URL`; use configured hub defaults |

You can set flavor explicitly:

```bash
BUILD_FLAVOR=community npm run electron:build:mac:local
BUILD_FLAVOR=cloud HYPERCLAW_REMOTE_URL=https://app.example.com npm run electron:build:mac:remote
```

The packaging helper `electron/scripts/set-config.js` writes
`electron/app-config.json`, which Electron reads at startup. Runtime env vars
can also override the packaged mode for development and CI smoke tests.

## Dashboard

The dashboard is a Next.js Pages Router app. Important areas:

- `OS/AI/` — chat and AI runtime UI.
- `components/Home/` — home dashboard and agent widgets.
- `components/ensemble/` — multi-agent/project orchestration views.
- `components/Tool/` — device, project, settings, voice, and utility surfaces.
- `lib/openclaw-gateway-ws.ts` — gateway WebSocket client and streaming event
  dispatch.
- `lib/hyperclaw-bridge-client.ts` — bridge action client.
- `lib/hub-direct.ts` — direct hub/local connector calls with local-first
  fallback behavior.

## Connector

The connector is vendored in `connector/` and is the local daemon that talks to
AI runtimes. It owns local process spawning and runtime file access. The
dashboard should not spawn Claude Code, Codex, or Hermes directly from Electron.

Key connector areas:

- `connector/cmd/` — daemon entrypoint and runtime worker.
- `connector/internal/bridge/` — bridge actions exposed to the dashboard/hub.
- `connector/internal/store/` — SQLite-backed state and runtime mirrors.
- `connector/internal/gateway/` — local gateway and WebSocket surfaces.
- `connector/internal/runtimeworker/` — runtime worker protocol.

## Runtime Relay Rule

All AI runtime communication routes through the relay boundary:

```text
Dashboard → Hub/local bridge client → Connector → runtime CLI/process
```

Do not add direct Electron IPC handlers that spawn AI runtime CLIs. Keeping the
connector as the only process-spawning boundary preserves browser-only support,
multi-device support, and a clear security review surface.

## Cloud-Only Pieces

The following are not part of this repository:

- Hosted Hyperclaw Hub service.
- Internal UserManager/auth service.
- Hyperclaw subscription billing.
- Production deployment config and secrets.

The open-source client may contain optional config hooks for those services, but
must degrade gracefully when they are absent.

## Removed Local Whisper Path

The old Electron Whisper service and bundled ONNX model were removed from the
open-source tree. The live voice UI uses the browser Web Speech API where
available. If local transcription returns, it should be implemented as an
opt-in downloader/runtime package, not by committing large model weights to the
repository.
