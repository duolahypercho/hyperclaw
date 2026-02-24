import React, { useState, useCallback } from "react";
import {
  Youtube,
  Play,
  X,
  Link2,
  Tv,
  Music,
  Pause,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMusicPlayer } from "../providers/musicProvider";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface YouTubeDropdownItemProps {
  onClose?: () => void;
}

const YouTubeDropdownItem: React.FC<YouTubeDropdownItemProps> = ({
  onClose,
}) => {
  const [url, setUrl] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    playYouTubeAudio,
    audioState,
    stopAudio,
    pauseAudio,
    resumeAudio,
    showVideoPlayer,
    toggleVideoPlayer,
  } = useMusicPlayer();

  const handlePlay = useCallback(async () => {
    if (!url.trim() || isLoading) return;
    setIsLoading(true);
    try {
      await playYouTubeAudio(url);
      setUrl("");
      setIsExpanded(false);
      onClose?.();
    } finally {
      setIsLoading(false);
    }
  }, [url, playYouTubeAudio, onClose, isLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handlePlay();
      }
      if (e.key === "Escape") {
        setIsExpanded(false);
        setUrl("");
      }
    },
    [handlePlay]
  );

  const isYouTubePlaying = audioState.audioType === "youtube";
  const currentYouTubeAudio =
    audioState.audioType === "youtube" ? audioState.currentAudio : null;

  if (isExpanded) {
    return (
      <div className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading video...</span>
              </>
            ) : (
              <>
                <Link2 className="w-3 h-3" />
                <span>Paste YouTube URL</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs flex-1"
              autoFocus
              disabled={isLoading}
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              size="sm"
              onClick={handlePlay}
              disabled={!url.trim() || isLoading}
              className="h-8 px-3"
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsExpanded(false);
                setUrl("");
              }}
              disabled={isLoading}
              className="h-8 px-2"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <DropdownMenuItem
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsExpanded(true);
        }}
        className="text-foreground cursor-pointer"
      >
        <Youtube className="w-3 h-3 mr-2 fill-red-500 stroke-white" />
        <span>Play from YouTube</span>
      </DropdownMenuItem>

      {isYouTubePlaying && currentYouTubeAudio && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (audioState.isPlaying) {
                pauseAudio(true);
              } else {
                resumeAudio();
              }
            }}
            className="text-foreground"
          >
            {audioState.isPlaying ? (
              <Pause className="w-3 h-3 mr-2 text-primary" />
            ) : (
              <Play className="w-3 h-3 mr-2 text-primary" />
            )}
            <span>{audioState.isPlaying ? "Pause" : "Resume"} YouTube</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={toggleVideoPlayer}
            className="text-foreground"
          >
            {showVideoPlayer ? (
              <>
                <Music className="mr-2 h-3 w-3 text-primary" />
                <span>Audio Only</span>
              </>
            ) : (
              <>
                <Tv className="mr-2 h-3 w-3 text-primary" />
                <span>Show Video</span>
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={stopAudio}
            className="text-destructive focus:text-destructive"
          >
            <X className="mr-2 h-3 w-3 text-destructive" />
            <span>Stop YouTube</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2">
              {currentYouTubeAudio.type === "youtube" &&
                currentYouTubeAudio.thumbnail && (
                  <img
                    src={currentYouTubeAudio.thumbnail}
                    alt="Video thumbnail"
                    className="w-12 h-8 object-cover rounded"
                  />
                )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium text-foreground truncate">
                  {currentYouTubeAudio.title}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {currentYouTubeAudio.description}
                </span>
              </div>
              {audioState.isPlaying && (
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default YouTubeDropdownItem;
