import { useCopanionAction } from "$/OS/AI/core";
import { ConfirmationDialog } from "$/OS/AI/components";
import { encode } from "@toon-format/toon";
import {
  getFolderAPI,
  getSingleNoteAPI,
  searchNoteAPI,
} from "$/services/tools/note";
import { NoteType, FolderType } from "../types";

interface UseNoteCopanionActionsProps {
  folders: FolderType[];
  folderId: string;
  currentNote: NoteType;
  handleCreateNote: (folderId?: string) => Promise<string | undefined>;
  handleEditNote: (
    noteId: string,
    folderId: string,
    content: string
  ) => Promise<void>;
  handleCreateFolder: (name?: string) => Promise<string | undefined>;
  handleDeleteNote: ({
    noteId,
    folderId,
  }: {
    noteId: string;
    folderId: string;
  }) => Promise<void>;
  handleDeleteFolder: (folderId: string) => Promise<void>;
  getNoteAPI: () => Promise<any>;
}

export function useNoteCopanionActions({
  folders,
  folderId: folderIdFromProps,
  currentNote,
  handleCreateNote,
  handleEditNote,
  handleCreateFolder,
  handleDeleteNote,
  handleDeleteFolder,
  getNoteAPI,
}: UseNoteCopanionActionsProps) {
  // Create a new folder
  useCopanionAction({
    name: "create_new_folder",
    description:
      "Create a new folder for organizing notes. Use this when user requests to create a new folder or organize notes into folders.",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "The name of the folder",
        example: "New Folder",
      },
    ],
    handler: async ({ name }) => {
      const newFolderId = await handleCreateFolder(name);
      if (!newFolderId) {
        return "Failed to create folder. Please try again.";
      }
      return `The new folder "${name}" has been created successfully. The folder ID is ${newFolderId}.`;
    },
  });

  // Create Note Action
  useCopanionAction(
    {
      name: "create_note",
      description:
        "Create a new note. Use this when user requests to create a new note or if you think it's necessary to create a note with the new content.",
      parameters: [
        {
          name: "folderId",
          type: "string",
          description: "The folder ID where the note should be created",
          example: "123",
          required: false,
        },
        {
          name: "content",
          type: "string",
          description: "The content of the note",
          example: "Hello world!",
          required: false,
        },
      ],
      renderAndWaitForResponse: (props) => {
        return (
          <ConfirmationDialog
            {...props}
            title="Create a new Note"
            description="Confirm to create a new note:"
            confirmLabel="Create Note"
            rejectLabel="Reject"
            onConfirm={async (args: any) => {
              const { folderId, content } = args;
              const response = await handleCreateNote(
                folderId || folderIdFromProps
              );
              if (!response) {
                return "Failed to create note. Please try again.";
              }
              await handleEditNote(
                response,
                folderId || folderIdFromProps,
                content || ""
              );
              return `The note has been created successfully. The note ID is ${response}.`;
            }}
            onReject="The note was not created."
          />
        );
      },
    },
    [folderIdFromProps]
  );

  // Get Folders Action
  useCopanionAction(
    {
      name: "get_folders",
      description:
        "Get all available folders. Use this when you need to know the folders or want to know the specific folder for the note you are trying to create. This is a list of all the folders that the user has created.",
      handler: async () => {
        if (folders.length === 0) {
          return "No folders found. Please create a new folder to get started.";
        }

        return `Here is the list of folders: ${encode(folders)}`;
      },
    },
    [folders]
  );

  // Get All Notes Action
  useCopanionAction({
    name: "get_all_notes",
    description:
      "Get all the notes under the folder. Use this when you need to see specific notes with filters. If you want to know what other notes the user has, use this tool. Only provide the filters that are relevant to the notes you are trying to get.",
    parameters: [
      {
        name: "filters",
        type: "object",
        attributes: [
          {
            name: "folderId",
            type: "string",
            description: "Filter by specific folder ID",
          },
        ],
        required: false,
      },
      {
        name: "limit",
        type: "number",
        description: "Maximum number of notes to return",
        required: false,
      },
    ],
    handler: async ({ filters, limit }) => {
      let notesToFilter: NoteType[] = [];

      try {
        if (filters?.folderId) {
          // Fetch notes for specific folder
          const response = await getFolderAPI({ folderId: filters.folderId });
          if (response.status === 200) {
            notesToFilter = response.data.notes || [];
          }
        } else {
          // Fetch all notes (get all folders and their notes)
          const noteData = await getNoteAPI();
          if (noteData.status === 200) {
            // Flatten all notes from all folders
            const allFolders = noteData.data.folder || [];
            for (const folder of allFolders) {
              const folderResponse = await getFolderAPI({
                folderId: folder._id,
              });
              if (folderResponse.status === 200) {
                notesToFilter = [
                  ...notesToFilter,
                  ...(folderResponse.data.notes || []),
                ];
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch notes from API:", error);
        // Fallback to in-memory notes
        notesToFilter = [];
      }

      // Apply client-side filters
      let filteredNotes = notesToFilter;

      if (filters) {
        if (filters.folderId) {
          filteredNotes = filteredNotes.filter(
            (n) => n.folderId === filters.folderId
          );
        }
      }

      if (limit) {
        filteredNotes = filteredNotes.slice(0, limit);
      }

      if (filteredNotes.length === 0) {
        return "No notes found.";
      }

      return `Here is the list of notes: ${encode(filteredNotes)}`;
    },
  });

  // Get Note Details Action
  useCopanionAction({
    name: "get_note_details",
    description:
      "Get detailed information about a specific note by its ID. Use this when you need to see the full note details including content, folder, and other metadata. This fetches fresh data from the API.",
    parameters: [
      {
        name: "noteId",
        type: "string",
        description: "The ID of the note to get details for",
        required: true,
      },
      {
        name: "folderId",
        type: "string",
        description: "The folder ID containing the note",
        required: true,
      },
    ],
    handler: async ({ noteId, folderId }) => {
      try {
        const response = await getSingleNoteAPI({
          noteId,
          folderId,
        });

        if (response.status !== 200) {
          return `Failed to fetch note details: Note with ID ${noteId} not found or could not be retrieved`;
        }

        // Return the note details as-is from the API
        return `Here is the note details: ${encode(response.data)}`;
      } catch (error) {
        console.error("Failed to fetch note details:", error);
        return `Failed to fetch note details: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    },
  });

  // Edit Note Action
  useCopanionAction({
    name: "edit_note",
    description:
      "Edit an existing note's content. Use this when you want to update the note content or user wants to modify a note. This will update the note content in the note list.",
    parameters: [
      {
        name: "noteId",
        type: "string",
        description: "The ID of the note to edit",
        required: true,
      },
      {
        name: "folderId",
        type: "string",
        description: "The folder ID containing the note",
        required: true,
      },
      {
        name: "content",
        type: "string",
        description: "The new content for the note",
        required: true,
      },
    ],
    renderAndWaitForResponse: (props) => {
      return (
        <ConfirmationDialog
          {...props}
          title="Update Note"
          description="Confirm to update the note with the following content:"
          confirmLabel="Update Note"
          rejectLabel="Reject"
          onConfirm={async (args: any) => {
            const { noteId, folderId, content } = args;

            if (!content) {
              return "No content provided. Please specify the note content to update.";
            }

            await handleEditNote(noteId, folderId, content);

            return `Note updated successfully.`;
          }}
          onReject="The note was not updated, and maintains its original contents."
        />
      );
    },
  });

  // Delete Note Action
  useCopanionAction({
    name: "delete_note",
    description:
      "Delete a note. Use this when the user requests to delete a note or if you think it's necessary to remove a note. This action cannot be undone.",
    parameters: [
      {
        name: "noteId",
        type: "string",
        description: "The ID of the note to delete",
        required: true,
      },
      {
        name: "folderId",
        type: "string",
        description: "The folder ID containing the note",
        required: true,
      },
    ],
    renderAndWaitForResponse: (props) => {
      return (
        <ConfirmationDialog
          {...props}
          title="Delete Note"
          description="Are you sure you want to delete this note? This action cannot be undone."
          confirmLabel="Delete Note"
          rejectLabel="Cancel"
          onConfirm={async (args: any) => {
            const { noteId, folderId } = args;
            await handleDeleteNote({ noteId, folderId });
            return `The note has been successfully deleted.`;
          }}
          onReject="The note was not deleted."
        />
      );
    },
  });

  // Delete Folder Action
  useCopanionAction({
    name: "delete_folder",
    description:
      "Delete a folder and all its notes. Use this when the user requests to delete a folder. This action cannot be undone and will delete all notes within the folder.",
    parameters: [
      {
        name: "folderId",
        type: "string",
        description: "The ID of the folder to delete",
        required: true,
      },
    ],
    renderAndWaitForResponse: (props) => {
      return (
        <ConfirmationDialog
          {...props}
          title="Delete Folder"
          description="Are you sure you want to delete this folder? This will permanently delete the folder and all notes within it. This action cannot be undone."
          confirmLabel="Delete Folder"
          rejectLabel="Cancel"
          onConfirm={async (args: any) => {
            const { folderId } = args;
            await handleDeleteFolder(folderId);
            return `The folder has been successfully deleted.`;
          }}
          onReject="The folder was not deleted."
        />
      );
    },
  });

  // Search Notes Action
  useCopanionAction({
    name: "search_notes",
    description:
      "Search for notes by content. Use this when the user wants to find notes containing specific text or keywords.",
    parameters: [
      {
        name: "searchQuery",
        type: "string",
        description: "The search query to find notes",
        example: "meeting notes",
        required: true,
      },
    ],
    handler: async ({ searchQuery }) => {
      try {
        const response = await searchNoteAPI({
          searchQuery,
        });

        if (response.status !== 200) {
          return `Failed to search notes: ${response.status}`;
        }

        if (!response.data || response.data.length === 0) {
          return `No notes found matching "${searchQuery}".`;
        }

        return `Found ${
          response.data.length
        } note(s) matching "${searchQuery}": ${encode(response.data)}`;
      } catch (error) {
        console.error("Failed to search notes:", error);
        return `Failed to search notes: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    },
  });

  // Get information about the current Note
  useCopanionAction(
    {
      name: "get_note_information",
      description:
        "Get information about the current note. Use this when you need to know the information about the current note. This will return the information about the current note.",
      handler: async () => {
        return `Here is the information about the current note: ${encode(
          currentNote
        )}`;
      },
    },
    [currentNote.content]
  );
}
