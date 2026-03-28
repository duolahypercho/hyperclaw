import React, { useState, useEffect, useRef, useCallback } from "react";
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

/**
 * Keep-alive router that caches visited pages to prevent re-mounting.
 *
 * - First visit to a page: shows a loading animation while Next.js loads the chunk.
 * - Subsequent visits: instantly shows the cached (still-mounted) page.
 * - All visited pages stay mounted in the DOM with `display: none` so their
 *   React state, scroll position, and fetched data are preserved.
 */
const VirtualRouter: React.FC<VirtualRouterProps> = ({ routes, children }) => {
  const router = useRouter();

  // Set of pathnames that have been fully loaded at least once
  const [cachedPaths, setCachedPaths] = useState<Set<string>>(
    () => new Set([router.pathname])
  );

  // First-visit loading animation state
  const [virtualRoute, setVirtualRoute] = useState<VirtualRoute | null>(null);
  const [isVirtualNavigation, setIsVirtualNavigation] = useState(false);

  // Ref holding the latest children for each cached path.
  // We store in a ref so updates don't trigger extra renders — the
  // re-render from the pathname change is enough.
  const childrenByPath = useRef<Record<string, React.ReactNode>>({});

  // Always keep the latest children for the active path
  childrenByPath.current[router.pathname] = children;

  // Mark the current path as cached once it renders
  useEffect(() => {
    setCachedPaths((prev) => {
      if (prev.has(router.pathname)) return prev;
      const next = new Set(prev);
      next.add(router.pathname);
      return next;
    });
  }, [router.pathname]);

  // Listen for virtual navigation events
  useEffect(() => {
    const handleVirtualNavigation = (event: CustomEvent) => {
      const { path, immediate } = event.detail;
      if (!immediate) return;

      // If the page is already cached, just navigate — it will show instantly
      if (cachedPaths.has(path)) {
        router.push(path, undefined, { scroll: false });
        return;
      }

      // First visit — show loading animation
      const matchingRoute = routes.find((route) => route.path === path);
      if (matchingRoute) {
        setVirtualRoute(matchingRoute);
        setIsVirtualNavigation(true);
        router.push(path, undefined, { scroll: false });
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
  }, [routes, router, cachedPaths]);

  // Clear loading animation when Next.js finishes the route change
  useEffect(() => {
    const handleRouteComplete = () => {
      if (isVirtualNavigation) {
        setTimeout(() => {
          setIsVirtualNavigation(false);
          setVirtualRoute(null);
        }, 100);
      }
    };

    router.events.on("routeChangeComplete", handleRouteComplete);
    return () => {
      router.events.off("routeChangeComplete", handleRouteComplete);
    };
  }, [router.events, isVirtualNavigation]);

  // While showing the first-visit loading animation, render it on top
  if (isVirtualNavigation && virtualRoute) {
    const VirtualComponent = virtualRoute.component;
    const LoadingComponent = virtualRoute.loading;

    return (
      <>
        {/* Keep existing cached pages alive (hidden) during animation */}
        {Array.from(cachedPaths).map((path) => (
          <div key={path} style={{ display: "none" }}>
            {childrenByPath.current[path]}
          </div>
        ))}

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
      </>
    );
  }

  // Render all cached pages — active one visible, others hidden
  return (
    <>
      {Array.from(cachedPaths).map((path) => (
        <div
          key={path}
          style={{
            display: path === router.pathname ? "contents" : "none",
            height: path === router.pathname ? undefined : 0,
          }}
        >
          {path === router.pathname
            ? children
            : childrenByPath.current[path]}
        </div>
      ))}
    </>
  );
};

// Helper function to trigger virtual navigation
export const navigateVirtual = (path: string, immediate: boolean = true) => {
  const event = new CustomEvent("virtualNavigation", {
    detail: { path, immediate },
  });
  window.dispatchEvent(event);
};

export default VirtualRouter;
