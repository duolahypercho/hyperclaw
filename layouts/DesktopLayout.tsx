import React, { useEffect, memo, useState } from "react";
import { useOS, useCopanionChatOS } from "@OS/Provider/OSProv";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import DocsAppLayout from "$/components/Tool/Docs/DocsAppLayout";
import FloatingChatAppLayout from "$/components/Tool/FloatingChat/FloatingChatAppLayout";
import Navbar from "$/components/navbar";
import { TitleBar } from "@OS/AI/components/electron";
import { useRouter } from "next/router";
import { TodoListProvider } from "$/components/Tool/TodoList/provider/todolistProvider";
import { Guidance } from "$/components/Guidance";
import { onboardingConfig } from "$/components/Guidance/configs/onboarding";
import { DoctorTerminalProvider } from "$/components/Tool/DoctorTerminal/DoctorTerminalContext";
import DoctorTerminalPanel from "$/components/Tool/DoctorTerminal/DoctorTerminalPanel";


// Memoized wrapper to prevent re-renders - following your existing pattern
const MemoizedChildren = memo(
  ({
    children,
  }: {
    children: React.ReactNode;
    isCopanionOpen: boolean;
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
  const { dashboardReady } = useHyperclawContext();
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

  // Wait for dashboard state + layouts to be ready before rendering
  if (!dashboardReady) return null;

  return (
    <TodoListProvider>
    <DoctorTerminalProvider>
    <div
      id="layout"
      className="w-full h-screen flex flex-col relative overflow-hidden"
    >
      {/* Background overlay */}
      <div className="absolute inset-0 bg-black/10 z-0 pointer-events-none" />

      {/* Main content area - takes remaining space */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Titlebar: fixed top strip with OS-native window controls */}
        <TitleBar />
        {/* Sidebar: fixed, starts below titlebar */}
        <Navbar />
        {/* Content offset by sidebar width + titlebar height */}
        <div className="flex-1 flex flex-row overflow-hidden pl-12 pt-8">
          <MemoizedChildren
            isCopanionOpen={showState}
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
        <DocsAppLayout />
        <FloatingChatAppLayout />
        <DoctorTerminalPanel />
      </div>

      {/* Guidance/Onboarding System */}
      <Guidance config={onboardingConfig} autoStart={true} checkCompletion={true} />
    </div>
    </DoctorTerminalProvider>
    </TodoListProvider>
  );
};

export default DesktopLayout;
