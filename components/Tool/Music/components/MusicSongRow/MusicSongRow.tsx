import React, { useState, memo, useMemo, useCallback } from "react";
import {
  ZSong,
  ZHomeSong,
  ZPlaylistSong,
  ZSongUpdate,
} from "../../Provider/types";
import { useMusicTool } from "../../Provider/musicProvider";
import {
  EllipsisVertical,
  ListMusic,
  Plus,
  Edit,
  Trash,
  GripVertical,
  Music,
} from "lucide-react";
import { formatDuration, getMediaUrl } from "../../../../../utils";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";

// Type guards
function isPlaylistSong(song: any): song is ZPlaylistSong {
  return song && song.song && typeof song.addedAt !== "undefined";
}
function isLibrarySong(song: any): song is ZSong {
  return (
    song &&
    typeof song.playCount === "number" &&
    typeof song.isPublic === "boolean"
  );
}
function isHomeSong(song: any): song is ZHomeSong {
  return (
    song &&
    Array.isArray(song.artist) &&
    typeof song.duration === "number" &&
    !isLibrarySong(song)
  );
}

// DnD props for playlist
interface SortableProps {
  attributes: any;
  listeners: any;
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
}

type Variant = "home" | "library" | "playlist";

type MusicSongRowProps = {
  variant: Variant;
  song: ZHomeSong | ZSong | ZPlaylistSong;
  // For playlist
  listingId?: string;
  sortableProps?: SortableProps;
  // For library
  setSelectedSong?: React.Dispatch<React.SetStateAction<ZSongUpdate | null>>;
  setIsEditDialogOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setDeleteDialogOpen?: React.Dispatch<React.SetStateAction<boolean>>;
};

