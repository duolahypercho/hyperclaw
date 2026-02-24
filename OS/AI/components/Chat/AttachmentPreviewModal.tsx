"use client";

import React from "react";
import Image from "next/image";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "$/utils";
import { X } from "lucide-react";
import { InputAttachment, MessageAttachment } from "./types";
import { getFileType } from "./utils";

interface AttachmentPreviewModalProps {
  attachment: InputAttachment | MessageAttachment | null;
  textContent?: string | null;
  pdfContent?: Blob | null;
  onClose: () => void;
}

interface ImagePreviewProps {
  attachment: InputAttachment | MessageAttachment;
}

/**
 * Image preview component for attachment preview modal
 */
export const ImagePreview: React.FC<ImagePreviewProps> = ({ attachment }) => {
  const imageSrc =
    "preview" in attachment
      ? attachment.preview
      : attachment.url
      ? getMediaUrl(attachment.url)
      : "";

  if (!imageSrc) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        Image not available
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] max-w-[90vw] flex items-center justify-center">
      <Image
        src={imageSrc}
        alt={attachment.name || imageSrc}
        width={1000}
        height={1000}
        className="max-h-[70vh] max-w-[90vw] object-contain rounded-lg shadow-lg"
        style={{ width: "auto", height: "auto" }}
        onClick={(e: React.MouseEvent<HTMLImageElement>) => e.stopPropagation()}
        unoptimized
      />
    </div>
  );
};

interface TextPreviewProps {
  attachment: InputAttachment | MessageAttachment;
  content: string;
}
/**
 * Text preview component for attachment preview modal
 */
export const TextPreview: React.FC<TextPreviewProps> = ({
  attachment,
  content,
}) => {
  return (
    <div
      className="h-full w-full"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Prevent Ctrl+A from selecting content outside the modal
        if (e.ctrlKey && e.key === "a") {
          e.preventDefault();
          e.stopPropagation();
          // Select all text within the pre element
          const preElement = e.currentTarget.querySelector("pre");
          if (preElement) {
            const range = document.createRange();
            range.selectNodeContents(preElement);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }}
      tabIndex={-1}
    >
      <pre
        className="whitespace-pre-wrap text-xs text-foreground font-mono m-0 h-full w-full select-text"
        onKeyDown={(e) => {
          // Handle Ctrl+A specifically for the pre element
          if (e.ctrlKey && e.key === "a") {
            e.preventDefault();
            e.stopPropagation();
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }}
        tabIndex={0}
      >
        {content}
      </pre>
    </div>
  );
};

interface PDFPreviewProps {
  attachment: InputAttachment | MessageAttachment;
  pdfBlob: Blob;
}

/**
 * PDF preview component for attachment preview modal
 */
export const PDFPreview: React.FC<PDFPreviewProps> = ({
  attachment,
  pdfBlob,
}) => {
  const pdfUrl = React.useMemo(() => {
    return URL.createObjectURL(pdfBlob);
  }, [pdfBlob]);

  React.useEffect(() => {
    // Cleanup object URL when component unmounts
    return () => {
      URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  return (
    <div className="w-full h-full flex-1 min-h-0">
      <iframe
        src={pdfUrl}
        title={attachment.name || pdfUrl}
        className="w-full h-full border-0"
        style={{ minHeight: "600px" }}
      />
    </div>
  );
};

/**
 * Loading state component for attachment preview modal
 */
export const PreviewLoading: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-32 text-muted-foreground">
      Loading content...
    </div>
  );
};

/**
 * Main attachment preview modal component
 * Handles display of images, text files, and PDFs
 */
export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  attachment,
  textContent,
  pdfContent,
  onClose,
}) => {
  if (!attachment || typeof window === "undefined") {
    return null;
  }

  const fileType = getFileType(
    (attachment as any).type || (attachment as any).format || ""
  );

  const isImage = fileType === "image";
  const isText = textContent !== null && textContent !== undefined;
  const isPDF = pdfContent !== null && pdfContent !== undefined;

  const modalContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center"
        onClick={onClose}
      >
        <div
          className={`bg-background rounded-lg shadow-lg border border-border overflow-hidden flex flex-col ${
            isPDF ? "h-[95vh] w-[95vw]" : "max-h-[90vh] max-w-[90vw] px-3 pb-3"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {attachment.name}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <div
            className={`bg-muted rounded border overflow-auto customScrollbar2 flex-1 min-h-0 ${
              isPDF ? "p-0 m-0" : "p-3"
            }`}
          >
            {isImage ? (
              <ImagePreview attachment={attachment} />
            ) : isText ? (
              <TextPreview attachment={attachment} content={textContent} />
            ) : isPDF ? (
              <PDFPreview attachment={attachment} pdfBlob={pdfContent} />
            ) : (
              <PreviewLoading />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
