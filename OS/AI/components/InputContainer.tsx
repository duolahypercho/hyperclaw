"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Send,
  Paperclip,
  Mic,
  Smile,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Square,
  Cpu,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { getMediaUrl } from "$/utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from "uuid";
import { gatewayConnection, subscribeGatewayConnection } from "$/lib/openclaw-gateway-ws";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import { readOpenClawConfig, getAgentModel } from "$/lib/identity-md";
import {
  AttachmentPreview,
  AttachmentPreviewModal,
  InputContainerProps,
  InternalAttachment,
  InputAttachment,
  AttachmentUnion,
} from "@OS/AI/components/Chat";
import { useLiveTranscription, VoiceController, VoiceWaveform } from "$/components/Tool/VoiceToText";

/** Circular context window usage indicator — hover for details */
const ContextWindowIndicator: React.FC<{ used: number; total: number }> = ({ used, total }) => {
  const percentage = Math.min((used / total) * 100, 100);
  const remaining = Math.max(total - used, 0);
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return `${n}`;
  };

  const strokeColor =
    percentage >= 90 ? "stroke-red-500" :
    percentage >= 70 ? "stroke-yellow-500" :
    "stroke-emerald-500";

  const textColor =
    percentage >= 90 ? "text-red-500" :
    percentage >= 70 ? "text-yellow-500" :
    "text-emerald-500";

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="h-7 w-7 p-0 flex items-center justify-center rounded-md hover:bg-primary/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" className="transform -rotate-90">
              <circle cx="8" cy="8" r={radius} fill="none" className="stroke-muted-foreground/20" strokeWidth="2" />
              <circle
                cx="8" cy="8" r={radius} fill="none"
                className={cn("transition-all duration-500", strokeColor)}
                strokeWidth="2" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              />
            </svg>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            className="z-[1000] rounded-lg border border-primary/20 bg-popover/95 backdrop-blur-sm px-3 py-2.5 shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          >
            <div className="flex flex-col gap-2 min-w-[160px]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Context Window</span>
                <span className={cn("text-xs font-semibold", textColor)}>
                  {Math.round(percentage)}%
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-muted-foreground/15 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    percentage >= 90 ? "bg-red-500" :
                    percentage >= 70 ? "bg-yellow-500" :
                    "bg-emerald-500"
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="flex flex-col gap-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Used</span>
                  <span className="font-medium text-foreground">{fmt(used)} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-medium text-foreground">{fmt(remaining)} tokens</span>
                </div>
                <div className="flex justify-between border-t border-solid border-l-0 border-r-0 border-b-0 border-border/50 pt-1 mt-0.5">
                  <span className="text-muted-foreground">Limit</span>
                  <span className="font-medium text-foreground">{fmt(total)} tokens</span>
                </div>
              </div>
            </div>
            <Tooltip.Arrow className="fill-popover/95" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

