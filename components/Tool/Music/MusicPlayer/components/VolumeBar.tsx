import React, { useMemo } from "react";
import { useMusicPlayer } from "../providers/musicProvider";
import { Slider } from "@nextui-org/slider";

const VolumeBar: React.FC = () => {
  const { volume, updateVolume, isMuted, audioState, updateAudioVolume } =
    useMusicPlayer();

  const isMusic = useMemo(
    () => audioState.audioType === "music" || audioState.audioType === null,
    [audioState.audioType]
  );

  // Use audio system volume if any audio is playing, otherwise use regular volume
  const currentVolume = useMemo(
    () => (isMusic ? volume : audioState.volume),
    [isMusic, audioState.volume, volume]
  );

  const currentIsMuted = useMemo(
    () => (isMusic ? isMuted : audioState.isMuted),
    [isMusic, audioState.isMuted, isMuted]
  );

  const ariaLabel = useMemo(() => {
    if (isMusic) return "Music Volume";
    if (audioState.audioType) {
      const t = audioState.audioType;
      return `${t.charAt(0).toUpperCase()}${t.slice(1)} Volume`;
    }
    return "System Volume";
  }, [isMusic, audioState.audioType]);

  return (
    <div className="w-full px-3">
      <Slider
        classNames={{
          base: "max-w-md gap-3 group",
          track: "border-none",
          filler: "bg-accent bg-gradient-to-r from-accent to-accent",
        }}
        value={currentIsMuted ? 0 : currentVolume}
        renderThumb={(props) => (
          <div
            {...props}
            className="opacity-0 group-hover:opacity-100 p-[6px] top-1/2 bg-accent border-small shadow-medium rounded-full cursor-grab data-[dragging=true]:cursor-grabbing transition-opacity duration-300"
          />
        )}
        size="sm"
        aria-label={ariaLabel}
        onChange={(val) => {
          const newValue = Array.isArray(val) ? val[0] : val;
          isMusic ? updateVolume(newValue) : updateAudioVolume(newValue);
        }}
      />
    </div>
  );
};

export default VolumeBar;
