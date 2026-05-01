import "../styles/main.css";
import "../styles/nProgress.css";
import "../components/projects/styles/ensemble.css";
import "@xyflow/react/dist/style.css";
import {
  InterimProvider,
  ServiceProvider,
  UserProvider,
  ThemeProvider,
  HyperclawProvider,
} from "$/Providers";
import { AIProviderProvider } from "$/Providers/AIProviderProv";
import { SessionProvider } from "next-auth/react";
import Router from "next/router";
import nProgress from "nprogress";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NextPage } from "next/types";
import { OSProvider } from "@OS/Provider/OSProv";
import { GeistSans } from "geist/font/sans";
import { UpdateNotification } from "$/components/UpdateNotification";
import { GuidanceProvider } from "$/components/Guidance";
import { ErrorBoundary } from "$/components/ErrorBoundary";

Router.events.on("routeChangeStart", nProgress.start);
Router.events.on("routeChangeError", nProgress.done);
Router.events.on("routeChangeComplete", nProgress.done);

// Build-time constant: Community Edition has no remote hub and no hosted
// auth. Skip the NextAuth session fetch entirely — the dashboard runs as a
// local guest and never makes /api/auth/session requests.
const COMMUNITY_LOCAL_MODE = !process.env.NEXT_PUBLIC_HUB_API_URL;

function MyApp({ Component, pageProps, router }: any) {
  const getLayout = Component.getLayout || ((page: NextPage) => page);

  // Passing session={null} explicitly tells SessionProvider to skip the
  // initial /api/auth/session fetch and resolve to "unauthenticated" on mount.
  // refetchInterval={0} disables background polling.
  const sessionProp = COMMUNITY_LOCAL_MODE ? null : pageProps.session;
  const refetchInterval = COMMUNITY_LOCAL_MODE ? 0 : 15 * 60;

  return (
    <ErrorBoundary>
    <main className={GeistSans.className} suppressHydrationWarning>
      {/* Core providers first */}
      <SessionProvider
        session={sessionProp}
        refetchInterval={refetchInterval}
        refetchOnWindowFocus={false}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
          <UserProvider>
          <HyperclawProvider>
          <AIProviderProvider>
          <OSProvider>
            <GuidanceProvider>
              <TooltipProvider>
                  <ServiceProvider>
                    <InterimProvider>
                      {/* 1. Render layout and content first - ensures SEO tags are at the top */}
                      {getLayout(<Component {...pageProps} />)}
                    </InterimProvider>
                  </ServiceProvider>
                <Toaster />
                <UpdateNotification />
              </TooltipProvider>
            </GuidanceProvider>
          </OSProvider>
          </AIProviderProvider>
          </HyperclawProvider>
          </UserProvider>
        </ThemeProvider>
      </SessionProvider>
    </main>
    </ErrorBoundary>
  );
}

export default MyApp;
