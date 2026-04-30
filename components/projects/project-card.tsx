"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProjectMemberCluster } from "./project-member-cluster";
import { ProjectCardMenu } from "./project-card-menu";
import { StatusPill } from "./status-pill";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import type { NodeStatus, Project } from "./types";

interface ProjectCardProps {
  project: Project;
  className?: string;
  href?: string;
  /** When provided, surfaces an "Edit project" entry in the card menu. */
  onEdit?: (project: Project) => void;
  /** When provided, surfaces a "Remove project" entry in the card menu. */
  onRemove?: (project: Project) => void;
}

const OPEN_WORKFLOW_STATUSES: NodeStatus[] = ["queued", "idle", "needs", "paused"];

/**
 * ProjectCard — single project tile for the list view.
 * Hierarchy: status → name → description → crew → stats.
 *
 * The card is a single clickable surface using the "stretched link" pattern
 * (Link wraps the title + an `::after` overlay). This keeps the markup
 * semantically valid even though the card hosts secondary interactive widgets
 * (the "···" menu) — buttons inside `<a>` are illegal in HTML, so the link is
 * scoped to the title and the menu sits at a higher z-index above the overlay.
 *
 * Stats prefer real issue counts from `project.issueCounts` (sourced from the
 * local project issue store at the page level). When that data isn't wired in (mock /
 * loading state), the card transparently falls back to deriving counts from
 * the workflow `nodes` so we never render an empty footer.
 */
export function ProjectCard({
  project,
  className,
  href,
  onEdit,
  onRemove,
}: ProjectCardProps) {
  const targetHref = href ?? `/Tool/Projects/${project.id}`;

  const fallbackOpen = project.nodes.filter((node) =>
    OPEN_WORKFLOW_STATUSES.includes(node.status)
  ).length;
  const fallbackInProgress = project.nodes.filter(
    (node) => node.status === "running"
  ).length;

  const openCount = project.issueCounts?.open ?? fallbackOpen;
  const inProgressCount = project.issueCounts?.inProgress ?? fallbackInProgress;
  const hasMenu = Boolean(onEdit || onRemove);

  return (
    <div className="group relative h-full">
      <Card
        className={cn(
          "h-full border border-solid border-border bg-secondary text-secondary-foreground transition-all duration-200",
          "hover:border-foreground/30 hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.15)]",
          "group-hover:-translate-y-0.5",
          // Show the focus ring only when the stretched link is keyboard-focused.
          // Avoids a double-ring when the menu button takes focus, which Radix
          // briefly does before portaling focus into the dropdown items.
          "[&:has(a:focus-visible)]:ring-2 [&:has(a:focus-visible)]:ring-ring",
          className
        )}
      >
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between">
            <StatusPill status={project.status} />
            {hasMenu && (
              <div className="relative z-20">
                <ProjectCardMenu
                  projectName={project.name}
                  onEdit={onEdit ? () => onEdit(project) : undefined}
                  onRemove={onRemove ? () => onRemove(project) : undefined}
                />
              </div>
            )}
          </div>
          <CardTitle className="text-[18px] mt-1">
            <Link
              href={targetHref}
              className={cn(
                "outline-none focus:outline-none",
                // Stretched-link overlay covers the whole card so it's clickable
                "after:content-[''] after:absolute after:inset-0 after:rounded-xl after:z-10"
              )}
            >
              {project.name}
            </Link>
          </CardTitle>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground line-clamp-2 min-h-[36px]">
            {project.description}
          </p>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <ProjectMemberCluster
              agentIds={project.agents}
              leadAgentId={project.leadAgentId}
              size="sm"
            />
            <span
              className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
            >
              {project.agents.length} {project.agents.length === 1 ? "agent" : "agents"}
            </span>
          </div>
        </CardContent>

        <CardFooter className="grid grid-cols-3 gap-2">
          <Stat label="Open" value={openCount} />
          <Stat label="In progress" value={inProgressCount} />
          <Stat label="Workflow" value={<WorkflowAttachment project={project} />} />
        </CardFooter>
      </Card>
    </div>
  );
}

interface StatProps {
  label: string;
  value: React.ReactNode;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"
      >
        {label}
      </span>
      <span
        className="font-mono text-[13px] font-semibold text-foreground tabular-nums"
      >
        {value}
      </span>
    </div>
  );
}

/**
 * WorkflowAttachment — binary indicator that mirrors the StatusPill's
 * dot-and-label idiom. We branch on `workflowAttached === undefined` so the
 * mock/loading projects (which only carry `nodes`) keep the legacy step count.
 */
function WorkflowAttachment({ project }: { project: Project }) {
  if (project.workflowAttached === undefined) {
    const stepCount = project.nodes.length;
    return <>{stepCount > 0 ? `${stepCount} steps` : "—"}</>;
  }

  const attached = project.workflowAttached;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          attached ? "bg-primary" : "bg-muted-foreground"
        )}
      />
      <span className={attached ? "text-foreground" : "text-muted-foreground font-normal"}>
        {attached ? "Attached" : "Not linked"}
      </span>
    </span>
  );
}
