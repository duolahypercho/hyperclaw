import { useEffect, useState } from "react";
import { MessageAttachment, getFileType } from "@OS/AI/components/Chat";
import { getMediaUrl } from "$/utils";
import {
  File,
  Image,
  Headphones,
  FileText,
  Download,
  Eye,
  Music,
  X,
  FileImage,
  FileAudio,
  FileCode,
  FileArchive,
  FileType,
  FileText as FileWord,
  FileSpreadsheet as FileExcel,
  Presentation as FilePowerpoint,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { AttachmentPreviewModal } from "../AttachmentPreviewModal";

interface AttachmentProps {
  attachment: MessageAttachment;
  onClick?: (url: string, alt: string) => void;
}

// Helper function to get file icon based on type and extension
const getFileIcon = (url: string, format?: string) => {
  const fileName = format || url.split("/").pop() || "";
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  const iconProps = { className: "w-4 h-4 text-primary-foreground" };

  // Document types
  if (["pdf"].includes(extension)) return <FileType {...iconProps} />;
  if (["doc", "docx"].includes(extension)) return <FileWord {...iconProps} />;
  if (["xls", "xlsx"].includes(extension)) return <FileExcel {...iconProps} />;
  if (["ppt", "pptx"].includes(extension))
    return <FilePowerpoint {...iconProps} />;

  // Media types
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(extension)) {
    return <FileImage {...iconProps} />;
  }

  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(extension)) {
    return <FileAudio {...iconProps} />;
  }

  // Code types
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "html",
      "css",
      "scss",
      "py",
      "java",
      "cpp",
      "c",
      "php",
      "rb",
      "go",
      "rs",
    ].includes(extension)
  ) {
    return <FileCode {...iconProps} />;
  }

  // Archive types
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) {
    return <FileArchive {...iconProps} />;
  }

  // Text types
  if (["txt", "md", "json", "xml", "csv", "log"].includes(extension)) {
    return <FileText {...iconProps} />;
  }

  return <File {...iconProps} />;
};

// Helper function to get file name from URL
const getFileName = (url: string, format?: string): string => {
  if (format) return format;

  // Extract filename from URL
  let fileName = url.split("/").pop() || "Unknown File";

  // Remove query parameters and fragments
  fileName = fileName.split("?")[0].split("#")[0];

  // Decode URL encoding
  try {
    fileName = decodeURIComponent(fileName);
  } catch (e) {
    // If decoding fails, use the original filename
  }

  // Clean up the filename - remove common prefixes and make it more readable
  fileName = fileName
    .replace(/^[0-9]+[-_]/, "") // Remove leading numbers with dash/underscore
    .replace(/[-_]/g, " ") // Replace dashes and underscores with spaces
    .replace(/\b\w/g, (l) => l.toUpperCase()); // Capitalize first letter of each word

  // Truncate if too long
  return fileName.length > 25 ? fileName.substring(0, 25) + "..." : fileName;
};

