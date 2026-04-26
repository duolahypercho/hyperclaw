import React from "react";
import { useRouter } from "next/router";
import { getLayout } from "../../../layouts/MainLayout";
import { CopanionProvider } from "@OS/Provider/CopanionProv";
import { SEOSchema } from "@OS/Provider/SEOProv";
import { InteractApp } from "@OS/InteractApp";
import { useEnsembleToolSchema } from "$/components/ensemble/shared/toolSchema";
import { ProjectsList, PROJECTS } from "$/components/projects";
import {
  ProjectsProvider,
  useProjects,
  type Project as StoredProject,
} from "$/components/Tool/Projects/provider/projectsProvider";
import { SITE_URL } from "../../../lib/site-url";
import { Plus } from "lucide-react";
import type { AppSchema } from "@OS/Layout/types";
import type {
  AgentKindId,
  NodeStatus,
  Project as ProjectListProject,
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

function mapStoredProject(project: StoredProject): ProjectListProject {
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
  };
}

function ProjectsIndexContent() {
  const { projects, loading, error } = useProjects();
  const visibleProjects = React.useMemo(
    () => loading && projects.length === 0 ? PROJECTS : projects.map(mapStoredProject),
    [loading, projects],
  );

  if (error && !loading && projects.length === 0) {
    return (
      <div className="m-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        Could not load projects from the connector: {error}
      </div>
    );
  }

  return <ProjectsList projects={visibleProjects} />;
}

const Index = () => {
  const router = useRouter();
  const base = useEnsembleToolSchema("Projects");
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
              onClick: () => router.push("/Tool/Projects/new"),
            },
          ],
        },
      },
    }),
    [base, router]
  );

  return (
    <CopanionProvider seoSchema={projectsSEOSchema}>
      <InteractApp
        appSchema={appSchema}
        className="p-0 min-h-0 h-full w-full"
      >
        <ProjectsProvider>
          <ProjectsIndexContent />
        </ProjectsProvider>
      </InteractApp>
    </CopanionProvider>
  );
};

Index.getLayout = getLayout;
export default Index;
