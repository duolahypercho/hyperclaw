# TODOS

## Voice Feature

### TODO: SenseVoice fallback for static HTML voice overlay
- **What:** Add SenseVoice (MediaRecorder + IPC) fallback to `public/voice-overlay.html`
- **Why:** Production Electron builds use the static HTML overlay (Cmd+Shift+Space). It currently only uses Web Speech API, which doesn't work in Electron. Same root cause as the React voice fix.
- **Pros:** Fixes voice input for the most visible entry point (global hotkey overlay).
- **Cons:** ~200 lines of vanilla JS to maintain separately from the React `useLiveTranscription` hook.
- **Context:** The file is ~30KB with a tab UI (Voice, Insert Text, Words). The `electronAPI.voiceOverlay.sensevoice` IPC bridge is already available via preload.js. Implementation: add MediaRecorder recording, on stop convert to array, call `electronAPI.voiceOverlay.sensevoice.transcribe()`, display result.
- **Depends on:** Mic permission handler (main.js) and SenseVoice init fix (sensevoice-service.js) must be in place first.
- **Added:** 2026-03-18

### TODO: Add 'transcribing...' loading state to voice UI
- **What:** Add an `isTranscribing` state to `useLiveTranscription` hook and show loading indicator in VoiceController / voice overlay during SenseVoice processing.
- **Why:** With record-then-transcribe, there's a 1-2 second gap between stopping and transcript appearing. No visual feedback during this gap makes it feel broken.
- **Pros:** Better UX, prevents user confusion about whether voice input worked.
- **Cons:** Minimal — one boolean state + conditional UI text.
- **Context:** The hook already exposes `isListening`. Add `isTranscribing` that becomes true after stop (while awaiting IPC response) and false when transcript arrives or errors. VoiceController would show "Transcribing..." text and a subtle animation.
- **Depends on:** SenseVoice fallback implementation in useLiveTranscription.
- **Added:** 2026-03-18
