import React, { useMemo } from "react";
import { motion } from "framer-motion";
import PlayerControls from "./PlayerControls";
import ProgressBar from "./ProgressBar";
import AudioVisualizer from "./BinauralVisualizer";
import YouTubePlayerUnified from "./YouTubePlayerUnified";
import { useMusicPlayer } from "../providers/musicProvider";
import { getMediaUrl } from "../../../../../utils";
import AudioDropdownMenu from "./AudioDropdownMenu";
import { cn } from "@/lib/utils";
import { Youtube } from "lucide-react";
import { getAudioDisplayInfo } from "../../utils";
import type { AudioType } from "../types";
import type { ZSong } from "../../Provider/types";

interface MusicPlayerContainerProps {
  className?: string;
}

// Memoized component for Audio Thumbnail
interface AudioThumbnailProps {
  audioType: string | null;
  currentAudio: AudioType | null;
  currentSong: ZSong | null;
}

const AudioThumbnail = React.memo<AudioThumbnailProps>(
  ({ audioType, currentAudio, currentSong }) => {
    if (audioType && currentAudio) {
      if (audioType === "youtube" && currentAudio?.type === "youtube") {
        return (
          <div className="w-full h-full relative">
            <img
              src={currentAudio.thumbnail || "/Logopic.png"}
              alt="YouTube thumbnail"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <Youtube className="w-8 h-8 text-red-500" />
            </div>
          </div>
        );
      }
      return <AudioVisualizer />;
    }

    if (currentSong?.cover) {
      return (
        <motion.img
          src={getMediaUrl(currentSong.cover) || ""}
          alt={`Album Cover - ${currentSong.title}`}
          className="w-full h-full object-cover"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            const target = e.target as HTMLImageElement;
            target.src = "/Logopic.png";
          }}
        />
      );
    }

    return <div className="w-full h-full bg-muted-foreground animate-pulse" />;
  },
  (prevProps, nextProps) => {
    return (
      prevProps.audioType === nextProps.audioType &&
      prevProps.currentAudio === nextProps.currentAudio &&
      prevProps.currentSong?._id === nextProps.currentSong?._id &&
      prevProps.currentSong?.cover === nextProps.currentSong?.cover
    );
  }
);
AudioThumbnail.displayName = "AudioThumbnail";

// Memoized component for Audio Title
interface AudioTitleProps {
  title: string;
}

const AudioTitle = React.memo<AudioTitleProps>(({ title }) => {
  return (
    <motion.h2
      className="text-foreground text-base font-semibold truncate overflow-hidden whitespace-nowrap flex-1 min-w-0"
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2 }}
      title={title}
    >
      {title}
    </motion.h2>
  );
}, (prevProps, nextProps) => prevProps.title === nextProps.title);
AudioTitle.displayName = "AudioTitle";

// Memoized component for Audio Description
interface AudioDescriptionProps {
  description: string;
}

const AudioDescription = React.memo<AudioDescriptionProps>(
  ({ description }) => {
    return (
      <motion.p
        className="text-xs text-muted-foreground truncate overflow-hidden whitespace-nowrap"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        title={description}
      >
        {description}
      </motion.p>
    );
  },
  (prevProps, nextProps) =>
    prevProps.description === nextProps.description
);
AudioDescription.displayName = "AudioDescription";

// Memoized component for Playing Indicator
interface PlayingIndicatorProps {
  isPlaying: boolean;
  hasAudioType: boolean;
}

const PlayingIndicator = React.memo<PlayingIndicatorProps>(
  ({ isPlaying, hasAudioType }) => {
    if (hasAudioType || !isPlaying) {
      return null;
    }
    return (
      <div className="w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isPlaying === nextProps.isPlaying &&
      prevProps.hasAudioType === nextProps.hasAudioType
    );
  }
);
PlayingIndicator.displayName = "PlayingIndicator";

// Memoized component for Audio Player Content (thumbnail + info + controls)
interface AudioPlayerContentProps {
  audioType: string | null;
  currentAudio: AudioType | null;
  currentSong: ZSong | null;
  audioInfo: { title: string; description: string };
  isPlaying: boolean;
}

const AudioPlayerContent = React.memo<AudioPlayerContentProps>(
  ({ audioType, currentAudio, currentSong, audioInfo, isPlaying }) => {
    return (
      <div className="w-full flex gap-4 items-center justify-center overflow-hidden">
        <div className="w-24 h-24 rounded-xl overflow-hidden relative">
          <AudioThumbnail
            audioType={audioType}
            currentAudio={currentAudio}
            currentSong={currentSong}
          />
        </div>
        <div className="flex-1 relative min-w-0">
          <div className="flex flex-col min-w-0">
            <div className="flex flex-row items-center gap-2 min-w-0">
              <AudioTitle title={audioInfo.title} />
              <PlayingIndicator
                isPlaying={isPlaying}
                hasAudioType={!!audioType}
              />
              <AudioDropdownMenu
                triggerClassName="text-foreground hover:bg-transparent"
                iconSize="h-4 w-4"
              />
            </div>
            <AudioDescription description={audioInfo.description} />
          </div>
          <ProgressBar />
          <PlayerControls />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.audioType === nextProps.audioType &&
      prevProps.currentAudio === nextProps.currentAudio &&
      prevProps.currentSong?._id === nextProps.currentSong?._id &&
      prevProps.audioInfo.title === nextProps.audioInfo.title &&
      prevProps.audioInfo.description === nextProps.audioInfo.description &&
      prevProps.isPlaying === nextProps.isPlaying
    );
  }
);
AudioPlayerContent.displayName = "AudioPlayerContent";

const MusicPlayerContainer = (props: MusicPlayerContainerProps) => {
  const {
    currentSong,
    audioState,
    isPlaying,
    showVideoPlayer,
  } = useMusicPlayer();

  // Memoize audioInfo to prevent recalculation on every render
  const audioInfo = useMemo(
    () =>
      getAudioDisplayInfo({
        currentAudio: audioState.currentAudio,
        currentSong,
      }),
    [audioState.currentAudio, currentSong]
  );

  return (
    <div className={cn("flex-1 flex flex-col gap-4", props.className)}>
      {/* Unified YouTube Player (handles both audio-only and video modes) */}
      <YouTubePlayerUnified />

      {/* Audio Player Content (only renders when video player is not shown) */}
      {!(showVideoPlayer && audioState.audioType === "youtube") && (
        <AudioPlayerContent
          audioType={audioState.audioType}
          currentAudio={audioState.currentAudio}
          currentSong={currentSong}
          audioInfo={audioInfo}
          isPlaying={isPlaying}
        />
      )}
    </div>
  );
};

export default MusicPlayerContainer;
