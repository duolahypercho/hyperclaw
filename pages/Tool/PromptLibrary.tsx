import React, { lazy } from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { PromptLibraryProvider } from "$/components/Tool/PromptLibrary/provider/PromptProv";
import PromptHome from "$/components/Tool/PromptLibrary/ui";

const promptSEOSchema: SEOSchema = {
  title: "Prompt Library - Copanion OS",
  description:
    "Discover, create, and organize AI prompts with our comprehensive prompt library. Access curated prompts for various AI models, create custom prompts, and share your best prompts with the community.",
  url: "https://www.copanion.hypercho.com/Tool/PromptLibrary",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Prompt Library - Copanion OS",
    description:
      "Discover, create, and organize AI prompts with our comprehensive prompt library. Access curated prompts for various AI models, create custom prompts, and share your best prompts with the community.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Prompt Library - Copanion OS",
    description:
      "Discover, create, and organize AI prompts with our comprehensive prompt library. Access curated prompts for various AI models, create custom prompts, and share your best prompts with the community.",
    url: "https://www.copanion.hypercho.com/Tool/PromptLibrary",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Copanion",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Copanion Prompt Library",
    description: "Comprehensive AI prompt library for enhanced AI interactions",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Curated Prompt Collection",
      "Custom Prompt Creation",
      "Prompt Categorization",
      "Community Sharing",
      "Prompt Templates",
      "AI Model Compatibility",
      "Prompt Optimization",
      "Search & Filter",
      "Prompt Rating System",
      "Export & Import",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.copanion.hypercho.com/Tool/PromptLibrary",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: "https://www.copanion.hypercho.com/Tool/PromptLibrary",
    installUrl: "https://www.copanion.hypercho.com/Tool/PromptLibrary",
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based prompt storage with local caching",
    permissions: "Access to local storage for prompt management",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={promptSEOSchema}>
      <PromptHome />
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
