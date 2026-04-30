"use client";

import { useEffect, useMemo } from "react";
import { FolderOpen, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useHyperclawContext } from "$/Providers/HyperclawProv";
import { useProjects } from "$/components/Tool/Projects/provider/projectsProvider";
import { AgentGlyph } from "$/components/ensemble";
import { resolveProjectAgentDisplay } from "$/components/ensemble/views/project-agent-display";

function fmtDate(ms?: number) {
  if (!ms) return "Unknown";
  return new Date(ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  archived: "border-border/50 bg-muted/40 text-muted-foreground",
};

const ROLE_STYLES: Record<string, string> = {
  lead: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  builder: "border-border/60 bg-muted/50 text-muted-foreground",
  reviewer: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  researcher: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ops: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  viewer: "border-border/60 bg-muted/40 text-muted-foreground",
};

function AddAgentDropdown({
  projectId,
  existingAgentIds,
}: {
  projectId: string;
  existingAgentIds: string[];
}) {
  const { agents } = useHyperclawContext();
  const { addMember } = useProjects();
  const available = agents.filter((agent) => !existingAgentIds.includes(agent.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg">
          <Plus className="h-3.5 w-3.5" />
          Add agent
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
        {available.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No more agents to add
          </div>
        ) : (
          available.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onClick={() => void addMember(projectId, agent.id)}
              className="cursor-pointer gap-2 py-2"
            >
              <AgentGlyph
                agent={resolveProjectAgentDisplay(agent)}
                size={22}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{agent.name}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {agent.runtime ?? "openclaw"}
                </p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProjectPanel({ projectId }: { projectId?: string }) {
  const { agents } = useHyperclawContext();
  const { projects, loading, selectedProject, selectProject } = useProjects();

  useEffect(() => {
    if (projectId) {
      void selectProject(projectId);
    }
  }, [projectId, selectProject]);

  const project = useMemo(() => {
    if (!projectId) return selectedProject;
    return selectedProject?.id === projectId
      ? selectedProject
      : projects.find((item) => item.id === projectId) ?? null;
  }, [projectId, projects, selectedProject]);

  if (loading && !project) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading project</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <FolderOpen className="h-8 w-8 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-medium text-foreground/80">Project unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a project from the left panel to open it here.
          </p>
        </div>
      </div>
    );
  }

  const members = project.members ?? [];
  const leadAgentId =
    project.leadAgentId ??
    members.find((member) => member.role === "lead")?.agentId ??
    null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/40 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl ring-1 ring-border/40">
            {project.emoji || "📁"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{project.name}</h3>
              <Badge
                variant="outline"
                className={cn("h-5 rounded-full px-2 text-[10px] capitalize", STATUS_STYLES[project.status])}
              >
                {project.status}
              </Badge>
              {project.teamModeEnabled !== false && (
                <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] text-muted-foreground">
                  Team Mode
                </Badge>
              )}
            </div>
            {project.description ? (
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground/60">No project description yet.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{members.length} member{members.length === 1 ? "" : "s"}</span>
              <span>Created {fmtDate(project.createdAt)}</span>
              <span>Updated {fmtDate(project.updatedAt)}</span>
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <AddAgentDropdown
              projectId={project.id}
              existingAgentIds={members.map((member) => member.agentId)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 customScrollbar2">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
            <Users className="h-3.5 w-3.5" />
            Team
          </div>
          <div className="text-[11px] text-muted-foreground">
            {leadAgentId ? "Lead assigned" : "No lead yet"}
          </div>
        </div>

        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-6 text-center">
            <p className="text-sm text-foreground/70">No agents assigned yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the add button above to attach teammates to this project.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {members.map((member) => {
              const agent = agents.find((item) => item.id === member.agentId);
              const display = resolveProjectAgentDisplay(agent, member.agentId);
              const isLead = member.agentId === leadAgentId || member.role === "lead";
              return (
                <div
                  key={member.agentId}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-3"
                >
                  <AgentGlyph agent={display} size={36} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {agent?.name ?? member.agentId}
                      </p>
                      {isLead && (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                          <ShieldCheck className="h-3 w-3" />
                          Lead
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="truncate text-[11px] text-muted-foreground">
                        {agent?.runtime ?? "Agent"}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 rounded-full px-2 text-[10px] capitalize",
                          ROLE_STYLES[member.role] ?? ROLE_STYLES.viewer
                        )}
                      >
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
