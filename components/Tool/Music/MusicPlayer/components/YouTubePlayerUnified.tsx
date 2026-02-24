import React, { useEffect, useRef, useCallback, useState } from "react";
import { useMusicPlayer } from "../providers/musicProvider";
import { YouTubeAudio } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Music,
  Loader2,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@nextui-org/slider";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerUnifiedProps {
  className?: string;
}

const YouTubePlayerUnified: React.FC<YouTubePlayerUnifiedProps> = ({
  className,
}) => {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const isAPIReady = useRef(false);
  const pendingVideoId = useRef<string | null>(null);
  const timeUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  const lastIntentionalState = useRef<boolean | null>(null);
  const manualInteractionTimeout = useRef<NodeJS.Timeout | null>(null);
  const hasRecentManualInteraction = useRef<boolean>(false);
  const volumeRef = useRef<number>(30);
  const isMutedRef = useRef<boolean>(false);
  const bufferingQualityTimeout = useRef<NodeJS.Timeout | null>(null);
  const [showControls, setShowControls] = useState(false);

  const {
    audioState,
    youtubePlayerRef,
    stopAudio,
    pauseAudio,
    resumeAudio,
    setYouTubePlayingState,
    setYouTubeProgress,
    youtubeProgress,
    showVideoPlayer,
    toggleVideoPlayer,
    updateAudioVolume,
    toggleAudioMute,
    seekYouTube,
  } = useMusicPlayer();

  const currentAudio = audioState.currentAudio;
  const isYouTube = audioState.audioType === "youtube";
  const videoId =
    currentAudio?.type === "youtube"
      ? (currentAudio as YouTubeAudio).videoId
      : null;

  const createPlayerRef = useRef<((vidId: string) => void) | null>(null);

  // Track intentional state changes
  useEffect(() => {
    lastIntentionalState.current = audioState.isPlaying;

    if (manualInteractionTimeout.current) {
      clearTimeout(manualInteractionTimeout.current);
    }

    hasRecentManualInteraction.current = true;

    manualInteractionTimeout.current = setTimeout(() => {
      hasRecentManualInteraction.current = false;
      manualInteractionTimeout.current = null;
    }, 2000);
  }, [audioState.isPlaying]);

  // Keep refs in sync
  useEffect(() => {
    volumeRef.current = audioState.volume;
    isMutedRef.current = audioState.isMuted;
  }, [audioState.volume, audioState.isMuted]);

  // Load YouTube IFrame API
  useEffect(() => {
    if (typeof window !== "undefined" && !window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        isAPIReady.current = true;
        if (
          pendingVideoId.current &&
          (showVideoPlayer ? playerDivRef.current : containerRef.current) &&
          createPlayerRef.current
        ) {
          createPlayerRef.current(pendingVideoId.current);
        }
      };
    } else if (window.YT && window.YT.Player) {
      isAPIReady.current = true;
    }
  }, [showVideoPlayer]);

  // Show controls on hover (video mode only)
  const handleMouseEnter = useCallback(() => {
    if (showVideoPlayer) {
      setShowControls(true);
    }
  }, [showVideoPlayer]);

  const handleMouseLeave = useCallback(() => {
    if (showVideoPlayer) {
      setShowControls(false);
    }
  }, [showVideoPlayer]);

  const createPlayer = useCallback(
    (vidId: string) => {
      const targetContainer = showVideoPlayer
        ? playerDivRef.current
        : containerRef.current;

      if (!targetContainer || !isAPIReady.current) {
        pendingVideoId.current = vidId;
        return;
      }

      // Destroy existing player
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // Ignore
        }
        playerRef.current = null;
      }

      // Never auto-play on refresh to prevent jump scares
      // User must manually start playback
      const shouldAutoPlay = false;
      const playerId = `youtube-player-${Date.now()}`;
      const playerDiv = document.createElement("div");
      playerDiv.id = playerId;
      playerDiv.style.width = "100%";
      playerDiv.style.height = "100%";
      targetContainer.innerHTML = "";
      targetContainer.appendChild(playerDiv);

      playerRef.current = new window.YT.Player(playerId, {
        videoId: vidId,
        height: showVideoPlayer ? "100%" : "1",
        width: showVideoPlayer ? "100%" : "1",
        playerVars: {
          autoplay: shouldAutoPlay ? 1 : 0,
          controls: 0,
          disablekb: showVideoPlayer ? 0 : 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
          iv_load_policy: 3,
          cc_load_policy: 0,
        },
        events: {
          onReady: (event: any) => {
            const player = event.target;
            youtubePlayerRef.current = player;

            player.setVolume(volumeRef.current);
            if (isMutedRef.current) {
              player.mute();
            }

            try {
              const duration = player.getDuration?.() || 0;
              const videoData = player.getVideoData?.() || {};
              const isLiveStream =
                videoData.isLive || duration === 0 || duration > 86400;

              if (isLiveStream) {
                setYouTubeProgress(0, 0, true);
              } else if (duration > 0) {
                setYouTubeProgress(0, duration, false);
              }
            } catch (e) {
              // Duration might not be available yet
            }

            // Always set playing state to false on player ready
            // Never auto-play on refresh to prevent jump scares
            setYouTubePlayingState(false, false);

            // Auto-play if needed (audio mode only, video mode handled differently)
            if (!showVideoPlayer && shouldAutoPlay) {
              try {
                const currentState = player.getPlayerState?.();
                setTimeout(() => {
                  try {
                    const delayedState = player.getPlayerState?.();
                    if (
                      delayedState === -1 ||
                      delayedState === 5 ||
                      delayedState === 2
                    ) {
                      player.playVideo();
                      lastIntentionalState.current = true;
                      setYouTubePlayingState(true, false);
                    } else if (delayedState === 1) {
                      setYouTubePlayingState(true, false);
                    }
                  } catch (e) {
                    console.warn("[YouTubePlayer] Error in delayed auto-play:", e);
                  }
                }, 200);
              } catch (e) {
                setYouTubePlayingState(false, false);
              }
            } else if (showVideoPlayer && shouldAutoPlay) {
              // For video mode, also handle auto-play
              try {
                const currentState = player.getPlayerState?.();
                setTimeout(() => {
                  try {
                    const delayedState = player.getPlayerState?.();
                    if (
                      delayedState === -1 ||
                      delayedState === 5 ||
                      delayedState === 2
                    ) {
                      player.playVideo();
                      lastIntentionalState.current = true;
                      setYouTubePlayingState(true, false);
                    } else if (delayedState === 1) {
                      setYouTubePlayingState(true, false);
                    }
                  } catch (e) {
                    console.warn("[YouTubePlayer] Error in delayed auto-play:", e);
                  }
                }, 200);
              } catch (e) {
                setYouTubePlayingState(false, false);
              }
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            const player = event.target;

            if (state === 1) {
              if (
                lastIntentionalState.current === null ||
                lastIntentionalState.current === true
              ) {
                setYouTubePlayingState(true, false);
              }

              if (bufferingQualityTimeout.current) {
                clearTimeout(bufferingQualityTimeout.current);
                bufferingQualityTimeout.current = null;
              }

              if (timeUpdateInterval.current) {
                clearInterval(timeUpdateInterval.current);
              }

              const videoData = player.getVideoData?.() || {};
              const duration = player.getDuration?.() || 0;
              const isLiveStream =
                videoData.isLive || duration === 0 || duration > 86400;

              if (isLiveStream) {
                setYouTubeProgress(0, 0, true);
              } else {
                timeUpdateInterval.current = setInterval(() => {
                  try {
                    const currentTime = player.getCurrentTime?.() || 0;
                    const dur = player.getDuration?.() || 0;
                    setYouTubeProgress(currentTime, dur, false);
                  } catch (e) {
                    // Player might be destroyed
                  }
                }, showVideoPlayer ? 250 : 500);
              }
            } else if (state === 2) {
              if (
                (lastIntentionalState.current === null ||
                  lastIntentionalState.current === false) &&
                !audioState.isLoading
              ) {
                setYouTubePlayingState(false, false);
              }
              if (timeUpdateInterval.current) {
                clearInterval(timeUpdateInterval.current);
                timeUpdateInterval.current = null;
              }
            } else if (state === 3) {
              setYouTubePlayingState(
                lastIntentionalState.current ?? audioState.isPlaying,
                true
              );

              // Quality adjustment for audio mode only
              if (!showVideoPlayer) {
                try {
                  if (bufferingQualityTimeout.current) {
                    clearTimeout(bufferingQualityTimeout.current);
                  }

                  bufferingQualityTimeout.current = setTimeout(() => {
                    try {
                      const currentState = player.getPlayerState?.();
                      if (currentState === 3) {
                        const availableQualities =
                          player.getAvailableQualityLevels?.();
                        if (availableQualities && availableQualities.length > 0) {
                          const preferredQualities = ["medium", "small"];
                          for (const quality of preferredQualities) {
                            if (availableQualities.includes(quality)) {
                              player.setPlaybackQuality?.(quality);
                              break;
                            }
                          }
                        }
                      }
                    } catch (e) {
                      // Quality adjustment failed
                    } finally {
                      bufferingQualityTimeout.current = null;
                    }
                  }, 5000);
                } catch (e) {
                  // Quality adjustment not available
                }
              }
            } else if (state === 0) {
              setYouTubePlayingState(false, false);
              setYouTubeProgress(0, 0);
              if (timeUpdateInterval.current) {
                clearInterval(timeUpdateInterval.current);
                timeUpdateInterval.current = null;
              }
            }
          },
          onError: (event: any) => {
            console.error("YouTube player error:", event.data);
            if (timeUpdateInterval.current) {
              clearInterval(timeUpdateInterval.current);
              timeUpdateInterval.current = null;
            }
            stopAudio();
          },
        },
      });

      pendingVideoId.current = null;
    },
    [
      youtubePlayerRef,
      stopAudio,
      setYouTubePlayingState,
      setYouTubeProgress,
      audioState.isPlaying,
      showVideoPlayer,
    ]
  );

  useEffect(() => {
    createPlayerRef.current = createPlayer;
  }, [createPlayer]);

  // Handle video ID changes
  useEffect(() => {
    if (isYouTube && videoId) {
      if (isAPIReady.current && window.YT?.Player && createPlayerRef.current) {
        createPlayerRef.current(videoId);
      } else {
        pendingVideoId.current = videoId;
      }
    }

    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
        timeUpdateInterval.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, [isYouTube, videoId, showVideoPlayer]);

  // Handle auto-play when player becomes ready (audio mode only)
  useEffect(() => {
    if (
      isYouTube &&
      videoId &&
      !showVideoPlayer &&
      audioState.isPlaying &&
      youtubePlayerRef.current
    ) {
      try {
        const playerState = youtubePlayerRef.current.getPlayerState?.();
        if (playerState === -1 || playerState === 5 || playerState === 2) {
          youtubePlayerRef.current.playVideo?.();
          lastIntentionalState.current = true;
          setYouTubePlayingState(true, false);
        } else if (playerState === 1) {
          setYouTubePlayingState(true, false);
        }
      } catch (e) {
        console.warn("[YouTubePlayer] Error checking/playing player state:", e);
      }
    }
  }, [
    isYouTube,
    videoId,
    showVideoPlayer,
    audioState.isPlaying,
    youtubePlayerRef,
    setYouTubePlayingState,
  ]);

  // Handle auto-play when player becomes ready (video mode)
  useEffect(() => {
    if (
      isYouTube &&
      videoId &&
      showVideoPlayer &&
      audioState.isPlaying &&
      youtubePlayerRef.current
    ) {
      try {
        const playerState = youtubePlayerRef.current.getPlayerState?.();
        if (playerState === -1 || playerState === 5 || playerState === 2) {
          youtubePlayerRef.current.playVideo?.();
          lastIntentionalState.current = true;
          setYouTubePlayingState(true, false);
        } else if (playerState === 1) {
          setYouTubePlayingState(true, false);
        }
      } catch (e) {
        console.warn("[YouTubePlayer] Error checking/playing player state:", e);
      }
    }
  }, [
    isYouTube,
    videoId,
    showVideoPlayer,
    audioState.isPlaying,
    youtubePlayerRef,
    setYouTubePlayingState,
  ]);

  // Handle volume changes
  useEffect(() => {
    if (!playerRef.current || !isYouTube) return;

    try {
      playerRef.current.setVolume?.(audioState.volume);
      if (audioState.isMuted) {
        playerRef.current.mute?.();
      } else {
        playerRef.current.unMute?.();
      }
    } catch (e) {
      // Player might not be ready
    }
  }, [audioState.volume, audioState.isMuted, isYouTube]);

  // Listen for Focus Mode events (audio mode only)
  useEffect(() => {
    if (!isYouTube || showVideoPlayer) return;

    const handleFocusStarted = () => {
      if (hasRecentManualInteraction.current) {
        return;
      }

      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.playVideo?.();
          setYouTubePlayingState(true, false);
          lastIntentionalState.current = true;
        } catch (e) {
          console.warn("Error starting YouTube on focus:", e);
        }
      }
    };

    const handleFocusPaused = () => {
      if (hasRecentManualInteraction.current) {
        return;
      }

      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.pauseVideo?.();
          setYouTubePlayingState(false, false);
          lastIntentionalState.current = false;
        } catch (e) {
          console.warn("Error pausing YouTube on focus pause:", e);
        }
      }
    };

    const handleFocusEnded = () => {
      if (hasRecentManualInteraction.current) {
        return;
      }

      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.pauseVideo?.();
          setYouTubePlayingState(false, false);
          lastIntentionalState.current = false;
        } catch (e) {
          console.warn("Error pausing YouTube on focus end:", e);
        }
      }
    };

    window.addEventListener("focusModeStarted", handleFocusStarted);
    window.addEventListener("focusModePaused", handleFocusPaused);
    window.addEventListener("focusModeEnded", handleFocusEnded);
    window.addEventListener("breakModeStarted", handleFocusPaused);

    return () => {
      window.removeEventListener("focusModeStarted", handleFocusStarted);
      window.removeEventListener("focusModePaused", handleFocusPaused);
      window.removeEventListener("focusModeEnded", handleFocusEnded);
      window.removeEventListener("breakModeStarted", handleFocusPaused);
    };
  }, [isYouTube, showVideoPlayer, youtubePlayerRef, setYouTubePlayingState]);

  // Listen for Focus Mode events (video mode)
  useEffect(() => {
    if (!isYouTube || !showVideoPlayer) return;

    const handleFocusStarted = () => {
      if (hasRecentManualInteraction.current) {
        return;
      }

      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.playVideo?.();
          setYouTubePlayingState(true, false);
          lastIntentionalState.current = true;
        } catch (e) {
          console.warn("Error starting YouTube on focus:", e);
        }
      }
    };

    const handleFocusPaused = () => {
      if (hasRecentManualInteraction.current) {
        return;
      }

      if (youtubePlayerRef.current) {
        try {
          youtubePlayerRef.current.pauseVideo?.();
          setYouTubePlayingState(false, false);
          lastIntentionalState.current = false;
        } catch (e) {
          console.warn("Error pausing YouTube on focus pause:", e);
        }
      }
    };

    window.addEventListener("focusModeStarted", handleFocusStarted);
    window.addEventListener("focusModePaused", handleFocusPaused);
    window.addEventListener("focusModeEnded", handleFocusPaused);
    window.addEventListener("breakModeStarted", handleFocusPaused);

    return () => {
      window.removeEventListener("focusModeStarted", handleFocusStarted);
      window.removeEventListener("focusModePaused", handleFocusPaused);
      window.removeEventListener("focusModeEnded", handleFocusPaused);
      window.removeEventListener("breakModeStarted", handleFocusPaused);
    };
  }, [isYouTube, showVideoPlayer, youtubePlayerRef, setYouTubePlayingState]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeUpdateInterval.current) {
        clearInterval(timeUpdateInterval.current);
        timeUpdateInterval.current = null;
      }
      if (manualInteractionTimeout.current) {
        clearTimeout(manualInteractionTimeout.current);
        manualInteractionTimeout.current = null;
      }
      if (bufferingQualityTimeout.current) {
        clearTimeout(bufferingQualityTimeout.current);
        bufferingQualityTimeout.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Audio-only mode: hidden player
  if (!showVideoPlayer) {
    if (!isYouTube || !videoId) return null;

    return (
      <div
        ref={containerRef}
        className={className}
        data-youtube-audio-player="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    );
  }

  // Video mode: visible player with controls
  if (!isYouTube || !videoId) return null;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative w-full rounded-xl overflow-hidden",
        "bg-background border border-border",
        className
      )}
    >
      {/* Video Container - 16:9 aspect ratio */}
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <div ref={playerDivRef} className="absolute inset-0 bg-secondary" />

        {/* Controls Overlay */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-transparent"
            >
              {/* Top Bar */}
              <div className="absolute top-0 left-0 right-0 p-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 bg-primary/80 backdrop-blur-sm rounded-md px-2 py-1">
                  <Youtube className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-[10px] text-primary-foreground truncate font-medium">
                    {currentAudio?.title || "YouTube Video"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleVideoPlayer}
                  className="h-6 px-2 text-[10px] bg-primary/80 backdrop-blur-sm text-primary-foreground hover:bg-primary hover:text-primary-foreground gap-1 ml-2 shadow-lg"
                >
                  <Music className="w-3 h-3" />
                  <span className="hidden sm:inline">Audio Only</span>
                </Button>
              </div>

              {/* Center Play/Pause Button */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() =>
                    audioState.isPlaying ? pauseAudio(true) : resumeAudio()
                  }
                  className="rounded-full bg-primary/80 backdrop-blur-sm hover:bg-primary hover:text-primary-foreground text-primary-foreground pointer-events-auto shadow-lg"
                >
                  {audioState.isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : audioState.isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </Button>
              </div>

              {/* Bottom Bar */}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <div className="bg-primary/80 backdrop-blur-sm rounded-lg p-2">
                  {/* Progress Bar */}
                  {!youtubeProgress.isLive && (
                    <div className="mb-1.5">
                      <Slider
                        aria-label="Video Progress"
                        size="sm"
                        step={0.1}
                        minValue={0}
                        maxValue={100}
                        value={youtubeProgress.progress}
                        onChange={(val) => seekYouTube(val as number)}
                        className="w-full"
                        classNames={{
                          base: "w-full",
                          track: "bg-muted h-1",
                          filler: "bg-accent",
                          thumb: "w-2.5 h-2.5 bg-primary-foreground shadow-md",
                        }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    {/* Time / Live indicator */}
                    <div className="flex items-center gap-1.5">
                      {youtubeProgress.isLive ? (
                        <span className="text-[10px] font-medium text-red-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                          LIVE
                        </span>
                      ) : (
                        <span className="text-[10px] text-primary-foreground">
                          {formatTime(youtubeProgress.currentTime)} /{" "}
                          {formatTime(youtubeProgress.duration)}
                        </span>
                      )}
                    </div>

                    {/* Volume Control */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={toggleAudioMute}
                        className="h-6 w-6 p-0 hover:bg-foreground text-primary-foreground hover:text-primary-foreground"
                      >
                        {audioState.isMuted || audioState.volume === 0 ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <div className="w-16">
                        <Slider
                          aria-label="Volume"
                          size="sm"
                          step={1}
                          minValue={0}
                          maxValue={100}
                          value={audioState.isMuted ? 0 : audioState.volume}
                          onChange={(val) => updateAudioVolume(val as number)}
                          className="w-full"
                          classNames={{
                            base: "w-full",
                            track: "bg-muted h-1",
                            filler: "bg-accent",
                            thumb:
                              "w-2.5 h-2.5 bg-primary-foreground shadow-md",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default YouTubePlayerUnified;
