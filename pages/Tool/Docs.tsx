/**
 * /Tool/Docs → now renders the Ensemble Knowledge page.
 *
 * The old OpenClaw workspace doc browser has been replaced by the company
 * knowledge base, which stores collections under ~/.hyperclaw/<companyId>/.
 * The full Docs functionality (create, edit, delete, search) is available
 * via the Knowledge view and its sidebar.
 */
import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { KnowledgeProvider, useKnowledgeData } from "$/components/ensemble/hooks/useKnowledgeData";
import Knowledge from "$/components/ensemble/views/Knowledge";
import { SITE_URL } from "../../lib/site-url";

const docsSEOSchema: SEOSchema = {
  title: "Knowledge - Hyperclaw OS",
  description:
    "Browse and manage company knowledge collections stored under ~/.hyperclaw. Create, edit, and search markdown documents across all agent collections.",
  url: `${SITE_URL}/Tool/Docs`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Knowledge - Hyperclaw OS",
    description: "Browse and manage company knowledge collections.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Knowledge - Hyperclaw OS",
    description: "Browse and manage company knowledge collections.",
    url: `${SITE_URL}/Tool/Docs`,
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Knowledge",
    description: "Company knowledge base with collections under ~/.hyperclaw",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "2.0",
    featureList: [
      "Browse collections under ~/.hyperclaw/<companyId>/",
      "Create and edit markdown documents",
      "Search across all collections",
      "Agent memory shelves",
      "Real-time save",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/Tool/Docs`,
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
  },
};

function KnowledgeApp() {
  const { appSchema } = useKnowledgeData();
  return (
    <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
      <Knowledge />
    </InteractApp>
  );
}

const Index = () => {
  return (
    <SEOProv schema={docsSEOSchema}>
      <KnowledgeProvider>
        <KnowledgeApp />
      </KnowledgeProvider>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
