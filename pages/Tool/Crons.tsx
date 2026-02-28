import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Crons from "$/components/Tool/Crons";
import { CronsProvider } from "$/components/Tool/Crons/provider/cronsProvider";

const cronsSEOSchema: SEOSchema = {
  title: "Cron Jobs - Hyperclaw OS",
  description:
    "Monitor and manage your OpenClaw cron jobs. View schedules, track job status, and visualize upcoming executions in a calendar view.",
  url: "https://www.app.claw.hypercho.com/Tool/Crons",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Cron Jobs - Hyperclaw OS",
    description:
      "Monitor and manage your OpenClaw cron jobs. View schedules, track job status, and visualize upcoming executions in a calendar view.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Cron Jobs - Hyperclaw OS",
    description:
      "Monitor and manage your OpenClaw cron jobs. View schedules, track job status, and visualize upcoming executions in a calendar view.",
    url: "https://www.app.claw.hypercho.com/Tool/Crons",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Cron Jobs",
    description: "Monitor and manage OpenClaw cron jobs with calendar visualization",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Cron Job Monitoring",
      "Calendar Visualization",
      "Job Status Tracking",
      "Schedule Overview",
      "Agent-based Jobs",
      "Real-time Updates",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.app.claw.hypercho.com/Tool/Crons",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: "https://www.app.claw.hypercho.com/Tool/Crons",
    installUrl: "https://www.app.claw.hypercho.com/Tool/Crons",
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based storage",
    permissions: "Access to OpenClaw CLI",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={cronsSEOSchema}>
      <CronsProvider>
        <Crons />
      </CronsProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
