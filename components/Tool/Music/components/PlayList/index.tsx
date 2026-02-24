import React, { useState } from "react";
import { SortableContext } from "@dnd-kit/sortable";
import { useMusicTool } from "../../Provider/musicProvider";
import MusicListing from "./MusicListing";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { MoreVertical, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import PlayListSkeleton from "../Skeleton/PlayListSkeleton";

const MusicPlaylist = () => {
  const {
    currentPlaylist,
    handleRenameList,
    handleDeleteList,
    isSinglePlaylistLoading,
    handleSinglePlaylistRefresh,
    handleDragEnd,
  } = useMusicTool();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");

  if (!currentPlaylist || isSinglePlaylistLoading) {
    return <PlayListSkeleton />;
  }

  return (
    <div className="block rounded-lg h-full">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={currentPlaylist.songs.map((song) => song.song._id)}
        >
          <MusicListing playList={currentPlaylist} />
        </SortableContext>
      </DndContext>

      {/* Rename Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename List</DialogTitle>
            <DialogDescription>
              Enter a new name for your playlist. This will help you better
              organize your music collection.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              className="bg-transparent text-foreground hover:bg-secondary/70 hover:text-foreground"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant={"primary"}
              onClick={() => {
                handleRenameList(currentPlaylist?._id || "", newListName);
                setIsEditDialogOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/70"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              You&apos;re about to delete &quot;
              {currentPlaylist?.name || "Playlist"}&quot;
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              playlist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteList(currentPlaylist?._id || "")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/60 active:scale-95 active:bg-destructive/30"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MusicPlaylist;
