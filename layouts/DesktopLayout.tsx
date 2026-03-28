import React, { useEffect, memo, useRef, useState, useCallback } from "react";
import { useOS, useCopanionChatOS } from "@OS/Provider/OSProv";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import Pomodoro from "$/components/Tool/Pomodoro/pomodoroAppLayout";
import DocsAppLayout from "$/components/Tool/Docs/DocsAppLayout";
import FloatingChatAppLayout from "$/components/Tool/FloatingChat/FloatingChatAppLayout";
import Navbar from "$/components/navbar";
import { useRouter } from "next/router";
import { TodoListProvider } from "$/components/Tool/TodoList/provider/todolistProvider";
import { Guidance } from "$/components/Guidance";
import { onboardingConfig } from "$/components/Guidance/configs/onboarding";
import CopanionChat from "$/components/Tool/Copanion";

// Hyperclaw width constant
const COPANION_WIDTH = 400;
const SIDEBAR_WIDTH = 300;

// Memoized wrapper to prevent re-renders - following your existing pattern
const MemoizedChildren = memo(
  ({
    children,
  }: {
    children: React.ReactNode;
    isCopanionOpen: boolean;
    navbarHeight: number;
  }) => {
    return (
      <div
        className="w-full h-full bg-background"
      >
        {children}
      </div>
    );
  }
);

MemoizedChildren.displayName = "MemoizedChildren";

const DesktopLayout = ({ children }: any) => {
  const { dashboardReady } = useOpenClawContext();
  const { showState } = useCopanionChatOS();
  const router = useRouter();
  const [isDashboard, setIsDashboard] = useState(false);
  const [isTodoSidebarOpen, setIsTodoSidebarOpen] = useState(true);

  useEffect(() => {
    setIsDashboard(router.pathname === "/dashboard");
  }, [router.pathname]);

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

  const [navbarHeight, setNavbarHeight] = useState(64); // Default fallback height
  const navbarRef = useRef<HTMLDivElement>(null);

  // Function to measure navbar width
  const measureNavbarHeight = useCallback(() => {
    if (navbarRef.current) {
      const height = navbarRef.current.offsetHeight;
      setNavbarHeight(height);
    }
  }, []);

  // Set up ResizeObserver to track navbar width changes
  useEffect(() => {
    if (!navbarRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        setNavbarHeight(height);
      }
    });

    resizeObserver.observe(navbarRef.current);

    // Initial measurement
    measureNavbarHeight();

    return () => {
      resizeObserver.disconnect();
    };
  }, [measureNavbarHeight]);

  // Wait for dashboard state + layouts to be ready before rendering
  if (!dashboardReady) return null;

  return (
    <TodoListProvider>
    <div
      id="layout"
      className="w-full h-screen flex flex-col relative overflow-hidden"
    >
      {/* Background overlay */}
      <div className="absolute inset-0 bg-black/10 z-0 pointer-events-none" />

      {/* Main content area - takes remaining space */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Navbar container - takes up space in layout */}
        <div ref={navbarRef} className="flex-shrink-0 relative w-full">
          <Navbar />
        </div>
        <div className="flex-1 flex flex-row overflow-hidden">
          <MemoizedChildren
            isCopanionOpen={showState}
            navbarHeight={navbarHeight}
          >
            {isDashboard ? (
              <div data-guidance="center-display" className="w-full h-full">
                {children}
              </div>
            ) : (
              children
            )}
          </MemoizedChildren>
        </div>
      </div>

      {/* Fixed elements - hidden in fullscreen mode */}
      <div className="relative z-10">
        {/* Floating components */}
        <Pomodoro />
        <DocsAppLayout />
        <FloatingChatAppLayout />
      </div>

      {/* Guidance/Onboarding System */}
      <Guidance config={onboardingConfig} autoStart={true} checkCompletion={true} />
    </div>
    </TodoListProvider>
  );
};

export default DesktopLayout;
