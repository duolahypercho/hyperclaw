import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Usage from "$/components/Tool/Usage";
import { UsageProvider } from "$/components/Tool/Usage/provider/usageProvider";

const usageSEOSchema: SEOSchema = {
  title: "Token Usage - Copanion OS",
  description:
    "View aggregated token usage from OpenClaw agents and sessions. Input, output, and total tokens from ~/.openclaw/agents and sessions.",
  url: "https://www.copanion.hypercho.com/Tool/Usage",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Token Usage - Copanion OS",
    description: "OpenClaw token usage and usage by agent.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Token Usage - Copanion OS",
    description: "View token usage from OpenClaw agents and sessions.",
    url: "https://www.copanion.hypercho.com/Tool/Usage",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Copanion",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Copanion Token Usage",
    description: "Aggregated token usage from OpenClaw sessions and agents",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Token usage by day",
      "Input / output / total tokens",
      "Usage by agent",
      "Charts and totals",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.copanion.hypercho.com/Tool/Usage",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    storageRequirements: "Read from ~/.openclaw/agents and sessions",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={usageSEOSchema}>
      <UsageProvider>
        <Usage />
      </UsageProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
