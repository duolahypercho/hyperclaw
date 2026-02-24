import { ReactNode } from "react";
import { SelectOption } from "../../../UI/MutiSelect";

export interface MusicProviderProps {
  children: ReactNode;
}

export type MusicTabs = "home" | "create" | "playlist" | "library";

export interface ZSongGenre {
  _id: string;
  name: string;
  cover?: string;
}

export interface SidebarPlaylist {
  _id: string;
  name: string;
}

export interface ZPlaylistSong {
  addedAt: Date;
  song: Omit<ZSong, "playCount" | "createdAt" | "updatedAt" | "isPublic">;
}

export type ZHomeSong = Omit<
  ZSong,
  "playCount" | "createdAt" | "updatedAt" | "isPublic"
>;

export interface ZPlaylist {
  _id: string;
  name: string;
  owner: string;
  songs: ZPlaylistSong[];
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
}

export type ZSongCreate = Omit<ZSong, "genre"> & {
  genre: SelectOption[];
};

export type ZSongUpdate = Omit<
  ZSong,
  | "genre"
  | "artist"
  | "playCount"
  | "createdAt"
  | "updatedAt"
  | "audioUrl"
  | "duration"
  | "isLoading"
  | "error"
> & {
  genre: SelectOption[];
};

export interface ZSong {
  _id: string;
  title: string;
  artist: string[];
  audioUrl: string;
  duration: number;
  genre: string[];
  cover?: string;
  createdAt: Date;
  playCount: number;
  isPublic: boolean;
  isLoading?: boolean;
  error?: string;
}

export interface UploadFormData {
  title: string;
  description: string;
  isPublic: boolean;
  isInstrumental: boolean;
}

export interface UpdateMusicProps {
  title?: string;
  cover?: string;
  genre?: string[];
  isPublic?: boolean;
}
