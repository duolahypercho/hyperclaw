export interface uploadMusicRequest {
  title: string;
  artist: string[];
  audioUrl: string;
  duration: number;
  cover: string;
  genre: string[];
  isPublic: boolean;
  _id: string;
}

export interface updateMusicRequest {
  _id: string;
  userId: string;
  title?: string;
  cover?: string;
  genre?: string[];
  isPublic?: boolean;
}

export interface createMusicListRequest {
  userId: string;
  name: string;
}

export interface editMusicListRequest {
  id: string;
  userId: string;
  name?: string;
  isPublic?: boolean;
  songs?: string[];
}

export interface addSongToPlaylistRequest {
  listingId: string;
  userId: string;
  songId: string;
}

export interface deleteSongFromPlaylistRequest {
  listingId: string;
  userId: string;
  songId: string;
}

export interface reorderListingSongsRequest {
  listingId: string;
  songId: string;
  userId: string;
  newIndex: number;
}

