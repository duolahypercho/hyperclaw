# TODOS

## Voice Feature

### TODO: Whisper fallback for static HTML voice overlay
- **What:** Add Whisper (MediaRecorder + IPC) fallback to `public/voice-overlay.html`
- **Why:** Production Electron builds use the static HTML overlay (Cmd+Shift+Space). It currently only uses Web Speech API, which doesn't work in Electron. Same root cause as the React voice fix.
- **Pros:** Fixes voice input for the most visible entry point (global hotkey overlay).
- **Cons:** ~200 lines of vanilla JS to maintain separately from the React `useLiveTranscription` hook.
- **Context:** The file is ~30KB with a tab UI (Voice, Insert Text, Words). The `electronAPI.voiceOverlay.whisper` IPC bridge is already available via preload.js. Implementation: add MediaRecorder recording, on stop convert to array, call `electronAPI.voiceOverlay.whisper.transcribe()`, display result.
- **Depends on:** Mic permission handler (main.js) and Whisper init fix (whisper-service.js) must be in place first.
- **Added:** 2026-03-18

### TODO: Add 'transcribing...' loading state to voice UI
- **What:** Add an `isTranscribing` state to `useLiveTranscription` hook and show loading indicator in VoiceController / voice overlay during Whisper processing.
- **Why:** With record-then-transcribe, there's a 1-2 second gap between stopping and transcript appearing. No visual feedback during this gap makes it feel broken.
- **Pros:** Better UX, prevents user confusion about whether voice input worked.
- **Cons:** Minimal — one boolean state + conditional UI text.
- **Context:** The hook already exposes `isListening`. Add `isTranscribing` that becomes true after stop (while awaiting IPC response) and false when transcript arrives or errors. VoiceController would show "Transcribing..." text and a subtle animation.
- **Depends on:** Whisper fallback implementation in useLiveTranscription.
- **Added:** 2026-03-18
- **Added:** 2026-03-18

## Channel Dashboard Widget

### TODO: Event persistence with historical replay
- **What:** Store Channel Dashboard event feed to IndexedDB so users can scroll back through history after page refresh.
- **Why:** The 500-event FIFO buffer is RAM-only — refresh the page and everything is gone. For debugging issues that happened overnight, history is essential.
- **Pros:** Enables time-travel debugging, survives page refreshes, could power a "what happened while I was away" summary.
- **Cons:** IndexedDB complexity, storage cleanup policy needed.
- **Context:** The Channel Dashboard Widget uses a 500-event in-memory buffer with FIFO eviction. This TODO adds a persistence layer below it using IndexedDB. Should include a configurable retention period (e.g., 24h default) and a cleanup job.
- **Effort:** M (human) → S (CC)
- **Priority:** P2
- **Depends on:** Channel Dashboard Widget must ship first.
- **Added:** 2026-03-25

### TODO: Custom alert rules for event patterns
- **What:** Let users define pattern-matching rules (e.g., "notify me when any cron fails" or "alert when agent X takes >60s") that trigger desktop notifications.
- **Why:** The sound notification feature only covers error events generically. Custom rules let users define what matters to them specifically.
- **Pros:** Turns the widget into a proactive alerting system, not just a passive feed.
- **Cons:** Rule definition UI complexity, storage for rules, evaluation engine.
- **Context:** Could be a simple JSON config in widget settings (pattern + action), or a full rule builder UI. Start with JSON config, evolve to UI if needed.
- **Effort:** L (human) → M (CC)
- **Priority:** P3
- **Depends on:** Channel Dashboard Widget + event persistence.
- **Added:** 2026-03-25

## Onboarding & OpenClaw Install

### TODO: Extract shared runtime utils from whisper-service.js
- **What:** Extract `getRuntimeBaseDir()`, `getBundleTargetId()`, `getBundledRuntimeDir()`, `getBundledRuntimeManifest()`, and platform detection into `electron/runtime-utils.js`. Both whisper-service.js and the new openclaw-install-service.js need these.
- **Why:** DRY — two consumers need the same asar handling, platform detection, and manifest patterns.
- **Pros:** Clean foundation for the install service. Reduces duplication from day one.
- **Cons:** Touches whisper-service.js imports (low risk, mechanical refactor).
- **Context:** Identified during eng review. The functions are at whisper-service.js:14-76.
- **Effort:** S (human) → S (CC: ~10 min)
- **Priority:** P1 — do before onboarding implementation
- **Depends on:** Nothing
- **Added:** 2026-03-28

### TODO: Pre-implementation spike — npm install + OpenClaw config creation
- **What:** Validate that `~/.hyperclaw/node/bin/npm install -g openclaw@latest` works on macOS, Linux, and WSL2 using the bundled Node.js binary (global install within the bundled Node's prefix). Also check if `openclaw` supports non-interactive config creation (e.g., `--no-interactive` flag or direct config.yaml generation).
- **Why:** The zero-terminal onboarding plan (CEO plan 2026-03-28) depends on both of these working. If npm global install fails with native modules, switch to tarball vendor approach. If non-interactive config doesn't exist, write config.yaml from a template.
- **Pros:** De-risks the two biggest unknowns before engineering starts.
- **Cons:** None — pure risk reduction.
- **Context:** See CEO plan Key Decisions #6 and #7. Spike should produce a decision document.
- **Effort:** S (human) → S (CC)
- **Priority:** P1 — BLOCKER for Phase 1 onboarding engineering
- **Depends on:** Nothing
- **Added:** 2026-03-28

### TODO: Connector RuntimeBridge for cloud-hosted runtimes
- **What:** Add a `RuntimeBridge` interface to the Go connector so the Hub can relay to cloud-hosted OpenClaw/hermes VPS instances.
- **Why:** When VPS hosting ships (onboarding Phase 2), the Hub needs a way to route commands to cloud-hosted runtimes.
- **Pros:** Enables the full cloud VPS monetization path. Also required for RuntimeAdapter cloud relay.
- **Cons:** Cross-repo work (Go connector + Hub protocol changes).
- **Context:** Deferred from both the onboarding CEO plan and the RuntimeAdapter design doc.
- **Effort:** L (human) → M (CC)
- **Priority:** P2
- **Depends on:** Onboarding Phase 1 + RuntimeAdapter Phase 3.
- **Added:** 2026-03-28

### TODO: OpenClaw auto-update mechanism
- **What:** Detect newer OpenClaw versions on npm, show non-blocking banner, allow one-click update with daemon restart.
- **Why:** Users who install via onboarding wizard need a way to stay current without terminal.
- **Pros:** Completes zero-terminal lifecycle (install, use, update, uninstall).
- **Cons:** Must handle version pinning, breaking changes, and failed updates.
- **Context:** Upgrade path defined in CEO plan. Compares installed version vs npm registry.
- **Effort:** M (human) → S (CC)
- **Priority:** P2 — fast follow after onboarding Phase 1
- **Depends on:** Onboarding Phase 1 must ship first.
- **Added:** 2026-03-28
