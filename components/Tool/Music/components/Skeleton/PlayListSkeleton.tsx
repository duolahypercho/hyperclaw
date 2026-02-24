import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import React from "react";
import { MusicSkeleton } from "./musicSkeleton";

const PlayListSkeleton = () => {
  return (
    <div className="block rounded-lg h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="mb-3 text-foreground text-2xl font-semibold">
          Playlist
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="hover:scale-110 transition-all duration-300"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>
      <MusicSkeleton num={5} grip={true} />
    </div>
  );
};

export default PlayListSkeleton;
