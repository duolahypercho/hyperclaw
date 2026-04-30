import { HoveringInsertionPromptBoxCore } from "./hovering-insertion-prompt-box-core";
import { EditingEditorState, InsertionEditorApiConfig } from "../../../types";
import { X } from "lucide-react";
import { useState } from "react";
import { useSlate } from "slate-react";

export interface Props {
  editorState: EditingEditorState;
  apiConfig: InsertionEditorApiConfig;
  performInsertion: (insertedText: string) => void;
  closeWindow: () => void;
  contextCategories: string[];
  markdownMode?: boolean;
}

export const HoveringInsertionPromptBox = (props: Props) => {
  const [isUpdated, setIsUpdated] = useState(false);
  const editor = useSlate();

  const revertToOriginal = () => {
    if (isUpdated) {
      if (props.markdownMode) editor.undo();
      editor.undo();
      setIsUpdated(false);
    }
    props.closeWindow();
  };

  return (
    <div
      className="flex flex-col justify-center items-center space-y-4 rounded-mdshadow-lg p-4 border-primary/10 rounded-sm border border-solid bg-background"
      style={{ width: "35rem" }}
    >
      <HoveringInsertionPromptBoxCore
        state={{
          editorState: props.editorState,
        }}
        insertionOrEditingFunction={props.apiConfig.insertionOrEditingFunction}
        closeWindow={props.closeWindow}
        performInsertion={props.performInsertion}
        contextCategories={props.contextCategories}
        revertToOriginal={revertToOriginal}
        setIsUpdated={setIsUpdated}
        markdownMode={props.markdownMode}
      />
      <button
        onClick={revertToOriginal}
        className="absolute top-0 right-4 p-1 text-hover/60 hover:text-hover/80 transition-colors active:scale-95"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
