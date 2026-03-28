"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Mic2, Languages } from "lucide-react";
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await window.electronAPI?.voiceOverlay?.settings?.get?.();
        const nextLanguage = res?.settings?.language || "en";
        if (!cancelled) {
          setLanguage(nextLanguage);
          setSavedLanguage(nextLanguage);
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
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <section className="w-full max-w-xl mx-auto py-8 px-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Mic2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Voice Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure the language used by local dictation and Whisper transcription.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-5">
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

        <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          Changing the language restarts the local transcription service. The next voice recording will use the new setting.
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
