import React, { useRef, useEffect, useState, useCallback } from "react";
import { NextPage } from "next/types";
import { AssistantProvider } from "../Providers/AssistantProv";
import { useOS } from "@OS/Provider/OSProv";
// PageTransition removed — KeepAlive router handles visibility
import VirtualRouter from "$/components/VirtualRouter";
import {
  VirtualMusicPlayer,
  VirtualTodoList,
  VirtualPromptLibrary,
  VirtualX,
  VirtualAurum,
  VirtualSettings,
  VirtualPixelOffice,
  VirtualDocs,
  VirtualIntelligence,
  VirtualOpenClaw,
  VirtualChat,
  VirtualTeam,
  VirtualProjects,
  VirtualProjectEditor,
  VirtualKnowledge,
  VirtualMissionControl,
  VirtualAgent,
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
import { DevicesProvider, useSharedDevices } from "$/Providers/DevicesProv";
import GuidedSetup from "$/components/Onboarding/GuidedSetup";
import { dashboardState } from "$/lib/dashboard-state";
import { isDeviceUnreachable } from "$/lib/hub-direct";

const MainLayout = ({ children }: any) => {
  const { status } = useUser();
  return (
    <DevicesProvider authReady={status === "authenticated"}>
      <MainLayoutInner>{children}</MainLayoutInner>
    </DevicesProvider>
  );
};

const MainLayoutInner = ({ children }: any) => {
  const { mobileScreen, tabletScreen } = useInterim();
  const { publicTools } = useOS();
  const { status } = useUser();
  const hasBeenAuthenticatedRef = useRef(false);
  const [guidedSetupComplete, setGuidedSetupComplete] = useState(() => {
    if (typeof window === "undefined") return true;
    // Try in-memory cache first, then localStorage backup (cache may not be hydrated yet)
    const state =
      dashboardState.get("guided-setup-state") ||
      (() => { try { return localStorage.getItem("ds:guided-setup-state"); } catch { return null; } })();
    if (state) {
      try {
        const parsed = JSON.parse(state);
        // Mid-install → back to wizard.
        if (parsed.launchInProgress) return false;
        // Only trust durable success markers. `completedSteps.length >= 4`
        // alone is NOT enough: earlier builds synthesized [1,2,3,4] on first
        // sight of an online connector, which is exactly the bug we are
        // fixing. Require launchCompletedAt (stamped by a real
        // finalizeAndComplete run) or skippedAt (user explicitly bailed).
        return !!parsed.launchCompletedAt || !!parsed.skippedAt;
      } catch { /* fall through */ }
    }
    // Check if user has saved layouts (existing user, not first-time)
    return !!(
      dashboardState.get("dashboard-layout") ||
      (() => { try { return localStorage.getItem("ds:dashboard-layout"); } catch { return null; } })()
    );
  });

  // Device data comes from DevicesProvider (shared with Userdropdown etc.)
  const { hasOnlineDevice, hasOnboardedDevice, loading: devicesLoading, refetch: refetchDevices } = useSharedDevices();

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

  // Connect the gateway WS before flipping the onboarding flag so dashboard
  // widgets mount with Hub → Connector already relayed.
  const connectGatewayForDashboard = useCallback(async () => {
    try {
      const { clearDeviceCache } = await import("$/lib/hub-direct");
      clearDeviceCache();
    } catch { /* ok */ }
    try {
      const { getGatewayConfig, connectGatewayWs, resetGatewayConnection } =
        await import("$/lib/openclaw-gateway-ws");
      resetGatewayConnection();
      const config = await getGatewayConfig();
      if (config.gatewayUrl) {
        connectGatewayWs(config.gatewayUrl, {
          token: config.token,
          hubMode: config.hubMode,
          hubDeviceId: config.hubDeviceId,
        });
      }
    } catch { /* ok */ }
  }, []);

  // When the hub returns 503 for the selected device (DB says online but no
  // live WS relay — typical after connector restart without credentials), the
  // hub-direct 503 handler trips `hyperclaw:device-unreachable` and pauses all
  // retry loops. Reset guided-setup so the user falls back into onboarding
  // and can re-pair the connector, otherwise they'd be stuck on an empty
  // dashboard that can never reach the unreachable device.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUnreachable = () => {
      // Don't wipe localStorage here — keeping launchCompletedAt means a page
      // reload while the connector is still down lands back on the dashboard
      // (with a degraded state banner) rather than resetting the full wizard.
      // The auto-skip effect is already guarded by isDeviceUnreachable(), so
      // the device must come fully back online before the skip fires again.
      setGuidedSetupComplete(false);
    };
    window.addEventListener("hyperclaw:device-unreachable", onUnreachable);
    return () => {
      window.removeEventListener("hyperclaw:device-unreachable", onUnreachable);
    };
  }, []);

  // Strict gate: skip onboarding ONLY when BOTH (a) the user has a connector
  // reporting online AND (b) the hub confirms that device has fully finished
  // the guided setup wizard (onboardingCompletedAt is non-null). Prior
  // versions synthesized a [1,2,3,4] completedSteps write the moment ANY
  // online device appeared — which flipped users into an empty dashboard
  // while OpenClaw / Hermes / agents were still installing. The server-side
  // flag is the only durable signal that "this machine is actually ready".
  //
  // Launch-in-progress and launch-completed localStorage flags are still
  // respected as a secondary guard for the same-browser reload case.
  useEffect(() => {
    if (guidedSetupComplete || devicesLoading) return;
    if (!hasOnlineDevice || !hasOnboardedDevice) return;
    if (isDeviceUnreachable()) return;

    const raw =
      dashboardState.get("guided-setup-state") ||
      (() => { try { return localStorage.getItem("ds:guided-setup-state"); } catch { return null; } })();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // launchInProgress wins: if the wizard is actively running on this
        // browser, stay out of its way even if another session already
        // stamped onboardingCompletedAt on the hub.
        if (parsed?.launchInProgress) return;
      } catch { /* fall through */ }
    }

    // Mirror the server-confirmed state into localStorage so a fresh reload
    // short-circuits without waiting for the device fetch to finish again.
    const state = JSON.stringify({
      completedSteps: [1, 2, 3, 4],
      serverConfirmedAt: Date.now(),
      launchCompletedAt: new Date().toISOString(),
    });
    dashboardState.set("guided-setup-state", state);
    try { localStorage.setItem("ds:guided-setup-state", state); } catch { /* noop */ }

    (async () => {
      await connectGatewayForDashboard();
      setGuidedSetupComplete(true);
      try {
        window.dispatchEvent(new CustomEvent("agent.hired"));
      } catch { /* noop */ }
    })();
  }, [
    guidedSetupComplete,
    devicesLoading,
    hasOnlineDevice,
    hasOnboardedDevice,
    connectGatewayForDashboard,
  ]);

  const showGuidedOnboarding = !guidedSetupComplete;

  const handleGuidedSetupComplete = useCallback(async () => {
    await connectGatewayForDashboard();
    setGuidedSetupComplete(true);
    refetchDevices();
    window.dispatchEvent(new CustomEvent("agent.hired"));
  }, [refetchDevices, connectGatewayForDashboard]);

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
    { path: "/Tool/OpenClaw", component: VirtualOpenClaw, name: "OpenClaw" },
    { path: "/Tool/PixelOffice", component: VirtualPixelOffice, name: "AI Agent Office" },
    { path: "/Tool/Docs", component: VirtualDocs, name: "Docs" },
    { path: "/Tool/Intelligence", component: VirtualIntelligence, name: "Intelligence" },
    { path: "/Tool/Chat", component: VirtualChat, name: "Chat" },
    { path: "/Tool/Team", component: VirtualTeam, name: "Team" },
    { path: "/Tool/Workflows", component: VirtualProjects, name: "Workflows" },
    { path: "/Tool/ProjectEditor", component: VirtualProjectEditor, name: "Workflow Editor" },
    { path: "/Tool/MissionControl", component: VirtualMissionControl, name: "Workflows" },
    { path: "/Tool/Knowledge", component: VirtualKnowledge, name: "Knowledge" },
    { path: "/Tool/Data", component: VirtualIntelligence, name: "Data" },
    { path: "/Tool/Agent/[id]", component: VirtualAgent, name: "Agent Profile" },
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

  // Show guided onboarding for first-time users
  if (showGuidedOnboarding) {
    return <GuidedSetup onComplete={handleGuidedSetupComplete} />;
  }

  return (
    <PricingModalProvider>
        <TimerProvider>
          <AssistantProvider>
            <DesktopLayout>
              <VirtualRouter routes={virtualRoutes}>
                {children}
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
