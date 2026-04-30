import React from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import ProjectsList from "$/components/ensemble/views/ProjectsList";
import { ProjectsProvider } from "$/components/Tool/Projects/provider/projectsProvider";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { SITE_URL } from "../../../lib/site-url";
import { Plus } from "lucide-react";
import type { AppSchema } from "@OS/Layout/types";

const workflowsSEOSchema: SEOSchema = {
  title: "Workflows - Hyperclaw OS",
  description:
    "Workspaces that group agents around a common goal — triggers, crews, guardrails.",
  url: `${SITE_URL}/Tool/Workflows`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

const Index = () => {
  const router = useRouter();
  const base = useEnsembleToolSchema("Workflows");
  const appSchema = React.useMemo<AppSchema>(
    () => ({
      ...base,
      header: {
        ...base.header,
        rightUI: {
          type: "buttons" as const,
          buttons: [
            {
              id: "workflows-new",
              label: "New workflow",
              icon: <Plus />,
              variant: "primary" as const,
              onClick: () => router.push("/Tool/ProjectEditor"),
            },
          ],
        },
      },
    }),
    [base, router]
  );

  return (
    <SEOProv schema={workflowsSEOSchema}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <ProjectsProvider kind="workflow">
          <ProjectsList />
        </ProjectsProvider>
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
