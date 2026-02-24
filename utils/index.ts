import Jwt from "jsonwebtoken";
import { getCookie } from "cookies-next";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";
import { FieldConfig, GroupFieldConfig, SchemaConfig } from "@/types/form";

const base_url = process.env.NEXT_PUBLIC_URL || "http://localhost:1000";
const CLOUD_FRONT_URL = process.env.NEXT_PUBLIC_CLOUD_FRONT_URL || "";

export const getMediaUrl = (path?: string) => {
  if (path === "hypercho logo") {
    return "/Logopic.png";
  }
  if (path === "hypercho banner") {
    return "/hypercho_banner.avif";
  }
  if (path && path.startsWith("https://")) {
    return path;
  }
  if (path && typeof path === "string") {
    return `${CLOUD_FRONT_URL}${path}`;
  }
  return "/";
};

export const absoluteURL = (path: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || base_url;

  // Ensure the URL has a scheme
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    throw new Error(
      `NEXT_PUBLIC_URL must include a scheme (http:// or https://). Current value: ${baseUrl}`
    );
  }

  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Remove trailing slash from baseUrl and add normalized path
  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
};

export const removeS3Url = (url: string) => {
  return url.replace(CLOUD_FRONT_URL, "");
};

export const nFormatter = (num: number, digits: number) => {
  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "Bn" },
    { value: 1e12, symbol: "T" },
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var item = lookup
    .slice()
    .reverse()
    .find(function (item) {
      return num >= item.value;
    });
  return item
    ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol
    : "0";
};

export const reArrangeArr = (Arr: any[]) => {
  // to rearrange the scenes array
  const ArrClone = Arr.slice();
  const reArranged = ArrClone.sort((x, y) => {
    //@ts-ignore
    return new Date(x.createdAt) - new Date(y.createdAt);
  });
  return reArranged;
};

export const numberLimit = (arithmetic: number): number => {
  if (arithmetic < 0) return 0;

  return arithmetic;
};

export const timeDifference = (old_d: Date | string, new_d: Date | string) => {
  //get the difference in the 2 values and return it in days
  const O = new Date(old_d),
    N = new Date(new_d);
  const diff: number = (N.valueOf() - O.valueOf()) / (24 * 60 * 60 * 1000);
  return Math.abs(diff);
};

export const verifyUserString = (signedStr: string) => {
  return Jwt.verify(signedStr, process.env.NEXT_PUBLIC_AUTHSECRET!);
};

export const getUserId = async (): Promise<string> => {
  //try geting cookie with cookie next
  const cookie1 = getCookie("hypercho_user_token");
  if (cookie1) {
    //@ts-ignore
    return verifyUserString(cookie1) as string;
  } else {
    const cookieCall = await fetch(`${base_url}/api/auth/getUser`);
    const cookie2 = await cookieCall.text();
    if (cookie2) {
      //@ts-ignore
      return verifyUserString(cookie2) as string;
    }
    return "";
  }
};

// Utility function to format numbers with commas
export const formatNumberWithCommas = (number: number): string => {
  return new Intl.NumberFormat("en-US").format(number);
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Function to create a dynamic schema
function createFormSchema(schemaConfig: SchemaConfig) {
  const schemaObject: { [key: string]: z.ZodTypeAny } = {};

  for (const [key, config] of Object.entries(schemaConfig)) {
    if (config.variable === "number") {
      let fieldSchema = z.number();
      if (config.minLength) {
        fieldSchema = fieldSchema.min(config.minLength, {
          message: config.minMessage,
        });
      }
      schemaObject[key] = fieldSchema;
      continue;
    }

    if (config.type === "checkbox") {
      schemaObject[key] = z.boolean();
      continue;
    }

    if (config.type === "multiSelect") {
      let arraySchema = z.array(z.string());

      if (config.minItems !== undefined) {
        arraySchema = arraySchema.min(config.minItems, {
          message:
            config.minMessage || `Select at least ${config.minItems} item(s)`,
        });
      }

      if (config.maxItems !== undefined) {
        arraySchema = arraySchema.max(config.maxItems, {
          message:
            config.maxMessage || `Select at most ${config.maxItems} item(s)`,
        });
      }

      schemaObject[key] = arraySchema;
      continue;
    }

    if (config.type === "select") {
      let fieldSchema = z.string();
      schemaObject[key] = fieldSchema;
      continue;
    }

    if (
      config.type === "input" ||
      config.type === "textarea" ||
      config.type === "password" ||
      config.type === "date" ||
      config.type === "OTP" ||
      config.type === "image" ||
      config.type === "logo" ||
      config.type === "phone"
    ) {
      let fieldSchema = z.string();

      if (config.minLength) {
        fieldSchema = fieldSchema.min(config.minLength, {
          message: config.minMessage,
        });
      }

      if (config.maxLength) {
        fieldSchema = fieldSchema.max(config.maxLength, {
          message: config.maxMessage,
        });
      }

      if (config.email) {
        fieldSchema = fieldSchema.email({
          message: config.emailMessage,
        });
      }

      if (config.regex) {
        fieldSchema = fieldSchema.regex(config.regex, {
          message: config.regexMessage || "Invalid format",
        });
      }

      schemaObject[key] = fieldSchema;
    }

    if (config.type === "group") {
      if (config.groupFields && typeof config.groupFields === "object") {
        // Recursively create schema for nested fields
        const nestedSchema = createFormSchema(config.groupFields);
        schemaObject[key] = z.object(nestedSchema);
      } else {
        // Fallback to an empty object schema if fields are not properly defined
        schemaObject[key] = z.object({});
      }
      continue;
    }
  }
  return schemaObject;
}

// Function to create a dynamic schema
export function createZobject(schemaConfig: SchemaConfig) {
  const schemaObject = createFormSchema(schemaConfig);
  return z.object(schemaObject);
}

// Add this type guard function
function isGroupFieldConfig(config: FieldConfig): config is GroupFieldConfig {
  return config.type === "group" && "groupFields" in config;
}

// Function to extract a specified property from schemaConfig
export function extractDefaultValue(config: SchemaConfig) {
  //extract the default value of the form
  const extractedProperties: { [key: string]: any } = {};
  for (const key in config) {
    const fieldConfig = config[key];

    switch (fieldConfig.type) {
      case "checkbox":
        extractedProperties[key] = fieldConfig.defaultValue || false;
        break;
      case "multiSelect":
        extractedProperties[key] = fieldConfig.defaultValue || [];
        break;
      case "group":
        if (isGroupFieldConfig(fieldConfig)) {
          extractedProperties[key] = extractDefaultValue(
            fieldConfig.groupFields
          );
        }
        break;
      default:
        extractedProperties[key] = config[key].defaultValue || "";
    }
  }
  return extractedProperties;
}

// Function to extract a specified property from schemaConfig
export function extractProperty(
  config: SchemaConfig,
  property: keyof FieldConfig
) {
  const extractedProperties: { [key: string]: any } = {};
  for (const key in config) {
    if (config[key][property] !== undefined) {
      extractedProperties[key] = config[key][property];
    }
  }
  return extractedProperties;
}

export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

// Utility function to convert URL to base64 content
export const urlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error converting URL to base64:", error);
    throw error;
  }
};
