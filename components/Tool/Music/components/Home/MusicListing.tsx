import React, { memo, useMemo } from "react";
import { ZHomeSong } from "../../Provider/types";
import { useMusicTool } from "../../Provider/musicProvider";
import { MusicSkeleton } from "../Skeleton/musicSkeleton";
import MusicSongRow from "../MusicSongRow/MusicSongRow";
import { Loader2 } from "lucide-react";

interface MusicListingProps {
  songs: ZHomeSong[];
  loadMoreRef?: (node: HTMLDivElement) => void;
}

// Optimized song row component with memoization
const OptimizedSongRow = memo(({ song }: { song: ZHomeSong }) => (
  <MusicSongRow key={song._id} song={song} variant="home" />
));

OptimizedSongRow.displayName = "OptimizedSongRow";

const MusicListing = memo(({ songs, loadMoreRef }: MusicListingProps) => {
  const { isHomeLoading, isLoadingMore, hasMore } = useMusicTool();

  // Memoize the song rows to prevent unnecessary re-renders
  const songRows = useMemo(() => {
    return songs.map((song) => <OptimizedSongRow key={song._id} song={song} />);
  }, [songs]);

  if (isHomeLoading) {
    return <MusicSkeleton num={10} />;
  }

  if (songs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No songs. Add some music to get started!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {songRows}
      {/* Sentinel element for intersection observer */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          {isLoadingMore && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading more songs...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

MusicListing.displayName = "MusicListing";

export default MusicListing;
