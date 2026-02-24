import React, {
  useEffect,
  useState,
  forwardRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import { Editable, ReactEditor, Slate } from "slate-react";
import { useTextareaEditor } from "./hooks/textarea-editor";
import { Descendant, Editor, Transforms, Node, Range } from "slate";
import {
  getFullEditorTextWithNewlines,
  getTextAroundCollapsedCursor,
} from "./lib/get-text-around-cursor";
import {
  AutosuggestionState,
  BaseAutosuggestionsConfig,
  BaseTextareaProps,
  EnhanceHandler,
  HTMLCopanionTextAreaElement,
} from "./types";
import { defaultBaseAutosuggestionsConfig } from "./types/base-autosuggestions-config";
import { useAutosuggestions } from "./hooks/use-autosuggestions";
import {
  HoveringEditorProvider,
  useHoveringEditorContext,
} from "./provider/hovering-editor-provider";
import { makeRenderElementFunction } from "./components/render-element";
import { makeRenderPlaceholderFunction } from "./components/render-placeholder";
import {
  replaceEditorText,
  replaceEditorToDescendant,
} from "./components/replace-text";
import { twMerge } from "tailwind-merge";
import { usePopulateTextareaRef } from "./hooks/use-populate-textarea-ref";
import { useAddBrandingCss } from "./components/use-add-branding-css";
import { clearAutocompletionsFromEditor } from "./lib/clear-autocompletion";
import { cn } from "../../../utils";
import { TrackerTextEditedSinceLastCursorMovement } from "./components/track-cursor-moved-since-last-text-change";
import { HoveringToolbar } from "./components/hovering-toolbar/hovering-toolbar";
import { addAutocompletionsToEditor } from "./lib/add-autocompletions";
import { Toolbar } from "./components/toolbar";
import {
  ToolbarProvider,
  useToolbar,
} from "./components/toolbar/ToolbarProvider";
import isHotkey from "is-hotkey";
import {
  convertMarkdownToSlate,
  convertSlateToMarkdown,
} from "../../../utils/Slate";
import { HistoryEditor } from "slate-history";
import { NoteEditorSkeleton } from "../../Skelenton";
import { useDebounce } from "../../../hooks/isDebounce";
import { useToolTextareaEditor } from "./hooks/tool-textarea-editor";

export const BaseTextarea = React.forwardRef(
  (props: BaseTextareaProps, ref: React.Ref<HTMLCopanionTextAreaElement>) => {
    const {
      suggestionsStyle,
      showToolbar,
      setgenerating,
      onDescendantChange,
      initialDescendant,
      handleImageUpload,
      showSkeleton,
      onImmediateTextChange,
      ...additionalProps
    } = props;

    if (showToolbar) {
      return (
        <ToolbarProvider handleImageUpload={handleImageUpload}>
          <HoveringEditorProvider>
            <BaseTextareaWithToolbarContext
              {...additionalProps}
              onDescendantChange={onDescendantChange}
              initialDescendant={initialDescendant}
              setgenerating={setgenerating}
              handleImageUpload={handleImageUpload}
              showSkeleton={showSkeleton}
              onImmediateTextChange={onImmediateTextChange}
              ref={ref}
            />
          </HoveringEditorProvider>
        </ToolbarProvider>
      );
    }

    return (
      <HoveringEditorProvider>
        <BaseTextareaWithHoveringContext
          {...additionalProps}
          onDescendantChange={onDescendantChange}
          initialDescendant={initialDescendant}
          setgenerating={setgenerating}
          showSkeleton={showSkeleton}
          onImmediateTextChange={onImmediateTextChange}
          ref={ref}
        />
      </HoveringEditorProvider>
    );
  }
);

const BaseTextareaWithToolbarContext = forwardRef(
  (props: BaseTextareaProps, ref: React.Ref<HTMLCopanionTextAreaElement>) => {
    // separate into TextareaHTMLAttributes<HTMLDivElement> and CopilotTextareaProps
    const {
      placeholderStyle,
      value,
      hoverMenuClassname,
      onValueChange,
      baseAutosuggestionsConfig: autosuggestionsConfigFromProps,
      className,
      onChange,
      onKeyDown,
      onBlur,
      onDescendantChange,
      initialDescendant,
      setgenerating,
      shortcut,
      suggestionsStyle,
      handleImageUpload,
      showSkeleton: showSkeletonFromProps = true,
      onImmediateTextChange,
      ...propsToForward
    } = props;

    const autosuggestionsConfig: BaseAutosuggestionsConfig = {
      ...defaultBaseAutosuggestionsConfig,
      ...autosuggestionsConfigFromProps,
    };

    const editor = useToolTextareaEditor({ handleImageUpload });
    const valueOnInitialRender = useMemo(() => value ?? "", []);

    const { Leaf, toggleMark, HOTKEYS } = useToolbar();
    const [lastKnownFullEditorText, setLastKnownFullEditorText] =
      useState(valueOnInitialRender);
    const [cursorMovedSinceLastTextChange, setCursorMovedSinceLastTextChange] =
      useState(false);
    // Ref to track inserted text length
    const insertedTextLengthRef = useRef(0);
    const [CHUNK_SIZE, setCHUNK_SIZE] = useState(15);
    const {
      isDisplayed: hoveringEditorIsDisplayed,
      setIsDisplayed: setHoveringEditorIsDisplayed,
    } = useHoveringEditorContext();
    const [suggestionsGenerating, setSuggestionsGenerating] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [descendant, setDescendant] = useState<Descendant[]>([]);
    const debouncedContent = useDebounce(descendant, 300); // Debounce the content

    const initialValue: Descendant[] = useMemo(() => {
      if (initialDescendant) {
        if (initialDescendant.length > 0) {
          return initialDescendant;
        }
        return [
          {
            type: "paragraph",
            children: [{ text: "" }],
          },
        ];
      }
      return [
        {
          type: "paragraph",
          children: [{ text: String(valueOnInitialRender) }],
        },
      ];
    }, [valueOnInitialRender, initialDescendant]);

    const insertText = useCallback(
      (autosuggestion: AutosuggestionState) => {
        Editor.insertText(editor, autosuggestion.text, {
          at: autosuggestion.point,
        });
      },
      [editor]
    );

    const replaceAllText = useCallback(
      (suggestion: ReadableStream<string>) => {
        const reader = suggestion.getReader();
        let isCancelled = false;
        const buffer: string[] = []; // Use an array to store incoming characters
        let generatedText = "";
        let isEnded = false;
        let previousDescendant = descendant;

        const insertSingleText = (text: string) => {
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

          // Scroll to bottom after inserting text
          const editorElement = ReactEditor.toDOMNode(editor, editor);
          editorElement.scrollTop = editorElement.scrollHeight;

          insertedTextLengthRef.current += text.length;
          generatedText += text;
        };

        const readFromStream = async () => {
          try {
            while (!isCancelled) {
              const { done, value } = await reader.read();
              if (done) {
                isEnded = true;
                setCHUNK_SIZE(30);
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

              insertSingleText(chunk);

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
            insertSingleText(remainingText);
          }
        };

        const start = async () => {
          try {
            //set generating to false
            setShowSkeleton(false);
            // Assuming `editor` is your Slate editor instance
            // Clear the existing content
            HistoryEditor.withMerging(editor, async () => {
              Transforms.delete(editor, {
                at: {
                  anchor: Editor.start(editor, []),
                  focus: Editor.end(editor, []),
                },
              });
            });
            await Promise.all([readFromStream(), processBuffer()]);
            // Remove all content added during animation
            HistoryEditor.withMerging(editor, async () => {
              Transforms.delete(editor, {
                at: {
                  anchor: Editor.start(editor, []),
                  focus: Editor.end(editor, []),
                },
              });
            });

            //convert generatedText markdown to slatejs
            const generatedDescendant = convertMarkdownToSlate(generatedText);
            //replace the editor content with the generated text
            HistoryEditor.withMerging(editor, () => {
              // Remove all nodes at the root
              while (editor.children.length > 0) {
                Transforms.removeNodes(editor, { at: [0] });
              }
              // Insert the new content
              Transforms.insertNodes(editor, generatedDescendant, {
                at: [0],
                batchDirty: true,
              });
            });

            //set generating to false
            setgenerating?.(false);
            setSuggestionsGenerating(false);
          } catch (error) {
            // Remove all content and revert to the previous state
            HistoryEditor.withMerging(editor, async () => {
              Transforms.delete(editor, {
                at: {
                  anchor: Editor.start(editor, []),
                  focus: Editor.end(editor, []),
                },
              });
            });
            HistoryEditor.withMerging(editor, () => {
              Transforms.insertNodes(editor, previousDescendant, {
                at: [0],
                batchDirty: true,
              });
            });
            setSuggestionsGenerating(false);
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
      },
      [editor]
    );

    const shouldDisableAutosuggestions =
      // textarea is manually disabled:
      autosuggestionsConfig.disabled ||
      // hovering editor is displayed:
      hoveringEditorIsDisplayed ||
      // the cursor has moved since the last text change AND we are configured to disable autosuggestions in this case:
      (cursorMovedSinceLastTextChange &&
        autosuggestionsConfig.temporarilyDisableWhenMovingCursorWithoutChangingText);

    const {
      currentAutocompleteSuggestion,
      onChangeHandler: onChangeHandlerForAutocomplete,
      onKeyDownHandler: onKeyDownHandlerForAutocomplete,
      onTouchStartHandler: onTouchStartHandlerForAutocomplete,
      onClickEnhancedHandler: onClickEnhancedHandlerForAutocomplete,
    } = useAutosuggestions(
      autosuggestionsConfig.debounceTime,
      autosuggestionsConfig.shouldAcceptAutosuggestionOnKeyPress,
      autosuggestionsConfig.shouldAcceptAutosuggestionOnTouch,
      autosuggestionsConfig.apiConfig.autosuggestionsFunction,
      insertText,
      replaceAllText,
      autosuggestionsConfig.disableWhenEmpty,
      shouldDisableAutosuggestions,
      autosuggestionsConfig.disabledAutosuggestionsWhenTyping,
      autosuggestionsConfig.apiConfig.enhanceTextFunction
    );

    const onKeyDownHandlerForHoveringEditor = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (
          autosuggestionsConfig.shouldToggleHoveringEditorOnKeyPress(
            event,
            shortcut ?? "k"
          )
        ) {
          event.preventDefault();
          setHoveringEditorIsDisplayed(!hoveringEditorIsDisplayed);
        }
      },
      [
        hoveringEditorIsDisplayed,
        setHoveringEditorIsDisplayed,
        autosuggestionsConfig.shouldToggleHoveringEditorOnKeyPress,
      ]
    );

    // sync autosuggestions state with the editor
    useEffect(() => {
      clearAutocompletionsFromEditor(editor);
      if (currentAutocompleteSuggestion) {
        addAutocompletionsToEditor(
          editor,
          currentAutocompleteSuggestion.text,
          currentAutocompleteSuggestion.point
        );
      }
    }, [currentAutocompleteSuggestion]);

    const suggestionStyleAugmented: React.CSSProperties = useMemo(() => {
      return {
        fontStyle: "italic",
        color: "gray",
        ...suggestionsStyle,
      };
    }, [suggestionsStyle]);

    const renderElementMemoized = useMemo(() => {
      return makeRenderElementFunction(suggestionStyleAugmented);
    }, [suggestionStyleAugmented]);

    const renderLeaf = useCallback((props: any) => <Leaf {...props} />, []);

    const renderPlaceholderMemoized = useMemo(() => {
      // For some reason slateJS specifies a top value of 0, which makes for strange styling. We override this here.
      const placeholderStyleSlatejsOverrides: React.CSSProperties = {
        top: undefined,
      };

      const placeholderStyleAugmented: React.CSSProperties = {
        ...placeholderStyleSlatejsOverrides,
        ...placeholderStyle,
      };

      return makeRenderPlaceholderFunction(placeholderStyleAugmented);
    }, [placeholderStyle]);

    const enhanceHandler = useCallback(
      (enhanceHandlerArgs: EnhanceHandler) => {
        setgenerating?.(true);
        setShowSkeleton(true);
        setSuggestionsGenerating(true);
        let markdown = "";
        const currentDescendants = editor.children;
        markdown = convertSlateToMarkdown(currentDescendants);
        try {
          //send the enhanced text to the autosuggestions function
          onClickEnhancedHandlerForAutocomplete({
            entireText: markdown,
            enhancedText: enhanceHandlerArgs.enhanceText ?? "Enhanced text",
            systemPrompt: enhanceHandlerArgs.systemPrompt,
            history: enhanceHandlerArgs.history,
          });
        } catch (error) {
          console.error("Error during text generation:", error);
          setSuggestionsGenerating(false);
        }
      },
      [editor] // Add entireDescendantTree as a dependency
    );

    // update the editor text, but only when the value changes from outside the component
    useEffect(() => {
      if (value === lastKnownFullEditorText || initialDescendant) {
        return;
      }

      setLastKnownFullEditorText(value ?? "");
      replaceEditorText(editor, value ?? "");
    }, [value]);

    useEffect(() => {
      const newEditorState = getTextAroundCollapsedCursor(editor);
      const fullEditorText = newEditorState
        ? newEditorState.textBeforeCursor + newEditorState.textAfterCursor
        : getFullEditorTextWithNewlines(editor); // we don't double-parse the editor. When `newEditorState` is null, we didn't parse the editor yet.

      setLastKnownFullEditorText((prev) => {
        if (prev !== fullEditorText) {
          setCursorMovedSinceLastTextChange(false);
        }
        return fullEditorText;
      });

      onChangeHandlerForAutocomplete(newEditorState);
      onDescendantChange?.(descendant);
      onValueChange?.(fullEditorText);
      onChange?.(makeSemiFakeReactTextAreaEvent(fullEditorText));
    }, [debouncedContent]);

    useEffect(() => {
      if (initialDescendant) {
        replaceEditorToDescendant(editor, initialDescendant);
      }
    }, [initialDescendant]);

    useAddBrandingCss(suggestionStyleAugmented);
    usePopulateTextareaRef(editor, ref, enhanceHandler);
    const moddedClassName = (() => {
      const baseClassName = "AItextarea";
      const defaultTailwindClassName =
        "flex-1 bg-background text-foreground placeholder-muted-foreground text-sm overflow-y-auto resize-none border-none break-all overflow-y-auto customScrollbar2";
      const mergedClassName = twMerge(
        defaultTailwindClassName,
        className ?? ""
      );
      return `${baseClassName} ${mergedClassName}`;
    })();

    return (
      <Slate
        editor={editor}
        initialValue={initialValue}
        onChange={(value) => {
          setDescendant(value);
          const plainText = (
            value?.map((node) => Node.string(node)).join("\n") || ""
          ).replace(/\n+$/, "");
          onImmediateTextChange?.(plainText);
        }}
      >
        <div className="flex flex-col h-full w-full overflow-hidden">
          <TrackerTextEditedSinceLastCursorMovement
            setCursorMovedSinceLastTextChange={
              setCursorMovedSinceLastTextChange
            }
          />
          <Toolbar />
          <HoveringToolbar
            apiConfig={autosuggestionsConfig.apiConfig}
            contextCategories={autosuggestionsConfig.contextCategories}
            hoverMenuClassname={hoverMenuClassname}
            isDisplayed={hoveringEditorIsDisplayed}
            setIsDisplayed={setHoveringEditorIsDisplayed}
            markdownMode={true}
          />
          {showSkeleton && showSkeletonFromProps ? (
            <NoteEditorSkeleton count={20} />
          ) : (
            <Editable
              renderElement={renderElementMemoized}
              renderPlaceholder={renderPlaceholderMemoized}
              renderLeaf={renderLeaf}
              onKeyDown={(event) => {
                onKeyDownHandlerForHoveringEditor(event); // forward the event for internal use
                onKeyDownHandlerForAutocomplete(event); // forward the event for internal use
                onKeyDown?.(event); // forward the event for external use
                // Handle tab indentation for lists
                if (event.key === "Tab") {
                  const [listItem] = Editor.nodes(editor, {
                    match: (n: any) => n.type === "list_item",
                  });

                  if (listItem) {
                    event.preventDefault();

                    if (event.shiftKey) {
                      // On Shift+Tab, lift the list item out to the parent list
                      // Only lift if we're at least 2 levels deep
                      const path = listItem[1];
                      if (path.length > 2) {
                        Transforms.liftNodes(editor, {
                          match: (n: any) => n.type === "list_item",
                        });
                      }
                    } else {
                      // On Tab, wrap the list item in a new nested list
                      Transforms.wrapNodes(
                        editor,
                        { type: "ul_list", children: [] },
                        {
                          match: (n: any) => n.type === "list_item",
                        }
                      );
                    }
                    return;
                  } else {
                    // Insert tab character for non-list content
                    event.preventDefault();
                    Editor.insertText(editor, "\t");
                  }
                }
                // Handle deletion of list items
                if (event.key === "Backspace") {
                  const [listItem] = Editor.nodes(editor, {
                    match: (n: any) => n.type === "list_item",
                  });

                  if (listItem) {
                    const [node] = listItem;
                    // Check if list item is empty (only contains empty text)
                    const isEmptyListItem = Node.string(node).trim() === "";

                    if (isEmptyListItem) {
                      event.preventDefault();
                      // Lift the empty list item out of the list structure
                      Transforms.liftNodes(editor, {
                        match: (n: any) => n.type === "list_item",
                      });
                      // Convert the lifted node to a normal paragraph
                      Transforms.setNodes(editor, { type: "paragraph" });
                    }
                  }
                }

                for (const hotkey in HOTKEYS) {
                  if (isHotkey(hotkey, event)) {
                    event.preventDefault();
                    const mark = HOTKEYS[hotkey];
                    toggleMark(editor, mark);
                  }
                }
              }}
              onTouchStart={(event) => {
                onTouchStartHandlerForAutocomplete(event); // forward the event for internal use
              }}
              className={cn(
                moddedClassName,
                className,
                "flex-1 overflow-y-auto"
              )}
              onBlur={(ev) => {
                // clear autocompletion on blur
                onBlur?.(ev);
                clearAutocompletionsFromEditor(editor);
              }}
              {...propsToForward}
            />
          )}
          {suggestionsGenerating && showSkeletonFromProps && (
            <div className="absolute inset-0 bg-transparent" />
          )}
        </div>
      </Slate>
    );
  }
);

const BaseTextareaWithHoveringContext = forwardRef(
  (props: BaseTextareaProps, ref: React.Ref<HTMLCopanionTextAreaElement>) => {
    // separate into TextareaHTMLAttributes<HTMLDivElement> and CopilotTextareaProps
    const {
      placeholderStyle,
      value,
      hoverMenuClassname,
      onValueChange,
      baseAutosuggestionsConfig: autosuggestionsConfigFromProps,
      className,
      onChange,
      onKeyDown,
      onBlur,
      onDescendantChange,
      initialDescendant,
      setgenerating,
      shortcut,
      suggestionsStyle,
      showSkeleton: showSkeletonFromProps = true,
      onImmediateTextChange,
      ...propsToForward
    } = props;

    const autosuggestionsConfig: BaseAutosuggestionsConfig = {
      ...defaultBaseAutosuggestionsConfig,
      ...autosuggestionsConfigFromProps,
    };

    const editor = useTextareaEditor();
    const valueOnInitialRender = useMemo(() => value ?? "", []);

    const [lastKnownFullEditorText, setLastKnownFullEditorText] =
      useState(valueOnInitialRender);

    const [cursorMovedSinceLastTextChange, setCursorMovedSinceLastTextChange] =
      useState(false);
    // Ref to track inserted text length
    const insertedTextLengthRef = useRef(0);
    const [CHUNK_SIZE, setCHUNK_SIZE] = useState(3);
    const [suggestionsGenerating, setSuggestionsGenerating] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(false);
    const [descendant, setDescendant] = useState<Descendant[]>([]);
    const debouncedContent = useDebounce(descendant, 300); // Debounce the content

    const {
      isDisplayed: hoveringEditorIsDisplayed,
      setIsDisplayed: setHoveringEditorIsDisplayed,
    } = useHoveringEditorContext();

    const initialValue: Descendant[] = useMemo(() => {
      return [
        {
          type: "paragraph",
          children: [{ text: String(valueOnInitialRender) }],
        },
      ];
    }, [valueOnInitialRender]);

    const insertText = useCallback(
      (autosuggestion: AutosuggestionState) => {
        Editor.insertText(editor, autosuggestion.text, {
          at: autosuggestion.point,
        });
      },
      [editor]
    );

    const replaceAllText = useCallback(
      (suggestion: ReadableStream<string>) => {
        const reader = suggestion.getReader();
        let isCancelled = false;
        const buffer: string[] = []; // Use an array to store incoming characters
        let generatedText = "";
        let isEnded = false;
        let previousDescendant = descendant;

        const insertSingleText = (text: string) => {
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

          // Scroll to bottom after inserting text
          const editorElement = ReactEditor.toDOMNode(editor, editor);
          editorElement.scrollTop = editorElement.scrollHeight;

          insertedTextLengthRef.current += text.length;
          generatedText += text;
        };

        const readFromStream = async () => {
          try {
            while (!isCancelled) {
              const { done, value } = await reader.read();
              if (done) {
                isEnded = true;
                setCHUNK_SIZE(30);
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

              insertSingleText(chunk);

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
            insertSingleText(remainingText);
          }
        };

        const start = async () => {
          try {
            //set generating to false
            setShowSkeleton(false);
            // Assuming `editor` is your Slate editor instance
            // Clear the existing content
            HistoryEditor.withMerging(editor, async () => {
              Transforms.delete(editor, {
                at: {
                  anchor: Editor.start(editor, []),
                  focus: Editor.end(editor, []),
                },
              });
            });
            await Promise.all([readFromStream(), processBuffer()]);
            // Remove all content added during animation
            HistoryEditor.withMerging(editor, async () => {
              Transforms.delete(editor, {
                at: {
                  anchor: Editor.start(editor, []),
                  focus: Editor.end(editor, []),
                },
              });
            });

            const generatedDescendant = convertMarkdownToSlate(generatedText);
            HistoryEditor.withMerging(editor, () => {
              // Remove all nodes at the root
              while (editor.children.length > 0) {
                Transforms.removeNodes(editor, { at: [0] });
              }
              // Insert the new content
              Transforms.insertNodes(editor, generatedDescendant, {
                at: [0],
                batchDirty: true,
              });
            });
            //set generating to false
            setgenerating?.(false);
            setSuggestionsGenerating(false);
          } catch (error) {
            // Remove all content and revert to the previous state
            HistoryEditor.withMerging(editor, async () => {
              Transforms.delete(editor, {
                at: {
                  anchor: Editor.start(editor, []),
                  focus: Editor.end(editor, []),
                },
              });
            });
            HistoryEditor.withMerging(editor, () => {
              Transforms.insertNodes(editor, previousDescendant, {
                at: [0],
                batchDirty: true,
              });
            });
            setSuggestionsGenerating(false);
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
      },
      [editor]
    );

    const shouldDisableAutosuggestions =
      // textarea is manually disabled:
      autosuggestionsConfig.disabled ||
      // hovering editor is displayed:
      hoveringEditorIsDisplayed ||
      // the cursor has moved since the last text change AND we are configured to disable autosuggestions in this case:
      (cursorMovedSinceLastTextChange &&
        autosuggestionsConfig.temporarilyDisableWhenMovingCursorWithoutChangingText);

    const {
      currentAutocompleteSuggestion,
      onChangeHandler: onChangeHandlerForAutocomplete,
      onKeyDownHandler: onKeyDownHandlerForAutocomplete,
      onTouchStartHandler: onTouchStartHandlerForAutocomplete,
      onClickEnhancedHandler: onClickEnhancedHandlerForAutocomplete,
    } = useAutosuggestions(
      autosuggestionsConfig.debounceTime,
      autosuggestionsConfig.shouldAcceptAutosuggestionOnKeyPress,
      autosuggestionsConfig.shouldAcceptAutosuggestionOnTouch,
      autosuggestionsConfig.apiConfig.autosuggestionsFunction,
      insertText,
      replaceAllText,
      autosuggestionsConfig.disableWhenEmpty,
      shouldDisableAutosuggestions,
      autosuggestionsConfig.disabledAutosuggestionsWhenTyping,
      autosuggestionsConfig.apiConfig.enhanceTextFunction
    );

    const onKeyDownHandlerForHoveringEditor = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (
          autosuggestionsConfig.shouldToggleHoveringEditorOnKeyPress(
            event,
            shortcut ?? "k"
          )
        ) {
          event.preventDefault();
          setHoveringEditorIsDisplayed(!hoveringEditorIsDisplayed);
        }
      },
      [
        hoveringEditorIsDisplayed,
        setHoveringEditorIsDisplayed,
        autosuggestionsConfig.shouldToggleHoveringEditorOnKeyPress,
      ]
    );

    // sync autosuggestions state with the editor
    useEffect(() => {
      clearAutocompletionsFromEditor(editor);
      if (currentAutocompleteSuggestion) {
        addAutocompletionsToEditor(
          editor,
          currentAutocompleteSuggestion.text,
          currentAutocompleteSuggestion.point
        );
      }
    }, [currentAutocompleteSuggestion]);

    useEffect(() => {
      const newEditorState = getTextAroundCollapsedCursor(editor);

      const fullEditorText = newEditorState
        ? newEditorState.textBeforeCursor + newEditorState.textAfterCursor
        : getFullEditorTextWithNewlines(editor); // we don't double-parse the editor. When `newEditorState` is null, we didn't parse the editor yet.

      setLastKnownFullEditorText((prev) => {
        if (prev !== fullEditorText) {
          setCursorMovedSinceLastTextChange(false);
        }
        return fullEditorText;
      });

      onChangeHandlerForAutocomplete(newEditorState);
      onValueChange?.(fullEditorText);
      onChange?.(makeSemiFakeReactTextAreaEvent(fullEditorText));
    }, [debouncedContent]);

    const suggestionStyleAugmented: React.CSSProperties = useMemo(() => {
      return {
        fontStyle: "italic",
        color: "gray",
        ...suggestionsStyle,
      };
    }, [suggestionsStyle]);

    const renderElementMemoized = useMemo(() => {
      return makeRenderElementFunction(suggestionStyleAugmented);
    }, [suggestionStyleAugmented]);

    const renderPlaceholderMemoized = useMemo(() => {
      // For some reason slateJS specifies a top value of 0, which makes for strange styling. We override this here.
      const placeholderStyleSlatejsOverrides: React.CSSProperties = {
        top: undefined,
      };

      const placeholderStyleAugmented: React.CSSProperties = {
        ...placeholderStyleSlatejsOverrides,
        ...placeholderStyle,
      };

      return makeRenderPlaceholderFunction(placeholderStyleAugmented);
    }, [placeholderStyle]);

    const enhanceHandler = useCallback(
      (enhanceHandlerArgs: EnhanceHandler) => {
        setgenerating?.(true);
        setShowSkeleton(true);
        setSuggestionsGenerating(true);
        const newEditorState = getTextAroundCollapsedCursor(editor);
        const fullEditorText = newEditorState
          ? newEditorState.textBeforeCursor + newEditorState.textAfterCursor
          : getFullEditorTextWithNewlines(editor); // we don't double-parse the editor. When `newEditorState` is null, we didn't parse the editor yet.

        setLastKnownFullEditorText((prev) => {
          if (prev !== fullEditorText) {
            setCursorMovedSinceLastTextChange(false);
          }
          return fullEditorText;
        });

        onClickEnhancedHandlerForAutocomplete({
          entireText: fullEditorText,
          enhancedText: enhanceHandlerArgs.enhanceText ?? "Enhanced text",
          systemPrompt: enhanceHandlerArgs.systemPrompt,
          history: enhanceHandlerArgs.history ?? [],
        });

        onValueChange?.(fullEditorText);
        onChange?.(makeSemiFakeReactTextAreaEvent(fullEditorText));
      },
      [editor]
    );

    // update the editor text, but only when the value changes from outside the component
    useEffect(() => {
      if (value === lastKnownFullEditorText) {
        return;
      }

      setLastKnownFullEditorText(value ?? "");
      replaceEditorText(editor, value ?? "");
    }, [value]);

    useAddBrandingCss(suggestionStyleAugmented);
    usePopulateTextareaRef(editor, ref, enhanceHandler);

    const moddedClassName = (() => {
      const baseClassName = "AItextarea";
      const defaultTailwindClassName =
        "flex-1 bg-background text-foreground/70 placeholder-muted-foreground text-sm overflow-y-auto resize-none border-none break-all overflow-y-auto customScrollbar2 border-1 border-solid border-primary/30";
      const mergedClassName = twMerge(
        defaultTailwindClassName,
        className ?? ""
      );
      return `${baseClassName} ${mergedClassName}`;
    })();

    return (
      <Slate
        editor={editor}
        initialValue={initialValue}
        onChange={(value) => {
          setDescendant(value);
          const plainText = (
            value?.map((node) => Node.string(node)).join("\n") || ""
          ).replace(/\n+$/, "");
          onImmediateTextChange?.(plainText);
        }}
      >
        <div className="flex flex-col h-full w-full overflow-hidden">
          <TrackerTextEditedSinceLastCursorMovement
            setCursorMovedSinceLastTextChange={
              setCursorMovedSinceLastTextChange
            }
          />
          <HoveringToolbar
            apiConfig={autosuggestionsConfig.apiConfig}
            contextCategories={autosuggestionsConfig.contextCategories}
            hoverMenuClassname={hoverMenuClassname}
            isDisplayed={hoveringEditorIsDisplayed}
            setIsDisplayed={setHoveringEditorIsDisplayed}
          />
          {showSkeleton && showSkeletonFromProps ? (
            <NoteEditorSkeleton count={20} />
          ) : (
            <Editable
              renderElement={renderElementMemoized}
              renderPlaceholder={renderPlaceholderMemoized}
              onKeyDown={(event) => {
                onKeyDownHandlerForHoveringEditor(event); // forward the event for internal use
                onKeyDownHandlerForAutocomplete(event); // forward the event for internal use
                onKeyDown?.(event); // forward the event for external use
              }}
              onTouchStart={(event) => {
                onTouchStartHandlerForAutocomplete(event); // forward the event for internal use
              }}
              className={cn(
                moddedClassName,
                className,
                "flex-1 overflow-y-auto"
              )}
              onBlur={(ev) => {
                // clear autocompletion on blur
                onBlur?.(ev);
                clearAutocompletionsFromEditor(editor);
              }}
              {...propsToForward}
            />
          )}
          {suggestionsGenerating && showSkeletonFromProps && (
            <div className="absolute inset-0 bg-transparent" />
          )}
        </div>
      </Slate>
    );
  }
);

function makeSemiFakeReactTextAreaEvent(
  currentText: string
): React.ChangeEvent<HTMLTextAreaElement> {
  return {
    target: {
      value: currentText,
      type: "AItextarea",
    },
    currentTarget: {
      value: currentText,
      type: "AItextarea",
    },
  } as React.ChangeEvent<HTMLTextAreaElement>;
}
