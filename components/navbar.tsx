import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useOS } from "@OS/Provider/OSProv";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import Userdropdown from "$/components/Navigation/Userdropdown";
import { dashboardState } from "$/lib/dashboard-state";
import {
  PanelRightClose,
  LayoutDashboard,
  ChevronDown,
  Check,
} from "lucide-react";
import { LAYOUT_PRESETS, type LayoutPresetId } from "$/components/Home/index";

/* ── Layout Preset Switcher ──────────────────────────────── */
// Kept for use in dashboard header; no longer rendered in the sidebar.

const LayoutPresetSwitcher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<LayoutPresetId>(() => {
    if (typeof window === "undefined") return "default";
    return (dashboardState.get("dashboard-active-preset") as LayoutPresetId) || "default";
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setDropPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleApply = (presetId: LayoutPresetId) => {
    setActiveId(presetId);
    window.dispatchEvent(new CustomEvent("dashboard-preset-switch", {
      detail: { presetId },
    }));
    setOpen(false);
  };

  const activeName = LAYOUT_PRESETS.find((p) => p.id === activeId)?.name || "Default";

  const dropdown = open && dropPos ? createPortal(
    <AnimatePresence>
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, y: -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.12 }}
        className="fixed w-[220px] rounded-lg border border-border bg-card shadow-xl"
        style={{ zIndex: 99999, top: dropPos.top, right: dropPos.right }}
      >
        <div className="px-3 py-2 border-b border-border/50">
          <div className="text-[11px] font-semibold text-foreground">Layouts</div>
          <div className="text-[9px] text-muted-foreground">Switch dashboard layout</div>
        </div>

        <div className="py-1">
          {LAYOUT_PRESETS.map((preset) => {
            const isActive = activeId === preset.id;
            return (
              <div
                key={preset.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                onClick={() => handleApply(preset.id)}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                  isActive
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40"
                )}>
                  {isActive && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium">{preset.name}</div>
                  <div className="text-[9px] text-muted-foreground">{preset.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center gap-1.5 h-8 pl-2 pr-1.5 rounded-md border text-[11px] transition-colors",
          open
            ? "border-primary bg-primary/5 text-foreground"
            : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-foreground/20"
        )}
      >
        <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
        <span className="max-w-[80px] truncate font-medium">{activeName}</span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {dropdown}
    </>
  );
};

export { LayoutPresetSwitcher };

const Navbar = () => {
  const Router = useRouter();
  const { tools, activeTool, dockTools } = useOS();
  const { pathname } = Router;

  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isTodoSidebarOpen, setIsTodoSidebarOpen] = useState(true);
  const isDashboard = pathname === "/dashboard";

  // Listen for sidebar toggle events
  useEffect(() => {
    if (!isDashboard) return;

    const handleSidebarToggle = (event: CustomEvent) => {
      setIsTodoSidebarOpen(event.detail.isOpen ?? !isTodoSidebarOpen);
    };

    window.addEventListener("todo-sidebar-toggle", handleSidebarToggle as EventListener);

    return () => {
      window.removeEventListener("todo-sidebar-toggle", handleSidebarToggle as EventListener);
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

  return (
    <>
      {/* Sidebar */}
      <motion.div
        className="w-12 fixed left-0 top-8 bottom-0 z-50 flex flex-col justify-between border-r border-solid border-border/50 bg-secondary backdrop-blur-xl cursor-default"
        initial={{ x: -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {/* Top: Logo + Tool Icons */}
        <div
          className="flex flex-col items-center gap-1 p-1 pt-2"
        >
          {/* Logo / Sidebar Toggle */}
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
          <div className="h-px w-8 bg-border my-1" />

          {/* Tool Icons */}
          <div data-guidance="navbar-tools" className="flex flex-col gap-1 items-center w-full">
            {tools.filter((item) => !item.hidden).map((item) => (
              <div key={item.id} className="relative flex items-center w-full justify-center">
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
                    className="absolute -left-1 w-1 h-8 bg-accent rounded-r-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Dock Tools + User */}
        <div
          className="flex flex-col items-center gap-1 p-1 pb-2"
        >
          {/* Dock Tools */}
          <div className="flex flex-col gap-1 items-center w-full" data-guidance="navbar-dock">
            {dockTools.map((item) => (
              <HyperchoTooltip key={item.id} value={item.name} side="right">
                <Button
                  onClick={item.onClick}
                  variant="ghost"
                  className={cn(
                    "h-fit px-2 py-2 rounded-md transition-all duration-200 w-full",
                    item.active && "bg-accent text-foreground"
                  )}
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    {item.icon}
                  </div>
                </Button>
              </HyperchoTooltip>
            ))}
          </div>

          {/* User Dropdown */}
          <div className="flex items-center justify-center" data-guidance="navbar-user">
            <Userdropdown />
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default Navbar;
