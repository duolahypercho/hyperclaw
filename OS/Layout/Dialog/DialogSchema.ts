import { LucideIcon } from "lucide-react";
import { IconType } from "react-icons/lib";
import { buttonVariants } from "@/components/ui/button";
import { VariantProps } from "class-variance-authority";
import { SchemaConfig } from "@/types/form";
import { HyperchoFormProps } from "../Form";

export type DialogData = {
  formData?: any;
  dialogData?: any;
};

export type DialogActionType = {
  id: string;
  label: string;
  variant?: VariantProps<typeof buttonVariants>;
  size?: VariantProps<typeof buttonVariants>;
  icon?: IconType | LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  onClick?: (data?: DialogData) => void | Promise<void>;
};

export type DialogContent =
  | {
      type: "text";
      content: string;
      className?: string;
    }
  | {
      type: "input";
      content: string;
      placeholder?: string;
      onChange?: (value: string) => void;
      className?: string;
    };

export type DialogSchema =
  | {
      id: string;
      title: string;
      content?: string;
      description?: string;
      type?: "confirmation";
      actions?: {
        confirm?: DialogActionType;
        close?: DialogActionType;
      };
      onClose?: () => void;
      className?: string;
    }
  | {
      id: string;
      title: string;
      content?: string;
      description?: string;
      type: "alert";
      actions?: {
        confirm?: DialogActionType;
        close?: DialogActionType;
      };
      onClose?: () => void;
      className?: string;
    }
  | {
      id: string;
      title: string;
      formProps: HyperchoFormProps;
      description?: string;
      type: "form";
      actions?: {
        primary?: DialogActionType;
        close?: DialogActionType;
        secondary?: DialogActionType;
      };
      onClose?: () => void;
      className?: string;
    };
