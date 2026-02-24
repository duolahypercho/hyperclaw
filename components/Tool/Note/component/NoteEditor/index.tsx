import React, { useMemo, useRef, useState } from "react";
import { cn } from "$/utils";
import { useNote } from "../../provider/noteProvider";
import { CopilotTextarea } from "../../../AITextArea";
import { HTMLCopanionTextAreaElement } from "../../../AITextArea/types";
import OverflowMenu, { FunctionType } from "./OverflowMenu";
import { lengthType, ReadingLevelType } from "../../../PromptLibrary/types";
import {
  finalPolishPrompt,
  lengthControlPrompt,
  readingLevelPrompt,
  addEmojiPrompt,
  addMarkdownPrompt,
} from "../../../PromptLibrary";
import { NoteEditorSkeleton } from "../../../../Skelenton";

interface NoteEditorProps {
  className?: string;
}

const NoteEditor = ({ className }: NoteEditorProps) => {
  const {
    selectedNote,
    handleUpdateNote,
    initialDescendant,
    noteLoading,
    handleUpdateNoteOnChange,
    handleImageUpload,
  } = useNote();
  const textareaRef = useRef<HTMLCopanionTextAreaElement>(null);
  const [generating, setGenerating] = useState(false);

  const handleFunctionSubmit = async (type: FunctionType, text: string) => {
    // Only require text for functions that actually need it
    if ((type === "length" || type === "readingLevel") && !text) {
      return;
    }

    if (type === "length") {
      const { systemPrompt, relatedHistory } = lengthControlPrompt(
        text as lengthType
      );
      textareaRef.current?.enhance({
        systemPrompt,
        history: relatedHistory,
      });
    }
    if (type === "Final Polish") {
      const { systemPrompt, relatedHistory } = finalPolishPrompt();
      textareaRef.current?.enhance({
        systemPrompt,
        history: relatedHistory,
      });
    }
    if (type === "readingLevel") {
      const { systemPrompt, relatedHistory } = readingLevelPrompt(
        text as ReadingLevelType
      );
      textareaRef.current?.enhance({
        systemPrompt,
        history: relatedHistory,
      });
    }
    if (type === "add emoji") {
      const { systemPrompt, relatedHistory } = addEmojiPrompt();
      textareaRef.current?.enhance({
        systemPrompt,
        history: relatedHistory,
      });
    }
    if (type === "add markdown") {
      const { systemPrompt, relatedHistory } = addMarkdownPrompt();
      textareaRef.current?.enhance({
        systemPrompt,
        history: relatedHistory,
      });
    }
  };

  const Editor = useMemo(() => {
    if (noteLoading) {
      return <NoteEditorSkeleton count={20} />;
    }

    return (
      <CopilotTextarea
        ref={textareaRef}
        className={cn(
          "min-h-[20px] leading-[20px] text-sm font-medium p-3 overflow-x-hidden",
          className
        )}
        placeholder={
          selectedNote
            ? "Start typing your note here..."
            : "Start typing to create a new note..."
        }
        autosuggestionsConfig={{
          textareaPurpose: "The Title of the todo task",
          disabledAutosuggestionsWhenTyping: true,
          chatApiConfigs: {
            suggestionsApiConfig: {
              maxTokens: 50,
              stop: ["\n", ".", "?"],
            },
            enhanceTextApiConfig: {},
          },
        }}
        suggestionsStyle={{
          fontStyle: "normal",
          color: "#9ba1ae",
        }}
        hoverMenuClassname="p-2 absolute z-10 top-[-10000px] left-[-10000px] mt-[-6px] opacity-0 transition-opacity duration-700"
        setgenerating={setGenerating}
        showToolbar={true}
        onDescendantChange={(descendants) => {
          handleUpdateNote(descendants);
        }}
        initialDescendant={
          selectedNote?.descendants || [
            {
              type: "paragraph",
              children: [{ text: "" }],
            },
          ]
        }
        handleImageUpload={handleImageUpload}
        onChange={(e) => {
          handleUpdateNoteOnChange(e.target.value);
        }}
      />
    );
  }, [selectedNote, initialDescendant, generating, noteLoading]);

  return (
    <>
      {Editor}
      <OverflowMenu
        handleFunctionSubmit={handleFunctionSubmit}
        generating={generating}
      />
    </>
  );
};

export default NoteEditor;
