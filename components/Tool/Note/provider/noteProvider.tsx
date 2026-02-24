import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
} from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { DragEndEvent } from "@dnd-kit/core";
import {
  FolderContentProps,
  FolderType,
  NoteType,
  SearchedNoteType,
} from "../types";
// Simple ID generator to avoid mongoose dependency
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 26);
};
import {
  createFolderAPI,
  createNoteAPI,
  getFolderAPI,
  reorderFoldersAPI,
  editNoteAPI,
  getSingleNoteAPI,
  deleteFolderAPI,
  renameFolderAPI,
  deleteNoteAPI,
  searchNoteAPI,
  uploadAttachmentAPI,
  getNoteAPI,
} from "$/services/tools/note";
import { useDebounce } from "$/hooks/isDebounce";
import { Descendant } from "slate";
import isEqual from "lodash/isEqual";
import { convertMarkdownToSlate, convertSlateToMarkdown } from "$/utils/Slate";
import { useService } from "$/Providers/ServiceProv";
import { Folder, Plus, File, Trash, Pencil } from "lucide-react";
import { menuItem } from "@OS/utils/contextMenu";
import { AppSchema, defaultAppSchema } from "@OS/Layout/types";
import { DialogData } from "@OS/Layout/Dialog/DialogSchema";
import { useOS } from "@OS/Provider/OSProv";
import { createTempNote } from "../utils";
import { useNoteCopanionActions } from "../hooks/useNoteCopanionActions";

interface exportedValue {
  selectedNote: NoteType;
  selectedFolders: Record<string, FolderContentProps>;
  folders: FolderType[];
  searchedNotes: SearchedNoteType[];
  noteLoading: boolean;
  searchLoading: boolean;
  currentFolder: FolderContentProps | null;
  searchTerm: string;
  showSearchContainer: boolean;
  initialDescendant: Descendant[];
  syncing: boolean;
  toggleSearchContainer: () => void;
  handleDragEndLists: (event: DragEndEvent) => void;
  handleSelectFolder: (folder: FolderType | null) => void;
  handleCreateFolder: (name?: string) => Promise<string | undefined>;
  handleImageUpload: (file: File) => Promise<string | undefined>;
  handleOnSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleUpdateNote: (value: Descendant[]) => void;
  handleUpdateNoteOnChange: (value: string) => void;
  handleBackToFolder: () => void;
  handleCreateNote: (folderId?: string) => Promise<string | undefined>;
  handleRenameFolder: (folderId: string, newName: string) => void;
  handleDeleteFolder: (folderId: string) => void;
  handleSelectNote: ({
    nodeId,
    folderId,
  }: {
    nodeId: string;
    folderId: string;
  }) => void;
  handleDeleteNote: ({
    noteId,
    folderId,
  }: {
    noteId: string;
    folderId: string;
  }) => void;
  renderNotePreview: (content: string) => { title: string; content: string };
  appSchema: AppSchema;
}

const initialState: exportedValue = {
  selectedNote: createTempNote(""),
  folders: [],
  noteLoading: false,
  searchLoading: false,
  syncing: false,
  searchedNotes: [],
  selectedFolders: {},
  currentFolder: null,
  searchTerm: "",
  showSearchContainer: false,
  initialDescendant: [],
  toggleSearchContainer: () => {},
  handleDragEndLists: () => {},
  handleSelectFolder: () => {},
  handleImageUpload: () => {
    return Promise.resolve("");
  },
  handleCreateFolder: () => {
    return Promise.resolve("");
  },
  handleOnSearch: () => {},
  handleSelectNote: () => {},
  handleUpdateNote: () => {},
  handleUpdateNoteOnChange: () => {},
  handleBackToFolder: () => {},
  handleCreateNote: () => {
    return Promise.resolve("");
  },
  handleRenameFolder: () => {},
  handleDeleteFolder: () => {},
  handleDeleteNote: () => {},
  renderNotePreview: () => ({ title: "", content: "" }),
  appSchema: defaultAppSchema,
};

const NoteContext = createContext<exportedValue>(initialState);

