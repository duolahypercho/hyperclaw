import React, { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "$/utils";
import { getMediaUrl } from "$/utils";
import { useS3Upload } from "next-s3-upload";
import { v4 as uuidv4 } from "uuid";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/use-toast";
import Image from "next/image";

const userScopedPrefix = (storeLocation: string, userId: string): string =>
  `${storeLocation.replace(/\/+$/g, "")}/${userId}/`;

interface HyperchoImageInputProps {
  value?: string;
  onChange: (value: string | File) => void;
  placeholder?: string;
  className?: string;
  accept?: string;
  maxSizeInMB?: number;
  storeLocation?: string;
  convertType?:
    | "jpeg"
    | "png"
    | "webp"
    | "avif"
    | "gif"
    | "svg"
    | "jp2"
    | "tiff"
    | "jxl"
    | "heif";
  quality?: number;
  width?: number;
  height?: number;
  uploadOnChange?: boolean;
}

const HyperchoImageInput: React.FC<HyperchoImageInputProps> = ({
  value,
  onChange,
  placeholder = "Upload an image",
  className,
  accept = "image/*",
  maxSizeInMB = 10,
  storeLocation = "user/hypercho/images/",
  convertType,
  quality = 80,
  width,
  height,
  uploadOnChange = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadToS3 } = useS3Upload();
  const { data: sessionData } = useSession();
  const { toast } = useToast();

  // Handle existing image display
  useEffect(() => {
    if (value) {
      // If value is a data URL (new upload), use it directly
      if (value.startsWith("data:")) {
        setPreviewUrl(value);
      } else if (typeof value === "string" && !value.startsWith("data:")) {
        // If value is an S3 key, get the full URL
        setPreviewUrl(getMediaUrl(value));
      }
    } else {
      setPreviewUrl(null);
    }
  }, [value]);

  const deleteFromS3 = useCallback(async (s3Key: string) => {
    try {
      const response = await fetch(`/api/s3-delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          objectKey: s3Key,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete image");
      }

      return true;
    } catch (error) {
      console.error("S3 deletion error:", error);
      throw error;
    }
  }, []);

  const uploadToS3AndGetKey = useCallback(
    async (file: File): Promise<string> => {
      if (!sessionData?.user?.userId) {
        throw new Error("User not authenticated");
      }

      const fileId = uuidv4();
      const uploadConfig: any = {
        endpoint: {
          request: {
            body: {
              Id: fileId,
              userId: userScopedPrefix(storeLocation, sessionData.user.userId),
            },
          },
        },
      };

      // Add conversion settings if specified
      if (convertType || quality || width || height) {
        uploadConfig.endpoint.request.body.convertSetting = {
          type: convertType,
          quality,
          width,
          height,
          format: "file",
        };
      }

      const { url, key } = await uploadToS3(file, uploadConfig);
      return key;
    },
    [
      sessionData,
      storeLocation,
      convertType,
      quality,
      width,
      height,
      uploadToS3,
    ]
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }

      // Validate file size
      const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
      if (file.size > maxSizeInBytes) {
        toast({
          title: "File too large",
          description: `File size must be less than ${maxSizeInMB}MB`,
          variant: "destructive",
        });
        return;
      }

      // Create preview immediately
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      if (uploadOnChange) {
        // Upload immediately to S3
        setIsUploading(true);
        try {
          const key = await uploadToS3AndGetKey(file);
          onChange(key);

          toast({
            title: "Success",
            description: "Image uploaded successfully",
          });
        } catch (error) {
          console.error("Upload error:", error);
          toast({
            title: "Upload failed",
            description: "Failed to upload image. Please try again.",
            variant: "destructive",
          });
          setPreviewUrl(null);
        } finally {
          setIsUploading(false);
        }
      } else {
        // Store file locally for later upload
        setLocalFile(file);
        onChange(file); // Pass the File object to the form
      }
    },
    [maxSizeInMB, uploadOnChange, uploadToS3AndGetKey, onChange, toast]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      // Reset input value to allow selecting the same file again
      event.target.value = "";
    },
    [handleFileSelect]
  );

  const handleRemoveImage = useCallback(async () => {
    if (!value) {
      setPreviewUrl(null);
      setLocalFile(null);
      onChange("");
      return;
    }

    // If it's a local file, just clear it
    if (
      localFile ||
      (value && typeof value === "object" && "name" in value && "size" in value)
    ) {
      setPreviewUrl(null);
      setLocalFile(null);
      onChange("");
      return;
    }

    // Only delete from S3 if the value is an S3 key (not a data URL)
    if (typeof value === "string" && !value.startsWith("data:")) {
      setIsDeleting(true);
      try {
        await deleteFromS3(value);
        toast({
          title: "Success",
          description: "Image removed successfully",
        });
      } catch (error) {
        console.error("Delete error:", error);
        toast({
          title: "Delete failed",
          description: "Failed to remove image from storage. Please try again.",
          variant: "destructive",
        });
        // Don't clear the form value if deletion failed
        return;
      } finally {
        setIsDeleting(false);
      }
    }

    setPreviewUrl(null);
    setLocalFile(null);
    onChange("");
  }, [value, localFile, onChange, deleteFromS3, toast]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  return (
    <div className={cn("w-full", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
        disabled={isUploading}
      />

      {previewUrl ? (
        <div className="relative group">
          <div className="relative w-full h-48 rounded-lg overflow-hidden border-2 border-dashed border-border bg-background/10">
            <Image
              src={previewUrl}
              alt="Preview"
              className="w-full h-full object-cover"
              width={400}
              height={192}
              unoptimized
            />
            {(isUploading || isDeleting) && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="text-sm text-muted-foreground">
                    {isUploading ? "Uploading..." : "Removing..."}
                  </span>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRemoveImage}
                disabled={isUploading || isDeleting}
                className="flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                {isDeleting ? "Removing..." : "Remove"}
              </Button>
            </div>
          </div>
          {!uploadOnChange && localFile && (
            <div className="mt-2 text-xs text-muted-foreground">
              📁 Image will be uploaded when form is submitted
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "w-full h-48 border-2 border-dashed border-border rounded-lg bg-background/10 hover:bg-background/20 transition-colors cursor-pointer flex flex-col items-center justify-center gap-4",
            (isUploading || isDeleting) && "opacity-50 cursor-not-allowed",
            isDragOver && "border-primary bg-primary/10"
          )}
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isUploading || isDeleting ? (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">
                {isUploading ? "Uploading..." : "Removing..."}
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                <ImageIcon
                  className={cn(
                    "w-8 h-8 text-muted-foreground",
                    isDragOver && "text-primary"
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium text-foreground",
                    isDragOver && "text-primary"
                  )}
                >
                  {isDragOver ? "Drop image here" : placeholder}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isDragOver
                    ? "Release to upload"
                    : "Click to upload or drag and drop"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Max size: {maxSizeInMB}MB
                </span>
                {!uploadOnChange && (
                  <span className="text-xs text-muted-foreground">
                    📁 Uploads on form submission
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HyperchoImageInput;
