import useAutosizeTextArea from "../../../hooks/use-autosize-textarea";
import {
  EditingEditorState,
  Generator_InsertionOrEditingSuggestion,
} from "../../../types/autosuggestions-bare-function";
import { SourceSearchBox } from "../../source-search-box";
import { Label } from "../../../../../../src/components/ui/label";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamPromiseFlatten } from "../../../lib/stream-promise-flatten";
import { IncludedFilesPreview } from "./included-files-preview";
import { useCopanionkit, DocumentPointer } from "$/OS/AI/core/copanionkit";
import { Ban, CornerDownLeft, LoaderCircle } from "lucide-react";
import { Transforms, Editor, Point, Range, Text } from "slate";
import { useSlate, useSlateSelection } from "slate-react";
import { HistoryEditor } from "slate-history";

export type SuggestionState = {
  editorState: EditingEditorState;
};

export interface HoveringInsertionPromptBoxCoreProps {
  state: SuggestionState;
  performInsertion: (insertedText: string) => void;
  insertionOrEditingFunction: Generator_InsertionOrEditingSuggestion;
  contextCategories: string[];
  closeWindow: () => void;
  revertToOriginal: () => void;
  setIsUpdated: (isUpdated: boolean) => void;
  markdownMode?: boolean;
}

export const HoveringInsertionPromptBoxCore = ({
  performInsertion,
  state,
  insertionOrEditingFunction,
  contextCategories,
  closeWindow,
  revertToOriginal,
  setIsUpdated,
  markdownMode,
}: HoveringInsertionPromptBoxCoreProps) => {
  const { getDocumentsContext } = useCopanionkit();

  const [editSuggestion, setEditSuggestion] = useState<string>("");
  const [suggestionIsLoading, setSuggestionIsLoading] =
    useState<boolean>(false);

  const [adjustmentPrompt, setAdjustmentPrompt] = useState<string>("");

  const [generatingSuggestion, setGeneratingSuggestion] =
    useState<ReadableStream<string> | null>(null);

  const adjustmentTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const [filePointers, setFilePointers] = useState<DocumentPointer[]>([]);

  const [suggestedFiles, setSuggestedFiles] = useState<DocumentPointer[]>([]);
  const editor = useSlate();
  const selection = useSlateSelection();
  // Ref to store the editor's state before generation starts
  const previousContentRef = useRef<any[] | null>(null);
  // Ref to track inserted text length
  const insertedTextLengthRef = useRef(0);
  const [CHUNK_SIZE, setCHUNK_SIZE] = useState(3);

  useEffect(() => {
    setSuggestedFiles(getDocumentsContext(contextCategories));
  }, [contextCategories, getDocumentsContext]);

  useAutosizeTextArea(suggestionTextAreaRef, editSuggestion || "");
  useAutosizeTextArea(adjustmentTextAreaRef, adjustmentPrompt || "");

  // initially focus on the adjustment prompt text area
  useEffect(() => {
    adjustmentTextAreaRef.current?.focus();
  }, []);

  // continuously read the generating suggestion stream and update the edit suggestion
  useEffect(() => {
    // if no generating suggestion, do nothing
    // Check if the stream is already locked (i.e. already reading from it)
    if (!generatingSuggestion || generatingSuggestion.locked || !selection) {
      return;
    }

    const originalContent = [...editor.children];

    // Function to force a history checkpoint
    const createHistoryCheckpoint = () => {
      Transforms.insertText(editor, ""); // Insert an empty string to create a checkpoint
    };
    // Save the start state to history
    createHistoryCheckpoint();
    // reset the edit suggestion
    setEditSuggestion("");

    previousContentRef.current = originalContent;

    // read the generating suggestion stream and continuously update the edit suggestion
    const reader = generatingSuggestion.getReader();
    let isCancelled = false;
    const buffer: string[] = []; // Use an array to store incoming characters
    let generatedText = "";
    let isEnded = false;

    const insertText = (text: string) => {
      if (isCancelled) {
        return;
      }

      // Original plain text handling
      const parts = text.split("\n");
      HistoryEditor.withMerging(editor, () => {
        parts.forEach((part, index) => {
          if (part.length > 0) {
            Editor.insertText(editor, part);
          }
          if (index < parts.length - 1) {
            Editor.insertBreak(editor);
          }
        });
      });
      // Accumulate the inserted text
      insertedTextLengthRef.current += text.length;
      generatedText += text;
    };

    const readFromStream = async () => {
      setSuggestionIsLoading(true);

      try {
        while (!isCancelled) {
          const { done, value } = await reader.read();
          if (done) {
            isEnded = true;
            setCHUNK_SIZE(10);
            setSuggestionIsLoading(false);
            break;
          }
          if (value) {
            buffer.push(...value);
          }
        }
      } catch (error) {
        console.error("Stream read error:", error);
      }
    };

    const processBuffer = async () => {
      while (!isCancelled) {
        if (buffer.length > 0) {
          // Determine the chunk size
          const chunkSize = Math.min(buffer.length, CHUNK_SIZE);
          const chunk = buffer.splice(0, chunkSize).join("");

          insertText(chunk);

          // Wait before processing the next chunk
          await new Promise((resolve) => setTimeout(resolve, 50)); // Adjust delay as needed
        } else {
          // Buffer is empty, wait a bit before checking again
          if (isEnded) {
            isCancelled = true;
          } else {
            await new Promise((resolve) => setTimeout(resolve, 20)); // Adjust delay as needed
          }
        }
      }

      // Insert any remaining text in the buffer when cancelled
      if (buffer.length > 0 && !isCancelled) {
        const remainingText = buffer.splice(0, buffer.length).join("");
        insertText(remainingText);
      }
    };

    const start = async () => {
      try {
        await Promise.all([readFromStream(), processBuffer()]);
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        console.error("Error during text generation:", error);
      }
    };

    start().catch((error) => console.error("Error:", error));

    return () => {
      // release the lock if the reader is not closed on unmount
      const releaseLockIfNotClosed = async () => {
        try {
          await reader.closed;
        } catch {
          reader.releaseLock();
        }
      };

      releaseLockIfNotClosed();
    };
  }, [generatingSuggestion]);

  // generate an adjustment to the completed text, based on the adjustment prompt
  const beginGeneratingAdjustment = useCallback(async () => {
    // don't generate text if the prompt is empty
    if (!adjustmentPrompt.trim()) {
      return;
    }

    // editor state includes the text being edited, and the text before/after the selection
    // if the current edit suggestion is not empty, then use *it* as the "selected text" - instead of the editor state's selected text
    let modificationState = state.editorState;
    if (editSuggestion !== "") {
      modificationState.selectedText = editSuggestion;
    }
    // generate the adjustment suggestion
    const adjustmentSuggestionTextStreamPromise = insertionOrEditingFunction(
      modificationState,
      adjustmentPrompt,
      filePointers,
      new AbortController().signal,
      markdownMode
    );

    const adjustmentSuggestionTextStream = streamPromiseFlatten(
      adjustmentSuggestionTextStreamPromise
    );

    setGeneratingSuggestion(adjustmentSuggestionTextStream);
  }, [
    adjustmentPrompt,
    editSuggestion,
    state.editorState,
    insertionOrEditingFunction,
    filePointers,
  ]);

  // Function to revert the editor's content to the previous state
  const revertText = () => {
    if (previousContentRef.current) {
      Editor.withoutNormalizing(editor, () => {
        editor.children = previousContentRef.current || [];
        editor.selection = selection; // Restore the previous selection if needed
        editor.onChange(); // Notify Slate of the change
      });
      previousContentRef.current = null;
      insertedTextLengthRef.current = 0;
    }
  };

  const isLoading = suggestionIsLoading;

  const textToEdit = editSuggestion || state.editorState.selectedText;

  const placeholder =
    textToEdit === ""
      ? "e.g. 'summarize the client's top 3 pain-points from @CallTranscript'"
      : "e.g. 'make it more formal', 'be more specific', ...";

  // Tips component renders below the adjustment prompt textarea:
  // - Shows "Submit" button with enter key icon when there's text to submit
  // - Shows "Esc to close" message when empty
  // - Shows loading/accept states during and after generation

  const Tips = () => {
    if (generatingSuggestion) {
      if (isLoading) {
        return (
          <button
            disabled
            aria-label="Generation in progress"
            className="rounded-md transition-colors duration-200 gap-2 text-xs text-gray-500 mt-1 flex justify-between items-center"
          >
            <LoaderCircle className="w-3 h-3 animate-spin" />
            <span>Generating</span>
          </button>
        );
      }
      return (
        <div className="flex justify-between items-center gap-2">
          <button
            className="text-accent-foreground rounded-md flex items-center justify-center bg-accent hover:bg-accent/60 transition-colors duration-200 active:bg-accent/70 active:scale-95 p-1 px-3 gap-2 text-xs"
            aria-label="Accept suggestion"
            title="Press Enter to accept"
            onClick={() => {
              closeWindow();
            }}
          >
            <span>Accept</span>
            <CornerDownLeft className="w-3 h-3" aria-hidden="true" />
          </button>
          <button
            className="text-background-foreground rounded-md flex items-center justify-center hover:bg-secondary/60 hover:text-hover transition-colors duration-200 active:bg-secondary/70 active:scale-95 p-1 px-3 gap-2 text-xs"
            aria-label="Reject suggestion"
            title="Press Esc to reject"
            onClick={() => {
              revertText();
              closeWindow();
            }}
          >
            <span>Reject</span>
            <Ban className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      );
    }
    return (
      <div className="text-xs text-gray-500 mt-1 flex justify-between items-center">
        {adjustmentPrompt.trim() ? (
          <button
            onClick={beginGeneratingAdjustment}
            className="text-accent-foreground rounded-md flex items-center justify-center bg-accent hover:bg-accent/60 transition-colors duration-200 active:bg-accent/70 active:scale-95 p-1 px-3 gap-2"
          >
            <span>Submit</span>
            <CornerDownLeft className="w-3 h-3" aria-hidden="true" />
          </button>
        ) : (
          <span>Esc to close</span>
        )}
      </div>
    );
  };

  const AdjustmentPromptComponent = (
    <div className="w-full flex flex-col items-start relative gap-3">
      <div className="relative w-full flex items-center">
        <textarea
          disabled={suggestionIsLoading}
          ref={adjustmentTextAreaRef}
          value={adjustmentPrompt}
          onChange={(e) => setAdjustmentPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              setAdjustmentPrompt(adjustmentPrompt + "\n");
            } else if (e.key === "Enter") {
              e.preventDefault();
              beginGeneratingAdjustment();
            } else if (e.key == "Escape") {
              e.preventDefault();
              revertToOriginal();
            }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent h-auto text-sm rounded-md resize-none overflow-visible pr-[3rem] text-foreground placeholder:text-muted-foreground"
          rows={1}
        />
      </div>
      <Tips />
    </div>
  );

  // show source search if the last word in the adjustment prompt BEGINS with an @
  const sourceSearchCandidate = adjustmentPrompt.split(" ").pop();
  // if the candidate is @someCandidate, then 'someCandidate', otherwise undefined
  const sourceSearchWord = sourceSearchCandidate?.startsWith("@")
    ? sourceSearchCandidate.slice(1)
    : undefined;

  return (
    <div className="w-full flex flex-col items-start relative gap-2">
      {AdjustmentPromptComponent}
      {filePointers.length > 0 && (
        <IncludedFilesPreview
          includedFiles={filePointers}
          setIncludedFiles={setFilePointers}
        />
      )}
      {sourceSearchWord !== undefined && (
        <SourceSearchBox
          searchTerm={sourceSearchWord}
          suggestedFiles={suggestedFiles}
          onSelectedFile={(filePointer) => {
            setAdjustmentPrompt(
              adjustmentPrompt.replace(new RegExp(`@${sourceSearchWord}$`), "")
            );
            setFilePointers((prev) => [...prev, filePointer]);

            // focus back on the adjustment prompt, and move the cursor to the end
            adjustmentTextAreaRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};
