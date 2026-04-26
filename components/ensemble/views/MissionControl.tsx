"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  Activity,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  StepForward,
  Undo2,
  History,
  Maximize2,
  Grid3x3,
  Plus,
  FolderOpen,
  Pencil,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bridgeInvoke,
  getWorkflowGraph,
  listWorkflowChartSpecs,
  type BridgeWorkflowChartSpec,
} from "$/lib/hyperclaw-bridge-client";
import type { AgentEvent } from "$/lib/hyperclaw-bridge-client";
import { getMissionControlProjectId } from "./mission-control-routing";
import { useMissionControlHeader } from "$/components/ensemble/shared/missionControlHeader";
import { WireBuilder } from "./WireBuilder";
import { wireGraphToTemplateSteps, type WireGraph } from "$/lib/workflow-wiring";

/* ── Local types ─────────────────────────────────────────────────────────── */

interface BridgeProject {
  id: string;
  name: string;
  emoji: string;
  status: string;
  updatedAt: number | string;
}

interface BridgeWorkflowRun {
  id: string;
  projectId: string;
  status: string;
  createdAt: number;
  updatedAt: number | string;
  steps?: BridgeWorkflowStepRun[];
}

interface BridgeWorkflowStepRun {
  id: string;
  name: string;
  stepType: string;
  status: string;
  assignedAgentId?: string;
  dependsOn?: string[];
  position: number;
  startedAt?: number;
  finishedAt?: number;
  metadata?: Record<string, unknown>;
}

