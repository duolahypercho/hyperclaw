import {
  convertType,
  FieldConfig,
  GroupFieldConfig,
  ImageFieldConfig,
  SchemaConfig,
} from "@/types/form";

const isUploadableImage = (value: any): boolean => {
  return (
    value instanceof File ||
    (typeof value === "string" && value.startsWith("data:image"))
  );
};

export function setValueAtPath(obj: any, path: string, value: any) {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    // Ensure the nested object exists
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  // Set the value at the final key
  current[keys[keys.length - 1]] = value;
}

// Helper function to check if a value is a File or base64 image string
export function dataURLtoFile(dataurl: string, filename: string) {
  // Split the data URL into the header and the data parts
  const arr = dataurl.split(",");
  // Extract the MIME type from the header
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "";
  // Decode the Base64 string
  const bstr = atob(arr[1]);
  // Create a Uint8Array to hold the binary data
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  // Convert the decoded Base64 string into binary data
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  // Create a File object with the binary data
  return new File([u8arr], filename, { type: mime });
}

// Recursive function to find all uploadable images
export const findUploadableImages = (
  data: any,
  schemaConfig: SchemaConfig,
  prefix: string = ""
): { [key: string]: any } => {
  return Object.entries(data).reduce((acc, [key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const fieldConfig = schemaConfig[key];

    if (fieldConfig?.type === "group" && typeof value === "object") {
      // Recursively check group fields
      const nestedImages = findUploadableImages(
        value,
        fieldConfig.groupFields,
        fullKey
      );
      return { ...acc, ...nestedImages };
    } else if (fieldConfig?.type === "image" || fieldConfig?.type === "logo") {
      // Check if the field is an image type and contains uploadable data
      if (isUploadableImage(value)) {
        acc[fullKey] = value;
      }
    }

    return acc;
  }, {} as { [key: string]: any });
};

export const findconvertImageType = (
  key: string,
  schemaConfig: SchemaConfig
): convertType | undefined => {
  const keys = key.split(".");
  let currentSchemaConfig = schemaConfig;
  let fieldConfig: FieldConfig | undefined = undefined;

  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    fieldConfig = currentSchemaConfig[currentKey];

    if (!fieldConfig) {
      // The key does not exist in the schemaConfig
      return undefined;
    }

    if (fieldConfig.type === "group") {
      // If it's a group, we need to go deeper into the groupFields
      currentSchemaConfig = (fieldConfig as GroupFieldConfig).groupFields;
    } else if (i < keys.length - 1) {
      // If we're not at the last key and it's not a group, the path is invalid
      return undefined;
    } else {
      // We've reached the target field
      break;
    }
  }

  // Now, fieldConfig should be the FieldConfig for the key
  if (
    fieldConfig &&
    (fieldConfig.type === "image" || fieldConfig.type === "logo")
  ) {
    return (fieldConfig as ImageFieldConfig).convertType;
  }

  return undefined;
};

export function updateSchemaConfigWithDefaults<T extends Record<string, any>>(
  schemaConfig: SchemaConfig,
  product: T
): SchemaConfig {
  const updateField = (field: any, productValue: any) => {
    if (field.type === "group" && field.groupFields) {
      field.groupFields = Object.entries(field.groupFields).reduce(
        (acc, [key, subField]: [string, any]) => {
          acc[key] = updateField(subField, productValue?.[key]);
          return acc;
        },
        {} as any
      );
    } else if (field.key) {
      const value = field.key
        .split(".")
        .reduce((obj: any, key: string) => obj?.[key], product);
      field.defaultValue =
        value !== undefined ? value : field.defaultValue || "";
    }
    return field;
  };

  return Object.entries(schemaConfig).reduce(
    (acc, [key, field]: [string, any]) => {
      acc[key] = updateField(field, product);
      return acc;
    },
    {} as SchemaConfig
  );
}

export function removeDefaultValues(data: any, schemaConfig: SchemaConfig) {
  function recurse(dataObj: any, schemaObj: SchemaConfig) {
    for (const key in schemaObj) {
      const fieldConfig = schemaObj[key];
      const value = dataObj[key];

      if (fieldConfig.type === "group") {
        // If it's a group, recurse into its groupFields
        if (value && typeof value === "object") {
          recurse(value, (fieldConfig as GroupFieldConfig).groupFields);
          // After recursion, if the group is empty, delete it
          if (Object.keys(value).length === 0) {
            delete dataObj[key];
          }
        }
      } else {
        const defaultValue = fieldConfig.defaultValue;

        // Compare the current value with the defaultValue
        if (value === defaultValue) {
          // Delete the field if the values are equal
          delete dataObj[key];
        }
        //check the value is an array
        if (Array.isArray(value)) {
          if (
            !Array.isArray(defaultValue) ||
            value.length !== defaultValue.length
          ) {
            // Keep the array if defaultValue is not an array or lengths differ
            continue;
          }

          let isDifferent = false;
          for (let i = 0; i < value.length; i++) {
            if (value[i] !== defaultValue[i]) {
              isDifferent = true;
              break;
            }
          }

          if (!isDifferent) {
            // Delete the field if the array is identical to the default value
            delete dataObj[key];
          }
        }
      }
    }
  }

  recurse(data, schemaConfig);
}
