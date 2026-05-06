"use client";

import React from "react";
import { useRouter } from "next/router";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Library,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useProjects, type Project } from "$/components/Tool/Projects/provider/projectsProvider";
import { useHyperclawContext, type HyperclawAgent } from "$/Providers/HyperclawProv";
import {
  formatUSD,
  EnsShell,
  Section,
  getAgent,
  AgentGlyph,
} from "$/components/ensemble";
import {
  useProjectCosts,
  EMPTY_PROJECT_COST,
  type ProjectCostSummary,
} from "../hooks/useProjectCosts";
import { useWorkflowTemplateLibrary } from "../hooks/useWorkflowTemplateLibrary";
import { buildMissionControlProjectHref } from "./mission-control-routing";
import { resolveProjectAgentDisplay } from "./project-agent-display";
import { WorkflowTemplateGallery } from "./WorkflowTemplateGallery";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AnyAgent = HyperclawAgent | NonNullable<ReturnType<typeof getAgent>>;

/** Look up a real agent from HyperclawContext first, then fall back to static ENSEMBLE_AGENTS. */
function findAgent(agentId: string, realAgents: HyperclawAgent[]): AnyAgent | undefined {
  const real = realAgents.find((a) => a.id === agentId);
  if (real) return real;
  return getAgent(agentId);
}

function AgentBadge({ agent, size = 24 }: { agent: AnyAgent; size?: number }) {
  const display = resolveProjectAgentDisplay(agent);
  return <AgentGlyph agent={display} size={size} />;
}

/**
 * Map project availability to the editorial pill. Actual run state lives in
 * Mission Control, which fetches workflow-run-list directly.
 */
function projectPillVariant(status: Project["status"]): {
  cls: "live" | "paused" | "needs" | "idle";
  label: string;
} {
  switch (status) {
    case "active":    return { cls: "idle", label: "ready" };
    case "completed": return { cls: "idle", label: "completed" };
    case "archived":  return { cls: "idle", label: "archived" };
    default:          return { cls: "idle", label: status };
  }
}

/**
 * Compute the run-cost summary the card surfaces from real OpenClaw gateway
 * session usage aggregated by `useProjectCosts`:
 *  - Cost / run — total $ this month divided by completed workflow runs
 *  - Month      — month-to-date $ across all crew sessions
 *  - Owner      — lead agent name, falling back to "—"
 */
interface ProjectCardStats {
  costPerRun: string;
  monthly: string;
  ownerName: string;
  runCount: number;
  monthSessions: number;
  etaLabel: string;
}

function computeCardStats(
  project: Project,
  realAgents: HyperclawAgent[],
  cost: ProjectCostSummary,
  hasLiveCostData: boolean,
): ProjectCardStats {
  const monthly = cost.monthUsd;
  const runCount = project.workflowRuns?.length ?? 0;
  // Prefer real $/session if there's session activity; otherwise spread
  // monthly across workflow runs. Once usage has loaded, zero is real data.
  const costPerRun =
    cost.costPerSession ?? (runCount > 0 ? monthly / runCount : 0);

  const lead = project.leadAgentId
    ? findAgent(project.leadAgentId, realAgents)
    : null;
  const ownerName = lead?.name ?? "—";

  return {
    costPerRun: hasLiveCostData ? formatUSD(costPerRun) : "—",
    monthly: hasLiveCostData ? formatUSD(monthly) : "—",
    ownerName,
    runCount,
    monthSessions: cost.monthSessions,
    etaLabel: new Date(project.updatedAt).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    }),
  };
}

