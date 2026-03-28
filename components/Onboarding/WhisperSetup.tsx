"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic2, Download, Loader2, CheckCircle2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhisperSetupProps {
  onComplete: () => void;
}

export default function WhisperSetup({ onComplete }: WhisperSetupProps) {
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState("");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const whisper = window.electronAPI?.voiceOverlay?.whisper;
    if (!whisper) return;

    const handler = (data: { step: string; detail: string }) => {
      setInstallProgress(data.detail);
      if (data.step === "done") {
        setInstalling(false);
        setInstalled(true);
      }
    };

    whisper.onInstallProgress?.(handler);
    return () => {
      whisper.removeInstallProgressListener?.();
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    setInstallProgress("Starting installation...");
    try {
      const res = await window.electronAPI?.voiceOverlay?.whisper?.runtimeInstall?.();
      if (!res?.success) {
        setInstalling(false);
        setInstallProgress("");
      }
    } catch {
      setInstalling(false);
      setInstallProgress("");
    }
  };

  const handleSkip = async () => {
    // Ensure localWhisper is false
    await window.electronAPI?.voiceOverlay?.settings?.set?.({ localWhisper: false });
    onComplete();
  };

  if (installed) {
    // Brief success state before moving on
    setTimeout(onComplete, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg mx-auto px-6"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Mic2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Voice-to-Text</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
            Hyperclaw can transcribe your voice locally on your device for faster,
            private speech recognition. This requires a one-time download (~200 MB).
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          {installed ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <p className="text-sm font-medium text-foreground">Local Whisper is ready!</p>
            </motion.div>
          ) : installing ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{installProgress || "Installing..."}</p>
              <p className="text-xs text-muted-foreground">This may take a few minutes.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Download Local Model</p>
                    <p className="text-xs text-muted-foreground">
                      Offline transcription using Whisper. Works without internet,
                      faster response, and your audio never leaves your device.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Use Browser Speech Recognition</p>
                    <p className="text-xs text-muted-foreground">
                      No download needed. Uses your browser&apos;s built-in speech recognition
                      (requires internet). You can always install local Whisper later in Settings.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSkip}
                >
                  Skip
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleInstall}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          You can change this anytime in Settings &gt; Voice.
        </p>
      </motion.div>
    </div>
  );
}
