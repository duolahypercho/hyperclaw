import { Label } from "@/components/ui/label";
import React, { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ZSongUpdate } from "../../Provider/types";
import { useMusicTool } from "../../Provider/musicProvider";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "../../../../../utils";
import { Trash, Upload } from "lucide-react";
import { Select } from "../../../../UI/MutiSelect";
import { DragAndDrop } from "../../../../DragAndDrop";
import { toast } from "@/components/ui/use-toast";

interface EditCreateFormProps {
  selectedSong: ZSongUpdate;
  setSelectedSong: (song: ZSongUpdate) => void;
  isEditDialogOpen: boolean;
  setIsEditDialogOpen: (open: boolean) => void;
}

const EditCreateForm = (props: EditCreateFormProps) => {
  const {
    selectedSong,
    setSelectedSong,
    isEditDialogOpen,
    setIsEditDialogOpen,
  } = props;
  const { genre: allGenres, handleUpdateSong } = useMusicTool();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [updatedSong, setUpdatedSong] = useState<ZSongUpdate>(selectedSong);

  React.useEffect(() => {
    setUpdatedSong(selectedSong);
  }, [selectedSong]);

  const options = useMemo(
    () =>
      allGenres.map((genre) => ({
        label: genre.name,
        value: genre._id,
      })),
    [allGenres]
  );

  const uploadCoverFile = async (coverFiles: FileList) => {
    const file = coverFiles[0];
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }
    const imageUrl = URL.createObjectURL(file);

    setUpdatedSong({
      ...updatedSong,
      cover: imageUrl,
    });
    setCoverFile(file);
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  //check if the updated song is the same as the selected song
  const isSameSong = useMemo(() => {
    if (updatedSong.cover === undefined) return true;
    return JSON.stringify(updatedSong) === JSON.stringify(selectedSong);
  }, [updatedSong, selectedSong]);

  return (
    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Song</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Song Title</Label>
            <Input
              id="title"
              placeholder="Write a title for your song..."
              value={updatedSong.title}
              onChange={(e) => {
                setUpdatedSong({
                  ...updatedSong,
                  title: e.target.value,
                });
              }}
            />
            <div className="text-xs text-muted-foreground text-right">
              {updatedSong.title.length}/50
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Song Cover</Label>
            {updatedSong.cover ? (
              <div className="relative group w-32 h-32 mx-auto">
                <Image
                  src={
                    updatedSong.cover.startsWith("blob:")
                      ? updatedSong.cover
                      : getMediaUrl(updatedSong.cover)
                  }
                  alt={updatedSong.title}
                  fill
                  sizes="128px"
                  className="rounded-lg object-cover"
                  unoptimized={updatedSong.cover.startsWith("blob:")}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:text-red-500"
                    onClick={() => {
                      setUpdatedSong({
                        ...updatedSong,
                        cover: undefined,
                      });
                    }}
                  >
                    <Trash className="w-6 h-6" />
                  </Button>
                </div>
              </div>
            ) : (
              <DragAndDrop fileTypes="image" handleFile={uploadCoverFile}>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors border-primary/10`}
                >
                  <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
                  <div className="text-sm font-medium text-primary-foreground">
                    Drag and drop your audio file
                  </div>
                  <div className="text-sm text-muted-foreground my-1">or</div>
                  <Button
                    variant="primary"
                    type="button"
                    className="relative cursor-pointer text-sm"
                    onClick={handleButtonClick}
                  >
                    Upload Cover
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      multiple={false}
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files) {
                          uploadCoverFile(e.target.files);
                          e.target.value = "";
                        }
                      }}
                    />
                  </Button>
                </div>
              </DragAndDrop>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="genre">Genre</Label>
            <Select
              multiple
              options={options}
              value={updatedSong.genre}
              onChange={(o) => {
                setUpdatedSong({
                  ...updatedSong,
                  genre: o,
                });
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant={"ghost"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsEditDialogOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant={"accent"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsEditDialogOpen(false);
              handleUpdateSong({
                _id: updatedSong._id,
                selectedSong: updatedSong,
                coverFile: coverFile,
              });
            }}
            disabled={isSameSong}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCreateForm;
