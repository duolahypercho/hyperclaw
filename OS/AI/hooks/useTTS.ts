"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const LS_KEY = "voice-overlay-tts-enabled";

/** Strip markdown formatting for cleaner TTS output */
function stripMarkdown(text: string): string {
  return text
    // Remove code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code
    .replace(/`[^`]+`/g, "")
    // Remove headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove links — keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, "")
    // Remove blockquotes
    .replace(/^>\s*/gm, "")
    // Remove list bullets
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Collapse whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function useTTS() {
  const [isEnabled, setIsEnabled] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check TTS availability
  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setIsAvailable(false);
      return;
    }

    const checkVoices = () => {
      const voices = speechSynthesis.getVoices();
      setIsAvailable(voices.length > 0);
    };

    checkVoices();
    // Some browsers load voices asynchronously
    speechSynthesis.addEventListener("voiceschanged", checkVoices);

    // Fallback: check again after 2s
    const timer = setTimeout(checkVoices, 2000);

    return () => {
      speechSynthesis.removeEventListener("voiceschanged", checkVoices);
      clearTimeout(timer);
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isAvailable || !isEnabled) return;

      // Cancel any current speech
      speechSynthesis.cancel();

      const cleaned = stripMarkdown(text);
      if (!cleaned.trim()) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utteranceRef.current = utterance;

      // Prefer a natural-sounding voice
      const voices = speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Samantha") ||
            v.name.includes("Karen") ||
            v.name.includes("Daniel") ||
            v.name.includes("Google") ||
            v.name.includes("Natural"))
      );
      if (preferred) utterance.voice = preferred;

      utterance.rate = 1.1;
      utterance.pitch = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      // Fallback timeout — if onend never fires (Electron edge case)
      const fallback = setTimeout(() => {
        if (utteranceRef.current === utterance) {
          setIsSpeaking(false);
        }
      }, Math.max(cleaned.length * 80, 5000)); // ~80ms per char

      const origOnEnd = utterance.onend;
      utterance.onend = (e) => {
        clearTimeout(fallback);
        if (origOnEnd) (origOnEnd as any)(e);
      };

      speechSynthesis.speak(utterance);
    },
    [isAvailable, isEnabled]
  );

  const cancel = useCallback(() => {
    speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_KEY, String(next));
      } catch {}
      if (!next) {
        // Cancel current speech when disabling
        speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      return next;
    });
  }, []);

  return {
    isEnabled,
    isSpeaking,
    isAvailable,
    speak,
    cancel,
    toggleEnabled,
  };
}
