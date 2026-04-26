import React from "react";
import { getLayout } from "../../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { ProjectForm } from "$/components/projects";
import { SITE_URL } from "../../../lib/site-url";
import type { AppSchema } from "@OS/Layout/types";

const newProjectSEOSchema: SEOSchema = {
  title: "New project - Hyperclaw OS",
  description: "Wire a new crew of AI agents.",
  url: `${SITE_URL}/Tool/Projects/new`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "noindex,follow",
  type: "software",
  themeColor: "#000319",
};

const NewProjectPage = () => {
  const base = useEnsembleToolSchema("New project", "Projects", "/Tool/Projects");
  const appSchema = React.useMemo<AppSchema>(() => base, [base]);

  return (
    <CopanionProvider seoSchema={newProjectSEOSchema}>
      <InteractApp
        appSchema={appSchema}
        className="p-0 min-h-0 h-full w-full"
      >
        <ProjectForm />
      </InteractApp>
    </CopanionProvider>
  );
};

NewProjectPage.getLayout = getLayout;
export default NewProjectPage;
