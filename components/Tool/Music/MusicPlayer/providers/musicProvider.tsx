import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { SidebarPlaylist, ZPlaylist, ZSong } from "../../Provider/types";
import { getGenreResponse } from "$/services/tools/music/responseTypes";
import { getMediaUrl } from "$/utils";
import {
  getPlaylistsAPI,
  getSinglePlaylistAPI,
  getSingleSongAPI,
  getLibrarySongsAPI,
  getGenreAPI,
  getHomeSongsAPI,
} from "$/services/tools/music";
import { useToast } from "@/components/ui/use-toast";
import {
  PlayMode,
  PRELOAD_CONFIG,
  AudioType,
  BinauralBeat,
  IsochronicTone,
  AudioStream,
  YouTubeAudio,
  AudioContextRef,
  AudioState,
} from "../types";
import { useOS } from "@OS/Provider/OSProv";
import { randomRadioStations } from "../services/radio";
import { useUser } from "$/Providers/UserProv";

interface MusicPlayerContextType {
  // Music player state
  isPlaying: boolean;
  isMuted: boolean;
  currentSong: ZSong | null;
  playlists: SidebarPlaylist[];
  progress: number;
  volume: number;
  currentTime: number;
  currentPlaylistId: string | null;
  currentPlaylist: ZPlaylist | null;
  loadedPlaylists: Map<string, ZPlaylist>;

  // Audio system state
  audioState: AudioState;
  binauralBeats: BinauralBeat[];
  isochronicTones: IsochronicTone[];
  audioStreams: AudioStream[];

  // Music player methods
  togglePlay: (play?: boolean) => void;
  seek: (percentage: number) => void;
  updateVolume: (value: number) => void;
  toggleMute: () => void;
  changeSong: (songId: string) => void;
  handleSwitchPlaylist: (playlistId: string) => void;
  handlePlaylistsLoad: (playlistId?: string) => void;
  handlePlayNextSong: () => void;
  togglePlayMode: () => void;
  playMode: PlayMode;

  // Audio system methods
  playAudio: (audio: AudioType) => void;
  pauseAudio: (isUserInitiated?: boolean) => void;
  stopAudio: () => void;
  resumeAudio: () => void;
  updateAudioVolume: (value: number) => void;
  toggleAudioMute: () => void;
  // User intent
  setManualPlaybackOverride: (state: "playing" | "paused" | null) => void;
  fetchRandomRadioStations: (limit?: number) => Promise<AudioStream[]>;
  updateCustomBinauralFrequencies: (
    baseFrequency: number,
    beatFrequency: number
  ) => void;
  updateCustomIsochronicFrequencies: (
    baseFrequency: number,
    beatFrequency: number,
    waveform: OscillatorType
  ) => void;
  playCustomBinauralBeat: () => void;
  playCustomIsochronicTone: () => void;
  // YouTube methods
  playYouTubeAudio: (url: string) => Promise<void>;
  youtubePlayerRef: React.MutableRefObject<any>;
  setYouTubePlayingState: (isPlaying: boolean, isLoading?: boolean) => void;
  youtubeProgress: {
    currentTime: number;
    duration: number;
    progress: number;
    isLive: boolean;
  };
  setYouTubeProgress: (
    currentTime: number,
    duration: number,
    isLive?: boolean
  ) => void;
  seekYouTube: (percentage: number) => void;
  // Video player visibility
  showVideoPlayer: boolean;
  toggleVideoPlayer: () => void;
  // Library songs
  librarySongs: ZSong[];
  isLibraryLoading: boolean;
  isLoadingMoreLibrary: boolean;
  hasMoreLibrary: boolean;
  loadLibrarySongs: () => Promise<void>;
  loadMoreLibrarySongs: () => Promise<void>;
  // Genres
  genres: getGenreResponse["data"];
  isGenreLoading: boolean;
  loadGenres: () => Promise<void>;
  // Genre-filtered library songs
  genreLibrarySongs: Map<string, ZSong[]>;
  loadLibrarySongsByGenre: (
    genreId: string,
    page?: number,
    limit?: number
  ) => Promise<void>;
}

const defaultContext: MusicPlayerContextType = {
  isPlaying: false,
  isMuted: false,
  progress: 0,
  volume: 60,
  playlists: [],
  currentSong: null,
  currentPlaylist: null,
  currentPlaylistId: null,
  loadedPlaylists: new Map(),
  currentTime: 0,
  audioState: {
    isPlaying: false,
    isLoading: false,
    currentAudio: null,
    volume: 30,
    isMuted: false,
    audioType: null,
    customFrequencies: {
      binaural: {
        baseFrequency: 100,
        beatFrequency: 8,
      },
      isochronic: {
        baseFrequency: 100,
        beatFrequency: 10,
        waveform: "sine",
      },
    },
  },
  binauralBeats: [],
  isochronicTones: [],
  audioStreams: [],
  togglePlay: () => { },
  seek: () => { },
  updateVolume: () => { },
  toggleMute: () => { },
  changeSong: () => { },
  handleSwitchPlaylist: () => { },
  handlePlayNextSong: () => { },
  handlePlaylistsLoad: () => { },
  togglePlayMode: () => { },
  playMode: "order",
  playAudio: () => { },
  pauseAudio: () => { },
  stopAudio: () => { },
  resumeAudio: () => { },
  updateAudioVolume: () => { },
  toggleAudioMute: () => { },
  setManualPlaybackOverride: () => { },
  fetchRandomRadioStations: async () => [],
  updateCustomBinauralFrequencies: () => { },
  updateCustomIsochronicFrequencies: () => { },
  playCustomBinauralBeat: () => { },
  playCustomIsochronicTone: () => { },
  playYouTubeAudio: async () => { },
  youtubePlayerRef: { current: null } as React.MutableRefObject<any>,
  setYouTubePlayingState: () => { },
  youtubeProgress: { currentTime: 0, duration: 0, progress: 0, isLive: false },
  setYouTubeProgress: () => { },
  seekYouTube: () => { },
  showVideoPlayer: false,
  toggleVideoPlayer: () => { },
  librarySongs: [],
  isLibraryLoading: false,
  isLoadingMoreLibrary: false,
  hasMoreLibrary: true,
  loadLibrarySongs: async () => { },
  loadMoreLibrarySongs: async () => { },
  genres: [],
  isGenreLoading: false,
  loadGenres: async () => { },
  genreLibrarySongs: new Map(),
  loadLibrarySongsByGenre: async () => { },
};

const MusicPlayerContext =
  createContext<MusicPlayerContextType>(defaultContext);

export const useMusicPlayer = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error("useMusicPlayer must be used within a MusicPlayerProvider");
  }
  return context;
};

interface MusicPlayerProviderProps {
  children: ReactNode;
}

// Helper function to extract YouTube video ID from URL
const extractYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

