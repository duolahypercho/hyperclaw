import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import Chat from "$/components/Tool/Chat";
import { SITE_URL } from "../../lib/site-url";

const chatSEOSchema: SEOSchema = {
  title: "Chat - Hyperclaw OS",
  description:
    "Chat with your OpenClaw AI agents. Send messages, view tool actions, manage sessions, and collaborate with your agent team in real time.",
  url: `${SITE_URL}/Tool/Chat`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
  twitter: {
    card: "summary_large_image",
    site: "@hypercho",
    creator: "@hypercho",
    title: "Chat - Hyperclaw OS",
    description:
      "Chat with your OpenClaw AI agents in real time.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Chat - Hyperclaw OS",
    description:
      "Chat with your OpenClaw AI agents in real time.",
    url: `${SITE_URL}/Tool/Chat`,
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
  jsonLd: {
    "@type": "SoftwareApplication",
    name: "Hyperclaw Chat",
    description:
      "Real-time chat with OpenClaw AI agents with tool actions and session management",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web Browser",
    softwareVersion: "1.0",
    featureList: [
      "Agent Chat",
      "Tool Action Visualization",
      "Session Management",
      "Message History",
      "File Attachments",
      "Real-time Streaming",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/Tool/Chat`,
    },
    creator: {
      "@type": "Organization",
      name: "Hypercho",
      url: "https://hypercho.com",
    },
    applicationSubCategory: "OfficeApplication",
    downloadUrl: `${SITE_URL}/Tool/Chat`,
    installUrl: `${SITE_URL}/Tool/Chat`,
    softwareRequirements: "Web Browser with JavaScript enabled",
    storageRequirements: "Cloud-based storage",
    permissions: "Access to OpenClaw CLI",
    browserRequirements: "Chrome 90+, Firefox 88+, Safari 14+, Edge 90+",
  },
};

const Index = () => {
  return (
    <CopanionProvider seoSchema={chatSEOSchema}>
      <Chat />
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