function ProjectsListInner() {
  const router = useRouter();
  const {
    projects,
    loading,
    error,
    deleteProject,
    listWorkflowTemplates,
    startWorkflowRun,
    refresh,
  } = useProjects();
  const { agents: realAgents } = useHyperclawContext();
  const {
    templates: galleryTemplates,
    persistedCount,
    totalCount: templateCount,
  } = useWorkflowTemplateLibrary();

  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status === "archived");
  const completed = projects.filter((p) => p.status === "completed");

  const { costsByProjectId, hasLiveData } = useProjectCosts(projects);
  const [runningProjectId, setRunningProjectId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleAddToActualWorkflow = React.useCallback(
    (project: Project) => {
      router.push(`/Tool/ProjectEditor?id=${encodeURIComponent(project.id)}`);
    },
    [router]
  );

  const handleRunWorkflow = React.useCallback(
    async (project: Project) => {
      if (runningProjectId) return;
      setActionError(null);
      setRunningProjectId(project.id);
      try {
        const templateId =
          project.defaultWorkflowTemplateId ??
          project.workflowTemplates?.[0]?.id ??
          (await listWorkflowTemplates(project.id))[0]?.id;
        if (!templateId) {
          throw new Error("This workflow has no executable template yet. Open it in the editor and save once.");
        }
        const run = await startWorkflowRun(
          templateId,
          "human:workflows-page",
          { source: "workflows-page", projectId: project.id },
          project.id,
        );
        if (!run?.id) throw new Error("The connector did not return a workflow run.");
        await refresh();
        router.push(buildMissionControlProjectHref(project.id));
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to start workflow run");
      } finally {
        setRunningProjectId(null);
      }
    },
    [listWorkflowTemplates, refresh, router, runningProjectId, startWorkflowRun],
  );

  const handleDeleteWorkflow = React.useCallback(
    async (project: Project) => {
      if (typeof window === "undefined") return;
      const confirmed = window.confirm(
        `Delete "${project.name}" from the workflow list?`
      );
      if (!confirmed) return;

      await deleteProject(project.id);
    },
    [deleteProject]
  );

  const renderGrid = (list: Project[]) => (
    <div className="ens-prj-grid">
      {list.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          realAgents={realAgents}
          cost={costsByProjectId.get(p.id) ?? EMPTY_PROJECT_COST}
          hasLiveCostData={hasLiveData}
          onClick={() => router.push(buildMissionControlProjectHref(p.id))}
          onAddToActualWorkflow={() => handleAddToActualWorkflow(p)}
          onRun={() => void handleRunWorkflow(p)}
          onDelete={() => void handleDeleteWorkflow(p)}
          isRunning={runningProjectId === p.id}
        />
      ))}
    </div>
  );

  // Show the editorial template gallery only when this workspace has no
  // workflows at all (no active, completed, or archived). Once the user has
  // *any* workflow, we collapse the gallery into a single button-like card
  // that links to /Tool/Workflows/Templates, so the index stays focused on
  // the user's own work and templates remain one click away.
  const hasNoWorkflowsAtAll =
    !loading &&
    !error &&
    active.length === 0 &&
    completed.length === 0 &&
    archived.length === 0;

  return (
    <EnsShell>
      {/* Hero header — editorial type with new-workflow action */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="ens-hero" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>
            Workflow
          </h1>
          <p className="ens-sub mt-1">
          Reusable wires of agents. Run them on a schedule, on demand, or pulled in by an issue.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px]"
          style={{ color: "var(--ink-2)" }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <AlertCircle size={14} className="shrink-0 text-destructive" />
            <span className="truncate">{error}</span>
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {actionError && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px]"
          style={{ color: "var(--ink-2)" }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <AlertCircle size={14} className="shrink-0 text-destructive" />
            <span className="truncate">{actionError}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="inline-flex shrink-0 items-center rounded-lg border border-destructive/20 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Dismiss
          </button>
        </div>
      )}

      {hasNoWorkflowsAtAll ? (
        <WorkflowTemplateGallery
          templates={galleryTemplates}
          eyebrow={persistedCount > 0 ? "TEMPLATE LIBRARY" : "STARTERS"}
          title="Pick a template to start."
          subtitle={
            persistedCount > 0
              ? "Persisted SQLite templates stay browsable alongside built-in starters, so humans and agents can clone the same workflow language."
              : "Six editorial starters, pre-wired with a trigger and an outline. We seed the editor — you keep the keyboard."
          }
          onPickTemplate={(id) =>
            router.push(`/Tool/ProjectEditor?template=${encodeURIComponent(id)}`)
          }
          onStartFromBlank={() => router.push("/Tool/ProjectEditor")}
        />
      ) : (
        <div>
          {loading && <div className="ens-sub">Loading…</div>}
          {!loading && active.length === 0 && !error && (
            <div
              className="ens-card-flat text-center py-8"
              style={{ color: "var(--ink-3)" }}
            >
              No active workflows right now. Click <b>New workflow</b> to add another.
            </div>
          )}
          {active.length > 0 && renderGrid(active)}

          {/* Template library entry-point — collapsed to a single button-like
              card once the user has workflows. The full gallery lives at
              /Tool/Workflows/Templates so the index stays scannable. */}
          <TemplateLibraryButton
            count={templateCount}
            persistedCount={persistedCount}
            onClick={() => router.push("/Tool/Workflows/Templates")}
          />
        </div>
      )}

      {completed.length > 0 && (
        <div className="mt-8">
          <Section title="Completed">{renderGrid(completed)}</Section>
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <Section title="Archived">{renderGrid(archived)}</Section>
        </div>
      )}
    </EnsShell>
  );
}

