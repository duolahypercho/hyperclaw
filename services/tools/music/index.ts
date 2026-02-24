import { AxiosResponse } from "axios";
import { entrepriseApi } from "../../http.config";
import {
  getGenreResponse,
  uploadMusicResponse,
  getLibrarySongsResponse,
  deleteMusicResponse,
  updateMusicResponse,
  createMusicListResponse,
  getallPlaylistingsResponse,
  editMusicListResponse,
  addSongToPlaylistResponse,
  getSinglePlaylistResponse,
  getSingleSongResponse,
  reorderListingSongsResponse,
  getHomeSongsResponse,
} from "./responseTypes";

import {
  uploadMusicRequest,
  updateMusicRequest,
  createMusicListRequest,
  editMusicListRequest,
  addSongToPlaylistRequest,
  deleteSongFromPlaylistRequest,
  reorderListingSongsRequest,
} from "./requestTypes";

export const getGenreAPI = async (): Promise<
  AxiosResponse<getGenreResponse>
> => {
  return entrepriseApi.get(`/Tools/music/genre`);
};

export const getPlaylistsAPI = async (): Promise<
  AxiosResponse<getallPlaylistingsResponse>
> => {
  return entrepriseApi.get(`/Tools/music/listing`);
};

export const getHomeSongsAPI = async (
  page: number = 1,
  limit: number = 20,
  genreId?: string
): Promise<AxiosResponse<getHomeSongsResponse>> => {
  const genreParam = genreId ? `&genre=${genreId}` : '';
  return entrepriseApi.get(`/Tools/music/fetchNewSong?page=${page}&limit=${limit}${genreParam}`);
};

export const uploadMusicAPI = async (
  request: uploadMusicRequest
): Promise<AxiosResponse<uploadMusicResponse>> => {
  return entrepriseApi.post(`/Tools/music/song`, request);
};

export const deleteMusicListAPI = async (
  userId: string,
  id: string
): Promise<AxiosResponse<deleteMusicResponse>> => {
  return entrepriseApi.delete(`/Tools/music/listing/${userId}/${id}`);
};

export const deleteSongAPI = async (
  userId: string,
  id: string
): Promise<AxiosResponse<deleteMusicResponse>> => {
  return entrepriseApi.delete(`/Tools/music/song/${userId}/${id}`);
};

export const deleteSongFromPlaylistAPI = async (
  request: deleteSongFromPlaylistRequest
): Promise<AxiosResponse<deleteMusicResponse>> => {
  return entrepriseApi.post(`/Tools/music/removeSongFromListing`, request);
};

export const updateMusicAPI = async (
  request: updateMusicRequest
): Promise<AxiosResponse<updateMusicResponse>> => {
  return entrepriseApi.post(`/Tools/music/editSong`, request);
};

export const reorderListingSongsAPI = async (
  request: reorderListingSongsRequest
): Promise<AxiosResponse<reorderListingSongsResponse>> => {
  return entrepriseApi.post(`/Tools/music/editSongOrder`, request);
};

export const getLibrarySongsAPI = async (
  page?: number,
  limit?: number
): Promise<AxiosResponse<getLibrarySongsResponse>> => {
  return entrepriseApi.get(`/Tools/music/library?page=${page}&limit=${limit}`);
};

export const createMusicListAPI = async (
  request: createMusicListRequest
): Promise<AxiosResponse<createMusicListResponse>> => {
  return entrepriseApi.post(`/Tools/music/listing`, request);
};

export const editMusicListAPI = async (
  request: editMusicListRequest
): Promise<AxiosResponse<editMusicListResponse>> => {
  return entrepriseApi.post(`/Tools/music/editListing`, request);
};

export const addSongToPlaylistAPI = async (
  request: addSongToPlaylistRequest
): Promise<AxiosResponse<addSongToPlaylistResponse>> => {
  return entrepriseApi.post(`/Tools/music/addSongToListing`, request);
};

export const getSinglePlaylistAPI = async (
  id: string
): Promise<AxiosResponse<getSinglePlaylistResponse>> => {
  return entrepriseApi.get(`/Tools/music/singleListing/${id}`);
};

export const getSingleSongAPI = async (
  id: string
): Promise<AxiosResponse<getSingleSongResponse>> => {
  return entrepriseApi.get(`/Tools/music/song/${id}`);
};
