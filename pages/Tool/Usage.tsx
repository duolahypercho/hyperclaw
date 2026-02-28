import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Usage from "$/components/Tool/Usage";
import { UsageProvider } from "$/components/Tool/Usage/provider/usageProvider";

const usageSEOSchema: SEOSchema = {
  title: "Gateway Usage & Cost - Copanion OS",
  description:
    "View token usage and cost from the OpenClaw gateway. Daily input, output, cache read/write, and cost breakdown.",
  url: "https://www.app.claw.hypercho.com/Tool/Usage",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Gateway Usage & Cost - Copanion OS",
    description: "OpenClaw gateway token usage and cost by day.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Gateway Usage & Cost - Copanion OS",
    description: "View token usage and cost from the OpenClaw gateway.",
    url: "https://www.app.claw.hypercho.com/Tool/Usage",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Copanion",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Copanion Gateway Usage",
    description: "Token usage and cost from OpenClaw gateway (usage.cost)",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Usage by day",
      "Input / output / cache read & write",
      "Cost breakdown (USD)",
      "Charts and totals",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.app.claw.hypercho.com/Tool/Usage",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    storageRequirements: "OpenClaw gateway connection",
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
