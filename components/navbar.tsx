import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useOS } from "@OS/Provider/OSProv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/router";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import Userdropdown from "$/components/Navigation/Userdropdown";
import ClockWidget from "$/components/clock-widget";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { dashboardState } from "$/lib/dashboard-state";
import { LuGrid2X2Plus } from "react-icons/lu";
import {
  PanelRightClose,
  LayoutDashboard,
  Save,
  Trash2,
  Check,
  Pencil,
  X,
  ChevronDown,
} from "lucide-react";
import { WindowControls } from "@OS/AI/components/electron";

/* ── Saved Layouts ──────────────────────────────────────── */

interface SavedLayout {
  id: string;
  name: string;
  createdAt: number;
  layout: string;
  visibleWidgets: string[];
  widgetConfigs: string;
}

function captureCurrentLayout(): Omit<SavedLayout, "id" | "name" | "createdAt"> {
  return {
    layout: dashboardState.get("dashboard-layout") || "{}",
    visibleWidgets: (() => {
      try { return JSON.parse(dashboardState.get("dashboard-visible-widgets") || "[]"); } catch { return []; }
    })(),
    widgetConfigs: dashboardState.get("dashboard-widget-configs") || "{}",
  };
}

function applyLayout(saved: SavedLayout) {
  dashboardState.setMany({
    "dashboard-layout": saved.layout,
    "dashboard-visible-widgets": JSON.stringify(saved.visibleWidgets),
    "dashboard-widget-configs": saved.widgetConfigs,
  });
  window.dispatchEvent(new CustomEvent("dashboard-layout-applied", {
    detail: { visibleWidgets: saved.visibleWidgets },
  }));
}

/* ── Layout Switcher (select-style dropdown) ────────────── */

const LayoutSwitcher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return dashboardState.get("dashboard-active-layout-id");
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  // Position the portal dropdown relative to the trigger button
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setDropPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  // Fetch layouts from backend on first open
  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      try {
        const res = await bridgeInvoke("get-layouts", {}) as { success?: boolean; data?: SavedLayout[] };
        if (res?.success && Array.isArray(res.data)) setLayouts(res.data);
      } catch {}
      setLoaded(true);
    })();
  }, [open, loaded]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) return;
      setOpen(false);
      setSaving(false);
      setNewName("");
      setEditingId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => { if (saving) inputRef.current?.focus(); }, [saving]);
  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);

  const handleSave = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const snapshot = captureCurrentLayout();
    const entry: SavedLayout = {
      id: `layout-${Date.now()}`,
      name: trimmed,
      createdAt: Date.now(),
      ...snapshot,
    };
    setLayouts((prev) => [...prev, entry]);
    setActiveId(entry.id);
    dashboardState.set("dashboard-active-layout-id", entry.id);
    setSaving(false);
    setNewName("");
    try { await bridgeInvoke("save-layout", { ...entry }); } catch {}
  }, [newName]);

  const handleApply = useCallback((layout: SavedLayout) => {
    applyLayout(layout);
    setActiveId(layout.id);
    dashboardState.set("dashboard-active-layout-id", layout.id);
    setOpen(false);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setLayouts((prev) => prev.filter((l) => l.id !== id));
    if (activeId === id) {
      setActiveId(null);
      dashboardState.remove("dashboard-active-layout-id");
    }
    try { await bridgeInvoke("delete-layout", { id }); } catch {}
  }, [activeId]);

  const handleRename = useCallback(async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) { setEditingId(null); return; }
    setLayouts((prev) => prev.map((l) => l.id === id ? { ...l, name: trimmed } : l));
    setEditingId(null);
    setEditName("");
    try { await bridgeInvoke("update-layout", { id, name: trimmed }); } catch {}
  }, [editName]);

  const handleOverwrite = useCallback(async (layout: SavedLayout) => {
    const snapshot = captureCurrentLayout();
    const updated = { ...layout, ...snapshot };
    setLayouts((prev) => prev.map((l) => l.id === layout.id ? updated : l));
    try {
      await bridgeInvoke("save-layout", { ...updated });
    } catch {}
  }, []);

  const activeName = layouts.find((l) => l.id === activeId)?.name;

  const dropdown = open && dropPos ? createPortal(
    <AnimatePresence>
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, y: -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.12 }}
        className="fixed w-[240px] rounded-lg border border-border bg-card shadow-xl"
        style={{ zIndex: 99999, top: dropPos.top, right: dropPos.right }}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-border/50">
          <div className="text-[11px] font-semibold text-foreground">Dashboard Layouts</div>
          <div className="text-[9px] text-muted-foreground">Switch, save, or edit your layouts</div>
        </div>

        {/* Layout list */}
        <div className="max-h-[220px] overflow-y-auto customScrollbar2 py-1">
          {layouts.length === 0 && !saving && (
            <div className="text-[10px] text-muted-foreground/50 text-center py-5">
              No saved layouts yet
            </div>
          )}
          {layouts.map((layout) => {
            const isActive = activeId === layout.id;
            const isEditing = editingId === layout.id;

            if (isEditing) {
              return (
                <div key={layout.id} className="flex items-center gap-1 px-2 py-1">
                  <Input
                    ref={editRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(layout.id);
                      if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                    }}
                    className="h-7 text-[11px] flex-1 bg-muted/30 border-border/60"
                  />
                  <Button
                    variant="ghost" size="iconSm"
                    className="h-7 w-7 shrink-0 text-primary hover:bg-primary/10"
                    onClick={() => handleRename(layout.id)}
                    disabled={!editName.trim()}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost" size="iconSm"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    onClick={() => { setEditingId(null); setEditName(""); }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              );
            }

            return (
              <div
                key={layout.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                onClick={() => handleApply(layout)}
              >
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  isActive ? "bg-primary" : "bg-muted-foreground/30"
                )} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium truncate">
                    {layout.name}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    {layout.visibleWidgets.length} widgets
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOverwrite(layout);
                    }}
                    className="p-1 hover:bg-muted rounded transition-colors"
                    title="Overwrite with current layout"
                  >
                    <Save className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(layout.id);
                      setEditName(layout.name);
                    }}
                    className="p-1 hover:bg-muted rounded transition-colors"
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(layout.id);
                    }}
                    className="p-1 hover:bg-destructive/10 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save current layout */}
        <div className="border-t border-border/50 px-2 py-2">
          {saving ? (
            <div className="flex items-center gap-1.5">
              <Input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") { setSaving(false); setNewName(""); }
                }}
                placeholder="Layout name..."
                className="h-7 text-[11px] flex-1 bg-muted/30 border-border/60"
              />
              <Button
                variant="ghost" size="iconSm"
                className="h-7 w-7 shrink-0 text-primary hover:bg-primary/10"
                onClick={handleSave}
                disabled={!newName.trim()}
              >
                <Check className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost" size="iconSm"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => { setSaving(false); setNewName(""); }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full h-7 text-[11px] gap-1.5 font-medium"
              onClick={() => setSaving(true)}
            >
              <Save className="w-3 h-3" />
              Save current layout
            </Button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => { setOpen((p) => !p); setSaving(false); setNewName(""); setEditingId(null); }}
        className={cn(
          "flex items-center gap-1.5 h-8 pl-2 pr-1.5 rounded-md border text-[11px] transition-colors",
          open
            ? "border-primary bg-primary/5 text-foreground"
            : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-foreground/20"
        )}
      >
        <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-[80px] truncate font-medium">
          {activeName || "Layouts"}
        </span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {dropdown}
    </>
  );
};

