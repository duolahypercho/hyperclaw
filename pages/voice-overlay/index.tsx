"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Send, X, Type, ChevronDown, Paperclip, Cpu, Volume2, VolumeX, Radio, Bell, Plus, Minus, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLiveTranscription } from "$/components/Tool/VoiceToText";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import { getAgentModel, type OpenClawConfig } from "$/lib/identity-md";
import { useGatewayChat, type GatewayChatAttachment } from "@OS/AI/core/hook/use-gateway-chat";
import { CompactChatView } from "@OS/AI/components/CompactChatView";
import { InputContainer } from "@OS/AI/components/InputContainer";
import type { AttachmentType, AttachmentUnion, InputAttachment } from "@OS/AI/components/Chat";
import { useTTS } from "@OS/AI/hooks/useTTS";
import { useAgentIdentity, resolveAvatarUrl, isAvatarText } from "$/hooks/useAgentIdentity";
import { useUser } from "$/Providers/UserProv";
import { getMediaUrl } from "$/utils";
import { gatewayConnection, type NotificationPayload } from "$/lib/openclaw-gateway-ws";

type OverlayMode = "dictation" | "agent-chat";
type OverlayState = "mini" | "expanded" | "notification" | "hidden";

const LS_AGENT = "voice-overlay-agent";
const LS_MODEL = "voice-overlay-model";
const LS_WAKE_WORD = "voice-overlay-wake-word";

const DEFAULT_AGENTS = [{ id: "main", name: "main", status: "active" }];

// Faux-glass panels
// Mini pill stays transparent glass. Expanded panels use the real theme.
const GLASS_MINI = "border border-solid border-white/[0.10] bg-black/[0.35] shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-all duration-200";
// Expanded: solid theme background with shadow
const PANEL_BASE = "border border-primary/20 bg-card text-card-foreground shadow-xl transition-all duration-200";

// Quick action chip heuristics
function generateChips(lastContent: string): Array<{ label: string; text: string }> {
  const chips: Array<{ label: string; text: string }> = [];
  if (!lastContent?.trim()) return chips;

  // Always offer "Tell me more"
  chips.push({ label: "Tell me more", text: "Tell me more about that" });

  // If response contains code blocks
  if (lastContent.includes("```")) {
    chips.push({ label: "Explain code", text: "Explain this code step by step" });
  }

  // If response is long (>200 words)
  if (lastContent.split(/\s+/).length > 200) {
    chips.push({ label: "Summarize", text: "Summarize that in 2-3 sentences" });
  }

  return chips.slice(0, 3);
}

// ─── Wake Word Detection (Web Speech API) ────────────────────────────────────
// Listens for "hey openclaw" while overlay is in mini state.
// Uses the browser's built-in SpeechRecognition in continuous mode for low overhead.

interface WakeWordOptions {
  enabled: boolean;
  isMini: boolean;
  onTriggered: () => void;
}

