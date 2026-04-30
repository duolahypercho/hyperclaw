# Security Policy

Hyperclaw is local-first software that can coordinate AI runtimes, read local
files, and relay messages through a connector daemon. Please treat security
reports seriously and do not publish exploit details before maintainers have a
chance to respond.

## Supported Versions

The open-source project is pre-1.0. Security fixes target the latest `main`
branch unless a release branch is explicitly marked as supported.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Older snapshots | No |

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for suspected vulnerabilities.

Use GitHub's private vulnerability reporting for this repository if it is
enabled:

https://github.com/duolahypercho/HyperClaw/security/advisories/new

If private reporting is not available yet, contact the maintainers privately
through the repository owner account and avoid posting exploit details in a
public issue.

Include:

- A short summary of the issue.
- Affected paths, APIs, or commands.
- Reproduction steps or a minimal proof of concept.
- Expected impact.
- Whether the issue requires local machine access, a malicious workspace, a
  malicious connector, or remote network access.

We aim to acknowledge valid reports within 7 days and will coordinate disclosure
timing with the reporter when possible.

## Security Boundaries

Community Edition defaults to local-only mode:

- The dashboard talks to a connector on `localhost`.
- Hub URLs are empty unless explicitly configured.
- Electron builds use `mode: "local"` unless `BUILD_FLAVOR=cloud` or remote
  packaging config is set.

The proprietary Hyperclaw Cloud hub, billing, and hosted runtime infrastructure
are not part of this repository.

## High-Risk Areas

Please pay extra attention to:

- Connector bridge actions that execute commands or write files.
- Runtime adapters for Claude Code, Codex, OpenClaw, and Hermes.
- Electron `preload.js` and IPC handlers.
- Auth/session handling in `pages/api/`.
- User-uploaded files and knowledge ingestion paths.
- Any code that parses model output into tool calls.

## Secrets and Logs

Never commit:

- `.env*` files containing real values.
- Device tokens, JWTs, OAuth tokens, or API keys.
- Cursor/agent debug logs.
- Model provider credentials.
- Private keys or certificates.

The repository `.gitignore` blocks common secret and agent-scratch paths, but it
is only a safety net. Review your diff before opening a pull request.
