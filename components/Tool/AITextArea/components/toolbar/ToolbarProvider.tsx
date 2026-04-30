import React, { createContext, ReactNode, useContext, useEffect } from "react";
import { useSlate } from "slate-react";
import { Editor, Transforms, Element as SlateElement, Descendant } from "slate";
import { Button } from ".";
import { CustomElement } from "../../types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
const LIST_TYPES = ["ul_list"];
const TEXT_ALIGN_TYPES = ["left", "center", "right", "justify"];

interface LeafProps {
  attributes: React.HTMLAttributes<HTMLElement>;
  children: React.ReactNode;
  leaf: {
    bold?: boolean;
    code?: boolean;
    italic?: boolean;
    underline?: boolean;
  };
}

interface ButtonProps {
  tooltip: string;
  format: string;
  icon: React.ReactNode;
}

interface ToolbarContextType {
  toggleMark: (editor: Editor, format: string) => void;
  MarkButton: React.FC<ButtonProps>;
  BlockButton: React.FC<ButtonProps>;
  Leaf: React.FC<LeafProps>;
  HOTKEYS: { [key: string]: string };
}

const initialState = {
  MarkButton: () => null,
  BlockButton: () => null,
  Leaf: () => null,
  HOTKEYS: {},
  toggleMark: () => {},
};

export const ToolbarContext = createContext<ToolbarContextType>(initialState);

export const ToolbarProvider = ({
  children,
  handleImageUpload,
}: {
  children: ReactNode;
  handleImageUpload?: (file: File) => Promise<string | undefined>;
}) => {
  const toggleBlock = (editor: Editor, format: string) => {
    const isActive = isBlockActive(editor, format);
    const isList = LIST_TYPES.includes(format);
    Transforms.unwrapNodes(editor, {
      match: (n) =>
        !Editor.isEditor(n) &&
        SlateElement.isElement(n) &&
        LIST_TYPES.includes(n.type) &&
        !TEXT_ALIGN_TYPES.includes(format),
      split: true,
    });

    let newProperties: Partial<CustomElement>;

    if (format === "image") {
      // TODO: Add image upload
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0 || !handleImageUpload) return;
        // Convert FileList to Array for easier handling
        const fileArray = Array.from(files);

        // Process each file sequentially
        for (const file of fileArray) {
          // Step 1: Insert a temporary image node with `loading` set to true
          const tempImageNode = {
            type: "image",
            src: "", // Local placeholder image
            alt: "Uploading...",
            loading: true, // Indicates the image is being uploaded
            children: [{ text: "" }],
          };

          // Insert image node first
          Transforms.insertNodes(editor, tempImageNode as CustomElement);

          // Find the path of the just-inserted image node
          const [imageNodeEntry] = Editor.nodes(editor, {
            at: [],
            match: (n) =>
              SlateElement.isElement(n) &&
              n.type === "image" &&
              n.loading === true,
          });

          // Insert paragraph after the image
          Transforms.insertNodes(editor, {
            type: "paragraph",
            children: [{ text: "" }],
          } as CustomElement);

          try {
            if (imageNodeEntry) {
              const imageUrlRaw = await handleImageUpload(file);
              if (imageUrlRaw) {
                Transforms.setNodes(
                  editor,
                  { src: imageUrlRaw, alt: file.name, loading: false },
                  { at: imageNodeEntry[1] }
                );
              }
            }
          } catch (error) {
            console.error(`Error uploading image ${file.name}:`, error);
            if (imageNodeEntry) {
              Transforms.removeNodes(editor, { at: imageNodeEntry[1] });
            }
          }
        }
      };
      input.click();
      return;
    }

    newProperties = {
      type: isActive ? "paragraph" : isList ? "list_item" : format,
    } as { type: CustomElement["type"] };

    if (newProperties.type === "horizontal_rule") {
      const horizontalRule = [
        {
          type: "horizontal_rule",
          children: [{ text: "" }], // Void elements need at least one text node
        },
        {
          type: "paragraph",
          children: [{ text: "" }],
        },
      ];
      Transforms.insertNodes(editor, horizontalRule as CustomElement[]);
      return;
    }

    Transforms.setNodes(editor, newProperties);

    if (!isActive && isList) {
      const block = { type: format, children: [] };
      Transforms.wrapNodes(editor, block as CustomElement);
    }
  };

  const toggleMark = (editor: Editor, format: string) => {
    const isActive = isMarkActive(editor, format);

    if (isActive) {
      Editor.removeMark(editor, format);
    } else {
      Editor.addMark(editor, format, true);
    }
  };

  const isBlockActive = (
    editor: Editor,
    format: string,
    blockType = "type"
  ) => {
    const { selection } = editor;
    if (!selection) return false;
    const [match] = Array.from(
      Editor.nodes(editor, {
        at: Editor.unhangRange(editor, selection),
        match: (n) =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          n[blockType as keyof CustomElement] === format,
      })
    );

    return !!match;
  };

  const isMarkActive = (editor: Editor, format: string) => {
    const marks = Editor.marks(editor) as Record<string, any>;
    return marks ? marks[format] === true : false;
  };

  const Leaf = ({ attributes, children, leaf }: any) => {
    if (leaf.bold) {
      children = <strong>{children}</strong>;
    }
    if (leaf.animated) {
      return (
        <span {...attributes} className="animated-text">
          {children}
        </span>
      );
    }
    if (leaf.code) {
      children = (
        <code className="bg-secondary rounded p-2 text-secondary-foreground/80 font-mono">
          {children}
        </code>
      );
    }
    if (leaf.italic) {
      children = <em className="italic">{children}</em>;
    }
    if (leaf.underline) {
      children = <u>{children}</u>;
    }
    if (leaf.strikethrough) {
      children = <span className="line-through">{children}</span>;
    }

    return <span {...attributes}>{children}</span>;
  };

  const BlockButton = ({ format, icon, tooltip }: ButtonProps) => {
    const editor = useSlate();
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            active={isBlockActive(
              editor,
              format,
              TEXT_ALIGN_TYPES.includes(format) ? "align" : "type"
            )}
            onMouseDown={(event: React.MouseEvent) => {
              event.preventDefault();
              toggleBlock(editor, format);
            }}
            className="h-fit"
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  };

  const MarkButton = ({ format, icon, tooltip }: ButtonProps) => {
    const editor = useSlate();
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="h-fit"
            active={isMarkActive(editor, format)}
            onMouseDown={(event: React.MouseEvent) => {
              event.preventDefault();
              toggleMark(editor, format);
            }}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  };

  const HOTKEYS: { [key: string]: string } = {
    "mod+b": "bold",
    "mod+i": "italic",
    "mod+u": "underline",
    "mod+`": "code",
  };

  const value = {
    toggleMark,
    MarkButton,
    BlockButton,
    Leaf,
    HOTKEYS,
  };

  return (
    <ToolbarContext.Provider value={value}>{children}</ToolbarContext.Provider>
  );
};

export const useToolbar = () => {
  const context = useContext(ToolbarContext);
  if (!context) {
    throw new Error("useToolbar must be used within a ToolbarProvider");
  }
  return context;
};
