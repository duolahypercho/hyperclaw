import React from "react";
import { getLayout } from "../../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import WorkflowTemplatesView from "$/components/ensemble/views/WorkflowTemplatesView";
import { SITE_URL } from "../../../lib/site-url";
import type { AppSchema } from "@OS/Layout/types";

const templatesSEOSchema: SEOSchema = {
  title: "Workflow templates - Hyperclaw OS",
  description:
    "Browse the workflow template library. Persisted SQLite templates stay browsable alongside built-in starters, so humans and agents can clone the same workflow language.",
  url: `${SITE_URL}/Tool/Workflows/Templates`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const TemplatesPage = () => {
  const base = useEnsembleToolSchema(
    "Templates",
    "Workflows",
    "/Tool/Workflows"
  );
  const appSchema = React.useMemo<AppSchema>(() => base, [base]);

  return (
    <SEOProv schema={templatesSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <WorkflowTemplatesView />
      </InteractApp>
    </SEOProv>
  );
};

TemplatesPage.getLayout = getLayout;
export default TemplatesPage;