function useWakeWord({ enabled, isMini, onTriggered }: WakeWordOptions) {
  const recognitionRef = useRef<any>(null);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(false);
  const triggeredRef = useRef(false);

  // Keep onTriggered callback ref stable
  const onTriggeredRef = useRef(onTriggered);
  useEffect(() => { onTriggeredRef.current = onTriggered; }, [onTriggered]);

  const shouldListen = enabled && isMini;

  useEffect(() => {
    if (!shouldListen) {
      // Stop recognition when not needed
      if (recognitionRef.current) {
        isActiveRef.current = false;
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      triggeredRef.current = false;
      return;
    }

    // Check for Web Speech API support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[WakeWord] SpeechRecognition API not available");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 3;
    recognitionRef.current = recognition;
    isActiveRef.current = true;
    triggeredRef.current = false;

    const WAKE_PHRASES = [
      "hey openclaw",
      "hey open claw",
      "hey hyperclaw",
      "hey hyper claw",
      "a openclaw",
      "a open claw",
    ];

    function checkForWakeWord(text: string): boolean {
      const normalized = text.toLowerCase().trim();
      return WAKE_PHRASES.some((phrase) => normalized.includes(phrase));
    }

    recognition.onresult = (event: any) => {
      if (triggeredRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Check all alternatives
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript;
          if (checkForWakeWord(transcript)) {
            console.log("[WakeWord] Detected wake phrase in:", transcript);
            triggeredRef.current = true;
            // Stop listening before triggering
            isActiveRef.current = false;
            try { recognition.abort(); } catch {}
            onTriggeredRef.current();
            return;
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      // "no-speech" and "aborted" are expected — restart silently
      if (event.error === "no-speech" || event.error === "aborted") {
        // Will restart via onend
        return;
      }
      console.warn("[WakeWord] Recognition error:", event.error);
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be active (not triggered, not manually stopped)
      if (isActiveRef.current && !triggeredRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          if (isActiveRef.current && recognitionRef.current) {
            try { recognitionRef.current.start(); } catch {}
          }
        }, 300);
      }
    };

    try {
      recognition.start();
      console.log("[WakeWord] Started listening for wake word");
    } catch (err) {
      console.warn("[WakeWord] Failed to start:", err);
    }

    return () => {
      isActiveRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      try { recognition.abort(); } catch {}
      recognitionRef.current = null;
    };
  }, [shouldListen]);
}

export default function VoiceOverlayPage() {
  const [overlayState, setOverlayState] = useState<OverlayState>("mini");
  const [mode, setMode] = useState<OverlayMode>("dictation");
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [isToggleMode, setIsToggleMode] = useState(false);
  const [showInserted, setShowInserted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { agents: rawAgents, models: rawModels } = useOpenClawContext();
  const contextAgents = rawAgents.length > 0 ? rawAgents : DEFAULT_AGENTS;

  const [selectedAgent, setSelectedAgent] = useState(() => {
    try { return localStorage.getItem(LS_AGENT) || "main"; } catch { return "main"; }
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    try { return localStorage.getItem(LS_MODEL) || "claude-sonnet-4-5-20250514"; } catch { return "claude-sonnet-4-5-20250514"; }
  });

  // Load agent's configured model from openclaw.json when agent changes
  useEffect(() => {
    let cancelled = false;
    const bridge = window.electronAPI?.hyperClawBridge;
    if (!bridge) return;
    (async () => {
      try {
        const raw = await bridge.invoke("get-openclaw-doc", { relativePath: "openclaw.json" }) as Record<string, unknown>;
        if (cancelled || !raw) return;
        let res = raw as Record<string, unknown>;
        if (res.data && typeof res.data === "object") res = res.data as Record<string, unknown>;
        if (res.result && Array.isArray(res.result)) res = (res.result as Record<string, unknown>[])[0] ?? res;
        else if (res.result && typeof res.result === "object") res = res.result as Record<string, unknown>;
        if (!res?.success || typeof res.content !== "string") return;
        const config = JSON.parse(res.content as string) as OpenClawConfig;
        const agentModel = getAgentModel(config, selectedAgent);
        if (agentModel) {
          setSelectedModel(agentModel);
          try { localStorage.setItem(LS_MODEL, agentModel); } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selectedAgent]);

  const [hasMic, setHasMic] = useState(true);
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then(devices => {
      setHasMic(devices.some(d => d.kind === "audioinput"));
    }).catch(() => setHasMic(false));
  }, []);

  // ─── Wake Word ──────────────────────────────────────────────────────
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    try { return localStorage.getItem(LS_WAKE_WORD) === "true"; } catch { return false; }
  });

  // Persist wake word preference
  useEffect(() => {
    try { localStorage.setItem(LS_WAKE_WORD, String(wakeWordEnabled)); } catch {}
    // Also sync with main process
    window.electronAPI?.voiceOverlay?.wakeWord?.toggle(wakeWordEnabled).catch(() => {});
  }, [wakeWordEnabled]);

  const handleWakeWordTriggered = useCallback(() => {
    console.log("[VoiceOverlay] Wake word triggered — expanding to agent-chat");
    setMode("agent-chat");
    setOverlayState("expanded");
    window.electronAPI?.voiceOverlay?.wakeWord?.triggerDetected().catch(() => {});
  }, []);

  useWakeWord({
    enabled: wakeWordEnabled,
    isMini: overlayState === "mini",
    onTriggered: handleWakeWordTriggered,
  });

  // Listen for wake word activation event from main process
  useEffect(() => {
    const api = window.electronAPI?.voiceOverlay;
    if (!api?.onWakeWordActivated) return;
    api.onWakeWordActivated(() => {
      setMode("agent-chat");
      setOverlayState("expanded");
    });
    return () => { api.removeWakeWordActivatedListener?.(); };
  }, []);

  const toggleWakeWord = useCallback(() => {
    setWakeWordEnabled(prev => !prev);
  }, []);

  const [typedText, setTypedText] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [pendingAutoInsert, setPendingAutoInsert] = useState(false);
  const [autoStopSilence, setAutoStopSilence] = useState(false);
  const pushToTalkStartRef = useRef<Promise<void> | null>(null);
  const pushToTalkStopPendingRef = useRef(false);
  const modeRef = useRef<OverlayMode>("dictation");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    transcript, interimTranscript, isListening, isTranscribing,
    error: transcriptionError, audioData, getAudioLevel,
    startListening, stopListening, clearTranscript,
  } = useLiveTranscription();

  // Stable refs so the push-to-talk IPC listener closure always sees fresh values
  const getAudioLevelRef = useRef(getAudioLevel);
  useEffect(() => { getAudioLevelRef.current = getAudioLevel; }, [getAudioLevel]);
  const startListeningRef = useRef(startListening);
  const stopListeningRef = useRef(stopListening);
  const clearTranscriptRef = useRef(clearTranscript);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);
  useEffect(() => { clearTranscriptRef.current = clearTranscript; }, [clearTranscript]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Signal main process that renderer is mounted and IPC listeners are registered
  useEffect(() => {
    window.electronAPI?.voiceOverlay?.signalReady?.();
  }, []);

  // ─── Gateway Chat (direct connection, no IPC relay) ─────────────────
  const [chatSessionKey, setChatSessionKey] = useState(`agent:${selectedAgent}:main`);
  const isFreshSessionRef = useRef(false);
  // Sync session key when agent changes
  useEffect(() => {
    setChatSessionKey(`agent:${selectedAgent}:main`);
    isFreshSessionRef.current = false;
  }, [selectedAgent]);

  const {
    messages,
    isLoading: isChatLoading,
    isConnected,
    error: chatError,
    sendMessage: gatewaySendMessage,
    stopGeneration,
    loadChatHistory,
    clearChat,
    setSessionKey: setGatewaySessionKey,
  } = useGatewayChat({ sessionKey: chatSessionKey, autoConnect: mode === "agent-chat" });

  useEffect(() => {
    window.electronAPI?.voiceOverlay?.setRecordingState?.(isListening);
  }, [isListening]);

  // Load history when overlay expands in chat mode (skip for fresh sessions that have no history)
  const prevOverlayStateRef = useRef(overlayState);
  useEffect(() => {
    if (overlayState === "expanded" && prevOverlayStateRef.current === "mini" && mode === "agent-chat") {
      if (!isFreshSessionRef.current) {
        loadChatHistory();
      }
      isFreshSessionRef.current = false;
    }
    prevOverlayStateRef.current = overlayState;
  }, [overlayState, mode, loadChatHistory]);

  // ─── TTS ────────────────────────────────────────────────────────────
  const tts = useTTS();

  // Auto-read response when generation completes
  const prevChatLoadingRef = useRef(isChatLoading);
  useEffect(() => {
    if (prevChatLoadingRef.current && !isChatLoading && tts.isEnabled) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content?.trim()) {
        tts.speak(lastMsg.content);
      }
    }
    prevChatLoadingRef.current = isChatLoading;
  }, [isChatLoading, messages, tts]);

  // Cancel TTS when mic activates
  const prevListeningRef = useRef(isListening);
  useEffect(() => {
    if (isListening && !prevListeningRef.current && tts.isSpeaking) {
      tts.cancel();
    }
    prevListeningRef.current = isListening;
  }, [isListening, tts]);

  // ─── Notification Subscription ──────────────────────────────────────
  useEffect(() => {
    const handleNotification = (payload: NotificationPayload) => {
      // Only show notifications when overlay is in mini state
      if (overlayState !== "mini") return;

      setOverlayState("notification");
      window.electronAPI?.voiceOverlay?.expand?.();

      // If TTS is enabled, speak the summary
      if (tts.isEnabled && payload.summary) {
        tts.speak(payload.summary);
      }

      // Auto-minimize after 8 seconds
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = setTimeout(() => {
        setOverlayState("mini");
        window.electronAPI?.voiceOverlay?.minimize?.();
        notificationTimerRef.current = null;
      }, 8000);
    };

    const unsub = gatewayConnection.onNotification(handleNotification);
    return () => {
      unsub();
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
        notificationTimerRef.current = null;
      }
    };
  }, [overlayState, tts]);

  // ─── Quick Action Chips ─────────────────────────────────────────────
  const actionChips = useMemo(() => {
    if (isChatLoading || messages.length === 0) return [];
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== "assistant" || !lastMsg.content?.trim()) return [];
    return generateChips(lastMsg.content);
  }, [messages, isChatLoading]);

  const handleChipClick = useCallback((chipText: string) => {
    setTypedText(chipText);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const chipActions = useMemo(
    () => actionChips.map((c) => ({ label: c.label, onClick: () => handleChipClick(c.text) })),
    [actionChips, handleChipClick]
  );

  // ─── Track window focus (Electron overlay is its own BrowserWindow) ─
  useEffect(() => {
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    // Set initial state
    setIsFocused(document.hasFocus());
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ─── Voice transcript → typed text ─────────────────────────────────
  useEffect(() => {
    if (mode === "agent-chat" && transcript.trim() && !isListening) {
      setTypedText(prev => { const t = prev.trim(); return t ? `${t} ${transcript.trim()}` : transcript.trim(); });
    }
  }, [transcript, isListening, mode]);

  useEffect(() => { try { localStorage.setItem(LS_AGENT, selectedAgent); } catch {} }, [selectedAgent]);
  useEffect(() => { try { localStorage.setItem(LS_MODEL, selectedModel); } catch {} }, [selectedModel]);

  const isMini = overlayState === "mini";
  const isHidden = overlayState === "hidden";
  const displayText = isListening ? (interimTranscript || "") : transcript;
  const isChat = mode === "agent-chat";

  // ─── Window Resize ──────────────────────────────────────────────────
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resizeWindow = useCallback(() => {
    if (isHidden) { window.electronAPI?.voiceOverlay?.resize?.(1, 1); lastSizeRef.current = { w: 1, h: 1 }; return; }
    if (isMini) { window.electronAPI?.voiceOverlay?.resize?.(44, 44); lastSizeRef.current = { w: 44, h: 44 }; return; }
    if (!contentRef.current) return;
    const r = contentRef.current.getBoundingClientRect();
    const w = Math.ceil(r.width), h = Math.ceil(r.height);
    if (w === lastSizeRef.current.w && h === lastSizeRef.current.h) return;
    lastSizeRef.current = { w, h };
    window.electronAPI?.voiceOverlay?.resize?.(w, h);
  }, [isMini]);

  // Debounced resize — 200ms for streaming content, 50ms for UI changes
  useEffect(() => {
    if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
    resizeDebounceRef.current = setTimeout(resizeWindow, isChatLoading ? 200 : 50);
    return () => { if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current); };
  }, [transcript, interimTranscript, isListening, isTranscribing, showInserted, mode, overlayState, typedText, attachments, transcriptionError, messages.length, isChatLoading, screenshotDataUrl, resizeWindow]);

  // ResizeObserver — catches content height changes from collapsible tool
  // expansions, accordion toggles, etc. that don't trigger state changes.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || isMini) return;
    const ro = new ResizeObserver(() => {
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(resizeWindow, 100);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMini, resizeWindow]);

  // ─── Overlay Navigation ─────────────────────────────────────────────
  const expandOverlay = useCallback(() => { setOverlayState("expanded"); window.electronAPI?.voiceOverlay?.expand?.(); }, []);
  const hideOverlayPill = useCallback(() => { setOverlayState("hidden"); }, []);

  const minimizeOverlayFn = useCallback(() => {
    setOverlayState("mini"); setShowInserted(false); setTypedText(""); setAttachments([]); setPendingAutoInsert(false); clearTranscript();
    if (notificationTimerRef.current) { clearTimeout(notificationTimerRef.current); notificationTimerRef.current = null; }
    tts.cancel();
    window.electronAPI?.voiceOverlay?.minimize?.();
  }, [clearTranscript, tts]);

  // ─── Auto-dismiss on idle ──────────────────────────────────────────
  const idleDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(isFocused);
  const isChatLoadingRef = useRef(isChatLoading);
  const isSpeakingRef = useRef(tts.isSpeaking);
  const isListeningRef = useRef(isListening);
  useEffect(() => { isFocusedRef.current = isFocused; }, [isFocused]);
  useEffect(() => { isChatLoadingRef.current = isChatLoading; }, [isChatLoading]);
  useEffect(() => { isSpeakingRef.current = tts.isSpeaking; }, [tts.isSpeaking]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const resetIdleTimer = useCallback(() => {
    if (idleDismissRef.current) clearTimeout(idleDismissRef.current);
    idleDismissRef.current = setTimeout(() => {
      if (!isChatLoadingRef.current && !isSpeakingRef.current && !isFocusedRef.current && !isListeningRef.current) {
        minimizeOverlayFn();
      }
    }, 30000);
  }, [minimizeOverlayFn]);

  useEffect(() => {
    if (overlayState === "expanded" && mode === "agent-chat" && !isChatLoading) {
      resetIdleTimer();
    }
    return () => {
      if (idleDismissRef.current) clearTimeout(idleDismissRef.current);
    };
  }, [overlayState, mode, isChatLoading, typedText, messages.length, resetIdleTimer]);

  useEffect(() => {
    const api = window.electronAPI?.voiceOverlay;
    if (!api?.onMinimize) return;
    api.onMinimize(() => { setOverlayState("mini"); setShowInserted(false); setTypedText(""); setAttachments([]); tts.cancel(); });
    return () => { api.removeMinimizeListener?.(); };
  }, [tts]);

  const hideOverlay = useCallback(() => minimizeOverlayFn(), [minimizeOverlayFn]);
  const toggleListening = useCallback(() => {
    if (isListening) stopListening(); else { clearTranscript(); startListening(); }
  }, [isListening, startListening, stopListening, clearTranscript]);

  // ─── Send Message (direct gateway, no IPC) ─────────────────────────
  const sendMessage = useCallback(async () => {
    const text = isChat ? typedText.trim() : transcript.trim();
    if (!text) return;

    setTypedText("");
    setAttachments([]);
    clearTranscript();

    // Send directly via gateway WebSocket
    await gatewaySendMessage(text);
    // DON'T minimize — stay expanded to show the response
  }, [isChat, typedText, transcript, clearTranscript, gatewaySendMessage]);

  const insertText = useCallback(() => {
    const text = transcript.trim(); if (!text) { console.log("[VoiceOverlay] insertText: no text"); return; }
    console.log("[VoiceOverlay] insertText: inserting", text.length, "chars");
    setPendingAutoInsert(false);
    // Immediately minimize and insert — no intermediate transcript display
    minimizeOverlayFn();
    window.electronAPI?.voiceOverlay?.insertText?.(text).then((r: any) => {
      console.log("[VoiceOverlay] insertText IPC result:", r);
    }).catch((e: any) => {
      console.warn("[VoiceOverlay] insertText IPC error:", e);
    });
  }, [transcript, minimizeOverlayFn]);

  // ─── Push-to-Talk ───────────────────────────────────────────────────
  // Registered ONCE (empty deps) — uses refs so the closure always sees fresh values.
  // This prevents the listener from being torn down on re-render, which caused
  // the "stop" IPC to be silently dropped.
  useEffect(() => {
    const api = window.electronAPI?.voiceOverlay;
    if (!api?.onPushToTalk) return;
    api.onPushToTalk((action: string, pttMode: string, isToggle?: boolean, silenceStop?: boolean) => {
      const resolvedMode = (pttMode || modeRef.current) as OverlayMode;
      if (isToggle) setIsToggleMode(true);
      if (action === "start") {
        if (pushToTalkStartRef.current) return;
        pushToTalkStopPendingRef.current = false;
        setPendingAutoInsert(false);
        setAutoStopSilence(!!silenceStop);
        setOverlayState("expanded");
        setMode(resolvedMode);
        setIsPushToTalk(true);
        clearTranscriptRef.current();
        pushToTalkStartRef.current = (async () => {
          try {
            await startListeningRef.current();
          } finally {
            pushToTalkStartRef.current = null;
            if (pushToTalkStopPendingRef.current) {
              pushToTalkStopPendingRef.current = false;
              // Give mic at least 300ms to capture audio before stopping
              await new Promise(r => setTimeout(r, 300));
              setPendingAutoInsert(resolvedMode === "dictation");
              setIsPushToTalk(false);
              stopListeningRef.current();
            }
          }
        })();
      } else {
        // Stop — if start is still initializing mic, queue the stop
        if (pushToTalkStartRef.current && !isListeningRef.current) {
          pushToTalkStopPendingRef.current = true;
          return;
        }
        pushToTalkStopPendingRef.current = false;
        setPendingAutoInsert(resolvedMode === "dictation");
        setIsPushToTalk(false);
        stopListeningRef.current();
      }
    });
    return () => { api.removePushToTalkListener?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Silence detection: auto-stop recording after speech → silence ──
  // Uses setInterval (not rAF-driven audioData) because Chromium throttles
  // requestAnimationFrame in unfocused windows, making audioData stale.
  const autoStopSilenceRef = useRef(false);
  useEffect(() => { autoStopSilenceRef.current = autoStopSilence; }, [autoStopSilence]);

  useEffect(() => {
    if (!autoStopSilence || !isPushToTalk || !isListening) return;

    const SILENCE_THRESHOLD = 0.04;
    const SILENCE_DURATION_MS = 1500;
    let silenceStart: number | null = null;
    let speechDetected = false;

    const interval = setInterval(() => {
      if (!autoStopSilenceRef.current) { clearInterval(interval); return; }

      // Read analyser directly — not throttled by rAF like audioData state
      const maxLevel = getAudioLevelRef.current();

      if (maxLevel > SILENCE_THRESHOLD) {
        speechDetected = true;
        silenceStart = null;
      } else if (speechDetected) {
        if (!silenceStart) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart >= SILENCE_DURATION_MS) {
          clearInterval(interval);
          console.log("[VoiceOverlay] Silence detected — auto-stopping");
          setAutoStopSilence(false);
          setPendingAutoInsert(mode === "dictation");
          setIsPushToTalk(false);
          stopListeningRef.current();
          window.electronAPI?.voiceOverlay?.setRecordingState?.(false);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [autoStopSilence, isPushToTalk, isListening, mode]); // intentionally exclude audioData — read from closure in interval

  // No interim live-typing during push-to-talk — just record silently.
  // Final insert: when transcription finishes after release, insert text once and minimize.
  const lastLiveTextRef = useRef("");
  useEffect(() => {
    if (!pendingAutoInsert || isPushToTalk || isListening || isTranscribing) return;
    if (mode !== "dictation") return;

    // Use transcript if available, fall back to interimTranscript (Web Speech API may not finalize)
    const finalText = (transcript || interimTranscript || "").trim();
    if (!finalText && !transcriptionError) return;

    setPendingAutoInsert(false);
    lastLiveTextRef.current = "";

    if (finalText) {
      window.electronAPI?.voiceOverlay?.insertText?.(finalText).catch((e: any) => {
        console.warn("[VoiceOverlay] insertText error:", e);
      });
    }

    if (transcriptionError && !finalText) {
      // Show error briefly then minimize
      setTimeout(() => minimizeOverlayFn(), 1500);
    }
  }, [pendingAutoInsert, isPushToTalk, isListening, isTranscribing, transcript, interimTranscript, transcriptionError, mode, minimizeOverlayFn]);

  // ─── Quick Chat (Option+Space) ────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI?.voiceOverlay;
    if (!api?.onQuickChat) return;
    api.onQuickChat(() => {
      // Fresh session each time — screenshot context is time-sensitive
      const freshKey = `agent:${selectedAgent}:quick-${Date.now()}`;
      isFreshSessionRef.current = true;
      setChatSessionKey(freshKey);
      setGatewaySessionKey(freshKey);
      setOverlayState("expanded");
      setMode("agent-chat");
      setScreenshotDataUrl(null);
      // Auto-focus the textarea inside InputContainer
      setTimeout(() => {
        const textarea = document.querySelector("textarea");
        textarea?.focus();
      }, 150);
      // Pull screenshot — try desktopCapturer first, fall back to getDisplayMedia picker
      (async () => {
        try {
          const hasPermission = await api.hasScreenPermission?.();
          if (hasPermission && api.captureScreen) {
            const result = await api.captureScreen();
            if (result?.dataUrl) {
              setScreenshotDataUrl(result.dataUrl);
              return;
            }
          }
          // Fall back to getDisplayMedia (native system picker, no permission needed)
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const track = stream.getVideoTracks()[0];
          const video = document.createElement("video");
          video.srcObject = stream;
          video.muted = true;
          await video.play();
          // Wait for a frame so the video has pixel data
          await new Promise<void>((r) => { video.onloadeddata = () => r(); if (video.readyState >= 2) r(); });
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 800;
          canvas.getContext("2d")!.drawImage(video, 0, 0);
          track.stop();
          stream.getTracks().forEach((t) => t.stop());
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          if (dataUrl.length > 500) setScreenshotDataUrl(dataUrl);
        } catch {
          // Capture failed or user cancelled picker — continue without screenshot
        }
      })();
    });
    return () => { api.removeQuickChatListener?.(); };
  }, [selectedAgent, setGatewaySessionKey]);

  // Screenshot: push listener as fallback for the invoke approach
  useEffect(() => {
    const api = window.electronAPI?.voiceOverlay;
    if (!api?.onQuickChatScreenshot) return;
    api.onQuickChatScreenshot((dataUrl: string) => {
      setScreenshotDataUrl(dataUrl);
    });
    return () => { api.removeQuickChatScreenshotListener?.(); };
  }, []);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isMini) return;
      if (e.key === "Escape") hideOverlay();
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isChat) insertText();
      else if (e.key === "Enter" && !e.shiftKey && isChat && typedText.trim()) { e.preventDefault(); sendMessage(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [isMini, hideOverlay, sendMessage, insertText, isChat, typedText]);

  useEffect(() => { return () => { stopListening(); }; }, [stopListening]);
  useEffect(() => { if (!isMini && isChat && !isListening) setTimeout(() => inputRef.current?.focus(), 100); }, [isMini, isChat, isListening]);

  // Transparent background
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = "html,body,#__next,main{background:transparent!important;background-color:transparent!important;margin:0!important;padding:0!important;overflow:hidden!important}";
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  const bars = audioData.length >= 7 ? audioData.slice(0, 7) : [...audioData, ...Array(Math.max(0, 7 - audioData.length)).fill(0)];
  const hasTranscript = !!transcript.trim();
  const hasDisplayText = !!displayText.trim();
  const agentName = contextAgents.find(a => a.id === selectedAgent || a.name === selectedAgent)?.name || selectedAgent;

  // Agent identity for avatars (same as GatewayChatWidget) — must be before conditional returns
  const agentIdentity = useAgentIdentity(selectedAgent);
  const agentAvatarUrl = resolveAvatarUrl(agentIdentity?.avatar);
  const agentAvatarText = isAvatarText(agentIdentity?.avatar) ? agentIdentity!.avatar! : undefined;
  const assistantAvatar = useMemo(() => ({
    src: agentAvatarUrl,
    fallback: agentAvatarText || agentIdentity?.emoji || agentName.slice(0, 2).toUpperCase() || "AI",
    alt: agentName || "AI Assistant",
  }), [agentAvatarUrl, agentAvatarText, agentIdentity?.emoji, agentName]);
  const { userInfo } = useUser();
  const userAvatar = useMemo(() => ({
    src: userInfo?.profilePic ? getMediaUrl(userInfo.profilePic) : undefined,
    fallback: userInfo?.username?.charAt(0).toUpperCase() || "U",
    alt: userInfo?.username || "User",
  }), [userInfo?.profilePic, userInfo?.username]);

  // Screenshot as InputContainer attachment
  const [inputAttachments, setInputAttachments] = useState<AttachmentUnion[]>([]);

  // When screenshot arrives, add it to input attachments
  const prevScreenshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (screenshotDataUrl && screenshotDataUrl !== prevScreenshotRef.current) {
      const att: InputAttachment = {
        id: `screenshot-${Date.now()}`,
        type: "image",
        name: "Desktop Screenshot",
        url: screenshotDataUrl,
        preview: screenshotDataUrl,
      };
      setInputAttachments(prev => [...prev.filter(a => !a.id.startsWith("screenshot-")), att]);
    } else if (!screenshotDataUrl && prevScreenshotRef.current) {
      setInputAttachments(prev => prev.filter(a => !a.id.startsWith("screenshot-")));
    }
    prevScreenshotRef.current = screenshotDataUrl;
  }, [screenshotDataUrl]);

  const handleAttachmentsChange = useCallback(
    (atts: AttachmentUnion[] | ((prev: AttachmentUnion[]) => AttachmentUnion[])) => {
      const resolved = typeof atts === "function" ? atts(inputAttachments) : atts;
      setInputAttachments(resolved);
      // If screenshot was removed from attachments, clear the state
      if (!resolved.some(a => a.id.startsWith("screenshot-"))) {
        setScreenshotDataUrl(null);
      }
    },
    [inputAttachments]
  );

  // Convert AttachmentType to GatewayChatAttachment (same as GatewayChatWidget)
  const toGatewayAttachments = useCallback(
    (atts?: AttachmentType[]): GatewayChatAttachment[] | undefined => {
      if (!atts?.length) return undefined;
      return atts.map((att) => {
        const dataUrl = att.url || "";
        const mimeMatch = dataUrl.match(/^data:([^;]+);/);
        const mimeType = mimeMatch?.[1] || `${att.type}/*`;
        return { id: att.id, type: att.type, mimeType, name: att.name, dataUrl };
      });
    }, []
  );

  // Handle send from InputContainer
  const handleInputSend = useCallback(
    async (message: string, sentAttachments?: AttachmentType[]) => {
      const allAttachments: GatewayChatAttachment[] = [];

      const converted = toGatewayAttachments(sentAttachments);
      if (converted) allAttachments.push(...converted);

      if (!message.trim() && allAttachments.length === 0) return;
      setScreenshotDataUrl(null);
      setInputAttachments([]);
      await gatewaySendMessage(message.trim(), allAttachments.length > 0 ? allAttachments : undefined);
    },
    [gatewaySendMessage, toGatewayAttachments]
  );

  // New chat — new session key
  const handleNewChat = useCallback(() => {
    const newKey = `agent:${selectedAgent}:chat-${Date.now()}`;
    isFreshSessionRef.current = true;
    setChatSessionKey(newKey);
    setGatewaySessionKey(newKey);
  }, [selectedAgent, setGatewaySessionKey]);

  // Agent change
  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgent(agentId);
    const newKey = `agent:${agentId}:main`;
    setChatSessionKey(newKey);
    setGatewaySessionKey(newKey);
  }, [setGatewaySessionKey]);

  // ─── Hidden ─────────────────────────────────────────────────────────
  if (isHidden) {
    return <div ref={contentRef} className="w-px h-px" />;
  }

  // ─── Mini ──────────────────────────────────────────────────────────
  if (isMini) {
    return (
      <div ref={contentRef} className="flex items-center justify-center select-none bg-transparent w-11 h-11">
        <motion.button
          onClick={() => { expandOverlay(); setMode("agent-chat"); }}
          onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); hideOverlayPill(); }}
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 0.4 }}
          whileHover={{ scale: 1.15, opacity: 0.85 }} whileTap={{ scale: 0.9 }}
          className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer relative ${GLASS_MINI}`}
          title="Right-click to hide"
        >
          <img src="/Logopic.png" alt="" draggable={false} className="w-[22px] h-[22px] rounded-full object-cover pointer-events-none select-none" />
          {/* Wake word active indicator — subtle pulsing ring */}
          {wakeWordEnabled && (
            <motion.div
              className="absolute inset-0 rounded-full border border-emerald-400/40"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            />
          )}
        </motion.button>
      </div>
    );
  }

  // ─── Dictation ─────────────────────────────────────────────────────
  const dictActive = isListening || hasTranscript || hasDisplayText;

  if (!isChat) {
    return (
      <div ref={contentRef} className="select-none w-[420px]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className={`rounded-full ${dictActive ? PANEL_BASE : GLASS_MINI}`}>

          <AnimatePresence>
            {hasDisplayText && !showInserted && !isPushToTalk && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden">
                <p className="px-4 pt-3 pb-1 text-[13px] text-foreground leading-relaxed">
                  {displayText}
                  {isListening && <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} className="inline-block w-0.5 h-[13px] ml-0.5 align-text-bottom bg-violet-400" />}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isTranscribing && !hasTranscript && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden">
                <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }} className="px-4 pt-2.5 pb-1 text-xs text-muted-foreground">Transcribing...</motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {transcriptionError && !isListening && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden">
                <p className="px-4 pt-2.5 pb-1 text-xs text-red-400/80">{transcriptionError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showInserted && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden">
                <div className="px-4 pt-2.5 pb-0.5 flex items-center gap-2">
                  <motion.svg initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 12, stiffness: 300 }}
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(52,211,153)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></motion.svg>
                  <span className="text-xs text-emerald-400/80 font-medium">Inserted</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 px-2.5 h-12">
            <button onClick={hideOverlay} className="relative flex items-center justify-center w-8 h-8 shrink-0 cursor-pointer">
              {isListening && [0.4, 0.3, 0.2].map((o, i) => (
                <motion.div key={i} className="absolute inset-0 rounded-full border-[1.5px] border-violet-500/40"
                  animate={{ scale: [1, 1.8 + i * 0.4], opacity: [0.6 - i * 0.15, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut", delay: i * 0.4 }} />
              ))}
              <motion.img src="/Logopic.png" alt="" draggable={false} className="w-6 h-6 rounded-full object-cover relative z-10 pointer-events-none select-none"
                animate={isListening ? { scale: [1, 1.08, 1], transition: { repeat: Infinity, duration: 1.5 } } : { scale: 1 }} />
            </button>

            <div className="flex-1 flex items-center h-full min-w-0">
              <AnimatePresence mode="wait">
                {isListening ? (
                  <motion.div key="w" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-[3px] px-0.5">
                    {bars.map((v, i) => <motion.div key={i} className="w-[3px] rounded-full bg-violet-500" style={{ opacity: 0.45 + v * 0.55 }} animate={{ height: Math.max(3, v * 24) }} transition={{ duration: 0.05 }} />)}
                    <span className="text-[10px] text-muted-foreground/50 ml-1.5 whitespace-nowrap">{isPushToTalk ? (isToggleMode ? "Press Ctrl+Cmd+V to stop" : "Release to transcribe") : "Listening"}</span>
                  </motion.div>
                ) : hasTranscript && !pendingAutoInsert ? (
                  <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                    <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">{typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "\u2318\u23CE" : "Ctrl+\u23CE"}</kbd>
                    <span>insert</span>
                  </motion.div>
                ) : pendingAutoInsert || isTranscribing ? (
                  <motion.span key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-muted-foreground/50">
                    Transcribing...
                  </motion.span>
                ) : (
                  <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] text-muted-foreground/40">
                    Hold Ctrl+{typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "Cmd" : "Win"}+V to talk
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <AnimatePresence>
                {hasTranscript && !isListening && !showInserted && !pendingAutoInsert && (
                  <motion.button initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                    onClick={insertText} className="h-6 px-2 rounded-full flex items-center gap-1 text-[10px] font-medium whitespace-nowrap bg-violet-500/20 text-violet-600 dark:text-violet-200/90 border border-violet-400/15 hover:bg-violet-500/30 transition-colors">
                    <Type className="w-2.5 h-2.5" /> Insert
                  </motion.button>
                )}
              </AnimatePresence>
              {!isPushToTalk && (
                <motion.button whileTap={{ scale: 0.85 }} transition={{ duration: 0.08 }} onClick={toggleListening}
                  className={`w-8 h-8 rounded-full flex items-center justify-center relative ${isListening ? "bg-red-500/25 border border-red-400/20" : "bg-violet-500/25 border border-violet-400/20"}`}>
                  {isListening && <motion.div className="absolute inset-0 rounded-full" animate={{ boxShadow: ["0 0 0 0px rgba(239,68,68,0.25)", "0 0 0 7px rgba(239,68,68,0)"] }} transition={{ repeat: Infinity, duration: 1.3 }} />}
                  {isListening ? <Square className="w-3 h-3 text-red-300 fill-red-300" /> : <Mic className="w-3.5 h-3.5 text-violet-200" />}
                </motion.button>
              )}
              <motion.button whileTap={{ scale: 0.88 }} transition={{ duration: 0.08 }}
                onClick={hideOverlay} className="w-6 h-6 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80">
                <X className="w-2.5 h-2.5 text-muted-foreground/50" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Agent Chat (conversational) ────────────────────────────────────

  return (
    <div ref={contentRef} className="select-none w-[420px]">
      <div className={`rounded-2xl ${PANEL_BASE}`}>

        {/* Header — agent selector, new chat, minimize */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="w-7 h-7 shrink-0">
              {assistantAvatar.src && <AvatarImage src={assistantAvatar.src} alt={assistantAvatar.alt} />}
              <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                {assistantAvatar.fallback}
              </AvatarFallback>
            </Avatar>

            {contextAgents.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{agentName}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {contextAgents.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      onClick={() => handleAgentChange(a.id)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span>{a.name}</span>
                      {a.id === selectedAgent && <Check className="w-3 h-3" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-sm font-medium text-foreground truncate">{agentName}</span>
            )}

            {/* Connection dot */}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleNewChat} title="New chat">
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={hideOverlay} title="Minimize">
              <Minus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Chat History — same rendering as GatewayChatWidget */}
        <CompactChatView
          messages={messages}
          isLoading={isChatLoading && messages.length > 0}
          maxHeight={300}
          minHeight={300}
          assistantAvatar={assistantAvatar}
          userAvatar={userAvatar}
          botPic={agentAvatarUrl}
        />

        {/* Error */}
        {chatError && (
          <div className="px-3 pb-1">
            <p className="text-xs text-destructive">{chatError}</p>
          </div>
        )}

        {/* Input — same InputContainer as GatewayChatWidget */}
        <div className="p-2">
          <InputContainer
            onSendMessage={handleInputSend}
            placeholder={`Ask ${agentName} anything...`}
            isLoading={isChatLoading}
            isSending={isChatLoading}
            showAttachments={true}
            showVoiceInput={false}
            showEmojiPicker={false}
            showActions={true}
            autoResize={true}
            allowEmptySend={false}
            maxAttachments={5}
            maxFileSize={5 * 1024 * 1024}
            allowedFileTypes={["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp"]}
            sessionKey={chatSessionKey}
            agentId={selectedAgent}
            onStopGeneration={stopGeneration}
            attachments={inputAttachments}
            onAttachmentsChange={handleAttachmentsChange}
          />
        </div>
      </div>
    </div>
  );
}