const Navbar = () => {
  const Router = useRouter();
  const { tools, activeTool, dockTools } = useOS();
  const { pathname } = Router;

  // macOS-like navbar behavior: hide by default, show on hover (except in /dashboard)
  const [isHovering, setIsHovering] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isTodoSidebarOpen, setIsTodoSidebarOpen] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isDashboard = pathname === "/dashboard";

  // Listen for sidebar toggle events
  useEffect(() => {
    if (!isDashboard) return;

    const handleSidebarToggle = (event: CustomEvent) => {
      setIsTodoSidebarOpen(event.detail.isOpen ?? !isTodoSidebarOpen);
    };

    window.addEventListener(
      "todo-sidebar-toggle",
      handleSidebarToggle as EventListener
    );

    return () => {
      window.removeEventListener(
        "todo-sidebar-toggle",
        handleSidebarToggle as EventListener
      );
    };
  }, [isDashboard, isTodoSidebarOpen]);

  const handleLogoClick = () => {
    if (isDashboard) {
      setIsTodoSidebarOpen(!isTodoSidebarOpen);
      window.dispatchEvent(
        new CustomEvent("todo-sidebar-toggle", {
          detail: { isOpen: !isTodoSidebarOpen },
        })
      );
    } else {
      Router.push("/dashboard");
    }
  };

  // Determine visibility: always visible on dashboard, otherwise based on hover
  const isVisible = isDashboard || isHovering || isSidebarHovered;

  // Electron check
  const isElectron = typeof window !== "undefined" && window.electronAPI;

  // Handle double-click to maximize/restore window
  const handleDoubleClick = () => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.maximizeWindow();
    }
  };

  // Handle mouse movement near the top of the screen
  useEffect(() => {
    if (isDashboard) return; // No need to track hover on dashboard

    const handleMouseMove = (e: MouseEvent) => {
      const threshold = 10; // Show navbar when mouse is within 10px from top

      // Check if mouse is over the navbar
      if (sidebarRef.current) {
        const rect = sidebarRef.current.getBoundingClientRect();
        const isOverSidebar =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        if (isOverSidebar) {
          // Clear any existing timeout when over navbar
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
          }
          setIsHovering(true);
          return;
        }
      }

      // Clear any existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      if (e.clientY <= threshold) {
        setIsHovering(true);
      } else if (!isSidebarHovered) {
        // Only hide if not hovering over navbar
        // Add a small delay before hiding to prevent flickering
        hideTimeoutRef.current = setTimeout(() => {
          setIsHovering(false);
          hideTimeoutRef.current = null;
        }, 300);
      }
    };

    const handleMouseLeave = () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      if (!isSidebarHovered) {
        setIsHovering(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isDashboard, isSidebarHovered]);

  return (
    <motion.div
      ref={sidebarRef}
      className={cn(
        "h-12 flex flex-row justify-between border-r border-t-0 border-l-0 border-b-0 border-solid border-border/50 bg-secondary backdrop-blur-xl cursor-default",
        isDashboard ? "relative" : "fixed top-0 left-0 right-0 z-50"
      )}
      style={isElectron ? { WebkitAppRegion: "drag" } as React.CSSProperties : {}}
      initial={false}
      animate={{
        height: isVisible ? 48 : 0,
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
        overflow: isVisible ? "visible" : "hidden",
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => {
        if (!isDashboard) {
          setIsHovering(true);
          setIsSidebarHovered(true);
          // Clear any hide timeout when entering navbar
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
          }
        }
      }}
      onMouseLeave={() => {
        if (!isDashboard) {
          setIsSidebarHovered(false);
          // Add a delay before hiding to allow moving to buttons
          hideTimeoutRef.current = setTimeout(() => {
            setIsHovering(false);
            hideTimeoutRef.current = null;
          }, 300);
        }
      }}
    >
      {/* Navigation Section */}
      <div 
        className="flex flex-row gap-2 p-1"
        style={isElectron ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : {}}
      >
        {/* Hypercho Home Button / Sidebar Toggle */}
        <HyperchoTooltip
          value={
            isDashboard
              ? isTodoSidebarOpen
                ? "Close sidebar"
                : "Open sidebar"
              : "Home"
          }
          side="right"
        >
          <Button
            data-guidance="navbar-home"
            onClick={handleLogoClick}
            onMouseEnter={() => setIsLogoHovered(true)}
            onMouseLeave={() => setIsLogoHovered(false)}
            variant="ghost"
            className="h-fit px-2 py-2 rounded-md transition-all duration-200 group hover:bg-transparent"
          >
            <div className="w-6 h-6 relative flex items-center justify-center">
              {isDashboard && isLogoHovered ? (
                <PanelRightClose className="h-4 w-4 transition-all duration-300 group-hover:scale-110 text-muted-foreground" />
              ) : (
                <HyperchoIcon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
              )}
            </div>
          </Button>
        </HyperchoTooltip>

        {/* Divider */}
        <div className="w-px bg-border mx-1" />

        <div data-guidance="navbar-tools" className="flex flex-row gap-1 items-center">
        {tools.filter((item) => !item.hidden).map((item) => (
          <div key={item.id} className="relative flex items-center">
            <HyperchoTooltip value={item.name} side="right">
              <Button
                onClick={() => {
                  item.onClick?.();
                }}
                variant="ghost"
                className={cn(
                  "h-fit px-2 py-2 rounded-md transition-all duration-200 w-full",
                  activeTool?.id === item.id && "bg-primary/10 text-primary"
                )}
              >
                {item.icon}
              </Button>
            </HyperchoTooltip>
            {activeTool?.id === item.id && (
              <motion.div
                layoutId="activeNav"
                className="absolute -top-2 h-1 w-8 bg-accent rounded-b-full"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </div>
        ))}
        </div>
      </div>

      {/* User Section at Bottom */}
      <div 
        className="flex flex-row gap-2 p-1 items-center"
        style={isElectron ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : {}}
      >
        <div className="w-px bg-border mx-1" />

        {/* Dock Tools */}
        <div className="flex flex-row gap-1 items-center" data-guidance="navbar-dock">
          {dockTools.map((item) => (
            <HyperchoTooltip key={item.id} value={item.name} side="right">
              <Button
                onClick={item.onClick}
                variant="ghost"
                className={cn(
                  "h-fit px-2 py-2 rounded-md transition-all duration-200",
                  item.active && "bg-accent text-foreground"
                )}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {item.icon}
                </div>
              </Button>
            </HyperchoTooltip>
          ))}
          {isDashboard && (
            <>
              <LayoutSwitcher />
              <HyperchoTooltip key="EditLayout" value="Edit layout" side="right">
                <Button
                  variant="ghost"
                  onClick={() => {
                    // Dispatch custom event to trigger edit mode
                    window.dispatchEvent(
                      new CustomEvent("dashboard-edit-mode-toggle", {
                        detail: { action: "toggle" },
                      })
                    );
                  }}
                  className={cn(
                    "h-fit px-2 py-2 rounded-md transition-all duration-200",
                    activeTool?.id === "dashboard-config" &&
                      "bg-accent text-foreground"
                  )}
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    <LuGrid2X2Plus className="w-4 h-4" />
                  </div>
                </Button>
              </HyperchoTooltip>
            </>
          )}
        </div>

        <div data-guidance="navbar-clock">
          <ClockWidget className="px-2 py-0 gap-0 bg-transparent" />
        </div>

        {/* User Dropdown */}
        <div className="flex items-center justify-center" data-guidance="navbar-user">
          <Userdropdown />
        </div>

      <WindowControls />

      </div>
    </motion.div>
  );
};

export default Navbar;
