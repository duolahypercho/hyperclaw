import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Upload,
  X,
  Image as ImageIcon,
  Building2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "$/utils";
import { getMediaUrl } from "$/utils";
import { useS3Upload } from "next-s3-upload";
import { v4 as uuidv4 } from "uuid";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/use-toast";
import Image from "next/image";
import AvatarEditor from "react-avatar-editor";

const userScopedPrefix = (storeLocation: string, userId: string): string =>
  `${storeLocation.replace(/\/+$/g, "")}/${userId}/`;

interface HyperchoLogoInputProps {
  value?: string;
  onChange: (value: string | File) => void;
  onPendingChangesChange?: (hasPendingChanges: boolean) => void; // Called when pending state changes
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
  uploadOnChange?: boolean; // Deprecated: Use variant instead
  variant?: "immediate" | "staged"; // immediate: uploads/deletes right away, staged: waits for form submit
  size?: "sm" | "md" | "lg";
  classNames?: {
    container?: string;
  };
}

export interface HyperchoLogoInputRef {
  upload: () => Promise<string | null>; // Uploads pending file and returns S3 key (auto-cleans old S3 files)
  hasPendingChanges: () => boolean; // Check if there are pending changes
  clear: () => void; // Clear the component
  resetPendingChanges: () => void; // Reset pending state after save (updates initialValue to current value)
}

const HyperchoLogoInput = forwardRef<
  HyperchoLogoInputRef,
  HyperchoLogoInputProps
