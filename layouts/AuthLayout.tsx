import { useState, useEffect } from "react";
import { NextPage } from "next/types";
import { Logo, SignIn, SignUp, StartForFree } from "../components/Navigation";
import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import Loading from "$/components/Loading";
import { useRouter } from "next/router";
import { cn } from "../utils";
import { useIsElectron } from "../hooks/useIsElectron";

const LeftSideNavComponent = () => {
  const { status } = useSession();
  const router = useRouter();
  const isLoginPage = router.asPath.includes("/Login");

  //make the navbar
  if (status === "loading")
    return <Skeleton className="h-7 w-20 max-w-[100px] min-h-[1.7rem]" />;

  if (isLoginPage) {
    return (
      <>
        {/* Desktop Version */}
        <div className="hidden md:flex items-center gap-4">
          <SignUp classname="text-sm font-medium px-3 py-2" />
          <StartForFree classname="text-sm font-medium px-3 py-2" />
        </div>
        {/* Mobile Version */}
        <div className="flex md:hidden items-center gap-2">
          <SignUp classname="text-sm font-medium px-3 py-2" />
          <StartForFree classname="text-sm font-medium px-3 py-2" />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop Version */}
      <div className="hidden md:flex items-center gap-4">
        <SignIn classname="text-sm font-medium px-3 py-2" />
        <StartForFree classname="text-sm font-medium px-3 py-2" />
      </div>
      {/* Mobile Version */}
      <div className="flex md:hidden items-center gap-2">
        <SignIn classname="text-sm font-medium px-3 py-2" />
        <StartForFree classname="text-sm font-medium px-3 py-2" />
      </div>
    </>
  );
};

const AuthNav = () => {
  const [isSticky, setSticky] = useState(false);
  // Effect to add the scroll event listener when the component mounts
  useEffect(() => {
    const handleScroll = () => {
      // Set the navbar to sticky when the scroll is more than the height of the navbar
      const layout = document.getElementById("layout");
      if (layout) {
        if (layout.scrollTop > 100) {
          setSticky(true);
        } else {
          setSticky(false);
        }
      }
    };

    // Add the event listener
    document.getElementById("layout")?.addEventListener("scroll", handleScroll);

    // Clean up the event listener when the component unmounts
    return () => {
      document
        .getElementById("layout")
        ?.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <nav className={cn("navbarInfo", isSticky && "showSticky")} id="navbarInfo">
      <div className="w-full h-full flex flex-row justify-between items-center px-8 py-4">
        <div className={`flex h-full relative`}>
          <Logo />
        </div>
        <div className="flex items-center">
          {/* upload, notificatioin component and profileIcon */}
          <LeftSideNavComponent />
        </div>
      </div>
    </nav>
  );
};

const AuthLayout = ({ children }: any) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isElectron = useIsElectron(); // Detect if running in Electron app

  // Track when component has mounted to avoid hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect authenticated users to dashboard (only on landing page)
  useEffect(() => {
    // Only redirect if we're on the landing page (index page)
    const isLandingPage = router.pathname === "/" || router.asPath === "/";

    if (
      isLandingPage &&
      status === "authenticated" &&
      session &&
      !isRedirecting
    ) {
      setIsRedirecting(true);
      router.push("/dashboard");
    }
  }, [status, session, router, isRedirecting]);

  // CRITICAL: Always render children during SSR to ensure SEO tags are present
  // Only show loading overlay (not blocking) during redirect or initial auth check
  // This ensures crawlers see the SEO meta tags even when status is "loading"
  const showLoadingOverlay =
    isRedirecting || (router.pathname === "/" && status === "loading");

  // During SSR and initial render, always render the same structure to avoid hydration mismatch
  // Only after mount, check if we're in Electron and conditionally hide AuthNav
  const shouldShowNav = mounted ? !isElectron : true;

  if (router.pathname === "/auth/Signup" || router.pathname === "/auth/Login") {
    return (
        <div id={"layout"}
        className={`customScrollbar2 w-full h-screen min-h-screen overflow-y-auto overflow-x-hidden`}
        >
          {children}
        </div>
    );
  }

  return (
    <>
      <div
        id={"layout"}
        className={`customScrollbar2 w-full h-screen min-h-screen overflow-y-auto overflow-x-hidden`}
      >
        {shouldShowNav && <AuthNav />}
        <div className="w-full h-full relative">
          {/* Always render children to ensure SEO tags are present during SSR */}
          {children}
          {/* Show loading overlay only if needed, but don't block rendering */}
          {showLoadingOverlay && (
            <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
              <Loading text="Loading..." />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AuthLayout;

export const getLayout = (page: NextPage) => <AuthLayout>{page}</AuthLayout>;
