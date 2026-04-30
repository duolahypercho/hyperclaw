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
  HeaderGroupConfig,
  HeaderCustomConfig,
  UIConfig,
  AppHeader,
} from "./types";
import { useDialog } from "./Dialog/DialogContext";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";

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

function getBreadcrumbDisplay(breadcrumbs: SidebarItem[], activeTool: Tool | null) {
  if (breadcrumbs.length > 0) {
    return breadcrumbs.map((crumb, idx) => {
      const isLast = idx === breadcrumbs.length - 1;
      if (!crumb.title) return null;
      return (
        <React.Fragment key={crumb.id}>
          <span
            className={cn(
              "flex items-center gap-1.5 min-w-0",
              isLast ? "text-foreground font-medium" : "text-muted-foreground"
            )}
          >
            {crumb.icon &&
              (typeof crumb.icon === "function"
                ? React.createElement(crumb.icon, {
                    className: "w-3.5 h-3.5 flex-shrink-0",
                  })
                : React.isValidElement(crumb.icon)
                ? React.cloneElement(crumb.icon as any, {
                    className: "w-3.5 h-3.5 flex-shrink-0",
                  })
                : null)}
            <span className="truncate">{crumb.title}</span>
          </span>
          {!isLast && (
            <span className="text-muted-foreground/60 shrink-0">/</span>
          )}
        </React.Fragment>
      );
    });
  }

  // Fallback to activeTool.name if no breadcrumbs
  if (activeTool?.name) {
    return (
      <span className="flex items-center gap-1.5 min-w-0 text-foreground font-medium">
        <span className="truncate">{activeTool.name}</span>
      </span>
    );
  }

  return null;
}

const renderButton = (
  button: HeaderButton,
  openDialog: (id: string, data?: Record<string, any>) => void
) => {
  // Match the WireBuilder "Edit canvas / Hide map" pattern: small svg, no
  // explicit margin (gap on the Button handles spacing). Callers may still
  // override via the icon's own className (e.g. `animate-spin`).
  const iconClassName = "h-3 w-3";

  const renderIcon = () => {
    if (!button.icon) return null;

    if (React.isValidElement(button.icon)) {
      const incoming = (button.icon as any).props?.className as
        | string
        | undefined;
      return React.cloneElement(button.icon as any, {
        className: cn(iconClassName, incoming),
      });
    }

    if (typeof button.icon === "function") {
      const IconComponent = button.icon as React.ComponentType<{
        className?: string;
      }>;
      return <IconComponent className={iconClassName} />;
    }

    return null;
  };

  const handleClick = () => {
    if (button.dialog) {
      openDialog(button.dialog.id, button.dialog.data);
    }
    button.onClick?.();
  };

  const accessibleLabel = button.ariaLabel || button.tooltip || button.label;
  const buttonElement = (
    <Button
      variant={button.variant || "outline"}
      size={button.size || "sm"}
      onClick={handleClick}
      disabled={button.disabled}
      aria-label={accessibleLabel}
      className={cn("h-7 gap-1.5 text-[11.5px]", button.className)}
    >
      {renderIcon()}
      {button.label}
      {button.kbd && (
        <span className="ml-1 inline-flex items-center rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground leading-none">
          {button.kbd}
        </span>
      )}
    </Button>
  );

  return (
    <span key={button.id} className="inline-flex">
      {button.tooltip ? (
        <HyperchoTooltip
          value={button.tooltip}
          side={button.tooltipSide || "bottom"}
        >
          <span className="inline-flex">{buttonElement}</span>
        </HyperchoTooltip>
      ) : (
        buttonElement
      )}
    </span>
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
  // If custom breadcrumbs are provided, render them — ensemble .crumb style
  if (config.breadcrumbs && config.breadcrumbs.length > 0) {
    return (
      <nav
        aria-label="Breadcrumb"
        className={cn("flex items-center min-w-0", config.className)}
      >
        <div className="flex items-center gap-2 min-w-0 text-[13px]">
          {config.breadcrumbs.map((crumb, idx) => {
            const isLast = idx === config.breadcrumbs!.length - 1;
            return (
              <React.Fragment key={idx}>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 min-w-0 pointer-events-auto transition-colors bg-transparent p-0 text-left",
                    isLast
                      ? "text-foreground font-medium cursor-default"
                      : "text-muted-foreground hover:text-foreground cursor-pointer"
                  )}
                  onClick={crumb.onClick}
                  disabled={isLast || !crumb.onClick}
                >
                  {crumb.icon &&
                    (typeof crumb.icon === "function"
                      ? React.createElement(crumb.icon, {
                          className: "w-3.5 h-3.5 flex-shrink-0",
                        })
                      : React.isValidElement(crumb.icon)
                      ? React.cloneElement(crumb.icon as any, {
                          className: "w-3.5 h-3.5 flex-shrink-0",
                        })
                      : null)}
                  <span className="truncate">{crumb.label}</span>
                </button>
                {!isLast && (
                  <span className="text-muted-foreground/60 shrink-0">/</span>
                )}
              </React.Fragment>
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
      <div className="flex items-center gap-2 min-w-0 text-[13px]">
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

const renderGroup = (
  config: HeaderGroupConfig,
  allBreadcrumbs: SidebarItem[],
  activeTool: Tool | null,
  openDialog: (id: string, data?: Record<string, any>) => void
) => (
  <div
    className={cn("flex items-center gap-2 flex-shrink-0", config.className)}
  >
    {config.items.map((item, idx) => (
      <React.Fragment key={idx}>
        {renderUI(item, allBreadcrumbs, activeTool, openDialog)}
      </React.Fragment>
    ))}
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
    case "group":
      return renderGroup(config, allBreadcrumbs, activeTool, openDialog);
    case "custom":
      return config.render();
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
      className={cn(
        "bg-background group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center border-b border-t-0 border-border border-solid border-l-0 border-r-0 transition-[width,height] ease-linear",
        header?.className
      )}
    >
      <div className="flex w-full h-full items-center gap-3 px-[18px]">
        {/* Left — sidebar toggle + breadcrumbs (ensemble .crumb on the left) */}
        <div className="flex min-w-0 items-center gap-2">
          {hasSidebarContent && (
            <>
              <SidebarTrigger className="-ml-1 w-fit" />
              <Separator orientation="vertical" className="mx-1 h-4 w-[1px]" />
            </>
          )}

          {header?.leftUI &&
            renderUI(
              header.leftUI as UIConfig,
              breadcrumbItems,
              activeTool,
              openDialog
            )}

          {header?.centerUI ? (
            renderUI(header.centerUI, breadcrumbItems, activeTool, openDialog)
          ) : (
            <span className="text-[13px] font-medium text-foreground capitalize">
              {breadcrumbItems.length > 0
                ? breadcrumbItems[breadcrumbItems.length - 1].title
                : currentActiveTab || activeTool?.name || ""}
            </span>
          )}
        </div>

        {/* Right — actions pushed to end via ml-auto (ensemble .topbar-actions) */}
        <div className="ml-auto flex min-w-0 items-center gap-2">
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