export const InputContainer: React.FC<InputContainerProps> = ({
  onSendMessage,
  placeholder = "Type your message...",
  value: controlledValue,
  onChange: controlledOnChange,
  onInputChange,
  inputRef,
  maxLength,
  rows = 2,
  disabled = false,
  isLoading = false,
  isSending = false,
  isClosed = false,
  loadingText = "Sending...",
  showAttachments = true,
  showVoiceInput = false,
  showEmojiPicker = false,
  showActions = true,
  autoResize = true,
  allowEmptySend = false,
  maxAttachments = 5,
  allowedFileTypes,
  maxFileSize,
  actions = [],
  className,
  inputClassName,
  buttonClassName,
  onKeyDown,
  onFocus,
  onBlur,
  attachments: externalAttachments,
  onAttachmentsChange,
  onAddFiles,
  sessionKey,
  agentId,
  onStopGeneration,
  tokenUsage,
  contextLimit,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFilesRef = useRef<(files: FileList | File[]) => Promise<void>>(async () => {});
  const { toast } = useToast();

  // Live transcription hook
  const {
    transcript,
    interimTranscript,
    isListening,
    error: transcriptionError,
    audioData,
    startListening,
    stopListening,
    clearTranscript,
  } = useLiveTranscription();
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const pushToTalkRef = useRef(false);
  const [internalAttachments, setInternalAttachments] = useState<
    InternalAttachment[]
  >([]);
  const [previewAttachment, setPreviewAttachment] =
    useState<InputAttachment | null>(null);
  const [textPreviewContent, setTextPreviewContent] = useState<string | null>(
    null
  );
  const [pdfPreviewContent, setPdfPreviewContent] = useState<Blob | null>(null);

  // Models from centralized context
  const { models: contextModels } = useOpenClawContext();
  const availableModels = contextModels;
  const [currentModel, setCurrentModel] = useState<string>("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : inputValue;
  const baseSetValue = isControlled ? controlledOnChange : setInputValue;

  // Wrap setValue to also fire onInputChange notification
  const setValue = useCallback((val: string) => {
    baseSetValue?.(val);
    onInputChange?.(val);
  }, [baseSetValue, onInputChange]);

  // Keep a ref to the current value for imperative getValue()
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;

  // Expose imperative handle for parent components
  useEffect(() => {
    if (!inputRef) return;
    inputRef.current = {
      clear: () => {
        if (!isControlled) setInputValue("");
        onInputChange?.("");
      },
      focus: () => textareaRef.current?.focus(),
      getValue: () => currentValueRef.current,
      setValue: (val: string) => {
        if (!isControlled) setInputValue(val);
        onInputChange?.(val);
      },
      addFiles: (files: FileList | File[]) => addFilesRef.current(files),
    };
    return () => { if (inputRef) inputRef.current = null; };
  }, [inputRef, isControlled, onInputChange]);

  // Get session model when sessionKey changes; fall back to agent default from openclaw.json
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Try session-level model from gateway
      if (sessionKey && gatewayConnection.connected) {
        try {
          const sessionModel = await gatewayConnection.getSessionModel(sessionKey);
          if (!cancelled && sessionModel) {
            setCurrentModel(sessionModel);
            return;
          }
        } catch {
          // ignore
        }
      }
      // 2. Fall back to agent's default model from openclaw.json
      if (agentId) {
        try {
          const config = await readOpenClawConfig();
          if (!cancelled && config) {
            const agentModel = getAgentModel(config, agentId);
            if (agentModel) {
              setCurrentModel(agentModel);
              return;
            }
          }
        } catch {
          // ignore
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionKey, agentId]);

  // Use external attachments if provided, otherwise use internal state
  const currentAttachments: AttachmentUnion[] =
    externalAttachments || internalAttachments;
  const setCurrentAttachments = useCallback(
    (
      attachments:
        | AttachmentUnion[]
        | ((prev: AttachmentUnion[]) => AttachmentUnion[])
    ) => {
      if (onAttachmentsChange) {
        if (typeof attachments === "function") {
          onAttachmentsChange(attachments(currentAttachments));
        } else {
          onAttachmentsChange(attachments);
        }
      } else {
        // Use functional updater to avoid stale closure issues
        // (e.g. async processFile holding old setCurrentAttachments ref)
        setInternalAttachments((prev) => {
          const newAttachments =
            typeof attachments === "function"
              ? attachments(prev)
              : attachments;
          return newAttachments.filter(
            (a): a is InternalAttachment => "file" in a
          );
        });
      }
    },
    [onAttachmentsChange, currentAttachments]
  );

  const isInputDisabled = useMemo(
    () => disabled,
    [disabled]
  );

  const isUploading = useMemo(
    () => currentAttachments.some((a) => a.uploading),
    [currentAttachments]
  );

  const canSend = useMemo(
    () =>
      !isUploading &&
      (allowEmptySend ||
        (currentValue.trim().length > 0 && !isComposing) ||
        (currentAttachments.length > 0 && !isComposing)),
    [
      allowEmptySend,
      currentValue,
      isComposing,
      currentAttachments,
      isUploading,
    ]
  );

  // When component becomes disabled, clear attachments
  useEffect(() => {
    if (isClosed && currentAttachments.length) {
      setCurrentAttachments([]);
    }
  }, [
    isClosed,
    currentAttachments,
    setCurrentAttachments,
  ]);

  // Reset file input when sessionKey changes (new chat)
  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [sessionKey]);

  // Handle model change
  const handleModelChange = async (modelId: string) => {
    if (!sessionKey) return;
    try {
      const client = gatewayConnection;
      // Find the selected model to get the provider
      const selectedModel = availableModels.find(m => m.id === modelId);
      // Combine provider and model ID if provider exists
      const fullModelId = selectedModel?.provider
        ? `${selectedModel.provider}/${modelId}`
        : modelId;
      await client.patchSession(sessionKey, { model: fullModelId });
      setCurrentModel(modelId);
    } catch (error) {
      const err = error as Error;
      console.error("Failed to update model:", err.message);
    }
  };

  const handleSendMessage = async () => {
    if (!canSend || isInputDisabled) return;

    const baseMessage = currentValue.trim();
    if (!baseMessage && !allowEmptySend && currentAttachments.length === 0)
      return;

    // Append environment details with selected action type
    const messageToSend = `${baseMessage}`;

    // Store the current values to restore on error
    const currentInputValue = currentValue;
    const attachmentsToSend = [...currentAttachments];

    // Clear input and attachments immediately for better UX
    if (!isControlled) {
      setInputValue("");
    }
    setCurrentAttachments([]);

    try {
      await onSendMessage(
        messageToSend,
        attachmentsToSend.map((f) => {
          // Handle both internal and external attachment types
          if ("file" in f) {
            return {
              id: f.id,
              type: f.file.type.split("/")[0] as
                | "image"
                | "file"
                | "mp3"
                | "wav"
                | "pdf",
              name: f.file.name,
              size: f.file.size,
              url: f.url,
            };
          } else {
            return {
              id: f.id,
              type: f.type,
              name: f.name,
              size: f.size,
              url: f.url || "",
            };
          }
        })
      );

      // Refocus the textarea after sending
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Restore input on error so user can retry
      if (!isControlled) {
        setInputValue(currentInputValue);
      }
      setCurrentAttachments(attachmentsToSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Call custom onKeyDown handler
    onKeyDown?.(e);

    // Handle Enter key - prevent if disabled or uploading
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isInputDisabled && !isUploading) {
        handleSendMessage();
      }
    }
  };

  // Helper function to determine file category and allowed type
  const getFileCategory = (file: File) => {
    const mimeMain = file.type.split("/")[0];

    if (mimeMain === "image") {
      return { category: "image", allowedType: "image" as const };
    } else if (file.type === "application/pdf") {
      return { category: "file", allowedType: "pdf" as const };
    } else if (file.type === "text/plain") {
      return { category: "file", allowedType: "txt" as const };
    } else {
      return { category: "file", allowedType: "txt" as const };
    }
  };

  // Helper function to validate file
  const validateFile = (file: File): boolean => {
    // Validate size
    if (maxFileSize && file.size > maxFileSize) {
      toast({
        title: "File too large",
        description: `${file.name} exceeds the size limit`,
        variant: "destructive",
      });
      return false;
    }

    // Validate type if provided
    if (allowedFileTypes && !allowedFileTypes.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: file.type,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  // Helper function to convert file to base64 (like OpenClaw)
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper function to process a single file
  const processFile = async (file: File) => {
    const id = uuidv4();
    const { category } = getFileCategory(file);

    // Create local preview for images
    const localPreview =
      category === "image" ? URL.createObjectURL(file) : undefined;

    // Optimistically add with uploading flag
    setCurrentAttachments((prev: AttachmentUnion[]) => [
      ...prev,
      {
        file,
        url: "",
        uploading: true,
        id,
        localPreview,
      } as InternalAttachment,
    ]);

    try {
      // Convert to base64 inline (no cloud upload)
      const base64Data = await fileToBase64(file);

      // Update attachment with base64 data
      setCurrentAttachments((prev: AttachmentUnion[]) =>
        prev.map((a) =>
          ("file" in a ? a.file === file : a.id === id)
            ? { ...a, url: base64Data, uploading: false }
            : a
        )
      );
    } catch (error) {
      console.error(`Failed to process ${file.name}:`, error);
      // Remove failed file
      setCurrentAttachments((prev: AttachmentUnion[]) =>
        prev.filter((a) => ("file" in a ? a.file !== file : a.id === id))
      );

      toast({
        title: "Failed to process file",
        description: `Failed to process ${file.name}`,
        variant: "destructive",
      });
    }
  };

  // Generic function to add files (from input, paste, or drag-drop)
  // Keep ref in sync so the imperative handle always has the latest closure
  const addFiles = async (files: FileList | File[]) => {
    if (onAddFiles) {
      await onAddFiles(files);
      return;
    }

    const filesArr = Array.from(files);

    // Check attachment limit
    if (currentAttachments.length + filesArr.length > maxAttachments) {
      toast({
        title: `Maximum ${maxAttachments} files allowed`,
        variant: "destructive",
      });
      return;
    }

    // Separate images and files for better organization
    const images = filesArr.filter((file) => file.type.startsWith("image/"));
    const otherFiles = filesArr.filter(
      (file) => !file.type.startsWith("image/")
    );

    // Process images
    for (const image of images) {
      if (validateFile(image)) {
        await processFile(image);
      }
    }

    // Process other files (pdf, docx, txt, audio, etc.)
    for (const file of otherFiles) {
      if (validateFile(file)) {
        await processFile(file);
      }
    }
  };
  addFilesRef.current = addFiles;

  const handlePaste = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>
  ) => {
    const items = event.clipboardData.items;

    // Check for text/plain first using synchronous method to decide whether to prevent default
    const textData = event.clipboardData.getData("text/plain");
    const hasLongText = textData.length > 50000;

    // Scan all items for an image first — clipboard item order varies by
    // platform (macOS/Chromium often puts text/plain before image/png),
    // so a linear scan that breaks on text/plain would miss the image.
    let imageItem: DataTransferItem | null = null;
    let pdfItem: DataTransferItem | null = null;
    let hasText = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!imageItem && item.type.indexOf("image") === 0) imageItem = item;
      else if (!pdfItem && item.type.indexOf("application/pdf") === 0) pdfItem = item;
      else if (item.type.indexOf("text/plain") === 0) hasText = true;
    }

    // Prioritise image > pdf > text
    if (imageItem) {
      event.preventDefault();
      if (currentAttachments.length === maxAttachments) {
        toast({
          title: "Max files reached",
          description: `You can only upload ${maxAttachments} files`,
          variant: "destructive",
        });
        return;
      }
      const file = imageItem.getAsFile();
      if (file) {
        addFiles([file]);
      }
      return;
    }

    if (pdfItem) {
      event.preventDefault();
      const file = pdfItem.getAsFile();
      if (file) {
        addFiles([file]);
      }
      return;
    }

    if (hasText && hasLongText) {
      event.preventDefault();
      const textFile = new File([textData], `pasted-text-${Date.now()}.txt`, {
        type: "text/plain",
      });
      addFiles([textFile]);
    }
    // Short text — don't prevent default, let browser handle it to maintain undo stack
  };

  const handleAttachmentRemove = (index: number) => {
    setCurrentAttachments(currentAttachments.filter((_, i) => i !== index));
  };

  // Function to fetch and display text content
  const handleTextFileClick = async (attachment: InputAttachment) => {
    if (!attachment.url) {
      return;
    }

    try {
      const response = await fetch(getMediaUrl(attachment.url));
      if (!response.ok) throw new Error("Failed to fetch text content");

      const textContent = await response.text();
      setTextPreviewContent(textContent);
      setPreviewAttachment(attachment);
    } catch (error) {
      console.error("Error fetching text content:", error);
      toast({
        title: "Error loading file",
        description: "Could not load the text content",
        variant: "destructive",
      });
    }
  };

  const handlePdfFileClick = async (attachment: InputAttachment) => {
    if (!attachment.url) {
      return;
    }
    try {
      // Set preview attachment first to show loading state
      setPreviewAttachment({
        id: attachment.id,
        type: "file",
        name: attachment.name,
        url: attachment.url,
      });

      const response = await fetch(getMediaUrl(attachment.url));

      if (!response.ok) {
        throw new Error(
          `Failed to fetch PDF: ${response.status} ${response.statusText}`
        );
      }

      // Check content type
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("pdf")) {
        console.warn("Content type is not PDF:", contentType);
      }

      const pdfContent = await response.blob();

      // Verify blob is valid
      if (!pdfContent || pdfContent.size === 0) {
        throw new Error("Received empty PDF blob");
      }
      setPdfPreviewContent(pdfContent);
    } catch (error) {
      console.error("Error fetching PDF content:", error);
      toast({
        title: "Error loading file",
        description:
          error instanceof Error
            ? error.message
            : "Could not load the PDF content",
        variant: "destructive",
      });
      // Reset preview on error
      setPreviewAttachment(null);
      setPdfPreviewContent(null);
    }
  };

  const handleClosePreview = () => {
    setPreviewAttachment(null);
    setTextPreviewContent(null);
    setPdfPreviewContent(null);
  };

  // Sync transcript to input value when in voice mode
  useEffect(() => {
    if (isVoiceMode && transcript) {
      setValue?.(transcript);
    }
  }, [transcript, isVoiceMode, setValue]);

  // Show transcription errors
  useEffect(() => {
    if (transcriptionError) {
      toast({
        title: "Transcription Error",
        description: transcriptionError,
        variant: "destructive",
      });
    }
  }, [transcriptionError, toast]);

  // Sync isListening state with isRecording
  useEffect(() => {
    setIsRecording(isListening);
  }, [isListening]);

  // Cleanup: Stop listening when voice mode is disabled
  useEffect(() => {
    if (!isVoiceMode && !isPushToTalk && isListening) {
      stopListening();
      clearTranscript();
    }
  }, [isVoiceMode, isPushToTalk, isListening, stopListening, clearTranscript]);

  // Push-to-talk: insert transcript at cursor when key released
  useEffect(() => {
    if (!isPushToTalk && pushToTalkRef.current && transcript) {
      // Key was just released and we have a transcript — insert at cursor
      pushToTalkRef.current = false;
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart ?? currentValue.length;
        const end = textarea.selectionEnd ?? start;
        const before = currentValue.slice(0, start);
        const after = currentValue.slice(end);
        const spaceBefore = before.length > 0 && !before.endsWith(" ") ? " " : "";
        const spaceAfter = after.length > 0 && !after.startsWith(" ") ? " " : "";
        const newValue = before + spaceBefore + transcript.trim() + spaceAfter + after;
        setValue?.(newValue);
        // Move cursor to end of inserted text
        const cursorPos = (before + spaceBefore + transcript.trim()).length;
        requestAnimationFrame(() => {
          textarea.setSelectionRange(cursorPos, cursorPos);
        });
      } else {
        // Fallback: append
        const spacer = currentValue.length > 0 && !currentValue.endsWith(" ") ? " " : "";
        setValue?.(currentValue + spacer + transcript.trim());
      }
      clearTranscript();
    } else if (!isPushToTalk && pushToTalkRef.current) {
      pushToTalkRef.current = false;
    }
  }, [isPushToTalk, transcript, currentValue, setValue, clearTranscript]);

  // Push-to-talk: also handle interim transcript display during recording
  useEffect(() => {
    if (isPushToTalk && interimTranscript) {
      // Show interim text as placeholder hint — don't modify actual value
    }
  }, [isPushToTalk, interimTranscript]);

  // Push-to-talk: global Ctrl+Shift+Space hold-to-record
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.ctrlKey && e.shiftKey && !e.repeat) {
        e.preventDefault();
        if (!pushToTalkRef.current) {
          pushToTalkRef.current = true;
          setIsPushToTalk(true);
          clearTranscript();
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && pushToTalkRef.current) {
        e.preventDefault();
        setIsPushToTalk(false);
        stopListening();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startListening, stopListening, clearTranscript]);

  const handleVoiceModeStart = useCallback(() => {
    setIsVoiceMode(true);
    startListening();
  }, [startListening]);

  const handleVoiceModeStop = useCallback(() => {
    stopListening();
    setIsVoiceMode(false);
    clearTranscript();
  }, [stopListening, clearTranscript]);

  const handleVoiceModeSend = useCallback(async () => {
    const transcriptToSend = transcript || currentValue;

    if (!transcriptToSend.trim()) {
      toast({
        title: "No transcript",
        description: "Please speak something before sending",
        variant: "destructive",
      });
      return;
    }

    // Stop listening if still active
    if (isListening) {
      stopListening();
    }

    // Set the transcript as the input value
    setValue?.(transcriptToSend);

    // Send the message
    const baseMessage = transcriptToSend.trim();
    const messageToSend = `${baseMessage}`;

    try {
      // Clear transcript and reset voice mode
      clearTranscript();
      setIsVoiceMode(false);
      setIsRecording(false);
      
      await onSendMessage(messageToSend, []);

      // Clear input if not controlled
      if (!isControlled) {
        setInputValue("");
      }
    } catch (error) {
      console.error("Error sending voice message:", error);
      toast({
        title: "Failed to send",
        description: "Could not send the message. Please try again.",
        variant: "destructive",
      });
    }
  }, [
    transcript,
    currentValue,
    isListening,
    stopListening,
    setValue,
    onSendMessage,
    clearTranscript,
    isControlled,
    setInputValue,
    toast,
  ]);

  const renderActionButton = useCallback(() => {
    const baseClassName = cn("h-8 w-8 p-0 transition-all duration-200", buttonClassName);
    const hasInput = currentValue.trim().length > 0 || currentAttachments.length > 0;

    // When loading: show send button if user typed (queues via parent), otherwise stop button
    if (isLoading && onStopGeneration) {
      if (hasInput) {
        return (
          <div className="flex items-center gap-1">
            <Button
              onClick={onStopGeneration}
              size="sm"
              variant="destructive"
              className={baseClassName}
            >
              <Square className="w-4 h-4 fill-current" />
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={!canSend || isInputDisabled || isUploading}
              size="sm"
              className={cn(
                baseClassName,
                (isInputDisabled || isUploading) && "opacity-50 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        );
      }
      return (
        <Button
          onClick={onStopGeneration}
          size="sm"
          variant="destructive"
          className={baseClassName}
        >
          <Square className="w-4 h-4 fill-current" />
        </Button>
      );
    }

    // Mic button when input is empty
    if (!hasInput) {
      return (
        <Button
          size="sm"
          disabled={isInputDisabled}
          onClick={handleVoiceModeStart}
          className={baseClassName}
        >
          <Mic className="w-4 h-4" />
        </Button>
      );
    }

    // Send button
    return (
      <Button
        onClick={handleSendMessage}
        disabled={!canSend || isInputDisabled || isUploading}
        size="sm"
        className={cn(
          baseClassName,
          (isInputDisabled || isUploading) && "opacity-50 cursor-not-allowed"
        )}
      >
        {isSending ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </Button>
    );
  }, [
    isLoading,
    onStopGeneration,
    currentValue,
    currentAttachments.length,
    isInputDisabled,
    canSend,
    isUploading,
    isSending,
    buttonClassName,
    handleSendMessage,
    handleVoiceModeStart,
  ]);

  // Voice controller UI
  const renderVoiceController = useCallback(() => {
    return (
      <VoiceController
        isListening={isListening}
        transcript={transcript}
        currentValue={currentValue}
        audioData={audioData}
        onStart={handleVoiceModeStart}
        onStop={handleVoiceModeStop}
        onSend={handleVoiceModeSend}
      />
    );
  }, [
    isListening,
    transcript,
    currentValue,
    audioData,
    handleVoiceModeStart,
    handleVoiceModeStop,
    handleVoiceModeSend,
  ]);

  // Default controller UI (action type selector, attachments, send button)
  const renderDefaultController = useCallback(() => {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className="flex flex-row items-end justify-between w-full"
      >
        <div className="flex flex-row items-end gap-0">
          {showActions && (isLoadingModels ? (
            <div className="flex items-center gap-1.5 h-[30px] px-2">
              <div className="w-3 h-3 rounded-sm bg-muted-foreground/20 animate-pulse" />
              <div className="w-[80px] h-3 rounded bg-muted-foreground/20 animate-pulse" />
            </div>
          ) : availableModels.length > 0 ? (
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-fit py-1.5 px-2 gap-1.5 text-xs font-normal hover:bg-primary/10 transition-colors"
                >
                  {isLoadingModels ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Cpu className="w-3 h-3" />
                  )}
                  <span className="max-w-[100px] truncate">
                    {currentModel ? currentModel.split('/').pop() || currentModel : "Default Model"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-3 h-3 opacity-60 transition-transform duration-200",
                      isPopoverOpen && "rotate-180"
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-48 p-1 bg-card/95 backdrop-blur-sm border-primary/20 max-h-64 overflow-y-auto customScrollbar2"
                align="start"
                side="top"
              >
                <div className="flex flex-col gap-0.5">
                  {availableModels.map((model) => (
                    <Button
                      key={model.id}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-between h-fit py-1.5 px-2 text-xs font-normal hover:bg-primary/10 transition-colors gap-2",
                        currentModel === model.id && "bg-primary/10 text-primary"
                      )}
                      onClick={() => {
                        handleModelChange(model.id);
                        setIsPopoverOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Cpu className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{model.id.split('/').pop() || model.id}</span>
                      </div>
                      {currentModel === model.id && (
                        <Check className="w-3 h-3 flex-shrink-0" />
                      )}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : null)}
          {showEmojiPicker && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Smile className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-row items-end gap-1">
          <div className="flex items-end gap-1 relative">
            {/* Context window usage indicator */}
            {tokenUsage != null && contextLimit != null && contextLimit > 0 && (
              <ContextWindowIndicator used={tokenUsage} total={contextLimit} />
            )}
            {/* File picker button */}
            {showAttachments && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isInputDisabled}
                onClick={() => fileInputRef.current?.click()}
                className="h-8 w-8 p-0"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
            )}
          </div>
          {renderActionButton()}
        </div>
      </motion.div>
    );
  }, [
    showActions,
    isPopoverOpen,
    availableModels,
    currentModel,
    isLoadingModels,
    handleModelChange,
    setIsPopoverOpen,
    showEmojiPicker,
    showAttachments,
    isInputDisabled,
    renderActionButton,
    tokenUsage,
    contextLimit,
  ]);

  return (
    <div className="pointer-events-auto">
      {/* Preview overlay rendered via portal to document.body */}
      {previewAttachment && typeof window !== "undefined" && (
        <AttachmentPreviewModal
          attachment={previewAttachment}
          textContent={textPreviewContent}
          pdfContent={pdfPreviewContent}
          onClose={handleClosePreview}
        />
      )}
      <div className={cn("relative space-y-3", className)}>
        {/* Input Area */}
        <div className="relative flex flex-col items-end w-full">
          {/* Text Input */}
          <div
            className={cn(
              "flex-1 flex flex-col h-fit w-full rounded-md border border-solid border-primary/10 bg-background/60 backdrop-blur-sm px-3 py-2 text-sm font-normal ring-offset-ring-input-ring-focus placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1px] focus-visible:ring-primary/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] overflow-clip gap-2",
              isInputDisabled && "opacity-60 cursor-not-allowed",
              inputClassName
            )}
          >
            {/* Attachment Previews */}
            <AnimatePresence>
              {currentAttachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2 overflow-hidden"
                >
                  {currentAttachments.map((attachment, index) => {
                    // Handle both internal and external attachment types
                    const isInternal = "file" in attachment;
                    const attachmentData = isInternal
                      ? {
                        id: attachment.id,
                        type: attachment.file.type.split("/")[0] as
                          | "image"
                          | "file"
                          | "mp3"
                          | "wav",
                        name: attachment.file.name,
                        size: attachment.file.size,
                        url: attachment.url,
                        preview:
                          (attachment as any).localPreview ||
                          (attachment.url
                            ? getMediaUrl(attachment.url)
                            : undefined),
                        uploading: attachment.uploading,
                      }
                      : {
                        id: attachment.id,
                        type: attachment.type,
                        name: attachment.name,
                        size: attachment.size,
                        url: attachment.url || "",
                        preview:
                          attachment.preview ||
                          (attachment.url
                            ? getMediaUrl(attachment.url)
                            : undefined),
                        uploading: attachment.uploading || false,
                      };

                    return (
                      <AttachmentPreview
                        key={attachment.id}
                        attachment={attachmentData}
                        onRemove={() => handleAttachmentRemove(index)}
                        onClick={() => {
                          // Handle image preview
                          if (
                            isInternal
                              ? attachment.file.type.startsWith("image/")
                              : attachment.type.includes("image")
                          ) {
                            setPreviewAttachment({
                              id: attachmentData.name,
                              type: "image",
                              name: attachmentData.name,
                              url: attachmentData.url,
                              preview: attachmentData.preview,
                            });
                          }
                          // Handle text file preview
                          else if (
                            isInternal
                              ? attachment.file.type === "text/plain"
                              : attachmentData.type.includes("text") ||
                              attachmentData.type.includes("txt")
                          ) {
                            handleTextFileClick(attachmentData);
                          }
                          //Handle pdf file preview
                          else if (
                            isInternal
                              ? attachment.file.type === "application/pdf"
                              : attachmentData.type.includes("pdf")
                          ) {
                            handlePdfFileClick(attachmentData);
                          }
                        }}
                      />
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <TextareaAutosize
              ref={textareaRef}
              value={currentValue}
              onChange={(e) => setValue?.(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onFocus={onFocus}
              onBlur={onBlur}
              onPaste={handlePaste}
              disabled={isInputDisabled}
              minRows={rows}
              maxRows={8}
              placeholder={
                isPushToTalk
                    ? (interimTranscript || "Listening...")
                    : isUploading
                    ? "Uploading files... Please wait..."
                    : placeholder
              }
              className="w-full resize-none border-none shadow-none bg-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 rounded-none disabled:cursor-not-allowed customScrollbar2"
            />

            {/* Push-to-talk inline indicator */}
            <AnimatePresence>
              {isPushToTalk && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="flex items-center gap-2 px-1 py-1"
                >
                  <div className="flex items-center gap-1">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-red-500"
                    />
                    <span className="text-xs text-muted-foreground">Recording</span>
                  </div>
                  <VoiceWaveform audioData={audioData} isListening={true} barCount={7} minHeight={4} maxHeight={16} />
                  <span className="text-xs text-muted-foreground/60">Release to insert</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controller - Voice or Default */}
            <div className="flex-1 flex flex-row justify-between relative min-h-[32px]">
              <AnimatePresence mode="wait">
                {isVoiceMode ? (
                  <React.Fragment key="voice-controller">
                    {renderVoiceController()}
                  </React.Fragment>
                ) : (
                  <React.Fragment key="default-controller">
                    {renderDefaultController()}
                  </React.Fragment>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Hidden input for file upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={allowedFileTypes?.join(",")}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
          }}
        />
      </div>
    </div>
  );
};

export default InputContainer;
