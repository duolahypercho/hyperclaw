import React, { useRef, useEffect, useState, useCallback } from "react";
import { NextPage } from "next/types";
import { AssistantProvider } from "../Providers/AssistantProv";
import { useOS } from "@OS/Provider/OSProv";
import PageTransition from "$/components/PageTransition";
import VirtualRouter from "$/components/VirtualRouter";
import {
  VirtualMusicPlayer,
  VirtualTodoList,
  VirtualPromptLibrary,
  VirtualX,
  VirtualAurum,
  VirtualSettings,
  VirtualMemory,
  VirtualCrons,
  VirtualPixelOffice,
  VirtualDocs,
  VirtualUsage,
  VirtualOpenClaw,
  VirtualApprovals,
  VirtualOrgChart,
  VirtualChat,
} from "$/components/Tool/VirtualToolComponents";
import { TimerProvider } from "$/Providers/TimerProv";
import { useInterim } from "$/Providers/InterimProv";
import DesktopOnlyAccess from "$/components/DesktopOnlyAccess";
import DesktopLayout from "./DesktopLayout";
import { useAuthGuard } from "$/hooks/useAuthGuard";
import { useUser } from "$/Providers/UserProv";
import Loading from "$/components/Loading";
import { PricingModalProvider, usePricingModal } from "$/Providers/PricingModalProv";
import PricingModal from "$/components/Navigation/PricingModal";
import { useDevices } from "$/hooks/useDevices";
import DeviceSetup from "$/components/Onboarding/DeviceSetup";

const MainLayout = ({ children }: any) => {
  const { mobileScreen, tabletScreen } = useInterim();
  const { publicTools } = useOS();
  const { status } = useUser();
  const hasBeenAuthenticatedRef = useRef(false);
  const [setupSkipped, setSetupSkipped] = useState(false);

  // Check devices from hub
  const { needsSetup, loading: devicesLoading, refetch: refetchDevices } = useDevices();

  // Use the professional auth guard hook
  const { isLoading, isRedirecting } = useAuthGuard({
    publicRoutes: publicTools,
    redirectTo: "/auth/Login",
    delay: 100,
  });

  // Once we've seen authenticated, keep showing the app during brief "loading" (e.g. session refetch on click/focus)
  useEffect(() => {
    if (status === "authenticated") hasBeenAuthenticatedRef.current = true;
    if (status === "unauthenticated") hasBeenAuthenticatedRef.current = false;
  }, [status]);


  const showFullPageLoading =
    isRedirecting ||
    (!hasBeenAuthenticatedRef.current && (isLoading || status === "loading"));
  const showAppWithLayout =
    status === "authenticated" || (hasBeenAuthenticatedRef.current && status === "loading");

  // Show onboarding if: authenticated + no devices + not skipped
  const showOnboarding = showAppWithLayout && needsSetup && !devicesLoading && !setupSkipped;

  const handleSetupComplete = useCallback(() => {
    setSetupSkipped(true);
    refetchDevices();
  }, [refetchDevices]);

  // Define virtual routes for instant navigation
  const virtualRoutes = [
    {
      path: "/Tool/Music",
      component: VirtualMusicPlayer,
      name: "Music Player",
    },
    { path: "/Tool/TodoList", component: VirtualTodoList, name: "Todo List" },
    {
      path: "/Tool/PromptLibrary",
      component: VirtualPromptLibrary,
      name: "Prompt Library",
    },
    { path: "/Tool/X", component: VirtualX, name: "X (Twitter)" },
    { path: "/Tool/Aurum", component: VirtualAurum, name: "Aurum" },
    { path: "/Tool/Memory", component: VirtualMemory, name: "Memory" },
    { path: "/Tool/Crons", component: VirtualCrons, name: "Cron Jobs" },
    { path: "/Tool/OpenClaw", component: VirtualOpenClaw, name: "OpenClaw" },
{ path: "/Tool/PixelOffice", component: VirtualPixelOffice, name: "AI Agent Office" },
    { path: "/Tool/Docs", component: VirtualDocs, name: "Docs" },
    { path: "/Tool/Usage", component: VirtualUsage, name: "Token Usage" },
    { path: "/Tool/Approvals", component: VirtualApprovals, name: "Approvals" },
    { path: "/Tool/OrgChart", component: VirtualOrgChart, name: "Org Chart" },
    { path: "/Tool/Chat", component: VirtualChat, name: "Chat" },
    { path: "/Settings", component: VirtualSettings, name: "Settings" },
  ];

  // Show loading state only on initial auth check (not during brief session refetch)
  if (showFullPageLoading) {
    return <Loading text="Loading Hyperclaw..." />;
  }

  if (mobileScreen || tabletScreen) {
    return <DesktopOnlyAccess showBackButton={false} />;
  }

  if (!showAppWithLayout) {
    return <>{children}</>;
  }

  // Show onboarding for browser users with no devices
  if (showOnboarding) {
    return <DeviceSetup onComplete={handleSetupComplete} />;
  }

  return (
    <PricingModalProvider>
        <TimerProvider>
          <AssistantProvider>
            <DesktopLayout>
              <VirtualRouter routes={virtualRoutes}>
                <PageTransition>{children}</PageTransition>
              </VirtualRouter>
            </DesktopLayout>
            <PricingModalWrapper />
          </AssistantProvider>
        </TimerProvider>
    </PricingModalProvider>
  );
};

// Wrapper component to use the pricing modal hook
const PricingModalWrapper = () => {
  const { isOpen, closeModal } = usePricingModal();
  return (
    <PricingModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeModal();
      }}
    />
  );
};

export default MainLayout;
export const getLayout = (page: NextPage | JSX.Element) => (
  <MainLayout>{page}</MainLayout>
);