export function NoteProvider({ children }: { children: ReactNode }) {
  const { updateAppSettings } = useOS();
  const [selectedNote, setSelectedNote] = useState<NoteType>(
    createTempNote("")
  );
  const [descendantContent, setDescendantContent] = useState<Descendant[]>(
    selectedNote?.descendants || []
  );
  const { uploadFileToCloud } = useService();
  const [isSaveNote, setIsSaveNote] = useState(false);
  const debouncedContent = useDebounce(descendantContent, 300); // Debounce the content
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [showSearchContainer, setShowSearchContainer] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<FolderContentProps | null>(
    null
  );
  const [syncing, setSyncing] = useState(false); //syncing the note to the backend
  const [noteLoading, setNoteLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedNotes, setSearchedNotes] = useState<SearchedNoteType[]>([]);
  const [sidebarStyle, setSidebarStyle] = useState<
    "search" | "folder" | "list"
  >("list");
  const [selectedFolders, setSelectedFolders] = useState<
    Record<string, FolderContentProps>
  >({});
  const [activeTabId, setActiveTabId] = useState<string | undefined>(undefined);

  // Update currentActiveTab in app settings whenever currentTab changes
  useEffect(() => {
    updateAppSettings("note", {
      currentActiveTab: selectedNote?._id || "",
    });
    setDescendantContent(selectedNote?.descendants || []);
  }, [selectedNote]);

  useEffect(() => {
    if (isSaveNote) {
      const markdown = convertSlateToMarkdown(descendantContent);
      // Function to normalize content, preserving consecutive newlines
      const normalizeContent = (text: string) =>
        text
          .replace(/\r\n|\r/g, "\n") // Normalize all line breaks to \n
          .replace(/(\n\s*\n)+/g, "\n\n") // Ensure only one blank line between sections
          .trim(); // Remove leading and trailing whitespace only

      const normalizedMarkdown = normalizeContent(markdown);
      const normalizedSelectedContent = normalizeContent(
        selectedNote?.content || ""
      );

      if (normalizedMarkdown === normalizedSelectedContent) {
        setIsSaveNote(false);
        return;
      }

      saveDataToBackend(markdown);
      setIsSaveNote(false);
    }
  }, [debouncedContent]);

  useEffect(() => {
    if (debouncedSearchTerm && showSearchContainer) {
      if (debouncedSearchTerm.length > 3) {
        handleSearchNote(debouncedSearchTerm);
      }
    }
  }, [debouncedSearchTerm]);

  useEffect(() => {
    initialLoad();
  }, []);

  const handleDragEndLists = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    if (active.id !== over.id) {
      try {
        const oldIndex = folders.findIndex(
          (folder) => folder._id === active.id
        );
        const newIndex = folders.findIndex((folder) => folder._id === over.id);

        const newFolders = arrayMove(folders, oldIndex, newIndex);
        setFolders(newFolders);

        const ReorderToDoDataAPI = await reorderFoldersAPI({
          folderId: active.id as string,
          newIndex: newIndex as number,
        });

        if (ReorderToDoDataAPI.status !== 200) {
          throw new Error("Failed to reorder list");
        }
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handleSelectFolder = async (folder: FolderType | null) => {
    if (folder) {
      // Check if folder data is already loaded
      if (folder._id === currentFolder?._id) {
        setCurrentFolder(null);
        return;
      }

      if (selectedFolders[folder._id]) {
        setCurrentFolder(selectedFolders[folder._id]);
        return;
      }

      const getFolderAPIResponse = await getFolderAPI({
        folderId: folder._id,
      });
      if (getFolderAPIResponse.status !== 200) {
        throw new Error("Failed to get folder");
      }
      // Sort notes by updatedAt before setting the current folder
      const sortedNotes = [...getFolderAPIResponse.data.notes]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .map((note) => ({
          ...note,
          folderId: folder._id,
        }));

      const folderData = {
        ...getFolderAPIResponse.data,
        notes: sortedNotes,
      };

      // Store the folder data
      setSelectedFolders((prev) => ({
        ...prev,
        [folder._id]: folderData,
      }));

      setCurrentFolder(folderData);
    } else {
      setCurrentFolder(null);
    }
  };

  const handleCreateFolder = async (name?: string) => {
    try {
      const newObjectId = generateId();
      setFolders([
        ...folders,
        {
          _id: newObjectId,
          name: name || "New Folder",
          notesLength: 0,
          pinned: false,
        },
      ]);
      const createFolderAPIResponse = await createFolderAPI({
        _id: newObjectId,
        name: name || "New Folder",
      });
      if (createFolderAPIResponse.status !== 200) {
        throw new Error("Failed to create folder");
      }
      setSelectedFolders((prev) => ({
        ...prev,
        [newObjectId]: {
          _id: newObjectId,
          name: name || "New Folder",
          notesLength: 0,
          pinned: false,
          notes: [],
        },
      }));
      return newObjectId;
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateNote = async (folderId?: string) => {
    try {
      setNoteLoading(true);
      let newFolderId = "";
      const newObjectId = generateId();
      let newNote: NoteType;

      // Use provided folderId if available, otherwise fallback to current folder or first folder
      newFolderId = folderId || currentFolder?._id || folders[0]?._id || "";

      // Validate that we have a valid folder ID
      if (!newFolderId) {
        throw new Error("No valid folder ID found");
      }

      newNote = {
        _id: newObjectId,
        content: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        pinned: false,
        folderId: newFolderId,
        descendants: [
          {
            type: "paragraph",
            children: [{ text: "" }],
          },
        ],
      };

      // Update selectedFolders with the new note
      setSelectedFolders((prev) => {
        const existingFolder = prev[newFolderId];
        const folderFromList = folders.find((f) => f._id === newFolderId);

        // If folder doesn't exist in selectedFolders, create a basic structure
        if (!existingFolder) {
          return {
            ...prev,
            [newFolderId]: {
              _id: newFolderId,
              name: folderFromList?.name || "New Folder",
              notesLength: folderFromList?.notesLength || 0,
              pinned: folderFromList?.pinned || false,
              notes: [newNote],
            },
          };
        }

        // Folder exists, add note to it
        return {
          ...prev,
          [newFolderId]: {
            ...existingFolder,
            notes: [newNote, ...(existingFolder.notes || [])],
          },
        };
      });

      setSelectedNote(newNote);

      setFolders(
        folders.map((folder) =>
          folder._id === newFolderId
            ? { ...folder, notesLength: folder.notesLength + 1 }
            : folder
        )
      );

      const createNoteAPIResponse = await createNoteAPI({
        noteId: newObjectId,
        folderId: newFolderId,
      });

      if (createNoteAPIResponse.status !== 200) {
        throw new Error("Failed to create note");
      }

      return newObjectId;
    } catch (error) {
      console.error(error);
    } finally {
      setNoteLoading(false);
    }
  };

  const handleSelectNote = async ({
    nodeId,
    folderId,
  }: {
    nodeId: string;
    folderId: string;
  }) => {
    try {
      setNoteLoading(true);
      const getSingleNoteAPIResponse = await getSingleNoteAPI({
        noteId: nodeId,
        folderId: folderId,
      });
      if (getSingleNoteAPIResponse.status !== 200) {
        throw new Error("Failed to get note");
      }
      // set selected note
      const slateContent =
        convertMarkdownToSlate(getSingleNoteAPIResponse.data.content) || [];

      setSelectedNote({
        ...getSingleNoteAPIResponse.data,
        folderId: folderId,
        descendants: slateContent,
      });
      setActiveTabId(nodeId);
    } catch (error) {
      console.error(error);
    } finally {
      setNoteLoading(false);
    }
  };

  const handleOnSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const renderNotePreview = (content: string) => {
    // If content is empty, return default values
    if (!content) {
      return { title: "Untitled", content: "Empty note..." };
    }

    // Simple text-based approach instead of JSON parsing
    const lines = content.split("\n").filter((line) => line.trim());

    // Use first non-empty line as title, or default if none
    const title = lines[0]?.trim() || "Untitled";

    // Use remaining lines as content, or default if none
    const contentText = lines.slice(1).join("\n").trim() || "Empty note...";

    return {
      title,
      content: contentText,
    };
  };

  const saveDataToBackend = async (value: string) => {
    try {
      if (!selectedNote) {
        throw new Error("No note selected");
      }
      setSyncing(true);
      const editNoteAPIResponse = await editNoteAPI({
        folderId: selectedNote.folderId,
        content: value,
        noteId: selectedNote._id,
      });

      if (editNoteAPIResponse.status !== 200) {
        throw new Error("Failed to edit note");
      }
      // Update selectedNote with the latest content
      const updatedNote = {
        ...selectedNote,
        content: value,
        updatedAt: new Date(),
      };
      setSelectedNote(updatedNote);
      // Update selectedFolders to keep it in sync
      if (selectedFolders[selectedNote.folderId]) {
        setSelectedFolders((prev) => {
          const folderData = prev[selectedNote.folderId];
          const noteExists = folderData.notes.some(
            (note) => note._id === selectedNote._id
          );

          if (noteExists) {
            // Update existing note
            return {
              ...prev,
              [selectedNote.folderId]: {
                ...folderData,
                notes: folderData.notes.map((note) =>
                  note._id === selectedNote._id ? updatedNote : note
                ),
              },
            };
          } else {
            // Add note if it doesn't exist in selectedFolders
            return {
              ...prev,
              [selectedNote.folderId]: {
                ...folderData,
                notes: [updatedNote, ...folderData.notes],
              },
            };
          }
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateNote = async (value: Descendant[]) => {
    try {
      if (!selectedNote) {
        throw new Error("No note selected");
      }

      // Prevent updating if value is empty or unchanged
      if (value.length === 0 || isEqual(value, descendantContent)) {
        return;
      }
      setDescendantContent(value);
      setIsSaveNote(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateNoteOnChange = async (value: string) => {
    if (!selectedNote || !currentFolder) return;
    if (value === selectedNote.content) return;

    if (selectedFolders[currentFolder._id]) {
      setSelectedFolders((prev) => ({
        ...prev,
        [currentFolder._id]: {
          ...prev[currentFolder._id],
          notes: prev[currentFolder._id].notes.map((note) =>
            note._id === selectedNote._id ? { ...note, content: value } : note
          ),
        },
      }));
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      setSelectedFolders((prev) => ({
        ...prev,
        [folderId]: {
          ...prev[folderId],
          name: newName,
        },
      }));

      setFolders(
        folders.map((folder) =>
          folder._id === folderId ? { ...folder, name: newName } : folder
        )
      );
      const renameFolderAPIResponse = await renameFolderAPI({
        folderId: folderId,
        name: newName,
      });
      if (renameFolderAPIResponse.status !== 200) {
        throw new Error("Failed to rename folder");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      if (folderId === selectedNote?.folderId) {
        setSelectedNote(createTempNote(""));
      }

      setCurrentFolder(null);

      // Remove folder from selectedFolders cache
      setSelectedFolders((prev) => {
        const newSelectedFolders = { ...prev };
        delete newSelectedFolders[folderId];
        return newSelectedFolders;
      });

      // Remove folder from folders list

      //delete current folder
      const deleteFolderAPIResponse = await deleteFolderAPI({
        folderId: folderId,
      });

      setFolders(folders.filter((folder) => folder._id !== folderId));

      if (deleteFolderAPIResponse.status !== 200) {
        throw new Error("Failed to delete folder");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteNote = async ({
    noteId,
    folderId,
  }: {
    noteId: string;
    folderId: string;
  }) => {
    try {
      if (noteId === selectedNote?._id) {
        setSelectedNote(createTempNote(currentFolder?._id || ""));
      }
      // Update selectedFolders - only if folder exists
      setSelectedFolders((prev) => {
        if (!prev[folderId]) {
          // Folder doesn't exist in selectedFolders, skip update
          return prev;
        }
        return {
          ...prev,
          [folderId]: {
            ...prev[folderId],
            notes: prev[folderId].notes.filter((note) => note._id !== noteId),
          },
        };
      });

      // Update folders count
      setFolders(
        folders.map((folder) =>
          folder._id === folderId
            ? { ...folder, notesLength: Math.max(0, folder.notesLength - 1) }
            : folder
        )
      );

      const deleteNoteAPIResponse = await deleteNoteAPI({
        noteId: noteId,
        folderId: folderId,
      });
      if (deleteNoteAPIResponse.status !== 200) {
        throw new Error("Failed to delete note");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSearchNote = async (term: string) => {
    try {
      setSearchLoading(true);
      const searchNoteAPIResponseRaw = await searchNoteAPI({
        searchQuery: term,
      });

      if (searchNoteAPIResponseRaw.status !== 200) {
        throw new Error("Failed to search note");
      }

      setSearchedNotes(searchNoteAPIResponseRaw.data);
      setSearchLoading(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleBackToFolder = () => {
    setCurrentFolder(null);
  };

  const toggleSearchContainer = () => {
    if (showSearchContainer) {
      setSearchTerm("");
      setSearchedNotes([]);
    }
    setShowSearchContainer(!showSearchContainer);
  };

  // Wrapper function for editing notes via companion actions
  const handleEditNoteForCompanion = async (
    noteId: string,
    folderId: string,
    content: string
  ) => {
    try {
      setSyncing(true);
      const editNoteAPIResponse = await editNoteAPI({
        folderId,
        content,
        noteId,
      });

      if (editNoteAPIResponse.status !== 200) {
        throw new Error("Failed to edit note");
      }

      // Convert content to Slate format
      const slateContent = convertMarkdownToSlate(content) || [];

      // Update selectedNote if it's the note being edited
      if (selectedNote && selectedNote._id === noteId) {
        const updatedNote = {
          ...selectedNote,
          content,
          updatedAt: new Date(),
          descendants: slateContent,
        };
        setSelectedNote(updatedNote);
        setDescendantContent(slateContent);
      } else {
        // If note is not selected, fetch it and select it
        // This ensures the note is visible in the UI after creation
        const noteResponse = await getSingleNoteAPI({
          noteId,
          folderId,
        });
        if (noteResponse.status === 200) {
          const fullNote = {
            ...noteResponse.data,
            folderId,
            descendants: slateContent,
          };
          setSelectedNote(fullNote);
          setDescendantContent(slateContent);
        }
      }

      // Ensure folder is loaded in selectedFolders
      if (!selectedFolders[folderId]) {
        // Load the folder if it's not already loaded
        const folderResponse = await getFolderAPI({ folderId });
        if (folderResponse.status === 200) {
          const sortedNotes = [...folderResponse.data.notes]
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
            )
            .map((note) => ({
              ...note,
              folderId,
            }));

          const folderData = {
            ...folderResponse.data,
            notes: sortedNotes,
          };

          setSelectedFolders((prev) => ({
            ...prev,
            [folderId]: folderData,
          }));

          // Set current folder if it's not set or if it's different
          if (!currentFolder || currentFolder._id !== folderId) {
            setCurrentFolder(folderData);
          }
        }
      } else {
        // Update selectedFolders to keep it in sync
        setSelectedFolders((prev) => {
          const folderData = prev[folderId];
          const noteExists = folderData.notes.some(
            (note) => note._id === noteId
          );

          if (noteExists) {
            // Update existing note
            return {
              ...prev,
              [folderId]: {
                ...folderData,
                notes: folderData.notes.map((note) =>
                  note._id === noteId
                    ? {
                        ...note,
                        content,
                        updatedAt: new Date(),
                      }
                    : note
                ),
              },
            };
          } else {
            // Add note if it doesn't exist in selectedFolders
            const updatedNote = {
              _id: noteId,
              content,
              createdAt: new Date(),
              updatedAt: new Date(),
              pinned: false,
              folderId,
              descendants: slateContent,
            };
            return {
              ...prev,
              [folderId]: {
                ...folderData,
                notes: [updatedNote, ...folderData.notes],
              },
            };
          }
        });
      }
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      if (!selectedNote) {
        throw new Error("No note selected");
      }

      const uploadFileToCloudResponse = await uploadFileToCloud(
        file,
        "image",
        `note/${selectedNote?._id}/`
      );
      if (uploadFileToCloudResponse) {
        const uploadAttachmentAPIResponse = await uploadAttachmentAPI({
          folderId: selectedNote?.folderId || "",
          noteId: selectedNote?._id || "",
          attachment: uploadFileToCloudResponse,
        });
        if (uploadAttachmentAPIResponse.status !== 200) {
          throw new Error("Failed to upload attachment");
        }
        return uploadFileToCloudResponse;
      }
      return "";
    } catch (error) {
      console.error(error);
      return "";
    }
  };

  const initialLoad = async () => {
    try {
      const noteAPIResponse = (await getNoteAPI()).data;
      setFolders(noteAPIResponse.folder);
      setCurrentFolder(noteAPIResponse.currentFolder || null);
      setSelectedFolders((prev) => ({
        ...prev,
        [noteAPIResponse.currentFolder?._id || ""]:
          noteAPIResponse.currentFolder || {},
      }));
      setSelectedNote(
        noteAPIResponse.recentNote
          ? {
              ...noteAPIResponse.recentNote,
              descendants: convertMarkdownToSlate(
                noteAPIResponse.recentNote.content
              ),
            }
          : createTempNote(noteAPIResponse.folder[0]?._id || "")
      );
      setDescendantContent(
        convertMarkdownToSlate(noteAPIResponse.recentNote?.content || "") || []
      );
      setActiveTabId(noteAPIResponse.recentNote?._id || "");
    } catch (error) {
      console.error(error);
    }
  };

  // Wrapper function for getNoteAPI
  const getNoteAPIWrapper = async () => {
    return await getNoteAPI();
  };

  // Setup copanion actions
  useNoteCopanionActions({
    folders,
    folderId: currentFolder?._id || "",
    currentNote: selectedNote,
    handleCreateNote,
    handleEditNote: handleEditNoteForCompanion,
    handleCreateFolder,
    handleDeleteNote,
    handleDeleteFolder,
    getNoteAPI: getNoteAPIWrapper,
  });

  const appSchema: AppSchema = useMemo(() => {
    return {
      sidebar: {
        sections: [
          {
            id: "note-folders",
            title: "Files",
            items: folders
              ? [
                  ...folders.map((folder) => ({
                    id: folder._id,
                    title: `${folder.name} (${folder.notesLength})`,
                    icon: Folder,
                    onClick: () => {
                      handleSelectFolder(folder);
                      setSidebarStyle("list");
                    },
                    contextMenu: [
                      menuItem({
                        label: "Add Note",
                        icon: Plus,
                        onClick: () => handleCreateNote(folder._id),
                      }),
                      menuItem({
                        label: "Rename",
                        icon: Pencil,
                        dialog: {
                          id: "rename-folder",
                          data: {
                            folderId: folder._id,
                            folderName: folder.name,
                          },
                        },
                      }),
                      menuItem({
                        label: "Delete",
                        icon: Trash,
                        dialog: {
                          id: "delete-folder",
                          data: {
                            folderId: folder._id,
                          },
                        },
                        variant: "destructive",
                      }),
                    ],
                    items: [
                      ...(selectedFolders[folder._id]?.notes || []).map(
                        (note) => ({
                          id: note._id,
                          title: renderNotePreview(note.content).title,
                          icon: File,
                          isDraggable: false,
                          onClick: () =>
                            handleSelectNote({
                              nodeId: note._id,
                              folderId: folder._id,
                            }),
                          contextMenu: [
                            menuItem({
                              label: "Delete",
                              icon: Trash,
                              dialog: {
                                id: "delete-note",
                                data: {
                                  noteId: note._id,
                                  folderId: folder._id,
                                },
                              },
                              variant: "destructive",
                            }),
                          ],
                        })
                      ),
                      {
                        id: "create-new-note",
                        title: "Create new note",
                        icon: Plus,
                        isDraggable: false,
                        onClick: () => handleCreateNote(folder._id),
                      },
                    ],
                  })),
                ]
              : [],
          },
        ],
        footer: [
          {
            id: "note-footer",
            items: [
              /*               {
                id: "search-note",
                title: "Search note",
                icon: Search,
                onClick: () => toggleSearchContainer(),
              }, */
              {
                id: "create-new-folder",
                title: "Create new folder",
                icon: Plus,
                onClick: () => handleCreateFolder(),
              },
              {
                id: "create-new-note",
                title: "Create new note",
                icon: Plus,
                onClick: () => handleCreateNote(),
              },
            ],
          },
        ],
      },
      dialogs: [
        {
          id: "rename-folder",
          title: "Rename folder",
          description: "Enter a new name for your folder",
          type: "form",
          formProps: {
            formId: "rename-folder",
            persistenceStrategy: "close",
            schemaConfig: {
              folderName: {
                key: "folderName",
                type: "input",
                display: "Folder Name",
                placeholder: "Enter folder name",
                required: true,
                requiredMessage: "Folder name is required",
                minLength: 1,
                maxLength: 50,
                lengthHint: true,
                defaultValue: "",
                layout: "column",
                description: "Enter a new name for your folder",
                hintMessage: "Maximum 50 characters",
              },
            },
          },
          actions: {
            primary: {
              id: "rename-folder-action",
              label: "Rename",
              onClick: async (data?: DialogData) => {
                if (data?.dialogData?.folderId && data?.formData?.folderName) {
                  await handleRenameFolder(
                    data.dialogData.folderId,
                    data.formData.folderName
                  );
                }
              },
            },
            close: {
              id: "cancel-rename-folder-action",
              label: "Cancel",
            },
          },
        },
        {
          id: "delete-note",
          title: "Delete note",
          description:
            "This action cannot be undone. This will permanently delete your note and remove your data from our servers.",
          type: "alert",
          actions: {
            confirm: {
              id: "delete-note-action",
              label: "Delete",
              onClick: async (data?: DialogData) => {
                if (data?.dialogData?.noteId && data?.dialogData?.folderId) {
                  await handleDeleteNote({
                    noteId: data.dialogData.noteId,
                    folderId: data.dialogData.folderId,
                  });
                }
              },
            },
            close: {
              id: "cancel-delete-note-action",
              label: "Cancel",
            },
          },
        },
        {
          id: "delete-folder",
          title: "Delete Folder",
          description:
            "This action cannot be undone. This will permanently delete your entire folder and remove your data from our servers.",
          type: "alert",
          actions: {
            confirm: {
              id: "delete-folder-action",
              label: "Delete",
              onClick: async (data?: DialogData) => {
                if (data?.dialogData?.folderId) {
                  await handleDeleteFolder(data.dialogData.folderId);
                }
              },
            },
            close: {
              id: "cancel-delete-folder-action",
              label: "Cancel",
            },
          },
        },
      ],
    };
  }, [
    sidebarStyle,
    currentFolder,
    folders,
    selectedFolders,
    handleDragEndLists,
    handleSelectFolder,
    handleCreateFolder,
    activeTabId,
  ]);

  const value: exportedValue = {
    selectedNote,
    noteLoading,
    selectedFolders,
    handleImageUpload,
    searchedNotes,
    searchLoading,
    showSearchContainer,
    folders,
    currentFolder,
    searchTerm,
    syncing,
    initialDescendant: descendantContent,
    toggleSearchContainer,
    handleDragEndLists,
    handleSelectFolder,
    handleCreateFolder,
    handleOnSearch,
    handleSelectNote,
    handleCreateNote,
    handleUpdateNote,
    handleUpdateNoteOnChange,
    handleBackToFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleDeleteNote,
    renderNotePreview,
    appSchema,
  };

  return <NoteContext.Provider value={value}>{children}</NoteContext.Provider>;
}

export function useNote() {
  const context = useContext(NoteContext);
  if (context === undefined) {
    throw new Error("useNote must be used within a NoteProvider");
  }
  return context;
}
