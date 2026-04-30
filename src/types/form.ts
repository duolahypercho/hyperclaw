export interface SchemaConfig {
  [key: string]: FieldConfig;
}

export type FieldType =
  | "input"
  | "textarea"
  | "select"
  | "phone"
  | "date"
  | "password"
  | "OTP"
  | "image"
  | "logo"
  | "multiSelect"
  | "checkbox"
  | "group";

export type convertSetting = {
  type?: convertType;
  quality?: number;
  width?: number;
  height?: number;
  format?: "file" | "buffer";
};

export type convertType =
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

interface BaseFieldConfig {
  key: string;
  defaultValue?: string | boolean | string[] | number;
  display?: string;
  placeholder?: string;
  description?: string;
  variable?: "string" | "number" | "boolean";
  layout?: "row" | "column";
  email?: boolean;
  emailMessage?: string;
  minLength?: number;
  maxLength?: number;
  lengthHint?: boolean;
  minMessage?: string;
  maxMessage?: string;
  hintMessage?: string;
  regex?: RegExp;
  regexMessage?: string;
  required?: boolean;
  requiredMessage?: string;
  collapsible?: boolean;
  type: FieldType;
}

interface InputFieldConfig extends BaseFieldConfig {
  type: "input" | "textarea" | "password" | "date";
  defaultValue?: string;
}

interface SelectFieldConfig extends BaseFieldConfig {
  type: "select";
  selectedValue: { key: string; value: string }[];
  maxSelect?: number;
  defaultValue?: string;
}

interface PhoneFieldConfig extends BaseFieldConfig {
  type: "phone";
  defaultValue?: string;
}

interface OTPFieldConfig extends BaseFieldConfig {
  type: "OTP";
  defaultValue?: string;
  valueLength?: number;
}

export interface ImageFieldConfig extends BaseFieldConfig {
  type: "image";
  defaultValue?: string;
  convertType?: convertType;
  quality?: number;
  width?: number;
  height?: number;
  uploadOnChange?: boolean; // Deprecated: Use variant instead
  variant?: "immediate" | "staged";
  storeLocation?: string;
  className?: string;
}

export interface LogoFieldConfig extends BaseFieldConfig {
  type: "logo";
  size?: "sm" | "md" | "lg";
  maxSizeInMB?: number;
  convertType?: convertType;
  quality?: number;
  width?: number;
  height?: number;
  uploadOnChange?: boolean; // Deprecated: Use variant instead
  variant?: "immediate" | "staged";
  storeLocation?: string;
  className?: string;
}

interface CheckboxFieldConfig extends BaseFieldConfig {
  type: "checkbox";
  activeText?: string;
  inactiveText?: string;
  defaultValue?: boolean;
}

export interface GroupFieldConfig extends BaseFieldConfig {
  type: "group";
  groupFields: SchemaConfig;
}

export type FieldConfig =
  | InputFieldConfig
  | SelectFieldConfig
  | PhoneFieldConfig
  | OTPFieldConfig
  | ImageFieldConfig
  | LogoFieldConfig
  | CheckboxFieldConfig
  | GroupFieldConfig;
