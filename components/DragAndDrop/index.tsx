import { useToast } from "@/components/ui/use-toast";
import { cn } from "@nextui-org/theme";
import { Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { AllowedFileTypes, useService } from "../../Providers/ServiceProv";

interface DragAndDropProps {
  fileTypes: AllowedFileTypes;
  children: React.ReactNode;
  uploadToCloud?: {
    storeLocation: string;
    maxFiles?: number;
    maxSizeInBytes?: number;
    response?: (file: File, urlString: string) => void;
  };
  handleFile?: (file: FileList) => void;
}

/**
 * A drag and drop component that handles file uploads
 * @param {Object} props - Component props
 * @param {'image' | 'pdf' | 'txt'} props.fileTypes - Allowed file types for upload
 * @param {string} props.storeLocation - Storage location path for uploaded files
 * @param {React.ReactNode} props.children - Child components to render inside drag area
 * @returns {JSX.Element} Drag and drop component
 */

export const DragAndDrop = (props: DragAndDropProps) => {
  const { children, uploadToCloud } = props;

  const [dragging, setDragging] = useState(false);
  let { uploadFileToCloud } = useService();
  const { toast } = useToast();

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
    },
    []
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  const handleUploadFile = async (files: FileList) => {
    try {
      toast({
        title: "Uploading files",
        description: "Please wait while we upload your files",
      });

      if (!uploadToCloud) {
        return;
      }

      const { maxFiles, maxSizeInBytes, response } = uploadToCloud;

      if (maxFiles && maxFiles > 1) {
        //check if max files is reached
        if (files.length >= maxFiles) {
          toast({
            title: "Error",
            description: `Maximum ${maxFiles} files allowed`,
            variant: "destructive",
          });
          return;
        }
      }

      const uploadPromises = Array.from(files).map((file) =>
        uploadFileToCloud(
          file,
          props.fileTypes,
          uploadToCloud.storeLocation,
          maxSizeInBytes,
          maxFiles
        )
      );

      const res = await Promise.all(uploadPromises);

      if (response) {
        res.forEach((key, index) => {
          if (key) {
            response(files[index], key);
          }
        });
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: "Something went wrong with the upload",
        variant: "destructive",
      });
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);

    if (props.uploadToCloud) {
      handleUploadFile(event.dataTransfer.files);
    } else {
      props.handleFile && props.handleFile(event.dataTransfer.files);
    }
  }, []);

  return (
    <div className={cn("relative")}>
      <div onDragEnter={handleDragEnter}>
        <div className={cn(dragging && "blur-sm")}>{children}</div>
        <div
          className={cn(
            "flex flex-col items-center justify-center absolute top-0 left-0 w-full h-full border-[3px] border-solid border-[hsl(224, 43%, 62%)] bg-[hsla(224, 22%, 90%, 0.3)] transition-all duration-300 ease-in-out opacity-0 user-select-none pointer-events-none border-primary/10",
            dragging &&
              "opacity-100 user-select-auto pointer-events-auto bg-background/50"
          )}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div className="flex flex-col items-center justify-center user-select-none pointer-events-none">
            <span className="animate-bounce text-foreground">
              <Upload className="icon" height={60} width={60} />
            </span>
            <p className="text-sm text-foreground font-medium">
              Drop file to upload
            </p>
            <span className="text-xs text-muted-foreground">
              Supports: TXT, PDF, DOCS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
