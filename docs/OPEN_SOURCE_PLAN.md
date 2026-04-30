# Open Source Plan

This document records the decisions and cleanup work for publishing Hyperclaw as
an open-core, local-first project.

## Decisions

| Area | Decision |
| --- | --- |
| Model | Open core |
| Public code | Dashboard, Electron wrapper, connector daemon |
| Private code | Hosted hub, billing, production deployment infrastructure |
| License | MIT |
| Repository shape | Monorepo with vendored connector |
| Default mode | Community Edition is local-only |
| Brand | Keep the Hyperclaw name |

## Edition Contract

Community Edition:

- Runs locally by default.
- Uses the bundled Go connector or a locally built connector.
- Leaves all hub and cloud API env vars empty.
- Does not require a Hyperclaw account.

Cloud Edition:

- Sets `BUILD_FLAVOR=cloud`.
- Sets `HYPERCLAW_REMOTE_URL` for Electron packaging.
- Configures `NEXT_PUBLIC_HUB_*` and cloud API env vars at deploy time.
- Connects through the proprietary hub for multi-device and team features.

## Completed Cleanup

- Removed hardcoded OpenAI organization ID.
- Replaced proprietary CDN/release URLs with env-driven config.
- Made Electron local-first by default and added build-flavor aliases.
- Removed Hyperclaw-owned Stripe billing surfaces from the open-source client.
- Preserved user-owned Stripe credential/ARR analytics paths in the connector.
- Deleted internal planning docs and agent scratch folders.
- Deleted Cursor debug logs and expanded `.gitignore` for agent/harness output.
- Sanitized personal names, paths, and internal repo headers.
- Vendored the connector daemon into the monorepo.
- Added MIT license, README, setup guide, contributing guide, security policy,
  code of conduct, architecture docs, and GitHub templates.
- Removed the old local Whisper runtime and bundled ONNX model weights.

## Whisper Removal

The repository previously included:

- `electron/whisper-service.js`
- `electron/python/whisper_server.py`
- `electron/python/models/whisper-tiny/*.onnx`
- `electron/whisper-service.test.js`

That path was not wired through `electron/main.js` or `preload.js`, and the live
voice feature uses Web Speech API where available. The bundled ONNX weights
added roughly 70+ MB to the repo and build artifacts, so they were removed.

Future local transcription should be opt-in:

1. Keep model weights out of git.
2. Download models into a user cache directory.
3. Gate the feature behind a clear setting and install step.
4. Provide checksums for downloaded assets.
5. Add tests around IPC boundaries and failure modes before shipping.

## Remaining Product Work

These are real product tasks, not blockers for opening the repository:

- Harden first-run onboarding for local connector install failures.
- Add more tests for local connector fallback and gateway reconnect behavior.
- Split cloud-only upsells from local-first settings UI where the distinction is
  still visually unclear.
- Add E2E coverage for the guided onboarding path.
- Publish real connector release artifacts and update
  `NEXT_PUBLIC_CONNECTOR_RELEASES_URL` for Cloud builds only.

## Release Checklist

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `cd connector && go test ./...`
- [ ] Fresh clone quick-start smoke test
- [ ] Secret scan before public push
- [ ] Confirm `.env.example` contains placeholders only
- [ ] Confirm no tracked model weights or debug logs
