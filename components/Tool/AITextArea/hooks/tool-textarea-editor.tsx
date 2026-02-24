import { useMemo } from "react";
import { createEditor, Element, Transforms, Editor } from "slate";
import { withReact } from "slate-react";
import {
  defaultShouldSave,
  ShouldSaveToHistory,
  withPartialHistory,
} from "../lib/with-partial-history";
import { CustomEditor, CustomElement, CustomText } from "../types";
import { jsx } from "slate-hyperscript";

const ELEMENT_TAGS: Record<string, (el: any) => Partial<CustomElement>> = {
  BLOCKQUOTE: () => ({ type: "block_quote" }),
  H1: () => ({ type: "heading_one" }),
  H2: () => ({ type: "heading_two" }),
  H3: () => ({ type: "heading_three" }),
  IMG: (el: any) => ({ type: "image", src: el.getAttribute("src") }),
  LI: () => ({ type: "list_item" }),
  P: () => ({ type: "paragraph" }),
  HR: () => ({ type: "horizontal_rule" }),
  /*   H4: () => ({ type: "heading-four" }),
  H5: () => ({ type: "heading-five" }),
  H6: () => ({ type: "heading-six" }), */
  //A: (el: any) => ({ type: "link", src: el.getAttribute("href") }),
  //PRE: () => ({ type: "code" }),
  UL: () => ({ type: "ul_list" }),
};

// COMPAT: `B` is omitted here because Google Docs uses `<b>` in weird ways.
const TEXT_TAGS: Record<string, (el: any) => Partial<CustomText>> = {
  CODE: () => ({ code: true }),
  DEL: () => ({ strikethrough: true }),
  EM: () => ({ italic: true }),
  I: () => ({ italic: true }),
  S: () => ({ strikethrough: true }),
  STRONG: () => ({ bold: true }),
  U: () => ({ underline: true }),
};

const shouldSave: ShouldSaveToHistory = (op, prev) => {
  const excludedNodeTypes = ["suggestion", "horizontal_rule"];

  // Check if the operation involves the suggestion inline node type
  if (
    op.type === "insert_node" &&
    Element.isElement(op.node) &&
    excludedNodeTypes.includes(op.node.type)
  ) {
    return false;
  }


  if (
    op.type === "remove_node" &&
    Element.isElement(op.node) &&
    excludedNodeTypes.includes(op.node.type)
  ) {
    return false;
  }

  if (
    op.type === "set_node" &&
    "type" in op.newProperties &&
    op.newProperties.type &&
    excludedNodeTypes.includes(op.newProperties.type)
  ) {

    return false;
  }

  if (
    op.type == "set_node" &&
    "type" in op.properties &&
    op.properties.type &&
    excludedNodeTypes.includes(op.properties.type)
  ) {
    return false;
  }


  if (
    op.type === "merge_node" &&
    "type" in op.properties &&
    op.properties.type &&
    excludedNodeTypes.includes(op.properties.type)
  ) {
    return false;
  }


  if (
    op.type === "split_node" &&
    "type" in op.properties &&
    op.properties.type &&
    excludedNodeTypes.includes(op.properties.type)
  ) {
    return false;
  }


  // Otherwise, save the operation to history
  return defaultShouldSave(op, prev);
};

export const deserialize = (el: any) => {
  if (el.nodeType === 3) {
    return el.textContent;
  } else if (el.nodeType !== 1) {
    return null;
  } else if (el.nodeName === "BR") {
    return "\n";
  }

  const { nodeName } = el;
  let parent = el;

  if (
    nodeName === "PRE" &&
    el.childNodes[0] &&
    el.childNodes[0].nodeName === "CODE"
  ) {
    parent = el.childNodes[0];
  }
  let children: any = Array.from(parent.childNodes).map(deserialize).flat();

  if (children.length === 0) {
    children = [{ text: "" }];
  }

  if (el.nodeName === "BODY") {
    return jsx("fragment", {}, children);
  }

  if (ELEMENT_TAGS[nodeName]) {
    const attrs = ELEMENT_TAGS[nodeName](el);
    return jsx("element", attrs, children);
  }

  if (TEXT_TAGS[nodeName]) {
    const attrs = TEXT_TAGS[nodeName](el);
    return children.map((child: any) => jsx("text", attrs, child));
  }

  return children;
};

export function useToolTextareaEditor({
  handleImageUpload,
}: {
  handleImageUpload?: (file: File) => Promise<string | undefined>;
}): CustomEditor {
  const editor = useMemo(() => {
    const editor = withPartialHistory(withReact(createEditor()), shouldSave);

    const { isVoid } = editor;
    editor.isVoid = (element) => {
      switch (element.type) {
        case "suggestion":
          return true;
        case "horizontal_rule":
          return true;
        case "image":
          return true;
        default:
          return isVoid(element);
      }
    };

    const { markableVoid } = editor;
    editor.markableVoid = (element) => {
      switch (element.type) {
        case "suggestion":
          return true;
        case "horizontal_rule":
          return true;
        case "image":
          return true;
        default:
          return markableVoid(element);
      }
    };

    const { isInline } = editor;
    editor.isInline = (element) => {
      switch (element.type) {
        case "suggestion":
          return element.inline;
        default:
          return isInline(element);
      }
    };

    const { insertData } = editor;
    editor.insertData = async (data) => {
      const html = data.getData("text/html");

      const { files } = data;

      if (handleImageUpload) {
        if (files && files.length > 0) {
          for (const file of files) {
            // Check if the file is an image
            if (!file.type.startsWith("image/")) {
              continue;
            }

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
                Element.isElement(n) &&
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
        }
      }

      if (html) {
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const fragment = deserialize(parsed.body);
        Transforms.insertFragment(editor, fragment);
        return;
      }

      insertData(data);
    };

    return editor;
  }, []);

  return editor;
}
