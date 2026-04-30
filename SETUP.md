# Hyperclaw — Detailed Setup Guide

This is the long-form setup guide. For the 60-second path, see the
[README](README.md). This document covers everything you might want to wire up
when running Hyperclaw seriously.

## Prerequisites

- **Node.js 18+** (we test against 18 and 20; 22+ should also work)
- **npm 9+** (or pnpm/yarn — the lockfile is npm)
- **Go 1.21+** *(only if you want to build the connector from source)*
- **Git**

You do **not** need MongoDB, a hub, a UserManager, or any cloud account to run
the Community Edition. The dashboard runs against a local connector and a
SQLite store under `~/.hyperclaw/`.

## Clone and install

```bash
git clone https://github.com/duolahypercho/HyperClaw.git
cd HyperClaw
npm install
```

## Configure environment

Copy the template and fill in only what you need:

```bash
cp .env.example .env.local
```

The single required value is `NEXTAUTH_SECRET`. Generate one:

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env.local
```

Everything else in `.env.example` is optional. The file annotates which
features each variable unlocks.

### Community Edition vs Cloud Edition

| Variable | Community (default) | Cloud |
|---|---|---|
| `NEXT_PUBLIC_HUB_URL` | empty — local-only | `wss://your-hub` |
| `NEXT_PUBLIC_HUB_API_URL` | empty | `https://your-hub` |
| `NEXT_PUBLIC_HYPERCHO_API` | empty | `https://your-user-manager` |
| `NEXT_PUBLIC_CONNECTOR_RELEASES_URL` | empty — UI tells users to build locally | `https://github.com/<org>/<connector>/releases` |

If a Hub URL is blank, the dashboard never reaches out — the WebSocket layer
short-circuits and falls back to talking to the local connector directly.

### Optional providers

| Provider | Variables | What it unlocks |
|---|---|---|
| OpenAI | `OPENAI_API_KEY`, `OPENAI_ORG_ID` | In-app text autosuggest / enhance endpoints |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in on `/auth/Login` |
| Twitter / X OAuth | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_CALLBACK_URL` | X sign-in and tweet posting tools |
| AWS S3 | `S3_UPLOAD_*` | File and knowledge uploads |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Error reporting (you wire up your own org) |

## Run the dashboard

### Browser (Next.js dev server)

```bash
npm run dev
# http://localhost:1000
```

### Desktop (Electron, dev mode)

```bash
npm run electron:dev
```

This loads the running dev server inside an Electron shell so you can iterate
on desktop-specific behavior with hot reload.

### Desktop (Electron, packaged build)

```bash
# macOS Apple Silicon / Intel
npm run electron:build:mac:local

# Windows
npm run electron:build:win:local

# Linux
npm run electron:build:linux:local
```

Outputs land in `electron/dist-electron/`. The packaged app bundles the
connector binary so end users get a single installer.

## Run the connector

The dashboard is happy on its own, but the AI runtime panels (Claude Code,
Codex, OpenClaw, Hermes) need the connector daemon for live streaming.

### From source

```bash
cd connector
go build -o hyperclaw-connector ./cmd
./hyperclaw-connector
```

The connector listens on a localhost port the dashboard auto-discovers. State
lives in `~/.hyperclaw/connector.db` (SQLite).

### Bundled with Electron

When you build the Electron app via `npm run electron:build:*`, the connector
is built and shipped inside the package — no separate process to start.

### As a system service

Once you have a built binary:

```bash
./hyperclaw-connector install   # installs as launchd (macOS) or systemd (Linux)
./hyperclaw-connector status
./hyperclaw-connector uninstall          # keeps your data
./hyperclaw-connector uninstall --purge  # nukes ~/.hyperclaw too
```

Full details (env vars, plugin packing, OTA updates) live in
[`connector/README.md`](connector/README.md).

## Available scripts (cheat sheet)

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 1000 |
| `npm run build` | Production Next.js build |
| `npm run start` | Run the production build on port 1000 |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run electron` | Run the packaged Electron build locally |
| `npm run electron:dev` | Electron pointing at the dev server |
| `npm run electron:build:mac:local` | Build macOS desktop app |
| `npm run electron:build:win:local` | Build Windows desktop app |
| `npm run electron:build:linux:local` | Build Linux desktop app |
| `npm run connector:build` | Build the connector binary |
| `npm run connector:build:all` | Build the connector for all targets |
| `npm run plugin:pack` | Pack the bundled OpenClaw plugin tarball |

## Project structure

See the [README](README.md#project-structure) — same tree, kept in one place
to avoid drift.

## Troubleshooting

### Dashboard says "Gateway not reachable"

The connector isn’t running. Either start it (`./hyperclaw-connector` from
`./connector` after building), or build the Electron app which bundles it.

### `EADDRINUSE: address already in use :::1000`

Something else is on port 1000. Kill it or change the dev port:

```bash
PORT=3000 npm run dev
```

(The Next.js script hardcodes 1000 today; for a different port, edit
`package.json` or run `next dev -p 3000` directly.)

### `NEXTAUTH_SECRET` errors

You skipped step 2. Run `openssl rand -base64 32` and put the output in
`.env.local` as `NEXTAUTH_SECRET=...`.

### Electron build fails on macOS

Make sure you have Xcode Command Line Tools installed (`xcode-select
--install`) and the connector binary builds standalone first
(`npm run connector:build`).

### "Hub" features look broken

That’s expected on Community Edition. The hub is the proprietary multi-device
relay — features like cross-device sync, hosted agents, and team workspaces
require Cloud Edition. The local-first feature set should still work.

## Related projects

| Project | Purpose | License |
|---|---|---|
| **Hyperclaw** *(this repo)* | Dashboard + connector | MIT |
| **OpenClaw** | Multi-channel agent gateway (WhatsApp, Slack, …) | Open source |
| **Hyperclaw Cloud** | Hosted hub, user manager, billing | Proprietary |

A shared JWT secret links Hyperclaw, the connector, and (in Cloud Edition) the
hub — see `.env.example` for the relevant variables.