export const MusicPlayerProvider = ({ children }: MusicPlayerProviderProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [youtubeProgress, setYoutubeProgressState] = useState({
    currentTime: 0,
    duration: 0,
    progress: 0,
    isLive: false,
  });
  const [currentSong, setCurrentSong] = useState<ZSong | null>(null);
  const [nextSong, setNextSong] = useState<ZSong | null>(null);
  const [currentPlaylist, setCurrentPlaylist] = useState<ZPlaylist | null>(
    null
  );
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const { getAppSettings, updateAppSettings } = useOS();
  const currentAppSettings = getAppSettings("music");

  const getSettingsFromMeta = () => {
    const meta = currentAppSettings?.meta || {};

    // Define default values
    const defaults = {
      playMode: "order",
      volume: 60,
      currentPlaylistId: null,
      currentSongId: null,
      isMuted: false,
      audioVolume: 30,
      audioType: "music",
      currentAudio: null,
      youtubeVideoId: null,
      audioIsPlaying: false,
      customBinauralFrequencies: {
        baseFrequency: 100,
        beatFrequency: 8,
      },
      customIsochronicFrequencies: {
        baseFrequency: 100,
        beatFrequency: 10,
        waveform: "sine" as OscillatorType,
      },
      showVideoPlayer: false,
    };

    // Merge meta with defaults, ensuring all fields are present
    return {
      playMode: meta.playMode ?? defaults.playMode,
      volume: meta.volume ?? defaults.volume,
      currentPlaylistId: meta.currentPlaylistId ?? defaults.currentPlaylistId,
      currentSongId: meta.currentSongId ?? defaults.currentSongId,
      isMuted: meta.isMuted ?? defaults.isMuted,
      audioVolume: meta.audioVolume ?? defaults.audioVolume,
      audioType: meta.audioType ?? defaults.audioType,
      currentAudio: meta.currentAudio ?? defaults.currentAudio,
      youtubeVideoId: meta.youtubeVideoId ?? defaults.youtubeVideoId,
      audioIsPlaying: meta.audioIsPlaying ?? defaults.audioIsPlaying,
      customBinauralFrequencies: meta.customBinauralFrequencies ?? defaults.customBinauralFrequencies,
      customIsochronicFrequencies: meta.customIsochronicFrequencies ?? defaults.customIsochronicFrequencies,
      showVideoPlayer: meta.showVideoPlayer ?? defaults.showVideoPlayer,
    };
  };

  const initialSettings = getSettingsFromMeta();

  // Audio system state
  // Never auto-play on refresh to prevent jump scares
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false, // Always start as false on refresh
    isLoading: false,
    currentAudio: initialSettings.currentAudio,
    volume: initialSettings.audioVolume,
    isMuted: initialSettings.isMuted,
    audioType: initialSettings.audioType,
    customFrequencies: {
      binaural: {
        baseFrequency: initialSettings.customBinauralFrequencies.baseFrequency,
        beatFrequency: initialSettings.customBinauralFrequencies.beatFrequency,
      },
      isochronic: {
        baseFrequency:
          initialSettings.customIsochronicFrequencies.baseFrequency,
        beatFrequency:
          initialSettings.customIsochronicFrequencies.beatFrequency,
        waveform: initialSettings.customIsochronicFrequencies.waveform,
      },
    },
  });

  const [showVideoPlayer, setShowVideoPlayer] = useState(
    initialSettings.showVideoPlayer
  );

  const audioContextRef = useRef<AudioContextRef>({
    audioContext: null,
    gainNode: null,
    audioElement: null,
  });

  const [state, setState] = useState({
    playMode: initialSettings.playMode,
    volume: initialSettings.volume,
    currentPlaylistId: initialSettings.currentPlaylistId,
    currentSongId: initialSettings.currentSongId,
    isMuted: initialSettings.isMuted,
  });

  const { playMode, volume, currentPlaylistId, currentSongId, isMuted } = state;

  const [preloadedAudio, setPreloadedAudio] = useState<HTMLAudioElement | null>(
    null
  );
  const [isPreloading, setIsPreloading] = useState(false);
  const [playlists, setPlaylists] = useState<SidebarPlaylist[]>([]);
  const [loadedPlaylists, setLoadedPlaylists] = useState<
    Map<string, ZPlaylist>
  >(new Map());
  const { updateOSSettings } = useOS();
  const { toast } = useToast();
  const { userId } = useUser();

  // Library songs state
  const [librarySongs, setLibrarySongs] = useState<ZSong[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState<boolean>(false);
  const [isLoadingMoreLibrary, setIsLoadingMoreLibrary] =
    useState<boolean>(false);
  const [currentLibraryPage, setCurrentLibraryPage] = useState<number>(1);
  const [hasMoreLibrary, setHasMoreLibrary] = useState<boolean>(true);
  const LIBRARY_SONGS_PER_PAGE = 20;

  // Genres state
  const [genres, setGenres] = useState<getGenreResponse["data"]>([]);
  const [isGenreLoading, setIsGenreLoading] = useState<boolean>(false);
  const [genreLibrarySongs, setGenreLibrarySongs] = useState<
    Map<string, ZSong[]>
  >(new Map());

  // Enhanced binaural beats with more presets
  const binauralBeats: BinauralBeat[] = [
    {
      id: "delta-deep-sleep",
      type: "binaural",
      title: "Delta 2hz (Deep Sleep)",
      baseFrequency: 100,
      beatFrequency: 2,
      description: "Deep sleep and regeneration",
      category: "Sleep",
    },
    {
      id: "theta-meditation",
      type: "binaural",
      title: "Theta 4hz (Creativity)",
      baseFrequency: 100,
      beatFrequency: 4,
      description: "Deep meditation and creativity",
      category: "Meditation",
    },
    {
      id: "alpha-relaxation",
      type: "binaural",
      title: "Alpha 8hz (Relaxation)",
      baseFrequency: 100,
      beatFrequency: 8,
      description: "Relaxation and stress relief",
      category: "Relaxation",
    },
    {
      id: "beta-focus",
      type: "binaural",
      title: "Beta 16hz (Focus)",
      baseFrequency: 100,
      beatFrequency: 16,
      description: "Focus and concentration",
      category: "Focus",
    },
    {
      id: "gamma-cognition",
      type: "binaural",
      title: "Gamma 32hz (Cognition)",
      baseFrequency: 100,
      beatFrequency: 32,
      description: "High-level cognition and insight",
      category: "Cognition",
    },
    {
      id: "theta-creativity",
      type: "binaural",
      title: "Theta 64hz (Creativity)",
      baseFrequency: 200,
      beatFrequency: 64,
      description: "Enhanced creativity and intuition",
      category: "Creativity",
    },
    {
      id: "alpha-learning",
      type: "binaural",
      title: "Alpha 128hz (Learning)",
      baseFrequency: 150,
      beatFrequency: 128,
      description: "Optimal learning state",
      category: "Learning",
    },
    {
      id: "reality-healing",
      type: "binaural",
      title: "432Hz (Universal Harmony)",
      baseFrequency: 432,
      beatFrequency: 8,
      description: "Universal frequency for healing and spiritual connection",
      category: "Healing",
    },
  ];

  // Isochronic tones presets
  const isochronicTones: IsochronicTone[] = [
    {
      id: "delta-isochronic",
      type: "isochronic",
      title: "Delta (Deep Sleep)",
      baseFrequency: 100,
      beatFrequency: 2,
      waveform: "sine",
      description: "Deep sleep and regeneration",
      category: "Sleep",
    },
    {
      id: "theta-isochronic",
      type: "isochronic",
      title: "Theta (Meditation)",
      baseFrequency: 100,
      beatFrequency: 5,
      waveform: "sine",
      description: "Deep meditation and creativity",
      category: "Meditation",
    },
    {
      id: "alpha-isochronic",
      type: "isochronic",
      title: "Alpha (Relaxation)",
      baseFrequency: 100,
      beatFrequency: 10,
      waveform: "sine",
      description: "Relaxation and stress relief",
      category: "Relaxation",
    },
    {
      id: "beta-isochronic",
      type: "isochronic",
      title: "Beta (Focus)",
      baseFrequency: 100,
      beatFrequency: 20,
      waveform: "sine",
      description: "Focus and concentration",
      category: "Focus",
    },
    {
      id: "gamma-isochronic",
      type: "isochronic",
      title: "Gamma (Cognition)",
      baseFrequency: 100,
      beatFrequency: 40,
      waveform: "sine",
      description: "High-level cognition and insight",
      category: "Cognition",
    },
  ];

  // Audio music presets
  const [audioStreams, setAudioStreams] = useState<AudioStream[]>([
    {
      id: "chillhop-radio",
      type: "audioStream",
      title: "Chillhop Radio",
      description:
        "Relaxing lo-fi hip hop beats to study and chill to. Perfect for focus sessions or unwinding after a long day.",
      category: "Music",
      url: "https://streams.fluxfm.de/Chillhop/mp3-128/",
    },
    {
      id: "lofi-fruits",
      type: "audioStream",
      title: "Lofi Fruits Music",
      description:
        "Sweet and mellow lofi beats with fruity vibes. Ideal for creative work or casual listening sessions.",
      category: "Music",
      url: "https://listen.reyfm.de/lofi_320kbps.mp3",
    },
    {
      id: "bbc-world-service",
      type: "audioStream",
      title: "BBC World Service",
      description: "BBC World Service",
      category: "News",
      url: "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
    },
    {
      id: "somafm-groovesalad",
      type: "audioStream",
      title: "SomaFM – Groove Salad	",
      description: "Groovesalad",
      category: "Music",
      url: "https://ice2.somafm.com/groovesalad-128-mp3",
    },
    {
      id: "somafm-indiepop",
      type: "audioStream",
      title: "SomaFM – Indie Pop Rocks!",
      description: "Indie Pop Rocks!",
      category: "Music",
      url: "https://ice2.somafm.com/indiepop-128-mp3",
    },
  ]);

  const fetchRandomRadioStations = useCallback(
    async (limit: number = 30): Promise<AudioStream[]> => {
      try {
        // Using the stations by votes endpoint to get popular stations
        // This gives us a good mix of working stations
        const response = await randomRadioStations(limit);

        if (response.status !== 200) {
          return [];
        }

        const stations = response.data;

        // Create a Map to track unique IDs and URLs
        const uniqueStations = new Map<string, any>();
        const uniqueUrls = new Set<string>();

        // Filter and deduplicate stations - ONLY HTTPS URLs
        stations.forEach((station: any) => {
          const streamUrl = station.url_resolved || station.url;

          if (
            streamUrl &&
            station.name &&
            station.lastcheckok === 1 && // Only working stations
            streamUrl.startsWith("https://") && // ONLY HTTPS URLs
            !uniqueUrls.has(streamUrl) // Check for duplicate URLs
          ) {
            const stationId = `${station.changeuuid}`;
            if (!uniqueStations.has(stationId)) {
              uniqueStations.set(stationId, station);
              uniqueUrls.add(streamUrl);
            }
          }
        });

        // Transform the deduplicated stations to our AudioStream format
        const audioStreams: AudioStream[] = Array.from(
          uniqueStations.values()
        ).map((station: any) => ({
          id: `${station.changeuuid}`,
          type: "audioStream" as const,
          title: station.name,
          description: station.tags
            ? station.tags.split(",").slice(0, 3).join(", ")
            : station.country || "Radio Station",
          category: station.tags
            ? station.tags.split(",")[0]?.trim() || "Music"
            : "Music",
          url: (station.url_resolved || station.url).startsWith("https://")
            ? station.url_resolved || station.url
            : `/api/radio-proxy?url=${encodeURIComponent(
              station.url_resolved || station.url
            )}`,
          country: station.country,
          language: station.language,
          favicon: station.favicon,
        }));

        return audioStreams;
      } catch (error) {
        console.error("Error fetching random radio stations:", error);
        return [];
      }
    },
    []
  );

  const updateState = useCallback(
    (
      updates:
        | Partial<typeof state>
        | ((prev: typeof state) => Partial<typeof state>)
    ) => {
      setState((prev) => ({
        ...prev,
        ...(typeof updates === "function" ? updates(prev) : updates),
      }));
    },
    []
  );

  // Use a ref to track the latest settings to prevent stale reads
  const latestSettingsRef = useRef<Record<string, any>>({});

  // Update the ref whenever settings change
  useEffect(() => {
    const currentMeta = getAppSettings("music")?.meta || {};
    latestSettingsRef.current = currentMeta;
  }, [getAppSettings("music")?.meta]);

  // Type for settings that includes both initial settings and manual override fields
  type MusicSettings = Partial<typeof initialSettings> & {
    manualOverrideState?: "playing" | "paused" | null;
    manualOverrideAt?: number | undefined;
  };

  const updateMusicSettings = useCallback(
    (newSettings: MusicSettings) => {
      // Read from ref first (most recent), then fallback to getAppSettings
      // This ensures we're working with the latest state even if multiple updates happen
      const currentMeta = latestSettingsRef.current || getAppSettings("music")?.meta || {};

      // Shallow compare and early-exit if nothing changes to avoid render loops
      const currentMetaAny = currentMeta as Record<string, unknown>;
      const newSettingsAny = newSettings as Record<string, unknown>;
      const hasChange = Object.keys(newSettingsAny).some(
        (key) => currentMetaAny[key] !== newSettingsAny[key]
      );
      if (!hasChange) return;

      // Merge settings: preserve manualOverrideState and manualOverrideAt unless explicitly set
      const mergedSettings: Record<string, any> = {
        ...currentMeta,
        ...newSettings,
      };

      // Only preserve manual override if not being explicitly updated (check if key exists in newSettings)
      if (!("manualOverrideState" in newSettings)) {
        mergedSettings.manualOverrideState = currentMeta.manualOverrideState;
      }
      if (!("manualOverrideAt" in newSettings)) {
        mergedSettings.manualOverrideAt = currentMeta.manualOverrideAt;
      }

      // Update ref immediately to prevent stale reads in subsequent calls
      latestSettingsRef.current = mergedSettings;

      updateAppSettings("music", {
        meta: mergedSettings,
      });
    },
    [getAppSettings, updateAppSettings]
  );

  // Track explicit user intent to play/pause so automations (e.g., Pomodoro) can respect it
  const setManualPlaybackOverride = useCallback(
    (state: "playing" | "paused" | null) => {
      try {
        // Use updateMusicSettings to ensure atomic updates and prevent race conditions
        // Only update the manual override fields, preserving all other settings
        updateMusicSettings({
          manualOverrideState: state,
          manualOverrideAt: state !== null ? Date.now() : undefined,
        });
      } catch (e) {
        // best-effort
      }
    },
    [updateMusicSettings]
  );

  // Create a ref to store the latest playAudio function
  const playAudioRef = useRef<(audio: AudioType) => void>(() => { });
  const stopAudioRef = useRef<() => void>(() => { });
  // Audio system functions
  const computeBinauralBeatFrequencies = useCallback(
    (baseFrequency: number, beatFrequency: number) => {
      return {
        leftFrequency: baseFrequency - beatFrequency / 2,
        rightFrequency: baseFrequency + beatFrequency / 2,
      };
    },
    []
  );

  const pauseAudio = useCallback(
    async (isUserInitiated: boolean = false) => {
      try {
        // Check if this is a user-initiated pause and if musicWhileFocusing is enabled, disable it
        if (isUserInitiated && audioState.isPlaying) {
          const pomodoroSettings = getAppSettings("pomodoro")?.meta || {};
          const musicWhileFocusing =
            pomodoroSettings.musicWhileFocusing || false;

          if (musicWhileFocusing) {
            // User manually paused while musicWhileFocusing is enabled
            // Disable the feature
            updateAppSettings("pomodoro", {
              meta: {
                ...pomodoroSettings,
                musicWhileFocusing: false,
              },
            });
            // Set manual override to indicate user intent
            setManualPlaybackOverride("paused");
          }
        }

        const {
          leftOscillator,
          rightOscillator,
          oscillator,
          modulator,
          audioElement,
        } = audioContextRef.current;

        // Pause YouTube
        if (audioState.audioType === "youtube" && youtubePlayerRef.current) {
          try {
            const player = youtubePlayerRef.current;
            // Check if player is still valid before calling methods
            try {
              const playerState = player.getPlayerState?.();
              if (playerState !== undefined) {
                // Player is valid, pause it
                player.pauseVideo?.();
              }
            } catch (stateError) {
              // Player is invalid, skip pause
              console.warn("YouTube player is invalid, skipping pauseVideo");
            }
          } catch (e) {
            console.warn("Error pausing YouTube:", e);
          }
        }

        // Pause binaural oscillators
        if (leftOscillator) {
          leftOscillator.stop();
          audioContextRef.current.leftOscillator = null;
        }

        if (rightOscillator) {
          rightOscillator.stop();
          audioContextRef.current.rightOscillator = null;
        }

        // Pause isochronic oscillators
        if (oscillator) {
          oscillator.stop();
          audioContextRef.current.oscillator = null;
        }

        if (modulator) {
          modulator.stop();
          audioContextRef.current.modulator = null;
        }

        // Pause lofi audio
        if (audioElement) {
          audioElement.pause();
        }

        setAudioState((prev) => ({
          ...prev,
          isLoading: false,
          isPlaying: false,
          // Keep currentAudio and audioType so user can resume
        }));
      } catch (error) {
        console.error("Error pausing audio:", error);
      }
    },
    [
      audioState.audioType,
      audioState.isPlaying,
      toast,
      youtubePlayerRef,
      getAppSettings,
      updateAppSettings,
      setManualPlaybackOverride,
    ]
  );

  const stopAudio = useCallback(() => {
    try {
      const {
        audioContext,
        leftOscillator,
        rightOscillator,
        oscillator,
        modulator,
        audioElement,
      } = audioContextRef.current;

      // Stop YouTube player
      if (youtubePlayerRef.current) {
        try {
          // Check if player is still valid before calling methods
          const player = youtubePlayerRef.current;
          // Try to get player state to verify it's still valid
          try {
            const playerState = player.getPlayerState?.();
            if (playerState !== undefined) {
              // Player is valid, stop it
              player.stopVideo?.();
            }
          } catch (stateError) {
            // Player is invalid, skip stopVideo
            console.warn("YouTube player is invalid, skipping stopVideo");
          }

          // Try to destroy, but don't fail if it's already destroyed
          try {
            player.destroy?.();
          } catch (destroyError) {
            // Player might already be destroyed, that's okay
            console.warn("YouTube player already destroyed or invalid");
          }
        } catch (e) {
          console.warn("Error stopping YouTube:", e);
        }
        youtubePlayerRef.current = null;
      }

      // Stop binaural oscillators
      if (leftOscillator) {
        leftOscillator.stop();
        audioContextRef.current.leftOscillator = null;
      }

      if (rightOscillator) {
        rightOscillator.stop();
        audioContextRef.current.rightOscillator = null;
      }

      // Stop isochronic oscillators
      if (oscillator) {
        oscillator.stop();
        audioContextRef.current.oscillator = null;
      }

      if (modulator) {
        modulator.stop();
        audioContextRef.current.modulator = null;
      }

      // Stop lofi audio
      if (audioElement) {
        audioElement.pause();
        audioContextRef.current.audioElement = null;
      }

      // Close audio context
      if (audioContext) {
        audioContext.close();
        audioContextRef.current.audioContext = null;
      }

      // Clear all references
      audioContextRef.current.gainNode = null;
      audioContextRef.current.leftPanner = null;
      audioContextRef.current.rightPanner = null;
      audioContextRef.current.beatGain = null;

      // Clear the audio state completely when stopping
      setAudioState((prev) => ({
        ...prev,
        isLoading: false,
        isPlaying: false,
        currentAudio: null,
        audioType: null,
      }));

      // Update app settings to clear audio type
      updateMusicSettings({
        audioType: "music",
        currentAudio: null,
        youtubeVideoId: null, // Clear videoId when stopping
        audioIsPlaying: false,
      });

      // Clear manual override when stopping audio - allows Pomodoro to control again
      setManualPlaybackOverride(null);
    } catch (error) {
      console.error("Error stopping audio:", error);
    }
  }, [updateMusicSettings, youtubePlayerRef, setManualPlaybackOverride]);

  const playBinauralBeat = useCallback(
    async (beat: BinauralBeat) => {
      try {
        // Stop any existing audio
        stopAudio();

        // Stop any currently playing music
        if (audioRef.current && isPlaying) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
          setProgress(0);
        }

        // Initialize AudioContext
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        audioContextRef.current.audioContext = audioContext;

        // Ensure AudioContext is running (Firefox and others may start suspended)
        if (audioContext.state === "suspended") {
          try {
            await audioContext.resume();
          } catch (e) {
            // If resume fails, keep going without throwing to avoid breaking on Firefox
            toast({
              title:
                "Hey! seems like it something happened on the audio context",
              description: "Please try again",
              variant: "destructive",
            });
          }
        }

        // Create gain node for volume control
        const gainNode = audioContext.createGain();
        gainNode.gain.value = audioState.volume / 100;
        audioContextRef.current.gainNode = gainNode;

        // Create oscillators
        const leftOscillator = audioContext.createOscillator();
        const rightOscillator = audioContext.createOscillator();
        audioContextRef.current.leftOscillator = leftOscillator;
        audioContextRef.current.rightOscillator = rightOscillator;

        // Set frequencies
        const { leftFrequency, rightFrequency } =
          computeBinauralBeatFrequencies(
            beat.baseFrequency,
            beat.beatFrequency
          );
        leftOscillator.frequency.value = leftFrequency;
        rightOscillator.frequency.value = rightFrequency;

        // Set oscillator type to sine wave for smooth binaural beats
        leftOscillator.type = "sine";
        rightOscillator.type = "sine";

        // Create stereo panners
        const leftPanner = audioContext.createStereoPanner();
        const rightPanner = audioContext.createStereoPanner();
        leftPanner.pan.value = -1; // Full left
        rightPanner.pan.value = 1; // Full right
        audioContextRef.current.leftPanner = leftPanner;
        audioContextRef.current.rightPanner = rightPanner;

        // Connect the audio nodes
        leftOscillator.connect(leftPanner).connect(gainNode);
        rightOscillator.connect(rightPanner).connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Start the oscillators
        leftOscillator.start();
        rightOscillator.start();

        // Only update state if everything succeeded
        setAudioState((prev) => ({
          ...prev,
          isPlaying: true,
          currentAudio: beat,
          audioType: "binaural",
        }));

        // Update app settings with the new audio type
        updateMusicSettings({ audioType: "binaural", currentAudio: beat });

        // Clear manual override when starting new audio - allows Pomodoro to control
        setManualPlaybackOverride(null);
      } catch (error) {
        setAudioState((prev) => ({
          ...prev,
          isPlaying: false,
          currentAudio: beat,
          audioType: "binaural",
        }));

        // Clean up any partially created audio nodes
        const { audioContext } = audioContextRef.current;
        if (audioContext) {
          audioContextRef.current.audioContext = null;
          audioContextRef.current.gainNode = null;
          audioContextRef.current.leftOscillator = null;
          audioContextRef.current.rightOscillator = null;
          audioContextRef.current.leftPanner = null;
          audioContextRef.current.rightPanner = null;
        }
      }
    },
    [
      audioState.volume,
      computeBinauralBeatFrequencies,
      toast,
      stopAudio,
      isPlaying,
      updateMusicSettings,
      setManualPlaybackOverride,
    ]
  );

  const playIsochronicTone = useCallback(
    async (tone: IsochronicTone) => {
      try {
        // Stop any existing audio
        stopAudio();

        // Stop any currently playing music
        if (audioRef.current && isPlaying) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
          setProgress(0);
        }

        // Initialize AudioContext
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        audioContextRef.current.audioContext = audioContext;

        // Ensure AudioContext is running (Firefox and others may start suspended)
        if (audioContext.state === "suspended") {
          try {
            await audioContext.resume();
          } catch (e) {
            // If resume fails, keep going without throwing to avoid breaking on Firefox
            toast({
              title:
                "Hey! seems like it something happened on the audio context",
              description: "Please try again",
              variant: "destructive",
            });
          }
        }

        // Main gain node for volume control
        const gainNode = audioContext.createGain();
        gainNode.gain.value = audioState.volume / 100;
        audioContextRef.current.gainNode = gainNode;

        // Oscillator for the base tone
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = tone.baseFrequency;
        oscillator.type = tone.waveform;
        audioContextRef.current.oscillator = oscillator;

        // Gain node to create isochronic beats
        const beatGain = audioContext.createGain();
        beatGain.gain.value = 0; // Start with silence
        audioContextRef.current.beatGain = beatGain;

        // Oscillator for modulation
        const modulator = audioContext.createOscillator();
        modulator.frequency.value = tone.beatFrequency;
        modulator.type = "square"; // Square wave for on/off effect
        audioContextRef.current.modulator = modulator;

        // Modulator gain to adjust modulation depth
        const modulatorGain = audioContext.createGain();
        modulatorGain.gain.value = 0.5; // Modulation depth

        // Connect modulator to the beat gain node
        modulator.connect(modulatorGain).connect(beatGain.gain);

        // Connect oscillator through beat gain and main gain to destination
        oscillator
          .connect(beatGain)
          .connect(gainNode)
          .connect(audioContext.destination);

        // Start oscillators
        oscillator.start();
        modulator.start();

        // Only update state if everything succeeded
        setAudioState((prev) => ({
          ...prev,
          isPlaying: true,
          currentAudio: tone,
          audioType: "isochronic",
        }));

        // Update app settings with the new audio type
        updateMusicSettings({ audioType: "isochronic", currentAudio: tone });

        // Clear manual override when starting new audio - allows Pomodoro to control
        setManualPlaybackOverride(null);
      } catch (error) {
        setAudioState((prev) => ({
          ...prev,
          isPlaying: false,
          currentAudio: tone,
          audioType: "isochronic",
        }));

        // Clean up any partially created audio nodes
        const { audioContext } = audioContextRef.current;
        if (audioContext) {
          audioContextRef.current.audioContext = null;
          audioContextRef.current.gainNode = null;
          audioContextRef.current.oscillator = null;
          audioContextRef.current.modulator = null;
          audioContextRef.current.beatGain = null;
        }
      }
    },
    [
      audioState.volume,
      toast,
      stopAudio,
      isPlaying,
      updateMusicSettings,
      setManualPlaybackOverride,
    ]
  );

  const playAudioStream = useCallback(
    async (audioStream: AudioStream) => {
      try {
        // Stop any existing audio
        stopAudio();

        // Stop any currently playing music
        if (audioRef.current && isPlaying) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
          setProgress(0);
        }

        // Create audio element and store in audioContextRef
        const audioElement = new Audio(audioStream.url);
        audioElement.volume = audioState.volume / 100;
        audioElement.currentTime = 0;
        audioElement.preload = "auto";

        // Store in audioContextRef for your controller to use
        audioContextRef.current.audioElement = audioElement;

        // Update audio state with loading
        setAudioState((prev) => ({
          ...prev,
          isLoading: true,
          isPlaying: false,
          currentAudio: audioStream,
          audioType: "audioStream",
        }));

        // Update app settings
        updateMusicSettings({
          audioType: "audioStream",
          currentAudio: audioStream,
        });

        // Clear manual override when starting new audio stream - allows Pomodoro to control
        setManualPlaybackOverride(null);

        // Start loading and playing the audio
        audioElement.load();

        // Wait for the audio to be ready and then play it
        await new Promise((resolve, reject) => {
          const handleCanPlay = () => {
            audioElement.removeEventListener("canplay", handleCanPlay);
            audioElement.removeEventListener("error", handleError);
            resolve(true);
          };

          const handleError = (error: Event) => {
            audioElement.removeEventListener("canplay", handleCanPlay);
            audioElement.removeEventListener("error", handleError);
            reject(error);
          };

          audioElement.addEventListener("canplay", handleCanPlay);
          audioElement.addEventListener("error", handleError);
        });

        // Now play the audio
        await audioElement.play();

        // Update state to show it's playing and not loading
        setAudioState((prev) => ({
          ...prev,
          isLoading: false,
          isPlaying: true,
        }));
      } catch (error) {
        console.error("Error setting up audio stream:", error);
        setAudioState((prev) => ({
          ...prev,
          isLoading: false,
          isPlaying: false,
          currentAudio: audioStream,
          audioType: "audioStream",
        }));

        // Show user-friendly error message
        toast({
          title: "Cannot play radio station",
          description: audioStream.url.includes("/api/radio-proxy")
            ? "This station may not be available or the connection failed"
            : "This station may not be available",
          variant: "destructive",
        });
      }
    },
    [
      stopAudio,
      isPlaying,
      audioState.volume,
      updateMusicSettings,
      toast,
      setManualPlaybackOverride,
    ]
  );

  const playYouTubeAudio = useCallback(
    async (url: string) => {
      try {
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
          toast({
            title: "Invalid YouTube URL",
            description: "Please enter a valid YouTube video URL",
            variant: "destructive",
          });
          return;
        }

        if (
          audioState.audioType === "youtube" &&
          audioState.currentAudio &&
          audioState.currentAudio.type === "youtube" &&
          audioState.currentAudio.videoId !== videoId
        ) {
          // Stop any existing audio
          stopAudio();
        }

        // Stop any currently playing music
        if (audioRef.current && isPlaying) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
          setProgress(0);
        }

        // Reset YouTube progress
        setYoutubeProgressState({
          currentTime: 0,
          duration: 0,
          progress: 0,
          isLive: false,
        });

        // Fetch video info from YouTube oEmbed API
        let videoTitle = "YouTube Video";
        let videoAuthor = "YouTube";
        try {
          const oEmbedResponse = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
          );
          if (oEmbedResponse.ok) {
            const oEmbedData = await oEmbedResponse.json();
            videoTitle = oEmbedData.title || "YouTube Video";
            videoAuthor = oEmbedData.author_name || "YouTube";
          }
        } catch (e) {
          // Failed to fetch video info, use defaults
          console.warn("Failed to fetch YouTube video info:", e);
        }

        // Create YouTube audio object
        const youtubeAudio: YouTubeAudio = {
          id: `youtube-${videoId}`,
          type: "youtube",
          title: videoTitle,
          description: videoAuthor,
          category: "YouTube",
          videoId,
          url,
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        };

        // Update audio state
        setAudioState((prev) => ({
          ...prev,
          isLoading: true,
          isPlaying: false,
          currentAudio: youtubeAudio,
          audioType: "youtube",
        }));

        // Update app settings - save YouTube audio data and initial playing state
        updateMusicSettings({
          audioType: "youtube",
          currentAudio: youtubeAudio,
          youtubeVideoId: videoId, // Store videoId separately for easier restoration
          audioIsPlaying: true, // Set to true when starting YouTube audio
        });

        // Clear manual override when starting new YouTube audio - allows Pomodoro to control
        setManualPlaybackOverride(null);

        // The actual playback will be handled by the YouTube iframe component
        // We just need to update the state and let the component handle it

        // Safety timeout: Clear loading state after 10 seconds if player doesn't initialize
        // This prevents infinite loading if something goes wrong
        setTimeout(() => {
          setAudioState((prev) => {
            if (
              prev.audioType === "youtube" &&
              prev.isLoading &&
              !prev.isPlaying
            ) {
              return {
                ...prev,
                isLoading: false,
              };
            }
            return prev;
          });
        }, 10000);
      } catch (error) {
        console.error("Error playing YouTube audio:", error);
        toast({
          title: "Cannot play YouTube video",
          description: "An error occurred while trying to play the video",
          variant: "destructive",
        });
        setAudioState((prev) => ({
          ...prev,
          isLoading: false,
          isPlaying: false,
        }));
      }
    },
    [
      stopAudio,
      isPlaying,
      updateMusicSettings,
      toast,
      setManualPlaybackOverride,
    ]
  );

  const setYouTubePlayingState = useCallback(
    (isPlaying: boolean, isLoading: boolean = false) => {
      if (audioState.audioType === "youtube") {
        setAudioState((prev) => ({
          ...prev,
          isPlaying,
          isLoading,
        }));
        // Save playing state to settings for restoration
        updateMusicSettings({ audioIsPlaying: isPlaying });
      }
    },
    [audioState.audioType, updateMusicSettings]
  );

  const setYouTubeProgress = useCallback(
    (currentTime: number, duration: number, isLive: boolean = false) => {
      // For live streams, don't track time
      if (isLive) {
        setYoutubeProgressState({
          currentTime: 0,
          duration: 0,
          progress: 0,
          isLive: true,
        });
        return;
      }

      // Validate values - YouTube returns seconds, typical video is < 24 hours (86400 seconds)
      const validCurrentTime =
        typeof currentTime === "number" &&
          isFinite(currentTime) &&
          currentTime >= 0 &&
          currentTime < 86400
          ? currentTime
          : 0;
      const validDuration =
        typeof duration === "number" &&
          isFinite(duration) &&
          duration > 0 &&
          duration < 86400
          ? duration
          : 0;

      const progress =
        validDuration > 0 ? (validCurrentTime / validDuration) * 100 : 0;
      setYoutubeProgressState({
        currentTime: validCurrentTime,
        duration: validDuration,
        progress,
        isLive: false,
      });
    },
    []
  );

  const seekYouTube = useCallback(
    (percentage: number) => {
      if (youtubePlayerRef.current && audioState.audioType === "youtube") {
        try {
          const player = youtubePlayerRef.current;
          // Check if player is still valid before calling methods
          try {
            const playerState = player.getPlayerState?.();
            if (playerState !== undefined) {
              // Player is valid, seek
              const duration = player.getDuration?.() || 0;
              const seekTime = (percentage / 100) * duration;
              player.seekTo?.(seekTime, true);
              setYoutubeProgressState((prev) => ({
                ...prev,
                currentTime: seekTime,
                progress: percentage,
              }));
            }
          } catch (stateError) {
            // Player is invalid, skip seek
            console.warn("YouTube player is invalid, skipping seek");
          }
        } catch (e) {
          console.warn("Error seeking YouTube:", e);
        }
      }
    },
    [audioState.audioType]
  );

  const toggleVideoPlayer = useCallback(() => {
    setShowVideoPlayer((prev: boolean) => {
      const newValue = !prev;
      updateMusicSettings({ showVideoPlayer: newValue });
      return newValue;
    });
  }, [updateMusicSettings]);

  const playAudio = useCallback(
    (audio: AudioType) => {
      switch (audio.type) {
        case "binaural":
          playBinauralBeat(audio);
          break;
        case "isochronic":
          playIsochronicTone(audio);
          break;
        case "audioStream":
          playAudioStream(audio);
          break;
        case "youtube":
          playYouTubeAudio(audio.url);
          break;
        default:
          console.error("Unknown audio type:", audio);
      }
    },
    [playBinauralBeat, playIsochronicTone, playAudioStream, playYouTubeAudio]
  );

  // Update the refs when playAudio and stopAudio change
  useEffect(() => {
    playAudioRef.current = playAudio;
    stopAudioRef.current = stopAudio;
  }, [playAudio, stopAudio]);

  const resumeAudio = useCallback(async () => {
    if (!audioState.currentAudio || !audioState.audioType) {
      return;
    }

    try {
      const { audioElement, audioContext } = audioContextRef.current;
      if (audioState.audioType === "youtube") {
        // For YouTube, use the YouTube player ref
        if (youtubePlayerRef.current) {
          const player = youtubePlayerRef.current;
          const playerState = player.getPlayerState?.();
          try {
            if (playerState !== undefined) {
              setYouTubePlayingState(true, true);
              // Player is valid, play it
              player.playVideo?.();
              // Use setYouTubePlayingState to properly clear loading state
              setYouTubePlayingState(true, false);
            } else {
              // Player state is undefined, player is invalid
              // Try to reload with current URL if available
              if (
                audioState.currentAudio &&
                audioState.currentAudio.type === "youtube" &&
                audioState.currentAudio.url
              ) {
                await playYouTubeAudio(audioState.currentAudio.url);
              }
              // If no URL, ignore (don't do anything)
            }
          } catch (e) {
            console.log("Error resuming YouTube:", e);
          }
        } else {
          // Player not ready - could be another mount or player not initialized
          // Instead of trying to reload, just update state and let sync effects handle it
          setYouTubePlayingState(true, true);

          // Also wait a bit in case the main player is still initializing
          let attempt = 0;
          const tryPlayYouTube = async () => {
            if (youtubePlayerRef.current) {
              const player = youtubePlayerRef.current;
              const playerState = player.getPlayerState?.();
              if (playerState !== undefined) {
                player.playVideo?.();
                setYouTubePlayingState(true, false);
              } else if (attempt < 2) {
                // Try up to 3 times, including this
                attempt++;
                setTimeout(tryPlayYouTube, 500);
              }
            } else if (attempt < 2) {
              attempt++;
              setTimeout(tryPlayYouTube, 500);
            } else {
              if (
                audioState.currentAudio &&
                audioState.currentAudio.type === "youtube" &&
                audioState.currentAudio.url
              ) {
                await playYouTubeAudio(audioState.currentAudio.url);
                setYouTubePlayingState(true, false);
              }
            }
          };
          await tryPlayYouTube();
        }
      } else if (audioState.audioType === "audioStream" && audioElement) {
        // For audio streams, resume the existing paused element
        try {
          // Check if the element is ready to play
          if (audioElement.readyState >= 2) {
            // HAVE_CURRENT_DATA or higher
            await audioElement.play();
            setAudioState((prev) => ({
              ...prev,
              isLoading: false,
              isPlaying: true,
            }));
          } else {
            // If not ready, wait for it to be ready or recreate
            console.warn("Audio element not ready for resume, recreating...");
            if (audioState.currentAudio) {
              playAudio(audioState.currentAudio);
            }
          }
        } catch (error) {
          console.warn("Error resuming audio element:", error);
          // Fallback to recreating the audio
          if (audioState.currentAudio) {
            playAudio(audioState.currentAudio);
          }
        }
      } else if (
        audioState.audioType === "binaural" ||
        audioState.audioType === "isochronic"
      ) {
        // For oscillators, we need to recreate them since they can't be paused/resumed
        // But first check if audioContext is still valid
        if (audioContext && audioContext.state === "suspended") {
          await audioContext.resume();
        }

        // Recreate the audio since oscillators can't be paused/resumed
        if (audioState.currentAudio) {
          playAudio(audioState.currentAudio);
        }
      } else {
        // Fallback to recreating the audio
        if (audioState.currentAudio) {
          playAudio(audioState.currentAudio);
        }
      }
    } catch (error) {
      console.error("Error resuming audio:", error);
      // For YouTube, try to reload with current URL if available

      if (
        audioState.audioType === "youtube" &&
        audioState.currentAudio &&
        audioState.currentAudio.type === "youtube" &&
        audioState.currentAudio.url
      ) {
        await playYouTubeAudio(audioState.currentAudio.url);
        setYouTubePlayingState(true, false);
      }
      // If no URL or not YouTube, ignore (don't do anything)
    }
  }, [
    audioState.currentAudio,
    audioState.audioType,
    playAudio,
    playYouTubeAudio,
    toast,
    youtubePlayerRef,
    setYouTubePlayingState,
  ]);

  const updateAudioVolume = useCallback(
    async (value: number) => {
      setAudioState((prev) => ({
        ...prev,
        volume: value,
        // Auto-unmute when user sets volume above 0
        isMuted: value > 0 ? false : prev.isMuted,
      }));

      if (audioContextRef.current.gainNode) {
        audioContextRef.current.gainNode.gain.value = value / 100;
      }

      if (audioContextRef.current.audioElement) {
        audioContextRef.current.audioElement.volume = value / 100;
        if (value > 0) {
          audioContextRef.current.audioElement.muted = false;
        }
      }

      // Update YouTube player volume
      // Note: setVolume can be called at any time, no need to check player state
      if (youtubePlayerRef.current && audioState.audioType === "youtube") {
        try {
          const player = youtubePlayerRef.current;
          // Directly update volume - setVolume works regardless of player state
          player.setVolume?.(value);
          if (value > 0) {
            player.unMute?.();
          }
        } catch (e) {
          // Player might not be ready yet, but that's okay - volume will sync when ready
          console.warn("Error updating YouTube volume:", e);
        }
      }

      updateMusicSettings({
        audioVolume: value,
        isMuted: value > 0 ? false : undefined,
      });
    },
    [updateMusicSettings, audioState.audioType, toast, youtubePlayerRef]
  );

  const toggleAudioMute = useCallback(async () => {
    setAudioState((prev) => ({ ...prev, isMuted: !prev.isMuted }));

    // Regular audio mute
    if (audioContextRef.current.gainNode) {
      if (!audioState.isMuted) {
        // Muting
        audioContextRef.current.gainNode.gain.value = 0;
      } else {
        // Unmuting
        audioContextRef.current.gainNode.gain.value = audioState.volume / 100;
      }
    }

    if (audioContextRef.current.audioElement) {
      audioContextRef.current.audioElement.muted = !audioState.isMuted;
    }

    // YouTube mute toggle
    if (youtubePlayerRef.current && audioState.audioType === "youtube") {
      try {
        const player = youtubePlayerRef.current;
        // Check if player is still valid before calling methods
        try {
          const playerState = player.getPlayerState?.();
          if (playerState !== undefined) {
            // Player is valid, toggle mute
            if (!audioState.isMuted) {
              player.mute?.();
            } else {
              player.unMute?.();
            }
          }
        } catch (stateError) {
          // Player is invalid, skip mute toggle
          console.warn("YouTube player is invalid, skipping mute toggle");
        }
      } catch (e) {
        console.warn("Error toggling YouTube mute:", e);
      }
    }
  }, [
    audioState.isMuted,
    audioState.volume,
    audioState.audioType,
    toast,
    youtubePlayerRef,
  ]);

  // Legacy binaural beat methods for backward compatibility
  const playBinauralBeatLegacy = useCallback(
    (beat: BinauralBeat) => playAudio(beat),
    [playAudio]
  );

  const stopBinauralBeat = useCallback(() => stopAudio(), [stopAudio]);

  const updateBinauralVolume = useCallback(
    (value: number) => updateAudioVolume(value),
    [updateAudioVolume]
  );

  const toggleBinauralMute = useCallback(
    () => toggleAudioMute(),
    [toggleAudioMute]
  );

  // Helper function to unlink musicWhileFocusing when user manually pauses
  const unlinkMusicWhileFocusing = useCallback(() => {
    const pomodoroSettings = getAppSettings("pomodoro")?.meta || {};
    const musicWhileFocusing = pomodoroSettings.musicWhileFocusing || false;

    if (musicWhileFocusing) {
      // User manually paused - unlink the feature
      updateAppSettings("pomodoro", {
        meta: {
          ...pomodoroSettings,
          musicWhileFocusing: false,
        },
      });
      // Set manual override to indicate user intent
      setManualPlaybackOverride("paused");
    }
  }, [getAppSettings, updateAppSettings, setManualPlaybackOverride]);

  const togglePlay = useCallback((play?: boolean) => {

    // If any audio is playing, don't allow music controls
    if (audioState.currentAudio !== null) {
      if (audioState.isPlaying === play) return;

      if (audioState.isPlaying && !play) {
        // User manually paused (play === undefined means user clicked pause button)
        if (play === undefined) {
          // Unlink musicWhileFocusing when user manually pauses
          unlinkMusicWhileFocusing();
          // Pass true to indicate this is user-initiated
          pauseAudio(true);
        } else {
          // Programmatic pause (from pomodoro with play === false)
          pauseAudio(false);
        }
      } else {
        if (play === undefined) setManualPlaybackOverride("playing");
        resumeAudio();
      }

      return;
    }

    if (audioRef.current) {
      if (isPlaying === play) return;

      if (isPlaying || play === false) {
        // User manually paused (play === undefined means user clicked pause button)
        if (play === undefined) {
          // Unlink musicWhileFocusing when user manually pauses
          unlinkMusicWhileFocusing();
        }
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch((error) => {
          setIsPlaying(false);
        });
        if (play === undefined) setManualPlaybackOverride("playing");
      }
      setIsPlaying(!isPlaying);
    }
  }, [
    getAppSettings,
    audioState.currentAudio,
    audioState.isPlaying,
    isPlaying,
    unlinkMusicWhileFocusing,
    pauseAudio,
    resumeAudio,
    setManualPlaybackOverride,
    setIsPlaying,
  ]);

  const togglePlayMode = () => {
    if (playMode === "order") {
      updateState({ playMode: "random" });
      updateMusicSettings({ playMode: "random" });
    } else if (playMode === "random") {
      updateState({ playMode: "recursive" });
      updateMusicSettings({ playMode: "recursive" });
    } else if (playMode === "recursive") {
      updateState({ playMode: "order" });
      updateMusicSettings({ playMode: "order" });
    }
  };

  const seek = useCallback(
    async (percentage: number) => {
      // Regular audio seek
      if (audioRef.current) {
        const time = (percentage / 100) * audioRef.current.duration;
        audioRef.current.currentTime = time;
        setProgress(percentage);
      }
    },
    [audioState.audioType, audioState.currentAudio, toast]
  );

  const updateVolume = (value: number) => {
    if (audioRef.current) {
      audioRef.current.volume = value / 100;
      // Auto-unmute when user increases volume above 0
      if (isMuted && value > 0) {
        audioRef.current.muted = false;
        updateState({ volume: value, isMuted: false });
        updateMusicSettings({ volume: value, isMuted: false });
        return;
      }
      updateState({ volume: value });
      updateMusicSettings({ volume: value });
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      updateState({ isMuted: !isMuted });
      updateMusicSettings({ isMuted: !isMuted });
    }
  };

  const changeSong = async (songId: string) => {
    // Don't fetch if it's the same song
    if (currentSong?._id === songId) return;

    try {
      // Stop any currently playing audio
      if (audioState.audioType) {
        stopAudio();
      } else {
        // Clear audio type in settings when switching to music
        updateMusicSettings({ audioType: "music", currentAudio: null });
        // Clear manual override when switching to music - allows Pomodoro to control
        setManualPlaybackOverride(null);
      }
      // Stop current playback immediately for better UX
      updateOSSettings({ musicPlayer: true });

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.removeEventListener("canplay", () => { });
        audioRef.current.removeEventListener("error", () => { });
        audioRef.current.src = ""; // Clear the source
        setIsPlaying(false);
        setProgress(0);
      }

      // Show loading state
      setCurrentSong(
        (prev) =>
        ({
          ...prev,
          isLoading: true,
        } as ZSong)
      );

      const response = await getSingleSongAPI(songId);

      if (!response.data.success) {
        throw new Error("Failed to fetch song data");
      }

      // Create and pre-load the audio
      const newAudio = new Audio(getMediaUrl(response.data.data.audioUrl));
      newAudio.volume = volume / 100;
      newAudio.currentTime = 0;
      newAudio.preload = "auto";

      // Wait for audio to be loaded enough to play
      await new Promise((resolve, reject) => {
        const onCanPlay = () => {
          newAudio.removeEventListener("canplay", onCanPlay);
          resolve(true);
        };
        const onError = (error: Event) => {
          newAudio.removeEventListener("error", onError);
          reject(error);
        };

        newAudio.addEventListener("canplay", onCanPlay);
        newAudio.addEventListener("error", onError);
        newAudio.load();
      });

      // Update the ref with new audio element
      audioRef.current = newAudio;

      setCurrentSong({
        ...response.data.data,
        isLoading: false,
      });

      // Start playing
      try {
        if (audioRef.current) {
          await audioRef.current.play();
          setIsPlaying(true);
        }
      } catch (playError) {
        console.error("Error playing audio:", playError);
        throw playError;
      }
    } catch (error) {
      console.error("Error changing song:", error);
      setCurrentSong(
        (prev) =>
        ({
          ...prev,
          isLoading: false,
          error: "Failed to load song",
        } as ZSong)
      );
    }
  };

  const handlePlaylists = useCallback(async () => {
    try {
      const playlistsRaw = await getPlaylistsAPI();
      setPlaylists(playlistsRaw.data.data);
      return playlistsRaw;
    } catch (error) {
      console.error("Error fetching playlists:", error);
    }
  }, [toast]);

  // Function to determine the next song based on play mode
  const getNextSongId = useCallback(() => {
    if (!currentPlaylist?.songs || currentPlaylist.songs.length === 0)
      return null;

    const currentSongIndex = currentPlaylist.songs.findIndex(
      (song) => song.song._id === currentSong?._id
    );

    // If in recursive mode, don't need to preload as we're replaying the same song
    if (playMode === "recursive") {
      return null;
    }

    let nextSongIndex;
    switch (playMode) {
      case "random":
        do {
          nextSongIndex = Math.floor(
            Math.random() * currentPlaylist.songs.length
          );
        } while (
          nextSongIndex === currentSongIndex &&
          currentPlaylist.songs.length > 1
        );
        break;

      case "order":
        nextSongIndex = currentSongIndex + 1;
        if (nextSongIndex >= currentPlaylist.songs.length) {
          nextSongIndex = 0;
        }
        break;

      default:
        nextSongIndex = 0;
    }

    return currentPlaylist.songs[nextSongIndex].song._id;
  }, [currentPlaylist, currentSong, playMode]);

  // Modified handlePlayNextSong
  const handlePlayNextSong = useCallback(() => {
    // If any audio is playing, stop it first
    if (audioState.audioType) {
      stopAudio();
      // Don't return here - allow the function to continue and play the next song
    } else {
      // Clear audio type in settings when switching to music
      updateMusicSettings({ audioType: "music", currentAudio: null });
    }

    if (playMode === "recursive") {
      // Just restart the current song
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    if (nextSong && preloadedAudio && !isPreloading) {
      // Update current song in state without fetching
      setCurrentSong(nextSong);

      // Switch to the preloaded audio
      const oldAudio = audioRef.current;
      // Clean up old audio
      if (oldAudio) {
        oldAudio.pause();
        oldAudio.src = "";
      }

      // Start playing the new audio
      preloadedAudio.play();
      preloadedAudio.currentTime = 0;
      setIsPlaying(true);

      audioRef.current = preloadedAudio;
      // Clear preloaded audio (it will trigger useEffect to load the next song)
      setPreloadedAudio(null);
    }
  }, [
    audioState.audioType,
    updateMusicSettings,
    playMode,
    audioRef,
    nextSong,
    preloadedAudio,
    isPreloading,
    setCurrentSong,
    stopAudio,
  ]);

  const handlePlaylistsLoad = useCallback(
    async (playlistId?: string) => {
      try {
        const targetPlaylistId = playlistId || currentPlaylistId || "";

        // Check if this is the library (not a playlist)
        // Library should not be fetched as a playlist
        if (
          targetPlaylistId === "music-library" ||
          targetPlaylistId === "library"
        ) {
          // Library is not a playlist, so we should use getLibrarySongsAPI instead
          // Don't set currentPlaylist for library - it should be handled separately
          return null;
        }

        // If playlistId is empty, don't try to fetch
        if (!targetPlaylistId) {
          return null;
        }

        // Check if playlist is already loaded
        if (loadedPlaylists.has(targetPlaylistId)) {
          const cachedPlaylist = loadedPlaylists.get(targetPlaylistId);
          if (cachedPlaylist) {
            setCurrentPlaylist(cachedPlaylist);
            return { data: { data: cachedPlaylist } };
          }
        }

        const playlistsRaw = await getSinglePlaylistAPI(targetPlaylistId);
        const playlist = playlistsRaw.data.data;

        // Cache the loaded playlist
        setLoadedPlaylists((prev) => {
          const newMap = new Map(prev);
          newMap.set(targetPlaylistId, playlist);
          return newMap;
        });

        setCurrentPlaylist(playlist);

        return playlistsRaw;
      } catch (error) {
        console.error("Error fetching playlists:", error);
      }
    },
    [currentPlaylistId, loadedPlaylists]
  );

  const handleSongLoad = useCallback(
    async (songId?: string) => {
      try {
        // Show loading state
        setCurrentSong(
          (prev) =>
          ({
            ...prev,
            isLoading: true,
          } as ZSong)
        );
        const response = await getSingleSongAPI(songId || "");

        if (!response.data.success) {
          throw new Error("Failed to fetch song data");
        }

        // Create and pre-load the audio
        const newAudio = new Audio(getMediaUrl(response.data.data.audioUrl));
        newAudio.volume = volume / 100;
        newAudio.currentTime = 0;
        newAudio.preload = "auto";

        // Wait for audio to be loaded enough to play
        await new Promise((resolve, reject) => {
          const onCanPlay = () => {
            newAudio.removeEventListener("canplay", onCanPlay);
            resolve(true);
          };
          const onError = (error: Event) => {
            newAudio.removeEventListener("error", onError);
            reject(error);
          };

          newAudio.addEventListener("canplay", onCanPlay);
          newAudio.addEventListener("error", onError);
          newAudio.load();
        });

        // Update the ref with new audio element
        audioRef.current = newAudio;
        setCurrentSong({
          ...response.data.data,
          isLoading: false,
        });

        return response;
      } catch (error) {
        console.error("Error fetching song:", error);
      }
    },
    [volume]
  );

  const handleSwitchPlaylist = useCallback(
    async (playlistId: string) => {
      // Stop any currently playing audio when switching playlists
      if (audioState.audioType) {
        stopAudio();
      } else {
        // Clear audio type in settings when switching to music
        updateMusicSettings({ audioType: "music", currentAudio: null });
      }
      updateState({ currentPlaylistId: playlistId });
      updateMusicSettings({ currentPlaylistId: playlistId });
      await handlePlaylistsLoad(playlistId);
    },
    [
      audioState.audioType,
      updateMusicSettings,
      updateState,
      handlePlaylistsLoad,
      stopAudio,
    ]
  );

  const initialLoad = useCallback(async () => {
    // Don't fetch random radio stations in development mode
    const isDevelopment = process.env.NODE_ENV === "development";

    const [playlists, playlist, song] = await Promise.all([
      handlePlaylists(),
      handlePlaylistsLoad(currentPlaylistId || ""),
      handleSongLoad(currentSongId || ""),
    ]);

    // Only fetch radio stations in production
    if (!isDevelopment) {
      const radioStations = await fetchRandomRadioStations(30);

      // Deduplicate when combining existing and new audio streams
      setAudioStreams((prev) => {
        const existingIds = new Set(prev.map((stream) => stream.id));
        const existingUrls = new Set(prev.map((stream) => stream.url));

        const newStreams = radioStations.filter(
          (stream) =>
            !existingIds.has(stream.id) && !existingUrls.has(stream.url)
        );

        return [...prev, ...newStreams];
      });
    }
  }, [
    handlePlaylists,
    handlePlaylistsLoad,
    handleSongLoad,
    fetchRandomRadioStations,
    setAudioStreams,
    currentPlaylistId,
    currentSongId,
  ]);

  useEffect(() => {
    if (!currentSong || !audioRef.current || !audioRef.current.src) {
      return;
    }

    const currentAudio = audioRef.current;
    let isEffectActive = true; // Flag to track if effect is still active

    const handleTimeUpdate = () => {
      try {
        if (currentAudio) {
          const percentage =
            (currentAudio.currentTime / currentAudio.duration) * 100;
          setCurrentTime(currentAudio.currentTime);
          setProgress(percentage);
        }
      } catch (error) {
        console.error("Error updating time:", error);
      }
    };

    const handleEnded = () => {
      try {
        setIsPlaying(false);
        setProgress(0);
        handlePlayNextSong();
      } catch (error) {
        console.error("Error handling song end:", error);
      }
    };

    const handleCanPlay = async () => {
      if (isEffectActive && isPlaying) {
        try {
          await currentAudio.play();
        } catch (error) {
          console.error("Error during auto-play:", error);
          if (isEffectActive) {
            setIsPlaying(false);
          }
        }
      }
    };

    // Set up event listeners
    currentAudio.addEventListener("timeupdate", handleTimeUpdate);
    currentAudio.addEventListener("ended", handleEnded);
    currentAudio.addEventListener("canplay", handleCanPlay);

    return () => {
      isEffectActive = false;

      if (currentAudio) {
        currentAudio.removeEventListener("timeupdate", handleTimeUpdate);
        currentAudio.removeEventListener("ended", handleEnded);
        currentAudio.removeEventListener("canplay", handleCanPlay);
      }
    };
  }, [currentSong, isPlaying, handlePlayNextSong]);

  // Preload next song whenever current song changes
  useEffect(() => {
    let isSubscribed = true; // For cleanup/prevent memory leaks
    const audioPreload = new Audio(); // Reuse audio instance

    const preloadNextSong = async (retryCount = 0) => {
      try {
        setIsPreloading(true);
        const nextSongId = getNextSongId();

        if (!nextSongId) {
          setIsPreloading(false);
          return;
        }
        const {
          data: { data: songData },
        } = await getSingleSongAPI(nextSongId);

        if (!isSubscribed) return;

        // Preload audio
        const audioPreload = new Audio(getMediaUrl(songData.audioUrl));
        audioPreload.volume = volume / 100;
        audioPreload.preload = "auto";

        setPreloadedAudio(audioPreload);

        // Wait for the audio to be ready to play through
        await new Promise((resolve, reject) => {
          const onCanPlayThrough = () => {
            audioPreload.removeEventListener("error", onError);
            resolve(true);
          };

          const onError = (error: Event) => {
            audioPreload.removeEventListener(
              "canplaythrough",
              onCanPlayThrough
            );
            reject(error);
          };

          audioPreload.addEventListener("canplaythrough", onCanPlayThrough, {
            once: true,
          });
          audioPreload.addEventListener("error", onError);
        });

        // Now the audio is ready, we can safely set the states
        setNextSong(songData);
        setPreloadedAudio(audioPreload);
      } catch (error) {
        console.error("Error preloading next song:", error);

        // Retry logic
        if (retryCount < PRELOAD_CONFIG.retryAttempts && isSubscribed) {
          setTimeout(() => {
            preloadNextSong(retryCount + 1);
          }, PRELOAD_CONFIG.retryDelay);
        }
      } finally {
        if (isSubscribed) {
          setIsPreloading(false);
        }
      }
    };

    preloadNextSong();

    // Cleanup function
    return () => {
      isSubscribed = false;
      audioPreload.src = ""; // Clear audio source
      audioPreload.remove(); // Remove audio element
    };
  }, [currentSong, playMode, getNextSongId, volume]);

  useEffect(() => {
    if (currentSong) {
      updateState({ currentSongId: currentSong._id });
      updateMusicSettings({ currentSongId: currentSong._id });
    }
  }, [currentSong, updateState, updateMusicSettings]);

  useEffect(() => {
    initialLoad();
  }, []);

  // Custom frequency methods
  const updateCustomBinauralFrequencies = useCallback(
    (baseFrequency: number, beatFrequency: number) => {
      setAudioState((prev) => ({
        ...prev,
        customFrequencies: {
          ...prev.customFrequencies,
          binaural: {
            baseFrequency,
            beatFrequency,
          },
        },
      }));

      // Save to settings
      updateMusicSettings({
        customBinauralFrequencies: {
          baseFrequency,
          beatFrequency,
        },
      });
    },
    [updateMusicSettings]
  );

  const updateCustomIsochronicFrequencies = useCallback(
    (
      baseFrequency: number,
      beatFrequency: number,
      waveform: OscillatorType
    ) => {
      setAudioState((prev) => ({
        ...prev,
        customFrequencies: {
          ...prev.customFrequencies,
          isochronic: {
            baseFrequency,
            beatFrequency,
            waveform,
          },
        },
      }));

      // Save to settings
      updateMusicSettings({
        customIsochronicFrequencies: {
          baseFrequency,
          beatFrequency,
          waveform,
        },
      });
    },
    [updateMusicSettings]
  );

  const playCustomBinauralBeat = useCallback(() => {
    const customBeat: BinauralBeat = {
      id: "custom-binaural",
      type: "binaural",
      title: "Custom Binaural Beat",
      description: `Custom ${audioState.customFrequencies.binaural.beatFrequency}Hz beat`,
      category: "Custom",
      baseFrequency: audioState.customFrequencies.binaural.baseFrequency,
      beatFrequency: audioState.customFrequencies.binaural.beatFrequency,
    };
    playAudio(customBeat);
  }, [audioState.customFrequencies.binaural, playAudio]);

  const playCustomIsochronicTone = useCallback(() => {
    const customTone: IsochronicTone = {
      id: "custom-isochronic",
      type: "isochronic",
      title: "Custom Isochronic Tone",
      description: `Custom ${audioState.customFrequencies.isochronic.beatFrequency}Hz tone`,
      category: "Custom",
      baseFrequency: audioState.customFrequencies.isochronic.baseFrequency,
      beatFrequency: audioState.customFrequencies.isochronic.beatFrequency,
      waveform: audioState.customFrequencies.isochronic.waveform,
    };
    playAudio(customTone);
  }, [audioState.customFrequencies.isochronic, playAudio]);

  // Library songs functions
  const loadLibrarySongs = useCallback(async () => {
    if (!userId) {
      return;
    }

    try {
      setIsLibraryLoading(true);
      const response = await getLibrarySongsAPI(1, LIBRARY_SONGS_PER_PAGE);
      setLibrarySongs(response.data.data);
      setCurrentLibraryPage(1);
      setHasMoreLibrary(response.data.data.length === LIBRARY_SONGS_PER_PAGE);
    } catch (error: any) {
      console.error("Error loading library songs:", error);
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to load library songs",
        variant: "destructive",
      });
    } finally {
      setIsLibraryLoading(false);
    }
  }, [userId, toast, LIBRARY_SONGS_PER_PAGE]);

  const loadMoreLibrarySongs = useCallback(async () => {
    if (!userId || isLoadingMoreLibrary || !hasMoreLibrary) {
      return;
    }

    try {
      setIsLoadingMoreLibrary(true);
      const nextPage = currentLibraryPage + 1;
      const response = await getLibrarySongsAPI(
        nextPage,
        LIBRARY_SONGS_PER_PAGE
      );

      if (response.data.data.length < LIBRARY_SONGS_PER_PAGE) {
        setHasMoreLibrary(false);
      }

      setLibrarySongs((prev) => [...prev, ...response.data.data]);
      setCurrentLibraryPage(nextPage);
    } catch (error: any) {
      console.error("Error loading more library songs:", error);
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to load more library songs",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMoreLibrary(false);
    }
  }, [
    userId,
    isLoadingMoreLibrary,
    hasMoreLibrary,
    currentLibraryPage,
    toast,
    LIBRARY_SONGS_PER_PAGE,
  ]);

  // Load genres
  const loadGenres = useCallback(async () => {
    if (genres.length > 0) {
      return;
    }

    try {
      setIsGenreLoading(true);
      const response = await getGenreAPI();
      setGenres(response.data.data);
    } catch (error: any) {
      console.error("Error loading genres:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load genres",
        variant: "destructive",
      });
    } finally {
      setIsGenreLoading(false);
    }
  }, [genres.length, toast]);
  // Load library songs filtered by genre
  const loadLibrarySongsByGenre = useCallback(
    async (
      genreId: string,
      page: number = 1,
      limit: number = LIBRARY_SONGS_PER_PAGE
    ) => {
      if (!userId) {
        return;
      }

      try {
        setIsLibraryLoading(true);
        const response = await getHomeSongsAPI(page, limit, genreId);

        // Convert ZHomeSong[] to ZSong[] by casting (ZHomeSong is a subset of ZSong)
        const songs = response.data.data as ZSong[];

        setGenreLibrarySongs((prev) => {
          const newMap = new Map(prev);
          // If it's the first page, replace; otherwise append
          if (page === 1) {
            newMap.set(genreId, songs);
          } else {
            const existingSongs = prev.get(genreId) || [];
            newMap.set(genreId, [...existingSongs, ...songs]);
          }
          return newMap;
        });
      } catch (error: any) {
        console.error("Error loading library songs by genre:", error);
        toast({
          title: "Error",
          description:
            error.response?.data?.message ||
            "Failed to load songs for this genre",
          variant: "destructive",
        });
      } finally {
        setIsLibraryLoading(false);
      }
    },
    [userId, toast, LIBRARY_SONGS_PER_PAGE]
  );

  const value = {
    isPlaying,
    currentSong,
    playlists,
    currentPlaylistId,
    currentPlaylist,
    loadedPlaylists,
    currentTime,
    isMuted,
    progress,
    volume,
    handleSwitchPlaylist,
    handlePlaylistsLoad,
    handlePlayNextSong,
    togglePlay,
    seek,
    updateVolume,
    toggleMute,
    changeSong,
    togglePlayMode,
    playMode,
    // Legacy binaural beats methods for backward compatibility
    playBinauralBeat: playBinauralBeatLegacy,
    stopBinauralBeat,
    updateBinauralVolume,
    toggleBinauralMute,
    isBinauralPlaying: audioState.audioType === "binaural",
    currentBinauralBeat: audioState.currentAudio as BinauralBeat | null,
    binauralVolume: audioState.volume,
    isBinauralMuted: audioState.isMuted,
    // Audio system state
    audioState,
    binauralBeats,
    isochronicTones,
    audioStreams,
    // Audio system methods
    playAudio,
    pauseAudio,
    stopAudio,
    resumeAudio,
    updateAudioVolume,
    toggleAudioMute,
    setManualPlaybackOverride,
    fetchRandomRadioStations,
    // Custom frequency methods
    updateCustomBinauralFrequencies,
    updateCustomIsochronicFrequencies,
    playCustomBinauralBeat,
    playCustomIsochronicTone,
    // YouTube methods
    playYouTubeAudio,
    youtubePlayerRef,
    setYouTubePlayingState,
    youtubeProgress,
    setYouTubeProgress,
    seekYouTube,
    // Video player visibility
    showVideoPlayer,
    toggleVideoPlayer,
    // Library songs
    librarySongs,
    isLibraryLoading,
    isLoadingMoreLibrary,
    hasMoreLibrary,
    loadLibrarySongs,
    loadMoreLibrarySongs,
    // Genres
    genres,
    isGenreLoading,
    loadGenres,
    // Genre-filtered library songs
    genreLibrarySongs,
    loadLibrarySongsByGenre,
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  );
};
