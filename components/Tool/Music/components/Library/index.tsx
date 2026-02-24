import React from "react";
import { TrendingTracks } from "./musicListing";
import { useMusicTool } from "../../Provider/musicProvider";
import { MusicSkeleton } from "../Skeleton/musicSkeleton";

const MusicLibrary = () => {
  const {
    handleTabChange,
    upLoadingSong,
    librarySongs,
    isLibraryLoading,
    handleLoadMoreLibrarySongs,
    hasMoreLibrary,
    isLoadingMoreLibrary,
  } = useMusicTool();

  if (isLibraryLoading) {
    return (
      <div className="block rounded-lg h-full">
        <div className="flex flex-col gap-4 justify-center items-center">
          <MusicSkeleton num={10} />
        </div>
      </div>
    );
  }

  return (
    <div className="block rounded-lg h-full">
      <div className="flex flex-col gap-4 justify-center items-center h-full">
        {upLoadingSong === 0 && librarySongs?.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-6 mt-8 p-8 bg-primary rounded-xl w-full max-w-md">
            <div className="text-gray-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-16 w-16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground">
                Your Library is Empty
              </h3>
              <p className="text-muted-foreground/60 mt-2">
                Start building your music collection by uploading your favorite
                tracks
              </p>
            </div>
            <button
              onClick={() => handleTabChange("music-create")}
              className="flex items-center text-sm gap-2 px-6 py-3 bg-primary text-foreground rounded-full hover:bg-primary/90 transition-all transform hover:scale-105 font-semibold"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Upload Songs
            </button>
          </div>
        ) : (
          <TrendingTracks
            songs={librarySongs}
            isLoadingMore={isLoadingMoreLibrary}
            onLoadMore={handleLoadMoreLibrarySongs}
            hasMore={hasMoreLibrary}
          />
        )}
      </div>
    </div>
  );
};

export default MusicLibrary;
