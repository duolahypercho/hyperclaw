export type createNoteRequest = {
  noteId: string;
  folderId: string;
};

export type AddFolderRequest = {
  _id: string;
  name: string;
};

export type reorderFoldersRequest = {
  folderId: string;
  newIndex: number;
};

export type editNoteRequest = {
  folderId: string;
  content: string;
  noteId: string;
};

export type deleteFolderRequest = {
  folderId: string;
};

export type deleteNoteRequest = {
  noteId: string;
  folderId: string;
};

export type renameFolderRequest = {
  folderId: string;
  name: string;
};

export type searchNoteRequest = {
  searchQuery: string;
};

export type uploadAttachmentRequest = {
  folderId: string;
  noteId: string;
  attachment: string;
};
