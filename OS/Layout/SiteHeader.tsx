import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "./SidebarTrigger";
import { Search } from "lucide-react";
import { useInteractApp } from "@OS/Provider/InteractAppProv";
import React from "react";
import {
  SidebarItem,
  SidebarSection,
  SidebarSchema,
  HeaderButton,
  HeaderTab,
  SidebarHeader,
} from "./Sidebar/SidebarSchema";
import { Tool, useOS } from "@OS/Provider/OSProv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HeaderButtonsConfig,
  HeaderTabsConfig,
  HeaderBreadcrumbsConfig,
  HeaderSearchConfig,
  UIConfig,
  AppHeader,
} from "./types";
import { useDialog } from "./Dialog/DialogContext";
import { useRouter } from "next/navigation";
import { GoHomeFill } from "react-icons/go";
import { Minus, Square, X, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";

function findBreadcrumbPath(
  sections: SidebarSection[] | undefined,
  activeTabId: string
): SidebarItem[] {
  if (!sections) return [];
  let path: SidebarItem[] = [];

  function dfs(item: SidebarItem, trail: SidebarItem[]): boolean {
    const newTrail = [...trail, item];
    if (item.id === activeTabId) {
      path = newTrail;
      return true;
    }
    if (item.items) {
      for (const child of item.items) {
        if (dfs(child, newTrail)) return true;
      }
    }
    return false;
  }

  for (const section of sections) {
    // Treat section as a SidebarItem for path purposes
    if (dfs(section as SidebarItem, [])) break;
  }
  return path;
}

function getBreadcrumbDisplay(breadcrumbs: SidebarItem[], activeTool: any) {
  if (breadcrumbs.length > 0) {
    return breadcrumbs.map((crumb, idx) => {
      const isLast = idx === breadcrumbs.length - 1;
      if (!crumb.title) return null;
      return (
        <div
          key={crumb.id}
          className="flex flex-row gap-1 items-center min-w-0"
        >
          <span
            className={cn(
              "text-sm font-medium flex items-center gap-1 min-w-0",
              isLast ? "text-muted-foreground" : "text-muted-foreground"
            )}
          >
            {crumb.icon &&
              (typeof crumb.icon === "function"
                ? React.createElement(crumb.icon, {
                    className: "w-4 h-4 flex-shrink-0",
                  })
                : React.isValidElement(crumb.icon)
                ? React.cloneElement(crumb.icon as any, {
                    className: "w-4 h-4 flex-shrink-0",
                  })
                : null)}
            <span className="truncate">{crumb.title}</span>
            {!isLast && "-"}
          </span>
        </div>
      );
    });
  }

  // Fallback to activeTool.name if no breadcrumbs
  if (activeTool?.name) {
    return (
      <div className="flex flex-row gap-1 items-center min-w-0">
        <span className="text-sm flex items-center gap-1 min-w-0 text-foreground">
          <span className="truncate">{activeTool.name}</span>
        </span>
      </div>
    );
  }

  return null;
}

const renderButton = (
  button: HeaderButton,
  openDialog: (id: string, data?: Record<string, any>) => void
) => {
  const renderIcon = () => {
    if (!button.icon) return null;

    // Handle React.ReactNode (JSX elements)
    if (React.isValidElement(button.icon)) {
      return React.cloneElement(button.icon as any, {
        className: "w-4 h-4 mr-2",
      });
    }

    // Handle function components (IconType and LucideIcon)
    if (typeof button.icon === "function") {
      const IconComponent = button.icon as React.ComponentType<{
        className?: string;
      }>;
      return <IconComponent className="w-4 h-4 mr-2" />;
    }

    return null;
  };

  const handleClick = () => {
    if (button.dialog) {
      // Open dialog with data if provided
      openDialog(button.dialog.id, button.dialog.data);
    }
    // Call the original onClick if it exists
    button.onClick?.();
  };

  return (
    <Button
      key={button.id}
      variant={button.variant || "ghost"}
      size="sm"
      onClick={handleClick}
      disabled={button.disabled}
      className={cn("h-8 text-xs", button.className)}
    >
      {renderIcon()}
      {button.label}
    </Button>
  );
};

const renderButtons = (
  config: HeaderButtonsConfig,
  openDialog: (id: string, data?: Record<string, any>) => void
) => (
  <div
    className={cn("flex items-center gap-1 flex-shrink-0", config.className)}
  >
    {config.buttons.map((button) => renderButton(button, openDialog))}
  </div>
);

const renderTabs = (config: HeaderTabsConfig) => (
  <Tabs
    value={config.activeValue}
    onValueChange={config.onValueChange}
    className={cn("flex-shrink-0", config.className)}
  >
    <TabsList className="h-8">
      {config.tabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.value}
          className="h-6 text-xs px-3"
        >
          {tab.icon &&
            (typeof tab.icon === "function"
              ? React.createElement(tab.icon, {
                  className: "w-4 h-4 mr-2",
                })
              : React.isValidElement(tab.icon)
              ? React.cloneElement(tab.icon as any, {
                  className: "w-4 h-4 mr-2",
                })
              : null)}
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

const renderBreadcrumbs = (
  config: HeaderBreadcrumbsConfig,
  allBreadcrumbs: SidebarItem[],
  activeTool: any
) => {
  // If custom breadcrumbs are provided, render them
  if (config.breadcrumbs && config.breadcrumbs.length > 0) {
    return (
      <nav
        aria-label="Breadcrumb"
        className={cn("flex items-center min-w-0", config.className)}
      >
        <div className="flex items-center gap-1 min-w-0">
          {config.breadcrumbs.map((crumb, idx) => {
            const isLast = idx === config.breadcrumbs!.length - 1;
            return (
              <div
                key={idx}
                className="flex flex-row gap-1 items-center min-w-0"
              >
                <span
                  className={cn(
                    "text-xs flex items-center gap-1 min-w-0 cursor-pointer hover:text-foreground transition-colors",
                    isLast ? "text-muted-foreground" : "text-muted-foreground"
                  )}
                  onClick={crumb.onClick}
                >
                  {crumb.icon &&
                    (typeof crumb.icon === "function"
                      ? React.createElement(crumb.icon, {
                          className: "w-4 h-4 flex-shrink-0",
                        })
                      : React.isValidElement(crumb.icon)
                      ? React.cloneElement(crumb.icon as any, {
                          className: "w-4 h-4 flex-shrink-0",
                        })
                      : null)}
                  <span className="truncate">{crumb.label}</span>
                  {!isLast && "-"}
                </span>
              </div>
            );
          })}
        </div>
      </nav>
    );
  }

  // Otherwise, use the default breadcrumbs from sidebar
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center min-w-0", config.className)}
    >
      <div className="flex items-center gap-1 min-w-0">
        {getBreadcrumbDisplay(allBreadcrumbs, activeTool)}
      </div>
    </nav>
  );
};

const renderSearch = (config: HeaderSearchConfig) => (
  <div className={cn("relative w-64 flex-shrink-0", config.className)}>
    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
    <Input
      placeholder={config.search.placeholder || "Search..."}
      defaultValue={config.search.defaultValue}
      onChange={(e) => config.search.onSearch?.(e.target.value)}
      className="pl-8 h-8"
    />
  </div>
);

const renderUI = (
  config: UIConfig,
  allBreadcrumbs: SidebarItem[],
  activeTool: Tool | null,
  openDialog: (id: string, data?: Record<string, any>) => void
) => {
  switch (config.type) {
    case "tabs":
      return renderTabs(config);
    case "buttons":
      return renderButtons(config, openDialog);
    case "breadcrumbs":
      return renderBreadcrumbs(config, allBreadcrumbs, activeTool);
    case "search":
      return renderSearch(config);
    default:
      return activeTool?.name;
  }
};

export function SiteHeader() {
  const { activeTool } = useOS();
  const { appSchema, currentActiveTab } = useInteractApp();
  const { openDialog } = useDialog();
  const sidebarSchema = appSchema.sidebar as SidebarSchema | undefined;
  const breadcrumbItems = React.useMemo(
    () => findBreadcrumbPath(sidebarSchema?.sections, currentActiveTab),
    [sidebarSchema?.sections, currentActiveTab]
  );
  const { push } = useRouter();

  // Check if sidebar has content (sections with items, or custom content like a dropdown)
  const hasSidebarContent = React.useMemo(() => {
    if (!sidebarSchema) return false;

    if (sidebarSchema.sections && sidebarSchema.sections.length > 0) {
      const hasContent = sidebarSchema.sections.some(
        (section) =>
          section.type === "custom" ||
          ("items" in section && section.items && section.items.length > 0)
      );
      if (hasContent) return true;
    }

    if (sidebarSchema.footer && sidebarSchema.footer.length > 0) {
      const hasItems = sidebarSchema.footer.some(
        (section) =>
          "items" in section && section.items && section.items.length > 0
      );
      if (hasItems) return true;
    }

    return false;
  }, [sidebarSchema]);

  // Handle migration from legacy header structure
  const header = React.useMemo(() => {
    const originalHeader = appSchema?.header;

    // If it's already using the new structure, return as is
    if (
      originalHeader &&
      ("leftUI" in originalHeader ||
        "centerUI" in originalHeader ||
        "rightUI" in originalHeader)
    ) {
      return originalHeader as AppHeader;
    }

    // Default to breadcrumbs if no header is provided
    return {
      centerUI: {
        type: "breadcrumbs" as const,
      },
    } as AppHeader;
  }, [appSchema?.header]);

  return (
    <header 
      className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b border-t-0 border-primary/10 border-solid border-l-0 border-r-0 transition-[width,height] ease-linear"
    >
      <div className="relative flex w-full h-full items-center justify-between gap-3 px-3">
        {/* Left Section - Left-aligned */}
        <div className="flex flex-1 min-w-0 items-center justify-start pl-4 pr-2 lg:pl-6 lg:pr-2 z-10">
          {hasSidebarContent && (
            <>
              <SidebarTrigger className="-ml-1 w-fit" />
              <Separator orientation="vertical" className="mx-2 h-4 w-[1px]" />
            </>
          )}

          <Button
            variant="ghost"
            onClick={() => push("/dashboard")}
            className="flex w-fit h-fit items-center p-1.5 rounded-sm cursor-pointer"
            aria-label={"Home"}
          >
            <GoHomeFill className="w-4 h-4" />
          </Button>

          {header?.leftUI &&
            renderUI(
              header.leftUI as UIConfig,
              breadcrumbItems,
              activeTool,
              openDialog
            )}
        </div>

        {/* Center Section - Absolutely centered */}
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center min-w-0 max-w-2xl z-20 text-sm font-medium pointer-events-none">
          {header?.centerUI ? (
            renderUI(header.centerUI, breadcrumbItems, activeTool, openDialog)
          ) : (
            <span className="text-sm font-medium text-muted-foreground capitalize">
              {breadcrumbItems.length > 0
                ? breadcrumbItems[breadcrumbItems.length - 1].title
                : currentActiveTab || activeTool?.name || ""}
            </span>
          )}
        </div>

        {/* Right Section - Tabs / actions on the right (Apple Calendar style) */}
        <div className="flex flex-1 min-w-0 items-center justify-end gap-2 pr-4 lg:pr-6 z-10">
          {header?.rightUI &&
            renderUI(
              header.rightUI as UIConfig,
              breadcrumbItems,
              activeTool,
              openDialog
            )}
        </div>
      </div>
    </header>
  );
}
