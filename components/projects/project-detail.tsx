"use client";

import * as React from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Columns3, LayoutList, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTodoList } from "$/components/Tool/TodoList/provider/todolistProvider";
import { useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { AGENTS, getProject as getMockProject } from "./data";
import { ProjectIssueBoard } from "./project-issue-board";
import { ProjectIssueDetail } from "./project-issue-detail";
import { ProjectIssueList } from "./project-issue-list";
import type { ProjectIssueStatus } from "./project-issue-utils";
import {
  formatRelativeIssueTime,
  getProjectIssuePrefix,
  isProjectIssue,
  matchesIssueQuery,
} from "./project-issue-utils";

interface ProjectIssueWorkspaceProps {
  projectId: string;
}

type WorkspaceView = "board" | "list";

export function ProjectIssueWorkspace({ projectId }: ProjectIssueWorkspaceProps) {
  const router = useRouter();
  const { tasks, handleAddTask, handleStatusChange } = useTodoList();
  const { projects, selectedProject, selectProject, loading } = useProjects();
  const [query, setQuery] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (projectId) void selectProject(projectId);
  }, [projectId, selectProject]);

  const view = React.useMemo<WorkspaceView>(() => {
    return router.query.view === "list" ? "list" : "board";
  }, [router.query.view]);

  const selectedIssueId = typeof router.query.issue === "string" ? router.query.issue : "";

  const mockProject = React.useMemo(() => getMockProject(projectId), [projectId]);
  const realProject = selectedProject ?? projects.find((project) => project.id === projectId);

  const project = React.useMemo(() => {
    if (realProject) {
      return {
        id: realProject.id,
        name: realProject.name,
        description: realProject.description,
        owner: realProject.leadAgentId || "Project lead",
        status: realProject.status,
        agents: realProject.members?.map((member) => member.agentId) ?? [],
        updatedAt: realProject.updatedAt,
      };
    }
    if (mockProject) {
      return {
        id: mockProject.id,
        name: mockProject.name,
        description: mockProject.description,
        owner: mockProject.owner,
        status: mockProject.status,
        agents: mockProject.agents,
        updatedAt: Date.now(),
      };
    }
    return {
      id: projectId,
      name: projectId,
      description: "Project issue workspace",
      owner: "Project lead",
      status: "active",
      agents: [],
      updatedAt: Date.now(),
    };
  }, [mockProject, projectId, realProject]);

  const issuePrefix = React.useMemo(() => getProjectIssuePrefix(project), [project]);

  const projectIssues = React.useMemo(
    () => tasks.filter((task) => isProjectIssue(task, projectId)),
    [projectId, tasks]
  );

  const visibleIssues = React.useMemo(
    () => projectIssues.filter((task) => matchesIssueQuery(task, query)),
    [projectIssues, query]
  );

  const selectedIssue = React.useMemo(
    () => projectIssues.find((task) => task._id === selectedIssueId) ?? null,
    [projectIssues, selectedIssueId]
  );

  const selectedIssueIndex = React.useMemo(
    () => projectIssues.findIndex((task) => task._id === selectedIssueId),
    [projectIssues, selectedIssueId]
  );

  const updateRouteQuery = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      const nextQuery = { ...router.query };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) {
          delete nextQuery[key];
        } else {
          nextQuery[key] = value;
        }
      }
      void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
        shallow: true,
      });
    },
    [router]
  );

  const handleViewChange = React.useCallback(
    (nextView: string) => updateRouteQuery({ view: nextView === "list" ? "list" : undefined }),
    [updateRouteQuery]
  );

  const handleOpenIssue = React.useCallback(
    (issueId: string) => updateRouteQuery({ issue: issueId }),
    [updateRouteQuery]
  );

  const handleCloseIssue = React.useCallback(
    (open: boolean) => {
      if (!open) updateRouteQuery({ issue: undefined });
    },
    [updateRouteQuery]
  );

  const handleIssueStatusChange = React.useCallback(
    (issueId: string, status: ProjectIssueStatus) => {
      handleStatusChange(issueId, status);
    },
    [handleStatusChange]
  );

  const createIssue = React.useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setCreateError(null);
    try {
      const created = await handleAddTask({
        title,
        description: `Project: ${project.name}`,
        projectId,
        status: "pending",
      });
      setDraftTitle("");
      setIsCreating(false);
      if (created?._id) {
        handleOpenIssue(created._id);
      }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Issue creation failed.");
    }
  }, [draftTitle, handleAddTask, handleOpenIssue, project.name, projectId]);

  const activeCount = projectIssues.filter((issue) => issue.status !== "completed" && issue.status !== "cancelled").length;
  const blockedCount = projectIssues.filter((issue) => issue.status === "blocked").length;
  const doneCount = projectIssues.filter((issue) => issue.status === "completed").length;
  const lastUpdated = projectIssues
    .map((issue) => issue.updatedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="border-b border-solid border-border/70 bg-background/95 px-6 py-5 backdrop-blur-xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/Tool/Projects">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={handleViewChange}>
              <TabsList className="h-9 bg-muted/60">
                <TabsTrigger value="board" className="gap-1.5 text-xs">
                  <Columns3 className="h-3.5 w-3.5" />
                  Board
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5 text-xs">
                  <LayoutList className="h-3.5 w-3.5" />
                  List
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4" />
              New issue
            </Button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                <Sparkles className="mr-1 h-3 w-3" />
                Project workspace
              </Badge>
              <Badge variant="secondary" className="bg-muted/60 text-muted-foreground">
                {project.status}
              </Badge>
              {loading ? (
                <Badge variant="outline" className="animate-pulse text-muted-foreground">
                  syncing
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {project.description || "Track issues, agent work, and workflow follow-through for this project."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            <SummaryCard label="Open work" value={activeCount} />
            <SummaryCard label="Blocked" value={blockedCount} urgent={blockedCount > 0} />
            <SummaryCard label="Done" value={doneCount} />
            <SummaryCard
              label="Updated"
              value={lastUpdated ? formatRelativeIssueTime(lastUpdated) : "No issues"}
              compact
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search issues, agents, labels..."
              className="h-9 border-border/70 bg-card/60 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{visibleIssues.length} shown</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
            <span>{project.agents.length || AGENTS.length} available agents</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
            <span>Owner: {project.owner}</span>
          </div>
        </div>

        {isCreating ? (
          <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-solid border-border/70 bg-card/55 p-3 sm:flex-row">
            <Input
              autoFocus
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createIssue();
                if (event.key === "Escape") setIsCreating(false);
              }}
              placeholder="Describe the new issue..."
              className="h-9 border-border/70 bg-background/70"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={createIssue} disabled={!draftTitle.trim()}>
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
            </div>
            {createError ? (
              <p className="text-xs text-destructive sm:basis-full">{createError}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {view === "list" ? (
          <ProjectIssueList
            issues={visibleIssues}
            issuePrefix={issuePrefix}
            onOpenIssue={handleOpenIssue}
          />
        ) : (
          <ProjectIssueBoard
            issues={visibleIssues}
            issuePrefix={issuePrefix}
            onOpenIssue={handleOpenIssue}
            onStatusChange={handleIssueStatusChange}
          />
        )}
      </div>

      <ProjectIssueDetail
        issue={selectedIssue}
        issueIndex={selectedIssueIndex}
        issuePrefix={issuePrefix}
        projectName={project.name}
        projectDescription={project.description}
        open={Boolean(selectedIssue)}
        onOpenChange={handleCloseIssue}
        onStatusChange={handleIssueStatusChange}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  urgent = false,
  compact = false,
}: {
  label: string;
  value: string | number;
  urgent?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-solid bg-card/55 p-3",
        urgent ? "border-amber-500/30" : "border-border/70"
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 font-semibold text-foreground", compact ? "text-sm" : "text-2xl")}>
        {value}
      </div>
    </div>
  );
}
