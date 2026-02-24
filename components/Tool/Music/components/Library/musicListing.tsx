import React, { useState, useRef, useEffect, useCallback } from "react";
import { ZSong, ZSongUpdate } from "../../Provider/types";
import { useMusicTool } from "../../Provider/musicProvider";
import { MusicSkeleton } from "../Skeleton/musicSkeleton";
import EditCreateForm from "./EditCreateForm";
import DeleteDialog from "./DeleteDialog";
import MusicSongRow from "../MusicSongRow/MusicSongRow";

interface TrendingTracksProps {
  songs: ZSong[];
  isLoadingMore?: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
}

export function TrendingTracks({
  songs,
  isLoadingMore,
  onLoadMore,
  hasMore,
}: TrendingTracksProps) {
  const { upLoadingSong } = useMusicTool();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<ZSongUpdate | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll detection for infinite loading
  const handleScroll = useCallback(() => {
    if (!containerRef.current || isLoadingMore || !hasMore) {
      return;
    }

    const container = containerRef.current;
    const scrollPosition = container.scrollTop + container.clientHeight;
    const scrollThreshold = container.scrollHeight - 200; // Load more when 200px from bottom

    if (scrollPosition >= scrollThreshold) {
      onLoadMore();
    }
  }, [isLoadingMore, hasMore, onLoadMore]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  return (
    <div className="flex flex-col w-full h-full mt-3">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background">
        <div className="grid grid-cols-[48px_1fr_80px_80px_80px_80px_40px] gap-4 p-2 text-sm text-muted-foreground">
          <div>Cover</div>
          <div>Title</div>
          <div>Public</div>
          <div>Plays</div>
          <div>Duration</div>
          <div>Added</div>
          <div></div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto customScrollbar2 space-y-2"
      >
        {songs.map((song) => (
          <MusicSongRow
            key={song._id}
            song={song}
            variant="library"
            setSelectedSong={setSelectedSong}
            setIsEditDialogOpen={setIsEditDialogOpen}
            setDeleteDialogOpen={setDeleteDialogOpen}
          />
        ))}
        {upLoadingSong >= 1 && <MusicSkeleton num={upLoadingSong} />}
        {isLoadingMore && <MusicSkeleton num={3} />}
      </div>

      {/* Dialogs */}
      {selectedSong && (
        <EditCreateForm
          isEditDialogOpen={isEditDialogOpen}
          setIsEditDialogOpen={setIsEditDialogOpen}
          selectedSong={selectedSong}
          setSelectedSong={setSelectedSong}
        />
      )}
      {selectedSong && (
        <DeleteDialog
          deleteDialogOpen={deleteDialogOpen}
          setDeleteDialogOpen={setDeleteDialogOpen}
          selectedSong={selectedSong}
        />
      )}
    </div>
  );
}
