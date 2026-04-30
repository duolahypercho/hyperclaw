import React from "react";
import { getLayout } from "../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import ProjectEditor from "$/components/ensemble/views/ProjectEditor";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { SITE_URL } from "../../lib/site-url";

const editorSEOSchema: SEOSchema = {
  title: "Workflow Editor - Hyperclaw OS",
  description:
    "Configure identity, trigger, crew, data access, and guardrails for your workflow.",
  url: `${SITE_URL}/Tool/ProjectEditor`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "noindex,nofollow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  const appSchema = useEnsembleToolSchema("Workflow editor", "Workflows", "/Tool/Workflows");
  return (
    <SEOProv schema={editorSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <ProjectEditor />
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
