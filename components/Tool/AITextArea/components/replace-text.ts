import { Editor, Transforms, Descendant } from "slate";
import { HistoryEditor } from "slate-history";

export function replaceEditorText(editor: Editor, newText: string) {
  // Check if editor is a HistoryEditor to batch operations for history management
  const isHistoryEditor = "history" in editor && "redo" in editor;

  const replaceOperation = () => {
    // Remove all nodes first to avoid leaving empty paragraphs
    // This matches the pattern used in replaceAllText
    while (editor.children.length > 0) {
      Transforms.removeNodes(editor, { at: [0] });
    }

    // Insert new text
    if (newText && newText !== "") {
      Transforms.insertNodes(
        editor,
        [
          {
            type: "paragraph",
            children: [{ text: newText }],
          },
        ],
        {
          at: [0],
        }
      );
    } else {
      // Ensure at least one empty paragraph if text is empty
      // Slate requires at least one block node, so we need to be explicit
      Transforms.insertNodes(
        editor,
        [
          {
            type: "paragraph",
            children: [{ text: "" }],
          },
        ],
        {
          at: [0],
        }
      );
    }
  };

  // Batch operations for history management if using HistoryEditor
  if (isHistoryEditor) {
    HistoryEditor.withMerging(editor as HistoryEditor, replaceOperation);
  } else {
    replaceOperation();
  }
}

export const replaceEditorToDescendant = (
  editor: Editor,
  newDescendant: Descendant[]
) => {
  // Replace the entire editor content directly
  editor.children = newDescendant;

  // Ensure selection is at the start of the new content
  Transforms.select(editor, Editor.start(editor, []));

  // Normalize the editor to enforce the schema
  editor.onChange();
  Editor.normalize(editor, { force: true });
};
