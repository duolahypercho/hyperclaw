import Head from "next/head";
import { getLayout } from "$/layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { PixelOfficeProvider, usePixelOffice, FullOfficeView } from "$/components/PixelOffice";
import { motion } from "framer-motion";
import { SITE_URL } from "../../lib/site-url";

const pixelOfficeSEOSchema: SEOSchema = {
  title: "AI Agent Office - Hyperclaw OS",
  description:
    "A retro pixel-art office view of your AI team. See agents from OpenClaw (get-team, get-crons) with working/idle status.",
  url: `${SITE_URL}/Tool/PixelOffice`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

function PixelOfficeContent() {
  const { loading, error } = usePixelOffice();

  if (loading) {
    return (
      <div className="flex h-full w-full min-h-0 flex-1 items-center justify-center bg-black-100">
        <p className="font-mono text-sm text-muted-foreground">Loading team from OpenClaw...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-black-100 text-muted-foreground">
        <p className="font-mono text-sm">{error}</p>
        <p className="font-mono text-xs">Data from bridge (get-employee-status).</p>
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-1 h-full w-full min-h-0 flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <FullOfficeView />
    </motion.div>
  );
}

const PixelOfficeToolPage = () => {
  return (
    <CopanionProvider seoSchema={pixelOfficeSEOSchema}>
      <Head>
        <title>AI Agent Office | Hypercho</title>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <PixelOfficeProvider>
        <PixelOfficeInner />
      </PixelOfficeProvider>
    </CopanionProvider>
  );
};

function PixelOfficeInner() {
  const { appSchema } = usePixelOffice();
  return (
    <InteractApp appSchema={appSchema} className="h-full w-full p-0 min-h-0">
      <PixelOfficeContent />
    </InteractApp>
  );
}

PixelOfficeToolPage.getLayout = getLayout;
export default PixelOfficeToolPage;
