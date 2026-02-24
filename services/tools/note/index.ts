import { entrepriseApi } from "../../http.config";
import {
  AddFolderRequest,
  createNoteRequest,
  reorderFoldersRequest,
  editNoteRequest,
  deleteFolderRequest,
  deleteNoteRequest,
  renameFolderRequest,
  searchNoteRequest,
  uploadAttachmentRequest,
} from "./type";

export const getNoteAPI = async () => {
  return entrepriseApi.get(`/Tools/note/fetchNote`);
};

export const getFolderAPI = async ({ folderId }: { folderId: string }) => {
  return entrepriseApi.get(`/Tools/note/fetchFolder/${folderId}`);
};

export const getSingleNoteAPI = async ({
  folderId,
  noteId,
}: {
  folderId: string;
  noteId: string;
}) => {
  return entrepriseApi.get(`/Tools/note/fetchSingleNote/${folderId}/${noteId}`);
};

export const editNoteAPI = async (data: editNoteRequest) => {
  return entrepriseApi.post("/Tools/note/updateNote", data);
};

export const renameFolderAPI = async (data: renameFolderRequest) => {
  return entrepriseApi.post("/Tools/note/editFolderName", data);
};

export const createNoteAPI = async (data: createNoteRequest) => {
  return entrepriseApi.post("/Tools/note/createNote", data);
};

export const createFolderAPI = async (data: AddFolderRequest) => {
  return entrepriseApi.post("/Tools/note/createFolder", data);
};

export const reorderFoldersAPI = async (data: reorderFoldersRequest) => {
  return entrepriseApi.post("/Tools/note/reorderFolder", data);
};

export const deleteFolderAPI = async (data: deleteFolderRequest) => {
  return entrepriseApi.post("/Tools/note/deleteFolder", data);
};

export const deleteNoteAPI = async (data: deleteNoteRequest) => {
  return entrepriseApi.post("/Tools/note/deleteNote", data);
};

export const searchNoteAPI = async (data: searchNoteRequest) => {
  return entrepriseApi.post("/Tools/note/searchNote", data);
};

export const uploadAttachmentAPI = async (data: uploadAttachmentRequest) => {
  return entrepriseApi.post("/Tools/note/uploadAttachment", data);
};
