import "../styles/main.css";
import "../styles/nProgress.css";
import "../components/PixelOffice/pixel-office-scoped.css";
import {
  InterimProvider,
  ServiceProvider,
  UserProvider,
  ThemeProvider,
} from "$/Providers";
import { SessionProvider } from "next-auth/react";
import Router from "next/router";
import nProgress from "nprogress";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NextPage } from "next/types";
import { OSProvider } from "@OS/Provider/OSProv";
import { GeistSans } from "geist/font/sans";
import Live2DScripts from "$/components/Live2DScripts";
import { UpdateNotification } from "$/components/UpdateNotification";
import { GuidanceProvider } from "$/components/Guidance";

Router.events.on("routeChangeStart", nProgress.start);
Router.events.on("routeChangeError", nProgress.done);
Router.events.on("routeChangeComplete", nProgress.done);

function MyApp({ Component, pageProps }: any) {
  const getLayout = Component.getLayout || ((page: NextPage) => page);
  return (
    <main className={GeistSans.className} suppressHydrationWarning>
      {/* Core providers first */}
      <SessionProvider session={pageProps.session}>
        <ThemeProvider attribute="class" enableSystem disableTransitionOnChange>
          <OSProvider>
            <GuidanceProvider>
              <TooltipProvider>
                <UserProvider>
                  <ServiceProvider>
                    <InterimProvider>
                      {/* 1. Render layout and content first - ensures SEO tags are at the top */}
                      {getLayout(<Component {...pageProps} />)}
                    </InterimProvider>
                  </ServiceProvider>
                </UserProvider>
                {/* 2. Scripts and utilities last - after content is rendered */}
                <Live2DScripts />
                <Analytics />
                <Toaster />
                <UpdateNotification />
              </TooltipProvider>
            </GuidanceProvider>
          </OSProvider>
        </ThemeProvider>
      </SessionProvider>
    </main>
  );
}

export default MyApp;
