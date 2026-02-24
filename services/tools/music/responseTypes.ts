import {
  SidebarPlaylist,
  ZHomeSong,
  ZPlaylist,
  ZSong,
} from "../../../components/Tool/Music/Provider/types";

export type getGenreResponse = {
  success: boolean;
  data: {
    _id: string;
    name: string;
    cover: string;
  }[];
};

export type uploadMusicResponse = {
  success: boolean;
  data: any;
};

export type getLibrarySongsResponse = {
  success: boolean;
  data: ZSong[];
};

export type deleteMusicResponse = {
  success: boolean;
};

export type deleteMusicListResponse = {
  success: boolean;
};

export type updateMusicResponse = {
  success: boolean;
};

export type createMusicListResponse = {
  success: boolean;
  data: ZPlaylist;
};

export type getallPlaylistingsResponse = {
  success: boolean;
  data: SidebarPlaylist[];
};

export type editMusicListResponse = {
  success: boolean;
};

export type addSongToPlaylistResponse = {
  success: boolean;
};

export type getSinglePlaylistResponse = {
  success: boolean;
  data: ZPlaylist;
};

export type getSingleSongResponse = {
  success: boolean;
  data: ZSong;
};

export type reorderListingSongsResponse = {
  success: boolean;
};

export type getHomeSongsResponse = {
  success: boolean;
  data: ZHomeSong[];
};
