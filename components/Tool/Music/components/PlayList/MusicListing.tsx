import React, { useState } from "react";
import { ZPlaylist } from "../../Provider/types";
import { useMusicTool } from "../../Provider/musicProvider";
import { MusicSkeleton } from "../Skeleton/musicSkeleton";
import MusicSongRow from "../MusicSongRow/MusicSongRow";

interface MusicListingProps {
  playList: ZPlaylist;
}

const MusicListing = ({ playList }: MusicListingProps) => {
  const { upLoadingSong, handleDragEnd } = useMusicTool();

  if (playList.songs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No songs in your library yet. Add some music to get started!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[40px_48px_1fr_80px_80px_40px] gap-4 p-2 text-sm text-muted-foreground">
        <div></div>
        <div>Cover</div>
        <div>Title</div>
        <div>Duration</div>
        <div>Added</div>
        <div></div>
      </div>
      {upLoadingSong >= 1 && <MusicSkeleton num={upLoadingSong} grip={true} />}
      {playList.songs.map((song) => (
        <MusicSongRow
          key={song.song._id}
          song={song}
          variant="playlist"
          listingId={playList._id}
        />
      ))}
    </div>
  );
};

export default MusicListing;
