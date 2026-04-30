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

/**
 * Compose multiple header UIs into a single slot. Useful when a tool needs
 * (for example) a view-mode tab switcher *and* a primary action button on
 * the right side of the site header at the same time.
 *
 * The renderer walks `items` left-to-right and lays them out with a small
 * gap, so the visual order matches the array order.
 */
export interface HeaderGroupConfig {
  type: "group";
  items: UIConfig[];
  className?: string;
}

/**
 * Inline JSX escape hatch. Lets a tool mount its own widget (e.g. a
 * `DropdownMenu`, popover, or one-off control) directly into the site
 * header without growing the schema for every new shape.
 */
export interface HeaderCustomConfig {
  type: "custom";
  render: () => React.ReactNode;
  className?: string;
}

export type UIConfig =
  | HeaderTabsConfig
  | HeaderButtonsConfig
  | HeaderBreadcrumbsConfig
  | HeaderSearchConfig
  | HeaderGroupConfig
  | HeaderCustomConfig;

export interface AppHeader {
  title?: string;
  icon?: IconType | LucideIcon;
  className?: string;
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
