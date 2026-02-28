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
import { useCopanionkit } from "$/OS/AI/core/copanionkit";
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
  MessageSquare,
  Infinity,
  Check,
  X,
  Square,
} from "lucide-react";
import { getMediaUrl } from "$/utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useService } from "$/Providers/ServiceProv";
import { v4 as uuidv4 } from "uuid";
import { CopanionActionMode } from "@OS/AI/shared";
import {
  AttachmentPreview,
  AttachmentPreviewModal,
  InputContainerProps,
  InternalAttachment,
  InputAttachment,
  AttachmentUnion,
} from "@OS/AI/components/Chat";
import { useAssistant } from "$/Providers/AssistantProv";
import RateLimit from "./RateLimit";
import { useLiveTranscription, VoiceController } from "$/components/Tool/VoiceToText";

export const InputContainer: React.FC<InputContainerProps> = ({
  onSendMessage,
  placeholder = "Type your message...",
  value: controlledValue,
  onChange: controlledOnChange,
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
  onStopGeneration,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Live transcription hook
  const {
    transcript,
    isListening,
    error: transcriptionError,
    audioData,
    startListening,
    stopListening,
    clearTranscript,
  } = useLiveTranscription();
  const [internalAttachments, setInternalAttachments] = useState<
    InternalAttachment[]
  >([]);
  const [previewAttachment, setPreviewAttachment] =
    useState<InputAttachment | null>(null);
  const [textPreviewContent, setTextPreviewContent] = useState<string | null>(
    null
  );
  const [pdfPreviewContent, setPdfPreviewContent] = useState<Blob | null>(null);
  const { uploadFileToCloud, deleteFileFromCloud } = useService();
  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : inputValue;
  const setValue = isControlled ? controlledOnChange : setInputValue;

  const {
    copanionActionMode: selectedActionType,
    setCopanionActionMode: setSelectedActionType,
  } = useCopanionkit();

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
        if (typeof attachments === "function") {
          const newAttachments = attachments(currentAttachments);
          const internal = newAttachments.filter(
            (a): a is InternalAttachment => "file" in a
          );
          setInternalAttachments(internal);
        } else {
          const internal = attachments.filter(
            (a): a is InternalAttachment => "file" in a
          );
          setInternalAttachments(internal);
        }
      }
    },
    [onAttachmentsChange, currentAttachments]
  );

  const isInputDisabled = useMemo(
    () => disabled || isLoading || isSending,
    [disabled, isLoading, isSending]
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

  // When component becomes disabled, remove current attachments
  useEffect(() => {
    if (isClosed && currentAttachments.length) {
      currentAttachments.forEach(({ url }) => {
        if (url) deleteFileFromCloud(url);
      });
      setCurrentAttachments([]);
    }
  }, [
    isClosed,
    currentAttachments,
    setCurrentAttachments,
    deleteFileFromCloud,
  ]);

  // Reset file input when sessionKey changes (new chat)
  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [sessionKey]);

  const handleSendMessage = async () => {
    if (!canSend || isInputDisabled) return;

    const baseMessage = currentValue.trim();
    if (!baseMessage && !allowEmptySend && currentAttachments.length === 0)
      return;

    // Append environment details with selected action type
    const messageToSend = `${baseMessage}<environment_details>\n<mode>${selectedActionType}</mode>\n<message_send_at>${new Date().toISOString()}</message_send_at>\n</environment_details>`;

    // Store the current values to restore on error
    const currentInputValue = currentValue;
    const attachmentsToSend = [...currentAttachments];

    // Clear input immediately for better UX
    if (!isControlled) {
      setInputValue("");
      setCurrentAttachments([]);
    }

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
        setCurrentAttachments(attachmentsToSend);
      }
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

  // Helper function to process a single file
  const processFile = async (file: File) => {
    const id = uuidv4();
    const { category, allowedType } = getFileCategory(file);

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
      const urlKey = await uploadFileToCloud(
        file,
        allowedType,
        "chatTempFiles/",
        maxFileSize
      );

      if (!urlKey) {
        throw new Error("Upload failed");
      }

      // Update attachment with successful upload
      setCurrentAttachments((prev: AttachmentUnion[]) =>
        prev.map((a) =>
          ("file" in a ? a.file === file : a.id === id)
            ? { ...a, url: urlKey as string, uploading: false }
            : a
        )
      );
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
      // Remove failed upload
      setCurrentAttachments((prev: AttachmentUnion[]) =>
        prev.filter((a) => ("file" in a ? a.file !== file : a.id !== id))
      );

      toast({
        title: "Upload failed",
        description: `Failed to upload ${file.name}`,
        variant: "destructive",
      });
    }
  };

  // Generic function to add files (from input, paste, or drag-drop)
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

  const handlePaste = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>
  ) => {
    const items = event.clipboardData.items;

    // Check for text/plain first using synchronous method to decide whether to prevent default
    const textData = event.clipboardData.getData("text/plain");
    const hasLongText = textData.length > 500;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") === 0) {
        event.preventDefault();
        if (currentAttachments.length === maxAttachments) {
          toast({
            title: "Max files reached",
            description: `You can only upload ${maxAttachments} files`,
            variant: "destructive",
          });
          return;
        }
        const file = item.getAsFile();
        if (file) {
          addFiles([file]);
        }
        break;
      }
      if (item.type.indexOf("text/plain") === 0) {
        // Only prevent default if text is long (will create file)
        // For short text, let browser handle it naturally to maintain undo stack
        if (hasLongText) {
          event.preventDefault();
          // Create a file for long text
          const textFile = new File([textData], `pasted-text-${Date.now()}.txt`, {
            type: "text/plain",
          });
          addFiles([textFile]);
        }
        // If text is short (≤500 chars), don't prevent default - let browser handle it
        // This maintains the native undo/redo stack
        break;
      }
      if (item.type.indexOf("application/pdf") === 0) {
        event.preventDefault(); // Prevent default paste behavior
        const file = item.getAsFile();
        if (file) {
          addFiles([file]);
        }
        break;
      }
    }
  };

  const handleAttachmentRemove = (index: number) => {
    const attachment = currentAttachments[index];
    if (attachment.url) {
      deleteFileFromCloud(attachment.url);
    }
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

  // Get action type details
  const getActionTypeDetails = (type: "chat" | "agent") => {
    switch (type) {
      case "chat":
        return { icon: <MessageSquare className="w-4 h-4" />, label: "Chat" };
      case "agent":
        return { icon: <Infinity className="w-4 h-4" />, label: "Agent" };
    }
  };

  const currentActionDetails = getActionTypeDetails(selectedActionType);

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
    if (!isVoiceMode && isListening) {
      stopListening();
      clearTranscript();
    }
  }, [isVoiceMode, isListening, stopListening, clearTranscript]);

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
    const messageToSend = `${baseMessage}<environment_details>\n<mode>${selectedActionType}</mode>\n<message_send_at>${new Date().toISOString()}</message_send_at>\n</environment_details>`;

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
    selectedActionType,
    onSendMessage,
    clearTranscript,
    isControlled,
    setInputValue,
    toast,
  ]);

  const renderActionButton = useCallback(() => {
    const baseClassName = cn("h-8 w-8 p-0 transition-all duration-200", buttonClassName);

    // Stop generation button
    if (isLoading && onStopGeneration) {
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
    if (currentValue.trim().length === 0 && currentAttachments.length === 0) {
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
          {showActions && (
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-fit py-1.5 px-2 gap-1.5 text-xs font-medium hover:bg-primary/10 transition-colors"
                >
                  {currentActionDetails.icon}
                  <span>{currentActionDetails.label}</span>
                  <ChevronUp
                    className={cn(
                      "w-3 h-3 opacity-60 transition-transform duration-200",
                      isPopoverOpen && "rotate-180"
                    )}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-44 p-1 bg-card/95 backdrop-blur-sm border-primary/20"
                align="start"
                side="top"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full justify-between h-fit py-1 px-2 text-xs font-medium hover:bg-primary/10 transition-colors gap-2",
                      selectedActionType === "chat" &&
                      "bg-primary/10 text-primary"
                    )}
                    onClick={() => {
                      setSelectedActionType(CopanionActionMode.CHAT);
                      setIsPopoverOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3 h-3" />
                      Chat
                    </div>
                    {selectedActionType === "chat" && (
                      <Check className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full justify-between h-fit py-1 px-2 text-xs font-medium hover:bg-primary/10 transition-colors gap-2",
                      selectedActionType === "agent" &&
                      "bg-primary/10 text-primary"
                    )}
                    onClick={() => {
                      setSelectedActionType(CopanionActionMode.AGENT);
                      setIsPopoverOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Infinity className="w-3 h-3" />
                      Agent
                    </div>
                    {selectedActionType === "agent" && (
                      <Check className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {showEmojiPicker && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Smile className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-row items-end gap-1">
          <div className="flex items-end gap-1 relative">
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
    currentActionDetails,
    selectedActionType,
    setSelectedActionType,
    showEmojiPicker,
    showAttachments,
    isInputDisabled,
    renderActionButton,
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
              "flex-1 flex flex-col h-fit w-full rounded-md border border-solid border-primary/10 bg-background/60 backdrop-blur-sm px-3 py-2 text-sm font-medium ring-offset-ring-input-ring-focus placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[1px] focus-visible:ring-primary/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] overflow-clip gap-2",
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
                  className="flex flex-wrap gap-2"
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
                isUploading
                    ? "Uploading files... Please wait..."
                    : isInputDisabled
                      ? "Please wait for AI to finish responding..."
                      : placeholder
              }
              className="w-full resize-none border-none shadow-none bg-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 rounded-none disabled:cursor-not-allowed customScrollbar2"
            />

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
