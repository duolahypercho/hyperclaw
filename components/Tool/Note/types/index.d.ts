export interface NoteType {
  _id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  pinned: boolean;
  folderId: string;
  descendants: Descendant[];
  isTemp?: boolean;
}

export interface FolderType {
  _id: string;
  name: string;
  notesLength: number;
  pinned: boolean;
}

export interface FolderContentProps {
  _id: string;
  name: string;
  notes: NoteType[];
}

export interface SearchedNoteType {
  _id: string;
  folderId: string;
  title: string;
  content: string;
  term: string;
}