function graphToDisplaySteps(graph: WireGraph): BridgeWorkflowStepRun[] {
  return wireGraphToTemplateSteps(graph).map((step) => ({
    id: step.id,
    name: step.name,
    stepType: step.stepType,
    status: "pending",
    assignedAgentId: step.preferredAgentId,
    dependsOn: step.dependsOn,
    position: step.position,
    metadata: step.metadata,
  }));
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function stepStatusColor(status: string): string {
  switch (status) {
    case "running":       return "#3b82f6";
    case "completed":     return "#22c55e";
    case "failed":        return "#ef4444";
    case "waiting_approval": return "#f59e0b";
    default:              return "var(--muted-foreground, #9ca3af)";
  }
}

function stepStatusBg(status: string): string {
  switch (status) {
    case "running":          return "rgba(59,130,246,0.10)";
    case "completed":        return "rgba(34,197,94,0.10)";
    case "failed":           return "rgba(239,68,68,0.10)";
    case "waiting_approval": return "rgba(245,158,11,0.10)";
    default:                 return "rgba(107,114,128,0.08)";
  }
}

function runStatusDotClass(status: string): string {
  switch (status) {
    case "running":          return "bg-blue-500 animate-pulse";
    case "completed":        return "bg-emerald-500";
    case "failed":           return "bg-red-500";
    case "waiting_approval": return "bg-amber-500 animate-pulse";
    case "pending":          return "bg-amber-400";
    default:                 return "bg-muted";
  }
}

/** Map a run status into a status pill variant. */
function runStatusPillClass(status: string | undefined): "live" | "paused" | "needs" | "idle" | "danger" {
  switch (status) {
    case "running":          return "live";
    case "pending":          return "needs";
    case "waiting_approval": return "needs";
    case "paused":           return "paused";
    case "failed":           return "danger";
    case "completed":        return "idle";
    default:                 return "idle";
  }
}

/** Human-readable label for a run status. */
function runStatusLabel(status: string): string {
  switch (status) {
    case "running":          return "running";
    case "pending":          return "queued";
    case "waiting_approval": return "needs input";
    case "paused":           return "paused";
    case "failed":           return "failed";
    case "completed":        return "done";
    default:                 return status.replace(/_/g, " ");
  }
}

function formatTime(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatCostFromEvents(events: AgentEvent[]): string {
  let total = 0;
  for (const e of events) {
    const cost = (e.data as Record<string, unknown> | undefined)?.totalCost;
    if (typeof cost === "number") total += cost;
  }
  if (total === 0) return "—";
  return `$${total.toFixed(4)}`;
}

function formatUpdatedAt(value: number | string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStepDuration(step: BridgeWorkflowStepRun): string {
  if (!step.startedAt || !step.finishedAt) return "—";
  const ms = Math.max(0, step.finishedAt - step.startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/* ── Node graph constants ────────────────────────────────────────────────── */

const NODE_W = 168;
const NODE_H = 72;
const NODE_GAP_X = 200;
const NODE_PADDING_X = 32;
const NODE_PADDING_Y = 40;

function InspLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--ink-4, #9ca3af)" }}>
      {children}
    </span>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("rounded animate-pulse", className)}
      style={{ background: "var(--line, #e5e7eb)", ...style }}
    />
  );
}

/* ── Canvas: workflow node graph ─────────────────────────────────────────── */

interface NodeGraphProps {
  steps: BridgeWorkflowStepRun[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
}

function NodeGraph({ steps, selectedStepId, onSelectStep }: NodeGraphProps) {
  if (steps.length === 0) return null;

  const orderedSteps = [...steps].sort((a, b) => a.position - b.position);
  const maxPos = Math.max(...orderedSteps.map((s) => s.position));
  const svgW = NODE_PADDING_X * 2 + (maxPos + 1) * (NODE_W + NODE_GAP_X) - NODE_GAP_X;
  const svgH = NODE_PADDING_Y * 2 + NODE_H;

  // Map id → screen center-x, center-y
  const posMap = new Map<string, { cx: number; cy: number }>();
  for (const s of orderedSteps) {
    posMap.set(s.id, {
      cx: NODE_PADDING_X + s.position * (NODE_W + NODE_GAP_X) + NODE_W / 2,
      cy: NODE_PADDING_Y + NODE_H / 2,
    });
  }

  // Build edge paths
  const edges: { d: string; color: string; key: string }[] = [];
  for (const step of orderedSteps) {
    if (!step.dependsOn) continue;
    for (const depId of step.dependsOn) {
      const from = posMap.get(depId);
      const to = posMap.get(step.id);
      if (!from || !to) continue;
      const mx = (from.cx + to.cx) / 2;
      const d = `M ${from.cx} ${from.cy} C ${mx} ${from.cy}, ${mx} ${to.cy}, ${to.cx} ${to.cy}`;
      edges.push({ d, color: stepStatusColor(step.status), key: `${depId}-${step.id}` });
    }
  }

  return (
    <div className="relative" style={{ width: svgW, height: svgH, minWidth: "100%" }}>
      <svg
        width={svgW}
        height={svgH}
        className="absolute top-0 left-0"
        aria-hidden="true"
      >
        {edges.map((e) => (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke={e.color}
            strokeWidth={1.5}
            strokeOpacity={0.45}
            strokeDasharray={e.color === stepStatusColor("running") ? "4 3" : undefined}
            className={
              e.color === stepStatusColor("running")
                ? "[animation:ens-flow_0.9s_linear_infinite]"
                : undefined
            }
          />
        ))}
      </svg>
      {orderedSteps.map((step) => {
        const px = NODE_PADDING_X + step.position * (NODE_W + NODE_GAP_X);
        const color = stepStatusColor(step.status);
        const isRunning = step.status === "running";
        const isSelected = selectedStepId === step.id;
        return (
          <button
            key={step.id}
            type="button"
            className="absolute appearance-none rounded-[10px] border p-0 text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onSelectStep(step.id)}
            style={{ left: px, top: NODE_PADDING_Y, width: NODE_W, height: NODE_H,
              background: stepStatusBg(step.status), borderColor: color,
              boxShadow: isSelected
                ? `0 0 0 2px ${color}, 0 12px 30px rgba(0,0,0,0.12)`
                : isRunning
                  ? `0 0 0 3px ${color}22`
                  : undefined }}>
            {isRunning && <span className="absolute inset-0 rounded-[10px] animate-pulse" style={{ background: color, opacity: 0.08 }} />}
            <div className="relative flex flex-col justify-between h-full px-3 py-2.5">
              <div className="flex items-start justify-between gap-1">
                <span className="text-[12px] font-medium leading-tight truncate"
                  style={{ color: "var(--ink, #111827)", maxWidth: 110 }} title={step.name}>
                  {step.name}
                </span>
                {isRunning && <Loader2 size={11} className="animate-spin flex-shrink-0" style={{ color }} />}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{ background: "var(--paper-2, #f3f4f6)", color: "var(--ink-4, #9ca3af)" }}>
                  {step.stepType}
                </span>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} aria-label={step.status} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Empty canvas state ──────────────────────────────────────────────────── */

interface CanvasEmptyProps {
  /** True when at least one project exists in the workspace. */
  hasProjects: boolean;
  /** True when a project is currently selected (id resolved). */
  hasProject: boolean;
  /** Editor href for the active project (only meaningful when hasProject). */
  editProjectHref?: string;
  onCreateProject: () => void;
  onBrowseProjects: () => void;
  onEditProject?: () => void;
}

function CanvasEmpty({
  hasProjects,
  hasProject,
  editProjectHref,
  onCreateProject,
  onBrowseProjects,
  onEditProject,
}: CanvasEmptyProps) {
  // Three distinct empty states drive different headlines + CTAs:
  //   (a) No workflows at all        → create the first one
  //   (b) Workflows exist, none picked → browse the list
  //   (c) Workflow picked, no run yet  → edit workflow / browse to start one
  const variant: "no-projects" | "no-selection" | "no-run" = !hasProjects
    ? "no-projects"
    : !hasProject
      ? "no-selection"
      : "no-run";

  const Icon =
    variant === "no-projects" ? Plus : variant === "no-selection" ? FolderOpen : Activity;

  const title =
    variant === "no-projects"
      ? "No workflows yet"
      : variant === "no-selection"
        ? "No workflow selected"
        : "No active run";

  const subtitle =
    variant === "no-projects"
      ? "Create a workflow to assemble a crew, wire up triggers, and run it on this canvas."
      : variant === "no-selection"
        ? "Pick a workflow from the list to load it on the canvas."
        : "This workflow hasn't run yet. Open the editor to define its steps, or browse other workflows.";

  return (
    <div className="ens-canvas-empty select-none">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid var(--line)",
        }}
      >
        <Icon size={26} style={{ color: "var(--ink-4)" }} />
      </div>
      <div className="text-center">
        <p className="text-[14px] font-medium" style={{ color: "var(--ink-2)" }}>
          {title}
        </p>
        <p
          className="text-[12px] mt-1 max-w-sm mx-auto"
          style={{ color: "var(--ink-4)" }}
        >
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {variant === "no-projects" && (
          <button
            type="button"
            className="ens-btn accent"
            onClick={onCreateProject}
          >
            <Plus size={12} /> Create your first workflow
          </button>
        )}

        {variant === "no-selection" && (
          <>
            <button
              type="button"
              className="ens-btn"
              onClick={onBrowseProjects}
            >
              <FolderOpen size={12} /> Browse workflows
            </button>
            <button
              type="button"
              className="ens-btn ghost"
              onClick={onCreateProject}
            >
              <Plus size={12} /> New workflow
            </button>
          </>
        )}

        {variant === "no-run" && (
          <>
            {editProjectHref && onEditProject && (
              <button
                type="button"
                className="ens-btn accent"
                onClick={onEditProject}
              >
                <Pencil size={12} /> Open workflow editor
              </button>
            )}
            <button
              type="button"
              className="ens-btn ghost"
              onClick={onBrowseProjects}
            >
              <FolderOpen size={12} /> Browse workflows
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Floating canvas controls ────────────────────────────────────────────── */

function CanvasToolbar({
  isLive,
  onPause,
  onStep,
  onReplay,
  disabled,
}: {
  isLive: boolean;
  onPause?: () => void;
  onStep?: () => void;
  onReplay?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="ens-canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <div className="tgroup">
        <button type="button" className="titem" data-active title="Select" aria-label="Select">
          <Grid3x3 size={13} />
        </button>
        <button type="button" className="titem" title="Fit view" aria-label="Fit view">
          <Maximize2 size={13} />
        </button>
      </div>
      <div className="tgroup">
        <button
          type="button"
          className="titem"
          title="Step back"
          aria-label="Step back"
          disabled={disabled}
        >
          <Undo2 size={13} />
        </button>
        <button
          type="button"
          className="titem"
          onClick={onPause}
          title={isLive ? "Pause" : "Resume"}
          aria-label={isLive ? "Pause" : "Resume"}
          disabled={disabled}
        >
          {isLive ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          type="button"
          className="titem"
          onClick={onStep}
          title="Step forward"
          aria-label="Step forward"
          disabled={disabled}
        >
          <StepForward size={13} />
        </button>
      </div>
      <div className="tgroup">
        <button
          type="button"
          className="titem wide"
          onClick={onReplay}
          title="Replay run"
          aria-label="Replay run"
          disabled={disabled}
        >
          <History size={12} /> replay
        </button>
      </div>
    </div>
  );
}

function CanvasLegend() {
  return (
    <div className="ens-canvas-legend" aria-label="Cable legend">
      <div className="lrow">
        <span
          className="lsw"
          style={{ background: "hsl(var(--primary))" }}
        />
        flowing
      </div>
      <div className="lrow">
        <span
          className="lsw"
          style={{ background: "rgb(34 197 94)", opacity: 0.7 }}
        />
        done
      </div>
      <div className="lrow">
        <span className="lsw" style={{ background: "var(--line-strong)" }} />
        queued
      </div>
    </div>
  );
}

function CanvasZoom() {
  // Zoom controls are presentational only — they hint at functionality without
  // implementing pan/zoom on the SVG (out of scope for this refactor).
  return (
    <div className="ens-canvas-zoom" aria-label="Zoom controls">
      <button type="button" aria-label="Zoom out">−</button>
      <span className="val">100%</span>
      <button type="button" aria-label="Zoom in">+</button>
      <button type="button" aria-label="Fit screen" title="Fit screen">
        <Maximize2 size={11} />
      </button>
    </div>
  );
}

/* ── Workflow detail summary ─────────────────────────────────────────────── */

interface WorkflowDetailStripProps {
  project: BridgeProject | null;
  run: BridgeWorkflowRun | null;
  events: AgentEvent[];
  loadingProjects: boolean;
  loadingRun: boolean;
  onRefresh: () => void;
  onEdit?: () => void;
}

function WorkflowDetailStrip({
  project,
  run,
  events,
  loadingProjects,
  loadingRun,
  onRefresh,
  onEdit,
}: WorkflowDetailStripProps) {
  const steps = run?.steps ?? [];
  const projectStatus = project?.status ?? "idle";
  const runStatus = run ? runStatusLabel(run.status) : "no active run";
  const cost = formatCostFromEvents(events);

  return (
    <section
      className="border-b px-5 py-4"
      style={{
        borderColor: "var(--line)",
        background: "hsl(var(--background))",
      }}
      aria-label="Workflow detail"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.14em]"
            style={{
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
            }}
          >
            Workflow detail · {project?.id ?? "unselected"}
          </div>
          <div className="mt-1 flex items-center gap-2 min-w-0">
            {project?.emoji && (
              <span className="text-[20px] leading-none" aria-hidden="true">
                {project.emoji}
              </span>
            )}
            <h1
              className="truncate text-[22px] font-semibold tracking-[-0.02em]"
              style={{ color: "var(--ink)" }}
            >
              {loadingProjects ? "Loading workflow..." : project?.name ?? "No workflow selected"}
            </h1>
            {project && (
              <span className={cn("ens-pill", runStatusPillClass(run?.status ?? projectStatus))}>
                <span className="pdot" />
                {runStatus}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {project
              ? "Connected AI agents, live run state, and wiring details are now managed from this workflow canvas."
              : "Pick a workflow to inspect its connected agents and latest run."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="ens-btn"
            onClick={onRefresh}
            disabled={!project || loadingRun}
          >
            <RefreshCw size={12} className={loadingRun ? "animate-spin" : undefined} />
            Refresh
          </button>
          {project && onEdit && (
            <button type="button" className="ens-btn ghost" onClick={onEdit}>
              <Settings2 size={12} />
              Configure
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        <DetailStat label="Run cost" value={cost} />
        <DetailStat label="Steps" value={steps.length > 0 ? String(steps.length) : "—"} />
        <DetailStat label="Project state" value={project ? projectStatus.replace(/_/g, " ") : "—"} />
        <DetailStat
          label="Last update"
          value={formatUpdatedAt(run?.updatedAt ?? project?.updatedAt)}
        />
      </div>
    </section>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div
        className="text-[9.5px] uppercase tracking-[0.12em]"
        style={{
          color: "var(--ink-4)",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
        }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[15px] font-semibold tabular-nums"
        style={{ color: "var(--ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Inspector: run details ──────────────────────────────────────────────── */

interface InspectorProps {
  project: BridgeProject | null;
  run: BridgeWorkflowRun | null;
  selectedStep: BridgeWorkflowStepRun | null;
  chartSpecs: BridgeWorkflowChartSpec[];
  events: AgentEvent[];
  loadingRun: boolean;
  loadingEvents: boolean;
}

function Inspector({
  project,
  run,
  selectedStep,
  chartSpecs,
  events,
  loadingRun,
  loadingEvents,
}: InspectorProps) {
  const steps = run?.steps ?? [];
  const estimatedCost = formatCostFromEvents(events);
  const tabs = ["Overview", "Events", "Cost", "Output"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");

  useEffect(() => {
    setTab("Overview");
  }, [project?.id]);

  return (
    <aside
      className="flex flex-col h-full border-l overflow-hidden"
      style={{
        borderColor: "var(--line)",
        background: "hsl(var(--background))",
        width: 340,
        minWidth: 280,
      }}
      aria-label="Run inspector"
    >
      {/* Header — editorial style with tabs */}
      <div
        className="px-4 pt-3 pb-0 border-b flex flex-col gap-2"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] uppercase tracking-[0.08em] font-medium"
            style={{
              color: "var(--ink-4)",
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
            }}
          >
            Inspector
          </span>
          {run && (
            <span
              className={cn("ens-pill", runStatusPillClass(run.status))}
            >
              <span className="pdot" />
              {runStatusLabel(run.status)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 -mb-px">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="px-2.5 py-2 text-[12px] border-b-2 transition-colors"
              style={{
                borderColor: tab === t ? "var(--ink)" : "transparent",
                color: tab === t ? "var(--ink)" : "var(--ink-3)",
                fontWeight: tab === t ? 500 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {tab === "Overview" && project && (
          <section aria-label="Workflow identity">
            <InspLabel>Workflow</InspLabel>
            <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--line)", background: "var(--paper-2)" }}>
              <div className="flex items-center gap-2">
                {project.emoji && <span aria-hidden="true">{project.emoji}</span>}
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>
                  {project.name}
                </span>
              </div>
              <div
                className="mt-1 text-[10.5px] font-mono"
                style={{ color: "var(--ink-4)" }}
              >
                {project.id}
              </div>
            </div>
          </section>
        )}

        {tab === "Overview" && selectedStep && (
          <section aria-label="Selected step">
            <InspLabel>Selected step</InspLabel>
            <div
              className="rounded-lg border px-3 py-3"
              style={{
                borderColor: stepStatusColor(selectedStep.status) + "66",
                background: stepStatusBg(selectedStep.status),
              }}
            >
              <div className="flex items-start gap-2.5">
                <StepIcon status={selectedStep.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>
                    {selectedStep.name}
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-mono" style={{ color: "var(--ink-4)" }}>
                    {selectedStep.stepType} · {runStatusLabel(selectedStep.status)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MiniMetric label="Agent" value={selectedStep.assignedAgentId ?? "—"} />
                <MiniMetric label="Duration" value={formatStepDuration(selectedStep)} />
              </div>
              {selectedStep.metadata && Object.keys(selectedStep.metadata).length > 0 && (
                <div className="mt-3 rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                  <div
                    className="text-[9px] uppercase tracking-[0.1em]"
                    style={{
                      color: "var(--ink-4)",
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                    }}
                  >
                    Node config
                  </div>
                  <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-[10.5px]" style={{ color: "var(--ink-3)" }}>
                    {JSON.stringify(selectedStep.metadata.config ?? selectedStep.metadata, null, 2)}
                  </pre>
                </div>
              )}
              {chartSpecs.length > 0 && (
                <div className="mt-3 rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                  <div
                    className="text-[9px] uppercase tracking-[0.1em]"
                    style={{
                      color: "var(--ink-4)",
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                    }}
                  >
                    Linked charts
                  </div>
                  <div className="mt-1 space-y-1">
                    {chartSpecs.slice(0, 3).map((spec) => (
                      <div key={spec.id} className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
                        <span className="truncate">{spec.name}</span>
                        <span className="font-mono">{spec.chartType}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {(tab === "Overview" || tab === "Cost") && (
          <section aria-label="Run status">
            <InspLabel>Run status</InspLabel>
            {loadingRun ? (
              <Skeleton className="h-6 w-28" />
            ) : run ? (
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", runStatusDotClass(run.status))} />
                <span
                  className="text-[13px] font-medium capitalize"
                  style={{ color: "var(--ink)" }}
                >
                  {runStatusLabel(run.status)}
                </span>
              </div>
            ) : (
              <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
                No run selected
              </span>
            )}
          </section>
        )}

        {run && (tab === "Overview" || tab === "Cost") && (
          <section aria-label="Estimated cost">
            <InspLabel>Estimated cost</InspLabel>
            {loadingEvents ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <span
                className="text-[13px] font-mono"
                style={{ color: "var(--ink-2)" }}
              >
                {estimatedCost}
              </span>
            )}
          </section>
        )}

        {run && tab === "Overview" && (
          <section aria-label="Steps">
            <InspLabel>Steps</InspLabel>
            {loadingRun ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : steps.length === 0 ? (
              <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
                No steps
              </span>
            ) : (
              <ol className="space-y-1.5">
                {[...steps]
                  .sort((a, b) => a.position - b.position)
                  .map((step) => (
                    <li
                      key={step.id}
                      className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg border"
                      style={{
                        background: stepStatusBg(step.status),
                        borderColor: stepStatusColor(step.status) + "44",
                      }}
                    >
                      <StepIcon status={step.status} />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[12px] font-medium truncate"
                          style={{ color: "var(--ink)" }}
                        >
                          {step.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--ink-4)" }}
                          >
                            {step.stepType}
                          </span>
                          {step.startedAt && (
                            <span
                              className="text-[10px] flex items-center gap-0.5"
                              style={{ color: "var(--ink-4)" }}
                            >
                              <Clock size={9} /> {formatTime(step.startedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        )}

        {run && (tab === "Events" || tab === "Output") && events.length > 0 && (
          <section aria-label="Recent events">
            <InspLabel>{tab === "Output" ? "Output" : "Recent events"}</InspLabel>
            <ol className="space-y-1">
              {events.slice(0, 12).map((ev) => (
                <li
                  key={ev.id}
                  className="text-[11px] px-2 py-1.5 rounded-md font-mono"
                  style={{
                    background: "var(--paper-2)",
                    color: "var(--ink-3)",
                  }}
                >
                  <span className="font-medium" style={{ color: "var(--ink-2)" }}>
                    {ev.eventType}
                  </span>
                  {" — "}
                  {ev.status}
                </li>
              ))}
            </ol>
          </section>
        )}

        {run && (tab === "Events" || tab === "Output") && events.length === 0 && (
          <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
            {loadingEvents ? "Loading…" : "Nothing here yet."}
          </span>
        )}
      </div>
    </aside>
  );
}

function StepIcon({ status }: { status: string }) {
  const color = stepStatusColor(status);
  if (status === "running")          return <Loader2 size={13} className="animate-spin mt-0.5 flex-shrink-0" style={{ color }} />;
  if (status === "completed")        return <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" style={{ color }} />;
  if (status === "failed")           return <AlertCircle size={13} className="mt-0.5 flex-shrink-0" style={{ color }} />;
  if (status === "waiting_approval") return <Clock size={13} className="mt-0.5 flex-shrink-0" style={{ color }} />;
  return <span className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ background: color, opacity: 0.5 }} />;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2.5 py-2" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
      <div
        className="text-[9px] uppercase tracking-[0.1em]"
        style={{
          color: "var(--ink-4)",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
        }}
      >
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11.5px] font-medium" style={{ color: "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function MissionControl() {
  const router = useRouter();
  const { setActiveProject } = useMissionControlHeader();
  const [projects, setProjects] = useState<BridgeProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<BridgeWorkflowRun | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [persistedGraph, setPersistedGraph] = useState<WireGraph | null>(null);
  const [chartSpecs, setChartSpecs] = useState<BridgeWorkflowChartSpec[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestedProjectId = useMemo(
    () => (router.isReady ? getMissionControlProjectId(router.query) : null),
    [router.isReady, router.query],
  );

  // Fetch project list on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingProjects(true);
    bridgeInvoke("project-list", {}).then((result) => {
      if (cancelled) return;
      const r = result as { success?: boolean; data?: BridgeProject[] };
      const list = r?.data ?? (Array.isArray(result) ? (result as BridgeProject[]) : []);
      setProjects(list);
    }).catch(() => {
      if (!cancelled) setProjects([]);
    }).finally(() => {
      if (!cancelled) setLoadingProjects(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!router.isReady || loadingProjects) return;
    if (projects.length === 0) {
      if (selectedProjectId !== null) setSelectedProjectId(null);
      return;
    }

    const queryProject = requestedProjectId && projects.some((p) => p.id === requestedProjectId)
      ? requestedProjectId
      : null;
    const currentProject = selectedProjectId && projects.some((p) => p.id === selectedProjectId)
      ? selectedProjectId
      : null;
    const nextProjectId = queryProject ?? currentProject ?? projects[0].id;

    if (nextProjectId !== selectedProjectId) {
      setSelectedProjectId(nextProjectId);
    }
  }, [router.isReady, loadingProjects, projects, requestedProjectId, selectedProjectId]);

  const fetchRunForProject = useCallback(async (projectId: string) => {
    setLoadingRun(true);
    try {
      const result = await bridgeInvoke("workflow-run-list", { projectId });
      const r = result as { success?: boolean; data?: BridgeWorkflowRun[] };
      const runs: BridgeWorkflowRun[] = r?.data ?? (Array.isArray(result) ? (result as BridgeWorkflowRun[]) : []);

      const prioritized =
        runs.find((r) => r.status === "running") ??
        runs.find((r) => r.status === "pending") ??
        runs.find((r) => r.status === "waiting_approval") ??
        runs[0] ?? null;

      if (!prioritized) {
        setActiveRun(null);
        setLoadingRun(false);
        return;
      }

      // Fetch full run with steps
      const runResult = await bridgeInvoke("workflow-run-get", { id: prioritized.id });
      const rr = runResult as { success?: boolean; data?: BridgeWorkflowRun };
      setActiveRun(rr?.data ?? prioritized);
    } catch {
      setActiveRun(null);
    } finally {
      setLoadingRun(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const result = await bridgeInvoke("get-agent-events", { limit: 20 });
      const r = result as { events?: AgentEvent[] } | AgentEvent[];
      const list: AgentEvent[] = Array.isArray(r) ? r : ((r as { events?: AgentEvent[] })?.events ?? []);
      setEvents(list);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchPersistedDetails = useCallback(async (projectId: string) => {
    try {
      const [graphRecord, charts] = await Promise.all([
        getWorkflowGraph({ projectId }),
        listWorkflowChartSpecs({ projectId }),
      ]);
      const graph = graphRecord?.graph as Partial<WireGraph> | undefined;
      setPersistedGraph(
        graphRecord && graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
          ? {
              nodes: graph.nodes,
              edges: graph.edges,
              updatedAt: typeof graph.updatedAt === "number" ? graph.updatedAt : graphRecord.updatedAt,
              version: graphRecord.version,
            }
          : null,
      );
      setChartSpecs(charts);
    } catch {
      setPersistedGraph(null);
      setChartSpecs([]);
    }
  }, []);

  // Fetch run when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    fetchRunForProject(selectedProjectId);
    fetchPersistedDetails(selectedProjectId);
    fetchEvents();
  }, [selectedProjectId, fetchRunForProject, fetchPersistedDetails, fetchEvents]);

  // Poll every 5s when run is active
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const isActive =
      activeRun?.status === "running" ||
      activeRun?.status === "pending" ||
      activeRun?.status === "waiting_approval";

    if (isActive && selectedProjectId) {
      pollRef.current = setInterval(() => {
        fetchRunForProject(selectedProjectId);
        fetchEvents();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeRun?.status, selectedProjectId, fetchRunForProject, fetchEvents]);

  const designSteps = useMemo(
    () => (persistedGraph ? graphToDisplaySteps(persistedGraph) : []),
    [persistedGraph],
  );
  const steps = useMemo(
    () => activeRun?.steps ?? designSteps,
    [activeRun?.steps, designSteps],
  );
  const hasActiveRun = !!activeRun;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const isLive = activeRun?.status === "running";
  const selectedStep = useMemo(
    () => steps.find((step) => step.id === selectedStepId) ?? steps[0] ?? null,
    [selectedStepId, steps],
  );

  useEffect(() => {
    if (steps.length === 0) {
      if (selectedStepId !== null) setSelectedStepId(null);
      return;
    }
    if (!selectedStepId || !steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(steps[0].id);
    }
  }, [selectedStepId, steps]);

  // Publish the active project up to the SiteHeader. Reset on unmount so
  // the breadcrumb collapses back to "Hypercho / Mission Control" if the
  // user navigates away.
  useEffect(() => {
    setActiveProject(
      selectedProject
        ? {
            id: selectedProject.id,
            name: selectedProject.name,
            emoji: selectedProject.emoji,
          }
        : null,
    );
  }, [selectedProject, setActiveProject]);

  useEffect(() => {
    return () => setActiveProject(null);
  }, [setActiveProject]);

  return (
    <div
      className="ensemble-root flex h-full overflow-hidden"
      style={{
        background: "hsl(var(--background))",
        color: "var(--ink)",
      }}
    >
      {/* Main canvas — full width, no in-component topbar (breadcrumb +
          edit moved into the global SiteHeader). */}
      <main
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        aria-label="Workflow canvas"
      >
        <WorkflowDetailStrip
          project={selectedProject}
          run={activeRun}
          events={events}
          loadingProjects={loadingProjects}
          loadingRun={loadingRun}
          onRefresh={() => {
            if (selectedProjectId) {
              fetchRunForProject(selectedProjectId);
              fetchPersistedDetails(selectedProjectId);
            }
            fetchEvents();
          }}
          onEdit={
            selectedProject
              ? () => router.push(`/Tool/ProjectEditor?id=${selectedProject.id}`)
              : undefined
          }
        />
        <div className="ens-canvas-wrap flex-1">
          {/*
            Three render states for the canvas:
              1. Loading           → skeleton tiles (inside ens-canvas-scroll)
              2. Active run        → live NodeGraph (inside ens-canvas-scroll)
              3. Design mode       → WireBuilder overlay (project selected,
                                     no active run) — author the workflow
              4. Truly empty       → CanvasEmpty overlay (no project picked)
          */}
          <div className="ens-canvas-scroll">
            <div className="p-8" style={{ minWidth: "100%", minHeight: "100%" }}>
              {loadingProjects || loadingRun ? (
                <div className="flex items-center gap-6 pt-12">
                  {[1, 2, 3].map((i) => (
                    <Skeleton
                      key={i}
                      className="rounded-[10px]"
                      style={{ width: NODE_W, height: NODE_H }}
                    />
                  ))}
                </div>
              ) : hasActiveRun && steps.length > 0 ? (
                <NodeGraph
                  steps={steps}
                  selectedStepId={selectedStep?.id ?? null}
                  onSelectStep={setSelectedStepId}
                />
              ) : null}
            </div>
          </div>

          {/* Design-mode wiring canvas — visible when a project is selected
              and there's no active run. Lets the user drop agent nodes,
              wire input/output ports, and auto-saves to localStorage. */}
          {!loadingRun &&
            !loadingProjects &&
            !!selectedProjectId &&
            (!hasActiveRun || steps.length === 0) && (
              <WireBuilder projectId={selectedProjectId} />
            )}

          {/* Truly-empty state — no project selected (or no projects yet). */}
          {!loadingRun &&
            !loadingProjects &&
            !selectedProjectId &&
            (!hasActiveRun || steps.length === 0) && (
              <CanvasEmpty
                hasProjects={projects.length > 0}
                hasProject={false}
                onCreateProject={() => router.push("/Tool/ProjectEditor")}
                onBrowseProjects={() => router.push("/Tool/Workflows")}
              />
            )}

          {/* Run-only overlays — only meaningful while a workflow is
              actually running. Hidden in design mode so they don't
              compete with the WireBuilder palette. */}
          {hasActiveRun && (
            <>
              <CanvasToolbar isLive={isLive} disabled />
              <CanvasLegend />
              <CanvasZoom />
            </>
          )}
        </div>
      </main>

      {/* Inspector */}
      <Inspector
        project={selectedProject}
        run={activeRun}
        selectedStep={selectedStep}
        chartSpecs={chartSpecs.filter((spec) => !selectedStep?.id || !spec.stepId || spec.stepId === selectedStep.id)}
        events={events}
        loadingRun={loadingRun}
        loadingEvents={loadingEvents}
      />
    </div>
  );
}
