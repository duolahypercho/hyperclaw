import { useEffect, useRef } from "react";

export const useSoundEffect = (soundPath: string, volume: number = 1.0) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(soundPath);
    audioRef.current.preload = "auto";
    audioRef.current.volume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
  }, [soundPath, volume]);

  const playSound = (customVolume?: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      // Use custom volume if provided, otherwise use the hook's volume
      if (customVolume !== undefined) {
        audioRef.current.volume = Math.max(0, Math.min(1, customVolume));
      }
      audioRef.current.play().catch((error) => {
        console.warn("Failed to play sound:", error);
      });
    }
  };

  return playSound;
};
