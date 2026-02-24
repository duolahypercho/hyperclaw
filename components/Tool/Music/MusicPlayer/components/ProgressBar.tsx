import React, { useMemo } from "react";
import { formatTime } from "../utils/formatTime";
import { useMusicPlayer } from "../providers/musicProvider";
import { Slider } from "@nextui-org/slider";

const ProgressBar: React.FC = () => {
  const {
    progress,
    seek,
    currentSong,
    currentTime,
    audioState,
    youtubeProgress,
    seekYouTube,
  } = useMusicPlayer();

  const getAudioInfo = () => {
    if (!audioState.currentAudio) {
      return {
        isDisabled: false,
        leftText: formatTime(currentTime),
        rightText: formatTime(currentSong?.duration || 0),
        progressValue: progress,
        onSeek: seek,
      };
    }

    switch (audioState.currentAudio.type) {
      case "binaural":
        return {
          isDisabled: true,
          leftText: "Binaural Beat",
          rightText: `${audioState.currentAudio.beatFrequency}Hz`,
          progressValue: 0,
          onSeek: seek,
        };
      case "isochronic":
        return {
          isDisabled: true,
          leftText: "Isochronic Tone",
          rightText: `${audioState.currentAudio.beatFrequency}Hz`,
          progressValue: 0,
          onSeek: seek,
        };
      case "audioStream":
        return {
          isDisabled: true,
          leftText: "Audio Stream",
          rightText: "∞",
          progressValue: 0,
          onSeek: seek,
        };
      case "youtube":
        // For live streams, show LIVE indicator and disable seeking
        if (youtubeProgress.isLive) {
          return {
            isDisabled: true,
            leftText: "YouTube Stream",
            rightText: "∞",
            progressValue: 100,
            onSeek: seekYouTube,
          };
        }
        return {
          isDisabled: false,
          leftText: formatTime(youtubeProgress.currentTime),
          rightText: formatTime(youtubeProgress.duration),
          progressValue: youtubeProgress.progress,
          onSeek: seekYouTube,
        };
      default:
        return {
          isDisabled: false,
          leftText: formatTime(currentTime),
          rightText: formatTime(currentSong?.duration || 0),
          progressValue: progress,
          onSeek: seek,
        };
    }
  };

  const audioInfo = getAudioInfo();

  return (
    <div>
      <Slider
        classNames={{
          base: "max-w-md gap-3 group",
          track: "border-none",
          filler: "bg-accent bg-gradient-to-r from-accent to-accent",
        }}
        value={
          Number.isNaN(audioInfo.progressValue)
            ? 0
            : audioInfo.progressValue || 0
        }
        isDisabled={audioInfo.isDisabled}
        renderThumb={(props) => (
          <div
            {...props}
            className="opacity-0 group-hover:opacity-100 p-[6px] top-1/2 bg-accent border-small shadow-medium rounded-full cursor-grab data-[dragging=true]:cursor-grabbing transition-opacity duration-300"
          />
        )}
        size="sm"
        aria-label="Progress Bar"
        onChange={(val) => {
          const newValue = Array.isArray(val) ? val[0] : val;
          audioInfo.onSeek(newValue);
        }}
      />
      <div className="flex justify-between text-muted-foreground text-xs">
        <span>{audioInfo.leftText}</span>
        <span>{audioInfo.rightText}</span>
      </div>
    </div>
  );
};

export default ProgressBar;
