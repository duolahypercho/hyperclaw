import React, { lazy } from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Note from "$/components/Tool/Note";
import { NoteProvider } from "$/components/Tool/Note/provider/noteProvider";

const noteSEOSchema: SEOSchema = {
  title: "Note Editor - Copanion OS",
  description:
    "Create, organize, and manage your notes with our advanced note editor. Features markdown support, folder organization, real-time collaboration, and seamless integration with your AI-powered workspace.",
  url: "https://www.copanion.hypercho.com/Tool/Note",
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Note Editor - Copanion OS",
    description:
      "Create, organize, and manage your notes with our advanced note editor. Features markdown support, folder organization, real-time collaboration, and seamless integration with your AI-powered workspace.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Note Editor - Copanion OS",
    description:
      "Create, organize, and manage your notes with our advanced note editor. Features markdown support, folder organization, real-time collaboration, and seamless integration with your AI-powered workspace.",
    url: "https://www.copanion.hypercho.com/Tool/Note",
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Copanion",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Copanion Note Editor",
    description:
      "Advanced note editor with markdown support and real-time collaboration",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Markdown Support",
      "Folder Organization",
      "Real-time Collaboration",
      "Rich Text Editing",
      "Note Search & Filter",
      "Export Options",
      "Auto-save Functionality",
      "Note Templates",
      "Tag System",
      "Version History",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://www.copanion.hypercho.com/Tool/Note",
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: "https://www.copanion.hypercho.com/Tool/Note",
    installUrl: "https://www.copanion.hypercho.com/Tool/Note",
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based storage with local caching",
    permissions: "Access to local storage for offline functionality",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={noteSEOSchema}>
      <NoteProvider>
        <Note />
      </NoteProvider>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
