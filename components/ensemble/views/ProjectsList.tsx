"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Plus, RefreshCw, AlertCircle } from "lucide-react";
import { useProjects, type Project } from "$/components/Tool/Projects/provider/projectsProvider";
import { useHyperclawContext, type HyperclawAgent } from "$/Providers/HyperclawProv";
import {
  formatUSD,
  EnsShell,
  Section,
  Kpi,
  EnsButton,
  getAgent,
  AgentGlyph,
} from "$/components/ensemble";
import {
  useProjectCosts,
  EMPTY_PROJECT_COST,
  type ProjectCostSummary,
} from "../hooks/useProjectCosts";
import { buildMissionControlProjectHref } from "./mission-control-routing";
import { resolveProjectAgentDisplay } from "./project-agent-display";
import { WorkflowTemplateGallery } from "./WorkflowTemplateGallery";
import {
  listWorkflowTemplates,
  type BridgeWorkflowTemplate,
} from "$/lib/hyperclaw-bridge-client";
import { WORKFLOW_TEMPLATES, type WorkflowTemplateSeed } from "$/lib/workflow-templates";

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
  const { projects, loading, error, refresh } = useProjects();
  const { agents: realAgents } = useHyperclawContext();
  const [persistedTemplates, setPersistedTemplates] = useState<BridgeWorkflowTemplate[]>([]);

  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status === "archived");
  const completed = projects.filter((p) => p.status === "completed");

  const { costsByProjectId, hasLiveData } = useProjectCosts(projects);

  useEffect(() => {
    let cancelled = false;
    void listWorkflowTemplates()
      .then((templates) => {
        if (!cancelled) setPersistedTemplates(templates);
      })
      .catch(() => {
        if (!cancelled) setPersistedTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sum month-to-date across every project's per-crew session usage. Note that
  // an agent on multiple projects contributes to each project's total, so this
  // KPI deliberately re-walks the cost map (not a simple project sum) to dedupe
  // agents and show a true workspace total.
  const totalMonthlyCost = useMemo(() => {
    let total = 0;
    for (const cost of costsByProjectId.values()) total += cost.monthUsd;
    return total;
  }, [costsByProjectId]);

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
        />
      ))}
    </div>
  );

  // Show the editorial template gallery only when this workspace has no
  // workflows at all (no active, completed, or archived). If the user has
  // historical workflows but none active, fall back to the simpler text
  // empty-state — they already know how the editor works.
  const hasNoWorkflowsAtAll =
    !loading &&
    !error &&
    active.length === 0 &&
    completed.length === 0 &&
    archived.length === 0;

  const galleryTemplates = useMemo(() => {
    const persisted: WorkflowTemplateSeed[] = persistedTemplates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      tagline: tpl.description || "Persisted workflow template ready to clone.",
      description: tpl.description,
      emoji: typeof tpl.preview?.emoji === "string" ? tpl.preview.emoji : "🧩",
      trigger: "manual",
      triggerLabel: tpl.category ? `SQLite · ${tpl.category}` : "SQLite template",
    }));
    const seen = new Set(persisted.map((tpl) => tpl.id));
    return [
      ...persisted.map((tpl) => ({ ...tpl, source: "sqlite" as const })),
      ...WORKFLOW_TEMPLATES
        .filter((tpl) => !seen.has(tpl.id))
        .map((tpl) => ({ ...tpl, source: "static" as const })),
    ];
  }, [persistedTemplates]);

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

      <div className={hasNoWorkflowsAtAll ? undefined : "mb-8"}>
        <WorkflowTemplateGallery
          templates={galleryTemplates}
          eyebrow={persistedTemplates.length > 0 ? "TEMPLATE LIBRARY" : "STARTERS"}
          title={hasNoWorkflowsAtAll ? "Pick a template to start." : "Template library"}
          subtitle={
            persistedTemplates.length > 0
              ? "Persisted SQLite templates stay browsable alongside built-in starters, so humans and agents can clone the same workflow language."
              : "Built-in starters remain available even after your first workflow, so the next one never starts from a blank page."
          }
          onPickTemplate={(id) =>
            router.push(`/Tool/ProjectEditor?template=${encodeURIComponent(id)}`)
          }
          onStartFromBlank={() => router.push("/Tool/ProjectEditor")}
        />
      </div>

      {!hasNoWorkflowsAtAll && (
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

interface ProjectCardProps {
  project: Project;
  realAgents: HyperclawAgent[];
  cost: ProjectCostSummary;
  hasLiveCostData: boolean;
  onClick: () => void;
}

function ProjectCard({
  project,
  realAgents,
  cost,
  hasLiveCostData,
  onClick,
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
    <div
      className="ens-prj-card"
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
    </div>
  );
}

export default function ProjectsList() {
  return <ProjectsListInner />;
}
