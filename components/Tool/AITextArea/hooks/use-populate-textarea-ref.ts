import React from "react";
import { Editor, Descendant, Point, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { getFullEditorTextWithNewlines } from "../lib/get-text-around-cursor";
import { replaceEditorText } from "../components/replace-text";
import { EnhanceHandler, HTMLCopanionTextAreaElement } from "../types";
import { CustomEditor } from "../types";
import { FormattedMessage } from "../../../../types";

export function usePopulateTextareaRef(
  editor: Editor,
  ref: React.Ref<HTMLCopanionTextAreaElement>,
  enhanceHandler: (enhanceHandlerArgs: EnhanceHandler) => void
) {
  React.useImperativeHandle(
    ref,
    () => {
      class Combined {
        constructor(
          private customMethods: CustomMethods,
          private editorHtmlElement: HTMLElement
        ) {}

        [key: string]: any;

        get(target: any, propKey: string): any {
          if (this.isKeyOfCustomMethods(propKey)) {
            const value = this.customMethods[propKey];
            if (typeof value === "function") {
              return value.bind(this.customMethods);
            }
            return value;
          } else if (this.isKeyOfHTMLElement(propKey)) {
            const value = this.editorHtmlElement[propKey];
            if (typeof value === "function") {
              return value.bind(this.editorHtmlElement);
            }
            return value;
          }
        }

        set(target: any, propKey: string, value: any): boolean {
          if (this.isKeyOfCustomMethods(propKey)) {
            (this.customMethods as any)[propKey] = value;
          } else if (this.isKeyOfHTMLElement(propKey)) {
            (this.editorHtmlElement as any)[propKey] = value;
          } else {
            // Default behavior (optional)
            target[propKey] = value;
          }
          return true;
        }

        private isKeyOfCustomMethods(key: string): key is keyof CustomMethods {
          return key in this.customMethods;
        }

        private isKeyOfHTMLElement(key: string): key is keyof HTMLElement {
          return key in this.editorHtmlElement;
        }
      }

      const handler = {
        get(target: any, propKey: keyof CustomMethods | keyof HTMLElement) {
          return target.get(target, propKey);
        },
        set(
          target: any,
          propKey: keyof CustomMethods | keyof HTMLElement,
          value: any
        ) {
          return target.set(target, propKey, value);
        },
      };

      class CustomMethods {
        constructor(private editor: CustomEditor) {}

        focus() {
          ReactEditor.focus(this.editor);
        }

        blur() {
          ReactEditor.blur(this.editor);
        }

        enhance(enhanceHandlerArgs: EnhanceHandler) {
          enhanceHandler(enhanceHandlerArgs);
        }

        insertText(
          text: string,
          options?: { at?: Point } // you can extend with more flags later
        ) {
          Editor.withoutNormalizing(this.editor, () => {
            /* 1️⃣  Ensure there is at least one node so Editor.end() won't throw */
            if (this.editor.children.length === 0) {
              Transforms.insertNodes(
                this.editor,
                { type: "paragraph", children: [{ text: "" }] },
                { at: [0] }
              );
            }

            /* 2️⃣  Decide where we're inserting */
            const hasExplicitAt = !!options?.at;
            const hadSelection = !!this.editor.selection;

            const at: Point =
              options?.at ??
              (this.editor.selection
                ? this.editor.selection.focus
                : Editor.end(this.editor, []));

            /* 3️⃣  Insert the text */
            Transforms.insertText(this.editor, text, { at });

            /* 4️⃣  Place caret intelligently */
            if (!hasExplicitAt && !hadSelection) {
              /* We just did an append — keep caret at the real end of doc */
              Transforms.select(this.editor, Editor.end(this.editor, []));
            } else {
              /* We inserted inside existing content — move caret right AFTER
                 the just-inserted run, without corrupting emojis (uses UTF-16 units) */
              const afterPoint: Point = {
                path: at.path,
                offset: at.offset + text.length, // length in UTF-16 code units
              };
              Transforms.select(this.editor, afterPoint);
            }
          });

          /* 5️⃣  Give the DOM node focus (harmless if it already has it) */
          ReactEditor.focus(this.editor);
        }

        get value() {
          return getFullEditorTextWithNewlines(this.editor);
        }
        set value(value: string) {
          replaceEditorText(this.editor, value);
        }
      }

      let editorHtmlElement: HTMLElement;
      try {
        // Check if editor is properly initialized
        if (!editor.children) {
          editorHtmlElement = document.createElement("div"); // Fallback element
        } else {
          editorHtmlElement = ReactEditor.toDOMNode(editor, editor);
        }
      } catch (error) {
        console.warn("Failed to get editor DOM node:", error);
        editorHtmlElement = document.createElement("div"); // Fallback element
      }
      const customMethods = new CustomMethods(editor);

      const combined = new Combined(customMethods, editorHtmlElement);
      return new Proxy(combined, handler);
    },
    [editor]
  );
}
