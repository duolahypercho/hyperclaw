import { createContext, ReactNode, useContext } from "react";
import { useS3Upload } from "next-s3-upload";
import { v4 as uuidv4 } from "uuid";
import { dataURLtoFile } from "@/utils/product";
import { convertType } from "@/types/form";
import { useToast } from "@/components/ui/use-toast";

export type AllowedFileTypes = "image" | "pdf" | "txt" | "docx" | "audio";

export interface exportedValue {
  /** Uploads a file to cloud storage with validation for file type and size.
   *
   * @param file - The file to upload (can be a File object or base64 string)
   * @param allowedTypes - Allowed file types ('image', 'pdf', 'txt', 'docx', 'audio')
   * @param storeLoc - Storage location identifier
   * @param maxSizeInBytes - Maximum allowed file size in bytes (defaults to 10MB)
   * @returns The file key if successful, false if upload fails
   * @throws {Error} If file size exceeds limit or file type is not allowed
   */
  uploadFileToCloud: (
    file: File | string,
    allowedTypes: AllowedFileTypes,
    storeLoc: string,
    maxSizeInBytes?: number,
    maxFiles?: number
  ) => Promise<string | false>;

  /** Converts an image from one format to another using the Sharp API.
   *
   * @param image - The base64 string of the image to convert
   * @param convertType - The desired output format for the image
   * @returns The converted image as a base64 string if successful, false if conversion fails
   * @throws {Error} If the conversion process fails
   */
  convertImage: (
    image: string,
    convertType: convertType
  ) => Promise<string | false>;

  /** Deletes a file from cloud storage.
   *
   * @param fileKey - The unique identifier/key of the file to delete from storage
   * @returns A promise that resolves to true if deletion was successful, false otherwise
   * @throws {Error} If deletion process fails or file cannot be found
   */

  deleteFileFromCloud: (fileKey: string) => Promise<boolean>;
}
const initialState: exportedValue = {
  uploadFileToCloud: async () => false,
  convertImage: async () => false,
  deleteFileFromCloud: async () => false,
};

export const ServiceContext = createContext<exportedValue>(initialState);

export const ServiceProvider = ({ children }: { children: ReactNode }) => {
  let { uploadToS3, files: s3Files } = useS3Upload();
  const { toast } = useToast();

  const uploadFileToS3 = async (
    file: File,
    storeLoc: string,
    fileId: string
  ): Promise<string | false> => {
    try {
      const { url, key } = await uploadToS3(file, {
        endpoint: {
          // @ts-ignore
          request: {
            body: {
              Id: fileId,
              userId: storeLoc,
            },
          },
        },
      });
      return key;
    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during file upload.",
        variant: "destructive",
      });
      return false;
    }
  };

  const getAllowedFileTypes = (
    fileTypes: "image" | "pdf" | "txt" | "docx" | "audio"
  ): string[] => {
    if (fileTypes === "image") {
      return [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/avif",
        "image/gif",
        "image/svg+xml",
        "image/tiff",
        "image/bmp",
        "image/ico",
        "image/heic",
        "image/heif",
      ];
    }
    if (fileTypes === "pdf") {
      return ["application/pdf"];
    }
    if (fileTypes === "txt") {
      return ["text/plain"];
    }
    if (fileTypes === "docx") {
      return [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
    }
    if (fileTypes === "audio") {
      return ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"];
    }
    return [];
  };

  const uploadFileToCloud = async (
    file: File | string,
    fileTypes: AllowedFileTypes,
    storeLoc: string,
    maxSizeInBytes?: number, // Maximum allowed file size in bytes
    maxFiles?: number // Maximum allowed files
  ): Promise<string | false> => {
    const fileId = uuidv4();
    if (typeof file === "string") {
      file = dataURLtoFile(file, fileId);
    }

    if (file) {
      const { type: fileType, size: fileSize } = file;
      maxSizeInBytes = maxSizeInBytes || 10485760;
      // Validate file sizex
      if (fileSize > maxSizeInBytes) {
        toast({
          title: "Error",
          description:
            "File size cannot exceed " + maxSizeInBytes / 1048576 + " MB",
          variant: "destructive",
        });
        return false;
      }

      // Validate file type
      if (!getAllowedFileTypes(fileTypes).includes(fileType)) {
        toast({
          title: "Error",
          description: "File type is not allowed.",
          variant: "destructive",
        });
        return false;
      }

      try {
        // Upload the file to the server-side API
        const response = await uploadFileToS3(file, storeLoc, fileId);

        return response;
      } catch (error) {
        console.error("Upload failed:", error);
        alert("An unexpected error occurred during file upload.");
        return false;
      }
    }

    return false;
  };

  const deleteFileFromCloud = async (fileKey: string) => {
    try {
      const response = await fetch(`/api/s3-delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          objectKey: `${fileKey}`,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return true;
      } else {
        const errorData = await response.json();
        console.error(errorData.message);
        return false;
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during file deletion.",
        variant: "destructive",
      });
      return false;
    }
  };

  const convertImage = async (image: string, convertType: convertType) => {
    try {
      const convertAPI = await fetch("/api/sharp/convertFileType", {
        method: "POST",
        body: JSON.stringify({ options: { type: convertType }, image }),
      });
      const convertAPIResponse = await convertAPI.json();
      return convertAPIResponse.convertedImage;
    } catch (error) {
      console.error("Convert failed:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during file upload.",
        variant: "destructive",
      });
      return false;
    }
  };

  const value: exportedValue = {
    uploadFileToCloud,
    deleteFileFromCloud,
    convertImage,
  };

  return (
    <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>
  );
};

//export useService
export function useService() {
  return useContext(ServiceContext);
}
