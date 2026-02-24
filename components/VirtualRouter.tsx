import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";

interface VirtualRoute {
  path: string;
  component: React.ComponentType;
  loading?: React.ComponentType;
  name: string;
}

interface VirtualRouterProps {
  routes: VirtualRoute[];
  children: React.ReactNode;
}

const VirtualRouter: React.FC<VirtualRouterProps> = ({ routes, children }) => {
  const router = useRouter();
  const [virtualRoute, setVirtualRoute] = useState<VirtualRoute | null>(null);
  const [isVirtualNavigation, setIsVirtualNavigation] = useState(false);
  const [nextRoute, setNextRoute] = useState<string>("");

  // Listen for virtual navigation events
  useEffect(() => {
    const handleVirtualNavigation = (event: CustomEvent) => {
      const { path, immediate } = event.detail;

      if (immediate) {
        // Find matching virtual route
        const matchingRoute = routes.find((route) => route.path === path);

        if (matchingRoute) {
          setVirtualRoute(matchingRoute);
          setIsVirtualNavigation(true);
          setNextRoute(path);

          // Start actual Next.js navigation in background
          router.push(path, undefined, { scroll: false });
        }
      }
    };

    window.addEventListener(
      "virtualNavigation",
      handleVirtualNavigation as EventListener
    );

    return () => {
      window.removeEventListener(
        "virtualNavigation",
        handleVirtualNavigation as EventListener
      );
    };
  }, [routes, router]);

  // Listen for Next.js route completion
  useEffect(() => {
    const handleRouteComplete = () => {
      if (isVirtualNavigation && router.pathname === nextRoute) {
        // Next.js has caught up, hide virtual route
        setTimeout(() => {
          setIsVirtualNavigation(false);
          setVirtualRoute(null);
          setNextRoute("");
        }, 100);
      }
    };

    router.events.on("routeChangeComplete", handleRouteComplete);

    return () => {
      router.events.off("routeChangeComplete", handleRouteComplete);
    };
  }, [router.events, router.pathname, isVirtualNavigation, nextRoute]);

  if (isVirtualNavigation && virtualRoute) {
    const VirtualComponent = virtualRoute.component;
    const LoadingComponent = virtualRoute.loading;

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={`virtual-${virtualRoute.path}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-full h-full"
        >
          <div className="flex flex-col h-full">
            <div className="flex-1">
              {LoadingComponent ? <LoadingComponent /> : <VirtualComponent />}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return <>{children}</>;
};

// Helper function to trigger virtual navigation
export const navigateVirtual = (path: string, immediate: boolean = true) => {
  const event = new CustomEvent("virtualNavigation", {
    detail: { path, immediate },
  });
  window.dispatchEvent(event);
};

export default VirtualRouter;
