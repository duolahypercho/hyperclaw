import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ZSongUpdate } from "../../Provider/types";
import { useMusicTool } from "../../Provider/musicProvider";

interface DeleteDialogProps {
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  selectedSong: ZSongUpdate;
}

const DeleteDialog = (props: DeleteDialogProps) => {
  const { deleteDialogOpen, setDeleteDialogOpen, selectedSong } = props;
  const { handleDeleteSong } = useMusicTool();
  return (
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            You&apos;re about to delete &quot;{selectedSong.title || "Song"}&quot;
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            playlist.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleDeleteSong(selectedSong._id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/60 active:scale-95 active:bg-destructive/30 hover:text-destructive-foreground"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteDialog;
