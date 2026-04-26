"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { ProjectCard } from "./project-card";
import type { NodeStatus, Project, ProjectStatus } from "./types";
import { EnsShell, Kpi } from "$/components/ensemble";

interface ProjectsListProps {
  projects: Project[];
  className?: string;
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
export function ProjectsList({ projects, className }: ProjectsListProps) {
  const [filter, setFilter] = React.useState<"all" | ProjectStatus>("all");
  const [query, setQuery] = React.useState("");

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
      const openItems = projects.reduce(
        (sum, project) =>
          sum + project.nodes.filter((node) => OPEN_WORKFLOW_STATUSES.includes(node.status)).length,
        0
      );
      const projectsWithOpenItems = projects.filter((project) =>
        project.nodes.some((node) => OPEN_WORKFLOW_STATUSES.includes(node.status))
      ).length;
      const activeEtaProjects = projects.filter(
        (project) =>
          project.eta &&
          project.eta !== "—" &&
          project.eta !== "needs input" &&
          !project.eta.toLowerCase().includes("paused")
      );
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
          label: "Timed workflows",
          value: activeEtaProjects.length,
          detail: activeEtaProjects[0]?.eta ? `next ${activeEtaProjects[0].eta}` : "no active ETA",
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
          <EmptyState query={query} filter={filter} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
    </EnsShell>
  );
}

function EmptyState({
  query,
  filter,
}: {
  query: string;
  filter: "all" | ProjectStatus;
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
      <Button asChild variant="primary" size="default" className="mt-4">
        <Link href="/Tool/Projects/new">
          <Plus size={14} />
          New project
        </Link>
      </Button>
    </div>
  );
}
