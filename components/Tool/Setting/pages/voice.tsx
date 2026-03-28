"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Mic2, Languages, Download, Trash2, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import SettingsSkeleton from "$/components/Tool/Setting/pages/skelenton";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
];

export default function VoiceSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState("en");
  const [savedLanguage, setSavedLanguage] = useState("en");

  // Local Whisper state
  const [localWhisperInstalled, setLocalWhisperInstalled] = useState(false);
  const [localWhisperEnabled, setLocalWhisperEnabled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState("");
  const [removing, setRemoving] = useState(false);

  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  const loadStatus = useCallback(async () => {
    try {
      const res = await window.electronAPI?.voiceOverlay?.whisper?.runtimeStatus?.();
      if (res?.success) {
        setLocalWhisperInstalled(res.installed);
        setLocalWhisperEnabled(res.enabled);
        setInstalling(res.installing);
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await window.electronAPI?.voiceOverlay?.settings?.get?.();
        const nextLanguage = res?.settings?.language || "en";
        if (!cancelled) {
          setLanguage(nextLanguage);
          setSavedLanguage(nextLanguage);
          setLocalWhisperEnabled(!!res?.settings?.localWhisper);
        }
      } catch {
        if (!cancelled) {
          setLanguage("en");
          setSavedLanguage("en");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    if (isElectron) loadStatus();
    return () => {
      cancelled = true;
    };
  }, [isElectron, loadStatus]);

  // Listen for install progress
  useEffect(() => {
    if (!isElectron) return;
    const handler = (data: { step: string; detail: string }) => {
      setInstallProgress(data.detail);
      if (data.step === "done") {
        setInstalling(false);
        setLocalWhisperInstalled(true);
        setLocalWhisperEnabled(true);
        setInstallProgress("");
      }
    };
    window.electronAPI?.voiceOverlay?.whisper?.onInstallProgress?.(handler);
    return () => {
      window.electronAPI?.voiceOverlay?.whisper?.removeInstallProgressListener?.();
    };
  }, [isElectron]);

  if (loading) {
    return (
      <SettingsSkeleton
        title="Voice Settings"
        description="Choose the transcription language for local voice input."
      />
    );
  }

  const hasChanges = language !== savedLanguage;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await window.electronAPI?.voiceOverlay?.settings?.set?.({ language });
      if (!res?.success) {
        throw new Error(res?.error || "Failed to save voice settings");
      }
      const nextLanguage = res.settings?.language || language;
      setLanguage(nextLanguage);
      setSavedLanguage(nextLanguage);
      toast({
        title: "Voice settings updated",
        description: "The local transcription service will use the new language on the next recording.",
      });
    } catch (error) {
      toast({
        title: "Failed to save voice settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    setInstallProgress("Starting installation...");
    try {
      const res = await window.electronAPI?.voiceOverlay?.whisper?.runtimeInstall?.();
      if (!res?.success) {
        throw new Error(res?.error || "Installation failed");
      }
      toast({
        title: "Local Whisper installed",
        description: "Offline voice-to-text is now available.",
      });
    } catch (error) {
      toast({
        title: "Installation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setInstalling(false);
      setInstallProgress("");
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await window.electronAPI?.voiceOverlay?.whisper?.runtimeRemove?.();
      if (!res?.success) {
        throw new Error(res?.error || "Failed to remove");
      }
      setLocalWhisperInstalled(false);
      setLocalWhisperEnabled(false);
      toast({
        title: "Local Whisper removed",
        description: "Voice-to-text will use the browser's built-in speech recognition.",
      });
    } catch (error) {
      toast({
        title: "Failed to remove",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Mic2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Voice Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure voice-to-text transcription.
          </p>
        </div>
      </div>

      {/* Local Whisper section */}
      {isElectron && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <Label className="text-base font-medium">Local Voice-to-Text</Label>
            <p className="text-sm text-muted-foreground">
              Download an offline speech recognition model for faster, private transcription.
              Without it, voice input uses your browser&apos;s built-in speech recognition (requires internet).
            </p>
          </div>

          {localWhisperInstalled && localWhisperEnabled ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Installed and active
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={removing}
                className="text-destructive hover:text-destructive"
              >
                {removing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {removing ? "Removing..." : "Remove"}
              </Button>
            </div>
          ) : installing ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{installProgress || "Installing..."}</span>
            </div>
          ) : (
            <Button onClick={handleInstall} variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Local Whisper (~200 MB)
            </Button>
          )}

          <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            Requires Python 3.9+ installed on your system. The model and runtime are stored in your app data folder.
          </div>
        </div>
      )}

      {/* Language section */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-5 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="voice-language" className="flex items-center gap-2">
            <Languages className="w-4 h-4" />
            Transcription Language
          </Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="voice-language" className="w-full">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pick the language you speak most often for dictation. English is the default and usually the most stable.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Voice Settings"
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