const ImageAttachment = ({ attachment, onClick }: AttachmentProps) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>("");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setPreviewImage(getMediaUrl(attachment.url));
    setImageLoaded(false);
    setImageError(false);
  }, [attachment.url]);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(false);
  };

  return (
    <>
      <div
        className="relative overflow-hidden rounded-xl border border-white/10 group cursor-pointer"
        onClick={() => {
          setShowPreview(true);
        }}
      >
        {!imageLoaded && !imageError && (
          <div className="flex items-center justify-center min-h-[200px] bg-muted/80 min-w-[200px]">
            <div className="flex flex-col items-center space-y-2">
              <p className="text-sm text-muted-foreground">Loading image...</p>
            </div>
          </div>
        )}

        {imageError && (
          <div className="flex items-center justify-center min-h-[200px] bg-muted/80 min-w-[200px]">
            <div className="flex flex-col items-center space-y-2">
              <FileImage className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Failed to load image
              </p>
            </div>
          </div>
        )}

        <img
          src={previewImage}
          alt={attachment.name || "Uploaded image"}
          className={`max-w-full max-h-80 w-auto h-auto object-contain cursor-pointer transition-all duration-200 group-hover:scale-[1.02] ${
            imageLoaded ? "opacity-100" : "opacity-0 absolute"
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Overlay with file info */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <Image className="w-4 h-4" />
              <span className="text-sm font-medium truncate">
                {getFileName(attachment.url, attachment.format)}
              </span>
            </div>
          </div>
        </div>
      </div>
      {showPreview && typeof window !== "undefined" && (
        <AttachmentPreviewModal
          attachment={attachment}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
};

const AudioAttachment = ({ attachment, onClick }: AttachmentProps) => {
  return (
    <div
      className="group relative border border-white/10 rounded-xl p-4 hover:border-primary/40 transition-all duration-200 cursor-pointer"
      onClick={() => {
        onClick?.(
          attachment.url,
          getFileName(attachment.url, attachment.format)
        );
      }}
    >
      <div className="flex items-center space-x-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
            <Music className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className="text-sm font-semibold text-white truncate">
              {getFileName(attachment.url, attachment.format)}
            </h4>
            <span className="text-xs text-white/70 bg-white/10 px-2 py-1 rounded-full">
              Audio
            </span>
          </div>
          <p className="text-xs text-white/60">Click to play or download</p>
        </div>
        <div className="flex items-center space-x-2">
          <Headphones className="w-4 h-4 text-white/60 group-hover:text-primary transition-colors" />
          <Download className="w-4 h-4 text-white/60 group-hover:text-primary transition-colors" />
        </div>
      </div>
    </div>
  );
};

const DocumentAttachment = ({ attachment, onClick }: AttachmentProps) => {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [pdfPreviewContent, setPdfPreviewContent] = useState<Blob | null>(null);

  const handlePdfFileClick = async (attachment: MessageAttachment) => {
    if (!attachment.url) {
      return;
    }
    try {
      // Set preview attachment first to show loading state
      setShowPreview(true);

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
      setShowPreview(false);
      setPdfPreviewContent(null);
    }
  };

  return (
    <>
      <div
        className="group relative cursor-pointer group"
        onClick={() => {
          handlePdfFileClick(attachment);
        }}
      >
        <div className="flex items-center space-x-1">
          <div className="flex-shrink-0">
            {getFileIcon(attachment.url, attachment.format)}
          </div>
          <p className="text-xs text-primary-foreground/60 group-hover:text-primary-foreground transition-colors duration-200">
            Click to view or download
          </p>
        </div>
      </div>
      {showPreview && typeof window !== "undefined" && (
        <AttachmentPreviewModal
          attachment={attachment}
          pdfContent={pdfPreviewContent}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
};

const FileAttachment = ({ attachment, onClick }: AttachmentProps) => {
  const [textPreview, setTextPreview] = useState<string>("");
  const [fullText, setFullText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetch(getMediaUrl(attachment.url))
      .then((response) => response.text())
      .then((text) => {
        // Show first 100 characters as preview
        const preview =
          text.length > 100 ? text.substring(0, 100) + "..." : text;
        setTextPreview(preview);
        setFullText(text);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load file content:", error);
        setTextPreview("Preview unavailable");
        setIsLoading(false);
      });
  }, [attachment.url]);

  return (
    <>
      <div
        className="group relative cursor-pointer group"
        onClick={() => {
          setShowPreview(true);
        }}
      >
        <div className="flex items-start border border-primary/10 rounded-xl hover:border-primary/40 transition-all duration-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-xs text-primary-foreground/70 bg-background/10 px-2 py-1 rounded-full">
                Text
              </span>
            </div>
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                <p className="text-xs text-primary-foreground/60">
                  Loading preview...
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-primary-foreground/80 leading-relaxed">
                  {textPreview}
                </p>
                <p className="text-xs text-primary-foreground/60 group-hover:text-primary-foreground transition-colors duration-200">
                  Click to view full content
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      {showPreview && typeof window !== "undefined" && (
        <AttachmentPreviewModal
          attachment={attachment}
          textContent={fullText}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
};

export const AttachmentMessage = ({ attachment, onClick }: AttachmentProps) => {
  const fileType = getFileType(attachment.format || "");

  switch (fileType) {
    case "image":
      return <ImageAttachment attachment={attachment} onClick={onClick} />;
    case "audio":
      return <AudioAttachment attachment={attachment} onClick={onClick} />;
    case "document":
      return <DocumentAttachment attachment={attachment} onClick={onClick} />;
    default:
      return <FileAttachment attachment={attachment} onClick={onClick} />;
  }
};
