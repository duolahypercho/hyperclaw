import { SidebarContextMenuItem } from "@OS/Layout/Sidebar/SidebarSchema";

export function menuItem(
  opts: Omit<Extract<SidebarContextMenuItem, { type: "item" }>, "type">
): Extract<SidebarContextMenuItem, { type: "item" }> {
  return { type: "item", ...opts };
}

export function menuSeparator(): Extract<
  SidebarContextMenuItem,
  { type: "separator" }
> {
  return { type: "separator" };
}

export function menuCheckbox(
  opts: Omit<Extract<SidebarContextMenuItem, { type: "checkbox" }>, "type">
): Extract<SidebarContextMenuItem, { type: "checkbox" }> {
  return { type: "checkbox", ...opts };
}

export function menuRadioGroup(
  opts: Omit<Extract<SidebarContextMenuItem, { type: "radioGroup" }>, "type">
): Extract<SidebarContextMenuItem, { type: "radioGroup" }> {
  return { type: "radioGroup", ...opts };
}

export function menuSubmenu(
  opts: Omit<Extract<SidebarContextMenuItem, { type: "submenu" }>, "type">
): Extract<SidebarContextMenuItem, { type: "submenu" }> {
  return { type: "submenu", ...opts };
}
