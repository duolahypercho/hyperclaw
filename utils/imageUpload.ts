import { useS3Upload } from "next-s3-upload";
import { v4 as uuidv4 } from "uuid";
import { useSession } from "next-auth/react";
import { convertType, FieldConfig } from "@/types/form";

interface UploadImageOptions {
  file: File;
  storeLocation?: string;
  convertType?: convertType;
  quality?: number;
  width?: number;
  height?: number;
}

const userScopedPrefix = (storeLocation: string, userId: string): string =>
  `${storeLocation.replace(/\/+$/g, "")}/${userId}/`;

/**
 * Hook to get the upload function with proper context
 */
export const useImageUpload = () => {
  const { uploadToS3 } = useS3Upload();
  const { data: sessionData } = useSession();

  const uploadImage = async (options: UploadImageOptions): Promise<string> => {
    const {
      file,
      storeLocation = "user/images/",
      convertType,
      quality = 80,
      width,
      height,
    } = options;

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

    try {
      const { url, key } = await uploadToS3(file, uploadConfig);
      return key;
    } catch (error) {
      console.error("Upload error:", error);
      throw new Error("Failed to upload image");
    }
  };

  return { uploadImage };
};

/**
 * Process form data to upload any File objects and replace them with S3 keys
 */
export const processFormImages = async (
  formData: any,
  schemaConfig: Record<string, FieldConfig>,
  uploadImage: (options: UploadImageOptions) => Promise<string>
): Promise<any> => {
  const processedData = { ...formData };

  for (const [key, config] of Object.entries(schemaConfig)) {
    if (
      (config.type === "image" || config.type === "logo") &&
      processedData[key]
    ) {
      const value = processedData[key];

      // If the value is a File object, upload it
      if (value instanceof File) {
        try {
          const s3Key = await uploadImage({
            file: value,
            storeLocation: config.storeLocation,
            convertType: config.convertType,
            quality: config.quality,
            width: config.width,
            height: config.height,
          });
          processedData[key] = s3Key;
        } catch (error) {
          console.error(
            `Failed to upload ${config.type} for field ${key}:`,
            error
          );
          throw new Error(
            `Failed to upload ${config.type} for ${config.display || key}`
          );
        }
      }
      // If it's already a string (S3 key), leave it as is
    }
  }

  return processedData;
};
