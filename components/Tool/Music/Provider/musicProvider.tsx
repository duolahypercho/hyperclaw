import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Music } from "lucide-react";
import { getGenreResponse } from "../../../../services/tools/music/responseTypes";
import { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useToast } from "@/components/ui/use-toast";
import {
  MusicProviderProps,
  SidebarPlaylist,
  ZHomeSong,
  ZPlaylist,
  ZSong,
  ZSongUpdate,
} from "./types";
import {
  addSongToPlaylistAPI,
  createMusicListAPI,
  deleteSongAPI,
  deleteMusicListAPI,
  deleteSongFromPlaylistAPI,
  editMusicListAPI,
  getLibrarySongsAPI,
  getPlaylistsAPI,
  getSinglePlaylistAPI,
  updateMusicAPI,
  uploadMusicAPI,
  reorderListingSongsAPI,
  getHomeSongsAPI,
  getGenreAPI,
} from "../../../../services/tools/music";
import {
  updateMusicRequest,
  uploadMusicRequest,
} from "../../../../services/tools/music/requestTypes";
import { useService } from "../../../../Providers/ServiceProv";
import { useUser } from "../../../../Providers/UserProv";
import { useMusicPlayer } from "../MusicPlayer/providers/musicProvider";
import {
  AppSchema,
  defaultAppSchema,
  HeaderButtonsConfig,
} from "@OS/Layout/types";
import {
  Home,
  Library,
  Plus,
  ListMusic,
  RefreshCw,
  Pencil,
  Trash,
} from "lucide-react";
import { menuItem } from "@OS/utils/contextMenu";
import { DialogData } from "@OS/Layout/Dialog/DialogSchema";
import { useOSSelector } from "@OS/Provider/OSProv";
import { useSession } from "next-auth/react";

interface MusicContextType {
  genre: getGenreResponse["data"];
  selectedGenre: string | null;
  isLibraryLoading: boolean;
  isHomeLoading: boolean;
  isSinglePlaylistLoading: boolean;
  isGenreLoading: boolean;
  isLoadingMore: boolean;
  isLoadingMoreLibrary: boolean;
  hasMore: boolean;
  hasMoreLibrary: boolean;
  currentTab: string;
  currentPlaylist: ZPlaylist | null;
  playlists: SidebarPlaylist[];
  playlistId: string | null;
  upLoadingSong: number;
  songs: ZHomeSong[];
  librarySongs: ZSong[];
  handleRenameList: (listId: string, newName: string) => void;
  handleDeleteList: (listId: string) => void;
  handleDeleteSong: (songId: string) => void;
  handleGenreClick: (id: string) => void;
  handleCreateList: () => void;
  handleTabChange: (tab: string, currentListId?: string) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleSongClick: (songId: string) => void;
  handleLibraryRefresh: () => void;
  handleHomeRefresh: () => void;
  handleLoadMoreSongs: () => void;
  handleLoadMoreLibrarySongs: () => void;
  handleAddToPlaylist: (songId: string, playlistId: string) => void;
  handleDeleteFromPlaylist: (songId: string, playlistId: string) => void;
  handleSinglePlaylistRefresh: (listId: string) => void;
  handleCreateSong: (params: {
    uploadMusicRequest: uploadMusicRequest;
    musicFile: File;
    coverFile: File;
  }) => Promise<boolean>;
  handleUpdateSong: (params: {
    _id: string;
    selectedSong: ZSongUpdate;
    coverFile: File | null;
  }) => void;
  appSchema: AppSchema;
}

const MusicContext = createContext<MusicContextType>({
  genre: [],
  selectedGenre: null,
  isLibraryLoading: false,
  isSinglePlaylistLoading: false,
  isHomeLoading: false,
  isGenreLoading: false,
  isLoadingMore: false,
  isLoadingMoreLibrary: false,
  hasMore: true,
  hasMoreLibrary: true,
  playlistId: null,
  currentPlaylist: null,
  currentTab: "home",
  playlists: [],
  songs: [],
  librarySongs: [],
  upLoadingSong: 0,
  handleRenameList: () => {},
  handleDeleteList: () => {},
  handleDeleteSong: () => {},
  handleGenreClick: () => {},
  handleLibraryRefresh: () => {},
  handleHomeRefresh: () => {},
  handleLoadMoreSongs: () => {},
  handleLoadMoreLibrarySongs: () => {},
  handleTabChange: () => {},
  handleDragEnd: () => {},
  handleCreateList: () => {},
  handleCreateSong: async () => false,
  handleSongClick: () => {},
  handleUpdateSong: () => {},
  handleAddToPlaylist: () => {},
  handleDeleteFromPlaylist: () => {},
  handleSinglePlaylistRefresh: () => {},
  appSchema: defaultAppSchema,
});

