import { NoteType } from "./types";

// Simple ID generator to avoid mongoose dependency
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 26);
};

export const createTempNote = (folderId: string): NoteType => {
  return {
    _id: generateId(),
    content: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    folderId: folderId || "",
    descendants: [
      {
        type: "paragraph",
        children: [{ text: "" }],
      },
    ],
    isTemp: true,
  };
};