>(
  (
    {
      value,
      onChange,
      onPendingChangesChange,
      placeholder = "Upload your logo",
      className,
      accept = "image/*",
      maxSizeInMB = 5,
      storeLocation = "user/hypercho/logos/",
      convertType,
      quality = 90,
      width,
      height,
      uploadOnChange, // Deprecated
      variant,
      size = "md",
      classNames,
    },
    ref
  ) => {
    // Determine the actual variant to use (backward compatibility)
    const actualVariant = variant ?? (uploadOnChange ? "immediate" : "staged");
    const isImmediate = actualVariant === "immediate";

    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [localFile, setLocalFile] = useState<File | null>(null);
    const [initialValue, setInitialValue] = useState<string>("");
    const hasInitialized = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadToS3 } = useS3Upload();
    const { data: sessionData } = useSession();
    const { toast } = useToast();

    // Image Editor State
    const [showEditor, setShowEditor] = useState(false);
    const [editorImage, setEditorImage] = useState<File | null>(null);
    const [editorScale, setEditorScale] = useState(1);
    const [editorRotation, setEditorRotation] = useState(0);
    const editorRef = useRef<AvatarEditor>(null);

    // Size configurations
    const sizeConfig = {
      sm: { container: "h-20 w-20", icon: "w-6 h-6", text: "text-xs" },
      md: { container: "h-24 w-24", icon: "w-8 h-8", text: "text-xs" },
      lg: { container: "h-32 w-32", icon: "w-10 h-10", text: "text-sm" },
    };

    const currentSize = sizeConfig[size];

    // Expose methods to parent component via ref
    useImperativeHandle(ref, () => ({
      upload: async () => {
        if (!localFile) {
          return null; // No file to upload
        }

        setIsUploading(true);
        try {
          // Upload new file to S3
          const key = await uploadToS3AndGetKey(localFile);

          // Clean up old S3 file if it exists and is different from new key
          if (
            initialValue &&
            initialValue !== key &&
            !initialValue.startsWith("data:")
          ) {
            // Delete old file from S3 (async, don't wait or fail on error)
            deleteFromS3(initialValue).catch((error) => {
              console.warn("Failed to delete old S3 file:", error);
              // Don't throw - S3 cleanup failure shouldn't block the upload
            });
          }

          // Update the value with the S3 key
          onChange(key);
          // Clear local file after successful upload
          setLocalFile(null);
          // Update initial value to reflect the new uploaded state
          setInitialValue(key);
          return key;
        } catch (error) {
          console.error("Upload error:", error);
          toast({
            title: "Upload failed",
            description: "Failed to upload image. Please try again.",
            variant: "destructive",
          });
          throw error;
        } finally {
          setIsUploading(false);
        }
      },
      hasPendingChanges: () => {
        // Has changes if:
        // 1. There's a new file to upload (localFile is not null)
        // 2. OR the current value differs from the initial value (e.g., removed)
        const currentValue = value || "";
        return localFile !== null || currentValue !== initialValue;
      },
      clear: () => {
        setPreviewUrl(null);
        setLocalFile(null);
        onChange("");
      },
      resetPendingChanges: () => {
        // If value is empty and initialValue had an S3 key, delete it from S3
        const currentValue = value || "";
        if (
          !currentValue &&
          initialValue &&
          !initialValue.startsWith("data:")
        ) {
          // Delete old file from S3 (async, don't wait or fail on error)
          deleteFromS3(initialValue).catch((error) => {
            console.warn("Failed to delete old S3 file on removal:", error);
            // Don't throw - S3 cleanup failure shouldn't block the operation
          });
        }

        // Update initial value to current value to mark changes as saved
        setInitialValue(currentValue);
        setLocalFile(null);
      },
    }));

    // Track initial value on mount
    useEffect(() => {
      // Set initial value only once on mount, or on every value change if in immediate mode
      if (!hasInitialized.current || isImmediate) {
        setInitialValue(value || "");
        hasInitialized.current = true;
      }
    }, [value, isImmediate]);

    // Notify parent when pending changes state changes
    useEffect(() => {
      if (onPendingChangesChange) {
        const currentValue = value || "";
        const hasChanges = localFile !== null || currentValue !== initialValue;
        onPendingChangesChange(hasChanges);
      }
    }, [localFile, value, initialValue, onPendingChangesChange]);

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
          throw new Error(errorData.message || "Failed to delete logo");
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

    // Convert editor canvas to File
    const handleEditorConfirm = useCallback(async () => {
      if (!editorRef.current || !editorImage) return;

      try {
        // Get the canvas with the edited image
        const canvas = editorRef.current.getImageScaledToCanvas();

        // Convert canvas to Blob
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              toast({
                title: "Error",
                description: "Failed to process image. Please try again.",
                variant: "destructive",
              });
              return;
            }

            // Convert Blob to File
            const croppedFile = new File([blob], editorImage.name, {
              type: "image/png",
              lastModified: Date.now(),
            });

            // Close editor
            setShowEditor(false);
            setEditorImage(null);
            setEditorScale(1);
            setEditorRotation(0);

            // Create preview from the cropped file
            const reader = new FileReader();
            reader.onload = (e) => {
              setPreviewUrl(e.target?.result as string);
            };
            reader.readAsDataURL(croppedFile);

            if (isImmediate) {
              // Upload immediately to S3
              setIsUploading(true);
              try {
                const key = await uploadToS3AndGetKey(croppedFile);
                onChange(key);
              } catch (error) {
                console.error("Upload error:", error);
                toast({
                  title: "Upload failed",
                  description: "Failed to upload logo. Please try again.",
                  variant: "destructive",
                });
                setPreviewUrl(null);
              } finally {
                setIsUploading(false);
              }
            } else {
              // Staged mode: Store file locally for later upload
              setLocalFile(croppedFile);
              onChange(croppedFile); // Pass the File object to the form
            }
          },
          "image/png",
          0.95
        );
      } catch (error) {
        console.error("Editor error:", error);
        toast({
          title: "Error",
          description: "Failed to process image. Please try again.",
          variant: "destructive",
        });
      }
    }, [editorImage, isImmediate, uploadToS3AndGetKey, onChange, toast]);

    const handleEditorCancel = useCallback(() => {
      setShowEditor(false);
      setEditorImage(null);
      setEditorScale(1);
      setEditorRotation(0);
    }, []);

    const handleFileSelect = useCallback(
      async (file: File) => {
        // Validate file type
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Invalid file type",
            description: "Please select an image file for your logo",
            variant: "destructive",
          });
          return;
        }

        // Validate file size
        const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
        if (file.size > maxSizeInBytes) {
          toast({
            title: "File too large",
            description: `Logo file size must be less than ${maxSizeInMB}MB`,
            variant: "destructive",
          });
          return;
        }

        // Open editor dialog instead of processing immediately
        setEditorImage(file);
        setEditorScale(1);
        setEditorRotation(0);
        setShowEditor(true);
      },
      [maxSizeInMB, toast]
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
        (value &&
          typeof value === "object" &&
          "name" in value &&
          "size" in value)
      ) {
        setPreviewUrl(null);
        setLocalFile(null);
        onChange("");
        return;
      }

      // In immediate mode, delete from S3 right away
      // In staged mode, just clear the value (deletion happens on form submit)
      if (
        isImmediate &&
        typeof value === "string" &&
        !value.startsWith("data:")
      ) {
        setIsDeleting(true);
        try {
          await deleteFromS3(value);
          toast({
            title: "Success",
            description: "Logo removed successfully",
          });
        } catch (error) {
          console.error("Delete error:", error);
          toast({
            title: "Delete failed",
            description:
              "Failed to remove logo from storage. Please try again.",
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
    }, [value, localFile, isImmediate, onChange, deleteFromS3, toast]);

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
      <div className={cn("flex flex-col items-center gap-3", className)}>
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
            <div
              className={cn(
                "relative rounded-full overflow-hidden border-2 border-dashed border-border bg-background/10 shadow-lg",
                currentSize.container,
                classNames?.container,
                isUploading || isDeleting
                  ? "cursor-not-allowed opacity-75"
                  : "cursor-pointer hover:border-primary/50 transition-colors"
              )}
              onClick={isUploading || isDeleting ? undefined : handleClick}
            >
              <Image
                src={previewUrl}
                alt="Logo preview"
                className="w-full h-full object-cover"
                width={128}
                height={128}
                unoptimized
              />
              {(isUploading || isDeleting) && (
                <div className="absolute inset-0 bg-background/90 flex items-center justify-center backdrop-blur-sm z-20">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                    <span className="text-xs font-medium text-foreground">
                      {isUploading ? "Uploading..." : "Removing..."}
                    </span>
                  </div>
                </div>
              )}
              {!isUploading && !isDeleting && (
                <div
                  className={cn(
                    "absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center",
                    classNames?.container
                  )}
                >
                  <Upload className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
            {/* Remove button positioned outside the overflow-hidden container */}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveImage();
              }}
              disabled={isUploading || isDeleting}
              className={cn(
                "absolute -top-1 -right-1 h-7 w-7 p-0 rounded-full transition-opacity shadow-lg z-10",
                isUploading || isDeleting
                  ? "opacity-0 pointer-events-none"
                  : "opacity-0 group-hover:opacity-100"
              )}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              "relative rounded-full border-2 border-dashed border-border bg-background/10 transition-all flex flex-col items-center justify-center shadow-sm",
              currentSize.container,
              classNames?.container,
              isUploading || isDeleting
                ? "opacity-50 cursor-not-allowed pointer-events-none"
                : "cursor-pointer hover:bg-background/20 hover:shadow-lg hover:border-primary/50",
              isDragOver &&
                !isUploading &&
                !isDeleting &&
                "border-primary bg-primary/10 scale-105"
            )}
            onClick={isUploading || isDeleting ? undefined : handleClick}
            onDragOver={isUploading || isDeleting ? undefined : handleDragOver}
            onDragLeave={
              isUploading || isDeleting ? undefined : handleDragLeave
            }
            onDrop={isUploading || isDeleting ? undefined : handleDrop}
          >
            {isUploading || isDeleting ? (
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                <span className="text-xs font-medium text-foreground">
                  {isUploading ? "Uploading..." : "Removing..."}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-center">
                {isDragOver ? (
                  <ImageIcon className={cn("text-primary", currentSize.icon)} />
                ) : (
                  <Building2
                    className={cn("text-muted-foreground", currentSize.icon)}
                  />
                )}
                <span
                  className={cn(
                    "font-medium text-foreground",
                    currentSize.text,
                    isDragOver && "text-primary"
                  )}
                >
                  {isDragOver ? "Drop logo" : "Logo"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Info text below the logo area */}
        <div className="text-center space-y-1">
          <p className={cn("text-muted-foreground", currentSize.text)}>
            {isUploading || isDeleting
              ? `Please wait while ${
                  isUploading ? "uploading" : "removing"
                } image...`
              : previewUrl
              ? isDragOver
                ? "Release to replace your logo"
                : "Click to replace or drag and drop"
              : isDragOver
              ? "Release to upload your logo"
              : "Click to upload or drag and drop"}
          </p>
        </div>

        {/* Image Editor Dialog */}
        <Dialog open={showEditor} onOpenChange={setShowEditor}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Crop Your Logo</DialogTitle>
              <DialogDescription>
                Adjust the position, zoom, and rotation to get the perfect crop
                for your logo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Editor Container */}
              <div className="flex items-center justify-center bg-muted/20 rounded-lg p-6 border border-border">
                {editorImage && (
                  <AvatarEditor
                    ref={editorRef}
                    image={editorImage}
                    width={250}
                    height={250}
                    border={50}
                    borderRadius={125}
                    color={[0, 0, 0, 0.6]}
                    scale={editorScale}
                    rotate={editorRotation}
                    className="rounded-lg"
                  />
                )}
              </div>

              {/* Zoom Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <ZoomIn className="w-4 h-4" />
                    Zoom
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(editorScale * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <ZoomOut className="w-4 h-4 text-muted-foreground" />
                  <Slider
                    value={[editorScale]}
                    onValueChange={([value]) => setEditorScale(value)}
                    min={0.5}
                    max={3}
                    step={0.01}
                    className="flex-1"
                  />
                  <ZoomIn className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* Rotation Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <RotateCw className="w-4 h-4" />
                    Rotation
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {editorRotation}°
                  </span>
                </div>
                <Slider
                  value={[editorRotation]}
                  onValueChange={([value]) => setEditorRotation(value)}
                  min={0}
                  max={360}
                  step={1}
                  className="flex-1"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleEditorCancel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleEditorConfirm}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Apply Crop
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

HyperchoLogoInput.displayName = "HyperchoLogoInput";

export default HyperchoLogoInput;
