import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Intelligence from "$/components/Tool/Intelligence";
import { IntelProvider } from "$/components/Tool/Intelligence/provider/intelligenceProvider";
import { SITE_URL } from "../../lib/site-url";

const intelSEOSchema: SEOSchema = {
  title: "Intelligence - Hyperclaw OS",
  description:
    "AI Knowledge Platform — browse agent-created data tables, CRM pipelines, charts, and run SQL queries against the intelligence database.",
  url: `${SITE_URL}/Tool/Intelligence`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Intelligence - Hyperclaw OS",
    description:
      "AI Knowledge Platform — browse agent data, CRM pipelines, and charts.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Intelligence - Hyperclaw OS",
    description:
      "AI Knowledge Platform — browse agent data, CRM pipelines, and charts.",
    url: `${SITE_URL}/Tool/Intelligence`,
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Intelligence",
    description: "AI Knowledge Platform for agent-created data",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Dynamic table discovery from agent-created schemas",
      "Full CRUD data grid with inline editing",
      "CRM pipeline view with drag-and-drop",
      "Chart view for metrics tables",
      "SQL console with query history",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/Tool/Intelligence`,
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "BusinessApplication",
    downloadUrl: `${SITE_URL}/Tool/Intelligence`,
    installUrl: `${SITE_URL}/Tool/Intelligence`,
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "SQLite intel.db via OpenClaw gateway",
    permissions: "None",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={intelSEOSchema}>
      <IntelProvider>
        <Intelligence />
      </IntelProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
