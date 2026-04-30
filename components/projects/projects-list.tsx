"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { ProjectCard } from "./project-card";
import { EditProjectDrawer } from "./edit-project-drawer";
import { ProjectRemoveDialog } from "./project-remove-dialog";
import type { NodeStatus, Project, ProjectStatus } from "./types";
import { EnsShell, Kpi } from "$/components/ensemble";

interface ProjectsListProps {
  projects: Project[];
  className?: string;
  /**
   * Optional override for the "New project" CTA inside the empty state.
   * When provided, the button calls this instead of navigating to
   * /Tool/Projects/new — the new flow opens a right-side drawer.
   */
  onCreateProject?: () => void;
}

const FILTERS: Array<{ id: "all" | ProjectStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "paused", label: "Paused" },
  { id: "needs", label: "Needs input" },
  { id: "idle", label: "Idle" },
];

const OPEN_WORKFLOW_STATUSES: NodeStatus[] = ["queued", "idle", "needs", "paused"];

/**
 * ProjectsList — main list view: editorial header + KPI strip + grid.
 */
export function ProjectsList({ projects, className, onCreateProject }: ProjectsListProps) {
  const [filter, setFilter] = React.useState<"all" | ProjectStatus>("all");
  const [query, setQuery] = React.useState("");
  // Pure id-based state so we re-resolve from the live projects list on every
  // render — that way an in-flight edit/delete sees the latest store snapshot
  // instead of a stale `Project` captured at the time the dialog opened.
  const [editingProjectId, setEditingProjectId] = React.useState<string | null>(null);
  const [removingProjectId, setRemovingProjectId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    return projects.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.owner.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [projects, filter, query]);

  const summaryCards = React.useMemo(
    () => {
      const activeProjects = projects.filter((project) => project.status === "live").length;

      // Issue rollups prefer the real `issueCounts` (sourced from the local
      // project issue store at the page level). Projects without that field — i.e. the
      // mock/loading set — fall back to deriving open counts from `nodes` so
      // the KPI never goes blank during the first paint.
      const openIssueFor = (project: typeof projects[number]) =>
        project.issueCounts?.open ??
        project.nodes.filter((node) => OPEN_WORKFLOW_STATUSES.includes(node.status)).length;
      const inProgressIssueFor = (project: typeof projects[number]) =>
        project.issueCounts?.inProgress ??
        project.nodes.filter((node) => node.status === "running").length;

      const openItems = projects.reduce((sum, project) => sum + openIssueFor(project), 0);
      const projectsWithOpenItems = projects.filter(
        (project) => openIssueFor(project) > 0
      ).length;
      const inProgressItems = projects.reduce(
        (sum, project) => sum + inProgressIssueFor(project),
        0
      );

      // "Workflows attached" replaces the older ETA-based KPI to match the
      // card's new binary indicator. We still tolerate `undefined` so mock
      // projects don't get falsely counted as "Not linked".
      const knownWorkflowProjects = projects.filter(
        (project) => project.workflowAttached !== undefined
      );
      const attachedWorkflows = knownWorkflowProjects.filter(
        (project) => project.workflowAttached
      ).length;

      const inboxItems = projects.reduce(
        (sum, project) => sum + project.nodes.filter((node) => node.status === "needs").length,
        0
      );

      return [
        {
          label: "Active projects",
          value: activeProjects,
          detail: `${projects.length} total`,
        },
        {
          label: "Open issues",
          value: openItems,
          detail:
            projectsWithOpenItems === 0
              ? "all clear"
              : projectsWithOpenItems === 1
              ? "across 1 project"
              : `across ${projectsWithOpenItems} projects`,
        },
        {
          label: "In progress",
          value: inProgressItems,
          detail:
            inProgressItems === 0
              ? "nothing moving"
              : `${attachedWorkflows} workflow${attachedWorkflows === 1 ? "" : "s"} attached`,
        },
        {
          label: "Your inbox",
          value: inboxItems,
          detail:
            inboxItems > 0
              ? `${inboxItems} item${inboxItems === 1 ? "" : "s"} need input`
              : "nothing waiting",
        },
      ];
    },
    [projects]
  );

  return (
    <EnsShell>
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="ens-hero" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>
            Projects
          </h1>
          <p className="ens-sub mt-1">
          Each project holds issues. Assign them to agents or teammates — or post to the project and the lead routes them.
          </p>
        </div>
      </div>

        {/* KPI strip */}
        <div className="ens-grid-kpi mb-6">
          {summaryCards.map((card) => (
            <Kpi
              key={card.label}
              label={card.label}
              value={card.value}
              detail={card.detail}
            />
          ))}
        </div>

        {/* Filters + search */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "h-7 px-3 rounded-full border  text-[11px] font-medium transition-colors",
                  "border border-solid border-border",
                  filter === f.id
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    : "border-[var(--line)] bg-[var(--paper-2)] text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
                )}
                style={{ fontFamily: "var(--mono)" }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64 border border-solid border-border rounded-md">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-4)]"
            />
            <Input
              type="search"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-7"
            />
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <EmptyState
            query={query}
            filter={filter}
            onCreateProject={onCreateProject}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onEdit={(project) => setEditingProjectId(project.id)}
                onRemove={(project) => setRemovingProjectId(project.id)}
              />
            ))}
          </div>
        )}

        {/* Drawers / dialogs portal at the page level so dropdown clicks
            don't bubble into the card link. Edit lives in a right-side
            Sheet (matches CreateProjectDrawer); destructive remove stays
            in an AlertDialog because it's a confirmation, not a form. The
            EditProjectDrawer self-resolves the live project from the store
            via `projectId`, so we just hand it the id. */}
        <EditProjectDrawer
          projectId={editingProjectId}
          onOpenChange={(open) => {
            if (!open) setEditingProjectId(null);
          }}
        />
        <ProjectRemoveDialog
          project={projects.find((p) => p.id === removingProjectId) ?? null}
          onClose={() => setRemovingProjectId(null)}
        />
    </EnsShell>
  );
}

function EmptyState({
  query,
  filter,
  onCreateProject,
}: {
  query: string;
  filter: "all" | ProjectStatus;
  onCreateProject?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper-2)] p-12 text-center">
      <h3
        className="text-[18px] font-semibold tracking-tight text-[var(--ink)]"
        style={{ fontFamily: "var(--display)" }}
      >
        Nothing here yet.
      </h3>
      <p className="mt-1 text-[13px] text-[var(--ink-3)]">
        {query
          ? `No projects match "${query}".`
          : filter !== "all"
          ? `No ${filter} projects.`
          : "Wire your first crew."}
      </p>
      {onCreateProject ? (
        <Button
          variant="primary"
          size="default"
          className="mt-4"
          onClick={onCreateProject}
        >
          <Plus size={14} />
          New project
        </Button>
      ) : (
        <Button asChild variant="primary" size="default" className="mt-4">
          <Link href="/Tool/Projects/new">
            <Plus size={14} />
            New project
          </Link>
        </Button>
      )}
    </div>
  );
}
