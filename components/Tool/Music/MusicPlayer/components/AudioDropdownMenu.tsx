import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ArrowRightLeft,
  AudioLines,
  Headphones,
  ListMusic,
  MoreVertical,
  Music,
  RefreshCcw,
  Waves,
  Youtube,
  Library,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CustomFrequencyDropdownItem from "./CustomFrequencyDropdownItem";
import YouTubeDropdownItem from "./YouTubeDropdownItem";
import { useMusicPlayer } from "../providers/musicProvider";
import { getMediaUrl } from "$/utils";

interface AudioDropdownMenuProps {
  triggerClassName?: string;
  contentClassName?: string;
  textClassName?: string;
  iconSize?: string;
}

// Library song item component with image fallback
const LibrarySongItem: React.FC<{
  song: any;
  isCurrentSong: boolean;
  onClick: () => void;
  textClassName: string;
}> = ({ song, isCurrentSong, onClick, textClassName }) => {
  const [imageError, setImageError] = useState(false);
  const showImage = song.cover && !imageError;

  return (
    <DropdownMenuItem
      onClick={onClick}
      className={cn(
        isCurrentSong
          ? "bg-accent text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground"
          : "text-foreground"
      )}
    >
      {showImage ? (
        <img
          src={getMediaUrl(song.cover)}
          alt={song.title}
          className="mr-2 h-8 w-8 flex-shrink-0 rounded object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <Music className="mr-2 h-3 w-3 flex-shrink-0" />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <span
          className={cn(
            "font-medium truncate",
            isCurrentSong
              ? "text-green-300 dark:text-green-500"
              : "text-foreground"
          )}
        >
          {song.title}
        </span>
        {song.artist && song.artist.length > 0 && (
          <span
            className={cn(
              "text-xs truncate",
              isCurrentSong ? "text-accent-foreground" : "text-muted-foreground"
            )}
          >
            {song.artist.join(", ")}
          </span>
        )}
      </div>
      {isCurrentSong && (
        <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
      )}
    </DropdownMenuItem>
  );
};

const AudioDropdownMenu: React.FC<AudioDropdownMenuProps> = ({
  triggerClassName,
  contentClassName,
  textClassName = "text-foreground",
  iconSize = "h-4 w-4",
}) => {
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(
    null
  );
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(false);
  const [selectedLibraryGenre, setSelectedLibraryGenre] = useState<
    string | null
  >(null);
  const [expandedGenreId, setExpandedGenreId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const libraryScrollRef = useRef<HTMLDivElement>(null);
  const libraryObserverRef = useRef<HTMLDivElement>(null);
  const {
    currentSong,
    playlists,
    currentPlaylistId,
    handleSwitchPlaylist,
    currentPlaylist,
    loadedPlaylists,
    changeSong,
    handlePlaylistsLoad,
    binauralBeats,
    isochronicTones,
    audioStreams,
    playAudio,
    pauseAudio,
    stopAudio,
    resumeAudio,
    audioState,
    playCustomBinauralBeat,
    playCustomIsochronicTone,
    librarySongs,
    isLibraryLoading,
    isLoadingMoreLibrary,
    hasMoreLibrary,
    loadLibrarySongs,
    loadMoreLibrarySongs,
    genres,
    isGenreLoading,
    loadGenres,
    genreLibrarySongs,
    loadLibrarySongsByGenre,
  } = useMusicPlayer();

  // Load genres when library is expanded
  useEffect(() => {
    if (isLibraryExpanded && genres.length === 0 && !isGenreLoading) {
      loadGenres();
    }
  }, [isLibraryExpanded, genres.length, isGenreLoading, loadGenres]);

  // Load library songs when library is first expanded
  useEffect(() => {
    if (
      isLibraryExpanded &&
      selectedLibraryGenre === null &&
      librarySongs.length === 0 &&
      !isLibraryLoading
    ) {
      loadLibrarySongs();
    }
  }, [
    isLibraryExpanded,
    selectedLibraryGenre,
    librarySongs.length,
    isLibraryLoading,
    loadLibrarySongs,
  ]);

  // Intersection observer for endless scrolling
  useEffect(() => {
    if (!libraryObserverRef.current || !isLibraryExpanded || !isDropdownOpen) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreLibrary &&
          !isLoadingMoreLibrary
        ) {
          loadMoreLibrarySongs();
        }
      },
      {
        root: libraryScrollRef.current,
        rootMargin: "50px",
        threshold: 0.1,
      }
    );

    const currentObserver = libraryObserverRef.current;
    observer.observe(currentObserver);

    return () => {
      observer.disconnect();
    };
  }, [
    isLibraryExpanded,
    isDropdownOpen,
    hasMoreLibrary,
    isLoadingMoreLibrary,
    loadMoreLibrarySongs,
  ]);

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-fit w-fit", triggerClassName)}
        >
          <MoreVertical className={cn(iconSize)} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn("w-52", contentClassName)}>
        <DropdownMenuLabel className={textClassName}>
          {audioState.audioType
            ? `${
                audioState.audioType.charAt(0).toUpperCase() +
                audioState.audioType.slice(1)
              } Audio`
            : currentPlaylist?.name || "Playlist"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            handlePlaylistsLoad();
          }}
          className={textClassName}
        >
          <RefreshCcw className="h-3 w-3 mr-2" />
          Reload List
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={textClassName}>
            <Headphones className="w-3 h-3 mr-2" />
            <span>Binaural Beats</span>
            {audioState.audioType === "binaural" && (
              <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className={cn(
                "w-64 max-h-[400px] overflow-y-auto customScrollbar2",
                contentClassName
              )}
            >
              {audioState.audioType === "binaural" && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      audioState.isPlaying ? pauseAudio(true) : resumeAudio()
                    }
                    className={textClassName}
                  >
                    <Headphones className="mr-2 h-3 w-3" />
                    <span>
                      {audioState.isPlaying ? "Pause" : "Resume"} Binaural Beat
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={stopAudio}
                    className="text-destructive focus:text-destructive"
                  >
                    <Headphones className="mr-2 h-3 w-3" />
                    <span>Stop Binaural Beat</span>
                  </DropdownMenuItem>
                </>
              )}
              <CustomFrequencyDropdownItem
                type="binaural"
                contentClassName={contentClassName}
                parentDropdownOpen={isDropdownOpen}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={playCustomBinauralBeat}
                className={
                  audioState.currentAudio?.id === "custom-binaural"
                    ? "bg-accent text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground"
                    : textClassName
                }
              >
                <Music className="mr-2 h-3 w-3 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium">Custom Binaural Beat</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      audioState.currentAudio?.id === "custom-binaural"
                        ? "text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {audioState.customFrequencies.binaural.baseFrequency} Hz
                    base, {audioState.customFrequencies.binaural.beatFrequency}{" "}
                    Hz beat
                  </span>
                </div>
                {audioState.currentAudio?.id === "custom-binaural" && (
                  <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
                )}
              </DropdownMenuItem>
              {binauralBeats.map((beat) => (
                <DropdownMenuItem
                  key={beat.id}
                  onClick={() => playAudio(beat)}
                  className={
                    audioState.currentAudio?.id === beat.id
                      ? "bg-accent text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground"
                      : textClassName
                  }
                >
                  <Music className="mr-2 h-3 w-3 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-medium">{beat.title}</span>
                    <span
                      className={cn(
                        "text-xs font-normal",
                        audioState.currentAudio?.id === beat.id
                          ? "text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {beat.description}
                    </span>
                  </div>
                  {audioState.currentAudio?.id === beat.id && (
                    <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={textClassName}>
            <Waves className="w-3 h-3 mr-2" />
            <span>Isochronic Tones</span>
            {audioState.audioType === "isochronic" && (
              <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className={cn(
                "w-64 max-h-[400px] overflow-y-auto customScrollbar2",
                contentClassName
              )}
            >
              {audioState.audioType === "isochronic" && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      audioState.isPlaying ? pauseAudio(true) : resumeAudio()
                    }
                    className={textClassName}
                  >
                    <Waves className="mr-2 h-3 w-3 flex-shrink-0" />
                    <span>
                      {audioState.isPlaying ? "Pause" : "Resume"} Isochronic
                      Tone
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={stopAudio}
                    className="text-destructive focus:text-destructive"
                  >
                    <Waves className="mr-2 h-3 w-3" />
                    <span>Stop Isochronic Tone</span>
                  </DropdownMenuItem>
                </>
              )}
              <CustomFrequencyDropdownItem
                type="isochronic"
                contentClassName={contentClassName}
                parentDropdownOpen={isDropdownOpen}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={playCustomIsochronicTone}
                className={
                  audioState.currentAudio?.id === "custom-isochronic"
                    ? "bg-accent text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground"
                    : textClassName
                }
              >
                <Waves className="mr-2 h-3 w-3 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium">Custom Isochronic Tone</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      audioState.currentAudio?.id === "custom-isochronic"
                        ? "text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {audioState.customFrequencies.isochronic.baseFrequency} Hz
                    base,{" "}
                    {audioState.customFrequencies.isochronic.beatFrequency} Hz
                    beat
                  </span>
                </div>
                {audioState.currentAudio?.id === "custom-isochronic" && (
                  <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
                )}
              </DropdownMenuItem>
              {isochronicTones.map((tone) => (
                <DropdownMenuItem
                  key={tone.id}
                  onClick={() => playAudio(tone)}
                  className={
                    audioState.currentAudio?.id === tone.id
                      ? "bg-accent text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground"
                      : textClassName
                  }
                >
                  <Waves className="mr-2 h-3 w-3" />
                  <div className="flex flex-col">
                    <span className="font-medium">{tone.title}</span>
                    <span
                      className={cn(
                        "text-xs font-normal",
                        audioState.currentAudio?.id === tone.id
                          ? "text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {tone.description}
                    </span>
                  </div>
                  {audioState.currentAudio?.id === tone.id && (
                    <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={textClassName}>
            <AudioLines className="w-3 h-3 mr-2" />
            <span>Audio Stream</span>
            {audioState.audioType === "audioStream" && (
              <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className={cn(
                "w-64 max-h-[400px] overflow-y-auto customScrollbar2",
                contentClassName
              )}
            >
              {audioState.audioType === "audioStream" && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      audioState.isPlaying ? pauseAudio(true) : resumeAudio()
                    }
                    className={textClassName}
                  >
                    <AudioLines className="mr-2 h-3 w-3" />
                    <span>
                      {audioState.isPlaying ? "Pause" : "Resume"} Audio Stream
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={stopAudio}
                    className="text-destructive focus:text-destructive"
                  >
                    <AudioLines className="mr-2 h-3 w-3" />
                    <span>Stop Audio Stream</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {audioStreams.map((audioStream) => (
                <DropdownMenuItem
                  key={audioStream.id}
                  onClick={() => playAudio(audioStream)}
                  className={
                    audioState.currentAudio?.id === audioStream.id
                      ? "bg-accent text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground"
                      : textClassName
                  }
                >
                  <AudioLines className="mr-2 h-3 w-3 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-medium">{audioStream.title}</span>
                    <span
                      className={cn(
                        "text-xs font-normal",
                        audioState.currentAudio?.id === audioStream.id
                          ? "text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {audioStream.description}
                    </span>
                  </div>
                  {audioState.currentAudio?.id === audioStream.id && (
                    <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={textClassName}>
            <Youtube className="w-3 h-3 mr-2 fill-red-500 stroke-white" />
            <span>YouTube</span>
            {audioState.audioType === "youtube" && (
              <div className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className={cn("w-72", contentClassName)}>
              <YouTubeDropdownItem />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            onMouseEnter={() => {
              if (!isLibraryExpanded) {
                setIsLibraryExpanded(true);
              }
            }}
            className={cn("flex items-center gap-2 group", textClassName)}
          >
            <Library className="w-3 h-3" />
            <span>Library</span>
            {!audioState.audioType && currentSong && (
              <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className={cn(
                "w-64 max-h-[400px] overflow-y-auto customScrollbar2",
                contentClassName
              )}
            >
              {isGenreLoading && genres.length === 0 ? (
                <DropdownMenuItem disabled>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">Loading genres...</span>
                  </div>
                </DropdownMenuItem>
              ) : genres.length === 0 ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground text-xs">
                    No genres available
                  </span>
                </DropdownMenuItem>
              ) : (
                <>
                  {genres.map((genre) => {
                    const genreSongs = genreLibrarySongs.get(genre._id) || [];
                    const hasSongs = genreSongs.length > 0;

                    return (
                      <DropdownMenuSub key={genre._id}>
                        <DropdownMenuSubTrigger
                          onMouseEnter={async () => {
                            if (!hasSongs) {
                              await loadLibrarySongsByGenre(genre._id);
                            }
                          }}
                          className={textClassName}
                        >
                          <Music className="mr-2 h-3 w-3 flex-shrink-0" />
                          <span className="flex items-center gap-2">
                            <span>{genre.name}</span>
                            {hasSongs && (
                              <span className="text-xs text-muted-foreground">
                                {genreSongs.length}
                              </span>
                            )}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent
                            ref={libraryScrollRef}
                            className={cn(
                              "w-64 max-h-[400px] overflow-y-auto customScrollbar2",
                              contentClassName
                            )}
                          >
                            {!hasSongs ? (
                              <DropdownMenuItem disabled>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span className="text-xs">
                                    Loading songs...
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            ) : genreSongs.length === 0 ? (
                              <DropdownMenuItem disabled>
                                <span className="text-muted-foreground text-xs">
                                  No songs in this genre
                                </span>
                              </DropdownMenuItem>
                            ) : (
                              <>
                                {genreSongs.map((song) => {
                                  const isCurrentSong =
                                    currentSong?._id === song._id &&
                                    !audioState.audioType;

                                  return (
                                    <LibrarySongItem
                                      key={song._id}
                                      song={song}
                                      isCurrentSong={isCurrentSong}
                                      onClick={() => {
                                        // Stop any currently playing audio when switching to music
                                        if (audioState.audioType) {
                                          stopAudio();
                                        }
                                        changeSong(song._id);
                                      }}
                                      textClassName={textClassName}
                                    />
                                  );
                                })}
                              </>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    );
                  })}
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className={cn("flex items-center gap-2 group", textClassName)}
          >
            <ArrowRightLeft className="w-3 h-3" />
            <span>Playlist</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className={cn(
                "w-64 max-h-[400px] overflow-y-auto customScrollbar2",
                contentClassName
              )}
            >
              {playlists.length === 0 ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">
                    No playlists available
                  </span>
                </DropdownMenuItem>
              ) : (
                playlists.map((playlist) => {
                  const loadedPlaylist =
                    loadedPlaylists.get(playlist._id) ||
                    (playlist._id === currentPlaylistId
                      ? currentPlaylist
                      : null);
                  const tracksCount = loadedPlaylist?.songs?.length ?? 0;
                  const hasTracks = tracksCount > 0;
                  const isCurrentPlaylist = playlist._id === currentPlaylistId;

                  return (
                    <DropdownMenuSub key={playlist._id}>
                      <DropdownMenuSubTrigger
                        onMouseEnter={async () => {
                          if (
                            !loadedPlaylist &&
                            expandedPlaylistId !== playlist._id
                          ) {
                            setExpandedPlaylistId(playlist._id);
                            handlePlaylistsLoad(playlist._id);
                          }
                        }}
                        className={cn(
                          isCurrentPlaylist &&
                            "bg-accent/80 hover:bg-accent text-accent-foreground hover:text-accent-foreground"
                        )}
                      >
                        <ListMusic className="mr-2 h-5 w-5 flex-shrink-0" />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span
                            className={cn(
                              "font-medium truncate",
                              isCurrentPlaylist
                                ? "text-accent-foreground"
                                : "text-foreground"
                            )}
                          >
                            {playlist.name}
                          </span>
                          <span
                            className={cn(
                              "text-xs",
                              isCurrentPlaylist
                                ? "text-accent-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {loadedPlaylist
                              ? `${tracksCount} tracks`
                              : "Loading..."}
                          </span>
                        </div>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent
                          className={cn(
                            "w-64 max-h-[400px] overflow-y-auto customScrollbar2",
                            contentClassName
                          )}
                        >
                          {!isCurrentPlaylist && (
                            <DropdownMenuItem
                              onClick={() => handleSwitchPlaylist(playlist._id)}
                              className={cn(
                                isCurrentPlaylist &&
                                  "bg-accent text-accent-foreground"
                              )}
                            >
                              <ArrowRightLeft className="mr-2 h-3 w-3" />
                              <span>Switch to this playlist</span>
                            </DropdownMenuItem>
                          )}
                          {!isCurrentPlaylist && <DropdownMenuSeparator />}
                          {!loadedPlaylist ? (
                            <DropdownMenuItem className="text-muted-foreground">
                              <span className="text-xs">Load tracks...</span>
                            </DropdownMenuItem>
                          ) : hasTracks ? (
                            loadedPlaylist.songs.map((songItem) => {
                              const song = songItem.song;
                              const isCurrentSong =
                                currentSong?._id === song._id &&
                                !audioState.audioType;

                              return (
                                <DropdownMenuItem
                                  key={song._id}
                                  onClick={() => {
                                    if (currentPlaylistId !== playlist._id) {
                                      handleSwitchPlaylist(playlist._id);
                                    } else {
                                      changeSong(song._id);
                                    }
                                  }}
                                  className={cn(
                                    isCurrentSong
                                      ? "bg-accent text-accent-foreground hover:bg-accent/80 hover:text-accent-foreground"
                                      : "text-foreground"
                                  )}
                                >
                                  <Music className="mr-2 h-3 w-3 flex-shrink-0" />
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <span
                                      className={cn(
                                        "font-medium truncate",
                                        isCurrentSong
                                          ? "text-green-300 dark:text-green-500"
                                          : "text-foreground"
                                      )}
                                    >
                                      {song.title}
                                    </span>
                                    {song.artist && song.artist.length > 0 && (
                                      <span
                                        className={cn(
                                          "text-xs truncate",
                                          isCurrentSong
                                            ? "text-accent-foreground"
                                            : "text-muted-foreground"
                                        )}
                                      >
                                        {song.artist.join(", ")}
                                      </span>
                                    )}
                                  </div>
                                  {isCurrentSong && (
                                    <div className="ml-auto w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full animate-pulse" />
                                  )}
                                </DropdownMenuItem>
                              );
                            })
                          ) : (
                            <DropdownMenuItem disabled>
                              <span className="text-muted-foreground text-xs">
                                No tracks available
                              </span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  );
                })
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AudioDropdownMenu;
