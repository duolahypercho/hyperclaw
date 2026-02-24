import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import OpenClaw from "$/components/Tool/OpenClaw";

const openClawSEOSchema: SEOSchema = {
  title: "OpenClaw Dashboard - HyperClaw",
  description:
    "Monitor and control your local OpenClaw agents, cron jobs, and system status from HyperClaw.",
  url: "https://www.copanion.hypercho.com/Tool/OpenClaw",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "OpenClaw Dashboard - HyperClaw",
    description:
      "Monitor and control your local OpenClaw agents, cron jobs, and system status from HyperClaw.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "OpenClaw Dashboard - HyperClaw",
    description:
      "Monitor and control your local OpenClaw agents, cron jobs, and system status from HyperClaw.",
    url: "https://www.copanion.hypercho.com/Tool/OpenClaw",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Copanion",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "OpenClaw Dashboard",
    description:
      "Local AI agent cockpit for monitoring and controlling OpenClaw agents",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Desktop (Electron)",
    softwareVersion: "1.0",
    featureList: [
      "Agent Status Monitoring",
      "Cron Job Management",
      "Agent Workspace Browser",
      "CLI Command Runner",
      "Real-time Health Indicators",
    ],
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={openClawSEOSchema}>
      <OpenClaw />
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
