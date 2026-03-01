import "../styles/main.css";
import "../styles/nProgress.css";
import "../components/PixelOffice/pixel-office-scoped.css";
import {
  InterimProvider,
  ServiceProvider,
  UserProvider,
  ThemeProvider,
  OpenClawProvider,
} from "$/Providers";
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
import { GuidanceProvider } from "$/components/Guidance";
import { useEffect } from "react";

function DebugDocumentWriteLogger() {
  useEffect(() => {
    const orig = document.write;
    if (typeof orig !== "function") return;
    (document as any).write = function (...args: unknown[]) {
      // #region agent log
      if (typeof fetch !== "undefined") fetch("http://127.0.0.1:7697/ingest/5b487555-6c93-439c-bf5f-6251fb6e26ec", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4447e" }, body: JSON.stringify({ sessionId: "d4447e", location: "_app.tsx:document.write", message: "document.write called", data: { len: args.length, sample: String(args[0]).slice(0, 200) }, hypothesisId: "H3", timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      return (orig as any).apply(document, args);
    };
  }, []);
  return null;
}

Router.events.on("routeChangeStart", nProgress.start);
Router.events.on("routeChangeError", nProgress.done);
Router.events.on("routeChangeComplete", nProgress.done);

function MyApp({ Component, pageProps }: any) {
  const getLayout = Component.getLayout || ((page: NextPage) => page);
  return (
    <main className={GeistSans.className} suppressHydrationWarning>
      <DebugDocumentWriteLogger />
      {/* Core providers first */}
      <SessionProvider
        session={pageProps.session}
        refetchInterval={15 * 60}
        refetchOnWindowFocus={false}
      >
        <ThemeProvider attribute="class" enableSystem disableTransitionOnChange>
          <OpenClawProvider>
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
                <Analytics />
                <Toaster />
                <UpdateNotification />
              </TooltipProvider>
            </GuidanceProvider>
          </OSProvider>
          </OpenClawProvider>
        </ThemeProvider>
      </SessionProvider>
    </main>
  );
}

export default MyApp;
