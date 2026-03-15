import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import OrgChart from "$/components/Tool/OrgChart";
import { OrgChartProvider } from "$/components/Tool/OrgChart/provider/orgChartProvider";
import { SITE_URL } from "../../lib/site-url";

const orgChartSEOSchema: SEOSchema = {
  title: "Org Chart - Hyperclaw OS",
  description:
    "Visualize your AI agent team hierarchy, delegation, and task assignments in an interactive org chart.",
  url: `${SITE_URL}/Tool/OrgChart`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Org Chart - Hyperclaw OS",
    description:
      "Visualize your AI agent team hierarchy and task delegation.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Org Chart - Hyperclaw OS",
    description:
      "Visualize your AI agent team hierarchy and task delegation.",
    url: `${SITE_URL}/Tool/OrgChart`,
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Org Chart",
    description:
      "Interactive org chart for AI agent teams with hierarchy and task delegation",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Agent Hierarchy Visualization",
      "Task Delegation Tracking",
      "Live Agent Status",
      "Team Structure Management",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/Tool/OrgChart`,
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: `${SITE_URL}/Tool/OrgChart`,
    installUrl: `${SITE_URL}/Tool/OrgChart`,
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based storage",
    permissions: "Access to OpenClaw CLI",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={orgChartSEOSchema}>
      <OrgChartProvider>
        <OrgChart />
      </OrgChartProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
