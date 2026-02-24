"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Trash, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { ZSongCreate } from "../../Provider/types";
import { useToast } from "@/components/ui/use-toast";
import { useUser } from "../../../../../Providers/UserProv";
import { formatDuration } from "../../../../../utils";
import { Input } from "@/components/ui/input";
import { useMusicTool } from "../../Provider/musicProvider";
import { Select, SelectOption } from "../../../../UI/MutiSelect";
// Simple ID generator to avoid mongoose dependency
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 26);
};
import { DragAndDrop } from "../../../../DragAndDrop";
import Image from "next/image";

export function UploadForm() {
  const { toast } = useToast();
  const { userId, userInfo } = useUser();
  const {
    genre: allGenres,
    handleCreateSong,
    upLoadingSong,
    handleTabChange,
  } = useMusicTool();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);

  const options = useMemo(
    () =>
      allGenres.map((genre) => ({
        label: genre.name,
        value: genre._id,
      })),
    [allGenres]
  );

  const [song, setSong] = useState<ZSongCreate>({
    _id: "",
    title: "",
    artist: [userInfo.username],
    audioUrl: "",
    cover: "",
    playCount: 0,
    duration: 0,
    genre: [],
    isPublic: false,
    createdAt: new Date(),
  });

  const uploadAudioFile = async (audioFiles: FileList) => {
    const file = audioFiles[0];
    // Check if file is audio
    if (!file.type.startsWith("audio/")) {
      toast({
        title: "Error",
        description: "Please upload an audio file",
        variant: "destructive",
      });
      return;
    }
    // Get audio duration
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);

    audio.addEventListener("loadedmetadata", () => {
      const duration = Math.round(audio.duration);

      setSong({
        ...song,
        title: file.name,
        audioUrl: objectUrl,
        duration: duration,
      });
      setMusicFile(file);
      URL.revokeObjectURL(objectUrl);
    });

    audio.addEventListener("error", () => {
      toast({
        title: "Error",
        description: "Failed to load audio file",
        variant: "destructive",
      });
      URL.revokeObjectURL(objectUrl);
    });

    audio.src = objectUrl;
  };

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

    setSong((prev) => ({
      ...prev,
      cover: imageUrl,
    }));
    setCoverFile(file);
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Alternative approach using useCallback
  const handleGenreChange = useCallback((genreValue: SelectOption[]) => {
    setSong((prev: ZSongCreate) => ({
      ...prev,
      genre: genreValue,
    }));
  }, []);

  if (!musicFile) {
    return (
      <div className="w-full max-w-3xl mx-auto p-4 space-y-6">
        <DragAndDrop fileTypes="audio" handleFile={uploadAudioFile}>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors`}
          >
            <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
            <div className="text-lg font-medium">
              Drag and drop your audio file
            </div>
            <div className="text-sm text-muted-foreground mt-1">or</div>
            <Button
              variant="primary"
              type="button"
              className="relative cursor-pointer"
              onClick={handleButtonClick}
            >
              Upload Audio
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple={false}
                accept="audio/*"
                onChange={(e) => {
                  if (e.target.files) {
                    uploadAudioFile(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
            </Button>
          </div>
        </DragAndDrop>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-6">
      <div className="grid grid-cols-[48px_1fr_80px_80px_40px] gap-4 p-2 text-xs font-medium text-foreground">
        <div>Cover</div>
        <div>Title</div>
        <div>Plays</div>
        <div>Duration</div>
      </div>
      <div className="grid grid-cols-[48px_1fr_80px_80px_40px] gap-4 p-2 rounded-lg hover:bg-white/5 transition-colors !mt-0">
        {song.cover ? (
          <Image
            src={song.cover}
            alt={song.title}
            width={48}
            height={48}
            className="w-12 h-12 rounded object-cover"
            unoptimized
          />
        ) : (
          <div className="w-12 h-12 rounded object-cover bg-black/30" />
        )}
        <div className="flex flex-col justify-center">
          <h3 className="font-medium text-sm text-foreground">{song.title}</h3>
          <p className="text-xs text-muted-foreground">{song.artist}</p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center justify-start">
          <span>{0}</span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center justify-start">
          <span>{formatDuration(song.duration)}</span>
        </div>
        <Button
          className="shadow-none p-0 bg-transparent hover:bg-transparent hover:shadow-none h-full cursor-pointer"
          variant={"destructive"}
          onClick={() => {
            setMusicFile(null);
            setSong((prev) => ({
              ...prev,
              audioUrl: "",
              duration: 0,
              title: "",
              cover: "",
              genre: [],
              isPublic: false,
            }));
          }}
          disabled={uploadSuccess}
        >
          <Trash className="w-5 h-5 text-red-500 " />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Song Title</Label>
          <Input
            id="title"
            placeholder="Write a title for your song..."
            value={song.title}
            onChange={(e) =>
              setSong((prev: ZSongCreate) => ({
                ...prev,
                title: e.target.value,
              }))
            }
            disabled={uploadSuccess}
          />
          <div className="text-xs text-muted-foreground text-right">
            {song.title.length}/50
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Song Cover</Label>
          {song.cover ? (
            <div className="relative group w-32 h-32 mx-auto">
              <Image
                src={song.cover}
                alt={song.title}
                width={128}
                height={128}
                className="w-full h-full rounded-lg object-cover"
                unoptimized
              />
              {!uploadSuccess && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:text-red-500"
                    onClick={() => setSong((prev) => ({ ...prev, cover: "" }))}
                  >
                    <Trash className="w-6 h-6" />
                  </Button>
                </div>
              )}
            </div>
          ) : !uploadSuccess ? (
            <DragAndDrop fileTypes="image" handleFile={uploadCoverFile}>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors border-primary/10`}
              >
                <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
                <div className="text-sm font-medium">
                  Drag and drop your audio file
                </div>
                <div className="text-sm text-muted-foreground mt-1">or</div>
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
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="public" className="text-sm font-medium">
            Public
          </Label>
          <Switch
            id="public"
            checked={song.isPublic}
            onCheckedChange={(checked) =>
              setSong((prev: ZSongCreate) => ({
                ...prev,
                isPublic: checked,
              }))
            }
            disabled={uploadSuccess}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="genre">Genre</Label>
          <div
            className={uploadSuccess ? "pointer-events-none opacity-50" : ""}
          >
            <Select
              multiple
              options={options}
              value={song.genre}
              onChange={(o) => {
                handleGenreChange(o);
              }}
            />
          </div>
        </div>
      </div>

      {uploadSuccess ? (
        <div className="flex flex-row gap-2 items-center justify-center">
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            type="button"
            onClick={() => {
              handleTabChange("music-library");
            }}
          >
            Go to Library
          </Button>
          <Button
            className="w-full"
            size="lg"
            variant="accent"
            type={"button"}
            onClick={() => {
              // Reset form for another upload
              setMusicFile(null);
              setCoverFile(null);
              setSong({
                _id: "",
                title: "",
                artist: [userInfo.username],
                audioUrl: "",
                cover: "",
                playCount: 0,
                duration: 0,
                genre: [],
                isPublic: false,
                createdAt: new Date(),
              });
              setUploadSuccess(false);
            }}
          >
            Add Another Song
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          size="lg"
          variant="accent"
          type={"button"}
          disabled={upLoadingSong > 0}
          onClick={async () => {
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
                description: "Please upload a cover image",
                variant: "destructive",
              });
              return;
            }
            const musicID = generateId();

            const success = await handleCreateSong({
              uploadMusicRequest: {
                title: song.title,
                artist: [userId],
                audioUrl: song.audioUrl,
                duration: song.duration,
                cover: song.cover || "",
                genre: song.genre.map((genre) => genre.value as string),
                isPublic: song.isPublic,
                _id: musicID,
              },
              musicFile: musicFile,
              coverFile: coverFile,
            });

            if (success) {
              setUploadSuccess(true);
            }
          }}
        >
          {upLoadingSong > 0 ? "Uploading..." : "Create"}
        </Button>
      )}
    </div>
  );
}