/**
 * `TemplateLibraryButton` — a button styled in the workflow-card visual
 * language. Sits at the bottom of a populated Workflows page and routes the
 * user to the dedicated template library (`/Tool/Workflows/Templates`) where
 * they can browse all templates and use one as a reference for a new
 * workflow.
 *
 * Why a card-shaped button (not a pill or text link)?
 *   - Visual continuity: matches `.ens-prj-card`, so it reads as "another
 *     thing you can open" without competing with real workflows.
 *   - Discoverability: the count and copy give it real informational weight,
 *     not just a navigation chevron.
 *   - Agent-friendly: a single deterministic CTA element with a clear `aria`
 *     label is easy for any agent to find and click.
 */
interface TemplateLibraryButtonProps {
  count: number;
  persistedCount: number;
  onClick: () => void;
}

function TemplateLibraryButton({
  count,
  persistedCount,
  onClick,
}: TemplateLibraryButtonProps) {
  const eyebrow = persistedCount > 0 ? "TEMPLATE LIBRARY" : "STARTERS";
  const subtitle =
    persistedCount > 0
      ? "Persisted SQLite templates stay browsable alongside built-in starters, so humans and agents can clone the same workflow language."
      : "Built-in starters stay one click away — pick one as a reference and shape it into your own workflow.";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open the workflow template library"
      className="tplbtn-card mt-8"
    >
      <span className="tplbtn-icon" aria-hidden="true">
        <Library size={18} strokeWidth={1.75} />
      </span>
      <span className="tplbtn-body">
        <span className="tplbtn-eyebrow">
          {eyebrow}
          {count > 0 && (
            <span className="tplbtn-count">
              {count} {count === 1 ? "template" : "templates"}
            </span>
          )}
        </span>
        <span className="tplbtn-title">Browse the template library</span>
        <span className="tplbtn-sub">{subtitle}</span>
      </span>
      <span className="tplbtn-cta" aria-hidden="true">
        Open
        <ArrowRight size={13} strokeWidth={2} />
      </span>

      <style>{`
        .tplbtn-card {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 16px;
          width: 100%;
          padding: 16px 18px;
          background: hsl(var(--card));
          border: 1px solid var(--line);
          border-radius: 12px;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.18s ease, box-shadow 0.18s ease,
            background 0.18s ease;
        }
        .tplbtn-card:hover,
        .tplbtn-card:focus-visible {
          border-color: var(--line-strong);
          box-shadow: 0 2px 10px rgb(0 0 0 / 0.06);
        }
        .tplbtn-card:focus-visible {
          outline: none;
        }
        .tplbtn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: var(--paper-3);
          border: 1px solid var(--line);
          color: var(--ink-2);
          flex-shrink: 0;
        }
        .tplbtn-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .tplbtn-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-3);
          line-height: 1;
        }
        .tplbtn-count {
          font-size: 9.5px;
          color: var(--ink-4);
          letter-spacing: 0.04em;
          text-transform: none;
          padding: 2px 6px;
          border-radius: 999px;
          background: var(--paper-3);
          border: 1px solid var(--line);
        }
        .tplbtn-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          letter-spacing: -0.01em;
          line-height: 1.25;
        }
        .tplbtn-sub {
          font-size: 12.5px;
          line-height: 1.45;
          color: var(--ink-3);
          max-width: 60ch;
        }
        .tplbtn-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 30px;
          padding: 0 12px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--paper-2);
          color: var(--ink-2);
          font-size: 12.5px;
          font-weight: 500;
          flex-shrink: 0;
          transition: border-color 0.18s ease, color 0.18s ease,
            gap 0.18s ease;
        }
        .tplbtn-card:hover .tplbtn-cta,
        .tplbtn-card:focus-visible .tplbtn-cta {
          border-color: var(--line-strong);
          color: var(--ink);
          gap: 9px;
        }
        @media (max-width: 720px) {
          .tplbtn-card {
            grid-template-columns: auto 1fr;
            grid-template-rows: auto auto;
          }
          .tplbtn-cta {
            grid-column: 1 / -1;
            justify-content: center;
          }
        }
      `}</style>
    </button>
  );
}

interface ProjectCardProps {
  project: Project;
  realAgents: HyperclawAgent[];
  cost: ProjectCostSummary;
  hasLiveCostData: boolean;
  onClick: () => void;
  onAddToActualWorkflow: () => void;
  onRun: () => void;
  onDelete: () => void;
  isRunning: boolean;
}