const MusicSongRow: React.FC<MusicSongRowProps> = memo((props) => {
  const {
    variant,
    song,
    listingId,
    sortableProps,
    setSelectedSong,
    setIsEditDialogOpen,
    setDeleteDialogOpen,
  } = props;

  const {
    playlists,
    handleAddToPlaylist,
    currentPlaylist,
    handleDeleteFromPlaylist,
    handleSongClick,
    genre: allGenres,
    handleUpdateSong,
  } = useMusicTool();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Data normalization - memoized to prevent recalculation
  const { displaySong, addedAt } = useMemo(() => {
    let displaySong: ZHomeSong | ZSong;
    let addedAt: Date | undefined;

    if (isPlaylistSong(song)) {
      displaySong = song.song;
      addedAt = new Date(song.addedAt);
    } else {
      displaySong = song;
      if (isLibrarySong(song)) {
        addedAt = new Date(song.createdAt);
      }
    }

    return { displaySong, addedAt };
  }, [song]);

  // Handlers for library - memoized to prevent recreation
  const handleSelectSong = useCallback(() => {
    if (!isLibrarySong(displaySong) || !setSelectedSong) return;
    setSelectedSong({
      ...displaySong,
      genre: displaySong.genre.map((genre) => {
        const matchingGenre = allGenres.find((g) => g.name === genre);
        return {
          label: genre,
          value: matchingGenre?._id || genre,
        };
      }),
    });
  }, [displaySong, setSelectedSong, allGenres]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoaded(false);
  }, []);

  const handleRowClick = useCallback(() => {
    handleSongClick(displaySong._id);
  }, [handleSongClick, displaySong._id]);

  const handlePublicToggle = useCallback(
    (checked: boolean) => {
      if (!isLibrarySong(displaySong)) return;

      handleUpdateSong({
        _id: displaySong._id,
        selectedSong: {
          ...displaySong,
          genre: displaySong.genre.map((genre) => {
            const matchingGenre = allGenres.find((g) => g.name === genre);
            return {
              label: genre,
              value: matchingGenre?._id || genre,
            };
          }),
          isPublic: checked,
        },
        coverFile: null,
      });
    },
    [displaySong, allGenres, handleUpdateSong]
  );

  // Grid columns - memoized for performance
  const gridCols = useMemo(() => {
    switch (variant) {
      case "home":
        return "grid-cols-[48px_1fr_80px_80px]";
      case "library":
        return "grid-cols-[48px_1fr_80px_80px_80px_80px_40px]";
      case "playlist":
        return "grid-cols-[40px_48px_1fr_80px_80px_40px]";
      default:
        return "";
    }
  }, [variant]);

  // Memoized formatted date
  const formattedDate = useMemo(() => {
    if (!addedAt) return "";
    return new Date(addedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [addedAt]);

  // Memoized artist display
  const artistDisplay = useMemo(() => {
    return Array.isArray(displaySong.artist)
      ? displaySong.artist.join(", ")
      : displaySong.artist;
  }, [displaySong.artist]);

  return (
    <li
      ref={sortableProps?.setNodeRef}
      style={sortableProps?.style}
      className={`group w-full items-center p-2 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer active:bg-primary/10 grid ${gridCols} gap-4`}
      onClick={handleRowClick}
    >
      {/* Drag handle for playlist */}
      {variant === "playlist" && (
        <span
          {...(sortableProps?.attributes || {})}
          {...(sortableProps?.listeners || {})}
          className="cursor-grab inline-flex justify-center items-center opacity-0 group-hover:opacity-100 p-1 w-full h-full"
        >
          <GripVertical className="h-4 w-4 text-[#9ba1ae]" />
        </span>
      )}
      {/* Cover */}
      <div className="m-auto relative">
        {displaySong.cover ? (
          <div className="w-12 h-12 relative rounded overflow-hidden">
            {!imageLoaded && !imageError && (
              <Skeleton className="w-full h-full absolute inset-0 z-10" />
            )}
            {imageError ? (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
            ) : (
              <Image
                src={getMediaUrl(displaySong.cover)}
                alt={`${displaySong.title} cover`}
                fill
                className="h-full w-full rounded-lg object-cover dark:brightness-[0.2] dark:grayscale"
                sizes="48px"
                onLoad={handleImageLoad}
                onError={handleImageError}
                unoptimized
              />
            )}
          </div>
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
            <Music className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>
      {/* Title/Artist */}
      <div className="flex flex-col justify-center">
        <h3 className="font-medium text-sm text-foreground">
          {displaySong.title}
        </h3>
        <p className="text-xs text-muted-foreground">{artistDisplay}</p>
      </div>
      {/* Public Switch (library) */}
      {variant === "library" && isLibrarySong(displaySong) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex flex-col justify-center"
        >
          <Switch
            id="public"
            checked={displaySong.isPublic}
            onCheckedChange={handlePublicToggle}
          />
        </div>
      )}
      {/* Play Count (library) */}
      {variant === "library" && isLibrarySong(displaySong) && (
        <div className="text-xs text-muted-foreground flex items-center justify-start">
          {displaySong.playCount}
        </div>
      )}
      {/* Duration */}
      <div className="text-xs text-muted-foreground flex items-center justify-start">
        <span>{formatDuration(displaySong.duration)}</span>
      </div>
      {/* Added/Created Date */}
      {(variant === "library" || variant === "playlist") && (
        <div className="text-xs text-muted-foreground flex items-center justify-start">
          {formattedDate}
        </div>
      )}
      {/* Actions Dropdown */}
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="h-full flex justify-center items-center"
        >
          <DropdownMenuTrigger>
            <EllipsisVertical className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52" align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Edit (library) */}
            {variant === "library" &&
              isLibrarySong(displaySong) &&
              setIsEditDialogOpen &&
              setSelectedSong && (
                <DropdownMenuItem
                  className="flex items-center gap-2 group"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    handleSelectSong();
                    setIsEditDialogOpen(true);
                  }}
                >
                  <Edit className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                  <span className="text-muted-foreground group-hover:text-foreground">
                    Edit
                  </span>
                </DropdownMenuItem>
              )}
            {/* Add to playlist (all) */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2 group">
                <Plus className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                <span className="text-muted-foreground group-hover:text-foreground">
                  Add to playlist
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-52">
                  {playlists.map((playlist) => {
                    if (
                      variant === "playlist" &&
                      playlist._id === currentPlaylist?._id
                    )
                      return null;
                    return (
                      <DropdownMenuItem
                        key={playlist._id}
                        onClick={() =>
                          handleAddToPlaylist(displaySong._id, playlist._id)
                        }
                        className="flex items-center gap-2 group text-muted-foreground hover:bg-primary/5 transition-colors"
                      >
                        <ListMusic className="mr-2 h-3 w-3 text-muted-foreground group-hover:text-foreground" />
                        <span className="text-muted-foreground group-hover:text-foreground">
                          {playlist.name}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            {/* Delete (library) */}
            {variant === "library" &&
              isLibrarySong(displaySong) &&
              setDeleteDialogOpen &&
              setSelectedSong && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center gap-2 group"
                    onClick={() => {
                      handleSelectSong();
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash className="w-3 h-3 text-red-500 group-hover:text-red-600" />
                    <span className="text-red-500 group-hover:text-red-600">
                      Delete
                    </span>
                  </DropdownMenuItem>
                </>
              )}
            {/* Delete from playlist (playlist) */}
            {variant === "playlist" && listingId && (
              <DropdownMenuItem
                className="flex items-center gap-2 group"
                onClick={() => {
                  handleDeleteFromPlaylist(displaySong._id, listingId);
                }}
              >
                <Trash className="h-3 w-3 text-red-500 group-hover:text-red-600" />
                <span className="text-red-500 group-hover:text-red-600">
                  Delete from playlist
                </span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </div>
      </DropdownMenu>
    </li>
  );
});

MusicSongRow.displayName = "MusicSongRow";

export default MusicSongRow;
