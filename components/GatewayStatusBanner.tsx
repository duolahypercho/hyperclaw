"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useOpenClawContext } from "$/Providers/OpenClawProv";

/** Routes where the gateway banner should be hidden */
const HIDDEN_ROUTES = ["/auth/", "/onboarding", "/landing", "/reset"];


/**
 * Persistent, non-closable banner shown when the OpenClaw gateway is unreachable.
 * Auto-hides when the connection is restored.
 * Hidden when the user is not logged in (OpenClaw won't be running anyway).
 */
export function GatewayStatusBanner() {
  const { data: session } = useSession();
  const { gatewayHealthy, fetchGatewayHealth } = useOpenClawContext();
  const router = useRouter();
  const [reconnecting, setReconnecting] = useState(false);

  // Hide on auth pages, onboarding, landing, and reset password
  const isHiddenRoute = HIDDEN_ROUTES.some((r) => router.pathname.startsWith(r));

  // Hide during guided onboarding (rendered as overlay, not a route)
  const isOnboarding = typeof window !== "undefined" && (() => {
    try {
      const state = localStorage.getItem("hyperclaw-dashboard-state");
      if (!state) return true; // no state = first time = onboarding
      const parsed = JSON.parse(state);
      const guided = parsed["guided-setup-state"];
      if (!guided) return true;
      const g = JSON.parse(guided);
      return !(g.completedSteps?.length >= 2 || g.skippedAt);
    } catch { return false; }
  })();

  // Only show when logged in, gateway is down, and not on a hidden page/onboarding
  const show = !!session && gatewayHealthy === false && !isHiddenRoute && !isOnboarding;

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await fetchGatewayHealth();
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-red-500/30 bg-red-950/90 backdrop-blur-md shadow-lg shadow-red-500/10 text-red-200 text-sm">
            <WifiOff className="w-4 h-4 shrink-0 text-red-400" />
            <span className="font-medium">
              OpenClaw is not running
            </span>
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-100 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${reconnecting ? "animate-spin" : ""}`} />
              {reconnecting ? "Reconnecting..." : "Reconnect"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
