import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { KnowledgeProvider, useKnowledgeData } from "$/components/ensemble/hooks/useKnowledgeData";
import Knowledge from "$/components/ensemble/views/Knowledge";
import { SITE_URL } from "../../lib/site-url";

const knowledgeSEOSchema: SEOSchema = {
  title: "Knowledge - Hyperclaw OS",
  description:
    "Company knowledge base. Collections, documents, and agent memory shelves stored under ~/.hyperclaw.",
  url: `${SITE_URL}/Tool/Knowledge`,
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
    description: "Company knowledge base with collections and agent memory shelves.",
    image: "https://hypercho.com/hypercho_banner.png",
  },
  openGraph: {
    type: "software",
    title: "Knowledge - Hyperclaw OS",
    description: "Company knowledge base with collections and agent memory shelves.",
    url: `${SITE_URL}/Tool/Knowledge`,
    image: "https://hypercho.com/hypercho_banner.png",
    site_name: "Hypercho Hyperclaw",
    locale: "en_US",
  },
};

/** Inner wrapper that pulls appSchema from the provider. */
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
    <SEOProv schema={knowledgeSEOSchema}>
      <KnowledgeProvider>
        <KnowledgeApp />
      </KnowledgeProvider>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
