"use client";

import React, { memo, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Mic, Square, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceWaveform } from "./VoiceWaveform";

interface VoiceControllerProps {
  isListening: boolean;
  transcript: string;
  currentValue: string;
  audioData: number[];
  onStart: () => void;
  onStop: () => void;
  onSend: () => void;
  className?: string;
}

export const VoiceController = memo<VoiceControllerProps>(
  ({
    isListening,
    transcript,
    currentValue,
    audioData,
    onStart,
    onStop,
    onSend,
    className,
  }) => {
    const hasContent = (transcript || currentValue)?.trim().length > 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "flex flex-row items-center justify-end w-full gap-3",
          className
        )}
      >
        {/* Waveform visualization */}
        <div className="flex items-center justify-center">
          <VoiceWaveform
            audioData={audioData}
            isListening={isListening}
          />
        </div>

        {/* Stop/Resume recording button */}
        <Button
          variant="outline"
          size="sm"
          onClick={isListening ? onStop : onStart}
          className={cn(
            "h-8 w-8 p-0 transition-all duration-200",
            isListening &&
            "border-destructive text-destructive hover:bg-destructive/10"
          )}
        >
          {isListening ? (
            <Square className="w-3 h-3 fill-current" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </Button>

        {/* Send voice message button */}
        <Button
          size="sm"
          disabled={!hasContent}
          onClick={onSend}
          className="h-8 w-8 p-0 transition-all duration-200"
        >
          <Send className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }
);

VoiceController.displayName = "VoiceController";
