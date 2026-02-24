// layouts/ToolLayout/types.ts
import { LucideIcon } from "lucide-react";
import { IconType } from "react-icons/lib";
import { RightContentLayoutType } from "./RightContentLayout";
import { DialogSchema } from "./Dialog/DialogSchema";
import { SidebarSchema, SidebarItem } from "./Sidebar/SidebarSchema";
import { HeaderButton, HeaderSearch } from "./Sidebar/SidebarSchema";

export type ActionType = "bodyScroll";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  icon?: IconType | LucideIcon;
}

// New flexible header UI types
export interface HeaderTabItem {
  id: string;
  label: string;
  icon?: IconType | LucideIcon;
  value: string;
  content?: React.ReactNode;
}

export interface HeaderTabsConfig {
  type: "tabs";
  tabs: HeaderTabItem[];
  activeValue: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export interface HeaderButtonsConfig {
  type: "buttons";
  buttons: HeaderButton[];
  className?: string;
}

export interface HeaderBreadcrumbsConfig {
  type: "breadcrumbs";
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}

export interface HeaderSearchConfig {
  type: "search";
  search: HeaderSearch;
  className?: string;
}

export type UIConfig =
  | HeaderTabsConfig
  | HeaderButtonsConfig
  | HeaderBreadcrumbsConfig
  | HeaderSearchConfig;

export interface AppHeader {
  title?: string;
  icon?: IconType | LucideIcon;
  leftUI?: UIConfig;
  centerUI?: UIConfig;
  rightUI?: UIConfig;
}

export interface AppSchema {
  header?: AppHeader;
  sidebar?: SidebarSchema;
  detail?: RightContentLayoutType;
  dialogs?: DialogSchema[];
  actions?: Record<ActionType, (...args: any[]) => any>;
  breadcrumbs?: BreadcrumbItem[];
}

export const defaultAppSchema: AppSchema = {};

export type { SidebarSchema, SidebarItem, HeaderButton };
