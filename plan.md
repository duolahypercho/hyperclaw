# Voice Overlay Fix Plan

## Summary
Fix 4 issues with the voice overlay: broken transcription, settings UI, waveform animation, and attachment layout. Restructure agent-chat mode to a two-row InputContainer-style layout.

---

## Issue 1: Fix voice transcription (no text showing)

### Root causes
1. **ScriptProcessorNode echoes mic to speakers** — `scriptNode.connect(audioContext.destination)` passes audio through. Fix: connect to a silent GainNode instead.
2. **No error/loading feedback** — if Whisper fails to init or transcribe, the user sees nothing. Fix: add `isTranscribing` state + show errors visually.

### Changes

**`components/Tool/VoiceToText/hooks/useLiveTranscription.ts`**
- Create a `GainNode` with `gain.value = 0`, connect `scriptNode → silentGain → destination` (fires `onaudioprocess` without echoing)
- Add `isTranscribing` state: `true` after `stopListening()` while awaiting Whisper result, `false` when transcript arrives or error
- Export `isTranscribing` from the hook

**`pages/voice-overlay/index.tsx`**
- Consume `isTranscribing` from the hook
- Show "Transcribing..." text with a subtle pulse animation between recording stop and transcript arrival

---

## Issue 2: Replace settings gear with inline selectors (shadcn Popover style)

### Approach
Re-add `OpenClawProvider` to the voice overlay's `_app.tsx` path so we get live `agents` and `models` from the gateway — same data source as the main app. Remove the gear icon and floating settings panel. Put agent/model selectors inline in the bottom row of the pill.

### Changes

**`pages/_app.tsx`**
- Re-add `OpenClawProvider` to the `isVoiceOverlay` branch (keep other heavy providers stripped)

**`pages/voice-overlay/index.tsx`**
- Import `useOpenClawContext` to get `agents` and `models`
- Remove `showSettings` state, gear button, and floating settings panel
- Remove hardcoded `DEFAULT_MODELS` and IPC agent fetch
- Add two shadcn-style Popover buttons in the bottom row (left-aligned):
  - Agent selector: `[main ▾]` → popover with agent list + checkmarks
  - Model selector: `[sonnet ▾]` → popover with model list + checkmarks
- Match styling from `InputContainer.tsx` lines 922-977 (compact button + popover)

---

## Issue 3: Voice animation while recording

### Root cause
The waveform bars are already coded but depend on `audioData` from the analyser. If `startAudioAnalysis()` throws (Issue 1), `isListening` stays false and bars never render. **This is fixed for free by Issue 1.**

### Additional polish
- When recording in agent-chat mode, replace the text input with the waveform bars + "Listening..." label (already coded at lines 744-764)
- Ensure bars are visible: currently 7 bars × 3px wide. Keep current style.

---

## Issue 4: Two-row layout + attachments above input

### New agent-chat layout structure
```
┌────────────────────────────────────────┐
│ [📎 file.png ×]                        │  ← attachment chips (if any)
│ [logo]  Ask anything...               │  ← row 1: logo + input / waveform
│ [main ▾] [sonnet ▾]        [📎] [🎙]  │  ← row 2: selectors + actions
└────────────────────────────────────────┘
```

### Changes

**`pages/voice-overlay/index.tsx` — agent-chat section rewrite**
- Single glass pill (not separate floating panels)
- Inside the pill, top-to-bottom:
  1. **Attachment chips row** (conditional) — shows above input when files are attached
  2. **Input row** — logo + text input (or waveform when recording)
  3. **Controls row** — agent selector, model selector (left) | attachment btn, mic/send btn (right)
- Remove the separate floating transcript bubble, settings panel, and attachment panel
- Transcript text goes into the input field (already works via `typedText` effect)
- Mic/send single-slot swap: empty → mic icon, has text → send icon, recording → stop icon

---

## Files touched

| File | What changes |
|------|-------------|
| `useLiveTranscription.ts` | Silent GainNode, `isTranscribing` state |
| `pages/voice-overlay/index.tsx` | Two-row layout, inline selectors, consume providers |
| `pages/_app.tsx` | Re-add `OpenClawProvider` for voice overlay |

**3 files. 0 new files.**

---

## NOT in scope
- Dictation mode redesign — keeping current minimal pill as-is
- Mini icon redesign — keeping current floating orb
- Static HTML overlay (`public/voice-overlay.html`) — deprecated, using Next.js page
- Push-to-talk hotkey changes — already working from earlier session
- Attachment upload/preview (base64 conversion, image preview modal) — keeping simple `File[]` for now

## What already exists
- `InputContainer.tsx` Popover pattern for model selector — **reusing the pattern**
- `useLiveTranscription` hook — **fixing in-place**
- `VoiceWaveform` component — **not reusing** (overlay has its own inline bars, simpler)
- `useOpenClawContext` for agents/models — **reusing via provider**

## Implementation order
1. Fix `useLiveTranscription.ts` (silent gain + isTranscribing)
2. Re-add `OpenClawProvider` to `_app.tsx`
3. Rewrite agent-chat section of `voice-overlay/index.tsx` (two-row layout + inline selectors)
4. Verify waveform animation works (should be free after step 1)
ep 1)
