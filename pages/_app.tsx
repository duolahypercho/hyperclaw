import "../styles/main.css";
import "../styles/nProgress.css";
import {
  InterimProvider,
  ServiceProvider,
  UserProvider,
  ThemeProvider,
  OpenClawProvider,
} from "$/Providers";
import { AIProviderProvider } from "$/Providers/AIProviderProv";
import { SessionProvider } from "next-auth/react";
import Router from "next/router";
import nProgress from "nprogress";
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NextPage } from "next/types";
import { OSProvider } from "@OS/Provider/OSProv";
import { GeistSans } from "geist/font/sans";
import { UpdateNotification } from "$/components/UpdateNotification";
import { GatewayStatusBanner } from "$/components/GatewayStatusBanner";
import { GuidanceProvider } from "$/components/Guidance";
import { ErrorBoundary } from "$/components/ErrorBoundary";

Router.events.on("routeChangeStart", nProgress.start);
Router.events.on("routeChangeError", nProgress.done);
Router.events.on("routeChangeComplete", nProgress.done);

function MyApp({ Component, pageProps, router }: any) {
  const getLayout = Component.getLayout || ((page: NextPage) => page);

  return (
    <ErrorBoundary>
    <main className={GeistSans.className} suppressHydrationWarning>
      {/* Core providers first */}
      <SessionProvider
        session={pageProps.session}
        refetchInterval={15 * 60}
        refetchOnWindowFocus={false}
      >
        <ThemeProvider attribute="class" enableSystem disableTransitionOnChange>
          <UserProvider>
          <OpenClawProvider>
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
                {process.env.NODE_ENV === "production" && <Analytics />}
                <Toaster />
                <GatewayStatusBanner />
                <UpdateNotification />
              </TooltipProvider>
            </GuidanceProvider>
          </OSProvider>
          </AIProviderProvider>
          </OpenClawProvider>
          </UserProvider>
        </ThemeProvider>
      </SessionProvider>
    </main>
    </ErrorBoundary>
  );
}

export default MyApp;