export const useMusicTool = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error("useMusicPlayer must be used within a MusicProvider");
  }
  return context;
};

export const MusicProvider: React.FC<MusicProviderProps> = ({ children }) => {
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Use our selector instead of the full useOS()
  const { currentActiveTab, meta, updateAppSettings } = useOSSelector();

  // Initialize with persisted values, fallback to defaults
  const [currentTab, setCurrentTab] = useState<string>(
    currentActiveTab || "music-home"
  );
  const [genre, setGenre] = useState<getGenreResponse["data"]>([]);
  const [initialHomeSongs, setInitialHomeSongs] = useState<ZHomeSong[]>([]);
  const [playlists, setPlaylists] = useState<SidebarPlaylist[]>([]);
  const [playlistId, setPlaylistId] = useState<string | null>(
    (meta?.listId as string) || null
  );
  const [currentPlaylist, setCurrentPlaylist] = useState<ZPlaylist | null>(
    null
  );
  const { status } = useSession();
  const [songs, setSongs] = useState<ZHomeSong[]>(initialHomeSongs);
  const { toast } = useToast();
  let { uploadFileToCloud, deleteFileFromCloud } = useService();
  const { userId } = useUser();
  const [librarySongs, setLibrarySongs] = useState<ZSong[]>([]);
  const [upLoadingSong, setUpLoadingSong] = useState<number>(0);
  const [isLibraryLoading, setIsLibraryLoading] = useState<boolean>(false);
  const [isHomeLoading, setIsHomeLoading] = useState<boolean>(false);
  const [isSinglePlaylistLoading, setIsSinglePlaylistLoading] =
    useState<boolean>(true);
  const [isGenreLoading, setIsGenreLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isLoadingMoreLibrary, setIsLoadingMoreLibrary] =
    useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [currentLibraryPage, setCurrentLibraryPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [hasMoreLibrary, setHasMoreLibrary] = useState<boolean>(true);
  const SONGS_PER_PAGE = 20;

  // Cache flags to prevent unnecessary API calls
  const [isHomeDataLoaded, setIsHomeDataLoaded] = useState<boolean>(false);
  const [isLibraryDataLoaded, setIsLibraryDataLoaded] =
    useState<boolean>(false);
  const [isPlaylistsDataLoaded, setIsPlaylistsDataLoaded] =
    useState<boolean>(false);

  const { changeSong } = useMusicPlayer();

  const onHomeLoad = useCallback(async () => {
    // Prevent unnecessary API calls if data is already loaded
    if (isHomeDataLoaded && initialHomeSongs.length > 0) {
      setSongs(initialHomeSongs);
      return;
    }

    try {
      setIsHomeLoading(true);
      const homeSongs = (await getHomeSongsAPI(1, SONGS_PER_PAGE)).data.data;
      setInitialHomeSongs(homeSongs); // Store initial home songs
      setSongs(homeSongs);
      setCurrentPage(1);
      setHasMore(homeSongs.length === SONGS_PER_PAGE);
      setIsHomeDataLoaded(true);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to load home songs",
        variant: "destructive",
      });
    } finally {
      setIsHomeLoading(false);
    }
  }, [isHomeDataLoaded, initialHomeSongs, toast, SONGS_PER_PAGE]);

  const onLibraryLoad = useCallback(
    async (force: boolean = false) => {
      if (!userId) {
        return;
      }

      // Prevent unnecessary API calls if data is already loaded (unless forced)
      if (!force && isLibraryDataLoaded && librarySongs.length > 0) {
        return;
      }

      try {
        setIsLibraryLoading(true);
        const librarySongs = (await getLibrarySongsAPI(1, SONGS_PER_PAGE)).data;
        setLibrarySongs(librarySongs.data);
        setCurrentLibraryPage(1);
        setHasMoreLibrary(librarySongs.data.length === SONGS_PER_PAGE);
        setIsLibraryDataLoaded(true);
      } catch (error: any) {
        console.error(error);
        toast({
          title: "Error",
          description: error.response.data.message || "Failed to load library",
          variant: "destructive",
        });
      } finally {
        setIsLibraryLoading(false);
      }
    },
    [userId, isLibraryDataLoaded, librarySongs, toast, SONGS_PER_PAGE]
  );

  useEffect(() => {
    // Only load data when actually needed, without console logging overhead
    if (currentTab === "music-library" && !isLibraryDataLoaded && userId) {
      onLibraryLoad();
    }
    if (currentTab === "music-home" && !isHomeDataLoaded) {
      onHomeLoad();
    }
  }, [
    userId,
    currentTab,
    isLibraryDataLoaded,
    isHomeDataLoaded,
    onHomeLoad,
    onLibraryLoad,
  ]);

  const handleTabChange = useCallback(
    (tab: string, currentListId?: string) => {
      setCurrentTab(tab);
      if (tab.includes("playlist") && currentListId) {
        setPlaylistId(currentListId);
        // Still persist to OS context for next session
        updateAppSettings("music", {
          currentActiveTab: tab,
          meta: {
            listId: currentListId,
          },
        });
      } else {
        setPlaylistId(null);
        updateAppSettings("music", {
          currentActiveTab: tab,
          meta: {
            listId: null,
          },
        });
      }
    },
    [updateAppSettings]
  );

  const handleGenreClick = useCallback(
    async (id: string) => {
      try {
        // If clicking the same genre, clear the filter and show all songs
        if (id === selectedGenre) {
          setSelectedGenre(null);
          setIsHomeLoading(true);
          const homeSongs = (await getHomeSongsAPI(1, SONGS_PER_PAGE)).data
            .data;
          setInitialHomeSongs(homeSongs);
          setSongs(homeSongs);
          setCurrentPage(1);
          setHasMore(homeSongs.length === SONGS_PER_PAGE);
        } else {
          // Fetch songs filtered by genre
          setSelectedGenre(id);
          setIsHomeLoading(true);
          const genreFilteredSongs = (
            await getHomeSongsAPI(1, SONGS_PER_PAGE, id)
          ).data.data;
          setSongs(genreFilteredSongs);
          setCurrentPage(1);
          setHasMore(genreFilteredSongs.length === SONGS_PER_PAGE);
        }
      } catch (error) {
        console.error(error);
        toast({
          title: "Error",
          description: "Failed to load songs for this genre",
          variant: "destructive",
        });
      } finally {
        setIsHomeLoading(false);
      }
    },
    [selectedGenre, toast, SONGS_PER_PAGE]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      try {
        if (active.id !== over.id) {
          if (!currentPlaylist || !userId) return;

          setCurrentPlaylist((prev) => {
            if (!prev) return null;
            const oldIndex = prev.songs.findIndex(
              (item) => item.song._id === active.id
            );
            const newIndex = prev.songs.findIndex(
              (item) => item.song._id === over.id
            );

            const newItems = arrayMove(prev.songs, oldIndex, newIndex);
            return { ...prev, songs: newItems };
          });

          const newIndex = currentPlaylist.songs.findIndex(
            (item) => item.song._id === over.id
          );

          const ReorderLibrarySongsAPI = await reorderListingSongsAPI({
            listingId: currentPlaylist._id,
            userId: userId,
            songId: active.id as string,
            newIndex: newIndex as number,
          });

          if (ReorderLibrarySongsAPI.status !== 200) {
            throw new Error("Failed to reorder song");
          }
        }
      } catch (error: any) {
        console.error(error);
        toast({
          title: "Failed to reorder song",
          description: error.response.data.message || "Please try again",
          variant: "destructive",
        });
      }
    },
    [currentPlaylist, userId, toast]
  );

  const handleCreateList = useCallback(async () => {
    try {
      if (!userId) {
        return;
      }
      const AddMusicListAPI = await createMusicListAPI({
        userId: userId,
        name: "New List",
      });
      if (AddMusicListAPI.status !== 200) {
        throw new Error("Failed to create list");
      }

      setPlaylists([...playlists, AddMusicListAPI.data.data]);
      setPlaylistId(AddMusicListAPI.data.data._id);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Failed to create list",
        description: error.response.data.message || "Please try again",
        variant: "destructive",
      });
    }
  }, [userId, playlists, toast]);

  const checkSongValid = useCallback(
    ({
      uploadMusicRequest,
      musicFile,
      coverFile,
    }: {
      uploadMusicRequest: uploadMusicRequest;
      musicFile: File;
      coverFile: File;
    }) => {
      if (!uploadMusicRequest.title) {
        toast({
          title: "Error",
          description: "Please enter a title",
          variant: "destructive",
        });
        return false;
      }
      if (!uploadMusicRequest.cover) {
        toast({
          title: "Error",
          description: "Please upload a cover",
          variant: "destructive",
        });
        return false;
      }
      if (!uploadMusicRequest.genre.length) {
        toast({
          title: "Error",
          description: "Please select a genre",
          variant: "destructive",
        });
        return false;
      }
      if (!userId) {
        toast({
          title: "Error",
          description: "Please login to upload a song",
          variant: "destructive",
        });
        return;
      }

      if (!musicFile) {
        toast({
          title: "Error",
          description: "Please upload an audio file",
          variant: "destructive",
        });
        return;
      }

      if (!coverFile) {
        toast({
          title: "Error",
          description: "Please upload a cover",
          variant: "destructive",
        });
        return;
      }

      return true;
    },
    [userId, toast]
  );

  const handleCreateSong = useCallback(
    async ({
      uploadMusicRequest,
      musicFile,
      coverFile,
    }: {
      uploadMusicRequest: uploadMusicRequest;
      musicFile: File;
      coverFile: File;
    }): Promise<boolean> => {
      try {
        if (!checkSongValid({ uploadMusicRequest, musicFile, coverFile })) {
          return false;
        }
        setUpLoadingSong((prev) => prev + 1);

        const uploadPromises = [
          uploadFileToCloud(
            musicFile,
            "audio",
            `music/sounds/${uploadMusicRequest._id}/`
          ),
          uploadFileToCloud(
            coverFile,
            "image",
            `music/sounds/${uploadMusicRequest._id}/`
          ),
        ];

        const uploadResponses = await Promise.all(uploadPromises);

        if (!uploadResponses[0] || !uploadResponses[1]) {
          toast({
            title: "Error",
            description: "Failed to upload files",
            variant: "destructive",
          });
          setUpLoadingSong((prev) => prev - 1);
          return false;
        }
        await uploadMusicAPI({
          ...uploadMusicRequest,
          audioUrl: uploadResponses[0],
          cover: uploadResponses[1],
        });

        setUpLoadingSong((prev) => prev - 1);

        // Force reload library and invalidate home cache
        setIsHomeDataLoaded(false);
        setInitialHomeSongs([]); // Clear cached home songs

        await onLibraryLoad(true); // Force refresh library data

        toast({
          title: "Success",
          description: "Song uploaded successfully",
          variant: "success",
        });
        return true;
      } catch (error: any) {
        console.error(error);
        setUpLoadingSong((prev) => prev - 1);
        toast({
          title: "Error",
          description: error.response.data.message || "Failed to upload song",
          variant: "destructive",
        });
        return false;
      }
    },
    [toast, checkSongValid, onLibraryLoad, uploadFileToCloud, setCurrentTab]
  );

  const handleUpdateSong = useCallback(
    async ({
      _id,
      selectedSong,
      coverFile,
    }: {
      _id: string;
      selectedSong: ZSongUpdate;
      coverFile: File | null;
    }) => {
      try {
        //find song in the library songs
        const song = librarySongs.find((song) => song._id === _id);

        if (!userId) {
          toast({
            title: "Error",
            description: "Please login to update a song",
            variant: "destructive",
          });
          return;
        }

        if (!song) {
          toast({
            title: "Error",
            description: "Song not found",
            variant: "destructive",
          });
          return;
        }
        const changedFields = (
          Object.keys(selectedSong) as Array<keyof ZSongUpdate>
        ).filter((key) => {
          if (key === "genre") {
            const selectedGenres = selectedSong.genre
              .map((g) => g.label)
              .sort();
            return (
              JSON.stringify(selectedGenres) !== JSON.stringify(song.genre)
            );
          }
          return selectedSong[key] !== song[key];
        });

        if (changedFields.length === 0) {
          return;
        }

        const uploadMusicRequest: updateMusicRequest = {
          _id: selectedSong._id,
          userId: userId,
        };

        // Add each changed field to the request
        await Promise.all(
          changedFields.map(async (field) => {
            if (field === "genre") {
              (uploadMusicRequest as Record<keyof ZSongUpdate, any>)[field] =
                selectedSong[field].map((g) => g.value);
            } else if (field === "cover") {
              if (coverFile) {
                const uploadPromises = [
                  deleteFileFromCloud(song.cover as string),
                  uploadFileToCloud(
                    coverFile,
                    "image",
                    `music/sounds/${_id}/`
                  ),
                ];
                const res = await Promise.all(uploadPromises);

                (uploadMusicRequest as Record<keyof ZSongUpdate, any>)[field] =
                  res[1] as string;
              }
            } else {
              (uploadMusicRequest as Record<keyof ZSongUpdate, any>)[field] =
                selectedSong[field];
            }
          })
        );

        const {
          _id: requestId,
          userId: requestUserId,
          ...rest
        } = uploadMusicRequest;

        setLibrarySongs((prev) =>
          prev.map((song) => (song._id === _id ? { ...song, ...rest } : song))
        );

        await updateMusicAPI(uploadMusicRequest);

        // Invalidate home cache as updated song might appear differently in home
        setIsHomeDataLoaded(false);
        setInitialHomeSongs([]);

        toast({
          title: "Success",
          description: "Song updated successfully",
          variant: "success",
        });
      } catch (error: any) {
        console.error(error);
        toast({
          title: "Error",
          description: error.response.data.message || "Failed to update song",
          variant: "destructive",
        });
      }
    },
    [userId, librarySongs, toast, deleteFileFromCloud, uploadFileToCloud]
  );

  const handleLibraryRefresh = useCallback(async () => {
    await onLibraryLoad(true);
  }, [onLibraryLoad]);

  const handleHomeRefresh = useCallback(async () => {
    setIsHomeDataLoaded(false);
    setCurrentPage(1);
    setHasMore(true);
    await onHomeLoad();
  }, [onHomeLoad]);

  const handleLoadMoreSongs = useCallback(async () => {
    // Don't load if already loading or no more songs
    if (isLoadingMore || !hasMore) {
      return;
    }

    try {
      setIsLoadingMore(true);
      const nextPage = currentPage + 1;
      // Pass selectedGenre to API if a genre is selected
      const moreSongs = (
        await getHomeSongsAPI(
          nextPage,
          SONGS_PER_PAGE,
          selectedGenre || undefined
        )
      ).data.data;

      if (moreSongs.length < SONGS_PER_PAGE) {
        setHasMore(false);
      }

      // Only update initialHomeSongs if no genre is selected
      if (!selectedGenre) {
        setInitialHomeSongs((prev) => [...prev, ...moreSongs]);
      }
      setSongs((prev) => [...prev, ...moreSongs]);
      setCurrentPage(nextPage);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to load more songs",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    hasMore,
    currentPage,
    selectedGenre,
    toast,
    SONGS_PER_PAGE,
  ]);

  const handleLoadMoreLibrarySongs = useCallback(async () => {
    // Don't load if already loading or no more songs
    if (isLoadingMoreLibrary || !hasMoreLibrary || !userId) {
      return;
    }

    try {
      setIsLoadingMoreLibrary(true);
      const nextPage = currentLibraryPage + 1;
      const moreLibrarySongs = (
        await getLibrarySongsAPI(nextPage, SONGS_PER_PAGE)
      ).data;

      if (moreLibrarySongs.data.length < SONGS_PER_PAGE) {
        setHasMoreLibrary(false);
      }

      setLibrarySongs((prev) => [...prev, ...moreLibrarySongs.data]);
      setCurrentLibraryPage(nextPage);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to load more library songs",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMoreLibrary(false);
    }
  }, [
    isLoadingMoreLibrary,
    hasMoreLibrary,
    currentLibraryPage,
    userId,
    toast,
    SONGS_PER_PAGE,
  ]);

  const handleSinglePlaylistRefresh = useCallback(
    async (listId: string) => {
      try {
        // Prevent unnecessary API calls if playlist is already loaded
        if (
          currentPlaylist &&
          currentPlaylist._id === listId &&
          !isSinglePlaylistLoading
        ) {
          return;
        }

        setIsSinglePlaylistLoading(true);
        if (!listId) {
          toast({
            title: "Error",
            description: "Playlist not found",
            variant: "destructive",
          });
          return;
        }

        const SinglePlaylistRes = await getSinglePlaylistAPI(listId);
        if (SinglePlaylistRes.status !== 200) {
          throw new Error("Failed to load playlist");
        }
        setCurrentPlaylist(SinglePlaylistRes.data.data);
        setIsSinglePlaylistLoading(false);
      } catch (error: any) {
        console.error(error);
        toast({
          title: "Error",
          description:
            error.response.data.message || "Failed to load playlists",
          variant: "destructive",
        });
      }
    },
    [toast, currentPlaylist, isSinglePlaylistLoading]
  );

  const handleSongClick = async (songId: string) => {
    changeSong(songId);
  };

  const handleRenameList = useCallback(
    async (listId: string, newName: string): Promise<void> => {
      try {
        if (!userId) {
          toast({
            title: "Authentication Error",
            description: "Please log in to rename playlists",
            variant: "destructive",
          });
          return;
        }

        if (!newName.trim()) {
          toast({
            title: "Validation Error",
            description: "Playlist name cannot be empty",
            variant: "destructive",
          });
          return;
        }

        // Update playlists optimistically
        setPlaylists((prevPlaylists) =>
          prevPlaylists.map((playlist) =>
            playlist._id === listId ? { ...playlist, name: newName } : playlist
          )
        );

        // Make API call
        const response = await editMusicListAPI({
          id: listId,
          userId: userId,
          name: newName.trim(),
        });

        toast({
          title: "Success",
          description: "Playlist renamed successfully",
          variant: "success",
        });
      } catch (error: any) {
        // Revert optimistic update
        toast({
          title: "Error",
          description:
            error.response.data.message || "Failed to rename playlist",
          variant: "destructive",
        });
      }
    },
    [userId, toast]
  );

  const handleDeleteList = useCallback(
    async (listId: string): Promise<void> => {
      try {
        if (!userId) {
          toast({
            title: "Authentication Error",
            description: "Please log in to delete playlists",
            variant: "destructive",
          });
          return;
        }

        // Optimistically update UI
        setPlaylists((prevPlaylists) =>
          prevPlaylists.filter((playlist) => playlist._id !== listId)
        );

        setPlaylistId(playlists[0]._id);

        // Make API call
        const response = await deleteMusicListAPI(userId, listId);

        if (response.status !== 200) {
          throw new Error("Failed to delete playlist");
        }
      } catch (error: any) {
        // Revert optimistic update

        if (userId) {
          const playlists = (await getPlaylistsAPI()).data.data;
          setPlaylists(playlists);
        }

        toast({
          title: "Error",
          description:
            error.response.data.message || "Failed to delete playlist",
          variant: "destructive",
        });
      }
    },
    [userId, playlists, toast]
  );

  const handleDeleteSong = useCallback(
    async (songId: string): Promise<void> => {
      try {
        if (!userId) {
          toast({
            title: "Authentication Error",
            description: "Please log in to delete songs",
            variant: "destructive",
          });
          return;
        }

        // Find the song before deletion
        const songToDelete = librarySongs.find((song) => song._id === songId);
        if (!songToDelete) {
          throw new Error("Song not found");
        }

        // Optimistically update UI
        setLibrarySongs((prev) => prev.filter((song) => song._id !== songId));

        // Delete files and song in parallel
        await deleteSongAPI(userId, songId);

        // Invalidate home cache as deleted song might have been in home feed
        setIsHomeDataLoaded(false);
        setInitialHomeSongs([]);

        toast({
          title: "Success",
          description: "Song deleted successfully",
          variant: "success",
        });
      } catch (error) {
        // Revert optimistic update
        onLibraryLoad(true); // Force reload the library to ensure consistency

        toast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to delete song",
          variant: "destructive",
        });
        console.error("Error deleting song:", error);
      }
    },
    [userId, librarySongs, toast, onLibraryLoad]
  );

  const handleAddToPlaylist = useCallback(
    async (songId: string, playlistId: string) => {
      try {
        if (!userId) {
          toast({
            title: "Authentication Error",
            description: "Please log in to add songs to playlists",
            variant: "destructive",
          });
          return;
        }

        const response = await addSongToPlaylistAPI({
          listingId: playlistId,
          userId: userId,
          songId: songId,
        });

        if (response.status !== 200) {
          throw new Error("Failed to add song to playlist");
        }

        toast({
          title: "Success",
          description: "Song added to playlist successfully",
          variant: "success",
        });
      } catch (error: any) {
        console.error(error);
        toast({
          title: "Error",
          description:
            error?.response?.data?.message || "Failed to add song to playlist",
          variant: "destructive",
        });
      }
    },
    [userId, toast]
  );

  const handleDeleteFromPlaylist = useCallback(
    async (songId: string, playlistId: string) => {
      try {
        if (!userId) {
          toast({
            title: "Authentication Error",
            description: "Please log in to delete songs from playlists",
            variant: "destructive",
          });
          return;
        }

        if (playlistId === currentPlaylist?._id) {
          setCurrentPlaylist({
            ...currentPlaylist,
            songs: currentPlaylist.songs.filter(
              (song) => song.song._id !== songId
            ),
          });
        }

        const response = await deleteSongFromPlaylistAPI({
          listingId: playlistId,
          userId: userId,
          songId: songId,
        });

        if (response.status !== 200) {
          throw new Error("Failed to delete song from playlist");
        }
      } catch (error: any) {
        console.error(error);
        toast({
          title: "Error",
          description:
            error.response.data.message ||
            "Failed to delete song from playlist",
          variant: "destructive",
        });
      }
    },
    [userId, currentPlaylist, toast]
  );

  const initialLoad = useCallback(async () => {
    // Prevent unnecessary API calls if data is already loaded
    if (isHomeDataLoaded && isPlaylistsDataLoaded && genre.length > 0) {
      return;
    }

    try {
      setIsGenreLoading(true);
      const [genreAPIResponse, homeSongsAPIResponse, playlistsAPIResponse] =
        await Promise.all([
          getGenreAPI(),
          getHomeSongsAPI(1, SONGS_PER_PAGE),
          getPlaylistsAPI(),
        ]);

      setGenre(genreAPIResponse.data.data);
      setInitialHomeSongs(homeSongsAPIResponse.data.data);
      setSongs(homeSongsAPIResponse.data.data);
      setPlaylists(playlistsAPIResponse.data.data);
      setCurrentPage(1);
      setHasMore(homeSongsAPIResponse.data.data.length === SONGS_PER_PAGE);
      setIsHomeDataLoaded(true);
      setIsPlaylistsDataLoaded(true);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to load genre and home songs",
        variant: "destructive",
      });
    } finally {
      setIsGenreLoading(false);
    }
  }, [
    toast,
    genre.length,
    isHomeDataLoaded,
    isPlaylistsDataLoaded,
    SONGS_PER_PAGE,
  ]);

  const getHeaderButtons = useCallback(() => {
    if (currentTab === "music-library") {
      const baseButtons = [
        {
          id: "new-song",
          label: "New Song",
          icon: <Plus className="w-4 h-4" />,
          variant: "outline" as const,
          className: "text-xs font-semibold",
          onClick: () => {
            handleTabChange("music-create");
          },
        },
      ];
      return baseButtons;
    }
    return [];
  }, [handleTabChange, currentTab]);

  useEffect(() => {
    try {
      if (playlistId) {
        handleSinglePlaylistRefresh(playlistId);
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to load playlist",
        variant: "destructive",
      });
    }
  }, [playlistId, handleSinglePlaylistRefresh, toast]);

  useEffect(() => {
    if (status === "unauthenticated" || status === "loading") {
      return;
    }

    // Use requestIdleCallback for non-blocking data loading
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => {
        initialLoad();
      });
    } else {
      // Fallback for browsers that don't support requestIdleCallback
      setTimeout(() => {
        initialLoad();
      }, 0);
    }
  }, [status, initialLoad]);

  const appSchema: AppSchema = React.useMemo(() => {
    return {
      header: {
        title: "Music",
        icon: Music,
        rightUI: {
          type: "buttons",
          buttons: getHeaderButtons(),
        } as HeaderButtonsConfig,
      },
      sidebar: {
        sections: [
          {
            id: "music-main",
            type: "default" as const,
            items: [
              {
                id: "music-home",
                title: "Home",
                icon: Home,
                onClick: () => handleTabChange("music-home"),
              },
              {
                id: "music-create",
                title: "Create",
                icon: Plus,
                onClick: () => handleTabChange("music-create"),
              },
              {
                id: "music-library",
                title: "Library",
                icon: Library,
                onClick: () => handleTabChange("music-library"),
              },
            ],
          },
          {
            id: "music-playlists",
            title: "Playlists",
            type: "collapsible" as const,
            items: [
              ...playlists.map((list) => ({
                id: `playlist:${list._id}`,
                title: list.name,
                icon: ListMusic,
                onClick: () =>
                  handleTabChange(`playlist:${list._id}`, list._id),
                contextMenu: [
                  menuItem({
                    label: "Reload",
                    icon: RefreshCw,
                    onClick: () => handleSinglePlaylistRefresh(list._id),
                  }),
                  menuItem({
                    label: "Rename",
                    icon: Pencil,
                    dialog: {
                      id: "rename-list",
                      data: {
                        listId: list._id,
                      },
                    },
                  }),
                  menuItem({
                    label: "Delete",
                    icon: Trash,
                    dialog: {
                      id: "delete-list",
                      data: {
                        listId: list._id,
                      },
                    },
                  }),
                ],
              })),
              {
                id: "create-new-list",
                title: "Create new list",
                icon: Plus,
                onClick: handleCreateList,
              },
            ],
          },
        ],
      },
      dialogs: [
        {
          id: "rename-list",
          title: "Rename list",
          description: "Enter a new name for your list",
          type: "form",
          formProps: {
            schemaConfig: {
              listName: {
                key: "listName",
                type: "input",
                display: "List Name",
                placeholder: "Enter list name",
                required: true,
                requiredMessage: "List name is required",
                minLength: 1,
                maxLength: 50,
                lengthHint: true,
                defaultValue: "",
                layout: "column",
                description: "Enter a new name for your list",
                hintMessage: "Maximum 50 characters",
              },
            },
          },
          actions: {
            primary: {
              id: "rename-list-action",
              label: "Rename",
              onClick: async (data?: DialogData) => {
                if (data?.dialogData?.listId && data?.formData?.listName) {
                  await handleRenameList(
                    data.dialogData.listId,
                    data.formData.listName
                  );
                }
              },
            },
            close: {
              id: "cancel-rename-list-action",
              label: "Cancel",
            },
          },
        },
        {
          id: "delete-list",
          title: "Delete list",
          description:
            "This action cannot be undone. This will permanently delete your list and remove your data from our servers.",
          type: "alert",
          content: "",
          actions: {
            confirm: {
              id: "delete-list-action",
              label: "Delete",
              onClick: async (data?: DialogData) => {
                await handleDeleteList(data?.dialogData?.listId);
              },
            },
            close: {
              id: "cancel-delete-list-action",
              label: "Cancel",
            },
          },
        },
      ],
    };
  }, [
    playlists,
    handleCreateList,
    handleSinglePlaylistRefresh,
    handleRenameList,
    handleDeleteList,
    getHeaderButtons,
    handleTabChange,
  ]);

  const value = {
    genre,
    selectedGenre,
    isLibraryLoading,
    isSinglePlaylistLoading,
    isHomeLoading,
    isGenreLoading,
    isLoadingMore,
    isLoadingMoreLibrary,
    hasMore,
    hasMoreLibrary,
    currentTab,
    currentPlaylist,
    playlists,
    playlistId,
    songs,
    upLoadingSong,
    librarySongs,
    handleRenameList,
    handleDeleteList,
    handleDeleteSong,
    handleLibraryRefresh,
    handleHomeRefresh,
    handleLoadMoreSongs,
    handleLoadMoreLibrarySongs,
    handleGenreClick,
    handleTabChange,
    handleDragEnd,
    handleCreateSong,
    handleCreateList,
    handleSongClick,
    handleUpdateSong,
    handleAddToPlaylist,
    handleDeleteFromPlaylist,
    handleSinglePlaylistRefresh,
    appSchema,
  };

  return (
    <MusicContext.Provider value={value}>{children}</MusicContext.Provider>
  );
};