function ProjectCard({
  project,
  realAgents,
  cost,
  hasLiveCostData,
  onClick,
  onAddToActualWorkflow,
  onRun,
  onDelete,
  isRunning,
}: ProjectCardProps) {
  const leadAgent = project.leadAgentId
    ? findAgent(project.leadAgentId, realAgents)
    : null;
  const crew = (project.members ?? [])
    .map((m) => findAgent(m.agentId, realAgents))
    .filter((a): a is AnyAgent => Boolean(a));

  // Lead agent appears first in the avatar cluster, then the rest of the crew.
  const ordered: AnyAgent[] = [];
  if (leadAgent) ordered.push(leadAgent);
  for (const member of crew) {
    if (member.id !== leadAgent?.id) ordered.push(member);
  }
  const visibleCrew = ordered.slice(0, 4);
  const overflow = ordered.length - visibleCrew.length;

  const stats = computeCardStats(project, realAgents, cost, hasLiveCostData);
  const pill = projectPillVariant(project.status);

  return (
    <div className="relative">
      <div
        className="ens-prj-card pr-14 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="pt">
          <span className={`ens-pill ${pill.cls}`}>
            <span className="pdot" />
            {pill.label}
          </span>
          <span className="meta">
            {stats.runCount > 0 ? `run #${stats.runCount} · ` : ""}
            {stats.monthSessions > 0 ? `${stats.monthSessions} sess · ` : ""}
            {stats.etaLabel}
          </span>
        </div>

        <div className="ptitle">
          {project.emoji && (
            <span aria-hidden="true" style={{ fontSize: 18 }}>
              {project.emoji}
            </span>
          )}
          <span>{project.name}</span>
        </div>

        <div className="pdesc">
          {project.description || "No description yet."}
        </div>

        <div className="pcrew" aria-label="Crew">
          {visibleCrew.length === 0 ? (
            <span
              className="text-[11.5px]"
              style={{ color: "var(--ink-4)" }}
            >
              No crew assigned
            </span>
          ) : (
            <>
              {visibleCrew.map((a) => (
                <span key={a.id} className="pcrew-tile" title={a.name}>
                  <AgentBadge agent={a} size={24} />
                </span>
              ))}
              {overflow > 0 && (
                <span className="pcrew-overflow">+{overflow}</span>
              )}
            </>
          )}
        </div>

        <div className="pstats">
          <div>
            <span className="k">Cost / run</span>
            <span className="v">{stats.costPerRun}</span>
          </div>
          <div>
            <span className="k">Month</span>
            <span className="v">{stats.monthly}</span>
          </div>
          <div>
            <span className="k">Owner</span>
            <span className="v sans">{stats.ownerName}</span>
          </div>
        </div>

        <div className="wf-card-actions" aria-label={`${project.name} workflow actions`}>
          <button
            type="button"
            className="wf-card-action primary"
            onClick={(event) => {
              event.stopPropagation();
              onRun();
            }}
            disabled={isRunning}
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Run
          </button>
          <button
            type="button"
            className="wf-card-action"
            onClick={(event) => {
              event.stopPropagation();
              onAddToActualWorkflow();
            }}
          >
            <Pencil size={13} />
            Edit
          </button>
          <button
            type="button"
            className="wf-card-action"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            <ArrowRight size={13} />
            Open
          </button>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-10">
        <WorkflowCardMenu
          workflowName={project.name}
          onAddToActualWorkflow={onAddToActualWorkflow}
          onRun={onRun}
          onDelete={onDelete}
          isRunning={isRunning}
        />
      </div>
    </div>
  );
}

interface WorkflowCardMenuProps {
  workflowName: string;
  onAddToActualWorkflow: () => void;
  onRun: () => void;
  onDelete: () => void;
  isRunning: boolean;
}

function WorkflowCardMenu({
  workflowName,
  onAddToActualWorkflow,
  onRun,
  onDelete,
  isRunning,
}: WorkflowCardMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Manage ${workflowName}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors hover:bg-[var(--paper-3)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal size={15} strokeWidth={2.25} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="min-w-0 w-[190px] bg-[hsl(var(--card))] p-1"
      >
        <DropdownMenuItem
          onSelect={() => {
            onRun();
          }}
          disabled={isRunning}
          className="gap-2 px-2 py-1.5 text-[12px]"
        >
          {isRunning ? (
            <Loader2 size={13} className="animate-spin text-muted-foreground" />
          ) : (
            <Play size={13} className="text-muted-foreground" />
          )}
          Run workflow
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onAddToActualWorkflow();
          }}
          className="gap-2 px-2 py-1.5 text-[12px]"
        >
          <Pencil size={13} className="text-muted-foreground" />
          Edit workflow
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          onSelect={() => {
            onDelete();
          }}
          className="gap-2 px-2 py-1.5 text-[12px] text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 size={13} />
          Delete workflow
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ProjectsList() {
  return <ProjectsListInner />;
}
