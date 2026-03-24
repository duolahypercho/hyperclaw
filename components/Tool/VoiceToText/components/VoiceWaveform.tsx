"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  audioData: number[];
  isListening: boolean;
  className?: string;
  barCount?: number;
  minHeight?: number;
  maxHeight?: number;
}

export const VoiceWaveform = memo<VoiceWaveformProps>(
  ({
    audioData,
    isListening,
    className,
    barCount = 5,
    minHeight = 8,
    maxHeight = 32,
  }) => {
    // Use audioData if available, otherwise create placeholder data
    const data = audioData.length > 0
      ? audioData
      : Array(barCount).fill(0);

    return (
      <div
        className={cn(
          "flex items-center justify-center gap-1 h-8",
          className
        )}
      >
        {data.map((amplitude, i) => {
          // Calculate height based on amplitude (0-1 range)
          const height = isListening
            ? minHeight + amplitude * (maxHeight - minHeight)
            : minHeight;

          return (
            <motion.div
              key={i}
              className="w-1 bg-primary/50 rounded-full"
              animate={{
                height: `${height}px`,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
                mass: 0.5,
              }}
              style={{
                minHeight: `${minHeight}px`,
                maxHeight: `${maxHeight}px`,
              }}
            />
          );
        })}
      </div>
    );
  }
);

VoiceWaveform.displayName = "VoiceWaveform";
