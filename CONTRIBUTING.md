# Contributing to Hyperclaw

Thanks for considering a contribution. Hyperclaw is an open, local-first
dashboard for orchestrating AI coding agents. We welcome bug reports, feature
ideas, docs improvements, and code patches.

This guide explains how to get set up, where things live, and what we look for
in a good change.

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Where to start](#where-to-start)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Making a change](#making-a-change)
- [Tests](#tests)
- [Lint and formatting](#lint-and-formatting)
- [Commit style](#commit-style)
- [Pull request checklist](#pull-request-checklist)
- [Cloud-only surfaces](#cloud-only-surfaces)
- [Security disclosures](#security-disclosures)
- [Licensing of contributions](#licensing-of-contributions)

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating you agree to uphold it. Report unacceptable behavior privately
(see `CODE_OF_CONDUCT.md` for the contact path).

## Where to start

Good first issues are tagged
[`good first issue`](https://github.com/duolahypercho/HyperClaw/labels/good%20first%20issue)
once we have community traction. Until then, the highest-leverage areas are:

- Local-first onboarding polish (`components/Onboarding/`).
- Dashboard widgets in `components/Home/widgets/`.
- Connector daemon improvements in `connector/internal/`.
- Documentation gaps in `docs/` or `README.md`.
- Test coverage — see `__tests__/` and `vitest.config.ts`.

Before doing significant work, please open an issue describing the change so we
can sanity-check direction and avoid duplicate effort.

## Development setup

Requirements:

- Node.js 18.18+ (Node 20 LTS recommended)
- npm 9+
- Go 1.25+ (only if you want to rebuild the connector daemon)
- macOS, Linux, or Windows + WSL2

Quick start:

```bash
git clone https://github.com/duolahypercho/HyperClaw.git
cd HyperClaw
cp .env.example .env.local        # most defaults are fine for local-only use
npm install
npm run dev                       # http://localhost:1000
```

Optional — run the Go connector daemon alongside (provides AI runtime relay):

```bash
cd connector
go build -o hyperclaw-connector ./cmd
./hyperclaw-connector --debug
```

The Electron desktop wrapper is in `electron/` and uses its own `package.json`:

```bash
cd electron && npm install
cd .. && npm run electron:dev
```

See [`SETUP.md`](./SETUP.md) for a longer walkthrough including troubleshooting.

## Project layout

| Path | Purpose |
|------|---------|
| `pages/`, `components/`, `OS/`, `Providers/` | Next.js dashboard (Pages Router) |
| `lib/` | Shared client + server utilities (env, hub relay, openai, etc.) |
| `connector/` | Vendored Go daemon — bridges local CLIs to the dashboard |
| `electron/` | Desktop wrapper (main, preload, packaging config) |
| `__tests__/` | Vitest unit and integration tests |
| `public/` | Static assets shipped with the dashboard |
| `docs/` | Architecture, design notes, OSS plan |

For the bigger picture see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Making a change

1. **Branch off `main`** with a descriptive name:
   ```bash
   git checkout -b fix/connector-token-race
   ```
2. **Keep diffs small.** One concern per PR. If you find unrelated cleanup
   along the way, open a separate PR for it.
3. **Update tests** in the same commit as the behavior change. New code
   without tests is unlikely to land unless the path is genuinely untestable.
4. **Update docs** if you change a public-facing behavior, env var, or script.
5. **Sanity-check on the OSS path.** The default build flavor is local-only
   (no hub). Make sure your change still works when the hub is unreachable.

## Tests

```bash
npm test                  # run vitest once
npm run test:watch        # interactive
npm test -- path/to.test  # run a single file
```

Connector tests live under `connector/`:

```bash
cd connector
go test ./...
```

Aim for tests that exercise the actual contract (HTTP / WS / store interface)
rather than internal implementation details — that keeps refactoring cheap.

## Lint and formatting

```bash
npm run lint              # next lint (ESLint)
```

We do not enforce a Prettier preset in CI; please match the surrounding style
(2-space indent, double quotes in TS/TSX, single quotes in JS/JSX where the
existing file uses them). For Go code in `connector/`, run `gofmt`/`goimports`.

## Commit style

We don't require Conventional Commits but we love them. Useful prefixes:

- `feat:` user-visible new behavior
- `fix:` bug fix
- `chore:` housekeeping, deps, configs
- `docs:` README / docs only
- `test:` tests only
- `refactor:` no behavior change

Keep the subject line ≤ 72 chars and explain the *why* in the body if it isn't
obvious from the diff.

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] `npm test` passes locally
- [ ] `npm run lint` passes locally
- [ ] Updated docs / `.env.example` if needed
- [ ] No personal paths, secrets, or hardcoded production URLs
- [ ] No `console.log` left for debugging (use `lib/logger`-style helpers when available)
- [ ] PR description explains the why, not just the what

## Cloud-only surfaces

Some features in the codebase only make sense when the optional Hyperclaw Hub
is reachable — multi-device sync, hosted approvals, billing. The OSS repo
contains the **client** for those features but never the **server**.

If you change anything that talks to the hub, check the local-first path still
degrades gracefully (see `lib/hub-direct.ts` and `lib/openclaw-gateway-ws.ts`
for examples of how we fall back to the local connector). Tests covering
unavailable-hub paths are especially welcome.

## Security disclosures

Please do **not** open public issues for security vulnerabilities. Follow the
process in [`SECURITY.md`](./SECURITY.md) instead.

## Licensing of contributions

Hyperclaw is released under the [MIT License](./LICENSE). By submitting a pull
request you agree that your contribution will be licensed under the same
terms. We don't require a CLA.

Thank you — every typo fix, bug report, and feature PR makes the project
better.
