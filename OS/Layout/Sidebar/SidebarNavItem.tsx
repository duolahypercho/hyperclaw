import { Button } from "@/components/ui/button";
import { ChevronRight, MoreHorizontal, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { SidebarItem, SidebarContextMenuItem } from "./SidebarSchema";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useDialog } from "@OS/Layout/Dialog/DialogContext";
import { useInteractApp } from "@OS/Provider/InteractAppProv";

/** Renders the icon slot: avatarUrl > emoji > icon component.
 *  Falls back to emoji/icon if the avatar image fails to load. */
const ItemIcon: React.FC<{ item: SidebarItem; isActive?: boolean; className?: string }> = ({
  item,
  isActive,
  className,
}) => {
  const [imgError, setImgError] = useState(false);

  // Reset error state when the URL changes
  const prevUrl = useRef(item.avatarUrl);
  if (prevUrl.current !== item.avatarUrl) {
    prevUrl.current = item.avatarUrl;
    if (imgError) setImgError(false);
  }

  if (item.avatarUrl && !imgError) {
    return (
      <img
        src={item.avatarUrl}
        alt=""
        onError={() => setImgError(true)}
        className={cn("w-4 h-4 flex-shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  if (item.emoji) {
    return <span className={cn("text-sm flex-shrink-0 leading-none", className)}>{item.emoji}</span>;
  }
  if (item.icon) {
    return (
      <item.icon
        className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground", className)}
      />
    );
  }
  return null;
};

const isActiveItem = (item: SidebarItem, currentActiveTab: string) => {
  if (typeof currentActiveTab === "string") {
    if (currentActiveTab === item.id) return true;
    return false;
  }
  return false;
};

/** Wrapper that makes an item draggable and/or a drop target; only rendered when dndEnabled so hooks run inside DndContext. */
const SidebarNavItemDnD: React.FC<{
  item: SidebarItem;
  children: React.ReactNode;
}> = ({ item, children }) => {
  const drag = useDraggable({
    id: item.id,
    disabled: !item.isDraggable,
  });
  const drop = useDroppable({
    id: item.id,
    disabled: !item.isDropTarget,
  });
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      drag.setNodeRef(node);
      drop.setNodeRef(node);
    },
    [drag.setNodeRef, drop.setNodeRef]
  );
  const isOver = drop.isOver;
  return (
    <div
      ref={setNodeRef}
      {...(item.isDraggable ? drag.attributes : {})}
      className={cn(
        "flex items-center w-full gap-1 min-w-0",
        isOver && item.isDropTarget && "ring-1 ring-primary/50 rounded-md bg-primary/10"
      )}
    >
      {item.isDraggable && (
        <span
          {...(item.isDraggable ? drag.listeners : {})}
          className="cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5 rounded hover:bg-primary/10 text-muted-foreground"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  );
};

const SidebarNavItem: React.FC<{
  item: SidebarItem;
  className?: string;
  dndEnabled?: boolean;
}> = ({ item, className, dndEnabled = false }) => {
  const [open, setOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const contextTriggerRef = useRef<HTMLLIElement>(null);
  const { openDialog } = useDialog();
  const { currentActiveTab, setCurrentActiveTab } = useInteractApp();

  const hasChildren = !!item.items && item.items.length > 0;
  const useDnD = dndEnabled && (item.isDraggable || item.isDropTarget);
  const variant = item.variant || "ghost";
  const isActive = isActiveItem(item, currentActiveTab) || item.isActive;

  // Function to trigger context menu programmatically
  const triggerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Use the button element's position instead of the entire list item
    const buttonElement = e.currentTarget as HTMLElement;
    const rect = buttonElement.getBoundingClientRect();

    if (contextTriggerRef.current) {
      const contextMenuEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      contextTriggerRef.current.dispatchEvent(contextMenuEvent);
    }
  };

  const renderContextMenu = (items?: SidebarContextMenuItem[]) => {
    if (!items) return null;
    return items.map((item, idx) => {
      switch (item.type) {
        case "item":
          return (
            <ContextMenuItem
              key={idx}
              inset
              onSelect={(event) => {
                setContextMenuOpen(false);
                // 1) let radix do its normal close+focus-restoration…
                //    so don't call event.preventDefault()
                // 2) then, in the next tick, open the dialog
                window.setTimeout(() => {
                  if (item.dialog) {
                    // turn off the context menu
                    openDialog(item.dialog.id, item.dialog.data);
                  }
                  item.onClick?.();
                }, 0);
              }}
              className={cn(
                "flex items-center gap-2 text-xs",
                item.variant === "destructive" &&
                  "text-destructive hover:text-destructive hover:bg-destructive/20 focus:text-destructive focus:bg-destructive/20 data-[highlighted]:text-destructive data-[highlighted]:bg-destructive/20 active:bg-destructive/10"
              )}
            >
              {item.icon && (
                <item.icon className="w-4 h-4 flex-shrink-0 mr-2" />
              )}
              {item.label}
              {item.shortcut && (
                <ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
          );
        case "separator":
          return <ContextMenuSeparator key={idx} />;
        case "checkbox":
          return (
            <ContextMenuCheckboxItem
              key={idx}
              checked={item.checked}
              onCheckedChange={item.onClick}
            >
              {item.label}
              {item.shortcut && (
                <ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>
              )}
            </ContextMenuCheckboxItem>
          );
        case "radioGroup":
          return (
            <ContextMenuRadioGroup
              key={idx}
              value={item.value}
              onValueChange={item.onChange}
            >
              <ContextMenuLabel inset>{item.label}</ContextMenuLabel>
              <ContextMenuSeparator />
              {item.options.map((opt, i) => (
                <ContextMenuRadioItem key={i} value={opt.value}>
                  {opt.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          );
        case "submenu":
          return (
            <ContextMenuSub key={idx}>
              <ContextMenuSubTrigger inset>{item.label}</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {renderContextMenu(item.items)}
              </ContextMenuSubContent>
            </ContextMenuSub>
          );
        default:
          return null;
      }
    });
  };

  const content = hasChildren ? (
    <li
      ref={contextTriggerRef}
      className={cn(
        "flex flex-col items-center w-full overflow-x-hidden gap-1",
        className
      )}
    >
      {useDnD ? (
        <SidebarNavItemDnD item={item}>
          <div className="flex items-center w-full">
            <Button
          type="button"
          variant={variant}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            setOpen((v) => !v);
            if (!item.isStaticTab) {
              setCurrentActiveTab(item.id);
            }
            item.onClick?.();
          }}
          className={cn(
            "w-full text-left flex justify-start items-center gap-2 py-2 px-2.5 rounded-md hover:bg-primary/10 h-fit transition-all duration-200 overflow-x-hidden font-medium text-xs border-l-2 border-transparent",
            isActive && "bg-primary/10 text-primary border-primary",
            item.disabled && "text-muted-foreground/50 cursor-not-allowed"
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200 text-muted-foreground",
              open ? "rotate-90" : "rotate-0"
            )}
          />
          <ItemIcon item={item} isActive={isActive} />
          <span className="truncate line-clamp-1">{item.title}</span>
          {item.contextMenu && (
            <div
              onClick={triggerContextMenu}
              className="ml-auto h-fit w-fit py-0 px-1 hover:text-foreground/80 flex-shrink-0 transition-all duration-200 cursor-pointer rounded-sm hover:bg-primary/10"
            >
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </Button>
          </div>
        </SidebarNavItemDnD>
      ) : (
        <div className="flex items-center w-full">
          <Button
            type="button"
            variant={variant}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              setOpen((v) => !v);
              if (!item.isStaticTab) {
                setCurrentActiveTab(item.id);
              }
              item.onClick?.();
            }}
            className={cn(
              "w-full text-left flex justify-start items-center gap-2 py-2 px-2.5 rounded-md hover:bg-primary/10 h-fit transition-all duration-200 overflow-x-hidden font-medium text-xs border-l-2 border-transparent",
              isActive && "bg-primary/10 text-primary border-primary",
              item.disabled && "text-muted-foreground/50 cursor-not-allowed"
            )}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform duration-200 text-muted-foreground",
                open ? "rotate-0" : "rotate-90"
              )}
            />
            <ItemIcon item={item} isActive={isActive} />
            <span className="truncate line-clamp-1">{item.title}</span>
            {item.contextMenu && (
              <div
                onClick={triggerContextMenu}
                className="ml-auto h-fit w-fit py-0 px-1 hover:text-foreground/80 flex-shrink-0 transition-all duration-200 cursor-pointer rounded-sm hover:bg-primary/10"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </Button>
        </div>
      )}
      {open && (
        <div className="relative w-full pl-4">
          <div className="absolute left-[13px] top-0 bottom-0 w-[1px] bg-primary/10" />
          <ul className="flex flex-col gap-1 w-full">
            {(item.items ?? []).map((sub, k) => (
              <SidebarNavItem key={sub.id ?? k} item={sub} className="pl-[10px]" dndEnabled={dndEnabled} />
            ))}
          </ul>
        </div>
      )}
    </li>
  ) : (
    <li
      ref={contextTriggerRef}
      className={cn(
        "flex items-center w-full overflow-x-hidden gap-1",
        className
      )}
    >
      {useDnD ? (
        <SidebarNavItemDnD item={item}>
          <Button
            type="button"
            variant={variant}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              if (item.isStaticTab) {
                item.onClick?.();
                return;
              }
              setCurrentActiveTab(item.id);
              item.onClick?.();
            }}
            className={cn(
              "w-full text-left flex justify-start gap-2.5 py-2 px-2.5 rounded-md transition-all duration-200 overflow-x-hidden font-medium text-xs h-fit border-l-2 border-transparent",
              item.subtitle ? "items-start" : "items-center",
              "hover:bg-primary/10 hover:text-foreground",
              isActive && "bg-primary/10 text-primary border-primary shadow-sm",
              item.disabled && "text-muted-foreground/50 cursor-not-allowed hover:bg-transparent"
            )}
          >
            <ItemIcon item={item} isActive={isActive} className={item.subtitle ? "mt-0.5" : undefined} />
            <span className={cn("flex-1 min-w-0 flex flex-col items-start gap-0.5", item.contextMenu && "pr-1")}>
              <span className="truncate w-full text-left">{item.title}</span>
              {item.subtitle && (
                <span className="text-[10px] font-normal text-muted-foreground truncate w-full text-left">
                  {item.subtitle}
                </span>
              )}
            </span>
            {item.contextMenu && (
              <div
                onClick={triggerContextMenu}
                className="ml-auto h-fit w-fit py-0 px-1 hover:text-foreground/80 flex-shrink-0 transition-all duration-200 cursor-pointer rounded-sm hover:bg-primary/10"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </div>
            )}
          </Button>
        </SidebarNavItemDnD>
      ) : (
        <Button
          type="button"
          variant={variant}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            if (item.isStaticTab) {
              item.onClick?.();
              return;
            }
            setCurrentActiveTab(item.id);
            item.onClick?.();
          }}
          className={cn(
            "w-full text-left flex justify-start gap-2.5 py-2 px-2.5 rounded-md transition-all duration-200 overflow-x-hidden font-medium text-xs h-fit border-l-2 border-transparent",
            item.subtitle ? "items-start" : "items-center",
            "hover:bg-primary/10 hover:text-foreground",
            isActive && "bg-primary/10 text-primary border-primary shadow-sm",
            item.disabled && "text-muted-foreground/50 cursor-not-allowed hover:bg-transparent"
          )}
        >
          <ItemIcon item={item} isActive={isActive} className={item.subtitle ? "mt-0.5" : undefined} />
          <span className={cn("flex-1 min-w-0 flex flex-col items-start gap-0.5", item.contextMenu && "pr-1")}>
            <span className="truncate w-full text-left">{item.title}</span>
            {item.subtitle && (
              <span className="text-[10px] font-normal text-muted-foreground truncate w-full text-left">
                {item.subtitle}
              </span>
            )}
          </span>
          {item.contextMenu && (
            <div
              onClick={triggerContextMenu}
              className="ml-auto h-fit w-fit py-0 px-1 hover:text-foreground/80 flex-shrink-0 transition-all duration-200 cursor-pointer rounded-sm hover:bg-primary/10"
            >
              <MoreHorizontal className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </div>
          )}
        </Button>
      )}
    </li>
  );

  if (!item.contextMenu) return content;

  return (
    <ContextMenu onOpenChange={setContextMenuOpen}>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {renderContextMenu(item.contextMenu)}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default SidebarNavItem;
