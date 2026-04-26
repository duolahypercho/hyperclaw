"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentCluster } from "./agent-glyph";
import { StatusPill } from "./status-pill";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import type { NodeStatus, Project } from "./types";

interface ProjectCardProps {
  project: Project;
  className?: string;
  href?: string;
}

const OPEN_WORKFLOW_STATUSES: NodeStatus[] = ["queued", "idle", "needs", "paused"];

/**
 * ProjectCard — single project tile for the list view.
 * Hierarchy: status → name → description → crew → stats.
 */
export function ProjectCard({ project, className, href }: ProjectCardProps) {
  const targetHref = href ?? `/Tool/Projects/${project.id}`;
  const openNodes = project.nodes.filter((node) => OPEN_WORKFLOW_STATUSES.includes(node.status)).length;
  const inProgressNodes = project.nodes.filter((node) => node.status === "running").length;
  const workflowSteps = project.nodes.length;

  return (
    <Link
      href={targetHref}
      className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
      data-ensemble
    >
      <Card
        className={cn(
          "h-full transition-all duration-200 border border-solid border-border",
          "hover:border-[var(--ink)]/30 hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.15)]",
          "group-hover:-translate-y-0.5",
          className
        )}
      >
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between">
            <StatusPill status={project.status} />
            <ArrowUpRight
              size={14}
              className="text-[var(--ink-4)] transition-colors group-hover:text-[var(--ink)]"
            />
          </div>
          <CardTitle className="text-[18px] mt-1">{project.name}</CardTitle>
          <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)] line-clamp-2 min-h-[36px]">
            {project.description}
          </p>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <AgentCluster agentIds={project.agents} size="sm" />
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]"
              style={{ fontFamily: "var(--mono)" }}
            >
              {project.agents.length} agents
            </span>
          </div>
        </CardContent>

        <CardFooter className="grid grid-cols-3 gap-2">
          <Stat label="Open" value={openNodes} />
          <Stat label="In progress" value={inProgressNodes} />
          <Stat label="Workflow" value={workflowSteps > 0 ? `${workflowSteps} steps` : "—"} />
        </CardFooter>
      </Card>
    </Link>
  );
}

interface StatProps {
  label: string;
  value: string | number;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[9px] uppercase tracking-[0.1em] text-[var(--ink-4)]"
        style={{ fontFamily: "var(--mono)" }}
      >
        {label}
      </span>
      <span
        className="text-[13px] font-semibold text-[var(--ink)] tabular-nums"
        style={{ fontFamily: "var(--mono)" }}
      >
        {value}
      </span>
    </div>
  );
}
