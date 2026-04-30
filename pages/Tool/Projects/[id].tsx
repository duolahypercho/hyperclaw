import React from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import {
  ProjectsProvider,
  useProjects,
} from "$/components/Tool/Projects/provider/projectsProvider";
import { ProjectIssueWorkspace } from "$/components/projects/project-detail";
import {
  formatIssueKey,
  getProjectIssuePrefix,
  isProjectIssue,
} from "$/components/projects/project-issue-utils";
import { useProjectTasks } from "$/components/projects/use-project-tasks";
import { SITE_URL } from "../../../lib/site-url";
import type { AppSchema, BreadcrumbItem } from "@OS/Layout/types";

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

/**
 * Inner page body: needs to live under <ProjectsProvider> so the breadcrumb
 * title can echo the live project name. The new in-page header owns view
 * toggles + "+ New issue", so the global SiteHeader stays minimal — we just
 * keep breadcrumbs there (and extend them with the issue key in detail mode).
 */
function ProjectDetailInner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { selectedProject, projects } = useProjects();
  const { tasks } = useProjectTasks();

  const project = React.useMemo(
    () => selectedProject ?? projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId, selectedProject]
  );
  const projectName = project?.name?.trim() || undefined;

  // Detail-mode breadcrumb. We compute the issue key here so the SiteHeader
  // can show "Projects / Q2 earnings brief / EAR-2" without the workspace
  // having to talk back to the page.
  const selectedIssueId =
    typeof router.query.issue === "string" ? router.query.issue : "";

  const projectIssues = React.useMemo(
    () => tasks.filter((task) => isProjectIssue(task, projectId)),
    [projectId, tasks]
  );

  const issueKey = React.useMemo(() => {
    if (!selectedIssueId) return null;
    const index = projectIssues.findIndex((task) => task._id === selectedIssueId);
    if (index < 0) return null;
    const prefix = getProjectIssuePrefix(
      project ?? { id: projectId, name: projectName ?? projectId }
    );
    return formatIssueKey(projectIssues[index], index, prefix);
  }, [project, projectId, projectIssues, projectName, selectedIssueId]);

  const base = useEnsembleToolSchema(
    projectName ?? "Project",
    "Projects",
    "/Tool/Projects"
  );

  // Append the issue key to the breadcrumb when an issue is open. We also
  // pad the title so the OS page title echoes which issue is in focus.
  const appSchema = React.useMemo<AppSchema>(() => {
    const baseHeader = base.header ?? {};
    if (!issueKey) return { ...base, header: baseHeader };

    const baseCrumbs =
      (baseHeader.centerUI?.type === "breadcrumbs"
        ? baseHeader.centerUI.breadcrumbs
        : []) ?? [];
    const crumbs: BreadcrumbItem[] = [
      ...baseCrumbs,
      { label: issueKey },
    ];

    return {
      ...base,
      header: {
        ...baseHeader,
        title: `${projectName ?? "Project"} · ${issueKey}`,
        centerUI: {
          type: "breadcrumbs",
          breadcrumbs: crumbs,
          className: "text-[13px] text-foreground",
        },
      },
    };
  }, [base, issueKey, projectName]);

  return (
    <SEOProv schema={detailSEOSchema(projectId, projectName)}>
      <InteractApp appSchema={appSchema} className="p-0 min-h-0 h-full w-full">
        <ProjectIssueWorkspace projectId={projectId} />
      </InteractApp>
    </SEOProv>
  );
}

const ProjectDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const projectId = typeof id === "string" ? id : "";

  if (!projectId) return null;

  return (
    <ProjectsProvider kind="project">
      <ProjectDetailInner projectId={projectId} />
    </ProjectsProvider>
  );
};

ProjectDetailPage.getLayout = getLayout;
export default ProjectDetailPage;
