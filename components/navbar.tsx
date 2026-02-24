import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useOS } from "@OS/Provider/OSProv";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import HyperchoIcon from "$/components/Navigation/HyperchoIcon";
import Userdropdown from "$/components/Navigation/Userdropdown";
import ClockWidget from "$/components/clock-widget";
import { LuGrid2X2Plus } from "react-icons/lu";
import { PanelRightClose } from "lucide-react";
import { WindowControls } from "@OS/AI/components/electron";

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
        {tools.map((item) => (
          !item.hidden && <div key={item.id} className="relative flex items-center">
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
