// layouts/ToolLayout/types.ts
import { LucideIcon } from "lucide-react";
import { IconType } from "react-icons/lib";
import { DragEndEvent } from "@dnd-kit/core";

export interface DialogType {
  id: string;
  data?: Record<string, any>;
}

export type SidebarContextMenuItem =
  | {
      type: "item";
      label: string;
      icon?: IconType | LucideIcon;
      shortcut?: string;
      disabled?: boolean;
      dialog?: DialogType;
      onClick?: () => void;
      variant?: "default" | "destructive";
    }
  | {
      type: "separator";
    }
  | {
      type: "checkbox";
      label: string;
      checked: boolean;
      onClick?: (checked: boolean) => void;
      shortcut?: string;
    }
  | {
      type: "radioGroup";
      label: string;
      value: string;
      options: { value: string; label: string }[];
      onChange?: (value: string) => void;
    }
  | {
      type: "submenu";
      label: string;
      items: SidebarContextMenuItem[];
    };

export interface SidebarItem {
  id: string;
  title: string;
  /** Optional line below the title (e.g. file size, meta) */
  subtitle?: string;
  icon?: IconType | LucideIcon;
  /** Optional emoji shown instead of icon */
  emoji?: string;
  /** Optional avatar image URL shown instead of icon */
  avatarUrl?: string;
  isActive?: boolean;
  items?: SidebarItem[];
  onClick?: () => void;
  isDraggable?: boolean;
  /** When true, this item (e.g. folder) can receive drops; use with sidebar.onDrop */
  isDropTarget?: boolean;
  isStaticTab?: boolean;
  disabled?: boolean;
  contextMenu?: SidebarContextMenuItem[];
  variant?: "default" | "destructive";
}

export interface SidebarUserItem {
  id: string;
  title?: string;
  logo?: string;
  description?: string;
  onClick?: () => void;
}

export type SidebarSection =
  | {
      id: string;
      title?: string;
      items: SidebarItem[];
      type: "rowOrder" | "rowOrder+collapsible";
      /**
       * Only for type 'rowOrder' or 'rowOrder+collapsible':
       * Called when the order of items changes. Receives the new order of items.
       */
      reorder?: (event: DragEndEvent) => void;
    }
  | {
      id: string;
      title?: string;
      items: SidebarItem[];
      type?: "default" | "collapsible";
    }
  | {
      id: string;
      placeholder?: string;
      activeItem?: SidebarUserItem;
      items?: SidebarUserItem[] | SidebarItem[];
      type: "dropdownUser";
    }
  | {
      id: string;
      type: "custom";
      /** Custom React content (e.g. a Select dropdown) rendered in the sidebar */
      content: React.ReactNode;
    };

export interface HeaderButton {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "background"
    | "primary"
    | "accent"
    | "active"
    | "loading"
    | "icon"
    | "success"
    | "input"
    | "selectItem";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "iconSm";
  disabled?: boolean;
  dialog?: DialogType;
  /** Optional keyboard shortcut displayed inside the button (e.g. "⌘K") */
  kbd?: string;
}

export interface HeaderTab {
  id: string;
  label: string;
  icon?: IconType | LucideIcon;
  isActive?: boolean;
  onClick?: () => void;
}

export interface HeaderSearch {
  placeholder?: string;
  onSearch?: (value: string) => void;
  defaultValue?: string;
}

// Legacy header interface for backward compatibility
export interface SidebarHeader {
  title?: string;
  icon?: IconType | LucideIcon;
  leftButtons?: HeaderButton[];
  centerTabs?: HeaderTab[];
  search?: HeaderSearch;
  rightButtons?: HeaderButton[];
}

export interface SidebarSchema {
  header?: SidebarHeader;
  sections: SidebarSection[];
  footer?: SidebarSection[];
  /** When set, sidebar supports drag-and-drop: draggable items can be dropped on drop-target items. */
  onDrop?: (draggedId: string, targetId: string) => void;
}

export const isSidebarUserItem = (
  item: SidebarItem | SidebarUserItem
): item is SidebarUserItem => {
  return "logo" in item;
};
