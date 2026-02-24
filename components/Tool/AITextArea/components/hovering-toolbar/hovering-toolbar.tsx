import { useEffect, useMemo, useRef, useState } from "react";
import { Editor, Location, Transforms, Range } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { HoveringInsertionPromptBox } from "./text-insertion-prompt-box";
import { Menu, Portal } from "./hovering-toolbar-components";
import {
  getDescendantAroundSelection,
  getFullEditorTextWithNewlines,
  getTextAroundSelection,
} from "../../lib/get-text-around-cursor";
import {
  CustomElement,
  EditingEditorState,
  InsertionEditorApiConfig,
} from "../../types";
import { convertMarkdownToSlate } from "../../../../../utils/Slate";

export interface HoveringToolbarProps {
  apiConfig: InsertionEditorApiConfig;
  contextCategories: string[];
  hoverMenuClassname: string | undefined;
  isDisplayed: boolean;
  setIsDisplayed: (value: boolean) => void;
  markdownMode?: boolean;
}

export const HoveringToolbar = (props: HoveringToolbarProps) => {
  const { isDisplayed, setIsDisplayed, markdownMode } = props;
  const ref = useRef<HTMLDivElement>(null);
  const editor = useSlate();
  const selection = useSlateSelection();
  const currentEditorState = useMemo(
    () => editorState(editor),
    [editor, selection]
  );
  // only render on client
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    const { selection } = editor;

    if (!el) {
      return;
    }

    if (!selection) {
      el.removeAttribute("style");
      return;
    }
    // Clear all highlights if there’s no selection or selection is collapsed
    if (!selection) {
      return;
    }
    if (isDisplayed) {
      try {
        // Iterate over all blocks within the selection range
        const selectedBlocks = Editor.nodes(editor, {
          at: selection,
          match: (n: any) =>
            Editor.isBlock(editor, n) &&
            (n.type === "paragraph" || n.type === "list_item"), // Match specific types
        });

        const boundingRects = []; // Store all bounding rectangles
        for (const [blockNode] of selectedBlocks) {
          // Get the DOM node for each block
          const domNode = ReactEditor.toDOMNode(editor, blockNode);

          // Apply the highlight class
          if (markdownMode) {
            domNode.classList.add("aiTextAreaHighlight");
          }
          boundingRects.push(domNode.getBoundingClientRect());
        }
        // Calculate the combined bounding rectangle
        if (boundingRects.length > 0) {
          const combinedRect = boundingRects.reduce(
            (acc, rect) =>
              new DOMRect(
                Math.min(acc.left, rect.left), // Left
                Math.min(acc.top, rect.top), // Top
                Math.max(acc.right, rect.right) - Math.min(acc.left, rect.left), // Width
                Math.max(acc.bottom, rect.bottom) - Math.min(acc.top, rect.top) // Height
              ),
            new DOMRect(
              boundingRects[0].left,
              boundingRects[0].top,
              boundingRects[0].width,
              boundingRects[0].height
            )
          );
          // Position the hovering container
          if (ref.current) {
            const el = ref.current;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let top = combinedRect.bottom + window.scrollY + 1; // Default to below
            let left = combinedRect.left + window.scrollX;

            // Adjust for vertical overflow
            if (combinedRect.bottom + el.offsetHeight > viewportHeight) {
              top = combinedRect.top + window.scrollY - el.offsetHeight - 1; // Show above
            }

            // Adjust for horizontal overflow
            if (combinedRect.left + el.offsetWidth > viewportWidth) {
              left = viewportWidth - el.offsetWidth - 1; // Align to the right
            } else if (combinedRect.left < 0) {
              left = 10; // Align to the left
            }

            el.style.transition = "all 0.1s ease-in-out";
            el.style.opacity = "1";
            el.style.position = "absolute";
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
          }
        }
      } catch (error) {
        console.error("Error highlighting blocks:", error);
      }
    } else {
      if (markdownMode) {
        document.querySelectorAll(".aiTextAreaHighlight").forEach((node) => {
          node.classList.remove("aiTextAreaHighlight");
        });
      }
    }
  }, [isDisplayed, markdownMode, currentEditorState]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsDisplayed(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, setIsDisplayed]);

  if (!isClient) {
    return null;
  }

  return (
    <Portal>
      <Menu
        ref={ref}
        className={
          props.hoverMenuClassname ||
          "p-2 absolute z-10 top-[-10000px] left-[-10000px] opacity-0 transition-opacity duration-700 border border-solid border-primary/10 bg-secondary"
        }
      >
        {isDisplayed && selection && (
          <HoveringInsertionPromptBox
            editorState={currentEditorState}
            apiConfig={props.apiConfig}
            closeWindow={() => {
              setIsDisplayed(false);
            }}
            performInsertion={(insertedText: string) => {
              // replace the selection with the inserted text
              Transforms.delete(editor, { at: selection });
              Transforms.insertText(editor, insertedText, {
                at: selection,
              });
              setIsDisplayed(false);
            }}
            contextCategories={props.contextCategories}
            markdownMode={markdownMode}
          />
        )}
      </Menu>
    </Portal>
  );
};

function editorState(editor: Editor): EditingEditorState {
  const textAroundCursor = getTextAroundSelection(editor);
  if (textAroundCursor) {
    return textAroundCursor;
  }

  return {
    textBeforeCursor: getFullEditorTextWithNewlines(editor),
    textAfterCursor: "",
    selectedText: "",
  };
}
