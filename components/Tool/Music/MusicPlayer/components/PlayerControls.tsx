import React, { useState } from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Repeat,
  VolumeOff,
  Volume1,
  Volume2,
  Shuffle,
  Repeat1,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useMusicPlayer } from "../providers/musicProvider";
import VolumeBar from "./VolumeBar";
import HyperchoTooltip from "../../../../UI/HyperchoTooltip";

interface PlayerControlsProps {}

const PlayerControls: React.FC<PlayerControlsProps> = () => {
  const {
    isPlaying,
    togglePlay,
    volume,
    toggleMute,
    isMuted,
    togglePlayMode,
    playMode,
    handlePlayNextSong,
    audioState,
    toggleAudioMute,
  } = useMusicPlayer();

  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutId) clearTimeout(timeoutId);
    const timer = setTimeout(() => setIsVolumeOpen(true), 300);
    setTimeoutId(timer);
  };

  const handleMouseLeave = () => {
    if (timeoutId) clearTimeout(timeoutId);
    const timer = setTimeout(() => setIsVolumeOpen(false), 300);
    setTimeoutId(timer);
  };

  const isAudioMode = audioState.currentAudio !== null;

  return (
    <div className="flex justify-between items-center gap-4 max-w-full overflow-hidden">
      <motion.div
        className="flex items-center w-fit"
        initial={false}
        animate={{
          width: isVolumeOpen ? "100%" : "auto",
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          gap: "0px",
        }}
      >
        <HyperchoTooltip
          value={
            isAudioMode && audioState.audioType
              ? `${
                  audioState.audioType.charAt(0).toUpperCase() +
                  audioState.audioType.slice(1)
                } Volume`
              : isMuted
              ? "Unmute"
              : "Mute"
          }
        >
          <motion.button
            className="text-muted-foreground fill-muted-foreground p-2"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={isAudioMode ? toggleAudioMute : toggleMute}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            {isAudioMode ? (
              audioState.isMuted || audioState.volume === 0 ? (
                <VolumeOff className="w-4 h-4" />
              ) : audioState.volume < 50 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )
            ) : volume === 0 || isMuted ? (
              <VolumeOff className="w-4 h-4" />
            ) : volume < 50 ? (
              <Volume1 className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </motion.button>
        </HyperchoTooltip>
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{
            opacity: isVolumeOpen ? 1 : 0,
            width: isVolumeOpen ? "100%" : 0,
          }}
          transition={{ duration: 0.2 }}
        >
          {isVolumeOpen && <VolumeBar />}
        </motion.div>
      </motion.div>
      {!isVolumeOpen && (
        <>
          <HyperchoTooltip
            value={
              isAudioMode ? "Not available during audio playback" : "Previous"
            }
          >
            <motion.button
              className={`text-muted-foreground fill-muted-foreground p-2 ${
                isAudioMode ? "opacity-50 cursor-not-allowed" : ""
              }`}
              whileHover={!isAudioMode ? { scale: 1.1 } : {}}
              whileTap={!isAudioMode ? { scale: 0.95 } : {}}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <SkipBack className="w-4 h-4" />
            </motion.button>
          </HyperchoTooltip>
          <HyperchoTooltip
            value={
              isAudioMode && audioState.isLoading
                ? `Loading ${audioState.audioType}...`
                : isAudioMode && audioState.audioType
                ? audioState.isPlaying
                  ? `Pause ${
                      audioState.audioType.charAt(0).toUpperCase() +
                      audioState.audioType.slice(1)
                    }`
                  : `Resume ${
                      audioState.audioType.charAt(0).toUpperCase() +
                      audioState.audioType.slice(1)
                    }`
                : isPlaying
                ? "Pause"
                : "Play"
            }
          >
            <motion.button
              className="rounded-full p-2 group bg-primary"
              onClick={() => {
                if (!isAudioMode || !audioState.isLoading) {
                  togglePlay();
                }
              }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              disabled={isAudioMode && audioState.isLoading}
            >
              {isAudioMode && audioState.isLoading ? (
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              ) : isAudioMode ? (
                audioState.isPlaying ? (
                  <Pause className="w-4 h-4 text-primary-foreground fill-primary-foreground group-hover:scale-110 transition-all duration-300" />
                ) : (
                  <Play className="w-4 h-4 text-primary-foreground fill-primary-foreground group-hover:scale-110 transition-all duration-300" />
                )
              ) : isPlaying ? (
                <Pause className="w-4 h-4 text-primary-foreground fill-primary-foreground group-hover:scale-110 transition-all duration-300" />
              ) : (
                <Play className="w-4 h-4 text-primary-foreground fill-primary-foreground group-hover:scale-110 transition-all duration-300" />
              )}
            </motion.button>
          </HyperchoTooltip>
          <HyperchoTooltip
            value={isAudioMode ? "Not available during audio playback" : "Next"}
          >
            <motion.button
              className={`text-muted-foreground fill-muted-foreground p-2 ${
                isAudioMode ? "opacity-50 cursor-not-allowed" : ""
              }`}
              whileHover={!isAudioMode ? { scale: 1.1 } : {}}
              whileTap={!isAudioMode ? { scale: 0.95 } : {}}
              onClick={!isAudioMode ? handlePlayNextSong : undefined}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <SkipForward className="w-4 h-4" />
            </motion.button>
          </HyperchoTooltip>
          <HyperchoTooltip
            value={
              isAudioMode
                ? "Not available during audio playback"
                : `Mode: ${playMode}`
            }
          >
            <motion.button
              className={`text-muted-foreground fill-muted-foreground p-2 ${
                isAudioMode
                  ? "opacity-50 cursor-not-allowed"
                  : playMode !== "order"
                  ? "text-accent"
                  : ""
              }`}
              whileHover={!isAudioMode ? { scale: 1.1 } : {}}
              whileTap={!isAudioMode ? { scale: 0.95 } : {}}
              onClick={!isAudioMode ? togglePlayMode : undefined}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              {playMode === "random" ? (
                <Shuffle className="w-4 h-4" />
              ) : playMode === "recursive" ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </motion.button>
          </HyperchoTooltip>
        </>
      )}
    </div>
  );
};
export default PlayerControls;
