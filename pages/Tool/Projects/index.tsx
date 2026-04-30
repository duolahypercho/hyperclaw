import React from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";
import { SEOProv, SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { ProjectsList, PROJECTS } from "$/components/projects";
import { CreateProjectDrawer } from "$/components/projects/create-project-drawer";
import {
  ProjectsProvider,
  useProjects,
  type Project as StoredProject,
} from "$/components/Tool/Projects/provider/projectsProvider";
import type { Task } from "$/components/projects/task-types";
import { useProjectTasks } from "$/components/projects/use-project-tasks";
import { SITE_URL } from "../../../lib/site-url";
import { Plus } from "lucide-react";
import type { AppSchema } from "@OS/Layout/types";
import type {
  AgentKindId,
  NodeStatus,
  Project as ProjectListProject,
  ProjectIssueCounts,
  ProjectStatus,
} from "$/components/projects/types";

const projectsSEOSchema: SEOSchema = {
  title: "Projects - Hyperclaw OS",
  description:
    "Wired crews of AI agents shipping work. Triggers in, work out — watch the cables flow.",
  url: `${SITE_URL}/Tool/Projects`,
  image: "https://hypercho.com/hypercho_banner.png",
  author: "Hypercho",
  robots: "index,follow",
  type: "software",
  themeColor: "#000319",
};

function projectStatusForList(status: StoredProject["status"]): ProjectStatus {
  if (status === "archived") return "paused";
  if (status === "completed") return "idle";
  return "live";
}

function memberRuntimeKind(agentId: string): AgentKindId {
  const lower = agentId.toLowerCase();
  if (lower.includes("codex")) return "codex";
  if (lower.includes("hermes")) return "hermes";
  if (lower.includes("claude")) return "claude";
  return "openclaw";
}

function buildProjectNodes(project: StoredProject): ProjectListProject["nodes"] {
  const memberIds = Array.from(
    new Set(project.members?.map((member) => member.agentId).filter(Boolean) ?? [])
  );
  const memberNodes = memberIds.slice(0, 3).map((agentId, index) => ({
    id: `agent-${agentId}`,
    kind: memberRuntimeKind(agentId),
    x: 270 + index * 210,
    y: index % 2 === 0 ? 90 : 340,
    title: agentId,
    body: "attached from onboarding",
    status: "running" as NodeStatus,
    ms: null,
  }));

  return [
    {
      id: "profile",
      kind: "input",
      x: 40,
      y: 220,
      title: "Project intake",
      body: project.description || "Company context and first setup tasks",
      status: "done",
      ms: 0,
    },
    ...memberNodes,
    {
      id: "issues",
      kind: "output",
      x: 930,
      y: 220,
      title: "Issue board",
      body: "Kanban + Linear list workspace",
      status: memberNodes.length > 0 ? "queued" : "needs",
      ms: null,
    },
  ];
}

/**
 * Real issue rollup for a project. Mirrors the in_progress / pending split the
 * issue board uses (see project-issue-utils.ts) so the card and the workspace
 * stay in sync.
 */
function rollupIssueCounts(tasks: Task[]): ProjectIssueCounts {
  let open = 0;
  let inProgress = 0;
  for (const task of tasks) {
    if (task.status === "pending") open += 1;
    else if (task.status === "in_progress") inProgress += 1;
  }
  return { open, inProgress };
}

function isWorkflowAttached(project: StoredProject): boolean {
  if (project.defaultWorkflowTemplateId) return true;
  return (project.workflowTemplates?.length ?? 0) > 0;
}

function mapStoredProject(
  project: StoredProject,
  projectTasks: Task[],
): ProjectListProject {
  const agents = project.members?.map((member) => member.agentId).filter(Boolean) ?? [];
  const nodes = buildProjectNodes(project);
  const edges: ProjectListProject["edges"] = nodes
    .slice(1)
    .map((node) => ["profile", node.id]);

  return {
    id: project.id,
    name: project.name,
    status: projectStatusForList(project.status),
    description: project.description,
    owner: project.leadAgentId || agents[0] || "Project lead",
    agents,
    cost: { run: 0, month: 0 },
    runs: project.workflowRuns?.length ?? 0,
    eta: agents.length > 0 ? "crew attached" : "needs agents",
    nodes,
    edges,
    issueCounts: rollupIssueCounts(projectTasks),
    workflowAttached: isWorkflowAttached(project),
    // Normalise nullable bridge fields so the list type stays `string | undefined`.
    leadAgentId: project.leadAgentId ?? undefined,
    emoji: project.emoji || undefined,
  };
}

function ProjectsIndexContent({
  onCreateProject,
}: {
  onCreateProject: () => void;
}) {
  const { projects, loading, error } = useProjects();
  const { tasks } = useProjectTasks();

  // Bucket once, read O(1) per project. Avoids an O(projects * tasks) scan
  // when the inbox has thousands of items.
  const tasksByProject = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.projectId) continue;
      const bucket = map.get(task.projectId);
      if (bucket) bucket.push(task);
      else map.set(task.projectId, [task]);
    }
    return map;
  }, [tasks]);

  const visibleProjects = React.useMemo(() => {
    if (loading && projects.length === 0) return PROJECTS;
    return projects.map((project) =>
      mapStoredProject(project, tasksByProject.get(project.id) ?? []),
    );
  }, [loading, projects, tasksByProject]);

  if (error && !loading && projects.length === 0) {
    return (
      <div className="m-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Could not load projects from the connector: {error}
      </div>
    );
  }

  return <ProjectsList projects={visibleProjects} onCreateProject={onCreateProject} />;
}

const Index = () => {
  const router = useRouter();
  const base = useEnsembleToolSchema("Projects");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const openDrawer = React.useCallback(() => setDrawerOpen(true), []);

  // Auto-open the drawer when the user lands here with `?new=1` (e.g. from
  // the legacy /Tool/Projects/new redirect or a deep link). We strip the
  // query param so a refresh doesn't re-pop the drawer.
  React.useEffect(() => {
    if (!router.isReady) return;
    if (router.query.new === "1") {
      setDrawerOpen(true);
      const { new: _omit, ...rest } = router.query;
      void router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true },
      );
    }
  }, [router, router.isReady, router.query]);

  const appSchema = React.useMemo<AppSchema>(
    () => ({
      ...base,
      header: {
        ...base.header,
        rightUI: {
          type: "buttons" as const,
          buttons: [
            {
              id: "ensemble-new-project",
              label: "New project",
              icon: <Plus />,
              variant: "primary" as const,
              onClick: openDrawer,
            },
          ],
        },
      },
    }),
    [base, openDrawer]
  );

  return (
    <SEOProv schema={projectsSEOSchema}>
      <InteractApp
        appSchema={appSchema}
        className="p-0 min-h-0 h-full w-full"
      >
        <ProjectsProvider kind="project">
          <ProjectsIndexContent onCreateProject={openDrawer} />
          <CreateProjectDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onCreated={(project) => {
              void router.push(`/Tool/Projects/${project.id}`);
            }}
          />
        </ProjectsProvider>
      </InteractApp>
    </SEOProv>
  );
};

Index.getLayout = getLayout;
export default Index;
