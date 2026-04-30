import React, { useEffect, memo, useState } from "react";
import { useOS } from "@OS/Provider/OSProv";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import DocsAppLayout from "$/components/Tool/Docs/DocsAppLayout";
import FloatingChatAppLayout from "$/components/Tool/FloatingChat/FloatingChatAppLayout";
import Navbar, { NAV_COLLAPSED_W, NAV_EXPANDED_W } from "$/components/navbar";
import { TitleBar } from "@OS/AI/components/electron";
import { useRouter } from "next/router";
import { Guidance, useGuidance } from "$/components/Guidance";
import { onboardingConfig } from "$/components/Guidance/configs/onboarding";
import { DoctorTerminalProvider } from "$/components/Tool/DoctorTerminal/DoctorTerminalContext";
import DoctorTerminalPanel from "$/components/Tool/DoctorTerminal/DoctorTerminalPanel";
import { useSession } from "next-auth/react";
import { useEnsembleAgents } from "$/components/ensemble";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";


// Memoized wrapper to prevent re-renders - following your existing pattern
const MemoizedChildren = memo(
  ({
    children,
  }: {
    children: React.ReactNode;
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
  const router = useRouter();
  const [isDashboard, setIsDashboard] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);
  const { data: session } = useSession();
  const { hasCompletedTour } = useGuidance();
  const ensembleAgents = useEnsembleAgents();
  const onboardingDone = hasCompletedTour("copanion-onboarding");

  useEffect(() => {
    const handler = (e: CustomEvent) => setNavExpanded(e.detail.expanded as boolean);
    window.addEventListener("nav-expanded-change", handler as EventListener);
    return () => window.removeEventListener("nav-expanded-change", handler as EventListener);
  }, []);

  useEffect(() => {
    setIsDashboard(router.pathname === "/dashboard");
  }, [router.pathname]);

  // Seed user.md for all agents once onboarding is complete
  useEffect(() => {
    if (!onboardingDone) return;
    if (!session?.user) return;
    if (ensembleAgents.length === 0) return;
    const user = session.user as any;
    const seedKey = `user-md-seeded-${user.userId || user.email || "anon"}`;
    if (localStorage.getItem(seedKey)) return;

    const name = [user.Firstname, user.Lastname].filter(Boolean).join(" ") || user.name || "";
    const lines = [
      "# User Profile",
      "",
      name ? `**Name:** ${name}` : null,
      user.email ? `**Email:** ${user.email}` : null,
      user.username ? `**Username:** ${user.username}` : null,
      user.aboutme ? `**About:** ${user.aboutme}` : null,
    ].filter((l): l is string => l !== null);
    const content = lines.join("\n");

    for (const agent of ensembleAgents) {
      bridgeInvoke("save-agent-file", {
        agentId: agent.id,
        fileKey: "USER",
        content,
      }).catch(() => {});
    }
    localStorage.setItem(seedKey, "true");
  }, [onboardingDone, session, ensembleAgents]);

  // Wait for dashboard state + layouts to be ready before rendering
  if (!dashboardReady) return null;

  return (
    <DoctorTerminalProvider>
    <div
      id="layout"
      className="w-full h-screen flex flex-col relative overflow-hidden"
    >
      {/* Background overlay */}
      <div className="absolute inset-0 bg-background z-0 pointer-events-none" />

      {/* Main content area - takes remaining space */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Titlebar: fixed top strip with OS-native window controls */}
        <TitleBar />
        {/* Sidebar: fixed, starts below titlebar */}
        <Navbar />
        {/* Content offset by sidebar width + titlebar height */}
        <div
          className="flex-1 flex flex-row overflow-hidden pt-8 transition-[padding-left] duration-300 ease-in-out"
          style={{ paddingLeft: navExpanded ? NAV_EXPANDED_W : NAV_COLLAPSED_W }}
        >
          <MemoizedChildren>
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
  );
};

export default DesktopLayout;
