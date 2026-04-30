import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

interface UseAuthGuardOptions {
  publicRoutes?: string[];
  redirectTo?: string;
  delay?: number;
  allowUnauthenticated?: boolean;
}

/**
 * Custom hook to handle authentication guards with proper loading state management
 * Prevents false redirects during initial auth state loading
 */
export const useAuthGuard = (options: UseAuthGuardOptions = {}) => {
  const {
    publicRoutes = [],
    redirectTo = "/auth/Login",
    delay = 100,
    allowUnauthenticated = false,
  } = options;

  const { status, data: session } = useSession();
  const { push, pathname } = useRouter();
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Initialize auth state after a brief delay to prevent race conditions
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasInitialized(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  const shouldRedirect = useCallback(() => {
    // Don't redirect if:
    // 1. Not initialized yet
    // 2. Still loading
    // 3. User is authenticated
    // 4. Current route is public
    // 5. Already redirecting
    if (
      !hasInitialized ||
      status === "loading" ||
      status === "authenticated" ||
      session ||
      allowUnauthenticated ||
      publicRoutes.includes(pathname) ||
      isRedirecting
    ) {
      return false;
    }

    // Only redirect if we're certain the user is unauthenticated
    return status === "unauthenticated" && !session;
  }, [allowUnauthenticated, hasInitialized, status, session, publicRoutes, pathname, isRedirecting]);

  useEffect(() => {
    if (shouldRedirect()) {
      setIsRedirecting(true);
      push(redirectTo);
    }
  }, [shouldRedirect, push, redirectTo]);

  return {
    isAuthenticated: status === "authenticated" && !!session,
    isLoading: status === "loading" || !hasInitialized,
    isRedirecting,
    status,
    session,
  };
};
