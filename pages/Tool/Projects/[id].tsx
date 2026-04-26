import React from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { ProjectsProvider } from "$/components/Tool/Projects/provider/projectsProvider";
import { ProjectIssueWorkspace } from "$/components/projects/project-detail";
import { SITE_URL } from "../../../lib/site-url";

const detailSEOSchema = (id: string, name?: string): SEOSchema => ({
  title: `${name ?? id} - Hyperclaw OS`,
  description: "Project canvas — wired crew of AI agents.",
  url: `${SITE_URL}/Tool/Projects/${id}`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "noindex,follow",
  type: "software",
  themeColor: "#000319",
});

const ProjectDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const projectId = typeof id === "string" ? id : "";

  const base = useEnsembleToolSchema(
    "Project",
    "Projects",
    "/Tool/Projects"
  );

  if (!projectId) {
    return null;
  }

  return (
    <CopanionProvider seoSchema={detailSEOSchema(projectId)}>
      <InteractApp appSchema={base} className="p-0 min-h-0 h-full w-full">
        <ProjectsProvider>
          <ProjectIssueWorkspace projectId={projectId} />
        </ProjectsProvider>
      </InteractApp>
    </CopanionProvider>
  );
};

ProjectDetailPage.getLayout = getLayout;
export default ProjectDetailPage;
