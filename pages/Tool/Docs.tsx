import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Docs from "$/components/Tool/Docs";
import { DocsProvider } from "$/components/Tool/Docs/provider/docsProvider";

const docsSEOSchema: SEOSchema = {
  title: "Docs - Copanion OS",
  description:
    "Browse and read markdown documentation from your OpenClaw workspace. View all .md files under ~/.openclaw with a clean, consistent layout.",
  url: "https://www.copanion.hypercho.com/Tool/Docs",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Docs - Copanion OS",
    description:
      "Browse and read markdown documentation from your OpenClaw workspace.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Docs - Copanion OS",
    description:
      "Browse and read markdown documentation from your OpenClaw workspace.",
    url: "https://www.copanion.hypercho.com/Tool/Docs",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Copanion",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Copanion Docs",
    description: "Browse OpenClaw workspace markdown docs",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "List all .md files in ~/.openclaw",
      "Group by folder",
      "Markdown rendering",
      "Refresh list",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.copanion.hypercho.com/Tool/Docs",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: "https://www.copanion.hypercho.com/Tool/Docs",
    installUrl: "https://www.copanion.hypercho.com/Tool/Docs",
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Read-only access to ~/.openclaw",
    permissions: "None",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={docsSEOSchema}>
      <DocsProvider>
        <Docs />
      </DocsProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
